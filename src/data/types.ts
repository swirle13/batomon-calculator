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
  level: 1 | 2 | 3;
  /** Gold cost at level 1; merge levels typically have no independent shop cost */
  shopCost: number;
  /** null for creatures with no ordinary cooldown cast */
  baseCooldownSeconds: number | null;
  baseDamage: number | null;
  /** null if the creature has no direct-damage cast */
  damageType: DamageType | null;
  /** Layers/shield applied per cast, if any */
  appliesStatus?: { type: StatusEffectType; amount: number }[];
  abilityText: string;
  abilityTags: AbilityTag[];
  /** CreatureRecord.id this transforms into, if any (e.g. Riglet -> Rigalord) */
  evolvesInto?: string;
  /** Field names published nowhere with confidence; shown as "unknown" in the UI */
  unconfirmedFields?: string[];
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

export interface TeamPlacement {
  slot: GridSlot;
  creatureId: string;
  level: 1 | 2 | 3;
}

export interface TeamConfiguration {
  /** Max 6; one per unique slot — see Validation rules in data-model.md */
  placements: TeamPlacement[];
  trainerId: string | null;
  trinketIds: string[];
  itemIds: string[];
  /** Configurable per FR-007/FR-008 */
  simulationWindowSeconds: number;
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
  cumulativeSeries: {
    tSeconds: number;
    totalDamage: number;
    byStatus: Record<StatusEffectType, number>;
  }[];
}
