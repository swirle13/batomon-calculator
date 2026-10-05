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

**Primary Dependencies**: React 19.x, Recharts, Vite

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
│   │   └── corpus.ts              # assembles the above into one `Corpus` lookup object
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
│   │   ├── GridPicker/              # 2x3 slot assignment UI
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
