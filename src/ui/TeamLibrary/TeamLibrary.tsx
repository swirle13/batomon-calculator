import { useCallback, useEffect, useState } from "react";
import { useTeamConfig } from "../../context/teamConfig";
import { formatRate } from "../../data/format";
import { importBuild } from "../../data/share";
import {
  createRun,
  deleteRun,
  deleteTeam,
  findDuplicate,
  nextPosition,
  readLibrary,
  renameRun,
  renameTeam,
  saveTeam,
  setActiveRun,
  setRunOutcome,
  teamsForRun,
  writeLibrary,
  type Library,
  type Run,
  type RunOutcome,
  type SavedTeam,
} from "../../data/library";
import type { TeamConfiguration } from "../../data/types";
import { Button, Field, NumberField, Select, TextField } from "../primitives";
import { CreatureSprite } from "../shared/CreatureSprite";
import { previewFor } from "./teamPreview";
import styles from "./TeamLibrary.module.css";

/**
 * The team library: a drawer of saved boards, grouped into runs.
 *
 * ## Why a drawer rather than a panel
 *
 * The page has one subject — the board and the detail card beside it — and everything else on it
 * is a readout of that board. A library of saved teams is neither: it is used occasionally, and
 * when it IS used it is used repeatedly, swapping board after board while watching the DPS figures
 * below redraw. A panel in the detail column would have to earn its height from the detail card on
 * every visit, including the ones where it is not touched; a modal would have to be reopened for
 * each swap, which is the whole activity.
 *
 * Fixed to the viewport edge, it costs the layout nothing when closed and displaces nothing when
 * open — the page underneath stays live and stays where it was, so a swap is one click and the
 * charts are still on screen.
 *
 * ## Why it is not `aria-modal`
 *
 * Deliberately non-modal, and focus is deliberately not trapped: leaving the page interactive
 * while the drawer is open is the point. Escape closes it, and on a phone — where it covers the
 * content rather than sitting beside it — tapping the scrim does too.
 *
 * ## Why the board is drawn, not described
 *
 * A saved team's row of sprites is laid out as the 2x3 board it actually is. "Untitled build234,
 * 2/6 slots" is what a list of near-identical runs looks like after a week; the arrangement is the
 * thing the user recognises, and it is also the thing this whole tool is about.
 */
export function TeamLibrary() {
  const { config, replaceConfig } = useTeamConfig();
  const [library, setLibrary] = useState<Library>(() => readLibrary());
  const [open, setOpen] = useState(false);
  /**
   * Latches on the first open. The drawer stays mounted so it can slide rather than appear, but a
   * preview costs a `simulate()` per saved board — paying for a panel that has never been opened
   * would put the whole library in the critical path of first paint.
   */
  const [opened, setOpened] = useState(false);

  const commit = useCallback((next: Library) => {
    setLibrary(next);
    writeLibrary(next);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function toggle() {
    setOpen((wasOpen) => !wasOpen);
    setOpened(true);
  }

  const runs = [...library.runs].reverse();
  const looseTeams = teamsForRun(library, undefined);

  return (
    <>
      {/* The scrim is mobile-only, where the sheet covers the page. CSS owns that, not JS, so the
          two cannot disagree at a breakpoint. */}
      <div
        className={`${styles.scrim} ${open ? styles.scrimOpen : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <button
        type="button"
        className={styles.tab}
        onClick={toggle}
        aria-expanded={open}
        aria-controls="team-library"
      >
        <span className={styles.tabLabel}>Library</span>
        <span className={styles.tabCount}>{library.teams.length}</span>
      </button>

      <aside
        id="team-library"
        className={`${styles.drawer} ${open ? styles.drawerOpen : ""}`}
        aria-label="Team library"
        // Out of the tab order and out of the accessibility tree while closed: it is still in the
        // DOM only so that opening it can be animated.
        inert={!open}
      >
        <div className={styles.grabber} aria-hidden="true" />
        <header className={styles.header}>
          <h2 className={styles.title}>Library</h2>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
        </header>

        {opened && (
          <div className={styles.body}>
            <SaveForm library={library} commit={commit} config={config} />

            <div className={styles.groups}>
              {runs.map((run) => (
                <RunGroup
                  key={run.id}
                  run={run}
                  library={library}
                  commit={commit}
                  onLoad={handleLoad}
                  defaultOpen={run.id === library.activeRunId}
                />
              ))}

              {/* Rendered only when it holds something: an empty "No run" heading sitting under
                  every run would imply a group the user failed to fill. */}
              {looseTeams.length > 0 && (
                <section className={styles.group}>
                  <details open={runs.length === 0}>
                    <summary className={styles.groupSummary}>
                      {/* "Unfiled", not "No run", which is what the save form's RUN SELECT calls
                          the same state — two controls a few inches apart, and only one of them
                          is naming a group you can look things up in. */}
                      <span className={styles.groupName}>Unfiled</span>
                      <span className={styles.groupCount}>{looseTeams.length}</span>
                    </summary>
                    <TeamList teams={looseTeams} commit={commit} library={library} onLoad={handleLoad} />
                  </details>
                </section>
              )}

              {library.teams.length === 0 && (
                <p className={styles.empty}>
                  Nothing saved yet. Build a board, then save it here — start a run first if you want the
                  day-by-day boards kept together.
                </p>
              )}
            </div>
          </div>
        )}
      </aside>
    </>
  );

  function handleLoad(team: SavedTeam) {
    try {
      replaceConfig(importBuild(team.code));
    } catch {
      // `TeamCard` already marks an unreadable code, so the button is effectively dead by then.
      return;
    }
    // On a phone the drawer is ON TOP of the board it just changed, so staying open would hide the
    // only evidence that anything happened. On a desktop it sits beside it and staying open is the
    // entire point — swapping boards is what the drawer is for.
    if (globalThis.matchMedia?.("(max-width: 640px)").matches) setOpen(false);
  }
}

/* ---------------------------------- save form ----------------------------------- */

function SaveForm({
  library,
  commit,
  config,
}: {
  library: Library;
  commit: (next: Library) => void;
  config: TeamConfiguration;
}) {
  /**
   * Each of these is `null` for "whatever the library suggests" rather than being seeded with the
   * suggestion. Seeded state would freeze at the value it was created with, so the round and day
   * would stop advancing after the first save and the name would keep yesterday's label — and
   * there would be no way to tell a user's "1" from a stale default.
   */
  const [nameEdit, setNameEdit] = useState<string | null>(null);
  const [roundEdit, setRoundEdit] = useState<number | null>(null);
  const [dayEdit, setDayEdit] = useState<number | null>(null);
  const [newRunName, setNewRunName] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const activeRunId = library.activeRunId;
  const suggestion = nextPosition(library, activeRunId);
  const round = roundEdit ?? suggestion.round;
  const day = dayEdit ?? suggestion.day;
  const suggestedName = activeRunId ? `Round ${round}, day ${day}` : "Untitled team";
  const name = nameEdit ?? suggestedName;
  const duplicate = findDuplicate(library, config);

  function save() {
    const { library: next } = saveTeam(library, {
      name,
      config,
      ...(activeRunId ? { runId: activeRunId, round, day } : {}),
    });
    commit(next);
    setNameEdit(null);
    setRoundEdit(null);
    setDayEdit(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <section className={styles.saveForm}>
      <Field label="Team name">
        <TextField
          block
          size="sm"
          value={name}
          onChange={(e) => setNameEdit(e.target.value)}
          placeholder={suggestedName}
        />
      </Field>

      <div className={styles.runRow}>
        <Field label="Run" className={styles.runField}>
          <Select
            block
            size="sm"
            value={activeRunId ?? ""}
            onChange={(e) => commit(setActiveRun(library, e.target.value === "" ? undefined : e.target.value))}
          >
            <option value="">No run</option>
            {library.runs.map((run) => (
              <option key={run.id} value={run.id}>
                {run.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button size="sm" onClick={() => setNewRunName(newRunName === null ? "" : null)}>
          {newRunName === null ? "New run" : "Cancel"}
        </Button>
      </div>

      {newRunName !== null && (
        <div className={styles.runRow}>
          <TextField
            block
            size="sm"
            autoFocus
            value={newRunName}
            placeholder={`Run ${library.runs.length + 1}`}
            onChange={(e) => setNewRunName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              commit(createRun(library, newRunName).library);
              setNewRunName(null);
            }}
            aria-label="New run name"
          />
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              commit(createRun(library, newRunName).library);
              setNewRunName(null);
            }}
          >
            Create
          </Button>
        </div>
      )}

      {/* Round and day belong to a run and are meaningless without one, so they are not rendered
          greyed-out beside a "No run" selection — there is nothing to number. */}
      {activeRunId && (
        <div className={styles.positionRow}>
          <Field label="Round" inline className={styles.positionField}>
            <NumberField
              size="sm"
              min={1}
              width="3.5rem"
              value={round}
              onChange={(e) => setRoundEdit(Math.max(1, Number(e.target.value) || 1))}
            />
          </Field>
          <Field label="Day" inline className={styles.positionField}>
            <NumberField
              size="sm"
              min={1}
              width="3.5rem"
              value={day}
              onChange={(e) => setDayEdit(Math.max(1, Number(e.target.value) || 1))}
            />
          </Field>
        </div>
      )}

      {/*
        The label does NOT change to "Saved" on success. This is the one button in the app pressed
        several times in a row — once a day through a run — and a label that swaps out from under
        the pointer is a button you have to find again each time. The confirmation goes on the
        status line below, where the duplicate warning already lives.
      */}
      <Button variant="primary" block onClick={save}>
        Save this board
      </Button>

      {saved ? (
        <p className={styles.saved}>Saved to the library.</p>
      ) : (
        // A warning, never a block: saving the same board twice under two names is a legitimate
        // thing to do, and the user knows better than this check whether it was meant.
        duplicate && <p className={styles.duplicate}>Already saved as “{duplicate.name}”.</p>
      )}
    </section>
  );
}

/* ----------------------------------- run group ----------------------------------- */

const OUTCOMES: { value: RunOutcome; label: string }[] = [
  { value: "in-progress", label: "In progress" },
  { value: "win", label: "Won" },
  { value: "loss", label: "Lost" },
];

/** The outcome's colour, carried by a class rather than read off the select's value in CSS. */
const OUTCOME_CLASS: Record<RunOutcome, string> = {
  "in-progress": styles.inProgress!,
  win: styles.won!,
  loss: styles.lost!,
};

function RunGroup({
  run,
  library,
  commit,
  onLoad,
  defaultOpen,
}: {
  run: Run;
  library: Library;
  commit: (next: Library) => void;
  onLoad: (team: SavedTeam) => void;
  defaultOpen: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const teams = teamsForRun(library, run.id);

  return (
    <section className={`${styles.group} ${OUTCOME_CLASS[run.outcome]}`}>
      <details open={defaultOpen}>
        <summary className={styles.groupSummary}>
          <span className={styles.groupName}>{run.name}</span>
          <span className={styles.outcomeDot} aria-hidden="true" />
          <span className={styles.groupCount}>{teams.length}</span>
        </summary>

        {/* The run's own controls live in the BODY, not the summary: a button inside a `<summary>`
            fights the disclosure for the same click. */}
        <div className={styles.groupTools}>
          {renaming ? (
            <TextField
              block
              size="sm"
              autoFocus
              defaultValue={run.name}
              aria-label="Run name"
              onBlur={(e) => {
                commit(renameRun(library, run.id, e.target.value));
                setRenaming(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setRenaming(false);
              }}
            />
          ) : (
            <>
              <Select
                size="sm"
                value={run.outcome}
                aria-label={`Outcome of ${run.name}`}
                onChange={(e) => commit(setRunOutcome(library, run.id, e.target.value as RunOutcome))}
              >
                {OUTCOMES.map((outcome) => (
                  <option key={outcome.value} value={outcome.value}>
                    {outcome.label}
                  </option>
                ))}
              </Select>
              <Button size="sm" variant="ghost" onClick={() => setRenaming(true)}>
                Rename
              </Button>
              <Button
                size="sm"
                variant={confirmDelete ? "danger" : "ghost"}
                onClick={() => {
                  if (!confirmDelete) {
                    setConfirmDelete(true);
                    return;
                  }
                  commit(deleteRun(library, run.id));
                }}
              >
                {/* Deleting a run keeps its teams, so the second press says where they go rather
                    than asking "are you sure?" about something it is not about to do. */}
                {confirmDelete ? "Delete run, keep teams" : "Delete run"}
              </Button>
            </>
          )}
        </div>

        <TeamList teams={teams} library={library} commit={commit} onLoad={onLoad} />
      </details>
    </section>
  );
}

/* ----------------------------------- team cards ---------------------------------- */

function TeamList({
  teams,
  library,
  commit,
  onLoad,
}: {
  teams: SavedTeam[];
  library: Library;
  commit: (next: Library) => void;
  onLoad: (team: SavedTeam) => void;
}) {
  if (teams.length === 0) {
    return <p className={styles.empty}>No boards saved in this run yet.</p>;
  }
  return (
    <ul className={styles.cards}>
      {teams.map((team) => (
        <TeamCard key={team.id} team={team} library={library} commit={commit} onLoad={onLoad} />
      ))}
    </ul>
  );
}

function TeamCard({
  team,
  library,
  commit,
  onLoad,
}: {
  team: SavedTeam;
  library: Library;
  commit: (next: Library) => void;
  onLoad: (team: SavedTeam) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const preview = previewFor(team);
  const roster = preview.board.filter((mon) => mon !== null).map((mon) => mon.name);

  return (
    <li className={styles.card}>
      <div className={styles.cardHead}>
        {renaming ? (
          <TextField
            block
            size="sm"
            autoFocus
            defaultValue={team.name}
            aria-label="Team name"
            onBlur={(e) => {
              commit(renameTeam(library, team.id, e.target.value));
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setRenaming(false);
            }}
          />
        ) : (
          <>
            <span className={styles.cardName}>{team.name}</span>
            {team.round !== undefined && (
              <span className={styles.position}>
                R{team.round}·D{team.day}
              </span>
            )}
          </>
        )}
      </div>

      <div className={styles.cardBody}>
        {/* Hidden from assistive tech and replaced by the roster below it: six cells of sprite art,
            read cell by cell, is a worse description of a team than its list of names. */}
        <div className={styles.miniBoard} aria-hidden="true">
          {preview.board.map((mon, index) => (
            <span key={index} className={`${styles.cell} ${mon ? "" : styles.cellEmpty}`}>
              {mon && (
                <CreatureSprite
                  spriteFile={mon.spriteFile}
                  sizeVar="--sprite-library"
                  alt={mon.name}
                  painted={mon.painted}
                />
              )}
            </span>
          ))}
        </div>

        <div className={styles.cardStats}>
          <span className={styles.dps}>{preview.dps === null ? "—" : formatRate(preview.dps)}</span>
          <span className={styles.dpsLabel}>DPS avg</span>
          <span className={styles.roster}>{preview.broken ? "Code unreadable" : roster.join(", ")}</span>
        </div>
      </div>

      <div className={styles.cardActions}>
        <Button size="sm" variant="primary" disabled={preview.broken} onClick={() => onLoad(team)}>
          Load
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setRenaming(true)}>
          Rename
        </Button>
        <Button
          size="sm"
          variant={confirmDelete ? "danger" : "ghost"}
          onClick={() => {
            if (!confirmDelete) {
              setConfirmDelete(true);
              return;
            }
            commit(deleteTeam(library, team.id));
          }}
        >
          {confirmDelete ? "Confirm" : "Delete"}
        </Button>
      </div>
    </li>
  );
}
