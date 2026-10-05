# Research: Batomon Showdown DPS & Status Calculator

**Feature**: [spec.md](./spec.md) | **Date**: 2026-10-05

This document resolves the technical unknowns needed before design (Phase 1). Two kinds of unknowns
are resolved here: (a) implementation technology choices, and (b) the real game mechanics the engine
must reproduce, each grounded in a cited source rather than assumed.

## A. Technology choices

### A1. Test runner for an engine with no DOM dependency
- **Decision**: Vitest.
- **Rationale**: Native to the Vite toolchain already chosen (shares config/transform pipeline,
  no separate babel/webpack test config), runs engine unit tests headlessly with zero DOM, and has
  first-class TypeScript support satisfying Constitution Principle III (test-first engine).
- **Alternatives considered**: Jest (works, but needs an extra ts-jest/babel bridge on top of a
  Vite project — redundant tooling for no real benefit here).

### A2. Charting library for cumulative time-series
- **Decision**: Recharts.
- **Rationale**: React-native composable chart components, good TypeScript types, supports
  multiple overlaid series (one per status-effect type + total damage) on a shared time axis with
  minimal custom SVG work — fits Constitution's "lightweight, typed charting library" requirement
  without hand-rolling a chart renderer.
- **Alternatives considered**: `uPlot` (faster for very large series, but imperative/non-React API
  adds integration glue this project's scale doesn't need); `visx` (lower-level primitives, more
  flexible but more code to reach the same multi-series line chart); plain `<canvas>` (full control,
  but reimplements axis/legend/tooltip work Recharts already provides).

### A3. React state management
- **Decision**: Local component state + React Context for the single shared "team configuration"
  object; no external state library.
- **Rationale**: One editable object (team config) feeding two consumers (summary panel, chart) is
  not complex enough to justify Redux/Zustand/Jotai per Constitution Principle VI (no abstraction
  ahead of actual need).

### A4. UI primitives / styling
- **Decision**: Plain CSS modules (co-located `*.module.css`), no component library dependency.
- **Rationale**: The UI surface (grid picker, summary table, chart, corpus browser) is small and
  bespoke (a 2x3 grid picker is not something a generic component library provides anyway); avoids
  a dependency whose visual language would need overriding immediately.

## B. Game mechanics (grounded in cited sources)

### B1. Cooldown Speed (attack-timing) formula
> `effective cooldown = base cooldown / (1 + cooldownSpeed) + positiveFlatAddedCooldown`, then
> clamp the result to a minimum of 0.1s. Cooldown Speed is entered as a decimal (20% = 0.20).
> Flat additions are applied **after** the speed division, not before.

- **Source**: "How Cooldown Speed works in Batomon Showdown" —
  <https://batomonshowdown.wiki/mechanics/cooldown-speed/> (worked examples cross-checked against
  Build 25037381 · Balance 14). Retrieved 2026-10-05.
- **Worked examples confirmed**: 4.5s base, +20% speed → 3.75s. 4.5s base, +100% speed → 2.25s. 4.5s
  base, +20% speed, +1s flat → 4.75s.
- **Engine implication**: `effectiveCooldown(base, cooldownSpeedTotal, flatAdd) => number`, pure
  function, independently unit-testable against the three worked examples above before any other
  engine code depends on it (Constitution Principle III).

### B2. Status effect timing/decay — Burn, Poison, Shock
> - **Burn**: ticks every 0.5s; tick damage = current Burn layer count; loses 1 layer immediately
>   after each tick (self-decaying).
> - **Poison**: ticks every 1s; tick damage = current Poison layer count; layers do **not**
>   decrease from the act of ticking (persists until removed by another effect).
> - **Shock**: does not tick on a timer at all. Instead, whenever a **direct damage hit** lands on
>   a Shocked target, a *separate* Shock hit resolves **first**, equal to the current Shock layer
>   count, before the direct hit itself. Shock does not naturally decay. Status-damage ticks
>   (Burn/Poison) and Sudden Death damage do **not** re-trigger a Shock hit — only direct damage
>   does. A cast that *applies* new Shock does not boost that same cast's own direct-damage hit
>   (status application happens after damage resolution).

- **Sources**:
  - "Batomon Showdown Status Effects and Debuff Removal" —
    <https://batomonshowdown.wiki/mechanics/status-effects-and-debuff-removal/>. Retrieved
    2026-10-05.
  - "Batomon Showdown Combat Mechanics" — <https://batomonshowdowngame.wiki/guides/combat/>.
    Retrieved 2026-10-05.
  - "Batomon Showdown Shock Builds Guide" — <https://batomonshowdowngame.wiki/guides/shock-build/>.
    Retrieved 2026-10-05.
  - Corroborating, 2026-10-05: a player forum post independently describes the same magnitude —
    "Shock (1 shock is 1 extra damage from normal damage)" — Quarter To Three forums, "Autobattler
    games - sit back and watch it" (post #55 by user Therlun, 2026-05-18),
    <https://forum.quartertothree.com/t/autobattler-games-sit-back-and-watch-it/165263/55>. This
    matches the engine's existing `applyShockProc` (proc damage = current layer count) rather
    than contradicting it; recorded here because the user separately encountered the shorter
    official-ish flavor text "Shock - Takes additional damage when attacked", which states the
    *existence* of bonus damage but not its magnitude — this second source fills that gap.
- **Engine implication**: this is **not** one shared "DOT" shape. Each status type needs its own
  tick/trigger rule:
  - Burn and Poison are modeled as a generic "periodic self-decaying-or-not stack" primitive with
    two parameters (`tickInterval`, `decayPerTick: 0 | 1 layer`).
  - Shock is modeled as a *reactive* modifier on the direct-damage event pipeline, not a timer —
    it needs its own code path, not a reuse of the Burn/Poison timer primitive.
  - This directly justifies Constitution Principle I's engine/data separation: the status-effect
    *type definitions* are data, but each status *behavior* (periodic-decay vs. periodic-no-decay
    vs. hit-reactive) is one of a small closed set of engine strategies the data selects between —
    never an open-ended per-creature script.

### B3. Shield interaction with status damage
> Shield absorbs incoming damage first. Status damage (Burn/Poison ticks, and Shock's triggered
> hit) hitting a Shield is reduced by **25%** before being absorbed, per the current (Hotfix 0.6.1)
> patch value — this was 30% in Patch 0.6.0 and has changed before. Poison no longer bypasses
> Shield (it did, pre-0.6.0).

- **Sources**: same Status Effects / Combat Mechanics pages above, plus "Batomon Showdown Patch
  Notes: Balance & Meta Breakdown" —
  <https://batomon-showdown-wiki.wiki/updates/batomon-showdown-patch-notes>. Retrieved 2026-10-05.
- **Engine implication**: the 25% status-vs-shield reduction MUST be a named, data-tagged constant
  (not a magic number inline), with its `patch` provenance recorded next to it, exactly like a
  corpus record — because this specific value has already changed twice in the game's patch
  history and the engine will need to track which patch it's calibrated against (Constitution
  Principle IV applies to engine constants too, not just creature records).

### B4. Trigger vs. Ongoing vs. On Cast/On Battle Start/On Victory (event model)
> - **Ongoing**: a continuing contribution/aura active for as long as its source is alive and its
>   ability isn't disabled. Not a repeated cast — it's a standing modifier.
> - **Trigger**: requests an *extra full cast sequence*, using the unit's current Multicast count
>   at that moment; critically, the extra sequence **preserves progress on the ordinary cooldown
>   timer rather than resetting it**.
> - **On Cast / On Battle Start / On Victory**: these are event *labels* (when something happens),
>   not effect types themselves — the ability text after the label is what actually happens
>   (which may itself be a Trigger, a stat change, an Ongoing grant, etc.).
> - **Multicast**: causes a cast to resolve as multiple direct-damage hits; relevant to Shock math
>   because each resulting hit is its own direct-damage event (own potential Shock proc).

- **Source**: "Batomon Showdown Triggering: Casts and Event Timing" —
  <https://batomonshowdown.wiki/mechanics/triggering/>; "Batomon Showdown Ongoing Abilities and
  Target Rules" — <https://batomonshowdown.wiki/mechanics/ongoing/>. Both retrieved 2026-10-05.
- **Engine implication**: the Simulation Timeline (per spec's Key Entities) needs at minimum these
  distinct event kinds: `attack` (ordinary cooldown-driven direct hit, possibly multi-hit via
  Multicast), `trigger` (extra cast sequence, does not reset the source's own cooldown), `ongoing`
  (continuous modifier applied/removed on source alive+enabled state change, not a discrete tick
  by itself), and `statusTick` (Burn/Poison). Shock is not a timeline event source at all — it's a
  pure function applied when any `attack`/`trigger`-caused direct-damage event resolves against a
  Shocked target.
- **Explicitly out of scope for this engine (per source's own evidence boundary)**: the exact
  priority/ordering of multiple simultaneous triggers, and exact ability-disable recalculation
  timing — the cited wiki itself states these are unconfirmed. The engine will need a documented,
  explicit tie-breaking rule (e.g. stable sort by board slot order) rather than silently depending
  on object/array iteration order, with that choice recorded as an assumption, not presented as a
  confirmed game rule.

### B5. Board layout and targeting
> The battle board is six slots: two rows of three (back row **A1–A3**, front row **B1–B3**), plus
> a separate four-slot bench that does not fight and does not count for any adjacency/above/behind
> relationship until dragged onto A/B. "Adjacent" means sharing a side (same row, neighboring
> column) — **not** diagonal. "Above"/"behind" are relative to a unit's row and facing direction.
> Both sides in a battle share one aggregate team HP pool each; a unit's own knockout stops it from
> casting but does not end the battle by itself — the battle ends when a side's shared HP pool
> reaches zero (or at Sudden Death, which starts at 30 seconds and deals ramping, repeating damage
> to both pools every 0.5s until one side loses).

- **Sources**: "Batomon Showdown Team Planner Guide" —
  <https://batomonshowdowngame.wiki/tools/team-planner/>; "Batomon Showdown Combat Mechanics" —
  <https://batomonshowdowngame.wiki/guides/combat/>; "Batomon Showdown Controls Guide" —
  <https://batomonshowdowngame.wiki/guides/controls/>. All retrieved 2026-10-05.
- **Engine implication**: confirms the spec's 2x3 grid (FR-005) maps directly to `{row: 'back' |
  'front', col: 0 | 1 | 2}`, matches the constitution's "two rows by three columns" framing, and
  confirms per-spec Assumption ("idealized target" rather than full two-board resolution) is a
  reasonable simplification — a full implementation of the shared-HP-pool, two-sided battle
  resolver is explicitly out of scope per the spec's Assumptions section, not a gap introduced
  during planning.

### B6. Merge/evolution (out of scope for v1 engine, recorded for later)
> Three matching level-1 copies merge into one level-2; two matching level-2 copies merge into one
> level-3. A merge can also grant a trinket.

- **Source**: "Batomon Showdown Abilities Guide: Triggers, Cooldowns & Combat Timing Explained" —
  <https://www.batomon-showdown.wiki/items/batomon-showdown-abilities-guide>. Retrieved 2026-10-05.
- **Engine implication**: the corpus data model should record each creature's **level** as an
  explicit field (a creature's stats differ by level), but the shop/merge *economy* itself is
  outside this feature's scope (the spec's User Stories are about an assembled team's output, not
  about simulating the drafting phase). Each creature record is per-level, not a single
  merge-computed record.

### B7. Elemental/creature types observed across sources
Fire, Water, Electric, Toxic, Flying, Rock, Grass, Bug, Steel (patch-notes label for "Ironcore"),
Dragon, Ghost, and the special "All" typing (seen on Omnichrome). "Fighting" appears in ability text
in creator footage per one source but is explicitly flagged there as unconfirmed by official
publication — it is included in the type union as a tentative member with a `confidence: low` /
citation flagging it as such, per Constitution Principle IV (record disagreement/uncertainty rather
than silently omitting or silently asserting it).

- **Source**: "Batomon Showdown Batodex and Types" —
  <https://batomonshowdown-game.wiki/reference/batodex-and-types/>. Retrieved 2026-10-05.

## D. Round 2 follow-ups (2026-10-05 — user-reported items, planned via `/speckit-plan`)

### D1. Trainer roster completeness
> The full documented 1.2.0 roster is 23 Trainers: Black Belt, Bug Catcher, Burglar, Chef, Chemist,
> Egg Breeder, Gamer, Gentleman, Lucky Girl, Mad Scientist, Masked Man, Monster Ranger, Musician,
> Painter, Redhead, Rich Lady, Scavenger, Shopkeeper, Smuggler, Swim Coach, Treasure Hunter, Twins,
> Youngster. Five of these (Twins, Gentleman, Painter, Burglar, Scavenger, Black Belt) were named
> only in official 1.0.0 patch notes with no official ability text; their ability text below comes
> from secondary wikis' community/observational sourcing, not a primary patch note.

- **Sources**: "Batomon Showdown Trainers – Abilities and Guides" — <https://batomon.net/trainers/>;
  "Batomon Showdown Trainer Tier List — Pantra & Jinto (Patch 1.2.0)" —
  <https://batomonshowdown.org/tier-list/trainer-tier-list/>; "Batomon Showdown Trainers: Every
  Ability and Which to Pick" — <https://batomonshowdown-game.wiki/guide/trainers-and-picks/>;
  "Batomon Showdown Trainer Abilities" — <https://batomonshowdowngame.wiki/players/trainer-guide/>.
  All retrieved 2026-10-05.
- **Recorded conflicts** (must be `FieldConflict`s, not silently resolved, per Constitution
  Principle IV): Chemist's base Poison bonus (+3 per batomon.net vs. +1 per
  batomonshowdown-game.wiki; both agree it increases by +1 more per level-up); Redhead's Burn bonus
  (+3 per batomon.net vs. +2 per batomonshowdown-game.wiki and the official-demo-capture source
  cited in the tier-list page).
- **Engine/data implication**: no type change needed — widen `trainers.ts` from the single
  "Musician" seed to the full 23-entry roster, with the two conflicts above recorded and the five
  named-only trainers' `abilityText` flagged via `unconfirmedFields` (see D-amendment below —
  `unconfirmedFields` is promoted from `CreatureRecord` onto `Provenance` so Trainers can use it
  too).

### D2. Level-scaling (1–4) specifics
> Standard merge path: 3 identical Level-1 copies → 1 Level-2; 2 identical Level-2 copies → 1
> Level-3. Level 3 is the standard ceiling — Level 4 is **not** reachable via ordinary shop/merge
> play; it only comes from rare in-run events (e.g. a "Monster Professor"-style event) or
> consumable level-up items (e.g. "Ultra Candy"). Per-level ability/stat values are published as
> three numbers (L1/L2/L3) where a source gives specifics (e.g. Pyronade Burn 20/40/60; Coalem
> Shield 550/1100/1650); Level 4's jump is reported as large and inconsistent in size across
> creatures (anecdotally ~2x–10x+ over L3) rather than a predictable continuation of the L1→L3
> slope. At least one creature (Sukoi) had its own self-level-up mechanic officially hotfixed from
> a level-4 cap down to a level-3 cap — level caps are **not** uniformly 4 for every creature.

- **Sources**: "Batomon Showdown Level 4, Merging and Shiny Explained" —
  <https://batomonshowdown-game.wiki/guide/levels-merging-and-shiny/>; "Batomon Showdown Guide:
  Meta Builds, Merging & Tips" — <https://batomon-showdown-wiki.wiki/guide/batomon-showdown-guide>;
  "How to Level Up in Batomon Showdown" —
  <https://batomonshowdown.org/guides/how-to-level-up/>; "Batomon Showdown Level 4: The Complete
  Upgrade Guide" — <https://batomon-showdown-wiki.wiki/guide/batomon-showdown-level-4>. All
  retrieved 2026-10-05.
- **Engine/data implication**: confirms B6's existing design intent ("each creature record is
  per-level, not a single merge-computed record") was correct — widen `level` from `1 | 2 | 3` to
  `1 | 2 | 3 | 4`, and never extrapolate/interpolate a Level 4 number from L1–L3 data; each must be
  independently cited per-creature when found. Per-creature level caps below 4 must be recordable
  (not every species defaults to a theoretical max of 4).

### D3. Multicast counts toward output; Trigger does not reset cooldown — both currently unimplemented
> "Battle stats count triggers, not multicast copies" (1.2.0 patch notes) plus "On Cast resolves
> when that creature performs a cast, including each repeated cast in a Multicast sequence" (same
> mechanics guide) together establish: every individual Multicast-sequence hit is its own
> independent direct-damage event (each can proc Shock separately, each contributes its own
> damage); a Trigger-caused extra cast, separately, does **not** reset the triggering creature's
> own ordinary cooldown timer. These are two different mechanics the type vocabulary already has
> (`AbilityTag.kind: "trigger"`, `EffectDescriptor.statChange.stat: "multicast"`) but `simulate.ts`
> implements neither today.

- **Source**: "Batomon Showdown Mechanics – Triggers and Evolutions" —
  <https://batomon.net/guides/mechanics/> (same page already cited in B4; re-confirmed current for
  1.2.0). Retrieved 2026-10-05.
- **Engine implication, this round**: Multicast is now in scope — the user explicitly asked to see
  it alongside damage/status in the per-creature breakdown (item 2). `CreatureRecord` needs a
  `baseMulticast: number` field (default `1`), and Phase A cast generation must fire
  `baseMulticast + multicastAdd modifiers` independent direct-damage events at the same timestamp
  per cooldown completion, each independently Shock-proc-eligible. **Trigger stays out of scope**
  this round — it's a separate, larger mechanic (one creature's ability granting another creature
  an extra cast) that nothing in this round's request depends on; tracked, not silently dropped.

### D4. Chart X-axis consistency (engineering decision — no external research needed)
- **Root cause 1**: `CumulativeChart`'s `<XAxis dataKey="t">` has no explicit `type`, so Recharts
  defaults to a **category** axis — every distinct `cumulativeSeries[].tSeconds` value becomes its
  own evenly-*pixel*-spaced tick, regardless of numeric magnitude, which is why consecutive labels
  (e.g. `4, 4.9, 5.9, 6, 6.9, 8, 8.8, …`) look inconsistent: they ARE inconsistently spaced in
  value, evenly spaced in pixels.
- **Root cause 2**: cast times in `simulate.ts` Phase A are generated by repeated float addition
  (`for (let t = startAt + cooldown; t <= windowSeconds; t += cooldown)`), accumulating IEEE-754
  drift for non-power-of-two cooldowns — surfacing as labels like `14.7000000000000001`.
- **Decision**: `XAxis` becomes `type="number"` with an explicit `domain={[0, windowSeconds]}`, so
  Recharts' own linear-scale "nice tick" generator picks clean, evenly-spaced values (e.g. `0, 5,
  10, 15, 20`) independent of the underlying data points. Separately, fix the float-drift root
  cause by generating cast times via index multiplication (`t = startAt + n * cooldown`, not
  repeated `+=`), and round every `TimelineEvent.tSeconds` to a fixed precision (1e-6s) at the
  point of creation, so no float artifact can leak into a tooltip label either.

### D5. Corpus completeness — measured baseline (user-reported "regression" diagnosed as a data gap)
> As of this round, 144 of 149 creature records (~96.6%) have `baseDamage: null` /
> `baseCooldownSeconds: null` ("unconfirmed", shown as "unknown" in the UI) — only `bumblebolt`,
> `formiqueen`, `scorchimp`, `beetbud`, and `riglet` currently carry confirmed combat stats. This
> is far below spec.md's SC-003 target (≥90% complete).

- **Diagnosis**: the user's report of "DPS table is now 0" and "chart shows no values" for a
  3-creature team (Brawlmantis/Frizzly/Dracana, all back-row) is **not a code regression**. All
  three have `baseDamage: null` in the corpus. Re-running `simulate()` directly against a creature
  with confirmed stats (`scorchimp`, 20s window) still correctly produces a non-zero `perCreatureDps`
  and a populated `cumulativeSeries` — the engine is unaffected by the facilitated-DPS change. The
  two issues coincided only because the user happened to test a data-incomplete team the next time
  they used the app.
- **Engine implication**: none — the engine is correct as-is. **Corpus implication**: this is the
  single largest remaining gap against the spec's own success criteria. It is too large to close
  within this planning round (144 creatures × up to 4 levels each, each number individually cited
  per Constitution Principle IV) and must become a tracked, large, multi-session corpus-research
  task — same pattern as the existing `tasks.md` T043 "full-corpus widening pass" — rather than a
  single task.

## C. Resolved Technical Context (feeds plan.md)

| Field | Resolution |
|---|---|
| Language/Version | TypeScript, latest stable (7.x at time of writing) |
| Primary Dependencies | React 19.x, Recharts |
| Storage | None — static corpus data bundled as TypeScript/JSON modules; no database |
| Testing | Vitest (engine unit tests headless; component tests via `@testing-library/react`) |
| Target Platform | Static web (any modern evergreen browser), deployed to GitHub Pages |
| Project Type | Single-page web application (frontend-only, no backend) |
| Performance Goals | Chart/summary recompute within 1s of a config change (SC-002) on consumer hardware |
| Constraints | Zero backend; fully static bundle; offline-capable once loaded |
| Scale/Scope | On the order of 100–150 creature records + trainers/trinkets/items; single active team of ≤6 creatures simulated at a time |

No `NEEDS CLARIFICATION` markers remain — all Technical Context fields above are resolved.
