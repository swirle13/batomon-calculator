import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { AffectedCreaturePicker, MAX_AFFECTED_SPECIES } from "../AffectedCreaturePicker";
import { TeamConfigProvider } from "../../../../context/TeamConfigContext";
import { distinctCreatures } from "../../../../data/corpus";
import { isInOppositeRegion } from "../../../../data/typing";
import type { TeamConfiguration } from "../../../../data/types";
import { AffectedSpeciesKind, RegionId } from "../../../../data/enums";

/**
 * The affected-species picker (WI-001, WI-002 — orchestration round 6).
 *
 * This surface had **no automated coverage at all** before this file, which is why the round added it
 * alongside the migration: rebuilding a picker with no tests would have been unverifiable, and the
 * round-4 behaviours it has to preserve (FR-088, FR-090) are exactly the kind that break quietly.
 */

function configWith(overrides: Partial<TeamConfiguration> = {}): TeamConfiguration {
  return {
    placements: [],
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: 20,
    teamModifiers: [],
    ...overrides,
  };
}

function openPainted(overrides: Partial<TeamConfiguration> = {}) {
  render(
    <TeamConfigProvider initialConfig={configWith({ trainerId: "painter", ...overrides })}>
      <AffectedCreaturePicker kind={AffectedSpeciesKind.Painted} onClose={() => {}} />
    </TeamConfigProvider>,
  );
  return screen.getByRole("dialog", { name: /painted species/i });
}

/** The section headed "Selected (n/9)", which is where the nine slots live. */
function selectedSection(dialog: HTMLElement): HTMLElement {
  const heading = within(dialog)
    .getAllByRole("heading")
    .find((h) => (h.textContent ?? "").startsWith("Selected"))!;
  return heading.parentElement as HTMLElement;
}

describe("AffectedCreaturePicker (WI-001) — the trinket picker's shape, not a list", () => {
  it("renders species as cards in rarity sections, not as one flat list of rows", () => {
    const dialog = openPainted();
    const headings = within(dialog)
      .getAllByRole("heading")
      // Section headings only; the modal's own title is the other heading in here.
      .filter((h) => h.tagName === "H4")
      .map((h) => (h.textContent ?? "").replace(/\s*\(.*\)\s*$/, ""));
    // Selected first, then the rarity tiers Common -> Mythical, the same order as the other pickers.
    expect(headings).toEqual(["Selected", "Common", "Uncommon", "Rare", "Super Rare", "Legendary", "Mythical"]);
  });

  it("keeps the rarity-shape row, with all five tiers (WI-002 validation finding)", () => {
    // `PAINTER_RARITY_SHAPE` was keyed "Super Rare" while the corpus spells it "SuperRare", so the
    // Super Rare chip was filtered out and the guidance added up to 7 of 9 rather than 9.
    const dialog = openPainted();
    const chips = ["Common 0/2", "Uncommon 0/2", "Rare 0/2", "Super Rare 0/2", "Legendary 0/1"];
    for (const chip of chips) expect(within(dialog).getByText(chip)).toBeTruthy();
  });

  it("keeps a selection across a close and reopen (FR-090 — user-chosen, never generated)", () => {
    const bambudo = distinctCreatures.find((c) => c.name === "Bambudo")!;
    const dialog = openPainted({ paintedCreatureIds: [bambudo.id] });
    expect(within(selectedSection(dialog)).getByRole("button", { name: `Remove ${bambudo.name}` })).toBeTruthy();
  });
});

describe("AffectedCreaturePicker (WI-002) — nine slots, shown and enforced", () => {
  it("renders nine slots including the empty ones, and counts against the cap", () => {
    const dialog = openPainted();
    const section = selectedSection(dialog);
    // The cap is the section's SHAPE, not a number in a sentence: 9 = three rows of OVERLAY_COLUMNS.
    expect(within(section).getAllByText("— empty —").length).toBe(MAX_AFFECTED_SPECIES);
    expect(within(dialog).getByRole("heading", { name: `Selected (0/${MAX_AFFECTED_SPECIES})` })).toBeTruthy();
  });

  it("fills a slot on selection and frees it again on removal", () => {
    const dialog = openPainted();
    const bambudo = distinctCreatures.find((c) => c.name === "Bambudo")!;

    fireEvent.click(within(dialog).getByRole("button", { name: `Add ${bambudo.name}` }));
    let section = selectedSection(dialog);
    expect(within(section).getAllByText("— empty —").length).toBe(MAX_AFFECTED_SPECIES - 1);
    expect(within(dialog).getByRole("heading", { name: `Selected (1/${MAX_AFFECTED_SPECIES})` })).toBeTruthy();

    fireEvent.click(within(section).getByRole("button", { name: `Remove ${bambudo.name}` }));
    section = selectedSection(dialog);
    expect(within(section).getAllByText("— empty —").length).toBe(MAX_AFFECTED_SPECIES);
  });

  it("refuses a tenth species and keeps the nine already chosen", () => {
    const nine = distinctCreatures.slice(0, MAX_AFFECTED_SPECIES).map((c) => c.id);
    const tenth = distinctCreatures[MAX_AFFECTED_SPECIES]!;
    const dialog = openPainted({ paintedCreatureIds: nine });

    expect(within(dialog).getByRole("heading", { name: `Selected (9/${MAX_AFFECTED_SPECIES})` })).toBeTruthy();
    // Refused BEFORE the click, and it says why — a click that silently does nothing reads as a bug,
    // and a silent rotation would drop a species the user chose deliberately.
    const tenthCard = within(dialog).getByRole("button", { name: `Add ${tenth.name}` }) as HTMLButtonElement;
    expect(tenthCard.disabled).toBe(true);
    expect(within(dialog).getByText(/all 9 slots are taken/i)).toBeTruthy();

    fireEvent.click(tenthCard);
    expect(within(dialog).getByRole("heading", { name: `Selected (9/${MAX_AFFECTED_SPECIES})` })).toBeTruthy();
  });
});

describe("AffectedCreaturePicker — Smuggler's pool (FR-088)", () => {
  it("offers only opposite-region species, never the set complement", () => {
    render(
      <TeamConfigProvider initialConfig={configWith({ trainerId: "smuggler", selectedRegion: RegionId.Pantra })}>
        <AffectedCreaturePicker kind={AffectedSpeciesKind.Smuggled} onClose={() => {}} />
      </TeamConfigProvider>,
    );
    const dialog = screen.getByRole("dialog", { name: /smuggled species/i });
    const offered = within(dialog)
      .getAllByRole("button")
      .map((b) => /^Add (.+)$/.exec(b.getAttribute("aria-label") ?? "")?.[1])
      .filter((name): name is string => name !== undefined);

    const expected = distinctCreatures.filter((c) => isInOppositeRegion(c.id, RegionId.Pantra)).map((c) => c.name);
    expect(offered.length).toBe(expected.length);
    // 14 species are in both regions and 13 in neither, so a `!== selectedRegion` filter would wrongly
    // offer all 27 — that difference is the whole point of FR-088.
    expect(new Set(offered)).toEqual(new Set(expected));
    expect(offered.length).toBeLessThan(distinctCreatures.length);
  });

  it("says a region is needed rather than offering an arbitrary pool", () => {
    render(
      <TeamConfigProvider initialConfig={configWith({ trainerId: "smuggler" })}>
        <AffectedCreaturePicker kind={AffectedSpeciesKind.Smuggled} onClose={() => {}} />
      </TeamConfigProvider>,
    );
    expect(screen.getByText(/choose a region first/i)).toBeTruthy();
  });
});
