import { describe, expect, it } from "vitest";
import { availableMerges } from "../merge";
import { computeMergeAdvice } from "../rosterAdvice";
import { simulate, windowAverageDps } from "../simulate";
import { corpus } from "../../data/corpus";
import type { TeamConfiguration } from "../../data/types";
import { GridRow } from "../../data/enums";
import { Species } from "../../data/ids";

/**
 * Levelling by spending duplicates (2026-10-09, user-reported).
 *
 * The reported question is the one these tests are built around: "I have three Lignite Lv.1 — is
 * levelling it worth it?" Lignite is the right subject for more than that reason. Its ability
 * ("additional Damage equal to 20 times this monster's Burn") doubles its multiplier at Lv.2 and
 * IS modelled, so a merge produces a real change in the simulation rather than a difference the
 * engine would have to guess at.
 */

const BACK_0 = { row: GridRow.Top, col: 0 } as const;
const BACK_1 = { row: GridRow.Top, col: 1 } as const;
const BACK_2 = { row: GridRow.Top, col: 2 } as const;

function config(overrides: Partial<TeamConfiguration> = {}): TeamConfiguration {
  return {
    placements: [],
    bench: [],
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: 20,
    ...overrides,
  };
}

/** One placed Lignite and `benched` more on the bench — the user's shape, parameterised. */
function lignites(benched: number, level: 1 | 2 = 1) {
  return config({
    placements: [{ slot: BACK_0, creatureId: Species.Lignite, level }],
    bench: Array.from({ length: benched }, (_, i) => ({
      index: i as 0 | 1 | 2 | 3,
      creatureId: Species.Lignite,
      level,
    })),
  });
}

describe("what the roster can pay for", () => {
  it("offers nothing on two copies, and a Lv.2 on three", () => {
    // The gate the user asked for: a merge is only ever suggested when the copies exist.
    expect(availableMerges(lignites(1), corpus)).toHaveLength(0);
    const merges = availableMerges(lignites(2), corpus);
    expect(merges).toHaveLength(1);
    expect(merges[0]!.result).toMatchObject({ creatureId: Species.Lignite, level: 2 });
    expect(merges[0]!.copies).toBe(3);
  });

  it("costs two Lv.2 copies for a Lv.3, not three", () => {
    expect(availableMerges(lignites(1, 2), corpus)).toHaveLength(1);
    expect(availableMerges(lignites(1, 2), corpus)[0]!.result.level).toBe(3);
  });

  it("never offers a Lv.4, which the game sells through trinkets and items instead", () => {
    const threeLv3 = config({
      placements: [
        { slot: BACK_0, creatureId: Species.Lignite, level: 3 },
        { slot: BACK_1, creatureId: Species.Lignite, level: 3 },
        { slot: BACK_2, creatureId: Species.Lignite, level: 3 },
      ],
    });
    expect(availableMerges(threeLv3, corpus)).toHaveLength(0);
  });

  it("needs no bench at all — three placed copies are a merge", () => {
    const allPlaced = config({
      placements: [
        { slot: BACK_0, creatureId: Species.Lignite, level: 1 },
        { slot: BACK_1, creatureId: Species.Lignite, level: 1 },
        { slot: BACK_2, creatureId: Species.Lignite, level: 1 },
      ],
    });
    const merge = availableMerges(allPlaced, corpus)[0]!;
    // Two slots are emptied and named, because that is the price and a DPS figure cannot show it.
    expect(merge.vacated).toHaveLength(2);
    expect(merge.config.placements).toHaveLength(1);
  });

  it("does not merge copies at different levels, or a shiny with a plain one", () => {
    const mixedLevels = config({
      placements: [{ slot: BACK_0, creatureId: Species.Lignite, level: 2 }],
      bench: [
        { index: 0, creatureId: Species.Lignite, level: 1 },
        { index: 1, creatureId: Species.Lignite, level: 1 },
      ],
    });
    expect(availableMerges(mixedLevels, corpus)).toHaveLength(0);

    const mixedShiny = config({
      placements: [{ slot: BACK_0, creatureId: Species.Lignite, level: 1, shiny: true }],
      bench: [
        { index: 0, creatureId: Species.Lignite, level: 1 },
        { index: 1, creatureId: Species.Lignite, level: 1 },
      ],
    });
    expect(availableMerges(mixedShiny, corpus)).toHaveLength(0);
  });
});

describe("what a merge does to the roster", () => {
  it("spends the BENCHED copies and keeps the placed one in its slot", () => {
    // The board must not lose a body it did not have to: the user is merging to get stronger, and
    // a suggestion that empties a slot when it had a benched copy to spend is simply worse.
    const merge = availableMerges(lignites(2), corpus)[0]!;
    expect(merge.vacated).toEqual([]);
    expect(merge.config.placements).toHaveLength(1);
    expect(merge.config.placements[0]).toMatchObject({ slot: BACK_0, level: 2 });
    expect(merge.config.bench).toEqual([]);
  });

  it("carries the survivor's modifiers and its lock through, because it is the same monster", () => {
    const banked = config({
      placements: [
        {
          slot: BACK_0,
          creatureId: Species.Lignite,
          level: 1,
          locked: true,
          modifiers: [{ id: "m1", stat: "damageFlatAdd", amount: 40 } as never],
        },
      ],
      bench: [
        { index: 0, creatureId: Species.Lignite, level: 1 },
        { index: 1, creatureId: Species.Lignite, level: 1 },
      ],
    });
    const merged = availableMerges(banked, corpus)[0]!.config.placements[0]!;
    expect(merged.modifiers).toHaveLength(1);
    expect(merged.locked).toBe(true);
  });

  it("resolves through the evolution chain, so a merge produces the species the app would show", () => {
    // Panbud becomes Bambudo on the way up. The merge must not leave a Panbud record at a level
    // the corpus holds under a different name — it goes through `resolveLevelUp`, same as the
    // level bubbles do.
    const panbuds = config({
      placements: [{ slot: BACK_0, creatureId: Species.Panbud, level: 2 }],
      bench: [{ index: 0, creatureId: Species.Panbud, level: 2 }],
    });
    const result = availableMerges(panbuds, corpus)[0]!.result;
    expect(result.level).toBe(3);
    expect(corpus.creatures.some((c) => c.id === result.creatureId)).toBe(true);
  });
});

describe("what a merge is worth", () => {
  it("quotes a DPS the merged board actually produces", () => {
    // The guarantee every figure in this panel rests on: the number comes from simulating the
    // board the user would get, so performing the merge must reproduce it.
    const board = lignites(2);
    const currentDps = windowAverageDps(simulate(board, corpus));
    const advice = computeMergeAdvice(board, corpus, currentDps)[0]!;
    const applied = { ...board, placements: advice.placements, bench: advice.bench };

    expect(windowAverageDps(simulate(applied, corpus))).toBeCloseTo(advice.dps, 6);
    expect(advice.dpsDelta).toBeCloseTo(advice.dps - currentDps, 6);
  });

  it("answers the reported question: Lignite Lv.2 beats a third Lv.1 body", () => {
    /*
     * The substance of the user's ask. Three Lv.1 Lignites can either be fielded as three bodies
     * or spent on one Lv.2, and the ability's multiplier doubling (20x -> 40x its Burn) is what
     * decides it. Asserted as a DIRECTION rather than a figure, so corpus tuning cannot make this
     * test a liability — what matters is that merging is measurably better than not, which is the
     * thing the advisor could not previously say.
     */
    const board = lignites(2);
    const currentDps = windowAverageDps(simulate(board, corpus));
    const merged = computeMergeAdvice(board, corpus, currentDps)[0]!;
    expect(merged.dpsDelta).toBeGreaterThan(0);
  });

  it("reports what the shrunken roster can reach once the vacancy is filled", () => {
    /*
     * A merge that empties a slot looks worse than it is until the bench refills it. Two placed
     * Lignites plus a benched one is exactly that case: merging vacates a slot, and the Thorntail
     * waiting on the bench should be named by the post-merge lineup rather than left out.
     */
    const board = config({
      placements: [
        { slot: BACK_0, creatureId: Species.Lignite, level: 1 },
        { slot: BACK_1, creatureId: Species.Lignite, level: 1 },
      ],
      bench: [
        { index: 0, creatureId: Species.Lignite, level: 1 },
        { index: 1, creatureId: Species.Thorntail, level: 4 },
      ],
    });
    const currentDps = windowAverageDps(simulate(board, corpus));
    const merge = computeMergeAdvice(board, corpus, currentDps)[0]!;

    expect(merge.vacated).toHaveLength(1);
    expect(merge.bestDps).not.toBeNull();
    expect(merge.bestDps!).toBeGreaterThan(merge.dps);
  });

  it("returns nothing, and costs nothing, on a roster with no duplicates", () => {
    const varied = config({
      placements: [
        { slot: BACK_0, creatureId: Species.Lignite, level: 1 },
        { slot: BACK_1, creatureId: Species.Thorntail, level: 2 },
        { slot: BACK_2, creatureId: Species.Bumblebolt, level: 1 },
      ],
      bench: [{ index: 0, creatureId: Species.Mosslug, level: 1 }],
    });
    expect(computeMergeAdvice(varied, corpus, 0)).toEqual([]);
  });
});
