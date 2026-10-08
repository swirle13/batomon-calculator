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
