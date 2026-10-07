# Implementation Plan: Batomon Showdown DPS & Status Calculator

**Branch**: `001-batomon-dps-calculator` | **Date**: 2026-10-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-batomon-dps-calculator/spec.md`

## Summary

Build a static, client-only TypeScript/React SPA that (1) hosts a cited, versioned corpus of
Batomon Showdown creatures/trainers/trinkets/items, (2) lets a user assemble a ≤6-creature team into
the game's real 2x3 grid with a Trainer, and (3) runs a deterministic, headlessly-testable
simulation engine that reports each creature's DPS and each status effect's per-second value, plus a
chart of cumulative damage/status over a configurable time window — grounded in the real Cooldown
Speed, Burn/Poison/Shock, Shield, and Trigger/Ongoing mechanics researched in research.md.

## Technical Context

**Language/Version**: TypeScript, latest stable (7.x)

**Primary Dependencies**: React 19.x, Recharts, Vite, `@dnd-kit/core` (added round 3,
2026-10-05 — drag-and-drop placement editing, research.md E2.5)

**Storage**: None — static corpus data bundled as TypeScript modules; no database, no backend

**Testing**: Vitest (engine unit tests, headless) + `@testing-library/react` (component tests)

**Target Platform**: Static web, any modern evergreen browser, deployed to GitHub Pages

**Project Type**: Single-page web application (frontend-only)

**Performance Goals**: Recompute + re-render summary/chart within 1s of any team-config change
(spec SC-002), on typical consumer hardware

**Constraints**: Zero backend; fully static bundle; must run with no network access once loaded

**Scale/Scope**: ~100–150 creature records + trainers/trinkets/items; one active ≤6-creature team
simulated at a time; simulation windows on the order of 10–60 simulated seconds

## Constitution Check

*GATE: evaluated before Phase 0 research and re-evaluated after Phase 1 design below.*

| Principle | Compliant? | How |
|---|---|---|
| I. Static-Data, Engine-Driven Architecture | ✅ | `src/data/**` (corpus) / `src/engine/**` (pure `simulate`, `effectiveCooldown`, etc.) / `src/ui/**` are three separate directories; engine contract (contracts/engine-api.md) takes plain data in, plain data out, no React import |
| II. TypeScript Strict Mode | ✅ | `tsconfig.json` strict family enabled from project scaffold; data-model.md defines closed discriminated unions for every enum-like field (`Rarity`, `CreatureType`, `DamageType`, `StatusEffectType`, `AbilityTag`, `TargetSelector`) |
| III. Test-First Engine | ✅ | contracts/engine-api.md calls out exactly which functions need worked-example tests before dependents are written (`effectiveCooldown` against B1's 3 examples first) |
| IV. Cited, Versioned Corpus | ✅ | `Provenance`/`SourceRef`/`FieldConflict` are first-class data-model types every corpus record extends; `STATUS_VS_SHIELD_REDUCTION`-style engine constants also carry provenance per research.md B3 |
| V. Zero-Backend, Static Hosting | ✅ | No API routes, no server directory in the structure below; GitHub Actions → gh-pages |
| VI. Simplicity & Incremental Delivery | ✅ | tasks.md (next command) will sequence a small real slice (one DOT applier, one Shield/support unit, one positional-ability unit) before widening corpus coverage, per spec's own User Story priorities |

No violations — Complexity Tracking table is intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-batomon-dps-calculator/
├── plan.md              # this file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── engine-api.md     # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

```text
batomon_calculator/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
├── .github/
│   └── workflows/
│       └── deploy.yml           # build + publish dist/ to gh-pages on push to main
├── src/
│   ├── main.tsx                  # React entry point
│   ├── App.tsx                   # top-level routing: Calculator view / Corpus Browser view
│   ├── data/                      # Constitution Principle I — data layer, zero engine/UI imports
│   │   ├── types.ts               # data-model.md's shared primitive + corpus types
│   │   ├── creatures.ts           # CreatureRecord[] corpus, cited
│   │   ├── trainers.ts            # TrainerRecord[] corpus, cited
│   │   ├── trinkets.ts            # TrinketRecord[] corpus, cited
│   │   ├── items.ts               # ItemRecord[] corpus, cited
│   │   ├── corpus.ts              # assembles the above into one `Corpus` lookup object
│   │   └── typeColors.ts          # TYPE_COLORS/typeColor() canonical map (round 3, data-model.md)
│   ├── engine/                     # Constitution Principle I — pure, headless, no React import
│   │   ├── cooldown.ts             # effectiveCooldown (research B1)
│   │   ├── status.ts               # applyStatusTick, applyShockProc (research B2/B4)
│   │   ├── shield.ts                # applyShieldReduction + STATUS_VS_SHIELD_REDUCTION (B3)
│   │   ├── grid.ts                  # GridSlot/adjacency helpers (research B5)
│   │   ├── simulate.ts              # top-level simulate() — contracts/engine-api.md
│   │   ├── errors.ts                # InvalidTeamConfigurationError
│   │   └── __tests__/
│   │       ├── cooldown.test.ts     # the 3 worked examples from research B1, written first
│   │       ├── status.test.ts
│   │       ├── shield.test.ts
│   │       └── simulate.test.ts
│   ├── ui/
│   │   ├── GridPicker/              # 2x3 slot assignment UI; round 3 gains @dnd-kit drag/drop
│   │   │                              + a search modal (FR-018) alongside the existing <select>
│   │   ├── TeamSummary/              # DPS + per-status-per-second table (FR-009)
│   │   ├── CumulativeChart/          # Recharts wrapper over SimulationResult.cumulativeSeries
│   │   ├── CorpusBrowser/            # search/filter + conflict display (User Story 3)
│   │   └── shared/
│   └── context/
│       └── TeamConfigContext.tsx     # the one shared editable object (research A3)
└── tests/
    └── setup.ts                      # Vitest + testing-library setup
```

**Structure Decision**: single-project frontend-only layout (no `backend/` directory — Constitution
Principle V forbids one). The three-way `data/` / `engine/` / `ui/` split under one `src/` is the
direct implementation of Constitution Principle I; it is a plain directory convention, not a
monorepo/workspace split, because the project has exactly one deployable artifact.

## Complexity Tracking

*No entries — Constitution Check above has no unjustified violations.*

## Amendment: Round 2 (2026-10-05, via `/speckit-plan`)

User-reported items this round (full Trainer roster + repositioning, per-creature effective-stat
breakdown, chart X-axis consistency, per-level creature stats, and a "DPS went to zero"
regression report later diagnosed as a pre-existing data gap) are resolved in:

- research.md section D (D1–D5): Trainer roster + citations, level-scaling (1–4) mechanics,
  Multicast/Trigger clarification, chart-axis root cause, corpus-completeness baseline + diagnosis.
- data-model.md's matching 2026-10-05 (round 2) amendments: `unconfirmedFields` promoted onto
  `Provenance`; `CreatureRecord.level` widened to `1 | 2 | 3 | 4` + the `(id, level)` lookup bug
  this surfaces in `simulate.ts`; `baseMulticast` added; new `SimulationResult.
  perCreatureEffectiveStats`; Trainer corpus widened (data entry only); chart X-axis fix (no type
  change).
- spec.md: FR-015/016/017 added, FR-001 amended, one new Edge Case, and a new Amendments section
  logging the SC-003 gap honestly and the regression-vs-data-gap diagnosis.

**Technical Context**: unchanged — no new dependencies, no new project type. **Constitution
Check**: re-evaluated, still ✅ across all six principles; the new engine work (Multicast firing,
`perCreatureEffectiveStats` resolution, the `(id, level)` lookup fix) is additional surface for
Principle III (test-first) to apply to when implemented, not an exception to it.

**Not generated by this command** (per `/speckit-plan`'s scope): `tasks.md` is not updated here —
run `/speckit-tasks` next to turn the above into dependency-ordered tasks before implementing.

## Amendment: Round 3 (2026-10-05, via `/speckit-plan`)

User-reported items this round: a trust/provenance question about an external reference site
(batomon.com — confirmed unofficial, research.md E1) and a team-builder UI/UX redesign direction
inspired by that site's layout, explicitly fixing 7 defects found in it. Resolved in:

- research.md section E (E1–E2): the trust investigation, and a defect-by-defect design decision
  for each of the 7 issues (search-modal autofocus/clear, drag-and-drop via `@dnd-kit/core`,
  canonical type-color mapping, evolution-aware leveling, a persistent non-overlapping detail
  side panel) — explicitly preserving this project's own differentiators (StatModifiers, DPS
  output) that the reference site lacks entirely.
- data-model.md's matching 2026-10-05 (round 3) amendments: `CreatureRecord.evolvesAtLevel`
  (paired with the existing `evolvesInto`) + a new `resolveLevelUp()` engine helper; a canonical
  `TYPE_COLORS`/`typeColor()` constant in a new `src/data/typeColors.ts`; drag-and-drop
  move/swap semantics (no `TeamConfiguration` shape change — purely a new UI interaction over
  the existing `setPlacement` mutation); an explicit note that the persistent side panel's
  `highlightedSlot` is transient UI state, not part of `TeamConfiguration`.
- spec.md: FR-018 through FR-022 added, one new Edge Case (branching evolutions — explicitly
  left unresolved rather than guessed), and a new Amendments entry logging both the design
  decisions and the trust-investigation context.

**Technical Context**: gains `@dnd-kit/core` as a new Primary Dependency (Phase 0 technology
decision, research.md E2.5 — chosen over native HTML5 Drag-and-Drop for built-in keyboard/
screen-reader support, and over `react-dnd` for less setup ceremony at this project's scale).
**Constitution Check**: re-evaluated, still ✅ — the new `resolveLevelUp()` engine function is
additional surface for Principle III (test-first) to apply to when implemented; the new
dependency is justified against Principle VI (no abstraction ahead of need) by the project's own
already-open accessibility task (`tasks.md` T054), not added speculatively.

**Not generated by this command**: `tasks.md` is not updated here — run `/speckit-tasks` next.

## Amendment: Round 9 (2026-10-06, via `/speckit-orchestrate`)

Nine atomic work items (ledger: `orchestration/round-2-items.md`). The user asked whether the DPS
measurement is off. **It is**, and this round quantifies it rather than accepting or dismissing the
suspicion.

- **The output table was actively misleading**: `perCreatureDps` counts direct damage only, so an
  all-status team read `0.00` in every row while dealing 136.6 damage/second (FR-072).
- **Every creature on the user's board had an inert ability.** Miasmaw's Poison should be 336, not
  10; Cobrex should fire at **t=9**, not t=15. FR-073/FR-074 add the resolution layer.
- **WI-008 answered**: the 15-second takeoff is Cobrex's *first* cast landing (15 s cooldown, Poison
  300, and Poison never decays) — 84/s at t=15 becomes 400/s at t=16.

**Validation caught three errors in this plan's own first draft**, all recorded in place rather than
quietly fixed:
1. The Cobrex timing was wrong twice — 11 applications instead of 9 (counting the two at t=15), then
   `15 − 11 = 4` instead of solving `t + charges(t) ≥ 15`, which gives **t=9**. T199 is test-first,
   so this would have written the error into the suite as the acceptance criterion.
2. The WI-001 diagnosis (flex shrinkage) was disproved — the container wraps, sprites clip rather
   than scale, and the real cause is round 8's T183 deleting the `<select>` that gave `.grid` its
   intrinsic width. The prescribed fix would have changed nothing.
3. T202 as worded permitted the whole round to land **without a single DPS number changing**, since
   Phase B recomputes from raw creature fields rather than from the resolved record.

**Technical Context**: unchanged in dependencies, but T200b converts Phase A's fixed
`n * cooldown` precomputation into an event-driven scheduler — the largest structural engine change
since the original build, and a prerequisite for any trigger-based ability.

**Constitution Check**: ✅. Principle III governs T199/T200b especially, since the engine suite pins
exact numbers that will legitimately move. **Principle IV honesty applies to the headline figure**:
only 6 of 149 creatures (10 after T201) have structured abilities, and a DPS number reads as
authoritative in a way an empty suggestion list does not — FR-075 requires that ceiling be visible.

## Amendment: Round 8 (2026-10-06, via `/speckit-orchestrate`)

Eighteen atomic work items (ledger: `orchestration/round-1-items.md`), validated across two
subagent passes (`orchestration/round-1-validation.md`).

**The headline finding is about round 7's own work**: adopting a shared primitives layer bought
consistency, not correctness. `CreatureTile` applied its layout class to `TypeSplit`'s host while
the children rendered inside `TypeSplit`'s inner wrapper, so the class governed nothing — and every
call site inherited that one defect identically. `CooldownBlock` had no intrinsic size and rendered
at two heights purely from its parents' layouts. FR-059 generalizes the rule: a primitive whose
appearance is decided by its container is not a primitive.

**Two validation passes caught four of my own errors**, recorded rather than quietly fixed: the
"only one creature has a positional `AbilityTag`" claim was false (Onsetra carries one); T180's
chart-redraw mechanism was not supported by the DOM; "use the shared token" for the picker sprite
was inert, since that token was 48px and read by nothing; and the table-border requirement was
phrased against *weight* when the defect was *colour*, so it was satisfiable by changing nothing.

**FR-014 relocated a third time** — header → browser summary → footer — rather than being dropped
when WI-014 removed the prose. A fourth removal should retire it outright with a rationale.

**FR-069 ships with its blind spot in the UI.** The optimiser's search is exhaustive and correct;
its *inputs* are nearly empty, because only one creature's positional ability is engine-readable and
six trinkets' slot effects are unmodelled. It reports that rather than presenting "no improvement"
as a conclusion.

**Technical Context**: unchanged — no new dependencies. **Constitution Check**: ✅ across all seven
principles; Principle VII is what this round's defects were measured against.

## Amendment: Round 7 (2026-10-06, via `/speckit-plan`)

Twenty user-reported items. Most are bounded presentation fixes; four needed diagnosis and two
change how the project works going forward.

**The four that needed diagnosis:**

- **Click-to-open is dead, and round 4's reasoning for why it worked was wrong.** `<DndContext>` is
  rendered with no `sensors` prop, so the default `PointerSensor` starts a drag on `pointerdown`
  and `preventDefault()`s it — the browser never synthesises the `click` the card's handler is
  waiting for. There is no built-in drag threshold; one must be configured
  (`activationConstraint: { distance: 8 }`). Round 6's test suite missed this because it only
  asserts the *negative* (the clear button must **not** open the picker) and never the positive.
- **The picker's "sliver" is a gradient antialiasing seam.** `linear-gradient(..., A 50%, B 50%,
  ...)` lands mid-device-pixel at fractional widths; `background-clip: border-box` then paints the
  bleed under the transparent border. Fixed by rendering two explicit halves instead of a gradient.
- **Shield's colour is wrong because batodex's palette disagrees with the game.** Round 6 extracted
  the published palette and cross-checked six of seven colours against an in-game card; `shield`
  was the one with no cross-check, and it is the one that is wrong. The game's silver wins.
- **Poison's reported DPS is real damage/second, but it is badly unrepresentative.** The user asked
  where `21.30` comes from and then guessed it was stacks-applied/second — it is not. More
  importantly their underlying argument is correct and is a property of the modelled mechanics:
  `applyStatusTick` decays Burn but explicitly **not** Poison, so Poison's damage rate climbs
  without bound. Measured: final-second damage **293** vs a 20-second average of **65.50**.

**The two that change how the project works:**

- **Constitution amended to 1.1.0** with new **Principle VII (Shared Design Language & DRY UI)**.
  The user asked that this "inform and affect everything in this codebase" and apply to "all future
  requests/changes/tasks" — that is a governance requirement, so it belongs in the file every
  `/speckit-plan` and `/speckit-implement` run already reads, not in a task note that round 8 would
  forget. Motivated by measured duplication (research.md I14): three card treatments, two
  disagreeing cooldown formatters, duplicated modal chrome, chip styling in three files, six
  hard-coded sprite sizes — which surfaced as several *separate* user-reported bugs this round that
  are really one cause.
- **Second-order status metrics** (FR-055/056/057) turn the status table from one averaged number
  into damage/s, stacks applied/s, and damage/s² growth — plus attribution of DOT damage to the
  creature that applied it, so a Poison team stops reporting 0.00 across the board.

Resolved in:

- research.md section I (I1–I14): the four diagnoses above with their evidence, the picker/card
  redesign taken from the user-supplied in-game shop card, the measured duplication census, and a
  straight answer to "why 40px?" (it was arbitrary — with the caveat that 64px is a 1.333×
  non-integer upscale of the 48px source, and 96px would be the crisp 2×).
- data-model.md's 2026-10-06 round-7 amendments: three additive `SimulationResult` fields, the
  timeline-symmetry prerequisite, widened facilitated-damage attribution, and the primitives/token
  contract.
- spec.md: FR-041 through FR-058; FR-014's surface re-scoped (header prose removed, Corpus Browser
  retains it) with the same explicit note round 6 used for FR-030 rather than a silent drop.
- `.specify/memory/constitution.md`: Principle VII, version 1.1.0.
- quickstart.md: validation scenarios 25–31.

**Technical Context**: unchanged — no new runtime dependencies; the primitives layer is ~7 local
components over the existing CSS-modules approach, not a component library.

**Constitution Check**: re-evaluated against all seven principles, including the new one.
- **Principle III (test-first, NON-NEGOTIABLE)** governs every FR-055/056/057 engine change, and
  additionally the click-vs-drag fix gets a *positive* assertion, since the gap that let this bug
  live was a test that only checked a negative.
- **Principle VI (simplicity)** is why the primitives layer is capped at patterns with ≥2 existing
  call sites, and why no component library is introduced.
- **Principle VII** applies to this round's own work retroactively: every surface this round touches
  must come out composed from primitives, not re-styled in place.

**Not generated by this command**: `tasks.md` is not updated here — run `/speckit-tasks` next.

## Amendment: Orchestration round 4 — gameplay-capture findings (2026-10-06)

> **Naming note.** `plan.md`'s amendments are numbered by CHAT round; `orchestration/round-N-*.md`
> is numbered by LEDGER round. They collide — plan.md already has a "Round 5" that is unrelated to
> `orchestration/round-5-items.md`. This entry is named by its ledger round to stop the two
> sequences being read as one. Validation pass 3 flagged the absence of a plan entry for this round
> and noted the collision is what made it easy to miss.

**Ledger**: `orchestration/round-5-items.md` (18 items) ·
**Brief**: `orchestration/engine-handoff-gameplay-capture.md` ·
**Design**: research.md N1-N9, data-model.md "Round 5", spec.md FR-094..FR-106.

### Technical Context

This is the largest architectural change in the project to date, and it is one change, not three:

1. **`StatValue`** — resolved stats become `(base + flatAdd) × multiplier + postMultiplierFlatAdd`
   read through one helper. The handoff calls this "the load-bearing refactor. Findings 1, 3 and 4
   all depend on it existing."
2. **Phase-ordered battle start** — writers before readers, superseding the current "read BASE
   values" rule.
3. **Time-varying resolution** — `resolveEffects` returns initial state plus trigger-keyed
   handlers the event loop invokes.

### Constitution Check

- **Principle VI (no abstraction ahead of need)**: `StatValue` adds structure to a plain number.
  Justified — three separate findings are unimplementable without it, and the capture shows the
  current flat model producing a 39% error on the board's largest Poison application.
- **Principle VII (shared design language / DRY UI)**: WI-018 is a direct Principle VII item. The
  user named it as such: "Another DRY UI component violation."
- **Evidence discipline**: three findings are explicitly NOT implemented this round
  (tie-break order, propagation delay, charge-fire offset) because the capture cannot prove them.
  FR-104 records this as a requirement so a later round cannot quietly implement them.

### Risks carried, not resolved

- The captured board cannot be reproduced end-to-end (research.md N8), so phase ordering is pinned
  on synthetic values rather than Miasmaw's 1080.
- Time-varying resolution carries a **double-application hazard** against the existing
  `buffOnCast` and ally-cast paths, which must be retired or wrapped explicitly.
- Our own `triggerOnAllyCast` violates Finding 7b today.

## Amendment: Round 6 (2026-10-06, via `/speckit-plan`)

User request this round: 13 presentation/interaction items plus one reported bug, with four
in-game screenshots supplied as the layout reference. The headline findings:

- **The reported bug is real and is now root-caused.** Grid position was silently changing Shock
  damage for creatures with no positional ability, because `simulate()`'s tie-break for
  simultaneous casts (`stableSlotIndex`) was also deciding whether a Shock layer applied at time
  *T* empowered another creature's hit at time *T*. Reproduced with the user's exact formations
  (4.10 → 4.30) and isolated to a 2-creature control (2.20 → 2.40). Fixed by resolving every cast
  at a timestamp against a common pre-cast status snapshot, which makes output invariant to slot
  permutation while leaving the timeline's display ordering untouched — research.md H8,
  data-model.md's matching amendment, FR-040, and a regression test that asserts the *invariant*
  rather than either observed number.
- **Everything the presentation items need is already available as data.** The same embedded
  batodex payload round 5 used carries all 149 creature sprites plus 93 trinket sprites (48×48
  PNG, ~0.8 KB each, verified fetchable) and the game's own published colour for every stat and
  rarity — cross-checked against the user's in-game screenshot (damage pink, Poison purple, Burn
  orange all match). So item 8's "color coordinated" and item 12's assets need no invented palette
  and no guessed filenames. Sprites are **vendored**, not hot-linked (Principle V, offline-capable).
- **Two defects this round's investigation found that the user did not report**, both logged in
  spec.md's Amendment rather than quietly fixed or quietly left: round 5's "100% confirmed across
  levels 1-4" claim is **wrong** (`baseDamage` is null in 242/596 records; it was verified by
  counting cooldowns only), and 10 species have a level-1 value contradicting their own level 2-4
  series (round 5 populated levels 2-4 from a newer source but left level 1 on the older one). The
  user's Brimtoad screenshot adjudicates both: it shows "Deal 5 damage" where the corpus says
  `null`, and Burn 1/Poison 1 where the corpus says Burn 5/Poison 5.

Resolved in:

- research.md section H (H1-H10): the transcribed in-game card layout, the extracted colour
  palette with its cross-check, the sprite-vendoring decision and its attribution obligation, the
  trinket-picker reuse decision, the clear-button event-propagation constraint, the grid/density
  decisions, the four distinct Modifiers changes, the full bug reproduction and the three
  alternatives rejected, and the two unrequested data findings.
- data-model.md's 2026-10-06 (round 6) amendments: `spriteFile` on `CreatureRecord`/
  `TrinketRecord` (stored per record, because 4 species' publishing slug differs from their `id`),
  canonical stat/rarity colour maps, the simultaneous-cast snapshot rule and the invariant it
  establishes, and the UI-only restructure contract — including the explicit warning that
  `teamModifiers` must stay in the engine even though its UI affordance is removed, since round 5
  routes trinket effects through it.
- spec.md: FR-028 through FR-040 added; four new Edge Cases; and **SC-004's enforcement surface
  moved rather than dropped** — user item 2 removes citations/conflicts from the corpus browser,
  which was the very thing satisfying SC-004, so the criterion is now met by an automated
  well-formedness test over the corpus data instead of by a disclosure widget. The provenance
  obligation (Principle IV) is unchanged; only its surface moves.
- quickstart.md: validation scenarios 18-24.

**Technical Context**: unchanged — no new runtime dependencies. Sprite vendoring is a one-time
build-input step (`curl` into `public/`), not a runtime fetch. **Constitution Check**:
re-evaluated, still ✅, with two points worth stating rather than assuming:

- **Principle III (test-first, NON-NEGOTIABLE)** applies squarely to the FR-040 fix: the
  permutation-invariance regression test is written and failing before `simulate()` changes.
- **Principle IV (cited corpus)** is the one principle this round touches directly, via FR-030.
  It survives intact because the citation *data* is untouched and gains an automated check; what
  is removed is a rendering of it. Called out explicitly because "user asked to hide the
  citations" is exactly the kind of request that could erode a principle silently.
- **Principle VI (simplicity)** drove reusing the existing `CreatureSearchModal` interaction for
  trinkets and `typeColors.ts`'s existing pattern for the new colour maps, rather than introducing
  a second selection idiom or a styling abstraction.

**Not generated by this command**: `tasks.md` is not updated here — run `/speckit-tasks` next.

## Amendment: Round 5 (2026-10-06, via `/speckit-plan`)

User request this round: full level 2-4 creature stats (previously logged as blocked in round
4) and a Trinket selection feature. Investigating directly (not re-asserting the prior "blocked"
finding) found both are fully achievable: batodex.com embeds its entire creature database
(all 149 ids × 4 levels, by-level ability text, evolution chains) and its entire 93-entry
Trinket database as structured JSON inside each listing page's server-rendered React payload —
invisible to the markdown-converting fetch tool used in round 4, but directly readable via a
raw HTML fetch. Resolved in:

- research.md section G (G1/G2): the extraction technique, verified JSON structure, the
  149/149 and 93/93 id-coverage confirmation, and the resolution of round 4's open "branching
  evolution" question (Ignit→Flarilisk→Basilord is a victory-triggered chain, not a branch).
- data-model.md's matching 2026-10-06 (round 5) amendments: no schema change for creature
  levels (every field already existed from rounds 2-4) — this is a data-population task at
  scale, not a design task. `TrinketRecord` gains `rarity` and `effectTags` (flat team-wide
  stat bonuses only); `simulate()`'s modifier resolution sums `effectTags` from selected
  trinkets alongside the user's manual `teamModifiers`.
- spec.md: FR-026/027 added; the round-4 Edge Case about the level 2-4 "blocker" rewritten to
  instead require investigating raw page content before concluding data is unavailable; a new
  Edge Case for non-level-triggered evolutions (`evolvesInto` without `evolvesAtLevel`); new
  Amendments entry explicitly retracting F5's conclusion (not the act of having logged it).

**Technical Context**: unchanged — no new dependencies; the extraction is a one-time data
pipeline (`curl` + a Node script), not a runtime dependency of the shipped app. **Constitution
Check**: re-evaluated, still ✅ — Principle IV (cited corpus) is strengthened, not weakened, by
retracting an incorrect "unavailable" conclusion once evidence showed otherwise, and the new
`effectTags` field is deliberately narrower than the full creature `AbilityTag` shape
(Principle VI, no abstraction ahead of actual need — trinkets have no positional targeting to
encode).

**Not generated by this command**: `tasks.md` is not updated here — run `/speckit-tasks` next.

## Amendment: Round 4 (2026-10-05, via `/speckit-plan`)

User-reported items + a user-supplied in-game stat reference this round: two patch-driven
mechanic corrections (`STATUS_VS_SHIELD_REDUCTION` 25%->15%, Multicast staggered 0.1s apart
rather than simultaneous), two new corpus-data-only stats (Heal, Sell Value), two UI cleanups
(click-anywhere assignment, dropping redundant slot-position labels), and a corpus-scale-up
request that split into one achievable task (level-1 damage/cooldown for all remaining
creatures) and one **blocked** task (level 2/3/4 stats — no available source exposes them
outside a live JS UI, confirmed by direct fetch, research.md F5). Resolved in:

- research.md section F (F1–F6): both mechanic corrections with corroborating 1.2.0-era
  sources; Heal/Sell Value as corpus-only data; the two UI decisions; the level-2/3/4 blocker
  evidence; the level-1 scale-up scoping.
- data-model.md's matching 2026-10-05 (round 4) amendments: `STATUS_VS_SHIELD_REDUCTION`
  provenance update; the Multicast stagger fix (no type change); `healAmount`/`sellValue` added
  to `CreatureRecord`; the two UI changes (no type change).
- spec.md: FR-023/024/025 added, one new Edge Case (the level-2/3/4 blocker), new Amendments
  entry.

**Technical Context**: unchanged — no new dependencies. **Constitution Check**: re-evaluated,
still ✅ — the level-2/3/4 blocker is a direct application of Principle IV (never fabricate
corpus data), not an exception to it.

**Not generated by this command**: `tasks.md` is not updated here — run `/speckit-tasks` next.

## Amendment: Orchestration round 6 (2026-10-07)

Ledger: `specs/001-batomon-dps-calculator/orchestration/round-6-items.md` (WI-001..WI-003).
Research: research.md Q1 (the 9-species provenance split) and Q2 (the output-line census).

### Technical Context

No new dependency, no engine change, no data-schema change. All three items are presentation,
and two of the three are the same defect in different places: a surface that was built before the
primitives layer existed and never migrated onto it (Constitution Principle VII, "retroactive and
forward-binding").

- **WI-001 + WI-002 — `AffectedCreaturePicker`.** It is the last picker still hand-rolling its own
  result list: `.pickerList` / `.pickerItem` / `.pickerSearch` / `.pickerName` / `.pickerMeta` /
  `.pickerEmpty` in `TrainerCard.module.css`, a single-column `<ul>` of up to 149 rows. The trinket
  picker's shape is the one to reuse, and it is already assembled from shared parts: `Modal` +
  `FilterBar` + `PickerSection` + `CardGrid`(`OVERLAY_COLUMNS` = 3) + `PickerCard` + `SpriteTile` +
  `TextField` + `EmptyNote`. Reusing it answers WI-001 directly, and its **Selected section** is what
  answers WI-002: the 9 affected species become a 3x3 block of filled and empty slots — the same
  "render the empty cells too, so position and count are structural" idea the Modifiers overlay uses
  for the board's six slots — above a 3-column browse grid of candidates in rarity sections.
- **WI-003 — `BatomonCard`'s output band.** `StatLines` renders one line per output stat in a flex
  column. At 6-7 lines it grows past the height the fixed-height card reserves (FR-043), and since the
  card is `overflow: hidden` the ability text and the meta band are pushed out of view — the reported
  "loses structure". The fix is a second column inside the band, not a taller band. Both the base band
  and the Calculator's "Effective this battle" band render through the same `StatLines`, so one change
  covers both, and the Corpus Browser's narrower card gets it too.

### Decisions

1. **One cap constant.** `MAX_AFFECTED_SPECIES = 9` replaces `TARGET_SIZE`, is enforced for both
   Painter and Smuggler, and is the single place to change if Smuggler's unsourced 9 is ever
   disproved (research.md Q1). Enforcement is "a tenth selection is refused and says why", never
   silently dropping a selection the user made.
2. **The rarity shape stays guidance.** Round 4's reasoning holds: its source says "typically". The
   count is enforced; the shape is not. These are different claims with different evidence.
3. **Two columns by GRID, not by CSS multi-column.** `columns: 2` was the first choice and is wrong:
   `.statLines` is `display: flex; flex-direction: column`, and multi-column does not apply to a flex
   container, so a class carrying only `columns`/`column-gap` is inert — caught in validation pass 3.
   The mechanism is a column-flow grid instead: `display: grid; grid-auto-flow: column;
   grid-template-rows: repeat(var(--stat-rows), auto)`, with `--stat-rows` set to `ceil(n / 2)` by
   `StatLines`. This is better than multicol on three counts beyond merely working: it keeps the
   existing `gap` token (a multicol box would ignore the flex `gap` and need its own gutter), it fills
   the first column before the second **by construction** rather than by trusting the browser's
   balancer — which is the order the ask specifies, "col 1: Deal 15 damage, Poison 3, shock 3. col 2:
   shield 4, heal 15, multicast x3" — and a third column is arithmetically unreachable, since n items
   over ceil(n/2) rows is at most 2 columns. It is also assertable in jsdom, which does no layout: the
   row count is an inline custom property, so a test can check 7 lines produce 4 rows.
4. **The threshold is 4 lines, derived rather than chosen.** 3 is the published maximum across all 596
   records (research.md Q2), so 4 is the first count that only modifiers, trinkets, abilities or manual
   triggers can produce — the first count the band was never sized for. 1-3 lines keep the single
   column they have today, so no existing card changes shape.
5. **Heights are measured in a browser, not estimated**, the way the trinket card's height and the
   trainer card's footer were. Note which reservation is being measured: `.cardFixedBrowser` reserves
   `.output { min-height: 4.5rem }` while `.cardFixedPanel` reserves only a whole-card 29rem, its
   `.output` reservation having been commented out — so "the band's reserved height" is one real number
   and one absent one, and the absent one is part of why the panel variant breaks first.
6. **The 7-line case is only reachable on the panel variant in the running app.** The Corpus Browser
   renders `BatomonCard` with no `modifiers` prop, so its cards top out at the published 3. The browser
   variant is therefore checked at 3 and the 7-line case on the Calculator's panel plus a render test —
   stated so that "verify both variants at 7 lines" is not left as an impossible instruction.

### Constitution Check

| Principle | Status |
| --- | --- |
| I. Static data / engine / UI separation | **Pass.** UI-only; no engine or data module is touched. |
| II. TypeScript strict | **Pass.** No new `any`; the cap is a typed constant. |
| III. Test-first for the engine | **N/A.** No mechanic changes. UI tripwires are added instead, per the project's established pattern for presentation items. |
| IV. Cited, versioned corpus | **Pass, with a recorded gap.** No record changes. Smuggler's 9 is marked as this project's assumption rather than a citation (research.md Q1). |
| V. Zero-backend | **Pass.** |
| VI. Simplicity | **Pass.** WI-001/002 delete a bespoke list in favour of components that already exist; WI-003 adds one CSS rule and one threshold. |
| VII. Shared design language & DRY UI | **This round's point.** WI-001 is the violation; the round removes the last hand-rolled picker list. |

### Risks

- **The affected-species picker has no automated coverage today.** Migrating it with none would be
  unverifiable, so tasks add the tripwires at the same time: cap enforcement, Smuggler's
  opposite-region pool (FR-088), and user-chosen-never-generated (FR-090).
- **A 3x3 selected block plus a 3-column browse grid of 149 cards is a tall overlay.** The trinket
  picker's 93 cards already scroll in `Modal`'s body, so this is the same shape at a larger count;
  the search field and rarity sections are what keep it navigable.

## Amendment: Orchestration round 7 (2026-10-07)

Ledger: `specs/001-batomon-dps-calculator/orchestration/round-7-items.md` (WI-001..WI-007).
Research: research.md R1-R7.

### Technical Context

No new dependency. One new data-layer module (the vocabulary registry), one new derivation module,
one new tokeniser; no engine algorithm changes and no change to any stored corpus value.

The round's framing matters more than any individual item. The ask reads as four "make it an enum"
refactors plus two features, but **all four vocabularies are already closed string-literal unions**
and Constitution Principle II already mandates that (research.md R1). Taken literally the first four
items are no-ops. What the user is actually pointing at is the *consequences* of a literal union
being erased at runtime — hand-written value arrays that drift, no label distinct from the stored
key, and per-member data scattered across parallel `Record` maps. This repo has already shipped two
user-visible defects from exactly that cause: three rarity arrays with inconsistent ordering (T172)
and the `"Super Rare"`/`"SuperRare"` key mismatch that dropped a chip (Q3). So the round is scoped
to fix the cause, and WI-006 and WI-002 fall out of it almost for free.

- **WI-001/003/005 — one construct, three vocabularies.** A frozen const object per vocabulary with
  one descriptor per member, the union derived from its keys (research.md R2). Not TypeScript's
  `enum`, which would churn 596 records, cannot be expressed in the cited
  `batodex-monsters.json` fixture at all, and would still need the side-tables that are the mess.
- **WI-002 — derive tags from ability text, via a rule table.** 424 of 596 records (106 of 149
  species) have published ability text and zero tags; Ninflora is the median case, not an oversight.
  The round delivers (a) the rule-table mechanism, so adding a shape or family is one declarative row
  rather than N per-creature edits — the structural reading of the ask; (b) the **`manualTrigger`
  family across its full `TargetSelector` range**, which R4 measures at 60 untagged records, of which
  only 10 match the three shapes that were hand-tagged first; and (c) **one further family chosen by
  census** (T297), so the table is proven extensible rather than asserted to be.
  `manualTrigger` is first because it sits **outside** `RESOLVED_TAG_KINDS`, so widening it cannot
  inflate the engine-coverage claim. A second family that *is* inside it may legitimately move that
  figure — see decision 12.
- **WI-004 — answer, then split the answer by cost.** `damageType` is both redundant on the record
  (596/596 correlated with `baseDamage`, measured) and one type serving two unrelated roles. The
  vocabulary split lands this round; the `publishedCast` value object is proposed and deferred with
  an invariant test pinning the correlation meanwhile (R3).
- **WI-006 — label, not data.** The registry's `label` field carries "Super Rare" while the key
  stays `SuperRare`, so the **138** stored occurrences (124 in `creatures.ts`, 14 in `trinkets.ts`;
  measured, correcting the ledger's "~100 plus 15") are untouched. The cited
  `batodex-monsters.json` fixture turns out to contain **no `"SuperRare"` at all** — it stores rarity as
  `{ label, color }`, i.e. **the published source already uses this round's registry shape** (R2a), which
  is both independent evidence for "Super Rare" being the published spelling and the strongest argument
  that the registry is the data's own shape rather than a TypeScript idiom.
- **WI-007 — a pure tokeniser plus a thin renderer.** Keyword vocabulary lives beside `STAT_COLORS`
  so the ability text and the stat badges cannot drift to different reds (Principle VII).

### Decisions

1. **The registry is one shared helper, not five bespoke objects.** `defineVocabulary` +
   `VocabularyKey<T>` in `src/data/vocabulary.ts`, used by all five. Five hand-rolled shapes would
   be the same duplication this round exists to remove, one level up.
2. **Stored keys never change, for any of the five vocabularies.** This is the decision that makes
   the round cheap and safe: no corpus record is edited, `batodex-monsters.json` stays byte-identical
   to its cited source (Principle IV), and build codes keep round-tripping. Everything the user asked
   for is reachable through `label`, `order` and the derived value list.
3. **`label` is the only thing the UI may render.** Enforced by a test that scans rendered output for
   the raw key, because the failure mode here is silent: `"SuperRare"` reaching a heading looks like a
   styling slip, not a bug. Three existing tests assert the raw spelling and flip to "Super Rare"
   (`presentation.test.tsx:102`, `AffectedCreaturePicker.test.tsx:55` and `:62`) — those flips are
   the evidence WI-006 landed.
4. **Ordering comes from `order`, and the existing arrays derive from it.** `RARITIES_DESC` /
   `RARITIES_ASC` keep their names and call sites but stop being hand-written lists. Same for the
   trigger list in `triggers.test.ts`, which becomes unable to miss a new union member — the drift its
   own guard was written to catch.
5. **`"All"` is separated from the element types.** It is a wildcard that `creatureHasType` treats as
   "matches everything", carried by exactly one species, and comparing it as if it were an element is
   what caused round 10's Omnichrome bug. The registry marks members with a `kind`
   (`element` | `wildcard` | `placeholder`), and `creatureHasType` tests `kind === "wildcard"` instead
   of the literal `"All"` — in one place, rather than the four production sites that hardcode the
   string today.
   **Only the wildcard is withheld from filter lists.** `"Curio"` (11 level-1 species) and `"NULL"` (4)
   are marked `placeholder` for provenance but **stay filterable**, because `types.ts:26-31` cites two
   independent sources treating both as real published Type values; excluding them would make 15
   species unreachable by type filter, a regression no ledger item asked for. (Validation pass 1 caught
   an earlier version of this decision excluding all three.)
   **Typeless stays representable** — 8 records (the two egg species) have an empty `types` array, and
   that is a real state, not a gap to fill (R7.2).
6. **The derivation reads TEXT, with the trigger as corroboration.** 134 records have ability text and
   no `abilityTrigger` at all (R4), so keying on the trigger would miss a quarter of the corpus. The
   trigger, when present, must *agree* with what the text implies; a disagreement is a test failure,
   not a silent preference for one field.
7. **Hand-authored tags beat derived tags on the same creature.** Required escape hatch: Petrirex,
   Fumungus and the Link Cable class of ability will never be read correctly from prose, and round 6's
   two disjointness guards must keep holding.
8. **Derive at corpus-construction time, snapshot the result.** Not a codegen script —
   `scripts/tag-shiny-abilities.mjs` is the precedent for that and carries the staleness flaw
   (correct only as of the last manual run). Runtime derivation cannot drift from its text; a
   per-species snapshot test recovers the reviewability that codegen's git diff would have given.
9. **WI-004(b) is deferred, not dropped, and pinned while deferred.** The `publishedCast` value object
   reaches `ModifiableBase`, `PerCastOutput`, `perCreatureEffectiveStats` and ~15 engine fixtures.
   Attempting it alongside WI-002 would be the largest-blast-radius change of the round landing beside
   the most behavioural one. The invariant test makes the deferral safe rather than merely stated.
10. **The keyword vocabulary exceeds `STAT_COLORS`, in two tiers.** 225 of 543 ability texts contain
    none of the seven stat keys. Of those, **only 52 contain Protect / HP / Trigger / Ongoing** — a
    figure validation pass 1 had to correct, because the first draft of this round asserted all 225 did
    and scoped itself on that. The remaining 173 carry *mechanic* nouns instead: `level` (36),
    `Evolve`/`Evolves` (35/19), `Knockout` (32), `Trinket` (24), `Charge` (12), `day` (12). So tier 1 is
    the stat terms and tier 2 is mechanic nouns, coloured distinctly because "Evolves at level 3" names
    a mechanic rather than an output stat. An ask that says "all mon's ability text" is not met by
    colouring 318 of 543 cards, and whatever the final figure is, it is reported (T298) rather than
    implied.
11. **`StatusEffectType` is registered too, and kept separate from `DamageChannel`.** They overlap on
    three of four members and are still different vocabularies: `"Direct"` is a channel and never a
    status, `"Shield"` is a status and never a channel because it absorbs damage rather than dealing it.
    Related by a derived `damageChannelOf(status)` mapping, following `STATUS_COLOR_KEY`'s precedent.
    Merging them would let the compiler accept `applyShieldReduction(n, "Shield", s)` (R3a). WI-004's
    ledger note required this relationship be addressed; the first draft omitted it.
12. **A second family may move the coverage figure; the first may not.** `manualTrigger` is outside
    `RESOLVED_TAG_KINDS`, so deriving it must leave the UI's "N abilities not yet modelled" line
    unchanged (FR-114, asserted by T289). If T297's census selects a family that **is** resolved, the
    figure rises and that is correct — the engine really does compute those abilities. The dishonesty
    FR-075 guards against is a count moving without the engine computing anything, not a count moving.

### Constitution Check

| Principle | Status |
| --- | --- |
| I. Static data / engine / UI separation | **Pass.** The registry, the derivation and the tokeniser are all `src/data/**`. `recipientsOfPress` already established that selector resolution stays in `src/engine/**`; nothing moves the other way. |
| II. TypeScript strict, closed unions | **This round's point.** The unions survive unchanged — they are now *derived* from the registry rather than hand-written beside their metadata. No `any`, no new suppression. |
| III. Test-first for the engine | **Partially applicable, and honoured where it is.** No mechanic changes. WI-002 does change what the engine receives, so Ninflora's derived tag gets a failing test first; the `damageType` invariant (R3) is likewise a test written before the deferral it protects. |
| IV. Cited, versioned corpus | **Pass, and improved.** No stored value changes, so every `sourceRefs`/`patch` stays accurate and the cited batodex fixture stays byte-identical. WI-006 *restores* the published "Super Rare" spelling this corpus had compressed (R5). |
| V. Zero-backend | **Pass.** |
| VI. Simplicity & incremental delivery | **The binding constraint, twice.** It is why WI-002 derives two families rather than all seventeen (deriving 424 records at once would be a generic rule engine built ahead of the evidence, which this principle names explicitly) and why WI-004(b) is deferred. The rule table itself clears the "at least two concrete cases" bar with five target shapes inside the first family alone (R4). Each deferral is recorded as outstanding with a measured figure rather than left implied. |
| VII. Shared design language & DRY UI | **Pass.** WI-007's colours come from the existing `STAT_COLORS` layer rather than a second palette; the highlighter is one shared component, so the card, the panel and any future surface cannot disagree. |

### Complexity Tracking

One deviation worth naming: `defineVocabulary` is an abstraction introduced for **five** concrete
call sites that need it, which clears Principle VI's "at least two" bar. It is deliberately the
smallest thing that works — a typed identity function plus a key type — and carries no plugin
registry, no inheritance and no runtime validation beyond `Object.freeze`.

### Risks

- **WI-002 is the only item that changes behaviour the user can see, and it changes it for 149
  species at once.** A derivation that over-matches would hand creatures buttons they should not have,
  which is worse than Ninflora having none. Mitigation: hand-authored tags win, the derived set is
  snapshot-tested per species, and round 6's two disjointness guards remain the gate.
- **The trigger/text agreement check (decision 6) may fail on existing records.** 134 records have no
  trigger and some embed it in prose ("Ongoing: the ally behind..."). If the check finds genuine
  disagreements they are corpus findings needing citation, not test failures to suppress — and that
  could enlarge the round. Tasks must treat a disagreement census as its own step before enforcing.
- **WI-007 touches every card in the app.** The band's reserved height (FR-043) is sized to a measured
  169-character worst case and no text grows, but inline elements can still change line-breaking;
  this needs checking in a browser, not only in jsdom, which does no layout.
