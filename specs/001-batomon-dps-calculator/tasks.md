# Tasks: Batomon Showdown DPS & Status Calculator

**Input**: Design documents from `specs/001-batomon-dps-calculator/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/engine-api.md,
quickstart.md (all present)

**Tests**: Included and REQUIRED for engine code — Constitution Principle III ("Test-First for the
Simulation Engine") is marked NON-NEGOTIABLE, so this is not the optional default; UI component
tests are included but not test-first-gated the same way.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: Maps to spec.md's US1 (P1), US2 (P2), US3 (P3)

## Path Conventions

Single project. All paths are relative to the repository root
(`/Users/matthew.johnson/Programming/batomon_calculator`), matching plan.md's Project Structure.

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Create directory skeleton per plan.md Project Structure: `src/data/`, `src/engine/`,
      `src/engine/__tests__/`, `src/ui/`, `src/context/`, `tests/`
- [x] T002 Scaffold Vite + React 19 + TypeScript project at repo root: `package.json`,
      `vite.config.ts`, `tsconfig.json` (strict family: `strict`, `noImplicitAny`,
      `noUncheckedIndexedAccess` all `true` per Constitution Principle II), `index.html`,
      `src/main.tsx`
- [x] T003 [P] Install and configure Vitest + `@testing-library/react`; add `tests/setup.ts` and a
      `test` block to `vite.config.ts`
- [x] T004 [P] Add Recharts dependency (`package.json`)
- [x] T005 [P] Configure ESLint + Prettier for TS/React at repo root (`.eslintrc.cjs`/flat config,
      `.prettierrc`)
- [x] T006 [P] Add `.github/workflows/deploy.yml`: on push to `main`, `npm ci && npm run build`,
      publish `dist/` to the `gh-pages` branch (Constitution Principle V)
- [x] T007 [P] Add `.gitignore` at repo root (`node_modules`, `dist`, and per Spec Kit's own
      security notice, review whether any of `.cursor/` needs excluding)

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T008 Define shared primitive types in `src/data/types.ts`: `Rarity`, `CreatureType`,
      `DamageType`, `StatusEffectType`, `SourceRef`, `Provenance`, `FieldConflict` — exactly the
      shapes in data-model.md's "Shared primitive types" section (closed unions, no bare strings,
      per Constitution Principle II)
- [x] T009 [P] Define `AbilityTag` (discriminated union: `ongoing` | `trigger` | `onEvent` |
      `cooldownSpeedModifier` | `statusGrant`), `TargetSelector`, `EventLabel`, `EffectDescriptor`
      in `src/data/types.ts` per data-model.md's "Structured, closed-vocabulary hints" section
- [x] T010 [P] Define `CreatureRecord`, `TrainerRecord`, `TrinketRecord`, `ItemRecord` interfaces in
      `src/data/types.ts` per data-model.md's "Corpus entities" section, including the
      `unconfirmedFields?: string[]` escape hatch for published-nowhere stats
- [x] T011 [P] Define `GridRow`, `GridCol`, `GridSlot`, `TeamPlacement`, `TeamConfiguration` in
      `src/data/types.ts` per data-model.md's "Team configuration" section, including its stated
      validation rules (max 6 placements, no duplicate slot, all ids must resolve)
- [x] T012 [P] Define `TimelineEventKind`, `TimelineEvent`, `StatusEffectInstance`,
      `SimulationResult` in `src/data/types.ts` per data-model.md's "Simulation entities" section
- [x] T013 Seed an initial real corpus slice in `src/data/creatures.ts` covering the mechanics the
      engine must prove first (Constitution Principle VI): one Shock-applying creature (Bumblebolt:
      Common, Bug/Electric, 2.5s cooldown, 3 damage, grants 1 Shock on cast, $10 — cited to
      research.md B2/B4's Shock Builds Guide source), one Burn-applying creature, one
      Poison-applying creature, one Shield-granting support creature, and one creature with a
      positional/Ongoing ability (e.g. Formiqueen or Onsetra per research.md B4). Every record MUST
      carry a populated `Provenance` (`sourceRefs`, `patch`)
- [x] T014 [P] Seed one `TrainerRecord` with full `Provenance` in `src/data/trainers.ts`
- [x] T015 Assemble `src/data/corpus.ts` exporting a single `Corpus` lookup object keyed by `id`
      over creatures/trainers/trinkets/items (`src/data/trinkets.ts` and `src/data/items.ts` may
      start as empty-array stubs, widened in Phase 5/US3)
- [x] T016 Implement `effectiveCooldown(baseCooldownSeconds, cooldownSpeedTotal,
      positiveFlatAddedSeconds)` in `src/engine/cooldown.ts` per contracts/engine-api.md and
      research.md B1's formula, clamped to a 0.1s floor
- [x] T017 [P] Write `effectiveCooldown` unit tests in `src/engine/__tests__/cooldown.test.ts` for
      research.md B1's three worked examples (4.5s/+20%/+0s → 3.75s; 4.5s/+100%/+0s → 2.25s;
      4.5s/+20%/+1s → 4.75s) — write and confirm these FAIL before T016 lands any implementation
      (Constitution Principle III, NON-NEGOTIABLE)
- [x] T018 Implement grid/adjacency helpers in `src/engine/grid.ts` per research.md B5 (`adjacent` =
      shares a side, never diagonal; `back`/`front` row; bench slots excluded entirely — there is
      no bench concept in `TeamConfiguration` at all, by design)
- [x] T019 [P] Implement `InvalidTeamConfigurationError` in `src/engine/errors.ts` per
      contracts/engine-api.md
- [x] T020 Implement `TeamConfigContext` in `src/context/TeamConfigContext.tsx` — the single shared
      editable `TeamConfiguration` object (research.md A3)
- [x] T021 Scaffold `src/App.tsx` + `src/main.tsx` with a two-view shell (Calculator view / Corpus
      Browser view, no router library needed yet — a simple local view-switch state is sufficient
      per Constitution Principle VI)

**Checkpoint**: Foundation ready — user story implementation can begin.

---

## Phase 3: User Story 1 - Build a team and see its DPS/status output (Priority: P1) 🎯 MVP

**Goal**: Assemble a team into the 2x3 grid with a Trainer and see each creature's DPS and each
status effect's per-second value (spec.md FR-005..FR-009).

**Independent Test**: quickstart.md Validation Scenarios 1 and 2 — single-creature DPS matches
`damage / effectiveCooldown`, and a Poison-applying creature's displayed per-second value does not
self-decay between applications while a Burn-applying creature's does.

### Tests for User Story 1 ⚠️ write first, confirm failing before implementing

- [x] T022 [P] [US1] Write failing unit tests for `applyStatusTick` in
      `src/engine/__tests__/status.test.ts`: Burn tick damage = current layers then −1 layer;
      Poison tick damage = current layers with layers unchanged after — per research.md B2
- [x] T023 [P] [US1] Write failing unit tests for `applyShockProc` in
      `src/engine/__tests__/status.test.ts`: Shock hit = current layers, resolves before the direct
      hit it's attached to, never decays on its own; and a test confirming `applyStatusTick` throws
      if given a Shock instance (research.md B2/B4, contracts/engine-api.md)
- [x] T024 [P] [US1] Write a failing unit test for `simulate()` reproducing quickstart.md Scenario 1
      (Bumblebolt alone in `front0`[col 0], no trainer → DPS = 3 / 2.5 = 1.2) in
      `src/engine/__tests__/simulate.test.ts`

### Implementation for User Story 1

- [x] T025 [US1] Implement `applyStatusTick` in `src/engine/status.ts` to satisfy T022
- [x] T026 [US1] Implement `applyShockProc` in `src/engine/status.ts` to satisfy T023
- [x] T027 [US1] Implement the top-level `simulate(config, corpus, options?)` in
      `src/engine/simulate.ts`: build `SimulationResult.timeline` sorted ascending by `tSeconds`,
      ties broken by the stable slot order `[back0, back1, back2, front0, front1, front2]` per
      contracts/engine-api.md Postconditions; throw `InvalidTeamConfigurationError` on an invalid
      `config` per data-model.md's validation rules (depends on T016, T018, T019, T025, T026, and
      must satisfy T024)
- [x] T028 [US1] Compute `perCreatureDps` and `perStatusPerSecond` on `SimulationResult` in
      `src/engine/simulate.ts`
- [x] T029 [US1] Build `GridPicker` in `src/ui/GridPicker/GridPicker.tsx` +
      `GridPicker.module.css`: 2x3 slot assignment UI bound to `TeamConfigContext`, enforcing
      data-model.md's placement rules (no duplicate `slot`, max 6 `placements`)
- [x] T030 [US1] Build `TrainerPicker` (single-select) in `src/ui/GridPicker/TrainerPicker.tsx`,
      wired to `TeamConfigContext.trainerId`
- [x] T031 [US1] Build `TeamSummary` in `src/ui/TeamSummary/TeamSummary.tsx`: show each creature's
      DPS and each active status effect's current per-second value side by side (FR-009), reading
      only from one `SimulationResult`
- [x] T032 [US1] Wire the Calculator view in `src/App.tsx` to call `simulate(config, corpus)` on
      every `TeamConfigContext` change and pass the single resulting `SimulationResult` into
      `TeamSummary`

**Checkpoint**: User Story 1 fully functional and independently testable.

---

## Phase 4: User Story 2 - Visualize cumulative damage/status over time (Priority: P2)

**Goal**: Show a chart of cumulative damage and per-status value across the simulated window so
burst vs. decaying DOT contributions are visually distinguishable (FR-010, SC-005).

**Independent Test**: quickstart.md Validation Scenario 3 — a large infrequent hit produces a
stepped total-damage line; a Burn applier produces a visibly decaying curve between applications.

### Tests for User Story 2 ⚠️ write first, confirm failing before implementing

- [x] T033 [P] [US2] Write a failing unit test asserting `SimulationResult.cumulativeSeries` values
      are monotonically non-decreasing per status and exactly match the running sum of
      `timeline` events up to each sampled `tSeconds`, in `src/engine/__tests__/simulate.test.ts`
- [x] T036 [P] [US2] Write a failing unit test for `applyShieldReduction` in
      `src/engine/__tests__/shield.test.ts`: non-`"Direct"` damage types are reduced by the current
      `STATUS_VS_SHIELD_REDUCTION` constant before absorption; `"Direct"` damage is not reduced
      (research.md B3)

### Implementation for User Story 2

- [x] T034 [US2] Implement `cumulativeSeries` computation in `src/engine/simulate.ts` to satisfy
      T033 (depends on T027)
- [x] T035 [US2] Implement `applyShieldReduction` and the named, patch-tagged
      `STATUS_VS_SHIELD_REDUCTION` constant (25%, with its own `Provenance` citing research.md B3's
      sources) in `src/engine/shield.ts` to satisfy T036
- [ ] T037 [US2] Wire `applyShieldReduction` into `simulate()` in `src/engine/simulate.ts` for any
      `TeamConfiguration` whose assembled creatures include a Shield grant
      **BLOCKED (see comment in simulate.ts)**: meaningfully wiring this requires a modeled
      *target* with its own HP/Shield pool, which does not exist under the "idealized target"
      assumption (spec.md Assumptions) — `simulate()` only measures the user's team's outgoing
      damage today, nothing absorbs it. Revisit alongside a spec change that adds a target
      entity, rather than fake a pool here.
- [x] T038 [US2] Build `CumulativeChart` in `src/ui/CumulativeChart/CumulativeChart.tsx` using
      Recharts: render `SimulationResult.cumulativeSeries` directly (one line for total damage, one
      per `StatusEffectType`) with no separate recomputation, per data-model.md's single-source-of-
      truth rule
- [x] T039 [US2] Add a `simulationWindowSeconds` control to the Calculator view in `src/App.tsx`,
      wired to `TeamConfigContext.simulationWindowSeconds` (FR-007/FR-008)
- [x] T040 [US2] Wire `CumulativeChart` into the Calculator view in `src/App.tsx`, alongside
      `TeamSummary`

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 5: User Story 3 - Browse the corpus (Priority: P3)

**Goal**: Search/filter the full cited corpus of creatures, trainers, trinkets, and items, with
source disagreements visibly shown (FR-001..FR-004, FR-013, FR-014).

**Independent Test**: quickstart.md Validation Scenario 4 — search by name, filter by type/rarity,
and confirm a known conflicting entry shows both values with their sources.

### Tests for User Story 3 ⚠️ write first, confirm failing before implementing

- [x] T041 [P] [US3] Write a failing unit test for corpus search/filter helpers (by name substring,
      by `CreatureType`, by `Rarity`) in `src/data/__tests__/corpus.test.ts`

### Implementation for User Story 3

- [x] T042 [US3] Implement `searchCorpus`/`filterCorpus` helpers in `src/data/corpus.ts` to satisfy
      T041
- [x] T043 [US3] Widen `src/data/creatures.ts` to the full cross-referenced, cited corpus collected
      from the available fan wikis (target: ≥90% of entries with a complete, citable required-stat
      set per SC-003). Any inter-wiki disagreement on a value MUST be recorded as a `FieldConflict`
      per FR-004 rather than silently resolved
      **Done 2026-10-05, with an honest caveat on SC-003's "complete, citable required-stat set"
      bar**: all 149 named creatures now have cited name/rarity/types/abilityText (and shopCost
      for ~87 of them), but none of the sources reviewed publish per-creature baseCooldownSeconds/
      baseDamage for the ~143 bulk-imported entries — those two fields are `null` + listed in
      `unconfirmedFields` rather than fabricated. Only the original 6 hand-authored entries have
      a fully complete required-stat set. Getting more entries to "complete" requires finding
      individual per-creature detail pages (like the batodex.com cards already used for
      Bumblebolt/Formiqueen/Venopuff/Scorchimp) one at a time — tracked as a follow-up, not
      re-opened here since the roster-breadth half of this task is genuinely done.
- [x] T044 [P] [US3] Widen `src/data/trainers.ts` to the full cited Trainer corpus — **done via
      T070 below** (2026-10-05 round 2), with the exact 23-Trainer roster + citations
      research.md D1 found during round-2 planning
- [x] T045 [P] [US3] Populate `src/data/trinkets.ts` with the full cited Trinket corpus — **done
      via T109 below** (2026-10-06 round 5): all 93 `TrinketRecord` entries with
      `name`/`effectText`/`rarity` and per-trinket batodex.com citations; the file's own header
      records that it supersedes this task's empty stub
- [ ] T046 [P] [US3] Populate `src/data/items.ts` with the full cited Item corpus
- [x] T047 [US3] Build `CorpusBrowser` in `src/ui/CorpusBrowser/CorpusBrowser.tsx`: name search +
      type/rarity filter controls (FR-013), wired to T042's helpers
- [x] T048 [US3] Build `EntryDetail` in `src/ui/CorpusBrowser/EntryDetail.tsx`: ability/effect text,
      source citations, patch tag, and any recorded `FieldConflict` values shown side by side
      (FR-004, SC-004)
- [x] T049 [US3] Add a patch/version banner to both views in `src/App.tsx` stating which corpus
      snapshot is active (FR-014)
- [x] T050 [US3] Wire `CorpusBrowser` into `src/App.tsx`'s second view

**Checkpoint**: All three user stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T051 [P] Run quickstart.md Validation Scenarios 1–4 end-to-end against the built app; record
      results in `specs/001-batomon-dps-calculator/quickstart.md` or a linked results note
- [x] T052 [P] Write `README.md`: corpus provenance approach, how to refresh the corpus for a new
      game patch, local dev/build/test/deploy commands
- [x] T053 Verify `npm run build` succeeds with zero TypeScript errors under strict mode
      (Constitution Principle II)
- [ ] T054 [P] Accessibility pass on `GridPicker`/`TeamSummary`/`CumulativeChart` (keyboard
      navigation, `aria-*` labels)
- [x] T055 Create the public GitHub repository (per the earlier decision: `swirle13/batomon-
      calculator`-style public repo), push initial history, and confirm the `deploy.yml` workflow
      from T006 publishes successfully to `gh-pages`

---

## Phase 7: Round 2 — User-Reported Follow-ups (2026-10-05, via `/speckit-plan` + `/speckit-tasks`)

**Goal**: Implement the design in plan.md's "Amendment: Round 2" and research.md section D /
data-model.md's matching 2026-10-05 (round 2) amendments — full Trainer roster + its placement
above the grid (FR-015), a live per-creature effective-stat breakdown (FR-016), a consistent
chart X-axis (FR-017), and the per-level (1–4) creature data-model widening (FR-001 amendment),
plus the latent `(id, level)` lookup bug data-model.md surfaced along the way.

**Independent Test**: quickstart.md Validation Scenarios 5–7.

### Foundational data-model updates (blocking — no story label, same as Phase 2)

- [x] T057 Promote `unconfirmedFields?: string[]` from `CreatureRecord` onto `Provenance` in
      `src/data/types.ts`, per data-model.md's "`unconfirmedFields` promoted..." amendment —
      `CreatureRecord` keeps the field only via inheritance, no local re-declaration
- [x] T058 [P] Widen `CreatureRecord.level` from `1 | 2 | 3` to `1 | 2 | 3 | 4` and add
      `confirmedMaxLevel?: 1 | 2 | 3 | 4` in `src/data/types.ts`, per data-model.md's "Creature
      level widened to 1–4" amendment (per-species cap, when sourced; absent = not yet researched)
- [x] T059 [P] Add `baseMulticast: number` to `CreatureRecord` in `src/data/types.ts` — data-
      model.md: "default `1` ('no stated Multicast bonus')" — and add `"multicastAdd"` to the
      `ModifierStat` union
- [x] T060 Backfill `baseMulticast: 1` onto all 149 existing records in `src/data/creatures.ts` —
      data-model.md: "backfilled to 1 for all existing records rather than flagged unconfirmed,
      since '1 = none' is the reasonable baseline absent contrary evidence in abilityText"; do NOT
      add `"baseMulticast"` to any record's `unconfirmedFields`
- [x] T061 [P] Add `perCreatureEffectiveStats: Record<string, { damage: number | null; damageType:
      DamageType | null; cooldownSeconds: number | null; multicast: number; appliesStatus: {
      type: StatusEffectType; amount: number }[] }>` to `SimulationResult` in `src/data/types.ts`,
      exactly per data-model.md's shape (depends on T059)

### Tests for Phase 7 ⚠️ write first, confirm failing before implementing (Constitution Principle III, NON-NEGOTIABLE)

- [x] T062 [P] Write failing unit tests in `src/engine/__tests__/simulate.test.ts` for Multicast,
      using a synthetic corpus fixture: a creature with `baseMulticast: 3` fires 3 independent
      direct-damage events at the same `tSeconds` per cooldown completion, each independently
      eligible to proc Shock (research.md D3)
- [x] T063 [P] Write a failing unit test in `src/engine/__tests__/simulate.test.ts` asserting
      `perCreatureEffectiveStats` reflects an active `StatModifier` (e.g. `damageFlatAdd`) for a
      placed creature as a post-modifier amount, resolved via the same path as the cast loop —
      data-model.md's single-source-of-truth rule, not a second divergent computation
- [x] T064 [P] Write a failing unit test in `src/engine/__tests__/simulate.test.ts` asserting cast
      times for a float-drift-prone cooldown (e.g. `4.9`) never produce a `TimelineEvent.tSeconds`
      with more than 6 significant decimal digits across a 20+ cast window (research.md D4)
- [x] T065 [P] Write a failing unit test in `src/engine/__tests__/simulate.test.ts` asserting
      `simulate()` throws `InvalidTeamConfigurationError` when a `TeamPlacement.level` has no
      matching `(id, level)` record in the corpus, and resolves the correct record when one exists
      at a non-default level

### Implementation for Phase 7

- [x] T066 [US1] Implement Multicast firing in `src/engine/simulate.ts` Phase A/B: fire
      `baseMulticast + multicastAdd`-modifier-total independent direct-damage events per cooldown
      completion, to satisfy T062 (depends on T059)
- [x] T067 [US1] Fix the creature lookup in `src/engine/simulate.ts`'s `teamMembers` construction
      to key on `(creatureId, level)` — `corpus.creatures.find(c => c.id === p.creatureId &&
      c.level === p.level)` — raising `InvalidTeamConfigurationError` on no match, to satisfy T065
      (depends on T058)
- [x] T068 [US1] Switch `src/engine/simulate.ts` Phase A's cast-time generation from repeated `+=`
      addition to index multiplication (`t = startAt + n * cooldown`) and round every
      `TimelineEvent.tSeconds` to 1e-6s precision at creation, to satisfy T064
- [x] T069 [US1] Compute `perCreatureEffectiveStats` in `src/engine/simulate.ts` Phase C from the
      same per-cast `modifiers`/`sumModifier` resolution Phase A already performs, to satisfy T063
      (depends on T061, T066)
- [x] T070 [US1] Widen `src/data/trainers.ts` to the full cited 23-Trainer roster from research.md
      D1 (Black Belt, Bug Catcher, Burglar, Chef, Chemist, Egg Breeder, Gamer, Gentleman, Lucky
      Girl, Mad Scientist, Masked Man, Monster Ranger, Musician, Painter, Redhead, Rich Lady,
      Scavenger, Shopkeeper, Smuggler, Swim Coach, Treasure Hunter, Twins, Youngster), recording
      the two cited `FieldConflict`s (Chemist's Poison amount: +3 vs. +1; Redhead's Burn amount:
      +3 vs. +2) and flagging the five named-only trainers' (Twins, Gentleman, Painter, Burglar,
      Scavenger, Black Belt) `abilityText` via `unconfirmedFields` (supersedes T044; depends on
      T057 for `unconfirmedFields` being available on `TrainerRecord`)
- [x] T071 [US1] Move `<TrainerPicker />` above `<GridPicker />` in the Calculator view
      (`src/App.tsx`), per FR-015
- [x] T072 [US1] Add a per-placement level selector (`1`–`4`, restricted to levels actually present
      in the corpus for that creature) to `src/ui/GridPicker/GridPicker.tsx`, wired through
      `TeamConfigContext.setPlacement`'s existing `level` parameter (depends on T058, T067)
- [x] T073 [US1] Extend `src/ui/TeamSummary/PlacedCreatureDetails.tsx` to render
      `perCreatureEffectiveStats` per placement — damage, damage type, cooldown, Multicast count,
      and each applied status amount — live-updating as `StatModifier`s change, per FR-016
      (depends on T069)
- [x] T074 [US2] Fix `src/ui/CumulativeChart/CumulativeChart.tsx`'s `XAxis` to `type="number"` with
      an explicit `domain={[0, windowSeconds]}` (derived from the result, e.g. `data.at(-1)?.t`),
      per FR-017/research.md D4 (depends on T068 for drift-free underlying data)

### Corpus completeness (US3 — tracked, explicitly large/ongoing, not closeable in one pass)

- [ ] T075 [US3] Research and record confirmed `baseDamage`/`baseCooldownSeconds`/per-level (2–4)
      stats for `src/data/creatures.ts` entries, one cited batch at a time (same pattern as T043's
      caveat) — target SC-003's ≥90% bar; log progress against the research.md D5 baseline
      (5/149 confirmed) in `quickstart.md`'s Validation results section after each batch rather
      than claiming completion prematurely
      **In progress, 2026-10-05 round 2**: first batch done — `brawlmantis`/`dracana`/`frizzly`
      confirmed via individual batodex.com detail pages (the exact three the user originally
      reported as "0 DPS"), bringing the corpus to 8/149 (~5.4%) confirmed. Confirmed
      batodex.com has an individual page per creature (`batodex.com/monsters/<slug>`), so the
      remaining ~141 are mechanically the same kind of lookup, just not yet done — still far
      short of SC-003's ≥90% bar and intentionally left open, not re-closed here.

**Checkpoint**: Trainer roster complete and positioned per FR-015; per-creature effective-stat
breakdown live per FR-016; chart X-axis consistent per FR-017; level/Multicast data-model gaps
closed; corpus-completeness work tracked and progressing (T075), not expected done in one pass.

---

## Phase 8: Round 3 — Reference-Site-Inspired Redesign (2026-10-05, via `/speckit-tasks`)

**Goal**: Implement plan.md's "Amendment: Round 3" and research.md section E / data-model.md's
matching 2026-10-05 (round 3) amendments — a creature-search modal that autofocuses and clears
per slot (FR-018), drag-and-drop placement editing via `@dnd-kit/core` (FR-019), one canonical
type-color mapping used everywhere a type is rendered as a color (FR-020), a persistent
non-overlapping detail side panel (FR-021), and evolution-aware leveling (FR-022).

**Independent Test**: quickstart.md Validation Scenarios 8–12.

### Foundational (blocking — no story label, same as Phase 2)

- [x] T076 Add `evolvesAtLevel?: 2 | 3 | 4` to `CreatureRecord` in `src/data/types.ts`, paired
      with the existing `evolvesInto` — data-model.md: "Required whenever `evolvesInto` is set;
      a species with no evolution has neither field"
- [x] T077 [P] Add `@dnd-kit/core` to `package.json` dependencies (plan.md Technical Context —
      chosen over native HTML5 Drag-and-Drop for built-in keyboard/screen-reader support)
- [x] T078 [P] Create `src/data/typeColors.ts`: `TYPE_COLORS: Record<CreatureType, string>` (one
      hex color per `CreatureType`, including `"All"`) + `typeColor(type): string` — data-model.md's
      "Canonical `CreatureType` color mapping" amendment, the single source every UI component
      below must import rather than defining its own color per type

### Tests for Phase 8 ⚠️ write first, confirm failing before implementing (Constitution Principle III, NON-NEGOTIABLE)

- [x] T079 [P] Write failing unit tests for `resolveLevelUp(corpus, baseSpeciesId, targetLevel)`
      in a new `src/engine/__tests__/evolution.test.ts` (contracts/engine-api.md): Panbud at
      level 3 resolves to Bambudo; Scorchimp at level 3 resolves to Sunsage; a species with no
      `evolvesInto` resolves to itself at any level; resolving to a species/level pair absent
      from the corpus returns `null` (never falls back to a different level's record)

### Implementation for Phase 8

- [x] T080 [US1] Implement `resolveLevelUp()` in a new `src/engine/evolution.ts` to satisfy T079
      (depends on T076)
- [x] T081 [US3] Update `src/data/creatures.ts`: add `evolvesAtLevel: 3` to Beetbud and Scorchimp
      (both already have `evolvesInto` and an "Evolves at level 3" `abilityText`); add
      `evolvesInto: "bambudo"` + `evolvesAtLevel: 3` to Panbud and remove `"evolvesInto"` from
      its `unconfirmedFields`, cited via <https://batodex.com/monsters/panbud> and
      <https://batomon.com/batomon/panbud> (research.md E2.6) (depends on T076)
- [x] T082 [US1] Build a creature-search modal (`src/ui/GridPicker/CreatureSearchModal.tsx`)
      satisfying FR-018: every time it opens, for any slot, it MUST clear any previously-entered
      search text and move keyboard focus into the search field immediately
- [x] T083 [US1] Wire `CreatureSearchModal` into `src/ui/GridPicker/GridPicker.tsx` as the
      primary assignment flow; keep the existing `<select>` fully functional as an
      always-available fallback (FR-019's note that the search/modal flow must remain available
      for users who don't use drag-and-drop — same keyboard/screen-reader parity reasoning)
      (depends on T082)
- [x] T084 [US1] Add drag-and-drop between grid slots in `src/ui/GridPicker/GridPicker.tsx`
      using `@dnd-kit/core`'s `DndContext`/`useDraggable`/`useDroppable`: dropping a placement
      onto an **empty** slot moves it; dropping onto an **occupied** slot **swaps** the two
      placements, each keeping its own level and modifiers (data-model.md's "Drag-and-drop
      placement editing" amendment, FR-019) (depends on T077)
- [x] T085 [US1] Wire `resolveLevelUp()` into the per-placement level selector in
      `src/ui/GridPicker/GridPicker.tsx` (the selector added in T072): selecting a level resolves
      through evolution, updating the slot's `creatureId` to the resolved species whenever it
      differs from the currently-placed one (FR-022) (depends on T080, T081)
- [x] T086 [US3] Build a `TypeTag` component (`src/ui/shared/TypeTag.tsx`) using `typeColor()`
      from `src/data/typeColors.ts`; replace the plain-text type rendering in
      `src/ui/TeamSummary/PlacedCreatureDetails.tsx` and `src/ui/CorpusBrowser/CorpusBrowser.tsx`
      with it (FR-020) (depends on T078)
- [x] T087 [US1] Apply `typeColor()` to each placed creature's card background in
      `src/ui/GridPicker/GridPicker.tsx` (and in `CreatureSearchModal`'s result tiles): a
      split/gradient background using both colors for dual-typed creatures, per data-model.md's
      "Dual-typed creatures render a split/gradient background... each type stays individually
      identifiable" (FR-020) (depends on T078, T082)
- [x] T088 [US1] Refactor `PlacedCreatureDetails` (`src/ui/TeamSummary/PlacedCreatureDetails.tsx`)
      into a persistent side panel driven by a `highlightedSlot: GridSlot | null` state lifted
      into `CalculatorView` (`src/App.tsx`): hovering/focusing a placed creature's card updates
      `highlightedSlot`; hover/focus **leaving** a card MUST NOT clear it (sticky); the panel
      defaults to the first placement (or an empty-state message if none) — explicitly transient
      UI state, never added to `TeamConfiguration`/`TeamConfigContext` (data-model.md's
      "Persistent side-panel... is UI state, not team data" amendment, FR-021)

### Polish for Phase 8

- [x] T089 [P] Re-run quickstart.md Validation Scenarios 8–12 end-to-end; record results in
      quickstart.md's Validation results section
- [x] T090 Verify `npx tsc -b --noEmit`, full `npx vitest run`, and `npm run build` all pass
- [x] T091 [P] Accessibility check for `CreatureSearchModal` (focus trap, Escape-to-close) and
      the drag-and-drop interaction (keyboard-equivalent reachable via the fallback `<select>`
      flow from T083) — ties into the still-open `tasks.md` T054 accessibility pass
      **Checked, 2026-10-05**: `CreatureSearchModal` has `role="dialog"`/`aria-modal="true"`/
      `aria-label`, Escape-to-close, backdrop-click-to-close, and autofocus (all covered by
      `CreatureSearchModal.test.tsx`) — but does **not** implement a full Tab focus trap (Tab
      can still reach elements behind the overlay). `@dnd-kit/core`'s drag-and-drop is
      pointer-only here (no `KeyboardSensor` configured) — by design, the fallback `<select>`
      dropdown (kept fully functional per data-model.md's round-3 amendment) is the keyboard-
      equivalent path for rearranging placements, achieving the same end state in more steps
      rather than needing native keyboard-drag. Both gaps (focus trap, keyboard-native drag) are
      left for T054's broader accessibility pass, not silently claimed as solved here.

**Checkpoint**: Search modal autofocuses/clears per slot; drag-and-drop swap works alongside the
existing dropdown; one canonical type-color mapping used everywhere; the detail panel is
persistent and never overlaps another card; leveling a placement past its evolution threshold
shows the evolved species.

---

## Phase 9: Round 4 — Patch Corrections, New Stats, UI Cleanup, Corpus Scale-Up (2026-10-05)

**Goal**: Implement plan.md's "Amendment: Round 4" — correct `STATUS_VS_SHIELD_REDUCTION` to
15% and Multicast's 0.1s stagger (both patch-driven corrections to existing behavior, FR-007/
FR-008's underlying mechanics), add Heal/Sell Value corpus data (FR-025), click-anywhere
assignment (FR-023), drop redundant slot labels (FR-024), and make a large, honest pass at
level-1 damage/cooldown completion (research.md F6) — level 2/3/4 stats are **blocked**
(research.md F5) and explicitly NOT attempted.

**Independent Test**: quickstart.md Validation Scenarios 13–15.

### Foundational (blocking — no story label, same as Phase 2)

- [x] T092 Update `STATUS_VS_SHIELD_REDUCTION` in `src/engine/shield.ts` from `0.25` to `0.15`;
      update its `Provenance` to cite the August 2026 patch sources (research.md F1), keeping
      the 30% -> 25% -> 15% history in a comment
- [x] T093 [P] Add `healAmount?: number` and `sellValue?: number` to `CreatureRecord` in
      `src/data/types.ts` (data-model.md's "New stats: healAmount, sellValue" amendment — corpus
      data only, no engine behavior this round)

### Tests for Phase 9 ⚠️ write/update first, confirm failing before implementing (Constitution Principle III, NON-NEGOTIABLE)

- [x] T094 [P] Update the expected reduction value in `src/engine/__tests__/shield.test.ts` from
      25% to 15%; confirm it FAILS against the still-unmodified `STATUS_VS_SHIELD_REDUCTION`
      before T092 lands
- [x] T095 [P] Write a failing unit test in `src/engine/__tests__/simulate.test.ts` (reusing the
      existing `multicastCorpus()` fixture) asserting a Multicast-3 creature's three repetitions
      land at three distinct timestamps 0.1s apart (`t`, `t+0.1`, `t+0.2`), not all at `t`
      (research.md F2)

### Implementation for Phase 9

- [x] T096 [US2] Implement the `STATUS_VS_SHIELD_REDUCTION` value change (satisfies T094;
      depends on T092 — same change, listed separately only because T094 is a test-first task)
- [x] T097 [US1] Fix Multicast repetition timing in `src/engine/simulate.ts` Phase B: stagger
      each repetition `i` to `roundTime(cast.tSeconds + i * 0.1)` instead of reusing
      `cast.tSeconds` for all repetitions; a repetition whose staggered timestamp exceeds
      `windowSeconds` is not generated, to satisfy T095
- [x] T098 [US1] Remove the separate "Choose…"/"Change…" button in
      `src/ui/GridPicker/GridPicker.tsx`; make the slot's card (occupied) or placeholder (empty)
      itself the click target that opens `CreatureSearchModal`, coexisting with the existing
      drag handlers on occupied cards (FR-023)
- [x] T099 [US1] Remove the displayed slot-position text (e.g. "Back 1") from
      `src/ui/TeamSummary/TeamSummary.tsx`'s DPS table and
      `src/ui/TeamSummary/PlacedCreatureDetails.tsx`'s panel header; the underlying
      `${creatureId}@${slotKey}` keying is unchanged (FR-024)
- [x] T100 [US3] Research and record level-1 `baseDamage`/`baseCooldownSeconds`/`damageType`
      (and `healAmount`/`sellValue` where sourced) for as many of the ~140 still-unconfirmed
      `src/data/creatures.ts` entries as feasible this round, cited via individual per-creature
      detail pages (research.md F6) — large, chunked, continuing the `tasks.md` T075 pattern;
      log the resulting confirmed-count delta honestly, not claimed as 100% complete unless it
      genuinely is
      **Done, 2026-10-05 round 4, large batch**: 81 creatures confirmed via batodex.com
      individual pages (Aegistruct through Saberhorn alphabetically, plus a Petrirex patch-
      version conflict resolved against batomon.net, plus 2 new evolution links -- Dribblet
      -> Emperooze and Frillet -> Dewlotl, both at level 3). Corpus confirmed-cooldown/damage
      count: **9 -> 92 of 149**. ~57 remain (notably Cordycant, Kappow, Pipskull, and the whole
      R-Z alphabetic range were not reached this pass) -- explicitly still open, not claimed
      complete; continue in a future round with the same batch pattern.

### Polish for Phase 9

- [x] T101 [P] Re-run quickstart.md Validation Scenarios 13–15; record results in quickstart.md
- [x] T102 Verify `npx tsc -b --noEmit`, full `npx vitest run`, and `npm run build` all pass

**Checkpoint**: Shield/Multicast mechanics match the current patch; Heal/Sell Value are
browsable corpus data; assignment works by clicking the card itself; DPS table/side panel no
longer show redundant slot text; level-1 corpus completeness has measurably improved (exact
delta reported, not assumed); level 2/3/4 stats remain an explicitly logged, tooling-blocked gap
(research.md F5), not silently dropped.

---

## Phase 10: Round 5 — Full Level 2-4 Corpus + Trinket System (2026-10-06)

**Goal**: Implement plan.md's "Amendment: Round 5" — populate level 2-4 `CreatureRecord`s for
every species/evolved form (FR-026) using the embedded-database extraction technique
(research.md G1), and add a full Trinket selection feature (FR-027) with the full 93-entry
Trinket corpus (research.md G2) and flat team-wide bonus application.

**Independent Test**: quickstart.md Validation Scenarios 16–17.

### Foundational (blocking — no story label, same as Phase 2)

- [x] T103 Add `rarity?: Rarity` and `effectTags?: { stat: ModifierStat; amount: number }[]` to
      `TrinketRecord` in `src/data/types.ts` (data-model.md's round-5 `TrinketRecord` amendment)
- [x] T104 [P] Write a scratch extraction script (not shipped as part of the app) that fetches
      `https://batodex.com/monsters/<any-slug>` and `https://batodex.com/trinkets` raw HTML,
      locates the `self.__next_f.push([1,"..."])` block containing `"category":"monsters"` (or
      `"trinkets"`), JSON-decodes the JS string, extracts the `entries` array, and recursively
      flattens nested `evolvedForm` entries — per research.md G1/G2's verified structure

### Tests for Phase 10 ⚠️ write first, confirm failing before implementing (Constitution Principle III, NON-NEGOTIABLE)

- [x] T105 [P] Write a failing unit test in `src/engine/__tests__/simulate.test.ts` (new
      synthetic corpus fixture with one trinket carrying `effectTags: [{ stat: "damageFlatAdd",
      amount: 10 }]`) asserting a selected trinket's `effectTags` raise `perCreatureDps` by the
      same amount a manual `damageFlatAdd` `teamModifier` would, and that an unselected
      trinket's `effectTags` have no effect
- [x] T106 [P] Write a failing unit test in `src/engine/__tests__/evolution.test.ts` (synthetic
      fixture with `evolvesInto` set but `evolvesAtLevel` absent — a non-level-triggered
      evolution) asserting `resolveLevelUp` never resolves through it at any level — it always
      returns the base species' own record (or `null` if that level doesn't exist for it),
      confirming the spec.md Edge Case for victory-triggered evolutions

### Implementation for Phase 10

- [x] T107 [US1] Wire trinket `effectTags` into `src/engine/simulate.ts`'s modifier resolution
      (Phase A): sum `effectTags` from every id in `config.trinketIds` the same way
      `sumModifier` already sums `teamModifiers`/placement `modifiers` — additive with both,
      no precedence — to satisfy T105 (depends on T103)
- [x] T108 [US3] Populate `src/data/creatures.ts` with level 2/3/4 `CreatureRecord` entries for
      every species and nested evolved form (research.md G1) — one record per `(id, level)`,
      extracted via T104's script from batodex.com's embedded database; cite the extraction
      method and retrieval date; correct any level-1 discrepancies this authoritative structured
      source reveals against the per-creature citations from rounds 2/4
      **Done, 2026-10-06**: all 149 species' remaining unconfirmed level-1 stats were filled in
      first (92→149/149, closing the entire corpus-completeness gap in one pass, not just
      rounds 2/4's partial batches), then 447 new level-2/3/4 records appended (596 total).
      **Regression found and fixed in the same pass**: `CreatureSearchModal`/`GridPicker`'s
      dropdown/`CorpusBrowser` all assumed one record per creature name; multi-level records
      made them show up to 4 duplicate tiles per species. Fixed via a new `distinctCreatures`
      export in `src/data/corpus.ts` (one record per species, level 1, used for every UI
      *listing*) while engine-side level-aware lookups are untouched. Caught by
      `CreatureSearchModal.test.tsx`'s existing `getByText` assertion failing on multiple
      matches — direct payoff from round 3's component-test investment.
- [x] T109 [US3] Populate `src/data/trinkets.ts` with all 93 `TrinketRecord` entries
      (`name`/`effectText`/`rarity`), extracted via T104's script from
      `https://batodex.com/trinkets`; add `effectTags` for every trinket whose `description` is
      a flat, unconditional, permanent team-wide stat bonus mapping onto an existing
      `ModifierStat` (data-model.md's "deliberately a flat list" scoping — leave `effectTags`
      absent for shop/economy-only effects, same treatment as most Trainer abilities)
- [x] T110 [US1] Add a `TrinketPicker` component (multi-select, mirroring `TrainerPicker`'s
      pattern) in `src/ui/GridPicker/TrinketPicker.tsx`; add `addTrinketId`/`removeTrinketId` to
      `TeamConfigContext`; wire into `src/App.tsx`'s `CalculatorView` alongside `TrainerPicker`
- [x] T111 [US1] Verify `GridPicker`'s level selector (built in T072, evolution-aware since
      T085) now surfaces real level 2/3/4 options for species with newly-populated level data
      from T108 — no code change expected (the selector already computes options via
      `resolveLevelUp`), but confirm end-to-end with at least one real species (e.g. Panbud)

### Polish for Phase 10

- [x] T112 [P] Re-run quickstart.md Validation Scenarios 16–17; record results
- [x] T113 Verify `npx tsc -b --noEmit`, full `npx vitest run`, and `npm run build` all pass;
      report the resulting corpus completeness delta (level-1 confirmed count, and new level
      2-4 record count) honestly, not rounded up

**Checkpoint**: Every species/evolved-form has real level 2-4 data where the source provides it;
the level selector surfaces those levels (including evolution swaps) end-to-end; Trinkets are
fully browsable and selectable, with flat team-wide bonuses reflected in the DPS table exactly
like a manual `StatModifier` would.

---

## Future Enhancements (user-requested 2026-10-05, explicitly deferred: "once we get all of the
## mechanics working" — not scheduled into a phase yet)

- [ ] T056 Replace/augment the `<select>`-based `GridPicker` with a big vertical, scrollable
      creature browser alongside the calculator (showing each Banto's base stats + ability
      inline, same info as `PlacedCreatureDetails`/`CorpusBrowser` already render) that supports
      drag-and-drop onto the 2x3 grid. Keep the existing dropdown as a fallback/accessible
      alternative input method rather than removing it outright (keyboard/screen-reader users).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies, start immediately
- **Foundational (Phase 2)**: depends on Setup — blocks all user stories
- **User Stories (Phase 3-5)**: all depend on Foundational completion; independently testable once
  it's done, and may proceed in priority order (US1 → US2 → US3) or in parallel if staffed
- **Polish (Phase 6)**: depends on all desired user stories being complete
- **Round 2 (Phase 7)**: depends on Phases 1–6 being complete (it amends/extends their outputs,
  notably T027's `simulate()` and T038's `CumulativeChart`); its own Foundational sub-block
  (T057–T061) blocks every other Phase 7 task the same way Phase 2 blocks Phases 3–5
- **Round 3 (Phase 8)**: depends on Phase 7 being complete (T085 depends on T072's level
  selector; T088 depends on T073's `PlacedCreatureDetails`); its own Foundational sub-block
  (T076–T078) blocks every other Phase 8 task
- **Round 4 (Phase 9)**: depends on Phase 8 being complete (T098 amends T082/T083's modal
  wiring; T099 amends T088's panel); its own Foundational sub-block (T092–T093) blocks T096/T100
- **Round 5 (Phase 10)**: depends on Phase 9 (T111 verifies against T072/T085's selector); its
  own Foundational sub-block (T103–T104) blocks T107–T109
- **Round 6 (Phase 11)**: depends on Phase 10 (T125 replaces T110's `TrinketPicker`; T123 keeps
  T108's `distinctCreatures` listing source; T132's team-wide removal must not break T107's
  trinket path). Within the phase:
  - T114 blocks T116 and T137; T114+T115+T137 block T122; T116+T137 block T125/T128/T129
  - T118 must be written and passing **before** T123 deletes the provenance UI (SC-004 handover)
  - T122 blocks T123 and T124 (both render through it)
  - T126 blocks T127 and T128 (both restructure the same slot card); T128 changes `GridPicker`'s
    props, so T119's test render must be updated in the same pass
  - Tests before their implementation, per Principle III: T117→T121, T119→T127, T120→T132
  - T138 blocks T132 (per-mon modifiers must survive a level change before they become *the*
    modifier workflow)
  - T130 and T132 must be coordinated — both decide where `ModifierEditor` sits relative to the
    simulation-window control and the chart
  - T121 (engine) is **independent of every UI task** — land it first and separately, so a
    regression in the large UI pass can never be mistaken for the engine fix, or vice versa
  - T131, T133, T134, T139 have no intra-phase dependencies and are parallelizable with the rest

### User Story Dependencies

- **US1 (P1)**: no dependency on US2/US3; this is the MVP slice
- **US2 (P2)**: reuses US1's `simulate()`/`TeamConfigContext`/view shell but is independently
  testable per quickstart.md Scenario 3 once US1's engine core (T027) exists
- **US3 (P3)**: reuses the `Corpus` object from Foundational; independently testable without US1/US2
  UI, though it shares the `src/App.tsx` view shell
- **Phase 7's US1/US2/US3-labeled tasks**: amend/extend the same-numbered story's existing surface
  rather than opening a new story; order within Phase 7 is Foundational (T057–T061) → Tests
  (T062–T065) → Implementation (T066–T074) → Corpus research (T075), same shape as Phases 2–5
- **Phase 8's US1/US3-labeled tasks**: same amend/extend pattern; order is Foundational
  (T076–T078) → Tests (T079) → Implementation (T080–T088) → Polish (T089–T091). T085 (evolution-
  aware level selector) depends on both T080 (`resolveLevelUp`) and T081 (the corpus data it
  reads); T087/T088 depend on T082's modal and T078's color map respectively

### Within Each User Story

Tests before implementation → engine primitives before `simulate()` composition → `simulate()`
before UI components that consume `SimulationResult`.

---

## Parallel Example: User Story 1

```bash
# Tests for US1 (different files/sections, no shared dependency yet):
Task: "Failing unit tests for applyStatusTick in src/engine/__tests__/status.test.ts"
Task: "Failing unit tests for applyShockProc in src/engine/__tests__/status.test.ts"
Task: "Failing unit test for simulate() single-creature DPS in src/engine/__tests__/simulate.test.ts"
```

---

## Parallel Example: Phase 7

```bash
# Foundational type edits for Phase 7 (different fields/sections of the same file — treat as
# sequential within src/data/types.ts despite the [P] markers below being about *other* tasks
# not depending on each other's *completion*, not about editing the same file concurrently):
Task: "Widen CreatureRecord.level to 1 | 2 | 3 | 4 + confirmedMaxLevel in src/data/types.ts"
Task: "Add baseMulticast: number to CreatureRecord + multicastAdd to ModifierStat in src/data/types.ts"
Task: "Add perCreatureEffectiveStats to SimulationResult in src/data/types.ts"

# Tests for Phase 7 (different test cases, same file — same caution as above applies):
Task: "Failing Multicast test in src/engine/__tests__/simulate.test.ts"
Task: "Failing perCreatureEffectiveStats modifier test in src/engine/__tests__/simulate.test.ts"
Task: "Failing float-drift cast-time test in src/engine/__tests__/simulate.test.ts"
Task: "Failing (id, level) lookup test in src/engine/__tests__/simulate.test.ts"
```

---

## Parallel Example: Phase 8

```bash
# Foundational tasks for Phase 8 (independent files, safe to parallelize):
Task: "Add evolvesAtLevel to CreatureRecord in src/data/types.ts"
Task: "Add @dnd-kit/core to package.json"
Task: "Create src/data/typeColors.ts with TYPE_COLORS + typeColor()"
```

---

## Phase 11: Round 6 — Game-Faithful Presentation, Sprites, UI Restructure, Positional-Ordering Fix (2026-10-06)

**Goal**: Implement plan.md's "Amendment: Round 6" — the user's 13 presentation/interaction items
and 1 reported bug (FR-028..FR-040), plus the two data defects this round's investigation found
(research.md H9/H10).

**Independent Test**: quickstart.md Validation Scenarios 18–24.

### Traceability — every one of the user's 14 numbered items maps to at least one task here

> Written explicitly because items have been missed between planning and implementation in prior
> rounds. **Nothing in this table may be marked done until the named task is actually done.**

| # | User's item (verbatim intent) | Task(s) | FR | Scenario |
|---|---|---|---|---|
| 1 | Corpus cards + DPS "selected mon" card follow the game's layout; stop putting cost/cooldown/damage on one line | T122, T123, T124 | FR-028/029 | 19 |
| 2 | Corpus browser: remove all "Sources & patch" and "Recorded source conflicts" | T123 (+T118 safety net) | FR-030 | 20 |
| 3 | Corpus browser: 3–4 columns instead of too-wide rows | T123 | FR-031 | 20 |
| 4 | Trinkets presented like the Batomon picker, not a dropdown, so effects are visible | T125, T139 | FR-032 | 21 |
| 5 | Can't clear a populated slot — add a small × top-right of each mon's icon | T119, T127 | FR-033 | 22 |
| 6 | Remove "back row"/"front row" labels | T126, T139 | FR-034 | 23 |
| 7 | Make the mon icons more square | T126 | FR-035 | 22 |
| 8 | Show each mon's current stats as floating colour-coded squares at the bottom of its pane | T128, T139 | FR-035/029 | 22 |
| 9 | Move "Simulation window (seconds)" to just above the chart, below the DPS tables | T130 | FR-037 | 23 |
| 10 | Make the two DPS tables side by side | T131, T139 | FR-038 | 23 |
| 11 | Modifiers: collapsible, per-mon, integrated, no team-wide option, trim the cooldown prose into subtext | T120, T132, T138 | FR-039 | 24 |
| 12 | Each mon's sprite assets from batodex, in the picker, team display, and corpus | T114, T116, T137, T122, T123, T125, T128, T129 | FR-036 | 19/21/22 |
| 13 | "Choose a Banto" heading: drop "— back row, slot 2" | T129, T139 | FR-034 | 23 |
| 14 | Bug: facilitated DPS changes 4.10→4.30 when Bumblebolt is dragged, though it has no positional ability | T117, T121 | FR-040 | 18 |
| + | *Not requested* — round 5's "100% confirmed" claim is wrong (research.md H9) | T134 | — | — |
| + | *Not requested* — 10 species' level-1 values contradict their own level 2-4 series (research.md H10) | T133 | — | — |
| + | *Not requested* — per-mon modifiers are silently wiped whenever a placement's level changes | T138 | — | 22 |

**Review record (2026-10-06)**: this phase was audited against the user's verbatim 14 items by a
separate reviewing agent after first being drafted, and the audit's empirical claims were then
independently re-verified before being accepted. Four findings were confirmed and are now folded
into the tasks above, so they are recorded here rather than lost:

1. **The sprite-slug count was wrong** — the draft said 4 species publish under a different slug
   than their corpus id; it is **11** (re-verified directly against the extracted data). Fixed in
   T114/T116, which now mandate name-matching rather than id-matching.
2. **The engine fix was half a fix** — the per-timestamp snapshot alone leaves a second,
   independently reproducible manifestation via Multicast (Bumblebolt Lv4: Shock 20.55/s vs
   21.60/s across a slot permutation, re-verified). T121 now has two required parts and T117 must
   cover both shapes.
3. **Item 1's run-on line would have survived** in the very card the user complained about — T124
   originally passed the existing `Damage 3 · Cooldown 2.50s · Multicast ×1 · …` block through
   unchanged. T124 and FR-028 now require reformatting it too.
4. **Item 11's "integrated into the UI" sub-request was satisfiable by renaming a dropdown** —
   T132(d) now specifies one row per placed creature and forbids a global scope dropdown.

Also added from the audit: the keyboard path for item 5's `×` (T119/T127), the ability-trigger line
the reference card shows but the schema had no field for (T114/T122), `ItemRecord` in the provenance
test (T118), a shared sprite renderer so four call sites cannot drift (T137), the level-change
modifier wipe (T138), and tripwire assertions for the six items that had no automated coverage
(T139).

### Foundational for Phase 11 (blocking — no story label, same as Phase 2)

- [x] T114 Add `spriteFile?: string` to **both** `CreatureRecord` and `TrinketRecord`, and
      `abilityTrigger?: string` to `CreatureRecord`, in `src/data/types.ts` per data-model.md's
      round-6 amendment.
      - `spriteFile` stores the **published filename**, not a URL and not a value derived from
        `id`: **11 of 149** species publish under a different slug than their corpus id
        (`craghorn`→`alpinine`, `draconarch`→`dragonarch`, `dragonegg`→`dragon_egg_0`,
        `electranade`→`galvanade`, `missingn`→`missing_no`, `null00`→`null_00`,
        `null7f`→`null_7f`, `nullff`→`null_ff`, `purpleegg`→`purple_egg`,
        `pyronade`→`infernade`, `scorubble`→`scorbble` — research.md H3). Deriving from `id`
        would 404 for all 11.
      - `abilityTrigger` holds the in-game card's trigger line (e.g. `"On Battle Start"`), which
        the game renders *above* the description and which `abilityText` does not contain — the
        extracted payload has it as `ability.trigger` and rounds 2-5 never captured it
        (research.md H1). Without this, T122's band 4 silently drops information the reference
        card shows.
      - Both optional: absent MUST mean "render the existing presentation" (no broken `<img>`, no
        empty trigger line).
- [x] T115 [P] Create `src/data/statColors.ts` exporting `STAT_COLORS` and `RARITY_COLORS`,
      following `src/data/typeColors.ts`'s existing pattern. Use the game's **own published**
      values verbatim (research.md H2), not substitutes: damage `#ef426b`, burn `#ed6b3a`,
      poison `#7b57a1`, shock `#e7c61c`, shield `#a47c41`, heal `#578ac9`, multicast `#7b93c3`;
      Common `#70707a`, Uncommon `#4ab500`, Rare `#0084bd`, SuperRare `#a040a0`, Legendary
      `#d47c00`, Mythical `#dc2844`. Map this corpus's `"SuperRare"` to the published
      `"Super Rare"` entry explicitly — do not derive one spelling from the other.
- [x] T116 Vendor every sprite into `public/sprites/monster/` and `public/sprites/trinket/`
      (research.md H3: 149/149 creatures and 93/93 trinkets carry a `sprite` path in the
      already-extracted `/tmp/monsters_extracted.json` / `/tmp/trinkets_extracted.json`; each is a
      48×48 PNG of ~0.8 KB, so the whole set is <250 KB). Download from
      `https://batodex.com<sprite path>`, then populate `spriteFile` on **every** record in
      `src/data/creatures.ts` (all 4 level records of a species share one sprite) and
      `src/data/trinkets.ts`, **and** populate `abilityTrigger` from each entry's `ability.trigger`
      in the same pass. Specific requirements, because this is where it goes wrong quietly:
      - **Map by `name` (case-insensitive), not by `id`** — that resolves 149/149 and
        automatically covers all 11 slug divergences; id-matching silently misses 11
        (research.md H3).
      - **Commit the extraction/download script** into `scripts/` rather than leaving it in
        `/tmp` — `/tmp/monsters_extracted.json` and `/tmp/trinkets_extracted.json` exist right
        now but are ephemeral, and round 5 already left this pipeline unreproducible once.
      - Resolve at render time against `import.meta.env.BASE_URL` — the app is served from
        `/batomon-calculator/`, so a root-relative `/sprites/...` path will 404 in production.
      - Do **not** hot-link batodex at runtime (Principle V).
      - Add an assertion (fold into T118's test file) that **every** record's `spriteFile`, where
        present, names a file that actually exists under `public/sprites/...`, and report how many
        of 149 creatures and 93 trinkets ended up with a sprite. A missing-file typo is otherwise
        invisible until a user sees a broken image.
      (depends on T114)

### Tests for Phase 11 ⚠️ write first, confirm failing before implementing (Constitution Principle III, NON-NEGOTIABLE)

- [x] T117 [P] Write a **failing** test in `src/engine/__tests__/simulate.test.ts` for FR-040 /
      the user's item 14: build a team of creatures with **no** positional `abilityTags` where at
      least one applies Shock and at least two have cooldowns that coincide (a 2.5s Shock-applier
      plus a 5s hitter reproduces it — they collide at t=5/10/15/20), then assert that **permuting
      their slots leaves `perCreatureDps`, `perCreatureFacilitatedDps`, and `perStatusPerSecond`
      byte-for-byte identical**. Assert the **invariant**, not a specific number — research.md H8
      is explicit that neither 4.10 nor 4.30 is confirmed to be the game's real answer, so pinning
      either would encode a guess as a requirement. Confirm it fails before T121.
      **Cover BOTH shapes of the defect** — a fixture with only shape (a) will pass while shape (b)
      is still broken, which is exactly how this would ship half-fixed:
      - (a) **same-timestamp collision**: Multicast 1, two creatures whose cooldowns coincide
        (2.5s + 5s collide at t=5/10/15/20). This is the user's reported case.
      - (b) **Multicast interleaving**: the Shock-applier has `baseMulticast > 1`, so its
        repetitions interleave with another creature's casts. Verified reachable with real data —
        Bumblebolt at level 4 (Multicast 2) gives Shock **20.55/s** at `front-1` vs **21.60/s** at
        `back-1` today, and 7 corpus records have Multicast > 1 *and* apply Shock. The
        per-timestamp snapshot alone does **not** fix this (research.md H8).
- [x] T118 [P] Write a corpus-provenance test in `src/data/__tests__/provenance.test.ts` (new
      file) asserting every `CreatureRecord`/`TrainerRecord`/`TrinketRecord`/**`ItemRecord`** (all
      four record types Principle IV names — `ItemRecord` is currently an empty seed stub, so write
      the assertion so it holds vacuously now and starts guarding the moment items are added) has
      at least one `sourceRef` with a non-empty `url`/`title`/`retrievedAt` and a non-empty
      `patch`, and that every entry in any `conflicts` array is well-formed (non-empty `field`,
      ≥2 `values`, each with ≥1 `sourceRef`). Also add the `spriteFile`-exists assertion T116
      requires. **This is SC-004's replacement enforcement surface** — T123 removes the UI that was
      satisfying it, and spec.md's round-6 Amendment commits to this test taking over rather than
      to abandoning the criterion. Do not skip this task on the grounds that it tests data rather
      than behaviour. Note this one legitimately **passes on first run** (unlike T117/T119/T120, it
      is a guard against future regression, not a red test for a pending fix) — but it MUST be
      written and passing **before** T123 deletes the UI, so the handover is never a gap.
- [x] T119 [P] Write a **failing** component test in
      `src/ui/GridPicker/__tests__/GridPicker.test.tsx` (new file) for FR-033 / the user's item 5:
      with a creature placed, activating the slot's clear control empties that slot **and** does
      not open `CreatureSearchModal`. The no-modal assertion is the substantive half — the control
      sits on an element that is simultaneously a `@dnd-kit` drag handle and the click target that
      opens the picker (research.md H5), so a naive implementation clears the slot *and* pops the
      picker open over it. **Test the keyboard path too, not just the mouse path**: the card's own
      `onKeyDown` calls `preventDefault()` + `onOpenSearch()` on Enter/Space, so pressing Enter on a
      nested `×` button will bubble to the card, have its own click suppressed, and open the picker
      instead of clearing the slot — a click-only test passes while keyboard users get the opposite
      of the requested behaviour.
- [x] T120 [P] Write **failing** component tests in
      `src/ui/Modifiers/__tests__/ModifierEditor.test.tsx` (new file) for FR-039 / the user's item
      11: the section is collapsed by default; once expanded with a creature placed, no option
      labelled team-wide is offered; and the stat `<option>` labels are short (no parenthetical
      format explanation inside the option text). Add a companion assertion in
      `src/engine/__tests__/simulate.test.ts` that a selected DPS-affecting **trinket still
      changes DPS** — round 5 routes trinket `effectTags` through `teamModifiers`, so this is the
      guard that removing the team-wide *UI option* did not remove the *engine path* with it
      (research.md H7).

### Implementation for Phase 11

- [x] T121 [US1] Fix `src/engine/simulate.ts` Phase B per data-model.md's round-6 "common pre-cast
      status snapshot" amendment. **Two required parts — part 1 alone leaves the Multicast case
      broken, part 2 alone leaves the user's reported case broken:**
      1. **Make Phase B genuinely chronological.** Flatten every cast's Multicast repetitions into
         the event list and sort by `(tSeconds, stableSlotIndex)` *before* walking it. Today
         repetitions are expanded inline inside the cast loop, so a cast at t=5.0 with a repetition
         at t=5.1 is fully processed before another creature's t=5.0 cast that sorts later — Phase B
         never visited timestamps in order, and round 4's 0.1s stagger did not make it do so.
      2. **Snapshot per timestamp.** Resolve every cast sharing a timestamp against the Shock layer
         state as of the **start** of that timestamp; layers granted at *T* take effect from the next
         distinct timestamp. **Snapshot both `shockLayers` and `shockLayersBySource`** — facilitated
         damage is attributed by each source's share of the live total, so snapshotting only the
         scalar would fix `perStatusPerSecond.Shock` while leaving `perCreatureFacilitatedDps` (the
         exact column the user reported) still order-dependent.
      Keep `timeline`'s existing sort and `stableSlotIndex` tie-break — they remain correct for
      display ordering; the defect was that they also decided damage (research.md H8). A Multicast
      burst must still escalate its own Shock layers across its own repetitions (they occupy
      distinct timestamps); confirm round 4's existing Multicast stagger test still passes.
      Satisfies both halves of T117. (depends on T117)
- [x] T122 [US1] Create a shared card component `src/ui/shared/BatomonCard/BatomonCard.tsx`
      (+ `.module.css`) rendering the in-game card's four bands in order, per research.md H1's
      transcription: (1) name + rarity, rarity in its `RARITY_COLORS` colour; (2) sprite beside
      type badges; (3) cooldown as its **own** block, separate from **one line per output stat**,
      each line in that stat's `STAT_COLORS` colour; (4) ability text. Shop cost moves to
      secondary metadata — it is not on the game card at all (it's a shop property, not a battle
      stat; and (4) the ability's **`abilityTrigger` as its own emphasised line above**
      `abilityText`, matching the reference card's "On Battle Start" line (omit the line entirely
      when `abilityTrigger` is absent). Accept an optional extra band via `children` so the
      Calculator can append its "Effective this battle" panel without the Corpus Browser inheriting
      it. Keep `displayField`/`isUnconfirmed` so unknown values still render as "unknown", never
      `0` (existing data-model.md rule). **Carry over the two secondary lines the current cards
      already show, rather than dropping them silently**: the `Unconfirmed: …` line (which the
      Corpus Browser's own intro prose points users at, and which the never-show-a-misleading-value
      rule depends on) and `Evolves into: …`. (depends on T114, T115, T137)
- [x] T123 [US3] Rewrite `src/ui/CorpusBrowser/CorpusBrowser.tsx` to render each result through
      `BatomonCard` (item 1) and, in the same pass: **delete** the "Sources & patch" and
      "⚠ Recorded source conflicts" `<details>` blocks entirely (item 2 / FR-030 — the underlying
      `sourceRefs`/`patch`/`conflicts` **data stays untouched** in `src/data/*.ts`; only the
      rendering goes), and lay the cards out in a responsive grid,
      `repeat(auto-fill, minmax(17rem, 1fr))` capped at 4 columns (item 3 / FR-031) instead of one
      full-width `<article>` per row — put the grid CSS in a new
      `src/ui/CorpusBrowser/CorpusBrowser.module.css` (the component is currently all inline
      styles; the project's convention is CSS modules per research.md A4). Note `auto-fill` alone
      cannot enforce a 4-column *cap* — pair it with a `max-width` on the grid container, and verify
      the actual rendered column count at ~1280px and ~2560px rather than assuming. Keep the
      existing search/type/rarity filters and the `distinctCreatures` listing source (round 5 — do
      not revert to `corpus.creatures`, which would show 4 duplicate cards per species). Update the
      intro prose's corpus-completeness sentence to match T134's corrected figures. (depends on
      T118, T122)
- [x] T124 [US1] Rewrite `src/ui/TeamSummary/PlacedCreatureDetails.tsx` to render through the
      **same** `BatomonCard` (item 1 explicitly names this card too, not just the corpus one),
      passing its "Effective this battle" modifier-adjusted block as the extra band so it stays
      visually separate from the base-stat lines rather than merged into them (research.md H1 — this
      is the project's own differentiator and must not be dropped in the name of matching the game
      card). **Reformat that block, don't pass it through as-is**: it currently reads
      `Damage 3 · Cooldown 2.50s · Multicast ×1 · Applies: 1 Shock` — which is the *exact* run-on
      pattern the user complained about in item 1, visible in their own screenshot. Render it in the
      same cooldown-block-plus-one-line-per-stat shape as band 3, in the same stat colours, per
      FR-028's explicit "including the modifier-adjusted effective values" clause. Preserve the
      round-3 sticky-highlight behaviour and the `getCreatureByIdAndLevel` level-aware lookup.
      (depends on T122)
- [x] T125 [US1] Replace `src/ui/GridPicker/TrinketPicker.tsx`'s `<select>` with a searchable,
      card-grid picker reusing `CreatureSearchModal`'s interaction pattern (item 4 / FR-032 —
      research.md H4 requires reusing the existing idiom, not inventing a second one). Each
      trinket card shows its **sprite** (item 12), name, rarity in its `RARITY_COLORS` colour, and
      its **full `effectText`** — the effect text is the entire basis for choosing a trinket, which
      a `<select>` option cannot show. Keep the existing "affects DPS" distinction between the 6
      engine-wired trinkets and the 87 reference-only ones, and keep add/remove via
      `addTrinketId`/`removeTrinketId`. Two decisions to make explicitly rather than by accident:
      (a) trinkets are **multi-select**, unlike the single-select creature slot — so the picker must
      stay open across selections (or clearly support picking several), not close after the first
      like `CreatureSearchModal` does; (b) state whether you generalize `CreatureSearchModal` or add
      a sibling component, and put shared grid/modal styling in one place either way.
      (depends on T115, T116, T137)
- [x] T126 [US1] In `src/ui/GridPicker/GridPicker.tsx` + `GridPicker.module.css`: delete the
      `BACK ROW`/`FRONT ROW` `.rowLabel` elements and their CSS (item 6 / FR-034 — `GridSlot.row`
      stays `"back" | "front"` as *data*; adjacency, `aboveSlot`, and `behindSlot` all depend on
      it, so this is a text-only removal), and give the slot cards `aspect-ratio: 1` so they are
      square (item 7 / FR-035), matching the in-game team panel and giving T128's badges a stable
      area to anchor in. Apply the square aspect to **empty** slots too, not just occupied ones —
      square cards beside non-square placeholders would make the grid look broken in exactly the
      way item 7 is trying to fix.
- [x] T127 [US1] Add a per-slot clear control to each **occupied** slot card in
      `src/ui/GridPicker/GridPicker.tsx`: a small `×` in the card's top-right (item 5 / FR-033).
      It MUST call `setPlacement(slot, null, 1)` and MUST NOT also open the picker or start a
      drag — stop propagation on the pointer-down/`@dnd-kit` listeners, the click, **and `keydown`**
      (research.md H5). The `keydown` case is the one that is easy to miss: the card's own
      `onKeyDown` fires `preventDefault()` + `onOpenSearch()` on Enter/Space, so without stopping it
      a keyboard user pressing Enter on the `×` gets the picker opened and the slot *not* cleared.
      Give it a discrete `aria-label` (e.g. `Remove {name} from this slot`). Satisfies T119 including
      its keyboard assertion. (depends on T119, T126)
- [x] T128 [US1] Render each occupied slot's contents as the in-game team pane does (item 8 /
      FR-035, user screenshot 2): the creature's **sprite** (item 12), a `Lv. N` badge, and the
      creature's **current per-cast stats as compact colour-coded badges along the bottom of the
      square pane**, each in its `STAT_COLORS` colour. Drive the badge values from
      `result.perCreatureEffectiveStats` (the modifier-adjusted values `simulate()` already
      resolves and       `PlacedCreatureDetails` already consumes) so the badges can never disagree with
      the tables — do **not** recompute stats in the component (data-model.md's single-source-of-
      truth rule). This requires threading the `SimulationResult` into `GridPicker`, which currently
      does not receive it — **update T119's test render when you change the props**, or that test
      breaks on an unrelated signature change. Decide and state these three explicitly (the in-game
      pane in the user's screenshot shows **number-only** pills, no labels):
      - **Which stats get a badge**: damage and each applied status at minimum; say whether cooldown
        and Multicast do (the game shows cooldown separately on the card, not as a bottom pill).
      - **Number-only vs labelled** pills, and how a reader tells a pink 40 from an orange 4 —
        colour alone is the game's answer, so keep an accessible `title`/`aria-label` per badge.
      - **How an unknown/`null` damage renders**: omit the badge entirely. Do **not** show `0` —
        that is the existing never-show-a-misleading-value rule, and 62 of 149 species still have
        `baseDamage: null` (T134), so this path is common, not an edge case.
      (depends on T115, T116, T126)
- [x] T129 [US1] In `src/ui/GridPicker/CreatureSearchModal.tsx`: add each creature's **sprite** to
      its result card (item 12 / FR-036), and change the visible heading from
      `Choose a Banto — {row} row, slot {col + 1}` to just `Choose a Banto` (item 13 / FR-034).
      Keep the slot reference in the dialog's `aria-label` only — a screen-reader user did not see
      the click that opened it. Keep round-3's clear-and-autofocus-on-slot-change behaviour.
      (depends on T116)
- [x] T130 [US1] In `src/App.tsx`'s `CalculatorView`, move the "Simulation window (seconds)"
      control out of its current position (between the grid and `TeamSummary`) to sit **below**
      `TeamSummary` and **immediately above** `CumulativeChart` (item 9 / FR-037) — it governs the
      chart's time axis, not the per-second summary values. The current order is
      `TeamSummary → ModifierEditor → CumulativeChart`, so **state where the collapsed Modifiers
      section goes** and keep it out from between the control and the chart — otherwise "just above
      the chart" is satisfied on paper while a (collapsed, but still present) Modifiers block sits
      between them. Recommended final order: `TeamSummary` → `ModifierEditor` (collapsed) →
      simulation-window control → `CumulativeChart`. (coordinate with T132)
- [x] T131 [US1] In `src/ui/TeamSummary/TeamSummary.tsx`, present the "Damage per second, by
      creature" and "Status effect output, per second" tables **side by side** as one aligned unit
      (item 10 / FR-038) instead of two separately left-justified block tables. Name the mechanism
      rather than nudging inline styles: a flex/grid row in a new
      `src/ui/TeamSummary/TeamSummary.module.css`, with the two tables top-aligned, sharing a gap,
      and wrapping to stacked on narrow viewports. The user's complaint was both "different divs"
      and "left justified … ugly", so **aligning** them is part of the ask, not just placing them
      adjacently. Keep both `<caption>`s and the existing empty-state rows.
- [x] T132 [US1] Redesign `src/ui/Modifiers/ModifierEditor.tsx` per research.md H7's four distinct
      changes (item 11 / FR-039), none of which may be skipped: (a) wrap the whole section in a
      **collapsed-by-default** disclosure; (b) **remove the `"Team-wide (every placed Banto)"`
      scope option** so every modifier is scoped to a specific placed creature — **do NOT remove
      `TeamConfiguration.teamModifiers` or `simulate()`'s team-wide summation**, which round 5
      routes trinket `effectTags` through and which T120's companion test guards; (c) shorten the
      stat labels (`"Cooldown Speed (+decimal, e.g. 0.2 = +20%)"` → `"Cooldown Speed"`) and move
      the unit/format explanation to a subtext line beneath the form; (d) **integrate the controls
      per mon** — the user's words were "integrated into the ui, not just a bunch of individual drop
      downs or text fields", so renaming the scope dropdown does **not** satisfy this. Concretely:
      inside the expanded section, render **one row per placed creature** (name + sprite, its
      current modifiers as removable chips, and that row's own add-control), so the creature a
      modifier belongs to is structural rather than something the user selects and must keep track
      of. There must be no global scope dropdown left. Also handle the empty case: with zero
      placements, show an explanatory empty state rather than a form with no valid target.
      Satisfies T120. (depends on T120, T138)
- [x] T133 [US3] Reconcile the 10 species whose level-1 record contradicts their own level 2-4
      series (research.md H10): `brimtoad`, `cordycant`, `dragonegg`, `nullff`, `omnichrome`,
      `ratacomb`, `rigalord`, `spinarai`, `steamscuttle`, `bambudo`. Re-derive level 1 from the
      **same** extracted per-level series used for levels 2-4 so each species' four records come
      from one internally consistent source, and record each superseded community-dex value as a
      `FieldConflict` with its resolution rather than deleting it (Principle IV). The user's
      in-game Brimtoad screenshot confirms the direction of the fix: level 1 is really Burn 1 /
      Poison 1, not the recorded Burn 5 / Poison 5. Handle `bambudo` separately and note the
      finding — as Panbud's level-3 evolution it may have no legitimate level-1/2 record at all,
      which is a different defect (a spurious record) from a wrong value; do not silently delete
      records to make a progression look monotonic. **Note the limit of this fix honestly**: the
      authoritative per-level series omits a damage line for some creatures (Brimtoad among them),
      so re-deriving level 1 from it will *not* supply the "Deal 5 damage" the user's screenshot
      shows — that value is only attested by the screenshot. Either cite the screenshot as the
      source for it or leave it `null`; do not silently infer it, and do not let T134's corrected
      figures imply this gap was closed.
- [x] T134 [P] Correct the overstated corpus-completeness claim (research.md H9) everywhere it
      appears: `README.md`'s round-5 status prose and `src/App.tsx`'s `CORPUS_PATCH_LABEL` both
      say "100% confirmed across levels 1-4", which is **wrong** — that figure counted
      `baseCooldownSeconds` only, while `baseDamage` is `null` in 242 of 596 records (62 of 149 at
      level 1). State the real, separately-counted figures, and record the open gap that a bare
      `null` currently conflates "source confirms no damage line" with "our source didn't publish
      it" (proven by the user's Brimtoad screenshot reading "Deal 5 damage" where the corpus says
      `null`). Do not round up and do not quietly drop the earlier claim without correcting it.

- [x] T137 Create one shared sprite renderer `src/ui/shared/Sprite.tsx` (+ module CSS) used by
      T122/T125/T128/T129 — all four need the identical `import.meta.env.BASE_URL`-aware URL
      construction **and** the identical absent-`spriteFile` fallback, and four independent
      implementations will drift (one will forget the base path and 404 only in production, which is
      exactly the failure T136 has to hunt for). Props: the record's `spriteFile`, a kind
      (`"monster" | "trinket"`) selecting the subdirectory, a size, and the alt text derived from
      `name`. Renders nothing (not a broken `<img>`, not a placeholder box that shifts layout) when
      `spriteFile` is absent. **Foundational — do this before T122.** (depends on T114)
- [x] T138 [US1] Fix per-placement modifiers being silently discarded when a creature's level
      changes. `setPlacement` always constructs a fresh `TeamPlacement` with no `modifiers` (its own
      comment in `src/context/TeamConfigContext.tsx` acknowledges this), and `GridPicker`'s level
      `<select>` calls it — so changing a mon's level today wipes every modifier the user attached to
      it. This is pre-existing, but item 11 promotes per-mon modifiers to *the* modifier workflow and
      quickstart Scenario 22 step 5 walks straight into it. Preserve `modifiers` across a
      level/species change for the same slot (an evolution keeps the carry-over the user recorded),
      and add a unit test in `src/context/__tests__/TeamConfigContext.test.tsx` or the existing
      context test file. Found during this round's review; not user-reported.
- [x] T140 [US3] Populate `abilityTags` on level 2-4 records where a level-1 record has them.
      **Found while writing T118, not user-reported**: only 6 of 149 level-1 records carry
      `abilityTags` at all (a long-standing, documented scope limit — research.md B6), but **zero**
      of the 447 level 2-4 records do, because round 5's bulk population never emitted them. The
      functional consequence: `Formiqueen`'s cooldown-speed aura is the one engine-read tag kind
      (`resolveCooldownSpeedTotal`), so **levelling Formiqueen up silently deletes its aura** —
      its level-1 record buffs adjacent Common allies by +25% and its level-2/3/4 records buff them
      by nothing. The authoritative per-level series gives the real values: Formiqueen
      **25% / 50% / 75% / 225%** across levels 1-4. Populate those, and record honestly in
      `creatures.ts`'s header comment that the other 5 tagged species' per-level abilities
      (Pebbler's +15/30/45/90 Shield, Onsetra's 1/2/3/24 extra Ongoing applications) are captured
      as by-level `abilityText` but still have no engine-read tag kind — same pre-existing scope
      gap, now stated per level rather than implied.
- [x] T141 [US3] Remove `formiqueen`'s misfiled `conflicts` entry. It has a single `value`, and its
      own `resolution` text admits it is **not** a source disagreement ("No disagreement on the
      Common-only filter itself; recorded because the exact cooldown-speed value differs by
      creature LEVEL (25/50/75%), not by source"). It was a placeholder for data the model couldn't
      express in round 2, and its stated blocker ("until the data model grows a per-level stat
      table") is closed by round 5's per-level records plus T140's per-level tags. Delete the entry
      rather than relaxing T118's "a conflict needs ≥2 values" rule — that rule is precisely what
      SC-004 means, and weakening it to accommodate one misfiled note would hollow out the
      criterion. Keep the post-nerf provenance note (25/50/75% down from 33/67/100%), which is a
      real, separate citation already recorded in `patch`.
- [x] T139 [P] Add cheap component assertions for the presentation items that otherwise have **no**
      automated coverage at all — items 4, 6, 7, 8, 10 and 13 are currently verified only by T135's
      manual walk, which is the same "verified by eye, silently regresses later" pattern that led to
      this round's audit. In the existing/new component test files, assert: no `/back row|front row/i`
      text renders in `GridPicker` (item 6); `CreatureSearchModal`'s heading is exactly
      `Choose a Banto` with no slot suffix while its dialog `aria-label` still contains the slot
      (item 13); the trinket picker renders a selected trinket's `effectText` (item 4); a placed
      creature's slot renders at least one stat badge with its stat's colour (item 8); both summary
      tables render within one shared container element (item 10). These are 1-3 lines each — the
      point is a tripwire, not exhaustive coverage.

### Polish for Phase 11

- [x] T135 [P] Walk quickstart.md Validation Scenarios 18–24 and record results in quickstart.md,
      stating for each whether it was verified by an automated test or by code-tracing/manual
      check — same honesty convention as every prior round's results block.
- [x] T136 Verify `npx tsc -b --noEmit`, the full `npx vitest run`, and `npm run build` all pass;
      confirm the vendored sprites are present in `dist/` and resolve under the
      `/batomon-calculator/` base path (a root-relative sprite path passes locally and 404s in
      production — check the built output, not just the dev server).

**Checkpoint**: Creature information is presented in the game's own band layout in both places it
appears; the corpus browser is a dense multi-column grid with no provenance footnotes (provenance
now guarded by a test instead); trinkets are chosen from a card grid that actually shows their
effects; every creature and trinket has its real sprite; slots are square, clearable, and show
live colour-coded stat badges; the simulation-window control and the two summary tables sit where
the user asked; Modifiers is a collapsed per-mon disclosure with the engine's team-wide path still
intact for trinkets; grid position no longer changes any computed number; and the two data defects
found this round are fixed and the overstated claim corrected rather than left standing.

---

## Phase 12: Round 7 — Design System, Picker/Card Redesign, Click-vs-Drag Fix, Second-Order Status Metrics (2026-10-06)

**Goal**: Implement plan.md's "Amendment: Round 7" — the user's 20 reported items (FR-041..FR-058),
including the new **Constitution Principle VII** that binds all future work to a shared design
system.

**Independent Test**: quickstart.md Validation Scenarios 25–31.

### Traceability — every one of the user's 20 numbered items

> **Nothing here may be marked done until the named task is actually done.**

| # | User's item | Task(s) | FR | Scenario |
|---|---|---|---|---|
| 1 | Shield UI colour is brown/stone; should be silvery | T154, T154b, T173 | FR-041 | 30 |
| 2 | "Placed Banto stats" typo → "Batomon Stats" | T155, T173, T174 | FR-042 | 30 |
| 3 | Batomon stats card must not resize to contents; no overflow | T156, T173 | FR-043 | 26 |
| 4 | "Effective this battle" shows `6.00`, should match `6.0` | T146, T157, T173 | FR-044 | 30 |
| 5 | Modifiers wastes space — 1 item/row; make responsive | T158 | FR-045 | 29 |
| 6 | Modifiers must accumulate same-stat adds, not duplicate chips | T149, T158 | FR-045 | 29 |
| 7 | "Shield (granted)" overly verbose → "Shield" | T159 | FR-046 | 30 |
| 8 | Can't click a placed mon to change it; only drag works | T147, T160 | FR-047 | 25 |
| 9 | "Choose a Banto" typo → "Choose a Batomon" | T155, T173, T174 | FR-042 | 30 |
| 10 | Picker cards crowded; restructure, rarity as sections, no rarity/price text | T161, T171, T173 | FR-048 | 27 |
| 11 | Picker split background shows a sliver of the other colour | T145, T161, T173 | FR-049 | 27 |
| 12 | Remove corpus-snapshot prose from the header (+ FR-014 rehomed) | T162, T173 | FR-050/FR-014 | 30 |
| 13 | Trinket picker card heights must be uniform | T163, T171 | FR-051 | 26 |
| 14 | **Shared design system / DRY — binding on all future work** | T142–T146, T168, **T171 (composites), T172 (data/logic DRY)** (+Constitution VII) | FR-058 | 31 |
| 15 | Side-card mon image too small; type div height varies | T156, T171, T173 | FR-043 | 26 |
| 16 | Active trinkets must be collapsible | T164, T173 | FR-052 | 26 |
| 17 | Active trinket name + `×` must be top-aligned | T164 | FR-052 | 26 |
| 18 | Grid sprites 40px, should be 64px (and *why* 40?) | T165, T173 | FR-053 | 30 |
| 19 | Chart Y label clipped; X label right-justified | T166 | FR-054 | 30 |
| 20 | Second-order status metrics + DOT facilitated DPS | T148, T151–T153, T167 | FR-055/056/057 | 28 |

**Review record (2026-10-06)**: this phase was audited against the user's verbatim 20 items by a
separate reviewing agent, and its empirical claims were independently re-verified before acceptance.
Six findings were confirmed and folded in above, recorded here rather than lost:

1. **My own headline evidence for item 20 was inflated.** The "Poison's final second deals 293, a
   4.5× spread" figure came from a probe that clamped the final tick into the last bucket,
   double-counting it. Re-measured correctly: **2.1–2.5×**. The argument holds; the number did not.
2. **The proposed growth metric was the wrong tool.** A least-squares slope returned 2.83/2.70 for a
   case whose exact answer is 2.50, and produced `NaN` at a 1-second window. Replaced with exact
   arithmetic (T152).
3. **Item 12 would have silently broken FR-014.** The plan claimed the Corpus Browser's summary line
   already stated the patch version. It does not — it carries counts only. T162 now rehomes it and
   spec.md amends FR-014 explicitly.
4. **The sliver diagnosis was wrong** (antialiasing at the centre vs. `background-clip: border-box`
   repeating into a transparent border at the edge), and **the picker card ratio was wrong and
   inverted** (~3:4 portrait vs. the measured ~1.2:1 landscape).
5. **T147 would not have failed first.** A bare `fireEvent.click` already passes today, so the
   "failing test" proving item 8's bug would have been green against broken code.
6. **Item 14 was under-scoped**: no composite components, no shared grid, and no data/logic
   de-duplication despite the user naming "data, logic, functions, and UI" — now T171/T172.

**Answers to the two questions asked in the items** (recorded so they aren't lost in chat):

- **Item 18, "why 40x40?"** — it was an arbitrary number I picked in round 6 to fit the smaller slot
  card. No source, no reasoning. Caveat worth knowing: the source PNGs are 48×48, so 64px is a
  **1.333× non-integer upscale** (some source pixels render 1 screen-pixel wide, others 2). **96px
  is the exact 2×** and would be crisper. Implementing 64 as asked; 96 recorded as the alternative.
- **Item 20, "where does Poison 21.30 come from?"** — it is **damage per second**
  (`total Poison tick damage / window`), *not* stacks applied per second. But the follow-up argument
  is correct and is a property of the mechanics: `applyStatusTick` decays Burn and explicitly **not**
  Poison, so Poison's rate climbs without bound. Measured on a representative team, the final second
  dealt **293** against a 20-second average of **65.50**.

### Foundational for Phase 12 — the design system comes FIRST (blocking)

> Ordered first deliberately: every later task in this phase must *compose from* these, not restyle
> in place. Building the UI fixes first and retrofitting primitives afterwards would reproduce
> exactly the duplication Principle VII was added to stop.

- [x] T142 Create design tokens in `src/ui/tokens.css` (imported once from `src/index.css`): spacing
      scale, radii, surface/border colours, type scale, and **sprite sizes** as CSS custom
      properties. Derive the values from what the existing components already use (audit
      `*.module.css` for the recurring `#212330` / `#2c2f3b` / `#3a3d48` / `0.4rem` / `6px` family)
      so this codifies the current look rather than restyling the app. **Reconcile with the vars
      that already exist** in `src/index.css` (`--bg`, `--text`, `--border`) — extend them, don't
      introduce a second parallel naming scheme. Include a `--sprite-size-grid` token for T165.
      Literals in component CSS are a defect from this point on (Constitution Principle VII).
- [x] T143 Create `src/ui/primitives/` with `Surface` (the one card/panel container: border, radius,
      background, padding variants), `Chip` (the one pill — used today by `TypeTag`, modifier chips,
      and trinket badges with three different definitions), `StatBadge` (colour-coded stat pill), and
      `SectionHeading`. Each MUST be typed per the installed React skill (discriminated-union
      variants, no `any` props). (depends on T142)
- [x] T144 Create `Modal` and `Disclosure` primitives in `src/ui/primitives/`. `Modal` must cover
      what `CreatureSearchModal` and `TrinketPicker` currently duplicate (overlay, panel, header
      row, Escape-to-close, click-outside-to-close, focus handling); `Disclosure` must cover what
      `ModifierEditor` has and what T164 needs for trinkets. (depends on T142)
- [x] T145 Create a `TypeSplit` primitive that renders a creature's type background as **two
      explicitly-sized halves**, replacing `typeBackground()`'s
      `linear-gradient(..., A 50%, B 50%, ...)`. This is the fix for item 11: the gradient's hard
      stop antialiases at fractional pixel widths and bleeds a 1px sliver, which
      `background-clip: border-box` then paints under the card's transparent border (research.md
      I8). Keep `typeColor()` as the single source of truth for which colour a type is; only the
      *composition* changes. Update every current `typeBackground()` call site. (depends on T142)
- [x] T146 Create `src/data/format.ts` with shared formatters — at minimum `formatCooldown()` (one
      decimal) and `formatStatAmount()` — and route **every** surface through them. This is the fix
      for item 4: the base band uses `toFixed(1)` and the effective band `toFixed(2)`, so the same
      cooldown renders `6.0` and `6.00` one above the other (FR-044).

### Tests for Phase 12 ⚠️ write first, confirm failing before implementing (Constitution Principle III, NON-NEGOTIABLE)

- [x] T147 [P] Write a **failing** test in `src/ui/GridPicker/__tests__/GridPicker.test.tsx` for
      FR-047 / item 8: clicking an occupied slot card opens `CreatureSearchModal`. **Assert the
      positive case** — round 6's suite only asserted the negative (the `×` must *not* open it),
      which is exactly why a completely dead click handler passed CI for a round.
      **It must fire the real pointer sequence** `pointerDown` → `pointerUp` → `click`, not a bare
      `fireEvent.click`: a bare click already passes today (verified), because `@dnd-kit` suppresses
      the click via a capture-phase `stopPropagation` listener installed on `pointerdown` — so a
      `fireEvent.click`-only test would be green against the broken code and prove nothing.
      **Do not** assert "drag moves the placement": jsdom has no layout rects, so `over` is always
      `null` and the assertion cannot pass for the right reason. Assert instead that a pointer move
      **past 8px suppresses the click**, which is the actual contract being added.
- [x] T148 [P] Write **failing** tests in `src/engine/__tests__/simulate.test.ts` for FR-055/056/057
      / item 20, using a synthetic fixture with one Poison applier and one Burn applier:
      - every Burn **and** Poison application appears in `timeline` as an `ongoingChange` (today
        only Shock and Shield do — this asymmetry is why applied-rate isn't derivable);
      - `perStatusAppliedPerSecond` equals stacks applied ÷ window, for all four statuses;
      - `perStatusDamageGrowthPerSecond` is **clearly positive for Poison** (stacks never decay) and
        **~0 for Burn** (stacks decay to a steady state) — assert the *qualitative difference*, since
        that difference is the mechanic, not a tuned constant;
      - **pin one exact worked case** so the arithmetic can't drift: a lone Drumire (Poison 20,
        8s cooldown) over a 20s window deals **320** total Poison damage (= 16.00/s average) with a
        final-second rate of **40/s** and growth **2.00 damage/s²**; over 60s it is 3920 / 65.33 /
        140 / 2.33. These are measured, not derived by hand;
      - **a 1-second window produces no `NaN`** in any of the three new fields (the UI's minimum);
      - the fixture covers Poison and Burn; **state in the test file that Shock and Shield are not
        covered by it** rather than implying `Record`-wide coverage that doesn't exist;
      - a creature that only applies Poison has **non-zero** `perCreatureFacilitatedDps` and still
        **zero** `perCreatureDps` (facilitated stays separate from own-DPS).
- [x] T149 [P] Write **failing** tests in `src/ui/Modifiers/__tests__/ModifierEditor.test.tsx` for
      FR-045 / item 6: adding `Burn applied +10` twice to one creature yields **one** chip reading
      `+20`; then adding `-20` removes the chip entirely rather than leaving `+0`.
- [x] T150 [P] Write a copy/consistency tripwire in `src/ui/__tests__/presentation.test.tsx`: no
      rendered output and no `aria-label` anywhere contains "Banto" (FR-042, items 2 + 9), and the
      status table renders `Shield` and not `Shield (granted)` (FR-046, item 7). A grep-style
      assertion over `src/` catches the strings a screenshot-driven fix would miss.

### Implementation — engine (independent of all UI work; land first)

- [x] T151 [US1] In `src/engine/simulate.ts`, push an `ongoingChange` timeline event when **Burn or
      Poison** is applied, matching what Shock and Shield already do (FR-057). Today Burn/Poison
      reach the timeline only as *ticks*, so applications are uncountable — this is a prerequisite
      for T152, not a cosmetic addition. (depends on T148)
- [x] T152 [US1] Add `perStatusAppliedPerSecond`, `perStatusFinalDamageRate`, and
      `perStatusDamageGrowthPerSecond` to `SimulationResult` — declared in `src/data/types.ts` and
      documented in `contracts/engine-api.md` — per data-model.md's round-7 amendment (FR-055).
      **Compute growth exactly, NOT by curve-fitting.** A first draft specified a least-squares
      slope over 1-second buckets; that was rejected on measurement — it returned 2.83 and 2.70 for
      a case whose exact answer is 2.50, was sensitive to bucket-edge placement, was polluted by the
      zero-damage startup, and produced **`NaN` at a 1-second window**, which the UI permits.
      Instead: the damage rate at time *t* for a non-decaying status is `live layers(t) /
      tickInterval`, so report `perStatusFinalDamageRate` (rate at window end) and
      `growth = (finalRate − initialRate) / windowSeconds`. Exact, deterministic, no NaN.
      For **Shock** (damage arrives via `shockProc`, not ticks) and **Shield** (no damage at all)
      state explicitly what these fields mean rather than emitting a meaningless number for a
      `Record` that spans all four statuses. (depends on T151)
- [x] T153 [US1] Attribute Burn/Poison tick damage to the creature that applied the status (FR-056):
      add the applying creature's key to `ActiveStatus` alongside its existing `sourceSlot`, and
      accrue each tick's damage into the same `facilitatedDamage` map Shock procs already feed. Keep
      facilitated output **separate** from own-DPS — a DOT applier's contribution is not direct
      damage, and merging them would make a DOT team's DPS column incomparable with a direct-damage
      team's. (depends on T148)

### Implementation — UI (all of it composed from T142–T146's primitives)

- [x] T154 Correct `STAT_COLORS.shield` in `src/data/statColors.ts` from the brown `#a47c41` to
      **`#9aa1b8`** (item 1 / FR-041). That value is *sampled* from the user's in-game capture, not
      eyeballed: the shield plate reads `#a7a8b4` / `#a8a9b4` / `#a5a9da`, and `#9aa1b8` is that hue
      family nudged darker so white badge text keeps legible contrast. Record in the file's comment
      that this **overrides** the batodex-published value research.md H2 cites, on the evidence of
      the in-game capture — six of seven colours were cross-checked against an in-game card in round
      6 and `shield` was the one that wasn't, which is why it is the one that is wrong.
      **Also update every stale `#a47c41` reference** (the `statColors.ts` header's
      "should not be adjusted to taste" note, research.md H2's table, quickstart Scenario 19) so the
      corpus of docs doesn't keep asserting the old value.
- [x] T154b Make `src/ui/CumulativeChart/CumulativeChart.tsx` consume `STAT_COLORS` instead of its
      own hard-coded `#e07b39` / `#8e44ad` / `#d4b106` / `#2e86de` strokes (FR-041 + Principle VII).
      Those literals **already disagree** with `STAT_COLORS` today, so fixing only `statColors.ts`
      would leave Shield blue in the chart and legend while it is silver everywhere else. Found
      while verifying item 1; pre-existing, not introduced this round. (depends on T154)
- [x] T155 Replace "Banto" with "Batomon" across **all** user-facing copy (items 2 + 9 /
      FR-042): `Placed Banto stats` → `Batomon Stats`, `Choose a Banto` → `Choose a Batomon`, and
      every `aria-label`, empty state, and title attribute found by grepping `src/` — not only the
      two surfaces the user named. Satisfies T150.
- [x] T156 [US1] Rework the selected-creature card in `src/ui/shared/BatomonCard/` and
      `PlacedCreatureDetails.tsx` for items 3 + 15 (FR-043): **fixed outer dimensions** that do not
      change between creatures, with independently reserved heights for the sprite/type band and the
      ability band. Size against the corpus's measured worst case, not a guess — longest name is
      **12 chars** ("Quillustrous"), max type count is **2**, longest `abilityText` is **169 chars**.
      Enlarge the sprite to the T142 token (item 15): the two-type column looks like wasted space
      precisely *because* a 44px sprite doesn't fill the height the type chips set.
      **Reserve every variable band, not just the two named** — the stat-lines block varies (and
      appears twice: base and "Effective this battle"), and the meta footer varies with
      `Sell` / `Evolves into…` / `Unconfirmed: …`. State the wrap basis: the side column is
      `flex: 1 1 16rem`, so "fixed" means a fixed *height* at a defined minimum width, not a frozen
      width. **`BatomonCard` is shared with the Corpus Browser** — decide and state whether fixed
      sizing applies there too (it should, for FR-051's uniform grid) rather than leaving one
      consumer to discover it. Compose from `Surface`/`Chip`/`SectionHeading`/`StatLine`.
      (depends on T143, T145, T171)
- [x] T157 Route the "Effective this battle" band's cooldown through `formatCooldown()` so it
      renders `6.0`, matching the base band directly above it (item 4 / FR-044). (depends on T146)
- [x] T158 [US1] Rework `src/ui/Modifiers/ModifierEditor.tsx` for items 5 + 6 (FR-045): (a) lay the
      per-creature rows out in a responsive auto-fit grid instead of one per row — reuse the same
      grid approach the corpus browser uses rather than a new breakpoint ladder; (b) **accumulate**
      repeated modifiers of the same `stat` on the same placement into a single entry, and **remove
      the entry entirely when the accumulated amount reaches zero** rather than leaving a `+0` chip.
      The engine already sums duplicates correctly, so this is a model-of-record and display change.
      Satisfies T149. (depends on T143, T144)
- [x] T159 Render `Shield` instead of `Shield (granted)` in `TeamSummary.tsx` (item 7 / FR-046).
      The qualifier advertises a granted-vs-absorbed distinction the engine does not model; that
      scope limit stays documented in README/`T037`, not in a table cell. Satisfies T150.
- [x] T160 [US1] Configure `@dnd-kit` sensors explicitly in `src/ui/GridPicker/GridPicker.tsx` with
      `useSensor(PointerSensor, { activationConstraint: { distance: 8 } })` (item 8 / FR-047). Root
      cause: `<DndContext>` has no `sensors` prop, so the default `PointerSensor` begins a drag on
      `pointerdown` and `preventDefault()`s it, so the `click` the card's handler waits for is never
      synthesised. Round 4's comment claiming the sensor "only engages past a drag threshold" is
      **wrong** and must be corrected — there is no default threshold.
      **Do not claim to add keyboard dragging.** `DraggableCard` spreads `{...listeners}` and then
      defines its own `onKeyDown`, which overrides the sensor's and already owns Enter/Space (the
      default keyboard-drag activators). Adding a `KeyboardSensor` would change nothing while
      implying it did. Keyboard users keep Enter/Space to **open the picker** (the accessible path
      to reassignment); record "no keyboard drag" as a known limitation rather than papering over
      it. Satisfies T147. (depends on T147)
- [x] T161 [US1] Redesign `src/ui/GridPicker/CreatureSearchModal.tsx` for items 10 + 11
      (FR-048/FR-049), using the user-supplied in-game shop card as the reference: taller cards
      (~3:4 w:h), sprite centred and large, name beneath; **no rarity text and no price on the
      card** (price explicitly excluded — it is a shop concept, not a planning one). Group results
      into **rarity sections with a small left-justified rarity heading** per group, which conveys
      more than the per-card label did while removing text from the card. Use `TypeSplit` (T145) for
      the background so the sliver is gone, and `Modal` (T144) for the chrome. This file has 14
      inline `style={{}}` blocks today — it should finish with ~0. (depends on T144, T145)
- [x] T162 Remove the corpus-snapshot prose from the header in `src/App.tsx` (item 12 / FR-050)
      **and give FR-014 a real home**. The first draft of this task claimed "FR-014 remains
      satisfied by the Corpus Browser's own summary line" — **that was false**: that line carries
      entry counts only and states no version, so removing the header as drafted would have left
      FR-014 unmet on every surface while the plan asserted compliance (caught in review).
      Concretely: move a single compact `Balance 24 / 1.2.0` clause into the Corpus Browser's
      summary line (a corpus-level version stamp is **not** the per-record citation/conflict
      rendering FR-030 removed — FR-030 bans per-entry provenance, which this isn't), relocate or
      retire `CORPUS_PATCH_LABEL` rather than orphaning it, and update the README line that tells
      maintainers to edit it in the header. spec.md's round 7 Amendment records the FR-014 narrowing.
- [x] T163 Give `TrinketPicker`'s grid cards a **uniform fixed height** sized to the corpus's
      longest `effectText` (**110 chars**, measured) so no row is ragged and no text overruns
      (item 13 / FR-051). State the width the 110 chars are wrapped at — a character count alone
      doesn't determine a height — and verify at the grid's actual minimum column width.
      (depends on T142, T144, T171)
- [x] T164 [US1] Rework the **selected**-trinket list for items 16 + 17 (FR-052): wrap it in the
      `Disclosure` primitive so adding trinkets no longer pushes the team grid down (with 9
      selected the grid is off-screen), and **top-align** the name column and the `×` column so the
      remove control sits at a constant vertical position regardless of description length. The
      complaint is click-target consistency, not aesthetics. **Default the disclosure to collapsed**
      — defaulting to open would still push the grid down on the first add, which is the whole
      complaint — and surface the selected count on the summary so collapsing hides nothing
      important. (depends on T144)
- [x] T165 Display grid sprites at **64px** via a named token from T142, not a per-call-site
      literal (item 18 / FR-053). Record the caveat in the token's comment: the source PNGs are
      48×48, so 64px is a 1.333× non-integer upscale and **96px is the exact 2×** if crisper
      rendering is wanted later. Keep `image-rendering: pixelated`.
      **Check the small-viewport case**: the slot card is square with `overflow: hidden`, and at
      three columns on a phone width a 64px sprite plus the level label, name, and stat badges can
      overflow it. Verify at a narrow viewport and let the token scale down there if needed.
      (depends on T142)
- [x] T166 [P] Fix the chart axes in `src/ui/CumulativeChart/CumulativeChart.tsx` (item 19 /
      FR-054): the Y label is clipped to `cumulative valu` because `position: "insideLeft"` has no
      room with the chart's `left` margin at `0` — give it margin. Recharts anchors `insideLeft` at
      the text's *start* at the plot's vertical midpoint and the rotated text extends upward, so
      also set `style={{ textAnchor: "middle" }}` or the label is off-centre even once it fits.
      Change the X label from `insideBottomRight` (right-justified) to `insideBottom`, and raise the
      `XAxis` `height`/offset so it doesn't collide with the tick labels.
      **Honest note**: `ResponsiveContainer` has zero size in jsdom, so this cannot be asserted in a
      unit test — verify in the browser and say so in the results rather than claiming test coverage.
- [x] T167 [US2] Extend the status-output table in `src/ui/TeamSummary/TeamSummary.tsx` to show, per
      status, **damage/second (window average)**, **damage/second at end of window**,
      **applied/second**, and **growth (damage/s²)** from T152 (item 20 / FR-055).
      **Also fix the now-stale "Facilitated DPS" column tooltip** in the *first* table, which reads
      "e.g. Shock … enabled on other hits" — once T153 lands it holds Burn/Poison damage too. Label them so the distinction is unmistakable — the user explicitly mistook the
      existing figure for an application rate. Add a short note that a non-decaying status (Poison)
      has a rising damage rate, so the averaged figure understates a long fight. (depends on T152,
      T143)
- [x] T168 Migrate the remaining surfaces onto the primitives layer and **record what was not
      migrated** (item 14 / FR-058): `TeamSummary`, `CorpusBrowser`, `BatomonCard`, `TrinketPicker`,
      `GridPicker`, `App`, **`TypeTag` (onto `Chip` — T143 creates `Chip` but no task currently
      migrates `TypeTag` onto it), `CumulativeChart`, `TrainerPicker`, and `Sprite`**. Re-run the `style={{` census from research.md I14 and report the
      before/after numbers honestly. Any surface left unmigrated goes in README as explicitly
      outstanding — Principle VII requires the remainder be recorded, not implied complete.
      (depends on T142–T146)

- [x] T171 Add the **composite** primitives item 14 asks for, which T143–T145 alone do not provide.
      The user's own example — "the subcomponents that go into displaying a mon's color subframe
      should be the same" — is not met by `TypeSplit` alone, because the slot card, the picker card,
      and the side card each still assemble sprite + background + name separately. Add:
      - `CreatureTile` — the one sprite-on-type-background-with-name unit, used by `GridPicker`'s
        slot, `CreatureSearchModal`'s result card, and `BatomonCard`'s identity band.
      - `CardGrid` — the one responsive auto-fit grid. Four bespoke copies exist today
        (`CorpusBrowser`, the creature modal, the trinket modal, and T158's modifier rows), and a
        CSS-module class cannot be shared across modules, so this must be a component.
      - `StatLine` — the one coloured `label: value` row, used by `BatomonCard`'s base and effective
        bands. (depends on T143, T145)
- [x] T172 De-duplicate **data and logic**, not just components — item 14 explicitly says "data,
      logic, functions, and UI", and the plan's first draft only addressed UI and formatters.
      Confirmed duplicates:
      - `RARITIES` is declared in **three** files (`CreatureSearchModal`, `CorpusBrowser`,
        `TrinketPicker`) with inconsistent ordering between them → one exported constant.
      - `STATUS_COLOR_KEY` is declared **twice** (`GridPicker`, `BatomonCard`), and
        `statColors.ts`'s `statusColor()` is a third `toLowerCase`-based variant of the same
        mapping → collapse to one.
      Add a tripwire test asserting these identifiers are each defined exactly once outside their
      home module, so the duplication cannot silently reappear.
- [x] T173 [P] Add the automated coverage the rest of this phase lacks — items 1, 2, 3, 4, 9, 10,
      11, 12, 13, 15, 16, 18 and 19 are otherwise verified only by T169's by-hand walk, which is the
      same "verified by eye" pattern that let item 8's dead click handler survive a whole round.
      In `src/ui/__tests__/presentation.test.tsx` (and the relevant component test files), assert:
      **positively** that the side panel heading is `Batomon Stats` and the picker heading is
      `Choose a Batomon` (T150 only checks the *absence* of "Banto" — the same negative-only trap);
      no `Corpus snapshot` text renders in `App`; grid sprite `<img>` width equals the T142 token;
      the effective band renders `6.0` not `6.00`; the trinket disclosure hides the list when
      collapsed; picker cards render no rarity text and the grid renders rarity section headings;
      and `TypeSplit` renders two equal halves with **no** `linear-gradient` in its style.
- [x] T174 [P] **Update the existing tests this phase's renames break.**
      `src/ui/__tests__/presentation.test.tsx:65` asserts the heading is exactly `"Choose a Banto"`
      and will fail the moment T155 lands. Sweep for other assertions pinned to strings, colours, or
      sprite sizes this phase changes, and update them deliberately rather than discovering them as
      red CI.

### Polish for Phase 12

- [x] T169 [P] Walk quickstart.md Validation Scenarios 25–31 and record results, stating for each
      whether it was verified by an automated test or by code-trace/manual check.
- [x] T170 Verify `npx tsc -b --noEmit`, full `npx vitest run`, and `npm run build` all pass; report
      the `style={{` census delta from T168 and the final test count.

**Checkpoint**: the app is composed from one documented primitives layer with Principle VII binding
future rounds; clicking a placed creature opens the picker again; the picker reads like the game's
shop with rarity as structure and no colour sliver; cards reserve space instead of reflowing;
Poison teams finally report their real contribution with an explicit growth rate; and the copy,
colours, labels, sprite size, and chart axes all say what the user actually asked them to say.

---

## Phase 13: Round 8 — Primitives Defects, Display-Layer Sorting, DPS-Rate Chart, Placement Optimiser (2026-10-06)

**Goal**: Implement the 18 work items in `orchestration/round-1-items.md` (FR-059..FR-070).

**Independent Test**: quickstart.md Validation Scenarios 32–38.

### Traceability — every work item maps to a task, and each task cites its WI id

| WI | Ask (abbreviated) | Task(s) | FR |
|---|---|---|---|
| WI-001 | Picker sprites still not 64×64 | T175, T177 | FR-060 |
| WI-002 | Picker name alignment broken | T175, T177 | FR-061 |
| WI-003 | *Question*: do these use the shared components? | T176 (answer recorded in research.md J1) | — |
| WI-004 | Two cooldown blocks formatted differently | T178 | FR-059 |
| WI-005 | Top block too tall, bottom too short | T178 | FR-059 |
| WI-006 | Remove "Unconfirmed: shopCost" | T179, T179b | FR-070 |
| WI-007 | Selected tile shifts width, chart redraws | T180 | FR-062 |
| WI-008 | Table bottom border faint | T181 | FR-063 |
| WI-009 | Remove "Batomon Stats" heading | T182 | FR-064 |
| WI-010 | Remove per-slot "or choose from dropdown" | T183 | FR-065 |
| WI-011 | Move Modifiers above Team Summary | T184 | FR-066 |
| WI-012 | Drop the em-dash hint | T184 | FR-066 |
| WI-013 | Browser cards not fixed height | T185 | FR-070 |
| WI-014 | Remove Corpus snapshot prose | T186 | FR-070/FR-014 |
| WI-015 | Rename to "Batomon Browser" | T187 | FR-070 |
| WI-016 | Sort at display time, site-wide | T188, T189 | FR-067 |
| WI-017 | DPS-over-time graph | T190, T191 | FR-068 |
| WI-018 | Placement optimiser | T192, T193, T194 | FR-069 |

### Foundational — fix the primitives first (blocking)

- [x] T175 **[WI-001, WI-002]** Fix `CreatureTile`/`TypeSplit` in `src/ui/primitives/index.tsx` +
      `primitives.module.css`. Root cause: `CreatureTile` passes its flex-column class to
      `TypeSplit` as `className`, which lands on the **host**, while the children render inside
      `TypeSplit`'s own `.typeSplitContent` wrapper — a plain block that shrinks to content. So
      `.creatureTileArt`'s `flex: 1` governs nothing, the name band sits directly under the sprite,
      and the bare coloured halves show through the rest of the card (SS1). Make `.typeSplitContent`
      fill the host and carry the layout, so the art area expands and the name band reaches the
      bottom edge. Also fix the sprite size to **64px, explicitly** (FR-060).
      **Naming "the token" is not sufficient and would have left this item unfixed**: there are four
      sprite tokens and the one named for this surface is `--sprite-picker: 48px`
      (`src/ui/tokens.css:67`), while the 64px one the team grid uses is `--sprite-grid`. `Sprite`'s
      own default is also 48. Set `--sprite-picker: 64px` so the picker matches the grid the user
      compared it against.
      **A token change alone is inert and "default to the token" is not executable as written**:
      `spriteSize` is a numeric prop rendered as `<img width={size}>`, and a CSS custom property
      cannot supply it. `--sprite-picker`, `--sprite-card`, and `--sprite-row` are currently read by
      **nothing** in `src/` — only `--sprite-grid` has a reader (`spriteGridSize()`). So either
      generalize that reader to take a token name, or have `CreatureTile` call it. Verify the
      rendered `<img width>` is actually 64; do not assume the token resolved.
      **This is the round's headline lesson — record it in the component's comment**: every call site
      inherited one defect identically, so shared components bought consistency, not correctness.
- [x] T176 **[WI-003]** Record the answer to the user's question in `research.md` J1 (already
      drafted — verify it is accurate after T175 lands): **yes**, the picker uses `Modal`,
      `CardGrid`, `CreatureTile`, and `TypeSplit`, all shared. Composition was never the problem;
      the shared component was internally broken and the call site passed a literal sprite size.
      Confirm no remaining picker-specific duplicate of a shared pattern exists.

### Implementation — UI

- [x] T177 **[WI-001, WI-002]** In `src/ui/GridPicker/CreatureSearchModal.tsx`, remove the hard-coded
      `spriteSize={48}` so the card inherits the (now 64px) `--sprite-picker` token (FR-060), and
      verify the rendered `<img>` really is 64 wide rather than assuming the token resolved —
      verify the card renders
      sprite-in-art-area / name-at-bottom with no empty colour block (FR-061). (depends on T175)
- [x] T178 **[WI-004, WI-005]** Give `CooldownBlock` an intrinsic fixed size in
      `src/ui/shared/BatomonCard/BatomonCard.module.css` (`.cooldown`) plus `align-self: start`, so
      it renders identically in both the base and "Effective this battle" bands (FR-059).
      **State the real cause in the task's commit/comment, because the user's diagnosis was half
      right**: the two blocks are *already* one shared component. The divergence came from
      `.cooldown` having no height of its own — the base band's parent carries
      `min-height: 5.5rem` and stretches it, the effective band's parent does not. A primitive whose
      appearance depends on its container is not reusable; that is the generalized rule FR-059 adds.
- [x] T179b **[WI-006]** Resolve the `Cost $unknown` the user also pointed at. T179 removes only the
      *marker*; the cost itself still renders as "unknown" (`displayField` → `unconfirmedFields`
      contains `"shopCost"`), so removing the marker alone **strictly reduces information** — the
      reader is left with an unexplained "unknown". The user stated "These are known". Either source
      the real shop cost for the affected records and drop `"shopCost"` from their
      `unconfirmedFields`, or — if no source has it — stop rendering a Cost line at all when the
      value is unconfirmed, rather than printing "unknown". Do **not** fabricate a cost.
- [x] T179 **[WI-006]** Remove the `Unconfirmed: …` marker from the stats card's meta row in
      `BatomonCard.tsx`. Keep `unconfirmedFields` in the data and keep rendering unknown values as
      "unknown" rather than `0` — the user objected to the *marker*, not to honest unknowns.
- [x] T180 **[WI-007]** Fix the selected-creature column's width in `src/App.tsx` (currently
      `flex: 1 1 16rem`) to a constant. **Add the width token this needs** — none exists today
      (`tokens.css` has only `--picker-card-min-width`/`--picker-card-aspect`) — e.g.
      `--detail-panel-width: 22rem`, and use `flex: 0 0 var(--detail-panel-width)` (FR-062). Round 7 deliberately left
      width flexible (research.md I3, "freezing the width would fight the page layout"); that is now
      superseded by the user's explicit request.
      **Correction to this task's first draft, which asserted a mechanism the DOM does not support**:
      it claimed the column's width drives the chart's width via `ResponsiveContainer`. It does not —
      `#root` is a fixed `1126px` (`src/index.css:55-57`) and `CumulativeChart`, while a sibling of
      the flex row in the `.App` tree, is **not a flex item inside that row** — so its width is
      already independent of this column's basis.
      Fixing the width is still correct for FR-062 and still removes the reflow the user can see, but
      **do not assume it eliminates the redraw**. If the redraw persists, investigate the real cause
      separately (likely `result` being recomputed on every config change, or a scrollbar appearing
      as the page height changes) and report it rather than declaring the item done.
- [x] T181 **[WI-008]** Make the summary tables' bottom edge **visually indistinguishable from the
      other three** (FR-063).
      **Corrected diagnosis — this is a COLOUR problem, not a weight problem**, and the first draft
      of this task would have left the user's complaint in place. All four edges are already `1px`:
      the three that read as "bold" come from the **global** rule `th, td { border: 1px solid #ccc }`
      in `src/App.css:19-20`, while `TeamSummary.module.css:33` overrides only
      `border-bottom: 1px solid #2c2f3b` — a near-background dark grey on a dark theme, which is why
      it disappears. An implementer matching *weight* would measure 1px everywhere, change nothing,
      and ship the same screenshot. Match `#ccc`'s contrast (or restyle all four edges coherently
      from tokens, which is the Principle VII-aligned option).
- [x] T182 **[WI-009]** Remove the `<h3>Batomon Stats</h3>` heading in `src/App.tsx` and align the
      panel's top edge with the team grid's top (FR-064).
- [x] T183 **[WI-010]** Remove the per-slot `<details>` "Or choose from dropdown" fallback from
      `src/ui/GridPicker/GridPicker.tsx` and its CSS (FR-065). **Record why this is now safe**: it
      was round 3's keyboard/screen-reader fallback (research.md E2.5), and removing it is only
      acceptable because round 7 restored click-to-open — Enter/Space on a slot opens the picker, so
      the accessible path survives. Note it so a future round doesn't "restore" it as a regression.
- [x] T184 **[WI-011, WI-012]** In `src/App.tsx`, move `<ModifierEditor />` to sit between the team
      grid and `<TeamSummary />` (FR-066), and drop the em-dash hint
      (`— optional carry-over bonuses`) from the Modifiers disclosure summary in
      `src/ui/Modifiers/ModifierEditor.tsx`. Keep the active-count hint, which is not redundant.
- [x] T185 **[WI-013]** Pass `fixedHeight` to `BatomonCard` from `CorpusBrowser.tsx` so browser cards
      share one height (FR-070). **This reverses a round 7 decision** (research.md I3 deliberately
      left it off there, reasoning the grid already equalizes rows and freezing 149 cards wastes
      space) — record it as superseded by the user's explicit request, not as an oversight.
      **`fixedHeight` is currently a boolean selecting one class with a single value sized for the
      side panel** (`.cardFixed { height: 33rem }`), so "pass `fixedHeight`" and "size it for the
      browser's narrower cards" are mutually exclusive as first drafted. Change the prop to accept a
      variant (e.g. `fixedHeight?: "panel" | "browser"`) with its own height per variant, rather than
      forcing 33rem onto 149 browser cards.
- [x] T186 **[WI-014]** Remove the "Corpus snapshot" prose from `CorpusBrowser.tsx` **and relocate
      the version to a single footer line** so FR-014 keeps a home (FR-070). Round 7 moved this text
      *into* the browser precisely to satisfy FR-014 after removing it from the header; dropping it
      outright would leave the requirement unmet with no surface — the exact failure review caught
      last round. Update the README maintainer note to point at the new location.
- [x] T187 **[WI-015]** Rename the view to **"Batomon Browser"** everywhere: the `<h2>`, the nav
      button, and any `aria-label`/title (FR-070). Grep for "Corpus Browser" rather than editing only
      the heading.
- [x] T188 **[WI-016]** Sort `distinctCreatures` by name in `src/data/corpus.ts` so every consumer
      inherits a deterministic order regardless of file order (FR-067). Root cause confirmed:
      `distinctCreatures` is a `filter()` over `corpus.creatures`, which preserves **file order**, and
      `creatures.ts` opens with the six original seed records (Bumblebolt, Formiqueen, Venopuff,
      Scorchimp, Pebbler, Onsetra) before running alphabetically — exactly the "first 6 are not
      alphabetical" pattern in SS5.
- [x] T189 **[WI-016]** Audit **every** list surface for reliance on source order and fix each —
      the ask says lists "anywhere in this site", so this is not limited to the browser. Check at
      minimum `CorpusBrowser`, `CreatureSearchModal`, `TrinketPicker`, and `TrainerPicker`.
      **Three surfaces missed by the first draft of this task, all verified**:
      (a) the browser's own **Type filter** is a hard-coded, non-alphabetical array
      (`CorpusBrowser.tsx:8-11`) rendered straight into its `<select>` — a list in the very view the
      user screenshotted, and the picker's equivalent list *is* sorted, so the app contradicts
      itself; (b) `TeamSummary`'s DPS rows follow `config.placements` insertion order; (c) its status
      rows follow `Object.entries(perStatusPerSecond)` key order. The ask says lists "anywhere in
      this site", so these count. Add an automated assertion that a displayed list is sorted, so a
      future corpus edit cannot reintroduce file-order dependence. (depends on T188)

### Implementation — engine & charts

- [x] T190 **[WI-017]** Add an instantaneous damage-rate series to `SimulationResult` in
      `src/engine/simulate.ts` + `src/data/types.ts` (FR-068): total damage bucketed into 1-second
      intervals divided by the interval, derived from the existing `timeline` so it cannot diverge
      from the cumulative series. **State the bucket choice and why**: 1 second matches the Poison
      tick interval and the per-second framing used throughout the UI; finer buckets render as a comb
      of per-cast spikes, coarser ones flatten the ramp the user wants to see. Write the failing test
      first (Constitution Principle III): a Poison team's rate series must **rise** across the window
      while a pure direct-damage team's stays flat.
- [x] T191 **[WI-017]** Add a `DpsRateChart` component rendering that series, placed alongside the
      cumulative chart (FR-068). Reuse the existing chart's axis/colour treatment — including round
      7's `STAT_COLORS` sourcing and the FR-054 axis-label fixes — rather than writing a second
      chart's styling from scratch (Principle VII). (depends on T190)
- [x] T192 **[WI-018]** Add a placement optimiser in `src/engine/optimize.ts` (FR-069): enumerate
      arrangements of the **currently placed** creatures (≤6 creatures in 6 slots = ≤720
      permutations; `simulate()` is fast enough for exhaustive search, so no heuristics) and score
      each with a **time-weighted** objective that discounts later damage. The user's reasoning is
      the requirement: raw window total over-rewards a slow Poison ramp that may arrive after the
      team is dead. Expose the weighting rather than hiding it. Write the failing test first: a team
      with a known positional interaction (Formiqueen's adjacency aura) must be reported as
      improvable when its beneficiary is moved out of range.
- [x] T193 **[WI-018]** Surface the optimiser in the UI with its **blind spot stated** (FR-069).
      **Non-negotiable honesty requirement, with a corrected count.** An earlier draft of this task
      claimed "only one creature has an engine-readable positional `AbilityTag`". **That is false and
      the correction matters**: *two* creatures carry positional-target tags — Formiqueen
      (`adjacent`) and **Onsetra** (`behind`, "the ally behind applies its Ongoing abilities 1
      additional time", which is literally one of the chaining effects the user described). But
      `simulate.ts:108` reads **only** `cooldownSpeedModifier` tags, so Onsetra's tag is present,
      typed, and silently ignored.
      Therefore the UI count MUST be computed from **what the engine can act on**, not from "has a
      positional tag" — the latter would report a reassuring "2" for a team the optimiser cannot
      actually reason about, which is the precise misleading outcome this requirement exists to
      prevent. Note the count is also level-dependent: Onsetra's level 2-4 records have empty
      `abilityTags` while Formiqueen's do not.
      **Also disclose unmodelled positional TRINKETS**, which the ask named ("trinkets make effects
      for certain slots") and the first draft omitted entirely. **There are six, not one** — Quick
      Flag (leftmost column, +4% Cooldown Speed), Earth Crest, Power Crown (+20 Damage), Rally Flag
      (+12 Damage), Link Cable ("All of your team's monsters are now considered adjacent to each
      other"), and one further slot-scoped effect — and several alter Cooldown Speed or Damage, i.e.
      **the optimiser's own objective**, which means placement already affects DPS independently of
      creature abilities. None carry `abilityTags`. The disclosure must count all selected trinkets
      with unmodelled positional text, not name a single example.
      (depends on T192)
- [x] T194 **[WI-018]** Record the corpus-coverage limitation behind T193 in `README.md`'s known-gaps
      list, so the optimiser's weakness is documented alongside the other honest scope gaps rather
      than discoverable only by using it.

### Polish

- [x] T194b **Write quickstart.md Validation Scenarios 32–38 before T195 tries to walk them.** The
      phase's Independent Test and T195 both cite scenarios that **do not exist** — quickstart ends
      at 31 — so the phase currently has no defined acceptance criteria. Cover at minimum: picker
      sprite size + name-band placement (WI-001/002), identical cooldown blocks (WI-004/005), fixed
      panel width (WI-007), display-layer sorting including the Type filter (WI-016), the DPS-rate
      chart rising for a Poison team (WI-017), and the optimiser's blind-spot disclosure (WI-018).
- [x] T194c **Add the round-8 amendments the other rounds all have and this one is missing**:
      `plan.md` (no round-8 section exists), `data-model.md` (T190 adds a `SimulationResult` field
      that file documents), and `contracts/engine-api.md` (T190's field and T192's entirely new
      `src/engine/optimize.ts` module both fall under that contract, which currently mentions
      neither).
- [x] T195 Walk quickstart.md Validation Scenarios 32–38 (not `[P]`: depends on T194b and writes the same file) and record results, stating per scenario
      whether it was verified by automated test or by code-trace/browser check.
- [x] T196 Verify `npx tsc -b --noEmit`, full `npx vitest run`, and `npm run build` all pass; report
      the final test count and any item left incomplete.

**Checkpoint**: the primitives layer is correct as well as shared; the picker renders as designed;
cooldown blocks are identical everywhere; nothing reflows the charts; lists sort themselves; the
browser is the "Batomon Browser" with uniform cards; a DPS-rate chart shows the ramp the numbers
already implied; and the optimiser ships stating what it cannot yet see.

---

## Phase 14: Round 9 — Effect-Resolution Engine, Total DPS, Time Scrubber (2026-10-06)

**Goal**: Implement the 9 work items in `orchestration/round-2-items.md` (FR-071..FR-076).

**Independent Test**: quickstart.md Validation Scenarios 39–44.

### Traceability

| WI | Ask (abbreviated) | Task(s) | FR |
|---|---|---|---|
| WI-001 | Grid icons much too small now | T197 | FR-071 |
| WI-002 | DPS table needs a combined total | T204 | FR-072 |
| WI-003 | Effective band wrong — Miasmaw should read Poison 336 | T199, T200, T202 | FR-073 |
| WI-004 | Build the all-effects resolution engine | T199, T200, T200b, T201, T202 | FR-073 |
| WI-005 | Placement suggester must use it | T203 | FR-074 |
| WI-006 | Prominent single total-DPS number | T204, T205 | FR-072 |
| WI-007 | Slider to scrub DPS through the battle | T205 | FR-076 |
| WI-008 | *Question*: why does DPS take off at 15s? | T206 (answered in research.md K2) | — |
| WI-009 | Cobrex's cooldown charge from ally poison unmodelled | T200b, T201 | FR-073 |

**Answers recorded for the question asked** (research.md K2, so it is not lost in chat):
**Cobrex has a 15 s cooldown and applies Poison 300, so its *first cast lands at t=15*.** Poison never
decays, so the rate steps from **84/s at t=15 to 400/s at t=16** and stays there. Not an artifact —
one creature's opening cast. And with WI-009 modelled it would fire around **t=9-10** instead (see
T200b's tie-break note), because **9** allied Poison applications land strictly before t=15 —
at t = 3, 3, 6, 6, 8, 9, 9, 12, 12.

### Foundational

- [x] T197 **[WI-001]** Restore the team grid's width (FR-071). **CORRECTED root cause** — the first
      draft blamed flex shrinkage from round 8's rigid sibling, and validation disproved it: the
      container is `flexWrap: "wrap"` (a rigid sibling wraps, it doesn't squeeze), `Sprite` emits
      fixed `width`/`height` with `flexShrink: 0` and no `max-width` (so a narrow pane **clips** it,
      never scales it), and `.grid` has no `width`/`flex-grow` at all.
      **The real cause is round 8's own T183**, which deleted the per-slot `<details>` containing a
      `<select>` of every creature name — the widest content in each column, and the thing giving
      `.grid` (`repeat(3, 1fr)`, content-derived basis) its intrinsic width. Fix by setting an
      explicit `width`/`min-width` on `.grid` in `GridPicker.module.css`. **A flex keyword in
      `App.tsx` would change nothing**, because it leaves the content-derived basis intact.
      **Use a concrete number**: `.grid` already caps at `max-width: 30rem`, and before T183 the
      per-slot `<select>` of creature names (longest: "Quillustrous") drove each column to roughly
      that cap. Set `width: 30rem` so the former cap becomes the actual width, and reconcile or
      remove the now-redundant `max-width`. Also delete the orphaned `.slot select` rule left behind
      by T183. Assert the rendered sprite is 64px in a component test, so "verify, don't eyeball"
      has something concrete to check.

### Tests first (Constitution Principle III, NON-NEGOTIABLE)

- [x] T199 **[WI-003, WI-004]** Write **failing** tests in `src/engine/__tests__/effects.test.ts`
      (new) pinning the user's own worked example as the acceptance criterion:
      - with Miasmaw + Cobrex + Drumire + Fumungus placed, Miasmaw's resolved `appliesStatus` is
        **Poison 336** (own 10 + allies 6 + 20 + 300 = 326). The user supplied this arithmetic; it is
        the spec.
      - Cobrex's effective cooldown is **reduced by 1 second per allied Poison application**, so its
        first cast lands at **t=9**, not t=15 (WI-009).
        **This number was wrong in the first draft (t≈4) and the error is instructive**: there are
        **9** allied applications strictly before t=15 (t = 3, 3, 6, 6, 8, 9, 9, 12, 12), not 11 —
        the draft counted the two landing *at* t=15 — and it then computed `15 − 11 = 4`, crediting
        charges that have not occurred by the proposed fire time. Solve it, don't subtract: the first
        `t` where `t + charges(t) ≥ 15`. At t=8 progress is 13; at t=9, 7 charges give 16 → fires.
        Since this is a test-first task, pinning the wrong number would have written the error into
        the suite as the round's acceptance criterion.
      - a creature with no relevant ability resolves to exactly its base stats — the resolver must
        not perturb teams it has nothing to say about.

### Implementation — engine

- [x] T200 **[WI-003, WI-004, WI-009]** Create `src/engine/effects.ts`: a single resolution pass that
      takes a `TeamConfiguration` + `Corpus` and returns each placement's effective stats after
      on-battle-start abilities, ally-triggered abilities, positional abilities, and selected
      trinkets. Add the `AbilityTag` kinds these need (a battle-start status grant scaled from
      allies' totals; a cooldown charge triggered by an ally event; a cooldown-speed grant triggered
      by an ally cast; damage scaled from a status on the target). **Order of resolution must be
      explicit and documented** — Miasmaw reads allies' Poison *totals*, so it must resolve after
      base stats are known but before cooldown-dependent effects, and the file must say so rather
      than leaving it to call order.
      **Scope limit: only ONE of the four families is a static pre-battle pass.** Miasmaw's
      battle-start grant is; Cobrex's charge, Drumire's per-cast Cooldown-Speed grant, and Fumungus's
      damage-from-enemy-Poison are all time-dependent, and Phase A precomputes every cast at a fixed
      `n * cooldown` (`simulate.ts:269-272`). This task delivers the static pass only; T200b carries
      the rest.
      **Three ambiguities, decided here in writing rather than guessed at implementation time**:
      1. *"total Poison of your allies"* means the sum of allies' per-application
         `appliesStatus.amount` (6 + 20 + 300), **not** accumulated stacks — the user's own
         arithmetic (336) settles it.
      2. *"ally"* **excludes self**, matching the existing resolver's self-skip
         (`simulate.ts:107`). This also keeps the lone-Drumire assertions in `simulate.test.ts`
         (40 stacks / 320 damage / 16.00/s) valid.
      3. *Fumungus* is `baseDamage: null, damageType: null`, and `isDirectHit` requires both, while
         no modelled target carries Poison stacks (`simulate.ts:36-47`). **Decision: leave Fumungus
         unmodelled this round and say so in the UI coverage count** — inventing a target model is a
         larger change than this round's scope, and silently granting it damage would fabricate output.
      Satisfies T199.
- [x] T200b **[WI-004, WI-009]** Convert Phase A's fixed `n * cooldown` cast precomputation
      (`simulate.ts:269-272`) into an **event-driven scheduler**, so a cooldown can change during the
      battle. Without it, Cobrex's charge and Drumire's cumulative Cooldown-Speed grant cannot be
      modelled at all — T200's static pass reaches only Miasmaw's family.
      **State the intra-timestamp tie-break explicitly.** At t=9 Cobrex's progress is 14 *before* that
      timestamp's two Poison applications and 16 *after*, so whether it fires at t=9 or t=10 is
      decided entirely by ordering within the timestamp. Round 6 already set the precedent that
      simultaneous events resolve against a **pre-timestamp snapshot** (research.md H8 / FR-040); a
      charge mechanic must either follow that rule — in which case Cobrex fires at **t=10** — or
      document why it deviates. **Pin whichever is chosen in T199's test and keep T207 consistent**;
      do not leave it to call order, which is the precision failure that produced the original t=4.
      **This is the largest structural engine change since the original build**; the suite pins exact
      numbers against the current scheduler, so re-derive each and explain it in its test comment
      rather than re-baselining. (depends on T200)
- [x] T201 **[WI-004, WI-009]** Populate `abilityTags` for the creatures this round exercises
      (Miasmaw, Cobrex, Drumire, Fumungus at minimum) so the resolver has structured input. **State
      the ceiling honestly in the file header, as a figure that stays true after this task runs**:
      **6 of 149** level-1 creatures had any `abilityTags` before this round and **10 of 149** will
      after it, so the engine does not retroactively make the other 139 creatures' prose abilities
      work. **Compute the number at test time rather than hard-coding a figure that goes stale** —
      the first draft of this task mandated stating "6 of 149" inside the very task that makes it 10.
- [x] T202 **[WI-003]** Make `simulate()` consume `effects.ts`. **Reporting is not enough, and the
      first draft of this task permitted the entire round to land without a single DPS number
      changing**: `perCreatureEffectiveStats` is built in Phase A and read by nothing downstream,
      while Phase B independently recomputes damage from `creature.baseDamage`
      (`simulate.ts:388`) and status amounts from `creature.appliesStatus` (`simulate.ts:413-427`).
      So **Phase B must read the resolved record at those two call sites**, or Miasmaw's band shows
      336 while its timeline still applies Poison 10 — leaving FR-073's "the simulation MUST use
      those resolved values" unmet and T208's delta report empty. Existing engine tests pin exact numbers; any that change MUST be re-derived and the
      change explained in the test comment, never silently re-baselined.
- [x] T203 **[WI-005]** Point the placement optimiser at the same resolution layer (FR-074), and
      **update `analyzePositionalCoverage()`** — it currently counts only `cooldownSpeedModifier` as
      actionable, which will *understate* coverage once the resolver handles more kinds. The count
      must track what the resolver actually handles, or round 8's honesty mechanism inverts into a
      different lie. **`optimize.test.ts`'s `expect(coverage.actionable).toEqual(["Formiqueen"])`
      deliberately excludes Onsetra and WILL invert** — re-derive it and explain the change in the
      test comment rather than re-baselining it.

### Implementation — UI

- [x] T204 **[WI-002, WI-006]** Add a total row to the per-creature table **and** a prominent
      headline total-DPS figure (FR-072) in `src/ui/TeamSummary/TeamSummary.tsx`. **Confirm the
      user's parenthetical in the UI copy**: `perCreatureDps` really is direct damage only, which is
      why their all-status team read `0.00` everywhere while dealing 136.6/s. Facilitated total
      exactly equals `perStatusPerSecond.Poison`, so direct + facilitated is a complete,
      non-double-counting partition of **damage** — summing those two is safe.
      **Do NOT sum the `perStatusPerSecond` record to build the headline**: `perStatusPerSecond.Shield`
      is Shield *granted*, never damage, and never enters `facilitatedDamage`, so that route inflates
      any Shield team. Sum direct + facilitated.
- [x] T205 **[WI-007]** Add a time scrubber (FR-076) that updates the headline figure to the selected
      moment's value, read from the existing `dpsRateSeries` so it agrees with the DPS-over-time
      chart **by construction** rather than via a second computation. Default to the whole-window
      average and make clear which is being shown.
- [x] T206 **[WI-008, FR-075]** Surface the coverage limit where the DPS number is shown: how many
      placed creatures have abilities the engine can act on. A DPS figure reads as authoritative in a
      way an empty suggestion list does not, so this matters more here than it did for FR-069. Also
      record WI-008's answer in `research.md` K2 (drafted) and verify it still holds after T202
      changes the numbers.

### Polish

- [x] T207 [P] Write quickstart Validation Scenarios 39–44 covering: grid sizing restored; combined
      total + headline DPS; Miasmaw resolving to Poison 336; Cobrex firing at the time T200b's
      tie-break rule fixes (t=9 or t=10, not t=4); the scrubber
      agreeing with the chart; and the coverage disclosure.
- [x] T208 Verify `npx tsc -b --noEmit`, full `npx vitest run`, and `npm run build`; report the test
      count, and **report honestly whether the DPS numbers changed** as a result of T202 — the user
      asked whether the measurement is off, so the delta is the answer to their question.

**Checkpoint**: the grid is back to size; a status-only team no longer reads 0.00; Miasmaw reads
Poison 336 and Cobrex fires when it should; one resolution layer feeds the simulation, the effective
band, and the optimiser; a scrubber ties the headline number to the rate chart; and the 6-of-149
coverage ceiling is stated wherever the numbers are shown.

---

## Phase 15: Round 10 — Ability Mechanism Coverage, Chip Fixes, Modifier Grid (2026-10-06)

**Goal**: Implement the 12 work items in `orchestration/round-3-items.md` (FR-077..FR-084).

### Traceability

| WI | Ask (abbreviated) | Task(s) | FR |
|---|---|---|---|
| WI-001 | Puffloon's Heal shows no chip | T209 | FR-077 |
| WI-002 | Multicast x2 adds no chip on level-up | T209 | FR-077 |
| WI-003 | Modifiers add no chip | T210, T211 | FR-077/078 |
| WI-004 | Modifiers layout must mirror the mon grid | T212 | FR-079 |
| WI-005 | Drumire's +Cooldown Speed on ally cast not applied | T213 | FR-080 |
| WI-006 | Puffloon's trigger-on-adjacent-ally-trigger not modelled | T213, T214 | FR-080 |
| WI-007 | Fumungus damage from enemy Poison stacks | T215 | FR-081 |
| WI-008 | Y-axis label overwritten by long tick values | T216 | FR-082 |
| WI-009 | Slider vs chart disagree at t=0 | T217 | FR-083 |
| WI-010 | *Research*: every interaction type | T218 (answered in research.md L1) | FR-084 |
| WI-011 | *Audit*: what works vs doesn't | T218 (answered in research.md L2) | FR-084 |
| WI-012 | Build to 100% ability support | T219, T220, T221 | FR-084 |

**The audit answer, corrected in validation**: **3 of 135** creature abilities are actually
resolved by the engine (formiqueen, cobrex, miasmaw) — **132 are not**, across **17 mechanism
families**. The first draft said "9 modelled", which counted *tagged* rather than *working*: six
tagged creatures carry kinds (`statusGrant`, `ongoing`, `cooldownSpeedOnAllyCast`) that no engine
code reads. That is exactly the distinction the user asked to audit, so getting it wrong would have
defeated the item. **The UI's own "2 of 5" counter is computed from the same wrong predicate** and
is fixed by T221. The UI's "2 of 5" was representative, not a
rounding artifact. **~22 of the 135 are not battle calculations at all** (10 shop/economy,
12 evolution-only) and are excluded from the coverage target by the project's own scope rule
(research.md B6) — counted and named, not dropped from the denominator.

### Implementation — bounded bugs

- [x] T209 **[WI-001]** Fix `SlotBadges` in `src/ui/GridPicker/GridPicker.tsx` to render a **Heal**
      chip (FR-077). `healAmount` is not part of `appliesStatus`, so the component never considered
      it. A `"heal"` stat colour already exists.
- [x] T209b **[WI-002]** Fix the slot's creature lookup to honour the placement's level.
      **CORRECTED DIAGNOSIS — the first draft of this task was wrong and would have concluded
      nothing was broken.** It said to check whether Puffloon's level-2 record carries
      `baseMulticast: 2`; it does. The real defect is `GridPicker.tsx:272` calling
      `getCreatureById(placement.creatureId)`, which returns the **first** matching record — always
      level 1 — and ignores `placement.level`. Use `getCreatureByIdAndLevel`.
      **Scope is far wider than the reported symptom**: every chip on every levelled creature has
      been showing level-1 stats. The user reported Multicast because it was the one visibly absent;
      the rest looked plausible. Add a test pinning a levelled creature's chips to that level.
- [x] T210 **[WI-003]** Make the chips show base stats **plus the user's manual modifiers**, while
      still excluding engine-resolved ability effects (FR-077). **This deliberately revises round
      9b**, which set chips to pure base at the user's request. The distinction they drew was
      between the creature's printed card and what the battle computes; a modifier they typed
      themselves is neither — it is their own input, and they expect to see it. Record the revision
      rather than silently flipping it back.
- [x] T211 **[WI-003]** Tell the user when a modifier cannot apply (FR-078). `+50 damage` on
      Puffloon legitimately does nothing — `baseDamage` is `null` and the documented rule is that a
      modifier only scales an effect that already exists. Surface that at entry time instead of
      accepting the number and discarding it.
- [x] T212 **[WI-004]** Lay the Modifiers section out as the same 2x3 slot arrangement as the team
      grid (FR-079), including empty cells, so position maps one-to-one.
- [x] T216 **[WI-008]** Stop the rotated Y-axis label colliding with long tick values in both charts
      (FR-082) — increase the left margin with the value magnitude, or move the label. Verify at
      5-digit values, which is where the user hit it.
- [x] T217 **[WI-009]** Fix the slider's t=0 reading (FR-083). The 2366.45-vs-0 gap is **not a
      calculation disagreement**: the slider's default shows the whole-window *average* while its
      position reads as t=0. Relabel/renumber so an aggregate is never presented as a point value.

### Implementation — engine mechanisms

- [x] T213 **[WI-005, WI-006]** Emit an **ally-cast event** from the event loop that other creatures
      can subscribe to, and implement `cooldownSpeedOnAllyCast` against it so the grant **compounds**
      as the battle runs (FR-080). Drumire's tag exists but is applied nowhere today. Same hook
      serves T214, so build them together.
- [x] T214 **[WI-006]** Add a trigger-chaining tag kind ("Trigger this when adjacent Toxic allies
      trigger") and implement it on the T213 hook, so a chained creature casts in response to allies
      rather than only on its own cooldown (FR-080). **Guard against infinite recursion** — two
      creatures that trigger each other must not loop; cap chain depth and state the cap.
- [x] T215 **[WI-007]** Track accumulated status stacks on the shared implicit target so
      "additional Damage equal to N% of the Poison stacks on the enemy" resolves (FR-081). The engine
      already tracks exactly this for Shock (`shockLayers`); Poison needs the same counter. **Round 9
      deferred this for want of a full target entity — that deferral no longer holds**, because a
      per-status counter is far smaller than a target model. Record the reversal.

### Implementation — coverage programme (WI-012)

- [x] T218 **[WI-010, WI-011]** Record the taxonomy and audit in `research.md` L1/L2 and keep them
      **regenerable**: commit the classification script to `scripts/` so the figures recompute rather
      than going stale the moment a creature is tagged. The figures were published before the script
      was committed, which is how the tagged-vs-resolved error survived into two artifacts.
      **Two gaps the first draft left open and which this task must close:**
      (a) **"Unclassified" is a residual bucket, not a mechanism.** It is the *largest* row (49) and
      mostly simple self-buffs ("+15 Shield for this battle", "+4 Burn and +4 Poison permanently").
      The ask was "every type of interaction", so it must be broken into real families — at minimum
      self-buff-for-this-battle, self-buff-permanent, and team-buff-permanent — not left as a
      catch-all that hides a third of the corpus.
      (b) **Trainers (23) and trinkets (93) are named as unmodelled but never taxonomised.** The ask
      was not limited to creatures. Classify them on the same axes.
- [x] T219 **[WI-012]** Implement the mechanism families from L1. Families first, because there are
      17 of them versus 132 unsupported creatures: families are bounded, well-specified work, while
      tagging scales linearly and has twice produced silent misalignment (research.md H11; round 9b's
      level-1-only tag bug).
      **Each family needs its own tag schema recorded in `data-model.md` before implementation** —
      `data-model.md` currently has no round-10 section at all, and T214's trigger-chaining kind and
      T215's Poison counter both belong there. A family is not done until it has: a tag kind, a
      resolver branch, a test, and at least one tagged creature exercising it.
      **In scope this round** (ordered by creatures unlocked): self-buff families from T218(a),
      adjacency auras (7), positional grants (7), count scaling (7), multicast grants (6),
      on-battle-start team grants (5), cooldown-speed grants (4), row-wide (3), enemy-state scaling
      (3), ally-stat scaling (2), self-stat scaling (1).
      **Explicitly DEFERRED, named rather than silently omitted**: **knockout effects (9)** need a
      modelled death/HP system this engine does not have; **shop/economy (10)** and
      **evolution-only (12)** are out of scope by research.md B6. Together that is **31 of 135**,
      and T223 must report it as the known shortfall.
- [x] T220 **[WI-012]** BOUNDED by pass-1 (it previously had no list, no target and no stopping
      criterion across a 4-level corpus). Scope: the On-Cast accumulating-buff family named in
      research.md L5's retraction — **15 species**, not 14 (pass-2 caught that the table's rows sum
      to 6+7+2=15 while its prose said 14; the prose was wrong) — minus the 7 tagged in round 11 —
      i.e. pebbler, bonshell, pyrokami (done by T231), saberhorn, aerophim (T227), petrirex,
      galvanine, prismagon. Stopping criterion: every one of the 14 is either tagged or named in
      T227/T223 as deferred with a reason for every one of the **15**.
      **The list above is the action list; there is no list below** (pass-3 caught the dangling
      pointer). Of the 15: 7 are tagged, 3 are T231's, 1 is T227's Saberhorn, 1 is T227's named
      Aerophim deferral, leaving **galvanine** to tag and **petrirex + prismagon** which are
      REMOVED from this task's action list — pass-3 correctly objected that T220 was directing work
      that research.md and T219 both exclude. Petrirex is a **knockout** effect, which T219
      explicitly defers as needing a death/HP system this engine lacks; Prismagon counts **unique
      types on the team**, which `statFromCount` cannot express (it counts matching allies, not
      distinct type values). Both go to T223's named-shortfall report, not to a tag.
      **Bambudo is correctly tagged at levels 2-4 only**: its level-1 record reads "No ability text
      transcribed in sources reviewed." There is no level-1 ability to tag, so this does not violate
      the "at every level" rule — recorded because the count otherwise looks like an omission. Tag creatures family by family against T219's kinds,
      **at every level**
      (round 9b's per-level guard already enforces this). Report the coverage figure after each
      family rather than only at the end.
- [x] T221 **[WI-012]** Make the coverage figure self-reporting and honest (FR-084): compute it from
      the data, show battle-relevant coverage as the headline, and name the excluded shop/economy,
      evolution and knockout counts separately so the denominator is never quietly shrunk.
      **Fix the predicate while you are here**: `analyzePositionalCoverage` counts creatures that
      carry a *tag*, not creatures the engine *resolves* — which is why the UI says "2 of 5" when
      only 3 creatures corpus-wide actually work. Count resolved kinds, and derive the list of
      resolved kinds from the resolver itself so the two can never drift apart.

### Polish

- [x] T222 [P] Quickstart validation scenarios. **Renumbered by pass-1**: the file's highest
      existing scenario is **31**, not 44, so "Scenarios 45-50" referred to nothing. Add
      **Scenarios 32-37**, one each for: (32) a modifier that cannot apply is reported, not silently
      dropped [T211]; (33) an ally-cast event reaches a listening creature [T213]; (34) a chained
      trigger fires once, not recursively [T214]; (35) accumulated stacks on the shared target
      [T215]; (36) Pebbler's 20/35/50 cascade [T231]; (37) a painted creature satisfies a type
      filter it does not natively match [T230].
- [x] T223 Verify `npx tsc -b --noEmit`, `npx vitest run`, `npm run build`; report the coverage
      figure before and after, and **state plainly how far short of 100% the round lands, per
      family** — the user asked for 100%, so the shortfall is the headline, not the progress.
      Baseline to report against: **3 of 135 resolved** at the start of this round. The known
      structural shortfall is **31 of 135** (9 knockout + 10 shop/economy + 12 evolution-only), none
      of which a DPS engine can or should compute.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1) → **STOP and validate** against
   quickstart.md Scenarios 1–2 → this alone is a usable, demo-able DPS calculator.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → validate → this is the MVP.
3. US2 → validate → cumulative chart adds the second explicitly-requested UI focus.
4. US3 → validate → corpus browser rounds out the "full corpus" requirement.
5. Polish.
6. Phase 7 → validate against quickstart.md Scenarios 5–7 → Trainer roster, per-creature
   breakdown, chart axis, and level/Multicast data-model gaps closed; T075 (corpus completeness)
   continues as ongoing work beyond this feature's initial delivery.
7. Phase 8 → validate against quickstart.md Scenarios 8–12 → search modal, drag-and-drop,
   canonical type colors, persistent side panel, and evolution-aware leveling all land together
   as this round's team-builder redesign.
8. Phase 11 → validate against quickstart.md Scenarios 18–24. Ordering within the phase matters:
   the engine fix (T117/T121) is independent of everything else and should land first so a
   regression in the much larger UI pass can never be confused with it; T114–T116 (types, colours,
   sprites) block most UI tasks; then the card work (T122 → T123/T124), then the per-surface
   restructures (T125–T132), which touch mostly-disjoint files. T133/T134 are data/docs and are
   independent of all UI work.

### Notes

- [P] tasks touch different files and have no incomplete-task dependency.
- Every engine mechanics task cites the exact research.md subsection it implements — do not
  re-derive the formula from memory; read research.md B1-B6 and contracts/engine-api.md first.
- Commit after each task or logical group.

- [x] T224 **[WI-010, WI-012]** Build **per-cast accumulating buffs** in `simulate.ts` (research.md L5).
      Discovered during T219: the 49-creature "Unclassified" bucket is not a grab-bag of static
      self-buffs but one mechanism — "+N Damage for this battle" with an **On Cast** trigger, which
      accumulates on every cast. A pre-battle resolver cannot express it; it needs the event loop to
      mutate the acting creature's effective stats mid-battle. Est. ~40 creatures, the largest single
      family in the corpus, larger than all seven selector families combined. NOT scoped in round 10.
- [x] T225 **[WI-010]** Extend `TargetSelector` before mass tagging. Real ability text needs filters
      the vocabulary lacks: **rarity** ("This and Common allies gain +10 Damage" — Brawlmantis),
      **level** ("for each ally of level 3 or above" — Orcana), and **"in front"** as a direction
      distinct from `behind`/`above` (Saberhorn). Tagging before this means either skipping those
      creatures or encoding them wrongly.

- [x] T226 **[WI-010]** Resolve the three ambiguous accumulating buffs — **pebbler, bonshell,
      pyrokami** — whose ability text grants a status the creature *already applies* ("+15 Shield"
      vs `appliesStatus` Shield 20). Needs evidence from the game or patch notes, not a guess:
      either the grant IS the application (tag nothing) or it is additive (tag `buffOnCast`).
      Guessing wrong double-counts, which is how Bumblebolt's Shock doubled in round 10.
- [x] T227 **[WI-010, WI-012]** SPLIT by pass-1, which found this task instructed modelling what
      research.md itself calls unmodellable. Decided scope:
      (a) **Saberhorn IS modelled, but the engine does NOT already represent its cost** — pass-2
          corrected that claim. `EffectDescriptor.statChange.stat` is
          `"cooldownSpeed" | "damage" | "multicast"` (`types.ts:117`): there is no flat-seconds
          option, and flat seconds exist only as the USER modifier `cooldownFlatAddSeconds`, which
          data-model explicitly distinguishes from ability grants. The `buffOnCast` applier
          (`simulate.ts:565-574`) also handles only damage/multicast/statusGrant and would drop a
          cooldown change outright.
          **Decision, so the implementer does not have to invent one**: add
          `"cooldownFlatSeconds"` to `EffectDescriptor.statChange.stat` and a branch for it in the
          `buffOnCast` applier. NOT a `cooldownSpeed` percentage — "+8 seconds" is an absolute
          quantity and converting it to a percentage would make it depend on the base cooldown,
          which is not what the ability says. Then tag Saberhorn with both halves; tagging only the
          upside would overstate it.
      (b) **Aerophim is DEFERRED and named.** "Transform them into random monsters of their rarity"
          replaces a creature with an unknown one; no engine that simulates a known board can
          express that, and approximating it would fabricate output. T223 must report it by name.

---

## Phase 16: Round 4 orchestration — Painter/Smuggler, regions, cascading grants

Ledger: `specs/001-batomon-dps-calculator/orchestration/round-4-items.md`.
Design: research.md **M1-M7**, data-model.md "Round 4", spec.md FR-085 to FR-093.

### Data corrections

- [x] T228a **[WI-001]** Add `supersededText?: string` to `TrainerRecord` (`src/data/types.ts`).
      Pass-3 found T228 depends on this field and data-model declares it, but no task owned the
      schema change — the same "declared in a design artifact, owned by nobody" gap that pass-1
      found for `smuggledCreatureIds`.
- [x] T228 **[WI-001]** Correct Painter's ability in `src/data/trainers.ts`. The recorded text
      ("Your monsters gain +1 to all stats for each different type they have…") is **the wrong
      ability** — it came from a fan sheet and the record already carried
      `unconfirmedFields: ["abilityText"]`. Replace with the painting behaviour per research.md M1,
      clear the unconfirmed flag, and keep the superseded text in the record so the correction is
      auditable rather than a silent overwrite.
- [x] T229 **[WI-005]** Add `region?: RegionId` to `CreatureRecord` and `selectedRegion` to
      `TeamConfiguration` (FR-087), plus the region selector the ask calls for ("the player chooses
      a region before they choose anything else"). Pass-1 found the config field and the selector
      were both missing while T235 already depended on them.
      **Attribution source** (pass-1 found T229 had none): batodex's `sets` field —
      `starter` 56, `oshima` 56, both 14, neither 13 (research.md M6). Map `starter` -> Pantra,
      `oshima` -> Jinto; the latter is an INFERENCE from "50+ new Batomon" matching 56, recorded as
      such. Display names follow the official patch notes (Pantra, Jinto) because that is what the
      player sees; "starter" was the user's descriptive wording, not the in-game name.
      **Two different kinds of unattributed creature, which research.md M6 says explicitly must not
      be conflated**: 13 species are present in the payload but in neither set (events/fossils), and
      a further 10 of our 149 are absent from the payload entirely (it lists 144). Both get
      `region: undefined`, but they are reported separately — "no region" vs "not in the source" —
      because only the second is a data-coverage gap worth chasing.
      **Commit the extract.** The payload must be snapshotted into
      `src/data/__tests__/fixtures/` by a script in `scripts/`, exactly as the shiny data was. A
      task that says "re-fetch an external site" with nothing committed is how the wrong Painter
      ability entered the corpus in the first place (research.md M1).
      **Gating**: the ask says the player chooses a region "before they choose anything else". The
      region selector is therefore rendered first and the creature pickers are disabled until a
      region is chosen, rather than region being an optional field alongside the others.

### Engine

- [x] T230 **[WI-001, WI-007]** Add `paintedCreatureIds: string[]` to `TeamConfiguration` and route
      **every** `typeFilter` comparison through one `creatureHasType(creature, type, config)`
      predicate that returns true for any type when the species is painted (FR-086). There are
      **six** sites, not the "four in effects.ts" previously asserted here — pass-1 validation
      caught that: `effects.ts:122`, `effects.ts:279`, `simulate.ts:118`, `simulate.ts:121`,
      `corpus.ts:130`, `CreatureSearchModal.tsx:58`. Missing the two `simulate.ts` ones would leave
      cooldown grants unpainted; missing the two UI ones means a painted creature still does not
      surface under a type filter. One predicate because round 10's lesson was that a duplicated
      "supported" test drifts. Adds BOTH `paintedCreatureIds` and `smuggledCreatureIds` to
      `TeamConfiguration`.
      Keyed by **species id, not slot** — "whenever these specific species appear… on your board"
      (research.md M1), so painting Mosslug paints every Mosslug.
      Painted must NOT expand `types`, or "count the unique types on your team" (Prismagon) breaks.
      **The `"All"` type already exists and the predicate must decide its semantics** (pass-2
      finding): `CreatureType` includes `"All"` (`types.ts:48`) and Omnichrome natively carries it
      (`types: ["All"]`, 4 records). Decision: `creatureHasType` returns true for ANY type when the
      creature is painted **or** natively `"All"` — they mean the same thing in-game, and Painter's
      effect is precisely "make this species an Omnichrome for typing purposes". The two differ only
      in provenance: native `"All"` is corpus data, painted is run configuration. One predicate
      covers both, which also means Omnichrome stops being quietly unmatched by every type filter —
      a pre-existing bug this round fixes as a side effect.
- [x] T231 **[WI-009, WI-010, WI-011]** Tag **pebbler, bonshell, pyrokami** with `buffOnCast` at
      every level. T226's ambiguity is ANSWERED by the user: base `appliesStatus` is cast 1, the
      grant accumulates from cast 2. Verbatim targets to assert:
      Pebbler "first turn, it grants 20 shield… next trigger, it grants 35 sheild… next trigger,
      grants 50 shield"; Bonshell "7.0s casting time, shield 100 as base stats… (0,100), (80,180),
      (160,260)"; Pyrokami "cast 1 deal 5 burn then add 10, cast 2 deals 15 burn… cast 3 deals 25".
- [x] T232 **[WI-010]** Allow an ability grant to CREATE a damage effect. Bonshell has
      `baseDamage: null` / `damageType: null` yet deals 80 damage from cast 2, and `simulate()`
      currently short-circuits `resolvedBase === null` and gates on `damageType === "Direct"`.
      Scope the change to ability grants only: data-model.md's "modifiers can only scale an effect
      the creature already has" still holds for USER modifiers and must not be relaxed for them.

### UI

- [x] T233 **[WI-002]** A trainer card (FR-089), reusing the shared card/primitive language
      (Constitution Principle VII) rather than a new bespoke layout. Renders: name, ability text,
      and an unconfirmed-data marker where `unconfirmedFields` applies. It REPLACES the bare
      `<select>` in `src/ui/GridPicker/TrainerPicker.tsx:9-22`, which is the current trainer UI;
      pass-1 found no task said what the card shows or what happens to the existing control.
- [x] T234 **[WI-002, WI-006]** The "show affected mons" button (FR-089), rendered **only** for
      trainers that designate a set. Per research.md M2/M7 that is exactly **Painter and Smuggler**;
      Chef grants Fire to single-typed monsters by rule and must NOT get the button, and Mad
      Scientist / Monster Ranger are excluded because they are day-scoped (see M7 for why that is
      the boundary, which pass-1 found unrecorded).
      The button's panel shows, per trainer: **Painter** — the 9 painted species and which of them
      are currently on the board; **Smuggler** — the 9 smuggled species and their region.
- [x] T235 **[WI-004, WI-006]** The 9-creature picker, writing `paintedCreatureIds` /
      `smuggledCreatureIds`. **User-chosen, never generated** — the app models a run already on the
      player's screen. Smuggler's list is restricted to the OPPOSITE region to the one selected.
      Default rarity shape 2/2/2/2/1 shown as guidance and NOT enforced, and **for Painter only** —
      pass-1 found it had been extended to Smuggler on Painter's evidence, which the source does not
      support. The source says "typically" (research.md M3); hard-locking a soft constraint would
      make the tool unable to represent a real run.
      "Opposite region" MUST mean "in the other region and NOT in the current one" (FR-088), never
      `!== selectedRegion`: 14 species are in both regions and 13 in neither (research.md M6), so
      the complement would wrongly offer all 27.
- [x] T235b **[WI-004]** Make smuggling have an EFFECT, not just a record (FR-091). Pass-1 found
      the pool is not region-aware at all (`corpus.ts:130` filters name/type/rarity;
      `CreatureSearchModal.tsx:58` filters type), so "added to the creature pool from the opposite
      region" was a no-op. Gate the creature picker to `selectedRegion` PLUS `smuggledCreatureIds`,
      so choosing Smuggler and picking 9 species actually changes what is selectable.
      Region-less species (the 13 in neither set) remain always available — they are events/fossils,
      not regional stock, and hiding them would break existing teams.
- [x] T236 **[WI-007]** Rainbow type chip for painted creatures, replacing the normal type chips.
- [x] T237 **[WI-008]** Translucent rainbow sprite overlay, "slowly scrolling southeasterly"
      (verbatim). Must honour `prefers-reduced-motion` — the project ships no other continuous
      animation, so this is the first one that needs the guard.

### Previously-deferred tasks the user asked to execute (WI-012)

- [x] T238 **[WI-012]** Execute T211, T213, T214, T215, T218, T220, T222, T223, T226, T227. Each is
      tracked at its own id; this entry exists so the ask itself is checkable. T226 is satisfied by
      T231 (the user answered its question). Any of the ten that cannot be completed must be
      reported as not done WITH A REASON, not quietly dropped.
      Pass-1 found three of the ten unexecutable as written and they have since been fixed rather
      than waived: **T220** was unbounded (now scoped to 14 named species with a stopping
      criterion), **T222** cited quickstart scenarios that do not exist (now Scenarios 32-37 with
      stated content), **T227** instructed modelling the unmodellable (now split into Saberhorn =
      model, Aerophim = named deferral). The "report with a reason" clause is NOT a licence to skip
      these three.

### Verification

- [x] T239 **[WI-012]** `npx tsc -b --noEmit`, `npx vitest run`, `npm run build`; report ability
      coverage before/after and state the shortfall plainly.

---

## Phase 17: Round 5 orchestration — capture findings, triggers, shiny abilities, chart DRY

Ledger: `specs/001-batomon-dps-calculator/orchestration/round-5-items.md`.
Design: research.md **N1-N9**, data-model.md "Round 5", spec.md **FR-094..FR-106**.
Source brief: `orchestration/engine-handoff-gameplay-capture.md`.

### Engine — the load-bearing refactor first (the handoff's own sequencing)

- [x] T240 **[WI-002]** `StatValue` + a single `read()` helper (FR-094). "This is the load-bearing
      refactor. Findings 1, 3 and 4 all depend on it existing." Add a `statMultiplier` tag kind —
      the +70% effect "needs adding to the tag vocabulary… to express the +70% trinket at all".
      Pin the capture's arithmetic: `(604 + 6) × 1.7 = 1037` and `(11 + 6) × 1.7 = 29`. Assert the
      wrong models fail: snapshot-then-add gives 1033 and 25.
- [x] T241 **[WI-003]** `postMultiplierFlatAdd` (FR-095). Thorntail's `+24 Damage permanently` must
      add exactly 24 per infliction "regardless of its multipliers" — it entered at 7082 displayed
      damage against a listed base of 50 and "Every step is 24". Adding it to `base` inflates it
      "by roughly 140x per stack".
      **Carry the handoff's open item forward without acting on it** (research.md N8): Thorntail's
      7082 entry value is unexplained by its base stats plus anything visible in the footage, so
      this board's damage cannot be reproduced end-to-end and "somebody should work out where 7082
      comes from."
- [x] T242 **[WI-001]** Three-phase battle-start resolution (FR-096), each phase reading the
      completed output of the previous. Classify EVERY tag kind by phase; an unclassified kind is a
      bug, not a default. Pin the phase ordering on **synthetic values that exercise phase 1 -> 3
      directly**. The captured board's **Miasmaw = 1080 CANNOT be pinned end-to-end this round**
      (research.md N8): it depends on four unmodelled run modifiers (Link Cable — carried as text
      with `abilityTags: []`; an inferred flat +4 Poison; a +70% effect on cooldowns >= 5s; a
      leftmost-column battle-start effect), and two terms of the handoff's own 1066 decomposition
      do not reproduce from our corpus (Puffloon's 19, and Thorntail showing an unmultiplied 5
      despite a 6s cooldown that should qualify for the +70%). Pinning a number we cannot derive
      would encode a guess as a fixture; the 657-vs-1080 gap remains the stated motivation.
      Remove the superseded "must read their BASE values" comment in `effects.ts`
      and record why it is superseded rather than deleting it silently.
- [x] T243 **[WI-004]** Time-varying resolution (FR-097): `resolveEffects` returns initial state
      plus handlers keyed by trigger; the event loop invokes them. "Largest piece of work."
      **DOUBLE-APPLICATION HAZARD, which did not exist when the handoff was written** (research.md
      N6): round 11's `buffOnCast` path and round 4's ally-cast hook ALREADY fire on-cast abilities,
      so the handoff's "every on-cast and reactive ability is structurally unreachable" is now
      false. This task MUST state explicitly whether those paths are retired or wrapped — if
      handlers are simply added alongside, Noxnimbus's +6 fires twice per cast.
      Noxnimbus's `Adjacent Toxic allies gain +6 Poison for this battle` must fire on EVERY cast and
      compound. Self-exclusion must be preserved — "Noxnimbus's own badge never moves."
- [x] T244 **[WI-005]** `statFromTargetStatus` (FR-098) — "additional Damage equal to 200% of the
      Poison stacks on the enemy", recomputed per cast and NOT persisted. Requires tracking the
      shared target's accumulated Poison, which `poisonLayers` (added T215) already provides.
- [x] T245 **[WI-007]** `triggerOnAllyTrigger` (FR-099). 7a: reacts to EACH ally trigger
      independently. 7b: "**it must not touch the reactor's cooldown**". 7c is already correct —
      do not re-implement it.
      Carry the handoff's open item forward WITHOUT acting on it: whether a mon's own infliction
      counts toward its own "when allies inflict" counter — "Do not change the exclusion on the
      strength of one ambiguous frame."
      **7b is a BUG REPORT against existing code, not only a constraint on the new kind**
      (research.md N6): round 4's `triggerOnAllyCast` sets the listener's `nextAt` to
      `tSeconds + STEP` (`simulate.ts:662`) and firing then resets its cooldown (`:485`) — exactly
      what 7b forbids. Either correct it under 7b, or record why a cast-triggered reaction
      legitimately differs from a status-triggered one. Do not leave the two kinds disagreeing.
- [x] T246 **[WI-001..WI-005, WI-007]** Tag the inert mons: **Thorntail, Puffloon, Fumungus** —
      **three, not the handoff's four** (research.md N6). Noxnimbus was tagged in round 11 and
      resolves at every level; the handoff's board table predates that. "the engine is not slightly
      wrong, it is modelling a different team" still stands for the other three.
      Report honestly: this moves the counter by three, "but the mechanisms behind them… are each
      new families, not instances of existing ones. The counter should not be allowed to imply
      otherwise."

### Engine — test-locking only, NO behaviour change (the handoff's explicit gates)

- [x] T247 **[WI-006]** Test-lock charge stacking: grants "stack additively within a single tick"
      (+18 = 3 × 6), already correct. **Do NOT change the `T` vs `T + 0.1` firing offset** — 0.1s
      battle-time is ~38ms of video and "sits inside the render-lag noise floor". The handoff
      classifies Findings 6 and 9 as "test-locking exercises, not implementation".
- [x] T248 **[WI-009]** Test-lock same-instant snapshot behaviour: Cobrex used **1027, not 1037**.
      "**Do not implement a propagation delay on this evidence.**" FR-040's existing rule may
      already produce this "for the right reason"; the test locks it either way.
- [x] T249 **[WI-008]** Record Finding 8 and its gate. **`STABLE_SLOT_ORDER` MUST NOT be changed**
      (FR-104): medium confidence, "Consistent with all evidence, proven by none of it", and every
      observed gap was 2 frames rather than 0 so **no tie was ever exhibited**. Record the
      front-row-first hypothesis and the 1x recording that would settle it.

### Data

- [x] T250 **[WI-010]** `AbilityTrigger` as a closed union (FR-100), sourced from batodex's own
      `trigger` field — 8 values, `null` legitimate (research.md N2).
      **This is a type-only change; there is nothing to "remove".** The user's premise was that we
      rely on string parsing — we do not: `abilityTrigger` has exactly one consumer, a display
      (`BatomonCard.tsx:187`), and the engine branches on `tag.event`, never on trigger prose. The
      real defect is the free `abilityTrigger?: string` at `types.ts:296`, which permits typos that
      no compiler would catch. Confirm this to the user rather than reporting a removal that found
      nothing.
- [x] T251 **[WI-011]** Fill missing ability text from `ability.byLevel`, which is per-level.
      **The count is 3** — `bambudo|1`, `emperooze|1`, `sunsage|1` — and **all three are absent from
      the batodex snapshot entirely** (research.md N3), so `ability.byLevel` cannot fill them. Wire
      up `byLevel` for the per-level text it does provide, and **report these three to the user as
      unavailable from our only structured source** rather than leaving the ask looking satisfied.
- [x] T252 **[WI-012, WI-013]** Extract `shinyAbility.byLevel` into `ShinyStatLine.abilityText`
      (FR-101) and display it when the placement is shiny, driven by the existing shiny toggle.
      Differs at **343 of the 508 level-records that have both** (research.md N1 — the earlier
      "315 of 470" did not reproduce and is corrected).
      **The toggle is `src/ui/shared/VariantToggles/VariantToggles.tsx`, inside `BatomonCard`.**
      The user called it "the cardFixedBrowser" — `cardFixedBrowser` is a CSS class on
      `BatomonCard`, not a component, and no component by that name exists. Confirm this to them
      rather than silently substituting a different control.
- [x] T252b **[WI-012]** Make shiny ability text **drive calculations, not just display**
      (**FR-105**). This is the explicit second half of the ask — "and use those in calculations" — and
      T252 only stores and shows it. `applyShinyOverlay` (`corpus.ts:81-98`) overrides
      `baseDamage`, `baseCooldownSeconds`, `baseMulticast`, `healAmount` and `appliesStatus` and
      **nothing else**, so a shiny placement still resolves its NORMAL ability magnitudes — e.g.
      Bunchop shiny reads "+60 HP" while resolving +50. Shiny must carry its own `abilityTags` (or
      a magnitude override) and the resolver must use them.
      Report the count of species with no upstream shiny ability rather than defaulting them.
- [x] T253 **[WI-014]** Resolve the "all shiny are better" claim against the data (research.md N1).
      It is **not** true per-stat — **7 species = 28 records** worse, Kappow is 1s SLOWER — and 222/299/15 in
      aggregate. **`shiny.test.ts`'s downgrade guard MUST NOT be deleted to make the ask true.**
      Report the discrepancy to the user rather than silently picking a side.
- [x] T254 **[WI-015]** Vendor shiny sprites from batodex (`shinySprite`) into `public/sprites/`
      via a committed script, and render them for shiny placements (FR-102). Store the filename on
      `ShinyStatLine.spriteFile` (data-model.md).
      **Report the shortfall**: only **139 of 144** snapshot monsters have a shiny sprite, against
      149 corpus species, so ~10 have none. Those fall back to the normal sprite rather than
      rendering nothing. "All" is not reachable and saying so is part of the task.
- [x] T255 **[WI-016]** Vendor trainer sprites from batodex.com/trainers and render them in the
      trainer card (FR-102). Add `TrainerRecord.spriteFile` and a `"trainer"` case to `Sprite`'s
      `kind` union — it is `"monster" | "trinket"` today and `public/sprites/` has only those dirs.
      **MATCH BY NAME, NOT ID.** **12 of our 23 trainer ids do not match batodex's**
      (`chef`→`pyromaniac`, `lucky-girl`→`youngster_f`, `rich-lady`→`lady`, plus 9
      hyphen-vs-underscore). All 23 resolve by name. An id-keyed script would silently miss over
      half — the same failure `vendor-sprites.mjs` already documents for monsters. Confirm for the user that the trainer card WAS created in round 4
      (`src/ui/shared/TrainerCard/TrainerCard.tsx`) — their parenthetical doubt deserves an answer.

### UI

- [x] T256 **[WI-018]** ONE shared chart component (FR-103). **The prop contract is a LIST of
      series, not one** — `CumulativeChart` draws five (Total, Burn, Poison, Shock, Shield), each
      with its own `STAT_COLORS` stroke and one using `type="stepAfter"`, while `DpsRateChart` draws
      one. A single-series signature could not express the existing charts, so the ask's "name, list
      of values, color of line" is read as per-series:
      `{ series: { name, values, color, lineType? }[], xLabel, xMax, yLabel, yMax, xTicks?, yTicks? }`.
      "Scale" is taken to mean the axis **domain and tick interval** (the user's "x axis scale, x
      axis max amount"), not a log/linear switch — no chart here is non-linear. Replaces the divergent `CumulativeChart` and
      `DpsRateChart` — "Another DRY UI component violation" (Constitution Principle VII).
      Tooltips must be consistent; today they "represent different values".
- [x] T257 **[WI-017]** (**FR-106**) Both charts state the **0.5s increment**, and per-point timing
      is removed from the tooltip.
      **The premise is currently false and labelling alone would lie** (research.md N9):
      `cumulativeSeries` samples irregular event timestamps, and `dpsRateSeries` uses **1-second**
      buckets with a comment defending that choice. So this task must **resample both onto a real
      0.5s grid** and then label it. 0.5s is defensible rather than arbitrary — it is the Burn tick
      interval. If resampling the rate chart meaningfully changes its shape, say so rather than
      quietly shipping a different chart.

### Verification

- [x] T258 `npx tsc -b --noEmit`, `npx vitest run`, `npm run build`, `scripts/audit-coverage.mjs`.
      Report coverage before/after AND state plainly that the **three** newly-tagged mons (T246 —
      Noxnimbus was already resolved) represent new
      mechanism families, not incremental instances.

---

## Orchestration round 6 (2026-10-07) — affected-species picker, and the card's output band

Ledger: `specs/001-batomon-dps-calculator/orchestration/round-6-items.md`.
Design: plan.md "Amendment: Orchestration round 6"; research.md Q1-Q2; data-model.md's two round-6
sections; quickstart.md scenarios 45-48. No engine or data-schema change, so `contracts/engine-api.md`
is unaffected this round.

### User Story 3 (P3) — the affected-species picker (WI-001, WI-002)

- [x] T259 [US3] **[WI-001]** Rebuild `src/ui/shared/TrainerCard/AffectedCreaturePicker.tsx` out of the
      parts the trinket picker already uses: `Modal`, `FilterBar`, `TextField` (`type="search"`),
      `ResultCount`, `PickerSection` with `columns={OVERLAY_COLUMNS}`, `PickerCard`, `SpriteTile` and
      `EmptyNote` from `src/ui/primitives`. Species become **cards in a 3-column grid**, grouped into
      rarity sections running **Common -> Mythical, alphabetical within each** (FR-048, FR-067), not
      the current single-column `<ul>` of up to 149 rows. The ask: "the painted species and smuggled
      species UI needs to reuse the trinkets component. … Another DRY principle violation."
      **State explicitly what becomes of the three non-list parts** rather than leaving them to
      chance: the intro paragraph (`.pickerIntro`) and the region warning (`.pickerWarn`) are kept as
      the modal's leading copy, and the rarity-shape row (`.shapeRow`) is kept as guidance — with the
      key bug T270 fixes.
- [x] T260 [US3] **[WI-001]** Delete the rules T259 supersedes from
      `src/ui/shared/TrainerCard/TrainerCard.module.css`: `.pickerList`, `.pickerItem`,
      `.pickerItemOn`, `.pickerName`, `.pickerMeta`, `.pickerEmpty`, `.pickerSearch`. **Keep**
      `.pickerIntro`, `.pickerWarn`, `.shapeRow`, `.shapeChip`, `.shapeMet` — none of those is a list
      rule, so none is superseded by T259. A rule left behind here is the duplication WI-001 is about.
      Keeping the shape row's CSS is **not** a clean bill of health for the row itself: its keys are
      broken, which is T270's job.
- [x] T261 [US3] **[WI-002]** Replace `TARGET_SIZE` with an exported `MAX_AFFECTED_SPECIES = 9` and
      render the selection as a **`PickerSection` of nine slots in 3 columns** — a 3x3 block of
      selected cards plus **empty placeholders for the unused slots**, the way the Modifiers overlay
      renders all six board slots including empty ones — with the heading count reading `N/9`. The
      ask: "Both trainer abilities only allow a max of 9 mons to be painted/smuggled, so those should
      be represented in the 3xN pop up UI."
      **`PickerSection` cannot render `N/9` today**: its `count: number` prop renders `({count})`
      (`src/ui/primitives/index.tsx`). Widen that one prop to `count: number | string` so a caller can
      pass `"4/9"`, rather than adding a second heading component beside it — a parallel heading is the
      duplication this round exists to remove.
- [x] T262 [US3] **[WI-002]** Enforce the cap in `AffectedCreaturePicker`, per data-model.md: "**At
      most `MAX_AFFECTED_SPECIES` (9) ids per set.** Enforced in the UI that writes them …, not in
      `simulate()`". A tenth selection MUST be **refused with a stated reason** and MUST NOT silently
      drop or replace any of the nine already chosen; removing one MUST free the slot again.
      **Painter's rarity shape stays guidance and is NOT enforced** (round 4: its source says
      "typically") — the count is enforced, the shape is not.
- [x] T263 [P] [US3] **[WI-002]** Record in `spec.md` that the cap's provenance is **split**: published
      for Painter ("Nine random species are painted with every type") and **assumed for Smuggler**,
      whose published text states no count at all and whose `abilityText` is itself in
      `unconfirmedFields` (research.md Q1). Report this to the user rather than leaving the UI
      implying both numbers are cited.
- [x] T264 [US3] **[WI-001, WI-002]** Add `src/ui/shared/TrainerCard/__tests__/AffectedCreaturePicker.test.tsx`
      — the surface has **no automated coverage today**, so migrating it without tests would be
      unverifiable. Assert: (a) results render as cards in a 3-column grid with rarity section
      headings, not as a single-column list; (b) nine slots are rendered including empty ones, and the
      count reads `N/9`; (c) a tenth selection is refused and the nine survive; (d) removing one frees
      a slot; (e) Smuggler offers **only opposite-region** species — "in the other region and not in
      this one", never the set complement (FR-088); (f) a selection persists across close/reopen
      (FR-090, user-chosen never generated).

### User Story 1 (P1) — the card's output band (WI-003)

- [x] T265 [US1] **[WI-003]** MEASURE first, in a real browser, and record the numbers in research.md
      Q2: the height of `BatomonCard`'s output band at 1..7 stat lines in one column and in two, and
      the card's own reserved height in each variant. **Name which reservation you are measuring**:
      `.cardFixedBrowser` reserves `.output { min-height: 4.5rem }` (BatomonCard.module.css:53) while
      `.cardFixedPanel` reserves only a whole-card `29rem` (line 37) with its `.output` reservation
      **commented out** (line 40) — one real number and one absent one, and the absent one is part of
      why the panel variant breaks first. The measurement decides the band's height, NOT the switch
      threshold: that is already fixed at 4 by research.md Q2 and must not be re-derived here.
      **ACT on the measurement in this task, do not merely record it**: if a two-column band at 7 lines
      (4 rows) exceeds what the card reserves, raise the reservation in
      `src/ui/shared/BatomonCard/BatomonCard.module.css` — including **un-commenting and re-sizing
      `.cardFixedPanel`'s `.output` reservation** (line 40), which is the variant that can reach 7 —
      and record the before/after numbers. If it fits, say so explicitly and change nothing. Either way
      the round must not end with a measurement nothing acted on.
- [x] T266 [US1] **[WI-003]** Lay `StatLines` out in **two columns at 4 or more lines** — the threshold
      is 4 because 3 is the published maximum across all 596 records (research.md Q2), so 4 is the
      first count only modifiers can produce. 1-3 lines keep today's single column, so no existing card
      changes shape. **Add** a modifier class to `src/ui/shared/BatomonCard/BatomonCard.module.css`
      declaring `display: grid; grid-auto-flow: column; grid-template-rows: repeat(var(--stat-rows),
      auto)` — keeping the band's existing `gap` — and **apply** it in `StatLines` in
      `src/ui/shared/BatomonCard/BatomonCard.tsx` when `lines.length >= 4`, setting `--stat-rows` to
      `Math.ceil(lines.length / 2)` inline.
      **NOT `columns: 2`.** That was this round's first specification and it is inert: `.statLines` is
      `display: flex; flex-direction: column` (BatomonCard.module.css:167-174), and CSS multi-column
      does not apply to a flex container, so a class carrying only `columns`/`column-gap` would ship a
      no-op that T268's class assertion could not catch (validation pass 3). The grid also fills the
      **first column before the second by construction** rather than by trusting a balancer, which is
      the order the ask gives — "col 1: Deal 15 damage, POison 3, shock 3. col 2: shield 4, heal 15,
      multicast x3" — and makes a **third column arithmetically unreachable**: n items over ceil(n/2)
      rows is at most 2 columns.
- [x] T267 [US1] **[WI-003]** Verify FR-043 ("MUST NOT resize or reflow as their contents change … Text
      MUST NOT overflow its container") holds, and that the **"Effective this battle"** band gets the
      same treatment — it renders through the same `StatLines`, so this is a check, not a second
      implementation. **Per variant, at the count each can actually reach**: the `panel` variant at the
      full 7 lines, since the Calculator passes `modifiers`; the `browser` variant at **3**, its real
      maximum, because `CorpusBrowser` renders `BatomonCard` with no `modifiers` prop
      (CorpusBrowser.tsx:83) and therefore cannot reach 4+ in the running app. Do not record a 7-line
      browser-variant check as done — it is unreachable there; T268's render test is what covers 4+
      structurally. The reported symptom to confirm gone: with many statuses the ability text and the
      level/shiny bubbles were pushed out of an `overflow: hidden` card.
- [x] T268 [P] [US1] **[WI-003]** Test in `src/ui/__tests__/presentation.test.tsx`: a creature carrying
      damage, all four statuses, heal and multicast renders all 7 lines, in the published order, with
      the two-column class applied **and `--stat-rows` equal to 4**; the ask's own 6-line example gives
      3 rows; and a 1-3 line creature gets neither the class nor the property. jsdom does no layout, so
      the row count is what makes this assertable at all — assert it rather than measured positions,
      which is also why the mechanism is a grid with an explicit row count rather than a balancer whose
      result jsdom cannot see.

### Found in validation, not in the ask

- [x] T270 [US3] **[validation pass 1 finding — NOT a ledger item]** Fix the rarity-shape key mismatch
      in `src/ui/shared/TrainerCard/AffectedCreaturePicker.tsx`: `PAINTER_RARITY_SHAPE` is keyed
      `"Super Rare"` (with a space) while the corpus's `Rarity` union and `RARITIES_DESC` use
      `"SuperRare"`, so the Super Rare chip is filtered out and the guidance row sums to **7 of 9**
      instead of 9. Key it off the `Rarity` union — `Record<Rarity, number>` with the five entries that
      have a target — so the compiler rejects the next misspelling rather than silently dropping a
      chip. `statColors.ts` already documents this exact trap ("the deliberate spelling bridge"). The
      user's screenshot of the picker shows the four surviving chips, so this is visible in the
      evidence attached to the ask without being part of it; **report it as a by-product, not as
      something they asked for** (research.md Q3).

### Verification

- [x] T269 **[WI-001, WI-002, WI-003]** `npx tsc -b --noEmit`, `npx vitest run`, `npm run lint`,
      `npm run build`, then walk quickstart scenarios 45-48 in a real browser. Report the measured
      numbers from T265 and state plainly whether any item was left partially done.

---

## Phase: Orchestration round 7 (2026-10-07) — standardising the creature data vocabularies

Ledger: `orchestration/round-7-items.md` (WI-001..WI-007). Design: plan.md "Amendment: Orchestration
round 7"; data-model.md "Vocabulary registries" / "Derived ability tags" / "Ability-text keyword
highlighting"; research.md R1-R7; quickstart.md scenarios 49-59.

**Read R1 before starting.** All four vocabularies are *already* closed string-literal unions and
Constitution Principle II already requires that, so "make it an Enum" taken literally is a no-op. The
round fixes what a literal union cannot do: no runtime value list, no label distinct from the stored
key, no single place for per-member data.

**The invariant that governs every task below**: **no stored key changes, in any of the four
vocabularies (the four the asks name, plus `StatusEffectType`).** No corpus record is edited, `src/data/__tests__/fixtures/batodex-monsters.json` stays
byte-identical to the source it cites (Principle IV), and build codes keep round-tripping. A task that
rewrites `rarity: "SuperRare"` in `creatures.ts` has misread the design.

### Foundational — the registry (WI-001, WI-003, WI-005)

- [x] T271 Create `src/data/vocabulary.ts` with `VocabularyMember` (`readonly label: string` — "the
      ONLY string the UI may render"; `readonly order: number` — "canonical ordering, ascending"),
      `VocabularyKey<T> = keyof T & string`, and `defineVocabulary<M extends VocabularyMember, K
      extends string>(members: Record<K, M>): Readonly<Record<K, M>>` returning `Object.freeze(members)`.
      A typed identity function and nothing else: **no plugin registry, no inheritance, no runtime
      validation** beyond the freeze (plan.md Complexity Tracking). Document that it exists for five
      concrete call sites (the four the asks name, plus `StatusEffectType` per T299), which is what clears Principle VI's "at least two" bar.
- [x] T272 [P] **[WI-005]** Add the `RARITY` registry to `src/data/statColors.ts` (it already owns
      `RARITY_COLORS` and the ordering arrays, so this is where the three parallel structures collapse
      into one), with `label`/`order`/`color` per data-model.md's table verbatim: `Common` "Common" 0
      `#70707a`, `Uncommon` "Uncommon" 1 `#4ab500`, `Rare` "Rare" 2 `#0084bd`, **`SuperRare`
      "Super Rare" 3 `#a040a0`**, `Legendary` "Legendary" 4 `#d47c00`, `Mythical` "Mythical" 5
      `#dc2844`. Re-export `Rarity = VocabularyKey<typeof RARITY>` from `src/data/types.ts` so the
      union's name and every existing import keep working. Delete the "deliberate spelling bridge"
      comment — the `label` field now *is* the bridge.
- [x] T273 [P] **[WI-003]** Add the `CREATURE_TYPE` registry carrying `label`, `order` and
      **`kind: "element" | "wildcard" | "placeholder"`**: the twelve elements are `element`, `Curio`
      and `NULL` are `placeholder`, `All` is `wildcard`. `kind` is the load-bearing field — `All` is
      carried by exactly one species (Omnichrome) and `creatureHasType` treats it as "matches every
      type", and comparing it as if it were an element is what caused round 10's Omnichrome bug.
      Fold `TYPE_COLORS` (`src/data/typeColors.ts`) into the registry as a `color` field. **Do not add
      a member for "typeless"**: 8 records (`dragonegg`/`purpleegg` × 4 levels) carry `types: []` and
      data-model.md records that as "a legitimate state for a shop item that hatches into a creature
      rather than being one".
- [x] T274 [P] **[WI-004]** Add the `DAMAGE_CHANNEL` registry with exactly four members — `Direct`,
      `Burn`, `Poison`, `Shock` — and export `DamageChannel = VocabularyKey<typeof DAMAGE_CHANNEL>`.
      **Drop `"SuddenDeath"`**: `rg -n 'SuddenDeath' src/` must return nothing afterwards, since it
      appears in no record and at no runtime site and research.md P2 retracted the sudden-death claim
      it was added for. Keep `DamageType` as a deprecated alias of `DamageChannel` for one round so the
      rename lands without touching every engine call site in the same commit.
- [x] T275 [P] **[WI-001]** Move `TRIGGER_DEFINITIONS` from `src/data/triggers.ts` into an
      `ABILITY_TRIGGER` registry, merging its existing `actionLabel`, `description` and
      `enginePropagated` fields in as registry member fields rather than leaving a second map beside
      it. `abilityTrigger` on `CreatureRecord` **stays `AbilityTrigger | undefined`** — 134 records have
      real ability text and no published trigger (research.md R4), so "not published" is a real state
      and inventing a member for it would assert a fact no source supports.
- [x] T276 **[WI-003, WI-005]** Derive `RARITIES_ASC` / `RARITIES_DESC` / `RARITY_COLORS` from
      `RARITY.order` instead of hand-writing them (today hand-written at `src/data/statColors.ts:50-60`),
      keeping all three names and every call site unchanged. Then do the same for `CreatureType`'s three
      consumers, **named explicitly because validation pass 1 found two of them in no task**:
      1. `src/data/typing.ts:29` — `creatureHasType` hardcodes `creature.types.includes("All")`. It must
         read `CREATURE_TYPE[t].kind === "wildcard"` instead. This is the function whose literal `"All"`
         comparison **caused round 10's Omnichrome bug**, the very bug T273's `kind` field cites as its
         motivation; leaving it hardcoded would mean the registry is not the single declaration WI-003
         asked for and the bug class stays reachable from its own origin.
         **Three further production sites hardcode the same literal** and must route through the same
         predicate, because validation pass 2 found them unreachable by any assertion this round adds
         (T277's guard is on vocabulary *arrays*, and these are inline comparisons):
         `src/engine/effects.ts:439`, `src/ui/GridPicker/GridPicker.tsx:316`, and
         `src/ui/shared/BatomonCard/BatomonCard.tsx:190`. Four sites, one predicate. Add a grep
         assertion that `includes("All")` appears nowhere in `src/` outside the registry and its tests.
      2. `src/ui/CorpusBrowser/CorpusBrowser.tsx:12-15` — a local array hand-listing all fifteen members.
      3. The type-filter `<select>` lists in the pickers.
      **Only `All` is withheld from filter lists**, because it is the wildcard that matches everything.
      `Curio` (11 level-1 species) and `NULL` (4) **stay filterable**: `src/data/types.ts:26-31` cites two
      independent sources treating both as real published Type values, so hiding them would make 15
      species unreachable by type filter — a regression no ledger item asked for. (depends on T271, T272,
      T273)
- [x] T277 **[WI-001, WI-003, WI-005]** Add `src/data/__tests__/vocabulary.test.ts` asserting, for each
      of the **five** registries — including `StatusEffectType` from T299, which pass 3 found was the one registry the round added and then left outside its own anti-drift guard — that every derived list is **key-complete against the registry** — i.e.
      `RARITIES_DESC`, the type lists, and the trigger list each contain exactly the registry's keys
      (minus `kind === "wildcard"` where a list documents that exclusion). Then **replace the
      hand-written ten-value array in `src/data/__tests__/triggers.test.ts:55-59` with the registry's
      keys**: that array is the drift the round exists to remove, because today a value added to the
      union and omitted from it is invisible to the very guard that checks registry completeness.
      Finally assert that **no local vocabulary array survives anywhere in `src/`** — both
      `RARITIES = [...]` and the `CreatureType` equivalent, since pass 1 found the rarity grep alone
      left `CorpusBrowser.tsx:12-15` unguarded. (depends on T276)

### WI-006 — "Super Rare" on screen, `SuperRare` in storage

- [x] T278 [US3] **[WI-006]** Render rarity through `RARITY[r].label` at **every** call site. The ask is
      "should display that everywhere", so this list is exhaustive and was corrected by validation pass
      1, which found the three filter dropdowns — the places a user most often sees a rarity name — in
      no task at all:
      1. `src/ui/shared/BatomonCard/BatomonCard.tsx` — the card header's rarity label.
      2. **Rarity filter `<option>` lists, all three**: `src/ui/GridPicker/CreatureSearchModal.tsx:137-139`,
         `src/ui/CorpusBrowser/CorpusBrowser.tsx:70-72`, `src/ui/GridPicker/TrinketPicker.tsx:202-204`.
         Each renders `{r}` raw today.
      3. `PickerSection` headings: `CreatureSearchModal.tsx:97`, `TrinketPicker.tsx:159`,
         `AffectedCreaturePicker.tsx:119`. **Note `CorpusBrowser` has no `PickerSection`** — its only
         rarity surfaces are the dropdown in (2) and the local array in T276, which is why pass 1
         recorded the original wording here as wrong.
      4. `AffectedCreaturePicker.tsx:163` — the rarity-shape chips, **including the `title` attribute at
         line 169** (`Typically ${want} ${r}`), which a text-node scan cannot see.
      Flip the **four** tests that consume the raw spelling: `src/ui/__tests__/presentation.test.tsx:102`,
      `src/ui/shared/TrainerCard/__tests__/AffectedCreaturePicker.test.tsx:55` and `:62`, and
      `src/ui/__tests__/creaturePicker.test.tsx:18`. **The fourth matters most and is the subtlest**: it
      filters headings with `RARITIES_ASC.some((r) => h?.startsWith(r))`, so once a heading reads
      "Super Rare" that section silently drops out of the assertion and the test **still passes** while
      checking less. Those flips are the evidence the item landed; this one is also a latent
      false-pass. (depends on T272)
- [x] T279 [US3] **[WI-006]** Add a guard test that renders the card, **all three** pickers, the Corpus
      Browser and the affected-species overlay, and **fails if the raw key `SuperRare` appears in any
      rendered text or in any `title`/`aria-label` attribute**. Both halves were corrected by pass 1:
      CorpusBrowser was omitted from the scan, and a text-node-only scan misses
      `AffectedCreaturePicker.tsx:169`'s `title`. The failure mode is silent — a raw key in a heading
      reads as a styling slip rather than a bug — so the assertion must be on rendered output, never on
      the data value. (depends on T278)
- [x] T280 **[WI-006]** Verify the no-churn invariant: `git diff --stat src/data/` shows **no change** to
      `creatures.ts` (124 occurrences of `"SuperRare"`, measured) or `trinkets.ts` (14). Note the
      ledger's inventory of churn sites was wrong and pass 1 corrected it: `trainers.ts` and `shiny.ts`
      contain **zero** occurrences, and **`src/data/__tests__/fixtures/batodex-monsters.json` contains no
      `"SuperRare"` at all** — it stores rarity as `{"label": "...", "color": "..."}`, i.e. the published
      source already uses the label/colour descriptor shape this round is adopting (research.md R2a).
      So the fixture was never a churn site and the registry is the source's own shape, not merely a
      TypeScript idiom. Record both corrections in the round report.

### WI-004 — the damage-type answer

- [x] T281 **[WI-004]** Rename `DamageType` to `DamageChannel` at its engine call sites —
      `applyShieldReduction` (`src/engine/shield.ts:41`), `applyShockProc` and `isDirectDamage`
      (`src/engine/status.ts`), `TimelineEvent.damageType`, `ModifiableBase.damageType` — then remove
      the deprecated alias from T274. **Signatures keep the same arity, semantics and return shapes**;
      contracts/engine-api.md's round-7 amendment is the statement of that. The rename is justified in
      research.md R3: the old name described two different concepts, a *hit's* channel (an engine
      concept, kept here) and a *creature's* published cast kind (redundant, handled below).
- [x] T282 **[WI-004]** Add `src/data/__tests__/damageChannel.test.ts` asserting over **all 596 records**
      that `damageType === null` ⟺ `baseDamage === null`. This holds 596/596 today, measured. It is the
      guard that makes deferring the `publishedCast` restructure safe rather than merely stated: if a
      future record ever sets one field without the other, the suite fails and the restructure has
      evidence behind it. Comment it with the deferral it protects and point at data-model.md.
- [x] T283 **[WI-004]** Delete the dead ternary at `src/ui/shared/BatomonCard/BatomonCard.tsx:97` —
      `const verb = input.damageType === "Direct" ? "Deal" : "Deal"` — whose branches are the same
      string. It is the clearest single piece of evidence that the record's `damageType` carries no
      information (research.md R3), so remove it **and say so in the commit**, rather than quietly
      tidying it.
- [x] T299 **[WI-004]** Register `StatusEffectType` on the same `defineVocabulary` helper (label, order,
      colour via the existing `STATUS_COLOR_KEY` mapping), and add
      `damageChannelOf(status: StatusEffectType): DamageChannel | undefined` — `Shield` returns
      `undefined` because Shield absorbs damage and never deals it.
      **This task exists because validation pass 1 found the ledger's explicit requirement unaddressed**:
      WI-004's note says "the relationship between `DamageType` and `StatusEffectType` must be addressed
      by the proposal", and the first draft discussed neither. The answer, argued in research.md R3a and
      data-model.md: they overlap on three of four members and are still **two vocabularies**, because
      `"Direct"` is a channel that is never a status and `"Shield"` is a status that is never a channel.
      **Do not merge them** — a single five-member union would make the compiler accept
      `applyShieldReduction(n, "Shield", s)` and a `statusTick` of `"Direct"`, both nonsense the current
      split rejects. Follow `STATUS_COLOR_KEY`'s precedent in `format.ts`: one vocabulary with a derived
      mapping onto another. (depends on T271, T274)
- [x] T284 **[SUPERSEDED by the user's scope decision]** **[WI-004]** Record the `publishedCast` proposal's **deferral** in the round report with its
      reason and its blast radius named: `ModifiableBase`, `PerCastOutput`,
      `SimulationResult.perCreatureEffectiveStats`, `BatomonCard`'s output band and ~15 engine test
      fixtures that spell `baseDamage`/`damageType` literally. The user asked to "think about and
      propose"; the proposal is the deliverable and it is already written in data-model.md and R3 —
      this task is making sure the deferral is **surfaced to the user**, not buried in an artifact.
      Also note for whoever lands it that `modifiers.test.ts:47-59` pins Burn/Poison-typed *attackers*
      that **no corpus creature has ever been**, so those fixtures pin a capability, not a creature.

### WI-002 — derive the tags instead of hand-managing 149 species

- [x] T285 [US1] **[WI-002]** **Failing test first** (Principle III, since this changes what the engine
      receives): add a test asserting Ninflora offers a manual "Win a round" trigger granting
      `cooldownSpeedAdd` `0.1` at L1 (`0.2`/`0.3`/`2.4` at L2/L3/L4, from its published text), targeting
      `{ kind: "allAllies", typeFilter: "Grass" }` with `includeSelf: true`. **Show it failing before
      T286.** Ninflora currently has `abilityTags: []` and is the round's named acceptance case.
- [x] T286 [US1] **[WI-002]** Implement `deriveAbilityTags(record): AbilityTag[]` in
      `src/data/deriveTags.ts` — a pure data-layer function, no engine import — as a **declarative rule
      table**, not a chain of `if`s:

      ```ts
      interface DerivationRule { family: string; pattern: RegExp; build(m: RegExpMatchArray, r: CreatureRecord): AbilityTag | null; }
      const RULES: DerivationRule[] = [ /* one row per text shape */ ];
      ```

      **The table is the point of the item, not an implementation preference.** The ask is to work from
      "inherent properties about a mon's ability instead of having to manually manage a separate list of
      tags across 140+ mons"; a rule table makes adding a family **one declarative row** instead of N
      per-creature edits, which is the structural change the ask describes. A hardcoded parser would fix
      Ninflora and leave the next family exactly as hand-managed as before.

      Rules for the `manualTrigger` family. **The rules must span the full `TargetSelector` vocabulary,
      not the shapes that happened to be hand-tagged first** — validation pass 2 measured that of the 60
      untagged records containing "permanently", **only 10** match the three hand-written shapes:
      1. `"This and <filter> allies gain +N <Stat> permanently."` — Brawlmantis, Kickrane, Ninflora.
      2. `"+N <Stat> permanently."` — Dollhime, Ratacomb, Vipair. Also `"+4 Burn and +4 Poison
         permanently."` (Brimtoad): **two stats, no target clause**.
      3. **A leading trigger clause, then the grant** — `"When you use an item, this gains +20 Damage and
         Shield."` (Craghorn), `"After you buy a Bug monster, this gains +8 Damage."` (Guardiant),
         `"On Knockout of any monster, this gains +60 Damage permanently."` (Cawnushi, Emburn). Note
         Craghorn grants **two stats from one amount** and contains **no "permanently" at all**, so a
         rule keyed on that word would miss it.
      4. **Positional and filtered targets — the other 50 records, and the reason this task is not
         three regexes.** All of these targets already exist in `TargetSelector`, so each is a rule row,
         not a new capability: `"Adjacent Water allies gain +25 Heal permanently"` (Aster) →
         `adjacent` + `typeFilter`; `"Adjacent Grass allies gain +7% Cooldown Speed permanently"`
         (Ginsage); `"Give the ally behind +3% Cooldown Speed permanently"` (Boomagon) → `behind`;
         `"Allies of level 3 or above gain +15 Damage and +15 Heal permanently"` (Lumijel) →
         `allAllies` + `minLevelFilter`.
      **27 of the 60 records, across 7 species, are NOT derivable and must be left alone.** Validation
      pass 3 measured this; an earlier version of this task said "two records", which was the same
      unmeasured-claim mistake passes 1 and 2 had already caught twice. The full split of the 60:

      | Derivable (33 records) | Rule |
      |---|---|
      | Ninflora ×4 | shape 1 — `allAllies` + `typeFilter` + `includeSelf` |
      | Aster ×4, Ginsage ×4 | `adjacent` + `typeFilter` |
      | Boomagon ×4 | `behind` |
      | Lumijel ×4 | `allAllies` + `minLevelFilter` |
      | Beetdown ×3 | shape 2 — bare self-grant |
      | Brimtoad ×4, Emperooze ×3 | shape 2 — bare self-grant, **two stats** |
      | Dewlotl ×3 | shape 3 — leading trigger clause |

      | NOT derivable (27 records) | Why |
      |---|---|
      | Mallogre ×4 | `"for each Trinket that you own"` — count-scaled, no trinket-count input in this model (same gap round 5 recorded for its battle-start text) |
      | Sproach ×4 | `"for each life lost this run"` — no run-history input |
      | Talonite ×4 | two count-scaled grants in one sentence (`for each Rock ally`, `for each Flying ally`) |
      | Sunsage ×3 | `"For each Fire ally, this gains …"` — count-scaled; belongs to `statFromCount`, not this family |
      | Omnichrome ×4 | `"Gain 2400% of the stats of the enemy monster with the highest stats"` — a multiplier off an enemy, not a flat grant |
      | Aerophim ×4 | `"Give adjacent allies +60 Multicast permanently **and transform them into random monsters of their rarity**"` — a second clause no tag expresses |
      | Gildshell ×4 | `"+240 Sell Value permanently"` — **Sell Value is not a `ModifierStat`** |

      Report all 27 as knowingly skipped rather than force-matching them, and make sure T291's
      per-family table reports 33 of 60 rather than implying 60.

      **Read the TEXT, with the published trigger as corroboration only** — 134 records have ability text
      and no trigger at all, so keying on the trigger would miss a quarter of the corpus (research.md
      R4). Percentage stats store as fractions (`+10% Cooldown Speed` → `0.1`), matching
      `ModifierEditor`'s existing `store: (typed) => typed / 100`. (depends on T285)
- [x] T297 **[SUPERSEDED by the user's scope decision]** [US1] **[WI-002]** **Census first, then derive a second family**, so the rule table is proven
      extensible rather than asserted to be. Read research.md R4's census table **and its note on the
      two columns**: "new" attributes each record to the first shape it matches, "total" counts every
      record matching, and the two differ sharply — 56 records say "for this battle" but 32 of those
      also mention an ally, so only **24** are new there. Do not restate the two columns as one
      partition; validation pass 2 caught the first version of this task doing exactly that and summing
      to 527 over a 424-record base.
      The candidates, by **new** count: ally-mentioning 140, shop/economy 28, knockout 24, "for this
      battle" 24, evolution-only 19, "for each" 10, positional 9 — with 110 records matching no shape.
      Pick the **next family the census actually supports**, add it as rule-table rows, and report the
      records it covers. Do **not** pre-commit to a family here — pass 1 flagged unverified family
      claims as overreach, so the census is a required output and the choice follows from it. Note the
      largest bucket (ally-mentioning, 140) is a *target shape* spanning several families rather than a
      family itself, so it is not automatically the right pick.
      **One constraint that decides whether the coverage counter may move**: if the chosen family IS in
      `RESOLVED_TAG_KINDS`, the UI's "N abilities not yet modelled" figure **should rise**, and that is
      honest — the engine really does resolve those tags. T289's "figure must not move" assertion applies
      only to the `manualTrigger` family. State which case applies and why. (depends on T287)
- [x] T287 [US1] **[WI-002]** Apply the derivation at corpus-construction time in `src/data/corpus.ts`
      with the merge rule stated verbatim in data-model.md: **effective tags = hand-authored tags, else
      derived tags.** Hand-authored wins, and the escape hatch is required rather than defensive —
      Petrirex's self-knockout, Fumungus's enemy-stack scaling and the Link Cable adjacency rewrite will
      never read correctly from prose. **Not a codegen script**:
      `scripts/tag-shiny-abilities.mjs` is the precedent for that and carries the staleness flaw
      (correct only as of the last manual run), so derivation happens at construction and cannot drift
      from its own text. (depends on T286)
- [x] T288 [US1] **[WI-002]** Add a **per-species snapshot test** of the derived tag set. This is what
      recovers the one real advantage codegen would have had — a git diff showing what changed — so a
      text edit that silently alters behaviour appears in review. Also assert the three round-6 guards
      still hold: no creature carries both a `manualTrigger` and an engine-resolved tag; no
      `manualTrigger` names an `enginePropagated` trigger; and the WI-002 guard from
      `triggers.test.ts` ("a trigger targets allies exactly when its ability text says allies GAIN")
      passes against **derived** tags too, not just hand-written ones. (depends on T287)
- [x] T289 [US1] **[WI-002]** Assert the **engine-coverage figure does not move for the `manualTrigger`
      family** (T297 governs whether a second family may legitimately move it). `manualTrigger` is
      deliberately absent from `RESOLVED_TAG_KINDS`, which is the reason this family was chosen as the
      round's slice (research.md R4), so the UI's "N abilities not yet modelled" line must read the same
      before and after. A coverage number that changes means the derivation leaked into the engine's
      claim about what it computes — the specific dishonesty the spec argues against at length.
      (depends on T287)
- [x] T290 [US1] **[WI-002]** Produce the **trigger/text agreement census**: for every record with both
      a published `abilityTrigger` and a derivable one, report disagreements as a list of ids. Run it as
      a reporting step **before** enforcing agreement as an assertion — plan.md's risk section flags
      that 134 records have no trigger and some embed it in prose ("Ongoing: the ally behind..."), so
      genuine disagreements are corpus findings needing citation, not test failures to suppress. If the
      census is non-empty, record the ids and do **not** enforce; state it in the round report.
      (depends on T286)
- [x] T291 [US1] **[WI-002]** Record the residue in the round report as a **per-family table with
      measured before/after counts**, not a single number. Before: **424 of 596 records (106 of 149
      level-1 species)** have published ability text and zero tags. After T286 and T297, report: records
      newly covered per family, records still untagged, and which of research.md L1's 17 families remain
      hand-written. The ask was "instead of having to manually manage a separate list of tags across
      140+ mons", so a round that converts the *mechanism* from per-creature edits to per-family rules
      must state exactly how many creatures that reached and how many it did not — pass 1's finding was
      that honesty about a residue is not the same as covering it, and the table is what lets the user
      judge which they got. (depends on T288, T297)

### WI-007 — ability-text keywords coloured in place

- [x] T292 [US3] **[WI-007]** Implement `tokenizeAbilityText(text): AbilityTextRun[]` in
      `src/data/abilityHighlight.ts`, returning `{ text: string; colorKey?: ... }[]`. A **pure
      data-layer function, not a component** — it keeps the keyword vocabulary next to `STAT_COLORS`
      (Principle VII's "one formatter") and is testable without rendering. Two rules read off the
      corpus (research.md R6): **longest match first**, so "Cooldown Speed" never splits into
      "Cooldown" + " Speed"; and **the sign and number join the run**, so "+20 Damage" colours
      entire — the game's Craghorn card shows "+20 Damage" pink and "Shield" tan *in the same
      sentence*, which also settles that highlighting is per-keyword rather than per-card.
- [x] T293 [US3] **[WI-007]** Extend the keyword vocabulary **beyond the seven `StatColorKey`s**, using
      measured figures. **Validation pass 1 found the original version of this task asserted something
      false** — it claimed the 225 texts without a stat keyword "do contain Protect, HP, Trigger or
      Ongoing", when only **52 of them do** (60 case-insensitively). research.md R6 stated it correctly
      and hedged; the task hardened the hedge into a claim and scoped itself on it. Corrected census of
      the **173** texts that remain bare after those four terms:

      | Term | Records |
      |---|---|
      | `level` (e.g. "Evolves at level 3") | 36 |
      | `Evolve`/`Evolves` | 35 / 19 |
      | `Knockout` | 32 |
      | `Trinket` | 24 |
      | `Charge` | 12 |
      | `day`/`days` | 12 |
      | `shop` | 8 |
      | `Sell Value`, `Berries` | 4 each |

      Add a second tier of **mechanic nouns** for these terms, coloured distinctly from the stat terms
      (they name mechanics, not output stats — "Evolves at level 3" is not a damage figure). All colours
      resolve through the same `statColors.ts` layer so ability text and stat badges cannot drift to
      different reds.
      **Measured outcome, so the task is falsifiable**: those nine terms reach **132 of the 173**,
      giving **502 of 543** texts at least one coloured run and leaving **41** bare. Do not describe the
      tier as "covering the 173" — validation pass 2 measured it at 132 and the distinction is the
      difference between meeting the ask and approaching it. Compute the final figure and hand it to
      T298. (depends on T292)
- [x] T298 [US3] **[WI-007]** Record WI-007's **uncoloured residue** in the round report, the way T291
      does for WI-002 — pass 1's finding was that WI-002 writes its residue down and WI-007 did not,
      while both substitute a measured slice for an ask that says "all". Report the count of ability
      texts with no coloured keyword after T293, with examples. The round's own stated bar is that
      "'all mon's ability text' is not satisfied by colouring 318 of 543 cards" (plan.md), so whatever
      the final figure is, it is stated rather than implied. If it is not 543 of 543, say so plainly.
      (depends on T293)
- [x] T294 [US3] **[WI-007]** Add a shared renderer mapping runs to spans and use it at
      `src/ui/shared/BatomonCard/BatomonCard.tsx:245`, replacing the plain
      `<p>{creature.abilityText}</p>`. One component, so the Corpus Browser, the Calculator panel and
      any future surface cannot disagree. **Trainers are out of scope** — the ask says "all mon's" —
      but state that explicitly in the component's doc comment rather than leaving
      `TrainerCard.tsx:91` silently inconsistent. (depends on T293)
- [x] T295 [US3] **[WI-007]** Add `src/data/__tests__/abilityHighlight.test.ts` asserting the
      **round-trip**: for all 543 records with real ability text, concatenating the runs' `text` returns
      the original string **exactly**. That is the assertion proving highlighting loses and duplicates
      nothing. Also pin longest-match-first, a creature with no keyword producing a single
      uncoloured run, and that Bumblebolt's trailing flavour quote (`... applies 1 Shock. "The poster
      Common: 2.5s, Shock, cheap."`) is not mangled. (depends on T292)

### Verification

- [x] T296 **[WI-001..WI-007]** `npx tsc -b`, `npx vitest run`, `npm run lint`, `npm run build`, then
      walk **quickstart scenarios 49-59 in a real browser**. Scenario 56 (the card holding its declared
      height, FR-043) **cannot be done in jsdom, which performs no layout** — inline spans can change
      line-breaking even though no text grows, so this one is a visual check or it is not done.
      Report, as numbers rather than adjectives: the T280 no-data-diff result and its two ledger
      corrections, the T290 trigger/text census outcome, **T291's per-family before/after table**,
      whether T289's coverage figure held for the `manualTrigger` family and what T297 did to it for the
      second family, and **T298's uncoloured-ability-text residue**. State plainly whether any item was
      left partially done — WI-002 and WI-007 both substitute a measured slice for an ask that says
      "all", so both figures belong in the user-facing report, not only in an artifact.

### Round 7 traceability

| Item | Ask (short) | Tasks | Requirement | Where the decision is recorded |
|---|---|---|---|---|
| WI-001 | `abilityTrigger` → enum | T271, T275, T277 | FR-111 | R1, R2, R2a; data-model.md "`AbilityTrigger`" |
| WI-002 | trigger informs/replaces `abilityTags`; fix Ninflora | T285, T286, **T297**, T287, T288, T289, T290, T291 | FR-113, FR-114 | R4 (incl. the family census and its two-column note); data-model.md "Derived ability tags" |
| WI-003 | `types` → enum | T271, T273, T276, T277 | FR-111 | R1, R2, R7.2; data-model.md "`CreatureType`" |
| WI-004 | `damageType`: propose a reasoned change | T274, **T299**, T281, T282, T283, T284 | FR-111 | **R3** (the proposal) + **R3a** (the `StatusEffectType` relationship); data-model.md "`DamageChannel`"; contracts/engine-api.md round-7 amendment |
| WI-005 | `rarity` → enum | T271, T272, T276, T277 | FR-111 | R1, R2, R2a; data-model.md "`Rarity`" |
| WI-006 | "SuperRare" → "Super Rare" everywhere | T278, T279, T280 | FR-112 | R5, R2a; data-model.md "`Rarity` — and 'Super Rare'" |
| WI-007 | ability-text keywords coloured inline | T292, T293, T294, T295, **T298** | FR-115 | R6; data-model.md "Ability-text keyword highlighting" |

The **Requirement** column was added in pass-2 remediation: FR-111..FR-115 had been written into
spec.md to give the round requirement text to validate against, but nothing in tasks.md cited them, so
traceability ran only one way (quickstart → FR).

Tasks added in remediation after validation pass 1: **T297** (WI-002's second family, census-first),
**T298** (WI-007's uncoloured residue), **T299** (WI-004's `StatusEffectType` relationship — a named
ledger deliverable the first draft omitted). T276, T277, T278, T279, T280, T286, T289, T291, T293 and
T296 were tightened rather than added; see `round-7-validation.md` pass 1 for what each was missing.

**Deliberately outstanding after this round** (to be stated in the round report, not implied):

1. **WI-004(b)** — the `publishedCast` value object is proposed and **deferred**; T282's invariant test
   guards the interval. Reason and blast radius: R3 and T284.
2. **WI-002's residue** — the round derives the `manualTrigger` family across its full `TargetSelector`
   range plus **one** further family chosen by census (T297), leaving the rest of research.md L1's 17
   families hand-tagged. Baseline: **424 of 596 records** carry published ability text with zero tags.
   T291 reports the measured per-family before/after table, which is the figure that matters — not the
   family count.
3. **R7.1** — `purpleegg` L1-L4 ship unresolved template placeholders in cited ability text
   ("Hatches a level 2 **{monster_name}** in **{amount}** day(s)"). Found while measuring, not asked
   for, not fixed.

### Scope expansion (user decision, 2026-10-07, after validation pass 3)

The user chose to widen rather than accept pass 3's slice. **T284 and T297 are superseded**; the
following replace them. Reasoning in `orchestration/round-7-validation.md` "Scope decision".

- [x] T300 **[WI-004]** **Do the `publishedCast` restructure now** — the thing T284 recorded as
      deferred. Replace `CreatureRecord`'s `baseDamage: number | null` + `damageType: DamageType | null`
      pair with one optional field, so the illegal state stops being representable:
      ```ts
      publishedCast?: { damage: number; channel: DamageChannel };
      ```
      Reaches `ModifiableBase` (`src/engine/modifiers.ts`), `PerCastOutput`,
      `SimulationResult.perCreatureEffectiveStats`, `BatomonCard`'s output band, ~15 engine test
      fixtures, and all 596 records. **Migrate the records with a script, not by hand**, and keep
      T282's correlation test running until the moment the two fields no longer exist — it becomes the
      migration's own check that no record changed meaning. The 596/596 correlation is what makes the
      migration mechanical: every record either has both fields or neither.
      Keep the engine's ability to CREATE a cast (T232 — Bonshell deals 80 from cast 2 with no published
      damage), which now reads as "`publishedCast` absent, resolved cast present" rather than two
      nullables that must be updated together.
- [x] T301 [US1] **[WI-002]** **Extend the rule table to every mechanism family in research.md L1**, not
      one plus a census pick. Work family by family, largest first by R4's `new` column, and after each
      family run the full suite plus T289's coverage assertion — a family that is inside
      `RESOLVED_TAG_KINDS` will legitimately move the coverage figure (FR-114) and one that is not must
      leave it alone. Commit per family so a bad rule is revertable in isolation.
- [x] T302 [US1] **[WI-002]** Reduce `abilityTags` to an **enumerated exception list** and report its
      exact size. The user's ask is to delete the hand-written array "entirely"; the honest destination
      is that nothing remains in it except entries that **cannot** be derived, each carrying a one-line
      reason. The measured irreducible cases are already known (R4): Omnichrome's enemy-stat multiplier,
      Mallogre's trinket count and Sproach's lives-lost count (**inputs this model does not have**),
      Gildshell's `Sell Value` (**not a `ModifierStat`**), Aerophim's transform clause, plus the
      long-known Petrirex, Fumungus and Link Cable cases.
      Add a test that **fails if a hand-authored tag is derivable** — i.e. if the derivation would have
      produced it anyway — so the exception list cannot quietly regrow into the hand-maintained array
      this item exists to remove. That test is the real deliverable of WI-002: it makes the property
      permanent rather than true once.
- [x] T303 **[WI-002, WI-004]** Final reconciliation: re-run the R4 census and report the **after**
      numbers against the 424/596 baseline, plus the exception-list size from T302 and the
      `publishedCast` migration result from T300. If any family was attempted and abandoned, name it and
      say why — "all 17 families" is the instruction, and a family quietly skipped is worse than one
      reported as too hard.

### Round 7 completion note (2026-10-07)

All of T271-T303 shipped, with two exceptions marked `SUPERSEDED` rather than done:

- **T284** was "report the `publishedCast` deferral". The user chose to land the restructure instead,
  so there is no deferral to report. T300 did the work.
- **T297** was "census first, then derive a second family". The census happened and is recorded in
  round-7-validation.md, but its conclusion changed the plan: the residue is capped by what the
  ENGINE models, not by rule count, so `ongoing/aura-grant` plus the `StatChangeStat.Heal` slot were
  the valuable increments rather than another census-chosen family.

**Work done beyond the ledger**, because the asks turned out to require it:

| Added | Why |
|---|---|
| String enums for all 18 vocabularies (not a const-object registry) | research.md R8 — the user's ask, three times; R2's argument against it was wrong and `erasableSyntaxOnly` was the actual blocker |
| `ConfirmableField` | `isUnconfirmed(creature, "baseDamage")` would have silently stopped matching after the `publishedCast` rename |
| Branded `PlacementKey` + one builder | The result key was built inline at twelve sites; `TeamSummary` built it by hand and matched only by coincidence |
| Generated `Species`/`TrainerId`/`TrinketId`/`ItemId` | Ids were bare strings, so a typo'd id matched no record instead of failing |
| `ShinyKey` template-literal type | `SHINY_STATS` was keyed by raw `${id}|${level}` strings |
| `ModifierStat.HealAmountAdd`, `StatChangeStat.Heal`, `ResolvedPlacement.healAmount` | Heal was a published output stat with no modifier and no effect slot, which blocked four species' abilities outright |
| `StatColorKey.Cooldown` | Cooldown Speed was borrowing Multicast's colour |
| `syntheticSpecies` / `syntheticTrinketId` | Engine fixtures legitimately invent creatures; a named escape hatch counts the exception instead of hiding it in casts |
| `parseRarity` / `parseRegionId` / `parseTrainerId` / `parseSpecies` | `<select>` values were cast into domain types without validation |
| Corpus fixes: `dewlotl`, `purpleegg` | A sourcing disclaimer and template placeholders were rendering as abilities |

**Still open, deliberately:** `toLowerCase()` word matching inside `deriveTags.ts` and the corpus
search. It is inherent to parsing prose — the parsers emit typed values, but their internal lookup is
still case-insensitive string matching. See research.md R9 for the full hazard table.
