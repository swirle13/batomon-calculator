import type { GridSlot, TeamConfiguration } from "../data/types";
import { GridRow } from "../data/enums";
import { TrinketId, type Species } from "../data/ids";
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
  { row: GridRow.Top, col: 0 },
  { row: GridRow.Top, col: 1 },
  { row: GridRow.Top, col: 2 },
  { row: GridRow.Bottom, col: 0 },
  { row: GridRow.Bottom, col: 1 },
  { row: GridRow.Bottom, col: 2 },
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

/**
 * Link Cable: "All of your team's monsters are now considered adjacent to each other."
 *
 * 2026-10-09, user-instructed. The trinket carried no `abilityTags` and nothing read its text, so
 * it was listed among the effects the placement advisor warns it CANNOT model — which was honest
 * and is now unnecessary. It is the single most consequential trinket for this engine: it makes
 * every adjacency effect on the board reach everybody, and it flattens the one dimension the
 * placement optimiser can actually see, so holding it should make "no arrangement scored higher"
 * the true answer rather than a disclaimer.
 *
 * Read everywhere `isAdjacent` is, which is two places — `selectTargets` and the cooldown-speed
 * aura sum in `simulate.ts` — through {@link adjacentUnder} so neither can forget it.
 */
export function hasUniversalAdjacency(config: Pick<TeamConfiguration, "trinketIds"> | undefined): boolean {
  return (config?.trinketIds ?? []).includes(TrinketId.LinkCable);
}

/** `isAdjacent`, except that Link Cable makes it true for every distinct pair. */
export function adjacentUnder(
  config: Pick<TeamConfiguration, "trinketIds"> | undefined,
  a: GridSlot,
  b: GridSlot,
): boolean {
  if (slotsEqual(a, b)) return false;
  return hasUniversalAdjacency(config) || isAdjacent(a, b);
}

/*
 * --- THE THREE DIRECTIONAL WORDS, CORRECTED 2026-10-09 (user-reported) ------------------------
 *
 * "in front" means THE COLUMN TO THE RIGHT, in the same row. Not the front row.
 *
 * Every one of these was wrong, and wrong in a way the row names actively encouraged: with rows
 * called `Back` and `Front`, "the ally in front" reads as "the ally in the front row", and that is
 * exactly what the code did. `behindSlot` and `aboveSlot` had even converged on the identical
 * body — both returned "back row, same column" — which is the clearest possible sign that the
 * vocabulary had stopped meaning anything. The rows are named `Top`/`Bottom` now for that reason;
 * see `GridRow`.
 *
 * The board is two rows of three, with the enemy off to the RIGHT. So:
 *
 *   - **in front** = one column right, same row. The rightmost of each row has nothing in front.
 *   - **behind**   = one column left, same row. The leftmost of each row has nothing behind.
 *   - **above**    = same column, top row — and therefore only meaningful from the BOTTOM row. A
 *     monster already in the top row points at a slot that does not exist, and its ability is
 *     simply moot.
 *
 * `null` from any of these means "there is no such slot", which every caller already treats as
 * "this ability does nothing here" — the correct reading of an ability aimed off the board.
 */

/** One column LEFT, same row. `null` at the leftmost column. */
export function behindSlot(slot: GridSlot): GridSlot | null {
  return slot.col === 0 ? null : { row: slot.row, col: (slot.col - 1) as GridSlot["col"] };
}

/** One column RIGHT, same row. `null` at the rightmost column. */
export function inFrontSlot(slot: GridSlot): GridSlot | null {
  return slot.col === 2 ? null : { row: slot.row, col: (slot.col + 1) as GridSlot["col"] };
}

/** Same column, top row. `null` from the top row, which has nothing above it. */
export function aboveSlot(slot: GridSlot): GridSlot | null {
  return slot.row === GridRow.Bottom ? { row: GridRow.Top, col: slot.col } : null;
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
