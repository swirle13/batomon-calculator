# Feature Specification: The Battle Simulator and a Calibrated Objective

**Feature Branch**: `004-battle-simulator-calibration`

**Created**: 2026-10-13

**Status**: Draft — specification only, nothing built. Approach resolved in
[research.md](./research.md); see **B1** for what the current constant actually asserts and **F**
for the recommended first slice.

**Input**: User description: *"the suggestion engine specifically orients its weight about front-loaded
damage being more important and uses 10 seconds as that anchor point. I'm wanting to overhaul that
through more detailed research in data modelling and prediction standards to find the best way to
make sure suggestions will have the most real-world impact, not just theoretical. I know this
probably won't be feasible without some example teams to put into the engine as the opponent,
probably as a third component of the site for a "battle simulator" so that people can maybe test
their teams against known and/or designed teams to beat, so they can practice, which would also
help you and I work on actually representing the battles to refine the suggestion engine, and
subsequently, ensure the mon detail pane "effective" is really representative of real world values,
as longer games ramp and trigger more, but in the late game, days 9+, fights tend to last fewer and
fewer seconds, which I want to be sensitive to representing the data accurately and making accurate
suggestions"*

---

## 0. The decision this specification turns on

Every suggestion this app makes is ranked by one number, and that number rests on three unvalidated
constants. Replacing them has two possible readings, and everything below changes depending on
which is taken, so it is settled first.

### Is the objective calibrated against a MEASURED fight, or against a SIMULATED opponent?

| | Measured horizon | Simulated opponent |
|---|---|---|
| What replaces the 10s anchor | The fight length the engine already predicts for the day | The length of a resolved two-sided battle |
| What replaces "the enemy deals what you deal" | A damage-per-second figure read off captured recordings | The opponent board's own simulated output |
| Engine change | The discount horizon becomes a function of the board and the day | A second team, incoming damage, HP pools, deaths, targeting, win/loss |
| New data needed | Fight durations and enemy DPS, extracted from recordings | All of that, **plus** an authored opponent team per day |
| Answers *"will this board beat day 12?"* | Approximately — as a time-to-kill against a passive HP pool | Yes, as a win or a loss |
| Answers *"why did I lose that fight?"* | No | Yes |
| Can ship against data that exists today | **Yes** | No |

**Recommendation: both, in that order, as two independently valuable slices.**

The measured horizon is the half that fixes the reported problem, and it can ship now. The engine
*already* predicts how long a fight lasts — `timeToKillSeconds` simulates arbitrarily far out
against a day-indexed enemy HP curve read from real play — so the discount horizon does not need a
constant at all. It needs to be pointed at a figure the engine can compute.

The simulated opponent is what the user asked for by name, and it is the only thing that can
validate the first half or answer "will I win". It is also a much larger change, and building it
first would mean the objective stays mis-anchored for however long it takes.

Everything below is written for that staging. Requirements that need the opponent model are marked
**[OPP]** and belong to User Story 3 onward.

### What is wrong today, concretely

Three numbers decide every piece of advice in the app, and none has ever been checked against a
real fight:

1. **`TIME_WEIGHT_HALF_LIFE_SECONDS = 10`** — damage ten seconds in counts half. This is the
   "front-loaded damage matters more" anchor. Its own source comment is honest that it is a
   survivability assumption wearing a discount's clothes, and [research.md](./research.md) **B1**
   shows it is literally one: the weight is the survival function of a constant hazard rate, so the
   constant asserts that every fight on every day ends at a constant rate with a mean of 14.4
   seconds. A constant hazard is the unique *memoryless* one, which is the single shape that cannot
   represent a fight becoming likelier to end as HP depletes.
2. **The mirror assumption** — `survivability.ts` prices shields, heals and cleanses against an
   assumed incoming DPS equal to *your own*. It is scale-free, which is why it was chosen, and it
   is still a guess about an opponent the engine does not simulate.
3. **The 30-second default window** — every "Effective this battle" figure, every DPS average and
   every suggestion is computed over a fixed 30 seconds, regardless of which day's fight the board
   is being built for.

The third is the one the user can see most directly. A Puffloon next to two Toxic allies reports
"1.4 sec" and "16 ally casts in 30s", and on a day-14 fight that may be the right picture while on
a day-3 fight that ends in eight seconds it is not — the ramp never happens. The card is accurate
about the simulation and may be misleading about the game.

### The observation that makes this tractable

Fight length is not uniform across a run, and it is not monotonic either. Early fights are short
because both boards are weak; mid-run fights lengthen as enemy HP outruns player scaling; and from
roughly day 9 the user reports fights getting shorter again as player scaling compounds past the HP
curve. A single constant cannot describe a curve that goes down, up, then down.

The engine already holds both halves of that curve: `ENEMY_HP_BY_DAY` (days 1–19 observed, 20–25
projected) and a simulator that can be run to any horizon. The predicted fight length for *this
board on this day* is therefore computable today, and it is a strictly better anchor than 10
seconds because it varies in exactly the way the thing it is modelling varies.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Suggestions aimed at the fight I am actually having (Priority: P1)

I am building a board for day 12. The advisor ranks lineups by how much damage they do weighted
toward the opening, and I want "the opening" to mean the opening of a day-12 fight rather than a
fixed ten seconds. When I change the day, the ranking should change, because a board that wins a
long fight is not the board that wins a short one.

**Why this priority**: this is the reported defect and the whole of the first slice. It needs no
opponent model, no new UI surface and no new data — only that the existing discount stop being a
constant.

**Independent Test**: build one board, set the run day to 3, record the advisor's recommended
lineup; set it to 14 and confirm the recommendation can differ, and that each is defensible as
"the better board for a fight of that length".

**Acceptance Scenarios**:

1. **Given** a board with a slow Poison ramp and an alternative with front-loaded direct damage,
   **When** the run day is set to an early day whose fight the engine predicts is short,
   **Then** the advisor prefers the front-loaded board.
2. **Given** the same two boards, **When** the run day is set to a day whose predicted fight is
   long, **Then** the advisor prefers the ramp.
3. **Given** any board, **When** the day is changed and nothing else, **Then** every figure the
   advisor quotes is recomputed and the panel states which day it was ranked for.
4. **Given** a board that cannot kill the day's enemy at all, **When** suggestions are produced,
   **Then** the advisor says so rather than silently ranking against an unreachable fight.

---

### User Story 2 — "Effective this battle" means a real battle (Priority: P1)

I hover a Puffloon and the card tells me it casts every 1.4 seconds with 16 ally-triggered casts.
I want to know that those figures describe the fight I am building for — so if a day-3 fight lasts
eight seconds, the card should say what happens in eight seconds, not in thirty.

**Why this priority**: same root cause as Story 1 and the same fix, but it is the half the user
reads most often, and a per-monster figure that overstates a ramp is how a board gets built around
a synergy that never fires.

**Independent Test**: place a Toxic trio, note the Puffloon card's cast count and effective rate at
a short predicted fight length and at a long one, and confirm both the count and the rate change
and that the stated horizon changes with them.

**Acceptance Scenarios**:

1. **Given** a monster whose rate ramps over the fight, **When** the predicted fight is short,
   **Then** its effective rate is closer to its published cooldown than on a long fight.
2. **Given** any card showing the effective band, **When** it quotes a cast count, **Then** it
   names the horizon that count is over.
3. **Given** a user who has overridden the simulation window by hand, **When** they view a card,
   **Then** their chosen window is honoured and the derived default is not silently reimposed.

---

### User Story 3 — Fight a known opponent **[OPP]** (Priority: P2)

I want to put my board against a specific enemy team — one captured from a real run or one designed
as a benchmark — and see the fight resolve: who dies, when, and whether I win. Today the app
simulates my team hitting a passive HP pool that never fights back.

**Why this priority**: this is the "battle simulator" the user asked for, and the first thing that
can answer "will I win" rather than "how fast could I chew through this much HP". It is P2 rather
than P1 because it requires the engine to grow an entire incoming side, and because Stories 1 and 2
deliver without it.

**Independent Test**: load a benchmark opponent, run the fight, and confirm the result is a win or a
loss with a readable timeline, reproducible across runs from the same inputs.

**Acceptance Scenarios**:

1. **Given** my board and a selected opponent team, **When** I run the battle, **Then** I see a
   resolved outcome and the time it took.
2. **Given** the same board and opponent, **When** I run it twice, **Then** the outcome and the
   timeline are identical.
3. **Given** an opponent that heals or shields, **When** the fight resolves, **Then** my
   time-to-kill is longer than the passive-HP estimate for the same day.
4. **Given** a fight I lose, **When** I inspect the timeline, **Then** I can see which of my
   monsters died and when.

---

### User Story 4 — Practice against the benchmark set **[OPP]** (Priority: P3)

I want a library of opponent teams to test against so I can practise, and so that a board I am
proud of can be checked against something other than my own guesswork.

**Why this priority**: the user's stated motivation ("so they can practice"), and the mechanism by
which the project accumulates the opponent data every other part of this feature needs. It is last
because it is a content and curation surface on top of Story 3's engine.

**Independent Test**: pick a benchmark opponent from a list, fight it, and see a pass/fail against
that benchmark recorded for the board.

**Acceptance Scenarios**:

1. **Given** the benchmark list, **When** I select a day, **Then** I am offered the opponents
   recorded or designed for that day.
2. **Given** a board, **When** I run it against every benchmark for its day, **Then** I see which
   it beats and which it does not.

---

### User Story 5 — Calibrate the engine against recorded fights **[OPP]** (Priority: P3)

As the maintainer, I want to compare the engine's prediction of a fight against a recording of that
same fight, so that the objective's anchors are fitted to observation rather than argued from first
principles.

**Why this priority**: this is the research half of the request, and the only thing that turns
"real-world impact, not just theoretical" from an intention into a measurement. It is P3 because it
needs Story 3's two-sided engine to have anything to compare, and because the capture pipeline it
depends on already exists and is not blocked by this feature.

**Independent Test**: take one recording with a known board and opponent, run the engine on the
same inputs, and produce a per-figure comparison — fight length, cast counts per monster, damage
totals — with the divergences named.

**Acceptance Scenarios**:

1. **Given** a recording and the board it was fought with, **When** the comparison is run,
   **Then** predicted and observed fight length are reported side by side.
2. **Given** a comparison whose predicted cast count for a monster differs from the observed one,
   **When** the report is produced, **Then** that monster is named as a divergence rather than
   averaged away.

---

### Edge Cases

- **A day with no recorded enemy HP.** `ENEMY_HP_BY_DAY` stops at day 19 observed and day 25
  projected. Past that there is no fight to predict, and the advisor must fall back to a stated
  default horizon rather than silently ranking against nothing.
- **A board that never kills.** `timeToKillSeconds` returns "not within an hour", which is a real
  answer. The discount horizon cannot be infinite, so this needs a stated ceiling.
- **A board that kills instantly.** A horizon near zero would discount everything to nothing and
  make every lineup score the same. This needs a stated floor.
- **Sudden death.** `enemyHealth.ts` records that a prior claim of a 15-second onset was unsupported
  by observation and that whether sudden death has a fixed onset, or varies by day, is **unknown**.
  If it exists, it bounds fight length, and nothing may assume a value for it until one is recorded.
- **Enemy HP may not be a function of day alone.** The curve is from one run. Rank, opponent
  strength and run seed are all plausible additional inputs and none is ruled out.
- **Days 1–7 are hand-authored.** The late-game power law does not describe them and must never be
  used to interpolate backwards.
- **A fight shorter than one cast.** On a very short predicted fight a monster may cast once or not
  at all, which makes its effective rate unmeasurable. That must read as "no rate" rather than as a
  rate of zero.
- **Changing the day must not silently re-aim a saved board.** The run day already survives a board
  replacement for this reason; a derived window must not reintroduce the problem.

---

## Requirements *(mandatory)*

### Functional Requirements

**The horizon (Story 1 and 2 — no opponent model needed)**

- **FR-001**: The system MUST derive a predicted fight length for a given board and run day, rather
  than using a fixed constant.
- **FR-002**: The system MUST use that predicted fight length as the anchor for the
  front-loaded-damage discount that ranks all suggestions.
- **FR-003**: The system MUST bound the derived horizon by a stated floor and ceiling, so that a
  board which kills instantly and a board which never kills both produce a usable ranking.
- **FR-004**: The system MUST state, wherever a suggestion is shown, which day and which predicted
  fight length it was ranked for.
- **FR-005**: The system MUST default the simulation window to the predicted fight length for the
  selected day, and MUST continue to honour a window the user has set by hand.
- **FR-006**: The system MUST label every "effective this battle" figure with the horizon it was
  measured over.
- **FR-007**: The system MUST distinguish an observed enemy-HP figure from a projected one wherever
  a prediction derived from it is shown, and MUST say when no figure exists for the selected day.
- **FR-008**: Users MUST be able to see how a suggestion's ranking changes with the run day, so that
  a day-sensitive recommendation is legible as such rather than appearing to be instability.

**The opponent model (Story 3 onward)**

- **FR-009**: The system MUST [OPP] represent an opponent team with the same fidelity as the user's
  own board, including placement.
- **FR-010**: The system MUST [OPP] resolve a two-sided battle to a win, a loss, or a stated
  inconclusive outcome, with the elapsed time.
- **FR-011**: The system MUST [OPP] model incoming damage against the user's team, so that
  survivability is priced against a real opponent instead of the mirror assumption.
- **FR-012**: The system MUST [OPP] produce an identical outcome and timeline for identical inputs.
- **FR-013**: The system MUST [OPP] report which monsters were lost and when.
- **FR-014**: The system MUST [OPP] model the enemy behaviours that `enemyHealth.ts` names as the
  reason its HP figure is a floor rather than a prediction —
  [NEEDS CLARIFICATION: for the first opponent-model slice, is it enough for the enemy to deal
  damage and hold HP, with its healing, shielding and cleansing deferred? Modelling those is what
  makes a fight length realistic, but it roughly doubles the engine surface the slice has to cover.]
- **FR-015**: Users MUST [OPP] be able to choose an opponent from a stored set organised by run day.
- **FR-016**: The system MUST [OPP] record where each opponent team came from — captured from a real
  run, or designed as a benchmark — and show it alongside the team.
- **FR-017**: The system MUST [OPP] cover days for which the user has recorded no opponent by
  offering the observed ranked meta's board for that day's phase — neither nothing, nor a
  synthesised team. **Resolved 2026-10-13** by the dataset in
  [benchmark-opponents.md](./benchmark-opponents.md): the community meta publishes representative
  boards per run phase (Early R1–4, Mid R5–8, Late R9–12, Final R13+) over tens of thousands of
  observed rounds, which is an observation rather than an invention and is indexed the same way the
  app already indexes a run.
- **FR-021**: The system MUST [OPP] rank benchmark opponents by their round win rate **in the phase
  being fought**, not by whole-run success. The two are not the same ordering — the top comp by
  10-win rate (63%) wins only 42% of its final-phase rounds, against 67% for the comp ranked below
  it — and a benchmark exists to be hard to beat in one round.
- **FR-022**: The system MUST [OPP] state, wherever a benchmark result is shown, that the opponent's
  positions were chosen by this app rather than observed. The source publishes no positions, this
  engine's output depends on them, and an opponent arranged by our own optimiser inherits our own
  positional blind spots on both sides of the fight.
- **FR-023**: The system MUST [OPP] record the source level alongside the integer level it used
  wherever a published composition gives a fractional one, so a benchmark outcome can be checked
  against whether rounding caused it.
- **FR-018**: The system MUST [OPP] compare a predicted fight against a recorded one and report
  fight length, per-monster cast counts and damage totals as named divergences.

**Calibration**

- **FR-019**: The system MUST keep the constants and assumptions the objective rests on in one
  stated place, with the observation each is fitted to, so that a change to one is traceable to the
  evidence for it.
- **FR-020**: The system MUST degrade honestly: with no opponent data and no recorded HP for a day,
  every figure MUST fall back to a stated assumption rather than to a confident-looking number.

### Key Entities

- **Opponent team**: an enemy board for a given run day — monsters, levels, placement, and whatever
  the day grants them. Carries its provenance (captured or designed) and the run day it belongs to.
- **Predicted fight**: for one board against one day or one opponent — the expected length, the
  outcome, and which of the two it was derived from. This is what the discount horizon reads.
- **Benchmark result**: the outcome of one board against one opponent team, so a board can be said
  to beat or lose to a named benchmark.
- **Calibration comparison**: one recorded fight set against the engine's prediction of it, with the
  per-figure divergences. The evidence any change to an objective constant is justified by.
- **Objective anchor**: a named constant or assumption the ranking depends on, the observation it is
  fitted to, and its uncertainty. Today there are three and none has the second field.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Changing the run day alone changes the advisor's recommended lineup on at least one
  board where the two days' predicted fight lengths differ materially — demonstrating the ranking is
  day-sensitive rather than nominally so.
- **SC-002**: No figure shown anywhere in the app is measured over a horizon the user cannot see
  stated.
- **SC-003**: For every day with a recorded enemy-HP figure, the app produces a predicted fight
  length, or states why it cannot.
- **SC-004**: A user can tell, for any suggestion, which day it was ranked for, without opening a
  second surface.
- **SC-005**: **[OPP]** A board can be fought against a named opponent and produce a win or a loss,
  reproducibly.
- **SC-006**: **[OPP]** Predicted fight length agrees with recorded fight length, across the
  available recordings, closely enough that the remaining error is smaller than the difference
  between adjacent days' predictions — the bar at which a day-sensitive ranking is better than a
  constant.
- **SC-007**: **[OPP]** Every divergence between a predicted and a recorded fight is attributable to
  a named monster or mechanic rather than to unexplained aggregate error.
- **SC-008**: Each objective anchor is traceable to the observation it was fitted to, and the count
  of anchors fitted to no observation is zero or explicitly listed.

---

## Assumptions

- **The existing one-sided engine stays.** Stories 1 and 2 change what horizon it is read over, not
  how it simulates. The two-sided battle in Story 3 is an addition, not a replacement.
- **Predicted fight length is a better anchor than a constant even before calibration.** It varies
  with the board and the day, which is how the thing it models varies; a constant cannot. This holds
  even while the underlying HP curve is from a single run.
- **`ENEMY_HP_BY_DAY` remains the best available fight-length input until recordings supersede it.**
  It is one run's observation, read off the battle UI, and its own documentation says to treat a
  derived TTK as an order-of-magnitude estimate.
- **Enemy HP is treated as a function of run day alone.** Rank, opponent strength and run seed are
  acknowledged as plausible additional inputs and are out of scope until a second run is recorded.
- **Sudden death is not modelled and no value is assumed for it.** It would bound fight length if it
  exists; nothing may depend on a number for it until one is observed.
- **Opponent teams come from three sources, now in priority order.** The observed ranked meta
  ([benchmark-opponents.md](./benchmark-opponents.md)) supplies phase-indexed boards over tens of
  thousands of rounds and is the broadest; the `battle-capture-analysis` skill already extracts both
  teams' state from a recording frame by frame, so a captured fight gives an exact board with
  positions; hand-authored benchmarks cover anything neither reaches.
- **The meta dataset is a point-in-time snapshot of a live balance patch.** It was transcribed from
  screenshots under Balance 25; the source removes older patches when a new one arrives, exposes no
  public API, and its sample is self-selected by players who opt into syncing. Every figure derived
  from it inherits that.
- **Published compositions carry no positions and fractional levels.** The opponent is arranged by
  this app's own placement search, and fractional levels are floored. Both are stated conventions
  with recorded alternatives rather than incidental choices — see benchmark-opponents.md **B2** and
  **B3**.
- **Onsetra is a prerequisite for Comp 1 to mean anything.** It appears in the top comp at every
  phase from Late onward, and `optimize.ts` records that its `behind` tag is present, correctly
  typed and silently ignored by `simulate()`. A benchmark fight against that comp understates it
  until the tag is read.
- **The user's manual window override is retained.** The derived horizon becomes the default, not a
  replacement for the control, so an existing saved board opened after this change still reads the
  way its author set it up.
- **The run day is already part of a board.** `runDay` exists, is persisted in share codes and the
  team library, already drives the time-to-kill readout and the chart's enemy-HP line, and survives
  a board replacement. No new run-context plumbing is needed for Stories 1 and 2.
- **Practice mode is a third view, not a change to the calculator.** The existing Calculator and
  Corpus Browser views are untouched by Stories 3 and 4.
- **"Most real-world impact" is measured against recordings, not against argument.** Any change to
  an objective anchor is expected to be justified by a calibration comparison once Story 5 exists,
  and to be explicitly provisional before then.
