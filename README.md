# Batomon Showdown DPS & Status Calculator

A static, client-only calculator for [Batomon Showdown](https://batomonshowdown.wiki/) (an
asynchronous PvP autobattler, released 2026-09-15). Assemble a team into the game's 2×3 grid and
see each creature's DPS, each status effect's per-second value, and a chart of cumulative
damage/status over a configurable time window — because effects like Burn, Poison, and Shock
behave very differently over time (Burn and Shock decay/trigger differently; Poison stacks
without decaying).

This project was built with [spec-driven development](https://github.com/github/spec-kit)
(MIT-licensed `spec-kit`, installed via `specify-cli`). The full spec, research notes, data
model, API contract, and task breakdown live under
[`specs/001-batomon-dps-calculator/`](./specs/001-batomon-dps-calculator/), and the project's
non-negotiable engineering principles live in
[`.specify/memory/constitution.md`](./.specify/memory/constitution.md).

## Stack

- **React 19** + **TypeScript** (`strict`, `noImplicitAny`, `noUncheckedIndexedAccess` all on —
  no `any` escape hatches, no bare-string enums for closed game-mechanic vocabularies)
- **Vite 8** for dev/build, **Vitest** for the test-first simulation engine
- **Recharts** for the cumulative time-series chart
- Zero backend — pure static SPA, deployed to **GitHub Pages** via GitHub Actions

## Local development

```bash
npm install
npm run dev      # Vite dev server
npm run test     # Vitest — engine + corpus unit tests
npm run build    # tsc -b (strict typecheck) && vite build
npm run lint      # oxlint
```

See [`specs/001-batomon-dps-calculator/quickstart.md`](./specs/001-batomon-dps-calculator/quickstart.md)
for the manual validation scenarios (and their recorded results) that exercise each user story
end-to-end.

## Corpus & provenance

All game data (creatures, trainers, trinkets, items) lives in `src/data/*.ts`, typed per
[`data-model.md`](./specs/001-batomon-dps-calculator/data-model.md). Batomon Showdown's own
documentation is fragmented across multiple fan wikis that sometimes disagree, so **every
record carries a `Provenance`** (`sourceRefs` with URL/title/retrieval date, and the game
`patch` the figures are believed to apply to), and any inter-source disagreement is recorded as
an explicit `FieldConflict` (both values, both sources, and an optional `resolution` note)
rather than silently picked. The Corpus Browser view surfaces these conflicts directly instead
of hiding them.

**Current status**: the corpus is a deliberately small *seed slice* — just enough creatures to
exercise every status-effect mechanic the engine implements (Shock, Burn, Poison, Shield,
positional Ongoing auras), per the project's "simplicity first, widen incrementally" principle.
Widening it to the full community dex is tracked as open tasks `T043`–`T046` in
[`tasks.md`](./specs/001-batomon-dps-calculator/tasks.md) — **not** yet done.

### Refreshing the corpus for a new game patch

1. For each changed entity, find the relevant fan wiki page(s) and record the new value(s) with
   a `SourceRef` (`url`, `title`, `retrievedAt`).
2. If multiple sources disagree, add a `FieldConflict` entry rather than overwriting — pick a
   `resolution` only if you have a clear reason to prefer one source, and say why.
3. Update the record's `patch` field to the new patch identifier.
4. Update the "Corpus snapshot" label shown in the app header (`src/App.tsx`,
   `CORPUS_PATCH_LABEL`).
5. Re-run `npm run test` — engine tests pin exact numeric expectations (e.g. Bumblebolt's DPS)
   against today's seed values, so a real balance change should make the relevant test fail
   until you update its expected numbers too.

## Known scope gaps (intentionally deferred, not bugs)

- **Shield absorption isn't wired into the simulation output.** `applyShieldReduction` is
  implemented and unit-tested (`src/engine/shield.ts`), but the engine only ever models the
  *user's team's own outgoing damage* against one implicit "idealized target" (see spec.md's
  Assumptions) — there's no modeled opposing HP/Shield pool for it to reduce yet. See `tasks.md`
  T037.
- **Corpus breadth.** Only 6 creatures and 1 trainer are seeded today; trinkets/items are empty
  stubs. See `tasks.md` T043–T046.
- **No GitHub repo has been created/pushed yet** for this project (`tasks.md` T055) — do that
  before expecting the `deploy.yml` GitHub Actions workflow to run.

## Deploying

Pushing to `main` on a GitHub repo with this workflow in place runs
[`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml): install, test, build, then
publish `dist/` via `actions/upload-pages-artifact` + `actions/deploy-pages`. No manual deploy
step is needed once GitHub Pages is enabled for the repo (Settings → Pages → Source: GitHub
Actions).
