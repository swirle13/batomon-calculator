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
    if (!corpus.creatures.some((c) => c.id === placement.creatureId)) {
      throw new InvalidTeamConfigurationError(
        "placements",
        `Unknown creatureId "${placement.creatureId}" — no matching corpus record.`,
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

  const teamModifiers = config.teamModifiers ?? [];
  const teamMembers = config.placements.map((p) => ({
    slot: p.slot,
    creature: corpus.creatures.find((c) => c.id === p.creatureId)!,
    placementModifiers: p.modifiers ?? [],
  }));

  // --- Phase A: generate every creature's cast times across the window ---
  const casts: Cast[] = [];
  for (const member of teamMembers) {
    const { creature, slot, placementModifiers } = member;
    if (creature.baseCooldownSeconds === null) continue;
    const cooldownSpeedTotal =
      resolveCooldownSpeedTotal(slot, creature, teamMembers) +
      sumModifier("cooldownSpeedAdd", teamModifiers, placementModifiers);
    const cooldownFlatAdd = sumModifier("cooldownFlatAddSeconds", teamModifiers, placementModifiers);
    const cooldown = effectiveCooldown(creature.baseCooldownSeconds, cooldownSpeedTotal, cooldownFlatAdd);
    const modifiers = {
      damageFlatAdd: sumModifier("damageFlatAdd", teamModifiers, placementModifiers),
      burnAmountAdd: sumModifier("burnAmountAdd", teamModifiers, placementModifiers),
      poisonAmountAdd: sumModifier("poisonAmountAdd", teamModifiers, placementModifiers),
      shockAmountAdd: sumModifier("shockAmountAdd", teamModifiers, placementModifiers),
      shieldAmountAdd: sumModifier("shieldAmountAdd", teamModifiers, placementModifiers),
    };
    for (let t = startAt + cooldown; t <= windowSeconds; t += cooldown) {
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
          nextTickAt: earliestTime + (instance.type === "Burn" ? BURN_TICK_SECONDS : POISON_TICK_SECONDS),
        };
      }
    }
  }

  for (const cast of casts) {
    runTicksUpTo(cast.tSeconds);

    const { creature, sourceSlot, modifiers } = cast;
    // Modifiers can only scale an effect the creature already has (data-model.md's "Known
    // limitation" on StatModifiers) — a damageFlatAdd modifier never fabricates a new attack
    // on a creature whose baseDamage is null.
    const isDirectHit = creature.damageType === "Direct" && creature.baseDamage !== null;

    if (isDirectHit) {
      const effectiveDamage = creature.baseDamage! + modifiers.damageFlatAdd;
      const shockInstance: StatusEffectInstance | null =
        shockLayers > 0
          ? { type: "Shock", layers: shockLayers, sourceSlot, targetSlot: placeholderTargetSlot(sourceSlot), appliedAtSeconds: cast.tSeconds }
          : null;
      const procResult = applyShockProc({ damage: effectiveDamage, damageType: "Direct" }, shockInstance);
      if (procResult.shockDamage > 0) {
        timeline.push({ tSeconds: cast.tSeconds, kind: "shockProc", sourceSlot, damage: procResult.shockDamage, damageType: "Shock" });
        perStatusDamage.Shock += procResult.shockDamage;
        // Split this proc's damage proportionally across every creature currently
        // contributing Shock layers, by their share of the total — see "Facilitated damage".
        for (const [sourceKey, sourceLayers] of shockLayersBySource) {
          const share = (procResult.shockDamage * sourceLayers) / shockLayers;
          facilitatedDamage.set(sourceKey, (facilitatedDamage.get(sourceKey) ?? 0) + share);
        }
      }
      timeline.push({ tSeconds: cast.tSeconds, kind: "attack", sourceSlot, damage: effectiveDamage, damageType: "Direct" });
      const key = `${creature.id}@${slotKey(sourceSlot)}`;
      perCreatureDamage.set(key, (perCreatureDamage.get(key) ?? 0) + effectiveDamage);
    } else {
      // A cast with no direct-damage component still occupies a timeline entry (it happened),
      // but contributes nothing to perCreatureDps.
      timeline.push({ tSeconds: cast.tSeconds, kind: "attack", sourceSlot });
    }

    for (const applied of creature.appliesStatus ?? []) {
      if (applied.type === "Shock") {
        const amount = applied.amount + modifiers.shockAmountAdd;
        shockLayers += amount;
        const sourceKey = `${creature.id}@${slotKey(sourceSlot)}`;
        shockLayersBySource.set(sourceKey, (shockLayersBySource.get(sourceKey) ?? 0) + amount);
        timeline.push({
          tSeconds: cast.tSeconds,
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
          appliedAtSeconds: cast.tSeconds,
          nextTickAt: cast.tSeconds + interval,
        });
      } else if (applied.type === "Shield") {
        // Shield counters (data-model.md "Shield counted as an output stat", 2026-10-05):
        // tracked as cumulative Shield *granted* by the team's own casts — same treatment as
        // Burn/Poison/Shock in spirit, via the existing statusDelta field (Shield isn't a
        // DamageType, since it never deals damage — see research.md B3) — not as absorption
        // against an opposing target (still unmodeled, see the T037 note below).
        const amount = applied.amount + modifiers.shieldAmountAdd;
        timeline.push({
          tSeconds: cast.tSeconds,
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

  return { timeline, perCreatureDps, perCreatureFacilitatedDps, perStatusPerSecond, cumulativeSeries };
}
