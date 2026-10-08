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

## Corpus

All game data (creatures, trainers, trinkets, items) lives in `src/data/*.ts`, typed per
[`data-model.md`](./specs/001-batomon-dps-calculator/data-model.md). Batomon Showdown's own
documentation is fragmented across multiple fan wikis that sometimes disagree; where this project
had to adjudicate a disagreement, the reasoning is written up in
[`research.md`](./specs/001-batomon-dps-calculator/research.md) rather than carried on the records
themselves. Per-record citation fields (`sourceRefs`, `patch`, `conflicts`, `unconfirmedFields`)
were removed once nothing in the app or the engine read them.

**Current status (round 6, 2026-10-06)**: `src/data/creatures.ts` covers all **149 named Batomon**
across levels 1-4 — **596 `CreatureRecord` entries**, every one now verified value-for-value
against the authoritative per-level series by an automated test
(`src/data/__tests__/levelSeries.test.ts`). Precisely:

- **Cooldowns**: complete for all 596 records.
- **Damage**: published for **89 of 149 species**; the other 60 have no damage line in any source
  reviewed. Those record `baseDamage: null` and render as *no damage line* rather than a misleading
  `0` — but note `null` here means "not published by our sources", **not** "confirmed to deal no
  damage". A user-supplied in-game screenshot shows Brimtoad dealing 5 damage where every source we
  have omits it, so that conflation is a real, open gap (research.md H9), not a closed question.
- **Sprites**: all 149 creatures and all 93 trinkets, vendored locally (see Assets below).
- **Evolutions**: 11 species have a confirmed target — 5 level-triggered (e.g. Panbud→Bambudo,
  Scorchimp→Sunsage, both at level 3) and 6 victory/condition-triggered (e.g. Ignit→Flarilisk on
  victory), which `evolvesInto` records but `evolvesAtLevel` deliberately does not, since levelling
  cannot trigger them.
- **Trainers**: the full documented 23-Trainer roster (`T070`, round 2). **Trinkets**: the full
  93-entry roster (`T109`, round 5), 6 of which have flat team-wide bonuses wired into the
  simulation. **Items**: still an empty seed stub (`T046`, not yet done).

> **Correction to the previous release's claim.** Rounds 5's status note, this README, and the
> in-app corpus label all said the corpus was "100% confirmed across levels 1-4". That was wrong:
> it had been verified by counting cooldowns only. Worse, round 6 found that round 5's level-1
> gap-filling pass had an **off-by-one row alignment bug that gave 55 of 149 species another
> creature's stats** entirely — invisible to every shape-based check applied at the time (record
> counts, null counts, monotonic progressions all passed). All 55 are repaired from the
> authoritative series, 6 further genuine source disagreements are recorded as `FieldConflict`s
> rather than overwritten, and a value-for-value regression test now guards against a recurrence.
> Full writeup: `specs/001-batomon-dps-calculator/research.md` section H11.

Round 4's "level 2-4 is a hard blocker" finding was **retracted** in round 5: batodex.com's listing
pages embed their entire database (every creature, every level, every evolution chain, by-level
ability text) as structured JSON for client-side hydration — invisible to a markdown-converting
fetch tool, but directly readable from raw page content. See research.md section G.

### Assets

Creature and trinket sprites are **vendored** into `public/sprites/` rather than hot-linked, so the
app stays self-contained and offline-capable once loaded (Constitution Principle V) and no user's
browsing is leaked to a third-party host. They are the **game's own artwork**, obtained via the
batodex.com fan dex (2026-10-06) and redistributed here for a non-commercial fan calculator; they
remain the property of the game's authors, not of this project or of batodex. Re-fetch or refresh
them with `node scripts/vendor-sprites.mjs`.

### Refreshing the corpus for a new game patch

1. For each changed entity, find the relevant fan wiki page(s) and update the value(s). If
   multiple sources disagree, write the adjudication up in `research.md` and pick a value.
2. Update the "Corpus snapshot" label, which lives in the **Corpus Browser's** summary line
   (`src/ui/CorpusBrowser/CorpusBrowser.tsx`, `CORPUS_PATCH_LABEL`). It used to sit in the app
   header on every view; round 7 moved it here when the header prose was removed (FR-050), and
   FR-014 was narrowed to "stated somewhere discoverable" rather than dropped.
3. Re-run `npm run test` — engine tests pin exact numeric expectations (e.g. Bumblebolt's DPS)
   against today's seed values, so a real balance change should make the relevant test fail
   until you update its expected numbers too.

## Known scope gaps (intentionally deferred, not bugs)

- **Shield absorption isn't wired into the simulation output.** `applyShieldReduction` is
  implemented and unit-tested (`src/engine/shield.ts`), but the engine only ever models the
  *user's team's own outgoing damage* against one implicit "idealized target" (see spec.md's
  Assumptions) — there's no modeled opposing HP/Shield pool for it to reduce yet. See `tasks.md`
  T037.
- **The placement suggester is limited by corpus coverage, not by its search.** It evaluates every
  arrangement of your placed Batomon (at most 720) against a time-weighted damage score, but the
  engine can only *act on* one kind of positional ability: `cooldownSpeedModifier` with an
  `adjacent`/`allAllies` target. In practice that means **one creature in the whole corpus**
  (Formiqueen). Onsetra carries a `behind` tag — "the ally behind applies its Ongoing abilities 1
  additional time" — that is recorded, correctly typed, and read by nothing. Six trinkets have
  slot-scoped effects with no `abilityTags` at all, and one of them (Link Cable, "all of your team's
  monsters are now considered adjacent") would invalidate the single interaction that *is* visible.
  So "no improvement found" usually means "the effects that would make position matter aren't
  modelled yet". The UI says so rather than implying your layout is optimal.
- **Creature abilities are only modelled where they carry structured tags.** Round 9 added an
  effect-resolution layer (`src/engine/effects.ts`) and an event-driven scheduler, so on-battle-start
  grants and charge mechanics now actually affect the simulation — Miasmaw resolves to Poison 336
  instead of 10, and Cobrex fires at t=9.1 instead of t=15, which changed one real team's measured
  output from 136.6 to 1155.7 damage/second. **But only 10 of 149 level-1 creatures carry any
  `abilityTags`**; the rest have their abilities recorded as prose only and remain inert. The UI
  states the covered count beside the DPS figure rather than letting a working engine imply full
  coverage. Two known non-coverages: Fumungus ("damage equal to the Poison stacks on the enemy")
  needs a modelled target this engine does not have, and Drumire's cumulative per-cast
  Cooldown-Speed grant is tagged but not yet applied.
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
