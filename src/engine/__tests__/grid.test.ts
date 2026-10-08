import { describe, expect, it } from "vitest";
import { isAdjacent, placementKey } from "../grid";
import { resolveEffects } from "../effects";
import { corpus } from "../../data/corpus";
import type { GridSlot, TeamConfiguration } from "../../data/types";
import { GridRow } from "../../data/enums";
import { Species } from "../../data/ids";

/**
 * Board adjacency (2026-10-08, user-reported).
 *
 * `isAdjacent` drives every adjacency effect in the game — Formiqueen's cooldown aura, Petrirex's
 * and Rattleghast's knockouts, Noxnimbus's Poison grant, every `adjacent` selector in
 * `effects.ts` — and until now it had **no test of its own**. It read "same row, neighbouring
 * column", which silently excluded the slot above and below, halving the reach of all of them.
 *
 * The whole 6×6 matrix is asserted rather than a few samples, because the bug was a missing
 * *direction*, not a missing case: any test that happened to pick two same-row slots passed
 * against the broken version, which is exactly what the 460 existing tests did.
 */

const BACK = [0, 1, 2].map((col) => ({ row: GridRow.Back, col }) as GridSlot);
const FRONT = [0, 1, 2].map((col) => ({ row: GridRow.Front, col }) as GridSlot);
const ALL = [...BACK, ...FRONT];
const label = (s: GridSlot) => `${s.row}${s.col}`;

describe("isAdjacent", () => {
  it("is every orthogonal neighbour and nothing else", () => {
    /*
     *   back0 — back1 — back2
     *     |       |       |
     *   front0 —front1 —front2
     *
     * Read off the picture: corners have 2 neighbours, edge-centres have 3, and no slot on a 2x3
     * board has 4. Diagonals and self are excluded.
     */
    const expected: Record<string, string[]> = {
      back0: ["back1", "front0"],
      back1: ["back0", "back2", "front1"],
      back2: ["back1", "front2"],
      front0: ["front1", "back0"],
      front1: ["front0", "front2", "back1"],
      front2: ["front1", "back2"],
    };

    for (const a of ALL) {
      const actual = ALL.filter((b) => isAdjacent(a, b)).map(label).sort();
      expect(actual, `neighbours of ${label(a)}`).toEqual(expected[label(a)]!.sort());
    }
  });

  it("includes the slot directly above and below — the direction that was missing", () => {
    // Called out separately from the matrix above so a regression names the actual fault rather
    // than printing a six-way diff.
    expect(isAdjacent(BACK[1]!, FRONT[1]!)).toBe(true);
    expect(isAdjacent(FRONT[0]!, BACK[0]!)).toBe(true);
  });

  it("excludes diagonals and self", () => {
    expect(isAdjacent(BACK[0]!, FRONT[1]!)).toBe(false);
    expect(isAdjacent(BACK[0]!, BACK[2]!)).toBe(false);
    expect(isAdjacent(BACK[1]!, BACK[1]!)).toBe(false);
  });

  it("is symmetric", () => {
    for (const a of ALL) for (const b of ALL) expect(isAdjacent(a, b)).toBe(isAdjacent(b, a));
  });
});

describe("adjacency reaches the resolver, not just the helper", () => {
  const team = (placements: { id: Species; slot: GridSlot }[]): TeamConfiguration => ({
    placements: placements.map((p) => ({ slot: p.slot, creatureId: p.id, level: 1 })),
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: 20,
    teamModifiers: [],
  });

  it("knocks out the ally in the slot BELOW, not only the ones beside", () => {
    // The end-to-end form of the fix: Rattleghast's "Knockout adjacent allies" now reaches
    // front-centre. Under the same-row reading this creature survived untouched.
    const resolved = resolveEffects(
      team([
        { id: Species.Rattleghast, slot: BACK[1]! },
        { id: Species.Bumblebolt, slot: FRONT[1]! },
      ]),
      corpus,
    );
    expect(resolved.map((r) => r.key)).toEqual([placementKey(Species.Rattleghast, BACK[1]!)]);
  });

  it("still spares a diagonal ally", () => {
    const resolved = resolveEffects(
      team([
        { id: Species.Rattleghast, slot: BACK[0]! },
        { id: Species.Bumblebolt, slot: FRONT[1]! },
      ]),
      corpus,
    );
    expect(resolved).toHaveLength(2);
  });
});
