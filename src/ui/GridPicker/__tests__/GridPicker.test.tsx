import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GridPicker } from "../GridPicker";
import { TeamConfigProvider } from "../../../context/TeamConfigContext";
import { simulate } from "../../../engine/simulate";
import { corpus } from "../../../data/corpus";
import type { TeamConfiguration } from "../../../data/types";

/**
 * FR-033/FR-034/FR-035 (2026-10-06 round 6). The clear-control tests are the substantive ones:
 * the control sits on an element that is simultaneously a `@dnd-kit` drag handle AND the click
 * target that opens the creature picker (research.md H5), so the easy-to-write implementation
 * clears the slot *and* pops the picker open over it.
 */

/** Renders GridPicker inside the provider with one creature already placed at front-0. */
function renderWithPlacement() {
  const config: TeamConfiguration = {
    placements: [{ slot: { row: "front", col: 0 }, creatureId: "bumblebolt", level: 1 }],
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: 20,
  };
  const result = simulate(config, corpus);
  return render(
    <TeamConfigProvider initialConfig={config}>
      <GridPicker onHighlightSlot={vi.fn()} result={result} />
    </TeamConfigProvider>,
  );
}

describe("GridPicker clear control (FR-033)", () => {
  it("clears the slot without opening the creature picker (mouse)", () => {
    renderWithPlacement();
    // Queried by the card's accessible name, not its text: "Bumblebolt" also appears in each
    // slot's fallback <select> options, so a plain text query matches many nodes.
    expect(screen.getByRole("button", { name: /^Bumblebolt, level 1/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /remove bumblebolt/i }));

    expect(screen.queryByRole("button", { name: /^Bumblebolt, level 1/ })).toBeNull();
    // The substantive half: clearing must not also trigger the card's own click handler.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("clears the slot without opening the creature picker (keyboard)", () => {
    renderWithPlacement();
    const clearButton = screen.getByRole("button", { name: /remove bumblebolt/i });

    // The card's own onKeyDown fires preventDefault() + opens the picker on Enter/Space. Without
    // stopping keydown propagation, a keyboard user pressing Enter on the X gets the picker opened
    // and the slot NOT cleared -- the exact opposite of the requested behaviour.
    fireEvent.keyDown(clearButton, { key: "Enter" });
    fireEvent.click(clearButton);

    expect(screen.queryByRole("button", { name: /^Bumblebolt, level 1/ })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("GridPicker layout (FR-034/FR-035)", () => {
  it("renders no 'back row'/'front row' label text", () => {
    renderWithPlacement();
    // Row geometry is self-evident on screen; GridSlot.row remains "back"|"front" as DATA (the
    // engine's adjacency resolvers depend on it) -- only the visible labels are gone.
    expect(screen.queryByText(/^back row$/i)).toBeNull();
    expect(screen.queryByText(/^front row$/i)).toBeNull();
  });

  it("shows the placed creature's output stats as colour-coded badges in its slot", () => {
    renderWithPlacement();
    // Bumblebolt L1: 3 Direct damage, 1 Shock.
    const damageBadge = screen.getByTitle(/damage/i);
    expect(damageBadge.textContent).toContain("3");
    const shockBadge = screen.getByTitle(/shock/i);
    expect(shockBadge.textContent).toContain("1");
    // The game distinguishes these by colour alone, so the published colour must actually be used.
    expect(damageBadge.getAttribute("style")).toContain("239, 66, 107");
  });
});
