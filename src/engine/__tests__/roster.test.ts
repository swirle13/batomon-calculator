import { describe, expect, it } from "vitest";
import { benchRef, gridRef, moveRoster, rosterMemberAt, rosterRefsEqual } from "../roster";
import type { StatModifier, TeamConfiguration } from "../../data/types";
import { GridRow, ModifierScope, ModifierStat } from "../../data/enums";
import { Species } from "../../data/ids";

/**
 * Moving a monster between the board and the bench (2026-10-08).
 *
 * The rule under test is the one the placement advisor also applies when it costs a hypothetical
 * swap — see `engine/roster.ts` for why the two must not be separate implementations. These tests
 * are therefore load-bearing for the ADVICE as well as for dragging: if a modifier ends up
 * somewhere else here, the advisor quotes a DPS the board does not produce.
 */

const BACK_0 = { row: GridRow.Top, col: 0 } as const;
const BACK_1 = { row: GridRow.Top, col: 1 } as const;

function creatureMod(amount: number): StatModifier {
  return { id: `c${amount}`, stat: ModifierStat.DamageFlatAdd, amount, scope: ModifierScope.Creature };
}

function slotMod(amount: number): StatModifier {
  return { id: `s${amount}`, stat: ModifierStat.DamageFlatAdd, amount, scope: ModifierScope.Slot };
}

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

describe("moveRoster", () => {
  it("moves a placed monster to an empty bench position, keeping its own modifiers", () => {
    const before = config({
      placements: [
        { slot: BACK_0, creatureId: Species.Bumblebolt, level: 2, shiny: true, modifiers: [creatureMod(10)] },
      ],
    });

    const after = moveRoster(before, gridRef(BACK_0), benchRef(0));

    expect(after.placements).toEqual([]);
    expect(after.bench).toEqual([
      { index: 0, creatureId: Species.Bumblebolt, level: 2, shiny: true, modifiers: [creatureMod(10)] },
    ]);
  });

  it("drops a slot-scoped modifier on the way to the bench, because the bench owns no positions", () => {
    // The user's own framing: a benched monster is out of the fight, so a bonus attached to where
    // it used to stand cannot travel with it. The creature-scoped half does.
    const before = config({
      placements: [
        { slot: BACK_0, creatureId: Species.Bumblebolt, level: 1, modifiers: [creatureMod(10), slotMod(99)] },
      ],
    });

    const after = moveRoster(before, gridRef(BACK_0), benchRef(1));

    expect(after.bench?.[0]?.modifiers).toEqual([creatureMod(10)]);
  });

  it("gives a monster coming off the bench the destination slot's slot-scoped modifiers", () => {
    const before = config({
      placements: [
        { slot: BACK_0, creatureId: Species.Formiqueen, level: 1, modifiers: [creatureMod(5), slotMod(99)] },
      ],
      bench: [{ index: 0, creatureId: Species.Bumblebolt, level: 3, modifiers: [creatureMod(10)] }],
    });

    const after = moveRoster(before, benchRef(0), gridRef(BACK_0));

    // The newcomer brings its own +10 and inherits the position's +99.
    expect(rosterMemberAt(after, gridRef(BACK_0))).toMatchObject({
      creatureId: Species.Bumblebolt,
      level: 3,
      modifiers: [creatureMod(10), slotMod(99)],
    });
    // The displaced monster keeps only what was its own: the +99 belonged to the slot.
    expect(after.bench).toEqual([
      { index: 0, creatureId: Species.Formiqueen, level: 1, modifiers: [creatureMod(5)] },
    ]);
  });

  it("swaps rather than overwrites, so no monster is destroyed by a drag", () => {
    const before = config({
      placements: [{ slot: BACK_0, creatureId: Species.Formiqueen, level: 1 }],
      bench: [{ index: 2, creatureId: Species.Bumblebolt, level: 1 }],
    });

    const after = moveRoster(before, benchRef(2), gridRef(BACK_0));

    expect(after.placements).toHaveLength(1);
    expect(after.placements[0]?.creatureId).toBe(Species.Bumblebolt);
    expect(after.bench).toEqual([{ index: 2, creatureId: Species.Formiqueen, level: 1, modifiers: undefined }]);
  });

  it("is a no-op when the source is empty or the two positions are the same", () => {
    const before = config({ placements: [{ slot: BACK_0, creatureId: Species.Bumblebolt, level: 1 }] });

    expect(moveRoster(before, benchRef(3), gridRef(BACK_1))).toBe(before);
    expect(moveRoster(before, gridRef(BACK_0), gridRef(BACK_0))).toBe(before);
  });

  it("still swaps grid-to-grid, which is the case that existed before the bench", () => {
    const before = config({
      placements: [
        { slot: BACK_0, creatureId: Species.Formiqueen, level: 1 },
        { slot: BACK_1, creatureId: Species.Bumblebolt, level: 2 },
      ],
    });

    const after = moveRoster(before, gridRef(BACK_0), gridRef(BACK_1));

    expect(rosterMemberAt(after, gridRef(BACK_1))?.creatureId).toBe(Species.Formiqueen);
    expect(rosterMemberAt(after, gridRef(BACK_0))?.creatureId).toBe(Species.Bumblebolt);
    // Each side keeps its OWN level through the swap.
    expect(rosterMemberAt(after, gridRef(BACK_0))?.level).toBe(2);
  });
});

describe("rosterRefsEqual", () => {
  it("never equates a grid slot with a bench position", () => {
    expect(rosterRefsEqual(gridRef(BACK_0), benchRef(0))).toBe(false);
    expect(rosterRefsEqual(benchRef(0), benchRef(0))).toBe(true);
    expect(rosterRefsEqual(gridRef(BACK_0), gridRef({ row: GridRow.Top, col: 0 }))).toBe(true);
  });
});
