/**
 * The one way a closed vocabulary is declared (2026-10-07, round 7 WI-001/003/004/005).
 *
 * ## Why this exists, given the unions were already closed
 *
 * The round's asks read "rarity should be an Enum", "Types need to be an Enum", and so on. All of
 * those unions were *already* closed string-literal unions, and Constitution Principle II already
 * requires that — so taken literally the asks were no-ops.
 *
 * What a literal union cannot do is the actual problem, and this project had shipped two
 * user-visible defects from it:
 *
 * 1. **No runtime value list.** The union is erased at compile time, so every site needing to
 *    *iterate* a vocabulary hand-wrote an array. Round 7's T172 found the rarity ordering declared
 *    three times with inconsistent order between the copies.
 * 2. **No label distinct from the stored key.** The stored value doubled as the rendered label,
 *    which is why `"SuperRare"` reached the screen. `statColors.ts` called this "the deliberate
 *    spelling bridge" — a comment where a mechanism belonged.
 * 3. **No attachment point for per-member data.** Colour, order and label lived in separate
 *    structures keyed by the same union, each a separate chance to miss a member. One did:
 *    `PAINTER_RARITY_SHAPE` was keyed `"Super Rare"` against a corpus spelling `"SuperRare"`, so a
 *    guidance chip silently vanished and the row summed to 7 of 9.
 *
 * ## Why not TypeScript's `enum`
 *
 * Four reasons, in order of cost. (1) `enum` members are not assignable from their string literals,
 * so all 596 corpus records would need `Rarity.SuperRare` rather than `"SuperRare"` — and
 * `__tests__/fixtures/batodex-monsters.json` cannot express an enum member *at all*. That fixture is
 * cited source data (Principle IV), so a construct that cannot represent it is disqualified on that
 * alone. (2) `enum` is nominal, while this corpus round-trips structurally through build codes and
 * the vendored extraction. (3) It emits runtime code and fights type-only builds; `const enum` is
 * worse, inlining with no runtime object — the one thing actually needed here. (4) It would not
 * deliver any of the three capabilities above, so the side-tables would remain.
 *
 * This is the enum-with-fields pattern from Java/C# (`enum Rarity { SUPER_RARE("Super Rare", 3) }`)
 * reached by the idiom TypeScript supports: keep the cheap comparable string key, attach the
 * behaviour to it in one place. The published source agrees — batodex stores a rarity as
 * `{ "label": "Common", "color": "#70707a" }`, which is this shape already.
 *
 * ## The rule this establishes
 *
 * **The key is for storing and comparing. The `label` is for rendering. A raw key reaching the
 * screen is a defect.** Stored keys are deliberately unchanged by all of this, which is what makes
 * "Super Rare" a zero-churn change: not one corpus record was edited for it.
 */

/** Every vocabulary member carries at least these two. */
export interface VocabularyMember {
  /** The ONLY string the UI may render. Distinct from the key, which is the stored value. */
  readonly label: string;
  /** Canonical ordering, ascending. Sort keys and ordered lists derive from this. */
  readonly order: number;
}

/** The literal union a registry defines, i.e. its keys. */
export type VocabularyKey<T> = keyof T & string;

/**
 * Declares a vocabulary. A typed identity function plus `Object.freeze`, and nothing else —
 * deliberately no plugin registry, no inheritance, no runtime validation. It has five concrete call
 * sites (`Rarity`, `CreatureType`, `DamageChannel`, `StatusEffectType`, `AbilityTrigger`), which is
 * what clears Principle VI's "at least two concrete cases" bar.
 *
 * The `Record<K, M>` parameter is what makes omitting a member's `label` or `order` a compile error
 * rather than a dropped chip at runtime.
 */
export function defineVocabulary<M extends VocabularyMember, K extends string>(
  members: Record<K, M>,
): Readonly<Record<K, M>> {
  return Object.freeze(members);
}

/** A vocabulary's keys in `order`, ascending. Derived, so no hand-written list can disagree. */
export function keysInOrder<M extends VocabularyMember, K extends string>(
  registry: Readonly<Record<K, M>>,
): K[] {
  return (Object.keys(registry) as K[]).sort((a, b) => registry[a].order - registry[b].order);
}

/** `registry[key].label`, as a function so call sites read as a formatter rather than a lookup. */
export function labelOf<M extends VocabularyMember, K extends string>(
  registry: Readonly<Record<K, M>>,
  key: K,
): string {
  return registry[key].label;
}
