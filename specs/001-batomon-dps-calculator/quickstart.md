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
