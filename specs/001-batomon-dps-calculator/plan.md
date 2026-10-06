# Implementation Plan: Batomon Showdown DPS & Status Calculator

**Branch**: `001-batomon-dps-calculator` | **Date**: 2026-10-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-batomon-dps-calculator/spec.md`

## Summary

Build a static, client-only TypeScript/React SPA that (1) hosts a cited, versioned corpus of
Batomon Showdown creatures/trainers/trinkets/items, (2) lets a user assemble a ≤6-creature team into
the game's real 2x3 grid with a Trainer, and (3) runs a deterministic, headlessly-testable
simulation engine that reports each creature's DPS and each status effect's per-second value, plus a
chart of cumulative damage/status over a configurable time window — grounded in the real Cooldown
Speed, Burn/Poison/Shock, Shield, and Trigger/Ongoing mechanics researched in research.md.

## Technical Context

**Language/Version**: TypeScript, latest stable (7.x)

**Primary Dependencies**: React 19.x, Recharts, Vite, `@dnd-kit/core` (added round 3,
2026-10-05 — drag-and-drop placement editing, research.md E2.5)

**Storage**: None — static corpus data bundled as TypeScript modules; no database, no backend

**Testing**: Vitest (engine unit tests, headless) + `@testing-library/react` (component tests)

**Target Platform**: Static web, any modern evergreen browser, deployed to GitHub Pages

**Project Type**: Single-page web application (frontend-only)

**Performance Goals**: Recompute + re-render summary/chart within 1s of any team-config change
(spec SC-002), on typical consumer hardware

**Constraints**: Zero backend; fully static bundle; must run with no network access once loaded

**Scale/Scope**: ~100–150 creature records + trainers/trinkets/items; one active ≤6-creature team
simulated at a time; simulation windows on the order of 10–60 simulated seconds

## Constitution Check

*GATE: evaluated before Phase 0 research and re-evaluated after Phase 1 design below.*

| Principle | Compliant? | How |
|---|---|---|
| I. Static-Data, Engine-Driven Architecture | ✅ | `src/data/**` (corpus) / `src/engine/**` (pure `simulate`, `effectiveCooldown`, etc.) / `src/ui/**` are three separate directories; engine contract (contracts/engine-api.md) takes plain data in, plain data out, no React import |
| II. TypeScript Strict Mode | ✅ | `tsconfig.json` strict family enabled from project scaffold; data-model.md defines closed discriminated unions for every enum-like field (`Rarity`, `CreatureType`, `DamageType`, `StatusEffectType`, `AbilityTag`, `TargetSelector`) |
| III. Test-First Engine | ✅ | contracts/engine-api.md calls out exactly which functions need worked-example tests before dependents are written (`effectiveCooldown` against B1's 3 examples first) |
| IV. Cited, Versioned Corpus | ✅ | `Provenance`/`SourceRef`/`FieldConflict` are first-class data-model types every corpus record extends; `STATUS_VS_SHIELD_REDUCTION`-style engine constants also carry provenance per research.md B3 |
| V. Zero-Backend, Static Hosting | ✅ | No API routes, no server directory in the structure below; GitHub Actions → gh-pages |
| VI. Simplicity & Incremental Delivery | ✅ | tasks.md (next command) will sequence a small real slice (one DOT applier, one Shield/support unit, one positional-ability unit) before widening corpus coverage, per spec's own User Story priorities |

No violations — Complexity Tracking table is intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-batomon-dps-calculator/
├── plan.md              # this file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── engine-api.md     # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

```text
batomon_calculator/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
├── .github/
│   └── workflows/
│       └── deploy.yml           # build + publish dist/ to gh-pages on push to main
├── src/
│   ├── main.tsx                  # React entry point
│   ├── App.tsx                   # top-level routing: Calculator view / Corpus Browser view
│   ├── data/                      # Constitution Principle I — data layer, zero engine/UI imports
│   │   ├── types.ts               # data-model.md's shared primitive + corpus types
│   │   ├── creatures.ts           # CreatureRecord[] corpus, cited
│   │   ├── trainers.ts            # TrainerRecord[] corpus, cited
│   │   ├── trinkets.ts            # TrinketRecord[] corpus, cited
│   │   ├── items.ts               # ItemRecord[] corpus, cited
│   │   ├── corpus.ts              # assembles the above into one `Corpus` lookup object
│   │   └── typeColors.ts          # TYPE_COLORS/typeColor() canonical map (round 3, data-model.md)
│   ├── engine/                     # Constitution Principle I — pure, headless, no React import
│   │   ├── cooldown.ts             # effectiveCooldown (research B1)
│   │   ├── status.ts               # applyStatusTick, applyShockProc (research B2/B4)
│   │   ├── shield.ts                # applyShieldReduction + STATUS_VS_SHIELD_REDUCTION (B3)
│   │   ├── grid.ts                  # GridSlot/adjacency helpers (research B5)
│   │   ├── simulate.ts              # top-level simulate() — contracts/engine-api.md
│   │   ├── errors.ts                # InvalidTeamConfigurationError
│   │   └── __tests__/
│   │       ├── cooldown.test.ts     # the 3 worked examples from research B1, written first
│   │       ├── status.test.ts
│   │       ├── shield.test.ts
│   │       └── simulate.test.ts
│   ├── ui/
│   │   ├── GridPicker/              # 2x3 slot assignment UI; round 3 gains @dnd-kit drag/drop
│   │   │                              + a search modal (FR-018) alongside the existing <select>
│   │   ├── TeamSummary/              # DPS + per-status-per-second table (FR-009)
│   │   ├── CumulativeChart/          # Recharts wrapper over SimulationResult.cumulativeSeries
│   │   ├── CorpusBrowser/            # search/filter + conflict display (User Story 3)
│   │   └── shared/
│   └── context/
│       └── TeamConfigContext.tsx     # the one shared editable object (research A3)
└── tests/
    └── setup.ts                      # Vitest + testing-library setup
```

**Structure Decision**: single-project frontend-only layout (no `backend/` directory — Constitution
Principle V forbids one). The three-way `data/` / `engine/` / `ui/` split under one `src/` is the
direct implementation of Constitution Principle I; it is a plain directory convention, not a
monorepo/workspace split, because the project has exactly one deployable artifact.

## Complexity Tracking

*No entries — Constitution Check above has no unjustified violations.*

## Amendment: Round 2 (2026-10-05, via `/speckit-plan`)

User-reported items this round (full Trainer roster + repositioning, per-creature effective-stat
breakdown, chart X-axis consistency, per-level creature stats, and a "DPS went to zero"
regression report later diagnosed as a pre-existing data gap) are resolved in:

- research.md section D (D1–D5): Trainer roster + citations, level-scaling (1–4) mechanics,
  Multicast/Trigger clarification, chart-axis root cause, corpus-completeness baseline + diagnosis.
- data-model.md's matching 2026-10-05 (round 2) amendments: `unconfirmedFields` promoted onto
  `Provenance`; `CreatureRecord.level` widened to `1 | 2 | 3 | 4` + the `(id, level)` lookup bug
  this surfaces in `simulate.ts`; `baseMulticast` added; new `SimulationResult.
  perCreatureEffectiveStats`; Trainer corpus widened (data entry only); chart X-axis fix (no type
  change).
- spec.md: FR-015/016/017 added, FR-001 amended, one new Edge Case, and a new Amendments section
  logging the SC-003 gap honestly and the regression-vs-data-gap diagnosis.

**Technical Context**: unchanged — no new dependencies, no new project type. **Constitution
Check**: re-evaluated, still ✅ across all six principles; the new engine work (Multicast firing,
`perCreatureEffectiveStats` resolution, the `(id, level)` lookup fix) is additional surface for
Principle III (test-first) to apply to when implemented, not an exception to it.

**Not generated by this command** (per `/speckit-plan`'s scope): `tasks.md` is not updated here —
run `/speckit-tasks` next to turn the above into dependency-ordered tasks before implementing.

## Amendment: Round 3 (2026-10-05, via `/speckit-plan`)

User-reported items this round: a trust/provenance question about an external reference site
(batomon.com — confirmed unofficial, research.md E1) and a team-builder UI/UX redesign direction
inspired by that site's layout, explicitly fixing 7 defects found in it. Resolved in:

- research.md section E (E1–E2): the trust investigation, and a defect-by-defect design decision
  for each of the 7 issues (search-modal autofocus/clear, drag-and-drop via `@dnd-kit/core`,
  canonical type-color mapping, evolution-aware leveling, a persistent non-overlapping detail
  side panel) — explicitly preserving this project's own differentiators (StatModifiers, DPS
  output) that the reference site lacks entirely.
- data-model.md's matching 2026-10-05 (round 3) amendments: `CreatureRecord.evolvesAtLevel`
  (paired with the existing `evolvesInto`) + a new `resolveLevelUp()` engine helper; a canonical
  `TYPE_COLORS`/`typeColor()` constant in a new `src/data/typeColors.ts`; drag-and-drop
  move/swap semantics (no `TeamConfiguration` shape change — purely a new UI interaction over
  the existing `setPlacement` mutation); an explicit note that the persistent side panel's
  `highlightedSlot` is transient UI state, not part of `TeamConfiguration`.
- spec.md: FR-018 through FR-022 added, one new Edge Case (branching evolutions — explicitly
  left unresolved rather than guessed), and a new Amendments entry logging both the design
  decisions and the trust-investigation context.

**Technical Context**: gains `@dnd-kit/core` as a new Primary Dependency (Phase 0 technology
decision, research.md E2.5 — chosen over native HTML5 Drag-and-Drop for built-in keyboard/
screen-reader support, and over `react-dnd` for less setup ceremony at this project's scale).
**Constitution Check**: re-evaluated, still ✅ — the new `resolveLevelUp()` engine function is
additional surface for Principle III (test-first) to apply to when implemented; the new
dependency is justified against Principle VI (no abstraction ahead of need) by the project's own
already-open accessibility task (`tasks.md` T054), not added speculatively.

**Not generated by this command**: `tasks.md` is not updated here — run `/speckit-tasks` next.

## Amendment: Round 5 (2026-10-06, via `/speckit-plan`)

User request this round: full level 2-4 creature stats (previously logged as blocked in round
4) and a Trinket selection feature. Investigating directly (not re-asserting the prior "blocked"
finding) found both are fully achievable: batodex.com embeds its entire creature database
(all 149 ids × 4 levels, by-level ability text, evolution chains) and its entire 93-entry
Trinket database as structured JSON inside each listing page's server-rendered React payload —
invisible to the markdown-converting fetch tool used in round 4, but directly readable via a
raw HTML fetch. Resolved in:

- research.md section G (G1/G2): the extraction technique, verified JSON structure, the
  149/149 and 93/93 id-coverage confirmation, and the resolution of round 4's open "branching
  evolution" question (Ignit→Flarilisk→Basilord is a victory-triggered chain, not a branch).
- data-model.md's matching 2026-10-06 (round 5) amendments: no schema change for creature
  levels (every field already existed from rounds 2-4) — this is a data-population task at
  scale, not a design task. `TrinketRecord` gains `rarity` and `effectTags` (flat team-wide
  stat bonuses only); `simulate()`'s modifier resolution sums `effectTags` from selected
  trinkets alongside the user's manual `teamModifiers`.
- spec.md: FR-026/027 added; the round-4 Edge Case about the level 2-4 "blocker" rewritten to
  instead require investigating raw page content before concluding data is unavailable; a new
  Edge Case for non-level-triggered evolutions (`evolvesInto` without `evolvesAtLevel`); new
  Amendments entry explicitly retracting F5's conclusion (not the act of having logged it).

**Technical Context**: unchanged — no new dependencies; the extraction is a one-time data
pipeline (`curl` + a Node script), not a runtime dependency of the shipped app. **Constitution
Check**: re-evaluated, still ✅ — Principle IV (cited corpus) is strengthened, not weakened, by
retracting an incorrect "unavailable" conclusion once evidence showed otherwise, and the new
`effectTags` field is deliberately narrower than the full creature `AbilityTag` shape
(Principle VI, no abstraction ahead of actual need — trinkets have no positional targeting to
encode).

**Not generated by this command**: `tasks.md` is not updated here — run `/speckit-tasks` next.

## Amendment: Round 4 (2026-10-05, via `/speckit-plan`)

User-reported items + a user-supplied in-game stat reference this round: two patch-driven
mechanic corrections (`STATUS_VS_SHIELD_REDUCTION` 25%->15%, Multicast staggered 0.1s apart
rather than simultaneous), two new corpus-data-only stats (Heal, Sell Value), two UI cleanups
(click-anywhere assignment, dropping redundant slot-position labels), and a corpus-scale-up
request that split into one achievable task (level-1 damage/cooldown for all remaining
creatures) and one **blocked** task (level 2/3/4 stats — no available source exposes them
outside a live JS UI, confirmed by direct fetch, research.md F5). Resolved in:

- research.md section F (F1–F6): both mechanic corrections with corroborating 1.2.0-era
  sources; Heal/Sell Value as corpus-only data; the two UI decisions; the level-2/3/4 blocker
  evidence; the level-1 scale-up scoping.
- data-model.md's matching 2026-10-05 (round 4) amendments: `STATUS_VS_SHIELD_REDUCTION`
  provenance update; the Multicast stagger fix (no type change); `healAmount`/`sellValue` added
  to `CreatureRecord`; the two UI changes (no type change).
- spec.md: FR-023/024/025 added, one new Edge Case (the level-2/3/4 blocker), new Amendments
  entry.

**Technical Context**: unchanged — no new dependencies. **Constitution Check**: re-evaluated,
still ✅ — the level-2/3/4 blocker is a direct application of Principle IV (never fabricate
corpus data), not an exception to it.

**Not generated by this command**: `tasks.md` is not updated here — run `/speckit-tasks` next.
