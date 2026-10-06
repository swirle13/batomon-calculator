import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TrinketPicker } from "../GridPicker/TrinketPicker";
import { CreatureSearchModal } from "../GridPicker/CreatureSearchModal";
import { TeamSummary } from "../TeamSummary/TeamSummary";
import { CorpusBrowser } from "../CorpusBrowser/CorpusBrowser";
import { TeamConfigProvider } from "../../context/TeamConfigContext";
import { simulate } from "../../engine/simulate";
import { corpus } from "../../data/corpus";
import type { TeamConfiguration } from "../../data/types";

/**
 * Tripwires for the round-6 presentation items that would otherwise have **no** automated coverage
 * at all (tasks.md T139, user items 1, 2, 4, 10, 13).
 *
 * These are deliberately small. The point is not exhaustive coverage of layout — it is that a
 * future change which silently undoes one of these user requests fails a test by name instead of
 * being noticed (or not) by eye three rounds later. Several of this round's own findings were
 * requests that had quietly survived from an earlier round's "verified manually" pass.
 */

const CONFIG: TeamConfiguration = {
  placements: [{ slot: { row: "front", col: 0 }, creatureId: "bumblebolt", level: 1 }],
  trainerId: null,
  trinketIds: [],
  itemIds: [],
  simulationWindowSeconds: 20,
  teamModifiers: [],
};

describe("TrinketPicker (FR-032, item 4)", () => {
  it("is not a dropdown of names, and shows each trinket's full effect text", () => {
    render(
      <TeamConfigProvider initialConfig={CONFIG}>
        <TrinketPicker />
      </TeamConfigProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /choose trinkets/i }));

    const dialog = screen.getByRole("dialog", { name: /choose trinkets/i });
    // The whole point of item 4: a <select> of 93 names could show neither sprite nor effect.
    expect(dialog.querySelectorAll("option").length).toBeLessThan(
      corpus.trinkets.length,
    );
    // Matched on a distinctive fragment: several trinkets' effectText embeds a trigger line and a
    // newline ("On Victory\nYour team gains +5 Damage permanently."), which the DOM collapses.
    expect(screen.getByText(/Your team gains \+5 Damage permanently/)).toBeTruthy();
  });

  it("marks the trinkets whose effects actually reach the simulation", () => {
    render(
      <TeamConfigProvider initialConfig={CONFIG}>
        <TrinketPicker />
      </TeamConfigProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /choose trinkets/i }));
    // 6 of 93 are engine-wired; that honest distinction predates this round and must survive it.
    expect(screen.getAllByText(/affects DPS/i).length).toBeGreaterThan(0);
  });
});

describe("CreatureSearchModal heading (FR-034, item 13)", () => {
  it("shows no slot position in the visible heading, but keeps it for assistive tech", () => {
    render(<CreatureSearchModal slot={{ row: "back", col: 1 }} onClose={() => {}} onSelect={() => {}} />);
    expect(screen.getByRole("heading", { name: "Choose a Banto" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /back row, slot/i })).toBeNull();
    // The user clicked the slot so they know which it is; a screen-reader user may not have.
    expect(screen.getByRole("dialog").getAttribute("aria-label")).toMatch(/back row, slot 2/i);
  });
});

describe("TeamSummary layout (FR-038, item 10)", () => {
  it("renders both tables inside one shared container, not two separate blocks", () => {
    const result = simulate(CONFIG, corpus);
    const { container } = render(<TeamSummary config={CONFIG} result={result} />);
    const tables = container.querySelectorAll("table");
    expect(tables.length).toBe(2);
    // Side by side as one aligned unit: both tables share a single parent element.
    expect(tables[0]!.parentElement).toBe(tables[1]!.parentElement);
  });
});

describe("CorpusBrowser (FR-028/FR-030, items 1-3)", () => {
  it("renders no source-citation or source-conflict disclosures", () => {
    render(<CorpusBrowser />);
    expect(screen.queryByText(/sources & patch/i)).toBeNull();
    expect(screen.queryByText(/recorded source conflicts/i)).toBeNull();
    // ...while the data itself is untouched and still asserted by provenance.test.ts.
    expect(corpus.creatures.every((c) => c.sourceRefs.length > 0)).toBe(true);
  });

  it("puts cooldown and damage on separate lines rather than one combined line", () => {
    const { container } = render(<CorpusBrowser />);
    // Item 1's specific complaint: "It displays cost, cooldown, and damage all on the same line".
    const combined = Array.from(container.querySelectorAll("*")).filter((el) => {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? "")
        .join("");
      return /Cost \$.*Cooldown.*Damage/i.test(own);
    });
    expect(combined).toEqual([]);
  });
});
