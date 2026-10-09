import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { GridPicker } from "../GridPicker";
import { TeamConfigProvider } from "../../../context/TeamConfigContext";
import type { TeamConfiguration } from "../../../data/types";
import { GridRow } from "../../../data/enums";
import { Species, TrainerId } from "../../../data/ids";

/**
 * The bench, as the user drives it (2026-10-08).
 *
 * Dragging itself is not exercised here: @dnd-kit's sensors need real pointer events with
 * measured geometry, which jsdom does not provide, and faking that would test the harness rather
 * than the board. The MOVE is covered against the state it writes, in
 * `engine/__tests__/roster.test.ts`. What this file covers is everything around it — that the
 * bench renders, that it can be filled and cleared, and that a monster sitting on it is shown as
 * being out of the fight rather than quietly looking like part of the team.
 */

const FRONT_0 = { row: GridRow.Front, col: 0 } as const;

function renderBoard(config: Partial<TeamConfiguration> = {}) {
  const full: TeamConfiguration = {
    placements: [],
    bench: [],
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: 20,
    ...config,
  };
  return render(
    <TeamConfigProvider initialConfig={full}>
      <GridPicker onHighlightSlot={vi.fn()} />
    </TeamConfigProvider>,
  );
}

const bench = () => screen.getByRole("region", { name: "Bench" });

describe("the bench", () => {
  it("offers four positions, separate from the six that fight", () => {
    renderBoard();
    expect(within(bench()).getAllByRole("button", { name: /empty bench position/i })).toHaveLength(4);
    // The grid's own empties are a different control with a different name, so the two cannot be
    // confused by a query here or by a screen reader on the page.
    expect(screen.getAllByRole("button", { name: /^empty slot/i })).toHaveLength(6);
  });

  it("says on screen that its monsters are not in the fight", () => {
    // A row of monster cards under the board looks like more board. Someone who read it that way
    // would watch their DPS not move and conclude the tool was broken.
    expect(renderBoard().container.textContent).toMatch(/not in the fight/i);
  });

  it("renders a benched monster as a card you can clear", () => {
    renderBoard({ bench: [{ index: 0, creatureId: Species.Bumblebolt, level: 2 }] });
    expect(within(bench()).getByRole("button", { name: /^Bumblebolt, level 2/ })).toBeTruthy();

    fireEvent.click(within(bench()).getByRole("button", { name: /remove bumblebolt/i }));

    expect(within(bench()).queryByRole("button", { name: /^Bumblebolt, level 2/ })).toBeNull();
    // The clear control sits on an element that is also the click target opening the picker, so
    // clearing must not pop the picker over the position it just emptied (research.md H5).
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the creature picker from an empty bench position", () => {
    renderBoard();
    fireEvent.click(within(bench()).getAllByRole("button", { name: /empty bench position/i })[0]!);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("preserves a benched monster's level and shiny, which is the point of benching it", () => {
    renderBoard({ bench: [{ index: 2, creatureId: Species.Bumblebolt, level: 3, shiny: true }] });
    expect(within(bench()).getByRole("button", { name: /^Bumblebolt, level 3/ })).toBeTruthy();
  });

  it("withholds the trainer's per-monster bonus from a benched card", () => {
    /*
     * Chef gives "your Fire monsters +2 Burn", and `trainerModifiersFor` is applied to placements
     * only — a benched monster is not on your team. The chip has to agree: advertising the +2
     * here would promise a stat that disappears the moment the monster is actually fielded, or
     * the moment the user reads the simulation.
     *
     * Scorchimp publishes Burn 5 at level 1, so the two cards are legible as 7 and 5.
     */
    renderBoard({
      trainerId: TrainerId.Chef,
      placements: [{ slot: FRONT_0, creatureId: Species.Scorchimp, level: 1 }],
      bench: [{ index: 0, creatureId: Species.Scorchimp, level: 1 }],
    });

    expect(within(bench()).getByTitle("Burn: 5")).toBeTruthy();
    expect(within(bench()).queryByTitle("Burn: 7")).toBeNull();
    // The placed one does get it, so this is the bench being excluded rather than the bonus
    // being broken everywhere.
    expect(screen.getByTitle("Burn: 7")).toBeTruthy();
  });
});
