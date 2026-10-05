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
