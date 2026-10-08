import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TriggerButtons } from "../TriggerButtons";
import { TeamConfigProvider } from "../../../context/TeamConfigContext";
import { useTeamConfig } from "../../../context/teamConfig";
import { resolveCreatureVariant } from "../../../data/corpus";
import { slotKey } from "../../../engine/grid";
import type { GridSlot, TeamConfiguration, TeamPlacement } from "../../../data/types";
import { GridRow, ModifierStat } from "../../../data/enums";
import { Species } from "../../../data/ids";

/**
 * The manual trigger buttons (2026-10-07, user-reported).
 *
 * The bug these tests pin: pressing Brawlmantis's "Win a round" raised Brawlmantis from 50 to 60 and
 * changed nothing else, on a board carrying two Common allies and an ability that reads "This and
 * Common allies gain +10 Damage permanently". The board below is the user's own, so the assertion is
 * against the case that was reported rather than a constructed one.
 */

/** The reported board: two Commons that should gain, and three non-Commons that must not. */
const BOARD: { name: string; id: Species; slot: GridSlot }[] = [
  { name: "Shikitsune", id: Species.Shikitsune, slot: { row: GridRow.Back, col: 0 } }, // Rare
  { name: "Pyronade", id: Species.Pyronade, slot: { row: GridRow.Back, col: 1 } }, // Uncommon
  { name: "Pebbler", id: Species.Pebbler, slot: { row: GridRow.Back, col: 2 } }, // Common
  { name: "Brawlmantis", id: Species.Brawlmantis, slot: { row: GridRow.Front, col: 0 } }, // Uncommon, the presser
  { name: "Venopuff", id: Species.Venopuff, slot: { row: GridRow.Front, col: 1 } }, // Common
  { name: "Craghorn", id: Species.Craghorn, slot: { row: GridRow.Front, col: 2 } }, // Uncommon
];

function configWith(placements: TeamPlacement[]): TeamConfiguration {
  return {
    placements,
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: 20,
    teamModifiers: [],
  };
}

/** Reads each slot's banked Damage back out of the context, which is where a press writes. */
function Probe() {
  const { config } = useTeamConfig();
  return (
    <ul>
      {config.placements.map((p) => (
        <li key={slotKey(p.slot)} data-testid={`banked-${p.creatureId}`}>
          {(p.modifiers ?? [])
            .filter((m) => m.stat === ModifierStat.DamageFlatAdd)
            .map((m) => String(m.amount))
            .join(",")}
        </li>
      ))}
    </ul>
  );
}

function renderBoard(sourceId: string, placements: TeamPlacement[] = BOARD.map(toPlacement)) {
  const source = placements.find((p) => p.creatureId === sourceId)!;
  const creature = resolveCreatureVariant(source.creatureId, source.level, source.shiny)!;
  render(
    <TeamConfigProvider initialConfig={configWith(placements)}>
      <TriggerButtons creature={creature} placement={source} />
      <Probe />
    </TeamConfigProvider>,
  );
}

function toPlacement(entry: { id: Species; slot: GridSlot }): TeamPlacement {
  return { slot: entry.slot, creatureId: entry.id, level: 1 };
}

function banked(creatureId: Species): string {
  return screen.getByTestId(`banked-${creatureId}`).textContent ?? "";
}

describe("TriggerButtons — who a press lands on", () => {
  it("banks Brawlmantis's +10 on it AND on both Common allies", () => {
    renderBoard("brawlmantis");
    fireEvent.click(screen.getByRole("button", { name: /win a round/i }));

    expect(banked(Species.Brawlmantis)).toBe("10");
    expect(banked(Species.Pebbler)).toBe("10");
    expect(banked(Species.Venopuff)).toBe("10");
  });

  it("leaves the non-Common allies alone, because the ability names Commons", () => {
    renderBoard("brawlmantis");
    fireEvent.click(screen.getByRole("button", { name: /win a round/i }));

    // Pyronade and Craghorn are Uncommon, Shikitsune is Rare. A fix that simply wrote to every
    // placement would pass the test above and fail this one.
    for (const id of [Species.Shikitsune, Species.Pyronade, Species.Craghorn]) expect(banked(id)).toBe("");
  });

  it("accumulates per press rather than appending a chip each time", () => {
    renderBoard("brawlmantis");
    const press = screen.getByRole("button", { name: /win a round/i });
    fireEvent.click(press);
    fireEvent.click(press);
    fireEvent.click(press);

    // One value, tripled — not "10,10,10". Three round wins are +30, on every recipient.
    expect(banked(Species.Brawlmantis)).toBe("30");
    expect(banked(Species.Venopuff)).toBe("30");
  });

  it("says how many monsters a press covers, so the spread is visible before pressing", () => {
    renderBoard("brawlmantis");
    expect(screen.getByText("to 3 monsters")).toBeTruthy();
  });

  it("covers only Brawlmantis when no Common ally is placed, and says so by saying nothing", () => {
    const lone = [BOARD.find((b) => b.id === Species.Brawlmantis)!].map(toPlacement);
    renderBoard("brawlmantis", lone);
    expect(screen.queryByText(/to \d+ monsters/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /win a round/i }));
    expect(banked(Species.Brawlmantis)).toBe("10");
  });

  it("keeps a self-only trigger self-only, with the same allies on the board", () => {
    // Craghorn's "When you use an item, this gains +20 Damage and Shield" carries no target, so the
    // default must stay self. Seven of the nine species with buttons rely on that default.
    renderBoard("craghorn");
    fireEvent.click(screen.getByRole("button", { name: /use an item/i }));

    expect(banked(Species.Craghorn)).toBe("20");
    for (const id of [Species.Brawlmantis, Species.Pebbler, Species.Venopuff]) expect(banked(id)).toBe("");
  });
});

describe("TriggerButtons — undoing a press", () => {
  it("resets the allies it banked onto, not just the creature whose card is open", () => {
    renderBoard("brawlmantis");
    fireEvent.click(screen.getByRole("button", { name: /win a round/i }));
    fireEvent.click(screen.getByRole("button", { name: /reset banked/i }));

    // Clearing only the presser would leave the allies carrying a bonus with no control to undo it.
    for (const id of [Species.Brawlmantis, Species.Pebbler, Species.Venopuff]) expect(banked(id)).toBe("");
  });

  it("offers no reset until something has been banked", () => {
    renderBoard("brawlmantis");
    expect(screen.queryByRole("button", { name: /reset banked/i })).toBeNull();
  });
});
