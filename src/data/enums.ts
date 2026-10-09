/**
 * Every closed vocabulary in the data model, as string enums (2026-10-07, round 7).
 *
 * ## Why enums, after three rounds of literal unions
 *
 * The unions were type-safe at their literals, but they left logic keyed on strings: a value
 * crossing a boundary (a `<select>`, a JSON fixture, a parsed ability text) arrived as a bare string
 * and was cast into the domain, and two spellings of one concept could coexist with nothing to tell
 * them apart. That last one shipped a bug — `"Super Rare"` and `"SuperRare"` were both "valid", so a
 * guidance chip silently vanished and a row summed to 7 of 9.
 *
 * A string enum is **nominal**: `takesRarity("SuperRare")` is a compile error, not a pass. That is
 * the property a union cannot give, and it is the whole reason for this file.
 *
 * ## The flag that was in the way
 *
 * `erasableSyntaxOnly: true` had banned `enum` outright (TS1294). It arrived as a Vite scaffold
 * default in the initial commit and protected a capability with zero consumers here — nothing in
 * this toolchain runs a `.ts` file through a strip-only runtime. Removed, with the reasoning
 * recorded in `tsconfig.app.json`.
 *
 * ## Rules this file follows
 *
 * 1. **String enums with explicit initialisers, always.** Numeric enums are the real footgun —
 *    reverse mappings, arbitrary numbers assignable — and none are used here.
 * 2. **The initialiser is the SERIALIZED value**, so a member's wire form is visible at its
 *    declaration. Where a stored value and a displayed one differ, the display string lives in
 *    `vocabularies.ts` as a `label`; it is never a second enum member.
 * 3. **Member names are identifiers, values are the published spelling.** `OnCast = "On Cast"` —
 *    the space belongs to the data, not to the code.
 */

// ---------------------------------------------------------------------------
// Creature classification
// ---------------------------------------------------------------------------

export enum Rarity {
  Common = "Common",
  Uncommon = "Uncommon",
  Rare = "Rare",
  /**
   * The STORED value stays `"SuperRare"`. The published spelling is "Super Rare" with a space and
   * lives in `RARITY[Rarity.SuperRare].label` — separating the two is what makes the round-6 chip
   * bug unrepresentable rather than merely fixed.
   */
  SuperRare = "SuperRare",
  Legendary = "Legendary",
  Mythical = "Mythical",
}

/**
 * research.md B7: "Fighting" is retained with a confidence flag rather than omitted or silently
 * trusted — it appears in ability text in creator footage per one source, flagged there as
 * unconfirmed by official publication.
 *
 * `Curio` and `NULL` (2026-10-05, tasks.md T043) appear as literal Type-column values for multiple
 * creatures across two independent sources — batomonshowdown.wiki (Goldora: Curio) and batomon.net
 * (Dollhime/Furnadon/Gachapod/Mallogre/Nekoffin/Pawsperity/Rubbin/Shrinell/Vipair: Curio;
 * MissingN./NULL-00/NULL-7F/NULL-FF: NULL) — so they are real members, not typos.
 *
 * `All` is a WILDCARD, not an element: `creatureHasType` treats it as matching every type. It is
 * marked `kind: "wildcard"` in `vocabularies.ts`, and comparing it as though it were an element is
 * what caused round 10's Omnichrome bug.
 */
export enum CreatureType {
  Fire = "Fire",
  Water = "Water",
  Electric = "Electric",
  Toxic = "Toxic",
  Flying = "Flying",
  Rock = "Rock",
  Grass = "Grass",
  Bug = "Bug",
  Steel = "Steel",
  Dragon = "Dragon",
  Ghost = "Ghost",
  Fighting = "Fighting",
  Curio = "Curio",
  NULL = "NULL",
  All = "All",
}

/**
 * The channel a HIT lands on. Not a property of a creature — that distinction is the point.
 *
 * Replaces `DamageType`, which was one type doing two jobs and therefore looked half-empty
 * (research.md R3): `Burn`/`Poison`/`Shock` are alive at runtime on `TimelineEvent` and in
 * `shield.ts`'s status-vs-shield branch, while only `Direct` ever appeared on a record.
 *
 * `"SuddenDeath"` is gone: no record and no runtime site ever produced it, and research.md P2
 * retracted the sudden-death claim it was added for.
 */
export enum DamageChannel {
  Direct = "Direct",
  Burn = "Burn",
  Poison = "Poison",
  Shock = "Shock",
}

/**
 * Statuses a cast applies. Overlaps `DamageChannel` on three members and is deliberately NOT the
 * same vocabulary: `Direct` is a channel that is never a status, `Shield` is a status that never
 * deals damage. Related by `damageChannelOf` rather than merged — a single five-member type would
 * let the compiler accept `applyShieldReduction(n, Shield, s)` (research.md R3a).
 */
export enum StatusEffectType {
  Burn = "Burn",
  Poison = "Poison",
  Shock = "Shock",
  Shield = "Shield",
}

/**
 * When an ability fires. `On Item Used` and `On Knockout` are values batodex's own `trigger` field
 * leaves null, read from ability text instead — Craghorn's "when you use an item" and Cawnushi's
 * "on knockout of any monster". `OnKnockedOut` is about THIS creature dying; `OnKnockout` is about
 * any monster dying. Different events, easily conflated, so both are spelled out.
 */
export enum AbilityTrigger {
  Ongoing = "Ongoing",
  OnCast = "On Cast",
  OnBattleStart = "On Battle Start",
  OnBought = "On Bought",
  OnVictory = "On Victory",
  OnKnockedOut = "On Knocked Out",
  OnKnockout = "On Knockout",
  OnTrinketGained = "On Trinket Gained",
  OnItemUsed = "On Item Used",
  OnBattleLost = "On Battle Lost",
}

/**
 * The pool of creatures a run draws from, chosen before anything else (FR-087).
 *
 * research.md M4 kept this an OPEN union on the grounds that the official notes say "the power level
 * of all regions", which does not commit to there being exactly two. Closed here deliberately: an
 * open union meant `RegionId` accepted any string, so a typo'd region silently matched no creature
 * instead of failing. A third region is a one-line addition, which is a better trade than leaving
 * the type unable to catch a mistake.
 */
export enum RegionId {
  Pantra = "pantra",
  Jinto = "jinto",
}

// ---------------------------------------------------------------------------
// Board geometry
// ---------------------------------------------------------------------------

/** B5: back row = "A" row, front row = "B" row in the wiki's own labeling. */
export enum GridRow {
  Back = "back",
  Front = "front",
}

// ---------------------------------------------------------------------------
// Engine and modifier vocabularies
// ---------------------------------------------------------------------------

/**
 * What a user modifier adds. Every member is "a stat the card can show", so a modifier can CREATE
 * an effect and not only scale one (see `engine/modifiers.ts` for why that rule was retired).
 */
export enum ModifierStat {
  DamageFlatAdd = "damageFlatAdd",
  CooldownFlatAddSeconds = "cooldownFlatAddSeconds",
  CooldownSpeedAdd = "cooldownSpeedAdd",
  BurnAmountAdd = "burnAmountAdd",
  PoisonAmountAdd = "poisonAmountAdd",
  ShockAmountAdd = "shockAmountAdd",
  ShieldAmountAdd = "shieldAmountAdd",
  /** 2026-10-05 round 2 (research.md D3): adds to a creature's `baseMulticast` count. */
  MulticastAdd = "multicastAdd",
  /**
   * 2026-10-07 (round 7 WI-002). Heal was the one output stat with no modifier, which made four
   * species' abilities HALF unexpressible — "gain +15 Damage and +15 Heal permanently" would have
   * derived the damage and silently dropped the heal.
   */
  HealAmountAdd = "healAmountAdd",
}

/**
 * What a modifier is attached to, and therefore what happens to it when the board changes
 * (2026-10-08, user-reported).
 *
 * Craghorn's "When you use an item, **this** gains +20 Damage and Shield" was banked onto the
 * SLOT, so selling the Craghorn and buying something else left the new monster holding Craghorn's
 * forty points. The amounts were right and their owner was wrong: a placement modifier had no way
 * to say whether it described the monster standing there or the position it was standing in.
 *
 * - `Creature` — belongs to the monster. Travels with it when it is dragged, and is discarded when
 *   a DIFFERENT monster takes the slot. Everything a creature's own ability grants, and everything
 *   the user types into the Modifiers overlay (a carry-over bonus is something a monster earned).
 * - `Slot` — belongs to the position. Stays behind when the monster moves away, and transfers to
 *   whatever is placed there next. Nothing writes this yet; the vocabulary exists because trinkets
 *   that read "monsters in the back row" / "the bottom right monster" are slot effects, and the
 *   distinction has to be stateable before one of them can be modelled.
 *
 * Absent means `Creature`, which is the safe default: a bonus of unknown provenance following the
 * monster that earned it is the behaviour every existing source wants.
 */
export enum ModifierScope {
  Creature = "creature",
  Slot = "slot",
}

/**
 * Who a USED item's effect lands on (2026-10-08, T046).
 *
 * Items are the first corpus entity whose effects are not uniformly team-wide, which is why they
 * need a vocabulary a trinket's `effectTags` did not: Feast gives "your monsters" +5 Damage, Pom
 * Berry gives "the bottom right monster" +8, and Cake gives "2 random monsters" +5 each. Those are
 * three genuinely different recipient rules and no single shape covers them.
 *
 * Deliberately NOT `TargetSelector`, which creatures use. That selector is relative to a SOURCE
 * creature ("adjacent", "behind", "in front"), and an item has no source on the board — it is used
 * from the shop screen. Every item target here is absolute: the whole team, one named slot, or
 * whoever the user says.
 */
export enum ItemTargetKind {
  /** "Give your monsters ..." — every placed monster, optionally narrowed by a filter. */
  Team = "team",
  /** "Give the bottom right monster ..." — one slot, named by the item itself. */
  FixedSlot = "fixedSlot",
  /**
   * "Give 2 random monsters ..." — the game rolls, the USER picks.
   *
   * Rolling here would be useless for the same reason `AffectedCreaturePicker` gives: the player
   * is reconciling a run that has already rolled, and a second independent roll produces a board
   * they cannot match against their screen.
   */
  Chosen = "chosen",
}

/** The event names `onEvent` tags fire on. Distinct spelling from `AbilityTrigger` by design:
 * these are engine-internal labels, while `AbilityTrigger` carries the published wording. */
export enum EventLabel {
  OnCast = "OnCast",
  OnBattleStart = "OnBattleStart",
  OnVictory = "OnVictory",
  OnKnockout = "OnKnockout",
}

/** What a timeline entry records. */
export enum TimelineEventKind {
  Attack = "attack",
  Trigger = "trigger",
  StatusTick = "statusTick",
  ShockProc = "shockProc",
  OngoingChange = "ongoingChange",
}

/**
 * The stat an `EffectDescriptor.statChange` moves.
 *
 * `CooldownFlatSeconds` is deliberately absolute, not a percentage: Saberhorn's "+8 seconds to this
 * monster's Cooldown" is a quantity, and converting it would make the cost depend on the base
 * cooldown, which is not what the ability says.
 */
export enum StatChangeStat {
  CooldownSpeed = "cooldownSpeed",
  Damage = "damage",
  Multicast = "multicast",
  CooldownFlatSeconds = "cooldownFlatSeconds",
  /**
   * 2026-10-07. Added because its absence was a hard ceiling on ability derivation, not a
   * nice-to-have: Heal is a published output stat with its own colour and card line, but it had no
   * `EffectDescriptor` slot, so "Adjacent Water allies gain +25 Heal permanently" (Aster) had
   * nowhere to be written however the text was matched. Lumijel, Emperooze and Dewlotl were blocked
   * identically. Refusing to derive them was correct while this was missing; now they can be.
   */
  Heal = "heal",
}

/** What a `statMultiplier` tag scales. */
export enum MultiplierScope {
  Damage = "damage",
  Status = "status",
  All = "all",
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

/**
 * The published lowercase stat keys the game's own colour table uses. Keyed separately from
 * `StatusEffectType` because this set includes `Damage`, `Heal` and `Multicast`, which are not
 * status effects.
 */
export enum StatColorKey {
  Damage = "damage",
  Burn = "burn",
  Poison = "poison",
  Shock = "shock",
  Shield = "shield",
  Heal = "heal",
  Multicast = "multicast",
  /**
   * 2026-10-07. The one key here that is NOT a published game value.
   *
   * The other seven are the game's own extracted colours and must never be adjusted to taste. This
   * one exists because Cooldown Speed had no entry at all, so the trigger-button preview and the
   * ability-text highlighter were borrowing `Multicast`'s blue -- rendering Ninflora's "+10%
   * Cooldown Speed" in a colour that means a different stat. A distinct hue is less wrong than a
   * borrowed one; it is flagged as an original choice so a future published value replaces it
   * rather than being argued with.
   */
  Cooldown = "cooldown",
}

// ---------------------------------------------------------------------------
// Union discriminants
// ---------------------------------------------------------------------------

/**
 * Which creature a `TargetSelector` picks out (2026-10-07, round 7).
 *
 * These are discriminants of a closed union, so a typo was ALREADY a compile error -- that is why
 * they were the last string vocabulary converted rather than the first. The value they gain is
 * rename-safety and one declaration site: `kind` values are stored in `creatures.ts`, so renaming a
 * selector previously meant a find-and-replace across 596 records with nothing checking it had
 * found them all.
 *
 * Board geometry lives in `engine/grid.ts`; these only name the relationships.
 */
/**
 * Why a `CreatureType` member exists, which is NOT the same question as what it is.
 *
 * `Wildcard` is the load-bearing one: `All` matches EVERY type, and comparing it as though it were
 * an element is what caused round 10's Omnichrome bug. `Placeholder` marks `Curio` and `NULL` --
 * real published values that name no element, and which stay filterable; only the wildcard is
 * withheld from filter lists.
 */
export enum TypeKind {
  Element = "element",
  Wildcard = "wildcard",
  Placeholder = "placeholder",
}

/** The two affected-species sets a trainer ability can own (FR-087/FR-088). */
export enum AffectedSpeciesKind {
  Painted = "painted",
  Smuggled = "smuggled",
}

export enum TargetKind {
  Self = "self",
  Adjacent = "adjacent",
  Row = "row",
  Behind = "behind",
  Above = "above",
  InFront = "inFront",
  AllAllies = "allAllies",
}

/**
 * Which mechanism an `AbilityTag` describes.
 *
 * Nineteen members, one per modelled ability family (research.md L1). `RESOLVED_TAG_KINDS` in
 * `engine/effects.ts` is the subset the engine actually acts on, and it is deliberately NOT all of
 * them -- `ManualTrigger` in particular must stay outside it, or the coverage counter would claim
 * abilities the engine does not compute.
 */
export enum AbilityTagKind {
  Ongoing = "ongoing",
  Trigger = "trigger",
  OnEvent = "onEvent",
  CooldownSpeedModifier = "cooldownSpeedModifier",
  StatusGrant = "statusGrant",
  BattleStartStatusFromAllies = "battleStartStatusFromAllies",
  ChargeOnAllyStatus = "chargeOnAllyStatus",
  CooldownSpeedOnAllyCast = "cooldownSpeedOnAllyCast",
  StatFromCount = "statFromCount",
  BuffOnCast = "buffOnCast",
  TriggerOnAllyCast = "triggerOnAllyCast",
  StatMultiplier = "statMultiplier",
  StatFromTargetStatus = "statFromTargetStatus",
  TriggerOnAllyTrigger = "triggerOnAllyTrigger",
  ManualTrigger = "manualTrigger",
  GainOnAllyStatus = "gainOnAllyStatus",
  StatFromUniqueTypes = "statFromUniqueTypes",
  KnockoutAlliesOnBattleStart = "knockoutAlliesOnBattleStart",
  ReviveKnockedOutAllies = "reviveKnockedOutAllies",
  StatFromStat = "statFromStat",
}
