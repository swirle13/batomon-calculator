import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { TeamConfigProvider, useTeamConfig } from "../TeamConfigContext";
import { GridRow, ModifierStat } from "../../data/enums";
import { Species } from "../../data/ids";

/**
 * `movePlacement` (2026-10-05 round 3, data-model.md's "Drag-and-drop placement editing"
 * amendment, FR-019): dropping onto an empty slot moves; dropping onto an occupied slot swaps,
 * and crucially each placement keeps its OWN level and modifiers -- unlike `setPlacement`,
 * which always creates a fresh `TeamPlacement` with no `modifiers`.
 */
describe("TeamConfigContext.movePlacement", () => {
  it("moves a placement into an empty slot, preserving its level and modifiers", () => {
    const { result } = renderHook(() => useTeamConfig(), { wrapper: TeamConfigProvider });

    act(() => result.current.setPlacement({ row: GridRow.Front, col: 0 }, Species.Bumblebolt, 2));
    act(() =>
      result.current.addPlacementModifier({ row: GridRow.Front, col: 0 }, { stat: ModifierStat.DamageFlatAdd, amount: 7 }),
    );
    act(() => result.current.movePlacement({ row: GridRow.Front, col: 0 }, { row: GridRow.Back, col: 1 }));

    const placements = result.current.config.placements;
    expect(placements).toHaveLength(1);
    const moved = placements[0]!;
    expect(moved.slot).toEqual({ row: GridRow.Back, col: 1 });
    expect(moved.creatureId).toBe("bumblebolt");
    expect(moved.level).toBe(2);
    expect(moved.modifiers).toHaveLength(1);
    expect(moved.modifiers![0]!.amount).toBe(7);
  });

  it("swaps two placements onto each other's slots, each keeping its own level and modifiers", () => {
    const { result } = renderHook(() => useTeamConfig(), { wrapper: TeamConfigProvider });

    act(() => result.current.setPlacement({ row: GridRow.Front, col: 0 }, Species.Bumblebolt, 1));
    act(() =>
      result.current.addPlacementModifier({ row: GridRow.Front, col: 0 }, { stat: ModifierStat.DamageFlatAdd, amount: 5 }),
    );
    act(() => result.current.setPlacement({ row: GridRow.Front, col: 1 }, Species.Scorchimp, 1));
    act(() =>
      result.current.addPlacementModifier({ row: GridRow.Front, col: 1 }, { stat: ModifierStat.BurnAmountAdd, amount: 2 }),
    );

    act(() => result.current.movePlacement({ row: GridRow.Front, col: 0 }, { row: GridRow.Front, col: 1 }));

    const placements = result.current.config.placements;
    expect(placements).toHaveLength(2);

    const nowAtCol0 = placements.find((p) => p.slot.row === GridRow.Front && p.slot.col === 0)!;
    const nowAtCol1 = placements.find((p) => p.slot.row === GridRow.Front && p.slot.col === 1)!;

    expect(nowAtCol0.creatureId).toBe("scorchimp");
    expect(nowAtCol0.modifiers![0]!.stat).toBe("burnAmountAdd");

    expect(nowAtCol1.creatureId).toBe("bumblebolt");
    expect(nowAtCol1.modifiers![0]!.stat).toBe("damageFlatAdd");
  });

  it("is a no-op when the source slot has no placement", () => {
    const { result } = renderHook(() => useTeamConfig(), { wrapper: TeamConfigProvider });
    act(() => result.current.movePlacement({ row: GridRow.Front, col: 0 }, { row: GridRow.Back, col: 2 }));
    expect(result.current.config.placements).toHaveLength(0);
  });

  it("is a no-op when the source and destination slots are the same", () => {
    const { result } = renderHook(() => useTeamConfig(), { wrapper: TeamConfigProvider });
    act(() => result.current.setPlacement({ row: GridRow.Front, col: 0 }, Species.Bumblebolt, 1));
    act(() => result.current.movePlacement({ row: GridRow.Front, col: 0 }, { row: GridRow.Front, col: 0 }));
    expect(result.current.config.placements).toHaveLength(1);
    expect(result.current.config.placements[0]!.creatureId).toBe("bumblebolt");
  });
});
