<!--
Sync Impact Report
Version change: [TEMPLATE] → 1.0.0 (initial ratification)
Modified principles: n/a (first adoption)
Added sections: Core Principles (I–VI), Technology Stack, Development Workflow, Governance
Removed sections: none
Templates requiring updates:
  - .specify/templates/plan-template.md ✅ no changes required (reads constitution generically)
  - .specify/templates/spec-template.md ✅ no changes required
  - .specify/templates/tasks-template.md ✅ no changes required
Follow-up TODOs: none
-->

# Batomon Calculator Constitution

## Core Principles

### I. Static-Data, Engine-Driven Architecture
All creature, trainer, trinket, and item data MUST live in versioned, typed data modules
(`src/data/**`) that are strictly separated from the simulation engine (`src/engine/**`) and the
UI (`src/ui/**` or `src/components/**`). The engine MUST be a pure, deterministic function of
(roster data + board layout + a fixed tick/time model) with zero dependency on React, the DOM, or
any UI state. Rationale: Batomon Showdown is a live-service game that patches regularly; the only
way to re-run the corpus or re-balance the engine without rewriting the UI is to keep data,
simulation, and presentation as three independently testable layers.

### II. TypeScript Strict Mode, No Escape Hatches
The project MUST compile under `strict: true` with `noImplicitAny`, `noUncheckedIndexedAccess`, and
no inline `// @ts-ignore`/`any` suppressions in engine or data code (UI glue code may justify a
narrow, commented exception). Damage types, status-effect kinds, creature types, and grid positions
MUST be modeled as closed discriminated unions, never bare strings. Rationale: the corpus is
hand-collected from fan wikis with inconsistent terminology; the type system is the primary defense
against a typo silently becoming a wrong damage calculation.

### III. Test-First for the Simulation Engine (NON-NEGOTIABLE)
Every mechanic the engine implements — cooldown-speed formula, DPS accumulation, damage-over-time
decay (poison/burn/shock), shield/overkill interaction, multi-target and position-based targeting,
trainer/ability triggers — MUST have a unit test written and shown failing before the mechanic is
implemented, and the test MUST cite the wiki source or worked example it is derived from in a code
comment. Rationale: timing and stacking math is the part most likely to silently drift from the
real game's behavior, and it is the part the whole calculator's credibility depends on.

### IV. Sourced Corpus Data
No single canonical datasheet exists for this game, so where a value was adjudicated between
disagreeing fan wikis, the sources and the reasoning MUST be written up in `research.md` and the
corpus record's numbers MUST match that write-up.

**Amended (2026-10-08):** this principle originally required per-record `sourceRefs`, `patch` and
`conflicts` fields. They were carried on all 596 creature records plus every trainer, trinket and
item, and nothing in the app or the engine ever read them — the UI that rendered them was removed
in round 6, leaving a test asserting the fields existed as their only consumer. The obligation to
source a number is kept; the obligation to repeat that sourcing inline on every record is not.

### V. Zero-Backend, Static Hosting
The application MUST ship as a fully static single-page app with no server-side component,
buildable with Vite and deployable to GitHub Pages via a GitHub Actions workflow. All computation
(corpus lookups, simulation, charting) MUST run client-side. Rationale: matches the self-hosting
pattern already proven for the author's other tools and keeps the project free to run indefinitely.

### VI. Simplicity & Incremental Delivery
Build the data schema, engine, and UI against a small, real slice of the corpus first (a handful of
creatures spanning the mechanics that matter: a DOT applier, a shield/support unit, a positional
ability) before widening to full corpus coverage. Do not add abstraction (plugin systems, generic
rule engines, etc.) ahead of at least two concrete creatures/trainers that need it. Rationale: the
corpus is large and still patching; premature generalization against incomplete/uncertain data is
wasted work.

### VII. Shared Design Language & DRY UI (added 2026-10-06, round 7)
Every visual surface is composed from a shared primitives layer, never styled ad hoc. Concretely:
design tokens (spacing, radii, surface/border colours, type scale, sprite sizes) live as CSS custom
properties in one place and are referenced by name, never re-typed as literals; any visual pattern
that appears on two or more surfaces (card/surface container, chip, stat badge, modal chrome,
collapsible disclosure, section heading, type-split background) is a single shared component that
both surfaces use; and any value rendered in more than one place (a cooldown, a stat, a creature
name) goes through one shared formatter so two surfaces cannot disagree about precision or wording.

A change that introduces a new bespoke card, chip, modal, or inline `style={{...}}` block
duplicating an existing pattern is a defect, even if it looks correct in isolation.

Rationale: by round 6 this project had three independent card treatments, two cooldown formatters
disagreeing on decimal places, duplicated modal chrome, chip styling defined in three files, and
six call sites each hard-coding their own sprite size — which surfaced as a batch of separate
user-reported visual bugs that were really one cause. Divergent styling is not a cosmetic concern;
it is a maintenance hydra where each fix must be chased across every copy.

This principle is **retroactive and forward-binding**: existing surfaces are migrated onto the
primitives layer as they are touched, and new work must compose from it rather than adding another
one-off. Where a round cannot complete a migration, the remainder is recorded as explicitly
outstanding rather than left implied.

## Technology Stack

- **Language**: TypeScript (strict mode), targeting the latest stable release.
- **UI framework**: React, latest stable major version, function components + hooks only.
- **Build tool**: Vite.
- **Charting**: a lightweight, typed charting library (final choice recorded in the implementation
  plan) rendering cumulative damage/status-value-over-time curves.
- **Hosting**: static export, deployed to the `gh-pages` branch via GitHub Actions, no backend,
  no database — the corpus ships as part of the client bundle.
- **Testing**: a unit-test framework capable of running the engine headlessly (no browser/DOM
  requirement for engine tests); UI tests may use a DOM-testing library.

## Development Workflow

- Corpus data changes (new/updated creatures, trainers, trinkets, items) are reviewed against the
  sources and reasoning recorded in `research.md` before merging.
- Engine changes require the failing-test-first evidence described in Principle III to be visible
  in the change (test added/updated alongside the implementation).
- UI changes that affect the DPS/status-per-second summary or the cumulative damage/status chart
  must be checked against at least one engine unit test's expected output, so the displayed numbers
  and the tested engine output cannot silently diverge.

## Governance

This constitution supersedes ad hoc practice for this repository. Amendments are made by editing
this file, bumping `CONSTITUTION_VERSION` per semantic versioning (MAJOR: principle removed/redefined
incompatibly; MINOR: principle or section added; PATCH: clarification/typo), and updating
`Last Amended`. Any plan produced by `/speckit-plan` must note how it complies with each principle
above or justify a deviation in that plan's Complexity Tracking section.

**Version**: 1.1.0 | **Ratified**: 2026-10-05 | **Last Amended**: 2026-10-06

<!--
  1.1.0 (2026-10-06, round 7): MINOR — added Principle VII (Shared Design Language & DRY UI).
  Added at the user's explicit request that it "inform and affect everything in this codebase"
  and apply "for all future requests/changes/tasks, not just for the code base existing up until
  this request was made" — which is a governance-level requirement, not a round-7 task note, so it
  is recorded here where every /speckit-plan and /speckit-implement run already reads it.
  See research.md I14 for the measured duplication that motivated it.
-->

