import { Rarity, type StatusEffectType } from "./enums";
import { RARITY, RARITIES_ASC, RARITIES_DESC, statusColorKey } from "./vocabularies";
import { StatColorKey } from "./enums";

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
 * `StatColorKey` is an enum in `./enums.ts` -- keyed by the published lowercase stat key rather
 * than reusing `StatusEffectType`, because this set includes Damage, Heal and Multicast, which are
 * not status effects.
 */
export { StatColorKey };

export const STAT_COLORS: Record<StatColorKey, string> = {
  [StatColorKey.Damage]: "#ef426b",
  [StatColorKey.Burn]: "#ed6b3a",
  [StatColorKey.Poison]: "#7b57a1",
  [StatColorKey.Shock]: "#e7c61c",
  // 2026-10-06 round 7 (tasks.md T154 / FR-041): OVERRIDES the batodex-published `#a47c41`
  // (brown) that H2 cites. The game renders Shield on a silver/steel plate -- pixel-sampling the
  // user's in-game capture gives #a7a8b4 / #a8a9b4 / #a5a9da, and this is that hue family nudged
  // darker so white badge text keeps legible contrast. Six of the seven colours here were
  // cross-checked against an in-game card in round 6; `shield` was the one that wasn't, which is
  // why it is the one that was wrong.
  [StatColorKey.Shield]: "#9aa1b8",
  [StatColorKey.Heal]: "#578ac9",
  [StatColorKey.Multicast]: "#7b93c3",
  // Original choice, not a published value -- see `StatColorKey.Cooldown`.
  [StatColorKey.Cooldown]: "#49b6c8",
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
export { RARITIES_ASC, RARITIES_DESC };

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
  return STAT_COLORS[statusColorKey(type)];
}

/**
 * The second colour tier, for ability-text keywords that name a MECHANIC rather than an output stat
 * (2026-10-07, round 7 WI-007).
 *
 * Needed because a vocabulary limited to the seven `StatColorKey`s leaves a visible minority of
 * cards flat: of 543 ability texts, 318 contain an output-stat term and 225 do not, and those 225
 * say things like "Give adjacent allies **Protect** 1", "Your team has +50 **HP**", "**Evolves** at
 * level 3". An ask that says "all mon's ability text" is not met by colouring 318 of 543.
 *
 * Deliberately ONE colour for the whole tier rather than one per term. These are not quantities the
 * player compares -- they are nouns naming a mechanic -- so giving each its own hue would imply a
 * taxonomy that does not exist and compete with the stat colours, which DO encode meaning. Amber
 * matches the game's own treatment of the trigger label above the text.
 */
export const KEYWORD_MECHANIC_COLOR = "#e0a93c";
