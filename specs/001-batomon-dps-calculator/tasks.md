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

- [ ] T092 Update `STATUS_VS_SHIELD_REDUCTION` in `src/engine/shield.ts` from `0.25` to `0.15`;
      update its `Provenance` to cite the August 2026 patch sources (research.md F1), keeping
      the 30% -> 25% -> 15% history in a comment
- [ ] T093 [P] Add `healAmount?: number` and `sellValue?: number` to `CreatureRecord` in
      `src/data/types.ts` (data-model.md's "New stats: healAmount, sellValue" amendment — corpus
      data only, no engine behavior this round)

### Tests for Phase 9 ⚠️ write/update first, confirm failing before implementing (Constitution Principle III, NON-NEGOTIABLE)

- [ ] T094 [P] Update the expected reduction value in `src/engine/__tests__/shield.test.ts` from
      25% to 15%; confirm it FAILS against the still-unmodified `STATUS_VS_SHIELD_REDUCTION`
      before T092 lands
- [ ] T095 [P] Write a failing unit test in `src/engine/__tests__/simulate.test.ts` (reusing the
      existing `multicastCorpus()` fixture) asserting a Multicast-3 creature's three repetitions
      land at three distinct timestamps 0.1s apart (`t`, `t+0.1`, `t+0.2`), not all at `t`
      (research.md F2)

### Implementation for Phase 9

- [ ] T096 [US2] Implement the `STATUS_VS_SHIELD_REDUCTION` value change (satisfies T094;
      depends on T092 — same change, listed separately only because T094 is a test-first task)
- [ ] T097 [US1] Fix Multicast repetition timing in `src/engine/simulate.ts` Phase B: stagger
      each repetition `i` to `roundTime(cast.tSeconds + i * 0.1)` instead of reusing
      `cast.tSeconds` for all repetitions; a repetition whose staggered timestamp exceeds
      `windowSeconds` is not generated, to satisfy T095
- [ ] T098 [US1] Remove the separate "Choose…"/"Change…" button in
      `src/ui/GridPicker/GridPicker.tsx`; make the slot's card (occupied) or placeholder (empty)
      itself the click target that opens `CreatureSearchModal`, coexisting with the existing
      drag handlers on occupied cards (FR-023)
- [ ] T099 [US1] Remove the displayed slot-position text (e.g. "Back 1") from
      `src/ui/TeamSummary/TeamSummary.tsx`'s DPS table and
      `src/ui/TeamSummary/PlacedCreatureDetails.tsx`'s panel header; the underlying
      `${creatureId}@${slotKey}` keying is unchanged (FR-024)
- [ ] T100 [US3] Research and record level-1 `baseDamage`/`baseCooldownSeconds`/`damageType`
      (and `healAmount`/`sellValue` where sourced) for as many of the ~140 still-unconfirmed
      `src/data/creatures.ts` entries as feasible this round, cited via individual per-creature
      detail pages (research.md F6) — large, chunked, continuing the `tasks.md` T075 pattern;
      log the resulting confirmed-count delta honestly, not claimed as 100% complete unless it
      genuinely is

### Polish for Phase 9

- [ ] T101 [P] Re-run quickstart.md Validation Scenarios 13–15; record results in quickstart.md
- [ ] T102 Verify `npx tsc -b --noEmit`, full `npx vitest run`, and `npm run build` all pass

**Checkpoint**: Shield/Multicast mechanics match the current patch; Heal/Sell Value are
browsable corpus data; assignment works by clicking the card itself; DPS table/side panel no
longer show redundant slot text; level-1 corpus completeness has measurably improved (exact
delta reported, not assumed); level 2/3/4 stats remain an explicitly logged, tooling-blocked gap
(research.md F5), not silently dropped.

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

### Notes

- [P] tasks touch different files and have no incomplete-task dependency.
- Every engine mechanics task cites the exact research.md subsection it implements — do not
  re-derive the formula from memory; read research.md B1-B6 and contracts/engine-api.md first.
- Commit after each task or logical group.
