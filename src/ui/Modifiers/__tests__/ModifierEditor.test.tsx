import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModifierEditor } from "../ModifierEditor";
import { TeamConfigProvider } from "../../../context/TeamConfigContext";
import type { TeamConfiguration } from "../../../data/types";

/**
 * FR-039 (2026-10-06 round 6, research.md H7). Four distinct user-requested changes, each asserted
 * separately so none can be quietly skipped:
 *   (a) collapsed by default,
 *   (b) no user-facing team-wide scope,
 *   (c) short stat labels with the format explanation as supporting text,
 *   (d) controls presented per placed creature rather than behind a global scope dropdown.
 */

function configWith(placements: TeamConfiguration["placements"]): TeamConfiguration {
  return {
    placements,
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: 20,
    teamModifiers: [],
  };
}

function renderEditor(config: TeamConfiguration) {
  return render(
    <TeamConfigProvider initialConfig={config}>
      <ModifierEditor />
    </TeamConfigProvider>,
  );
}

const TWO_PLACEMENTS = configWith([
  { slot: { row: "front", col: 0 }, creatureId: "bumblebolt", level: 1 },
  { slot: { row: "back", col: 1 }, creatureId: "panbud", level: 1 },
]);

describe("ModifierEditor (FR-039)", () => {
  it("is collapsed by default", () => {
    renderEditor(TWO_PLACEMENTS);
    const disclosure = screen.getByRole("group");
    expect((disclosure as HTMLDetailsElement).open).toBe(false);
  });

  it("offers no team-wide scope option once expanded", () => {
    renderEditor(TWO_PLACEMENTS);
    fireEvent.click(screen.getByText(/modifiers/i));
    // The engine still supports team-wide modifiers (round 5 routes trinket effectTags through
    // them) -- what's removed is the hand-entry UI for them.
    expect(screen.queryByText(/team-wide/i)).toBeNull();
    expect(screen.queryByLabelText(/modifier scope/i)).toBeNull();
  });

  it("presents one add-control row per placed creature, not one global scope dropdown", () => {
    renderEditor(TWO_PLACEMENTS);
    fireEvent.click(screen.getByText(/modifiers/i));
    // (d): the creature a modifier belongs to is structural, not something the user selects.
    expect(screen.getByRole("button", { name: /add modifier to bumblebolt/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /add modifier to panbud/i })).toBeTruthy();
  });

  it("uses short stat labels, with the decimal/percent explanation as supporting text", () => {
    renderEditor(TWO_PLACEMENTS);
    fireEvent.click(screen.getByText(/modifiers/i));
    const statSelect = screen.getByLabelText(/stat to modify for bumblebolt/i) as HTMLSelectElement;
    const labels = Array.from(statSelect.options).map((o) => o.textContent ?? "");
    expect(labels).toContain("Cooldown Speed");
    // (c): the "+decimal, e.g. 0.2 = +20%" explanation must not live inside an option label.
    expect(labels.some((l) => l.includes("0.2") || l.includes("decimal"))).toBe(false);
    // ...but it must still be stated somewhere for the user. Matched on the container's full
    // textContent, since the note interleaves a <code> element and so spans several text nodes.
    const note = screen.getByText(/Cooldown Speed is a decimal/i);
    expect(note.textContent).toMatch(/0\.2/);
    expect(note.textContent).toMatch(/20%/);
  });

  it("adds a modifier scoped to the creature whose row it was entered on", () => {
    renderEditor(TWO_PLACEMENTS);
    fireEvent.click(screen.getByText(/modifiers/i));

    fireEvent.change(screen.getByLabelText(/amount to add for bumblebolt/i), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: /add modifier to bumblebolt/i }));

    expect(screen.getByText(/\+7/)).toBeTruthy();
  });

  it("shows an empty state rather than an unusable form when nothing is placed", () => {
    renderEditor(configWith([]));
    fireEvent.click(screen.getByText(/modifiers/i));
    expect(screen.getByText(/place a banto/i)).toBeTruthy();
  });
});
