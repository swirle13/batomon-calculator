import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TriggerButtons } from "../TriggerButtons";
import { TeamConfigProvider } from "../../../context/TeamConfigContext";
import { useTeamConfig } from "../../../context/teamConfig";
import { resolveCreatureVariant } from "../../../data/corpus";
import { slotKey } from "../../../engine/grid";
import type { GridSlot, TeamConfiguration, TeamPlacement } from "../../../data/types";
import { GridRow, ModifierScope, ModifierStat } from "../../../data/enums";
import { Species, TrinketId } from "../../../data/ids";

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
  { name: "Shikitsune", id: Species.Shikitsune, slot: { row: GridRow.Top, col: 0 } }, // Rare
  { name: "Pyronade", id: Species.Pyronade, slot: { row: GridRow.Top, col: 1 } }, // Uncommon
  { name: "Pebbler", id: Species.Pebbler, slot: { row: GridRow.Top, col: 2 } }, // Common
  { name: "Brawlmantis", id: Species.Brawlmantis, slot: { row: GridRow.Bottom, col: 0 } }, // Uncommon, the presser
  { name: "Venopuff", id: Species.Venopuff, slot: { row: GridRow.Bottom, col: 1 } }, // Common
  { name: "Craghorn", id: Species.Craghorn, slot: { row: GridRow.Bottom, col: 2 } }, // Uncommon
];

function configWith(placements: TeamPlacement[], trinketIds: TrinketId[] = []): TeamConfiguration {
  return {
    placements,
    trainerId: null,
    trinketIds,
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
      {config.placements.map((p) => (
        <li key={`cd-${slotKey(p.slot)}`} data-testid={`cooldown-${p.creatureId}`}>
          {(p.modifiers ?? [])
            .filter((m) => m.stat === ModifierStat.CooldownSpeedAdd)
            .map((m) => `${m.label ?? "—"}:${Math.round(m.amount * 1000) / 10}`)
            .join(",")}
        </li>
      ))}
    </ul>
  );
}

function renderBoard(
  sourceId: string,
  placements: TeamPlacement[] = BOARD.map(toPlacement),
  trinketIds: TrinketId[] = [],
) {
  const source = placements.find((p) => p.creatureId === sourceId)!;
  const creature = resolveCreatureVariant(source.creatureId, source.level, source.shiny)!;
  render(
    <TeamConfigProvider initialConfig={configWith(placements, trinketIds)}>
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

/** The `+` of a trigger's stepper. Named by the action so a creature with two triggers is unambiguous. */
function plus(action: RegExp): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(`^Bank: ${action.source}`, "i") });
}

/** The `−` of the same stepper. */
function minus(action: RegExp): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(`^Unbank: ${action.source}`, "i") });
}

describe("TriggerButtons — who a press lands on", () => {
  it("banks Brawlmantis's +10 on it AND on both Common allies", () => {
    renderBoard("brawlmantis");
    fireEvent.click(plus(/win a round/));

    expect(banked(Species.Brawlmantis)).toBe("10");
    expect(banked(Species.Pebbler)).toBe("10");
    expect(banked(Species.Venopuff)).toBe("10");
  });

  it("leaves the non-Common allies alone, because the ability names Commons", () => {
    renderBoard("brawlmantis");
    fireEvent.click(plus(/win a round/));

    // Pyronade and Craghorn are Uncommon, Shikitsune is Rare. A fix that simply wrote to every
    // placement would pass the test above and fail this one.
    for (const id of [Species.Shikitsune, Species.Pyronade, Species.Craghorn]) expect(banked(id)).toBe("");
  });

  it("accumulates per press rather than appending a chip each time", () => {
    renderBoard("brawlmantis");
    const press = plus(/win a round/);
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

    fireEvent.click(plus(/win a round/));
    expect(banked(Species.Brawlmantis)).toBe("10");
  });

  it("keeps a self-only trigger self-only, with the same allies on the board", () => {
    // Craghorn's "When you use an item, this gains +20 Damage and Shield" carries no target, so the
    // default must stay self. Seven of the nine species with buttons rely on that default.
    renderBoard("craghorn");
    fireEvent.click(plus(/use an item/));

    expect(banked(Species.Craghorn)).toBe("20");
    for (const id of [Species.Brawlmantis, Species.Pebbler, Species.Venopuff]) expect(banked(id)).toBe("");
  });
});

describe("TriggerButtons — stepping back down", () => {
  it("takes the bonus off every ally it was banked onto, not just the card that is open", () => {
    renderBoard("brawlmantis");
    fireEvent.click(plus(/win a round/));
    fireEvent.click(minus(/win a round/));

    // Undoing only the presser would leave the allies carrying a bonus with no control to remove it.
    for (const id of [Species.Brawlmantis, Species.Pebbler, Species.Venopuff]) expect(banked(id)).toBe("");
  });

  it("removes one press at a time rather than clearing the lot", () => {
    renderBoard("brawlmantis");
    const press = plus(/win a round/);
    fireEvent.click(press);
    fireEvent.click(press);
    fireEvent.click(press);
    fireEvent.click(minus(/win a round/));

    expect(banked(Species.Brawlmantis)).toBe("20");
    expect(banked(Species.Venopuff)).toBe("20");
  });

  it("cannot go below nothing banked", () => {
    renderBoard("brawlmantis");
    expect(minus(/win a round/)).toHaveProperty("disabled", true);

    fireEvent.click(plus(/win a round/));
    expect(minus(/win a round/)).toHaveProperty("disabled", false);
  });

  it("shows the press count on the trigger itself, at rest and after pressing", () => {
    // Craghorn's is self-only, so the one count on screen is unambiguous.
    renderBoard("craghorn");
    expect(screen.getByText("0")).toBeTruthy();

    fireEvent.click(plus(/use an item/));
    expect(screen.getByText("1")).toBeTruthy();
  });
});

/**
 * Trinkets that grant to ONE monster (2026-10-08, user-reported).
 *
 * Tempo Charm's "On Battle Start, a random monster gains +4% Cooldown Speed permanently" had no
 * representation at all: the trinket was browsable corpus data with no effect, so a run where it
 * had fired seven times showed the same cooldowns as a run without it. The game rolls the
 * recipient, so the user names it — one press per time it landed on the monster they are looking
 * at.
 */
describe("TriggerButtons — a trinket that grants to one chosen monster", () => {
  /** A board with no manual triggers on the open card, so the only row is the trinket's. */
  const PEBBLER = [BOARD.find((b) => b.id === Species.Pebbler)!, BOARD.find((b) => b.id === Species.Venopuff)!].map(
    toPlacement,
  );

  function cooldown(creatureId: Species): string {
    return screen.getByTestId(`cooldown-${creatureId}`).textContent ?? "";
  }

  it("offers no row when the trinket is not held", () => {
    renderBoard("pebbler", PEBBLER);
    expect(screen.queryByRole("button", { name: /Tempo Charm/i })).toBeNull();
  });

  it("banks +4% Cooldown Speed on the open monster alone, labelled with the trinket", () => {
    renderBoard("pebbler", PEBBLER, [TrinketId.TempoCharm]);
    fireEvent.click(plus(/tempo charm/));

    expect(cooldown(Species.Pebbler)).toBe("Tempo Charm:4");
    // The ability says "a random monster", singular. A press must not spray the board.
    expect(cooldown(Species.Venopuff)).toBe("");
  });

  it("accumulates one chip across presses, because it fires every battle start", () => {
    renderBoard("pebbler", PEBBLER, [TrinketId.TempoCharm]);
    const press = plus(/tempo charm/);
    fireEvent.click(press);
    fireEvent.click(press);
    fireEvent.click(press);

    expect(cooldown(Species.Pebbler)).toBe("Tempo Charm:12");
  });

  it("steps back down one battle at a time and cannot go below nothing", () => {
    renderBoard("pebbler", PEBBLER, [TrinketId.TempoCharm]);
    expect(minus(/tempo charm/)).toHaveProperty("disabled", true);

    fireEvent.click(plus(/tempo charm/));
    fireEvent.click(plus(/tempo charm/));
    fireEvent.click(minus(/tempo charm/));

    expect(cooldown(Species.Pebbler)).toBe("Tempo Charm:4");
  });

  /**
   * The reason `addPlacementModifier` and the press count both match on label.
   *
   * A hand-typed +10% Cooldown Speed is creature-scoped cooldown, exactly like Tempo Charm's
   * grant. Merged into one chip it read as two presses of a trinket that had never been pressed,
   * and unbanking would have eaten a bonus the user typed.
   */
  it("leaves a hand-typed bonus on the same stat alone, and is not counted by it", () => {
    const typed: TeamPlacement = {
      ...PEBBLER[0]!,
      modifiers: [
        { id: "typed", stat: ModifierStat.CooldownSpeedAdd, amount: 0.1, scope: ModifierScope.Creature },
      ],
    };
    renderBoard("pebbler", [typed, PEBBLER[1]!], [TrinketId.TempoCharm]);

    // Nothing has been pressed, however much cooldown the monster is already carrying.
    expect(screen.getByText("0")).toBeTruthy();

    fireEvent.click(plus(/tempo charm/));
    expect(cooldown(Species.Pebbler)).toBe("—:10,Tempo Charm:4");
  });

  it("says how many copies are held, since each one fires separately", () => {
    renderBoard("pebbler", PEBBLER, [TrinketId.TempoCharm, TrinketId.TempoCharm]);
    expect(screen.getByText("Tempo Charm ×2")).toBeTruthy();
  });
});
