/**
 * Shared data-model types for the Batomon Showdown DPS & Status Calculator.
 *
 * Source of truth: specs/001-batomon-dps-calculator/data-model.md
 * These types are implemented exactly as specified there (Constitution Principle II —
 * strict mode, closed discriminated unions, no bare strings for closed vocabularies).
 */

// ---------------------------------------------------------------------------
// Shared primitive types
// ---------------------------------------------------------------------------

/**
 * The closed vocabularies are STRING ENUMS, declared once in `./enums.ts` (2026-10-07, round 7).
 *
 * Imported as VALUES and re-exported, which serves both roles: every existing
 * `import type { Rarity } from "./types"` keeps working, this file can use them in type positions
 * below, and new code can reach for `Rarity.SuperRare`.
 *
 * The enums are **nominal** — a bare `"SuperRare"` is no longer assignable — which is the property
 * three rounds of literal unions could not provide and the whole reason the representation changed.
 * Per-member data (label, ordering, colour) lives in `./vocabularies.ts`.
 */
/*
 * Imported for this file's own type positions AND re-exported for consumers. Both are needed: a
 * bare `export … from` does not bring the names into local scope.
 */
import { AbilityTrigger, CreatureType, DamageChannel, EventLabel, GridRow, ModifierStat, MultiplierScope, RegionId, StatusEffectType, TimelineEventKind } from "./enums";
import { Rarity, StatChangeStat } from "./enums";

// Re-exports the LOCAL bindings above rather than a second `export … from "./enums"`, which would
// be a duplicate declaration of each name.
export {
  AbilityTrigger,
  CreatureType,
  DamageChannel,
  EventLabel,
  GridRow,
  ModifierStat,
  MultiplierScope,
  Rarity,
  RegionId,
  StatChangeStat,
  StatusEffectType,
  TimelineEventKind,
};
export { StatColorKey } from "./enums";

/*
 * `CreatureType`'s provenance notes, which the registry's members now carry a `kind` for:
 *
 * research.md B7: "Fighting" is retained with a confidence flag rather than omitted or silently
 * trusted — it appears in ability text in creator footage per one source, but is explicitly flagged
 * there as unconfirmed by official publication.
 *
 * "Curio" and "NULL" added 2026-10-05 during the full-corpus widening pass (tasks.md T043): both
 * appear as literal Type-column values for multiple creatures across two independent sources —
 * https://batomonshowdown.wiki/batomon/ (Goldora: Curio) and https://batomon.net/batomon/
 * (Dollhime/Furnadon/Gachapod/Mallogre/Nekoffin/Pawsperity/Rubbin/Shrinell/Vipair: Curio;
 * MissingN./NULL-00/NULL-7F/NULL-FF: NULL) — so they are real closed-vocabulary members, not typos,
 * per Constitution Principle II. They are marked `placeholder` rather than `element` and remain
 * filterable; only the `wildcard` ("All") is withheld from filter lists.
 */

export interface SourceRef {
  url: string;
  title: string;
  retrievedAt: string; // ISO date, e.g. "2026-10-05"
}

export interface FieldConflict {
  /** Dot-path into the record, e.g. "baseDamage" */
  field: string;
  values: { value: unknown; sourceRefs: SourceRef[] }[];
  /** Which value the corpus adopted and why, if any; absent = unresolved */
  resolution?: string;
}

export interface Provenance {
  sourceRefs: SourceRef[];
  /** e.g. "1.2.0", "Balance 24", "Build 25037381 Balance 14" — whatever the source states */
  patch: string;
  conflicts?: FieldConflict[];
  /**
   * Field names published nowhere with confidence; shown as "unknown" in the UI. Moved here
   * from `CreatureRecord` (2026-10-05 round 2) so `TrainerRecord`/`TrinketRecord`/`ItemRecord`
   * can flag a low-confidence field the same way creatures already do — see data-model.md's
   * "`unconfirmedFields` promoted..." amendment.
   */
  unconfirmedFields?: string[];
}

// ---------------------------------------------------------------------------
// Structured, closed-vocabulary ability hints
// ---------------------------------------------------------------------------

/**
 * A region: the pool of creatures a run draws from, chosen before anything else (T229/FR-087).
 * Open union, not a strict pair — the official notes say "the power level of **all regions**",
 * which does not commit to there being exactly two (research.md M4).
 */

/** T250/FR-100. The closed set of ability triggers (research.md N2). */
/*
 * `AbilityTrigger` now derives from the `ABILITY_TRIGGER` registry, which also absorbed
 * `TRIGGER_DEFINITIONS`' action labels, descriptions and `enginePropagated` flags — those were a
 * second map keyed by this union, i.e. the duplication round 7 removes.
 *
 * Two of its members, `On Item Used` and `On Knockout`, are values batodex's own `trigger` field
 * leaves null and had to be read from ability text instead. Both describe real, repeatable triggers
 * — Craghorn's "when you use an item" and Cawnushi's "on knockout of any monster" — and their
 * absence is why those creatures had no trigger at all. `On Knocked Out` is about THIS creature
 * dying; `On Knockout` is about any monster dying. Different events, easily conflated, so both are
 * spelled out.
 */

/**
 * Filters a selector can additionally apply. Round 11 (T225): real ability text needs all three,
 * and tagging creatures before these existed would have meant either skipping them or encoding
 * them wrongly:
 *   rarity  — "This and Common allies gain +10 Damage permanently." (Brawlmantis)
 *   level   — "+160 Damage for each ally of level 3 or above." (Orcana)
 */
export interface SelectorFilters {
  typeFilter?: CreatureType;
  rarityFilter?: Rarity;
  /** Matches allies at or above this level. */
  minLevelFilter?: number;
}

export type TargetSelector =
  | { kind: "self" }
  | ({ kind: "adjacent"; sameTeamOnly?: boolean } & SelectorFilters)
  | ({ kind: "row"; sameTeamOnly?: boolean } & SelectorFilters)
  | { kind: "behind" }
  | { kind: "above" }
  /**
   * The ally directly IN FRONT — the opposite direction to `behind`. Distinct because the board is
   * two rows and the relationship is not symmetric: Saberhorn's "give the ally in front +1
   * Multicast" reads from the back row forward, where `behind`/`above` read from the front row back.
   */
  | { kind: "inFront" }
  | ({ kind: "allAllies" } & SelectorFilters);

export interface EffectDescriptor {
  /**
   * `cooldownFlatSeconds` added 2026-10-06 (T227a) for Saberhorn's "+8 seconds to this monster's
   * Cooldown". Deliberately NOT expressed as a `cooldownSpeed` percentage: "+8 seconds" is an
   * absolute quantity, and converting it would make the cost depend on the base cooldown, which is
   * not what the ability says.
   */
  statChange?: {
    stat: StatChangeStat;
    amount: number;
  };
  statusGrant?: { type: StatusEffectType; amount: number };
  extraOngoingApplications?: number;
}

/**
 * Structured hints extracted from abilityText so the engine does not parse free text at
 * runtime. Each tag encodes one part of the ability's cited description.
 */
export type AbilityTag =
  | { kind: "ongoing"; target: TargetSelector; effect: EffectDescriptor }
  | { kind: "trigger"; target: TargetSelector; event: EventLabel }
  | { kind: "onEvent"; event: EventLabel; effect: EffectDescriptor }
  | { kind: "cooldownSpeedModifier"; target: TargetSelector; amount: number }
  | { kind: "statusGrant"; target: TargetSelector; status: StatusEffectType; amount: number }
  /**
   * 2026-10-06 round 9 (FR-073). Three kinds the effect resolver acts on.
   *
   * "On Battle Start: gain <status> equal to <multiplier>x the total <status> of your allies."
   * Reads allies' per-application amounts (not accumulated stacks) and excludes self and
   * same-species allies — see `effects.ts` for why each of those is decided rather than guessed.
   */
  | { kind: "battleStartStatusFromAllies"; status: StatusEffectType; multiplier: number }
  /** "Whenever an ally inflicts <status>, Charge this by <seconds> second(s)." Shortens this
   * creature's remaining cooldown during the battle, so it needs the event-driven scheduler. */
  | { kind: "chargeOnAllyStatus"; status: StatusEffectType; seconds: number }
  /** "When a <typeFilter> ally casts, give it +<amount> Cooldown Speed for this battle."
   * Recorded for completeness; see `effects.ts` for current coverage. */
  | { kind: "cooldownSpeedOnAllyCast"; typeFilter?: CreatureType; amount: number }
  /**
   * 2026-10-06 round 10 (T219). Two scaling shapes that the selector-based tags above cannot
   * express, because their magnitude depends on the board rather than being a fixed amount.
   *
   * Count scaling: "+<effect> for each <typeFilter> ally [in <rowFilter>]". `effect` is applied
   * once per match, to whoever `target` selects.
   */
  | {
      kind: "statFromCount";
      target: TargetSelector;
      effect: EffectDescriptor;
      typeFilter?: CreatureType;
      rarityFilter?: Rarity;
      minLevelFilter?: number;
      rowFilter?: GridRow;
      /** Default false: "each ally" excludes the creature itself, matching `effects.ts` ally rule. */
      includeSelf?: boolean;
    }
  /**
   * Stat scaling: "gain <effect> equal to <multiplier>x the <sourceStat> of <sourceSelector>".
   * Reads BASE values of the pool, so two creatures scaling off each other cannot feed back.
   */
  /**
   * 2026-10-06 round 11 (T224). "On Cast: +N <stat> for this battle" — the ACCUMULATING buff.
   *
   * research.md L5: this is the single largest mechanism in the corpus (~40 creatures) and the
   * reason the taxonomy's "Unclassified" bucket resisted classification. It reads like a static
   * self-buff and is not: the trigger fires on every cast, so Mosslug is at +20 Damage after its
   * first cast, +40 after its second. "For this battle" scopes how long the bonus PERSISTS, not how
   * often it is GRANTED.
   *
   * It cannot live in `effects.ts`, which resolves once before the battle starts. It is applied by
   * `simulate()` inside the cast loop.
   */
  | { kind: "buffOnCast"; target: TargetSelector; effect: EffectDescriptor }
  /**
   * 2026-10-06 (T220). "+N <stat> for each UNIQUE TYPE on your team" — Prismagon.
   *
   * `statFromCount` cannot express this: it counts *allies matching a filter*, whereas this counts
   * *distinct type values across the team*, a different cardinality. Two Fire allies are two
   * matches for `statFromCount` but one unique type here.
   */
  /**
   * 2026-10-06 (T214 / FR-080). "Trigger this when <target> allies trigger" — a CHAINED cast.
   *
   * The creature casts in response to an ally rather than only on its own cooldown, so it needs
   * the ally-cast hook from T213. Chains are depth-capped; see `MAX_CHAIN_DEPTH` in `simulate.ts`.
   */
  | { kind: "triggerOnAllyCast"; target: TargetSelector }
  /**
   * 2026-10-06 (T240 / FR-094). Multiplicative stat scaling — "+70% to mons with cooldown >= 5s".
   * The tag vocabulary could not express a multiplier at all; the capture shows one driving the
   * board's largest numbers.
   */
  | { kind: "statMultiplier"; target: TargetSelector; stat: MultiplierScope; factor: number }
  /**
   * 2026-10-06 (T244 / FR-098). "additional Damage equal to 200% of the Poison stacks on the
   * enemy" — Fumungus. Read from the SHARED TARGET's accumulated status, recomputed every cast and
   * never persisted. `statFromStat` cannot express it: that reads a selector over **allies**.
   *
   * This was the captured team's largest damage term (14K+ by t~6.3, against Thorntail's 7994) and
   * it grows superlinearly, because Poison stacks only ever accumulate.
   */
  | { kind: "statFromTargetStatus"; status: StatusEffectType; multiplier: number }
  /**
   * 2026-10-06 (T245 / FR-099). "Trigger this when adjacent Toxic allies trigger" — Puffloon.
   *
   * Distinct from `triggerOnAllyCast`: this fires on an ally's TRIGGER and **must not reset or
   * consume the reactor's own cooldown**. The capture is unambiguous — Puffloon's bar climbed
   * monotonically 13 -> 19px through a four-hit cascade and it still cast off its own 10s cycle
   * afterwards.
   */
  | { kind: "triggerOnAllyTrigger"; target: TargetSelector }
  /**
   * 2026-10-07. A repeatable permanent stat gain whose trigger the BATTLE ENGINE cannot fire —
   * buying a monster, using an item, winning a round, gaining a trinket.
   *
   * These are real abilities with real numbers, but they fire on run events outside the battle this
   * engine simulates, so there is nothing for the resolver to hook. Recording them as data anyway
   * lets the UI offer a one-click way to bank each occurrence, instead of the user hand-typing
   * "+20 Damage, +20 Shield" into the modifier editor every time they use an item.
   *
   * Deliberately NOT in `RESOLVED_TAG_KINDS`: the engine must keep treating these as unmodelled, or
   * the coverage counter would claim abilities it does not compute.
   */
  | {
      kind: "manualTrigger";
      trigger: AbilityTrigger;
      /** Applied once per press, as placement modifiers. */
      effects: { stat: ModifierStat; amount: number }[];
      /**
       * 2026-10-07 (user-reported). WHO receives `effects`. Absent means the creature itself, which
       * is the case for seven of the nine species carrying this tag.
       *
       * The other two grant to allies — Brawlmantis's "This and Common allies gain +10 Damage
       * permanently", Kickrane's "This and all your allies" — and the tag previously could not say
       * so, so every press banked the bonus on the presser alone and the allies named in the
       * ability text were silently left out.
       */
      target?: TargetSelector;
      /**
       * Whether the presser is also a recipient. Needed because the ally selectors exclude the
       * source (`effects.ts`'s rule that "ally" means someone else), while these abilities read
       * "**This** and ... allies" — the presser is named separately from the selector. Defaults to
       * false, matching `statFromCount`'s `includeSelf`; irrelevant when `target` is self.
       */
      includeSelf?: boolean;
    }
  /**
   * 2026-10-06 (T241 / FR-095). "When allies inflict <status>, this gains +N <stat> permanently" —
   * Thorntail.
   *
   * The gain is **never scaled**. Thorntail entered the recorded battle at 7082 displayed damage
   * against a listed base of 50 — so it carried enormous modifiers — and every single increment was
   * still exactly its listed +24. It therefore lands in `postMultiplierFlatAdd`, not `base`.
   */
  | { kind: "gainOnAllyStatus"; status: StatusEffectType; stat: StatChangeStat.Damage; amount: number }
  | { kind: "statFromUniqueTypes"; target: TargetSelector; effect: EffectDescriptor }
  /**
   * 2026-10-06 (T220). "Knockout adjacent allies and gain <effect> for each ally knocked out" —
   * Petrirex. A SELF-INFLICTED knockout resolved at battle start.
   *
   * This is the narrow slice of the knockout family a battle simulator can model, and the reason it
   * is tractable where the rest is not: the victims are chosen by POSITION, not by who happens to
   * die during the fight, so the outcome is known before the first cast. The general knockout
   * family (a creature dying to incoming damage) still needs an HP model this engine does not have.
   */
  | {
      kind: "knockoutAlliesOnBattleStart";
      target: TargetSelector;
      effectPerKnockout: EffectDescriptor;
    }
  | {
      kind: "statFromStat";
      sourceSelector: TargetSelector;
      sourceStat: StatusEffectType | StatChangeStat.Damage | StatChangeStat.Multicast;
      multiplier: number;
      effect: EffectDescriptor;
    };

// ---------------------------------------------------------------------------
// Corpus entities
// ---------------------------------------------------------------------------

export interface CreatureRecord extends Provenance {
  /** Stable slug across levels, e.g. "bumblebolt" */
  id: string;
  name: string;
  rarity: Rarity;
  /** 1 or 2 entries typically; ["All"] for Omnichrome-style exceptions */
  types: CreatureType[];
  /**
   * Widened 1-3 -> 1-4 (2026-10-05 round 2, research.md D2): standard merging only reaches
   * level 3 (3x L1 -> L2, 2x L2 -> L3); level 4 is reachable only via rare in-run events or
   * consumable level-up items, and is NOT guaranteed for every species.
   */
  level: 1 | 2 | 3 | 4;
  /** Per-species confirmed level cap, when sourced; absent = not yet researched (NOT every
   * creature is assumed to reach 4 by default — see research.md D2's Sukoi example). */
  confirmedMaxLevel?: 1 | 2 | 3 | 4;
  /** Gold cost at level 1; merge levels typically have no independent shop cost */
  shopCost: number;
  /** null for creatures with no ordinary cooldown cast */
  baseCooldownSeconds: number | null;
  baseDamage: number | null;
  /** null if the creature has no direct-damage cast */
  damageType: DamageChannel | null;
  /**
   * Number of independent direct-damage events a single cooldown completion fires (2026-10-05
   * round 2, research.md D3). Default `1` ("no stated Multicast bonus") — backfilled onto all
   * existing records rather than flagged unconfirmed, since "1 = none" is the reasonable
   * baseline absent contrary evidence in `abilityText`.
   */
  baseMulticast: number;
  /**
   * HP restored per cast, resolved after damage in the same tick (2026-10-05 round 4,
   * research.md F3). Corpus data only — not simulated, same "no modeled target/HP pool" gap as
   * Shield absorption (tasks.md T037) — until/unless a target entity exists.
   */
  healAmount?: number;
  /** Extra gold gained when sold (2026-10-05 round 4, research.md F3) — shop/economy data
   * (research.md B6, out of scope for the engine), recorded for Corpus Browser completeness. */
  sellValue?: number;
  /** Layers/shield applied per cast, if any */
  appliesStatus?: { type: StatusEffectType; amount: number }[];
  abilityText: string;
  abilityTags: AbilityTag[];
  /** CreatureRecord.id this transforms into, if any (e.g. Riglet -> Rigalord) */
  evolvesInto?: string;
  /**
   * The level at which `evolvesInto` takes effect, e.g. 3 for Panbud -> Bambudo (2026-10-05
   * round 3, data-model.md's "Evolution-aware leveling" amendment). Required whenever
   * `evolvesInto` is set; a species with no evolution has neither field.
   */
  evolvesAtLevel?: 2 | 3 | 4;
  /**
   * The ability's trigger label, which the in-game card renders as its own emphasised line
   * *above* the description (e.g. "On Battle Start", "On Cast", "Ongoing") -- 2026-10-06 round 6,
   * research.md H1. `abilityText` holds only the description, so without this the card silently
   * drops a line the reference card shows. Absent = render the description alone, never an empty
   * trigger line.
   */
  /**
   * T250/FR-100: a CLOSED union, not a free string.
   *
   * Sourced from batodex's own `trigger` field, which is already discrete — 8 values across 144
   * monsters (research.md N2), matching our corpus's distribution exactly. `undefined` is a real
   * state (an ability with no trigger), distinct from "not yet researched".
   *
   * Note for the record: nothing in this codebase ever parsed this string — it has one consumer, a
   * display in `BatomonCard`, and the engine branches on `tag.event`. The defect being fixed is
   * that `string` permitted typos no compiler would catch, which is how `"On Knocked Out"` and
   * `"On Knockout"` could have silently coexisted.
   */
  abilityTrigger?: AbilityTrigger;
  /**
   * Vendored sprite filename (2026-10-06 round 6, research.md H3), resolved at render time
   * against `${import.meta.env.BASE_URL}sprites/monster/` -- see `src/ui/shared/Sprite.tsx`.
   *
   * Stored per record rather than derived from `id` because 11 of 149 species publish under a
   * different slug than their corpus id (e.g. `craghorn` -> `alpinine.png`, `pyronade` ->
   * `infernade.png`, `null00` -> `null_00.png`). Absent = render the text-only presentation,
   * never a broken <img>.
   */
  spriteFile?: string;
}

/**
 * Everything a creature emits in one cast — the ONE shape the stat band renders from.
 *
 * ## Why this type exists
 *
 * `buildStatLines` was already shared by both bands, so the *component* was never duplicated. The
 * duplication was one level down: it took a loose bag of parameters in which `healAmount` and
 * `multicast` were **optional**, and each call site hand-mapped its own differently-named source
 * onto them — `creature.healAmount` here, `effective.heal` there; `creature.baseMulticast` here,
 * `effective.multicast` there.
 *
 * Optional plus hand-mapping meant forgetting a field compiled cleanly. It did: the effective band
 * omitted healing, so nine creatures whose only output is a heal rendered "No published per-cast
 * output" directly beneath a card showing their heal.
 *
 * Every field here is **required**, so a producer that forgets one is a type error rather than a
 * blank panel. Adding a future output stat breaks both producers at compile time, which is the
 * point — that is the only thing that keeps two renderings of the same concept honest.
 */
export interface PerCastOutput {
  damage: number | null;
  damageType: DamageChannel | null;
  appliesStatus: { type: StatusEffectType; amount: number }[];
  heal: number | null;
  multicast: number;
  /** True when `damage` is sourced but not confirmed, so it renders no line rather than a wrong one. */
  damageUnconfirmed: boolean;
}

export interface TrainerRecord extends Provenance {
  id: string;
  name: string;
  /** Vendored trainer sprite filename (T255/FR-102), under `public/sprites/trainer/`. */
  spriteFile?: string;
  abilityText: string;
  abilityTags: AbilityTag[];
}

export interface TrinketRecord extends Provenance {
  id: string;
  name: string;
  effectText: string;
  /** Added 2026-10-06 round 5 -- batodex.com's trinket database publishes rarity directly,
   * same closed Rarity union creatures already use. */
  rarity?: Rarity;
  abilityTags: AbilityTag[];
  /**
   * Added 2026-10-06 round 5 (research.md G2): flat, unconditional, permanent team-wide stat
   * bonuses this trinket grants when selected -- the only trinket-effect shape this engine
   * simulates. Most trinket effects (shop/economy mechanics) have no entry here and remain
   * real, cited, browsable-only corpus data. Deliberately a flat list, not the full creature
   * AbilityTag/TargetSelector shape -- every trinket effect this maps applies to "your team,"
   * unconditionally, so there is no positional targeting to encode.
   */
  effectTags?: { stat: ModifierStat; amount: number }[];
  /**
   * Vendored sprite filename (2026-10-06 round 6, research.md H3), resolved against
   * `${import.meta.env.BASE_URL}sprites/trinket/` -- see `src/ui/shared/Sprite.tsx`.
   * Absent = render the text-only presentation, never a broken <img>.
   */
  spriteFile?: string;
}

export interface ItemRecord extends Provenance {
  id: string;
  name: string;
  effectText: string;
  abilityTags: AbilityTag[];
}

export interface Corpus {
  creatures: CreatureRecord[];
  trainers: TrainerRecord[];
  trinkets: TrinketRecord[];
  items: ItemRecord[];
}

// ---------------------------------------------------------------------------
// Team configuration
// ---------------------------------------------------------------------------

/** B5: back row = "A" row, front row = "B" row in the wiki's own labeling */

export type GridCol = 0 | 1 | 2;

export interface GridSlot {
  row: GridRow;
  col: GridCol;
}

/**
 * Data-model amendment, 2026-10-05 (post-MVP, user-requested): manual carry-over stat
 * modifiers. The engine only simulates one isolated battle against an idealized target
 * (spec.md Assumptions) — it has no concept of a multi-round match. Real play often carries
 * bonuses between rounds (e.g. a creature's "On Victory" ability granting +10 Damage to every
 * ally permanently for the rest of the run). Rather than simulate the whole match history,
 * the user can describe the net effect of such carry-overs directly as a flat adjustment on
 * top of a creature's base stats for this one simulated battle.
 */
/*
 * `ModifierStat` is now an enum in `./enums.ts`; the rationale that lived here is kept because it
 * explains why the vocabulary exists at all.
 */

export interface StatModifier {
  /** Stable id for list management/removal in the UI; not otherwise meaningful */
  id: string;
  /** Optional free-text user note, e.g. "Round 2 win bonus from Brawlmantis" */
  label?: string;
  stat: ModifierStat;
  amount: number;
}

export interface TeamPlacement {
  slot: GridSlot;
  creatureId: string;
  /** Widened 1-3 -> 1-4 alongside CreatureRecord.level (2026-10-05 round 2) — must match an
   * actual `(creatureId, level)` corpus record; see data-model.md's lookup-fix amendment. */
  level: 1 | 2 | 3 | 4;
  /**
   * SHINY variant (round 11, WI-R11-001). Independent of level: a creature can be shiny at any
   * level. Shiny substitutes a different published stat line (see `shiny.ts`) — it is NOT a
   * multiplier, and for a handful of creatures it is strictly worse.
   */
  shiny?: boolean;
  /** Applies only to this placement's creature, on top of any teamModifiers */
  modifiers?: StatModifier[];
}

export interface TeamConfiguration {
  /**
   * The region this run draws from (FR-087). The player picks it "before they choose anything
   * else", so the builder gates on it.
   */
  selectedRegion?: RegionId;
  /**
   * Species painted "all"-type by Painter (FR-085/086). **Species ids, not slots** — the ability
   * reads "whenever these specific species appear… on your board", so painting Mosslug paints
   * every Mosslug (research.md M1).
   */
  paintedCreatureIds?: string[];
  /** Species brought in from the opposite region by Smuggler (FR-091). */
  smuggledCreatureIds?: string[];
  /** Max 6; one per unique slot — see Validation rules in data-model.md */
  placements: TeamPlacement[];
  trainerId: string | null;
  trinketIds: string[];
  itemIds: string[];
  /** Configurable per FR-007/FR-008 */
  simulationWindowSeconds: number;
  /** Applies to every placement's creature when resolving its effective stats */
  teamModifiers?: StatModifier[];
}

// ---------------------------------------------------------------------------
// Simulation entities
// ---------------------------------------------------------------------------

export interface TimelineEvent {
  tSeconds: number;
  kind: TimelineEventKind;
  sourceSlot: GridSlot;
  /** Absent for self/ongoing-only events */
  targetSlot?: GridSlot;
  damage?: number;
  damageType?: DamageChannel;
  statusDelta?: { type: StatusEffectType; slot: GridSlot; layerDelta: number };
}

export interface StatusEffectInstance {
  type: StatusEffectType;
  targetSlot: GridSlot;
  /** Current stack count ("layers" per the cited wiki's own terminology) */
  layers: number;
  sourceSlot: GridSlot;
  appliedAtSeconds: number;
}

export interface SimulationResult {
  /** Every event in time order — single source of truth for both UI consumers */
  timeline: TimelineEvent[];
  perCreatureDps: Record<string, number>; // keyed by `${creatureId}@${row}${col}`
  /** Window-AVERAGE damage per second, by status. See the three fields below before reading this
   * as "the" rate: for a status whose stacks never decay it understates the end of a fight. */
  perStatusPerSecond: Record<StatusEffectType, number>;
  /**
   * 2026-10-06 round 7 (FR-055): status stacks APPLIED per second. Distinct from
   * `perStatusPerSecond`, which is DAMAGE per second -- a user reading only the damage figure
   * cannot tell whether it is steady or still climbing.
   */
  /**
   * 2026-10-06 round 8 (FR-068): instantaneous damage per second, in 1-second buckets.
   * The cumulative series only ever rises, so it cannot show whether the team's output is
   * accelerating; this is the rate view that makes a Poison or Shock ramp legible. Derived from
   * the same `timeline` as `cumulativeSeries`, so integrating this reproduces that.
   */
  dpsRateSeries: { tSeconds: number; dps: number }[];
  /**
   * LIVE stack counts on the shared target over time — what is on the enemy right now, not what
   * has been dealt. Poison and Shock only accumulate; Burn climbs as it is applied and decays by
   * one layer per 0.5s tick, so this is the only view that shows a Burn team's stacks burning off.
   */
  statusStackSeries: { tSeconds: number; Burn: number; Poison: number; Shock: number }[];
  perStatusAppliedPerSecond: Record<StatusEffectType, number>;
  /**
   * The instantaneous damage rate as the window closes (`live layers / tickInterval`). The
   * interpretable form of the second-order information: "16.00/s average, but 40/s by the end".
   * Shock is reported as its window average (it deals damage reactively on direct hits, not on a
   * timer); Shield is always 0 (it deals no damage).
   */
  perStatusFinalDamageRate: Record<StatusEffectType, number>;
  /**
   * Growth of the damage rate, in damage per second per second:
   * `(finalRate - initialRate) / windowSeconds`, and the initial rate is always 0.
   * Computed exactly rather than by curve-fitting -- a least-squares slope over 1-second buckets
   * was measured against a known-exact case and was both noisy and NaN-prone at a 1s window
   * (research.md I13).
   *
   * Positive for BOTH Poison and Burn in practice, for different reasons -- an earlier version of
   * this comment wrongly claimed Burn was ~0. Poison's stacks never decay, so it grows without
   * bound forever. Burn's instances each decay at a fixed 1 layer per 0.5s tick regardless of
   * size, so an N-layer instance lives N/2 seconds -- Basilord's 170 burn lasts 85s, far longer
   * than a battle. Burn therefore climbs throughout any realistic fight and plateaus only in
   * principle. Only a *tiny* burn stack settles quickly.
   */
  perStatusDamageGrowthPerSecond: Record<StatusEffectType, number>;
  /**
   * User-requested amendment, 2026-10-05 ("facilitated damage"): per-creature rate of damage
   * *enabled* by that creature's own status grants on OTHER hits — currently just Shock procs,
   * the only implemented mechanic where one creature's status grant amplifies a separate hit's
   * damage. Proportionally attributed by each contributing creature's share of current Shock
   * layers when multiple creatures grant Shock on the same team. Keyed the same way as
   * `perCreatureDps`. Deliberately excludes a creature's own direct-damage contribution (that's
   * what `perCreatureDps` already measures) — see data-model.md's "Facilitated damage" amendment.
   */
  perCreatureFacilitatedDps: Record<string, number>;
  /**
   * User-requested amendment, 2026-10-05 round 2 (item 2 — "no visualization of the current
   * mon's damage/shield/burn/poison/multi-cast/shock"): per-placement *effective* (post-
   * modifier) output, resolved from the exact same per-cast modifier resolution Phase A
   * already performs — not a second, divergent computation path. Keyed the same way as
   * `perCreatureDps`. See data-model.md's "perCreatureEffectiveStats" amendment.
   */
  perCreatureEffectiveStats: Record<
    string,
    {
      /**
       * The same `PerCastOutput` the creature card renders, so the "Effective this battle" band
       * needs no mapping layer at all — it passes this straight to `buildStatLines`. Hand-mapping
       * between two parallel shapes is what silently dropped healing.
       */
      output: PerCastOutput;
      cooldownSeconds: number | null;
    }
  >;
  cumulativeSeries: {
    tSeconds: number;
    totalDamage: number;
    /** Direct-hit damage only. Was previously visible only folded into `totalDamage`. */
    directDamage: number;
    byStatus: Record<StatusEffectType, number>;
  }[];
}
