import { RegionId } from "./enums";
import { Species, TrainerId, TrinketId } from "./ids";
import { AbilityTrigger, CreatureType, DamageChannel, Rarity, StatColorKey, StatusEffectType, TypeKind } from "./enums";

/**
 * Per-member data for the closed vocabularies (2026-10-07, round 7).
 *
 * The enums in `./enums.ts` are the IDENTITY of each member; these tables are everything else about
 * it — its rendered label, its canonical ordering, its colour. Keyed by enum member, so
 * `Record<Rarity, …>` makes omitting a member a compile error rather than a dropped chip at
 * runtime. That was the round-6 defect: a colour table, an ordering array and a shape map were
 * three parallel structures keyed by the same union, and one of them misspelled a tier.
 *
 * The split that matters: **the enum member is for storing and comparing; `label` is for
 * rendering.** A raw stored value reaching the screen is a defect — `"SuperRare"` did, which is
 * what WI-006 was about.
 */

export interface VocabularyMember {
  /** The ONLY string the UI may render. Distinct from the member's stored value. */
  readonly label: string;
  /** Canonical ordering, ascending. Ordered lists derive from this; none are hand-written. */
  readonly order: number;
}

/** A vocabulary's members in `order`, ascending. Derived, so no hand-written list can disagree. */
function membersInOrder<K extends string, M extends VocabularyMember>(
  table: Record<K, M>,
  all: K[],
): K[] {
  return [...all].sort((a, b) => table[a].order - table[b].order);
}

// ---------------------------------------------------------------------------
// Rarity
// ---------------------------------------------------------------------------

interface RarityMember extends VocabularyMember {
  readonly color: string;
}

/**
 * The game's own published colours (research.md H2, cross-checked against an in-game card), not a
 * palette chosen here.
 *
 * `Rarity.SuperRare`'s label is **"Super Rare" with a space**, which is the PUBLISHED spelling: the
 * extracted batodex database uses it and `"SuperRare"` is this corpus's own compression. So this
 * restores cited data rather than imposing a preference (research.md R5).
 */
export const RARITY: Readonly<Record<Rarity, RarityMember>> = Object.freeze({
  [Rarity.Common]: { label: "Common", order: 0, color: "#70707a" },
  [Rarity.Uncommon]: { label: "Uncommon", order: 1, color: "#4ab500" },
  [Rarity.Rare]: { label: "Rare", order: 2, color: "#0084bd" },
  [Rarity.SuperRare]: { label: "Super Rare", order: 3, color: "#a040a0" },
  [Rarity.Legendary]: { label: "Legendary", order: 4, color: "#d47c00" },
  [Rarity.Mythical]: { label: "Mythical", order: 5, color: "#dc2844" },
});

export const RARITIES_ASC: Rarity[] = membersInOrder(RARITY, Object.values(Rarity));
export const RARITIES_DESC: Rarity[] = [...RARITIES_ASC].reverse();

// ---------------------------------------------------------------------------
// CreatureType
// ---------------------------------------------------------------------------

/**
 * `kind` is the load-bearing field, and it exists because of a real bug.
 *
 * - `element` — an actual creature type.
 * - `wildcard` — `All`. Matches EVERY type, carried by exactly one species (Omnichrome). Comparing
 *   it as though it were an element is what caused round 10's Omnichrome bug, where the one
 *   creature that is every type matched no type filter at all.
 * - `placeholder` — `Curio` and `NULL`. They name no element but are real published Type values
 *   attested by two independent sources, carried by 11 and 4 level-1 species. **They stay
 *   filterable**; only the wildcard is withheld from filter lists. An earlier draft of this round
 *   excluded all three, which would have made 15 species unreachable by type filter.
 *
 * Note what is deliberately absent: a member for "typeless". Eight records (`dragonegg` and
 * `purpleegg` at all four levels) carry `types: []`, a legitimate state for a shop item that
 * hatches into a creature rather than being one.
 */
interface CreatureTypeMember extends VocabularyMember {
  readonly color: string;
  readonly kind: TypeKind;
}

/** Colours are an original design choice for this app's dark background — no official palette is
 * published to cite (unlike the rarity and stat colours, which are the game's own). */
export const CREATURE_TYPE: Readonly<Record<CreatureType, CreatureTypeMember>> = Object.freeze({
  [CreatureType.Fire]: { label: "Fire", order: 0, color: "#e05a2b", kind: TypeKind.Element },
  [CreatureType.Water]: { label: "Water", order: 1, color: "#2e86de", kind: TypeKind.Element },
  [CreatureType.Electric]: { label: "Electric", order: 2, color: "#d4b106", kind: TypeKind.Element },
  [CreatureType.Toxic]: { label: "Toxic", order: 3, color: "#8e44ad", kind: TypeKind.Element },
  [CreatureType.Flying]: { label: "Flying", order: 4, color: "#70a1d7", kind: TypeKind.Element },
  [CreatureType.Rock]: { label: "Rock", order: 5, color: "#8d6e63", kind: TypeKind.Element },
  [CreatureType.Grass]: { label: "Grass", order: 6, color: "#4caf50", kind: TypeKind.Element },
  [CreatureType.Bug]: { label: "Bug", order: 7, color: "#8bc34a", kind: TypeKind.Element },
  [CreatureType.Steel]: { label: "Steel", order: 8, color: "#90a4ae", kind: TypeKind.Element },
  [CreatureType.Dragon]: { label: "Dragon", order: 9, color: "#5c6bc0", kind: TypeKind.Element },
  [CreatureType.Ghost]: { label: "Ghost", order: 10, color: "#512da8", kind: TypeKind.Element },
  [CreatureType.Fighting]: { label: "Fighting", order: 11, color: "#c0392b", kind: TypeKind.Element },
  [CreatureType.Curio]: { label: "Curio", order: 12, color: "#26a69a", kind: TypeKind.Placeholder },
  [CreatureType.NULL]: { label: "NULL", order: 13, color: "#37474f", kind: TypeKind.Placeholder },
  // No single real-world analog; a distinct accent flags it as the special case it is.
  [CreatureType.All]: { label: "All", order: 14, color: "#d81b60", kind: TypeKind.Wildcard },
});

export const CREATURE_TYPES_ASC: CreatureType[] = membersInOrder(
  CREATURE_TYPE,
  Object.values(CreatureType),
);

/** The types a filter UI may offer: everything except the wildcard. */
export const FILTERABLE_CREATURE_TYPES: CreatureType[] = CREATURE_TYPES_ASC.filter(
  (t) => CREATURE_TYPE[t].kind !== TypeKind.Wildcard,
);

/**
 * The actual elements: no wildcard, and no `Curio`/`NULL` placeholders.
 *
 * Narrower than `FILTERABLE_CREATURE_TYPES` because a filter may usefully offer "show me the NULL
 * ones", while a prose matcher may not: "NULL" and "Curio" are this corpus's words for absent or
 * unclassified data, and `Element` is the only `kind` whose label is a word the game writes into
 * ability text meaning a type.
 */
export const ELEMENT_CREATURE_TYPES: CreatureType[] = CREATURE_TYPES_ASC.filter(
  (t) => CREATURE_TYPE[t].kind === TypeKind.Element,
);

/** True when `type` matches every other type. One place, so no call site compares a literal. */
export function isWildcardType(type: CreatureType): boolean {
  return CREATURE_TYPE[type].kind === TypeKind.Wildcard;
}

// ---------------------------------------------------------------------------
// DamageChannel and StatusEffectType
// ---------------------------------------------------------------------------

export const DAMAGE_CHANNEL: Readonly<Record<DamageChannel, VocabularyMember>> = Object.freeze({
  [DamageChannel.Direct]: { label: "Direct", order: 0 },
  [DamageChannel.Burn]: { label: "Burn", order: 1 },
  [DamageChannel.Poison]: { label: "Poison", order: 2 },
  [DamageChannel.Shock]: { label: "Shock", order: 3 },
});

interface StatusMember extends VocabularyMember {
  readonly colorKey: StatColorKey;
  /** The channel this status's tick damage lands on; absent when it deals none. */
  readonly channel?: DamageChannel;
}

export const STATUS_EFFECT: Readonly<Record<StatusEffectType, StatusMember>> = Object.freeze({
  [StatusEffectType.Burn]: {
    label: "Burn",
    order: 0,
    colorKey: StatColorKey.Burn,
    channel: DamageChannel.Burn,
  },
  [StatusEffectType.Poison]: {
    label: "Poison",
    order: 1,
    colorKey: StatColorKey.Poison,
    channel: DamageChannel.Poison,
  },
  [StatusEffectType.Shock]: {
    label: "Shock",
    order: 2,
    colorKey: StatColorKey.Shock,
    channel: DamageChannel.Shock,
  },
  // No `channel`: Shield ABSORBS damage, it never deals any. That asymmetry is why this and
  // `DamageChannel` stay two vocabularies rather than one five-member type.
  [StatusEffectType.Shield]: { label: "Shield", order: 3, colorKey: StatColorKey.Shield },
});

export const STATUS_EFFECTS_ASC: StatusEffectType[] = membersInOrder(
  STATUS_EFFECT,
  Object.values(StatusEffectType),
);

/** The channel a status's tick damage lands on. `undefined` for Shield, which deals none. */
export function damageChannelOf(status: StatusEffectType): DamageChannel | undefined {
  return STATUS_EFFECT[status].channel;
}

/** A status's stat colour key. The single mapping; `format.ts` re-exports it for compatibility. */
export function statusColorKey(status: StatusEffectType): StatColorKey {
  return STATUS_EFFECT[status].colorKey;
}

// ---------------------------------------------------------------------------
// AbilityTrigger
// ---------------------------------------------------------------------------

/**
 * One entry per trigger: what the button says, what the trigger means, and whether the engine
 * already fires it.
 *
 * `enginePropagated` is the important field. Anything true here must NOT also get a manual button,
 * or the user would bank a bonus the engine is already computing and double it. It is the single
 * place that distinction is stated, and `deriveTags.ts` reads it to refuse six real species.
 *
 * Absorbed from `TRIGGER_DEFINITIONS`, which used to be a second map keyed by the same vocabulary.
 */
interface TriggerMember extends VocabularyMember {
  /** Button text, e.g. "Use an item". Phrased as the action the player takes. */
  readonly actionLabel: string;
  /** What the trigger means, for the button's tooltip. */
  readonly description: string;
  /** True when `simulate()` already fires this trigger during a battle. */
  readonly enginePropagated: boolean;
}

export const ABILITY_TRIGGER: Readonly<Record<AbilityTrigger, TriggerMember>> = Object.freeze({
  [AbilityTrigger.Ongoing]: {
    label: "Ongoing",
    order: 0,
    actionLabel: "Ongoing",
    description: "Always active; the engine applies it for the whole battle.",
    enginePropagated: true,
  },
  [AbilityTrigger.OnCast]: {
    label: "On Cast",
    order: 1,
    actionLabel: "Cast",
    description: "Fires every time this creature casts; the engine schedules those casts.",
    enginePropagated: true,
  },
  [AbilityTrigger.OnBattleStart]: {
    label: "On Battle Start",
    order: 2,
    actionLabel: "Start the battle",
    description: "Fires once as the battle begins.",
    // The resolver handles battle-start grants it has tags for, but several creatures' battle-start
    // text is unmodelled (Mallogre's "for each Trinket that you own" has no trinket-count input).
    // Those carry a manualTrigger tag explicitly; this flag governs only the default.
    enginePropagated: true,
  },
  [AbilityTrigger.OnBought]: {
    label: "On Bought",
    order: 3,
    actionLabel: "Buy a monster",
    description: "Fires when you buy a monster in the shop — outside the battle this simulates.",
    enginePropagated: false,
  },
  [AbilityTrigger.OnVictory]: {
    label: "On Victory",
    order: 4,
    actionLabel: "Win a round",
    description: "Fires after you win a round, so the bonus carries into later battles.",
    enginePropagated: false,
  },
  [AbilityTrigger.OnKnockedOut]: {
    label: "On Knocked Out",
    order: 5,
    actionLabel: "Get knocked out",
    description: "Fires when THIS creature is knocked out. The engine models no deaths.",
    enginePropagated: false,
  },
  [AbilityTrigger.OnKnockout]: {
    label: "On Knockout",
    order: 6,
    actionLabel: "Knock out a monster",
    description: "Fires when ANY monster is knocked out. The engine models no deaths.",
    enginePropagated: false,
  },
  [AbilityTrigger.OnTrinketGained]: {
    label: "On Trinket Gained",
    order: 7,
    actionLabel: "Gain a trinket",
    description: "Fires when you gain a trinket — outside the battle this simulates.",
    enginePropagated: false,
  },
  [AbilityTrigger.OnItemUsed]: {
    label: "On Item Used",
    order: 8,
    actionLabel: "Use an item",
    description: "Fires when you use an item — outside the battle this simulates.",
    enginePropagated: false,
  },
  [AbilityTrigger.OnBattleLost]: {
    label: "On Battle Lost",
    order: 9,
    actionLabel: "Lose a round",
    description: "Fires after you lose a round.",
    enginePropagated: false,
  },
});

export const ABILITY_TRIGGERS: AbilityTrigger[] = membersInOrder(
  ABILITY_TRIGGER,
  Object.values(AbilityTrigger),
);

// ---------------------------------------------------------------------------
// Boundary parsing — the only place a raw string becomes a vocabulary member
// ---------------------------------------------------------------------------

/**
 * "Parse, don't validate": a string from outside the app (a `<select>` value, a URL parameter, the
 * batodex JSON fixture) becomes a domain value exactly once, here, and the interior never sees a
 * string again. Returns `undefined` rather than throwing so a UI can treat "no filter" and "bad
 * input" the same way, which is what every current call site wants.
 */
function parserFor<E extends Record<string, string>>(e: E) {
  const values = new Set<string>(Object.values(e));
  return (raw: string | null | undefined): E[keyof E] | undefined =>
    raw !== null && raw !== undefined && values.has(raw) ? (raw as E[keyof E]) : undefined;
}

export const parseRarity = parserFor(Rarity);
export const parseCreatureType = parserFor(CreatureType);
export const parseRegionId = parserFor(RegionId);
export const parseAbilityTrigger = parserFor(AbilityTrigger);
export const parseStatusEffectType = parserFor(StatusEffectType);

/*
 * Id parsers. These matter more than the vocabulary ones: an id arrives from a `<select>`, a URL or
 * a build code, and before `Species`/`TrainerId`/`TrinketId` existed a typo'd id simply matched no
 * record -- the UI showed an empty slot instead of failing.
 */
export const parseSpecies = parserFor(Species);
export const parseTrainerId = parserFor(TrainerId);
export const parseTrinketId = parserFor(TrinketId);
