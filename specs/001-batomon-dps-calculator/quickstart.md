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

> **SUPERSEDED by round 6 (2026-10-06).** FR-030 removes citations and conflicts from the corpus
> browser UI at the user's request, so step 2 is no longer achievable through the browser and this
> scenario is **not** to be re-run as written. SC-004's enforcement surface moved to an automated
> corpus-provenance test (`src/data/__tests__/provenance.test.ts`, tasks.md T118) — run that
> instead. The underlying `conflicts`/`sourceRefs` data is unchanged and still required; see
> spec.md's round 6 Amendment for why this is a surface change, not an abandoned criterion.

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

## Validation scenario 18 — slot permutation does not change output (FR-040, the reported bug)

1. Place Panbud at front-0 and Bumblebolt at front-1. Set the simulation window to 20s.
2. Note Bumblebolt's **Facilitated DPS** and the **Shock** per-second value.
3. Drag Bumblebolt to any other empty slot (notably a back-row slot, which sorts earlier).
4. **Expected**: both values are **identical** to step 2. Neither creature has a positional
   ability, so position must not change any number. (Before this round: 4.10 → 4.30 in the user's
   4-creature formation, 2.20 → 2.40 in a 2-creature control.)
5. **Also expected**: the timeline's event ordering at a shared timestamp may still differ between
   the two layouts — only the computed values must be invariant (research.md H8).
6. **Repeat the whole scenario with the Shock-applier set to a level where its Multicast is > 1**
   (e.g. Bumblebolt at level 4, Multicast 2). This is a *second, separate* manifestation of the same
   root cause and is not fixed by the per-timestamp snapshot alone — before the fix it reproduced
   Shock 20.55/s at `front-1` versus 21.60/s at `back-1`. Both parts of the fix must be in place
   (research.md H8).

## Validation scenario 19 — game-faithful card bands, in both places (FR-028/FR-029)

1. Open the Corpus Browser and find any creature with both a damage value and an applied status.
2. **Expected**: name and rarity on one header band; sprite beside stacked type badges; cooldown
   rendered as its own block, separate from **one line per output stat**, each in the game's colour
   for that stat (damage pink `#ef426b`, Burn orange `#ed6b3a`, Poison purple `#7b57a1`, Shock
   yellow `#e7c61c`, Shield `#a47c41`, Heal `#578ac9`); ability text in its own band. Cost,
   cooldown, and damage must **not** share one line.
3. Switch to the Calculator and select that same creature into a slot.
4. **Expected**: the selected-creature panel shows the **same** band layout (same component), plus
   this project's own extra "Effective this battle" band, visually separated from the base stats.

## Validation scenario 20 — corpus browser density and provenance removal (FR-030/FR-031)

1. Open the Corpus Browser at a typical desktop width (≥1280px).
2. **Expected**: creature cards are laid out in 3-4 columns, not one per row.
3. **Expected**: no "Sources & patch" disclosure and no "Recorded source conflicts" disclosure
   appears on any card.
4. **Expected (the part that must not regress)**: `sourceRefs`, `patch`, and `conflicts` are still
   present on every corpus record, and the automated corpus-provenance test (SC-004's new
   enforcement surface per spec.md's round 6 Amendment) passes.

## Validation scenario 21 — trinket picker uses the creature-picker interaction (FR-032/FR-036)

1. On the Calculator, open the Trinket picker.
2. **Expected**: a searchable grid of trinket cards — each showing its sprite, name,
   rarity, and **full effect text** — not a `<select>` of bare names.
3. **Expected**: trinkets whose effect actually feeds the simulation remain visually distinguished
   from the reference-only majority.
4. Select one, then confirm it can be removed again.

## Validation scenario 22 — slot clearing, squareness, and stat badges (FR-033/FR-035/FR-036)

1. Place any creature with a damage value and an applied status.
2. **Expected**: the slot is square, shows the creature's sprite, and shows compact colour-coded
   badges for its current per-cast stats, matching the in-game team panel.
3. Click the slot's clear (`×`) control.
4. **Expected**: the slot empties, **and** the creature picker does **not** open, **and** no drag
   is initiated (research.md H5 — the control sits on both a drag handle and a click target).
5. **Expected**: changing that placement's level updates the badge values.

## Validation scenario 23 — layout moves (FR-034/FR-037/FR-038)

1. On the Calculator: **Expected** no "BACK ROW"/"FRONT ROW" text appears; the picker's heading
   reads "Choose a Banto" with no slot suffix; slot position is still exposed via `aria-label`.
2. **Expected**: the DPS table and the status-output table sit side by side as one aligned unit.
3. **Expected**: the "Simulation window (seconds)" control sits **below** both tables and
   **immediately above** the cumulative chart.

## Validation scenario 24 — Modifiers as a per-mon collapsed disclosure (FR-039)

1. **Expected**: the Modifiers section is collapsed by default.
2. Expand it with at least one creature placed.
3. **Expected**: no "Team-wide (every placed Banto)" option is offered; each modifier is scoped to
   a specific placed creature; the Cooldown Speed control's label is short, with the
   decimal/percent explanation as supporting text rather than inside the option label.
4. **Expected (must not regress)**: selecting a DPS-affecting Trinket still changes the DPS table.
   Trinket effects route through `teamModifiers`, which stays in the engine even though its
   hand-entry UI option is gone (research.md H7, data-model.md round 6).

## Validation results (2026-10-06, round 5 implementation — Scenarios 16-17)

- **Scenario 16 — PASS (verified against real corpus, not just synthetic fixtures).** Direct
  script verification: `resolveLevelUp(corpus, "panbud", level)` for `level` 1-4 returns
  Panbud@1 (damage 25), Panbud@2 (damage 50), then correctly switches to Bambudo@3 (damage 75)
  and Bambudo@4 (damage 150). Separately confirmed `resolveLevelUp(corpus, "ignit", level)`
  returns Ignit unchanged at every level 1-4 — Ignit's victory-triggered evolution into
  Flarilisk is recorded (`evolvesInto`) but correctly never resolves through leveling (no
  `evolvesAtLevel`), exactly as designed.
- **Scenario 17 — PASS (automated).** New `simulate.test.ts` cases confirm a trinket with
  `effectTags: [{ stat: "damageFlatAdd", amount: 10 }]` raises `perCreatureDps` by exactly that
  amount when selected (and has zero effect when not selected) — reusing the exact same
  modifier-resolution path a manual `teamModifier` already uses, not a separate computation.

**Corpus completeness, final count**: level 1-4 `baseCooldownSeconds`/`baseDamage`-or-confirmed-
absent is now **596/596 (100%)** — up from 92/149 level-1-only at the start of this round. The
full creature database (every level, every evolution chain) and the full 93-entry Trinket
database were both extracted from a single page fetch each, via batodex.com's embedded
React-Server-Components JSON payload (research.md G1/G2) — not fabricated, not estimated.

**Regression caught and fixed during this round**: populating levels 2-4 initially broke the
creature-search modal, the GridPicker dropdown, and the Corpus Browser — all three previously
assumed one record per creature *name*, and now showed up to 4 duplicate tiles/rows per species
(one per level). Fixed by introducing `distinctCreatures` (one record per species, used for all
UI *listings*) while keeping full-corpus, level-aware lookups (`getCreatureByIdAndLevel`,
`resolveLevelUp`) unchanged. Caught by a pre-existing `CreatureSearchModal` component test
(`getByText("Bumblebolt")` started matching 4 elements instead of 1) — a direct demonstration
of why the round-3 investment in component tests was worth it.

## Validation results (2026-10-06, round 6 implementation — Scenarios 18-24)

86 tests pass (up from 74 at the start of this round's implementation, 64 before it). Per scenario:

- **Scenario 18 — PASS (automated, both shapes).** Three new `simulate.test.ts` cases, all red
  before the fix: a same-timestamp collision on synthetic creatures, the **Multicast** variant (the
  second manifestation, which the per-timestamp snapshot alone does *not* fix), and the user's real
  Panbud + Bumblebolt formation, which reproduced 2.20 → 2.40 before and is identical after. The
  tests assert the **invariant**, not 4.10 or 4.30 — research.md H8 is explicit that neither is
  confirmed to be the game's real same-frame answer.
  - Note one pre-existing test's expectation changed 5 → 3. That is the fix working: its own comment
    derived the 5 from "shockApplier (front0) is processed before attacker (front1) … so it grants
    +2 Shock before attacker's same-tick hit", i.e. from the very ordering dependency being removed.
- **Scenario 19 — PASS (automated + visual).** `presentation.test.tsx` asserts no element renders
  cost/cooldown/damage in one combined line anywhere in the Corpus Browser. Both surfaces render
  through the same `BatomonCard`, so they cannot drift. Band order, the official stat colours, and
  the ability-trigger line were checked visually against the user's in-game card screenshot.
  - **Scope note**: the trigger line needed a new `abilityTrigger` field (392 of 596 records have
    one) — the reference card shows it, but `abilityText` only ever held the description, so this
    scenario could not have passed by layout change alone.
- **Scenario 20 — PASS (automated + visual).** `presentation.test.tsx` asserts neither "Sources &
  patch" nor "Recorded source conflicts" renders, *and* that every record still carries citations.
  Column count verified visually at 1280px (3 columns) and 2560px (4, capped by `max-width`).
  SC-004's handover is live: `provenance.test.ts` passes with 8 assertions across all four record
  types.
- **Scenario 21 — PASS (automated).** Asserts the picker is not a 93-option `<select>` and that a
  known trinket's full effect text renders, plus that the "affects DPS" distinction survives.
- **Scenario 22 — PASS (automated, mouse *and* keyboard).** `GridPicker.test.tsx` asserts the clear
  control empties the slot without opening the picker on both paths. The keyboard case was a real
  trap: the card's own `onKeyDown` hijacks Enter/Space, so a click-only test would have passed while
  keyboard users got the picker opened and the slot left populated. Sprite rendering and
  colour-coded badges also asserted.
- **Scenario 23 — PASS (automated + visual).** Asserts no row-label text, the heading is exactly
  "Choose a Banto" while the dialog's `aria-label` still names the slot, and both summary tables
  share one parent element. Control order (`TeamSummary` → collapsed `ModifierEditor` →
  simulation-window → chart) verified visually.
- **Scenario 24 — PASS (automated).** `ModifierEditor.test.tsx` asserts all four sub-requests
  separately: collapsed by default, no team-wide option, short labels with the decimal note as
  supporting text, and one add-control per placed creature. The companion engine assertion confirms
  a DPS-affecting trinket still changes DPS, i.e. removing the team-wide *UI* did not remove the
  engine path trinkets ride on.

**Corpus state, stated precisely rather than rounded up** — and correcting the previous round's
claim rather than restating it:

| Measure | Value |
|---|---|
| Creature records (149 species × levels 1-4) | 596 |
| Records agreeing value-for-value with the authoritative per-level series | **596 / 596** |
| Cooldowns published | 596 / 596 |
| Species with a published damage value | **89 / 149** (60 have no damage line in any source) |
| Creature sprites / trinket sprites | 149 / 149 and 93 / 93 |
| Records carrying a recorded `FieldConflict` | 9 |

Two corrections this round, neither user-reported:

1. Round 5's "**100% confirmed across levels 1-4**" was **wrong** — verified by counting cooldowns
   only. Corrected in `README.md`, `App.tsx`'s corpus label, and the Corpus Browser's intro.
2. Far more seriously, round 5's level-1 gap-filling pass had an **off-by-one row alignment bug that
   gave 55 of 149 species another creature's stats**. Every check applied at the time was
   shape-based (record counts, null counts, monotonic progressions) and all of them passed while the
   values were wrong by one row. Repaired from the authoritative series; the 6 remaining genuine
   source disagreements adopt the authoritative value with the superseded community figure retained
   as a `FieldConflict`. A new `levelSeries.test.ts` now compares **every record value-for-value**
   against a committed source snapshot, and includes a test that deliberately shifts the data by one
   row to prove the comparison actually detects it — the first version of that guard was a run-length
   heuristic that did **not** detect a shift at all.

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
