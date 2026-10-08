import type { Corpus, TeamConfiguration, TeamPlacement } from "../data/types";
import {
  analyzePositionalCoverage,
  suggestPlacement,
  type PlacementSuggestion,
  type PositionalCoverage,
} from "./optimize";
import { simulate, windowAverageDps } from "./simulate";
import { slotKey } from "./grid";

/**
 * Everything `PlacementAdvisor` renders, as one plain-data value.
 *
 * Plain data is a REQUIREMENT, not a style choice: this crosses a `postMessage` boundary, so every
 * field has to survive the structured clone algorithm. No class instances, no functions, no `Map`
 * keyed on anything exotic — just the records, arrays, numbers and strings below.
 */
export interface PlacementAdvice {
  suggestion: PlacementSuggestion;
  coverage: PositionalCoverage;
  /** Window-average DPS of the board as it stands. */
  currentDps: number;
  /** Window-average DPS of the suggested board, or `null` when there is no suggestion. */
  suggestedDps: number | null;
  /** Only the placements that actually change slot. */
  moves: TeamPlacement[];
  /**
   * How many creatures were on the board that was searched.
   *
   * Carried rather than read from the live config at render time, because the advice can be a
   * board behind: "2 of 6 placed Batomon have a positional ability the engine acts on" has to
   * count the same six `coverage` was derived from, or the sentence contradicts itself mid-way.
   */
  placementCount: number;
}

/**
 * The placement search and its supporting figures, as a pure function.
 *
 * Lifted out of `PlacementAdvisor`'s `useMemo` (2026-10-08) so it can run inside a Web Worker —
 * a component body cannot. It is a function of `(config, corpus)` and nothing else, which is what
 * makes running it on another thread safe: there is no React state, no DOM and no module-level
 * mutable state involved.
 *
 * This is the most expensive thing the app does by a wide margin. `suggestPlacement` simulates
 * every permutation of the board, 720 of them for a full six, at roughly 60-95ms total.
 */
export function computePlacementAdvice(config: TeamConfiguration, corpus: Corpus): PlacementAdvice {
  const suggestion = suggestPlacement(config, corpus);
  // Only the creatures that actually change slot. Listing the ones already in place made a
  // six-line list of which two lines were instructions, and the user read the no-op lines as the
  // advisor contradicting itself.
  const currentBySlot = new Map(config.placements.map((p) => [slotKey(p.slot), p.creatureId]));
  return {
    suggestion,
    coverage: analyzePositionalCoverage(config, corpus),
    currentDps: windowAverageDps(simulate(config, corpus)),
    suggestedDps: suggestion.placements
      ? windowAverageDps(simulate({ ...config, placements: suggestion.placements }, corpus))
      : null,
    moves: (suggestion.placements ?? []).filter((p) => currentBySlot.get(slotKey(p.slot)) !== p.creatureId),
    placementCount: config.placements.length,
  };
}
