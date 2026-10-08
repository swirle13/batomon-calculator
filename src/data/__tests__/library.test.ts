import { describe, expect, it } from "vitest";
import { GridRow } from "../enums";
import { Species } from "../ids";
import {
  LIBRARY_STORAGE_KEY,
  createRun,
  deleteRun,
  deleteTeam,
  emptyLibrary,
  findDuplicate,
  nextPosition,
  readLibrary,
  renameTeam,
  saveTeam,
  setRunOutcome,
  teamsForRun,
  writeLibrary,
  type Library,
} from "../library";
import type { TeamConfiguration } from "../types";

/**
 * The library's rules, exercised without a DOM — which is the reason every mutation in
 * `library.ts` is a pure function of a `Library` rather than a method on a hook.
 */

function config(...species: Species[]): TeamConfiguration {
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

/** A `Storage` that is a Map, so a test can read what was written without touching jsdom's. */
function fakeStorage(seed: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(seed));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

describe("run numbering", () => {
  it("starts a new run at round 1, day 1", () => {
    const { library, run } = createRun(emptyLibrary(), "NL run 1");
    expect(nextPosition(library, run.id)).toEqual({ round: 1, day: 1 });
  });

  it("advances the day within the run's current round", () => {
    const { library: withRun, run } = createRun(emptyLibrary(), "NL run 1");
    const { library } = saveTeam(withRun, {
      name: "Round 1, day 1",
      config: config(Species.Venopuff),
      runId: run.id,
      round: 1,
      day: 1,
    });
    expect(nextPosition(library, run.id)).toEqual({ round: 1, day: 2 });
  });

  it("follows the HIGHEST round, not the most recently saved one", () => {
    // A board filed retroactively into round 1 must not drag the next save back there with it.
    const { library: withRun, run } = createRun(emptyLibrary(), "NL run 1");
    const { library: a } = saveTeam(withRun, { name: "r2d3", config: config(Species.Venopuff), runId: run.id, round: 2, day: 3 });
    const { library: b } = saveTeam(a, { name: "r1d2", config: config(Species.Pebbler), runId: run.id, round: 1, day: 2 });
    expect(nextPosition(b, run.id)).toEqual({ round: 2, day: 4 });
  });

  it("numbers each run independently", () => {
    const { library: one, run: runA } = createRun(emptyLibrary(), "A");
    const { library: two, run: runB } = createRun(one, "B");
    const { library } = saveTeam(two, { name: "a1", config: config(Species.Venopuff), runId: runA.id, round: 1, day: 1 });
    expect(nextPosition(library, runB.id)).toEqual({ round: 1, day: 1 });
  });
});

describe("ordering", () => {
  it("lists a run's teams by round then day, whatever order they were saved in", () => {
    const { library: withRun, run } = createRun(emptyLibrary(), "NL run 1");
    const saves: [string, number, number][] = [
      ["r2d1", 2, 1],
      ["r1d1", 1, 1],
      ["r1d2", 1, 2],
    ];
    const library = saves.reduce<Library>(
      (acc, [name, round, day]) =>
        saveTeam(acc, { name, config: config(Species.Venopuff), runId: run.id, round, day }).library,
      withRun,
    );
    expect(teamsForRun(library, run.id).map((team) => team.name)).toEqual(["r1d1", "r1d2", "r2d1"]);
  });

  it("treats 'no run' as a group of its own", () => {
    const { library: withRun, run } = createRun(emptyLibrary(), "NL run 1");
    const { library: a } = saveTeam(withRun, { name: "in run", config: config(Species.Venopuff), runId: run.id, round: 1, day: 1 });
    const { library } = saveTeam(a, { name: "loose", config: config(Species.Pebbler) });
    expect(teamsForRun(library, undefined).map((t) => t.name)).toEqual(["loose"]);
    expect(teamsForRun(library, run.id).map((t) => t.name)).toEqual(["in run"]);
  });
});

describe("mutations", () => {
  it("keeps a deleted run's teams, as loose saves", () => {
    // Discarding the grouping must not discard the boards filed in it.
    const { library: withRun, run } = createRun(emptyLibrary(), "NL run 1");
    const { library: saved } = saveTeam(withRun, { name: "r1d1", config: config(Species.Venopuff), runId: run.id, round: 1, day: 1 });
    const library = deleteRun(saved, run.id);

    expect(library.runs).toEqual([]);
    expect(library.teams).toHaveLength(1);
    expect(library.teams[0]).not.toHaveProperty("runId");
    expect(library.teams[0]).not.toHaveProperty("round");
    expect(teamsForRun(library, undefined)).toHaveLength(1);
  });

  it("clears the active run when that run is deleted", () => {
    const { library, run } = createRun(emptyLibrary(), "NL run 1");
    expect(library.activeRunId).toBe(run.id);
    expect(deleteRun(library, run.id).activeRunId).toBeUndefined();
  });

  it("records an outcome", () => {
    const { library, run } = createRun(emptyLibrary(), "NL run 1");
    expect(setRunOutcome(library, run.id, "win").runs[0]?.outcome).toBe("win");
  });

  it("falls back to a placeholder name rather than saving a blank one", () => {
    const { team } = saveTeam(emptyLibrary(), { name: "   ", config: config(Species.Venopuff) });
    expect(team.name).toBe("Untitled team");
  });

  it("ignores a rename to blank, which is what an accidentally-cleared field sends", () => {
    const { library, team } = saveTeam(emptyLibrary(), { name: "Keep me", config: config(Species.Venopuff) });
    expect(renameTeam(library, team.id, "  ").teams[0]?.name).toBe("Keep me");
  });

  it("deletes one team without touching the rest", () => {
    const { library: a, team } = saveTeam(emptyLibrary(), { name: "go", config: config(Species.Venopuff) });
    const { library: b } = saveTeam(a, { name: "stay", config: config(Species.Pebbler) });
    expect(deleteTeam(b, team.id).teams.map((t) => t.name)).toEqual(["stay"]);
  });
});

describe("duplicate detection", () => {
  it("matches on the board's content, not its name", () => {
    const board = config(Species.Venopuff, Species.Pebbler);
    const { library } = saveTeam(emptyLibrary(), { name: "Monday", config: board });
    expect(findDuplicate(library, board)?.name).toBe("Monday");
    expect(findDuplicate(library, config(Species.Venopuff))).toBeNull();
  });
});

describe("persistence", () => {
  it("round-trips through storage", () => {
    const storage = fakeStorage();
    const { library } = saveTeam(emptyLibrary(), { name: "Saved", config: config(Species.Venopuff) });
    writeLibrary(library, storage);
    expect(readLibrary(storage)).toEqual(library);
  });

  it("returns an empty library rather than throwing on corrupt data", () => {
    // The alternative is an app that will not start until the user clears site data by hand.
    expect(readLibrary(fakeStorage({ [LIBRARY_STORAGE_KEY]: "{not json" }))).toEqual(emptyLibrary());
    expect(readLibrary(fakeStorage({ [LIBRARY_STORAGE_KEY]: '{"version":99,"runs":[],"teams":[]}' }))).toEqual(
      emptyLibrary(),
    );
    expect(readLibrary(fakeStorage({ [LIBRARY_STORAGE_KEY]: '{"teams":"nope"}' }))).toEqual(emptyLibrary());
  });

  it("works with no storage at all, which is what a blocked cookie policy looks like", () => {
    expect(readLibrary(null)).toEqual(emptyLibrary());
    expect(() => writeLibrary(emptyLibrary(), null)).not.toThrow();
  });
});
