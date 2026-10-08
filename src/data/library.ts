import type { TeamConfiguration } from "./types";
import { buildId, exportBuild } from "./share";

/**
 * The saved-team library: named boards, grouped into runs, persisted in `localStorage`.
 *
 * ## Why a run is a grouping layer rather than a tag
 *
 * A run is the unit of play — one attempt from day 1 to a win or a loss — and the boards inside it
 * are a sequence, not a set. That is why a saved team carries `round` and `day` rather than an
 * ordinal: the numbers are the user's own labels for where they are in the run, they can repeat
 * across runs, and a board saved out of order still files itself in the right place.
 *
 * ## Why run membership lives on the team
 *
 * `runId` is optional, so a team saved with no run selected is simply a team with no `runId` —
 * there is no catch-all "Loose" run to keep in step with the real ones, and deleting a run cannot
 * orphan anything.
 *
 * ## Everything here is a pure function of a `Library`
 *
 * Reading and writing storage are the only two functions that touch the outside world. Every
 * mutation takes a library and returns a new one, which is what makes the rules below — numbering,
 * ordering, what a deleted run does to its teams — testable without a DOM.
 */

export const LIBRARY_STORAGE_KEY = "batomon.library.v1";

/** Bumped only by a change that older data cannot be read as. See `readLibrary`. */
const LIBRARY_VERSION = 1;

/** How a run ended. `in-progress` is the state a run is created in and most runs sit in. */
export type RunOutcome = "in-progress" | "win" | "loss";

export interface Run {
  id: string;
  name: string;
  createdAt: string;
  outcome: RunOutcome;
}

export interface SavedTeam {
  id: string;
  name: string;
  /** The portable `bat1:` code — a SNAPSHOT. Editing the board afterwards does not change it. */
  code: string;
  /**
   * `buildId(config)` at save time. Two saves of the same board share it, which is what lets the
   * UI warn about a duplicate and lets an expensive per-board derivation (sprites, DPS) be cached
   * across every entry that holds the same team.
   */
  buildId: string;
  savedAt: string;
  /** Absent for a team saved outside any run. */
  runId?: string;
  round?: number;
  day?: number;
}

export interface Library {
  version: number;
  runs: Run[];
  teams: SavedTeam[];
  /**
   * The run new saves go into by default. Persisted because the default survives a reload — you
   * are in the same run tomorrow as you were when you closed the tab.
   */
  activeRunId?: string;
}

export function emptyLibrary(): Library {
  return { version: LIBRARY_VERSION, runs: [], teams: [] };
}

function newId(): string {
  // `randomUUID` needs a secure context. The fallback is not a UUID and does not need to be —
  // nothing outside this file reads an id, it only has to be distinct within one library.
  const uuid = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  return uuid ? uuid() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Reading `localStorage` THROWS, rather than returning null, when storage is blocked by a
    // cookie policy or by Safari's private mode.
    return null;
  }
}

/**
 * The stored library, or an empty one.
 *
 * Never throws and never returns a partial library: a corrupt or unreadable record yields an empty
 * one, because the alternative is an app that will not start until the user clears site data by
 * hand. A version mismatch is treated the same way — there is only v1 today, so nothing can be
 * lost to it, and a future bump gets a real migration here rather than inheriting this branch.
 */
export function readLibrary(storage: Storage | null = defaultStorage()): Library {
  if (!storage) return emptyLibrary();
  try {
    const raw = storage.getItem(LIBRARY_STORAGE_KEY);
    if (!raw) return emptyLibrary();
    const parsed: unknown = JSON.parse(raw);
    if (!isLibrary(parsed) || parsed.version !== LIBRARY_VERSION) return emptyLibrary();
    return parsed;
  } catch {
    return emptyLibrary();
  }
}

function isLibrary(value: unknown): value is Library {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Library>;
  return (
    typeof candidate.version === "number" &&
    Array.isArray(candidate.runs) &&
    Array.isArray(candidate.teams)
  );
}

/** Persists the library. Silent on failure — a full quota must not take the save button with it. */
export function writeLibrary(library: Library, storage: Storage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(library));
  } catch {
    // Quota exceeded, or storage disabled between read and write. The in-memory library is still
    // correct for this session, which is the more useful of the two failure modes.
  }
}

/* ------------------------------------- queries -------------------------------------- */

/**
 * A run's teams in play order: round, then day, then the order they were saved in.
 *
 * `undefined` asks for the teams in no run at all, which is a real query rather than a special
 * case — the drawer renders that group exactly like any other.
 */
export function teamsForRun(library: Library, runId: string | undefined): SavedTeam[] {
  return library.teams
    .filter((team) => team.runId === runId)
    .sort(
      (a, b) =>
        (a.round ?? 0) - (b.round ?? 0) ||
        (a.day ?? 0) - (b.day ?? 0) ||
        a.savedAt.localeCompare(b.savedAt),
    );
}

/**
 * Where the next save in this run goes: the run's current round, and the day after its last.
 *
 * "Current round" is the HIGHEST round already saved, not the latest one saved, so a board filed
 * retroactively into round 2 does not drag the next save back there with it. Both numbers are a
 * suggestion the user can overwrite before saving — a round is advanced by typing the next one.
 */
export function nextPosition(library: Library, runId: string | undefined): { round: number; day: number } {
  const teams = teamsForRun(library, runId);
  if (teams.length === 0) return { round: 1, day: 1 };
  const round = Math.max(...teams.map((team) => team.round ?? 1));
  const lastDay = Math.max(0, ...teams.filter((team) => (team.round ?? 1) === round).map((team) => team.day ?? 0));
  return { round, day: lastDay + 1 };
}

/** An existing save of this exact board, if there is one. Used to warn, never to block. */
export function findDuplicate(library: Library, config: TeamConfiguration): SavedTeam | null {
  const id = buildId(config);
  return library.teams.find((team) => team.buildId === id) ?? null;
}

/* ------------------------------------ mutations ------------------------------------- */

interface SaveTeamInput {
  name: string;
  config: TeamConfiguration;
  runId?: string;
  round?: number;
  day?: number;
}

export function saveTeam(library: Library, input: SaveTeamInput): { library: Library; team: SavedTeam } {
  const team: SavedTeam = {
    id: newId(),
    name: input.name.trim() === "" ? "Untitled team" : input.name.trim(),
    code: exportBuild(input.config),
    buildId: buildId(input.config),
    savedAt: new Date().toISOString(),
    ...(input.runId ? { runId: input.runId, round: input.round, day: input.day } : {}),
  };
  return { library: { ...library, teams: [...library.teams, team] }, team };
}

export function renameTeam(library: Library, teamId: string, name: string): Library {
  return {
    ...library,
    teams: library.teams.map((team) =>
      team.id === teamId ? { ...team, name: name.trim() === "" ? team.name : name.trim() } : team,
    ),
  };
}

export function deleteTeam(library: Library, teamId: string): Library {
  return { ...library, teams: library.teams.filter((team) => team.id !== teamId) };
}

export function createRun(library: Library, name: string): { library: Library; run: Run } {
  const run: Run = {
    id: newId(),
    name: name.trim() === "" ? `Run ${library.runs.length + 1}` : name.trim(),
    createdAt: new Date().toISOString(),
    outcome: "in-progress",
  };
  // A new run becomes the active one: it is created in order to save into it.
  return { library: { ...library, runs: [...library.runs, run], activeRunId: run.id }, run };
}

export function renameRun(library: Library, runId: string, name: string): Library {
  return {
    ...library,
    runs: library.runs.map((run) =>
      run.id === runId ? { ...run, name: name.trim() === "" ? run.name : name.trim() } : run,
    ),
  };
}

export function setRunOutcome(library: Library, runId: string, outcome: RunOutcome): Library {
  return {
    ...library,
    runs: library.runs.map((run) => (run.id === runId ? { ...run, outcome } : run)),
  };
}

/**
 * Deletes the run and KEEPS its teams, as loose saves.
 *
 * Deleting a group should not destroy what was filed in it: the user is discarding the grouping,
 * and a board they spent a run building is not something to throw away as a side effect. Their
 * round and day are dropped with the run that gave those numbers meaning.
 */
export function deleteRun(library: Library, runId: string): Library {
  return {
    ...library,
    runs: library.runs.filter((run) => run.id !== runId),
    teams: library.teams.map((team) => {
      if (team.runId !== runId) return team;
      const { runId: _runId, round: _round, day: _day, ...loose } = team;
      return loose;
    }),
    activeRunId: library.activeRunId === runId ? undefined : library.activeRunId,
  };
}

export function setActiveRun(library: Library, runId: string | undefined): Library {
  return { ...library, activeRunId: runId };
}
