# 003 — Data model and engine changes

What has to exist in `src/data` and `src/engine` before any of the UI in
[`ui-architecture.md`](./ui-architecture.md) has anything to render. Read [`spec.md`](./spec.md) §0
first; this document assumes the transcribed reading.

---

## 1. Run state

Three numbers that describe the run rather than the board. One of them already exists.

```ts
/** The run this board is being built inside. Every field optional; absent is a legal run. */
export interface RunState {
  /** Gold in hand. Decremented by a purchase, otherwise user-maintained — see spec.md assumption 2. */
  gold?: number;
  /** Lives remaining (the heart in the game's status bar). Display only. */
  lives?: number;
  /** Which day of the run this board is for. MOVES here from `TeamConfiguration.runDay`. */
  day?: number;
}
```

**No `rank`.** The draft carried one. Its only consumer was the rarity-odds strip, the strip's only
consumer was reroll expected value, and expected value only matters under the simulated shop that
`spec.md` §0 rejects. It is also not a stable property of the run — trinkets, items and trainers
modify shop rank — so a stored number would be wrong in exactly the situations a player asks about.
See §5.

### Why a group rather than three sibling fields

`runDay` is already a top-level field, and adding `gold` and `lives` beside it would mean three
separate `canonicalize` exclusions, three share-codec entries and three "absent means default"
clauses. Grouping them makes "run state is context, not content" a statement about one key instead
of a rule that has to be re-applied every time a fourth number arrives.

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
   * `null` means UNKNOWN, not free: an offer with no price is excluded from affordability
   * arithmetic rather than treated as a gift (FR-S04). Under §4's acquisition-source model this
   * should be rare — a shop-obtainable species with no price fails a corpus test — but the offer
   * type still has to represent it, because the corpus will be incomplete for a while.
   */
  price: number | null;
  /** Survives a reroll (FR-S11). Mirrors the in-game lock. */
  locked?: boolean;
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
2. A transcribed shop is _work the user did_. Typing five monsters in and then losing them to a
   refresh is the same complaint that moved `runDay` into the config on 2026-10-08.

It is, however, **not part of the build's identity** — see §3.

---

## 3. Persistence, sharing and the build id

`share.ts` has an established three-way split and both new structures slot into it:

|                                        | In `canonicalize` / `buildId` | In the share code | In local storage |
| -------------------------------------- | ----------------------------- | ----------------- | ---------------- |
| `placements`, `bench`, trinkets, items | yes                           | yes               | yes              |
| `runDay` _(today)_                     | **no**                        | yes               | yes              |
| `run` _(new)_                          | **no**                        | yes               | yes              |
| `shop` _(new)_                         | **no**                        | yes               | yes              |

The rule the existing code states for `runDay` — _"two boards identical except for the day you
fought them are the same board"_ — extends unchanged: two boards identical except for what the shop
was offering are the same board. Putting either in the fingerprint would make the library treat a
re-visited build as a new one every time the shop rerolled.

Share-code size is worth a glance: five species ids plus prices is roughly 150 bytes of JSON before
base64, against the ~900 the current code already carries. Omit `shop` entirely when every position
is empty, as `bench` already does, and no existing code changes length.

---

## 4. Acquisition sources — how a monster can be obtained

### The problem this replaces

**62 of 149 species carry `shopCost: 0`**, and `0` currently means two incompatible things:

- **Not sold here.** Purple Egg and Dragon Egg hatch; the four Mythicals (MissingN., NULL-00,
  NULL-7F, NULL-FF) are not shop stock; Brimtoad, Mallogre and Pawsperity are rewards. `0` is
  correct and these must never appear in a shop row.
- **Sold, but nobody recorded the price.** Bunchop, Frillet, Lamplet, Leafleap, Shellter and most of
  the rest. Rendering `$0` here is a wrong number presented confidently, which Principle IV exists
  to prevent.

They are indistinguishable in the current schema, which is the actual defect. The draft proposed a
tri-state `number | null | undefined`; that encodes the distinction but puts it in the wrong place,
because "where does this monster come from" is a fact about the monster, not about its price.

### The model

```ts
export enum AcquisitionSource {
  /** Appears in the shop row and can be bought. Implies a price (see the invariant below). */
  Shop = "Shop",
  /** Produced by combining three copies of the level below. The usual source for levels 2-4. */
  Merge = "Merge",
  /** Produced by levelling a DIFFERENT species — the `evolvesInto` / `evolvesAtLevel` pair. */
  Evolution = "Evolution",
  /** Hatches from an egg after a number of days. */
  Hatch = "Hatch",
  /** Granted for winning a round, clearing an event, or any other run payout. */
  Reward = "Reward",
  /** Created by a trainer, trinket or item ability rather than acquired. */
  Grant = "Grant",
}
```

Declared **per level**, on the records that already exist:

```ts
{
  id: Species.Magmite,
  shopCost: 15,
  obtainedFrom: [AcquisitionSource.Shop],     // level 1
  levels: {
    2: { obtainedFrom: [AcquisitionSource.Merge] },
    3: { obtainedFrom: [AcquisitionSource.Merge] },
    4: { obtainedFrom: [AcquisitionSource.Merge] },
  },
}
```

A default of `[Merge]` for levels 2-4 and a required value at level 1 keeps the common case to one
line per species. `Evolution` is derivable from the existing `evolvesInto` / `evolvesAtLevel` pair
on the _source_ species, so it should be derived rather than restated — 13 species are the target
of an evolution and hand-maintaining both sides is how they would disagree.

### What it buys, in order of value

1. **The shop offers only what the shop sells (FR-A02).** The creature picker opened from a shop
   position filters on `Shop`; opened from a board or bench position it offers everything, because a
   monster can arrive by hatch or reward.
2. **"Sold but unpriced" becomes a build failure (FR-A03).** The invariant is one test:

   ```ts
   it("every shop-obtainable species has a price", () => {
     const offenders = corpus.creatures
       .filter((c) => c.obtainedFrom?.includes(AcquisitionSource.Shop) && !(c.shopCost > 0))
       .map((c) => c.name);
     expect(offenders).toEqual([]);
   });
   ```

   That converts a silent 62-record ambiguity into an enumerated, shrinking list. It also means the
   tagging work can be done incrementally without the half-finished state being mistaken for a
   finished one.

3. **The level selector stops lying (FR-A04).** Levels reachable only by merging can be labelled as
   such, which is the honest answer to "can I just pick level 3".
4. **`computeMergeAdvice` gains a cost basis.** A merge to level 2 costs three level-1 purchases,
   which is a number the advisor can finally compute.

### The remaining work, bounded

Tagging is a 149-record pass that only the player can do. Pricing is needed only for the `Shop`
subset of the 62 currently at zero. Both are additive, both are testable, and neither blocks the UI
— an untagged species simply does not appear in the shop picker, which fails safe.

**Do this as its own change before the shop UI.** It is a corpus edit with a test and no React, and
bundling it into a layout overhaul is how it ends up half-done.

---

## 5. Rarity odds and shop rank — RETIRED

The reference screen shows `Rank 8 ◆25% ◆30% ◆35% ◆10% ◆0%`, and the draft specified a
`SHOP_ODDS` table keyed by rank. **Neither is being built.**

Three reasons, each sufficient:

1. **Nothing reads it.** Rank's only consumer was the odds strip; the strip's only consumer was
   reroll expected value; expected value only matters if the app is rolling shops, which
   `spec.md` §0 rejects.
2. **Rank is not a stable property of the run.** Trinkets, items and trainers modify it, so a value
   stored on the config would be wrong precisely on the interesting boards.
3. **A static table could not be right.** Per point 2 the odds depend on the loadout, so a
   rank→odds mapping harvested from screenshots would encode whatever loadout the screenshot had.

This removes `SHOP_ODDS`, `RunState.rank`, the odds strip component and FR-S09. If the strip is ever
wanted purely as decoration, it is a display string the user types, not a model.

**What survives:** reroll and lock. Under transcription a reroll clears the unlocked offers so you
can re-enter the five you now see, and a lock keeps the ones you kept in-game. Both are
transcription ergonomics, and both are real work saved.

---

## 6. The engine change that matters: budget-aware advice

### What is wrong today

`rosterAdvice.ts` treats the bench as monsters you already own and prices them at zero. Asked about
a real shop that is wrong in a way that produces confident, unusable output. Measured on the board
that prompted this feature (day 2, `rich-lady`, $55 in hand):

| What the advisor said                                                                          | Cost    | Affordable?                    |
| ---------------------------------------------------------------------------------------------- | ------- | ------------------------------ |
| "Best lineup you own": field Brawlmantis **and** Runerock, bench Puffloon — 47.3 DPS, 82 ehp/s | $75     | **no**                         |
| "Highest DPS": field Brawlmantis — 51.6 DPS, 19.3 ehp/s                                        | $55     | yes, but it is the worse board |
| What the budget actually allowed at best: Aristobat + Runerock — 38.2 DPS, 82 ehp/s, score 748 | **$45** | yes, and $10 left over         |

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
  budget?: Budget, // absent = today's behaviour, unchanged
): BenchAdvice | null;
```

Three properties this must have, each of which is a way the obvious implementation goes wrong:

1. **The filter is on the SELECTION, not the final board.** Stage one already enumerates selections
   before permuting them; pricing there discards unaffordable selections before they cost a
   simulation, so the budget makes the search _cheaper_, exactly as `isLocked` already does.
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

This is deliberately a _caller_ of `rosterAdvice` rather than a change to it: the shop question is
"which monsters should join the roster", and the lineup question is "given a roster, who plays".
Keeping them separate is what stops the combinatorics multiplying — see `ui-architecture.md` §7 for
the cost ceiling and why it is the one real performance risk in this feature.

---

## 7. Sequencing

Each step is independently shippable and leaves the app working.

| #   | Change                                                                        | Depends on | Why this order                                                                       |
| --- | ----------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| 1   | `AcquisitionSource` enum, `obtainedFrom` per level, the FR-A03 invariant test | —          | Corpus edit, test, no UI. Smallest useful unit, and it fails safe while incomplete   |
| 2   | `RunState` group; `runDay` shimmed; share codec extended                      | —          | Lands the persistence rule once                                                      |
| 3   | Budget-aware `computeBenchAdvice`; cost on every advice row                   | —          | Pure engine, test-first per Principle III. **Delivers value with no shop UI at all** |
| 4   | `ShopOffer` on the config; shop row UI; buy / reroll / lock                   | 1, 2       | First visible shop                                                                   |
| 5   | `shopAdvice.ts` basket search                                                 | 3, 4       | US1 complete                                                                         |
| 6   | Layout shell and region migration                                             | 4          | See `ui-architecture.md` — the big one, deliberately last                            |

Step 3 is worth calling out: it is maybe 80 lines, it needs no new UI, it does not even depend on
step 1, and it fixes the defect that made the advisor recommend a $75 basket to someone holding
$55. It is the highest value-per-line change in the feature.

The draft's step 7 (rarity odds and reroll expected value) is gone — see §5.
