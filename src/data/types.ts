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

export type Rarity =
  | "Common"
  | "Uncommon"
  | "Rare"
  | "SuperRare"
  | "Legendary"
  | "Mythical";

/**
 * research.md B7: "Fighting" is retained with a confidence flag rather than omitted or
 * silently trusted — it appears in ability text in creator footage per one source, but is
 * explicitly flagged there as unconfirmed by official publication.
 *
 * "Curio" and "NULL" added 2026-10-05 during the full-corpus widening pass (tasks.md T043):
 * both appear as literal Type-column values for multiple creatures across two independent
 * sources — https://batomonshowdown.wiki/batomon/ (Goldora: Curio) and
 * https://batomon.net/batomon/ (Dollhime/Furnadon/Gachapod/Mallogre/Nekoffin/Pawsperity/
 * Rubbin/Shrinell/Vipair: Curio; MissingN./NULL-00/NULL-7F/NULL-FF: NULL) — so they are
 * treated as real closed-vocabulary members, not typos, per Constitution Principle II.
 */
export type CreatureType =
  | "Fire"
  | "Water"
  | "Electric"
  | "Toxic"
  | "Flying"
  | "Rock"
  | "Grass"
  | "Bug"
  | "Steel"
  | "Dragon"
  | "Ghost"
  | "Fighting"
  | "Curio"
  | "NULL"
  | "All";

export type DamageType = "Direct" | "Burn" | "Poison" | "Shock" | "SuddenDeath";

export type StatusEffectType = "Burn" | "Poison" | "Shock" | "Shield";

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

export type EventLabel = "OnCast" | "OnBattleStart" | "OnVictory" | "OnKnockout";

export type TargetSelector =
  | { kind: "self" }
  | { kind: "adjacent"; sameTeamOnly?: boolean; typeFilter?: CreatureType }
  | { kind: "row"; sameTeamOnly?: boolean }
  | { kind: "behind" }
  | { kind: "above" }
  | { kind: "allAllies"; typeFilter?: CreatureType };

export interface EffectDescriptor {
  statChange?: { stat: "cooldownSpeed" | "damage" | "multicast"; amount: number };
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
  | { kind: "statusGrant"; target: TargetSelector; status: StatusEffectType; amount: number };

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
  damageType: DamageType | null;
  /**
   * Number of independent direct-damage events a single cooldown completion fires (2026-10-05
   * round 2, research.md D3). Default `1` ("no stated Multicast bonus") — backfilled onto all
   * existing records rather than flagged unconfirmed, since "1 = none" is the reasonable
   * baseline absent contrary evidence in `abilityText`.
   */
  baseMulticast: number;
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
}

export interface TrainerRecord extends Provenance {
  id: string;
  name: string;
  abilityText: string;
  abilityTags: AbilityTag[];
}

export interface TrinketRecord extends Provenance {
  id: string;
  name: string;
  effectText: string;
  abilityTags: AbilityTag[];
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
export type GridRow = "back" | "front";
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
export type ModifierStat =
  | "damageFlatAdd"
  | "cooldownFlatAddSeconds"
  | "cooldownSpeedAdd"
  | "burnAmountAdd"
  | "poisonAmountAdd"
  | "shockAmountAdd"
  | "shieldAmountAdd"
  /** 2026-10-05 round 2 (research.md D3): adds to a creature's baseMulticast count. */
  | "multicastAdd";

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
  /** Applies only to this placement's creature, on top of any teamModifiers */
  modifiers?: StatModifier[];
}

export interface TeamConfiguration {
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

export type TimelineEventKind =
  | "attack"
  | "trigger"
  | "statusTick"
  | "shockProc"
  | "ongoingChange";

export interface TimelineEvent {
  tSeconds: number;
  kind: TimelineEventKind;
  sourceSlot: GridSlot;
  /** Absent for self/ongoing-only events */
  targetSlot?: GridSlot;
  damage?: number;
  damageType?: DamageType;
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
  perStatusPerSecond: Record<StatusEffectType, number>;
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
      damage: number | null;
      damageType: DamageType | null;
      cooldownSeconds: number | null;
      multicast: number;
      appliesStatus: { type: StatusEffectType; amount: number }[];
    }
  >;
  cumulativeSeries: {
    tSeconds: number;
    totalDamage: number;
    byStatus: Record<StatusEffectType, number>;
  }[];
}
