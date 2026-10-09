import { describe, expect, it } from "vitest";
import { aboveSlot, adjacentUnder, behindSlot, inFrontSlot, isAdjacent } from "../grid";
import { selectTargets } from "../effects";
import { getCreatureByIdAndLevel } from "../../data/corpus";
import { GridRow, TargetKind } from "../../data/enums";
import { Species, TrinketId } from "../../data/ids";
import type { GridCol, GridSlot } from "../../data/types";

const top = (col: GridCol): GridSlot => ({ row: GridRow.Top, col });
const bottom = (col: GridCol): GridSlot => ({ row: GridRow.Bottom, col });

/**
 * 2026-10-09, user-reported: "'in front' means to the column to the right of the present mon".
 *
 * Every directional selector was wrong, and the ROW NAMES are why. With rows called `Back` and
 * `Front`, "the ally in front" reads as "the ally in the front row" and that is what the engine
 * computed — for Zephyrex, Saberhorn, Onsetra, Dracana, Boomagon, Pylong and Blixie alike.
 * `behindSlot` and `aboveSlot` had even converged on an identical body. The rows are `Top` and
 * `Bottom` now so there is no row whose name is also a direction.
 */
describe("board geometry", () => {
  describe("in front — one column RIGHT, same row", () => {
    it("points right", () => {
      expect(inFrontSlot(top(0))).toEqual(top(1));
      expect(inFrontSlot(bottom(1))).toEqual(bottom(2));
    });

    it("stops at the rightmost column rather than wrapping to the other row", () => {
      expect(inFrontSlot(top(2))).toBeNull();
      expect(inFrontSlot(bottom(2))).toBeNull();
    });
  });

  describe("behind — one column LEFT, same row", () => {
    it("points left", () => {
      expect(behindSlot(top(2))).toEqual(top(1));
      expect(behindSlot(bottom(1))).toEqual(bottom(0));
    });

    it("stops at the leftmost column", () => {
      expect(behindSlot(top(0))).toBeNull();
      expect(behindSlot(bottom(0))).toBeNull();
    });

    it("is the exact mirror of 'in front', which it was not before", () => {
      // The two were unrelated: `behind` returned the back row and `inFront` the front row, so
      // neither was the other's inverse and a pair of them could both fire on the same two slots.
      for (const col of [0, 1, 2] as GridCol[]) {
        for (const row of [GridRow.Top, GridRow.Bottom]) {
          const here = { row, col };
          const ahead = inFrontSlot(here);
          if (ahead) expect(behindSlot(ahead)).toEqual(here);
        }
      }
    });
  });

  describe("above — same column, top row", () => {
    it("reaches the top row from the bottom row", () => {
      expect(aboveSlot(bottom(1))).toEqual(top(1));
    });

    it("is moot from the top row, which has nothing above it", () => {
      // The user's words: a monster with "above" in the top row "will be pointing to an index
      // that doesn't exist and will be made moot".
      expect(aboveSlot(top(1))).toBeNull();
    });

    it("is no longer the same function as 'behind'", () => {
      // They were byte-identical. A regression here would mean the vocabulary had collapsed again.
      expect(aboveSlot(bottom(1))).not.toEqual(behindSlot(bottom(1)));
    });
  });

  /**
   * Link Cable: "All of your team's monsters are now considered adjacent to each other."
   *
   * Nothing read it, so the placement advisor listed it among the effects it cannot model. It is
   * the most consequential trinket this engine has, because it widens every adjacency effect on
   * the board at once.
   */
  describe("Link Cable's universal adjacency", () => {
    const far = [top(0), bottom(2)] as const;

    it("makes two opposite corners adjacent", () => {
      expect(isAdjacent(...far)).toBe(false);
      expect(adjacentUnder({ trinketIds: [] }, ...far)).toBe(false);
      expect(adjacentUnder({ trinketIds: [TrinketId.LinkCable] }, ...far)).toBe(true);
    });

    it("never makes a monster adjacent to itself", () => {
      // Every ally selector excludes the source, and a trinket must not be the thing that
      // reintroduces self-targeting through the back door.
      expect(adjacentUnder({ trinketIds: [TrinketId.LinkCable] }, top(1), top(1))).toBe(false);
    });

    it("widens an adjacency selector across the whole board", () => {
      const member = (id: Species, slot: GridSlot) => ({
        slot,
        key: `${id}@${slot.row}${slot.col}`,
        creature: getCreatureByIdAndLevel(id, 1)!,
      });
      const source = member(Species.Formiqueen, top(0));
      const distant = member(Species.Bumblebolt, bottom(2));
      const all = [source, distant];
      const selector = { kind: TargetKind.Adjacent } as const;

      expect(selectTargets(selector, source, all, { trinketIds: [] })).toHaveLength(0);
      expect(
        selectTargets(selector, source, all, { trinketIds: [TrinketId.LinkCable] }),
      ).toHaveLength(1);
    });
  });
});
