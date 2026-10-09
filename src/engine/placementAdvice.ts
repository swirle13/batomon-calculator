import type { Corpus, TeamConfiguration, TeamPlacement } from "../data/types";
import {
  analyzePositionalCoverage,
  scoreBoard,
  suggestPlacement,
  type PlacementSuggestion,
  type PositionalCoverage,
} from "./optimize";
import { simulate, windowAverageDps } from "./simulate";
import type { SurvivabilityEstimate } from "./survivability";
import { computeBenchAdvice, type BenchAdvice } from "./rosterAdvice";
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
  /**
   * What the current board's shielding, healing and cleansing bought it (2026-10-08).
   *
   * Carried so the UI can state the assumptions the ranking rests on. The survivability model
   * prices a cleanse against an ASSUMED opponent, which is a far bigger leap than anything else
   * the advisor does, and a search that silently moves a Runerock up the order on the strength of
   * a guess about the enemy would be exactly the black box FR-069 exists to prevent.
   */
  survivability: SurvivabilityEstimate;
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
  /**
   * The bench's half of the advice — which parked monster is worth fielding, and the best lineup
   * over everything the user owns (2026-10-08). `null` when the bench is empty, which is both the
   * common case and the one where this must cost nothing.
   */
  bench: BenchAdvice | null;
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
  const { dps: currentDps, survivability } = scoreBoard(config, corpus);
  return {
    suggestion,
    coverage: analyzePositionalCoverage(config, corpus),
    currentDps,
    survivability,
    suggestedDps: suggestion.placements
      ? windowAverageDps(simulate({ ...config, placements: suggestion.placements }, corpus))
      : null,
    moves: (suggestion.placements ?? []).filter((p) => currentBySlot.get(slotKey(p.slot)) !== p.creatureId),
    placementCount: config.placements.length,
    /*
     * Reuses the two figures above rather than recomputing the current board, and returns `null`
     * immediately on an empty bench — so a user who never opens the bench pays exactly what they
     * paid before this existed. `suggestion.currentScore` is the same time-weighted score
     * `suggestPlacement` just measured, so the bench's candidates are compared against the board
     * on precisely the scale the arrangement search used.
     */
    bench: computeBenchAdvice(config, corpus, suggestion.currentScore, currentDps),
  };
}
