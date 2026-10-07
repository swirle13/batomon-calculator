import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ModifierEditor } from "../ModifierEditor";
import { TeamConfigProvider } from "../../../context/TeamConfigContext";
import type { TeamConfiguration } from "../../../data/types";

/**
 * FR-039 (2026-10-06 round 6, research.md H7). Four distinct user-requested changes, each asserted
 * separately so none can be quietly skipped:
 *   (a) the editor does not occupy permanent space,
 *   (b) no user-facing team-wide scope,
 *   (c) short stat labels with the format explanation as supporting text,
 *   (d) controls presented per placed creature rather than behind a global scope dropdown.
 *
 * (a) was written as "collapsed by default" and asserted against a `<details>` element. The editor
 * moved into an overlay on 2026-10-07 — see the component's header for why width, not height, forced
 * it — so the assertion now names the REQUIREMENT ("nothing to edit until you ask for it") rather
 * than the element that used to satisfy it. Asserting `details.open === false` would have passed
 * forever while the feature it protected went away.
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

/** Opens the editing overlay and returns it, so assertions can be scoped to it rather than to the
 * page — the panel behind it summarises the same modifiers, so unscoped queries match twice. */
function openOverlay(): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: /edit modifiers/i }));
  return screen.getByRole("dialog", { name: /modifiers/i });
}

const TWO_PLACEMENTS = configWith([
  { slot: { row: "front", col: 0 }, creatureId: "bumblebolt", level: 1 },
  { slot: { row: "back", col: 1 }, creatureId: "panbud", level: 1 },
]);

describe("ModifierEditor (FR-039)", () => {
  it("keeps the editor out of the page until it is asked for", () => {
    renderEditor(TWO_PLACEMENTS);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByLabelText(/amount to add for/i)).toBeNull();

    const overlay = openOverlay();
    expect(within(overlay).getAllByLabelText(/amount to add for/i).length).toBe(2);
  });

  it("offers no team-wide scope option", () => {
    renderEditor(TWO_PLACEMENTS);
    openOverlay();
    // The engine still supports team-wide modifiers (round 5 routes trinket effectTags through
    // them) -- what's removed is the hand-entry UI for them.
    expect(screen.queryByText(/team-wide/i)).toBeNull();
    expect(screen.queryByLabelText(/modifier scope/i)).toBeNull();
  });

  it("presents one add-control per placed creature, not one global scope dropdown", () => {
    renderEditor(TWO_PLACEMENTS);
    const overlay = openOverlay();
    // (d): the creature a modifier belongs to is structural, not something the user selects.
    expect(within(overlay).getByRole("button", { name: /add modifier to bumblebolt/i })).toBeTruthy();
    expect(within(overlay).getByRole("button", { name: /add modifier to panbud/i })).toBeTruthy();
  });

  it("lays the cells out in the board's three columns", () => {
    // FR-079: a cell sits where its creature sits, which needs all six slots rendered -- the two
    // placed creatures above plus four empty markers.
    renderEditor(TWO_PLACEMENTS);
    const overlay = openOverlay();
    const cells = within(overlay).getByRole("list", { name: /modifiers by grid slot/i });
    expect(cells.children.length).toBe(6);
  });

  it("uses short stat labels, with the unit convention as supporting text", () => {
    renderEditor(TWO_PLACEMENTS);
    const overlay = openOverlay();
    const statSelect = within(overlay).getByLabelText(/stat to modify for bumblebolt/i) as HTMLSelectElement;
    const labels = Array.from(statSelect.options).map((o) => o.textContent ?? "");
    expect(labels).toContain("Cooldown Speed (%)");
    // (c): an option label carries its UNIT, never a worked example. "enter 0.2 for +20%" inside a
    // dropdown is unreadable without opening it.
    expect(labels.some((l) => l.includes("0.2") || l.includes("decimal") || l.includes("enter"))).toBe(false);
    // ...but the convention must still be stated somewhere. Matched on the container's full
    // textContent, since the note interleaves <code> and <strong> and so spans several text nodes.
    // Matched on the paragraph's own text, not the <strong> inside it.
    const note = within(overlay).getByText(/always means better output/i);
    expect(note.textContent).toMatch(/20/);
    expect(note.textContent).toMatch(/one second sooner/i);
  });

  /**
   * 2026-10-07, both user-reported, and both about the engine's units being the wrong thing to type.
   *
   * The percentage was a raw decimal, so +20% meant typing `0.2` — which reads as a typo in a column
   * of plain numbers. And a positive Cooldown second made the creature SLOWER: entering 1 alongside
   * +20% speed took Shelldra from 4.5s to 4.75s, which was reported as a trinket applying backwards.
   */
  describe("units are the user's, not the engine's", () => {
    function addModifier(overlay: HTMLElement, label: string, typed: string) {
      fireEvent.change(within(overlay).getByLabelText(/stat to modify for bumblebolt/i), {
        target: { value: label },
      });
      fireEvent.change(within(overlay).getByLabelText(/amount to add for bumblebolt/i), { target: { value: typed } });
      fireEvent.click(within(overlay).getByRole("button", { name: /add modifier to bumblebolt/i }));
    }

    it("takes Cooldown Speed as a whole percentage and shows it back as one", () => {
      renderEditor(TWO_PLACEMENTS);
      const overlay = openOverlay();
      addModifier(overlay, "cooldownSpeedAdd", "20");

      // The engine still stores the 0.2 its formula divides by; only the keyboard and the chip changed.
      expect(within(overlay).getByText("Cooldown Speed +20%")).toBeTruthy();
      expect(within(overlay).queryByText(/\+0\.2\b/)).toBeNull();
    });

    it("takes a Cooldown entry as a REDUCTION, so a positive number casts sooner", () => {
      renderEditor(TWO_PLACEMENTS);
      const overlay = openOverlay();
      addModifier(overlay, "cooldownFlatAddSeconds", "1");

      // Stored negative, because `effectiveCooldown` ADDS this term: -1s is one second sooner.
      expect(within(overlay).getByText("Cooldown -1s")).toBeTruthy();
    });

    it("still reaches the other direction with a negative entry", () => {
      // Which is what keeps "give a creature with no published cooldown a cast cycle" possible.
      renderEditor(TWO_PLACEMENTS);
      const overlay = openOverlay();
      addModifier(overlay, "cooldownFlatAddSeconds", "-2");

      expect(within(overlay).getByText("Cooldown +2s")).toBeTruthy();
    });
  });

  it("adds a modifier scoped to the creature whose row it was entered on", () => {
    renderEditor(TWO_PLACEMENTS);
    const overlay = openOverlay();

    fireEvent.change(within(overlay).getByLabelText(/amount to add for bumblebolt/i), {
      target: { value: "7" },
    });
    fireEvent.click(within(overlay).getByRole("button", { name: /add modifier to bumblebolt/i }));

    expect(within(overlay).getByText(/Damage \+7/)).toBeTruthy();
    // Scoped: Panbud's cell is untouched, so its only text about damage is its own empty control.
    expect(
      within(overlay).queryByRole("button", { name: /remove damage modifier from panbud/i }),
    ).toBeNull();
  });

  /**
   * The panel briefly summarised each modifier as a removable chip. The user's objection is the
   * reason this asserts the opposite now: the chips changed the panel's height as modifiers were
   * added and removed, so the team grid directly below it moved while they were working in it. A
   * count is fixed-shape; a list is not.
   */
  it("shows a count on the panel, and nothing on it that can change its height", () => {
    renderEditor(TWO_PLACEMENTS);
    const overlay = openOverlay();
    fireEvent.change(within(overlay).getByLabelText(/amount to add for panbud/i), { target: { value: "5" } });
    fireEvent.click(within(overlay).getByRole("button", { name: /add modifier to panbud/i }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(screen.getByRole("button", { name: /edit modifiers/i }).textContent).toMatch(/1 active/);
    expect(screen.queryByText(/Damage \+5/)).toBeNull();
    expect(screen.queryByRole("button", { name: /remove damage modifier from panbud/i })).toBeNull();
  });

  it("the panel is itself the control that opens the editor", () => {
    // Not a panel CONTAINING a button: the outer box looked clickable and wasn't, which is what the
    // user reported. One pressable thing, which also means one tab stop.
    renderEditor(TWO_PLACEMENTS);
    const panel = screen.getByRole("button", { name: /edit modifiers/i });
    expect(panel.textContent).toContain("Modifiers");
    expect(panel.querySelector("button")).toBeNull();
    expect(panel.getAttribute("aria-haspopup")).toBe("dialog");
  });

  it("states why there is nothing to edit, rather than opening an empty overlay", () => {
    renderEditor(configWith([]));
    // The reason rides in the panel's own hint, because a fixed-shape panel has nowhere else to put
    // it — a line of prose below the panel was the thing that could grow.
    expect(screen.getByText(/place a batomon/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: /edit modifiers/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
