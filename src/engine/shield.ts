import type { DamageType, Provenance } from "../data/types";

/**
 * Source (research.md B3): "Batomon Showdown Status Effects and Debuff Removal"
 * https://batomonshowdown.wiki/mechanics/status-effects-and-debuff-removal/ and
 * "Batomon Showdown Patch Notes: Balance & Meta Breakdown"
 * https://batomon-showdown-wiki.wiki/updates/batomon-showdown-patch-notes
 *
 * This value has already changed twice in the game's history (30% in Patch 0.6.0, reduced to
 * 25% in Hotfix 0.6.1), so it is a named, provenance-tagged constant rather than an inline
 * magic number — Constitution Principle IV applies to engine constants, not just corpus data.
 */
export const STATUS_VS_SHIELD_REDUCTION = 0.25;

export const STATUS_VS_SHIELD_REDUCTION_PROVENANCE: Provenance = {
  sourceRefs: [
    {
      url: "https://batomon-showdown-wiki.wiki/updates/batomon-showdown-patch-notes",
      title: "Batomon Showdown Patch Notes: Balance & Meta Breakdown",
      retrievedAt: "2026-10-05",
    },
  ],
  patch: "Hotfix 0.6.1 (reduced from Patch 0.6.0's 30%)",
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
