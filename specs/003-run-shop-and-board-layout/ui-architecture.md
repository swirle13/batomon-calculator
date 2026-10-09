# 003 — Frontend architecture

How the Calculator view is restructured to hold a shop row and the game's region layout, what that
does to the DOM, and the order it can be done in without a broken intermediate state.

Read [`spec.md`](./spec.md) for what is being built and [`data-model.md`](./data-model.md) for the
state it renders. This document is only about the UI layer.

---

## 1. The six regions

Read off `reference-shop-screen.jpg`:

```
┌─────────────────────── STATUS ────────────────────────┐
│ backpack(2) · ♥5 · DAY 7 · ⊙4/10 ·        book gear ⏻ │
├───────────┬───────────────────────────┬───────────────┤
│           │          BENCH            │               │
│  TRAINER  │      (4 positions)        │    DETAIL     │
│           ├───────────────────────────┤   (selected   │
│  portrait ├─ ─ ─ ─ ─ BOARD ─ ─ ─ ─ ─ ─┤   monster,    │
│  ability  │      (2 x 3 positions)    │   price,      │
│  team HP  │                           │   rarity)     │
├───────────┴───────────────────────────┴───────────────┤
│ Rank 8 ◆25 ◆30 ◆35 ◆10 ◆0      $116            LOCK   │
│ REROLL $3  [5 offer cards, priced]            BATTLE! │
└─────────────────────── SHOP ──────────────────────────┘
```

Six names, used identically in CSS, in component folder names and in tests: `status`, `trainer`,
`bench`, `board`, `detail`, `shop`.

Two things in the reference have no counterpart here and should not be built: `BATTLE!` (this app
does not run the fight) and the window/exit chrome. `♥5` and `⊙4/10` are display-only.

---

## 2. What exists now, and the four things in it that block this

The Calculator is a vertically scrolling document, not a stage:

```
<div>                                    App.tsx CalculatorView
  <div .builderRow>                      flex, wrap, two columns
    <div .teamColumn>                    flex column, max-width: --team-column-width
      <TrainerPicker/>
      <div .panelRow>                    grid, 3 equal tracks
        <TrinketPicker/><ItemPicker/><ModifierEditor/>
      <GridPicker/>                      ← owns DndContext; renders BOARD **and** BENCH
    <div .detailColumn>                  flex: 0 0 --detail-panel-width
      <ShareBuild/><PlacedCreatureDetails/>
  <PlacementAdvisor/>                    ─┐
  <TotalDps/>                             │  seven full-width stacked sections
  <TeamSummary/>                          │  below the builder row
  <div .windowControl>                    │
  <CumulativeChart/>                      │
  <DpsRateChart/>                         │
  <StatusStackChart/>                    ─┘
  <TeamLibrary/>                         position: fixed drawer
```

Four blockers, in the order they should be cleared:

### 2.1 `GridPicker` renders both the board and the bench

It has to, today: `@dnd-kit` only connects draggables and droppables inside one `DndContext`, and
`GridPicker` owns that context. The comment in the file says so explicitly. The new layout needs
board and bench in different grid areas and needs the shop to be a third drag source, so the
context has to come out first. See §4.

### 2.2 Selection is hover-only

`CalculatorView` holds `highlighted: RosterRef | null`, set by `onMouseEnter`/`onFocus` on a card
and deliberately sticky. There is no tap path and no way to select the shop's offers, which are not
roster members. See §5.

### 2.3 Regions set their own geometry

`.detailColumn` declares its own width, `.teamColumn` its own max-width, `GridPicker` renders its
own `<section className={styles.bench}>` with its own heading. A grid shell cannot place children
that insist on their own size. See §3.2.

### 2.4 `#root` has a hard minimum width

```css
#root { width: max(1126px, calc(var(--builder-row-width) + 2 * 1rem + var(--space-xl))); }
```

`max-width: 100%` saves it from overflowing today, but the whole derivation chain
(`--sprite-grid` → `--grid-slot-size` → `--team-column-width` → `--builder-row-width` → page width)
computes the page from the board. A stage with a trainer column on one side and a detail column on
the other needs that chain re-rooted. See §7.

---

## 3. The shell

### 3.1 One stylesheet owns placement

```
src/ui/RunLayout/
  RunLayout.tsx          ← renders the six slots, places nothing itself
  RunLayout.module.css   ← the ONLY file that says where a region goes
```

```tsx
interface RunLayoutProps {
  status: ReactNode; trainer: ReactNode; bench: ReactNode;
  board: ReactNode;  detail: ReactNode;  shop: ReactNode;
}
```

Named slots as props rather than `children` plus area class names on the children, because props
make the contract total: the type system will not let a region be forgotten, and no child can place
itself by adding a class. The one thing this file is for is being the single answer to "where does
X go", and a child that can override it defeats that.

```css
.stage {
  display: grid;
  grid-template-areas:
    "status  status status"
    "trainer bench  detail"
    "trainer board  detail"
    "shop    shop   shop";
  grid-template-columns: var(--region-trainer-width) 1fr var(--region-detail-width);
  grid-template-rows: auto auto 1fr auto;
  gap: var(--region-gap);
}
```

Three area maps — desktop, tablet, phone — and nothing else in the app changes between them.

### 3.2 The geometry rule

> **The shell owns geometry. A region owns its content and never its own width, height or position.**

Concretely: `.detailColumn`'s `flex: 0 0 var(--detail-panel-width)` moves to the shell's
`grid-template-columns`. `GridPicker`'s `.bench` section stops existing as a nested block and
becomes its own region component. `TrainerPicker` stops being a row in a flex column.

This is what makes a second arrangement cost a `grid-template-areas` string instead of a refactor,
and it is the difference between this layout surviving the next time the game's UI changes and it
not.

### 3.3 Media queries for the shell, container queries inside regions

- **The shell's area map** switches on the **viewport** (`@media`). It is deciding "is this a phone"
  — a viewport question, with three answers.
- **Everything inside a region** switches on the **region's own width** (`@container`). The shop row
  deciding whether five cards fit, the detail card deciding whether its stat lines go two-column,
  the bench deciding four-across versus two-by-two: none of those is a viewport question, and
  writing them as viewport queries is how the current single 640px breakpoint ended up load-bearing
  for six unrelated decisions.

```css
.region { container-type: inline-size; container-name: region; }
```

This also fixes a real latent bug: `BatomonCard`'s two-column stat band triggers on a count
(`TWO_COLUMN_FROM = 4`), not on available width, so it wraps identically in the 22rem detail panel
and in a 10rem shop card. A container query on the card's own width is the correct rule and it
becomes available for free.

---

## 4. The drag layer

### 4.1 Lift the context

```
src/ui/dnd/
  RosterDndProvider.tsx   ← DndContext, sensors, DragOverlay, drag state
  useRosterDrag.ts        ← the hook regions use to become sources/targets
```

`RosterDndProvider` wraps the whole stage. The sensor configuration, the no-auto-scroll decision and
the ghost-overlay behaviour move with it verbatim — all three are documented decisions with
user-reported bugs behind them and none of them changes.

`DragGhost` needs the card for a ref from any zone, so the provider takes a resolver
(`(ref) => CardFaceProps | null`) rather than reading the config itself. That keeps it unaware of
where monsters live, which is the property that lets a fourth zone be added later.

### 4.2 Do **not** extend `RosterRef` with a `Shop` zone

The tempting move is `RosterZone.Grid | Bench | Shop`, because `moveRoster(from, to)` then handles
purchases for free. Resist it, for a structural reason:

`RosterRef` means **a monster you own**. `rosterOf()` in `rosterAdvice.ts` enumerates it to build
the roster the lineup search fields, and `isLocked`, `settleOnGrid`, `settleOnBench` and
`rosterMemberAt` all switch on the zone. Add `Shop` to that union and the next person to touch
`rosterOf` adds the shop case for completeness — at which point the advisor silently starts
recommending monsters you have not bought, which is the exact defect
[`data-model.md`](./data-model.md) §6 exists to fix.

Instead:

```ts
/** What a drag can carry. The union lives in the DND layer and nowhere else. */
type DragRef = RosterRef | ShopRef;
```

The engine never sees `DragRef`. A drop with a `ShopRef` source routes through `buyOffer(index,
target)` rather than `moveRoster`. "Owned" and "offered" stay different types, so the mistake above
is a compile error instead of a convention.

### 4.3 Purchase drops

Per FR-S08, dropping an offer onto an occupied position is **refused**, not a swap. The droppable
needs to know the drag's source zone to render the right affordance, which `useDndContext()`
already exposes — the target renders a "full" state rather than the usual `.dropZoneOver`.

---

## 5. Selection

Hover-as-selection has to become an explicit model before the detail region moves, because on a
phone the detail region is a sheet and a sheet cannot be opened by hovering.

```ts
/** Lifted in the stage, exactly where `highlighted` lives today. */
const [selected, setSelected] = useState<DragRef | null>(null);
const [previewed, setPreviewed] = useState<RosterRef | null>(null);  // pointer devices only
const subject = previewed ?? selected ?? firstPlacement;
```

- **Click/tap** sets `selected` and is the only path that exists on touch.
- **Hover/focus** sets `previewed` on pointer devices, preserving today's behaviour, and clears on
  pointer-leave — which is a change from today's sticky behaviour, but only because `selected`
  underneath it is now what provides the stickiness.
- **A shop offer is selectable**, which is why `subject` is a `DragRef`.

The conflict worth noting: the board card's click currently opens the creature search modal
(`onOpenSearch`). If click also selects, those two compete. Resolution: **click selects, and the
search opens from a control on the card or on the detail panel.** A click that both selects and
opens a modal is not two behaviours, it is one behaviour with a modal on top of it.

This is a behavioural change to a flow the user already has muscle memory for, so it wants calling
out before it ships rather than after.

---

## 6. The DOM, before and after

```tsx
<RosterDndProvider>
  <RunLayout
    status={<RunStatusBar />}     {/* day, lives, gold, rank, backpack button, view nav */}
    trainer={<TrainerRegion />}   {/* TrainerPicker + TrainerCard + team HP */}
    bench={<BenchRegion />}       {/* the 4 positions, lifted out of GridPicker */}
    board={<BoardRegion />}       {/* the 2x3, what remains of GridPicker */}
    detail={<DetailRegion />}     {/* PlacedCreatureDetails or a ShopOffer card */}
    shop={<ShopRegion />}         {/* odds strip, gold, reroll, 5 offers */}
  />
  <BackpackOverlay />             {/* trinkets + items + modifiers, was .panelRow */}
  <TeamLibrary />                 {/* unchanged; already fixed-position */}
</RosterDndProvider>
```

### DOM order and the accessibility constraint

`grid-template-areas` places children visually with no effect on DOM order, so tab order and
screen-reader order follow the source. With regions spanning rows there is **no DOM order that is
geometrically correct at all three breakpoints**, so the requirement has to be read as WCAG reads it
— a *meaningful* sequence, not a geometric one:

> `status → trainer → bench → board → detail → shop`

This is meaningful at every width, and it constrains the phone design: **the phone stack must use
this same order**, so the shop cannot be the first thing on the page even though it is what you came
to the screen for. The resolution is §8's sticky shop bar, which is reachable by one keystroke from
the status region without being first in the document.

FR-L06's current wording ("DOM order MUST match the visual order") is stricter than this and should
be amended to "one DOM order, meaningful at every breakpoint, never reordered per breakpoint".

### What `.panelRow` becomes

Deleted. `TrinketPicker`, `ItemPicker` and `ModifierEditor` move inside `BackpackOverlay`,
unchanged — they are already `EditorPanel`s that open their own overlays, so the backpack is a
container for three existing components, not a rewrite. The badge count is
`trinketIds.length + itemIds.length + modifierCount`.

This is the single largest vertical saving available: a full-width three-panel row above the board,
gone, which is roughly what the shop row needs.

---

## 7. Tokens and the size budget

### 7.1 Re-rooting the width chain

Today the page width is derived from the board. It has to become the other way round: the stage is
given a width, and the board takes what the trainer and detail columns leave.

```css
/* NEW — the stage's three columns */
--region-trainer-width: 14rem;      /* trainer art is 120x80 + ability text */
--region-detail-width: var(--detail-panel-width);   /* 22rem, unchanged */
--region-gap: var(--space-md);
--stage-max-width: 86rem;

/* CHANGED — the board is now fluid between a floor and the 3x96px it prefers */
--grid-slot-size: clamp(<floor>, calc((100% - 2 * var(--grid-gap)) / 3), <preferred>);
```

`#root`'s `width: max(1126px, …)` becomes `width: 100%; max-width: var(--stage-max-width)`, and
`--builder-row-width` is retired with `.builderRow`. **`#root`'s `text-align: center` has to go at
the same time** — it is inherited by every region and the regions are left-aligned content.

Keep `--grid-slot-size` derived from `--sprite-grid` as a *preferred* value rather than replacing
the derivation. The reasoning recorded in `tokens.css` — that only 48/96/144 stay crisp under
`image-rendering: pixelated` — still holds, and the clamp's preferred term is where it lives.

### 7.2 The vertical budget

The game's screen does not scroll. Whether ours does is a decision, and it is decidable with
arithmetic:

| Region | Height |
|---|---|
| status | ~48 px |
| bench (1 row of cards) | ~140 px |
| board (2 rows) | ~280 px |
| shop (odds strip + card row) | ~170 px |
| gaps + page padding | ~56 px |
| **total** | **~694 px** |

So the stage fits without scrolling at **≥ 1280 × 800** and should be allowed to scroll below that.
Expressing that needs a height-aware clamp on the sprite — `min()` against `100svh`-derived space —
which is a new kind of token for this project and worth prototyping before committing to
"non-scrolling" as a requirement.

### 7.3 New tokens

`--region-gap`, `--region-trainer-width`, `--stage-max-width`, `--shop-card-width`,
`--shop-row-height`, `--status-bar-height`, `--sheet-height` (shared with the library's existing
`--library-sheet-height`, which should be folded into it).

---

## 8. Phone

The honest answer to *"I'm not sure how I'll make it usable on a mobile device"* is that the game's
landscape layout cannot be mimicked in portrait, and should not be. What transfers is **which things
exist and what they are called**, not where they sit. Familiarity survives that; a scaled-down
landscape stage does not — `transform: scale()` on a stage breaks text sizing, hit targets and
zoom, and is the one approach to reject outright.

The phone layout is the DOM order from §6, stacked, with two of the six regions promoted to sheets:

```
┌──────────────────────────┐
│ STATUS (sticky top)      │  day · ♥ · $116 · 🎒(3)
├──────────────────────────┤
│ TRAINER (collapsed strip)│  portrait + name, tap to expand
│ BENCH (4 across)         │
│ BOARD (2 x 3)            │
│ (scrolls)                │
├──────────────────────────┤
│ SHOP BAR (sticky bottom) │  $116 · "Shop (5)" → opens sheet
└──────────────────────────┘
      DETAIL → sheet on tap of any card
```

Both sheets, the backpack overlay and the existing team library are the same interaction. That is
four surfaces, which under Principle VII means one component:

### Extract a `Sheet` primitive

`primitives/index.tsx` has `Modal` (centred, blocking) and nothing edge-anchored. `TeamLibrary`
hand-rolls a drawer with its own scrim, its own `--library-sheet-height` and its own three z-index
tokens. Extracting `Sheet` — edge anchor, scrim, focus trap, Escape, swipe-to-dismiss — and
migrating `TeamLibrary` onto it is the proof that it is right, and it means the three new surfaces
cost nothing.

This should land **before** the layout change, as its own small piece of work with
`TeamLibrary` as its only consumer. It is the most reusable thing in this whole feature.

---

## 9. Component inventory

### New

| Component | Responsibility |
|---|---|
| `RunLayout` | The six slots and the three area maps. Places; renders nothing of its own |
| `RunStatusBar` | Day, lives, gold, rank, backpack button + badge, view nav |
| `TrainerRegion` | Wraps the existing `TrainerPicker`/`TrainerCard`; adds the team HP readout |
| `BenchRegion` | The four positions, lifted out of `GridPicker` |
| `BoardRegion` | The 2×3, what remains of `GridPicker` |
| `DetailRegion` | Chooses between a roster card and a shop-offer card; is a `Sheet` on phone |
| `ShopRegion` | Odds strip, gold, reroll, lock, five `ShopOfferCard`s |
| `ShopOfferCard` | A `BatomonCard` variant plus price and a buy affordance |
| `BackpackOverlay` | Hosts the existing trinket/item/modifier panels |
| `RosterDndProvider` | The lifted `DndContext` + overlay |
| `Sheet` *(primitive)* | Edge-anchored overlay. Four consumers from day one |
| `PriceTag` *(primitive)* | `$45`, `—` for unknown, struck through when unaffordable |

### Modified

| Component | Change |
|---|---|
| `BatomonCard` | Gains a `variant` covering panel / browser / **shop**; price in the header band beside rarity (FR-C01) |
| `GridPicker` | Splits into `BoardRegion` + `BenchRegion`; loses its `DndContext` |
| `App.tsx` | `CalculatorView` becomes the composition in §6 |
| `App.module.css` | `.builderRow`, `.teamColumn`, `.detailColumn`, `.panelRow` all deleted |
| `TeamLibrary` | Re-based on `Sheet` |
| `tokens.css` | §7 |
| `index.css` | `#root` width and `text-align` (§7.1) |
| `PlacedCreatureDetails` | Takes a `subject` rather than reading `highlighted` |

### Retired

`.panelRow` and the three-panel row it describes; `--builder-row-width`; the hover-only
`highlighted` state.

---

## 10. The scope consequence nobody asked for

A game-shaped stage has no room below the shop for `PlacementAdvisor`, `TotalDps`, `TeamSummary`,
the window control and three charts. That is seven full-width sections and roughly 2,000 px of page.

They cannot all stay. The options:

1. **A second view.** `Calculator` (the stage) and `Analysis` (today's tables and charts) alongside
   the existing `Corpus Browser` nav. A compact DPS figure lives in the status bar so the stage is
   not numberless.
2. **A right-hand dock below the detail card.** Fits `TotalDps` and perhaps the advisor; not the
   charts.
3. **Keep the stage scrollable and put everything below it.** Cheapest, and abandons the
   non-scrolling property that makes the layout feel like the game.

**Recommend 1**, with the advisor's headline — the recommended basket and its cost — surfaced in the
shop region, because that is the one piece of analysis the shop screen is actually for.

This is the biggest consequence of "mimic the game layout" and it is worth an explicit decision
before any code moves, because option 3 is the default that happens if nobody chooses.

---

## 11. Performance

One real risk. The existing lineup search evaluates ~2,900 boards at ~0.1–0.25 ms each and already
runs on a worker (`placementAdvice.worker.ts`). Adding five purchasable monsters to a roster of ten
takes the stage-one selection count from `C(10,6) = 210` to `C(15,6) = 5,005` — **24×** — which is
seconds, not milliseconds.

The structure that avoids it is in [`data-model.md`](./data-model.md) §6: enumerate the ≤32
affordable *baskets* first, and run the existing search once per basket on a roster of at most 10+2.
That is ~32 × 210 selections in the worst case and far fewer in practice, because the budget
discards most baskets before any simulation. Pricing in stage one, as `isLocked` already does, is
what makes the constraint cheapen the search instead of widening it.

The worker boundary already exists and must be kept. SC-001's 500 ms is the budget.

---

## 12. Testing

- **The shell** gets a layout test asserting each region has its `grid-area` at each of the three
  area maps. `src/ui/__tests__/layoutTokens.test.ts` is the existing precedent for asserting CSS
  facts in jsdom.
- **DOM order** gets one test asserting the six regions appear in the §6 order in the document,
  independent of viewport. It is the only guard against a future breakpoint reordering them.
- **Purchase rules** (FR-S06/S07/S08) are engine-level and testable with no DOM.
- **Budget-aware advice** is test-first per Principle III, and the board in
  [`data-model.md`](./data-model.md) §6 is a ready-made fixture with known-correct expected output.
- **The existing `presentation.test.tsx`** (942 lines) will need substantial revision; budget for it
  rather than discovering it.

---

## 13. Sequence

Steps 1–3 are independently valuable and ship without any layout change. Step 6 is the only
irreversible one.

| # | Step | Ships on its own? |
|---|---|---|
| 1 | Extract `Sheet`; migrate `TeamLibrary` onto it | Yes — no visible change, one fewer bespoke drawer |
| 2 | Explicit selection model (§5), keeping the current layout | Yes — tapping a card on a phone finally opens its details |
| 3 | Lift `DndContext` into `RosterDndProvider`; split `GridPicker` into board + bench regions, still stacked | Yes — no visible change |
| 4 | Budget-aware advice + cost on every advice row (`data-model.md` §6) | Yes — fixes unaffordable recommendations |
| 5 | `ShopRegion` below the bench, in the current layout | Yes — the shop works before it moves |
| 6 | `RunLayout`, the region migration, token re-rooting, the analysis-view split (§10) | The big one |

Each of 1, 2, 3 removes one of §2's blockers. By the time step 6 starts, it is a stylesheet and a
composition change rather than a refactor — which is the point of doing them first.
