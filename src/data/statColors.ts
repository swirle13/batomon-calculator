import type { Rarity, StatusEffectType } from "./types";
import { RARITY } from "./vocabularies";
import { keysInOrder } from "./vocabulary";
import { STATUS_COLOR_KEY } from "./format";

/**
 * Canonical stat/rarity -> color mappings (2026-10-06 round 6, data-model.md's "Canonical stat
 * and rarity colour maps" amendment). Companion to `typeColors.ts`, which does the same job for
 * creature types.
 *
 * Unlike `TYPE_COLORS` (an original design choice, since no official type palette is published),
 * these ARE the game's own published values, extracted from the same embedded database documented
 * in research.md G1/H2 — cross-checked against a user-supplied in-game card, which renders
 * "Deal 5 damage" in `#ef426b`, "Poison 1" in `#7b57a1`, and "Burn 1" in `#ed6b3a`. So these are
 * cited corpus facts, not styling preferences, and should not be "adjusted to taste" -- but they
 * ARE correctable against the game itself: `shield` was published as a brown and the game renders
 * it silver, so the game wins (round 7, FR-041). Correct with evidence; never to taste.
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
  // 2026-10-06 round 7 (tasks.md T154 / FR-041): OVERRIDES the batodex-published `#a47c41`
  // (brown) that H2 cites. The game renders Shield on a silver/steel plate -- pixel-sampling the
  // user's in-game capture gives #a7a8b4 / #a8a9b4 / #a5a9da, and this is that hue family nudged
  // darker so white badge text keeps legible contrast. Six of the seven colours here were
  // cross-checked against an in-game card in round 6; `shield` was the one that wasn't, which is
  // why it is the one that was wrong.
  shield: "#9aa1b8",
  heal: "#578ac9",
  multicast: "#7b93c3",
};

/**
 * Rarity ordering and colours, both now DERIVED from the `RARITY` registry (2026-10-07, round 7).
 *
 * These three were parallel structures keyed by the same union — an ordering array, its reverse,
 * and a colour record — which is three chances to add a tier to one and forget the others. Round 6's
 * validation found exactly that: `PAINTER_RARITY_SHAPE` keyed `"Super Rare"` against a corpus
 * spelling of `"SuperRare"`, so the Super Rare chip silently vanished and the guidance row summed to
 * 7 of 9 instead of 9. The names and every call site are unchanged; only the declaration moved.
 *
 * The "deliberate spelling bridge" comment that used to sit here is gone because it is now a
 * mechanism: `RARITY.SuperRare.label` is `"Super Rare"`, and `labelOf` is the only way the UI gets a
 * rarity's display text.
 */
export const RARITIES_ASC: Rarity[] = keysInOrder(RARITY);
export const RARITIES_DESC: Rarity[] = [...RARITIES_ASC].reverse();

export const RARITY_COLORS: Record<Rarity, string> = Object.fromEntries(
  RARITIES_ASC.map((r) => [r, RARITY[r].color]),
) as Record<Rarity, string>;

/** A rarity's display text. The stored key (`"SuperRare"`) must never reach the screen. */
export function rarityLabel(rarity: Rarity): string {
  return RARITY[rarity].label;
}

/**
 * Maps a `StatusEffectType` onto its stat color. Delegates to the single `STATUS_COLOR_KEY` map in
 * `format.ts` rather than re-deriving the key via `toLowerCase()` -- that was a third independent
 * copy of the same mapping (tasks.md T172).
 */
export function statusColor(type: StatusEffectType): string {
  return STAT_COLORS[STATUS_COLOR_KEY[type]];
}
