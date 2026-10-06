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
  const teamMembers = config.placements.map((p) => ({
    slot: p.slot,
    // Safe to assert: validate() above already confirmed a record exists for this exact
    // (creatureId, level) pair — see the lookup-fix amendment in data-model.md.
    creature: corpus.creatures.find((c) => c.id === p.creatureId && c.level === p.level)!,
    placementModifiers: p.modifiers ?? [],
  }));

  // --- Phase A: generate every creature's cast times across the window, and resolve each
  //     placement's modifier-adjusted "effective stats" snapshot (2026-10-05 round 2) ---
  const casts: Cast[] = [];
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
    const isDirectHitCapable = creature.damageType === "Direct" && creature.baseDamage !== null;
    const effectiveMulticast = Math.max(1, creature.baseMulticast + multicastAdd);

    if (creature.baseCooldownSeconds === null) {
      // Known limitation (data-model.md): a modifier can only scale an effect this creature
      // already has, and there's no cast at all here to attach any modifier to — report raw,
      // unmodified values rather than a modifier that silently never applies.
      perCreatureEffectiveStats[key] = {
        damage: creature.baseDamage,
        damageType: creature.damageType,
        cooldownSeconds: null,
        multicast: creature.baseMulticast,
        appliesStatus: creature.appliesStatus ?? [],
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
      damage: isDirectHitCapable ? creature.baseDamage! + damageFlatAdd : creature.baseDamage,
      damageType: creature.damageType,
      cooldownSeconds: cooldown,
      multicast: effectiveMulticast,
      appliesStatus: (creature.appliesStatus ?? []).map((s) => ({
        type: s.type,
        amount: s.amount + statusAmountAdd[s.type],
      })),
    };

    // Index multiplication, not repeated `+=` addition (research.md D4) — avoids accumulating
    // IEEE-754 drift across many casts; each resulting timestamp is still explicitly rounded.
    for (let n = 1; startAt + n * cooldown <= windowSeconds + 1e-9; n++) {
      const t = roundTime(startAt + n * cooldown);
      casts.push({ tSeconds: t, sourceSlot: slot, creature, modifiers });
    }
  }
  casts.sort((a, b) => a.tSeconds - b.tSeconds || stableSlotIndex(a.sourceSlot) - stableSlotIndex(b.sourceSlot));

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
      if (nextInstance === null) {
        activeStatuses.splice(earliestIndex, 1);
      } else {
        activeStatuses[earliestIndex] = {
          ...nextInstance,
          type: instance.type,
          nextTickAt: roundTime(earliestTime + (instance.type === "Burn" ? BURN_TICK_SECONDS : POISON_TICK_SECONDS)),
        };
      }
    }
  }

  for (const cast of casts) {
    const { creature, sourceSlot, modifiers } = cast;

    // Multicast (2026-10-05 round 2, research.md D3; corrected round 4, research.md F2): a cast
    // with Multicast > 1 resolves as multiple full, independent repetitions — each repetition
    // has its own direct-damage event (own potential Shock proc) AND its own status-grant
    // application, not just a damage multiplier. Repetitions are staggered 0.1s apart (round 4
    // correction — round 2 incorrectly fired them all at the same timestamp), confirmed by
    // multiple independent 1.2.0-era sources: "its first cast resolves immediately, its second
    // cast resolves 0.1 seconds later, and its third cast resolves 0.1 seconds after that."
    // Every existing corpus record defaults to baseMulticast: 1, so this loop runs exactly once
    // (no behavior change, no stagger) for every creature not explicitly granted Multicast.
    const multicastCount = Math.max(1, creature.baseMulticast + modifiers.multicastAdd);

    for (let rep = 0; rep < multicastCount; rep++) {
      // A repetition staggered past the simulation window simply doesn't happen — same
      // boundary rule as ordinary cast generation in Phase A.
      const repTSeconds = roundTime(cast.tSeconds + rep * 0.1);
      if (repTSeconds > windowSeconds + 1e-9) break;
      // Each repetition's own timestamp, including any Burn/Poison ticks landing strictly
      // between two repetitions of the same multicast burst — not just once per whole burst.
      runTicksUpTo(repTSeconds);
      // Modifiers can only scale an effect the creature already has (data-model.md's "Known
      // limitation" on StatModifiers) — a damageFlatAdd modifier never fabricates a new attack
      // on a creature whose baseDamage is null.
      const isDirectHit = creature.damageType === "Direct" && creature.baseDamage !== null;

      if (isDirectHit) {
        const effectiveDamage = creature.baseDamage! + modifiers.damageFlatAdd;
        const shockInstance: StatusEffectInstance | null =
          shockLayers > 0
            ? { type: "Shock", layers: shockLayers, sourceSlot, targetSlot: placeholderTargetSlot(sourceSlot), appliedAtSeconds: repTSeconds }
            : null;
        const procResult = applyShockProc({ damage: effectiveDamage, damageType: "Direct" }, shockInstance);
        if (procResult.shockDamage > 0) {
          timeline.push({ tSeconds: repTSeconds, kind: "shockProc", sourceSlot, damage: procResult.shockDamage, damageType: "Shock" });
          perStatusDamage.Shock += procResult.shockDamage;
          // Split this proc's damage proportionally across every creature currently
          // contributing Shock layers, by their share of the total — see "Facilitated damage".
          for (const [sourceKey, sourceLayers] of shockLayersBySource) {
            const share = (procResult.shockDamage * sourceLayers) / shockLayers;
            facilitatedDamage.set(sourceKey, (facilitatedDamage.get(sourceKey) ?? 0) + share);
          }
        }
        timeline.push({ tSeconds: repTSeconds, kind: "attack", sourceSlot, damage: effectiveDamage, damageType: "Direct" });
        const key = `${creature.id}@${slotKey(sourceSlot)}`;
        perCreatureDamage.set(key, (perCreatureDamage.get(key) ?? 0) + effectiveDamage);
      } else {
        // A cast with no direct-damage component still occupies a timeline entry (it happened),
        // but contributes nothing to perCreatureDps.
        timeline.push({ tSeconds: repTSeconds, kind: "attack", sourceSlot });
      }

      for (const applied of creature.appliesStatus ?? []) {
        if (applied.type === "Shock") {
          const amount = applied.amount + modifiers.shockAmountAdd;
          shockLayers += amount;
          const sourceKey = `${creature.id}@${slotKey(sourceSlot)}`;
          shockLayersBySource.set(sourceKey, (shockLayersBySource.get(sourceKey) ?? 0) + amount);
          timeline.push({
            tSeconds: repTSeconds,
            kind: "ongoingChange",
            sourceSlot,
            statusDelta: { type: "Shock", slot: placeholderTargetSlot(sourceSlot), layerDelta: amount },
          });
        } else if (applied.type === "Burn" || applied.type === "Poison") {
          const amount = applied.amount + (applied.type === "Burn" ? modifiers.burnAmountAdd : modifiers.poisonAmountAdd);
          const interval = applied.type === "Burn" ? BURN_TICK_SECONDS : POISON_TICK_SECONDS;
          activeStatuses.push({
            type: applied.type,
            layers: amount,
            sourceSlot,
            targetSlot: placeholderTargetSlot(sourceSlot),
            appliedAtSeconds: repTSeconds,
            nextTickAt: roundTime(repTSeconds + interval),
          });
        } else if (applied.type === "Shield") {
          // Shield counters (data-model.md "Shield counted as an output stat", 2026-10-05):
          // tracked as cumulative Shield *granted* by the team's own casts — same treatment as
          // Burn/Poison/Shock in spirit, via the existing statusDelta field (Shield isn't a
          // DamageType, since it never deals damage — see research.md B3) — not as absorption
          // against an opposing target (still unmodeled, see the T037 note below).
          const amount = applied.amount + modifiers.shieldAmountAdd;
          timeline.push({
            tSeconds: repTSeconds,
            kind: "ongoingChange",
            sourceSlot,
            statusDelta: { type: "Shield", slot: placeholderTargetSlot(sourceSlot), layerDelta: amount },
          });
          perStatusDamage.Shield += amount;
        }
        //
        // KNOWN SCOPE GAP (tasks.md T037): applyShieldReduction() is implemented and unit-tested
        // (shield.ts) but Shield is still never used to *reduce* incoming damage here. Doing that
        // meaningfully requires a modeled *target* with its own HP/Shield pool, which does not
        // exist under this engine's "idealized target" assumption (spec.md Assumptions) —
        // simulate() only measures the user's team's outgoing damage, never anything absorbing
        // it. Wiring that in is deferred until/unless the spec grows a real target entity.
      }
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

  return {
    timeline,
    perCreatureDps,
    perCreatureFacilitatedDps,
    perCreatureEffectiveStats,
    perStatusPerSecond,
    cumulativeSeries,
  };
}
