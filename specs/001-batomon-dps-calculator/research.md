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

> **Ticking statuses are ONE POOL on the target, not one instance per application
> (2026-10-06).** Found by stepping through a recorded turn-1 run against the engine.
>
> Each application used to carry its own tick clock, so a single Venopuff (3.5s cooldown, Poison 4)
> produced two interleaved cadences — ticks at 4.5, 5.5, 6.5, 7.5 **and** 8.0, 8.5, 9.0. In the
> game its second cast at t=7.0 instead grows the existing stack to 8, and the very next tick at
> 7.5 deals 8: cumulative **20**, where the per-instance model gave 16 and then wrongly ticked again
> at 8.0.
>
> This is what B2 above already said — tick damage is the *"current Poison layer count"*, singular,
> meaning the target's stack rather than any one application's. The engine simply did not implement
> it that way. A later application **adds to the stack without resetting the cadence**; the cadence
> starts when the pool goes from empty to non-empty and stops when it empties.
>
> Consequence for attribution (FR-056): one pool fed by several creatures splits each tick's damage
> in proportion to what each contributed, exactly as Shock procs already do. Burn's shed layer is
> taken proportionally from every contributor, since nothing decides whose layer burned off first.

> **Burn's per-tick damage was queried and is CONFIRMED (2026-10-06).** An alternative model was
> proposed from a control test — one tick deals 1 damage and consumes 1 stack, so N burn deals N
> total — and then withdrawn after watching the damage numbers in-game: *"the tick does the damage
> of the present value of the burn stack (4), it ticks down by one the next 0.5s and then does 3
> damage, then 2, then 1."*
>
> Recorded because the two models differ by N(N+1)/2 against N — for a 170-stack burn, 14,535 damage
> versus 170 — so this is worth not re-litigating. The sequence is now pinned end-to-end in
> `statusStacks.test.ts`, not just per-tick, so both the amounts and their timing are locked.
>
> Timing, also confirmed: the first tick lands **0.5s after** application, not on it. Stacks exist
> from the instant of the cast, which is why the stack chart reads 4 at t=4.5 while cumulative burn
> damage is still 0.

### B2a. Tick cadence and intra-instant order — settled by a frame-by-frame recording

**Evidence**: Venopuff + Magmite + shiny Dribblet against a 300 HP enemy, hand-recorded as 28
consecutive events with the enemy's health after each. Because the health column is cumulative, it
constrains every tick's *amount* and every tick's *time* at once — a model wrong about any one of
them diverges and never recovers. The engine now reproduces all 28 rows and the 8-point overkill;
pinned in `statusStacks.test.ts`.

#### 1. Ticks run on a GLOBAL clock anchored to battle start

Poison ticks on whole seconds, Burn on half-seconds, whenever anything is on the target. The clock
is **not** anchored to when a status was applied.

| | Venopuff casts Poison at | first tick |
|---|---|---|
| observed | 3.5 | **4.0** |
| application-anchored (wrong) | 3.5 | 4.5 |

A status applied exactly on a grid line waits for the next one: Magmite applies Burn at 4.5 and the
first burn tick is 5.0, not 4.5.

#### 2. A tick sharing a cast's instant uses the PRE-cast stack

Venopuff's casts at 7.0, 14.0 and 21.0 each land on a tick instant, and those ticks deal **4, 12 and
20** — the stack as it stood before the cast, every time. This is FR-040's snapshot rule.

> **Retraction.** An earlier pass inverted this, concluding from a reported 4-point shortfall that
> applications must resolve before a coincident tick. The shortfall was real but the diagnosis was
> not: the cause was the cadence in (1), and the analysis assumed ticks at 4.5/5.5/… — a cadence
> that does not exist. With the clock corrected, snapshot ordering reproduces the run exactly. The
> lesson is that two wrong models can agree on a symptom.

#### 3. Order within one instant

| # | | evidence |
|---|---|---|
| 1 | ticks due at this instant resolve, reading the stack as it stands | observed (2) |
| 2 | casts resolve: direct damage, then status application | B2; a cast's Shock does not boost its own hit |
| 3 | reactive effects (charges, ally-cast hooks, on-cast buffs) | FR-040 |

**Still unsettled**: ordering between two *different* appliers within one instant. Every case
observed so far has a single applier per status.

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

> [!IMPORTANT]
> **CORRECTION, 2026-10-08 (user-reported).** The parenthetical above — "(same row, neighboring
> column)" — is **wrong**, and it contradicts the clause it is glossing. The board is a grid, so
> adjacency is the four **cardinal** directions: left, right, **above and below**. A1 and B1 share
> a side exactly as A1 and A2 do. Diagonals remain excluded, so the rest of the sentence stands.
>
> This mattered: `isAdjacent` was written against the parenthetical rather than the clause, and
> returned `false` for every cross-row pair. That halved the reach of **every** adjacency effect in
> the corpus — Formiqueen's cooldown aura, Petrirex's and Rattleghast's knockouts, Noxnimbus's
> Poison grant, and every `adjacent` `TargetSelector`. It survived 460 tests because none of them
> paired two slots in different rows; `engine/__tests__/grid.test.ts` now asserts the full 6×6
> matrix so a missing *direction* cannot hide again.
>
> The quoted block is left intact rather than edited, because it is a transcription and the
> correction is to our reading of it, not to the source.
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

## E. Round 3 follow-ups (2026-10-05 — reference-site UI inspiration, planned via `/speckit-plan`)

### E1. Trust/provenance investigation: is batomon.com official?
> **No.** `batomon.com` is an independent community-built companion site, not affiliated with
> the game's developer/publisher. Confirmed via four independent angles:

- **WHOIS**: `batomon.com` was registered 2026-07-23 (~2.5 months before this investigation)
  through Cloudflare, Inc., with registrant identity privacy-redacted (Cloudflare's own privacy
  proxy), billing address in Brazil (state SP). This is a personal/indie registration pattern,
  not a corporate game-studio domain record — there is no organization name on file at all.
- **TLS certificate**: issued by Google Trust Services (`WE1`), a generic auto-issued cert
  (`DNS:batomon.com, DNS:*.batomon.com`, no Extended/Organization Validation) — issuable by
  anyone who controls the domain; neutral evidence, doesn't indicate official status either way.
- **Hosting**: DNS resolves to Cloudflare anycast IPs via Cloudflare nameservers
  (`chad.ns.cloudflare.com`, `laila.ns.cloudflare.com`); HTTP response headers show a Next.js app
  (`_next/static/chunks/...`) served through Cloudflare's edge (`server: cloudflare`,
  `cf-ray`) — a standard indie-dev stack (Cloudflare Pages/Workers + Next.js), not a
  publisher-grade CDN contract that would itself imply anything about affiliation.
- **The site's own self-disclosure** (strongest signal): the page header reads "COMMUNITY META
  COMPANION" directly under the logo, and its own FAQ states outright: *"Batomon.com is not the
  game developer. Batomon.com is an independent community site... Only the game developer
  announces official ports and release dates. Follow the official Steam page and official
  Discord announcements."* — <https://batomon.com/faq>, retrieved 2026-10-05.
- **Developer of record**: Batomon Showdown's actual developer and publisher, per its Steam
  store page, is **berrymint** — <https://store.steampowered.com/app/4557380/Batomon_Showdown/>,
  retrieved 2026-10-05. No evidence connects berrymint to batomon.com's registration or operation.

**Conclusion**: batomon.com is in the same category as this project — a fan-built companion tool
over the same community-sourced data (it even cites the identical "Balance 24 / Steam build
25600878" patch label we already use) — not an authority to defer to uncritically, but a
legitimate *additional* citable source for corpus research (it has its own per-creature wiki
pages, e.g. `batomon.com/batomon/<slug>`), on the same footing as batodex.com/batomon.net/the
various `batomonshowdow(n)*.wiki` sites already cited elsewhere in this document. The "AI
generated" feel is very plausibly accurate (Next.js + generic Cloudflare hosting + a brand-new
domain is a common AI-assisted-indie-site fingerprint) but is not itself evidence of malice —
same caveat already applied to every other fan source cited throughout this document.

### E2. UI/UX direction: adopt the reference site's team-builder layout concept, fix 7 defects
The user wants this project's *layout concept* (icon-based creature cards in the grid,
type-colored card backgrounds, a modal creature search per slot, level/Shiny controls per
placement, a hover detail panel) without visually cloning batomon.com's Build Lab, and wants our
own differentiators (StatModifiers, DPS/damage numbers — batomon.com's Build Lab has **none** of
either) preserved and foregrounded, not lost in the redesign. The user also identified 7 concrete
defects in the reference implementation to deliberately avoid:

1. **Search modal doesn't autofocus or clear on reopen** — opening the picker for a *different*
   slot keeps the previous slot's typed query, so the first thing visible is a stale, over-
   filtered result list, and the user must manually click into the field to type at all.
   **Decision**: the search input must both clear its value AND receive keyboard focus every
   time the modal opens for any slot (not just the first time) — a standard modal-UX fix, no new
   dependency.
2. **No manual/custom stat values** — this is already this project's `StatModifier` system
   (data-model.md's "Manual carry-over StatModifiers" amendment); nothing new needed here beyond
   making sure the redesigned layout keeps the Modifiers section easy to find, not buried.
3. **No DPS/damage display at all** — this project's entire reason to exist; the redesign must
   keep `TeamSummary`/`CumulativeChart` prominent, not drop them for the sake of matching the
   reference's visual density.
4. **Type tag chips aren't color-coded the same way card backgrounds are** (user's screenshot 3):
   the reference's per-creature detail card colors the sprite backdrop by type but renders the
   "bug"/"fighting" pill chips below the name as plain uncolored outlines — two different
   treatments for the same piece of information. **Decision**: define one canonical
   `CreatureType -> color` mapping (data-model.md amendment below) and reuse it literally
   everywhere a type is rendered as a color — card background, tag chip, and any future type
   filter control — so this class of inconsistency can't recur.
5. **No drag-and-drop between slots** — only a modal-based "click a slot, pick from a list" flow.
   **Decision**: add drag-and-drop as an *additional* interaction, not a replacement — the
   existing modal/dropdown-driven assignment must stay fully functional for keyboard/
   screen-reader users (accessibility parity, Constitution-aligned with the still-open `tasks.md`
   T054 accessibility pass). Library choice:
   - **Decision**: `@dnd-kit/core`.
   - **Rationale**: built-in keyboard support (arrow-key dragging) and screen-reader
     announcements out of the box, unlike the native HTML5 Drag-and-Drop API (which is
     keyboard-inaccessible by default and has inconsistent touch/mobile support without extra
     polyfill work) — directly relevant since this project already has an open accessibility
     task. Actively maintained, fully typed, and scoped exactly to "pick up/drop one item,"
     with no sortable-list machinery this project doesn't need (a fixed 6-slot grid, not a
     reorderable list).
   - **Alternatives considered**: native HTML5 DnD (zero dependency, but the accessibility and
     mobile gaps above are a direct regression against this project's own stated goals);
     `react-dnd` (older, requires choosing + wiring a separate backend, more ceremony for the
     same end result); `@dnd-kit/sortable` (unnecessary — that's for reorderable lists, not a
     fixed grid of named slots).
6. **Level selector doesn't offer a species' post-evolution levels** (user's examples: Scorchimp
   → Sunsage, Panbud → Bambudo, both "at level 3"): the reference's level dropdown for a
   creature that evolves at level 3 has no level-3/4 option at all, instead of switching the slot
   to the evolved species. Confirmed both of the user's examples, plus a related evolutions
   reference not yet cited elsewhere in this project:
   - Panbud → Bambudo at level 3 — <https://batodex.com/monsters/panbud> ("Evolves into Bambudo
     at Lv 3") and <https://batomon.com/batomon/panbud> ("Evolves into Bambudo at level 3"), both
     retrieved 2026-10-05. (Scorchimp → Sunsage at level 3 was already confirmed and present in
     this project's corpus — `src/data/creatures.ts`'s `evolvesInto: "sunsage"`.)
   - "Batomon Showdown Evolutions Reference" — <https://batoforge.com/evolutions>, retrieved
     2026-10-05 — lists 13 evolutions across 11 base Batomon for the current build; corroborates
     Panbud→Bambudo, Scorchimp→Sunsage, and the already-cited Beetbud→Beetdown, but the scraped
     table lost its trigger-condition column alignment for several pairs (notably Ignit, which
     this source appears to list against *two* different targets — Basilord and Flarilisk — and
     Sproutquill, listed against both Fernfowl and Quillustrous). **Left unresolved, not
     guessed**: a branching evolution (more than one documented target) needs its own trigger
     condition confirmed from a source with intact table structure before encoding either branch
     — recorded as a research gap, not arbitrarily picked.
   - **Engine/data implication**: `CreatureRecord` needs a level threshold paired with
     `evolvesInto` (`evolvesAtLevel`, see data-model.md amendment) so the UI can resolve "the
     user picked level 3 for a Panbud placement" into "show Bambudo at level 3" by lookup, not by
     hiding the option. Actually populating this for creatures beyond Panbud/Scorchimp/Beetbud is
     corpus-research work in the same spirit as `tasks.md` T075, not a one-shot fix.
7. **Hover detail card isn't a persistent side panel** — it appears anchored to whichever card is
   currently hovered, disappears when the pointer leaves, and visually covers lower-row cards
   when a card near the top of the grid is hovered (z-index/anchoring bug). **Decision**: the
   detail view becomes a single, layout-reserved side panel (not an overlay) driven by a
   `highlightedSlot` piece of *transient UI state* — updates on hover/focus of a new card, never
   clears on hover/focus-out, defaults to the first placed creature (or an empty state) rather
   than nothing. This is explicitly UI-only state, not part of `TeamConfiguration` — see
   data-model.md's note on keeping it out of the persisted team-config shape.

## F. Round 4 follow-ups (2026-10-05 — mechanic corrections, new stats, UI cleanup, corpus scale-up)

### F1. Shield-vs-status reduction: patch supersession, 25% -> 15%

> The 25% figure this project cited (research.md B3, Hotfix 0.6.1) has been superseded by an
> August 2026 balance pass: status damage (Burn, Poison, and the triggered Shock hit) hitting a
> Shield is now reduced by **15%** before absorption, not 25%. This is a patch update, not a
> source disagreement — multiple independent 1.2.0-era guides agree on 15% and explicitly flag
> 25% as the older value.

- **Sources**: "Batomon Showdown Combat Mechanics" —
  <https://batomonshowdowngame.wiki/guides/combat/> ("status damage against Shield is reduced
  (15 percent in the August 2026 notes, down from 25)"); "Batomon Showdown Shock Builds Guide"
  — <https://batomonshowdowngame.wiki/guides/shock-build/>; "Batomon Showdown Burn Builds Guide"
  — <https://batomonshowdowngame.wiki/guides/burn-build/>. All retrieved 2026-10-05, corroborating
  the value the user supplied directly from their own in-game stats reference.
- **Engine implication**: update `STATUS_VS_SHIELD_REDUCTION` from `0.25` to `0.15` and its
  `Provenance` to cite the August 2026 patch, keeping the historical 30%/25% lineage in a comment
  rather than deleting it (this value has now changed three times — Constitution Principle IV's
  reasoning for keeping it a named, cited constant instead of an inline number applies even more
  now).

### F2. Multicast: fires 0.1s apart, not simultaneously — corrects round-2's implementation

> Each Multicast repetition is a distinct, separately-timed cast: "Multicast 3" means 3 total
> casts, the first immediate, the second 0.1s later, the third 0.1s after that — not 3
> simultaneous hits at one timestamp. Every repetition is still its own full cast (own direct
> hit, own Shock-proc eligibility, own status-grant application, own `On Cast` trigger).

- **Sources**: "Batomon Showdown Multicast Build: Top Meta Team Guide" —
  <https://batomon-showdown-wiki.wiki/builds/batomon-showdown-multicast-build> ("Each repeated
  cast in a multicast sequence is separated by an exact internal spacing of 0.1 seconds...if a
  monster has Multicast 3, its first cast resolves immediately, its second cast resolves 0.1
  seconds later, and its third cast resolves 0.1 seconds after that"); "Batomon Showdown
  Mechanics – Triggers and Evolutions" — <https://batomon.net/guides/mechanics/>. Both retrieved
  2026-10-05.
- **Flagged, not implemented**: a Steam Community discussion
  (<https://steamcommunity.com/app/4557380/discussions/0/564786459586976612/>, retrieved
  2026-10-05) theorizes that excess Multicast repetitions are silently truncated once their
  cumulative 0.1s spacing would exceed the creature's own cooldown (so a 1s-cooldown creature
  "wastes" any Multicast above 10) — but every reply is explicitly self-described as "my
  understanding"/"guess", with no developer or patch-note confirmation. Per Constitution
  Principle IV, this is recorded as an open question, not encoded as an engine rule — the engine
  does not truncate Multicast repetitions against cooldown this round.
- **Also newly found, recorded for future work, not yet engine-relevant**: "Batomon Showdown
  Beginner Guide" (<https://batomonshowdown-game.wiki/guide/beginner-guide/>, retrieved
  2026-10-05) states a fixed same-tick resolution order — "shield, then damage, then statuses,
  then healing" — relevant once/if a modeled opposing target exists (ties to the Shield-
  absorption gap already tracked in `tasks.md` T037).
- **Engine implication**: Phase B's Multicast repetition loop (round 2) must stagger each
  repetition's `tSeconds` by `+0.1 * repetitionIndex` from the cast's cooldown-triggered
  timestamp, rounded via the existing `roundTime()` helper (research.md D4), instead of reusing
  the same `cast.tSeconds` for every repetition. A repetition whose staggered timestamp would
  fall after `windowSeconds` is simply not generated (same boundary rule as ordinary casts).

### F3. New stats: Heal and Sell Value

> User-supplied in-game stat reference, corroborated: **Heal** restores HP, resolved *after*
> damage in the same tick (so it can save a target from damage that would otherwise be lethal in
> that same tick) — a mechanic this engine cannot simulate yet for the same reason Shield
> absorption isn't wired in (`tasks.md` T037: no modeled opposing HP pool exists under the
> "idealized target" assumption). **Sell Value** is extra gold gained when a Batomon is sold — a
> shop/economy concept, explicitly out of scope for the engine (research.md B6).

- **Engine/data implication**: both are recorded as corpus **data** fields
  (`CreatureRecord.healAmount?: number`, `CreatureRecord.sellValue?: number`) for completeness
  and Corpus Browser display, same treatment data-model.md already gives Shield (tracked as an
  output stat where it's a cast effect, but not simulated as absorption against a target) — not
  wired into `simulate()`'s damage/DPS math this round, with the gap stated explicitly rather
  than silently doing nothing.

### F4. UI cleanup: click-anywhere assignment; drop redundant slot labels

- **Click-anywhere to assign** (user-reported): the round-3 redesign added a `CreatureSearchModal`
  but opened it only via a separate "Choose…"/"Change…" button next to each card — the user
  wants clicking the card (or the empty-slot placeholder) itself to open the modal, with no
  separate button. **Decision**: make the slot's clickable area the full card/placeholder;
  dragging (an existing card, round 3) and clicking (to open the modal) must coexist on the same
  element without conflicting — `@dnd-kit/core`'s pointer sensor only engages past a small drag-
  distance threshold, so a plain click (no movement) still fires normally.
- **Redundant slot labels** (user-reported): "slot number for creature in dps table and hovered
  creature card is not necessary. we can already visually see where it exists" — the 2x3 grid
  itself already shows position; repeating "Back 1" / "front0" text in `TeamSummary`'s rows and
  `PlacedCreatureDetails`'s panel is redundant. **Decision**: drop the slot-position text from
  both displays. The underlying per-slot keying (`${creatureId}@${slotKey}`) is unchanged — only
  the *displayed* label changes; two placements of the same species will show as two
  identically-labeled rows, which the user has explicitly accepted as a non-issue.

### F5. Corpus scale-up, part 1: level 2/3/4 stats are NOT accessible via any available static source — a hard blocker, not just a lot of work

> Investigated directly (not merely assumed): every per-creature stats page found across every
> source cited anywhere in this project exposes **only level-1 numbers** in static HTML/text.
> Level 2/3/4 values exist only behind a live, JavaScript-driven "Lv 1 / Lv 2 / Lv 3 / Lv 4" tab
> control that requires actual browser interaction to reveal — fetching the page's static
> content (confirmed via direct fetch, not just search snippets) never returns those numbers.

- **Evidence**: direct fetch of <https://batodex.com/monsters/bonshell> returns only the Lv 1
  card (Shield 100, 7.0s cooldown, "+80 Damage and +80 Shield") plus inert tab *labels* ("Lv 1
  Lv 2 Lv 3 Lv 4") with no associated values. <https://batomon.net/batomon/dracana/> and
  <https://batomon.net/batomon/bonshell/> both say outright: *"This page deliberately keeps
  normal level 1 separate from levels 2, 3 and 4... the in-game inspect panel gives you the
  current numbers directly"* — i.e. even that source's authors only have level-1 numbers to
  publish. No source found (across ~10 distinct fan sites cited in this document) publishes a
  level 2/3/4 numeric table for the general creature roster; the handful of specific values this
  project already cites (Pyronade Burn 20/40/60, Coalem Shield 550/1100/1650, etc. — research.md
  D2) are rare exceptions some *guide* authors chose to manually transcribe for a few popular
  units, not a systematically available dataset.
- **Engine/data implication**: "Add all level 2/3/4 stats for all 149 creatures" is **blocked**
  by this project's tooling (no browser automation available/authorized this round — Constitution
  doesn't forbid it, but it hasn't been requested) rather than merely large. The `CreatureRecord`
  shape already supports multi-level records (round 2's `level: 1 | 2 | 3 | 4` widening) and
  nothing structural needs to change — there is simply no accessible source for the numbers
  themselves beyond the rare already-cited exceptions. Logged honestly as a blocked task, not
  attempted with fabricated numbers (Constitution Principle IV).

### F6. Corpus scale-up, part 2: level-1 damage/cooldown for all remaining creatures — large but achievable

Unlike F5, level-1 `baseDamage`/`baseCooldownSeconds` *is* accessible via individual
batodex.com-style pages (confirmed working for the 9 creatures already completed across prior
rounds). This remains a large, multi-source-citation task — continuing `tasks.md` T075's
existing "one cited batch at a time" pattern, scaled up substantially this round, not claimed
as 100% complete in one pass unless it genuinely is.

## G. Round 5 follow-ups (2026-10-06 — level 2-4 stats unblocked; full Trinket corpus + engine)

### G1. Correction to research.md F5: level 2/3/4 stats are NOT blocked — F5's finding was a tooling artifact, not a data-availability fact

> **F5 is retracted.** Investigating directly (not re-asserting the prior finding): batodex.com's
> creature pages are server-rendered by Next.js's App Router, which embeds the *entire* site
> database — every creature, every level 1-4 stat, every evolved form, both normal and Shiny
> variants, and the full by-level ability text — as one JSON object inside a
> `self.__next_f.push([1, "..."])` React Server Components streaming script tag on **every**
> page. Round 4's investigation used a fetch tool that converts pages to readable markdown,
> which discards `<script>` tags entirely — so the data was never actually inaccessible, it was
> just invisible to that specific extraction method. Fetching the raw HTML directly (`curl`) and
> parsing the embedded payload reveals the complete dataset in one request.

- **Verified structure** (`https://batodex.com/monsters/bonshell`, retrieved 2026-10-06):
  decoding the JS string inside the matching `push` call yields
  `{"category":"monsters","entries":[{"id":"beetbud",...,"levels":[{"level":1,"cooldown":7,
  "multicast":null,"stats":[{"key":"shield","value":100}]},{"level":2,...,"value":200},
  {"level":3,...,"value":300},{"level":4,...,"value":600}],"shinyLevels":[...],"ability":
  {"trigger":"On Cast","description":"...","byLevel":{"1":"...","2":"...","3":"...","4":"..."}},
  "shinyAbility":{...},"evolution":{"targetId":"bambudo","level":3,"trigger":"level"}|null,
  "evolvedForm":{...nested, same shape...}|"$undefined", ...}, ...]}` — 144 top-level entries,
  with evolved forms nested one level inside their pre-evolution entry's `evolvedForm` key
  (multi-stage chains nest recursively — e.g. Ignit's `evolvedForm` is Flarilisk, whose own
  `evolvedForm` would be Basilord if encoded the same way). Flattening recursively yields
  **exactly 149 unique creature ids** — matching this corpus's own total exactly.
- **Resolves research.md F2.6's open branching-evolution question**: Ignit's `evolution` field
  is `{"targetId":"flarilisk","level":null,"trigger":"victory"}` — a single target, victory-
  triggered, not level-based and not actually branching to two targets. The earlier ambiguity
  (BatoForge's scraped table appearing to list Ignit against both Basilord and Flarilisk) was
  the scrape losing structure; Ignit→Flarilisk→Basilord is a two-stage victory-triggered chain,
  not a branch. `evolvesAtLevel` (this corpus's field) only models level-triggered evolution; a
  victory-triggered one gets `evolvesInto` populated with no `evolvesAtLevel` — recorded as a
  known limitation (resolveLevelUp cannot currently resolve a victory-triggered evolution,
  since it has no "level" input to key off; still correct for not evolving when it shouldn't).
- **New data per level, not previously captured**: `multicast` varies *by level* for some
  species (e.g. Humbolt: 2/3/4/8 across levels 1-4; Sunsage: null/null/null/2) — round 4's
  `baseMulticast` was only ever set from level-1 data. Ability text's magnitude also scales by
  level independent of the base `stats` value (e.g. Bonshell's On-Cast ability: "+80/+160/
  +240/+480 Damage and Shield" across levels 1-4, distinct from its separate base Shield stat
  of 100/200/300/600) — both are now captured per level.
- **Engine/data implication**: no `CreatureRecord` schema change needed — every field this
  requires (`level`, `baseCooldownSeconds`, `baseDamage`, `damageType`, `appliesStatus`,
  `baseMulticast`, `healAmount`, `evolvesInto`, `evolvesAtLevel`) already exists from rounds
  2-4. This is a (large) data-population task, not a design task: one `CreatureRecord` per
  `(id, level)` pair, up to 4 per species/evolved-form, extracted programmatically rather than
  hand-transcribed per creature (infeasible by hand at this volume — ~450+ records).

### G2. Full Trinket database — the exact same technique applies

> `https://batodex.com/trinkets` embeds the identical pattern: one `self.__next_f.push` block
> containing `{"category":"trinkets","entries":[{"id":"bargain_bin","name":"Bargain Bin",
> "tier":1,"description":"The first Common monster you buy each day is free.","isUnique":true,
> "sets":[...],"sources":{...},"rarity":{"label":"Common","color":"#70707a"}}, ...]}` —
> **93 entries**, matching this project's own `src/ui/CorpusBrowser/CorpusBrowser.tsx` comment
> ("93 trinket(s)") and the earlier-cited `batomon.com/wiki` "93 trinkets" figure.

- **Engine implication**: most trinket effects described here are shop/economy mechanics (free
  purchases, gift-choice rarity, per-day grants) — out of scope for this engine per research.md
  B6, same as most Trainer abilities. A minority are flat, unconditional, permanent team-wide
  stat bonuses (e.g. "On Victory: Your team gains +5 Damage permanently") that map directly onto
  this corpus's existing `ModifierStat` vocabulary — these are the only trinket effects wired
  into `simulate()`'s math this round (data-model.md's "Trinket effect application" amendment).
  Everything else is still real, cited, browsable corpus data — just not simulated, exactly like
  the Shield-absorption and shop-economy gaps already logged in `tasks.md` T037/README.md.

## H. Round 6 (2026-10-06) — Game-faithful card layout, sprite assets, UI restructure, and a confirmed positional-ordering bug

Fourteen user-reported items this round, plus two data-integrity findings this round's
investigation surfaced that were **not** requested but must not be shipped silently (H9/H10).
The user supplied four screenshots: an official in-game creature card (Brimtoad), an in-game
team panel, and two before/after captures of the DPS bug in item 14.

### H1. Official card layout — four stacked bands, not one run-on stat line

> User-supplied screenshot of the in-game Brimtoad card. Transcribed structure (the *layout* is
> being adopted; the pixel-art styling and palette deliberately are not — see H3):
>
> | Band | Left | Right |
> |---|---|---|
> | 1 (header) | `BRIMTOAD` | `UNCOMMON` |
> | 2 | sprite thumbnail | type badges, stacked vertically (`FIRE`, `TOXIC`) |
> | 3 | cooldown block (`6.0` / `sec`) | one line per stat: `Deal 5 damage`, `Poison 1`, `Burn 1` |
> | 4 (ability) | trigger (`On Battle Start`) above description (`+4 Burn and +4 Poison permanently.`) | — |

- **Decision**: one shared card component renders bands 1-4, used by **both** the Corpus
  Browser's per-creature cards **and** the Calculator's "currently selected mon" panel (item 1
  explicitly names both surfaces). Today these are two independently hand-written layouts
  (`CorpusBrowser.tsx` and `PlacedCreatureDetails.tsx`) that both cram cost/cooldown/damage onto
  a single `·`-separated line — the exact complaint.
- **Rationale**: band 3's one-line-per-stat structure is the substantive fix. The current
  `Cost $10 · Cooldown 2.5s · Damage 3 (Direct)` line forces the reader to parse three unrelated
  magnitudes out of one sentence; the game separates cooldown (a timing property, its own block)
  from per-cast output (one labelled, colour-coded line each). Shop cost is **not** on the game
  card at all — it is a shop property, not a battle stat — so it moves to a secondary line
  rather than competing with battle stats for the reader's attention.
- **Band 4 has two parts, not one** (caught during this round's review): the in-game card renders
  the ability **trigger** (`On Battle Start`) as its own emphasised line *above* the description
  (`+4 Burn and +4 Poison permanently.`). This corpus's `abilityText` holds only the description —
  the trigger is a separate field in the extracted payload (`ability.trigger`) that rounds 2-5
  never captured. Faithfully reproducing band 4 therefore needs a small schema addition
  (`abilityTrigger`), not just a layout change; see data-model.md's round-6 amendment. Without it
  the card silently drops information the reference card shows.
- **Key difference from the game kept deliberately**: this project's `PlacedCreatureDetails`
  additionally shows "Effective this battle" (modifier-adjusted) values, which no in-game card
  has. That stays — it is this project's own differentiator (research.md E1's "preserve this
  project's differentiators" rule) and is rendered as a clearly separated fifth band, not mixed
  into band 3's base-stat lines.

### H2. Official stat and rarity colours — extractable, not guessed

The same embedded batodex payload documented in G1 carries the game's own colour for every stat
and rarity, so item 8's "color coordinated" requirement needs no invented palette:

| Stat | Colour | | Rarity | Colour |
|---|---|---|---|---|
| Damage | `#ef426b` | | Common | `#70707a` |
| Burn | `#ed6b3a` | | Uncommon | `#4ab500` |
| Poison | `#7b57a1` | | Rare | `#0084bd` |
| Shock | `#e7c61c` | | Super Rare | `#a040a0` |
| Shield | `#a47c41` | | Legendary | `#d47c00` |
| Heal | `#578ac9` | | Mythical | `#dc2844` |
| Multicast | `#7b93c3` | | | |

- **Cross-check against the screenshot**: the in-game Brimtoad card renders "Deal 5 damage" in
  pink, "Poison 1" in purple, and "Burn 1" in orange — matching `#ef426b`/`#7b57a1`/`#ed6b3a`
  above. The extracted palette is the game's, not batodex's own invention.
- **Decision**: a single canonical `statColors`/`rarityColors` map, same pattern as round 3's
  existing `typeColors.ts` (which already exists for creature types). Note the label mismatch:
  batodex writes `"Super Rare"`, this corpus's `Rarity` union writes `"SuperRare"` — mapped
  explicitly, not by string munging.

### H3. Sprite assets — all 149 available, vendored rather than hot-linked

- **Availability**: every one of the 149 extracted creature entries carries a
  `sprite: "/sprites/monster/<slug>.png"` path (149/149, verified), and every trinket entry
  carries `sprite: "/sprites/trinket/<slug>.png"`. Spot-fetch of
  `https://batodex.com/sprites/monster/beetbud.png` returns HTTP 200, a 48×48 8-bit RGBA PNG of
  769 bytes.
- **Decision**: **vendor** the sprites into the repository (`public/sprites/...`) rather than
  hot-linking batodex at runtime. Rationale: Principle V (zero-backend, static hosting,
  "offline-capable once loaded") — hot-linking would make the app's core visuals depend on a
  third-party host staying up and permitting cross-origin image loads, and would leak every
  user's browsing to that host. At ~0.8 KB each, all 149 creature sprites plus 93 trinket
  sprites total well under 250 KB, which is immaterial next to the existing 962 KB JS bundle.
- **Attribution**: these are the game's own assets redistributed by a fan dex, not batodex's
  original artwork. README gains an explicit attribution + provenance note (same spirit as
  Principle IV's citation rule, applied to assets rather than numbers) stating where they came
  from, when, and that they remain the game author's property. Flagged for the user as the one
  item this round with a non-technical (licensing/courtesy) dimension rather than silently
  bundling someone else's art.
- **Slug reconciliation — 11 species, not 4** (corrected during this round's review; the initial
  draft of this section wrongly carried over round 5's *id*-reconciliation count of 4):

  ```text
  craghorn    -> alpinine.png      draconarch -> dragonarch.png    dragonegg  -> dragon_egg_0.png
  electranade -> galvanade.png     missingn   -> missing_no.png    null00     -> null_00.png
  null7f      -> null_7f.png       nullff     -> null_ff.png       purpleegg  -> purple_egg.png
  pyronade    -> infernade.png     scorubble  -> scorbble.png
  ```

  Round 5's 4 were genuine *id* divergences; the other 7 are publishing-convention differences
  (underscored multiword slugs for the Egg/NULL families) plus one further real rename
  (`pyronade` is published as `infernade`). **Matching on `name` (case-insensitive) resolves all
  149/149**, which is the same technique round 5 used to reconcile ids — so the mapping is done by
  name match, and the resulting filename stored **per record** as data. Deriving the filename from
  `id` by convention would silently 404 for 11 species.

### H4. Trinket presentation — reuse the creature picker, don't invent a second pattern

- **Problem (item 4)**: `TrinketPicker` is a bare `<select>` of 93 names. A dropdown `<option>`
  cannot render a sprite, and the effect text is the entire reason to pick one trinket over
  another — so the current control hides the only information that matters at selection time.
- **Decision**: reuse the round-3 `CreatureSearchModal` interaction wholesale (searchable,
  filterable grid of clickable cards) for trinkets, with the trinket's sprite, name,
  rarity-coloured label, full effect text, and the existing "affects DPS" marker on each card.
  The 6 engine-wired trinkets (round 5) stay visually distinguished from the 87 reference-only
  ones — that distinction is honest and already established, so it is preserved, not dropped.
- **Alternative rejected**: a bespoke trinket-only layout. Item 4 asks explicitly for "the same
  mechanism for displaying batomon when selecting them", and two different selection idioms for
  two corpora in one tool is the kind of needless divergence Principle VI warns against.

### H5. Per-slot clear control (item 5) — why the modal's "Clear slot" wasn't enough

Clearing a slot is *already possible* two ways (the search modal's "Clear slot" button, and the
fallback `<select>`'s "— empty —" option), but the user could not find either — which makes it a
discoverability defect, not a missing capability. **Decision**: a small `×` affordance in the
filled card's top-right corner, as requested. Implementation constraint worth stating up front
because it is easy to get wrong: the card is simultaneously a drag handle (round 3, `@dnd-kit`)
and a click target that opens the search modal (round 4, FR-023) — so the `×` must stop both
pointer-event propagation (or `@dnd-kit` will treat the press as a drag start) and click
propagation (or the search modal will open as the slot is cleared).

### H6. Grid/card density and shape (items 3, 6, 7, 13)

- **Item 3 (corpus browser columns)**: currently one full-width `<article>` per creature stacked
  vertically — on a desktop viewport that is ~1 card per screen-width with most of the line
  length empty. **Decision**: a responsive CSS grid, `repeat(auto-fill, minmax(17rem, 1fr))`,
  which naturally lands on 3-4 columns at common desktop widths and degrades to 1-2 on narrow
  viewports without a media-query ladder (Principle VI). A hard 4-column cap keeps card width
  from ballooning on ultrawide displays.
- **Item 6 (row labels)**: `GridPicker`'s `BACK ROW`/`FRONT ROW` labels are removed. The 2×3
  geometry is self-evident; the labels also consumed a full grid row each. Note this does **not**
  change any engine semantics — `GridSlot.row` stays `"back" | "front"` as the data value
  (research.md B5's adjacency and `aboveSlot`/`behindSlot` resolvers depend on it); only the
  on-screen text is dropped. Same reasoning round 4 applied to FR-024.
- **Item 7 (square icons)**: slot cards get `aspect-ratio: 1`, matching the game's square team
  panes (user screenshot 2) and giving item 8's stat badges a stable area to anchor to.
- **Item 13 (modal heading prose)**: `Choose a Banto — {row} row, slot {col+1}` loses the slot
  suffix. This is round 4's FR-024 decision applied to the one surface that was missed: the user
  has just clicked that slot, and drag-and-drop means the choice isn't slot-bound anyway. The
  `aria-label` keeps a slot reference for screen-reader users who did *not* see the click.

### H7. Modifiers section redesign (item 11)

Four distinct changes the user asked for, which must not be collapsed into one:

1. **Collapsible** — the whole section becomes a closed-by-default disclosure, since it is
   occasional-use. (It currently occupies permanent vertical space between the DPS tables and
   the chart for a feature most sessions never touch.)
2. **Per-mon only in the UI** — the "Team-wide (every placed Banto)" scope option is removed
   from the dropdown. **Critical constraint**: `TeamConfiguration.teamModifiers` and
   `simulate()`'s team-wide summation **must stay**, because round 5 wired trinket `effectTags`
   through exactly that path (`simulate.ts`'s `trinketModifiers` → `teamModifiers`). This is a
   UI-affordance removal, not an engine-capability removal; deleting the engine support would
   silently break trinkets. Stated explicitly here because the two are easy to conflate.
3. **Shorter stat labels** — `"Cooldown Speed (+decimal, e.g. 0.2 = +20%)"` becomes
   `"Cooldown Speed"`, with the unit/format explanation moved to a subtext line below the form
   rather than living inside an `<option>` string.
4. **Integrated per-mon, not a wall of controls** — modifiers are presented against the mon they
   apply to (the user's "New mons will be added before/after a mon that affects the whole team"
   point: a carry-over belongs to a specific creature, and the roster shifts around it), rather
   than as a free-floating scope dropdown the user must mentally re-bind to a slot.

### H8. Confirmed bug (item 14): simultaneous-cast ordering lets slot position change Shock damage

**The user is right, and the mechanism is now identified and reproduced.** Not a display bug.

Reproduced directly against the real corpus with the user's exact two formations:

```text
BEFORE (bumblebolt front-1): facilitated 4.10, Shock/sec 4.10
  t=5 events: shockProc@front0(1) | attack@front0(25) | shockProc@front1(1) | attack@front1(3) | ongoingChange@front1
AFTER  (bumblebolt back-2):  facilitated 4.30, Shock/sec 4.30
  t=5 events: shockProc@back2(1) | attack@back2(3) | ongoingChange@back2 | shockProc@front0(2) | attack@front0(25)
```

Minimal 2-creature control (Panbud + Bumblebolt, nothing else) isolates it cleanly: **2.20** with
Bumblebolt at `front-1` vs **2.40** at `back-0`.

- **Root cause**: Bumblebolt (2.5 s cooldown) and Panbud (5 s cooldown) cast at *identical*
  timestamps (t = 5, 10, 15, 20). `simulate()` sorts coincident casts by
  `stableSlotIndex(sourceSlot)` (`simulate.ts` Phase A's final sort), and Phase B mutates the
  shared `shockLayers` counter as it walks that order. So whether Bumblebolt's Shock application
  at t=5 lands *before* or *after* Panbud's hit at t=5 — and therefore whether Panbud's hit procs
  against 1 layer or 2 — is decided purely by which slot each occupies. `STABLE_SLOT_ORDER` puts
  all of `back` before all of `front`, which is why moving Bumblebolt to the back row raised it.
- **Why this is a genuine defect, not a modelling choice**: neither creature has any positional
  ability (`abilityTags: []`), so no documented game mechanic connects their slots to their
  output. The tie-break exists to make the timeline *deterministic* (contracts/engine-api.md) —
  determinism is correct, but it was silently doubling as a *damage-affecting* rule.
- **Decision — "simultaneous casts resolve against a common pre-cast status snapshot"**: within a
  single timestamp, every cast's Shock proc resolves against the layer count as it stood when
  that timestamp began; layers applied at that timestamp take effect from the next timestamp
  onward. This makes output invariant to slot permutation while keeping the timeline's stable
  ordering (and its tie-break) exactly as documented for display purposes.
- **Alternatives considered**: (a) *apply all status first, then all hits at a timestamp* — also
  order-independent, but it lets a layer empower a hit it was simultaneous with, i.e. it picks the
  opposite arbitrary answer and inflates output; (b) *leave as-is and document it* — rejected, it
  tells users position matters when the corpus says it doesn't; (c) *sub-order by creature id
  instead of slot* — rejected, it only relabels the arbitrary tie-break without removing the
  position/order coupling for other permutations.
- **Second, independent manifestation of the same root cause — found during this round's review,
  and NOT fixed by the snapshot rule alone.** Phase B expands Multicast repetitions *inline inside
  the cast loop*, so a cast at t=5.0 with a repetition at t=5.1 is fully processed before another
  creature's cast at t=5.0 that happens to sort later. Phase B therefore does not walk events in
  global chronological order at all, and round 4's 0.1 s stagger does not save it — "repetitions
  occupy distinct timestamps" is true but irrelevant if the loop never visits timestamps in order.
  Reproduced: Panbud + Bumblebolt **at level 4** (where Bumblebolt's Multicast is 2) yields
  **Shock 20.55/s** with Bumblebolt at `front-1` versus **21.60/s** at `back-1`. 7 creature records
  in the corpus have Multicast > 1 *and* apply Shock (Humbolt at all 4 levels, Bumblebolt Lv4,
  Frizzly Lv4), so this is reachable with real data, not a synthetic edge case.
  **Therefore the fix has two parts**: (a) flatten every cast's repetitions into a single event
  list and sort it by `(tSeconds, stableSlotIndex)` *before* walking it, so Phase B is genuinely
  chronological; (b) then apply the per-timestamp snapshot rule. Part (a) alone is not sufficient
  (the original front-1/back-2 case is a true same-timestamp collision), and part (b) alone is not
  sufficient (the Multicast case above). A regression test must cover **both** shapes.
- **The snapshot must cover `shockLayersBySource`, not just `shockLayers`.** Facilitated damage is
  attributed by each source's *share* of the live layer total
  (`shockDamage * sourceLayers / shockLayers`). Snapshotting only the scalar total while leaving
  the per-source map live would leave attribution order-dependent even once the total is not —
  i.e. it would fix the symptom the user reported (`Shock/sec`) while leaving the column they
  reported it *in* (`Facilitated DPS`) still wrong in other configurations.
- **One pre-existing test's expected value changes, and that is the fix working rather than a
  regression.** `simulate.test.ts`'s facilitated-damage attribution test asserted 5/s, and its own
  comment explained why: *"shockApplier (front0) is processed before attacker (front1) at each tied
  timestamp (stable slot order), so it grants +2 Shock before attacker's same-tick hit."* That
  expected value was derived from the exact slot-ordering dependency the user reported — swapping
  the two creatures' slots would have changed it. Under the snapshot rule both orderings agree at
  3/s (snapshots of 0/2/4/6 layers → procs 0+2+4+6 = 12 over 4 s). Updated with the reasoning
  recorded inline, not silently re-baselined.
- **Honest limitation to record**: no source documents how the real game resolves two abilities
  landing on the same frame. The snapshot rule is chosen because it is *invariant* (the property
  the user is actually asserting: a creature with no positional ability must not change output
  when moved), not because it is confirmed to match the game frame-for-frame. The regression test
  therefore asserts the **invariant** — permuting slots of positional-ability-free creatures
  leaves every output number unchanged — rather than hard-coding 4.10 or 4.30 as "the" answer.

### H9. Unrequested finding: round 5's "100% confirmed" claim is overstated

Round 5's completion report, `README.md`, and `App.tsx`'s `CORPUS_PATCH_LABEL` all state the
corpus is "100% confirmed across levels 1-4". **That is wrong and must be corrected.** The
verification behind it counted only `baseCooldownSeconds` (genuinely 596/596 non-null);
`baseDamage` is `null` in **242 of 596 records (62 of the 149 at level 1)**.

Some of those nulls are legitimate ("confirmed absent" — a status-only creature with no
direct-damage line), but at least some are genuinely missing data, proven by the user's own
screenshot: the in-game Brimtoad card reads **"Deal 5 damage"**, while both batodex's embedded
payload and this corpus record `baseDamage: null` for Brimtoad. So batodex's per-level `stats`
array omits damage for some creatures, and "null" in this corpus currently conflates
*confirmed-absent* with *not-published-by-our-source*. Corrected rather than restated: the
labels are fixed to the real figure, and the conflation is logged as the open gap it is.

### H10. Unrequested finding: 10 species have level-1 values contradicting their own level 2-4 series

Round 5 populated levels 2-4 from batodex's authoritative per-level series but left each
species' **level-1** record at whatever rounds 2/4 had sourced from the older community dex — so
10 species now have a level-1 value *larger* than their level-2 value, which no levelling curve
in this game does:

```text
brimtoad status 10/4/6/24      cordycant status 300/16/24/96   dragonegg dmg 100/1/1/1
nullff dmg 180/99/99/999       omnichrome dmg 99/1/1/1         ratacomb dmg 150/40/60/120
rigalord dmg 200/1/1/1         spinarai status 8/2/3/3         steamscuttle status 60/10/15/60
bambudo dmg 100/75/75/150
```

The user's screenshot adjudicates the first one directly: the in-game Brimtoad card shows
**Burn 1 and Poison 1** at level 1, matching batodex's `levels[0]` (`burn 1, poison 1`) and
contradicting this corpus's level-1 record (`Burn 5, Poison 5`). **Decision**: re-derive level-1
from the same authoritative per-level series used for levels 2-4, so each species' four records
come from one internally consistent source instead of two mutually contradictory ones, and keep
the older community value as a recorded `FieldConflict` rather than deleting it (Principle IV).
`bambudo` is noted separately: as Panbud's level-3 evolution it may have no real level-1/2 form
at all, which is a different question (a spurious record) from a wrong value.

### H11. Unrequested finding, and the most serious of the round: 49 level-1 records held a *different creature's* stats

Investigating H10's 10 non-monotonic species during implementation turned up the actual cause,
which is much larger than 10 species and was never reported by the user.

Comparing all 149 level-1 records against the authoritative per-level series revealed a pattern:

```text
quillustrous: ours cd=4.5   auth cd=7       ratacomb:  ours dmg=150  auth dmg=20
ratacomb:     ours cd=7     auth cd=4       rigalord:  ours dmg=200  auth dmg=1
rattleghast:  ours cd=4     auth cd=3.5     rubbin:    ours dmg=1    auth dmg=40
reapra:       ours cd=3.5   auth cd=7.5     runerock:  ours dmg=40   auth dmg=null
```

Each record held **the previous record's** values. Round 5's "fill in the remaining level-1
records" pass (T108) had an **off-by-one row alignment bug**, so it wrote each creature the
*preceding* creature's cooldown, damage, damage type, status amounts, and heal. **55** records
were affected (a first pass of the repair script compared only cooldown and damage and so missed 6
more whose *status amounts* alone were wrong -- Brimtoad among them, the one case the user's own
screenshot adjudicates: Burn 5/Poison 5 recorded against Burn 1/Poison 1 published).

Quantified across the corpus:

| Level | Agreed with source | Disagreed |
|---|---|---|
| 1 | 94 / 149 | **61** (55 off-by-one shifted + 6 genuine source disagreements) |
| 2 | 149 / 149 | 0 |
| 3 | 149 / 149 | 0 |
| 4 | 149 / 149 | 0 |

- **Why only 10 showed up in H10**: the monotonicity check that found H10 only catches a shift
  when it happens to produce a level-1 value *larger* than level 2. The other 39 shifts moved
  values that still looked plausible. A shape-based check (is this series monotonic?) was never
  going to find this; only a value-by-value comparison against the source did.
- **Why levels 2-4 are clean**: they were written by a different, correctly-aligned bulk append in
  the same round. The bug was specific to the level-1 gap-filling step — which is exactly the step
  round 5's own completion report described as "closing the entire corpus-completeness gap in one
  pass". It closed the gap with 49 wrong answers.
- **Treatment**: the 55 are a transcription bug, not a disagreement — the value belongs to a
  different species — so they are corrected outright. The 6 remaining differ by a plausible margin
  (e.g. Nekoffin damage 250 vs 200, Opalion cooldown 8 vs 9) and are treated as genuine
  community-dex-vs-batodex disagreements: the batodex value is adopted (it is the source levels 2-4
  come from, so adopting it makes each species' four records internally consistent) and the
  community value is **retained as a recorded `FieldConflict`**, not dropped (Principle IV).
  Repaired by `scripts/reconcile-level1.mjs`, committed rather than discarded.
- **Post-repair state**: all 596 records across all four levels agree with the authoritative
  series, verified programmatically rather than by spot check.
- **Lesson worth recording, since this is the second round in a row a bulk data script shipped a
  silent misalignment** (round 5's `flatten_monsters` dedup bug, now this): a bulk corpus write
  needs a verification pass that compares the *written* values back against the source
  value-by-value. Shape or count checks ("596 records exist", "596 cooldowns are non-null") pass
  happily while every value is wrong by one row. That verification now exists as
  `provenance.test.ts`-adjacent tooling and should be run after any future bulk corpus edit.

## I. Round 7 (2026-10-06) — Design system, picker/card redesign, click-vs-drag fix, and second-order status metrics

Twenty user-reported items. Four needed real diagnosis before they could be planned (I7, I8, I11,
I13); one is architectural and changes how all future work is done (I14). The rest are bounded
presentation fixes, grouped below rather than given a subsection each.

### I1. Shield's colour is wrong in our map, and the game proves it

The user's in-game capture shows a Shield value rendered on a **silver/steel** plate. Our
`STAT_COLORS.shield` is `#a47c41` — a brown. That value came from round 6's extraction of
batodex's published palette (research.md H2), so this is not a transcription slip: **batodex's
shield colour disagrees with the game's own rendering**, and the game wins.

- **Decision**: change `shield` to a silver/steel tone and record it as a corrected value with the
  user screenshot as its source, rather than silently editing a figure H2 cites to batodex.
- **Sampled, not eyeballed**: pixel-sampling the shield plate in the user's capture gives a cool
  silver/periwinkle family — `#a7a8b4`, `#a8a9b4`, `#a5a9da`, `#a4a8d9`. Adopting **`#9aa1b8`**:
  the same hue family, nudged darker so white badge text keeps legible contrast against it (the
  sampled tones are light enough that white-on-silver would be marginal).
- **Second, wider consequence**: `CumulativeChart.tsx` hard-codes its own Burn/Poison/Shock/Shield
  stroke colours (`#e07b39`, `#8e44ad`, `#d4b106`, `#2e86de`) which **already disagree** with
  `STAT_COLORS`. Fixing only `statColors.ts` would leave Shield blue in the chart and legend while
  it is silver everywhere else. The chart must consume `STAT_COLORS` — which is a Principle VII
  violation that pre-existed this round and is only visible because item 1 forced a look.
- The other six colours were cross-checked against the in-game Brimtoad card in round 6 and are
  unaffected; only `shield` had no in-game cross-check at the time, which is exactly why it is the
  one that was wrong.

### I2. Terminology: "Banto" is not a word in this game

Two surfaces say "Banto" — `Placed Banto stats` and `Choose a Banto` (items 2, 9). The creatures
are **Batomon**. "Banto" was invented in round 1 and has survived five rounds unchallenged.

- **Decision**: "Batomon" everywhere in user-facing copy. Grep the whole `src/` tree rather than
  fixing only the two surfaces the user happened to name — the same typo is likely in `aria-label`s
  and empty-state strings a screenshot wouldn't show.

### I3. Cards must reserve space, not resize to their contents (items 3, 15)

The selected-creature panel changes size as you hover different creatures: a one-type creature's
card is shorter than a two-type one, the ability band grows with text length, and a long name
wraps. The grid visibly reflows on hover, which is both distracting and makes the adjacent column
jump.

- **Decision**: fixed, reserved dimensions for the whole card and *independently* for the bands
  that vary (the type column, the sprite frame, the ability block). Sized to the corpus's actual
  worst case, not guessed: compute the longest name, longest ability text, and max type count
  across all 596 records and size against those.
- **Also item 15**: the sprite in that card is far too small, which is *why* the two-type column
  looks like wasted space — the band's height is set by the type chips, and a 44px sprite doesn't
  fill it. Enlarging the sprite fixes the imbalance and the reserved height at once.

### I4. Decimal precision regression (item 4)

`Effective this battle` renders `cooldownSeconds.toFixed(2)` → `6.00`, while the base band renders
`toFixed(1)` → `6.0`. The in-game card uses one decimal. The two bands sit directly above one
another showing the same quantity at different precision, which reads like a discrepancy.

- **Decision**: one shared formatter used by both, one decimal. Not two call sites agreeing by
  convention — a formatter, because this is exactly the class of divergence I14 exists to prevent.

### I5. Modifier rows waste a full row each; identical modifiers stack as duplicate chips (items 5, 6)

- **Layout**: one creature per row at any viewport width. **Decision**: responsive auto-fit grid,
  same primitive the corpus browser uses — not a new bespoke breakpoint ladder.
- **Accumulation**: adding `Burn applied +10` twice produces two separate `+10` chips rather than
  one `+20`. The engine sums them correctly (`sumModifier` adds every matching entry), so this is
  purely a display/model-of-record question. **Decision**: merge on `(stat)` within a placement —
  adding `+10` to an existing `+10` yields a single `+20` chip, and removing it removes the whole
  accumulated amount. Rationale: a list of indistinguishable `+10` chips gives the user no way to
  tell which is which, and no reason to care.
- **Edge case to handle rather than discover later**: merging to **zero** (`+10` then `-10`) must
  remove the chip entirely, not leave a `+0` chip that renders but does nothing.

### I6. "Shield (granted)" over-qualifies (item 7)

The parenthetical was added in round 2 to distinguish Shield *granted* from Shield *absorbed* — but
absorption is not modelled and never has been (`T037`), so the qualifier advertises a distinction
the tool does not make. **Decision**: render `Shield`. The granted-vs-absorbed scope limit stays
documented in README/tasks where it belongs, not in a table cell.

### I7. Root cause found: `@dnd-kit` swallows the click because no activation constraint is set

The user cannot click an occupied slot to reopen the picker; only dragging works. The card *does*
have an `onClick` that opens the modal (FR-023, round 4) and it is still wired — so the handler is
not missing, it is **never reached**.

- **Root cause**: `<DndContext>` is rendered with no `sensors` prop, so it falls back to the
  default `PointerSensor` with **no `activationConstraint`**. That sensor begins a drag on
  `pointerdown` and calls `preventDefault()`, so the browser never synthesises a `click` on the
  element. Round 4's claim that "a plain click still fires normally because the pointer sensor only
  engages past a drag threshold" was **wrong**: there is no such threshold by default — one has to
  be configured.
- **Decision**: configure the sensor explicitly with
  `activationConstraint: { distance: 8 }`, which is precisely the user's "drag if I click and hold
  [and move], but click once to open". 8px is large enough to absorb pointer jitter on a click and
  small enough that an intentional drag feels immediate.
- **Why this wasn't caught**: round 6's `GridPicker` test asserts the clear button does **not** open
  the picker — it never asserts the positive case that clicking the card **does**. A test that only
  checks a negative passes happily when the feature is entirely dead. The new test must assert both.

### I8. Creature picker: crowding, and the "sliver" is a gradient seam (items 10, 11)

- **Crowding**: each result card is a ~96px-wide box holding a sprite, the name, and a
  `rarity · type/type` line, so the text is squeezed beside the sprite. **Decision**, taking the
  in-game shop card as the reference the user supplied: sprite centred and large in a type-coloured
  art area, with the **name in a band across the bottom** (the shop card's actual structure), **no
  rarity text on the card** and **no price** (explicitly excluded by the user — it is a shop
  concept, not a planning one). Type stays communicated by the background, which already encodes it.
- **Card proportions, measured rather than guessed**: a first draft of this section said "roughly
  3:4 w:h". That was **wrong and inverted**. Measuring the user's shop-card capture directly, the
  cards are ~**175 × 145 px**, i.e. about **1.2 : 1 (landscape — wider than tall)**. The current
  picker card is far wider than tall, so the user's "card height should be increased to follow a
  similar ratio" means growing toward ~1.2:1, not flipping to portrait.
- **Rarity becomes structure, not a label**: results are grouped into rarity sections with a small
  left-justified rarity heading per group. This conveys strictly more than the per-card label did
  (you can see how many of each rarity match your filter) while removing text from the card.
- **The "sliver"**, diagnosed correctly on the second attempt: the picker's result card is
  `border: 2px solid transparent` with `background: linear-gradient(to right, A 0%, A 50%, B 50%,
  B 100%)`. CSS's default `background-origin: padding-box` positions the gradient against the
  *padding* box, while the default `background-clip: border-box` *paints* it across the larger
  *border* box — so the gradient repeats outward into the 2px border area on every side, putting a
  thin band of the far colour along the card's edge. That is the user's sliver, and their own
  instinct ("the split color is just rendered over top on half, but it doesn't go the full width")
  is essentially right.
  (An earlier draft of this section blamed fractional-pixel antialiasing of the 50% hard stop.
  That was wrong — it would produce a seam at the *centre*, not a band at the *edge*, which is not
  what the user reported.)
  **Decision**: stop expressing the split as a gradient. Render it as a dedicated primitive with
  two explicitly-sized halves, which cannot antialias a seam and cannot bleed under a border. This
  also makes the split reusable everywhere a type background appears (I14).

### I9. Corpus-snapshot prose in the header (item 12)

Added for FR-014 ("state which corpus/patch snapshot is active"). It is three lines of provenance
above every view, on both views.

**Correction to this section's first draft**, which claimed FR-014 would still be "satisfied by the
Corpus Browser's own summary line". **That was false** — the Corpus Browser's summary line carries
*counts only* (`149 creatures… 23 trainers…`); it states no patch or version anywhere. Removing the
header as drafted would have left FR-014 **unmet on every surface**, while the plan asserted it was
fine. Caught in review.

- **Decision**: remove the prose from the header as asked, **and** add a single compact
  version/patch statement to the Corpus Browser's summary line so FR-014 keeps a real home. One
  short "Balance 24 / 1.2.0" clause is not the per-record citation/conflict rendering FR-030
  removed — FR-030 bans per-entry provenance in the browser, not a corpus-level version stamp —
  but the distinction has to be stated, not assumed.
- **FR-014 must be amended in spec.md explicitly** (narrowed from "on both views" to "somewhere
  discoverable"), the same way round 6 re-scoped SC-004 rather than letting an unmet criterion sit.
- `App.tsx`'s `CORPUS_PATCH_LABEL` constant and the README line instructing maintainers to update it
  both need to follow the text to its new home rather than being orphaned.

### I10. Trinket list: ragged card heights, unbounded growth, drifting controls (items 13, 16, 17)

- **13**: picker cards size to their effect text, so a grid row is as tall as its wordiest card and
  the rest have dead space. **Decision**: uniform fixed height across the grid, sized to the
  longest `effectText` in the corpus (computed, not guessed), with overflow handled deliberately.
- **16**: each selected trinket adds a full row above the team grid, pushing the board down —
  with 9 selected the grid is off-screen. **Decision**: collapse the selected list into a
  disclosure, same primitive as Modifiers.
- **17**: the name and the `×` are vertically centred, so a long description moves them down and
  the remove button lands in a different place on every row. **Decision**: top-align both columns
  so `×` is at a constant offset regardless of description length — the user's actual complaint is
  Fitts's-law consistency, not aesthetics.

### I11. Sprite display size — answering "why 40px?" (item 18)

Straight answer: **40px was an arbitrary choice I made in round 6** to fit the then-smaller slot
card. It has no source and no reason behind it. batodex renders the same art at 64px.

- **Decision**: 64px in the team grid, as requested.
- **One caveat worth stating rather than discovering visually**: the source PNGs are **48×48**, so
  64px is a **1.333× non-integer upscale**. With `image-rendering: pixelated` that makes some
  source pixels 1 screen-pixel wide and others 2 — a subtly uneven grid. **96px (exactly 2×)** is
  the crispest size above 48. Going with 64 as asked, and recording 96 as the alternative so the
  trade-off is a choice rather than an accident.
- Sprite sizes become named tokens rather than per-call-site numbers (I14), so this is one edit
  next time, not six.

### I12. Chart axis labels are clipped and misaligned (item 19)

`cumulative value` renders at `position: "insideLeft"` with the chart's `left` margin at `0`, so the
rotated label has no room and is clipped to `cumulative valu`. `seconds` uses
`position: "insideBottomRight"`, which right-justifies it. **Decision**: give the Y axis enough left
margin to fit its rotated label, and centre the X label (`insideBottom`). Verify by measuring the
rendered label, not by eyeballing a screenshot.

### I13. Status metrics are first-order only, and that actively misleads for Poison (item 20)

The user's question — "where does Poison 21.30 come from?" — has a definite answer, and their
follow-up guess ("this is how much poison is applied per second") is **not** it.

- **It is damage per second**: `perStatusPerSecond.Poison = (total Poison tick damage) / window`.
  Measured on a representative team: 1310 total Poison damage over a 20s window → **65.50/s**.
- **And that single number is unrepresentative**, exactly as the user argued — though **my first
  measurement of *how* unrepresentative was wrong, and the corrected figure is below.** The probe
  that produced it clamped every tick at `t = windowSeconds` into the final bucket
  (`Math.min(19, floor(t))`), double-counting the last second and reporting `293`. That `293` was
  an artifact of my own bucketing, not engine behaviour. Re-measured with half-open `(k, k+1]`
  buckets and no clamping, on a single Drumire (Poison 20, 8 s cooldown):

  ```text
  W=20s: total 320, average 16.00/s, final second 40/s   -> 2.50x the average
  W=60s: total 3920, average 65.33/s, final second 140/s -> 2.14x the average
  ```

  So the real distortion is roughly **2.1–2.5×**, not 4.5×. Still large enough that one averaged
  figure materially misleads, which is the user's point and it stands — but the headline number is
  corrected rather than left overstated.
- **CORRECTION (user-reported, after this section was first written): Burn also climbs, and the
  evidence I used to say otherwise was a badly-chosen fixture.** This section originally read
  "Burn, measured the same way, genuinely flattens", citing a Brimtoad's final 1-second buckets
  over a 60 s window (`0, 0, 1, 0, 0, 0, 0, 0`). That measurement is real but unrepresentative:
  Brimtoad applies **Burn 1** every 6 s, the weakest burn in the corpus, and a 1-layer instance
  expires in 0.5 s. It was always going to look flat.

  The user observed real play where burn kept climbing across a fire board, and re-measuring
  against an actual fire build confirms them:

  ```text
  team: Basilord(170), Blixie(30), Coalem(20), Pyronade(20), Flarilisk(10), Snapscald(8)
  W= 20s: avg  353.6/s  end  778/s  growth 38.90/s^2   curve 0 -> 20 -> 472 -> 450 -> 851
  W= 60s: avg 1000.6/s  end 1798/s  growth 29.97/s^2   curve 0 -> 450 -> 966 -> 1411 -> 1766
  W=120s: avg 1463.2/s  end 2190/s  growth 18.25/s^2   curve 0 -> 966 -> 1735 -> 2026 -> 1898
  ```

  **Mechanism**: each Burn *instance* sheds exactly 1 layer per 0.5 s tick **regardless of its
  size**, so an N-layer instance lives `N/2` seconds. Basilord's 170-stack lives **85 s**. With a
  fresh application every 8 s, instances accumulate far faster than any one drains. A steady state
  does exist — aggregate decay scales with the number of live instances — but the *time to reach
  it* is on the order of the largest stack's lifetime, which exceeds a real battle. The curve above
  only begins to flatten at a 120 s window.

- **The corrected Poison-vs-Burn distinction** is therefore quantitative, not binary:
  - **Poison** grows **without bound, forever** — its stacks never decay, so there is no steady
    state at any window length.
  - **Burn** grows **throughout any realistic fight** and plateaus only in principle. Only a small
    burn stack settles quickly.

  Both warrant the growth column. The original framing ("Poison grows, Burn doesn't") would have
  told fire-build users their scaling was flat when it is not.
- **Why Poison in particular**: `applyStatusTick` decrements layers for **Burn** but explicitly
  **not** for Poison (research.md B2) — "Poison: layers do NOT decrease from the act of ticking".
  So every Poison application permanently adds its full amount to a per-tick damage floor, and the
  rate grows without bound. Burn self-limits (a stack of N deals N+(N−1)+…+1 and expires). Shock
  layers also never decay, so Shock grows too, but only on direct hits.
  **This difference is the whole reason a second-order metric is needed, and it is a property of
  the modelled mechanics, not a reporting preference.**
- **Blocking gap found while measuring this**: `simulate()` pushes an `ongoingChange` timeline event
  for Shock and Shield applications but **not for Burn or Poison** — those only ever appear in the
  timeline as *ticks*. So "stacks applied per second" is not derivable from the timeline today.
  Fixing that is a prerequisite, not an optional extra.
- **Decisions**:
  1. Record Burn/Poison applications in the timeline, closing the asymmetry above.
  2. Add **applied-per-second** per status (stacks/s) — exact, unambiguous, and the direct answer
     to "how much is being added per turn".
  3. Add a **growth rate (damage/s²)** per status — computed **exactly**, not by curve-fitting.
     A first draft of this plan proposed a least-squares slope over 1-second buckets; that was
     rejected on measurement. For a non-decaying status the damage rate at time *t* is simply
     `live layers(t) / tickInterval`, so
     `growth = (rate at window end − rate at window start) / windowSeconds` is exact, deterministic,
     and needs no fitting. The regression alternative was **noisy against a known-exact answer**
     (2.83 and 2.70 for a case whose true asymptotic growth is 2.50), sensitive to bucket-edge
     placement, polluted by the zero-damage startup period, and produced `NaN` at a 1-second
     window — which the UI permits. Exact arithmetic has none of those failure modes.
  3b. Also expose the **end-of-window damage rate** alongside the window average. This is the most
     directly interpretable form of the same information ("65.33/s average, but 140/s by the end"),
     and it is what makes the growth figure legible rather than abstract.
  4. **Attribute status damage to the creature that applied it**, so a pure DOT applier stops
     reporting 0.00 / 0.00. `activeStatuses` already carries `sourceSlot`; it needs the creature id
     too, and each tick's damage then accrues to that creature's facilitated total — the same
     `facilitatedDamage` map Shock procs already use. This directly implements the user's worked
     example (20 poison applied three times, ticking 3×, 2×, 1× times respectively).
- **Scope boundary kept explicit**: facilitated DPS remains *separate* from own-DPS rather than
  being folded into it. A Poison applier's value genuinely is not direct damage, and merging the
  two would make a DOT team's DPS column incomparable with a direct-damage team's.

### I14. Standing requirement: a shared design system, applied retroactively and to all future work

The user's most consequential item, and deliberately scoped beyond this round: *"please also take
it into consideration for all future requests/changes/tasks, not just for the code base existing up
until this request was made."*

**Current state, measured rather than asserted** — `style={{` occurrences by file:

```text
CreatureSearchModal 14 | BatomonCard 3 | PlacedCreatureDetails 3 | TrinketPicker 3
GridPicker 2 | App 2 | TypeTag 1 | Sprite 1 | TeamSummary 1 | CumulativeChart 1
```

Concrete duplication this has already produced, each of which is a bug the user reported this
round: three independent "card" treatments with different borders/radii/padding; two different
cooldown formatters disagreeing on decimals (I4); modal chrome duplicated between the creature and
trinket pickers; chip/tag styling defined separately in `TypeTag`, the modifier chips, and the
trinket badges; and six call sites each passing their own literal sprite size (I11).

- **Decision**: introduce a primitives layer — design tokens as CSS custom properties (spacing,
  radii, surface colours, border colours, type scale, sprite sizes) plus a small set of components
  (`Surface`/`Card`, `Chip`, `StatBadge`, `Modal`, `Disclosure`, `SectionHeading`, `TypeSplit`) —
  and migrate the existing UI onto it. Not a component *library* dependency: this is ~7 local
  components over the existing CSS-modules approach (research.md A4), which keeps Principle VI
  satisfied — each primitive has at least two existing call sites today, so none is abstraction
  ahead of need.
- **Decision**: make it **binding on future work** by amending the Constitution with a new
  principle rather than leaving it as a round-7 note. The Constitution is what `/speckit-plan` and
  `/speckit-implement` already read every round; a task-list note would be forgotten by round 8.
  This is a MINOR version bump (principle added) per the Governance section's own rules.
- **Honest limit**: this round migrates the surfaces it already touches plus the worst offenders.
  A full migration of every file is not attempted in one pass, and the remainder is recorded as
  explicitly outstanding rather than implied complete.

## J. Round 8 (2026-10-06, via `/speckit-orchestrate`) — primitives defects, display-layer sorting, DPS-rate chart, placement optimiser

Eighteen atomic work items (ledger: `orchestration/round-1-items.md`). Most are fallout from round
7's own primitives work — which is itself the finding worth leading with.

### J1. WI-003 answered: yes, the picker uses the shared components — and that was not enough

The user asked directly whether the picker uses the reusable components "as they should". **Answer:
yes — `Modal`, `CardGrid`, `CreatureTile`, and `TypeSplit` are all the shared ones.** Composition was
not the problem. Two other things were, and they are worth separating because they fail differently:

1. **The shared component itself was broken.** `CreatureTile` passes `styles.creatureTile`
   (`display: flex; flex-direction: column`) as `className` to `TypeSplit`, which puts it on the
   **host** element — but the children are rendered inside `TypeSplit`'s own `.typeSplitContent`
   wrapper, a plain block that shrinks to its content. So the flex column never governs the art and
   name at all: `.creatureTileArt`'s `flex: 1` has no effect, the name band lands directly under the
   sprite instead of at the bottom, and the bare coloured halves show through the remaining height.
   That is exactly SS1. **Using a shared component bought consistency, not correctness — every call
   site inherited the same defect.**
2. **The call site bypassed the token.** The picker passes `spriteSize={48}` as a literal, so WI-001's
   "still not 64×64" is a token-discipline violation that Principle VII is meant to prevent, sitting
   right next to correct usage.

**Decision**: `TypeSplit` must apply layout classes to the element that actually contains the
children, and `CreatureTile` must default to the sprite token rather than a magic number. Both fixes
land in the primitive, so every consumer benefits — which is the upside of the shared layer, now that
the downside has been paid.

### J2. WI-004/WI-005 — the user's diagnosis is half right, and the real cause matters more

The user said the two "3.0 SEC" blocks "should be the same reusable component with a different value
provided to it". **They already are**: `CooldownBlock` is one component, used by both bands. So the
stated fix was already in place and the symptom persisted anyway.

**Real cause**: `CooldownBlock` has no intrinsic size. `.cooldown` sets `min-width` but no height, so
it inherits whatever its parent's layout imposes — in the base band the parent `.output` carries
`min-height: 5.5rem` (from round 7's `.cardFixed` reservations) and stretches it; in the effective
band the parent is a plain flex row with no min-height, so it stays short. Same component, two
heights, entirely decided by context.

**This is still a design-system failure, just not the one named**: a primitive whose appearance is
determined by its parent is not actually reusable. **Decision**: give the block a fixed intrinsic
size and `align-self: start` so it renders identically wherever it is placed. Generalized rule for
Principle VII: a primitive must look the same in every container, or it is a fragment, not a
primitive.

### J3. WI-007 — the width shift and the chart redraw are the same bug

The selected-creature column is `flex: 1 1 16rem`, so its width is computed from its content. Round 7
fixed the card's *height* and explicitly left width flexible ("freezing the width would fight the page
layout" — I3). The user has now asked for a fixed width, and that is the right call: a
content-derived width means a longer creature name or ability text visibly resizes the column.

**CORRECTION (validation pass 1, retained here rather than only in the task):** this section first
claimed the column's width "changes the sibling chart's width, which makes Recharts'
`ResponsiveContainer` re-measure and redraw", and concluded the reflow and the redraw were one bug.
**That mechanism is not supported by the DOM.** `#root` is a fixed `width: 1126px`
(`src/index.css:55-57`) and `CumulativeChart` — while a sibling of the flex row in the `.App` tree —
is not a flex *item inside* that row, so its width is already independent of the column's basis.

**Decision**: fix the column's width via a new `--detail-panel-width` token, which resolves the
visible reflow (FR-062). **Do not assume it cures the redraw.** If the redraw persists, the cause
lies elsewhere — most likely `result` being recomputed on every config change, or a scrollbar
appearing as page height changes — and should be investigated separately rather than the item being
declared done.

### J4. WI-014 vs FR-014 — the version stamp is now homeless, and this is the second time

Round 7 removed the corpus/patch prose from the app header (FR-050) and **moved it into the Corpus
Browser's summary line** specifically so FR-014 ("state which corpus/patch snapshot is active") kept a
home. WI-014 now asks to remove it from there too.

- **This cannot be silently dropped.** Doing so would leave FR-014 unmet with no surface at all —
  precisely the failure a review caught in round 7 before it shipped.
- **Decision**: honour the user's ask (the prose goes) and **narrow FR-014 again, explicitly**, to a
  single unobtrusive footer line. The user's objection both times has been to *prose at the top of a
  view*, not to the version being recorded anywhere. A footer satisfies the requirement's intent
  without reintroducing what they asked to remove.
- If a future round removes that too, FR-014 should be **retired outright with a stated rationale**
  rather than quietly unmet.

### J5. WI-016 — sorting must move to the display layer, and the ask is site-wide

The user's diagnosis is exactly right: `distinctCreatures` is
`corpus.creatures.filter((c) => c.level === 1)`, which preserves **file order**. `creatures.ts` opens
with the six original seed records (Bumblebolt, Formiqueen, Venopuff, Scorchimp, Pebbler, Onsetra)
and only then runs alphabetically — which is precisely the "first 6 are not alphabetical" pattern in
SS5.

- **Scope correction**: the ask says "the lists **anywhere** in this site". The Corpus Browser is the
  visible offender, but the fix must be systemic, and an audit of every list surface is part of the
  work, not just the one screenshot.
- **Decision**: sort at the point of display. `distinctCreatures` is sorted by name once so every
  consumer inherits a deterministic order regardless of file order, and surfaces that want a
  different grouping (the picker's rarity sections) keep their own explicit sort on top. Relying on
  file order anywhere is the defect; a corpus edit must never be able to change display order.
- The user also asked for organisation "in types or in an alphabetical manner" — alphabetical is the
  safe default since type is already a filter; a type grouping would fight the existing Type control.

### J6. WI-017 — a DPS-rate chart is a genuinely different view, not a restyle

The existing chart plots **cumulative** damage, which is monotonic and therefore cannot show the
"ebb and flow" the user wants. A rate chart answers a different question: how hard is the team hitting
*at this moment*.

- **Decision**: a second chart plotting instantaneous DPS against time, derived from the same
  `timeline` the cumulative series already uses — damage bucketed into fixed intervals and divided by
  the interval. Same single-source-of-truth rule: it must not recompute anything `simulate()` didn't
  produce.
- **Why this pairs with round 7's work**: the status table now reports end-of-window rate and growth
  as *numbers*; this is the same information as a curve, and it is where a Poison or Shock ramp
  becomes legible at a glance.
- **Bucket choice matters and must be stated**: too fine and the chart is a comb of spikes at each
  cast; too coarse and the ramp flattens. A 1-second bucket matches the Poison tick interval and the
  per-second framing used everywhere else in the UI.

### J7. WI-018 — the placement optimiser is feasible, but only honestly at a stated scope

The user pre-flagged this as "a bit too far out". It is implementable, with a real caveat:

- **Search space is trivial**: ≤6 creatures in 6 slots = at most 720 permutations, and `simulate()`
  is fast. Exhaustive search is viable with no heuristics.
- **The objective must be time-weighted**, as the user argued: raw total damage over the window
  over-rewards a slow Poison ramp that may arrive after the team is dead. **Decision**: score with an
  exponential decay on damage timing, so earlier damage counts for more, and expose the weighting so
  the user can see what it optimised for rather than trusting a black box.
- **The honest limitation, which must be stated prominently rather than buried** — **with a count
  corrected in validation, because the first version of this paragraph was wrong in a way that would
  have propagated into the UI.** It originally read "only one creature has an engine-read positional
  ability … the chaining effects the user describes have no `AbilityTag`". In fact **two** creatures
  carry positional-target tags: Formiqueen (`adjacent`, 8 tag instances across its four level
  records) and **Onsetra** (`behind`, `extraOngoingApplications: 1`) — and Onsetra's ability text,
  "the ally behind applies its Ongoing abilities 1 additional time", is *literally one of the
  chaining effects the user described*. What is true is narrower: `simulate.ts:107-108` reads **only**
  `cooldownSpeedModifier` tags, so Onsetra's tag is present, correctly typed, and silently ignored —
  and Onsetra's level 2-4 records have empty `abilityTags` at all, so the count is level-dependent.
  **Why the distinction is load-bearing rather than pedantic**: FR-069 requires the UI to report how
  many placed creatures the optimiser can reason about. Implemented as "has a positional tag" it
  would report a reassuring **2** for a team where only **1** is actionable — the exact misleading
  outcome the requirement exists to prevent. The count must derive from what the engine acts on.
  Positional **trinkets** are a second blind spot: six slot-scoped trinket effects exist (Quick Flag,
  Earth Crest, Power Crown, Rally Flag, Link Cable and others), several altering Cooldown Speed or
  Damage — the optimiser's own objective — and none carry `abilityTags`. **An optimiser today would
  therefore report "no improvement found" for almost every team, and that is a corpus-coverage
  limit, not an optimiser bug.** Shipping it while implying otherwise would be worse than not
  shipping it.
- **Decision**: build it, and have it state its own blind spot in the UI — reporting how many of the
  placed creatures have positional abilities it can actually reason about. That turns a misleading
  "no suggestions" into an informative one, and makes the corpus gap visible rather than hidden.

### J8. The rest (WI-006, 008, 009, 010, 011, 012, 013, 015)

Bounded presentation changes with no design tension: drop the `Unconfirmed: shopCost` marker; give
the summary tables a bottom border matching their other edges; remove the "Batomon Stats" heading and
align the card's top with the grid; remove the per-slot `<details>` dropdown fallback; move Modifiers
between the grid and Team Summary; drop the Modifiers em-dash hint; give browser cards a uniform
height (round 7 deliberately left `fixedHeight` off there — I3 — and the user has now asked for the
opposite, so that decision is reversed, not forgotten); rename the view to "Batomon Browser".

One note on removing the per-slot dropdown (WI-010): it was added in round 3 as the
keyboard/screen-reader fallback for the drag-and-drop picker (research.md E2.5). Removing it is fine
**because round 7 restored click-to-open** — Enter/Space on a slot opens the picker, so the accessible
path survives. Worth recording so a future round doesn't "restore" it as a regression fix.

## K. Round 9 (2026-10-06, via `/speckit-orchestrate`) — the effect-resolution engine, total DPS, and a confirmed accuracy gap

Nine atomic work items (ledger: `orchestration/round-2-items.md`). The user's central claim — "I
think currently, the DPS measurement is off" — **is correct**, and this section quantifies it.

### K1. WI-001 — the icon shrink is a direct regression from round 8's own fix

**CORRECTED DIAGNOSIS.** The first version of this section blamed flex shrinkage from round 8's
rigid sibling. Validation rejected it on three counts, all verifiable: the container is
`flexWrap: "wrap"`, so a rigid 22rem sibling wraps to a new line rather than squeezing its neighbour;
`Sprite` emits fixed `width`/`height` attributes with `flexShrink: 0` and no `max-width`, so a
narrower pane **clips** it and cannot scale it; and `.grid` has no `width` or `flex-grow`, with
`max-width: 30rem` acting only as a cap.

**The actual cause is round 8's T183**, which deleted the per-slot `<details>` fallback containing a
`<select>` of every creature name. That `<select>` was the widest content in each column and was
what gave `.grid` its intrinsic width — `.grid` is `repeat(3, 1fr)` with a content-derived basis, so
removing it collapsed every column to the next-widest content. The sprites did not shrink; their
containers did, and `overflow: hidden` did the rest.

- **Decision**: give `.grid` an explicit `width`/`min-width` in `GridPicker.module.css` rather than a
  flex keyword in `App.tsx`. A flex keyword leaves a content-derived basis unchanged and would fix
  nothing.
- **Lesson, corrected**: the first diagnosis was plausible and wrong. Removing an element changes the
  layout of everything that was sized by it — T183 verified the dropdown was gone and not what had
  depended on its width.

### K2. WI-006/WI-008 answered, and the "DPS" column is genuinely misleading

Simulating the user's exact team (Miasmaw, Cobrex, Drumire, Fumungus):

```text
perCreatureDps:            {}            <- EMPTY. Every creature reads 0.00
perCreatureFacilitatedDps: fumungus 17.10, miasmaw 28.50, drumire 16.00, cobrex 75.00
direct total 0.00 | facilitated total 136.60 | combined 136.60
perStatusPerSecond.Poison  136.60         <- exactly equals the facilitated total
```

- **The user's parenthetical is right**: `perCreatureDps` counts **direct damage only**
  (`perCreatureDamage` is incremented solely on `isDirectHit`), so an all-status team shows `0.00`
  across the DPS column while actually dealing 136.6 damage/second. A combined figure is not a
  convenience, it is a correctness fix for how the table reads.
- **Useful confirmation, with one exclusion that matters**: facilitated total **exactly** equals
  `perStatusPerSecond.Poison`, and direct + facilitated is a complete, non-double-counting partition
  of all **damage** — `perCreatureDamage` takes only `isDirectHit` damage, `facilitatedDamage` takes
  exactly the status-tick damage plus Shock-proc damage split by shares that sum to the whole proc.
  **But `perStatusPerSecond.Shield` is Shield *granted*, never damage**, and never enters
  `facilitatedDamage`. A headline that naively sums the whole `perStatusPerSecond` record would
  therefore inflate any Shield team. Sum direct + facilitated; do **not** sum the status record.
- **WI-008 answered precisely**: Cobrex has a 15 s cooldown and applies **Poison 300**. Its *first
  cast lands at t=15*. Poison never decays, so the per-second rate steps from **84/s at t=15 to
  400/s at t=16** and stays there. The takeoff is one creature's opening cast, not an artifact.
  ```text
  t=12 68 | t=13 84 | t=14 84 | t=15 84 | t=16 400 | t=17 420 | t=18 420
  ```

### K3. WI-003/WI-004/WI-009 — the accuracy gap, measured

**Every one of the four creatures on the user's board has an unmodelled ability**, and three of them
change DPS materially:

| Creature | Ability text | Modelled? | Effect if modelled |
|---|---|---|---|
| Miasmaw | "Gain Poison … equal to 1x the total Poison of your allies" | **No** | Poison 10 → **336** |
| Cobrex | "Whenever an ally inflicts Poison, Charge this by 1 second(s)" | **No** | First cast t=9-10 instead of t=15 |
| Drumire | "When a Toxic ally casts, give it +5% Cooldown Speed for this battle" | **No** | Compounding team speed-up |
| Fumungus | "Has additional Damage equal to 100% of the Poison stacks on the enemy" | **No** | Gains real *direct* damage |

Cobrex's is the most dramatic and directly answers WI-008's follow-up — **with a correction, because
the first version of this paragraph got the arithmetic wrong twice.** Allied Poison applications land
at t = 3, 3, 6, 6, 8, 9, 9, 12, 12 (Miasmaw and Fumungus every 3 s, Drumire at 8 s), which is **9
applications strictly before t=15**, not 11: the first draft counted the two landing *at* t=15.

It then compounded that by computing the fire time as `15 − 11 = 4`, which credits Cobrex with
charges that have not happened yet at the proposed fire time. The charge mechanic has to be solved,
not subtracted: Cobrex fires at the first `t` where `t + charges(t) ≥ 15`.

```text
t=8:  5 charges -> progress 13   (not yet)
t=9:  7 charges -> progress 16   -> FIRES
```

So modelled, Cobrex's first cast lands at **t=9**, not t=4 — still a large shift from the unmodelled
t=15, and still confirming the user's suspicion, but the number a test pins must be 9.

- **Decision**: build a resolution layer (`src/engine/effects.ts`) that computes each creature's
  effective stats after on-battle-start, ally-triggered, positional, and trinket effects, and have
  `simulate()` consume it. `perCreatureEffectiveStats` then reports resolved values, which is what
  makes the "Effective this battle" band truthful (WI-003's acceptance criterion: **Poison 336**).
- **Supporting the new effect families needs new `AbilityTag` kinds**: a battle-start status grant
  scaled from allies' totals, a cooldown charge triggered by an ally event, a cooldown-speed grant
  triggered by an ally cast, and damage scaled from a status on the target.

### K4. The honest ceiling on all of this, stated before building it

**Only 6 of 149 level-1 creatures have *any* `abilityTags` at all.** An effect engine can only act on
structured tags, so building it does not retroactively make 143 creatures' abilities work — their
effects exist solely as prose in `abilityText`.

- **Decision**: build the engine *and* populate tags for the creatures this round exercises, then
  state the coverage figure plainly in the UI and README rather than letting a working engine imply
  full coverage. This is the same honesty rule round 8 applied to the placement optimiser (FR-069),
  and it matters more here because a DPS number *looks* authoritative in a way an empty suggestion
  list does not.
- **Explicitly not claimed**: that this round makes DPS correct for arbitrary teams. It makes it
  correct for teams whose creatures have tags, and makes the gap visible for the rest.

### K5. WI-005/WI-007 — consequences that fall out of K3

- **WI-005**: the placement optimiser already calls `simulate()`, so once `simulate()` consumes the
  resolution layer the optimiser inherits positional and trinket effects for free. What must change
  is `analyzePositionalCoverage()`'s count, which currently reports only `cooldownSpeedModifier`
  as actionable — it has to track whatever the resolver actually handles, or it will understate.
- **WI-007**: the slider is a UI-only addition over `dpsRateSeries`, which already exists. The
  headline number at time *t* is that series' value, so it agrees with the DPS-over-time chart by
  construction rather than by a second computation.

### K6. Official Steam patch notes located — and the corpus is now a full version behind

The user pointed at the official Steam announcements. `WebFetch` returned only the page title (the
body is JS-loaded — the same limitation round 5 hit, research.md G1), but Steam's **news API**
returns the full body as JSON:

```text
https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=4557380&count=8&maxlength=20000
```

This is a far better corpus source than the fan dex and should be the primary one going forward.

**Finding 1 — the tie-break question has partial evidence, and it does not settle our case.**
Patch 1.1.0 contains an explicit simultaneity rule:

> "Ties now resolve in the order the casts were queued, which is your side first."

That governs **which side** acts when both have a monster due on the same instant. Our engine models
one team against an idealised target, so side-priority never applies, and nothing in any of the eight
published patches states whether a Charge applied *at* instant *T* counts toward a trigger *at* *T*.
**Per the user's instruction — "whichever matches the real game if you can find evidence; otherwise
FR-040 consistency" — the evidence does not reach this case, so T200b pins t=10**, consistent with
round 6's pre-timestamp snapshot rule. Recorded as "searched, not found" rather than "no rule exists".

**Finding 2 — "Charge" is a first-class game stat**, confirming WI-009 is a real mechanic and not
prose: patch 1.1.0 lists "Clawnetic — **Charge**: 1/2/3 seconds → 1 second at every level".

**Finding 3 — the game itself shipped our WI-003 bug.** Patch 1.2.0: *"Fixed the monster inspect
sheet opened during a battle showing pre-battle numbers instead of the live numbers."* That is
precisely the defect the user reported in our "Effective this battle" band — independent
corroboration that resolved-not-base values are the correct behaviour.

**Finding 4 — and the one with the widest consequence: our corpus is stale.** It is pinned to
**Balance 24 / 1.2.0**; **patch 1.3.0 shipped 2026-10-06** with 15 balance changes to creatures we
carry:

```text
Opalion   cd 9 -> 6, Rock allies triggered 2 -> 1   Petrirex  cd 7 -> 5.5
Steamscuttle cd 3 -> 3.5                            Kappow    cost 30 -> 25, cd 4.5 -> 5.5
Aviarab   cost 20 -> 25                             Dollhime  dmg/trinket 40/80/120 -> 50/100/150
Mallogre  cd 9 -> 8                                 Danuki    cost 50 -> 45
Sarudo    cost 35 -> 25                             Guardiant dmg/Bug 7/14/21 -> 8/16/24
Noxnimbus cd 4 -> 3                                 Lignite   burn mult x15/30/45 -> x20/40/60, cd 4 -> 5
Stalagrove cd 5.5 -> 4.5                            Aegistruct cd 7 -> 6
Geminiss  cd 12 -> 10
```

Every DPS number this tool reports for those creatures is now computed from superseded values. This
is **not** in round 9's ledger — the user did not ask for it — so it is recorded here as a finding
for the next round rather than silently folded into this one, along with the recommendation to make
the Steam news API the corpus's primary source.

## L. Round 10 (2026-10-06, via `/speckit-orchestrate`) — the full ability-mechanism audit, and what "100% support" can honestly mean

Twelve work items (ledger: `orchestration/round-3-items.md`). WI-010/011/012 dominate: the user
asked for a deep research pass over every interaction type, an audit of what works, and then 100%
coverage. That audit is below, and it changes what the rest of the round can promise.

### L1. WI-010 — the mechanism taxonomy, derived from the data

The game tags its own abilities with a trigger, which this corpus captured in round 6 as
`abilityTrigger`. Grouping all 135 level-1 creatures that have ability text:

```text
On Cast 42 | (no trigger) 40 | On Battle Start 20 | Ongoing 15 | On Victory 8
On Bought 5 | On Trinket Gained 2 | On Knocked Out 2 | On Battle Lost 1
```

Classifying by what the effect *does* rather than when it fires yields **17 distinct mechanism
families**:

| Mechanism | Creatures | Tagged | Unsupported |
|---|---:|---:|---:|
| Unclassified (mostly simple self-buffs: "+15 Shield for this battle") | 49 | 3 | 46 |
| Evolution note | 12 | 1 | 11 |
| Shop / economy | 10 | 0 | 10 |
| Knockout effect | 9 | 0 | 9 |
| Adjacency aura | 8 | 1 | 7 |
| Positional grant ("ally behind") | 8 | 1 | 7 |
| Count scaling ("for each Trinket you own") | 7 | 0 | 7 |
| On-battle-start team grant | 6 | 1 | 5 |
| Multicast grant | 6 | 0 | 6 |
| Cooldown-speed grant | 4 | 0 | 4 |
| Trigger-chaining ("Trigger this when…") | 4 | 0 | 4 |
| Row-wide effect | 3 | 0 | 3 |
| Enemy-state scaling ("% of the Poison stacks on the enemy") | 3 | 0 | 3 |
| Ally-event charge | 2 | 1 | 1 |
| Ally-stat scaling | 2 | 0 | 2 |
| Ally-cast grant | 1 | 1 | 0 |
| Self-stat scaling | 1 | 0 | 1 |
| **TOTAL** | **135** | **9** | **126** |

### L2. WI-011 — the audit result, with a correction that makes it worse

**CORRECTED IN VALIDATION.** This section first said "9 of 135 are modelled", which conflated
*tagged* with *working* — the exact distinction the user asked for ("audit what abilities currently
are working and calculated"). A creature can carry a structured tag that no engine code reads.

Counting what the engine **actually resolves** (`battleStartStatusFromAllies` and
`chargeOnAllyStatus` in `effects.ts`; `cooldownSpeedModifier` in `simulate.ts:109`):

```text
level-1 creatures                         149
  with real ability text                  135
  carrying any abilityTags                  9
  ACTUALLY RESOLVED BY THE ENGINE           3   <- formiqueen, cobrex, miasmaw
  unsupported                             132
```

So the real figure is **3 of 135**, not 9. The other six tagged creatures carry kinds
(`statusGrant` ×4, `ongoing` ×2, `cooldownSpeedOnAllyCast`) that **no engine code reads** — the tags
are inert decoration. L1's table column is therefore relabelled "Tagged", and a separate "Resolved"
count is what any coverage figure must report. Trainers (23) and trinkets (93, of which 6 have
`effectTags`) are additionally almost entirely unmodelled and are **not yet taxonomised at all**.

This also means **the UI's current "2 of 5" is itself computed from the wrong predicate** —
`analyzePositionalCoverage` counts tags, not resolved kinds — and must be fixed alongside.

### L3. WI-012 — "100% support" is the right goal with one honest correction

**Roughly 22 of the 135 are not battle calculations at all** and should never be "supported" by a
DPS engine: 10 shop/economy effects (free purchases, gift rarity, sell value) and 12 evolution
notes. Excluding them is not a dodge — it is the project's own long-standing scope decision
(research.md B6), and counting them toward a coverage denominator would make the figure meaningless.

- **Decision**: the target is **100% of battle-relevant mechanisms** (~113 of 135), with
  shop/economy and evolution explicitly excluded **and counted**, so the excluded set is visible
  rather than quietly dropped from the denominator.
- **Decision on sequencing, which matters more than it sounds**: coverage is limited by two
  different things — the *engine* understanding a mechanism family, and each *creature* carrying a
  structured tag. There are 17 families but 126 untagged creatures. Building the 17 families is
  bounded, well-specified work; tagging 126 creatures is bulk data entry that scales linearly and
  has twice produced silent misalignment (research.md H11, and the level-1-only tag bug found in
  round 9b). **The families come first, then tagging proceeds family by family with the round-9b
  per-level guard already in place.**
- **Honest limit recorded before any work starts**: this round will not reach 100%. It can deliver
  the mechanism families and a meaningful fraction of the tagging. The coverage figure already shown
  in the UI is the right instrument — it should go up visibly and keep being told truthfully.

### L4. The bounded bugs (WI-001 … WI-009)

- **WI-001 (missing Heal chip)**: `SlotBadges` reads `baseDamage`, `appliesStatus`, and
  `baseMulticast` — Heal lives in `healAmount`, so it was never considered. Straightforward.
- **WI-002 (missing Multicast chip) — the first diagnosis was wrong, and the real cause is much
  bigger.** Puffloon's level-2 record *does* carry `baseMulticast: 2` (verified), so the
  `multicast > 1` gate would pass. The actual defect is at `GridPicker.tsx:272`:
  `getCreatureById(placement.creatureId)` returns the **first matching record — always level 1** —
  and ignores `placement.level` entirely. **So every chip on every levelled creature shows level-1
  stats**, not just Multicast. The user reported the one case they could see; the bug is corpus-wide
  and silent everywhere else, because most stats happen to look plausible at any level.
- **WI-003 (modifiers don't reach the chips)** — **this directly contradicts the previous round.**
  Round 9b changed the chips to base stats at the user's explicit request ("it should reflect his
  base stats, not his effective stats"). The resolution: **base stats plus the user's own manual
  modifiers**, excluding resolved ability effects. The distinction the user actually drew was
  between *the creature's printed card* and *what the battle computes*; a modifier they typed in
  themselves is neither — it is an input they expect to see reflected. Also note `+50 damage` on
  Puffloon legitimately does nothing (`baseDamage: null`, and a modifier may only scale an effect
  that exists) — the UI must say so rather than silently ignoring the input.
- **WI-005/WI-006**: `cooldownSpeedOnAllyCast` is recorded as a tag but never applied, and
  trigger-chaining has no tag kind at all. Both need the event loop to emit an "ally cast" event
  that other creatures can subscribe to — the same hook, so they should be built together.
- **WI-007 (Fumungus)**: round 9 deferred this for want of a modelled target. The minimum needed is
  a per-status stack counter on the shared implicit target, which the engine already effectively
  tracks for Shock (`shockLayers`) and could track for Poison the same way. That is a much smaller
  change than a full target entity, so the deferral no longer holds.
- **WI-009 (slider vs chart at t=0)**: the slider's "whole window" default shows the window
  *average* while position 0 reads as "t=0". They are different quantities, not a disagreement —
  the control is mislabelled rather than miscalculated.

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

### L5 — Why the "Unclassified" bucket resisted classification (round 10, found during T219)

The round-10 taxonomy's largest row was a 49-creature "Unclassified" catch-all. Sampling it while
looking for creatures to tag showed it is not a grab-bag at all — it is **one coherent mechanism the
resolver structurally cannot express**:

| Creature | Ability text | Trigger |
|---|---|---|
| Mosslug | "+20 Damage for this battle." | **On Cast** |
| Bonshell | "+80 Damage and +80 Shield for this battle." | **On Cast** |
| Aerophim | "Give adjacent allies +1 Multicast permanently…" | **On Cast** |
| Shelldra | "Every 4 seconds, +1 Multicast for this battle." | periodic |

These read like static self-buffs, which is why they were first classed as "+N for this battle"
one-shots. They are not. The trigger is **On Cast**, so the bonus **accumulates every time the
creature fires**: Mosslug is at +20 after its first cast, +40 after its second, and so on. "For this
battle" scopes how long the bonus persists, not how often it is granted.

`effects.ts` is a **pre-battle static resolver** — it runs once, before `simulate()` starts, and
returns fixed effective stats. It cannot represent a stat that changes during the window. So this
family needs the **simulation loop** (a per-cast buff application mutating the acting creature's
effective stats mid-battle), not another resolver pass.

**Consequences for the round-10 plan, which assumed otherwise:**

1. T218(a) proposed splitting "Unclassified" into `self-buff-for-this-battle` / `self-buff-permanent`
   / `team-buff-permanent`. That split is along the wrong axis — the distinction that matters is
   **one-shot vs per-cast accumulating**, and nearly all of them are the latter.
2. T219 listed "self-buff families" as in-scope for the selector-based resolver. They are not
   reachable from it at all.
3. This is also why the corpus had **16 tags restating `appliesStatus`** (see
   `families.test.ts`'s guard): a previous pass tried to encode these accumulating buffs as static
   grants, which is both wrong and a double-count the moment a resolver acts on them.

**Estimated reach**: accumulating On-Cast buffs appear in roughly 40 of the 49 unclassified
creatures, making this the single largest unlocked family in the corpus — larger than all seven
selector families combined. It is a well-defined piece of work, but it is engine work in
`simulate.ts`, and it was not scoped this round.

> **The "roughly 40" above is RETRACTED — the real figure is 14** (round 11, measured while
> implementing T224). The 40 came from counting creatures whose ability *text* matched a loose
> buff-like pattern. Counting the thing that actually defines the family — `abilityTrigger ===
> "On Cast"` **and** a `+N <stat>` grant in the text — gives **14 species**:
>
> | | species |
> |---|---|
> | self-buff, accumulates on the holder | mosslug, bambudo, pebbler, bonshell, pyrokami, galvanine |
> | **grants to an ally** (positional) | magmalith, noxalith, voltalith, zephyrex, saberhorn, noxnimbus, aerophim |
>
> (The prose above says 14; the rows sum to **15**. The rows are correct — corrected 2026-10-06
> in pass-2 remediation of the round-4 orchestration.)
> | other mechanism | petrirex (knockout), prismagon (unique-type count) |
>
> Two things follow, and both cut against what L5 originally concluded:
>
> 1. **Half the family is positional, not self-targeted.** "Give the ally above +2 Burn
>    permanently" is a `buffOnCast` with a *selector* — so T219's selector work and T224's
>    accumulation work compose, rather than being alternatives. Seven species were unlocked by
>    having both, and neither alone would have done it.
> 2. **It is not larger than the seven selector families combined.** That claim followed from the
>    inflated 40 and does not survive the recount.
>
> Still untagged after round 11, and why: **pebbler, bonshell, pyrokami** grant a status they
> *already apply* ("+15 Shield" against `appliesStatus` Shield 20), and whether those are one
> effect or two is genuinely unclear from the text — guessing wrong double-counts, which is
> exactly the trap that doubled Bumblebolt's Shock in round 10. **saberhorn** grants +1 Multicast
> but also adds 8s to its own cooldown; tagging only the upside would overstate it. **aerophim**
> also transforms its targets into random monsters, which is unmodellable.

## M. Round 4 orchestration (2026-10-06) — Painter/Smuggler, regions, cascading buffs

### M1. WI-001: our recorded Painter ability is WRONG, and the user's description is right

`src/data/trainers.ts:186-188` records Painter as:

> "Your monsters gain +1 to all stats for each different type they have (dual-typed monsters get a
> bigger bonus than single-typed ones)."

That is not Painter's ability. It came from `batomonshowdowngame.wiki`'s trainer sheet, which is
why the record already carried `unconfirmedFields: ["abilityText"]` — the flag was correct and was
never followed up. Two independent sources agree with the user instead:

- `batomon-showdown-wiki.wiki/trainers/batomon-showdown-painter`: *"turns selected units into
  all-type monsters… Random species from the pool are selected to become 'painted'. Whenever these
  specific species appear in your shop or on your board, they possess every single typing
  simultaneously."*
- GamesFuze Season 1 guide: *"Painter's ability causes random species to be painted with every type
  during the run."*

**Decision**: replace the ability text. The superseded text is recorded here:

> "Your monsters gain +1 to all stats for each different type they have (dual-typed monsters get a
> bigger bonus than single-typed ones)."

*It was briefly carried on the record as `supersededText` and shown on the trainer card; both were
removed 2026-10-06 — on the card it was clutter, and an unrendered field is unread data. This
section is where the provenance belongs.*

### M2. WI-003 ANSWERED: which trainers designate a creature set

Scanned all 23 trainers for type-granting and set-designating language. The answer is **two
trainers need the picker, and a third grants types by rule and does not**:

| Trainer | Ability | Needs a 9-creature picker? |
|---|---|---|
| **Painter** | paints selected species with every type | **Yes** |
| **Smuggler** | "Batomon from other regions appear in your shop and cost 25% less" | **Yes** |
| Chef | "Your single-typed monsters gain Fire typing" | **No** — rule-based, derivable from the board |

The user's "at least 2" is therefore exactly 2 for the picker, and Chef is the item they suspected
existed but could not name. Steam's 1.2.0 notes corroborate the grouping: *"Added a visual effect
for Batomon that have additional types from Painter, Chef, events, etc."* — Painter and Chef are
named together as type-granting sources, and only Painter's is a selected set.

### M3. WI-004 ANSWERED: why the set is 9, and its composition

Community gameplay reports give the breakdown: *"the random assignment typically selects two
common, two uncommon, two rare, two super rare, and one legendary species"* — 2+2+2+2+1 = **9**.
This independently corroborates the user's "9 mons" and, more usefully, says the 9 are **not** a
free choice: they are constrained by rarity.

**Decision**: the picker enforces the 2/2/2/2/1 rarity shape as the DEFAULT but does not hard-lock
it. The breakdown is community-reported and the word used is "typically"; hard-locking a soft
constraint would make the tool unable to represent a run the user is actually looking at. The
shape is shown as guidance with an indicator when the selection departs from it.

### M4. WI-005 ANSWERED: the regions are **Pantra** and **Jinto**, not "starter" and Jinto

The user said *"two regions being 'starter' and 'Jinto'"*. The official Steam patch notes name the
original region **Pantra**:

> "At days 10+, median DPS of Jinto teams are almost 2 times higher than **Pantra** teams. I'm
> aiming to get the power level of all regions into a similar ballpark, so that I can implement
> more cross-region mechanics or game modes in the future."

"starter" was descriptive (the region you start with), not the in-game name. We use `pantra` and
`jinto` as ids and surface "Pantra" in the UI, because a user comparing against the game will see
Pantra, and Smuggler's "opposite region" is meaningless without the real names.

Jinto was added in 1.0.0 with "50+ new Batomon". Our corpus does **not** record a region per
creature, so region must be added to `CreatureRecord`. The patch note's "all regions" phrasing
leaves open that more regions exist or are planned; the model therefore treats region as an open
string union rather than a strict two-value boolean.

### M5. WI-009/010/011 ANSWERED: T226's ambiguity is resolved — the grant is ADDITIVE

Round 11 filed T226 because three creatures grant a status they already apply, and the text did not
say whether that was one effect or two. The user has answered it: **two effects**. The base
`appliesStatus` is what the FIRST cast emits; the ability grant accumulates on top from the second
cast onward. Checked against our own data, the user's numbers reproduce exactly:

| Creature | Base (cast 1) | Grant | Sequence |
|---|---|---|---|
| Pebbler | Shield 20 | +15 | 20, 35, 50, 65 … |
| Bonshell | Shield 100, cd 7.0s | +80 dmg / +80 shield | (0,100), (80,180), (160,260) … |
| Pyrokami | Burn 5 | +10 | 5, 15, 25, 35 … |

This is **exactly** `buffOnCast` with the FR-040 snapshot rule already built in round 11 (first cast
unbuffed, grant lands after the instant). So the mechanism needs no new engine work — only tagging.

**One real engine gap this does expose.** Bonshell's `baseDamage` is `null` and its `damageType` is
`null`, yet the user states it deals 80 damage from cast 2. `simulate()` currently short-circuits
`resolvedBase === null ? null : …`, and `isDirectHit` requires `damageType === "Direct"`, so an
accumulated buff can never bring damage into existence. data-model.md's "modifiers can only scale an
effect the creature already has" was written for USER modifiers and is correct for them; it must not
be extended to ability grants, which demonstrably do create damage. This is the one behavioural
change items 9-11 require.

### M6. WI-005 (revisited): region data EXISTS, and the two regions do not partition the corpus

Pass-1 validation found T229 had no source for attributing creatures to regions. It does now.
batodex's embedded payload carries a `sets` field per monster:

| `sets` value | species |
|---|---|
| `['starter']` | 56 |
| `['oshima']` | 56 |
| `['starter','oshima']` | **14** |
| `[]` | 13 |

**Three naming schemes are in play and they must be reconciled, not averaged:**

| Source | Original region | Second region |
|---|---|---|
| The user | "starter" | "Jinto" |
| Official Steam patch notes | **Pantra** | **Jinto** |
| batodex `sets` | `starter` | `oshima` |

**The tally does not cover the corpus**: 56+56+14+13 = **139**, but we hold **149** level-1
species. Ten are absent from batodex's payload entirely (it lists 144 monsters to our 149). Those
ten get `region: undefined` for the same reason as the 13 set-less ones, but for a different cause —
missing from the source, rather than present and unassigned. T229 must not conflate them.

`starter` is clearly the user's "starter" and the notes' Pantra — it is a descriptive id for the
region you begin with. `oshima` ↔ Jinto is an **inference, not a quotation**: the 1.0.0 notes say
Jinto added "50+ new Batomon" and `oshima` contains exactly **56**, which is the only second region
present and the only count matching. Recorded as an inference so a later contradiction is cheap to
find. Display names follow the official notes (Pantra, Jinto) because that is what the player sees.

**The complication, which changes the design**: 14 species are in **both** regions and 13 are in
**neither**. So "the opposite region" is not a complement — `opposite(starter)` is *not*
"everything that isn't starter". Smuggler's picker must offer species whose sets include the other
region and exclude the current one, and the 13 set-less species (events, fossils, shop-only) belong
to no region and must not appear under either. A naive `!== selectedRegion` filter would wrongly
offer all 27 of those edge cases.

### M7. WI-003 (boundary): why Mad Scientist and Monster Ranger are excluded

M2 concluded "exactly Painter and Smuggler" without recording what else was considered. Two further
trainers do designate creature sets that reach the board:

- **Mad Scientist** — "On day 7, transform monsters on your active team into random level 1
  Legendary monsters."
- **Monster Ranger** — "Start with an Uncommon monster. Get another copy of that monster every 2
  days."

Both are excluded, and the reason is **not** that they affect no creatures — it is that both are
scoped by *day*, and this engine simulates a single battle with no day counter (research.md B6
excludes shop/economy/run-progression). Neither designates a stable set the player could enumerate
for a given battle the way Painter's 9 and Smuggler's 9 can be. If a run-timeline model is ever
added, both return as candidates.

### M8. T223/T239 — coverage report after round 4

Regenerable via `npx vite-node scripts/audit-coverage.mjs` (T218), which imports `isResolvableTag`
rather than reimplementing it, so the script and the app cannot drift. This is the mechanism round
10 lacked when it published a figure that was wrong by 3×.

| | start of round 4 | end |
|---|---|---|
| battle-relevant abilities | 135 | 135 |
| **resolved by the engine** | **10** | **17** |
| carry a tag but are inert | 7 | **0** |
| structurally excluded | — | 40 |
| remaining unsupported | 125 | **78** |

Newly resolved: Bonshell, Drumire, Pebbler, Petrirex, Prismagon, Pyrokami, Saberhorn.

**Every tag in the corpus is now read by engine code.** The "inert tags" count — creatures carrying
a tag kind no resolver consumes — is zero for the first time. That number is the honest version of
"tagged", and conflating it with "resolved" is exactly the round-10 error.

**The shortfall is 78 of 135, and it is the headline, not the progress.** Of those, 40 are
structurally excluded (knockout-by-damage needs an HP model; shop/economy and evolution are out of
scope per B6), leaving ~38 that are reachable with more tagging and a few more mechanisms.

**Named deferrals**, so none is dropped silently:

- **Aerophim** — "+1 Multicast to adjacent allies **and transform them into random monsters of their
  rarity**". The transformation replaces a creature with an unknown one; no simulator of a known
  board can express it, and approximating it would fabricate output.
- **General knockout** — a creature dying to incoming damage. Petrirex's *self-inflicted,
  position-chosen* knockout is now modelled because its outcome is decidable before the first cast;
  the general case still needs an HP/death model.
- **v1.3.0 corpus refresh** — the corpus remains pinned to Balance 24 / 1.2.0 (K6).

## N. Round 5 orchestration (2026-10-06) — gameplay-capture handoff, triggers, shiny abilities

### N1. WI-014 ANSWERED: "all shiny mons get better" is right, but NOT at the stat level

The ask states *"All shiny mons get better stats/abilities than their normal counterpart."* That
contradicts committed, tested data — `shiny.ts` and `shiny.test.ts` pin that some shiny stat lines
are strictly worse — so it was re-measured rather than assumed either way.

**Per individual stat**, the claim is false. **7 species = 28 level-records** are worse:

| species | stat that regresses |
|---|---|
| Velocect | damage 15 → 8 (L1) |
| Kappow | cooldown 4.5s → **5.5s** (slower) |
| Plunderbird | heal 25 → 18 |
| Aristobat | poison |
| Lignite | cooldown |
| Steamscuttle | cooldown |
| Blazewing | burn |

*Corrected in pass-2 remediation: this said "20 level-records" and listed only 3 of the 7 species.
The undercount came from checking damage, multicast, heal and cooldown but **not status amounts**,
which is how Aristobat, Lignite, Steamscuttle and Blazewing were missed. Regenerate with
`node scripts/audit-shiny.mjs`.*

**In aggregate throughput** `(damage + statuses + heal) × multicast ÷ cooldown`, it is mostly true
but not universally: **222 better, 299 equal, 15 worse** (Kappow, Lignite, Steamscuttle). Velocect
resolves in shiny's favour once multicast is included — damage 15→8 but multicast 2→4, so 30/cast
becomes 32/cast.

**The 299 "equal" cases are the real finding, and they are an artefact of our own data.** Round 11
extracted `shinyLevels` (stats) and nothing else. batodex also carries **`shinyAbility`**, which we
never pulled — and the uplift is mostly there:

> **Bunchop L1 normal**: "Your team has +50 HP. / On Victory: Increase this ability's HP bonus by +50."
> **Bunchop L1 shiny**: "Your team has +60 HP. / On Victory: Increase this ability's HP bonus by +60."

**Shiny ability text differs at 343 of the 508 level-records that have both** (165 identical, 28
normal-only, 40 with neither). *Corrected during validation: the first draft said "315 of 470" and
did not reproduce. The cause was counting from an uncommitted `/tmp` extract that silently kept
RSC `$17:props:…` reference strings as if they were ability text. Both the extractor
(`scripts/extract-batodex.mjs`) and the recount (`scripts/audit-batodex.mjs`) are now committed, so
every figure in this section is regenerable.* So the user is right
about the direction of the effect and right that we are missing it; "better stats" is the part that
needed qualifying. Recorded both ways so neither the ask nor the committed guard is quietly dropped:
`shiny.test.ts`'s downgrade guard stays valid and must NOT be deleted to make the ask true.

### N2. WI-010 ANSWERED: the trigger vocabulary is closed, with 8 values

batodex stores `ability.trigger` as a discrete field, so the enum does not have to be inferred from
our prose. Across 144 monsters:

Regenerate with `node scripts/audit-batodex.mjs`. Across the **144** monsters batodex publishes
(our corpus has 149 — the extra 5 are unsourced there, see M6):

| trigger | count |
|---|---|
| *(none)* | 53 |
| `On Cast` | 42 |
| `On Battle Start` | 20 |
| `Ongoing` | 14 |
| `On Victory` | 6 |
| `On Bought` | 5 |
| `On Trinket Gained` | 2 |
| `On Knocked Out` | 1 |
| `On Battle Lost` | 1 |

*Corrected during validation: the first draft gave "(none) 36" and "Across 144 monsters" without a
reproducible source. The `(none)` bucket was undercounted because unresolved RSC references were
being treated as present data.* The load-bearing conclusion is unchanged and is what matters here:
there are **exactly 8 non-null trigger values**, and `null` is a real value (an ability with no
trigger), not missing data — so the union can be closed safely.

### N3. WI-011: ability text is available PER LEVEL

`ability.byLevel` is a `{1,2,3,4}` map, and is the right source **for species batodex carries**.

**It does not solve this ask, which pass-2 validation established.** The records reading "No ability
text transcribed in sources reviewed." are exactly **three** — `bambudo|1`, `emperooze|1`,
`sunsage|1` — and **none of those three species exists in the batodex snapshot at all**, by id or
by name. They are among the species M6 already flags as unsourced there (our corpus has 149, the
snapshot 144).

So the honest answer to "please add all missing ability text values" is: **the count is 3, and all
3 are unavailable from our only structured source.** They need a different source or a direct
in-game transcription. `ability.byLevel` remains worth wiring up for the per-level text it *does*
provide, but it will not fill these.

### N4. The handoff's confidence gates are binding, and two findings must NOT be implemented

The handoff states that about a quarter of its content "cannot be proven from this recording and
must not be implemented as though it can". Two findings are explicitly fenced:

- **Finding 8 (tie-break order)** — medium confidence, "Consistent with all evidence, proven by
  none of it… should not be committed as a confirmed rule on this evidence." Every observed gap was
  2 frames, never 0, so *no tie was ever exhibited*. `STABLE_SLOT_ORDER` is therefore **not changed**
  this round. Recording the hypothesis and the experiment that would settle it is the whole task.
- **Finding 9 (same-tick pre-buff reads)** — low confidence, "**Do not implement a propagation
  delay on this evidence.**" The actionable half is that the engine's existing FR-040 snapshot rule
  may already produce the observed 1027 "for the right reason"; that gets a test, not a change.

**Finding 6's `T` vs `T + 0.1`** is likewise suggestive only: 0.1s battle-time is ~38 ms of video
and "sits inside the render-lag noise floor". Charge stacking is test-locked; the firing offset is
not changed.

A further constraint the handoff is explicit about, and which this project has twice got wrong:
adding tags for Thorntail, Puffloon, Noxnimbus and Fumungus "will move the coverage counter by
four, but the mechanisms behind them… are each new families, not instances of existing ones. The
counter should not be allowed to imply otherwise."

### N5. The capture was fast-forwarded, so no absolute timing from it is usable

"Video time is compressed by roughly 2.6x relative to battle time… **no absolute second-count from
this footage is usable**." Every number taken from the capture into a test must therefore be a
*ratio* or an *arithmetic identity* (Miasmaw's 1080, Cobrex's ×1.7, Thorntail's +24 steps), never a
wall-clock time. Tests that pin seconds from this recording would encode the fast-forward factor.

### N6. Validation-pass corrections to the handoff's own board table

Three claims in the handoff do not hold against the current codebase. They were true when the
capture was analysed; the codebase has moved.

**"Four of six mons are completely inert" — it is three.** Noxnimbus was tagged in round 11 and is
resolved at every level:

```ts
{ kind: "buffOnCast", target: { kind: "adjacent", typeFilter: "Toxic" },
  effect: { statusGrant: { type: "Poison", amount: 6 } } }
```

`buffOnCast` is in `RESOLVED_TAG_KINDS` and is applied every cast with compounding. **Thorntail,
Puffloon and Fumungus** are the genuinely inert three. This matters because T258 must report the
coverage delta honestly, and "moves the counter by four" would overstate it by one.

**"Every on-cast and reactive ability is structurally unreachable" — no longer true.** Round 11's
`buffOnCast` path and round 4's ally-cast hook both already reach them. The time-varying
restructure (WI-004) may still be the right shape, but it now carries a **double-application
hazard** that did not exist when the handoff was written: if handlers are added without retiring
the existing path, Noxnimbus's +6 fires twice per cast. Whichever way it is resolved must be
explicit.

**Our existing `triggerOnAllyCast` violates Finding 7b.** The handoff states a reactive trigger
"does not reset or consume the reactor's own cooldown" — Puffloon's bar "climbs monotonically 13 ->
19 px with no reset". Round 4's implementation sets the listener's `nextAt` to `tSeconds + STEP`,
and firing then resets its cooldown. So the engine already has a reactive trigger that does the
forbidden thing. 7b is not merely a constraint on the NEW tag kind; it is a bug report against the
existing one.

### N7. WI-006 ANSWERED: the charge calibration

One `Charge this by 1 second(s)` = **6 px** of a 71 px cooldown bar. Therefore 71 / 6 = **11.83 s**
effective cooldown against a 15 s base — a factor of **0.79**, i.e. a ~21% cooldown reduction. That
figure was independently corroborated by Fumungus's measured cast interval, and "Two unrelated
measurements agreeing to three significant figures is what makes the 6 px calibration trustworthy."

Recorded here because WI-006 is typed "question to answer" and the answer existed only in the
handoff. It gives T247's test a cited derivation. **Charge grants stack additively within a tick**
(+18 = 3 × 6) and the engine already does this correctly.

### N8. Open items carried forward, NOT acted on

- **Thorntail's 7082 entry value** is unexplained by its base stats plus anything in the footage.
  It does not affect the +24 finding, "but it means we cannot yet reproduce this board's damage
  numbers end-to-end, and somebody should work out where 7082 comes from."
- **Self-infliction counting** — whether a mon's own Poison infliction counts toward its own "when
  allies inflict Poison" counter. One frame implies it does, which would contradict the ability
  text. "Do not change the exclusion on the strength of one ambiguous frame."
- **The captured board cannot be reproduced end-to-end**, so Miasmaw's 1080 cannot be pinned as an
  integration fixture this round. It depends on four run modifiers nothing models: Link Cable
  (carried as text with `abilityTags: []`), an inferred flat +4 Poison, a +70% effect on cooldowns
  >= 5 s, and a leftmost-column battle-start effect. Two terms in the handoff's own 1066
  decomposition also fail to reproduce from our corpus (Puffloon's 19 and Thorntail's unmultiplied
  5 despite a 6 s cooldown). **The phase-ordering fix is therefore pinned on synthetic values that
  exercise phase 1 -> 3 ordering directly**, which tests the mechanism without depending on an
  unobserved loadout.

### N9. WI-017: the "0.5s increments" premise is false in the current code

The ask says both graphs should "indicate that the increments are on 0.5s increments". Neither
series is on a 0.5 s grid:

- `cumulativeSeries` samples the de-duplicated set of **event timestamps** plus 0 and the window
  end — an irregular grid.
- `dpsRateSeries` uses **1-second buckets**, with a comment defending that choice (finer buckets
  "render as a comb of spikes at each cast").

So labelling them "0.5s" would state something the data contradicts. The ask is satisfiable by
**resampling both onto a real 0.5 s grid** and then labelling it — which is what T257 now requires —
rather than by adding a label alone. 0.5 s is also the Burn tick interval, so it is a defensible
grid rather than an arbitrary one.

### N10. A stale source citation that misled two validation passes

`creatures.ts:3185` and `:3205` cite `batodexExtracted("emperooze")` and
`batodexExtracted("sunsage")` as source refs. **Neither species exists in the batodex snapshot** —
verified by id and by name against the committed fixture. The citation is wrong.

This is almost certainly why N3's first draft asserted the three placeholder records were "fillable
from this field": the provenance said batodex had them. A false citation is worse than a missing
one, because it reads as evidence. Worth a sweep of `batodexExtracted(...)` refs against the
committed snapshot in a later round; not done here because it is outside this ledger's asks.

### N11. Trainer sprite id-matching would silently miss over half

Validation pass 3 reported that 3 of 23 trainer ids diverge from batodex's. Re-derived: it is
**12 of 23**.

| ours | batodex |
|---|---|
| `chef` | `pyromaniac` |
| `lucky-girl` | `youngster_f` |
| `rich-lady` | `lady` |
| `youngster` | `youngster_m` |
| 8 more | hyphen → underscore |

All 23 resolve by **name**. `vendor-sprites.mjs` already records this exact lesson for monsters
("id-matching silently misses 11"); the trainer case is worse, and an id-keyed script would have
quietly produced a mostly-empty sprite set that looked like a successful run.

### N12. T258 — round-5 coverage report

| | before | after |
|---|---|---|
| battle-relevant abilities | 135 | 135 |
| **resolved by the engine** | **17** | **20** |
| tags carried but inert | 0 | **0** |
| structurally excluded | 40 | 40 |
| remaining unsupported | 78 | **75** |

Newly resolved: **Thorntail, Puffloon, Fumungus** — three, not the handoff's four, because
Noxnimbus was already tagged in round 11.

**The counter understates the work, and the handoff was explicit that it would**: "the mechanisms
behind them… are each new families, not instances of existing ones. The counter should not be
allowed to imply otherwise." The +3 required four new tag kinds (`statMultiplier`,
`statFromTargetStatus`, `triggerOnAllyTrigger`, `gainOnAllyStatus`), an evaluable stat structure,
three-phase resolution, and reactive casts that do not consume the reactor's cooldown. A later
round reading "+3" without this note would conclude round 5 was a small one.

**Shiny now drives resolution**, which the counter does not capture at all: 508 records carry shiny
ability text and 28 carry derived shiny tags, so e.g. shiny Mosslug resolves +24 Damage where the
normal form resolves +20.

## O. v1.3.0 corpus refresh and metric pruning (2026-10-06)

### O1. v1.3.0 applied — 15 creatures, and level 4 is INFERRED

Source: [Patch 1.3.0](https://store.steampowered.com/news/app/4557380/view/686392527015643351),
Steam, 2026-10-06. Applied by `scripts/patch-1_3_0.mjs`; the corpus was pinned to Balance 24 / 1.2.0
(K6 had flagged this as deferred work).

| | changes |
|---|---|
| Jinto | Opalion (cd 9→6, Rock allies 2→1), Petrirex (7→5.5), Steamscuttle (3→3.5), Kappow (4.5→5.5, cost 30→25), Aviarab (cost 20→25), Dollhime (40/80/120→50/100/150), Mallogre (9→8), Danuki (cost 50→45), Sarudo (cost 35→25) |
| Pantra | Guardiant (7/14/21→8/16/24), Noxnimbus (cd 4→3), Lignite (×15/30/45→×20/40/60, cd 4→5), Stalagrove (5.5→4.5), Aegistruct (7→6), Geminiss (12→10) |

**The notes publish levels 1-3 only** for the scaling abilities, but our corpus carries a level 4.
Each L4 value is rescaled by the same factor as L1, preserving that creature's existing L1:L4 ratio
— the only defensible inference available. Those records say so in their `patch` string rather than
presenting an inferred number as published. Affected: Dollhime L4 480→600, Guardiant L4 42→48,
Lignite L4 ×90→×120.

**The corpus is now AHEAD of the batodex snapshot** for these 15. `levelSeries.test.ts` exempts them
by name via `PATCHED_AHEAD_OF_SNAPSHOT`, because the official patch notes are a primary source and
the fan site is a secondary one — a mismatch there is the fixture being stale, not our data being
wrong. The set should shrink to empty when batodex catches up.

### O2. Growth/s² removed — it was structurally identical to Applied/s

For **Poison** the two columns were always exactly equal, and not by coincidence: Poison stacks
never decay and each tick deals the current stack count, so the damage rate grows by precisely the
applied rate. Verified identical across every team tried (132.5000/132.5000, 1.0667/1.0667,
7.1500/7.1500, 27.6800/27.6800).

For **Shield** it was always 0 — Shield is not damage. For **Burn** and **Shock** it was a small
second derivative in units nobody reasons in, saying less clearly what the DPS-over-time chart and
the neighbouring avg-vs-end pair already show.

**Applied/s stays.** It is the only meaningful figure for Shield, and it separates "I apply a lot of
Poison" from "my Poison deals a lot". FR-055's substance — more than one averaged figure — is still
met by avg, end and applied.


## P. Enemy HP by day, and a retraction about sudden death (2026-10-07)

### P1. Observed enemy team HP

Read off the battle UI across one run. Stored in `src/data/enemyHealth.ts`.

| day | HP | day | HP |
|---|---|---|---|
| 1 | 300 | 11 | 24,900 |
| 2 | 500 | 12 | 34,700 |
| 3 | 800 | 13 | 47,300 |
| 4 | 1,400 | 14 | 63,000 |
| 5 | 2,400 | 15 | 82,400 |
| 6 | 3,800 | 16 | 106,000 |
| 7 | 5,700 | 17 | 134,300 |
| 8 | 8,300 | 18 | 168,000 |
| 9 | 11,600 | 19 | **207,700** (derived) |
| 10 | 17,300 | 20 | not captured |

**Day 19 is derived, not read.** The run carried a +25% max-health trinket by then and the UI
showed 259,625. 259,625 / 1.25 = **207,700** exactly, and the implied day-18→19 ratio of 1.236 sits
on the curve's declining trend (1.267, 1.251, …). Clean enough to record, flagged because it is one
step removed from the observation.

**The growth ratio is still falling at the last sample** — 1.67 early, 1.25 by day 18 and dropping —
so the curve has not settled and `enemyHpForDay` returns `null` beyond day 19 rather than
extrapolating. A projection off an unsettled curve is a confident-looking number with nothing
behind it.

**One run.** HP may also scale with opponent strength, rank or seed; none is ruled out by a single
sample. A time-to-kill built on this is an order-of-magnitude estimate. It also assumes the enemy
neither heals, shields, nor clears statuses — all of which exist — so it is a **floor** on TTK.

### P2. RETRACTION: "sudden death begins at 15s" is unsupported

An earlier round set the default simulation window to 15s, justified in `TeamConfigContext.tsx` by
"sudden death begins at 15s, so a fight that reaches it is already being decided by something this
engine does not model".

That came from a search result, not from observation, and the frame-by-frame recording contradicts
it: the battle ran past **23s** with no sudden-death damage. Whether sudden death has a fixed onset
at all, or varies by day, is **unknown**. Nothing in the engine may assume a value for it until
someone records one.

The default window is now **30s**, justified by something the data does support: enemy HP grows
~25% per day and keeps growing, so later-day fights take substantially longer. A window that ends
before a team has done its work makes a slow, scaling build look worse than it is.

## Q. Orchestration round 6 (2026-10-07) — the affected-species picker and the card's output band

### Q1. WI-002 ANSWERED, and the "both abilities" premise is half-sourced

The ask states "**Both** trainer abilities only allow a max of 9 mons to be painted/smuggled". The
corpus supports that for one of the two:

| Trainer | Published `abilityText` (src/data/trainers.ts) | Says "nine"? |
| --- | --- | --- |
| **Painter** | "**Nine random species** are painted with every type. Whenever a painted species appears in your shop or on your board, it counts as every type for any effect that checks typing." | **Yes** |
| **Smuggler** | "Batomon from other regions appear in your shop and cost 25% less." | **No — no count at all** |

Smuggler's record also carries `unconfirmedFields: ["abilityText"]`, so its text is itself flagged as
unverified. The "9 species from the opposite region" string the UI shows for Smuggler comes from
`SET_DESIGNATING_TRAINERS` in `TrainerCard.tsx` — written in round 4, sourced to nothing. Round 4's own
note says as much: "The shape is Painter's only; Smuggler's text mentions neither 9 creatures nor
rarity."

**Decision**: apply the cap of 9 to both, from one `MAX_AFFECTED_SPECIES` constant, because that is
what the ask asserts and it matches the only published count we have. **Record the asymmetry rather
than hiding it**: Smuggler's 9 is this project's assumption, not a cited fact, and the spec amendment
and the round report both say so. If play shows otherwise for Smuggler, the constant is the single
place to change.

**Not changed**: Painter's rarity shape (2/2/2/2/1) stays **guidance, never enforced** — its source
says "typically", and round 4's reasoning for not hard-locking a soft constraint is unaffected by a
count the text states outright.

### Q2. WI-003 — the base corpus cannot produce "too many statuses"; modifiers can

Census of output lines per creature record, over all 596 level-records. **Corrected in validation pass
1**: the first version of this table reported 348 one-line and 206 two-line records, counted by regex
over `creatures.ts`, which mis-handled `unconfirmedFields` and nested status entries. The figures below
come from running the real `buildStatLines(perCastOutputOf(creature))` over `corpus.creatures`, which
is the only count that can be trusted because it is the code that draws the band:

| Lines | Records |
| --- | --- |
| 0 | 16 |
| 1 | 373 |
| 2 | 181 |
| 3 | 26 |
| **4+** | **0** |

So no published creature reaches four lines, and the reported breakage cannot come from base stats.
It comes from everything that ADDS output: user modifiers, trinket `effectTags`, ally abilities and
manual triggers — all of which flow through `perCastOutputOf`/`applyModifiers`, and `applyModifiers`
can create any of the four statuses on a creature that publishes none (FR-078 as amended).

**The real worst case is 7 lines**, and it is built rather than inferred. Shelldra Lv1
(`baseDamage: 15`) with four status modifiers — Burn 2, Poison 3, Shock 3, Shield 4 — renders exactly:

```text
Deal 15 damage | Burn 2 | Poison 3 | Shock 3 | Shield 4 | Heal 15 | Multicast ×3
```

and the ask's own six-line example reproduces from the same creature with Poison, Shock and Shield only:

```text
Deal 15 damage | Poison 3 | Shock 3 | Shield 4 | Heal 15 | Multicast ×3
```

(Validation pass 2 caught a `Deal 20 damage` here: the first run carried an extra `damageFlatAdd: 5`
the prose did not mention, so the recorded string did not match the stated setup. Both strings above
are the output of a run with exactly the modifiers named.)

Seven is a hard ceiling, not a sample: `StatusEffectType` has four members, no record publishes a
duplicate status type, and `buildStatLines` emits at most one damage, one heal and one multicast line.
The user's example is 6 of those 7 ("Deal 15 damage, Poison 3, shock 3 | shield 4, heal 15, multicast
x3") — a Shelldra with three statuses added.

**Decisions**:

- Design the band for **7**, not for the 3 the corpus publishes.
- **Switch to two columns at 4 or more lines.** 3 is the published maximum, so 4 is the first count
  that only modifiers, trinkets, abilities or manual triggers can produce — which makes it both the
  first count the band was never sized for and a threshold derived from the data rather than chosen.
- Two columns hold 7 as 4+3, one row taller than the 3-line maximum the band reserves today, so the
  reservation is re-measured rather than assumed to still fit.
- **The two columns are a column-flow GRID, not CSS multi-column.** `columns: 2` was specified first
  and is inert here: `.statLines` is `display: flex`, and multi-column does not apply to a flex
  container (validation pass 3). `grid-auto-flow: column` with `grid-template-rows: repeat(ceil(n/2),
  auto)` fills the first column before the second by construction, keeps the band's existing `gap`,
  and makes a third column arithmetically impossible.

### Q4. T265 MEASURED: the band at 3 to 7 lines, and why no reservation changed

Shelldra Lv1 in the Calculator's panel card, statuses added one at a time in a real browser:

| Lines | Rows | Band height | Card height | Card scrollHeight | Overflowing? | Ability text visible? |
| --- | --- | --- | --- | --- | --- | --- |
| 3 (published) | 1 column | 81.9px | 522px | 520px | no | yes |
| 4 | 2 | 58.5px | 522px | 520px | no | yes |
| 5 | 3 | 81.9px | 522px | 520px | no | yes |
| 6 (the ask's example) | 3 | 81.9px | 522px | 520px | no | yes |
| 7 (worst case) | 4 | 109.8px | 522px | 520px | no | yes |

**No reservation needed changing**, which T265 required to be stated explicitly rather than assumed:
`.cardFixedPanel`'s 29rem absorbs the 4-row band with the ability text and the level pips still in view,
so `.output`'s commented-out reservation stays commented out and nothing was re-sized.

Two things worth noting from the table. **Two columns make the band SHORTER for 4-6 lines than three
one-column lines were** (58.5px and 81.9px against 81.9px), so the common crowded cases cost nothing at
all; only the 7-line ceiling is taller, by 27.9px. And the card's `scrollHeight` is 520px at every
count, which is what "no overflow" means here — the band grows into slack the fixed height already had.

The **Corpus Browser** was checked at its real maximum rather than at 7, as the task states: 149 cards,
worst case 3 lines, no card overflowing its 378px. It passes no `modifiers`, so 4+ is unreachable there.

The **"Effective this battle"** band needed no separate check and could not have had one: it renders
through the same `StatLines`, and it correctly hides when it would duplicate the base band — which is
exactly the case here, since manual modifiers are folded into the base figure. One component is what
guarantees the two agree.

### Q3. A defect found in validation, not in the ask: the Super Rare shape chip never renders

`PAINTER_RARITY_SHAPE` in `AffectedCreaturePicker.tsx` is keyed `"Super Rare"` (with a space), while the
corpus's `Rarity` union and `RARITIES_DESC` use `"SuperRare"`. The chip row is built by filtering
`RARITIES_DESC` against those keys, so the Super Rare entry is silently dropped: the guidance row shows
four chips summing to **7 of 9**, not five summing to 9. The user's own screenshot of the picker shows
exactly four chips — "Legendary 0/1  Rare 1/2  Uncommon 0/2  Common 1/2" — so the defect is visible in
the evidence attached to the ask without being part of it.

`statColors.ts` already documents this exact trap: "the deliberate spelling bridge: this corpus's
`Rarity` union uses `SuperRare` while the published data uses `Super Rare`". The map was written against
the published spelling instead of the union's.

Recorded here, and fixed by a task, because WI-001 rebuilds this file: carrying the bug across a rewrite
is how it would become permanent. It is **not** a ledger item and is reported to the user as a
by-product, not as something they asked for.

## R. Orchestration round 7 (2026-10-07) — standardising the creature data vocabularies

Ledger: `specs/001-batomon-dps-calculator/orchestration/round-7-items.md` (WI-001..WI-007).
The round's stated motivation: "we need to standardize the data types for the creatures, it's a
total mess."

### R1. The premise, checked: all four vocabularies are ALREADY closed unions

Items 1-4 ask for `abilityTrigger`, `types`, `damageType` and `rarity` to "be an Enum". All four are
already closed string-literal unions in `src/data/types.ts`, and Constitution Principle II already
requires exactly that ("MUST be modeled as closed discriminated unions, never bare strings"). So the
asks cannot be read as "these are currently loose strings" — nothing would change, and the mess the
user is pointing at would survive the round.

**What is actually broken is the three things a literal union cannot do**, each with measured
evidence from this repo's own history:

1. **No runtime value list.** A literal union is erased at compile time, so every site needing to
   *iterate* a vocabulary hand-writes an array. Those restatements have drifted twice already:
   round 7's T172 found the rarity ordering declared as a local `RARITIES` array in three files
   "with inconsistent ordering between them (two descending, one ascending)", and
   `src/data/__tests__/triggers.test.ts:55-59` still hand-lists all ten `AbilityTrigger` values in
   order to check that each has a registry entry — a test that cannot see a value added to the union
   and omitted from its own list, which is the exact drift it exists to prevent.
2. **No display-name layer.** The stored value doubles as the rendered label, which is the whole of
   WI-006: `"SuperRare"` reaches the screen because there is nowhere to say "stored `SuperRare`,
   displayed `Super Rare`". `statColors.ts:40-44` documents this as "the deliberate spelling
   bridge" — a comment where a mechanism belongs.
3. **No attachment point for per-member data.** Colour, ordering and label live in three separate
   structures keyed by the same union (`RARITY_COLORS`, `RARITIES_DESC`, nothing). Each is a
   separate chance to miss a member, and round 6's validation found precisely that:
   `PAINTER_RARITY_SHAPE` keyed `"Super Rare"` against a corpus spelling `"SuperRare"`, silently
   dropping a chip so the guidance row summed to 7 of 9 (Q3).

`Record<Rarity, X>` does give compiler-checked exhaustiveness and must be preserved — the problem is
that there are three such records instead of one.

### R2. SUPERSEDED by R8 — read R8 first

> **This section's conclusion was overturned by the user on 2026-10-07 and the code now does the
> opposite of what it recommends.** It argued for a const-object registry *instead of* TypeScript's
> `enum`; the codebase uses string enums. The reasoning is kept verbatim below because one of its
> four arguments was simply wrong and it is more useful to see which, than to see a tidied record.
> See **R8** for what was wrong and what replaced it.

### R2 (superseded). A const-object vocabulary registry, NOT TypeScript's `enum`

The construct adopted for all four vocabularies the asks name — and for `StatusEffectType`, which R3a
brings in so the file is not left with one bare union beside four registered ones: **one frozen const
object per vocabulary, carrying one descriptor per member, with the literal union derived from its
keys.**

```ts
export const RARITY = defineVocabulary({
  Common:    { label: "Common",     order: 0, color: "#70707a" },
  //...
  SuperRare: { label: "Super Rare", order: 3, color: "#a040a0" },
});
export type Rarity = VocabularyKey<typeof RARITY>;   // the SAME union as today
```

**Why not `enum`.** Four reasons, in order of how much they cost:

1. **It would churn all 596 corpus records and break the JSON fixtures.** `enum` members are not
   assignable from their string literals, so every `rarity: "SuperRare"` becomes
   `rarity: Rarity.SuperRare` — thousands of edits across `creatures.ts`, `trinkets.ts`,
   `trainers.ts` — and `src/data/__tests__/fixtures/batodex-monsters.json` **cannot express an enum
   member at all**. That fixture is cited source data (Principle IV); a construct that cannot
   represent it is disqualified on that alone.
2. **It is nominal, and this corpus round-trips structurally.** Build codes (`src/data/share.ts`),
   the batodex fixture and the vendored extraction all move these values as plain strings. A nominal
   type at the boundary needs a validating cast on every entry and exit.
3. **It is on TypeScript's own way out.** `enum` emits runtime code, conflicts with
   `isolatedModules`/`erasableSyntaxOnly`-style type-only builds, and `const enum` is worse (inlined,
   with no runtime object — which is the one thing we actually need).
4. **It would not deliver what the round is for.** `enum Rarity { SuperRare = "SuperRare" }` has no
   label, no order and no colour. We would still need the three side-tables that are the actual mess.

**What the registry does deliver**, mapped to the asks: a runtime list and iteration order (R1.1),
a label distinct from the stored key (R1.2, and therefore WI-006 with **zero data churn**), and one
exhaustive place for per-member data (R1.3). Adding a member becomes one edit, and omitting its
label or colour becomes a compile error rather than a dropped chip.

**Lineage, since item 3 asks for senior-level OOP reasoning.** This is the enum-with-fields pattern
from Java/C# (`enum Rarity { SUPER_RARE("Super Rare", 3) }`), reached in TypeScript by the idiom the
language actually supports. It is Fowler's *Replace Type Code with Class* applied to a type code that
is already a union: keep the cheap comparable key, attach the behaviour to it in one place. The
alternative OOP-purist reading — a `Rarity` class with instances — is rejected under Principle VI and
for reason 2 above: the values must stay JSON-serialisable primitives.

### R3. WI-004 ANSWERED: `damageType` is one type doing two jobs, and redundant in one of them

Two measured findings, both from a census over all 596 records.

**Finding 1 — on `CreatureRecord`, the field carries no information.** `damageType` takes exactly two
values in the corpus: `"Direct"` (356 records) and `null` (240). It is **perfectly correlated with
`baseDamage`**: records with `damageType === null` and `baseDamage !== null` number **0**, and
records with `damageType !== null` and `baseDamage === null` number **0**. So `damageType` on the
record is derivable from `baseDamage !== null` and nothing is encoded by storing it.

The code already shows this. `BatomonCard.tsx:97` reads:

```ts
const verb = input.damageType === "Direct" ? "Deal" : "Deal";
```

Both branches are the same string. The field is consulted for a decision that cannot have an
outcome — dead code that is evidence, not just a typo.

**Finding 2 — the user's "just null or Direct" is right about the record and wrong about the type.**
`DamageType` declares five members, and the other four are **not dead; they are alive somewhere
else**. `"Burn"`, `"Poison"` and `"Shock"` are used at runtime on `TimelineEvent.damageType` (every
`statusTick` carries one — see `statusStacks.test.ts`), and `shield.ts:45` branches on
`damageType === "Direct"` to apply the status-vs-shield reduction. So one type spans two different
concepts:

| Role | Inhabited by | Where |
| --- | --- | --- |
| "what channel is **this hit** on" | Direct, Burn, Poison, Shock (SuddenDeath unused) | `TimelineEvent`, `shield.ts`, `status.ts` |
| "what kind of cast does **this creature** publish" | Direct, or absent | `CreatureRecord.damageType` |

**That conflation is the real mess in item 3**, and it is why the field looks half-empty: it is being
read as a creature property while being typed as a hit property.

**Proposal.** Two changes, of very different cost:

- **(a) Split the vocabulary by role.** `DamageChannel` for hits (the five members, where four are
  genuinely used), leaving the record's concept to be expressed by (b). Mechanical, and it makes each
  `switch` exhaustive over values that can actually occur.
- **(b) Replace the nullable PAIR with one optional value object**, so the illegal state stops being
  representable:

  ```ts
  // Two nullable fields that must agree -> one optional field that cannot disagree.
  publishedCast?: { damage: number; channel: DamageChannel };
  ```

  This is "make illegal states unrepresentable" — the pair `(baseDamage, damageType)` has four
  combinations of which the corpus uses two and the code trusts without checking.

**(b) was deferred and is now DONE** (2026-10-07; see the implementation note at the end of this
section). The deferral reasoning is kept because the invariant test it motivated is what later made
the migration safe to automate. Original wording follows. It
reaches `ModifiableBase` (`modifiers.ts`), `PerCastOutput`, `SimulationResult.perCreatureEffectiveStats`,
`BatomonCard`'s output band and roughly fifteen engine test fixtures that spell `baseDamage`/
`damageType` literally — a wide refactor of the engine's hot path, in a round that already carries
WI-002's derivation work. Principle VI applies. **An invariant test is added now instead**, pinning
the 596/596 correlation, so the redundancy cannot begin to drift in the interval: if a future record
ever sets one field without the other, the suite fails and (b) becomes urgent with evidence.

A note for whoever lands (b): `modifiers.test.ts:47-59` exercises Burn- and Poison-typed *attackers*
(`{...pebbler, damage: 10, damageType: "Burn"}`). **No corpus creature has ever had that shape** — the
fixtures are synthetic, so the engine supports a case the data has never contained. That is worth
keeping (T232 allows ability grants to create damage) but it means those tests pin a capability, not
a creature.

#### R3a. The `DamageType` / `StatusEffectType` overlap (required by WI-004's ledger note)

The ledger made this a named deliverable of the proposal and the first draft of this round omitted it
(validation pass 1). The two vocabularies overlap on three of four members:

```ts
DamageChannel    = "Direct" | "Burn"   | "Poison" | "Shock"
StatusEffectType =            "Burn"   | "Poison" | "Shock" | "Shield"
```

**They are not the same vocabulary, and the overlap is not duplication.** They answer different
questions, which is visible in the one member each has that the other lacks:

- `"Direct"` is a channel and not a status, because a direct hit is damage that was never a status.
- `"Shield"` is a status and not a channel, because Shield **never deals damage** — it absorbs it
  (`shield.ts`). A `DamageChannel` of `"Shield"` would be meaningless.

So the relationship is exactly: **`DamageChannel` = the statuses that tick for damage, plus `Direct`.**
Burn, Poison and Shock appear in both because a status that ticks produces damage on a channel named
after itself; Shield and Direct are each the half that does not cross over.

**Decision: two registries, related by a derived mapping — not merged, not duplicated.**

```ts
/** The channel a status's tick damage lands on. Absent for statuses that never deal damage. */
damageChannelOf(status: StatusEffectType): DamageChannel | undefined
```

Merging them into one five-member vocabulary was considered and rejected: it would make the type system
accept `applyShieldReduction(n, "Shield", s)` and a `statusTick` of `"Direct"`, both nonsense that the
current split already rejects at compile time. Widening a union to express a relationship is the
opposite of what Principle II asks for.

`STATUS_COLOR_KEY` in `format.ts` is the precedent for this shape — one vocabulary with a derived
mapping onto another, rather than one merged type carrying both roles' members.

`StatusEffectType` therefore **becomes a registry too**, so the four statuses get the same
label/order/colour treatment rather than being the one closed vocabulary left as a bare union beside
four registered ones.

### R2a. Where the published source materialises a rarity, it uses the registry's shape

Found while verifying WI-006's churn inventory. **Scoped carefully, because the first version of this
finding overstated it and validation pass 2 refuted the overstatement.**

`src/data/__tests__/fixtures/batodex-monsters.json` — the cited extraction from the game's embedded
database — has 144 records. **4 of them** (`beetbud`, `aviarab`, `aristobat`, `aerophim`) carry a fully
materialised rarity:

```json
{ "id": "beetbud", "name": "Beetbud", "rarity": { "label": "Common", "color": "#70707a" }, "trigger": null }
```

The other 140 carry a React-flight dereference string instead — `"$17:props:children:0:props:entries:0:rarity"`
— an artefact of how the page payload was captured, not a different data shape.

**What this does and does not support:**

- **Supported**: where the source materialises a rarity at all, it is an object carrying a `label` and
  a `color` — the same descriptor shape R2 arrives at from first principles. So the registry is not a
  TypeScript idiom imposed on the data; it is the shape the data has where it is visible. That is a
  genuine, if narrow, corroboration of R2.
- **NOT supported, and withdrawn**: the claim that the fixture's labels evidence the "Super Rare"
  spelling. The four materialised labels are Common, Uncommon, Rare and Mythical — Super Rare is not
  among them. The file's only two "Super Rare" strings sit inside *ability text* ("Gain a random
  non-unique Super Rare Trinket."). That still shows the published data spells the tier with a space,
  but by different evidence than first claimed, and R5's primary citation (`statColors.ts`'s own
  record of the extracted database) remains the load-bearing one.
- **Still true, and the part WI-006 depends on**: the fixture contains **no `"SuperRare"` string at
  all**, so the ledger's claim that it is a churn site for WI-006 is simply wrong — there is nothing
  in it to churn.

A second corollary that does hold: `"trigger": null` in the materialised records is the source's own
representation of "no published trigger", which supports keeping `abilityTrigger` as
`AbilityTrigger | undefined` rather than inventing a member for it (R4).

### R4. WI-002 MEASURED: the size of the hand-maintained-tag problem, and this round's honest slice

Census over all 596 records:

| Measure | Count |
| --- | --- |
| Records with real ability text (per `hasAbilityText`) | 543 |
| Records with real ability text and **zero** `abilityTags` | **424** |
| Level-1 species with real ability text and zero tags | **106 of 149** |
| Records carrying at least one tag | 119 |

So the user's "140+ mons" is if anything an understatement of the hand-management burden: **106 of
149 species** have a published ability and no structured representation of it at all. Ninflora is not
an oversight, it is the median case.

**A second gap found while measuring**: 134 records have real ability text and **no `abilityTrigger`
at all**, and 3 have a trigger with no ability text. A derivation keyed on the trigger alone would
therefore miss a quarter of the corpus, which is why the derivation below reads the **text** and
treats the trigger as corroboration rather than as the key.

**Scope decision — derive the `manualTrigger` family plus one further family chosen by census (T297), not all seventeen.** Round 10's audit (L1) identified 17
mechanism families. Deriving all of them for 424 records in one round would be a generic rule engine
built ahead of the evidence, which Principle VI prohibits in those words. This round derives the
**`manualTrigger` family** — the "gain +N \<stat\> permanently" run-event grants — for four reasons:

1. It is the family Ninflora is in, so the named acceptance case is covered.
2. It is the family the user's last two bug reports were both about (round 6's ally-propagation fix,
   and Ninflora now).
3. It is **outside `RESOLVED_TAG_KINDS` by design**, so deriving more of it cannot inflate the
   engine-coverage counter into claiming abilities the engine does not compute — the honesty rule the
   spec sets out at length. Every other family would.
4. Its text shape is narrow and already attested by three hand-written examples (Brawlmantis,
   Kickrane, Craghorn), satisfying Principle VI's "at least two concrete creatures" bar.

**The family census over the 424 untagged records** (added after validation pass 1, which rightly
refused family claims that had not been measured). Shapes are counted in order, each record attributed
to the first shape it matches:

| Text shape | New records | Total matching |
|---|---|---|
| contains "permanently" — **the `manualTrigger` family** | **60** | 60 |
| mentions an ally | 140 | 174 |
| "for this battle" | 24 | 56 |
| "adjacent" | 0 | 64 |
| "for each" / "per" | 10 | 45 |
| knockout | 24 | 40 |
| shop / gold / sell value / Berries / day | 28 | 44 |
| evolution only ("Evolves at level 3") | 19 | 19 |
| row / column / behind / in front | 9 | 41 |
| charge | 0 | 16 |
| **matching none of the above** | — | **110** |

"New" attributes each record to the **first** shape it matches, so the New column sums to 314 and
314 + 110 = 424. The two columns differ sharply for some shapes — 56 records say "for this battle" but
32 of those also mention an ally and are attributed there — which is exactly why both are shown.
(Validation pass 2 caught the first version of this table reporting 108 and 56 in the New column;
those were `total` values for a different attribution order, and the errors happened to offset so the
column still summed to 424. The numbers above are re-measured.)

**One caveat on reading these as exact.** Every row except the first depends on the regex chosen for
its shape, and the shapes are descriptive rather than normative — validation pass 3 reproduced every
row from its own patterns except `"for each" / "per"`, which it measured at 9/44 against 10/45 here,
a `\bper\b` wording difference. Treat the table as the **shape of the residue**, accurate to a record
or two per row, not as a specification. The one row that is exact and load-bearing is the first: 60
records contain "permanently", and that one is used for sizing below.

Two things follow that no amount of reasoning would have produced:

1. **The pattern shapes are the hard part, not the family boundary.** Of the 60 untagged records
   containing "permanently", only **10** match the three text shapes `manualTrigger` was hand-written
   against. The other 50 are the same *family* — a permanent stat grant — expressed with targets the
   hand-written three never needed: `"Adjacent Water allies gain +25 Heal permanently"` (Aster),
   `"Give the ally behind +3% Cooldown Speed permanently"` (Boomagon), `"Allies of level 3 or above gain
   +15 Damage and +15 Heal permanently"` (Lumijel), `"+4 Burn and +4 Poison permanently"` (Brimtoad —
   two stats, no target clause), `"+4 Damage and +4 Shield permanently for each Trinket that you own"`
   (Mallogre — count-scaled).
   **This is good news for the design and bad news for a narrow rule set**: those targets are already
   expressible — `TargetSelector` has `adjacent`, `behind`, `allAllies` and `minLevelFilter`, and the
   `target`/`includeSelf` fields added on 2026-10-07 carry them. So the rules should be written against
   the **full `TargetSelector` vocabulary** rather than against the three shapes that happened to be
   hand-tagged first.

   **But the family does not reduce to targeting, and the honest split is 33 of 60** (measured in
   validation pass 3, after two earlier drafts of this section understated the non-derivable set as
   "one" and then "two" records). 27 records across 7 species are outside this family regardless of
   selector support:

   | Not derivable | Why |
   |---|---|
   | Mallogre ×4, Sproach ×4, Talonite ×4, Sunsage ×3 | count-scaled — "for each Trinket that you own", "for each life lost this run", "for each Rock ally". These belong to `statFromCount`, and two of the inputs (trinket count, lives lost) do not exist in this model at all. |
   | Omnichrome ×4 | "Gain 2400% of the stats of the enemy monster with the highest stats" — a multiplier off an enemy, not a flat grant. |
   | Aerophim ×4 | "+60 Multicast permanently **and transform them into random monsters of their rarity**" — a second clause no tag expresses. |
   | Gildshell ×4 | "+240 Sell Value permanently" — **Sell Value is not a `ModifierStat`**, so there is nothing to write. |

   The lesson generalises past this round: **a "family" identified by one keyword is not a family.**
   "Permanently" selects 60 records spanning flat grants, positional grants, count-scaling, an
   enemy-stat multiplier, a transform, and a stat this model does not have. That is the argument for a
   rule table keyed on full text shapes rather than on a trigger word.
2. **The derivation must be a rule TABLE, not a parser.** 110 records match no recognised shape, the
   families are long-tailed, and as item 1 shows a single family spans five target shapes. The
   mechanism that matters is therefore "adding a shape or a family is one declarative row", which is
   the structural reading of the user's "instead of having to manually manage a separate list of tags".
   A hardcoded parser would fix Ninflora and leave the next shape exactly as hand-managed.

The remaining families stay hand-tagged and are recorded as outstanding, per family, with measured
before/after counts rather than a single aggregate.

**Runtime derivation, not a codegen script.** The project has a precedent for the other choice —
`scripts/tag-shiny-abilities.mjs` pattern-matches ability text and writes tags into the data file —
and it has the staleness flaw that recommends against repeating it: the generated tags are correct
only as of the last time somebody remembered to run it. Deriving at corpus-construction time instead
means the tags cannot drift from the text they came from. Reviewability (the one real advantage of
codegen, since a git diff shows what changed) is recovered with a **snapshot test** over the derived
output per species, so a text edit that silently changes behaviour shows up as a diff in review
anyway.

Hand-authored tags **win over derived ones** on the same creature. The escape hatch is required: the
corpus contains abilities no pattern will ever read correctly (Petrirex's self-knockout, Fumungus's
enemy-stack scaling, Link Cable's adjacency rewrite), and round 6's guards must keep holding.

### R5. WI-006: "Super Rare" is the PUBLISHED spelling, so this is an alignment, not a preference

`statColors.ts:40-44` already records that the game's own extracted database spells this tier
**"Super Rare"** with a space, and that `"SuperRare"` is this corpus's own compression of it. So the
ask restores the cited spelling rather than imposing a new one — which also means WI-006 is a
Principle IV improvement, not merely cosmetic.

**Decision: the stored key stays `SuperRare`; the label becomes "Super Rare".** The registry of R2
separates them, so:

- **zero churn** across the stored occurrences — **measured 124 in `creatures.ts` and 14 in
  `trinkets.ts`, 138 in total, and zero in `trainers.ts`, `shiny.ts` and the cited
  `batodex-monsters.json` fixture**. (The ledger's "~100 plus 15, plus `trainers.ts`, `shiny.ts` and
  the fixture" was wrong on both the count and the file list; validation passes 1 and 2 corrected it.
  The fixture never contained the string, so it was never a churn site — see R2a.)
- **no share-code risk** — checked: `src/data/share.ts` encodes creature ids and levels and never
  rarity, so no previously shared URL is affected either way;
- the "spelling bridge" comment becomes the `label` field, i.e. a mechanism.

Three existing tests assert the **rendered** string `"SuperRare"` and must flip to `"Super Rare"`:
`presentation.test.tsx:102`, and `AffectedCreaturePicker.test.tsx:55` and `:62`. Those flips are the
evidence the item worked, not collateral.

### R6. WI-007: the keyword census, and why the vocabulary must exceed `STAT_COLORS`

Of 543 records with real ability text, **318 contain at least one** of Damage / Shield / Burn /
Poison / Shock / Cooldown Speed / Multicast / Heal:

| Keyword | Records |
| --- | --- |
| Damage | 124 | 
| Poison | 49 |
| Shield | 48 |
| Cooldown Speed | 43 |
| Burn | 41 |
| Multicast | 40 |
| Heal | 18 |
| Shock | 17 |

The remaining 225 are not all unkeyworded — they carry terms outside `STAT_COLORS`, e.g. "Give
adjacent allies **Protect** 1", "Your team has +50 **HP**", "**Trigger** the Bug ally above",
"**Ongoing**: the ally behind...". So a vocabulary limited to the seven `StatColorKey`s would leave a
visible minority of cards flat, against an ask that says "all mon's ability text".

Three constraints the design must respect, each read off the data rather than assumed:

1. **Longest match first.** "Cooldown Speed" contains "Cooldown"; matching greedily short would
   colour half a phrase. The screenshots colour "+15% Cooldown Speed" as one run.
2. **The number and sign belong to the run.** The game colours "+20 Damage" entirely, not just the
   word — see the Craghorn card, where "+20 Damage" is pink and "Shield" tan **in the same
   sentence**, which also settles that highlighting is per-keyword, not per-card.
3. **Flavour text is concatenated into some abilities** and must not be mangled: Bumblebolt's reads
   `Deals 3 direct damage every 2.5 seconds and applies 1 Shock. "The poster Common: 2.5s, Shock,
   cheap."` The longest ability text in the corpus is **169 characters**, which is the figure
   `BatomonCard.module.css:29` already sized the band against — so the band's reservation (FR-043)
   is unchanged by colouring, since no text grows.

The tokeniser is a **pure data-layer function** returning `{ text, colorKey? }[]`, not a React
component: it keeps the keyword vocabulary next to `STAT_COLORS` (Principle VII's "one formatter"),
and it is testable without rendering.

### R7. Findings outside the ask, recorded not acted on

1. **Two species carry unresolved template placeholders in cited ability text.** `purpleegg` L1-L4
   reads "Hatches a level 2 **{monster_name}** in **{amount}** day(s)." — literal substitution tokens
   from the extracted database, shipped to the UI. `scrubber.test.tsx:60-65` guards against
   placeholder *prose* ("unknown", "n/a") but not against template syntax, so this passed through.
2. **Eight records have an empty `types` array** — `dragonegg` and `purpleegg` at all four levels.
   `CreatureType` cannot express "typeless", so the hole is encoded as absence, and WI-003's
   decision about `"All"`/`"Curio"`/`"NULL"` should state whether typeless is a legitimate state.
   `"All"` is carried by exactly one species (Omnichrome, all four levels).
3. **`DamageType`'s `"SuddenDeath"` member is used nowhere at all**, in records or at runtime. P2
   already retracted the "sudden death begins at 15s" claim as unsupported; this is the type-level
   residue of that retraction.
4. **`dewlotl`'s `abilityText` is a sourcing disclaimer, not an ability** (`creatures.ts:3274`):
   "Named on batomon.com's 149-entry navigation list but not present in the 144-row community dex table
   or the demo tier/cost table reviewed; identity otherwise unconfirmed." It passes `hasAbilityText`,
   so it is inside WI-002's 424 and WI-007's 543, and T294 will render it on a card as though it were an
   ability. Same class as R7.1's `purpleegg` placeholders and likewise not caught by
   `scrubber.test.tsx`'s placeholder-prose guard. Found in validation pass 2; recorded, not fixed.

### R8. The enum decision, and what R2 got wrong

The user asked three times for the vocabularies to be enums. R2 argued against it on four grounds;
on the fourth attempt the premise was actually checked, and the picture changed.

**What R2 got wrong.** Its load-bearing argument was that `src/data/__tests__/fixtures/batodex-monsters.json`
"cannot express an enum member at all", so a construct that cannot represent cited source data is
disqualified. That is a bad argument and the user named it: a test fixture is parsed at a boundary,
and letting it dictate the domain model is backwards. A string enum's initialiser IS its serialized
value, so the fixture round-trips unchanged — the objection did not even apply.

**What was actually blocking it, and nobody had looked.** `tsconfig.app.json` set
`"erasableSyntaxOnly": true`, which makes `enum` a hard compile error (TS1294). It arrived as a Vite
`react-ts` scaffold default in the **initial commit** — nobody on this project chose it — and it sat
inside the template's `/* Linting */` block looking like a decision. It bans `enum`, `namespace`,
parameter properties and TS import aliases, because those need code generation rather than type
erasure.

**Measured before removing it.** The flag protects runtimes that only strip types (Node's native TS
support, Bun, Deno). Nothing in this repo does that: `tsc -b`, `vitest`, `vite build` and `tsx` all
handle enums, verified by writing one and running each. So it was guarding a capability with zero
consumers while shaping the data model.

**Decision: removed, and the guardrail half kept deliberately.** Every enum is a STRING enum with an
explicit initialiser. The real `enum` footguns are numeric enums (reverse mappings, arbitrary numbers
assignable) and `const enum` (inlined, bundler-hostile); neither is used. Most "enums are bad in
TypeScript" folklore is about those, not about string enums.

**What enums give that the R2 registry could not.** Nominality. `takesRarity("SuperRare")` is a
compile error rather than a pass. Three rounds of literal unions could not provide that, and it is
why two spellings of one tier were able to coexist long enough to ship a bug (Q3). The registries did
not go away — they moved to `vocabularies.ts`, keyed by enum member, holding label/order/colour.
Identity is the enum; everything else about a member is the registry.

**Scope.** 18 enums covering ~1,115 literals across 47 files: the five vocabularies, the two union
discriminant sets, `ModifierStat`, `EventLabel`, `TimelineEventKind`, `StatChangeStat`,
`MultiplierScope`, `StatColorKey`, `ConfirmableField`, `TypeKind`, `AffectedSpeciesKind`, and the
generated id enums (`Species`, `TrainerId`, `TrinketId`, `ItemId`).

### R9. The string-keyed hazards, which the enums did NOT fix

Worth separating, because the user's actual requirement was "no logic keyed upon string matching"
and swapping unions for enums addresses none of these:

| Hazard | Status |
|---|---|
| `unconfirmedFields: string[]` with `isUnconfirmed(creature, "baseDamage")` | **Fixed** (`ConfirmableField`). This went live: the `publishedCast` rename left that string pointing at a removed field, so the "unknown" badge would have stopped appearing with no compile error and no failing test. |
| `Record<string, number>` keyed by an inline `${id}@${slotKey}` at twelve sites | **Fixed** (branded `PlacementKey`, one builder). `TeamSummary` built it BY HAND as `${id}@${row}${col}`, matching only because `slotKey` happens to have that format. |
| Ids as bare strings; `SHINY_STATS`/`CREATURE_REGIONS` keyed by them | **Fixed** (generated id enums, template-literal `ShinyKey`). |
| `<select>` values cast with `as Rarity`/`as RegionId` | **Fixed** — parsed at the boundary via `parseRarity`/`parseRegionId`/`parseTrainerId`. |
| `RegionId` was an OPEN union (`\| (string & {})`) | **Fixed** — closed, so a typo'd region fails instead of matching no creature. |
| `Object.entries` erasing the key type in `TeamSummary`'s status rows | **Fixed** — iterates the vocabulary, which also makes display order the declared order. |
| `toLowerCase()` matching in `deriveTags.ts` and corpus search | **Open.** Inherent to parsing prose; the parsers emit typed values, but their internal word lookup is still case-insensitive string matching. |
