import type {
  Corpus,
  CreatureRecord,
  GridSlot,
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

interface Cast {
  tSeconds: number;
  sourceSlot: GridSlot;
  creature: CreatureRecord;
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

  const teamMembers = config.placements.map((p) => ({
    slot: p.slot,
    creature: corpus.creatures.find((c) => c.id === p.creatureId)!,
  }));

  // --- Phase A: generate every creature's cast times across the window ---
  const casts: Cast[] = [];
  for (const member of teamMembers) {
    const { creature, slot } = member;
    if (creature.baseCooldownSeconds === null) continue;
    const cooldownSpeedTotal = resolveCooldownSpeedTotal(slot, creature, teamMembers);
    const cooldown = effectiveCooldown(creature.baseCooldownSeconds, cooldownSpeedTotal, 0);
    for (let t = startAt + cooldown; t <= windowSeconds; t += cooldown) {
      casts.push({ tSeconds: t, sourceSlot: slot, creature });
    }
  }
  casts.sort((a, b) => a.tSeconds - b.tSeconds || stableSlotIndex(a.sourceSlot) - stableSlotIndex(b.sourceSlot));

  // --- Phase B: walk casts in order, interleaving Burn/Poison ticks, tracking Shock layers ---
  const timeline: TimelineEvent[] = [];
  let shockLayers = 0;
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

    const { creature, sourceSlot } = cast;
    const isDirectHit = creature.damageType === "Direct" && creature.baseDamage !== null;

    if (isDirectHit) {
      const shockInstance: StatusEffectInstance | null =
        shockLayers > 0
          ? { type: "Shock", layers: shockLayers, sourceSlot, targetSlot: placeholderTargetSlot(sourceSlot), appliedAtSeconds: cast.tSeconds }
          : null;
      const procResult = applyShockProc({ damage: creature.baseDamage!, damageType: "Direct" }, shockInstance);
      if (procResult.shockDamage > 0) {
        timeline.push({ tSeconds: cast.tSeconds, kind: "shockProc", sourceSlot, damage: procResult.shockDamage, damageType: "Shock" });
        perStatusDamage.Shock += procResult.shockDamage;
      }
      timeline.push({ tSeconds: cast.tSeconds, kind: "attack", sourceSlot, damage: creature.baseDamage!, damageType: "Direct" });
      const key = `${creature.id}@${slotKey(sourceSlot)}`;
      perCreatureDamage.set(key, (perCreatureDamage.get(key) ?? 0) + creature.baseDamage!);
    } else {
      // A cast with no direct-damage component still occupies a timeline entry (it happened),
      // but contributes nothing to perCreatureDps.
      timeline.push({ tSeconds: cast.tSeconds, kind: "attack", sourceSlot });
    }

    for (const applied of creature.appliesStatus ?? []) {
      if (applied.type === "Shock") {
        shockLayers += applied.amount;
        timeline.push({
          tSeconds: cast.tSeconds,
          kind: "ongoingChange",
          sourceSlot,
          statusDelta: { type: "Shock", slot: placeholderTargetSlot(sourceSlot), layerDelta: applied.amount },
        });
      } else if (applied.type === "Burn" || applied.type === "Poison") {
        const interval = applied.type === "Burn" ? BURN_TICK_SECONDS : POISON_TICK_SECONDS;
        activeStatuses.push({
          type: applied.type,
          layers: applied.amount,
          sourceSlot,
          targetSlot: placeholderTargetSlot(sourceSlot),
          appliedAtSeconds: cast.tSeconds,
          nextTickAt: cast.tSeconds + interval,
        });
      }
      // Shield is absorption, not a per-second output stat — intentionally not accumulated
      // into perStatusDamage/cumulativeSeries here (see shield.ts for its own treatment).
      //
      // KNOWN SCOPE GAP (tasks.md T037): applyShieldReduction() is implemented and unit-tested
      // (shield.ts) but is NOT wired in here. Doing so meaningfully requires a modeled *target*
      // with its own HP/Shield pool, which does not exist under this engine's "idealized
      // target" assumption (spec.md Assumptions) — simulate() only measures the user's team's
      // outgoing damage, never anything absorbing it. Wiring this in is deferred until/unless
      // the spec grows a real target entity; tracked explicitly rather than faked.
    }
  }

  runTicksUpTo(windowSeconds);
  timeline.sort((a, b) => a.tSeconds - b.tSeconds || stableSlotIndex(a.sourceSlot) - stableSlotIndex(b.sourceSlot));

  // --- Phase C: derived summary + cumulative series ---
  const perCreatureDps: Record<string, number> = {};
  for (const [key, totalDamage] of perCreatureDamage.entries()) {
    perCreatureDps[key] = totalDamage / windowSeconds;
  }

  const perStatusPerSecond: Record<StatusEffectType, number> = {
    Burn: perStatusDamage.Burn / windowSeconds,
    Poison: perStatusDamage.Poison / windowSeconds,
    Shock: perStatusDamage.Shock / windowSeconds,
    Shield: 0,
  };

  const sampleTimes = Array.from(new Set([0, ...timeline.map((e) => e.tSeconds), windowSeconds])).sort(
    (a, b) => a - b,
  );
  const cumulativeSeries = sampleTimes.map((t) => {
    let totalDamage = 0;
    const byStatus: Record<StatusEffectType, number> = { Burn: 0, Poison: 0, Shock: 0, Shield: 0 };
    for (const event of timeline) {
      if (event.tSeconds > t) continue;
      if (event.damage === undefined || event.damageType === undefined) continue;
      totalDamage += event.damage;
      if (event.damageType === "Burn" || event.damageType === "Poison" || event.damageType === "Shock") {
        byStatus[event.damageType] += event.damage;
      }
    }
    return { tSeconds: t, totalDamage, byStatus };
  });

  return { timeline, perCreatureDps, perStatusPerSecond, cumulativeSeries };
}
