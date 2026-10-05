# Data Model: Batomon Showdown DPS & Status Calculator

**Feature**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

All types below are TypeScript interfaces/unions (Constitution Principle II: closed discriminated
unions, no bare strings for closed vocabularies). This is the authoritative shape `src/data/**` and
`src/engine/**` must implement — the implementation phase MUST NOT invent additional ad hoc shapes
for these concepts.

## Shared primitive types

```ts
type Rarity = "Common" | "Uncommon" | "Rare" | "SuperRare" | "Legendary" | "Mythical";

// B7: "Fighting" retained with a confidence flag rather than omitted or silently trusted.
type CreatureType =
  | "Fire" | "Water" | "Electric" | "Toxic" | "Flying" | "Rock" | "Grass" | "Bug"
  | "Steel" | "Dragon" | "Ghost" | "Fighting" | "All";

type DamageType = "Direct" | "Burn" | "Poison" | "Shock" | "SuddenDeath";

type StatusEffectType = "Burn" | "Poison" | "Shock" | "Shield";

interface SourceRef {
  url: string;
  title: string;
  retrievedAt: string; // ISO date
}

interface Provenance {
  sourceRefs: SourceRef[];
  patch: string; // e.g. "1.2.0", "Balance 24", "Build 25037381 Balance 14" — whatever the source states
  conflicts?: FieldConflict[];
}

interface FieldConflict {
  field: string; // dot-path into the record, e.g. "baseDamage"
  values: { value: unknown; sourceRefs: SourceRef[] }[];
  resolution?: string; // which value the corpus adopted and why, if any; absent = unresolved
}
```

## Corpus entities (FR-001..FR-004, FR-013, FR-014)

```ts
interface CreatureRecord extends Provenance {
  id: string; // slug, stable across levels, e.g. "bumblebolt"
  name: string;
  rarity: Rarity;
  types: CreatureType[]; // 1 or 2 entries typically; ["All"] for Omnichrome-style exceptions
  level: 1 | 2 | 3; // B6 — per-level record, not merge-computed
  shopCost: number; // gold cost at level 1; merge levels typically have no independent shop cost
  baseCooldownSeconds: number | null; // null for creatures with no ordinary cooldown cast
  baseDamage: number | null;
  damageType: DamageType | null; // null if the creature has no direct-damage cast
  appliesStatus?: { type: StatusEffectType; amount: number }[]; // layers/shield applied per cast
  abilityText: string; // transcribed, cited ability description
  abilityTags: AbilityTag[]; // structured hints the engine consumes (see below)
  evolvesInto?: string; // CreatureRecord.id this transforms into, if any (e.g. Riglet -> Rigalord)
  unconfirmedFields?: string[]; // field names published nowhere with confidence; shown as "unknown"
}

// Structured, closed-vocabulary hints extracted from abilityText so the engine does not parse
// free text at runtime. Each tag cites which part of abilityText it encodes.
type AbilityTag =
  | { kind: "ongoing"; target: TargetSelector; effect: EffectDescriptor }
  | { kind: "trigger"; target: TargetSelector; event: EventLabel }
  | { kind: "onEvent"; event: EventLabel; effect: EffectDescriptor }
  | { kind: "cooldownSpeedModifier"; target: TargetSelector; amount: number } // decimal, e.g. 0.25
  | { kind: "statusGrant"; target: TargetSelector; status: StatusEffectType; amount: number };

type EventLabel = "OnCast" | "OnBattleStart" | "OnVictory" | "OnKnockout";

type TargetSelector =
  | { kind: "self" }
  | { kind: "adjacent"; sameTeamOnly?: boolean; typeFilter?: CreatureType }
  | { kind: "row"; sameTeamOnly?: boolean }
  | { kind: "behind" }
  | { kind: "above" }
  | { kind: "allAllies"; typeFilter?: CreatureType };

interface EffectDescriptor {
  statChange?: { stat: "cooldownSpeed" | "damage" | "multicast"; amount: number };
  statusGrant?: { type: StatusEffectType; amount: number };
  extraOngoingApplications?: number;
}

interface TrainerRecord extends Provenance {
  id: string;
  name: string;
  abilityText: string;
  abilityTags: AbilityTag[];
}

interface TrinketRecord extends Provenance {
  id: string;
  name: string;
  effectText: string;
  abilityTags: AbilityTag[];
}

interface ItemRecord extends Provenance {
  id: string;
  name: string;
  effectText: string;
  abilityTags: AbilityTag[];
}
```

## Team configuration (FR-005, FR-006, FR-011)

```ts
type GridRow = "back" | "front"; // B5: A-row = back, B-row = front
type GridCol = 0 | 1 | 2;

interface GridSlot {
  row: GridRow;
  col: GridCol;
}

interface TeamPlacement {
  slot: GridSlot;
  creatureId: string;
  level: 1 | 2 | 3;
}

interface TeamConfiguration {
  placements: TeamPlacement[]; // max 6, one per unique slot
  trainerId: string | null;
  trinketIds: string[];
  itemIds: string[];
  simulationWindowSeconds: number; // configurable per FR-007/FR-008, default TBD in quickstart
}
```

Validation rules (enforced in engine, not just UI): `placements` MUST NOT contain two entries with
the same `slot`; MUST NOT exceed 6 entries; every `creatureId`/`trainerId`/`trinketIds`/`itemIds`
MUST resolve to an existing corpus record (FR-005, FR-006).

## Simulation entities (FR-007, FR-008, FR-009, FR-010, FR-012)

```ts
type TimelineEventKind = "attack" | "trigger" | "statusTick" | "shockProc" | "ongoingChange";

interface TimelineEvent {
  tSeconds: number;
  kind: TimelineEventKind;
  sourceSlot: GridSlot;
  targetSlot?: GridSlot; // absent for self/ongoing-only events
  damage?: number;
  damageType?: DamageType;
  statusDelta?: { type: StatusEffectType; slot: GridSlot; layerDelta: number };
}

interface StatusEffectInstance {
  type: StatusEffectType;
  targetSlot: GridSlot;
  layers: number; // current stack count ("layers" per B2 terminology)
  sourceSlot: GridSlot;
  appliedAtSeconds: number;
}

interface SimulationResult {
  timeline: TimelineEvent[]; // every event in time order — single source of truth (spec Key Entities)
  perCreatureDps: Record<string /* creatureId@slot */, number>;
  perStatusPerSecond: Record<StatusEffectType, number>; // instantaneous rate at window end
  cumulativeSeries: {
    tSeconds: number;
    totalDamage: number;
    byStatus: Record<StatusEffectType, number>;
  }[]; // feeds the FR-010 chart directly — chart renders this with no separate recomputation
}
```

**Why `SimulationResult` is the single source for both the summary (FR-009) and the chart
(FR-010)**: this directly satisfies the Development Workflow rule in the constitution that the two
displays "cannot silently diverge" — both the summary panel and the chart component read fields off
one `SimulationResult`, never re-derive their own numbers independently.

## State transitions

- `TeamConfiguration` is edited by the user (FR-011) → triggers a fresh `simulate(config, corpus) :
  SimulationResult` call → both UI consumers re-render from the new result. No partial/incremental
  update model is needed at this scale (≤6 creatures, bounded window).
- `StatusEffectInstance` layer count: Burn -1 layer per tick (B2); Poison unchanged by its own tick;
  Shock unchanged by anything except an explicit new application (no natural decay, per B2/B4).

## Amendments

### 2026-10-05 — `CreatureType` widened: `"Curio"`, `"NULL"`

Added during the full-corpus widening pass (tasks.md T043) — both appear as literal Type-column
values across independent sources (see `src/data/types.ts`'s inline citation), not typos.

### 2026-10-05 — Manual carry-over `StatModifier`s (user-requested, post-MVP)

The engine only simulates one isolated battle against an idealized target (see Assumptions in
spec.md) — it has no multi-round match model. To let a user describe the net effect of a
previous round's permanent carry-over bonus (e.g. "+10 Damage to every ally, from a creature's
On Victory ability") without simulating the whole match history, `TeamConfiguration` and
`TeamPlacement` gained:

```ts
type ModifierStat =
  | "damageFlatAdd" | "cooldownFlatAddSeconds" | "cooldownSpeedAdd"
  | "burnAmountAdd" | "poisonAmountAdd" | "shockAmountAdd" | "shieldAmountAdd";

interface StatModifier {
  id: string;
  label?: string; // optional free-text user note; the compact UI (2026-10-05 redesign) doesn't collect one
  stat: ModifierStat;
  amount: number;
}

// TeamConfiguration gains: teamModifiers?: StatModifier[]  (applies to every placement; absent/empty = none)
// TeamPlacement gains:     modifiers?: StatModifier[]       (applies to this placement only)
```

**Known limitation**: a modifier can only scale an effect a creature *already has*. A
`damageFlatAdd` on a creature with `baseDamage === null` (no ordinary direct-damage cast) has
no attack event to attach to and is therefore a no-op; same for status-amount modifiers on a
creature that doesn't already apply that status. This is intentional — modifiers do not
fabricate new attacks/status grants that aren't in the cited corpus data.

### 2026-10-05 — "Facilitated damage" per creature (user-requested)

The game's own UI only shows each creature's own damage, not how much damage a *status-granting*
creature enabled on other hits (e.g. a Shock-applier's layers amplifying every subsequent direct
hit against the target). To help a user decide whether to invest in a Shock-granter's triggers
vs. their highest-direct-damage attacker, `SimulationResult` gains:

```ts
perCreatureFacilitatedDps: Record<string, number>; // same key shape as perCreatureDps
```

Currently populated only from Shock procs (the only implemented facilitation mechanic): each
proc's damage is split proportionally across every creature currently contributing Shock
layers, by their share of the total layer count, and converted to a per-second rate the same
way `perCreatureDps` is. A creature's own direct damage is never counted here — only damage its
status grants enabled on top of some hit (its own or an ally's).

### 2026-10-05 (round 2) — `unconfirmedFields` promoted from `CreatureRecord` onto `Provenance`

So `TrainerRecord`/`TrinketRecord`/`ItemRecord` can flag a low-confidence field the same way
creatures already do (needed immediately by the Trainer-roster widening below — see research.md
D1's five named-only trainers). Non-breaking: `CreatureRecord` keeps the field, just inherited
rather than locally declared.

```ts
interface Provenance {
  sourceRefs: SourceRef[];
  patch: string;
  conflicts?: FieldConflict[];
  unconfirmedFields?: string[]; // moved here from CreatureRecord, 2026-10-05 round 2
}
```

### 2026-10-05 (round 2) — Creature level widened to 1–4; lookup must key on (id, level)

Per research.md D2: Level 4 exists but is reached only via rare events/items, not standard
merging, and is **not** guaranteed for every species (at least one creature's own level-up was
officially hotfixed to a lower cap). `CreatureRecord.level` widens accordingly:

```ts
level: 1 | 2 | 3 | 4; // was 1 | 2 | 3
confirmedMaxLevel?: 1 | 2 | 3 | 4; // per-species cap, when sourced; absent = not yet researched
```

**Bug found while planning, not yet triggered by data** (every existing record is `level: 1`, so
this was latent): `simulate.ts` resolves a placement's creature via
`corpus.creatures.find(c => c.id === p.creatureId)`, which ignores `TeamPlacement.level` entirely.
Once the corpus gains real level-2/3/4 records sharing an `id`, this must become
`corpus.creatures.find(c => c.id === p.creatureId && c.level === p.level)`, raising
`InvalidTeamConfigurationError` when no record exists for that exact `(id, level)` pair — it must
never silently fall back to a different level's stats. The UI also needs an actual level selector
per placement (`TeamConfigContext.setPlacement` currently hardcodes `level = 1` with no control to
change it), restricted to levels the corpus actually has a record for.

### 2026-10-05 (round 2) — `baseMulticast` added to `CreatureRecord`; Multicast now in engine scope

Per research.md D3 — Multicast causes a cast to resolve as multiple independent direct-damage
events (each separately Shock-proc-eligible), and the user explicitly asked to see it in the
per-creature breakdown (item 2, see `perCreatureEffectiveStats` below).

```ts
baseMulticast: number; // default 1 ("no stated Multicast bonus"); backfilled to 1 for all
                        // existing records rather than flagged unconfirmed, since "1 = none" is
                        // the reasonable baseline absent contrary evidence in abilityText
```

`ModifierStat` gains `"multicastAdd"`. Phase A cast generation fires
`baseMulticast + multicastAdd` independent direct-damage events per cooldown completion instead of
one.

### 2026-10-05 (round 2) — `SimulationResult.perCreatureEffectiveStats` (per-creature breakdown, item 2)

The user reported no visibility into "the current mon's damage/shield/burn/poison/multi-cast/
shock," making it hard to tell what a `StatModifier` actually changes before running the full
simulation. New field, computed from the exact same per-cast modifier resolution Phase A already
performs (`sumModifier` et al.) — not a second, divergent computation path, per the Development
Workflow single-source-of-truth rule:

```ts
perCreatureEffectiveStats: Record<string /* same key shape as perCreatureDps */, {
  damage: number | null;
  damageType: DamageType | null;
  cooldownSeconds: number | null;
  multicast: number; // baseMulticast + any multicastAdd modifier
  appliesStatus: { type: StatusEffectType; amount: number }[]; // post-modifier amounts
}>;
```

Replaces/feeds `PlacedCreatureDetails`, which currently only shows raw unmodified corpus values
and has no way to reflect an active `StatModifier`.

### 2026-10-05 (round 2) — Trainer corpus widened to the full documented roster

No type change — data entry only, per research.md D1. `trainers.ts` grows from the single
"Musician" seed to the full cited 23-entry roster, including the two recorded `FieldConflict`s
(Chemist's Poison amount, Redhead's Burn amount) and `unconfirmedFields` flags (now available per
the `Provenance` promotion above) on the five named-only trainers whose ability text comes from
secondary/observational sourcing rather than an official patch note.

### 2026-10-05 (round 2) — Chart X-axis: numeric domain + float-safe cast timing

No data-model type change. Per research.md D4: `CumulativeChart`'s `XAxis` becomes
`type="number" domain={[0, windowSeconds]}`; `simulate.ts` Phase A's cast-time loop switches from
repeated `+=` addition to index multiplication (`t = startAt + n * cooldown`); every
`TimelineEvent.tSeconds` is rounded to a fixed precision (1e-6s) at creation so no float-drift
artifact can surface in any UI (tooltip, table, or chart tick).

### 2026-10-05 — Shield counted as an output stat, not just absorption

`perStatusPerSecond.Shield` and `cumulativeSeries[].byStatus.Shield` now track the cumulative
*Shield granted* by the team's own casts (same treatment as Burn/Poison/Shock), not Shield
*absorption* against an opposing target (which still isn't modeled — see `simulate.ts`'s T037
comment). This answers "how much Shield is this team generating over time", which is what the
summary table and chart surface as "Shield".
