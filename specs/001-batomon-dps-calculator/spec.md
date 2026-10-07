# Feature Specification: Batomon Showdown DPS & Status Calculator

**Feature Branch**: `001-batomon-dps-calculator`

**Created**: 2026-10-05

**Status**: Draft

**Input**: User description: "Build a calculator for the autobattler game Batomon Showdown. Collect
all creature (and trainer/trinket/item) data into a corpus. The primary UI focus needs to show the
DPS, and any other [status] per second, plus a chart of cumulative damage/status over time (since
effects like poison/shock/burn do damage but burn down). Must represent the underlying mechanics in
code: 2x3 grid positioning, countdown attack timing, damage types, status-effect tracking, a timing
system, creature types, and trainer abilities."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Build a team and see its DPS/status output (Priority: P1)

A player assembles a team of up to six Batomon into the game's 2x3 grid, picks a Trainer, and
immediately sees each creature's effective damage-per-second and every status effect the team
applies (e.g. Poison, Shock, Burn), each shown as a per-second value.

**Why this priority**: This is the core value of the tool — without it there is no calculator, only
a data browser. Every other story builds on this one.

**Independent Test**: Can be fully tested by placing creatures into grid slots, picking a trainer,
and verifying the displayed DPS and per-status-effect values match hand-computed expectations for a
small, known team.

**Acceptance Scenarios**:

1. **Given** an empty team, **When** the user places one creature with a known base damage and
   attack interval into a grid slot, **Then** the displayed DPS equals that creature's damage
   divided by its attack interval (adjusted for any passive the creature itself has).
2. **Given** a team containing a creature that applies a stacking damage-over-time effect, **When**
   the simulated window advances past multiple applications, **Then** the displayed per-second value
   for that status reflects the combined, decaying contribution of all active stacks.
3. **Given** a fully assembled six-creature team and a selected Trainer with a passive that boosts a
   specific status type, **When** the trainer is applied, **Then** the affected status effect's
   per-second value increases according to the trainer's documented effect.

---

### User Story 2 - Visualize cumulative damage/status over time (Priority: P2)

A player views a chart of cumulative damage and cumulative per-status value across the simulated
time window, so they can distinguish burst damage from sustained/decaying damage-over-time
contributions.

**Why this priority**: DPS alone hides *when* damage lands and how fast a DOT effect burns down;
the chart is what makes those cumulative/decay dynamics visible, which is the second explicit
requirement of this tool.

**Independent Test**: Can be tested independently by configuring a team that includes at least one
flat recurring attack and one decaying status effect, then confirming the chart shows a stepped
(linear-ish) line for the flat attack and a curve that decelerates for the decaying effect.

**Acceptance Scenarios**:

1. **Given** a team is assembled, **When** the simulation runs across the configured time window,
   **Then** the chart plots cumulative total damage and a separate cumulative series per active
   status-effect type.
2. **Given** the chart is displayed, **When** the user changes team composition, grid placement, or
   trainer, **Then** the chart recomputes and redraws to reflect the new configuration.

---

### User Story 3 - Browse the corpus (Priority: P3)

A player searches and filters the full collected corpus of creatures, trainers, trinkets, and items
to look up stats and ability text without needing to cross-reference multiple external wikis.

**Why this priority**: Useful on its own (a reference lookup tool) and is the data foundation the
other two stories depend on, but delivers no simulation value by itself — hence lowest priority of
the three.

**Independent Test**: Can be tested independently by searching for a known creature by name and by
filtering the corpus by type and by rarity, verifying the returned set and displayed fields are
correct and show their data source citation(s).

**Acceptance Scenarios**:

1. **Given** the corpus browser, **When** the user searches by creature name, **Then** matching
   creatures are shown with their stats, ability text, and source citation(s).
2. **Given** the corpus browser, **When** the user filters by a creature type and/or rarity,
   **Then** only matching entries are shown.
3. **Given** a corpus entry whose source wikis disagree on a value, **When** the user views that
   entry, **Then** the disagreement is visibly shown rather than silently resolved.

---

### Edge Cases

- What happens when two or more instances of the same status effect (e.g. two separate Poison
  applications) are active on the same target at once? (Resolved as an Assumption below: modeled as
  independent decaying stack instances by default, refined per-effect as corpus research finds the
  real stacking rule documented for that effect.)
- How does the system handle a creature/ability that changes another creature's grid position
  mid-timeline (positional abilities)?
- What happens when a Trainer or ability modifies Cooldown Speed partway through the simulated
  window (e.g., a temporary buff that expires)?
- How does the system handle a corpus entry with no published ability text or an incomplete stat
  (a known data gap)? It MUST be shown as an explicit "unknown/unconfirmed" marker, never silently
  omitted or guessed into a default value.
- What happens if the user removes a creature from an assembled team mid-session — do that
  creature's already-applied status effects on the simulation immediately clear, or decay out
  naturally through the remainder of the window?
- How does the simulated time window handle a creature that evolves/transforms/is devoured
  mid-battle, where its stats change partway through the window?
- How does the system handle a creature whose corpus-confirmed maximum level is below 4 (e.g., a
  species whose own level-up mechanic was officially capped lower than the general case)? It MUST
  NOT assume every creature reaches level 4 by default; a per-species confirmed cap is recorded
  when sourced, otherwise the higher levels are shown as "unknown"/unconfirmed rather than guessed.
- How does the system handle a species documented with more than one possible evolution target
  under different, not-yet-individually-confirmed conditions (a "branching" evolution)? It MUST
  NOT guess which branch applies; such a species is treated as having no resolvable evolution
  until a source confirms each branch's specific trigger condition.
- How does the system handle level 2/3/4 stats when a source publishes them behind a live,
  JavaScript-driven UI control rather than as directly-readable static text? It MUST investigate
  whether the underlying data is nonetheless present in the page's own served content (e.g.
  embedded for client-side hydration) before concluding it is unavailable — round 4 initially
  misdiagnosed this as a hard blocker using a tool that discarded that embedded data; round 5
  found and used it directly (research.md G1). Only log an actual blocker once confirmed by
  inspecting raw page content, not merely a rendered/converted view of it.
- How does the system handle a species whose evolution is triggered by something other than
  reaching a level (e.g. "On Victory")? `evolvesInto` MUST still be recorded, but
  `evolvesAtLevel` MUST be left absent rather than guessed — the level-based evolution resolver
  (`resolveLevelUp`) correctly does not apply to such a species.
- How does the system resolve two creatures whose casts land on the exact same timestamp, where
  one of them applies a status the other's hit could consume? It MUST resolve both against the
  status state as of the start of that timestamp, so the outcome does not depend on an internal
  iteration order (grid position, creature id, or insertion order). A tie-break MAY still fix the
  *display* order of simultaneous timeline events, but MUST NOT change any computed value
  (research.md H8 — this was a real defect, found via a user report).
- How does the system handle a stat value that a source does not publish at all, versus one the
  source confirms the creature does not have? These are different facts and MUST NOT both be
  recorded as a bare `null`; conflating them is an open, logged gap (research.md H9) rather than a
  resolved design.
- How does the system handle one species' stats being sourced from two different sources across
  different levels, where the two disagree (e.g. level 1 from an older community dex, levels 2-4
  from a newer structured source, giving a level-1 value higher than level 2)? It MUST re-derive
  the whole series from one internally consistent source and record the superseded value as a
  conflict, rather than leaving a series that contradicts itself (research.md H10).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a browsable corpus of Batomon creatures, each including name,
  rarity, type(s), shop cost, base attack interval ("countdown"), base damage, damage type, base
  Multicast count, and ability text, each citing the source(s) it was transcribed from and the
  game patch/version those values reflect. Values MUST be recorded **per level the creature can
  reach** (levels 1 through 4 — level 4 reachable only via rare in-run events or consumable
  level-up items, not standard shop merging; not every creature is confirmed to reach level 4),
  never extrapolated or interpolated from another level's values.
- **FR-002**: System MUST provide a browsable corpus of Trainers, each with their ability
  description, source citation(s), and patch/version tag.
- **FR-003**: System MUST provide a browsable corpus of Trinkets and Items, each with their effect
  description, source citation(s), and patch/version tag.
- **FR-004**: System MUST record, for any corpus entry where sources disagree on a value, the
  conflicting values together with their respective sources, rather than silently selecting one.
- **FR-005**: Users MUST be able to assemble a team of up to six creatures and assign each to a
  specific slot in the game's 2x3 grid (two rows by three columns), representing front/back and
  left/right positioning.
- **FR-006**: Users MUST be able to select one Trainer to apply to the assembled team, and
  optionally assign Trinkets/Items where the corpus models them as team- or creature-attached.
- **FR-007**: System MUST compute, for the assembled team over a configurable simulated time window,
  each creature's effective damage-per-second, accounting for its base attack interval, any
  Cooldown-Speed-modifying effects in play, and any Trainer/ability modifiers that change attack
  frequency or per-hit damage.
- **FR-008**: System MUST compute, for every status effect the assembled team applies (including but
  not limited to Poison, Shock, and Burn, and any other decaying/stacking effect type present in the
  corpus), a per-second value reflecting that effect's output at each point in simulated time,
  including the combined effect of multiple overlapping applications and each effect's own
  decay/burn-down behavior.
- **FR-009**: System MUST display a summary view showing each creature's DPS and each active status
  effect's current per-second value, visible together at a glance.
- **FR-010**: System MUST display a chart of cumulative total damage and cumulative per-status-effect
  value accumulated across the simulated time window, so burst contributions and decaying DOT
  contributions are visually distinguishable.
- **FR-011**: Users MUST be able to change team composition, grid placement, Trainer, or
  Trinket/Item selection, and see the DPS/status summary and the chart update to reflect the new
  configuration without a page reload.
- **FR-012**: System MUST model the mechanics needed to support the computations above, as evidenced
  by the corpus content gathered: 2x3 grid adjacency and positional targeting rules, per-creature
  attack countdown/timing, damage types, status-effect application/stacking/decay, and
  Trainer/ability triggers.
- **FR-013**: Users MUST be able to search the corpus by name and filter it by creature type and by
  rarity.
- **FR-014** *(narrowed twice; see the round 7 and round 8 Amendments)*: System MUST clearly display, for the active corpus snapshot, which game patch/version
  it reflects.
- **FR-015**: System MUST provide the full documented Trainer roster (not a partial seed), and the
  Trainer-selection control MUST be presented before/above the creature grid-placement controls in
  the team-building flow, so Trainer choice is made first.
- **FR-016**: System MUST display, for each currently-placed creature, its current *effective*
  combat output per type (direct damage, each status effect it applies, and its Multicast count)
  reflecting any active `StatModifier`s, so a user can see what a modifier change actually affects
  without having to infer it from the aggregate DPS/status summary alone.
- **FR-017**: The cumulative damage/status chart's time axis (FR-010) MUST use consistent,
  evenly-spaced tick values independent of the underlying simulated event timestamps — never
  deriving tick placement directly from raw event times.
- **FR-018**: A creature-assignment search control MUST clear any previously-entered search text
  and receive keyboard focus every time it is opened, regardless of which slot it is opened for.
- **FR-019**: Users MUST be able to drag an already-placed creature from one grid slot to another
  (including a slot already occupied by a different placement, which MUST swap the two
  placements rather than discard either one) as an alternative to the search-based assignment
  flow in FR-018 — the search-based flow MUST remain fully available as well, for users who
  cannot or prefer not to use drag-and-drop.
- **FR-020**: Every place a creature type is rendered as a color (card background, type tag,
  future filter control) MUST use one single, consistent color per type — never two different
  color treatments for the same type within the UI.
- **FR-021**: The per-creature detail view MUST be a persistent panel that updates only when a
  different creature is hovered or focused, MUST NOT disappear when the pointer/focus leaves a
  creature's card, and MUST NOT visually obscure any other creature's card.
- **FR-022**: When a user sets a placement's level at or beyond a species' documented evolution
  threshold, the system MUST display that species' evolved form at that level (resolved from the
  corpus's evolution data) rather than omitting or disabling the level option.
- **FR-023**: Clicking anywhere on a grid slot's card (occupied or empty) MUST open the
  creature-assignment search — no separate button is required to trigger assignment.
- **FR-024**: The DPS table and the per-creature detail panel MUST NOT display a placement's
  grid-slot position as text, since the 2x3 grid already shows it visually.
- **FR-025**: System MUST record each creature's Heal amount and Sell Value as corpus data
  (browsable in the Corpus Browser), citing sources the same as any other stat, even though
  neither is simulated in the DPS/status engine (Heal has no modeled target to restore, per the
  Assumptions section; Sell Value is a shop-economy concept, out of scope for simulation).
- **FR-026**: System MUST record each creature's level 2, 3, and 4 stats (cooldown, Multicast,
  damage/status amounts, by-level ability text) as distinct, individually citable corpus
  records, for every level the species or its evolved form(s) can reach.
- **FR-027**: Users MUST be able to select one or more Trinkets to apply to the assembled team,
  mirroring the existing Trainer-selection flow (FR-006), and the DPS/status summary MUST
  reflect any selected Trinket whose effect is a flat, unconditional, permanent team-wide stat
  bonus (per FR-007/FR-008's existing modifier-resolution path) — Trinkets whose effect is a
  shop/economy mechanic remain browsable/selectable but are not expected to change the
  DPS/status output, consistent with the Assumptions section's existing shop-economy scope note.
- **FR-028**: Every creature card — in both the corpus browser and the team-builder's
  selected-creature panel — MUST present its information in the same band order the in-game card
  uses: name and rarity together, then sprite and types, then cooldown shown separately from a
  **one-line-per-stat** breakdown of per-cast output, then the ability's trigger label above its
  description. Cost, cooldown, and damage MUST NOT be rendered as a single combined line — and
  this applies to every stat line on the card, including the modifier-adjusted "effective" values,
  not only the base-stat band.
- **FR-029**: Each per-cast output stat MUST be rendered in the game's own published colour for
  that stat, consistently everywhere it appears (card stat lines and grid-slot badges alike).
- **FR-030**: The corpus browser MUST NOT display source citations, patch tags, or recorded
  source conflicts. These remain recorded in the corpus data itself (see the round 6 Amendment
  for how FR-004/SC-004 are satisfied without a UI surface).
- **FR-031**: The corpus browser MUST lay its creature cards out in a multi-column grid
  (3-4 columns at typical desktop widths) rather than one full-width card per row.
- **FR-032**: Trinket selection MUST use the same searchable, card-based picker interaction as
  creature selection (FR-018), showing each trinket's sprite and full effect text at selection
  time. A plain dropdown of trinket names MUST NOT be the primary selection control.
- **FR-033**: Each occupied grid slot MUST offer a directly visible control to clear that slot,
  which MUST NOT also trigger slot reassignment or drag behaviour when activated.
- **FR-034**: The team grid MUST NOT render textual row labels ("back row"/"front row"), and the
  creature picker MUST NOT render the target slot's position in its visible heading. Slot
  position MUST remain available to assistive technology.
- **FR-035**: Grid-slot creature icons MUST be square, and MUST display that creature's current
  per-cast output stats as compact colour-coded badges within the slot, matching the in-game team
  panel's presentation.
- **FR-036**: System MUST display every creature's sprite image in the creature picker, the team
  grid, and the corpus browser, and every trinket's sprite in the trinket picker. A creature or
  trinket with no available sprite MUST render its existing text presentation rather than a
  broken image.
- **FR-037**: The simulation-window control MUST be positioned immediately above the cumulative
  chart and below the DPS/status tables, reflecting that it affects the chart's time axis rather
  than the per-second summary values.
- **FR-038**: The DPS table and the status-output table MUST be presented side by side as a
  single aligned unit.
- **FR-039**: Modifier editing MUST be a collapsed-by-default disclosure, MUST scope each
  modifier to a specific placed creature (no user-facing team-wide option), and MUST keep
  unit/format explanations as supporting text rather than inside control labels.
- **FR-040**: Permuting the grid positions of placed creatures that have no position-dependent
  ability MUST NOT change any value in the DPS, facilitated-DPS, or per-status output.

- **FR-041**: Every colour used to represent a stat MUST match that stat's appearance in the game.
  Where a third-party source's published palette disagrees with the game's own rendering, the game's
  rendering wins and the correction MUST be recorded with its evidence.
- **FR-042**: User-facing copy MUST refer to the creatures as "Batomon". The term "Banto" MUST NOT
  appear in any user-visible string, including accessibility labels.
- **FR-043**: Cards and panels MUST reserve fixed space sized to the corpus's actual worst case,
  and MUST NOT resize or reflow as their contents change (different creature, type count, name
  length, or ability-text length). Text MUST NOT overflow its container.
- **FR-044**: Any value shown on more than one surface (cooldown, damage, status amount) MUST be
  rendered through a single shared formatter, so two surfaces cannot display the same quantity at
  different precision.
- **FR-045**: Modifier editing MUST adapt its layout to the available width rather than fixing one
  item per row, and MUST accumulate repeated modifiers of the same stat on the same creature into a
  single total rather than listing separate equal entries. An accumulated total reaching zero MUST
  remove the entry.
- **FR-046**: Status output labels MUST NOT qualify a value with a distinction the engine does not
  model.
- **FR-047**: An occupied grid slot MUST respond to a single click by opening the creature picker,
  **and** MUST still support dragging to another slot. Neither interaction may suppress the other.
- **FR-048**: The creature picker's result cards MUST show the creature's sprite prominently and its
  name, MUST NOT show rarity text or price on the card, and MUST group results into rarity sections
  with a left-justified heading per section.
- **FR-049**: A multi-type creature's split background MUST render as exactly two equal halves with
  no colour bleed, seam, or sliver at any element size.
- **FR-050**: The application header MUST NOT display corpus/patch provenance prose. The active
  corpus/patch version MUST remain stated somewhere discoverable (see FR-014 as amended in the
  round 7 Amendment).
- **FR-051**: Cards within any grid MUST share a uniform height sized to the corpus's longest
  content, so no card's text overruns and no row is ragged.
- **FR-052**: The selected-trinket list MUST be collapsible so that adding trinkets does not
  displace the team grid, and each entry's name and remove control MUST be top-aligned so the
  remove control sits at a constant position regardless of description length.
- **FR-053**: Creature sprites MUST be displayed at a size specified by a shared named token rather
  than per-call-site literals.
- **FR-054**: Chart axis labels MUST be fully visible (not clipped) and the horizontal axis label
  MUST be centred.
- **FR-055**: The status-output summary MUST report, per status, both the damage per second **and**
  the rate at which that status is being applied, plus an indication of how quickly the damage rate
  is itself growing — because a status whose stacks do not decay produces a damage rate that rises
  throughout the battle, which a single averaged figure misrepresents.
- **FR-056**: A creature whose contribution is applying a damage-over-time status MUST have that
  resulting damage attributed to it as facilitated output, rather than reporting zero for both its
  own and its facilitated contribution.
- **FR-057**: The simulation timeline MUST record the application of every status effect, not only
  some of them, so that application rates are derivable for all statuses on equal terms.
- **FR-058**: All UI MUST be composed from the shared primitives layer and design tokens described
  in Constitution Principle VII. Introducing a bespoke duplicate of an existing visual pattern is a
  defect.

- **FR-059**: A shared UI primitive MUST render identically regardless of the container it is placed
  in. A primitive whose size or appearance is determined by its parent's layout is a defect, not a
  reusable component.
- **FR-060**: Every creature sprite MUST take its size from a shared token, and the creature
  picker's sprites MUST render at **64×64**, matching the team grid. A literal size at a call site is
  a defect. ("From the shared token" alone is insufficient — the token named for the picker was
  48px, so that wording would have left the defect in place.)
- **FR-061**: The creature picker's result cards MUST place the sprite in the art area and the name
  in a band at the card's bottom edge, with no unfilled background between them.
- **FR-062**: The selected-creature panel MUST hold a constant width as its contents change, so that
  sibling content (notably the charts) is never re-laid-out by a creature selection.
- **FR-063**: Data tables MUST have all four edges **visually indistinguishable in both colour and
  weight**. (Stated as colour-and-weight deliberately: the observed defect was a 1px bottom border in
  a near-background colour, so a weight-only requirement would have been satisfied by changing
  nothing.)
- **FR-064**: The application MUST NOT display a "Batomon Stats" heading above the selected-creature
  panel; the panel MUST align with the top of the team grid.
- **FR-065**: Grid slots MUST NOT render a per-slot fallback dropdown. (The accessible path to
  reassignment is Enter/Space on the slot, restored in FR-047.)
- **FR-066**: Modifier editing MUST be positioned between the team grid and the summary tables.
- **FR-067**: **Every list rendered in the UI** — not only lists of corpus records — MUST be ordered
  deterministically at the point of display, never inheriting the order its items happen to occupy in
  a source file or an object's key order. A data edit MUST NOT be able to change display order. This
  includes filter dropdowns and summary-table rows, not just creature lists.
- **FR-068**: System MUST provide a chart of instantaneous damage-per-second over time, distinct from
  the cumulative chart, so that a rising or falling output rate is visible rather than implied.
- **FR-069**: System SHOULD offer a placement suggestion that searches arrangements of the currently
  placed creatures for higher time-weighted output. Where the corpus lacks the positional ability
  data such a search depends on, the feature MUST state that limitation in the UI rather than
  reporting "no improvement" as though the search were conclusive.
- **FR-070**: The corpus browser MUST be titled "Batomon Browser", MUST use fixed-height cards, and
  MUST NOT display corpus/patch provenance prose.

- **FR-071**: The team grid MUST hold its size regardless of what a sibling panel does; no layout
  change elsewhere may shrink the creature slots or their sprites (WI-001).
- **FR-072**: The per-creature output table MUST show a total combining direct and facilitated
  output, and MUST present a single prominent total-DPS figure, because a status-only team currently
  reads `0.00` in every row while dealing substantial damage.
- **FR-073**: System MUST resolve each creature's effective stats after **all** applicable effects —
  on-battle-start abilities, abilities triggered by allies' actions, positional abilities, and
  selected trinkets — and the simulation MUST use those resolved values. The "Effective this battle"
  display MUST show the resolved result, not the creature's base stats.
- **FR-074**: The resolution in FR-073 MUST be a single shared layer consumed by every feature that
  depends on it, including the placement suggester, so no two features can disagree about a
  creature's effective stats.
- **FR-075**: Where a creature's or trinket's ability is recorded only as prose and has no structured
  representation the engine can act on, the system MUST make that coverage limit visible rather than
  presenting its output as complete.
- **FR-076**: System MUST provide a time control that scrubs through the simulated battle, updating
  the headline output figure to that moment's value, consistent with the damage-rate chart.

### Key Entities

- **Creature (Batomon)**: A collectible unit with name, rarity, one or more types, shop cost, base
  attack interval, base damage amount, damage type, ability text, evolution-chain reference (if
  any), source citation(s), patch tag, and recorded source conflicts (if any).
- **Trainer**: A run-level selection with a passive/active ability description, source citation(s),
  and patch tag.
- **Trinket** / **Item**: A collectible modifier with an effect description, source citation(s), and
  patch tag.
- **Team Configuration**: The user's current working state — up to six creature placements mapped to
  2x3 grid slots, one selected Trainer, and any selected Trinkets/Items.
- **Status Effect Instance**: A single application of a status effect (type, source, magnitude,
  remaining duration/stacks, decay profile) currently active on a target within the simulation.
- **Simulation Timeline**: The time-ordered sequence of simulated events (attacks, ability triggers,
  status ticks) across the configured window, from which the DPS summary and cumulative chart are
  both derived — ensuring the two displays can never show inconsistent numbers for the same
  configuration.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can assemble a six-creature team with grid placement and a Trainer, and see the
  DPS and per-status-effect summary for that team, entirely through on-page interaction with no page
  reload.
- **SC-002**: The cumulative damage/status chart reflects any team, placement, or Trainer change
  within 1 second of that change, on typical consumer hardware.
- **SC-003**: At least 90% of creature corpus entries available at launch have a complete, citable
  set of required stats (type, cost, attack interval, damage, ability text) with no missing
  required field.
- **SC-004**: 100% of corpus entries where source wikis disagree on a value have that disagreement
  visibly recorded in the entry rather than silently resolved.
- **SC-005**: A first-time user, looking only at the chart (no prior explanation), can correctly
  identify which plotted series is a decaying damage-over-time effect versus a flat recurring
  attack, in an informal usability check.

## Assumptions

- **Target model**: this is a calculator/planning tool, not a full two-board battle predictor. The
  simulation runs the user's assembled team against a configurable idealized target (adjustable
  effective durability) rather than resolving a full match against a second, opposing board. Full
  PvP battle resolution is out of scope for this feature and may be considered as a later addition.
- **Status stacking default**: unless corpus research documents a specific effect's real stacking
  rule (additive, refresh-duration, or independent instances), the engine models stacking status
  effects as independent, individually decaying instances summed together, as the most general
  representation. Per-effect rules found during corpus collection override this default and are
  recorded against that effect's definition.
- **Corpus freshness**: the corpus reflects a best-effort, cited snapshot cross-referenced across the
  available fan wikis at build time (no single official datasheet exists for this game); it is not a
  live-updating scrape. Each record's `patch` tag states which version it reflects so the corpus can
  be refreshed deliberately as new patches land.
- **Scope of status effects**: "status effects" includes both damage-over-time effects (Poison,
  Shock, Burn, etc.) and non-damage status modifiers (e.g. Shield, Cooldown Speed changes) to the
  extent the corpus documents them acting on a per-second or over-time basis; purely instantaneous
  one-time effects (e.g. a flat heal with no over-time component) are tracked in the timeline but are
  not expected to need a "per-second" display of their own.
- **Audience/device**: primary usage is a desktop web browser; a responsive layout is expected but
  mobile-specific interaction patterns are not a launch requirement.
- **Users have access to no account/login system** — this is a stateless, client-side tool with no
  requirement to persist a user's team configuration across sessions at launch (local-only
  persistence, e.g. for convenience, may be added later without being a launch requirement).

## Amendments

### 2026-10-05 (round 2) — FR-015/016/017 added; FR-001 widened for per-level stats; SC-003 gap logged

Added via `/speckit-plan` in response to user-reported items: full Trainer roster + its placement
in the team-building flow (FR-015), a per-creature effective-stat breakdown so modifier changes
are visible (FR-016), consistent chart X-axis ticks (FR-017), and per-level (1–4) creature stats
(FR-001 amendment) — see research.md section D and data-model.md's matching amendments for the
cited mechanics and the exact type/engine changes this implies.

**SC-003 status, logged honestly rather than quietly lowered**: as of this round, only 5 of 149
creature records (~3.4%) have confirmed `baseDamage`/`baseCooldownSeconds` — far below the ≥90%
target. This is a known, large, pre-existing gap (not introduced by this round's changes); closing
it requires per-creature, per-level, individually-cited research across the full corpus and is
tracked as ongoing corpus-widening work (see research.md D5) rather than something any single
planning or implementation pass can close outright. The 90% target in SC-003 is kept as-is (not
weakened) to keep it honest as a measure of remaining work.

**Diagnosis note**: a user report that the DPS table and chart "went to zero" after an unrelated UI
change was investigated and found to be caused by the above corpus gap (the specific creatures
tested had unconfirmed stats), not a code regression — see research.md D5 for the full diagnosis.
Logged here so this does not get re-opened as a suspected engine bug in a future round.

### 2026-10-05 (round 3) — FR-018 through FR-022 added: reference-site-inspired team-builder redesign

The user found an external, independently-built companion site (batomon.com's "Build Lab") whose
*layout concept* they want this project to adopt (icon-based creature cards, type-colored
backgrounds, a per-slot search modal, a hover detail panel) without visually cloning it, while
fixing 7 specific defects they identified in it and preserving this project's own
differentiators (StatModifiers, DPS/damage output — the reference has neither). See research.md
section E for the full defect-by-defect analysis and the resulting design decisions
(data-model.md gains matching amendments: `evolvesAtLevel`, a canonical type-color mapping, and
drag-and-drop semantics).

**Trust note** (not a spec requirement, recorded for context): the user also asked whether
batomon.com is an official site. It is not — confirmed via WHOIS, TLS certificate, hosting
fingerprint, and the site's own FAQ self-disclosure, all cited in research.md E1. It is treated
here purely as UI/UX inspiration and a potential future corpus citation source, not an authority.

### 2026-10-05 (round 4) — FR-023/024/025 added; two patch-driven mechanic corrections; a hard corpus blocker identified

Added via `/speckit-plan` in response to user-reported items and a user-supplied in-game stat
reference. Two engine corrections (not new requirements, but corrections to existing behavior):
`STATUS_VS_SHIELD_REDUCTION` 25% -> 15% (an August 2026 balance patch this project hadn't yet
picked up) and Multicast repetitions now stagger 0.1s apart instead of firing simultaneously (a
correction to round 2's own implementation) — see research.md F1/F2. FR-023 (click-anywhere
assignment) and FR-024 (drop redundant slot labels) are UI cleanup. FR-025 adds Heal/Sell Value
as corpus data (research.md F3).

**Scope finding, logged rather than attempted with fabricated data**: the user's request to add
level 2/3/4 stats for all 149 creatures was investigated directly and found to be **blocked**,
not merely large — no available source publishes those numbers in a form this project's tooling
can extract (research.md F5). The level-1 damage/cooldown completion task (research.md F6)
remains large but achievable and continues as tracked, incremental work (`tasks.md` T075).

### 2026-10-06 (round 5) — FR-026/027 added; F5's "blocked" finding retracted; full level 2-4 + Trinket corpus

Round 4's F5 finding ("level 2-4 stats are a hard blocker") is **retracted** — it was a tooling
artifact (a markdown-converting fetch tool discarding the `<script>` tag the data actually lived
in), not a true data-availability limit. Investigating the raw page content directly found the
complete creature database (all 149 ids, all 4 levels, by-level ability text, evolution chains)
and the complete 93-entry Trinket database both embedded in their respective listing pages'
server-rendered React payload (research.md G1/G2). FR-026 (level 2-4 corpus) and FR-027
(Trinket selection + flat-bonus application) added accordingly. No prior requirement is removed
by this correction — SC-003's ≥90% bar and the diagnosis logged in the previous Amendment both
still stand; this entry only corrects F5's conclusion, not the honesty of having logged it.

### 2026-10-06 (round 6) — FR-028..FR-040 added; SC-004's surface moved out of the UI; two self-found data defects logged

Thirteen user-reported UI/presentation items plus one user-reported bug, all added as FR-028
through FR-040 and detailed in research.md section H. The user supplied an in-game creature card
and in-game team panel as the layout reference, and two before/after captures of the bug.

**FR-004/SC-004 are explicitly re-scoped, not quietly dropped.** FR-030 (user item 2) removes
source citations, patch tags, and recorded source conflicts from the corpus browser UI — and
SC-004 as originally written ("100% of corpus entries where source wikis disagree have that
disagreement **visibly recorded in the entry**") was being satisfied *by that very UI*. Rather
than delete the criterion or pretend the removal doesn't touch it, its enforcement surface moves:
conflicts and citations remain mandatory **in the corpus data** (`sourceRefs`, `patch`,
`conflicts` on every record — unchanged, and still required by Principle IV), and the criterion is
now met by an automated test asserting every recorded conflict is well-formed and every record
carries at least one citation, instead of by a disclosure widget a user must click. The
user-facing rationale is sound — a planning tool's reader wants stats, not provenance footnotes —
but the provenance obligation itself is unchanged, and SC-004's ≥100% bar is kept as-is.

**FR-040 records a real engine defect the user caught.** Grid position was silently changing
Shock-proc damage for creatures with no positional ability, via `simulate()`'s
simultaneous-cast tie-break doubling as a damage-ordering rule. Reproduced, root-caused, and
fixed per research.md H8 / data-model.md's "common pre-cast status snapshot" amendment. The
user's reasoning in the report ("Bumblebolt doesn't care about positioning and the math shouldn't
change") is adopted *as the specification* — FR-040 states the invariant, and the regression test
asserts the invariant rather than either of the two numbers observed.

**Two defects found during this round's investigation that the user did not report, recorded
rather than quietly fixed or quietly left:**

- Round 5's "**100% confirmed across levels 1-4**" claim — in its completion report, `README.md`,
  and the in-app corpus label — **is overstated and wrong**. It was verified by counting
  `baseCooldownSeconds` only; `baseDamage` is `null` in 242 of 596 records (62 of 149 at level 1).
  The user's own Brimtoad screenshot proves at least some of those nulls are missing data rather
  than confirmed absences (the in-game card reads "Deal 5 damage"; the corpus and its source both
  say `null`). All three labels are corrected to the real figure, and the
  confirmed-absent-vs-not-published conflation is logged as a new Edge Case rather than papered
  over. SC-003's ≥90% bar is unchanged and is **not** currently met for `baseDamage`.
- **10 species have a level-1 value that contradicts their own level 2-4 series** (e.g. Brimtoad's
  level 1 records Burn 5/Poison 5 while level 2 records Burn 2/Poison 2 — and the user's in-game
  screenshot confirms level 1 is really Burn 1/Poison 1). Caused by round 5 populating levels 2-4
  from a newer structured source while leaving level 1 on the older community dex. Re-derived from
  one consistent source with the superseded values kept as recorded conflicts (research.md H10).

### 2026-10-06 (round 7) — FR-041..FR-058 added; FR-014 narrowed; Constitution gains Principle VII

Twenty user-reported items (research.md section I). Four required diagnosis — a dead click handler,
a background "sliver", a wrong Shield colour, and a misleading status metric — and two change how
the project operates going forward.

**FR-014 is narrowed, not dropped.** FR-050 (user item 12) removes the corpus/patch prose from the
application header, which is where FR-014 ("state which corpus/patch snapshot is active") was being
satisfied. FR-014 is therefore amended: the active corpus/patch version MUST still be stated, but
**on one discoverable surface rather than persistently on every view**. It moves into the Corpus
Browser's summary line. This is deliberately *not* a re-run of FR-030: FR-030 removed **per-record**
citations, patch tags, and conflicts from the browser; a single corpus-level version stamp is a
different thing, and the distinction is recorded here rather than assumed.

A first draft of this round's research claimed FR-014 was *already* satisfied by the Corpus
Browser's existing summary line. **That was false** — that line carries entry counts only and names
no version. Had it shipped as drafted, FR-014 would have been silently unmet everywhere while the
plan asserted compliance. Caught in review and corrected here rather than quietly fixed.

**Constitution amended to 1.1.0** with Principle VII (Shared Design Language & DRY UI), at the
user's explicit request that it bind "all future requests/changes/tasks" and not just this round.
FR-058 is its spec-level expression. Motivated by measured duplication, not preference: three
independent card treatments, two cooldown formatters disagreeing on decimal places, duplicated modal
chrome, chip styling defined in three files, `RARITIES` defined in three files with inconsistent
order, `STATUS_COLOR_KEY` defined twice plus a third `statusColor()` variant, chart stroke colours
diverging from `STAT_COLORS`, and six call sites hard-coding sprite sizes — which reached the user
as several *separate* visual bugs that are really one cause.

**Two corrections to this round's own evidence**, recorded rather than quietly amended:

- The claim that Poison's averaged DPS understates the end of a fight by "~4.5×" was **inflated by
  a bug in the measuring probe** (it clamped the final tick into the last bucket, double-counting
  it). Re-measured correctly: **2.1–2.5×**. The conclusion holds; the number was wrong.
- The "sliver" was first attributed to fractional-pixel antialiasing of a gradient's 50% stop. That
  was wrong — it would show at the card's centre, not its edge. The real cause is
  `background-origin: padding-box` with `background-clip: border-box` repeating the gradient into a
  transparent 2px border.


### 2026-10-06 (round 8) — FR-059..FR-070 added; FR-014 narrowed a second time; round 7's fixed-height decision reversed

Eighteen atomic work items from a `/speckit-orchestrate` run (ledger:
`orchestration/round-1-items.md`). The majority are defects in round 7's own primitives layer, which
is the finding worth stating plainly: **adopting shared components bought consistency, not
correctness.** `CreatureTile` applied its flex-column class to `TypeSplit`'s host element while the
children rendered inside `TypeSplit`'s inner wrapper, so the layout class governed nothing — and
every call site inherited that one defect identically. `CooldownBlock` had no intrinsic size and so
rendered at two different heights purely from its parents' layouts. FR-059 is the generalised rule
these produce.

**FR-014 is narrowed for the second time, explicitly.** Round 7 removed the corpus/patch prose from
the app header (FR-050) and relocated it to the Corpus Browser's summary line *specifically* so
FR-014 kept a home. WI-014 asks to remove it from there too. Rather than leave the requirement unmet
with no surface — the exact failure a review caught in round 7 before it shipped — the version moves
to a single unobtrusive footer line. The user's objection both times has been to provenance **prose
at the top of a view**, not to the version being recorded at all. If a future round removes the
footer too, FR-014 should be **retired outright with a stated rationale** rather than quietly unmet.

**A round 7 decision is reversed, not forgotten.** Round 7 deliberately left `fixedHeight` off the
Corpus Browser's cards, reasoning that its grid already equalises row heights and that freezing 149
cards would waste vertical space (research.md I3). WI-013 asks for the opposite. The user's
preference governs; the earlier rationale is recorded as superseded.

**FR-069 ships with a stated blind spot, and the count behind it was corrected in review.** An
earlier draft asserted only one creature had a positional ability. In fact **two** carry
positional-target `AbilityTag`s — Formiqueen (`adjacent`) and Onsetra (`behind`) — but the engine
reads only `cooldownSpeedModifier` tags, so **one** is actually actionable and Onsetra's is silently
ignored. Any count shown to the user must therefore be computed from what the engine can act on, not
from what carries a tag; the latter would reassure about a creature the optimiser cannot reason
about. Unmodelled positional *trinkets* must be disclosed too — Link Cable ("All of your team's
monsters are now considered adjacent to each other") would invalidate the one interaction the
optimiser can see. The chaining effects motivating the request —
"speeds up mon in front", "mon in slot X gets multicast Y" — exist as `abilityText` with no
`AbilityTag`, so the engine cannot reason about them. An optimiser will therefore find no improvement
for almost every team, and the UI must say *why* rather than presenting an empty result as a
conclusion.


### 2026-10-06 (round 9) — FR-071..FR-076 added; the DPS accuracy gap confirmed and quantified

Nine atomic work items (ledger: `orchestration/round-2-items.md`). The user's suspicion that "the
DPS measurement is off" was investigated and **confirmed**, with the magnitude measured rather than
estimated.

**The output table was actively misleading.** `perCreatureDps` counts direct damage only, so the
user's all-status team showed `0.00` in every row while dealing **136.6 damage/second** — all of it
in the separate "Facilitated DPS" column. Facilitated total exactly equals `perStatusPerSecond`, so
direct + facilitated is a complete, non-double-counting partition; FR-072 requires that sum be shown.

**Every creature on the user's board had an unmodelled ability.** Miasmaw's Poison should read 336,
not 10. Cobrex charges 1 second per allied Poison application — with **9** such applications strictly
before t=15, it should fire around **t=9-10 rather than t=15**, which is also the answer to "why does DPS take
off at 15 seconds" (Cobrex's single opening cast applying Poison 300, which never decays). Drumire's
and Fumungus's abilities are likewise inert. FR-073/FR-074 add the resolution layer this needs.

**The ceiling is stated up front rather than discovered later.** Only **6 of 149** level-1 creatures
have any `abilityTags`. An effect engine acts on structured tags, so building it does not make 143
creatures' prose abilities work. FR-075 requires that limit be visible — the same rule round 8
applied to the placement optimiser, and more important here, because a DPS figure reads as
authoritative in a way an empty suggestion list does not. **This round does not claim to make DPS
correct for arbitrary teams**; it makes it correct for tagged creatures and makes the gap visible
for the rest.
