import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { TeamLibrary } from "../TeamLibrary";
import { TeamConfigProvider } from "../../../context/TeamConfigContext";
import { useTeamConfig } from "../../../context/teamConfig";
import { LIBRARY_STORAGE_KEY } from "../../../data/library";
import { GridRow } from "../../../data/enums";
import { Species } from "../../../data/ids";
import type { TeamConfiguration } from "../../../data/types";

/**
 * The drawer end to end: save the live board, find it on a card, load it back.
 *
 * The round trip is the whole feature — a library that stores a code but cannot restore the board
 * it came from is a text file with extra steps — so these drive the real buttons and read the
 * board back out of context rather than asserting on what was written to storage.
 */

function board(...species: Species[]): TeamConfiguration {
  return {
    placements: species.map((creatureId, index) => ({
      slot: { row: GridRow.Bottom, col: index as 0 | 1 | 2 },
      creatureId,
      level: 1,
    })),
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: 30,
    teamModifiers: [],
  };
}

const TEAM_A = board(Species.Venopuff, Species.Pebbler);
const TEAM_B = board(Species.Brawlmantis);

/** The live board, plus the two controls a test needs to put something on it. */
function Harness() {
  const { config, replaceConfig, setRunDay } = useTeamConfig();
  return (
    <>
      <div data-testid="board">{config.placements.map((p) => p.creatureId).join(",")}</div>
      {/* The run day as the CALCULATOR sees it — `TotalDps` and the cumulative chart read exactly
          this. Rendered here so a test can assert that the library's Day field and the TTK day are
          one value rather than two that happen to agree. */}
      <div data-testid="run-day">{config.runDay}</div>
      <button type="button" onClick={() => replaceConfig(TEAM_A)}>
        set A
      </button>
      <button type="button" onClick={() => replaceConfig(TEAM_B)}>
        set B
      </button>
      <button type="button" onClick={() => setRunDay(12)}>
        set day 12
      </button>
    </>
  );
}

function setup() {
  render(
    <TeamConfigProvider>
      <Harness />
      <TeamLibrary />
    </TeamConfigProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /library/i }));
}

beforeEach(() => {
  localStorage.removeItem(LIBRARY_STORAGE_KEY);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * jsdom's `matchMedia` reports no match for everything, so the component is a desktop drawer in
 * every test unless this says otherwise.
 */
function pretendPhone() {
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    matches: true,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

const drawer = () => document.getElementById("team-library")!;
/** The handle and header are one grip; a test drags it the way a thumb would. */
const grip = () => screen.getByRole("heading", { name: "Library" }).closest("header")!.parentElement!;

function drag(from: number, to: number) {
  fireEvent.pointerDown(grip(), { clientY: from });
  fireEvent.pointerMove(window, { clientY: to });
  fireEvent.pointerUp(window, { clientY: to });
}

describe("saving and loading", () => {
  it("saves the live board and loads it back over a different one", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "set A" }));

    fireEvent.change(screen.getByLabelText("Team name"), { target: { value: "Poison opener" } });
    fireEvent.click(screen.getByRole("button", { name: "Save this board" }));

    // The board is identified by its roster, which is also the card's accessible description of
    // the sprite grid beside it.
    expect(screen.getByText("Poison opener")).toBeInTheDocument();
    expect(screen.getByText("Venopuff, Pebbler")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "set B" }));
    expect(screen.getByTestId("board")).toHaveTextContent("brawlmantis");

    fireEvent.click(screen.getByRole("button", { name: "Load" }));
    expect(screen.getByTestId("board")).toHaveTextContent("venopuff,pebbler");
  });

  it("survives a remount, because the library is what was persisted", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "set A" }));
    fireEvent.change(screen.getByLabelText("Team name"), { target: { value: "Persisted" } });
    fireEvent.click(screen.getByRole("button", { name: "Save this board" }));

    screen.getByText("Persisted");
    document.body.innerHTML = "";
    setup();
    expect(screen.getByText("Persisted")).toBeInTheDocument();
  });

  it("warns when the board on screen is already saved, without preventing a second save", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "set A" }));
    fireEvent.change(screen.getByLabelText("Team name"), { target: { value: "First" } });
    fireEvent.click(screen.getByRole("button", { name: "Save this board" }));

    // Remounted rather than waiting out the "Saved" flash, which takes the status line for a
    // second and a half and is the only thing standing between the two states.
    document.body.innerHTML = "";
    setup();
    fireEvent.click(screen.getByRole("button", { name: "set A" }));
    expect(screen.getByText(/already saved as/i)).toHaveTextContent("First");

    fireEvent.click(screen.getByRole("button", { name: "Save this board" }));
    expect(screen.getAllByRole("button", { name: "Load" })).toHaveLength(2);
  });

  it("lists a run-less board as an entry of its own, not inside a group", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "set A" }));
    fireEvent.change(screen.getByLabelText(/^Run/), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Team name"), { target: { value: "One-off" } });
    fireEvent.click(screen.getByRole("button", { name: "Save this board" }));

    expect(screen.getByText("One-off")).toBeInTheDocument();
    // No disclosure anywhere: there is no group, so there is nothing to expand.
    expect(document.querySelectorAll("summary")).toHaveLength(0);
    // And no day badge, which only means something inside a run.
    expect(screen.queryByText(/^Day \d+$/)).not.toBeInTheDocument();
  });

  it("deletes only on the second press", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "set A" }));
    fireEvent.click(screen.getByRole("button", { name: "Save this board" }));

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.queryByRole("button", { name: "Load" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.queryByRole("button", { name: "Load" })).not.toBeInTheDocument();
  });
});

describe("dismissing", () => {
  it("closes when something outside it is pressed", () => {
    setup();
    fireEvent.pointerDown(screen.getByTestId("board"));
    expect(drawer()).toHaveAttribute("inert");
  });

  it("stays open when something inside it is pressed", () => {
    setup();
    fireEvent.pointerDown(screen.getByLabelText("Team name"));
    expect(drawer()).not.toHaveAttribute("inert");
  });

  it("still shuts from the tab that opened it", () => {
    // The tab is a toggle, so an outside-press rule that counted it would close and immediately
    // reopen the drawer.
    setup();
    fireEvent.pointerDown(screen.getByRole("button", { name: /library/i }));
    fireEvent.click(screen.getByRole("button", { name: /library/i }));
    expect(drawer()).toHaveAttribute("inert");
  });

  it("closes on Escape", () => {
    setup();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(drawer()).toHaveAttribute("inert");
  });
});

describe("the mobile sheet", () => {
  // 2026-10-08, user-reported: the handle invited a drag that did nothing, and the gesture fell
  // through to the page behind the sheet instead.
  it("closes when the grip is pulled far enough down", () => {
    pretendPhone();
    setup();
    expect(drawer()).not.toHaveAttribute("inert");

    drag(100, 300);
    expect(drawer()).toHaveAttribute("inert");
  });

  it("snaps back when the pull is short", () => {
    pretendPhone();
    setup();

    drag(100, 140);
    expect(drawer()).not.toHaveAttribute("inert");
    // The sheet is back where it was rather than left part-way down the screen.
    expect(drawer().style.transform).toBe("");
  });

  it("does not drag on a desktop, where the drawer comes from the side", () => {
    setup();

    drag(100, 400);
    expect(drawer()).not.toHaveAttribute("inert");
  });

  it("leaves Close alone — a press on it is not the start of a drag", () => {
    pretendPhone();
    setup();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(drawer()).toHaveAttribute("inert");
  });
});

describe("runs", () => {
  it("files saves into the active run and numbers them day by day", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "New run" }));
    fireEvent.change(screen.getByLabelText("New run name"), { target: { value: "NL run 1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    // A new run is the active one, so the name and day now describe a position in it.
    expect(screen.getByLabelText("Team name")).toHaveValue("Day 1");
    expect(screen.getByLabelText("Day")).toHaveValue(1);

    fireEvent.click(screen.getByRole("button", { name: "set A" }));
    fireEvent.change(screen.getByLabelText("Team name"), { target: { value: "Opener" } });
    fireEvent.click(screen.getByRole("button", { name: "Save this board" }));

    // The day advanced, and the next suggested name followed it.
    expect(screen.getByLabelText("Day")).toHaveValue(2);
    fireEvent.click(screen.getByRole("button", { name: "set B" }));
    fireEvent.click(screen.getByRole("button", { name: "Save this board" }));

    // By the heading rather than the text, which also appears as the run select's chosen option.
    const group = screen.getByText("NL run 1", { selector: "span" }).closest("section");
    expect(group).not.toBeNull();
    // The named board carries a day badge; the one left at its suggested name does not, because
    // its name already says the same thing.
    expect(within(group!).getByText("Opener")).toBeInTheDocument();
    expect(within(group!).getByText("Day 1")).toBeInTheDocument();
    expect(within(group!).getByText("Day 2")).toBeInTheDocument();
  });

  /**
   * 2026-10-08, user-reported, two asks that turned out to be one: "can we also make the TTK on
   * day X tie into the saved UUID? I keep having to set that value back to day 7 every time I
   * save" and "can the library's Day counter also be tied to the same value".
   *
   * They are the same field now. These drive it from both ends, because the bug that would matter
   * is the two drifting apart again.
   */
  describe("the day is one value, shared with the calculator", () => {
    it("moves the library's Day field when the calculator's day changes", () => {
      setup();
      fireEvent.click(screen.getByRole("button", { name: "New run" }));
      fireEvent.click(screen.getByRole("button", { name: "Create" }));

      fireEvent.click(screen.getByRole("button", { name: "set day 12" }));
      expect(screen.getByLabelText("Day")).toHaveValue(12);
    });

    it("moves the calculator's day when the library's Day field changes", () => {
      setup();
      fireEvent.click(screen.getByRole("button", { name: "New run" }));
      fireEvent.click(screen.getByRole("button", { name: "Create" }));

      const field = screen.getByLabelText("Day");
      fireEvent.change(field, { target: { value: "9" } });
      fireEvent.blur(field);
      expect(screen.getByTestId("run-day")).toHaveTextContent("9");
    });

    it("advances the calculator's day on save, so the TTK aims at the next fight", () => {
      setup();
      fireEvent.click(screen.getByRole("button", { name: "New run" }));
      fireEvent.click(screen.getByRole("button", { name: "Create" }));
      fireEvent.click(screen.getByRole("button", { name: "set A" }));
      fireEvent.click(screen.getByRole("button", { name: "Save this board" }));

      expect(screen.getByTestId("run-day")).toHaveTextContent("2");
    });

    it("restores the day a board was saved on when that board is loaded back", () => {
      setup();
      fireEvent.click(screen.getByRole("button", { name: "New run" }));
      fireEvent.click(screen.getByRole("button", { name: "Create" }));
      fireEvent.click(screen.getByRole("button", { name: "set A" }));
      fireEvent.click(screen.getByRole("button", { name: "set day 12" }));
      fireEvent.click(screen.getByRole("button", { name: "Save this board" }));

      // Saving moved us on to day 13; loading the board back has to return to the day it was for.
      expect(screen.getByTestId("run-day")).toHaveTextContent("13");
      fireEvent.click(screen.getByRole("button", { name: "Load" }));
      expect(screen.getByTestId("run-day")).toHaveTextContent("12");
    });

    it("does not reset the day when the board is replaced without one", () => {
      // `replaceConfig` is how a whole board arrives. A caller with no opinion about the day must
      // not silently re-aim the TTK readout at day 1 — the run has not ended.
      setup();
      fireEvent.click(screen.getByRole("button", { name: "set day 12" }));
      fireEvent.click(screen.getByRole("button", { name: "set B" }));

      expect(screen.getByTestId("run-day")).toHaveTextContent("12");
    });
  });

  it("keeps the teams when the run holding them is deleted", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "New run" }));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    fireEvent.click(screen.getByRole("button", { name: "set A" }));
    fireEvent.click(screen.getByRole("button", { name: "Save this board" }));

    fireEvent.click(screen.getByRole("button", { name: "Delete run" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete run, keep teams" }));

    // The board survives as a top-level entry, with no group heading left standing over it.
    expect(screen.getByRole("button", { name: "Load" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete run" })).not.toBeInTheDocument();
  });
});
