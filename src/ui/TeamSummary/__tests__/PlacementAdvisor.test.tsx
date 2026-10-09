import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlacementAdvisor } from "../PlacementAdvisor";
import { TeamConfigProvider } from "../../../context/TeamConfigContext";
import { useTeamConfig } from "../../../context/teamConfig";
import { corpus } from "../../../data/corpus";
import { suggestPlacement } from "../../../engine/optimize";
import { computePlacementAdvice } from "../../../engine/placementAdvice";
import { simulate } from "../../../engine/simulate";
import { slotKey } from "../../../engine/grid";
import { GridRow } from "../../../data/enums";
import { Species } from "../../../data/ids";
import type { TeamConfiguration } from "../../../data/types";

/**
 * 2026-10-08, user-reported. "Apply this arrangement" walked the suggestion calling
 * `movePlacement` once per creature against a stale `config`, and `movePlacement` SWAPS onto an
 * occupied slot — so a multi-creature cycle collapsed into a single pairwise swap. The board
 * therefore never matched the suggestion that had just been applied, and the advisor proposed a
 * fresh rearrangement every time: two suggestions alternating forever, each claiming to beat the
 * other. The search was correct throughout; only the apply was wrong.
 */
const CONFIG: TeamConfiguration = {
  placements: [
    { slot: { row: GridRow.Top, col: 0 }, creatureId: Species.Venopuff, level: 1 },
    { slot: { row: GridRow.Top, col: 1 }, creatureId: Species.Rattleghast, level: 1 },
    { slot: { row: GridRow.Top, col: 2 }, creatureId: Species.Shikitsune, level: 1 },
    { slot: { row: GridRow.Bottom, col: 0 }, creatureId: Species.Pebbler, level: 2 },
    { slot: { row: GridRow.Bottom, col: 1 }, creatureId: Species.Brawlmantis, level: 1 },
    { slot: { row: GridRow.Bottom, col: 2 }, creatureId: Species.Craghorn, level: 1 },
  ],
  trainerId: null,
  trinketIds: [],
  itemIds: [],
  simulationWindowSeconds: 30,
  teamModifiers: [],
};

/** Reads the live board back out of context, which is what "did it apply?" actually asks. */
function Board() {
  const { config } = useTeamConfig();
  return (
    <output data-testid="board">
      {[...config.placements]
        .map((p) => `${slotKey(p.slot)}=${p.creatureId}`)
        .sort()
        .join(" ")}
    </output>
  );
}

/**
 * The advisor reads the board from context but takes the simulation result as a prop, because the
 * Calculator view already has one and nothing in this app simulates the same board twice. Follows
 * the live config so the exclusions it renders describe the board after an apply, not before it.
 */
function Advisor() {
  const { config } = useTeamConfig();
  return <PlacementAdvisor result={simulate(config, corpus)} />;
}

function renderAdvisor() {
  render(
    <TeamConfigProvider initialConfig={CONFIG}>
      <Advisor />
      <Board />
    </TeamConfigProvider>,
  );
}

const boardText = () => screen.getByTestId("board").textContent;

const asBoardText = (placements: TeamConfiguration["placements"]) =>
  placements
    .map((p) => `${slotKey(p.slot)}=${p.creatureId}`)
    .sort()
    .join(" ");

describe("PlacementAdvisor apply (FR-069)", () => {
  it("puts every Batomon in the slot it named, and then has nothing left to suggest", () => {
    const expected = suggestPlacement(CONFIG, corpus).placements;
    expect(expected).not.toBeNull();
    // The scenario only tests anything if the suggestion is a cycle rather than a single swap —
    // a lone pairwise swap is the one case the old sequential apply happened to get right.
    const currentBySlot = new Map(CONFIG.placements.map((p) => [slotKey(p.slot), p.creatureId]));
    const moved = expected!.filter((p) => currentBySlot.get(slotKey(p.slot)) !== p.creatureId);
    expect(moved.length).toBeGreaterThan(2);

    renderAdvisor();
    fireEvent.click(screen.getByRole("button", { name: /apply this arrangement/i }));

    expect(boardText()).toBe(asBoardText(expected!));
    // The loop is closed: having applied the best arrangement, nothing beats it, so the advisor
    // cannot bounce back to the board we just left.
    expect(suggestPlacement({ ...CONFIG, placements: expected! }, corpus).placements).toBeNull();
    expect(screen.queryByRole("button", { name: /apply this arrangement/i })).toBeNull();
  });

  it("lists only the Batomon that actually move", () => {
    renderAdvisor();
    const items = Array.from(document.querySelectorAll("li")).map((li) => li.textContent ?? "");
    expect(items.length).toBeGreaterThan(0);
    // A line naming a slot its creature already occupies reads as the advisor instructing the user
    // to leave something exactly where it is, which is how the suggestion looked self-contradictory.
    for (const text of items) {
      const tellsItToStay = CONFIG.placements.some((p) => {
        const name = corpus.creatures.find((c) => c.id === p.creatureId)!.name;
        const row = p.slot.row === GridRow.Top ? "top" : "bottom";
        return text.includes(name) && text.includes(`${row} row, slot ${p.slot.col + 1}`);
      });
      expect(tellsItToStay).toBe(false);
    }
  });

  it("quotes the gain as DPS average, the figure shown elsewhere in the app", () => {
    renderAdvisor();
    // A bare "+77.7% weighted output" maps to no number the user can see anywhere else in the app.
    expect(screen.getAllByText(/DPS average/i).length).toBeGreaterThan(0);
  });
});

/**
 * The bench section (2026-10-08). The user's actual question is "is the one in the shop better
 * than what I have", and until this existed the only way to find out was to sell something.
 */
describe("PlacementAdvisor bench advice", () => {
  const withBench: TeamConfiguration = {
    ...CONFIG,
    bench: [{ index: 0, creatureId: Species.Thorntail, level: 4 }],
  };

  function renderWithBench(config: TeamConfiguration = withBench) {
    render(
      <TeamConfigProvider initialConfig={config}>
        <Advisor />
        <Board />
      </TeamConfigProvider>,
    );
  }

  it("says nothing about a bench when there is nothing on it", () => {
    renderAdvisor();
    expect(screen.queryByText(/from your bench/i)).toBeNull();
  });

  it("ranks each benched Batomon by what swapping it in is worth", () => {
    renderWithBench();
    expect(screen.getByText(/from your bench/i)).toBeTruthy();
    expect(screen.getByText("Thorntail Lv.4")).toBeTruthy();
    // The number has to be a DELTA against the current board, or it is not a comparison.
    expect(screen.getByText(/one swap at a time/i)).toBeTruthy();
  });

  it("summarises the bench's gain in the COLLAPSED header, not only inside the panel", () => {
    /*
     * 2026-10-08, user-reported. The header read "(none)" while the panel underneath it listed
     * four swaps and an Apply button taking the board from 116 to 201 DPS. The header was not
     * wrong about its own search — rearranging really did gain nothing — it had just never been
     * told a second search existed.
     *
     * This matters more than a cosmetic mismatch: the panel is collapsed by default, so a header
     * saying "(none)" is a panel nobody opens, and a correct answer behind a wrong summary is the
     * same as no answer at all.
     *
     * A board with NO better arrangement is the case that exposed it, so the fixture pins that:
     * `suggestPlacement` must find nothing, leaving the bench as the only thing to report.
     */
    const settled = suggestPlacement(CONFIG, corpus).placements ?? CONFIG.placements;
    const noRearrangement: TeamConfiguration = {
      ...CONFIG,
      placements: settled,
      bench: [{ index: 0, creatureId: Species.Thorntail, level: 4 }],
    };
    expect(suggestPlacement(noRearrangement, corpus).placements).toBeNull();

    renderWithBench(noRearrangement);

    const header = document.querySelector("summary")!;
    expect(header.textContent).not.toMatch(/\(none/);
    expect(header.textContent).toMatch(/DPS average/);
  });

  it("still says so plainly when nothing anywhere beats the current board", () => {
    // The honesty requirement is not traded away for the fix above: an empty bench and a settled
    // board must still read as "(none)" rather than quoting a gain of zero as if it were one.
    const settled = suggestPlacement(CONFIG, corpus).placements ?? CONFIG.placements;
    renderWithBench({ ...CONFIG, placements: settled, bench: [] });
    expect(document.querySelector("summary")!.textContent).toMatch(/\(none/);
  });

  it("applies a lineup as one write, moving the displaced Batomon to the bench", () => {
    /*
     * The failure this guards is the bench's version of the apply bug above: writing
     * `placements` without `bench` would leave whoever the lineup displaced in neither, i.e.
     * deleted — the single outcome a bench exists to prevent.
     */
    renderWithBench();
    const apply = screen.queryByRole("button", { name: /apply this lineup/i });
    expect(apply).not.toBeNull();

    fireEvent.click(apply!);

    // Thorntail came on, and the board still holds six: somebody went to the bench, not away.
    expect(boardText()).toContain(Species.Thorntail);
    expect(boardText()!.split(" ")).toHaveLength(6);
  });

  it("offers the damage-maximal lineup as a second plan, applied by its own button", () => {
    /*
     * 2026-10-09, user-reported. The recommendation is chosen on a survivability-weighted score
     * and its heading quotes DPS, so a lineup with strictly more damage could exist, be found, be
     * priced and be declined without ever appearing on screen — see `engine/rosterAdvice.ts`.
     *
     * Two buttons applying two different boards is the point of the test: a single shared
     * "Apply this lineup" would make whichever one the user clicked a coin toss.
     */
    const advice = computePlacementAdvice(withBench, corpus);
    const damageMax = advice.bench!.highestDpsLineup;
    expect(damageMax).not.toBeNull();
    expect(damageMax!.dps).toBeGreaterThan(advice.bench!.lineup!.dps);

    renderWithBench();
    expect(screen.getByText(/most damage you own/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /apply the max-damage lineup/i }));
    expect(boardText()).toBe(asBoardText(damageMax!.placements));
  });
});

/**
 * Merges (2026-10-09, user-reported): "I'm trying to tell if levelling up Lignite would be worth
 * it." Every other figure in the panel treats a level as given, so this was the one question about
 * the roster the tool could not answer.
 */
describe("PlacementAdvisor merge advice", () => {
  /** Three Lignite Lv.1 — one placed, two benched — which is exactly one Lv.2's worth. */
  const withCopies: TeamConfiguration = {
    ...CONFIG,
    placements: [
      ...CONFIG.placements.slice(0, 5),
      { slot: { row: GridRow.Bottom, col: 2 }, creatureId: Species.Lignite, level: 1 },
    ],
    bench: [
      { index: 0, creatureId: Species.Lignite, level: 1 },
      { index: 1, creatureId: Species.Lignite, level: 1 },
    ],
  };

  function renderWith(config: TeamConfiguration) {
    render(
      <TeamConfigProvider initialConfig={config}>
        <Advisor />
        <Board />
      </TeamConfigProvider>,
    );
  }

  it("says nothing when the roster cannot pay for a merge", () => {
    // The gate the user asked for: offered only when enough copies exist. Two is not enough.
    renderWith({ ...withCopies, bench: [{ index: 0, creatureId: Species.Lignite, level: 1 }] });
    expect(screen.queryByText(/level up by merging/i)).toBeNull();
  });

  it("offers the merge, and states what it spends as well as what it gains", () => {
    renderWith(withCopies);
    expect(screen.getByText(/level up by merging/i)).toBeTruthy();
    expect(screen.getByText(/Lignite Lv.1 ×3/)).toBeTruthy();
    // The price in monsters, which is the half of the decision a DPS delta cannot carry.
    expect(screen.getByText(/spends 2 more copies/i)).toBeTruthy();
  });

  it("applies the merge as one write, spending the copies and levelling the survivor", () => {
    renderWith(withCopies);
    fireEvent.click(screen.getByRole("button", { name: /merge into Lignite Lv\.2/i }));

    // One Lignite left, and the two benched copies are gone rather than stranded.
    const board = boardText()!;
    expect(board.match(/lignite/g) ?? []).toHaveLength(1);
    expect(screen.queryByText(/level up by merging/i)).toBeNull();
  });

  it("counts the merge in the COLLAPSED header, like every other kind of advice", () => {
    // The lesson `bestOutcomeHint` exists to record: a third search added to the body and not the
    // header would put "(none)" above a panel holding a button.
    renderWith(withCopies);
    expect(document.querySelector("summary")!.textContent).not.toMatch(/\(none/);
  });
});
