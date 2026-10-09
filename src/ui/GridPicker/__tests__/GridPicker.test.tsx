import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GridPicker } from "../GridPicker";
import { POINTER_ACTIVATION_CONSTRAINT, TOUCH_ACTIVATION_CONSTRAINT } from "../dragActivation";
import { TeamConfigProvider } from "../../../context/TeamConfigContext";
import type { StatModifier, TeamConfiguration } from "../../../data/types";
import { GridRow, ModifierStat } from "../../../data/enums";
import { Species, syntheticSpecies } from "../../../data/ids";

/**
 * FR-033/FR-034/FR-035 (2026-10-06 round 6). The clear-control tests are the substantive ones:
 * the control sits on an element that is simultaneously a `@dnd-kit` drag handle AND the click
 * target that opens the creature picker (research.md H5), so the easy-to-write implementation
 * clears the slot *and* pops the picker open over it.
 */

/** Renders GridPicker inside the provider with one creature already placed at front-0. */
function renderWithPlacement(
  creatureId: Species = Species.Bumblebolt,
  modifiers?: StatModifier[],
) {
  const config: TeamConfiguration = {
    placements: [{ slot: { row: GridRow.Bottom, col: 0 }, creatureId, level: 1, modifiers }],
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: 20,
  };
  return render(
    <TeamConfigProvider initialConfig={config}>
      <GridPicker onHighlight={vi.fn()} />
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

/**
 * The padlock (2026-10-09, user-reported). Same hazard as the clear control above — it sits on an
 * element that is both a drag handle and the click target that opens the picker — plus one of its
 * own: locking a monster must not be mistaken for editing it, because the whole reason to lock
 * Ignit is that you intend to leave it exactly as it is.
 */
describe("GridPicker lock control (2026-10-09)", () => {
  it("locks the placement without opening the creature picker", () => {
    renderWithPlacement();
    fireEvent.click(screen.getByRole("button", { name: /^lock bumblebolt/i }));

    expect(screen.getByRole("button", { name: /^unlock bumblebolt/i })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    // Still on the board: a lock is not a removal, and the two controls are adjacent.
    expect(screen.getByRole("button", { name: /^Bumblebolt, level 1/ })).toBeTruthy();
  });

  it("unlocks on a second press, and says which state it is in", () => {
    renderWithPlacement();
    const lock = () => screen.getByRole("button", { name: /lock bumblebolt/i });

    fireEvent.click(lock());
    expect(lock().getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(lock());
    expect(lock().getAttribute("aria-pressed")).toBe("false");
  });

  it("does not offer a lock on a BENCH card, where it would constrain nothing", () => {
    // `settleOnBench` drops the flag, so a padlock here would be a control with no effect — see
    // `RosteredCreature.locked`.
    render(
      <TeamConfigProvider
        initialConfig={{
          placements: [],
          bench: [{ index: 0, creatureId: Species.Bumblebolt, level: 1 }],
          trainerId: null,
          trinketIds: [],
          itemIds: [],
          simulationWindowSeconds: 20,
        }}
      >
        <GridPicker onHighlight={vi.fn()} />
      </TeamConfigProvider>,
    );

    expect(screen.getByRole("button", { name: /^Bumblebolt, level 1/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /lock bumblebolt/i })).toBeNull();
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

  it("activates a touch drag on a long press, not on distance (2026-10-08)", () => {
    // Reported bug: cards could not be dragged at all on a phone. A distance threshold is
    // unreachable by a finger, because the browser claims the swipe as a page scroll and cancels
    // the pointer first; a delay separates drag from scroll by time instead. Structural for the
    // same reason as the constraint above — jsdom drives neither sensor.
    expect(TOUCH_ACTIVATION_CONSTRAINT).toEqual({ delay: 180, tolerance: 8 });
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

/**
 * 2026-10-08: the chips are a fixed three characters wide, so what a chip SAYS has to fit that.
 * Plunderbird is the reported case — its 1 / 25 / 2 came out three different widths, and the 2 was
 * a Multicast reading as a magnitude.
 *
 * The width itself is CSS and jsdom does no layout; it is pinned in layoutTokens.test.ts, against
 * the authored declarations. What is assertable here is the LABEL, which is the half that decides
 * whether three characters are enough.
 */
describe("stat chip labels (2026-10-08)", () => {
  it("marks Multicast as a multiplier, matching the card's 'Multicast ×2' line", () => {
    renderWithPlacement(Species.Plunderbird);
    // A bare "2" beside Plunderbird's "25" heal read as a second magnitude.
    expect(screen.getByTitle("Multicast: ×2").textContent).toBe("×2");
  });

  it("drives every chip off the same producer the card uses, modifiers included", () => {
    renderWithPlacement(Species.Plunderbird, [
      { id: syntheticSpecies("h"), stat: ModifierStat.HealAmountAdd, amount: 5 },
    ]);
    // Heal was read straight off `creature.healAmount` and so ignored Heal modifiers, while the
    // damage chip beside it did honour them.
    expect(screen.getByTitle("Heal: 30").textContent).toBe("30");
    expect(screen.getByTitle("Damage: 1").textContent).toBe("1");
  });

  it("writes five-digit values in thousands, and keeps the exact figure in the title", () => {
    renderWithPlacement(Species.Plunderbird, [
      { id: syntheticSpecies("d"), stat: ModifierStat.DamageFlatAdd, amount: 12_344 },
    ]);
    // "12345" is five characters in a chip sized for three. The title is where the exact value
    // stays reachable — rounding the label loses nothing.
    expect(screen.getByTitle("Damage: 12345").textContent).toBe("12K");
  });

  it("shows four digits as they are: a fourth character fills the chip, which is the bound", () => {
    renderWithPlacement(Species.Plunderbird, [
      { id: syntheticSpecies("d"), stat: ModifierStat.DamageFlatAdd, amount: 9_998 },
    ]);
    expect(screen.getByTitle("Damage: 9999").textContent).toBe("9999");
  });
});
