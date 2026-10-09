import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { TeamConfigProvider } from "../TeamConfigContext";
import { useTeamConfig } from "../teamConfig";
import { GridRow, ModifierScope, ModifierStat } from "../../data/enums";
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

    act(() => result.current.setPlacement({ row: GridRow.Bottom, col: 0 }, Species.Bumblebolt, 2));
    act(() =>
      result.current.addPlacementModifier({ row: GridRow.Bottom, col: 0 }, { stat: ModifierStat.DamageFlatAdd, amount: 7 }),
    );
    act(() => result.current.movePlacement({ row: GridRow.Bottom, col: 0 }, { row: GridRow.Top, col: 1 }));

    const placements = result.current.config.placements;
    expect(placements).toHaveLength(1);
    const moved = placements[0]!;
    expect(moved.slot).toEqual({ row: GridRow.Top, col: 1 });
    expect(moved.creatureId).toBe("bumblebolt");
    expect(moved.level).toBe(2);
    expect(moved.modifiers).toHaveLength(1);
    expect(moved.modifiers![0]!.amount).toBe(7);
  });

  it("swaps two placements onto each other's slots, each keeping its own level and modifiers", () => {
    const { result } = renderHook(() => useTeamConfig(), { wrapper: TeamConfigProvider });

    act(() => result.current.setPlacement({ row: GridRow.Bottom, col: 0 }, Species.Bumblebolt, 1));
    act(() =>
      result.current.addPlacementModifier({ row: GridRow.Bottom, col: 0 }, { stat: ModifierStat.DamageFlatAdd, amount: 5 }),
    );
    act(() => result.current.setPlacement({ row: GridRow.Bottom, col: 1 }, Species.Scorchimp, 1));
    act(() =>
      result.current.addPlacementModifier({ row: GridRow.Bottom, col: 1 }, { stat: ModifierStat.BurnAmountAdd, amount: 2 }),
    );

    act(() => result.current.movePlacement({ row: GridRow.Bottom, col: 0 }, { row: GridRow.Bottom, col: 1 }));

    const placements = result.current.config.placements;
    expect(placements).toHaveLength(2);

    const nowAtCol0 = placements.find((p) => p.slot.row === GridRow.Bottom && p.slot.col === 0)!;
    const nowAtCol1 = placements.find((p) => p.slot.row === GridRow.Bottom && p.slot.col === 1)!;

    expect(nowAtCol0.creatureId).toBe("scorchimp");
    expect(nowAtCol0.modifiers![0]!.stat).toBe("burnAmountAdd");

    expect(nowAtCol1.creatureId).toBe("bumblebolt");
    expect(nowAtCol1.modifiers![0]!.stat).toBe("damageFlatAdd");
  });

  it("is a no-op when the source slot has no placement", () => {
    const { result } = renderHook(() => useTeamConfig(), { wrapper: TeamConfigProvider });
    act(() => result.current.movePlacement({ row: GridRow.Bottom, col: 0 }, { row: GridRow.Top, col: 2 }));
    expect(result.current.config.placements).toHaveLength(0);
  });

  it("is a no-op when the source and destination slots are the same", () => {
    const { result } = renderHook(() => useTeamConfig(), { wrapper: TeamConfigProvider });
    act(() => result.current.setPlacement({ row: GridRow.Bottom, col: 0 }, Species.Bumblebolt, 1));
    act(() => result.current.movePlacement({ row: GridRow.Bottom, col: 0 }, { row: GridRow.Bottom, col: 0 }));
    expect(result.current.config.placements).toHaveLength(1);
    expect(result.current.config.placements[0]!.creatureId).toBe("bumblebolt");
  });

  it("leaves a slot-scoped modifier behind and hands it to whatever swaps in", () => {
    const { result } = renderHook(() => useTeamConfig(), { wrapper: TeamConfigProvider });
    const col0 = { row: GridRow.Bottom, col: 0 } as const;
    const col1 = { row: GridRow.Bottom, col: 1 } as const;

    act(() => result.current.setPlacement(col0, Species.Bumblebolt, 1));
    act(() => result.current.setPlacement(col1, Species.Scorchimp, 1));
    act(() =>
      result.current.addPlacementModifier(col0, {
        stat: ModifierStat.DamageFlatAdd,
        amount: 5,
        scope: ModifierScope.Creature,
      }),
    );
    act(() =>
      result.current.addPlacementModifier(col0, {
        stat: ModifierStat.ShieldAmountAdd,
        amount: 9,
        scope: ModifierScope.Slot,
      }),
    );

    act(() => result.current.movePlacement(col0, col1));

    const placements = result.current.config.placements;
    const nowAtCol0 = placements.find((p) => p.slot.col === 0)!;
    const nowAtCol1 = placements.find((p) => p.slot.col === 1)!;

    expect(nowAtCol1.creatureId).toBe("bumblebolt");
    expect(nowAtCol1.modifiers!.map((m) => m.stat)).toEqual([ModifierStat.DamageFlatAdd]);
    expect(nowAtCol0.creatureId).toBe("scorchimp");
    expect(nowAtCol0.modifiers!.map((m) => m.stat)).toEqual([ModifierStat.ShieldAmountAdd]);
  });
});

/**
 * Modifier scope on replacement (2026-10-08, user-reported).
 *
 * A Craghorn that had banked "+20 Damage and Shield" twice was sold, and the +40s stayed in the
 * slot for the monster bought to replace it — the ability says "**this** gains", so the bonus was
 * the monster's and the slot had no claim on it.
 */
describe("TeamConfigContext.setPlacement — what survives a new monster", () => {
  const slot = { row: GridRow.Bottom, col: 0 } as const;

  function placedWithBankedPress() {
    const { result } = renderHook(() => useTeamConfig(), { wrapper: TeamConfigProvider });
    act(() => result.current.setPlacement(slot, Species.Craghorn, 1));
    act(() =>
      result.current.addPlacementModifier(slot, {
        stat: ModifierStat.DamageFlatAdd,
        amount: 40,
        scope: ModifierScope.Creature,
      }),
    );
    return result;
  }

  it("discards the sold monster's own bonuses when a different species takes the slot", () => {
    const result = placedWithBankedPress();
    act(() => result.current.setPlacement(slot, Species.Scorchimp, 1));

    const placement = result.current.config.placements[0]!;
    expect(placement.creatureId).toBe("scorchimp");
    expect(placement.modifiers ?? []).toEqual([]);
  });

  it("keeps a slot-scoped bonus for the replacement, because that one is the position's", () => {
    const result = placedWithBankedPress();
    act(() =>
      result.current.addPlacementModifier(slot, {
        stat: ModifierStat.ShieldAmountAdd,
        amount: 9,
        scope: ModifierScope.Slot,
      }),
    );
    act(() => result.current.setPlacement(slot, Species.Scorchimp, 1));

    const placement = result.current.config.placements[0]!;
    expect(placement.modifiers!.map((m) => m.stat)).toEqual([ModifierStat.ShieldAmountAdd]);
  });

  it("keeps everything when the SAME monster changes level, including through an evolution", () => {
    const { result } = renderHook(() => useTeamConfig(), { wrapper: TeamConfigProvider });
    act(() => result.current.setPlacement(slot, Species.Scorchimp, 1));
    act(() =>
      result.current.addPlacementModifier(slot, {
        stat: ModifierStat.DamageFlatAdd,
        amount: 40,
        scope: ModifierScope.Creature,
      }),
    );

    // The level bubbles resolve the evolution before calling, so Lv.3 Scorchimp arrives here as
    // Sunsage — a different species id for the same monster, which must keep its carry-over.
    act(() => result.current.setPlacement(slot, Species.Sunsage, 3));

    const placement = result.current.config.placements[0]!;
    expect(placement.creatureId).toBe("sunsage");
    expect(placement.modifiers!.map((m) => m.amount)).toEqual([40]);
  });

  it("accumulates onto the matching scope rather than merging the two", () => {
    const { result } = renderHook(() => useTeamConfig(), { wrapper: TeamConfigProvider });
    act(() => result.current.setPlacement(slot, Species.Craghorn, 1));
    act(() => result.current.addPlacementModifier(slot, { stat: ModifierStat.DamageFlatAdd, amount: 20, scope: ModifierScope.Creature }));
    act(() => result.current.addPlacementModifier(slot, { stat: ModifierStat.DamageFlatAdd, amount: 7, scope: ModifierScope.Slot }));
    act(() => result.current.addPlacementModifier(slot, { stat: ModifierStat.DamageFlatAdd, amount: 20, scope: ModifierScope.Creature }));

    const modifiers = result.current.config.placements[0]!.modifiers!;
    expect(modifiers.map((m) => m.amount)).toEqual([40, 7]);
  });
});
