import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { CreatureSearchModal } from "../GridPicker/CreatureSearchModal";
import { RARITIES_ASC, rarityLabel } from "../../data/statColors";
import { GridRow } from "../../data/enums";
import { gridRef } from "../../engine/roster";

const SLOT = { row: GridRow.Top, col: 0 } as const;

function openPicker(onSelect = () => {}, onClose = () => {}) {
  return render(<CreatureSearchModal target={gridRef(SLOT)} onClose={onClose} onSelect={onSelect} />);
}

describe("creature picker ordering (2026-10-07)", () => {
  it("lists rarity sections Common first, Mythical last", () => {
    // Was Mythical-first, which put the creatures you pick LEAST at the top and pushed Commons
    // below the fold.
    const { container } = openPicker();
    const headings = Array.from(container.querySelectorAll("h3, h4")).map((h) => h.textContent?.trim());
    // Matched on LABELS, not stored keys. Keyed on `r` this filter silently dropped the Super Rare
    // section the moment its label gained a space, and the test kept passing while checking less.
    const labels = RARITIES_ASC.map(rarityLabel);
    const rarityHeadings = headings.filter((h) => labels.some((l) => h?.startsWith(l)));
    expect(rarityHeadings.length).toBe(RARITIES_ASC.length);
    expect(rarityHeadings[0]).toMatch(/^Common/);
    expect(rarityHeadings[rarityHeadings.length - 1]).not.toMatch(/^Common/);
  });

  it("keeps names alphabetical within a rarity", () => {
    const { container } = openPicker();
    const firstSection = container.querySelector("section");
    expect(firstSection).toBeTruthy();
    const names = Array.from(within(firstSection as HTMLElement).getAllByRole("button"))
      .map((b) => b.textContent?.trim() ?? "")
      .filter(Boolean);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });
});

describe("creature picker keyboard + filters (2026-10-07)", () => {
  it("Enter selects when exactly one creature matches", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    openPicker(onSelect, onClose);
    const search = screen.getByLabelText("Search by name");
    fireEvent.change(search, { target: { value: "bumblebolt" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("bumblebolt");
    expect(onClose).toHaveBeenCalled();
  });

  it("Enter does NOTHING when several creatures match", () => {
    // Picking "the first of several" would silently choose for the user.
    const onSelect = vi.fn();
    openPicker(onSelect);
    const search = screen.getByLabelText("Search by name");
    fireEvent.change(search, { target: { value: "a" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("Enter does nothing when no creature matches", () => {
    const onSelect = vi.fn();
    openPicker(onSelect);
    const search = screen.getByLabelText("Search by name");
    fireEvent.change(search, { target: { value: "zzzzzznope" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("Clear appears only when something is set, and resets everything", () => {
    openPicker();
    expect(screen.queryByText("Clear")).toBeNull();

    fireEvent.change(screen.getByLabelText("Filter by rarity"), { target: { value: "Common" } });
    fireEvent.change(screen.getByLabelText("Search by name"), { target: { value: "bu" } });
    fireEvent.click(screen.getByText("Clear"));

    expect((screen.getByLabelText("Filter by rarity") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Search by name") as HTMLInputElement).value).toBe("");
    expect(screen.queryByText("Clear")).toBeNull();
  });

  it("filters persist across opens while the query still clears", () => {
    // The two differ in kind: a query names ONE creature you have already found, a filter describes
    // the KIND you are shopping for. Filling six slots usually means six picks from one tier.
    const { rerender } = openPicker();
    fireEvent.change(screen.getByLabelText("Filter by rarity"), { target: { value: "Common" } });
    fireEvent.change(screen.getByLabelText("Search by name"), { target: { value: "bumble" } });

    // Re-open for a different slot.
    rerender(<CreatureSearchModal target={gridRef({ row: GridRow.Bottom, col: 2 })} onClose={() => {}} onSelect={() => {}} />);

    expect((screen.getByLabelText("Filter by rarity") as HTMLSelectElement).value).toBe("Common");
    expect((screen.getByLabelText("Search by name") as HTMLInputElement).value).toBe("");
  });
});
