import { describe, expect, it } from "vitest";
import { corpus } from "../../data/corpus";
import { simulate } from "../simulate";
import { GridRow, TimelineEventKind } from "../../data/enums";
import { placementKey } from "../grid";
import { Species } from "../../data/ids";
import type { CreatureLevel, GridCol, TeamConfiguration } from "../../data/types";

function board(entries: [GridRow, GridCol, Species, CreatureLevel?][]): TeamConfiguration {
  return {
    placements: entries.map(([row, col, creatureId, level]) => ({
      slot: { row, col },
      creatureId,
      level: level ?? 1,
    })),
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: 20,
  };
}

/** When the monster at `row`/`col` cast, in order. */
function castTimes(config: TeamConfiguration, row: GridRow, col: GridCol): number[] {
  return simulate(config, corpus)
    .timeline.filter(
      (e) => e.kind === TimelineEventKind.Attack && e.sourceSlot.row === row && e.sourceSlot.col === col,
    )
    .map((e) => e.tSeconds);
}

/**
 * 2026-10-08, user-requested: "let's model the other half of your comment… the on-cast half
 * ('trigger the ally above': Cicadence, Dryadell, Torrantler, Opalion)".
 *
 * Four creatures whose entire ability is making somebody else cast, all four previously untagged
 * and inert. `above` reads from the FRONT row to the BACK row, so the trigger-er stands in front.
 */
describe("On Cast: Trigger <target>", () => {
  /** Bumblebolt is Bug and casts every 2.5s; Cicadence is Bug and casts every 6s. */
  const bugAbove = board([
    [GridRow.Bottom, 0, Species.Cicadence],
    [GridRow.Top, 0, Species.Bumblebolt],
  ]);

  it("gives the ally above an extra cast each time the trigger-er casts", () => {
    // Cicadence casts at 6, 12 and 18; each lands on the ally one step later (FR-040's rule that
    // a consequence resolves after the instant that caused it).
    expect(castTimes(bugAbove, GridRow.Top, 0)).toContain(6.1);
    expect(castTimes(bugAbove, GridRow.Top, 0)).toContain(12.1);
    expect(castTimes(bugAbove, GridRow.Top, 0)).toContain(18.1);
  });

  it("leaves the triggered ally's own cooldown completely alone (FR-099)", () => {
    /*
     * The rule the recorded Puffloon cascade established: a reaction is an EXTRA cast, not a
     * rescheduled one. Bumblebolt's own 2.5s cycle must run undisturbed underneath the extras —
     * if triggering reset its cooldown, 7.5 and 12.5 would be missing.
     */
    const own = [2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20];
    expect(castTimes(bugAbove, GridRow.Top, 0)).toEqual(
      [...own, 6.1, 12.1, 18.1].sort((a, b) => a - b),
    );
  });

  it("does nothing when the monster above is of the wrong type", () => {
    // "Trigger the BUG ally above" — the filter is the whole ability on most boards, and `above`
    // carried no filters at all before this, so an unfiltered selector would have triggered
    // whoever happened to be standing there.
    const rockAbove = board([
      [GridRow.Bottom, 0, Species.Cicadence],
      [GridRow.Top, 0, Species.Pebbler],
    ]);
    // Pebbler's own 5s cycle, and not one cast more.
    expect(castTimes(rockAbove, GridRow.Top, 0)).toEqual([5, 10, 15, 20]);
  });

  it("reaches adjacent allies for Torrantler, not just the one above", () => {
    const water = board([
      [GridRow.Bottom, 0, Species.Torrantler],
      [GridRow.Bottom, 1, Species.Dribblet],
    ]);
    // Torrantler casts at 7 and 14.
    expect(castTimes(water, GridRow.Bottom, 1)).toContain(7.1);
    expect(castTimes(water, GridRow.Bottom, 1)).toContain(14.1);
  });

  it("honours '(Except other Torrantler)' — a pair does not trigger each other", () => {
    /*
     * Torrantler is itself Water and targets adjacent Water allies, so without the exclusion two
     * of them standing together would each hand the other a free cast every cycle. Worth a test
     * rather than trusting the flag: this is the one clause whose absence would roughly double a
     * pair's output.
     */
    const pair = board([
      [GridRow.Bottom, 0, Species.Torrantler],
      [GridRow.Bottom, 1, Species.Torrantler],
    ]);
    expect(castTimes(pair, GridRow.Bottom, 0)).toEqual([7, 14]);
    expect(castTimes(pair, GridRow.Bottom, 1)).toEqual([7, 14]);
  });

  describe("Opalion's '1 random Rock allies'", () => {
    const rockAllies = board([
      [GridRow.Bottom, 0, Species.Opalion],
      [GridRow.Bottom, 1, Species.Pebbler],
      [GridRow.Top, 0, Species.Runerock],
    ]);

    it("triggers exactly one of them, not all of them", () => {
      // The count is the part that has to be right: two Rock allies and one extra cast per
      // Opalion cast. Opalion casts at 6, 12, 18.
      const pebbler = castTimes(rockAllies, GridRow.Bottom, 1);
      const runerock = castTimes(rockAllies, GridRow.Top, 0);
      const extras = [...pebbler, ...runerock].filter((t) => !Number.isInteger(t));
      expect(extras).toEqual([6.1, 12.1, 18.1]);
    });

    it("picks the same ally wherever the two of them stand", () => {
      /*
       * THE PROPERTY THAT MAKES A DETERMINISTIC PICK SAFE.
       *
       * The game chooses at random and the engine cannot, because the placement optimiser scores
       * 720 boards against each other and a coin flip would turn that into noise. Picking by slot
       * order would have been the obvious resolution and is the trap: it would make which ally
       * benefits depend on where everyone stands, so the optimiser would shuffle the board to put
       * its best Rock monster in whichever slot sorts first — chasing a positional effect the
       * game does not have.
       *
       * Keyed on species id instead, so swapping the two Rock allies' positions moves the extra
       * casts WITH the monster rather than leaving them on the slot.
       */
      const swapped = board([
        [GridRow.Bottom, 0, Species.Opalion],
        [GridRow.Bottom, 1, Species.Runerock],
        [GridRow.Top, 0, Species.Pebbler],
      ]);
      const pebblerBefore = castTimes(rockAllies, GridRow.Bottom, 1);
      const pebblerAfter = castTimes(swapped, GridRow.Top, 0);
      expect(pebblerAfter).toEqual(pebblerBefore);
    });
  });

  it("terminates: a triggered cast does not itself trigger", () => {
    /*
     * Chains stop by construction rather than by the depth cap — a reaction is in `group` but not
     * in `dueCasts`, so it deals its damage without firing this hook again. Two Cicadences facing
     * each other across the rows are the shape that would otherwise run away, and they are also
     * the shape `MAX_CHAIN_DEPTH` was written for and has never been reached by.
     */
    const facing = board([
      [GridRow.Bottom, 0, Species.Cicadence],
      [GridRow.Top, 0, Species.Cicadence],
    ]);
    // The front one triggers the back one (Cicadence is Bug); the back one is in the back row, so
    // it has nothing above it and triggers nobody. Three scheduled casts plus three triggered.
    expect(castTimes(facing, GridRow.Bottom, 0)).toEqual([6, 12, 18]);
    expect(castTimes(facing, GridRow.Top, 0)).toEqual([6, 6.1, 12, 12.1, 18, 18.1]);
  });
});

/**
 * The rate a creature actually fought at (2026-10-09, user-requested: "we also need to have an
 * 'effective this battle' for Puffloon… it might have to be an averaged out 'Ns casting speed'").
 *
 * Every figure on the detail card was resolved before Phase B ran, so none of them could express a
 * reaction: Puffloon's published 10s cooldown is what it ENTERED the battle with and is correct,
 * and beside a Toxic ally on a 4s cooldown it is also nothing like the rate it fired at. The "11
 * casts in 20s" case is not an edge case for this species — it is how Puffloon is played.
 */
describe("effective cast rate", () => {
  /** The stats record for the creature at `row`/`col`. */
  const statsAt = (config: TeamConfiguration, row: GridRow, col: GridCol) =>
    simulate(config, corpus).perCreatureEffectiveStats[
      placementKey(config.placements.find((p) => p.slot.row === row && p.slot.col === col)!.creatureId, { row, col })
    ]!;

  it("reports the reactive rate, not the published cooldown", () => {
    // Aristobat is Toxic on a 4s cooldown; Puffloon reacts to adjacent Toxic allies. Its own 10s
    // cycle keeps running underneath, so the casts are its three plus Aristobat's five reactions.
    const pairing = board([
      [GridRow.Top, 0, Species.Aristobat],
      [GridRow.Top, 1, Species.Puffloon],
    ]);
    const puffloon = statsAt(pairing, GridRow.Top, 1);

    expect(puffloon.cooldownSeconds).toBe(10);
    expect(puffloon.casts).toBe(castTimes(pairing, GridRow.Top, 1).length);
    expect(puffloon.casts).toBeGreaterThan(3);
    // The headline claim: it fought at well under half its published cooldown.
    expect(puffloon.effectiveCooldownSeconds!).toBeLessThan(5);
  });

  it("scales with how many Toxic allies are feeding it", () => {
    // "Puffloon absolutely will trigger many many times with other poison creatures in play" —
    // every qualifying neighbour adds its own cast cycle to Puffloon's rate.
    const one = board([
      [GridRow.Top, 0, Species.Aristobat],
      [GridRow.Top, 1, Species.Puffloon],
    ]);
    const three = board([
      [GridRow.Top, 0, Species.Aristobat],
      [GridRow.Top, 1, Species.Puffloon],
      [GridRow.Top, 2, Species.Aristobat],
      [GridRow.Bottom, 1, Species.Venopuff],
    ]);

    expect(statsAt(three, GridRow.Top, 1).casts).toBeGreaterThan(statsAt(one, GridRow.Top, 1).casts);
    expect(statsAt(three, GridRow.Top, 1).effectiveCooldownSeconds!).toBeLessThan(
      statsAt(one, GridRow.Top, 1).effectiveCooldownSeconds!,
    );
  });

  it("equals the published cooldown exactly when nothing changed the rate", () => {
    /*
     * The property that makes a DIFFERENCE meaningful. The card only opens its "Effective this
     * battle" band when a figure changed, so a measure that drifted off the published cooldown
     * would open it on every creature in the corpus and report a discrepancy nobody caused.
     *
     * This is why the figure is the mean gap between casts rather than `window / casts`: Magmite's
     * 4.5s cooldown fits four casts into a 20s window, which the latter would read as 5.0.
     */
    const plain = board([
      [GridRow.Top, 0, Species.Magmite],
      [GridRow.Top, 2, Species.Venopuff],
    ]);
    expect(statsAt(plain, GridRow.Top, 0).effectiveCooldownSeconds).toBeCloseTo(4.5, 6);
    expect(statsAt(plain, GridRow.Top, 2).effectiveCooldownSeconds).toBeCloseTo(3.5, 6);
  });

  it("counts casts, not multicast repetitions", () => {
    /*
     * Aristobat has Multicast 2, so it produces two attack events per cast. Reporting four casts
     * where there are two would halve its effective cooldown and double-count a stat the card
     * already shows on its own line.
     */
    const solo = board([[GridRow.Top, 0, Species.Aristobat]]);
    const aristobat = statsAt(solo, GridRow.Top, 0);

    expect(aristobat.casts).toBe(5); // 4, 8, 12, 16, 20
    // Nine attack events, not ten: the repetition of the cast at t=20 would land at 20.1, past the
    // end of the window. Which is the second reason not to count reps — the tail of the window
    // truncates them, so an interval derived from them would drift with the window length.
    expect(castTimes(solo, GridRow.Top, 0)).toHaveLength(9);
    expect(aristobat.effectiveCooldownSeconds).toBeCloseTo(4, 6);
  });

  it("splits the casts into the ally's gift and the monster's own cycle", () => {
    /*
     * 2026-10-09, user-requested, and the reason the total alone was not enough: the ask was for
     * the card to read "10 ally casts", and three of those ten are Puffloon's own 10s cycle. The
     * ally half is also the only half that MOVES when the board is rearranged, which makes it the
     * figure a user choosing where to stand a Puffloon is actually comparing.
     */
    const pairing = board([
      [GridRow.Top, 0, Species.Aristobat],
      [GridRow.Top, 1, Species.Puffloon],
    ]);
    const puffloon = statsAt(pairing, GridRow.Top, 1);

    expect(puffloon.allyTriggeredCasts).toBeGreaterThan(0);
    expect(puffloon.casts - puffloon.allyTriggeredCasts).toBe(
      // Its own cycle, undisturbed: a 10s cooldown over a 20s window. FR-099's rule that a
      // reaction never reschedules its reactor is what makes this subtraction meaningful at all.
      statsAt(board([[GridRow.Top, 1, Species.Puffloon]]), GridRow.Top, 1).casts,
    );
  });

  it("counts nothing as ally-triggered on a board with no triggers", () => {
    // The field has to be zero rather than absent for the card to be able to tell "no ally casts"
    // from "this monster has no trigger" — they render differently.
    const plain = board([
      [GridRow.Top, 0, Species.Magmite],
      [GridRow.Top, 2, Species.Venopuff],
    ]);
    expect(statsAt(plain, GridRow.Top, 0).allyTriggeredCasts).toBe(0);
    expect(statsAt(plain, GridRow.Top, 2).allyTriggeredCasts).toBe(0);
  });

  /**
   * N-way triggering (2026-10-09, user-asked: "would the 'effective' account for a 2-way, 3-way or
   * N-way triggering… the math should be deterministic, thankfully").
   *
   * It does, and it is. Three separate mechanisms compose on a Toxic board, each measured here
   * against the board that isolates it:
   *
   * - Puffloon's reactions ADD UP over every adjacent Toxic ally.
   * - Puffloon's reactive Poison charges Cobrex, because charges read the whole instant rather than
   *   only the scheduled casts in it — so a reaction accelerates a third monster.
   * - Drumire's +5% per ally cast COMPOUNDS, shortening its neighbours' own cycles, which produces
   *   more casts for Puffloon to react to in turn.
   */
  describe("N-way", () => {
    /** Six slots: three Toxic monsters in the top row, three non-Toxic underneath. */
    const toxicRow = (left: Species, middle: Species, right: Species) =>
      board([
        [GridRow.Top, 0, left],
        [GridRow.Top, 1, middle],
        [GridRow.Top, 2, right],
        [GridRow.Bottom, 0, Species.Magmite],
        [GridRow.Bottom, 1, Species.Pebbler],
        [GridRow.Bottom, 2, Species.Panbud],
      ]);

    it("adds a Puffloon's reactions across every adjacent Toxic ally", () => {
      // Pebbler is Rock, so each two-way board gives Puffloon exactly one qualifying neighbour.
      const withDrumire = statsAt(toxicRow(Species.Drumire, Species.Puffloon, Species.Pebbler), GridRow.Top, 1);
      const withCobrex = statsAt(toxicRow(Species.Pebbler, Species.Puffloon, Species.Cobrex), GridRow.Top, 1);
      const withBoth = statsAt(toxicRow(Species.Drumire, Species.Puffloon, Species.Cobrex), GridRow.Top, 1);

      expect(withDrumire.allyTriggeredCasts).toBeGreaterThan(0);
      expect(withCobrex.allyTriggeredCasts).toBeGreaterThan(0);
      // Deterministic and additive: each neighbour contributes its own cast cycle and nothing is
      // lost or double-counted when both are present.
      expect(withBoth.allyTriggeredCasts).toBe(
        withDrumire.allyTriggeredCasts + withCobrex.allyTriggeredCasts,
      );
      expect(withBoth.effectiveCooldownSeconds!).toBeLessThan(withDrumire.effectiveCooldownSeconds!);
      expect(withBoth.effectiveCooldownSeconds!).toBeLessThan(withCobrex.effectiveCooldownSeconds!);
    });

    it("lets a Puffloon reaction accelerate a Cobrex, which then triggers the Puffloon again", () => {
      /*
       * The second-order case. Cobrex charges 1s per ally Poison application and the charge hook
       * reads the WHOLE instant, reactions included — so Puffloon's reactive Poison pulls Cobrex's
       * cast in, and Cobrex's cast is a scheduled one, which triggers Puffloon.
       *
       * Measured as Cobrex's effective rate against its published 15s: the charges are the only
       * thing that could move it.
       */
      // A 30s window, because Cobrex needs two casts to HAVE a rate and a charged 15s cooldown
      // only just manages one inside 20s.
      const fed = { ...toxicRow(Species.Drumire, Species.Puffloon, Species.Cobrex), simulationWindowSeconds: 30 };
      const cobrex = statsAt(fed, GridRow.Top, 2);

      expect(cobrex.cooldownSeconds).toBe(15);
      expect(cobrex.effectiveCooldownSeconds!).toBeLessThan(15);
      // Charges come from allies' Poison regardless of where they stand, so the figure that proves
      // the REACTION contributed is the gap against a board whose Puffloon reacts to nobody.
      const starved = {
        ...board([
          [GridRow.Top, 0, Species.Drumire],
          [GridRow.Top, 2, Species.Cobrex],
          [GridRow.Bottom, 1, Species.Puffloon],
          [GridRow.Bottom, 0, Species.Magmite],
          [GridRow.Bottom, 2, Species.Panbud],
        ]),
        simulationWindowSeconds: 30,
      };
      expect(cobrex.effectiveCooldownSeconds!).toBeLessThan(
        statsAt(starved, GridRow.Top, 2).effectiveCooldownSeconds!,
      );
    });

    it("compounds Drumire's grant into its neighbours' own cycles", () => {
      // "When a Toxic ally casts, give it +5% Cooldown Speed for this battle" — so Venopuff's gaps
      // shrink as the battle runs and its effective rate beats its published 3.5s.
      const withDrumire = statsAt(toxicRow(Species.Drumire, Species.Puffloon, Species.Venopuff), GridRow.Top, 2);
      const without = statsAt(toxicRow(Species.Pebbler, Species.Puffloon, Species.Venopuff), GridRow.Top, 2);

      expect(without.effectiveCooldownSeconds).toBeCloseTo(3.5, 6);
      expect(withDrumire.effectiveCooldownSeconds!).toBeLessThan(3.5);
      // Earned purely from its own cycle: Venopuff has no trigger, so nothing here is a reaction.
      expect(withDrumire.allyTriggeredCasts).toBe(0);
    });

    it("stays one level deep: a reaction never causes a second reaction", () => {
      /*
       * THE LIMIT, pinned so it is a decision rather than a surprise.
       *
       * A reaction lands in `group` but not in `dueCasts`, and both ally-cast hooks iterate
       * `dueCasts` — so a triggered cast applies its status and deals its damage without triggering
       * anybody. Two Puffloons would otherwise trade free casts forever, which is the runaway
       * `MAX_CHAIN_DEPTH` exists for and this construction makes unreachable.
       *
       * The consequence worth knowing: a Puffloon flanked by two Toxic allies reacts once per ALLY
       * cast, never once per reaction, so its rate is bounded by its neighbours' cast rates.
       */
      const flanked = toxicRow(Species.Venopuff, Species.Puffloon, Species.Aristobat);
      const puffloon = statsAt(flanked, GridRow.Top, 1);
      const venopuff = statsAt(flanked, GridRow.Top, 0);
      const aristobat = statsAt(flanked, GridRow.Top, 2);

      /*
       * One reaction per neighbour cast, less exactly one: Aristobat's fifth cast lands at t=20,
       * so its reaction would be at 20.1 — past the end of the window, and dropped rather than
       * clamped into it. That truncation is the same rule multicast repetitions follow, and
       * pinning it here is what stops a later "fix" from inflating a boundary cast into a free one.
       */
      expect(puffloon.allyTriggeredCasts).toBe(venopuff.casts + aristobat.casts - 1);
    });
  });

  it("reports no interval for a creature that cast at most once", () => {
    // One cast establishes no interval. Dividing the window by it would invent one, reporting a
    // 25s-cooldown monster in a 20s window as though it had a rate at all.
    const slow = board([[GridRow.Top, 0, Species.Puffloon]]);
    const single = { ...slow, simulationWindowSeconds: 10 };
    const puffloon = statsAt(single, GridRow.Top, 0);

    expect(puffloon.casts).toBe(1);
    expect(puffloon.effectiveCooldownSeconds).toBeNull();
  });
});
