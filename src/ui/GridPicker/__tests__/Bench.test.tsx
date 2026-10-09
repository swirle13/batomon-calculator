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

const FRONT_0 = { row: GridRow.Bottom, col: 0 } as const;

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
      <GridPicker onHighlight={vi.fn()} />
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

  it("is labelled, so it does not read as six more board slots", () => {
    // A row of monster cards under the board looks like more board — more so now that Chef's
    // grant shows on them — and someone who read it that way would watch their DPS not move and
    // conclude the tool was broken. Asserted as the region's accessible NAME rather than as
    // on-screen prose, so wording stays an editorial choice rather than a test to update.
    expect(renderBoard().container.textContent).toMatch(/bench/i);
    expect(bench()).toBeTruthy();
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

  it("applies the trainer's per-monster bonus to a benched card, as the game does", () => {
    /*
     * 2026-10-08, from a screenshot of the game: with Chef active, the bench and the shop row
     * both show the buffed figure — Coalem reads 22 Burn against a published 20, and monsters
     * with no published Burn at all read 2. So Chef's grant is a property of the run rather than
     * of the six monsters currently fighting.
     *
     * This was briefly the other way round, on the reasoning that a benched monster is not on
     * your team. The game disagrees, and the game is the specification.
     *
     * Scorchimp publishes Burn 5 at level 1, so a buffed card is legible as 7.
     */
    renderBoard({
      trainerId: TrainerId.Chef,
      placements: [{ slot: FRONT_0, creatureId: Species.Scorchimp, level: 1 }],
      bench: [{ index: 0, creatureId: Species.Scorchimp, level: 1 }],
    });

    expect(within(bench()).getByTitle("Burn: 7")).toBeTruthy();
    expect(within(bench()).queryByTitle("Burn: 5")).toBeNull();
    // Both cards agree, which is the point — the same monster should not read differently on
    // either side of the line.
    expect(screen.getAllByTitle("Burn: 7")).toHaveLength(2);
  });

  it("grants the Fire treatment to a benched single-typed monster", () => {
    // The visual half of the same rule: the screenshot shows every bench and shop monster carrying
    // the fire wash. Cobrex is single-typed (Toxic) and not Fire, so Chef's first clause — "your
    // singled-typed monsters gain Fire typing" — reaches it. Bumblebolt would not do here: it is
    // Bug/Electric, and a dual-typed monster is granted nothing.
    renderBoard({
      trainerId: TrainerId.Chef,
      bench: [{ index: 0, creatureId: Species.Cobrex, level: 1 }],
    });
    expect(bench().querySelector("[class*='chefFire']")).not.toBeNull();
  });

  it("leaves a benched monster alone when no trainer grants anything", () => {
    renderBoard({ trainerId: null, bench: [{ index: 0, creatureId: Species.Scorchimp, level: 1 }] });
    expect(within(bench()).getByTitle("Burn: 5")).toBeTruthy();
    expect(bench().querySelector("[class*='chefFire']")).toBeNull();
  });

  /**
   * 2026-10-08, user-requested: "The mon details card should also work when hovering over bench
   * pokemon too."
   */
  it("reports a hovered bench monster upward, so the detail panel can open on it", () => {
    const onHighlight = vi.fn();
    render(
      <TeamConfigProvider
        initialConfig={{
          placements: [],
          bench: [{ index: 2, creatureId: Species.Bumblebolt, level: 1 }],
          trainerId: null,
          trinketIds: [],
          itemIds: [],
          simulationWindowSeconds: 20,
        }}
      >
        <GridPicker onHighlight={onHighlight} />
      </TeamConfigProvider>,
    );

    fireEvent.mouseEnter(within(bench()).getByRole("button", { name: /^Bumblebolt, level 1/ }));

    // The bench POSITION, not a fabricated grid slot — the panel has to be able to tell the two
    // apart, because only a placed monster has resolved stats to show.
    expect(onHighlight).toHaveBeenCalledWith({ zone: "bench", index: 2 });
  });
});
