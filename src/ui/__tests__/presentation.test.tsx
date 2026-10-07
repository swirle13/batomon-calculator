import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TrinketPicker } from "../GridPicker/TrinketPicker";
import { CreatureSearchModal } from "../GridPicker/CreatureSearchModal";
import { TeamSummary } from "../TeamSummary/TeamSummary";
import { CorpusBrowser } from "../CorpusBrowser/CorpusBrowser";
import App from "../../App";
import { TotalDps } from "../TeamSummary/TotalDps";
import { TeamConfigProvider } from "../../context/TeamConfigContext";
import { PlacedCreatureDetails } from "../TeamSummary/PlacedCreatureDetails";
import { GridPicker } from "../GridPicker/GridPicker";
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
    expect(screen.getByRole("heading", { name: "Choose a Batomon" })).toBeTruthy();
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

/**
 * Round-7 coverage for the items that otherwise had none (tasks.md T173). Thirteen of this round's
 * twenty items would have been verified only by a by-hand walk — the same "verified by eye" gap
 * that let item 8's completely dead click handler survive an entire round of CI.
 *
 * Note these assert POSITIVES. A prior round's copy test only asserted the *absence* of the wrong
 * string, which passes just as happily if the right string never renders either.
 */
describe("round 7 presentation fixes", () => {
  it("names the creatures 'Batomon', positively (FR-042, items 2 + 9)", () => {
    render(
      <TeamConfigProvider initialConfig={CONFIG}>
        <PlacedCreatureDetails result={simulate(CONFIG, corpus)} highlightedSlot={null} />
      </TeamConfigProvider>,
    );
    render(<CreatureSearchModal slot={{ row: "back", col: 1 }} onClose={() => {}} onSelect={() => {}} />);
    expect(screen.getByRole("heading", { name: "Choose a Batomon" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Banto\b/);
  });

  it("shows no corpus-snapshot prose in the browser, and keeps the version in the footer (FR-014/FR-070)", () => {
    // Round 8 (WI-014): the prose the user objected to is gone from the browser. FR-014 still needs
    // a home, so the version moved to a footer rather than being dropped -- its third relocation.
    const { unmount } = render(<CorpusBrowser />);
    expect(screen.queryByText(/Corpus snapshot:/)).toBeNull();
    unmount();
    render(<App />);
    expect(screen.getByText(/Balance 24/)).toBeTruthy();
  });

  it("renders the split type background without a gradient (FR-049, item 11)", () => {
    render(<CreatureSearchModal slot={{ row: "back", col: 0 }} onClose={() => {}} onSelect={() => {}} />);
    // The sliver came from a linear-gradient painted across the border box. Two explicit halves
    // cannot reproduce it, so the absence of any gradient is the structural guarantee.
    const withGradient = Array.from(document.querySelectorAll<HTMLElement>("[style]")).filter((el) =>
      (el.getAttribute("style") ?? "").includes("linear-gradient"),
    );
    expect(withGradient).toEqual([]);
  });

  it("groups picker results into rarity sections and puts no rarity text on the cards (FR-048, item 10)", () => {
    render(<CreatureSearchModal slot={{ row: "back", col: 0 }} onClose={() => {}} onSelect={() => {}} />);
    expect(screen.getAllByRole("heading", { level: 4 }).length).toBeGreaterThan(1);
    // Rarity is structure now, not a per-card label; the only "Common" text should be headings
    // and the filter <option>, never inside a result card.
    const cardTexts = Array.from(document.querySelectorAll("button")).map((b) => b.textContent ?? "");
    expect(cardTexts.some((t) => /Common|Rare|Mythical/.test(t))).toBe(false);
  });

  it("renders grid sprites at the shared token size, not a per-call-site literal (FR-053, item 18)", () => {
    render(
      <TeamConfigProvider initialConfig={CONFIG}>
        <GridPicker onHighlightSlot={() => {}} />
      </TeamConfigProvider>,
    );
    const sprite = screen.getByRole("img", { name: "Bumblebolt" });
    // 64 is the token default (jsdom resolves no CSS custom property), up from an arbitrary 40.
    expect(sprite.getAttribute("width")).toBe("64");
  });

  it("shows cooldown at one decimal on both bands (FR-044, item 4)", () => {
    render(
      <TeamConfigProvider initialConfig={CONFIG}>
        <PlacedCreatureDetails result={simulate(CONFIG, corpus)} highlightedSlot={null} />
      </TeamConfigProvider>,
    );
    // Bumblebolt's cooldown is 2.5s. Both the base band and "Effective this battle" must agree;
    // they used to render 2.5 and 2.50 one above the other.
    expect(screen.getAllByText("2.5").length).toBe(2);
    expect(screen.queryByText("2.50")).toBeNull();
  });

  it("reports Shield without the over-qualifying parenthetical (FR-046, item 7)", () => {
    const shieldConfig = { ...CONFIG, placements: [{ slot: { row: "back", col: 0 } as const, creatureId: "opalion", level: 1 as const }] };
    render(<TeamSummary config={shieldConfig} result={simulate(shieldConfig, corpus)} />);
    expect(screen.queryByText(/Shield \(granted\)/)).toBeNull();
    expect(screen.getByText("Shield")).toBeTruthy();
  });

  it("reports second-order status metrics, not just one averaged figure (FR-055, item 20)", () => {
    const poison = { ...CONFIG, placements: [{ slot: { row: "back", col: 0 } as const, creatureId: "drumire", level: 1 as const }] };
    render(<TeamSummary config={poison} result={simulate(poison, corpus)} />);
    // getAllByText: earlier cases in this file also render a TeamSummary, so the header text can
    // legitimately appear more than once in the shared DOM.
    expect(screen.getAllByText(/Dmg\/s \(avg\)/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Dmg\/s \(end\)/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Applied\/s/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Growth\/s/).length).toBeGreaterThan(0);
  });
});

/**
 * Round 9 (FR-071/FR-072/FR-076): the headline total, the table total row, and the grid width fix.
 */
describe("round 9: total DPS and grid sizing", () => {
  /** The user's own team: four Poison creatures, zero direct damage. */
  const poisonTeam: TeamConfiguration = {
    placements: [
      { slot: { row: "front", col: 1 }, creatureId: "miasmaw", level: 1 },
      { slot: { row: "front", col: 2 }, creatureId: "cobrex", level: 1 },
      { slot: { row: "back", col: 0 }, creatureId: "drumire", level: 1 },
      { slot: { row: "back", col: 1 }, creatureId: "fumungus", level: 1 },
    ],
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: 20,
    teamModifiers: [],
  };

  it("shows a non-zero headline total for a team whose every DPS row reads 0.00 (FR-072)", () => {
    const result = simulate(poisonTeam, corpus);
    // The defect this fixes: perCreatureDps counts DIRECT damage only, so this team reads 0.00
    // everywhere while dealing ~136.6/s.
    expect(Object.keys(result.perCreatureDps).length).toBe(0);
    render(<TotalDps config={poisonTeam} result={result} />);
    // RE-DERIVED round 9 (T202/T200b), not re-baselined. This read 136.60 while every creature
    // ability on this board was inert. With the effect resolver and the event-driven scheduler,
    // Miasmaw applies Poison 336 instead of 10 and Cobrex fires at t=9.1 instead of t=15, so the
    // team's real output is 1155.70/s. The ~8.5x jump IS the answer to the user's "I think the DPS
    // measurement is off" -- it was, by that factor, for this archetype.
    expect(screen.getByText("1155.70")).toBeTruthy();
  });

  it("states the engine's coverage ceiling right where the number is (FR-075)", () => {
    const result = simulate(poisonTeam, corpus);
    render(<TotalDps config={poisonTeam} result={result} />);
    // A DPS figure reads as authoritative, so the limit must sit beside it rather than elsewhere.
    expect(screen.getByText(/engine can act on|engine acts on/)).toBeTruthy();
  });

  it("adds a total row to the per-creature table (FR-072 / WI-002)", () => {
    const result = simulate(poisonTeam, corpus);
    render(<TeamSummary config={poisonTeam} result={result} />);
    expect(screen.getByRole("rowheader", { name: "Total" })).toBeTruthy();
  });
});
