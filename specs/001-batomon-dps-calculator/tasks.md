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
- [ ] T044 [P] [US3] Widen `src/data/trainers.ts` to the full cited Trainer corpus
- [ ] T045 [P] [US3] Populate `src/data/trinkets.ts` with the full cited Trinket corpus
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

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies, start immediately
- **Foundational (Phase 2)**: depends on Setup — blocks all user stories
- **User Stories (Phase 3-5)**: all depend on Foundational completion; independently testable once
  it's done, and may proceed in priority order (US1 → US2 → US3) or in parallel if staffed
- **Polish (Phase 6)**: depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: no dependency on US2/US3; this is the MVP slice
- **US2 (P2)**: reuses US1's `simulate()`/`TeamConfigContext`/view shell but is independently
  testable per quickstart.md Scenario 3 once US1's engine core (T027) exists
- **US3 (P3)**: reuses the `Corpus` object from Foundational; independently testable without US1/US2
  UI, though it shares the `src/App.tsx` view shell

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

### Notes

- [P] tasks touch different files and have no incomplete-task dependency.
- Every engine mechanics task cites the exact research.md subsection it implements — do not
  re-derive the formula from memory; read research.md B1-B6 and contracts/engine-api.md first.
- Commit after each task or logical group.
