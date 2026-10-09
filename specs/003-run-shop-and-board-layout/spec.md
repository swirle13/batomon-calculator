# Feature Specification: The Run Shop and the Game-Shaped Board Layout

**Feature Branch**: `003-run-shop-and-board-layout`

**Created**: 2026-10-09

**Status**: Draft — specification only, nothing built

**Input**: User description: *"it's about time we specced out building out a 5-mon shop, displaying
the mon's rarity and cost in a updated/modified mon card. I'm honestly not sure how I'll make it
usable on a mobile device. But this is the official game's layout, and I'd like to mimic it for ease
of use (familiarity). This will mean some foundational changes to the page layout regarding the
trainer card, the mon detail card, and then where to fit the additional
modifiers/trinkets/items elements (the backpack icon in the top left opens to show trinkets in the
game screenshot)."*

---

## 0. The decision this specification turns on

Everything below has two readings depending on one answer, so it is settled first.

### Is the shop TRANSCRIBED or SIMULATED?

| | Transcribed | Simulated |
|---|---|---|
| Where offers come from | The user enters the five monsters their real shop is showing | The app rolls them from a rank-weighted odds table |
| Data needed | `shopCost` per species (already modelled, 44% unpopulated) | The above, **plus** a rank→rarity-odds table that does not exist in this project and is not on the wikis |
| New engine surface | A budget constraint on the existing advisor | A seeded RNG, a shop-roll function, a run loop, win/loss state, rank progression |
| What the app becomes | A calculator that now understands money | A partial reimplementation of the game |
| Answers *"what should I buy with $55?"* | Yes | Yes, but only inside a fake run |
| Answers *"is this reroll worth $3?"* | No | Yes |

**Recommendation: transcribed.** The question that produced this feature — *"I had $55 and four
offers, which two should I have bought?"* — needs no generator, and the one thing simulation buys
(reroll expected value) can be added later as an *advice* input without the app ever rolling a shop
itself: given the odds for your rank and the five offers in front of you, the expected value of a
reroll is computable from the odds table alone.

Everything below is written for the transcribed reading. Where the simulated reading would change a
requirement, it is marked **[SIM]**.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Price the shop in front of me (Priority: P1)

I am on a shop screen with $116 and five offers. I enter the five monsters into the app's shop row,
and it tells me which affordable combination of purchases produces the best board — accounting for
survivability, not just DPS, and never recommending a basket I cannot pay for.

**Why this priority**: this is the whole feature. It is also the one slice that delivers value with
no layout change at all — a shop row bolted under the existing bench would answer it.

**Independent Test**: enter five offers and a gold amount; confirm the advisor's recommended basket
costs no more than the gold, and that raising the gold by $20 can change the recommendation.

**Acceptance Scenarios**:

1. **Given** a shop of five priced offers and $55 gold, **When** advice is computed, **Then** every
   recommended basket costs ≤ $55 and the recommendation names its total cost.
2. **Given** the same shop with $0 gold, **When** advice is computed, **Then** the advisor reports
   that no purchase is affordable rather than recommending one.
3. **Given** a shop offer whose species has no published `shopCost`, **When** it is entered,
   **Then** the app asks for the price rather than assuming one (see FR-S04).
4. **Given** a recommended basket, **When** it is applied, **Then** the monsters are placed and the
   gold is decremented by the basket's cost.

---

### User Story 2 — Recognise the screen (Priority: P2)

The app's layout puts the same things in the same places the game does: trainer on the left, board
in the middle with the bench above it, selected monster on the right, shop along the bottom, run
status along the top. I can look between my phone and the app without re-orienting.

**Why this priority**: familiarity is the stated goal and it is real, but it is a *presentation* of
US1's data. US1 shipped in the current layout is already useful; this makes it fast to use.

**Independent Test**: screenshot the app beside the game screenshot and confirm each of the six
regions is in the same relative position at desktop width.

**Acceptance Scenarios**:

1. **Given** a desktop viewport ≥ the stage width, **When** the Calculator renders, **Then** the six
   regions occupy the same relative positions as `reference-shop-screen.jpg`.
2. **Given** a phone viewport, **When** the Calculator renders, **Then** every region is reachable
   and none is horizontally clipped (see FR-L05 for how).
3. **Given** keyboard-only navigation, **When** the user tabs from the top of the page, **Then**
   focus visits the regions in a reading order that matches their visual order at that viewport.

---

### User Story 3 — Carry my run's state (Priority: P2)

The app knows what day it is, how much gold I have, how many lives I have left and what rank I am,
and keeps them with the build when I save or share it.

**Why this priority**: US1 needs gold, and gold is useless if re-typed every session — the exact
complaint that moved `runDay` into `TeamConfiguration` on 2026-10-08.

**Independent Test**: set gold and lives, save the build, reload the page, open the build; confirm
both survive.

**Acceptance Scenarios**:

1. **Given** gold set to $116, **When** the build is saved and reopened, **Then** gold reads $116.
2. **Given** two builds identical except for gold, **When** their build ids are computed, **Then**
   the ids match (run state is context, not content — see `data-model.md` §3).

---

### User Story 4 — Keep the loadout out of the way (Priority: P3)

Trinkets, items and manual modifiers live behind a backpack control in the status bar, with a count
on it, instead of occupying a full-width row above the board.

**Why this priority**: it is what frees the vertical space the shop row needs. Low priority only
because the three panels work today; this moves them.

**Independent Test**: confirm the backpack badge count equals trinkets + items + modifiers, and that
every editing action previously reachable from the panel row is reachable inside the overlay.

**Acceptance Scenarios**:

1. **Given** 2 trinkets and 1 item, **When** the status bar renders, **Then** the backpack badge
   reads 3.
2. **Given** the backpack overlay is open, **When** Escape is pressed, **Then** it closes and focus
   returns to the backpack button.

---

### Edge Cases

- **A shop offer is already on your board.** The game permits buying a duplicate (it is how merges
  happen). The shop must not filter owned species, and the advisor must price the merge the purchase
  would enable — `computeMergeAdvice` already exists and must be fed the post-purchase roster.
- **An offer costs more than you own.** Shown, priced, and marked unaffordable rather than hidden.
  "You cannot afford the best monster here" is an answer.
- **The board is full and the bench is full.** A purchase has nowhere to go. The app must either
  refuse with a reason or require a sell/bench choice first; it must not silently drop the monster.
- **Selling.** The game has a sell value; this project has no data for it. Until it does, gold is a
  number the user can edit freely, which makes selling expressible without modelling it.
- **A monster's level changes its price.** The corpus carries `shopCost` on base records only. A
  level-2 offer is not a thing the shop sells, so this is moot for the shop row — but the bench
  currently allows arbitrary levels and the cost display must not imply a level-2 monster costs the
  level-1 price.
- **Zero-cost species.** 65 of 149 records carry `shopCost: 0`. Some are genuinely unbuyable
  (Purple Egg, hatched monsters); most are simply unsourced. See FR-S04.

---

## Requirements *(mandatory)*

### Shop and economy

- **FR-S01** The Calculator MUST display a shop region of five offer positions, each either empty or
  holding one monster with its sprite, name, rarity, published per-cast stat chips and price.
- **FR-S02** An offer position MUST be fillable through the same creature search modal the board and
  bench use, and MUST be clearable.
- **FR-S03** An offer's price MUST default to the species' `shopCost` and MUST be editable, because
  the game discounts and inflates prices by run state this project does not model.
- **FR-S04** A species whose `shopCost` is `0` MUST render its price as unknown and prompt for one,
  rather than displaying `$0`. An unpriced offer MUST be excluded from affordability arithmetic and
  the exclusion MUST be stated where the advice is shown.
- **FR-S05** The run's gold MUST be displayed in the shop region and MUST be directly editable.
- **FR-S06** Buying an offer MUST place the monster on the first free board slot, or the first free
  bench position when the board is full, and MUST decrement gold by the offer's price.
- **FR-S07** Buying MUST be refused, with a stated reason, when gold is insufficient or when both
  the board and bench are full.
- **FR-S08** An offer MUST be draggable onto a specific board or bench position, which buys it into
  that position. Dragging onto an occupied position MUST be refused rather than replacing the
  occupant — a purchase that silently destroys a monster you paid for is not recoverable.
- **FR-S09** The shop region MUST show the run's rank and, when odds data exists, the rarity odds
  strip for that rank. Absent odds data the strip MUST be omitted, not faked.
- **FR-S10** A reroll control MUST clear all five offers and decrement gold by the reroll cost.
  **[SIM]** In the simulated reading it would instead roll five new offers.
- **FR-S11** A lock control MUST mark the shop as retained, so a reroll leaves it alone. In the
  transcribed reading this is a no-op on data and a label only; it is specified so the control is
  not invented twice.
- **FR-S12** `computeBenchAdvice` MUST accept a budget and MUST NOT return a lineup whose newly
  fielded monsters cost more than it. Every suggestion that spends money MUST report what it spends.
- **FR-S13** Shop advice MUST rank affordable baskets by the existing survivability-weighted score,
  not by DPS, and MUST report both figures plus the basket's cost — the same two-measure reporting
  `LineupSearch` already does.

### Run state

- **FR-R01** `TeamConfiguration` MUST carry gold, lives, rank and the existing `runDay` as a single
  optional run-state group, all absent-tolerant so every existing saved build still loads.
- **FR-R02** Run state MUST persist with a saved build and travel in a shared build.
- **FR-R03** Run state MUST be excluded from `canonicalize`, so two boards differing only in gold
  produce the same build id — the rule `runDay` already follows.
- **FR-R04** The run status region MUST display day, lives, gold and rank, each editable in place.

### Card and layout

- **FR-C01** The shared `BatomonCard` MUST gain a shop presentation that adds price and keeps rarity
  visible, rather than a second card component being written. Constitution Principle VII names a new
  bespoke card as a defect.
- **FR-C02** Rarity MUST be visible on every surface that shows a purchasable monster, using the one
  existing `RARITY` vocabulary and its colours.
- **FR-C03** The board card, bench card and shop card MUST remain one component with variants. They
  differ in chrome (price, lock, clear), not in kind.
- **FR-L01** The Calculator MUST lay out six named regions — status, trainer, bench, board, detail,
  shop — whose placement is declared in one stylesheet, not distributed across component trees.
- **FR-L02** At desktop width the six regions MUST sit where the game puts them.
- **FR-L03** Trinkets, items and modifiers MUST move into a backpack overlay opened from the status
  region, with a badge showing the total count.
- **FR-L04** The detail region MUST be driven by an explicit selection, set by click or tap, and not
  by hover alone. Hover MAY preview on pointer devices; it MUST NOT be the only way to select.
- **FR-L05** At phone width every region MUST be reachable without horizontal scrolling. The shop
  and detail regions MAY become sheets rather than always-visible columns.
- **FR-L06** DOM order MUST match the visual order at the viewport the user is on, so tab order and
  screen-reader order are correct at every breakpoint.
- **FR-L07** The page MUST NOT impose a minimum width that exceeds the viewport. `#root`'s current
  `width: max(1126px, …)` MUST be replaced — see `ui-architecture.md` §6.1.

---

### Key Entities

| Entity | What it is | Where it lives |
|---|---|---|
| `RunState` | gold, lives, rank, day | `TeamConfiguration.run`, `src/data/types.ts` |
| `ShopOffer` | one of five positions: species, price, bought flag | `TeamConfiguration.shop`, `src/data/types.ts` |
| `RarityOdds` | rank → per-rarity probability | `src/data/shopOdds.ts` (new, **unsourced**) |
| `PurchaseBasket` | a set of offers, their total cost, the board they produce | `src/engine/shopAdvice.ts` (new) |
| `RegionId` *(layout)* | the six named grid areas | `src/ui/RunLayout/` (new) |

---

## Success Criteria *(mandatory)*

- **SC-001** Given a shop and a gold amount, the app names an affordable basket and its cost in
  under 500 ms on a mid-range phone. *(The current lineup search evaluates ~2,900 boards in ~250 ms;
  adding five offers to a ten-strong roster must not push it past half a second — see
  `ui-architecture.md` §7 for why this is a real risk.)*
- **SC-002** No recommendation the app makes costs more gold than the user has.
- **SC-003** At 360 px viewport width, every one of the six regions is reachable and nothing is
  clipped horizontally.
- **SC-004** A build saved before this feature loads with no errors and no visible change.
- **SC-005** The number of distinct card components in `src/ui` does not increase.

---

## Assumptions

1. **Prices are per-species and level-independent.** The shop sells level-1 monsters.
2. **Gold is user-maintained.** The app never earns or awards it; it decrements on purchase and is
   otherwise an editable number. This avoids modelling round rewards, interest and sell values, none
   of which this project has data for.
3. **Five offers is fixed.** The reference screen shows five. If rank changes the count, this
   becomes `ShopOffer[]` with a configurable length, which is a one-line change made now by not
   hard-coding `5` anywhere except a constant.
4. **Rank affects odds only.** Nothing else in this spec reads rank.
5. **The existing hover-preview behaviour is kept on pointer devices** and layered under the new
   click selection, because removing it would be a regression for desktop users.

---

## Open questions

| # | Question | Blocks | Suggested default |
|---|---|---|---|
| Q1 | Transcribed or simulated? | Everything | Transcribed (§0) |
| Q2 | Where do the 65 missing `shopCost` values come from? | FR-S01, US1 | User-entered, cached per species in local storage until the corpus is updated |
| Q3 | Does rarity-odds data exist anywhere citable? | FR-S09, reroll EV | Omit the strip until it does; Principle IV forbids inventing it |
| Q4 | Is the reroll cost fixed at $3 or does it escalate? | FR-S10 | Editable number, defaulting to 3 |
| Q5 | Should the Corpus Browser adopt the new layout too? | Scope | No. It is a catalogue, not a run |
| Q6 | Do the three charts stay on the Calculator page? | FR-L01 | No — they move behind a disclosure or a tab. A game-shaped layout has no room below the shop row, and they are already lazy-loaded and below the fold |
