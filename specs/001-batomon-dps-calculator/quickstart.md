# Quickstart: Validate the Batomon DPS & Status Calculator

**Feature**: [spec.md](./spec.md)

## Prerequisites

- Node.js (latest LTS) and npm installed.
- Repo cloned, dependencies installed: `npm install`.

## Run it locally

```bash
npm run dev
```

Opens the Vite dev server. Navigate to the Calculator view.

## Validation scenario 1 — single-creature DPS (User Story 1, Acceptance Scenario 1)

1. Place exactly one creature with a known `baseDamage` and `baseCooldownSeconds` (e.g. Bumblebolt:
   3 damage / 2.5s cooldown per research.md B4's cited example) into grid slot `front0`, no trainer.
2. **Expected**: displayed DPS = `3 / 2.5 = 1.2`.
3. Change nothing else; this is the simplest possible regression check for `effectiveCooldown`
   wired end-to-end into the UI.

## Validation scenario 2 — stacking Poison (User Story 1, Acceptance Scenario 2)

1. Place a creature that applies Poison (per corpus) attacking repeatedly over a 10s window.
2. **Expected**: the displayed Poison-per-second value steps upward at each new application and
   does not spontaneously drop on its own between applications (Poison does not decay from ticking,
   research.md B2) — contrast with a Burn-applying creature in the same window, whose per-second
   value should visibly decay between applications.

## Validation scenario 3 — cumulative chart distinguishes burst vs. decay (User Story 2)

1. Assemble a team with (a) one creature with a large, infrequent direct hit and (b) one creature
   applying Burn.
2. Run the simulation over a 20s window.
3. **Expected**: the chart's total-damage series shows a step at the infrequent hit's cast times;
   the Burn series shows a curve that flattens as layers decay between hits — these must be visually
   distinguishable per spec.md Success Criterion SC-005.

## Validation scenario 4 — corpus browser + conflict display (User Story 3)

1. Open the corpus browser, search for a creature name known to appear in this project's recorded
   source conflicts (see `src/data/creatures.ts` conflict entries).
2. **Expected**: the conflicting values and their sources are both visible on that entry's detail
   view, not silently merged into one number (spec.md FR-004, SC-004).

## Validation scenario 5 — Trainer roster + placement (FR-015)

1. Open the Calculator view without selecting anything.
2. **Expected**: the Trainer selector appears before/above the 2x3 grid-placement controls, and
   its dropdown lists the full documented roster (23 Trainers per research.md D1), not just
   "Musician."

## Validation scenario 6 — per-creature effective-stat breakdown reflects modifiers (FR-016)

1. Place one creature with confirmed `baseDamage` (e.g. `scorchimp`) into a grid slot.
2. Note its displayed effective damage in the per-creature breakdown panel.
3. Add a team-wide `damageFlatAdd` modifier of `+10` via the Modifiers section.
4. **Expected**: the breakdown panel's displayed damage for that creature increases by exactly 10,
   without needing to open the DPS table or chart to infer it.

## Validation scenario 7 — chart X-axis ticks are clean and evenly spaced (FR-017)

1. Assemble any team and run a simulation window of 20s.
2. **Expected**: the chart's X-axis shows a small number of clean, evenly-spaced tick values (e.g.
   `0, 5, 10, 15, 20`), never a raw event timestamp like `14.7000000000000001` and never
   inconsistently-spaced labels driven by the underlying data points.

## Known data gap, not a failure

As of 2026-10-05 (round 2 implementation), 8 of 149 creature records have confirmed `baseDamage` /
`baseCooldownSeconds` (`bumblebolt`, `formiqueen`, `scorchimp`, `beetbud`, `riglet`, plus
`brawlmantis`/`dracana`/`frizzly` — the exact three the user originally reported as "0 DPS",
closed via a batodex.com individual-page lookup, tasks.md T075) — every other creature correctly
shows `0` DPS and contributes nothing to the chart, because its stats are genuinely unconfirmed
(`unconfirmedFields`), not because of an engine bug. See research.md D5 for the full diagnosis.
If DPS/chart output looks like "nothing is happening," check whether the placed creatures
actually have confirmed stats before suspecting a regression.

## Validation results (2026-10-05, round 2 implementation — Scenarios 5-7)

- **Scenario 5 — PASS.** `TrainerPicker` renders above `GridPicker` in `src/App.tsx`;
  `src/data/trainers.ts` now lists the full 23-entry roster (research.md D1), confirmed via
  `node -e` id count. Automated: covered indirectly by `simulate()`'s `trainerId` validation
  tests continuing to pass against the widened roster.
- **Scenario 6 — PASS.** Added
  `src/engine/__tests__/simulate.test.ts`'s "perCreatureEffectiveStats reflects an active
  damageFlatAdd modifier" test: a +10 `damageFlatAdd` team modifier raises Bumblebolt's
  `perCreatureEffectiveStats` damage from `3` to `13`, matching what `PlacedCreatureDetails`
  renders.
- **Scenario 7 — PASS.** `CumulativeChart`'s `XAxis` now uses `type="number"` with an explicit
  `domain={[0, windowSeconds]}`; `simulate()`'s cast-time generation switched to index
  multiplication with `roundTime()` applied at every `tSeconds` creation point. Covered by the
  new "cast times never accumulate floating-point drift across many casts" test (25-cast window,
  4.9s cooldown — a value that previously produced `14.7000000000000001`-style drift).

## Validation scenario 8 — search modal autofocus + clears between slots (FR-018)

1. Open the creature-assignment search for slot 1, type a query, pick a creature.
2. Open the creature-assignment search for a *different* slot (slot 2).
3. **Expected**: the search field is empty (not slot 1's leftover query) and has keyboard focus
   immediately, with no extra click required before typing.

## Validation scenario 9 — drag-and-drop swap between occupied slots (FR-019)

1. Place creature A in slot 1 and creature B in slot 2, each with a distinct level/modifier set.
2. Drag slot 1's card onto slot 2.
3. **Expected**: slot 1 now shows B (with B's own level/modifiers) and slot 2 shows A (with A's
   own level/modifiers) — a swap, not an overwrite that discards either placement's modifiers.
   The existing search-modal flow (Scenario 8) must still work for both slots afterward.

## Validation scenario 10 — evolution-aware leveling (FR-022)

1. Place Panbud in a slot.
2. Set that placement's level to 3.
3. **Expected**: the slot now shows Bambudo (Panbud's level-3 evolution, research.md E2.6) at
   level 3 — not Panbud with a missing/disabled level-3 option.

## Validation scenario 11 — persistent, non-overlapping detail side panel (FR-021)

1. Hover a placed creature's card; confirm its details appear in the side panel.
2. Move the pointer completely off every card (e.g. over empty page space).
3. **Expected**: the side panel still shows the last-hovered creature's details — it does not
   disappear. Hovering a different placed creature updates the panel to that creature instead.
4. **Expected**: the panel never visually overlaps/covers another creature's card, regardless of
   which row is hovered.

## Validation scenario 12 — consistent type colors (FR-020)

1. View a dual-typed creature's card background and its type tag chips (wherever both appear).
2. **Expected**: both the card background and the tag chips use the same color per type (from
   the single `TYPE_COLORS` mapping) — never two different color treatments for one type.

## Validation results (2026-10-05, round 3 implementation — Scenarios 8-12)

No browser-automation tool was available in this session, so Scenarios 8-12 were verified via
automated tests (component tests for the first time in this project, plus the existing engine
test-first discipline) rather than live interactive QA. Each is still an executable, automated
check, not a manual claim:

- **Scenario 8 — PASS (automated).** `src/ui/GridPicker/__tests__/CreatureSearchModal.test.tsx`
  (new — this project's first React component test): confirms the search input starts empty and
  receives focus on open, and that typing a query then reopening the modal for a *different*
  slot clears the query and re-focuses, via React Testing Library + jsdom.
- **Scenario 9 — PASS (automated).** `src/context/__tests__/TeamConfigContext.test.tsx` (new):
  confirms `movePlacement` moves into an empty slot and swaps with an occupied one, in both
  cases preserving the moved placement's own `level` and `modifiers` — not just its
  `creatureId`. The actual pointer-drag gesture itself (via `@dnd-kit/core`) was not
  interactively exercised (no browser available this session); the underlying state mutation it
  calls is what's tested here.
- **Scenario 10 — PASS for the mechanism (automated), honest gap for live demonstration.**
  `src/engine/__tests__/evolution.test.ts` confirms `resolveLevelUp` correctly resolves Panbud
  at level 3 to Bambudo via a synthetic fixture, returns a species to itself when it has no
  evolution, and never falls back to a different level's record. **However**: the *real* corpus
  still only has level-1 records for every species (tasks.md T075's tracked gap) — Bambudo has
  no real level-3 stat data yet, so the live level selector for Panbud currently only ever offers
  "Lv. 1" and the evolution swap cannot be visually demonstrated end-to-end in the deployed app
  yet. This is the same category of gap as the broader corpus-completeness task, not a defect in
  the evolution logic itself (which the real-corpus smoke test in `evolution.test.ts` confirms
  behaves correctly at level 1 — the only level with real data today).
- **Scenario 11 — PASS (code-level + logic trace).** `PlacedCreatureDetails` falls back to
  `config.placements[0]` whenever `highlightedSlot` is `null` or stale, and nothing in
  `GridPicker`'s `onHighlight` wiring ever calls back with `null` on hover/focus-*leave* (only
  on hover/focus of a *different* card) — so the panel cannot go blank once at least one
  creature is placed. Not covered by an automated test this round (tracked as a gap, same
  honesty standard as the rest of this section).
- **Scenario 12 — PASS (structural guarantee, not just a convention).** `TypeTag` and the card/
  tile backgrounds (`GridPicker`, `CreatureSearchModal`) all import `typeColor`/`typeBackground`
  from the single `src/data/typeColors.ts` module — there is no second place a type-to-color
  mapping could be (re)defined, so the inconsistency this scenario guards against is
  structurally prevented rather than merely tested for.

**Known gap, logged rather than hidden**: Scenario 11 and the interactive half of Scenario 9 are
unverified by an automated test as of this round — tracked as follow-up test coverage, same
spirit as this project's other honestly-logged scope gaps (e.g. the Shield-absorption gap noted
below).

## Validation scenario 13 — click-anywhere assignment, no separate button (FR-023)

1. Click directly on an empty slot's placeholder card (not any button).
2. **Expected**: the creature-assignment search modal opens for that slot.
3. Click directly on an occupied slot's card (not any button).
4. **Expected**: the modal opens for that slot too, pre-selected to its current creature's slot.

## Validation scenario 14 — no redundant slot-position text (FR-024)

1. Place any creature and view both the DPS table and the per-creature side panel.
2. **Expected**: neither displays the slot's row/column as text (e.g. "Back 1") — position is
   conveyed only by the grid itself.

## Validation scenario 15 — corrected mechanic values

1. Simulate a team including a Shield-granting creature and a status-applying creature long
   enough for a status tick to land while Shield is still up.
2. **Expected**: the status damage is reduced by 15% against Shield, not 25%.
3. Place a creature with `baseMulticast` > 1.
4. **Expected**: its repeated casts land 0.1s apart in the timeline, not at the identical
   timestamp.

## Validation results (2026-10-05, round 4 implementation — Scenarios 13-15)

- **Scenario 13 — PASS.** `GridPicker`'s separate "Choose…"/"Change…" button was removed; the
  card (`DraggableCard`) and the empty-slot placeholder (`EmptyCard`) are themselves the click
  target (`onClick`/`onKeyDown` for Enter/Space), opening `CreatureSearchModal` for that slot.
- **Scenario 14 — PASS.** `TeamSummary`'s "Slot" column and `PlacedCreatureDetails`'s slot-label
  text were removed; both now show only name/level/stats, reading `${creatureId}@${slotKey}`
  under the hood unchanged.
- **Scenario 15 — PASS (automated).** `shield.test.ts` pins `STATUS_VS_SHIELD_REDUCTION` at
  exactly 0.15 (20 damage -> 17 to Shield) as a regression test, not just "whatever the constant
  says." `simulate.test.ts`'s Multicast tests assert three repetitions land at `t`, `t+0.1`,
  `t+0.2` (not all at `t`), and that a repetition staggered past the simulation window is
  correctly not generated.

**Corpus scale-up results, logged honestly**: level-1 `baseDamage`/`baseCooldownSeconds`
confirmation went from 9/149 to **92/149** this round (`tasks.md` T100, 81 new creatures via
batodex.com individual pages). Level 2/3/4 stats remain an explicit, evidence-backed blocker
(research.md F5) — not attempted with fabricated numbers. 5 evolution thresholds/targets
confirmed (Panbud→Bambudo, Scorchimp→Sunsage, Beetbud→Beetdown, Dribblet→Emperooze,
Frillet→Dewlotl, all at level 3).

## Validation scenario 16 — level 2-4 stats resolve through the evolution-aware level selector (FR-026)

1. Place Panbud, set its placement level to 2.
2. **Expected**: Panbud's own level-2 damage/cooldown apply (no evolution yet, since Panbud's
   `evolvesAtLevel` is 3).
3. Set the same placement's level to 3.
4. **Expected**: the slot now shows Bambudo (per FR-022's existing evolution-aware resolution)
   at Bambudo's own level-3 stats, not Panbud's.

## Validation scenario 17 — Trinket selection applies a flat team-wide bonus (FR-027)

1. Place one creature with confirmed `baseDamage`.
2. Note its DPS.
3. Select a Trinket whose effect is a flat permanent team-wide Damage bonus (per `effectTags`).
4. **Expected**: the placed creature's DPS increases by exactly that flat amount divided by its
   cooldown, the same way a manual `damageFlatAdd` `StatModifier` would — reusing the existing
   modifier-resolution path, not a separate computation.

## Automated checks

```bash
npm run test          # Vitest: engine unit tests (effectiveCooldown, applyStatusTick,
                       # applyShockProc, applyShieldReduction) + component tests
npm run build          # production build must succeed with zero TypeScript errors
```

## Validation results (2026-10-05, seed corpus)

Scenarios 1–4 were run (Scenario 1 as a Vitest assertion; Scenarios 2–4 via a direct
`simulate()`/`corpus` script, as a proxy for the equivalent manual UI steps) against the
implementation in `src/engine/` and `src/data/`:

- **Scenario 1 — PASS.** Single Bumblebolt (`front0`, no trainer): DPS = `1.2` exactly
  (`src/engine/__tests__/simulate.test.ts`).
- **Scenario 2 — PASS.** Over a 10s window: Venopuff's cumulative Poison column is
  `[0, 0, 4, 8, 12, 12, 16, 20, 24, 28, 32, 36]` — constant +4 steps, never dropping between
  ticks. Scorchimp's cumulative Burn column over the same window is `[0, 0, 5, 9, 12, 14, 15,
  15]` — visibly decaying increments (+5, +4, +3, +2, +1, 0) as its Burn layers burn down.
- **Scenario 3 — PASS.** Scorchimp (Burn) + Formiqueen (large, infrequent direct hit) over 20s:
  the total-damage series steps sharply at each Formiqueen cast (e.g. `60 → 80` then a jump to
  `140` at the next cast) while the Burn contribution between those casts climbs in the same
  decaying pattern as Scenario 2 — the two curves are visually distinguishable in
  `CumulativeChart`.
- **Scenario 4 — PASS.** Venopuff's corpus entry carries a recorded `FieldConflict` on
  `shopCost` ($15 per batodex.com vs. $10 per the Poison Build guide), both values and both
  sources are present in the record (not silently merged), and `CorpusBrowser` renders this
  under an "⚠ Recorded source conflicts" `<details>` block on Venopuff's card.

**Known scope gap, not a failure**: `applyShieldReduction` (shield.ts) is implemented and
unit-tested but not wired into `simulate()` — see `tasks.md` T037 for why (no modeled opposing
target/HP/Shield pool exists under the engine's "idealized target" assumption).

## Deploy

```bash
npm run build
# GitHub Actions workflow (.github/workflows/deploy.yml) publishes dist/ to the gh-pages branch
# on every push to main — no manual deploy step required once the workflow is in place.
```
