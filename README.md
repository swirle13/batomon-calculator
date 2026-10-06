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

**Current status (round 5, 2026-10-06)**: `src/data/creatures.ts` covers all **149 named
Batomon**, each with **complete, cited level 1-4 stats** — 596 `CreatureRecord` entries total
(149 species × 4 levels), **100% confirmed** `baseCooldownSeconds`/`baseDamage`-or-confirmed-
absent/`damageType`. Round 4's "level 2-4 is a hard blocker" finding was **retracted** in round
5: batodex.com's listing pages embed their entire database (every creature, every level, every
evolution chain, by-level ability text) as structured JSON for client-side hydration — invisible
to a markdown-converting fetch tool, but directly readable from the raw page content. One page
fetch yielded the complete dataset; see `specs/001-batomon-dps-calculator/research.md` section G
for the full technical writeup. 11 species have a confirmed evolution target (5 level-triggered
— e.g. Panbud→Bambudo, Scorchimp→Sunsage, both at level 3 — plus 6 victory/condition-triggered,
e.g. Ignit→Flarilisk on victory, which `evolvesInto` records but `evolvesAtLevel` deliberately
does not, since leveling can't trigger them). Trainers cover the full documented **23-Trainer
roster** (`T070`, round 2); **Trinkets now cover the full 93-entry roster** (`T109`, round 5),
with 6 trinkets' flat team-wide stat bonuses wired into the DPS simulation — Items are still an
empty seed stub (`T046`, not yet done).

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
- **Items are still an empty seed stub.** Trinkets were completed in round 5 (`tasks.md` T109);
  Items have not been — see `tasks.md` T046.
- **Only 6 of 93 Trinkets' effects are wired into the DPS simulation.** The rest are real,
  cited, browsable shop/economy effects (free purchases, gift-rarity boosts, per-day/per-
  trinket-count scaling, type- or position-conditional bonuses) that don't fit this engine's
  deliberately narrow "flat, unconditional, team-wide bonus" trinket-effect model
  (data-model.md's round-5 `TrinketRecord.effectTags` amendment) — same treatment as most
  Trainer abilities.
- **Branching/non-level-triggered evolutions are recorded but not resolved by leveling.** A
  species like Ignit (`evolvesInto: "flarilisk"`, no `evolvesAtLevel`) correctly never evolves
  through the level selector, since its real trigger is "On Victory" — `resolveLevelUp()` has
  no way to know a battle was won. This is accurate (it correctly does nothing) but incomplete
  (it can't ever show the evolved form either) — see research.md G1.
- **StatModifiers are a manual, honest-effort tool, not a simulated economy.** They let you
  describe the net effect of a previous round's carry-over bonus, but the engine never derives
  them from actual match history (there is no multi-round match model at all).
- **Evolution-aware leveling (`resolveLevelUp`) can't be demonstrated live yet.** The mechanism
  is implemented and unit-tested (`src/engine/evolution.ts`), and Panbud→Bambudo / Scorchimp→
  Sunsage / Beetbud→Beetdown are cited at level 3 — but the real corpus only has level-1 stat
  records for every species (same gap as above), so the live level selector can't yet offer a
  level that actually triggers a resolved evolution. See `tasks.md` T075.
- **Drag-and-drop is pointer-only; the search modal has no full focus trap.** Both are tracked
  under the still-open accessibility pass (`tasks.md` T054/T091) — the plain `<select>` fallback
  remains fully keyboard-operable as the accessible path for rearranging placements.
- **No GitHub repo has been created/pushed yet** for this project (`tasks.md` T055) — do that
  before expecting the `deploy.yml` GitHub Actions workflow to run.

## Deploying

Pushing to `main` on a GitHub repo with this workflow in place runs
[`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml): install, test, build, then
publish `dist/` via `actions/upload-pages-artifact` + `actions/deploy-pages`. No manual deploy
step is needed once GitHub Pages is enabled for the repo (Settings → Pages → Source: GitHub
Actions).
