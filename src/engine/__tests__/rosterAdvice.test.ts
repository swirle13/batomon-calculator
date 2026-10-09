import { describe, expect, it } from "vitest";
import { computeBenchAdvice } from "../rosterAdvice";
import { scoreConfiguration } from "../optimize";
import { simulate, windowAverageDps } from "../simulate";
import { corpus } from "../../data/corpus";
import type { TeamConfiguration } from "../../data/types";
import { GridRow } from "../../data/enums";
import { Species } from "../../data/ids";

/**
 * The bench advisor (2026-10-08, user-requested).
 *
 * Two properties carry the whole feature and are tested first: a benched monster must change
 * nothing about the current board, and a fielded one must be simulated with everything it brings.
 * The user named the second explicitly as the wrinkle to solve — advice that silently ignored a
 * candidate's positional ability would be worse than no advice, because it would look confident.
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

function advise(cfg: TeamConfiguration) {
  const dps = windowAverageDps(simulate(cfg, corpus));
  return { dps, advice: computeBenchAdvice(cfg, corpus, scoreConfiguration(cfg, corpus), dps) };
}

describe("the bench is inert", () => {
  it("changes nothing about the simulated board, however strong the benched monster is", () => {
    const board = config({
      placements: [
        { slot: BACK_0, creatureId: Species.Bumblebolt, level: 1 },
        { slot: BACK_1, creatureId: Species.Bumblebolt, level: 1 },
      ],
    });
    // Level 4 Thorntail is among the heaviest hitters in the corpus. Parking it must not move
    // the needle by a single point — `simulate()` never reads `config.bench`.
    const withBench = { ...board, bench: [{ index: 0 as const, creatureId: Species.Thorntail, level: 4 as const }] };

    expect(windowAverageDps(simulate(withBench, corpus))).toBe(windowAverageDps(simulate(board, corpus)));
  });

  it("returns no advice at all when nothing is benched, so an unused bench costs nothing", () => {
    const board = config({ placements: [{ slot: BACK_0, creatureId: Species.Bumblebolt, level: 1 }] });
    expect(computeBenchAdvice(board, corpus, 0, 0)).toBeNull();
  });
});

/** Six of one species, which is what forces a candidate to displace somebody rather than add. */
function fullBoardOf(creatureId: Species, level: 1 | 2 | 3 | 4) {
  return [GridRow.Top, GridRow.Bottom].flatMap((row) =>
    ([0, 1, 2] as const).map((col) => ({ slot: { row, col }, creatureId, level })),
  );
}

describe("ranked swaps", () => {
  const board = config({
    placements: [
      { slot: BACK_0, creatureId: Species.Bumblebolt, level: 1 },
      { slot: BACK_1, creatureId: Species.Bumblebolt, level: 1 },
    ],
    bench: [
      { index: 0, creatureId: Species.Thorntail, level: 4 },
      { index: 1, creatureId: Species.Bumblebolt, level: 1 },
    ],
  });

  it("gives every benched monster a row, ranked by what it gains", () => {
    const { advice } = advise(board);
    expect(advice?.swaps.map((s) => s.name)).toEqual(["Thorntail Lv.4", "Bumblebolt Lv.1"]);
    // Ranked, not merely listed.
    expect(advice!.swaps[0]!.dpsDelta).toBeGreaterThanOrEqual(advice!.swaps[1]!.dpsDelta);
  });

  it("names who a candidate displaces once the board is full", () => {
    const full = config({
      placements: fullBoardOf(Species.Bumblebolt, 1),
      bench: [{ index: 0, creatureId: Species.Thorntail, level: 4 }],
    });
    const thorntail = advise(full).advice!.swaps[0]!;
    expect(thorntail.dpsDelta).toBeGreaterThan(0);
    expect(thorntail.replaces).toBe("Bumblebolt Lv.1");
  });

  it("fills an empty slot rather than displacing anyone when the board has room", () => {
    // Swapping into a vacancy is strictly additive, so it is always the better move and the
    // search should find it without being told.
    const roomy = config({
      placements: [{ slot: BACK_0, creatureId: Species.Bumblebolt, level: 1 }],
      bench: [{ index: 0, creatureId: Species.Thorntail, level: 4 }],
    });
    const { advice } = advise(roomy);
    expect(advice!.swaps[0]!.replaces).toBeNull();
  });

  it("reports a LOSS as a loss rather than omitting the row", () => {
    // "Do not buy this" is an answer. A missing row would read as a missing result.
    //
    // The board has to be FULL for this to be a loss at all: with a slot free, bringing anybody
    // on is additive, and the advisor correctly says so rather than inventing a displacement.
    const strongBoard = config({
      placements: fullBoardOf(Species.Thorntail, 4),
      bench: [{ index: 0, creatureId: Species.Bumblebolt, level: 1 }],
    });
    const { advice } = advise(strongBoard);
    expect(advice!.swaps).toHaveLength(1);
    expect(advice!.swaps[0]!.dpsDelta).toBeLessThan(0);
  });

  it("quotes a resulting DPS that the swapped board actually produces", () => {
    // The guarantee the whole feature rests on: the figure comes from simulating the board the
    // user would get, so performing the swap must reproduce it exactly.
    const { advice } = advise(board);
    const swap = advice!.swaps[0]!;
    const performed = config({
      placements: [
        ...board.placements.filter((p) => p.slot.col !== swap.slot.col || p.slot.row !== swap.slot.row),
        { slot: swap.slot, creatureId: Species.Thorntail, level: 4, modifiers: undefined },
      ],
    });
    expect(windowAverageDps(simulate(performed, corpus))).toBeCloseTo(swap.dps, 6);
  });
});

describe("positional abilities of a benched candidate", () => {
  it("counts an adjacency aura the candidate would provide once it is fielded", () => {
    /*
     * The user's wrinkle, stated directly. Formiqueen buffs ADJACENT Common allies, and
     * Bumblebolt is Common. Benched, Formiqueen does nothing. Fielded it speeds its neighbours
     * up — and the advisor has to see that, because it is the entire reason a positional monster
     * is worth bringing on.
     *
     * Nothing special makes this work: the candidate board is a real `TeamConfiguration` and the
     * figure comes from `simulate()`, the same function the live board uses.
     *
     * A FULL board, so the choice of slot is a choice about adjacency and nothing else. Adjacency
     * is cardinal — the slot above and below count (see `engine/grid.ts`) — so a centre slot
     * reaches three allies where a corner reaches two, and picking the centre is only possible if
     * the aura was actually simulated.
     */
    const board = config({
      placements: fullBoardOf(Species.Bumblebolt, 1),
      bench: [{ index: 0, creatureId: Species.Formiqueen, level: 1 }],
    });

    const formiqueen = advise(board).advice!.swaps[0]!;
    expect(formiqueen.slot.col).toBe(1);
  });
});

describe("best lineup", () => {
  it("brings a stronger benched monster on and sends the weaker placed one off", () => {
    const board = config({
      placements: [
        { slot: BACK_0, creatureId: Species.Bumblebolt, level: 1 },
        { slot: BACK_1, creatureId: Species.Bumblebolt, level: 1 },
      ],
      bench: [{ index: 0, creatureId: Species.Thorntail, level: 4 }],
    });

    const { advice } = advise(board);
    const lineup = advice!.lineup!;
    expect(lineup.bringIn.map((b) => b.name)).toEqual(["Thorntail Lv.4"]);
    // Three monsters, two slots occupied and one free: the lineup fills the vacancy rather than
    // benching anybody, because more monsters is more damage.
    expect(lineup.sendOut).toEqual([]);
    expect(lineup.placements).toHaveLength(3);
  });

  it("produces a board whose DPS is the one it quotes, and an improvement on the current one", () => {
    const board = config({
      placements: [
        { slot: BACK_0, creatureId: Species.Bumblebolt, level: 1 },
        { slot: BACK_1, creatureId: Species.Bumblebolt, level: 1 },
      ],
      bench: [{ index: 0, creatureId: Species.Thorntail, level: 4 }],
    });

    const { dps, advice } = advise(board);
    const lineup = advice!.lineup!;
    const applied = { ...board, placements: lineup.placements, bench: lineup.bench };
    expect(windowAverageDps(simulate(applied, corpus))).toBeCloseTo(lineup.dps, 6);
    expect(lineup.dps).toBeGreaterThan(dps);
  });

  it("returns no lineup when the board already fields the best it can", () => {
    const board = config({
      placements: [
        { slot: BACK_0, creatureId: Species.Thorntail, level: 4 },
        { slot: BACK_1, creatureId: Species.Thorntail, level: 4 },
        { slot: BACK_2, creatureId: Species.Thorntail, level: 4 },
        { slot: { row: GridRow.Bottom, col: 0 }, creatureId: Species.Thorntail, level: 4 },
        { slot: { row: GridRow.Bottom, col: 1 }, creatureId: Species.Thorntail, level: 4 },
        { slot: { row: GridRow.Bottom, col: 2 }, creatureId: Species.Thorntail, level: 4 },
      ],
      bench: [{ index: 0, creatureId: Species.Bumblebolt, level: 1 }],
    });
    expect(advise(board).advice!.lineup).toBeNull();
  });

  it("advises on an empty board, where every candidate is purely additive", () => {
    // Reachable: the bench is filled from the same picker the grid is, so a user can stock
    // candidates before placing anything. The current board scores zero and nothing is displaced,
    // which is the degenerate end of every calculation here.
    const nothingPlaced = config({
      bench: [
        { index: 0, creatureId: Species.Thorntail, level: 4 },
        { index: 1, creatureId: Species.Bumblebolt, level: 1 },
      ],
    });

    const { advice } = advise(nothingPlaced);
    expect(advice!.swaps).toHaveLength(2);
    expect(advice!.swaps.every((s) => s.replaces === null)).toBe(true);
    expect(advice!.lineup?.placements).toHaveLength(2);
    expect(advice!.lineup?.sendOut).toEqual([]);
  });

  it("stays inside its simulation budget on a full roster", () => {
    /*
     * The reason the search is two-stage. Exhausting selection AND arrangement over a six-strong
     * board and a four-strong bench is P(10,6) = 151,200 boards; this bounds what the split
     * actually costs, so a future "just make it exhaustive" change fails here rather than in the
     * user's browser. See `engine/rosterAdvice.ts` for the full arithmetic.
     */
    const full = config({
      placements: [
        { slot: BACK_0, creatureId: Species.Bumblebolt, level: 1 },
        { slot: BACK_1, creatureId: Species.Formiqueen, level: 1 },
        { slot: BACK_2, creatureId: Species.Onsetra, level: 1 },
        { slot: { row: GridRow.Bottom, col: 0 }, creatureId: Species.Thorntail, level: 2 },
        { slot: { row: GridRow.Bottom, col: 1 }, creatureId: Species.Mosslug, level: 1 },
        { slot: { row: GridRow.Bottom, col: 2 }, creatureId: Species.Bumblebolt, level: 2 },
      ],
      bench: [
        { index: 0, creatureId: Species.Thorntail, level: 4 },
        { index: 1, creatureId: Species.Mosslug, level: 3 },
        { index: 2, creatureId: Species.Formiqueen, level: 2 },
        { index: 3, creatureId: Species.Onsetra, level: 2 },
      ],
    });

    const { advice } = advise(full);
    expect(advice!.swaps).toHaveLength(4);
    // 210 selections + 3 finalists x 720 arrangements, with headroom for the constants moving.
    expect(advice!.lineup?.evaluated ?? 0).toBeLessThan(3000);
  });
});

/**
 * Locked monsters (2026-10-09, user-reported).
 *
 * The reported board is reproduced in miniature: a weak monster held deliberately — Ignit is kept
 * through two victories to reach its final form — on a board with a strong candidate benched. Every
 * answer the advisor had was "bench the weak one", which is right about the fight and useless to a
 * user who cannot act on it, and it crowded out the swap they could have made.
 */
describe("a locked monster stays on the board", () => {
  /** A full board of Thorntails with one slot given to a monster the user is holding. */
  function heldBoard(locked: boolean) {
    const [held, ...rest] = fullBoardOf(Species.Thorntail, 4);
    return config({
      placements: [{ ...held!, creatureId: Species.Bumblebolt, level: 1, ...(locked ? { locked: true } : {}) }, ...rest],
      bench: [{ index: 0, creatureId: Species.Thorntail, level: 4 }],
    });
  }

  it("is the swap the advisor makes when it is NOT locked", () => {
    // The control. Without a lock the weak monster is exactly what a candidate should displace,
    // and the test below is only meaningful because this is what it changes.
    const swap = advise(heldBoard(false)).advice!.swaps[0]!;
    expect(swap.replaces).toBe("Bumblebolt Lv.1");
  });

  it("is never the monster a bench candidate is offered", () => {
    const { advice } = advise(heldBoard(true));
    // A row is still produced — "nothing here beats what you have" is an answer — it just names a
    // slot the user can actually give up.
    expect(advice!.swaps[0]!.replaces).not.toBe("Bumblebolt Lv.1");
    expect(advice!.locked).toEqual(["Bumblebolt Lv.1"]);
  });

  it("is kept by the best lineup, which then has to find its gain elsewhere", () => {
    const board = config({
      placements: [
        { slot: BACK_0, creatureId: Species.Bumblebolt, level: 1, locked: true },
        { slot: BACK_1, creatureId: Species.Bumblebolt, level: 1 },
      ],
      bench: [
        { index: 0, creatureId: Species.Thorntail, level: 4 },
        { index: 1, creatureId: Species.Thorntail, level: 4 },
      ],
    });

    const lineup = advise(board).advice!.lineup!;
    expect(lineup.sendOut).not.toContain("Bumblebolt Lv.1");
    // And it is still ON the suggested board, carrying its lock, so applying the lineup does not
    // silently unlock it.
    const kept = lineup.placements.find((p) => p.creatureId === Species.Bumblebolt);
    expect(kept?.locked).toBe(true);
  });

  it("costs fewer simulations, not more — the lock removes selections from the search", () => {
    const roster = {
      placements: fullBoardOf(Species.Bumblebolt, 1),
      bench: [
        { index: 0 as const, creatureId: Species.Thorntail, level: 4 as const },
        { index: 1 as const, creatureId: Species.Thorntail, level: 2 as const },
      ],
    };
    const unlocked = advise(config(roster)).advice!.lineup!.evaluated;
    const locked = advise(
      config({ ...roster, placements: roster.placements.map((p, i) => (i === 0 ? { ...p, locked: true } : p)) }),
    ).advice!.lineup!.evaluated;
    expect(locked).toBeLessThan(unlocked);
  });
});
