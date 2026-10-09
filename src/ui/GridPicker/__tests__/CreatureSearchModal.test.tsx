import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreatureSearchModal } from "../CreatureSearchModal";
import { GridRow } from "../../../data/enums";
import { gridRef } from "../../../engine/roster";

/**
 * FR-018 / quickstart.md Validation Scenario 8 (2026-10-05 round 3, research.md E2.1): a
 * reference UI left the previous slot's typed query in place when reopened for a different
 * slot, with no autofocus. This is this project's first React component test (previously only
 * engine/data were tested) — added specifically because this behavior is easy to silently
 * regress and hard to verify by reading the component alone.
 */
describe("CreatureSearchModal", () => {
  it("renders nothing when slot is null", () => {
    render(<CreatureSearchModal target={null} onClose={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("autofocuses the search input and starts with an empty query when opened", async () => {
    render(<CreatureSearchModal target={gridRef({ row: GridRow.Bottom, col: 0 })} onClose={vi.fn()} onSelect={vi.fn()} />);
    const input = screen.getByLabelText("Search by name") as HTMLInputElement;
    expect(input.value).toBe("");
    await waitFor(() => expect(input).toHaveFocus());
  });

  it("clears a previously-typed query and re-focuses when reopened for a different slot", async () => {
    const { rerender } = render(
      <CreatureSearchModal target={gridRef({ row: GridRow.Bottom, col: 0 })} onClose={vi.fn()} onSelect={vi.fn()} />,
    );
    const input = screen.getByLabelText("Search by name") as HTMLInputElement;
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.change(input, { target: { value: "peb" } });
    expect(input.value).toBe("peb");

    // Blur it, simulating the user clicking a result and the modal closing/reopening for a
    // different slot -- the regression this test guards against.
    input.blur();
    rerender(<CreatureSearchModal target={gridRef({ row: GridRow.Bottom, col: 1 })} onClose={vi.fn()} onSelect={vi.fn()} />);

    const reopenedInput = screen.getByLabelText("Search by name") as HTMLInputElement;
    expect(reopenedInput.value).toBe("");
    await waitFor(() => expect(reopenedInput).toHaveFocus());
  });

  it("calls onSelect with the creature id and onClose when a result is clicked", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<CreatureSearchModal target={gridRef({ row: GridRow.Bottom, col: 0 })} onClose={onClose} onSelect={onSelect} />);
    fireEvent.change(screen.getByLabelText("Search by name"), { target: { value: "Bumblebolt" } });
    fireEvent.click(screen.getByText("Bumblebolt"));
    expect(onSelect).toHaveBeenCalledWith("bumblebolt");
    expect(onClose).toHaveBeenCalled();
  });

  it("Escape key closes the modal", () => {
    const onClose = vi.fn();
    render(<CreatureSearchModal target={gridRef({ row: GridRow.Bottom, col: 0 })} onClose={onClose} onSelect={vi.fn()} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
