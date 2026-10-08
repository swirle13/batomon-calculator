import type { CreatureType } from "./types";
import { CREATURE_TYPE, CREATURE_TYPES_ASC } from "./vocabularies";

/**
 * Canonical `CreatureType` -> color mapping (2026-10-05 round 3, data-model.md's "Canonical
 * `CreatureType` color mapping" amendment).
 *
 * This is the single source of truth for every place a creature type is rendered as a color —
 * card backgrounds (`GridPicker`, `CreatureSearchModal`) and type tag chips (`TypeTag`,
 * `PlacedCreatureDetails`, `CorpusBrowser`) all import from here rather than defining their own
 * per-type color. This directly fixes a defect observed in an external reference UI
 * (research.md E2.4): its card backgrounds and its type tag chips used two different color
 * treatments for the same type.
 *
 * Colors are chosen for readability against this app's dark background (src/index.css
 * `prefers-color-scheme: dark`), not lifted from any external source — there is no official
 * palette to cite here, so these are an original design choice, not a corpus fact.
 */
/**
 * DERIVED from the `CREATURE_TYPE` registry (2026-10-07, round 7), which is now the single place a
 * type's colour, label, order and `kind` are declared together. The name and every call site are
 * unchanged; a new type can no longer be added to the union without a colour.
 */
export const TYPE_COLORS: Record<CreatureType, string> = Object.fromEntries(
  CREATURE_TYPES_ASC.map((t) => [t, CREATURE_TYPE[t].color]),
) as Record<CreatureType, string>;

export function typeColor(type: CreatureType): string {
  return TYPE_COLORS[type];
}

/**
 * CSS `background` value for a creature's card: a single color for a mono-typed creature, or a
 * left/right split gradient for a dual-typed one (data-model.md: "each type stays individually
 * identifiable" — never blended into a third color). Falls back to a neutral gray if `types` is
 * empty (unconfirmed type data).
 */
export function typeBackground(types: CreatureType[]): string {
  if (types.length === 0) return "#444857";
  if (types.length === 1) return typeColor(types[0]!);
  const [first, second] = types;
  return `linear-gradient(to right, ${typeColor(first!)} 0%, ${typeColor(first!)} 50%, ${typeColor(second!)} 50%, ${typeColor(second!)} 100%)`;
}
