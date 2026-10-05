import type { DamageType, StatusEffectInstance } from "../data/types";

/**
 * Status-effect timing/decay rules.
 *
 * Source (research.md B2): "Batomon Showdown Status Effects and Debuff Removal"
 * https://batomonshowdown.wiki/mechanics/status-effects-and-debuff-removal/ and
 * "Batomon Showdown Shock Builds Guide" https://batomonshowdowngame.wiki/guides/shock-build/
 *
 * Burn and Poison are periodic ticks; Shock is a reactive modifier on direct-damage events,
 * NOT a timer — it deliberately does not go through `applyStatusTick` (see contracts/engine-api.md).
 */

export function applyStatusTick(
  instance: StatusEffectInstance,
  _elapsedSinceLastTick: number,
): { damage: number; nextInstance: StatusEffectInstance | null } {
  if (instance.type === "Shock") {
    throw new Error(
      "applyStatusTick does not handle Shock — Shock is reactive on direct-damage hits, use applyShockProc instead (research.md B2/B4).",
    );
  }
  if (instance.type === "Shield") {
    throw new Error(
      "Shield is not a periodic-tick status — it is consumed via applyShieldReduction, not applyStatusTick.",
    );
  }

  const damage = instance.layers;

  if (instance.type === "Burn") {
    // Burn loses 1 layer immediately after each tick (research.md B2).
    const remainingLayers = instance.layers - 1;
    if (remainingLayers <= 0) {
      return { damage, nextInstance: null };
    }
    return { damage, nextInstance: { ...instance, layers: remainingLayers } };
  }

  // Poison: layers do NOT decrease from the act of ticking (research.md B2).
  return { damage, nextInstance: { ...instance } };
}

export function applyShockProc(
  directHit: { damage: number; damageType: "Direct" },
  shockInstance: StatusEffectInstance | null,
):
  | {
      shockDamage: number;
      orderedHits: [{ damage: number; damageType: "Shock" }, { damage: number; damageType: "Direct" }];
    }
  | { shockDamage: 0; orderedHits: [{ damage: number; damageType: "Direct" }] } {
  if (shockInstance === null || shockInstance.layers <= 0) {
    return { shockDamage: 0, orderedHits: [directHit] };
  }

  // The Shock hit resolves FIRST, equal to the current layer count, before the direct hit
  // (research.md B2/B4). Shock itself is never mutated here — it only changes via an explicit
  // new application, never from this proc.
  const shockHit = { damage: shockInstance.layers, damageType: "Shock" as const };
  return {
    shockDamage: shockHit.damage,
    orderedHits: [shockHit, directHit],
  };
}

/** Guard used by callers that need to confirm a damage type is one Shock can react to. */
export function isDirectDamage(damageType: DamageType): damageType is "Direct" {
  return damageType === "Direct";
}
