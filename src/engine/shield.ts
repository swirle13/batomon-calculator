import type { DamageType, Provenance } from "../data/types";

/**
 * Source (research.md F1, 2026-10-05 round 4): "Batomon Showdown Combat Mechanics"
 * https://batomonshowdowngame.wiki/guides/combat/, "Batomon Showdown Shock Builds Guide"
 * https://batomonshowdowngame.wiki/guides/shock-build/, "Batomon Showdown Burn Builds Guide"
 * https://batomonshowdowngame.wiki/guides/burn-build/ — all three independently confirm an
 * August 2026 balance pass reduced this value to 15%, corroborating a stat reference the user
 * supplied directly.
 *
 * This value has now changed three times in the game's history (30% in Patch 0.6.0, 25% in
 * Hotfix 0.6.1 — research.md B3 — then 15% in the August 2026 patch), so it stays a named,
 * provenance-tagged constant rather than an inline magic number — Constitution Principle IV
 * applies to engine constants, not just corpus data.
 */
export const STATUS_VS_SHIELD_REDUCTION = 0.15;

export const STATUS_VS_SHIELD_REDUCTION_PROVENANCE: Provenance = {
  sourceRefs: [
    {
      url: "https://batomonshowdowngame.wiki/guides/combat/",
      title: "Batomon Showdown Combat Mechanics",
      retrievedAt: "2026-10-05",
    },
    {
      url: "https://batomonshowdowngame.wiki/guides/shock-build/",
      title: "Batomon Showdown Shock Builds Guide",
      retrievedAt: "2026-10-05",
    },
    {
      url: "https://batomonshowdowngame.wiki/guides/burn-build/",
      title: "Batomon Showdown Burn Builds Guide",
      retrievedAt: "2026-10-05",
    },
  ],
  patch: "August 2026 balance pass (reduced from Hotfix 0.6.1's 25%, itself reduced from Patch 0.6.0's 30%)",
};

export function applyShieldReduction(
  incomingDamage: number,
  damageType: DamageType,
  shieldRemaining: number,
): { damageToShield: number; damageToHp: number; shieldRemaining: number } {
  const effectiveIncoming =
    damageType === "Direct" ? incomingDamage : incomingDamage * (1 - STATUS_VS_SHIELD_REDUCTION);

  const absorbed = Math.min(effectiveIncoming, shieldRemaining);
  const overflow = effectiveIncoming - absorbed;

  return {
    damageToShield: absorbed,
    damageToHp: overflow,
    shieldRemaining: shieldRemaining - absorbed,
  };
}
