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

## 0. The decision this specification turns on — SETTLED

**The shop is TRANSCRIBED.** You enter the five monsters your real shop is showing; the app prices
the choice. It never rolls a shop of its own.

The draft weighed this against a simulated shop that rolls offers from a rank-weighted odds table.
Simulation lost on three counts:

1. **It cannot reproduce your actual shop**, so the one question the feature exists to answer —
   *"I had $55 and these four offers, which two should I have bought?"* — would be answered about a
   fictional shop instead of yours.
2. **It rewards the wrong behaviour.** A simulated shop invites rerolling until the monster you want
   appears, which is minutes spent to reach a board you could have typed in directly.
3. **It needs data this project does not have and cannot trust.** A rank→rarity-odds table is not
   published, and trinkets, items and trainers modify shop rank in ways that would make any static
   table wrong in exactly the cases a player cares about.

Consequences, all of which this specification now assumes: no random-number generator, no run loop,
no rank progression, no odds table, and **no `rank` field anywhere** (see FR-R01 and the retirement
of the draft's FR-S09). Reroll and lock survive as transcription aids — see FR-S10/S11.

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
3. **Given** a shop position, **When** the creature picker is opened from it, **Then** only
   shop-obtainable monsters are offered (see FR-A02).
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

The app knows what day it is, how much gold I have and how many lives I have left, and keeps them
with the build when I save or share it.

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
- **Zero-cost species.** 62 of 149 records carry `shopCost: 0`, and 56 of those are not the target
  of any evolution. Some are genuinely unbuyable (Purple Egg, Dragon Egg, the four Mythicals); most
  are simply unsourced. Acquisition sources (FR-A01) separate the two cases. See `data-model.md` §4.

---

## Requirements *(mandatory)*

### Shop and economy

- **FR-S01** The Calculator MUST display a shop region of five offer positions, each either empty or
  holding one monster with its sprite, name, rarity, published per-cast stat chips and price.
- **FR-S02** An offer position MUST be fillable through the same creature search modal the board and
  bench use, and MUST be clearable.
- **FR-S03** An offer's price MUST default to the species' `shopCost` and MUST be editable, because
  the game discounts and inflates prices by run state this project does not model.
- **FR-S04** A shop-obtainable species carrying no price MUST render its price as unknown and prompt
  for one, rather than displaying `$0`. An unpriced offer MUST be excluded from affordability
  arithmetic and the exclusion MUST be stated where the advice is shown.
- **FR-S05** The run's gold MUST be displayed in the shop region and MUST be directly editable.
- **FR-S06** Buying an offer MUST place the monster on the first free board slot, or the first free
  bench position when the board is full, and MUST decrement gold by the offer's price.
- **FR-S07** Buying MUST be refused, with a stated reason, when gold is insufficient or when both
  the board and bench are full.
- **FR-S08** An offer MUST be draggable onto a specific board or bench position, which buys it into
  that position. Dragging onto an occupied position MUST be refused rather than replacing the
  occupant — a purchase that silently destroys a monster you paid for is not recoverable.
- **FR-S09** *RETIRED before implementation.* The draft required a rank and a rarity-odds strip.
  Both existed only to serve the simulated shop and reroll expected value, which §0 rejects, and
  shop rank is modified by trinkets, items and trainers, so a static table would misreport exactly
  the boards a player is asking about. No rank is stored, displayed or modelled.
- **FR-S10** A reroll control MUST clear every unlocked offer and decrement gold by the reroll cost,
  so that re-transcribing after an in-game reroll is one action rather than five.
- **FR-S11** Each offer MUST be individually lockable, and a locked offer MUST survive a reroll.
  This mirrors the in-game lock and is what makes FR-S10 correct rather than destructive.
- **FR-S12** `computeBenchAdvice` MUST accept a budget and MUST NOT return a lineup whose newly
  fielded monsters cost more than it. Every suggestion that spends money MUST report what it spends.
- **FR-S13** Shop advice MUST rank affordable baskets by the existing survivability-weighted score,
  not by DPS, and MUST report both figures plus the basket's cost — the same two-measure reporting
  `LineupSearch` already does.

### Acquisition sources

- **FR-A01** Every species MUST declare, per level, the ways that level can be obtained — shop,
  merge, evolution, hatch, reward, or a trainer/trinket grant. The declaration is corpus data and
  MUST be sourced per Constitution Principle IV.
- **FR-A02** The creature picker, when opened from a shop position, MUST offer only species whose
  level-1 sources include the shop. Opened from a board or bench position it MUST continue to offer
  everything, because a monster can arrive by routes other than purchase.
- **FR-A03** A species whose sources include the shop MUST carry a non-zero price. This is a corpus
  invariant and MUST be enforced by a test, so "sold but unpriced" fails the build instead of
  reaching the screen as `$0`.
- **FR-A04** A level reachable only by merging MUST be labelled as such wherever a level is chosen,
  so the level selector stops implying that a level-3 monster is something you can buy.

### Run state

- **FR-R01** `TeamConfiguration` MUST carry gold, lives and the existing `runDay` as a single
  optional run-state group, all absent-tolerant so every existing saved build still loads. It MUST
  NOT carry a shop rank — see FR-S09.
- **FR-R02** Run state MUST persist with a saved build and travel in a shared build.
- **FR-R03** Run state MUST be excluded from `canonicalize`, so two boards differing only in gold
  produce the same build id — the rule `runDay` already follows.
- **FR-R04** The run status region MUST display day, lives and gold, each editable in place.

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
  `width: max(1126px, …)` MUST be replaced — see `ui-architecture.md` §7.1.
- **FR-L08** The figures that answer *"should I press Battle"* — window DPS, mitigation per second,
  and time to kill the day's enemy — MUST be visible without interaction, alongside the board, at
  every viewport. They MUST NOT be placed behind a tab: they are read **while** the board is being
  edited, which is the case NN/g names as the one tabs handle worst.
- **FR-L09** The advisor's headline recommendation MUST be visible alongside the board. Its
  supporting detail MAY be disclosed.
- **FR-L10** The per-creature tables and the three charts MUST move behind one disclosure surface.
  They are investigation, not the pre-battle decision, and they are already lazy-loaded.
- **FR-L11** Viewport breakpoints MUST be limited to the two the layout actually changes at, and
  component-level adaptation MUST use container queries rather than a third. See
  `ui-architecture.md` §3.3.

---

### Key Entities

| Entity | What it is | Where it lives |
|---|---|---|
| `RunState` | gold, lives, day | `TeamConfiguration.run`, `src/data/types.ts` |
| `ShopOffer` | one of five positions: species, price, locked flag, bought flag | `TeamConfiguration.shop`, `src/data/types.ts` |
| `AcquisitionSource` | how a (species, level) can be obtained | `src/data/enums.ts` + per-record corpus field |
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
- **SC-006** No species is both tagged shop-obtainable and priced at zero. Enforced by FR-A03's test.
- **SC-007** Component-level layout decisions are made by container queries, not by the shell's
  breakpoints. The codebase declares two viewport breakpoints today and will still declare two; the
  defect being fixed is that the smaller one currently carries twelve unrelated decisions.

---

## Assumptions

1. **Prices are per-species and level-independent.** The shop sells level-1 monsters.
2. **Gold is user-maintained.** The app never earns or awards it; it decrements on purchase and is
   otherwise an editable number. This avoids modelling round rewards, interest and sell values, none
   of which this project has data for.
3. **Five offers is fixed.** The reference screen shows five. Should the count ever vary, this is
   `ShopOffer[]` with a configurable length — a one-line change made now by not hard-coding `5`
   anywhere except a constant.
4. **The existing hover-preview behaviour is kept on pointer devices** and layered under the new
   click selection, because removing it would be a regression for desktop users.
5. **Acquisition sources are player knowledge, not a wiki scrape.** They are filled in from play,
   which makes the table slow to complete and cheap to start. FR-A03's invariant test is what stops
   a half-filled table being mistaken for a finished one.

---

## Open questions

All six of the draft's questions are resolved. Three remain and none blocks a start.

| # | Question | Blocks | Position |
|---|---|---|---|
| Q7 | Where do the missing prices for shop-obtainable species come from? | US1 at full coverage | Entered in the shop row, cached per species in local storage, periodically folded into the corpus. The cache is a ready-made patch file |
| Q8 | Is the reroll cost fixed at $3 or does it escalate? | FR-S10 | Editable number defaulting to 3. Costs nothing to be wrong about |
| Q9 | Should the Corpus Browser adopt the new layout? | Scope | No — it is a catalogue, not a run. It should adopt the `Sheet` primitive and the container-query card |

### Resolved (2026-10-13)

| # | Question | Answer |
|---|---|---|
| Q1 | Transcribed or simulated? | Transcribed — §0 |
| Q2 | How to disambiguate `shopCost: 0`? | Acquisition sources, per species and per level — FR-A01 |
| Q3 | Is rarity-odds data citable? | Moot. Rank and odds are dropped entirely — FR-S09 |
| Q4 | *(reroll cost)* | Carried forward as Q8 |
| Q5 | *(Corpus Browser)* | Carried forward as Q9 |
| Q6 | Do the charts stay on the Calculator page? | No. They and the per-creature tables move into an analysis sheet; DPS, mitigation and time-to-kill stay on the stage — FR-L08/L10 |
