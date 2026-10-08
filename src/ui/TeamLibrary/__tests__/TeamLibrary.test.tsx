import { beforeEach, describe, expect, it } from "vitest";
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
      slot: { row: GridRow.Front, col: index as 0 | 1 | 2 },
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
  const { config, replaceConfig } = useTeamConfig();
  return (
    <>
      <div data-testid="board">{config.placements.map((p) => p.creatureId).join(",")}</div>
      <button type="button" onClick={() => replaceConfig(TEAM_A)}>
        set A
      </button>
      <button type="button" onClick={() => replaceConfig(TEAM_B)}>
        set B
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

describe("runs", () => {
  it("files saves into the active run and numbers them day by day", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "New run" }));
    fireEvent.change(screen.getByLabelText("New run name"), { target: { value: "NL run 1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    // A new run is the active one, so the name and position fields now describe a position in it.
    expect(screen.getByLabelText("Team name")).toHaveValue("Round 1, day 1");

    fireEvent.click(screen.getByRole("button", { name: "set A" }));
    fireEvent.click(screen.getByRole("button", { name: "Save this board" }));
    fireEvent.click(screen.getByRole("button", { name: "set B" }));
    fireEvent.click(screen.getByRole("button", { name: "Save this board" }));

    // By the heading rather than the text, which also appears as the run select's chosen option.
    const group = screen.getByText("NL run 1", { selector: "span" }).closest("section");
    expect(group).not.toBeNull();
    expect(within(group!).getByText("R1·D1")).toBeInTheDocument();
    expect(within(group!).getByText("R1·D2")).toBeInTheDocument();
  });

  it("keeps the teams when the run holding them is deleted", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "New run" }));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    fireEvent.click(screen.getByRole("button", { name: "set A" }));
    fireEvent.click(screen.getByRole("button", { name: "Save this board" }));

    fireEvent.click(screen.getByRole("button", { name: "Delete run" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete run, keep teams" }));

    expect(screen.getByText("Unfiled")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load" })).toBeInTheDocument();
  });
});
