import type { Corpus, GridSlot, TeamConfiguration, TeamPlacement } from "../data/types";
import { simulate } from "./simulate";
import { STABLE_SLOT_ORDER, slotKey } from "./grid";
import { isResolvableTag } from "./effects";
import { applyShinyOverlay } from "../data/corpus";
import { abilityNeedsModelling } from "../data/display";

/**
 * Placement optimiser (FR-069, WI-018, 2026-10-06 round 8).
 *
 * Searches arrangements of the creatures already on the board for higher time-weighted output.
 * Exhaustive rather than heuristic: at most 6 creatures in 6 slots is 720 permutations and
 * `simulate()` is fast, so there is no reason to approximate.
 *
 * ## The objective is time-weighted, and that is the user's requirement, not a tuning choice
 *
 * Raw window total over-rewards a slow Poison ramp that may only pay off after the team is dead.
 * Damage at time `t` is therefore discounted by `exp(-t / HALF_LIFE_SECONDS)`-style decay, so
 * earlier damage counts for more. The weighting is exported so the UI can state what it optimised
 * for rather than presenting a verdict from a black box.
 *
 * ## What this CANNOT see — read before trusting a result
 *
 * Positional effects are barely modelled in the corpus:
 *
 * - **Two** creatures carry positional-target `AbilityTag`s — Formiqueen (`adjacent`) and Onsetra
 *   (`behind`) — but `simulate()` reads **only** `cooldownSpeedModifier` tags, so **one** is
 *   actually actionable. Onsetra's tag is present, correctly typed, and silently ignored — and its
 *   ability text ("the ally behind applies its Ongoing abilities 1 additional time") is literally
 *   one of the chaining effects that motivated this feature.
 * - **Six** trinkets have slot-scoped effects (Quick Flag, Earth Crest, Power Crown, Rally Flag,
 *   Link Cable, and one further) — several altering Cooldown Speed or Damage, i.e. this optimiser's
 *   own objective — and none carry `abilityTags`. Link Cable ("All of your team's monsters are now
 *   considered adjacent to each other") would outright invalidate the one interaction that *is*
 *   visible.
 *
 * So "no improvement found" usually means "I cannot see the effects that would make placement
 * matter", not "your placement is optimal". `analyzePositionalCoverage()` exists so the UI can say
 * which of the two it means.
 */

/** Damage this many seconds in is worth half as much as damage at t=0. */
export const TIME_WEIGHT_HALF_LIFE_SECONDS = 10;

export interface PlacementSuggestion {
  /** The rearranged placements, or `null` when nothing beat the current layout. */
  placements: TeamPlacement[] | null;
  /** Time-weighted score of the user's current arrangement. */
  currentScore: number;
  /** Time-weighted score of the best arrangement found. */
  bestScore: number;
  /** How many arrangements were evaluated. */
  evaluated: number;
}

export interface PositionalCoverage {
  /**
   * Placed creatures with an ability the engine OUGHT to compute — the honest denominator for any
   * "N of M modelled" figure. Excludes creatures with no ability, evolution-only text, and text
   * that merely restates the stat line (see `abilityNeedsModelling`). A team of three such
   * creatures reported "0 of 3 modelled" next to a DPS figure that was entirely correct.
   */
  needsModelling: string[];
  /** Placed creatures carrying any positional-target ability tag. */
  withPositionalTag: string[];
  /** Placed creatures whose positional tag the engine can actually act on. */
  actionable: string[];
  /** Selected trinkets whose effect text implies positional behaviour the engine cannot model. */
  unmodelledTrinkets: string[];
}

/** Text fragments that mark a trinket effect as slot- or position-scoped. */
const POSITIONAL_TRINKET_PATTERN = /column|leftmost|rightmost|adjacent|slot|behind|in front/i;

/**
 * Time-weighted damage: each timeline event's damage discounted by how late it lands.
 * Uses the simulated timeline rather than the summary totals so the weighting sees actual timing.
 */
export function scoreConfiguration(config: TeamConfiguration, corpus: Corpus): number {
  const result = simulate(config, corpus);
  let score = 0;
  for (const event of result.timeline) {
    if (event.damage === undefined) continue;
    score += event.damage * Math.pow(0.5, event.tSeconds / TIME_WEIGHT_HALF_LIFE_SECONDS);
  }
  return score;
}

/**
 * Reports what the optimiser can and cannot reason about for this team, so an empty result can be
 * presented as a limitation rather than a conclusion (FR-069).
 */
export function analyzePositionalCoverage(config: TeamConfiguration, corpus: Corpus): PositionalCoverage {
  const withPositionalTag: string[] = [];
  const actionable: string[] = [];
  /** Placed creatures with an ability the engine ought to be computing — the honest denominator. */
  const needsModelling: string[] = [];

  for (const placement of config.placements) {
    const creature = applyShinyOverlay(
      corpus.creatures.find((c) => c.id === placement.creatureId && c.level === placement.level) ?? null,
      placement.shiny,
    );
    if (!creature) continue;
    // 2026-10-06 round 9 (T203): "has a tag" and "the engine acts on it" are tracked separately,
    // and `actionable` now follows what `effects.ts` ACTUALLY resolves rather than a hard-coded
    // single kind. Before this it checked only `cooldownSpeedModifier`, which would have
    // *understated* coverage the moment the resolver learned new kinds -- inverting round 8's
    // honesty mechanism into a different kind of wrong number.
    const positional = creature.abilityTags.filter((tag) => {
      const target = (tag as { target?: { kind?: string } }).target;
      return (
        target?.kind === "adjacent" ||
        target?.kind === "behind" ||
        target?.kind === "above" ||
        tag.kind === "battleStartStatusFromAllies" ||
        tag.kind === "chargeOnAllyStatus" ||
        tag.kind === "cooldownSpeedOnAllyCast"
      );
    });
    if (abilityNeedsModelling(creature)) needsModelling.push(creature.name);
    if (positional.length === 0) continue;
    withPositionalTag.push(creature.name);
    if (positional.some(isResolvableTag)) actionable.push(creature.name);
  }

  // Distinct ids: a trinket may be held in several copies (2026-10-07), and this is a list of
  // caveats to state once each, not a count of them.
  const unmodelledTrinkets = [...new Set(config.trinketIds)]
    .map((id) => corpus.trinkets.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => t !== undefined)
    .filter((t) => POSITIONAL_TRINKET_PATTERN.test(t.effectText) && (t.abilityTags?.length ?? 0) === 0)
    .map((t) => t.name);

  return { withPositionalTag, actionable, unmodelledTrinkets, needsModelling };
}

/** All permutations of `items`. Bounded by 6! = 720 for a full board. */
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const sub of permutations(rest)) out.push([items[i]!, ...sub]);
  }
  return out;
}

/**
 * Searches every arrangement of the currently-placed creatures across the slots they currently
 * occupy, returning the highest-scoring one (or `null` if the current layout already wins).
 */
export function suggestPlacement(config: TeamConfiguration, corpus: Corpus): PlacementSuggestion {
  const occupied: GridSlot[] = config.placements
    .map((p) => p.slot)
    .sort((a, b) => STABLE_SLOT_ORDER.findIndex((s) => slotKey(s) === slotKey(a)) - STABLE_SLOT_ORDER.findIndex((s) => slotKey(s) === slotKey(b)));

  const currentScore = scoreConfiguration(config, corpus);
  if (config.placements.length < 2) {
    return { placements: null, currentScore, bestScore: currentScore, evaluated: 0 };
  }

  let bestScore = currentScore;
  let best: TeamPlacement[] | null = null;
  let evaluated = 0;

  for (const order of permutations(config.placements)) {
    const candidate = order.map((placement, i) => ({ ...placement, slot: occupied[i]! }));
    // Skip the arrangement the user already has.
    const unchanged = candidate.every((p, i) => slotKey(p.slot) === slotKey(config.placements[i]?.slot ?? p.slot));
    evaluated++;
    if (unchanged) continue;
    const score = scoreConfiguration({ ...config, placements: candidate }, corpus);
    if (score > bestScore + 1e-9) {
      bestScore = score;
      best = candidate;
    }
  }

  return { placements: best, currentScore, bestScore, evaluated };
}
