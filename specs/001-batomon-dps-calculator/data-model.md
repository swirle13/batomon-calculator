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

**Known limitation** (~~a modifier can only scale an effect a creature *already has*~~ —
**RETRACTED 2026-10-07**): this said a `damageFlatAdd` on a creature with `baseDamage === null` had
no attack to attach to and was therefore a no-op, and the same for a status the creature does not
already apply. It was wrong about the game. Trinkets and ally abilities routinely give a creature
damage or a status it did not previously have, so a user recording that board was entering a real
configuration and watching it silently vanish.

A modifier may now **create** an effect. `null` continues to mean "nothing here" — it is reported
only when there is neither a base value nor a modifier — so the 62 species with `baseDamage: null`
still render no damage line until something gives them one. See `src/engine/modifiers.ts`, which
is the single implementation the card and the engine now share; the rule had been written out four
separate times and each copy discarded the input slightly differently.

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

### 2026-10-05 (round 3) — Evolution-aware leveling: `evolvesAtLevel`

Per research.md E2.6 — the reference UI's level selector simply hides levels past a species'
evolution point instead of resolving to the evolved species. Pairs with the existing
`evolvesInto`:

```ts
interface CreatureRecord extends Provenance {
  // ...existing fields...
  evolvesInto?: string; // unchanged
  /** The level at which `evolvesInto` takes effect, e.g. 3 for Panbud -> Bambudo. Required
   * whenever `evolvesInto` is set; a species with no evolution has neither field. */
  evolvesAtLevel?: 2 | 3 | 4;
}
```

New engine helper (contracts/engine-api.md gains this signature; test-first per Constitution
Principle III when implemented):

```ts
/**
 * Walks `evolvesInto`/`evolvesAtLevel` chains to resolve which species a placement should
 * actually show at `targetLevel`, starting from `baseSpeciesId`. Returns the resolved
 * CreatureRecord at `targetLevel` (via the (id, level) lookup — see the round-2 amendment
 * above), or `null` if no record exists for the resolved species at that level. A species with
 * no `evolvesInto` simply returns itself at `targetLevel`. Multi-stage chains (an evolved
 * species that itself evolves again) are followed transitively.
 */
function resolveLevelUp(corpus: Corpus, baseSpeciesId: string, targetLevel: 1 | 2 | 3 | 4): CreatureRecord | null;
```

**Known limitation, recorded rather than silently guessed** (research.md E2.6): a species with
*more than one* documented `evolvesInto` target under different conditions (a "branching"
evolution) cannot be represented by a single `evolvesInto`/`evolvesAtLevel` pair. No such branch
is populated in the corpus yet — `evolvesInto` stays a single optional field until a specific
branching case is confirmed from a source with its trigger-condition table intact, at which
point the data model will need a real amendment (e.g. a `conditions` array), not a guess at
which branch to encode.

### 2026-10-05 (round 3) — Canonical `CreatureType` color mapping

Per research.md E2.4 — the reference UI colors a creature's card background by type but renders
its type tag chips with no color at all, two different treatments for the same information. One
canonical mapping, defined once in the data layer and imported by every UI component that
renders a type as a color (card background, tag chip, future type filter), so this class of
inconsistency is structurally impossible to reintroduce:

```ts
// src/data/typeColors.ts
const TYPE_COLORS: Record<CreatureType, string> = { /* one hex per CreatureType, incl. "All" */ };
function typeColor(type: CreatureType): string; // TYPE_COLORS[type]
```

Dual-typed creatures render a split/gradient background using both types' colors (the visual
pattern the user liked in the reference UI), not a blended third color — each type stays
individually identifiable.

### 2026-10-05 (round 3) — Drag-and-drop placement editing (`@dnd-kit/core`)

Per research.md E2.5 — adds a second way to assign/rearrange placements (dragging an existing
placement onto another slot), *alongside* the existing modal/dropdown flow (kept for keyboard/
screen-reader users — Constitution-aligned with the still-open `tasks.md` T054 accessibility
pass). No `TeamConfiguration`/`TeamPlacement` shape change — this is purely a new UI interaction
over the existing `setPlacement` mutation:

- Dropping placement A onto an **empty** slot B: A moves to B (same as picking A's creature in
  B's modal, then clearing A's old slot).
- Dropping placement A onto an **occupied** slot B: A and B **swap** (each keeps its own level
  and modifiers) — not "B is overwritten/cleared." This matches how a user would expect
  rearranging an already-built team to work, and never silently discards a placement's
  modifiers.

### 2026-10-05 (round 4) — `STATUS_VS_SHIELD_REDUCTION` patch supersession: 25% -> 15%

Per research.md F1: superseded by an August 2026 balance pass, corroborated across three
independent 1.2.0-era guides. `src/engine/shield.ts`'s `STATUS_VS_SHIELD_REDUCTION` constant
updates from `0.25` to `0.15`, with its `Provenance` updated to cite the new sources and retain
the 30% -> 25% -> 15% history in a comment (this is the third time this specific value has
changed — the strongest case yet for keeping it a named, cited constant rather than inline).

### 2026-10-05 (round 4) — Multicast repetitions stagger by 0.1s, not simultaneous

Per research.md F2 — corrects round 2's implementation, which fired every Multicast repetition
at the same `tSeconds`. Each repetition `i` (0-indexed) now resolves at
`cast.tSeconds + i * 0.1`, rounded via the existing `roundTime()` helper; a repetition whose
staggered timestamp would exceed `windowSeconds` is not generated. No type change — this is a
Phase B engine-logic fix in `simulate.ts`.

### 2026-10-05 (round 4) — New stats: `healAmount`, `sellValue` (data fields only)

Per research.md F3 — both corroborate the user-supplied in-game stat reference text:

```ts
interface CreatureRecord extends Provenance {
  // ...existing fields...
  /** HP restored per cast, resolved after damage in the same tick (per the game's own stat
   * description) -- not simulated: same "no modeled target/HP pool" gap as Shield absorption
   * (tasks.md T037). Corpus data only, for display, until/unless a target entity exists. */
  healAmount?: number;
  /** Extra gold gained when sold -- shop/economy data (research.md B6, out of scope for the
   * engine), recorded for Corpus Browser completeness only. */
  sellValue?: number;
}
```

### 2026-10-06 (round 5) — Level 2-4 creature records populated at scale; no schema change

Per research.md G1 — every field needed (`level`, `baseCooldownSeconds`, `baseDamage`,
`damageType`, `appliesStatus`, `baseMulticast`, `healAmount`, `evolvesInto`, `evolvesAtLevel`)
already existed from rounds 2-4. This amendment is a data-population note, not a type change:
one `CreatureRecord` per `(id, level)` pair is added for levels 2-4 of every species and nested
evolved form, extracted programmatically from batodex.com's embedded per-page database
(research.md G1) rather than hand-transcribed. `evolvesInto` is populated even for non-level-
triggered evolutions (e.g. Ignit's victory-triggered evolution into Flarilisk) but
`evolvesAtLevel` is left absent for those — `resolveLevelUp()` has no "level" input to resolve a
victory-triggered evolution against, so it correctly treats such a species as non-evolving for
leveling purposes; this is a recorded known limitation, not a bug to fix this round.

### 2026-10-06 (round 5) — Trinket corpus populated; `rarity` added to `TrinketRecord`; flat team-wide trinket effects wired into `simulate()`

Per research.md G2 — the full 93-entry Trinket database is extracted the same way as the
creature database. Two small, additive type changes:

```ts
interface TrinketRecord extends Provenance {
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
   * simulates. Most trinket effects (shop/economy mechanics -- free purchases, gift rarity,
   * per-day grants) have no entry here and remain real, cited, browsable-only corpus data,
   * same treatment as most Trainer abilities and the shop-economy scope gap (research.md B6).
   * Deliberately a flat list, not the full creature AbilityTag/TargetSelector shape --
   * every trinket effect this maps applies to "your team," unconditionally, so there is no
   * positional targeting to encode.
   */
  effectTags?: { stat: ModifierStat; amount: number }[];
}
```

**Engine implication**: `simulate()`'s Phase A modifier resolution (`sumModifier`) now also
sums `effectTags` from every trinket in `config.trinketIds`, as an *additional* implicit team-
wide modifier source alongside the user's own manual `teamModifiers` -- additive with it, same
no-precedence rule the manual carry-over `StatModifier`s already follow with each other.

### 2026-10-06 (round 8) — `SimulationResult.dpsRateSeries`; new `src/engine/optimize.ts` module

Per research.md J6/J7 (FR-068/FR-069). Additive; nothing existing changes shape.

```ts
interface SimulationResult {
  // ...existing fields unchanged...
  /** Instantaneous damage per second in 1-second buckets. The cumulative series is monotonic and
   * so cannot show whether output is accelerating; this is the rate view. Derived from the same
   * `timeline`, so integrating it reproduces `cumulativeSeries`'s total (asserted by test). */
  dpsRateSeries: { tSeconds: number; dps: number }[];
}
```

**Bucket size is 1 second, deliberately**: it matches the Poison tick interval and the per-second
framing used throughout the UI. Finer buckets render as a comb of per-cast spikes; coarser ones
flatten the ramp the chart exists to show. Buckets are half-open `(k, k+1]` — clamping a boundary
tick into the final bucket is the bug that inflated round 7's own evidence ~2× (research.md I13).

**New engine module `src/engine/optimize.ts`** (not part of `simulate()`): `suggestPlacement()`
searches arrangements of the placed creatures (≤720) scored by `scoreConfiguration()`, which
discounts damage by `0.5 ^ (t / 10s)` so earlier damage counts for more. `analyzePositionalCoverage()`
returns what the search could and could not reason about, so the UI can state its blind spot — the
module deliberately exposes its own limits as a first-class return value rather than only a result.

### 2026-10-06 (round 7) — `SimulationResult` gains second-order status metrics; DOT damage is attributed

Per research.md I13 (FR-055/056/057). Three related changes, all additive — no existing field
changes shape or meaning:

```ts
interface SimulationResult {
  // ...existing fields unchanged...

  /** Status stacks APPLIED per second, by status. Distinct from `perStatusPerSecond`, which is
   * DAMAGE per second. Both are needed: a user reading only the damage figure cannot tell whether
   * it is a steady rate or one that is still climbing. */
  perStatusAppliedPerSecond: Record<StatusEffectType, number>;

  /** Growth of the damage rate, in damage per second per second, by status.
   * Computed from the simulated timeline by bucketing tick damage into 1-second windows and
   * taking a least-squares slope -- NOT from a closed-form assumption about how stacks compound,
   * so it stays correct if the decay rules are later refined.
   * Positive for BOTH Poison and Burn in practice (an earlier draft wrongly said Burn was ~0):
   * Poison's stacks never decay so it grows forever, while each Burn instance sheds 1 layer per
   * tick regardless of size, so a large application outlives the battle and new ones pile up
   * faster than old ones drain. Only a small burn stack settles quickly. */
  perStatusDamageGrowthPerSecond: Record<StatusEffectType, number>;
}
```

**Why this is a mechanics consequence, not a reporting preference**: `applyStatusTick` decrements
layers for Burn but deliberately not for Poison (research.md B2). So each Poison application
permanently raises a per-tick damage floor and the rate grows without bound, while Burn self-limits.
Measured on a representative team, Poison's final-second damage was **293** against a 20-second
average of **65.50** — a ~4.5× spread hidden behind one number.

**Prerequisite fix (FR-057)**: `simulate()` currently pushes an `ongoingChange` timeline event when
Shock or Shield is applied but **not** when Burn or Poison is. Burn/Poison appear in the timeline
only as ticks, so applications are not countable. Those events are added, making all four statuses
symmetric in the timeline. This is a pre-existing asymmetry being closed, not a new concept.

**Facilitated damage widened (FR-056)**: `ActiveStatus` gains the applying creature's key alongside
its existing `sourceSlot`, and each Burn/Poison tick's damage accrues to that creature in the same
`facilitatedDamage` map Shock procs already feed. A pure DOT applier currently reports `0.00` own
DPS *and* `0.00` facilitated DPS, which states it contributes nothing.

Facilitated output stays **separate** from own-DPS rather than being merged into it: a DOT
applier's contribution genuinely is not direct damage, and folding them together would make a DOT
team's DPS column incomparable with a direct-damage team's.

### 2026-10-06 (round 7) — UI primitives layer and design tokens (Constitution Principle VII)

Per research.md I14. **No data-model types change** — recorded here because it is a structural
contract every UI surface is now bound by, not a one-round styling pass.

- **Tokens** (CSS custom properties, one definition site): spacing scale, radii, surface and border
  colours, type scale, and **sprite sizes**. Referenced by name; literals are a defect.
- **Primitives** (local components over the existing CSS-modules approach — not a component-library
  dependency): `Surface`/`Card`, `Chip`, `StatBadge`, `Modal`, `Disclosure`, `SectionHeading`,
  `TypeSplit`. Each has ≥2 existing call sites today, so none is abstraction ahead of need
  (Principle VI).
- **`TypeSplit` replaces `typeBackground()`'s gradient** (FR-049): the
  `linear-gradient(..., A 50%, B 50%, ...)` hard stop antialiases at fractional pixel widths and
  bleeds a 1px sliver of the far colour, which the default `background-clip: border-box` then paints
  under the card's transparent border. Two explicitly-sized halves cannot produce that seam.
  `typeColor()` is unchanged and still the single source of truth for which colour a type is.

### 2026-10-06 (round 6) — `spriteFile` added to `CreatureRecord` and `TrinketRecord`

Per research.md H3. Sprites are vendored into the repo, so each record stores the **filename**
its sprite was published under, not a full URL or a derived-from-`id` convention (4 species have
a batodex slug that differs from this corpus's `id`, so convention-derivation would 404):

```ts
interface CreatureRecord extends Provenance {
  // ...existing fields unchanged...
  /**
   * Vendored sprite filename, resolved against `${import.meta.env.BASE_URL}sprites/monster/`.
   * Stored per record because the publishing slug is not always this record's `id` -- 11 of 149
   * species differ (e.g. `craghorn` publishes as `alpinine.png`, `pyronade` as
   * `infernade.png`, `null00` as `null_00.png`) -- research.md H3.
   * Absent = render the existing text-only card; never a broken <img>.
   */
  spriteFile?: string;
  /**
   * The ability's trigger label, shown as its own line above the description on the in-game card
   * (e.g. "On Battle Start", "On Cast", "Ongoing") -- research.md H1. `abilityText` continues to
   * hold only the description. Absent = render the description alone, with no empty trigger line.
   */
  abilityTrigger?: string;
}
```

`TrinketRecord` gains the same optional field, resolved against `sprites/trinket/`.

**Not** added: image width/height/alt as data. All sprites are uniformly 48×48 (verified), and
alt text is derived from `name` at render time — storing either would be duplicated state.

### 2026-10-06 (round 6) — Canonical stat and rarity colour maps (UI-only)

Per research.md H2. Two new canonical maps alongside round 3's existing `typeColors.ts`, with the
same rationale (one source of truth for a colour the UI uses in several places):

```ts
// src/data/statColors.ts
export const STAT_COLORS: Record<"damage" | "burn" | "poison" | "shock" | "shield" | "heal" | "multicast", string>;
export const RARITY_COLORS: Record<Rarity, string>;
```

These are the **game's own** published colours (research.md H2's cross-check against the
user-supplied in-game card), not a palette chosen here. `Rarity`'s `"SuperRare"` member maps
explicitly to the published `"Super Rare"` colour — no string munging between the two spellings.

Purely presentational: no engine module reads these, and `StatusEffectType`/`DamageType` are
unchanged. Deliberately keyed by lowercase stat key (matching the published data) rather than
reusing `StatusEffectType`, because the set includes `damage`, `heal`, and `multicast`, which are
not status effects.

### 2026-10-06 (round 6) — Simultaneous casts resolve against a common pre-cast status snapshot

Per research.md H8 — a **behavioural correction** to `simulate()`, not a type change.

Previously, Phase B walked casts in `(tSeconds, stableSlotIndex)` order while mutating a single
shared `shockLayers` counter, so a Shock layer applied by one creature at time *T* empowered
another creature's hit at the *same* time *T* if and only if the applier happened to sort first.
Slot position therefore changed damage output for creatures with no positional ability at all.

New rule, in **two** required parts (research.md H8 — part 1 alone leaves a second, reproducible
manifestation via Multicast, and part 2 alone does not fix same-timestamp collisions):

1. **Phase B walks a genuinely chronological event list.** Multicast repetitions are flattened into
   the cast list and the whole list sorted by `(tSeconds, stableSlotIndex)` *before* walking it.
   Today repetitions are expanded inline inside the cast loop, so a cast at t=5.0 with a repetition
   at t=5.1 is processed entirely before another creature's t=5.0 cast that sorts later — meaning
   Phase B never visited timestamps in order, and round 4's 0.1 s stagger did not make it do so.
2. **Within one timestamp, every cast's Shock proc resolves against the layer state as of the
   moment that timestamp began.** Layers granted at *T* take effect from the next distinct
   timestamp onward. The snapshot covers **both** `shockLayers` (the scalar total) **and**
   `shockLayersBySource` (the per-source attribution map) — snapshotting only the total would fix
   `perStatusPerSecond.Shock` while leaving `perCreatureFacilitatedDps`, the column the user
   actually reported, still order-dependent.

Consequences:

- `SimulationResult` keeps its exact shape; `timeline` keeps its documented stable ordering and
  tie-break (which remain correct for *display* — they just no longer decide damage).
- The invariant this establishes, and which the regression test asserts: **permuting the slots of
  creatures that have no positional `abilityTags` must leave every number in
  `perCreatureDps`, `perCreatureFacilitatedDps`, and `perStatusPerSecond` unchanged.**
- Multicast repetitions still occupy distinct timestamps 0.1 s apart (round 4) and a burst still
  escalates its own Shock layers across its repetitions — but they are now *sorted into* the global
  event order rather than expanded inline, which is what makes a Multicast creature's output
  permutation-invariant too. Verified reachable with real data: 7 creature records have Multicast
  > 1 *and* apply Shock, and Bumblebolt at level 4 reproduced 20.55/s vs 21.60/s across a slot
  permutation before this fix.
- Not chosen as "what the game does frame-for-frame" (undocumented, research.md H8); chosen
  because it is invariant under the permutation the user correctly says should not matter.

### 2026-10-06 (round 6) — UI-only restructure: shared card, per-mon modifiers, layout moves

Per research.md H1/H4/H5/H6/H7. **No type changes** — recorded here so the layout contract is
written down rather than living only in component code:

- **One shared creature-card component** renders the game's four bands (header / sprite+types /
  cooldown+per-stat lines / ability) and is used by *both* the Corpus Browser and the Calculator's
  selected-mon panel. The Calculator's panel adds a fifth "Effective this battle" band — this
  project's own differentiator, kept visually separate from base stats, not merged into them.
- **Shop cost leaves the battle-stat band** (it is not on the game card) and is shown as
  secondary metadata.
- **`teamModifiers` stays in `TeamConfiguration` and in `simulate()`.** Round 6 removes only the
  *UI option* for creating one by hand; the field itself remains load-bearing because round 5
  routes trinket `effectTags` through it. Removing the engine path would silently disable
  trinkets.
- **Corpus Browser stops rendering `sourceRefs`/`patch`/`conflicts`.** The data stays in the
  corpus modules unchanged and still satisfies Principle IV; see the matching spec.md amendment
  for why this does not abandon SC-004, and what replaces the UI as the enforcement surface.

### 2026-10-05 (round 4) — UI: click-anywhere assignment; drop redundant slot labels

Per research.md F4 — no type change. `GridPicker`'s separate "Choose…"/"Change…" button is
removed; the slot's card/placeholder itself becomes the click target that opens
`CreatureSearchModal` (coexisting with round 3's drag handlers on the same element, since
`@dnd-kit/core`'s pointer sensor only engages past a drag-distance threshold). `TeamSummary` and
`PlacedCreatureDetails` drop their displayed slot-position text (e.g. "Back 1") — the per-slot
*keying* (`${creatureId}@${slotKey}`) is unchanged, only the label shown to the user.

### 2026-10-05 (round 3) — Persistent side-panel "highlighted slot" is UI state, not team data

Per research.md E2.7 — the reference UI's hover-anchored detail popup disappears on
pointer-leave and can visually cover other cards. The redesigned detail view is a single,
layout-reserved side panel driven by a `highlightedSlot: GridSlot | null` value that:

- updates on hover/focus of a *different* placed creature's card,
- is **never cleared** by hover/focus-leaving a card (sticky — keeps showing the last-highlighted
  creature),
- defaults to the first placement (or an empty-state message if none) rather than nothing.

This is **transient UI state, not part of `TeamConfiguration`** — it does not get persisted,
shared via "Copy URL"-style serialization (not a feature of this project, but worth stating the
boundary explicitly), or read by `simulate()`. It lives in the team-builder's own component
state, same category as (not merged into) `TeamConfigContext`.

### 2026-10-05 — Shield counted as an output stat, not just absorption

`perStatusPerSecond.Shield` and `cumulativeSeries[].byStatus.Shield` now track the cumulative
*Shield granted* by the team's own casts (same treatment as Burn/Poison/Shock), not Shield
*absorption* against an opposing target (which still isn't modeled — see `simulate.ts`'s T037
comment). This answers "how much Shield is this team generating over time", which is what the
summary table and chart surface as "Shield".

## Round 4 (2026-10-06): regions, painted types, trainer creature sets, cascading grants

Previous rounds added engine concepts without a data-model entry, which the round-3 validation
flagged. These are recorded before implementation, not after.

### Region (new entity) — WI-005

```ts
type RegionId = "pantra" | "jinto" | (string & {});
```

**Also on `TeamConfiguration`** (pass-1 gap): `selectedRegion: RegionId` — the ask's own wording is
*"the player chooses a region before they choose anything else when starting a game"*, so region is
a configuration choice, not only a creature attribute. T235's "opposite region" filter is undefined
without it.

Source for per-creature attribution: batodex's `sets` field (research.md M6).

> **"Opposite region" is NOT a complement.** 14 species belong to both regions and 13 to neither
> (research.md M6). `opposite(starter)` must mean "sets includes the other region AND excludes the
> current one", not `!== selectedRegion`, which would wrongly sweep in all 27 edge cases.

Added to `CreatureRecord` as `region?: RegionId`. Optional, because our corpus was imported before
region existed as a concept and not every record can be attributed with confidence; an unattributed
creature is reported as unknown rather than defaulted into Pantra, which would silently make
Smuggler's "opposite region" wrong.

Open union rather than a strict two-value type: the official notes say "the power level of **all
regions**", which does not commit to there being exactly two (research.md M4).

### PaintedType — WI-001, WI-007

A painted creature counts as **every** type for any `typeFilter` the engine tests. Modelled as a
sentinel rather than by expanding `types` to the full list, for two reasons:

1. Expanding the list would make "how many different types does this creature have?" return the
   whole enum, which is wrong for any ability that counts distinct types (e.g. Prismagon's "+10
   Damage for each unique type on your team").
2. The UI must render one rainbow chip, not twelve chips.

```ts
/** On TeamConfiguration — species ids, NOT placement slots. */
paintedCreatureIds: string[];
```

**Species, not placements** (research.md M1): *"Whenever these specific species appear in your shop
or on your board"*. Painting Mosslug paints every Mosslug you own, so keying by slot would be wrong
the moment a second copy is placed.

### Type matching rule (behavioural change)

Every `typeFilter` comparison must go through one predicate. There are **six** sites, not the four
previously asserted here, and only two are in `effects.ts` — pass-1 validation caught the error:

| Site | Painted must apply? |
|---|---|
| `effects.ts:122` (selector filters) | yes |
| `effects.ts:279` (`statFromCount`) | yes |
| `simulate.ts:118` (adjacent cooldown grants) | yes |
| `simulate.ts:121` (allAllies cooldown grants) | yes |
| `corpus.ts:130` (browser search filter) | yes — a painted creature should surface under any type |
| `CreatureSearchModal.tsx:58` (picker filter) | yes — same reason |


```ts
creatureHasType(creature, type, config) // true for any `type` when the creature is painted
```

This replaces the four direct `creature.types.includes(...)` tests. One predicate, because the
round-10 lesson was that duplicating a "supported" test in two places let them drift.

### TrainerCreatureSet — WI-002, WI-004, WI-006

```ts
/** On TeamConfiguration. Both are declared here; both need a task that ADDS them. */
paintedCreatureIds: string[];
smuggledCreatureIds: string[];
```

> **`TrainerRecord.supersededText` was added for T228's Painter correction and has since been
> removed** (2026-10-06). The card rendered it as a "Previously recorded (corrected)" disclosure,
> which the user called useless info on the card — and once nothing rendered it, the field was
> unread data. The correction itself is fully recorded in research.md M1, which is where provenance
> belongs.

Both sets are **user-chosen, never generated**. The app models a run the player is already looking
at; randomising would produce a board they cannot reconcile with their screen (WI-006).

Default size 9 for both. The rarity shape 2 Common / 2 Uncommon / 2 Rare / 2 Super Rare / 1
Legendary applies to **Painter only** — pass-1 validation found it had been extended to Smuggler on
Painter's evidence. The source (research.md M3) describes Painter's "random assignment"; Smuggler's
recorded text mentions neither 9 creatures nor rarity, and the ledger claims only "9 random mons"
for it. Shown as guidance and **not enforced** even for Painter, since the source says "typically".

### Cascading on-cast grants — WI-009, WI-010, WI-011

No new entity. `buffOnCast` (round 11) already expresses this and its FR-040 snapshot timing already
produces the user's sequences. The change is a **constraint removal**:

> **Superseded**: "modifiers can only scale an effect the creature already has."
> That rule must NOT apply to ability grants: Bonshell has `baseDamage: null` and demonstrably deals
> 80 damage from its second cast (research.md M5). An ability grant may bring a damage effect into
> existence.
>
> **Amended 2026-10-07**: this entry originally added "a user modifier may not", preserving the rule
> for user input. That distinction is now gone — user modifiers create effects on the same terms as
> ability grants. Keeping the two paths apart is what let the engine apply a grant and drop a
> modifier for the same creature in the same battle.

## Round 5 (2026-10-06): evaluable stats, phased resolution, trigger enum, shiny abilities

### StatValue — the load-bearing change (WI-002, WI-003)

`ResolvedPlacement` stops being a bag of final numbers:

```ts
interface StatValue {
  base: number;
  flatAdd: number;              // added BEFORE the multiplier
  multiplier: number;           // default 1
  postMultiplierFlatAdd: number; // added AFTER — reactive gains land here
}
const read = (v: StatValue) => (v.base + v.flatAdd) * v.multiplier + v.postMultiplierFlatAdd;
```

Why each slot exists, with the capture evidence:

- **`multiplier` applies at READ time, not bake time.** Noxnimbus's +6 to a creature carrying +70%
  produced +10, not +6: `(604+6)×1.7 = 1037`, `(11+6)×1.7 = 29`. Snapshot-then-add gives 1033 and
  25. The multiplier is re-evaluated on every change.
- **`postMultiplierFlatAdd` is separate because reactive gains are never scaled.** Thorntail
  entered at 7082 displayed damage against a listed base of 50 — huge modifiers — yet every
  increment was exactly **+24**, its unmultiplied listed value. Adding it to `base` would inflate it
  by ~140× per stack.

A new `statMultiplier` tag kind expresses the +70% effect, which the vocabulary cannot currently
represent at all.

### ResolutionPhase (WI-001)

Battle start resolves in three ordered phases, each reading the **completed** output of the previous:

| phase | contents | evidence |
|---|---|---|
| 1 | percentage / multiplier stat scaling | Cobrex 604 → 1027 before anything else reads it |
| 2 | position-based battle-start effects | `-COOLDOWN` popups at t=1.9948, before Miasmaw changes at t=2.0396 |
| 3 | dynamic battle-start abilities reading team state | Miasmaw's 1080 = its 14 + allies **including post-multiplier Cobrex 1027** |

> **Supersedes** `effects.ts`'s current comment that battle-start effects "must read their BASE
> values, or the result would depend on which creature happened to resolve first". The hazard is
> real but the game solves it by **phase ordering**, not by reading base values. Writers before
> readers. Miasmaw is 1080 in-game vs 657 modelled — a 39% understatement on the board's largest
> Poison application.

Every tag kind must be classified into a phase; an unclassified kind is a bug, not a default.

### Time-varying resolution (WI-004, WI-005, WI-007)

`resolveEffects` returns the **initial** state plus handlers registered by trigger; `simulate()`
invokes them mid-battle. Required because the resolver runs once, before the event loop, and never again.

> **The handoff's "every on-cast and reactive ability is structurally unreachable" is no longer
> true**, and the data model must not repeat it: round 11's `buffOnCast` (`simulate.ts:607`) and
> round 4's ally-cast hook (`:653`) already fire on-cast abilities. The restructure is still the
> right shape, but it now carries a **double-application hazard** — adding handlers alongside the
> existing paths makes Noxnimbus's +6 fire twice per cast. Retiring or wrapping them is a required
> decision, not an implementation detail (research.md N6).

New tag kinds:

- `statMultiplier` — the ×1.7 class of effect (WI-002).
- `statFromTargetStatus` — "Damage equal to 200% of the Poison stacks on the enemy". Recomputed
  **per cast** and not persisted; it is neither `base` nor a flat add.
- `triggerOnAllyTrigger` — a reactive cast. **Must not reset or consume the reactor's own
  cooldown**: Puffloon's bar climbed monotonically 13→19px through a four-hit cascade and it still
  cast off its own 10s cycle afterwards.

### Sprite fields (WI-015, WI-016)

`ShinyStatLine` gains `spriteFile?: string`; `TrainerRecord` gains `spriteFile?: string`; and
`Sprite`'s `kind` union gains `"trainer"` (it is `"monster" | "trinket"` today, and
`public/sprites/` has only those two directories).

**Availability ceilings, recorded because every other data item this round reports its shortfall:**

- **Shiny sprites: 139 of the 144 snapshot monsters**, against a corpus of 149 species — so ~10
  species will have no shiny sprite and must fall back to the normal one rather than rendering
  nothing.
- **Trainer sprites: 24 published against our 23 records**, but **12 of our 23 ids do not match
  batodex's** — `chef`→`pyromaniac`, `lucky-girl`→`youngster_f`, `rich-lady`→`lady`, plus nine
  hyphen-vs-underscore cases. **Match by NAME, not id.** All 23 resolve by name. This is the exact
  lesson `vendor-sprites.mjs` already records for monsters ("id-matching silently misses 11"), and
  an id-keyed script here would silently miss **over half** the trainers.

### AbilityTrigger (WI-010)

Closed union replacing the free string, sourced from batodex's own `trigger` field (research.md N2):

```ts
type AbilityTrigger =
  | "Ongoing" | "On Cast" | "On Battle Start" | "On Bought"
  | "On Victory" | "On Knocked Out" | "On Trinket Gained" | "On Battle Lost";
```

`null` is a legitimate value (an ability with no trigger), distinct from "not yet researched".

### Shiny abilities (WI-012, WI-013, WI-014)

`ShinyStatLine` gains `abilityText?: string`, keyed as today by `id|level`.

**For FR-105 (text must drive calculations), the shape is decided here rather than left to the
implementer**: `ShinyStatLine` also gains `abilityTags?: AbilityTag[]`. A full tag list, not a
"magnitude override", because the shiny text can differ structurally and not merely in magnitude,
and a second override mechanism would be a third way to express an ability. When
`abilityTags` is absent the normal tags apply unchanged — that is the common case, since 165
level-records have identical text. Shiny ability text
differs at **343 of the 508 level-records that have both** (research.md N1), which is where shiny's
uplift actually lives — the stat lines are identical for 299 of them.
*Corrected in pass-2 remediation: this said "315 of 470", a figure research.md N1 had already
retracted. Regenerate with `node scripts/audit-batodex.mjs`.*

> **The ask's "All shiny mons get better stats" is NOT upheld at the stat level** and the existing
> downgrade guard in `shiny.test.ts` must not be deleted to make it true: **28 stat records across
> 7 species** are worse (Kappow is 1s SLOWER). In aggregate throughput it is 222 better / 299 equal
> / 15 worse. *Corrected in pass-3 remediation: this said "20", the figure research.md N1 retracts
> as an undercount from not checking status amounts. Regenerate with
> `npx vite-node scripts/audit-shiny.mjs`.*

## PerCastOutput (2026-10-06) — one shape for "what a creature emits per cast"

```ts
interface PerCastOutput {
  damage: number | null;
  damageType: DamageType | null;
  appliesStatus: { type: StatusEffectType; amount: number }[];
  heal: number | null;
  multicast: number;
  damageUnconfirmed: boolean;   // all fields REQUIRED — see below
}
```

Produced by both renderers of that concept:

- `perCastOutputOf(creature)` — a record's published output.
- `SimulationResult.perCreatureEffectiveStats[key].output` — the battle-adjusted output.

### Why this exists, and why nothing is optional

`buildStatLines` was *already* shared by the creature card and the "Effective this battle" band, so
the component was never duplicated. The duplication was one level down: the function took a loose
parameter bag in which `healAmount` and `multicast` were **optional**, and each call site
hand-mapped its own differently-named source onto it — `creature.healAmount` against
`effective.heal`, `creature.baseMulticast` against `effective.multicast`.

Optional fields plus hand-mapping meant forgetting one compiled cleanly, and one was forgotten:
the effective band never passed healing, so **9 species whose only output is a heal rendered "No
published per-cast output" directly beneath a card showing their heal**, and 20 more silently lost
a Heal line.

Every field is required so a producer that forgets one is a **type error**, not a blank panel. The
engine's effective stats are now `{ output: PerCastOutput; cooldownSeconds }`, so the band passes
`effective.output` straight through with no field list at all. Adding a future output stat breaks
both producers at compile time, which is the only mechanism that keeps two renderings of one
concept honest (Constitution Principle VII).

## Build sharing (2026-10-06) — `src/data/share.ts`

Two separate artefacts, deliberately not conflated:

| | what it is | restores a build? |
|---|---|---|
| **Build code** (`bat1:<base64url>`) | the build itself | **yes** |
| **Build id** (8 hex chars) | a fingerprint *of* the build | **no** |

The ask asked for export/import "with a UUID value… so that time-sensitive work isn't lost". A hash
is not reversible, so a UUID **alone** can never restore a team — and losing work is exactly what a
hash-only scheme would do. The id is therefore an identity (is this the same team as yours?), and
the code is the thing you keep.

The id is **content-derived, not random**: a random UUID would differ on every export of the same
team, defeating both uses.

### Canonicalisation is the load-bearing part

The same team has many representations — slots in a different array order, trinkets listed
differently, an absent optional versus an empty array, modifiers carrying freshly-generated session
ids. All must produce the same fingerprint, or the id fingerprints the *editing history* rather than
the team. `canonicalise()` sorts placements by slot, sorts every id list, normalises `shiny`
`undefined`/`false`, and strips modifier ids.

Import **replaces** rather than merges: merging has no correct answer for a slot occupied in both
teams, and guessing would quietly corrupt the imported build. It throws rather than loading a
partial team — a build that silently drops a creature is worse than one that refuses to load.

## Manual triggers (2026-10-07) — abilities the battle engine cannot fire

Sixteen creatures have a repeatable permanent stat gain whose trigger happens **outside the battle
being simulated**: using an item (Craghorn), buying a monster (Guardiant), gaining a trinket
(Dollhime), winning a round (Brawlmantis). Real abilities with real numbers, and nothing for the
resolver to hook.

Recording them anyway lets the UI offer a one-press button, instead of the user hand-typing
"+20 Damage, +20 Shield" into the modifier editor on every item use.

### The trigger is the unit, not the creature

```ts
{ kind: "manualTrigger"; trigger: AbilityTrigger; effects: { stat: ModifierStat; amount: number }[] }
```

`TRIGGER_DEFINITIONS` in `src/data/triggers.ts` holds one entry per `AbilityTrigger` — its action
label, its description, and **`enginePropagated`**: whether the simulation already applies it.
Adding a creature is a data change with no code; adding a trigger is one entry.

`AbilityTrigger` gained two values batodex leaves null, read from ability text instead:
**`On Item Used`** (Craghorn) and **`On Knockout`** — distinct from the existing `On Knocked Out`,
which is about *this* creature dying rather than any monster.

### The double-count hazard, and the two guards against it

If the engine already applies an effect, a button would let the user bank it again and double it.
Two tests keep the mechanisms disjoint:

- no creature has both a `manualTrigger` and an engine-resolved tag;
- no `manualTrigger` names a trigger whose `enginePropagated` is true.

### Why presses write placement modifiers

A banked trigger is indistinguishable from a modifier typed by hand — both are "this creature
carries a bonus the engine cannot derive". One representation means one display path, and the build
code already round-trips it. `addPlacementModifier` accumulates same-stat entries, so two presses
give one chip at double the amount rather than two chips.

`manualTrigger` is deliberately **absent from `RESOLVED_TAG_KINDS`**: coverage must keep counting
these as unmodelled, or the counter would claim abilities the engine does not compute. The audit
script reports them in their own category rather than as "inert", which previously meant "read by
nothing" and would have mislabelled nine working creatures.
