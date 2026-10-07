import type {
  Corpus,
  CreatureRecord,
  GridSlot,
  ModifierStat,
  StatModifier,
  StatusEffectInstance,
  StatusEffectType,
  TeamConfiguration,
  TimelineEvent,
} from "../data/types";
import { effectiveCooldown } from "./cooldown";
import { applyStatusTick, applyShockProc } from "./status";
import { isAdjacent, slotKey, slotsEqual, stableSlotIndex } from "./grid";
import { resolveEffects } from "./effects";
import { InvalidTeamConfigurationError } from "./errors";

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
): number {
  let total = 0;
  for (const member of teamMembers) {
    if (slotsEqual(member.slot, targetSlot)) continue; // a creature's own aura doesn't buff itself twice here
    for (const tag of member.creature.abilityTags) {
      if (tag.kind !== "cooldownSpeedModifier") continue;
      const target = tag.target;
      let reaches = false;
      if (target.kind === "adjacent") {
        reaches = isAdjacent(member.slot, targetSlot);
      } else if (target.kind === "allAllies") {
        reaches = true;
      }
      if (!reaches) continue;
      if (target.kind === "adjacent" && target.typeFilter && !targetCreature.types.includes(target.typeFilter)) {
        continue;
      }
      if (target.kind === "allAllies" && target.typeFilter && !targetCreature.types.includes(target.typeFilter)) {
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
  };
}

interface ActiveStatus extends Omit<StatusEffectInstance, "type"> {
  // Only Burn/Poison instances are ever ticked here — Shock is reactive (status.ts) and
  // Shield is absorption-only; neither is ever pushed into `activeStatuses`.
  type: "Burn" | "Poison";
  nextTickAt: number;
  /** `${creatureId}@${slotKey}` of whoever applied this — for facilitated attribution (FR-056). */
  sourceKey: string;
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
  const trinketModifiers: StatModifier[] = config.trinketIds.flatMap((trinketId) => {
    const trinket = corpus.trinkets.find((t) => t.id === trinketId);
    return (trinket?.effectTags ?? []).map((tag, i) => ({
      id: `trinket-${trinketId}-${i}`,
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
  const resolved = resolveEffects(config, corpus);
  const resolvedByKey = new Map(resolved.map((r) => [r.key, r]));

  const teamMembers = config.placements.map((p) => {
    // Safe to assert: validate() above already confirmed a record exists for this exact
    // (creatureId, level) pair — see the lookup-fix amendment in data-model.md.
    const creature = corpus.creatures.find((c) => c.id === p.creatureId && c.level === p.level)!;
    return {
      slot: p.slot,
      creature,
      resolved: resolvedByKey.get(`${creature.id}@${slotKey(p.slot)}`)!,
      placementModifiers: p.modifiers ?? [],
    };
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
    sourceSlot: GridSlot;
    creature: CreatureRecord;
    modifiers: Cast["modifiers"];
    key: string;
    chargeRules: { status: StatusEffectType; seconds: number }[];
  }
  const schedule: Scheduled[] = [];
  const perCreatureEffectiveStats: Record<
    string,
    {
      damage: number | null;
      damageType: CreatureRecord["damageType"];
      cooldownSeconds: number | null;
      multicast: number;
      appliesStatus: { type: StatusEffectType; amount: number }[];
    }
  > = {};

  for (const member of teamMembers) {
    const { creature, slot, placementModifiers } = member;
    const key = `${creature.id}@${slotKey(slot)}`;

    // Modifiers are resolved up front — even when this creature has no ordinary cooldown cast
    // — so `perCreatureEffectiveStats` can report them below regardless of cast eligibility.
    const multicastAdd = sumModifier("multicastAdd", teamModifiers, placementModifiers);
    const damageFlatAdd = sumModifier("damageFlatAdd", teamModifiers, placementModifiers);
    const statusAmountAdd = {
      Burn: sumModifier("burnAmountAdd", teamModifiers, placementModifiers),
      Poison: sumModifier("poisonAmountAdd", teamModifiers, placementModifiers),
      Shock: sumModifier("shockAmountAdd", teamModifiers, placementModifiers),
      Shield: sumModifier("shieldAmountAdd", teamModifiers, placementModifiers),
    };
    const isDirectHitCapable = creature.damageType === "Direct" && member.resolved.baseDamage !== null;
    const effectiveMulticast = Math.max(1, creature.baseMulticast + multicastAdd);

    if (creature.baseCooldownSeconds === null) {
      // Known limitation (data-model.md): a modifier can only scale an effect this creature
      // already has, and there's no cast at all here to attach any modifier to — report raw,
      // unmodified values rather than a modifier that silently never applies.
      perCreatureEffectiveStats[key] = {
        damage: member.resolved.baseDamage,
        damageType: creature.damageType,
        cooldownSeconds: null,
        multicast: creature.baseMulticast,
        appliesStatus: member.resolved.appliesStatus,
      };
      continue;
    }

    const cooldownSpeedTotal =
      resolveCooldownSpeedTotal(slot, creature, teamMembers) +
      sumModifier("cooldownSpeedAdd", teamModifiers, placementModifiers);
    const cooldownFlatAdd = sumModifier("cooldownFlatAddSeconds", teamModifiers, placementModifiers);
    const cooldown = effectiveCooldown(creature.baseCooldownSeconds, cooldownSpeedTotal, cooldownFlatAdd);
    const modifiers = {
      damageFlatAdd,
      burnAmountAdd: statusAmountAdd.Burn,
      poisonAmountAdd: statusAmountAdd.Poison,
      shockAmountAdd: statusAmountAdd.Shock,
      shieldAmountAdd: statusAmountAdd.Shield,
      multicastAdd,
    };

    perCreatureEffectiveStats[key] = {
      damage: isDirectHitCapable ? member.resolved.baseDamage! + damageFlatAdd : member.resolved.baseDamage,
      damageType: creature.damageType,
      cooldownSeconds: cooldown,
      multicast: effectiveMulticast,
      appliesStatus: member.resolved.appliesStatus.map((s) => ({
        type: s.type,
        amount: s.amount + statusAmountAdd[s.type],
      })),
    };

    // 2026-10-06 round 9 (T200b): only the FIRST cast is scheduled here. Subsequent casts are
    // scheduled as each one fires, because a cooldown can now shorten mid-battle (Cobrex's
    // "Charge this by 1 second whenever an ally inflicts Poison"). The previous fixed
    // `n * cooldown` precomputation could not express that at all.
    schedule.push({
      nextAt: roundTime(startAt + cooldown),
      cooldown,
      sourceSlot: slot,
      creature,
      modifiers,
      key: `${creature.id}@${slotKey(slot)}`,
      chargeRules: member.resolved.chargeRules,
    });
  }

  // --- Phase B: walk casts in order, interleaving Burn/Poison ticks, tracking Shock layers ---
  const timeline: TimelineEvent[] = [];
  let shockLayers = 0;
  // "Facilitated damage" (data-model.md amendment, 2026-10-05): tracks WHICH creature(s)
  // contributed each currently-active Shock layer, so a proc's damage can be split
  // proportionally across them rather than attributed to nobody / the attacker it hit through.
  const shockLayersBySource = new Map<string, number>();
  const facilitatedDamage = new Map<string, number>();
  const activeStatuses: ActiveStatus[] = [];
  const perCreatureDamage = new Map<string, number>();
  const perStatusDamage: Record<StatusEffectType, number> = { Burn: 0, Poison: 0, Shock: 0, Shield: 0 };

  function runTicksUpTo(limit: number) {
    // Repeatedly find the earliest pending tick <= limit and process it, so multiple ticks
    // between two casts (or before the window end) are each handled in order.
    while (true) {
      let earliestIndex = -1;
      let earliestTime = Infinity;
      for (let i = 0; i < activeStatuses.length; i++) {
        if (activeStatuses[i]!.nextTickAt <= limit && activeStatuses[i]!.nextTickAt < earliestTime) {
          earliestTime = activeStatuses[i]!.nextTickAt;
          earliestIndex = i;
        }
      }
      if (earliestIndex === -1) break;
      const instance = activeStatuses[earliestIndex]!;
      const { damage, nextInstance } = applyStatusTick(instance, instance.type === "Burn" ? BURN_TICK_SECONDS : POISON_TICK_SECONDS);
      timeline.push({
        tSeconds: earliestTime,
        kind: "statusTick",
        sourceSlot: instance.sourceSlot,
        damage,
        damageType: instance.type,
      });
      perStatusDamage[instance.type] += damage;
      // FR-056: this tick exists because `instance.sourceKey` applied the status, so the damage is
      // that creature's facilitated output -- the same map Shock procs already feed. Kept SEPARATE
      // from own-DPS: a DOT applier's contribution is not direct damage, and merging them would
      // make a DOT team's DPS column incomparable with a direct-damage team's.
      facilitatedDamage.set(instance.sourceKey, (facilitatedDamage.get(instance.sourceKey) ?? 0) + damage);
      if (nextInstance === null) {
        activeStatuses.splice(earliestIndex, 1);
      } else {
        activeStatuses[earliestIndex] = {
          ...nextInstance,
          type: instance.type,
          nextTickAt: roundTime(earliestTime + (instance.type === "Burn" ? BURN_TICK_SECONDS : POISON_TICK_SECONDS)),
          sourceKey: instance.sourceKey,
        };
      }
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
  /** Repetitions queued from a multicast burst that has already begun. */
  const pendingReps: Cast[] = [];

  function nextEventTime(): number | null {
    let best: number | null = null;
    for (const entry of schedule) {
      if (entry.nextAt > windowSeconds + 1e-9) continue;
      if (best === null || entry.nextAt < best) best = entry.nextAt;
    }
    for (const rep of pendingReps) {
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
    const dueCasts = schedule.filter((e) => e.nextAt === tSeconds);

    const group: Cast[] = [
      ...dueReps,
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
      const resolvedEntry = resolvedByKey.get(`${entry.creature.id}@${slotKey(entry.sourceSlot)}`);
      const multicastCount = Math.max(
        1,
        (resolvedEntry?.multicast ?? entry.creature.baseMulticast) + entry.modifiers.multicastAdd,
      );
      for (let rep = 1; rep < multicastCount; rep++) {
        const repT = roundTime(tSeconds + rep * STEP);
        if (repT > windowSeconds + 1e-9) break;
        pendingReps.push({ tSeconds: repT, sourceSlot: entry.sourceSlot, creature: entry.creature, modifiers: entry.modifiers });
      }
      entry.nextAt = roundTime(tSeconds + entry.cooldown);
    }

    runTicksUpTo(tSeconds);

    // FR-040 snapshot: every event at this instant resolves against the state as it stood when the
    // instant began. Covers BOTH the scalar total and the per-source attribution map.
    const snapshotShockLayers = shockLayers;
    const snapshotShockLayersBySource = new Map(shockLayersBySource);
    /** Status applications made during this instant, used to charge allies AFTER it completes. */
    const appliedThisInstant: { sourceKey: string; type: StatusEffectType; amount: number }[] = [];

    for (const cast of group) {
      const { creature, sourceSlot, modifiers } = cast;
      const sourceKey = `${creature.id}@${slotKey(sourceSlot)}`;
      const effective = resolvedByKey.get(sourceKey);
      // Modifiers can only scale an effect the creature already has (data-model.md's "Known
      // limitation") — a damageFlatAdd never fabricates an attack on a creature with no damage.
      const resolvedDamage = effective?.baseDamage ?? creature.baseDamage;
      const isDirectHit = creature.damageType === "Direct" && resolvedDamage !== null;

      if (isDirectHit) {
        const effectiveDamage = resolvedDamage! + modifiers.damageFlatAdd;
        const shockInstance: StatusEffectInstance | null =
          snapshotShockLayers > 0
            ? { type: "Shock", layers: snapshotShockLayers, sourceSlot, targetSlot: placeholderTargetSlot(sourceSlot), appliedAtSeconds: tSeconds }
            : null;
        const procResult = applyShockProc({ damage: effectiveDamage, damageType: "Direct" }, shockInstance);
        if (procResult.shockDamage > 0) {
          timeline.push({ tSeconds, kind: "shockProc", sourceSlot, damage: procResult.shockDamage, damageType: "Shock" });
          perStatusDamage.Shock += procResult.shockDamage;
          for (const [key, layers] of snapshotShockLayersBySource) {
            const share = (procResult.shockDamage * layers) / snapshotShockLayers;
            facilitatedDamage.set(key, (facilitatedDamage.get(key) ?? 0) + share);
          }
        }
        timeline.push({ tSeconds, kind: "attack", sourceSlot, damage: effectiveDamage, damageType: "Direct" });
        perCreatureDamage.set(sourceKey, (perCreatureDamage.get(sourceKey) ?? 0) + effectiveDamage);
      } else {
        timeline.push({ tSeconds, kind: "attack", sourceSlot });
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
        effective?.appliesStatus ?? creature.appliesStatus ?? [],
      ).flat();
      for (const applied of appliedList) {
        if (applied.type === "Shock") {
          const amount = applied.amount + modifiers.shockAmountAdd;
          shockLayers += amount;
          shockLayersBySource.set(sourceKey, (shockLayersBySource.get(sourceKey) ?? 0) + amount);
          timeline.push({ tSeconds, kind: "ongoingChange", sourceSlot, statusDelta: { type: "Shock", slot: placeholderTargetSlot(sourceSlot), layerDelta: amount } });
          appliedThisInstant.push({ sourceKey, type: "Shock", amount });
        } else if (applied.type === "Burn" || applied.type === "Poison") {
          const amount = applied.amount + (applied.type === "Burn" ? modifiers.burnAmountAdd : modifiers.poisonAmountAdd);
          const interval = applied.type === "Burn" ? BURN_TICK_SECONDS : POISON_TICK_SECONDS;
          activeStatuses.push({
            type: applied.type,
            layers: amount,
            sourceSlot,
            targetSlot: placeholderTargetSlot(sourceSlot),
            appliedAtSeconds: tSeconds,
            nextTickAt: roundTime(tSeconds + interval),
            sourceKey,
          });
          timeline.push({ tSeconds, kind: "ongoingChange", sourceSlot, statusDelta: { type: applied.type, slot: placeholderTargetSlot(sourceSlot), layerDelta: amount } });
          appliedThisInstant.push({ sourceKey, type: applied.type, amount });
        } else if (applied.type === "Shield") {
          const amount = applied.amount + modifiers.shieldAmountAdd;
          timeline.push({ tSeconds, kind: "ongoingChange", sourceSlot, statusDelta: { type: "Shield", slot: placeholderTargetSlot(sourceSlot), layerDelta: amount } });
          perStatusDamage.Shield += amount;
          appliedThisInstant.push({ sourceKey, type: "Shield", amount });
        }
        // KNOWN SCOPE GAP (tasks.md T037): applyShieldReduction() exists and is unit-tested, but
        // Shield still never reduces incoming damage here — that needs a modelled target with its
        // own HP/Shield pool, which this engine's "idealised target" assumption does not provide.
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
  let livePoisonLayers = 0;
  let liveBurnLayers = 0;
  for (const instance of activeStatuses) {
    if (instance.type === "Poison") livePoisonLayers += instance.layers;
    else liveBurnLayers += instance.layers;
  }
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

  const sampleTimes = Array.from(new Set([0, ...timeline.map((e) => e.tSeconds), windowSeconds])).sort(
    (a, b) => a - b,
  );
  const cumulativeSeries = sampleTimes.map((t) => {
    let totalDamage = 0;
    const byStatus: Record<StatusEffectType, number> = { Burn: 0, Poison: 0, Shock: 0, Shield: 0 };
    for (const event of timeline) {
      if (event.tSeconds > t) continue;
      // Shield grants carry no `damage`/`damageType` (Shield deals no damage — see the
      // "Shield counted as an output stat" amendment above); they're tracked via
      // `statusDelta` instead and intentionally excluded from `totalDamage`.
      if (event.statusDelta?.type === "Shield") {
        byStatus.Shield += event.statusDelta.layerDelta;
        continue;
      }
      if (event.damage === undefined || event.damageType === undefined) continue;
      totalDamage += event.damage;
      if (event.damageType === "Burn" || event.damageType === "Poison" || event.damageType === "Shock") {
        byStatus[event.damageType] += event.damage;
      }
    }
    return { tSeconds: t, totalDamage, byStatus };
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
  const bucketCount = Math.max(1, Math.ceil(windowSeconds));
  const damageBuckets = new Array<number>(bucketCount).fill(0);
  for (const event of timeline) {
    if (event.damage === undefined || event.damageType === undefined) continue;
    const index = Math.max(0, Math.ceil(event.tSeconds) - 1);
    if (index < bucketCount) damageBuckets[index] = (damageBuckets[index] ?? 0) + event.damage;
  }
  const dpsRateSeries = damageBuckets.map((damage, i) => ({ tSeconds: i + 1, dps: damage }));

  return {
    timeline,
    dpsRateSeries,
    perCreatureDps,
    perCreatureFacilitatedDps,
    perCreatureEffectiveStats,
    perStatusPerSecond,
    perStatusAppliedPerSecond,
    perStatusFinalDamageRate,
    perStatusDamageGrowthPerSecond,
    cumulativeSeries,
  };
}
