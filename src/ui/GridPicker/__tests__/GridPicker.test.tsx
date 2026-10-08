import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GridPicker, POINTER_ACTIVATION_CONSTRAINT } from "../GridPicker";
import { TeamConfigProvider } from "../../../context/TeamConfigContext";
import type { TeamConfiguration } from "../../../data/types";
import { GridRow } from "../../../data/enums";

/**
 * FR-033/FR-034/FR-035 (2026-10-06 round 6). The clear-control tests are the substantive ones:
 * the control sits on an element that is simultaneously a `@dnd-kit` drag handle AND the click
 * target that opens the creature picker (research.md H5), so the easy-to-write implementation
 * clears the slot *and* pops the picker open over it.
 */

/** Renders GridPicker inside the provider with one creature already placed at front-0. */
function renderWithPlacement() {
  const config: TeamConfiguration = {
    placements: [{ slot: { row: GridRow.Front, col: 0 }, creatureId: "bumblebolt", level: 1 }],
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: 20,
  };
  return render(
    <TeamConfigProvider initialConfig={config}>
      <GridPicker onHighlightSlot={vi.fn()} />
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

describe("GridPicker click-to-open (FR-047, 2026-10-06 round 7)", () => {
  it("opens the creature picker on a single click of an occupied slot", () => {
    renderWithPlacement();
    const card = screen.getByRole("button", { name: /^Bumblebolt, level 1/ });

    // The REAL pointer sequence, not a bare fireEvent.click. @dnd-kit suppresses the click by
    // installing a capture-phase stopPropagation listener on pointerdown, so a click-only test is
    // green against the broken code and proves nothing (research.md I7).
    fireEvent.pointerDown(card, { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(card, { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
    fireEvent.click(card, { clientX: 10, clientY: 10 });

    // HONEST LIMITATION: this assertion passes even against the broken code, because jsdom's
    // synthetic events do not reproduce the browser's real click suppression. It guards the
    // handler wiring, not the bug. The drag test below is the one that actually goes red for this
    // fix, and the production behaviour needs a real-browser check (quickstart Scenario 25).
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("configures an 8px drag-activation constraint, which is what makes the click reachable", () => {
    // The BUG was the absence of this constraint: @dnd-kit's default PointerSensor activates on
    // pointerdown and suppresses the click, so the card's onClick never ran (research.md I7).
    // Asserted structurally rather than behaviourally because jsdom reproduces NEITHER half --
    // its synthetic pointer events don't drive @dnd-kit activation, and its fireEvent.click isn't
    // subject to @dnd-kit's capture-phase suppression. A behavioural test here would be green in
    // both directions and prove nothing. Real behaviour: quickstart Scenario 25, in a browser.
    expect(POINTER_ACTIVATION_CONSTRAINT).toEqual({ distance: 8 });
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

  it("renders the placed creature's sprite in its slot (FR-036, item 12)", () => {
    renderWithPlacement();
    const sprite = screen.getByRole("img", { name: "Bumblebolt" });
    // Resolved against BASE_URL via the shared Sprite component -- a root-relative path would
    // work in dev and 404 in production under /batomon-calculator/.
    expect(sprite.getAttribute("src")).toMatch(/sprites\/monster\/bumblebolt\.png$/);
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
