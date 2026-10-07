import { defineVocabulary, keysInOrder, type VocabularyKey, type VocabularyMember } from "./vocabulary";
import type { StatColorKey } from "./statColors";

/**
 * The five closed vocabularies describing a creature (2026-10-07, round 7).
 *
 * One declaration each, carrying label, ordering and colour together — see `vocabulary.ts` for why
 * this shape rather than TypeScript's `enum`, and for the two defects that hand-written
 * restatements of these lists had already caused.
 *
 * Declared here rather than in `types.ts` because these are runtime values, and `types.ts` is
 * imported by every layer as types only. `types.ts` re-exports the unions derived from these, so
 * every existing `import type { Rarity } from "./types"` keeps working untouched.
 */

// ---------------------------------------------------------------------------
// Rarity (WI-005, WI-006)
// ---------------------------------------------------------------------------

interface RarityMember extends VocabularyMember {
  readonly color: string;
}

/**
 * The game's own published colours (research.md H2, cross-checked against an in-game card), not a
 * palette chosen here.
 *
 * `SuperRare`'s label is **"Super Rare" with a space**, which is the PUBLISHED spelling: the
 * extracted batodex database uses it, and `"SuperRare"` was this corpus's own compression. So this
 * restores cited data rather than imposing a preference (research.md R5), and because only the
 * label changed, not one of the 138 stored occurrences was edited.
 */
export const RARITY = defineVocabulary<RarityMember, "Common" | "Uncommon" | "Rare" | "SuperRare" | "Legendary" | "Mythical">({
  Common: { label: "Common", order: 0, color: "#70707a" },
  Uncommon: { label: "Uncommon", order: 1, color: "#4ab500" },
  Rare: { label: "Rare", order: 2, color: "#0084bd" },
  SuperRare: { label: "Super Rare", order: 3, color: "#a040a0" },
  Legendary: { label: "Legendary", order: 4, color: "#d47c00" },
  Mythical: { label: "Mythical", order: 5, color: "#dc2844" },
});

export type Rarity = VocabularyKey<typeof RARITY>;

// ---------------------------------------------------------------------------
// CreatureType (WI-003)
// ---------------------------------------------------------------------------

/**
 * `kind` is the load-bearing field, and it exists because of a real bug.
 *
 * - `element` — an actual creature type.
 * - `wildcard` — `"All"`. Matches EVERY type. Carried by exactly one species (Omnichrome), and
 *   comparing it as though it were an element is what caused round 10's Omnichrome bug, where the
 *   one creature that is every type matched no type filter at all.
 * - `placeholder` — `"Curio"` and `"NULL"`. These name no element, but they are **real published
 *   Type values** attested by two independent sources (see the `CreatureType` note in `types.ts`),
 *   carried by 11 and 4 level-1 species respectively. They stay filterable; only the wildcard is
 *   withheld from filter lists. An earlier draft of this round excluded all three, which would have
 *   made 15 species unreachable by type filter — a regression dressed up as a fix.
 *
 * Note what is deliberately NOT here: a member for "typeless". Eight records (`dragonegg` and
 * `purpleegg` at all four levels) carry `types: []`, which is a legitimate state for a shop item
 * that hatches into a creature rather than being one.
 */
interface CreatureTypeMember extends VocabularyMember {
  readonly color: string;
  readonly kind: "element" | "wildcard" | "placeholder";
}

export const CREATURE_TYPE = defineVocabulary<
  CreatureTypeMember,
  | "Fire" | "Water" | "Electric" | "Toxic" | "Flying" | "Rock" | "Grass" | "Bug"
  | "Steel" | "Dragon" | "Ghost" | "Fighting" | "Curio" | "NULL" | "All"
>({
  Fire: { label: "Fire", order: 0, color: "#e05a2b", kind: "element" },
  Water: { label: "Water", order: 1, color: "#2e86de", kind: "element" },
  Electric: { label: "Electric", order: 2, color: "#d4b106", kind: "element" },
  Toxic: { label: "Toxic", order: 3, color: "#8e44ad", kind: "element" },
  Flying: { label: "Flying", order: 4, color: "#70a1d7", kind: "element" },
  Rock: { label: "Rock", order: 5, color: "#8d6e63", kind: "element" },
  Grass: { label: "Grass", order: 6, color: "#4caf50", kind: "element" },
  Bug: { label: "Bug", order: 7, color: "#8bc34a", kind: "element" },
  Steel: { label: "Steel", order: 8, color: "#90a4ae", kind: "element" },
  Dragon: { label: "Dragon", order: 9, color: "#5c6bc0", kind: "element" },
  Ghost: { label: "Ghost", order: 10, color: "#512da8", kind: "element" },
  Fighting: { label: "Fighting", order: 11, color: "#c0392b", kind: "element" },
  Curio: { label: "Curio", order: 12, color: "#26a69a", kind: "placeholder" },
  NULL: { label: "NULL", order: 13, color: "#37474f", kind: "placeholder" },
  // No single real-world analog; a distinct accent flags it as the special case it is.
  All: { label: "All", order: 14, color: "#d81b60", kind: "wildcard" },
});

export type CreatureType = VocabularyKey<typeof CREATURE_TYPE>;

/** The types a filter UI may offer: everything except the wildcard. */
export const FILTERABLE_CREATURE_TYPES: CreatureType[] = keysInOrder(CREATURE_TYPE).filter(
  (t) => CREATURE_TYPE[t].kind !== "wildcard",
);

/** True when `type` matches every other type. One place, so no call site compares the literal. */
export function isWildcardType(type: CreatureType): boolean {
  return CREATURE_TYPE[type].kind === "wildcard";
}

// ---------------------------------------------------------------------------
// DamageChannel and StatusEffectType (WI-004)
// ---------------------------------------------------------------------------

/**
 * The channel a HIT lands on — not a property of a creature.
 *
 * This replaces `DamageType`, which was one type doing two jobs and is why it looked half-empty
 * (research.md R3): `"Burn"`/`"Poison"`/`"Shock"` are alive at runtime on `TimelineEvent` and in
 * `shield.ts`'s status-vs-shield branch, while on `CreatureRecord` only `"Direct"` ever appeared.
 * The creature-side concept is now `publishedCast.channel`.
 *
 * `"SuddenDeath"` is dropped: it appeared in no record and at no runtime site, and research.md P2
 * retracted the sudden-death claim it was added for.
 */
export const DAMAGE_CHANNEL = defineVocabulary<VocabularyMember, "Direct" | "Burn" | "Poison" | "Shock">({
  Direct: { label: "Direct", order: 0 },
  Burn: { label: "Burn", order: 1 },
  Poison: { label: "Poison", order: 2 },
  Shock: { label: "Shock", order: 3 },
});

export type DamageChannel = VocabularyKey<typeof DAMAGE_CHANNEL>;

/**
 * Statuses a cast applies. Overlaps `DamageChannel` on three members and is NOT the same
 * vocabulary — the ledger required this relationship be stated, and research.md R3a argues it:
 *
 *   `"Direct"` is a channel and never a status (a direct hit was never a status).
 *   `"Shield"` is a status and never a channel (Shield absorbs damage; it never deals any).
 *
 * So `DamageChannel` is exactly "the statuses that tick for damage, plus Direct", and the shared
 * three are a status naming the channel its own ticks land on. Merging them would make the compiler
 * accept `applyShieldReduction(n, "Shield", s)` and a `statusTick` of `"Direct"`, both nonsense the
 * split rejects today. Related by `damageChannelOf` below instead.
 */
interface StatusMember extends VocabularyMember {
  readonly colorKey: StatColorKey;
  /** The channel this status's tick damage lands on; absent when it deals none. */
  readonly channel?: DamageChannel;
}

export const STATUS_EFFECT = defineVocabulary<StatusMember, "Burn" | "Poison" | "Shock" | "Shield">({
  Burn: { label: "Burn", order: 0, colorKey: "burn", channel: "Burn" },
  Poison: { label: "Poison", order: 1, colorKey: "poison", channel: "Poison" },
  Shock: { label: "Shock", order: 2, colorKey: "shock", channel: "Shock" },
  Shield: { label: "Shield", order: 3, colorKey: "shield" },
});

export type StatusEffectType = VocabularyKey<typeof STATUS_EFFECT>;

/** The channel a status's tick damage lands on. `undefined` for Shield, which deals none. */
export function damageChannelOf(status: StatusEffectType): DamageChannel | undefined {
  return STATUS_EFFECT[status].channel;
}

// ---------------------------------------------------------------------------
// AbilityTrigger (WI-001)
// ---------------------------------------------------------------------------

/**
 * One entry per trigger: what the button says, what the trigger means, and whether the engine
 * already fires it.
 *
 * `enginePropagated` is the important field. Anything true here must NOT also get a manual button,
 * or the user would bank a bonus the engine is already computing and double it. It is the single
 * place that distinction is stated.
 *
 * Merged in from `TRIGGER_DEFINITIONS`, which used to be a second map beside the union — the
 * duplication this round removes. `CreatureRecord.abilityTrigger` stays optional rather than gaining
 * a "None" member: 134 records have real ability text and no published trigger, and batodex's own
 * extraction represents that as `"trigger": null`, so "not published" is a real state and inventing
 * a member for it would assert a fact no source supports.
 */
interface TriggerMember extends VocabularyMember {
  /** Button text, e.g. "Use an item". Phrased as the action the player takes. */
  readonly actionLabel: string;
  /** What the trigger means, for the button's tooltip. */
  readonly description: string;
  /** True when `simulate()` already fires this trigger during a battle. */
  readonly enginePropagated: boolean;
}

export const ABILITY_TRIGGER = defineVocabulary<
  TriggerMember,
  | "Ongoing" | "On Cast" | "On Battle Start" | "On Bought" | "On Victory"
  | "On Knocked Out" | "On Knockout" | "On Trinket Gained" | "On Item Used" | "On Battle Lost"
>({
  Ongoing: {
    label: "Ongoing",
    order: 0,
    actionLabel: "Ongoing",
    description: "Always active; the engine applies it for the whole battle.",
    enginePropagated: true,
  },
  "On Cast": {
    label: "On Cast",
    order: 1,
    actionLabel: "Cast",
    description: "Fires every time this creature casts; the engine schedules those casts.",
    enginePropagated: true,
  },
  "On Battle Start": {
    label: "On Battle Start",
    order: 2,
    actionLabel: "Start the battle",
    description: "Fires once as the battle begins.",
    // The resolver handles battle-start grants it has tags for, but several creatures' battle-start
    // text is unmodelled (Mallogre's "for each Trinket that you own" has no trinket-count input).
    // Those carry a manualTrigger tag explicitly; this flag governs only the default.
    enginePropagated: true,
  },
  "On Bought": {
    label: "On Bought",
    order: 3,
    actionLabel: "Buy a monster",
    description: "Fires when you buy a monster in the shop — outside the battle this simulates.",
    enginePropagated: false,
  },
  "On Victory": {
    label: "On Victory",
    order: 4,
    actionLabel: "Win a round",
    description: "Fires after you win a round, so the bonus carries into later battles.",
    enginePropagated: false,
  },
  "On Knocked Out": {
    label: "On Knocked Out",
    order: 5,
    actionLabel: "Get knocked out",
    description: "Fires when THIS creature is knocked out. The engine models no deaths.",
    enginePropagated: false,
  },
  "On Knockout": {
    label: "On Knockout",
    order: 6,
    actionLabel: "Knock out a monster",
    description: "Fires when ANY monster is knocked out. The engine models no deaths.",
    enginePropagated: false,
  },
  "On Trinket Gained": {
    label: "On Trinket Gained",
    order: 7,
    actionLabel: "Gain a trinket",
    description: "Fires when you gain a trinket — outside the battle this simulates.",
    enginePropagated: false,
  },
  "On Item Used": {
    label: "On Item Used",
    order: 8,
    actionLabel: "Use an item",
    description: "Fires when you use an item — outside the battle this simulates.",
    enginePropagated: false,
  },
  "On Battle Lost": {
    label: "On Battle Lost",
    order: 9,
    actionLabel: "Lose a round",
    description: "Fires after you lose a round.",
    enginePropagated: false,
  },
});

export type AbilityTrigger = VocabularyKey<typeof ABILITY_TRIGGER>;
