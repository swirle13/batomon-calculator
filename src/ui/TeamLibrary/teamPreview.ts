import { corpus, resolveCreatureVariant } from "../../data/corpus";
import { GridRow } from "../../data/enums";
import { importBuild } from "../../data/share";
import { simulate, windowAverageDps } from "../../engine/simulate";
import type { SavedTeam } from "../../data/library";

/**
 * What a saved team looks like on a card: the board, and what it does.
 *
 * ## Why this is cached by `buildId`
 *
 * A preview costs a decode plus a full `simulate()`, and the drawer renders every saved team at
 * once. `buildId` is the board's content fingerprint, so the cache key is exactly "the same board"
 * — two entries saved under different names on different days share one computation, and a card
 * re-rendering because a sibling was renamed re-simulates nothing.
 *
 * The cache is never invalidated because it can never go stale: a saved code is a snapshot, and
 * the same code always produces the same numbers. It is bounded by the number of distinct boards
 * in the library.
 */

export interface PreviewMon {
  name: string;
  spriteFile: string | undefined;
  painted: boolean;
}

export interface TeamPreview {
  /** Six cells in board order — back row left to right, then front row. `null` is an empty slot. */
  board: (PreviewMon | null)[];
  occupied: number;
  /** Window-average DPS, or `null` when the code could not be read. */
  dps: number | null;
  /** True when the stored code is unreadable, which the card says out loud rather than rendering
   * an empty board that looks like a team with nothing on it. */
  broken: boolean;
}

const ROW_ORDER = [GridRow.Back, GridRow.Front] as const;
const COLS = [0, 1, 2] as const;

const cache = new Map<string, TeamPreview>();

export function previewFor(team: SavedTeam): TeamPreview {
  const cached = cache.get(team.buildId);
  if (cached) return cached;
  const preview = computePreview(team.code);
  cache.set(team.buildId, preview);
  return preview;
}

function computePreview(code: string): TeamPreview {
  let config;
  try {
    config = importBuild(code);
  } catch {
    return { board: Array(6).fill(null), occupied: 0, dps: null, broken: true };
  }

  const painted = new Set(config.paintedCreatureIds ?? []);
  const board = ROW_ORDER.flatMap((row) =>
    COLS.map((col) => {
      const placement = config.placements.find((p) => p.slot.row === row && p.slot.col === col);
      if (!placement) return null;
      const record = resolveCreatureVariant(placement.creatureId, placement.level, placement.shiny);
      return {
        name: record?.name ?? String(placement.creatureId),
        spriteFile: record?.spriteFile,
        painted: painted.has(placement.creatureId),
      };
    }),
  );

  // A board the engine cannot simulate is still a board worth showing, so the DPS figure is the
  // only thing a failure here costs.
  let dps: number | null = null;
  try {
    dps = windowAverageDps(simulate(config, corpus));
  } catch {
    dps = null;
  }

  return { board, occupied: config.placements.length, dps, broken: false };
}
