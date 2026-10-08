import type { PerCastOutput, Corpus, CreatureRecord, GridSlot, PlacementKey, StatModifier, StatusEffectInstance, TeamConfiguration, TimelineEvent } from "../data/types";
import { applyModifiers } from "./modifiers";
import { effectiveCooldown } from "./cooldown";
import { applyStatusTick, applyShockProc } from "./status";
import { STABLE_SLOT_ORDER, isAdjacent, slotKey, slotsEqual, stableSlotIndex } from "./grid";
import { resolveBoard, selectTargets } from "./effects";
import { creatureHasType } from "../data/typing";
import { applyShinyOverlay } from "../data/corpus";
import { InvalidTeamConfigurationError } from "./errors";

import { damageChannelOf } from "../data/vocabularies";
import { AbilityTagKind, DamageChannel, ModifierStat, StatChangeStat, StatusEffectType, TargetKind, TimelineEventKind } from "../data/enums";
import { placementKey } from "./grid";

/**
 * The statuses that tick for damage: the `StatusEffectType` members that have a `DamageChannel`.
 * Shield absorbs rather than deals, and Shock procs on a hit instead of on a clock, so neither is
 * here -- `damageChannelOf` is the general form of that distinction.
 */
type TickingStatus = StatusEffectType.Burn | StatusEffectType.Poison;
const TICKING_STATUSES: readonly TickingStatus[] = [StatusEffectType.Burn, StatusEffectType.Poison];

/**
 * Tick intervals per research.md B2 — Burn every 0.5s, Poison every 1s. Shock has no interval:
 * it is purely reactive (see status.ts).
 */
const BURN_TICK_SECONDS = 0.5;
const POISON_TICK_SECONDS = 1;

/**
 * Fixed rounding precision for every `tSeconds` value created by this module (research.md D4,
 * 2026-10-05 round 2). Repeated floating-point addition (and to a lesser extent, multiplication
 * by a non-power-of-two cooldown) can accumulate IEEE-754 drift (e.g. `14.7000000000000001`)
 * that would otherwise leak into the UI (chart tooltips, tables). Rounding every timestamp to
 * this precision at the point of creation keeps the engine's own `tSeconds` values exact for
 * comparison/sorting and clean for display, without affecting the underlying math meaningfully
 * (1e-6s is far below anything a status-effect/cooldown value in this corpus resolves to).
 */
function roundTime(t: number): number {
  return Math.round(t * 1e6) / 1e6;
}

/**
 * MVP simplification (spec.md Assumptions — "idealized target", not a full two-board
 * resolver): every status effect and every point of damage this engine computes is applied
 * against one shared, implicit target. `StatusEffectInstance.targetSlot` and
 * `TimelineEvent.statusDelta.slot` are required fields on the frozen data-model types, so we
 * fill them with the *applying* creature's own slot as a documented placeholder — it carries no
 * positional meaning for the target itself. Revisit if/when a full battle resolver is added.
 */
function placeholderTargetSlot(appliedBy: GridSlot): GridSlot {
  return appliedBy;
}

function validate(config: TeamConfiguration, corpus: Corpus): void {
  if (config.placements.length > 6) {
    throw new InvalidTeamConfigurationError(
      "placements",
      `A team may have at most 6 placements, got ${config.placements.length}.`,
    );
  }
  const seenSlots = new Set<string>();
  for (const placement of config.placements) {
    const key = slotKey(placement.slot);
    if (seenSlots.has(key)) {
      throw new InvalidTeamConfigurationError(
        "placements",
        `Duplicate grid slot ${key} in team configuration.`,
      );
    }
    seenSlots.add(key);
    // 2026-10-05 round 2 (data-model.md's lookup-fix amendment): a placement must resolve to
    // an exact (creatureId, level) record, never fall back to a different level's stats for
    // the same id. Every existing corpus record is still level 1 today, so this is latent
    // against the current corpus, but is enforced now so widening the corpus to real
    // level-2/3/4 records (tasks.md T075) can never silently resolve the wrong one.
    if (!corpus.creatures.some((c) => c.id === placement.creatureId && c.level === placement.level)) {
      throw new InvalidTeamConfigurationError(
        "placements",
        `No corpus record for creatureId "${placement.creatureId}" at level ${placement.level}.`,
      );
    }
  }
  if (config.trainerId !== null && !corpus.trainers.some((t) => t.id === config.trainerId)) {
    throw new InvalidTeamConfigurationError("trainerId", `Unknown trainerId "${config.trainerId}".`);
  }
  for (const id of config.trinketIds) {
    if (!corpus.trinkets.some((t) => t.id === id)) {
      throw new InvalidTeamConfigurationError("trinketIds", `Unknown trinketId "${id}".`);
    }
  }
  for (const id of config.itemIds) {
    if (!corpus.items.some((i) => i.id === id)) {
      throw new InvalidTeamConfigurationError("itemIds", `Unknown itemId "${id}".`);
    }
  }
}

/**
 * Sum of all Cooldown-Speed-modifying Ongoing effects from teammates whose target selector
 * reaches `targetSlot` (research.md B4). This is a deliberately small, closed resolver —
 * widen it alongside AbilityTag coverage in future corpus/tasks work, not by special-casing
 * creature ids here.
 */
function resolveCooldownSpeedTotal(
  targetSlot: GridSlot,
  targetCreature: CreatureRecord,
  teamMembers: { slot: GridSlot; creature: CreatureRecord }[],
  config: TeamConfiguration,
): number {
  let total = 0;
  for (const member of teamMembers) {
    if (slotsEqual(member.slot, targetSlot)) continue; // a creature's own aura doesn't buff itself twice here
    for (const tag of member.creature.abilityTags) {
      if (tag.kind !== AbilityTagKind.CooldownSpeedModifier) continue;
      const target = tag.target;
      let reaches = false;
      if (target.kind === TargetKind.Adjacent) {
        reaches = isAdjacent(member.slot, targetSlot);
      } else if (target.kind === TargetKind.AllAllies) {
        reaches = true;
      }
      if (!reaches) continue;
      if (target.kind === TargetKind.Adjacent && target.typeFilter && !creatureHasType(targetCreature, target.typeFilter, config)) {
        continue;
      }
      if (target.kind === TargetKind.AllAllies && target.typeFilter && !creatureHasType(targetCreature, target.typeFilter, config)) {
        continue;
      }
      total += tag.amount;
    }
  }
  return total;
}

/**
 * Manual carry-over StatModifiers (data-model.md amendment, 2026-10-05): sum every modifier of
 * the given `stat` from both the team-wide pool and this placement's own pool. Team-wide and
 * placement-level modifiers are purely additive with each other — there is no precedence.
 */
function sumModifier(stat: ModifierStat, teamModifiers: StatModifier[], placementModifiers: StatModifier[]): number {
  let total = 0;
  for (const m of teamModifiers) if (m.stat === stat) total += m.amount;
  for (const m of placementModifiers) if (m.stat === stat) total += m.amount;
  return total;
}

interface Cast {
  tSeconds: number;
  sourceSlot: GridSlot;
  creature: CreatureRecord;
  /** Resolved once per cast so Phase B never has to re-look-up modifiers */
  modifiers: {
    damageFlatAdd: number;
    burnAmountAdd: number;
    poisonAmountAdd: number;
    shockAmountAdd: number;
    shieldAmountAdd: number;
    /** 2026-10-05 round 2 (research.md D3) */
    multicastAdd: number;
    /** 2026-10-07 round 7 (WI-002) */
    healAmountAdd: number;
  };
}

/**
 * One POOL of a ticking status on the shared target — not one entry per application.
 *
 * ## Why a pool, and why this was wrong before
 *
 * Each application used to become its own instance with its own tick clock. Two Poison casts then
 * produced two independent cadences, so a single Venopuff (3.5s cooldown, Poison 4) ticked at
 * 4.5, 5.5, 6.5, 7.5 **and** 8.0, 8.5, 9.0 — the second cast's clock interleaving with the first.
 *
 * The game keeps ONE counter on the enemy, ticking on ONE cadence, for a damage amount equal to the
 * whole stack. Observed: Venopuff's second cast at t=7.0 brings the pool to 8, and the very next
 * tick at 7.5 deals 8 — cumulative 20, where the per-instance model gave 16 and then wrongly ticked
 * again at 8.0. This matches research.md B2's wording, which says tick damage is "current Poison
 * layer count" (singular, the target's) rather than any one application's.
 *
 * ## Attribution
 *
 * With one pool fed by several creatures, a tick's damage belongs to them in proportion to what
 * each contributed — exactly how `shockLayersBySource` already splits a Shock proc. `bySource`
 * carries that split, as floats, because Burn's decay removes a fractional share from each
 * contributor rather than a whole layer from one of them.
 */
interface StatusPool {
  layers: number;
  /** `null` when the pool is empty: the cadence stops, and a later application restarts it. */
  nextTickAt: number | null;
  /** `${creatureId}@${slotKey}` -> layers contributed, for facilitated attribution (FR-056). */
  bySource: Map<string, number>;
  /** The slot credited in timeline events — the largest contributor. */
  sourceSlot: GridSlot;
}

/**
 * The headline "DPS average" figure: direct damage plus facilitated (status-tick and Shock-proc)
 * damage, which together partition all damage with no overlap and no remainder.
 *
 * Shared so the headline readout and the placement advisor's before/after figures cannot disagree
 * — the advisor quoting a differently-derived DPS than the number above it would be worse than
 * quoting none.
 */
export function windowAverageDps(result: { perCreatureDps: Record<string, number>; perCreatureFacilitatedDps: Record<string, number> }): number {
  const direct = Object.values(result.perCreatureDps).reduce((a, b) => a + b, 0);
  const facilitated = Object.values(result.perCreatureFacilitatedDps).reduce((a, b) => a + b, 0);
  return direct + facilitated;
}

export function simulate(
  config: TeamConfiguration,
  corpus: Corpus,
  options?: { nowSeconds?: number },
) {
  validate(config, corpus);
  const windowSeconds = config.simulationWindowSeconds;
  const startAt = options?.nowSeconds ?? 0;

  // Trinket effectTags (2026-10-06 round 5, data-model.md's "Trinket effect application"
  // amendment): every selected trinket's flat team-wide bonus is folded into the same
  // teamModifiers list the user's manual carry-over StatModifiers already use -- additive with
  // them, no precedence, same rule the manual modifiers already follow with each other. This
  // reuses 100% of the existing sumModifier() resolution path rather than adding a parallel one.
  //
  // The same trinket MAY appear more than once (2026-10-07): a shop can offer it again, and two
  // Hero's Swords are two lots of +12 Damage. The sum below was already per-entry, so a duplicate
  // counts twice as it should — only the id needed the copy index, which previously collided
  // between copies and made the two entries indistinguishable in any debugging that reads it.
  const trinketModifiers: StatModifier[] = config.trinketIds.flatMap((trinketId, copy) => {
    const trinket = corpus.trinkets.find((t) => t.id === trinketId);
    return (trinket?.effectTags ?? []).map((tag, i) => ({
      id: `trinket-${trinketId}-${copy}-${i}`,
      stat: tag.stat,
      amount: tag.amount,
    }));
  });
  const teamModifiers = [...(config.teamModifiers ?? []), ...trinketModifiers];
  // 2026-10-06 round 9 (FR-073/T202): every creature's EFFECTIVE stats, after on-battle-start
  // abilities and any other effect the resolver understands. Phase A and Phase B both read from
  // here rather than from the raw `CreatureRecord`, so the simulation actually uses the resolved
  // values instead of merely reporting them. Before this, `perCreatureEffectiveStats` was built in
  // Phase A and read by nothing downstream -- Miasmaw's card could show Poison 336 while its
  // timeline still applied Poison 10.
  const board = resolveBoard(config, corpus);
  const resolved = board.placements;
  const resolvedByKey = new Map(resolved.map((r) => [r.key, r]));

  const teamMembers = config.placements.flatMap((p) => {
    // Safe to assert: validate() above already confirmed a record exists for this exact
    // (creatureId, level) pair — see the lookup-fix amendment in data-model.md.
    //
    // THE SHINY OVERLAY BELONGS HERE, not only in `effects.ts`. Without it the engine was half
    // shiny: `member.resolved` carried the shiny line while every direct `creature.*` read below —
    // heal, cooldown, multicast, damageType, ability tags — silently used the normal one. A shiny
    // Dribblet's card showed Heal 18 while "Effective this battle" showed 15, and the same split
    // would have mis-simulated Furnadon's shiny cooldown (5s vs 4s) and Velocect's multicast
    // (2 vs 4). One lookup, one answer.
    const creature = applyShinyOverlay(
      corpus.creatures.find((c) => c.id === p.creatureId && c.level === p.level)!,
      p.shiny,
    )!;
    /*
     * NOT one resolved entry per placement, and this used to assert that it was (2026-10-08,
     * user-reported crash).
     *
     * `resolveBoard` removes a creature a teammate knocked out at battle start, so the lookup
     * misses for every victim of a Petrirex or a Rattleghast. The old `.get(...)!` then handed
     * `undefined` straight into Phase A, which read `.cooldownSpeedGrant` off it and took the
     * whole page down. The assertion had been wrong since the knockout family was first modelled;
     * tagging Rattleghast only made it easy to reach.
     *
     * Dropping the member is the right answer, not substituting a default: a knocked-out creature
     * casts nothing, carries no stats and feeds no aura, which is exactly what being absent from
     * `teamMembers` means. `board.knockedOut` carries the fact onward so it is reported rather
     * than merely silent.
     */
    const resolved = resolvedByKey.get(placementKey(creature.id, p.slot));
    if (!resolved) return [];
    return [
      {
        slot: p.slot,
        creature,
        resolved,
        placementModifiers: p.modifiers ?? [],
      },
    ];
  });

  // --- Phase A: generate every creature's cast times across the window, and resolve each
  //     placement's modifier-adjusted "effective stats" snapshot (2026-10-05 round 2) ---
  /**
   * 2026-10-06 round 9 (T200b): pending next-cast times, mutated as the battle runs.
   * Replaces Phase A's fixed `n * cooldown` precomputation, which assumed a cooldown could never
   * change during a battle — true until charge/haste abilities were modelled, false now.
   */
  interface Scheduled {
    nextAt: number;
    cooldown: number;
    /** T213: the pre-ally-cast-bonus cooldown, so a compounding grant recomputes from a fixed
     *  base rather than repeatedly dividing an already-divided value. */
    baseCooldown: number;
    sourceSlot: GridSlot;
    creature: CreatureRecord;
    modifiers: Cast["modifiers"];
    key: PlacementKey;
    chargeRules: { status: StatusEffectType; seconds: number }[];
  }
  const schedule: Scheduled[] = [];
  const perCreatureEffectiveStats: Record<
    string,
    {
      output: PerCastOutput;
      cooldownSeconds: number | null;
    }
  > = {};

  for (const member of teamMembers) {
    const { creature, slot, placementModifiers } = member;
    const key = placementKey(creature.id, slot);

    // Modifiers are resolved up front — even when this creature has no ordinary cooldown cast
    // — so `perCreatureEffectiveStats` can report them below regardless of cast eligibility.
    const multicastAdd = sumModifier(ModifierStat.MulticastAdd, teamModifiers, placementModifiers);
    const damageFlatAdd = sumModifier(ModifierStat.DamageFlatAdd, teamModifiers, placementModifiers);
    const healAmountAdd = sumModifier(ModifierStat.HealAmountAdd, teamModifiers, placementModifiers);
    const statusAmountAdd = {
      Burn: sumModifier(ModifierStat.BurnAmountAdd, teamModifiers, placementModifiers),
      Poison: sumModifier(ModifierStat.PoisonAmountAdd, teamModifiers, placementModifiers),
      Shock: sumModifier(ModifierStat.ShockAmountAdd, teamModifiers, placementModifiers),
      Shield: sumModifier(ModifierStat.ShieldAmountAdd, teamModifiers, placementModifiers),
    };
    const cooldownSpeedTotal =
      resolveCooldownSpeedTotal(slot, creature, teamMembers, config) +
      // Cooldown Speed the RESOLVER granted (Shikitsune's revive bonus). It is kept out of
      // `resolveCooldownSpeedTotal` because that function reads `cooldownSpeedModifier` tags and
      // this is not one — it is a property of having been revived, not an aura anyone emits.
      member.resolved.cooldownSpeedGrant +
      sumModifier(ModifierStat.CooldownSpeedAdd, teamModifiers, placementModifiers);
    const cooldownFlatAdd = sumModifier(ModifierStat.CooldownFlatAddSeconds, teamModifiers, placementModifiers);

    /*
     * A creature with no published cooldown has no cast cycle of its own, but a modifier may GIVE
     * it one — the same "a modifier may create an effect" rule as damage and statuses
     * (engine/modifiers.ts). It needs an EXPLICIT positive cooldown to do so: `effectiveCooldown`
     * floors at 0.1s, so treating a null base as 0 unconditionally would turn every passive
     * creature in the corpus into a ten-casts-per-second attacker.
     */
    const castsThisBattle = creature.baseCooldownSeconds !== null || cooldownFlatAdd > 0;
    const cooldown = castsThisBattle
      ? effectiveCooldown(creature.baseCooldownSeconds ?? 0, cooldownSpeedTotal, cooldownFlatAdd)
      : null;
    const modifiers = {
      damageFlatAdd,
      burnAmountAdd: statusAmountAdd.Burn,
      poisonAmountAdd: statusAmountAdd.Poison,
      shockAmountAdd: statusAmountAdd.Shock,
      shieldAmountAdd: statusAmountAdd.Shield,
      multicastAdd,
      healAmountAdd,
    };

    /*
     * Shared with the detail card (engine/modifiers.ts) so the two cannot disagree.
     *
     * This previously gated `damageFlatAdd` behind `creature.damageType === DamageChannel.Direct &&
     * baseDamage !== null`, which silently dropped a damage modifier on every damage-less creature
     * AND on every Burn/Poison/Shock-type attacker.
     */
    const output = applyModifiers(
      {
        damage: member.resolved.baseDamage,
        damageType: creature.publishedCast?.channel ?? null,
        appliesStatus: member.resolved.appliesStatus,
        baseMulticast: creature.baseMulticast,
        // `healAmountAdd` (round 7) is what finally lets a modifier reach this. It still belongs
        // here regardless: the band shows what this creature does THIS battle, and omitting a stat
        // because nothing modified it is how 9 healers ended up reading "No published per-cast
        // output" beside a card showing their heal.
        heal: member.resolved.healAmount,
      },
      { damageFlatAdd, multicastAdd, healAmountAdd, status: statusAmountAdd },
    );
    perCreatureEffectiveStats[key] = { cooldownSeconds: cooldown, output };

    // Modifiers are reported above whether or not this creature casts; only the SCHEDULE depends on
    // having a cooldown.
    if (cooldown === null) continue;

    // 2026-10-06 round 9 (T200b): only the FIRST cast is scheduled here. Subsequent casts are
    // scheduled as each one fires, because a cooldown can now shorten mid-battle (Cobrex's
    // "Charge this by 1 second whenever an ally inflicts Poison"). The previous fixed
    // `n * cooldown` precomputation could not express that at all.
    schedule.push({
      nextAt: roundTime(startAt + cooldown),
      cooldown,
      baseCooldown: cooldown,
      sourceSlot: slot,
      creature,
      modifiers,
      key: placementKey(creature.id, slot),
      chargeRules: member.resolved.chargeRules,
    });
  }

  /*
   * --- Revived allies start their clock at the reviver's first cast (2026-10-08) ---
   *
   * Shikitsune's ability fires ON CAST, so a teammate Petrirex knocked out at battle start is a
   * corpse until Shikitsune's first cast lands. Scheduling it from t=0 like everyone else would
   * credit a dead creature with the opening seconds of the fight — on a 3s reviver that is a free
   * cast for every revived ally, which is more output than the +15% Cooldown Speed the combo is
   * actually played for.
   *
   * Done here rather than in `resolveEffects` because the reviver's first cast is a COOLDOWN, and
   * cooldowns are this function's to compute — the resolver deliberately does not know them.
   */
  for (const entry of schedule) {
    const revivedBy = resolvedByKey.get(entry.key)?.revivedBy;
    if (!revivedBy) continue;
    const reviveAt = schedule.find((s) => s.key === revivedBy)?.nextAt;
    // A reviver with no cast cycle never revives anybody, so the ally stays down. `-1` marks it
    // for removal rather than leaving it scheduled at t=0, which is the state this guards against.
    entry.nextAt = reviveAt === undefined ? -1 : roundTime(reviveAt + entry.cooldown);
  }
  for (let i = schedule.length - 1; i >= 0; i--) {
    if (schedule[i]!.nextAt < 0) schedule.splice(i, 1);
  }

  // --- Phase B: walk casts in order, interleaving Burn/Poison ticks, tracking Shock layers ---
  const timeline: TimelineEvent[] = [];
  let shockLayers = 0;
  // "Facilitated damage" (data-model.md amendment, 2026-10-05): tracks WHICH creature(s)
  // contributed each currently-active Shock layer, so a proc's damage can be split
  // proportionally across them rather than attributed to nobody / the attacker it hit through.
  const shockLayersBySource = new Map<string, number>();
  const facilitatedDamage = new Map<string, number>();
  /**
   * The next tick on the GLOBAL grid strictly after `t`.
   *
   * Strictly after, never on `t` itself: Magmite applies Burn at 4.5 — already a half-second
   * boundary — and the first burn tick is observed at 5.0, not 4.5. A status applied exactly on a
   * grid line waits for the next one.
   */
  function nextGridTick(t: number, interval: number): number {
    return roundTime((Math.floor(roundTime(t) / interval + 1e-9) + 1) * interval);
  }

  // The two statuses that TICK for damage. Shield absorbs and Shock procs on a hit, so neither
  // belongs in a tick pool -- `damageChannelOf` is the general form of this distinction.
  const pools: Record<TickingStatus, StatusPool> = {
    [StatusEffectType.Burn]: { layers: 0, nextTickAt: null, bySource: new Map(), sourceSlot: STABLE_SLOT_ORDER[0]! },
    [StatusEffectType.Poison]: { layers: 0, nextTickAt: null, bySource: new Map(), sourceSlot: STABLE_SLOT_ORDER[0]! },
  };

  /**
   * Snapshots of the LIVE stack counts on the shared target, for the status-stacks chart.
   *
   * Sampled from `activeStatuses` as the simulation runs rather than reconstructed afterwards from
   * the timeline. Reconstruction would have to re-implement "Burn sheds 1 layer per tick, Poison
   * sheds none" a second time, and the copy would silently diverge the moment the decay rule
   * changed. Here there is one rule, in `applyStatusTick`, and this just reads the result.
   */
  const stackSamples: { t: number; Burn: number; Poison: number; Shock: number }[] = [];
  function snapshotStacks(t: number) {
    stackSamples.push({
      t,
      Burn: Math.round(pools.Burn.layers),
      Poison: Math.round(pools.Poison.layers),
      Shock: shockLayers,
    });
  }
  snapshotStacks(0);
  const perCreatureDamage = new Map<string, number>();
  const perStatusDamage: Record<StatusEffectType, number> = { Burn: 0, Poison: 0, Shock: 0, Shield: 0 };

  function runTicksUpTo(limit: number) {
    // Repeatedly process the earliest pending POOL tick <= limit, so multiple ticks between two
    // casts (or before the window end) are each handled in order.
    while (true) {
      let next: TickingStatus | null = null;
      let earliestTime = Infinity;
      for (const type of TICKING_STATUSES) {
        const at = pools[type].nextTickAt;
        if (at !== null && at <= limit && at < earliestTime) {
          earliestTime = at;
          next = type;
        }
      }
      if (next === null) break;

      const pool = pools[next];
      const interval = next === StatusEffectType.Burn ? BURN_TICK_SECONDS : POISON_TICK_SECONDS;

      // Through `applyStatusTick`, so "damage equals the current layer count, and Burn then sheds
      // one" stays defined in exactly one place. The pool is handed to it as a single instance,
      // which is precisely what the pool represents: one stack on one target. Re-implementing the
      // rule here would have left two copies free to drift.
      const { damage, nextInstance } = applyStatusTick(
        {
          type: next,
          layers: Math.round(pool.layers),
          sourceSlot: pool.sourceSlot,
          targetSlot: placeholderTargetSlot(pool.sourceSlot),
          appliedAtSeconds: earliestTime,
        },
        interval,
      );

      timeline.push({
        tSeconds: earliestTime,
        kind: TimelineEventKind.StatusTick,
        sourceSlot: pool.sourceSlot,
        damage,
        damageType: damageChannelOf(next),
      });
      perStatusDamage[next] += damage;

      // FR-056: split across contributors in proportion to what each put into the pool — the same
      // rule `shockLayersBySource` already uses for a Shock proc. Kept SEPARATE from own-DPS: a DOT
      // applier's contribution is not direct damage, and merging them would make a DOT team's DPS
      // column incomparable with a direct-damage team's.
      if (pool.layers > 0) {
        for (const [key, contributed] of pool.bySource) {
          const share = (damage * contributed) / pool.layers;
          if (share !== 0) facilitatedDamage.set(key, (facilitatedDamage.get(key) ?? 0) + share);
        }
      }

      // `applyStatusTick` decides what survives: Burn sheds one layer, Poison keeps all of them.
      const before = pool.layers;
      pool.layers = nextInstance === null ? 0 : nextInstance.layers;
      if (pool.layers === 0) {
        pool.bySource.clear();
      } else if (pool.layers !== before && before > 0) {
        // The shed layer comes proportionally from every contributor rather than from one of them,
        // so attribution shares stay stable as the pool drains — there is no basis for deciding
        // whose layer burned off first.
        const scale = pool.layers / before;
        for (const [key, contributed] of pool.bySource) pool.bySource.set(key, contributed * scale);
      }

      pool.nextTickAt = pool.layers > 0 ? roundTime(earliestTime + interval) : null;
      // Stacks just changed (Burn shed a layer, or the pool emptied), so record the new state.
      snapshotStacks(earliestTime);
    }
  }

  // Multicast (round 2, research.md D3; corrected round 4, research.md F2): a cast with
  // Multicast > 1 resolves as multiple full, independent repetitions, staggered 0.1s apart.
  //
  // 2026-10-06 round 9 (T200b): the event loop below replaces round 6's "flatten every cast then
  // walk the list" approach. Casts can no longer be precomputed, because a charge ability shortens
  // a creature's remaining cooldown while the battle runs. Round 6's two correctness properties are
  // preserved exactly (research.md H8 / FR-040):
  //   1. events are processed in true chronological order, and
  //   2. everything sharing a timestamp resolves against a snapshot taken before that timestamp.
  //
  // CHARGE TIMING, pinned deliberately. A charge applied at instant T takes effect *after* T, the
  // same pre-timestamp-snapshot rule FR-040 already uses for Shock. If charges bring a creature's
  // next cast to at-or-before the current instant, it fires at the next representable step
  // (T + 0.1, the same granularity Multicast repetitions use) rather than retroactively at a time
  // that has passed. For the user's team this puts Cobrex's first cast at t=9.1: in continuous time
  // it becomes ready at t=9 as the 7th charge lands, and the snapshot rule defers it by one step.
  // The alternative (charges counting within their own instant) would fire it at t=9; that is the
  // arbitrary half of the choice, and FR-040 already decided which half this engine takes.
  const STEP = 0.1;
  /**
   * T214: chained triggers are depth-capped. Two creatures that trigger each other would otherwise
   * schedule one another forever. The cap is on CHAIN DEPTH WITHIN ONE INSTANT, not on total
   * triggers in the battle: a legitimate chain that fires once per cast must keep working, while a
   * mutual-trigger pair must terminate. 8 is well above any real board (6 slots) and low enough to
   * halt immediately.
   */
  const MAX_CHAIN_DEPTH = 8;
  let chainDepth = 0;
  let chainCapHits = 0;
  /** Repetitions queued from a multicast burst that has already begun. */
  const pendingReps: Cast[] = [];

  /**
   * T224 (research.md L5): buffs granted BY a cast, accumulating across the battle.
   *
   * "+20 Damage for this battle" on an On Cast trigger is not a static buff — it fires every time
   * the creature casts, so the holder is at +20 after one cast and +40 after two. This is the
   * largest mechanism family in the corpus (~40 creatures) and the reason the taxonomy's
   * "Unclassified" bucket resisted classification.
   *
   * It lives here rather than in `effects.ts` because `effects.ts` resolves ONCE before the battle
   * and returns fixed stats; a value that changes mid-window cannot be expressed there.
   */
  /**
   * T215 (FR-081): accumulated POISON stacks on the shared implicit target.
   *
   * Round 9 deferred this for want of a full target entity. **That deferral no longer holds** — the
   * engine already keeps exactly this counter for Shock (`shockLayers`), and a per-status counter is
   * far smaller than a target model. Reversal recorded here rather than silently acted on.
   */
  let poisonLayers = 0;

  /** T213 (FR-080): cooldown-speed granted by ally casts, which COMPOUNDS as the battle runs. */
  const allyCastSpeedBonus = new Map<string, number>();

  /**
   * T245/FR-099: reactive casts, queued WITHOUT touching the reactor's schedule.
   *
   * Kept separate from `pendingReps` (multicast repetitions) only for readability — both are
   * "a cast that is not a scheduled cast". The distinction that matters is that neither advances
   * `schedule[].nextAt`.
   */
  const reactions: Cast[] = [];

  const runtimeBuffs = new Map<string, { damage: number; multicast: number; status: Map<StatusEffectType, number> }>();
  const buffFor = (key: string) => {
    let b = runtimeBuffs.get(key);
    if (!b) {
      b = { damage: 0, multicast: 0, status: new Map() };
      runtimeBuffs.set(key, b);
    }
    return b;
  };

  function nextEventTime(): number | null {
    let best: number | null = null;
    for (const entry of schedule) {
      if (entry.nextAt > windowSeconds + 1e-9) continue;
      if (best === null || entry.nextAt < best) best = entry.nextAt;
    }
    for (const rep of [...pendingReps, ...reactions]) {
      if (rep.tSeconds > windowSeconds + 1e-9) continue;
      if (best === null || rep.tSeconds < best) best = rep.tSeconds;
    }
    return best;
  }

  while (true) {
    const tSeconds = nextEventTime();
    if (tSeconds === null) break;

    // Everything due at exactly this instant, in the documented stable order.
    const dueReps = pendingReps.filter((r) => r.tSeconds === tSeconds);
    for (const r of dueReps) pendingReps.splice(pendingReps.indexOf(r), 1);
    // T245: reactive casts resolve as ordinary casts — they apply status, charge allies and
    // trigger further reactions — they simply never advance their own `schedule[].nextAt`.
    const dueReactions = reactions.filter((r) => r.tSeconds === tSeconds);
    for (const r of dueReactions) reactions.splice(reactions.indexOf(r), 1);
    const dueCasts = schedule.filter((e) => e.nextAt === tSeconds);

    const group: Cast[] = [
      ...dueReps,
      ...dueReactions,
      ...dueCasts.map((e) => ({
        tSeconds,
        sourceSlot: e.sourceSlot,
        creature: e.creature,
        modifiers: e.modifiers,
      })),
    ].sort((a, b) => stableSlotIndex(a.sourceSlot) - stableSlotIndex(b.sourceSlot));

    // Queue each firing creature's remaining repetitions and its next cast before resolving, so a
    // charge landing in this instant adjusts a next-cast time that already exists.
    for (const entry of dueCasts) {
      // Round 10 (T219): the RESOLVED multicast, so a multicast-granting ally actually produces
      // extra repetitions. This read `entry.creature.baseMulticast`, which meant every
      // multicast-grant ability resolved correctly in `effects.ts` and then changed nothing here.
      const resolvedEntry = resolvedByKey.get(placementKey(entry.creature.id, entry.sourceSlot));
      const multicastCount = Math.max(
        1,
        (resolvedEntry?.multicast ?? entry.creature.baseMulticast) +
          entry.modifiers.multicastAdd +
          // T224: accumulated multicast grants, e.g. Shelldra's "+1 Multicast for this battle".
          (runtimeBuffs.get(placementKey(entry.creature.id, entry.sourceSlot))?.multicast ?? 0),
      );
      for (let rep = 1; rep < multicastCount; rep++) {
        const repT = roundTime(tSeconds + rep * STEP);
        if (repT > windowSeconds + 1e-9) break;
        pendingReps.push({ tSeconds: repT, sourceSlot: entry.sourceSlot, creature: entry.creature, modifiers: entry.modifiers });
      }
      entry.nextAt = roundTime(tSeconds + entry.cooldown);
    }

    /*
      ORDER OF OPERATIONS WITHIN ONE INSTANT (research.md B2a).

      Ticks resolve BEFORE the casts at this instant, so a tick landing on a cast's instant uses
      the PRE-cast stack — FR-040's snapshot rule.

      This was briefly inverted and is now restored, because frame-by-frame play says otherwise:
      Venopuff's casts at 7.0, 14.0 and 21.0 each land on a Poison tick, and those ticks deal 4, 12
      and 20 — the stack as it stood BEFORE the cast, every time.

      The symptom that prompted the inversion was real; the cause was the tick CADENCE below, not
      the ordering. With the cadence corrected, snapshot ordering reproduces the observed run
      exactly.
    */
    runTicksUpTo(tSeconds);

    // FR-040 snapshot: every event at this instant resolves against the state as it stood when the
    // instant began. Covers BOTH the scalar total and the per-source attribution map.
    const snapshotShockLayers = shockLayers;
    const snapshotShockLayersBySource = new Map(shockLayersBySource);
    /** Status applications made during this instant, used to charge allies AFTER it completes. */
    const appliedThisInstant: { sourceKey: string; type: StatusEffectType; amount: number }[] = [];

    for (const cast of group) {
      const { creature, sourceSlot, modifiers } = cast;
      const sourceKey = placementKey(creature.id, sourceSlot);
      const effective = resolvedByKey.get(sourceKey);
      // T224: base/resolved damage PLUS whatever this creature has accumulated so far this battle.
      const accrued = runtimeBuffs.get(sourceKey);
      const resolvedBase = effective?.baseDamage ?? creature.publishedCast?.damage ?? null;
      // T232/FR-093: an ability grant may bring a damage effect INTO EXISTENCE. Bonshell has
      // `baseDamage: null` yet deals 80 damage from its second cast, so `null + buff` must resolve
      // to the buff rather than staying null.
      //
      // FR-078 (amended 2026-10-07) extends the same rule to USER modifiers, which is why
      // `modifiers.damageFlatAdd` joins `extra` below instead of being added after the fact. It
      // used to be excluded from this decision, so a damage modifier on a creature with no
      // published damage left `resolvedDamage` null, failed the `isDirectHit` test, and emitted
      // nothing at all — the user's input silently vanished.
      const accruedDamage = accrued?.damage ?? 0;
      // T244/FR-098: damage scaled off the SHARED TARGET's accumulated status, recomputed every
      // cast. Fumungus's "additional Damage equal to 200% of the Poison stacks on the enemy" was
      // the captured team's largest damage term and grows superlinearly, because Poison stacks only
      // ever accumulate. Evaluated here rather than resolved once, since a stored value would be
      // wrong from the second cast onward.
      let targetScaled = 0;
      for (const rule of effective?.targetStatusScaling ?? []) {
        const stacks = rule.status === "Poison" ? poisonLayers : rule.status === "Shock" ? shockLayers : 0;
        targetScaled += stacks * rule.multiplier;
      }
      const extra = accruedDamage + Math.round(targetScaled) + modifiers.damageFlatAdd;
      const resolvedDamage =
        resolvedBase === null ? (extra !== 0 ? extra : null) : resolvedBase + extra;
      // A creature with NO published cast that has ACCRUED damage hits directly: Bonshell publishes
      // no attack at all, but its ability grants one from cast 2. So "no cast" and "a Direct cast"
      // both count, which reads more plainly now that absence is a single state rather than two
      // nulls that had to be checked together.
      const channel = creature.publishedCast?.channel;
      const isDirectHit =
        resolvedDamage !== null && (channel === DamageChannel.Direct || channel === undefined);

      if (isDirectHit) {
        // `damageFlatAdd` is already inside `resolvedDamage` via `extra`; adding it here too would
        // double-count it.
        const effectiveDamage = resolvedDamage!;
        const shockInstance: StatusEffectInstance | null =
          snapshotShockLayers > 0
            ? { type: StatusEffectType.Shock, layers: snapshotShockLayers, sourceSlot, targetSlot: placeholderTargetSlot(sourceSlot), appliedAtSeconds: tSeconds }
            : null;
        const procResult = applyShockProc({ damage: effectiveDamage, damageType: DamageChannel.Direct }, shockInstance);
        if (procResult.shockDamage > 0) {
          timeline.push({ tSeconds, kind: TimelineEventKind.ShockProc, sourceSlot, damage: procResult.shockDamage, damageType: DamageChannel.Shock });
          perStatusDamage.Shock += procResult.shockDamage;
          for (const [key, layers] of snapshotShockLayersBySource) {
            const share = (procResult.shockDamage * layers) / snapshotShockLayers;
            facilitatedDamage.set(key, (facilitatedDamage.get(key) ?? 0) + share);
          }
        }
        timeline.push({ tSeconds, kind: TimelineEventKind.Attack, sourceSlot, damage: effectiveDamage, damageType: DamageChannel.Direct });
        perCreatureDamage.set(sourceKey, (perCreatureDamage.get(sourceKey) ?? 0) + effectiveDamage);
      } else {
        timeline.push({ tSeconds, kind: TimelineEventKind.Attack, sourceSlot });
      }

      // RESOLVED status amounts, not the creature's base ones — this is what makes the simulation
      // actually use the resolution layer rather than merely report it (T202).
      // Round 10 (T219): "applies its Ongoing abilities N additional time(s)" repeats the whole
      // status application, so a grant of 1 doubles this creature's status output per cast. Applied
      // by repeating the list rather than multiplying amounts, because the two differ for Burn:
      // separate applications are separate decaying instances, whereas one doubled application is a
      // single instance that sheds the same 1 layer per tick.
      const ongoingReps = 1 + (effective?.extraOngoingApplications ?? 0);
      const appliedList = Array.from({ length: ongoingReps }, () =>
        (effective?.appliesStatus ?? creature.appliesStatus ?? []).map((s) => ({
          ...s,
          // T224: accumulated status buffs, e.g. "+4 Burn permanently" on an On Cast trigger.
          amount: s.amount + (accrued?.status.get(s.type) ?? 0),
        })),
      ).flat();
      for (const applied of appliedList) {
        if (applied.type === "Shock") {
          const amount = applied.amount + modifiers.shockAmountAdd;
          shockLayers += amount;
          shockLayersBySource.set(sourceKey, (shockLayersBySource.get(sourceKey) ?? 0) + amount);
          timeline.push({ tSeconds, kind: TimelineEventKind.OngoingChange, sourceSlot, statusDelta: { type: StatusEffectType.Shock, slot: placeholderTargetSlot(sourceSlot), layerDelta: amount } });
          appliedThisInstant.push({ sourceKey, type: StatusEffectType.Shock, amount });
        } else if (applied.type === "Burn" || applied.type === "Poison") {
          const amount = applied.amount + (applied.type === "Burn" ? modifiers.burnAmountAdd : modifiers.poisonAmountAdd);
          const interval = applied.type === "Burn" ? BURN_TICK_SECONDS : POISON_TICK_SECONDS;
          if (applied.type === "Poison") poisonLayers += amount;

          // Into the shared pool, NOT a new instance with its own clock.
          //
          // The cadence is a GLOBAL GRID anchored to battle start, not to the application. Poison
          // ticks on whole seconds and Burn on half-seconds, whenever anything is on the target.
          // Frame-by-frame play: Venopuff casts Poison at t=3.5 and the first tick lands at
          // **4.0** — 0.5s later, the next whole second — where an application-anchored clock
          // would say 4.5. Likewise its cast at 10.5 is first felt at 11.0.
          //
          // An application therefore joins whatever cadence is already running and never resets or
          // forks it, which is also what stops two casts producing two interleaved clocks.
          const pool = pools[applied.type];
          if (pool.layers === 0) pool.nextTickAt = nextGridTick(tSeconds, interval);
          pool.layers += amount;
          pool.bySource.set(sourceKey, (pool.bySource.get(sourceKey) ?? 0) + amount);
          // Timeline events credit the largest contributor, so a mixed pool reads as belonging to
          // whoever is actually driving it.
          let topKey = "";
          let topAmount = -1;
          for (const [k, v] of pool.bySource) {
            if (v > topAmount) { topAmount = v; topKey = k; }
          }
          if (topKey === sourceKey) pool.sourceSlot = sourceSlot;
          timeline.push({ tSeconds, kind: TimelineEventKind.OngoingChange, sourceSlot, statusDelta: { type: applied.type, slot: placeholderTargetSlot(sourceSlot), layerDelta: amount } });
          appliedThisInstant.push({ sourceKey, type: applied.type, amount });
        } else if (applied.type === StatusEffectType.Shield) {
          const amount = applied.amount + modifiers.shieldAmountAdd;
          timeline.push({ tSeconds, kind: TimelineEventKind.OngoingChange, sourceSlot, statusDelta: { type: StatusEffectType.Shield, slot: placeholderTargetSlot(sourceSlot), layerDelta: amount } });
          perStatusDamage.Shield += amount;
          appliedThisInstant.push({ sourceKey, type: StatusEffectType.Shield, amount });
        }
        // KNOWN SCOPE GAP (tasks.md T037): applyShieldReduction() exists and is unit-tested, but
        // Shield still never reduces incoming damage here — that needs a modelled target with its
        // own HP/Shield pool, which this engine's "idealised target" assumption does not provide.
      }
    }

    // --- T224: on-cast buffs, granted AFTER the instant completes ---
    //
    // Same FR-040 snapshot rule as charges, and for the same reason: a cast resolves against the
    // state as the instant began, so a creature's own "+20 Damage" does not retroactively inflate
    // the very cast that granted it. Mosslug's first cast deals its base damage; its SECOND deals
    // base + 20. Granting inline would make the buff appear one cast early and silently overstate
    // every creature in the largest family in the corpus.
    //
    // Multicast repetitions do NOT re-grant: the buff is "on cast", and a multicast burst is one
    // cast producing several hits (research.md F2). Only `dueCasts` grants, never `dueReps`.
    for (const entry of dueCasts) {
      const sourceKey = placementKey(entry.creature.id, entry.sourceSlot);
      const sourceResolved = resolvedByKey.get(sourceKey);
      if (!sourceResolved) continue;
      for (const tag of entry.creature.abilityTags) {
        if (tag.kind !== AbilityTagKind.BuffOnCast) continue;
        for (const target of selectTargets(tag.target, sourceResolved, resolved)) {
          const b = buffFor(target.key);
          if (tag.effect.statChange?.stat === "damage") b.damage += tag.effect.statChange.amount;
          if (tag.effect.statChange?.stat === "multicast") b.multicast += tag.effect.statChange.amount;
          if (tag.effect.statChange?.stat === StatChangeStat.CooldownFlatSeconds) {
            // T227a: Saberhorn's "+8 seconds to this monster's Cooldown" — a COST, pushing its own
            // next cast later. Applied to the schedule directly, since cooldown is a property of
            // when the creature acts rather than of what the cast emits.
            const victim = schedule.find((e) => e.key === target.key);
            if (victim) victim.nextAt = roundTime(victim.nextAt + tag.effect.statChange.amount);
          }
          if (tag.effect.statusGrant) {
            const g = tag.effect.statusGrant;
            b.status.set(g.type, (b.status.get(g.type) ?? 0) + g.amount);
          }
        }
      }
    }

    // --- T213/T214: the ally-cast hook ---
    //
    // Fired AFTER the instant, under the same FR-040 snapshot rule as charges and on-cast buffs: a
    // creature responds to an ally's cast, never to its own, and never retroactively to a cast in
    // the same instant it is still resolving.
    //
    // Both tags that need this ride the same hook, which is why T213 and T214 were built together:
    // `cooldownSpeedOnAllyCast` (Drumire's grant, which compounds across the battle) and
    // `triggerOnAllyCast` (a chained cast).
    for (const caster of dueCasts) {
      const casterKey = placementKey(caster.creature.id, caster.sourceSlot);
      const casterResolved = resolvedByKey.get(casterKey);
      if (!casterResolved) continue;

      for (const listener of resolved) {
        if (listener.key === casterKey) continue; // "an ALLY casts" — never yourself
        for (const tag of listener.creature.abilityTags) {
          if (tag.kind === AbilityTagKind.CooldownSpeedOnAllyCast) {
            if (tag.typeFilter && !creatureHasType(caster.creature, tag.typeFilter, config)) continue;
            // Compounds: every qualifying ally cast adds again, for the rest of the battle.
            allyCastSpeedBonus.set(casterKey, (allyCastSpeedBonus.get(casterKey) ?? 0) + tag.amount);
            const entry = schedule.find((e) => e.key === casterKey);
            if (entry && entry.baseCooldown > 0) {
              const speed = 1 + (allyCastSpeedBonus.get(casterKey) ?? 0);
              entry.cooldown = roundTime(entry.baseCooldown / speed);
            }
          } else if (tag.kind === AbilityTagKind.TriggerOnAllyTrigger || tag.kind === AbilityTagKind.TriggerOnAllyCast) {
            if (!selectTargets(tag.target, listener, resolved, config).some((t) => t.key === casterKey)) continue;
            if (chainDepth >= MAX_CHAIN_DEPTH) {
              chainCapHits++;
              continue;
            }
            // 2026-10-06 (T245 / FR-099) — FINDING 7b FIX.
            //
            // This previously set the listener's own `nextAt` to `tSeconds + STEP`, which pulled
            // its next scheduled cast forward; firing then reset its cooldown. The recorded battle
            // shows that is wrong: through a four-hit reactive cascade Puffloon's cooldown bar
            // "climbs monotonically 13 -> 19 px with no reset", and it later cast off its OWN 10s
            // cycle. A reaction is an EXTRA cast, not a rescheduled one.
            //
            // So the reaction is queued as a standalone repetition and the schedule is left alone.
            const reactT = roundTime(tSeconds + STEP);
            if (reactT <= windowSeconds + 1e-9) {
              reactions.push({
                tSeconds: reactT,
                sourceSlot: listener.slot,
                creature: listener.creature,
                modifiers: schedule.find((e) => e.key === listener.key)!.modifiers,
              });
            }
          }
        }
      }
    }

    // Applications for this instant are in; record the resulting stack counts.
    snapshotStacks(tSeconds);

    // --- T241/FR-095: reactive "permanently" gains from ally status inflictions ---
    //
    // Thorntail's "When allies inflict Poison, this gains +24 Damage permanently". Accumulated into
    // `runtimeBuffs.damage`, which `simulate` adds AFTER the resolved (already-multiplied) base —
    // so the gain is never scaled, which is what the capture shows: every step was exactly +24
    // despite Thorntail carrying modifiers worth ~140x.
    for (const entry of schedule) {
      const gains = entry.creature.abilityTags.filter((t) => t.kind === AbilityTagKind.GainOnAllyStatus);
      if (gains.length === 0) continue;
      for (const application of appliedThisInstant) {
        // "when ALLIES inflict" — a creature's own infliction does not count. The capture has one
        // ambiguous frame suggesting otherwise; the handoff is explicit that it must not be changed
        // on that evidence, and the Cobrex charge data supports exclusion.
        if (application.sourceKey === entry.key) continue;
        for (const g of gains) {
          if (g.kind !== AbilityTagKind.GainOnAllyStatus || g.status !== application.type) continue;
          buffFor(entry.key).damage += g.amount;
        }
      }
    }

    // --- Charges, applied AFTER the instant completes (FR-040 snapshot semantics) ---
    for (const entry of schedule) {
      if (entry.chargeRules.length === 0) continue;
      let charge = 0;
      for (const application of appliedThisInstant) {
        // A creature is never charged by its own applications — "whenever an ALLY inflicts".
        if (application.sourceKey === entry.key) continue;
        for (const rule of entry.chargeRules) {
          if (rule.status === application.type) charge += rule.seconds;
        }
      }
      if (charge <= 0) continue;
      const pulled = roundTime(entry.nextAt - charge);
      // Never schedule into the past: a creature made ready by charges fires at the next step.
      entry.nextAt = pulled <= tSeconds ? roundTime(tSeconds + STEP) : pulled;
    }
  }

  runTicksUpTo(windowSeconds);
  snapshotStacks(windowSeconds);
  timeline.sort((a, b) => a.tSeconds - b.tSeconds || stableSlotIndex(a.sourceSlot) - stableSlotIndex(b.sourceSlot));

  // --- Phase C: derived summary + cumulative series ---
  const perCreatureDps: Record<string, number> = {};
  for (const [key, totalDamage] of perCreatureDamage.entries()) {
    perCreatureDps[key] = totalDamage / windowSeconds;
  }

  const perCreatureFacilitatedDps: Record<string, number> = {};
  for (const [key, totalFacilitated] of facilitatedDamage.entries()) {
    perCreatureFacilitatedDps[key] = totalFacilitated / windowSeconds;
  }

  // --- 2026-10-06 round 7 (FR-055): second-order status metrics --------------------------------
  // A single averaged damage/second badly misrepresents a status whose stacks never decay.
  // `applyStatusTick` decrements Burn but explicitly NOT Poison (research.md B2), so every Poison
  // application permanently raises a per-tick damage floor and the rate climbs for the whole
  // battle. Measured on a lone Drumire: 16.00/s average over 20s against 40/s in the final second.
  //
  // These are computed EXACTLY, not by fitting a curve. A least-squares slope over 1-second
  // buckets was tried and rejected: it returned 2.83/2.70 for a case whose exact answer is 2.50,
  // was sensitive to bucket-edge placement, was polluted by the zero-damage startup, and produced
  // NaN at a 1-second window (which the UI permits).
  const appliedTotals: Record<StatusEffectType, number> = { Burn: 0, Poison: 0, Shock: 0, Shield: 0 };
  for (const event of timeline) {
    if (event.statusDelta) appliedTotals[event.statusDelta.type] += event.statusDelta.layerDelta;
  }
  const perStatusAppliedPerSecond: Record<StatusEffectType, number> = {
    Burn: appliedTotals.Burn / windowSeconds,
    Poison: appliedTotals.Poison / windowSeconds,
    Shock: appliedTotals.Shock / windowSeconds,
    Shield: appliedTotals.Shield / windowSeconds,
  };

  // The instantaneous damage rate as the window closes. For a non-decaying DOT this is
  // `live layers / tickInterval`; Burn's live layers are whatever has not yet decayed away.
  const livePoisonLayers = Math.round(pools.Poison.layers);
  const liveBurnLayers = Math.round(pools.Burn.layers);
  const perStatusFinalDamageRate: Record<StatusEffectType, number> = {
    Burn: liveBurnLayers / BURN_TICK_SECONDS,
    Poison: livePoisonLayers / POISON_TICK_SECONDS,
    // Shock deals damage reactively on direct hits, not on a timer, so there is no "rate as the
    // window closes" in the same sense. Reported as its window average rather than a fabricated
    // instantaneous figure. Shield deals no damage at all.
    Shock: perStatusDamage.Shock / windowSeconds,
    Shield: 0,
  };

  // Growth = (rate at window end - rate at window start) / window. The start rate is always 0
  // (nothing is applied before t=0), so this reduces to finalRate/window -- exact, and never NaN
  // for the windowSeconds >= 1 the UI allows.
  const perStatusDamageGrowthPerSecond: Record<StatusEffectType, number> = {
    Burn: perStatusFinalDamageRate.Burn / windowSeconds,
    Poison: perStatusFinalDamageRate.Poison / windowSeconds,
    Shock: perStatusFinalDamageRate.Shock / windowSeconds,
    Shield: 0,
  };

  const perStatusPerSecond: Record<StatusEffectType, number> = {
    Burn: perStatusDamage.Burn / windowSeconds,
    Poison: perStatusDamage.Poison / windowSeconds,
    Shock: perStatusDamage.Shock / windowSeconds,
    // Shield here means Shield *granted* per second (an output stat, same treatment as the
    // other three), not absorption against an opposing target — see the T037 note above.
    Shield: perStatusDamage.Shield / windowSeconds,
  };

  // T257/FR-106: a real 0.5s grid, so the charts' "0.5s increments" label is true rather than
  // decorative. This previously sampled the de-duplicated set of EVENT timestamps — an irregular
  // grid whose spacing depended on what happened to fire — which is why the two charts disagreed
  // about what a point meant.
  //
  // 0.5s is the Burn tick interval, so it is the natural quantum rather than an arbitrary one, and
  // it is fine enough that no cast is hidden between samples at the cooldowns this corpus uses.
  const GRID = 0.5;
  const sampleTimes: number[] = [];
  for (let t = 0; t <= windowSeconds + 1e-9; t = roundTime(t + GRID)) sampleTimes.push(t);
  if (sampleTimes[sampleTimes.length - 1] !== windowSeconds) sampleTimes.push(windowSeconds);
  /*
   * A running total advanced by a cursor, NOT a re-scan of `timeline` per sample.
   *
   * This was `sampleTimes.map(t => timeline.filter(e => e.tSeconds <= t))`, i.e. O(samples x
   * events) — and both factors grow with the window, so the cost grew quadratically in window
   * length. At a 120s window with a full board that alone made one `simulate()` call ~5x the
   * cost of a 30s one, which the placement optimiser then paid 720 times over.
   *
   * Both arrays are sorted ascending (`timeline` by the sort immediately above, `sampleTimes` by
   * construction), so one shared cursor visits each event exactly once.
   */
  let totalDamage = 0;
  let directDamage = 0;
  const runningByStatus: Record<StatusEffectType, number> = { Burn: 0, Poison: 0, Shock: 0, Shield: 0 };
  let cursor = 0;
  const cumulativeSeries = sampleTimes.map((t) => {
    while (cursor < timeline.length && timeline[cursor]!.tSeconds <= t) {
      const event = timeline[cursor]!;
      cursor++;
      // Shield grants carry no `damage`/`damageType` (Shield deals no damage — see the
      // "Shield counted as an output stat" amendment above); they're tracked via
      // `statusDelta` instead and intentionally excluded from `totalDamage`.
      if (event.statusDelta?.type === StatusEffectType.Shield) {
        runningByStatus.Shield += event.statusDelta.layerDelta;
        continue;
      }
      if (event.damage === undefined || event.damageType === undefined) continue;
      totalDamage += event.damage;
      if (event.damageType === "Burn" || event.damageType === "Poison" || event.damageType === "Shock") {
        runningByStatus[event.damageType] += event.damage;
      } else {
        // Direct hits, tracked as their own series. They were previously only visible inside
        // `totalDamage`, so a mixed team's direct contribution could not be read off the chart at
        // all — the Total line moved and you could not tell which source moved it.
        directDamage += event.damage;
      }
    }
    // Copied, not shared: each sample is an independent snapshot of the running totals.
    return { tSeconds: t, totalDamage, directDamage, byStatus: { ...runningByStatus } };
  });

  // --- FR-068 (2026-10-06 round 8): instantaneous DPS over time ------------------------------
  // The cumulative series is monotonic and so cannot show whether output is rising or falling;
  // this is the rate view. Derived from the same `timeline`, so the two can never disagree.
  //
  // 1-second buckets, chosen deliberately: it matches the Poison tick interval and the per-second
  // framing used everywhere else in the UI. Finer buckets render as a comb of spikes at each cast;
  // coarser ones flatten the very ramp this exists to show. Buckets are half-open `(k, k+1]` so a
  // tick landing exactly on a boundary is counted once -- clamping it into the final bucket is the
  // bug that inflated round 7's own evidence by ~2x (research.md I13).
  // T257/FR-106: 0.5s buckets, matching the cumulative chart's grid so a point means the same
  // thing in both. The 1-second choice below was defended on the grounds that finer buckets "render
  // as a comb of spikes"; at 0.5s that is still readable, and having the two charts disagree about
  // their x-quantum was the inconsistency the user reported.
  const BUCKET = 0.5;
  const bucketCount = Math.max(1, Math.ceil(windowSeconds / BUCKET));
  const damageBuckets: number[] = Array.from({ length: bucketCount }, () => 0);
  for (const event of timeline) {
    if (event.damage === undefined || event.damageType === undefined) continue;
    // Half-open `(k, k+BUCKET]`, preserved from the 1s version: a tick landing exactly on a
    // boundary is counted once. Clamping it into the final bucket is the bug that inflated round
    // 7's own evidence by ~2x (research.md I13).
    const index = Math.max(0, Math.ceil(event.tSeconds / BUCKET) - 1);
    if (index < bucketCount) damageBuckets[index] = (damageBuckets[index] ?? 0) + event.damage;
  }
  // `dps` is a RATE: damage in a half-second bucket is twice that per second. The 1s version could
  // treat bucket damage as the rate directly; at 0.5s it must be scaled, or every value halves.
  /**
   * Live stack counts on the shared target, on the same 0.5s grid as the other two charts.
   *
   * Step lookup, not interpolation: a stack count is a discrete quantity that changes at an
   * instant and holds until the next change, so the value at time t is the last snapshot at or
   * before t. Interpolating would draw fractional stacks that never exist.
   *
   * Advanced by a cursor for the same reason as `cumulativeSeries` above: this restarted its
   * scan of `stackSamples` from index 0 for every sample, and both arrays grow with the window.
   */
  let stackCursor = 0;
  const statusStackSeries = sampleTimes.map((t) => {
    while (stackCursor + 1 < stackSamples.length && stackSamples[stackCursor + 1]!.t <= t + 1e-9) {
      stackCursor++;
    }
    const latest = stackSamples[stackCursor]!;
    return { tSeconds: t, Burn: latest.Burn, Poison: latest.Poison, Shock: latest.Shock };
  });

  const dpsRateSeries = [
    // t=0 is a real sample: at the instant the battle starts nothing has cast, so the
    // instantaneous rate is zero. Including it makes t=0 reachable on the scrubber — the moment a
    // user is most likely to check, since it is where every cooldown starts — and anchors the
    // chart at the origin. It contributes 0 to any integral, so totals are unchanged.
    { tSeconds: 0, dps: 0 },
    ...damageBuckets.map((damage, i) => ({
      tSeconds: roundTime((i + 1) * BUCKET),
      dps: damage / BUCKET,
    })),
  ];

  return {
    timeline,
    dpsRateSeries,
    statusStackSeries,
    perCreatureDps,
    perCreatureFacilitatedDps,
    perCreatureEffectiveStats,
    perStatusPerSecond,
    perStatusAppliedPerSecond,
    perStatusFinalDamageRate,
    perStatusDamageGrowthPerSecond,
    knockedOutAtBattleStart: board.knockedOut,
    cumulativeSeries,
  };
}
