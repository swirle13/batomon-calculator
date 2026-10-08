import type { GridSlot } from "../data/types";
import { GridRow } from "../data/enums";

/**
 * Board/grid helpers.
 *
 * Source (research.md B5): "Batomon Showdown Team Planner Guide"
 * https://batomonshowdowngame.wiki/tools/team-planner/ and "Batomon Showdown Combat Mechanics"
 * https://batomonshowdowngame.wiki/guides/combat/ — the battle board is two rows of three
 * (back row / front row), bench excluded entirely. "Adjacent" means sharing a side, never
 * diagonal.
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

/** Adjacent = sharing a side (same row, neighboring column) — never diagonal (research.md B5). */
export function isAdjacent(a: GridSlot, b: GridSlot): boolean {
  if (slotsEqual(a, b)) return false;
  if (a.row === b.row) {
    return Math.abs(a.col - b.col) === 1;
  }
  return false;
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
