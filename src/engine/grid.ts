import type { GridSlot } from "../data/types";
import { GridRow } from "../data/enums";
import type { Species } from "../data/ids";
import type { PlacementKey } from "../data/types";

/**
 * Board/grid helpers.
 *
 * Source (research.md B5): "Batomon Showdown Team Planner Guide"
 * https://batomonshowdowngame.wiki/tools/team-planner/ and "Batomon Showdown Combat Mechanics"
 * https://batomonshowdowngame.wiki/guides/combat/ — the battle board is two rows of three
 * (back row / front row), bench excluded entirely. "Adjacent" means sharing a side — the four
 * cardinal directions, including the slot above and below — never diagonal. See `isAdjacent`,
 * which read this as same-row-only until 2026-10-08.
 */

/** Stable iteration order used for tie-breaking simultaneous timeline events (contracts/engine-api.md). */
export const STABLE_SLOT_ORDER: GridSlot[] = [
  { row: GridRow.Back, col: 0 },
  { row: GridRow.Back, col: 1 },
  { row: GridRow.Back, col: 2 },
  { row: GridRow.Front, col: 0 },
  { row: GridRow.Front, col: 1 },
  { row: GridRow.Front, col: 2 },
];

export function slotKey(slot: GridSlot): string {
  return `${slot.row}${slot.col}`;
}

export function slotsEqual(a: GridSlot, b: GridSlot): boolean {
  return a.row === b.row && a.col === b.col;
}

export function stableSlotIndex(slot: GridSlot): number {
  const index = STABLE_SLOT_ORDER.findIndex((s) => slotsEqual(s, slot));
  if (index === -1) {
    throw new Error(`Invalid grid slot: ${JSON.stringify(slot)}`);
  }
  return index;
}

/**
 * Adjacent = sharing a side, in any of the four CARDINAL directions. Never diagonal.
 *
 * ## 2026-10-08: this used to mean "same row, neighbouring column", and that was wrong
 *
 * The board is a grid, so a slot's neighbours are left, right, **above and below** — back-1 and
 * front-1 share a side exactly as back-1 and back-2 do. The old version returned `false` for every
 * cross-row pair, which silently halved the reach of every adjacency effect in the game:
 * Formiqueen's cooldown aura, Petrirex's and Rattleghast's knockouts, Noxnimbus's Poison grant,
 * and every `adjacent` selector in `effects.ts`.
 *
 * It was not an oversight so much as a transcription that narrowed itself. research.md B5 reads
 * "'Adjacent' means sharing a side (same row, neighboring column) — not diagonal", and the
 * parenthetical contradicts the clause it is glossing. The implementation followed the
 * parenthetical. Corrected on the user's report (they play the game); B5 is amended to match.
 *
 * Manhattan distance of exactly 1, which is the whole rule: orthogonal neighbours are at 1,
 * diagonals at 2, and a slot is at 0 from itself.
 */
export function isAdjacent(a: GridSlot, b: GridSlot): boolean {
  const rowDistance = a.row === b.row ? 0 : 1;
  return rowDistance + Math.abs(a.col - b.col) === 1;
}

/** The slot directly "behind" `slot` — same column, the other row, oriented back-of-board. */
export function behindSlot(slot: GridSlot): GridSlot | null {
  if (slot.row === GridRow.Front) {
    return { row: GridRow.Back, col: slot.col };
  }
  return null; // back row has nothing behind it
}

/** The slot "above" `slot` — toward the back row, same column (research.md B5's "above"). */
export function aboveSlot(slot: GridSlot): GridSlot | null {
  if (slot.row === GridRow.Front) {
    return { row: GridRow.Back, col: slot.col };
  }
  return null; // back row is already the topmost row
}

/**
 * The key identifying one PLACED creature across a `SimulationResult` (2026-10-07, round 7).
 *
 * Every per-creature record -- `perCreatureDps`, `perCreatureFacilitatedDps`,
 * `perCreatureEffectiveStats` -- is keyed by this. It was a bare `string` built inline as
 * `` placementKey(creature.id, slot) `` at eleven sites in `simulate.ts`, `effects.ts` and the UI,
 * with nothing checking that the producer and the consumer built it the same way. A change to the
 * format, or one site forgetting the `@`, would have produced a lookup that silently returned
 * `undefined` rather than a type error.
 *
 * Branded so a raw string cannot be used as one, and built by `placementKey` only.
 */
/** The one place the key format is defined. */
export function placementKey(creatureId: Species, slot: GridSlot): PlacementKey {
  return `${creatureId}@${slotKey(slot)}` as PlacementKey;
}
