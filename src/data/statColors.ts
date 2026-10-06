import type { Rarity } from "./types";

/**
 * Canonical stat/rarity -> color mappings (2026-10-06 round 6, data-model.md's "Canonical stat
 * and rarity colour maps" amendment). Companion to `typeColors.ts`, which does the same job for
 * creature types.
 *
 * Unlike `TYPE_COLORS` (an original design choice, since no official type palette is published),
 * these ARE the game's own published values, extracted from the same embedded database documented
 * in research.md G1/H2 — cross-checked against a user-supplied in-game card, which renders
 * "Deal 5 damage" in `#ef426b`, "Poison 1" in `#7b57a1`, and "Burn 1" in `#ed6b3a`. So these are
 * cited corpus facts, not styling preferences, and should not be "adjusted to taste".
 */

/**
 * Keyed by the published lowercase stat key rather than reusing `StatusEffectType`, because this
 * set includes `damage`, `heal`, and `multicast`, which are not status effects.
 */
export type StatColorKey = "damage" | "burn" | "poison" | "shock" | "shield" | "heal" | "multicast";

export const STAT_COLORS: Record<StatColorKey, string> = {
  damage: "#ef426b",
  burn: "#ed6b3a",
  poison: "#7b57a1",
  shock: "#e7c61c",
  shield: "#a47c41",
  heal: "#578ac9",
  multicast: "#7b93c3",
};

/**
 * Note the deliberate spelling bridge: this corpus's `Rarity` union uses `"SuperRare"` while the
 * published data uses `"Super Rare"`. Mapped explicitly here rather than deriving one spelling
 * from the other, so a future rename can't silently produce a missing color.
 */
export const RARITY_COLORS: Record<Rarity, string> = {
  Common: "#70707a",
  Uncommon: "#4ab500",
  Rare: "#0084bd",
  SuperRare: "#a040a0",
  Legendary: "#d47c00",
  Mythical: "#dc2844",
};

/** Maps a `StatusEffectType` onto its stat color key, for the status-effect subset. */
export function statusColor(type: "Burn" | "Poison" | "Shock" | "Shield"): string {
  const key = type.toLowerCase() as StatColorKey;
  return STAT_COLORS[key];
}
