# 003 — Data model and engine changes

What has to exist in `src/data` and `src/engine` before any of the UI in
[`ui-architecture.md`](./ui-architecture.md) has anything to render. Read [`spec.md`](./spec.md) §0
first; this document assumes the transcribed reading.

---

## 1. Run state

Four numbers that describe the run rather than the board. One of them already exists.

```ts
/** The run this board is being built inside. Every field optional; absent is a legal run. */
export interface RunState {
  /** Gold in hand. Decremented by a purchase, otherwise user-maintained — see spec.md assumption 2. */
  gold?: number;
  /** Lives remaining (the heart in the game's status bar). Display only today. */
  lives?: number;
  /** Shop rank. Read only by the rarity-odds strip, which may never exist — see §5. */
  rank?: number;
  /** Which day of the run this board is for. MOVES here from `TeamConfiguration.runDay`. */
  day?: number;
}
```

### Why a group rather than four sibling fields

`runDay` is already a top-level field, and adding `gold`, `lives` and `rank` beside it would mean
four separate `canonicalize` exclusions, four separate share-codec entries and four separate
"absent means default" clauses. Grouping them makes "run state is context, not content" a statement
about one key instead of a rule that has to be re-applied every time a fifth number arrives.

Migration is a read-time shim, not a data migration: `config.run?.day ?? config.runDay ??
DEFAULT_RUN_DAY`. `runDay` stays in the type, marked deprecated, until the share codec has shipped
a version that writes `run` — build codes in the wild carry it and must keep loading.

### What it does NOT contain

- **Win/loss record.** The library already records outcomes per saved build.
- **Round rewards, interest, sell value.** No sourced data (Principle IV), and the user editing gold
  expresses all three.
- **The enemy.** `enemyHealth.ts` already derives that from the day.

---

## 2. The shop

```ts
/** One of the five positions on the shop row. */
export interface ShopOffer {
  /** 0-4. Fixed at SHOP_SIZE positions — see spec.md assumption 3. */
  index: ShopIndex;
  creatureId: Species;
  /**
   * What this offer costs. Defaults to the species' `shopCost` and is overridable, because the
   * game prices by run state this project does not model (FR-S03).
   *
   * `null` means UNKNOWN, not free. 65 of 149 species publish `shopCost: 0` and an offer with no
   * price must be excluded from affordability arithmetic rather than treated as a gift (FR-S04).
   */
  price: number | null;
  /** Bought this visit. Kept rather than removed so the row does not reflow under the pointer. */
  bought?: boolean;
}
```

Stored as `TeamConfiguration.shop?: ShopOffer[]`, sparse and index-keyed, exactly like
`bench?: BenchedCreature[]`. The bench's shape is the precedent to copy wholesale: it is sparse,
optional, omitted from the share code when empty, and has a `BENCH_INDEXES` constant the UI maps
over. `SHOP_INDEXES` is the same thing with five entries.

### Why the shop is on `TeamConfiguration` and not component state

Two reasons, and the second is the real one:

1. The advisor reads it. Anything `src/engine` reads has to be part of the config it is handed.
2. A transcribed shop is *work the user did*. Typing five monsters in and then losing them to a
   refresh is the same complaint that moved `runDay` into the config on 2026-10-08.

It is, however, **not part of the build's identity** — see §3.

---

## 3. Persistence, sharing and the build id

`share.ts` has an established three-way split and both new structures slot into it:

| | In `canonicalize` / `buildId` | In the share code | In local storage |
|---|---|---|---|
| `placements`, `bench`, trinkets, items | yes | yes | yes |
| `runDay` *(today)* | **no** | yes | yes |
| `run` *(new)* | **no** | yes | yes |
| `shop` *(new)* | **no** | yes | yes |

The rule the existing code states for `runDay` — *"two boards identical except for the day you
fought them are the same board"* — extends unchanged: two boards identical except for what the shop
was offering are the same board. Putting either in the fingerprint would make the library treat a
re-visited build as a new one every time the shop rerolled.

Share-code size is worth a glance: five species ids plus prices is roughly 150 bytes of JSON before
base64, against the ~900 the current code already carries. Omit `shop` entirely when every position
is empty, as `bench` already does, and no existing code changes length.

---

## 4. The price data gap

**65 of 149 species carry `shopCost: 0`.** This is the single largest blocker in the feature, and it
has two distinct causes that must not be conflated:

- **Genuinely unbuyable** — Purple Egg (`shopCost: 0`, hatches into something), Brimtoad, Mallogre,
  Pawsperity. These are rewards and hatches, not shop stock. `0` is correct and they should never
  appear in a shop row.
- **Simply unsourced** — the majority. `0` here means "nobody recorded it", and rendering it as free
  would be a wrong number presented confidently, which Principle IV exists to prevent.

The two are indistinguishable in the current schema, which is the actual defect. The fix is to make
them distinguishable:

```ts
/** `null` = not sold in the shop. `undefined`/absent = price not yet sourced. A number is a price. */
shopCost?: number | null;
```

Until the corpus is filled in, the UI path is: an offer whose price is unsourced prompts for one,
and the entered value is cached per species in local storage (not in the corpus, which is generated
data). That turns a 65-species data-entry project into something that fills itself in as the user
plays, and the cache is a ready-made patch file for the corpus later.

**This is worth doing as its own small change before the shop**, because it is a corpus edit with a
test and no UI, and bundling it into a layout overhaul is how it ends up half-done.

---

## 5. Rarity odds — specified, probably not buildable

The reference screen shows `Rank 8 ◆25% ◆30% ◆35% ◆10% ◆0%` — five percentages against six
rarities, so Mythical is presumably not shop stock.

```ts
/** rank → probability per rarity. Must sum to 1. UNSOURCED — see below. */
export const SHOP_ODDS: Readonly<Record<number, Partial<Record<Rarity, number>>>>;
```

This project has no source for it. Principle IV is explicit that a value adjudicated between
sources must have the adjudication written up, and a value with no source at all cannot be written
down. Two honest routes:

1. **Omit the strip.** FR-S09 already says absent odds means no strip rather than a fake one.
2. **Harvest it.** The strip is on screen in every shop screenshot. Twelve screenshots at twelve
   ranks is a sourced table, and the battle-capture skill in this repo is already a tool for
   reading numbers off this game's UI.

Route 2 is the only one that unlocks reroll expected value, which is the one genuinely new piece of
advice this feature could offer beyond "which of these should I buy".

---

## 6. The engine change that matters: budget-aware advice

### What is wrong today

`rosterAdvice.ts` treats the bench as monsters you already own and prices them at zero. Asked about
a real shop that is wrong in a way that produces confident, unusable output. Measured on the board
that prompted this feature (day 2, `rich-lady`, $55 in hand):

| What the advisor said | Cost | Affordable? |
|---|---|---|
| "Best lineup you own": field Brawlmantis **and** Runerock, bench Puffloon — 47.3 DPS, 82 ehp/s | $75 | **no** |
| "Highest DPS": field Brawlmantis — 51.6 DPS, 19.3 ehp/s | $55 | yes, but it is the worse board |
| What the budget actually allowed at best: Aristobat + Runerock — 38.2 DPS, 82 ehp/s, score 748 | **$45** | yes, and $10 left over |

The best affordable answer scored 748 against the 519 the user played and the 554 of the
damage-maximal alternative — and it was never surfaced, because nothing in the search knows that
monsters cost money.

### The change

```ts
export interface Budget {
  gold: number;
  /** What each candidate costs to field. Benched monsters you already own cost 0. */
  priceOf: (ref: RosterRef) => number | null;
}

export function computeBenchAdvice(
  config: TeamConfiguration,
  corpus: Corpus,
  currentScore: number,
  currentDps: number,
  budget?: Budget,          // absent = today's behaviour, unchanged
): BenchAdvice | null;
```

Three properties this must have, each of which is a way the obvious implementation goes wrong:

1. **The filter is on the SELECTION, not the final board.** Stage one already enumerates selections
   before permuting them; pricing there discards unaffordable selections before they cost a
   simulation, so the budget makes the search *cheaper*, exactly as `isLocked` already does.
2. **An unpriced candidate is excluded and SAID so**, never treated as free. `BenchAdvice` already
   carries `unreadablePositional` and `locked` for precisely this kind of "the search was
   constrained and you cannot see it from the rows" disclosure; add `unpriced`.
3. **Every row reports its cost.** `BenchSwap` and `LineupSuggestion` gain a `cost` field. A swap
   table that ranks by DPS delta and hides the price is the same display failure as the one that
   rendered a free, defensively decisive Runerock as `+0.0`.

### `shopAdvice.ts` — the new entry point

Baskets, not lineups. Given five offers and a budget, enumerate the affordable subsets (at most
2⁵ = 32, trivially cheap), and for each one run the existing lineup search over the roster that
purchase would produce. Rank by the survivability-weighted score, report DPS, mitigation and cost.

This is deliberately a *caller* of `rosterAdvice` rather than a change to it: the shop question is
"which monsters should join the roster", and the lineup question is "given a roster, who plays".
Keeping them separate is what stops the combinatorics multiplying — see `ui-architecture.md` §7 for
the cost ceiling and why it is the one real performance risk in this feature.

---

## 7. Sequencing

Each step is independently shippable and leaves the app working.

| # | Change | Depends on | Why this order |
|---|---|---|---|
| 1 | `shopCost` becomes `number \| null \| undefined`; unbuyable species marked | — | Corpus edit, test, no UI. Smallest useful unit |
| 2 | `RunState` group; `runDay` shimmed; share codec extended | — | Lands the persistence rule once |
| 3 | Budget-aware `computeBenchAdvice`; cost on every advice row | 1 | Pure engine, test-first per Principle III. **Delivers value with no shop UI at all** |
| 4 | `ShopOffer` on the config; shop row UI; buy action | 1, 2 | First visible shop |
| 5 | `shopAdvice.ts` basket search | 3, 4 | US1 complete |
| 6 | Layout shell and region migration | 4 | See `ui-architecture.md` — the big one, deliberately last |
| 7 | Rarity odds + reroll EV | 5 | Only if §5 route 2 produces sourced data |

Step 3 is worth calling out: it is maybe 80 lines, it needs no new UI, and it fixes the defect that
made the advisor recommend a $75 basket to someone holding $55.
