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
size and `align-self: start` so it renders identically wherever it is placed. Generalised rule for
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
| Cobrex | "Whenever an ally inflicts Poison, Charge this by 1 second(s)" | **No** | First cast ~t=4 instead of t=15 |
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
