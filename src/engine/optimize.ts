import type { Corpus, GridSlot, SimulationResult, TeamConfiguration, TeamPlacement } from "../data/types";
import { simulate, windowAverageDps } from "./simulate";
import { estimateSurvivability, type SurvivabilityEstimate } from "./survivability";
import { STABLE_SLOT_ORDER, slotKey } from "./grid";
import { isResolvableTag } from "./effects";
import { manualTriggersFor } from "../data/triggers";
import { applyShinyOverlay, findCreature } from "../data/corpus";
import { abilityNeedsModelling } from "../data/display";
import { AbilityTagKind, TargetKind } from "../data/enums";

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

/**
 * Damage this many seconds in is worth half as much as damage at t=0, on a team with no defence
 * of any kind.
 *
 * 2026-10-08: "with no defence of any kind" is new, and it is the whole of what changed. This
 * constant was always a survivability assumption wearing a discount's clothes — damage later is
 * discounted because you may be dead by then — but it was a FIXED one, so a board's shielding,
 * healing and cleansing moved it not at all. `engine/survivability.ts` makes it the baseline that
 * mitigation stretches; read that module for why this is the right place to spend a Runerock
 * rather than adding a defence term alongside the damage.
 */
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
  /**
   * Of `needsModelling`, the ones `effects.ts`/`simulate()` actually RESOLVE (2026-10-07).
   *
   * The three fields below partition `needsModelling`, and they exist because the UI was deriving
   * its coverage figure from `actionable` — which only ever counts POSITIONAL tags, because it was
   * built for the placement optimiser (FR-069). A creature with a resolvable non-positional tag was
   * therefore reported as unmodelled: a board of Ninflora, Mosslug, Thorntail, Drumire, Cobrex and
   * Miasmaw read "3 of 6 abilities not yet modelled" when the true answer was 1 of 6. Mosslug's
   * `buffOnCast` and Thorntail's `gainOnAllyStatus` are both computed; they are just not positional.
   *
   * `isResolvableTag` is the single source of truth for "the engine acts on this", so these read it
   * rather than re-deriving a predicate — which is the mistake that produced the wrong number.
   */
  modelled: string[];
  /**
   * Abilities that fire OUTSIDE the simulated battle — winning a round, buying a monster, using an
   * item — which the engine cannot fire and the user banks with a button on the card instead.
   *
   * Kept separate from `unmodelled` because "not yet modelled" is the wrong thing to tell someone
   * about these: the ability is fully representable, it just needs their input. Lumping them in
   * both overstated the gap and hid the feature that closes it.
   */
  manuallyBanked: string[];
  /** Abilities the engine neither resolves nor offers a manual button for. The honest gap. */
  unmodelled: string[];
  /** Placed creatures carrying any positional-target ability tag. */
  withPositionalTag: string[];
  /**
   * Placed creatures whose POSITIONAL tag the engine can act on — the optimiser's own disclosure
   * (FR-069), answering "can placement advice be trusted for this board?".
   *
   * NOT a coverage figure. It was misused as one; see `modelled`.
   */
  actionable: string[];
  /** Selected trinkets whose effect text implies positional behaviour the engine cannot model. */
  unmodelledTrinkets: string[];
}

/** Text fragments that mark a trinket effect as slot- or position-scoped. */
const POSITIONAL_TRINKET_PATTERN = /column|leftmost|rightmost|adjacent|slot|behind|in front/i;

/**
 * Time-weighted damage: each timeline event's damage discounted by how late it lands.
 * Uses the simulated timeline rather than the summary totals so the weighting sees actual timing.
 *
 * Takes a RESULT rather than a config (2026-10-08) so a caller that also wants the window-average
 * DPS of the same board pays for one `simulate()` instead of two. The bench advisor reports both
 * figures for every candidate it ranks, which doubled its cost for no reason.
 */
export function timeWeightedScore(
  result: SimulationResult,
  survivability: SurvivabilityEstimate,
): number {
  const halfLife = TIME_WEIGHT_HALF_LIFE_SECONDS * survivability.factor;
  let score = 0;
  for (const event of result.timeline) {
    if (event.damage === undefined) continue;
    score += event.damage * Math.pow(0.5, event.tSeconds / halfLife);
  }
  return score;
}

/**
 * One board, one `simulate()`, every figure the advisor ranks or quotes.
 *
 * `survivability` is a REQUIRED argument to `timeWeightedScore` above rather than an optional one,
 * and this exists so that being required costs nobody anything. An optional parameter would have
 * meant two scoring scales in circulation — one that prices a Runerock and one that does not — and
 * the only thing deciding which a board got would be whether its caller remembered.
 */
export function scoreBoard(
  config: TeamConfiguration,
  corpus: Corpus,
): { result: SimulationResult; survivability: SurvivabilityEstimate; score: number; dps: number } {
  const result = simulate(config, corpus);
  const survivability = estimateSurvivability(config, corpus, result);
  return {
    result,
    survivability,
    score: timeWeightedScore(result, survivability),
    dps: windowAverageDps(result),
  };
}

export function scoreConfiguration(config: TeamConfiguration, corpus: Corpus): number {
  return scoreBoard(config, corpus).score;
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
  const modelled: string[] = [];
  const manuallyBanked: string[] = [];
  const unmodelled: string[] = [];

  for (const placement of config.placements) {
    const creature = applyShinyOverlay(
      findCreature(corpus, placement.creatureId, placement.level),
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
        target?.kind === TargetKind.Adjacent ||
        target?.kind === TargetKind.Behind ||
        target?.kind === TargetKind.Above ||
        /*
         * `InFront` and `Row` added 2026-10-08. Both are plainly positional — Zephyrex's "the
         * Flying ally IN FRONT", Saberhorn's "the ally in front", NULL-FF's "allies in this ROW" —
         * and both were missing, so the advisor's "N of M placed Batomon have a positional ability
         * the engine acts on" was UNDERSTATING itself on exactly the boards where placement
         * matters most. An honesty mechanism that under-reports is still a wrong number; the
         * direction it errs in does not make it right.
         */
        target?.kind === TargetKind.InFront ||
        target?.kind === TargetKind.Row ||
        tag.kind === AbilityTagKind.BattleStartStatusFromAllies ||
        tag.kind === AbilityTagKind.ChargeOnAllyStatus ||
        tag.kind === AbilityTagKind.CooldownSpeedOnAllyCast
      );
    });
    if (abilityNeedsModelling(creature)) {
      needsModelling.push(creature.name);
      // Read from `isResolvableTag` and `manualTriggersFor`, the two existing sources of truth, so
      // this cannot drift from what the engine and the card actually do.
      if (creature.abilityTags.some(isResolvableTag)) modelled.push(creature.name);
      else if (manualTriggersFor(creature).length > 0) manuallyBanked.push(creature.name);
      else unmodelled.push(creature.name);
    }
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

  return {
    withPositionalTag,
    actionable,
    unmodelledTrinkets,
    needsModelling,
    modelled,
    manuallyBanked,
    unmodelled,
  };
}

/** All permutations of `items`. Bounded by 6! = 720 for a full board. */
export function permutations<T>(items: T[]): T[][] {
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

  /**
   * Who currently sits in each slot. "Is this the arrangement the user already has?" has to be
   * asked of the creature-to-slot assignment, by placement identity.
   *
   * 2026-10-08: it used to be asked of the SLOTS — `candidate[i].slot` vs `config.placements[i].slot`
   * — which compares nothing at all. `candidate[i]` is always given `occupied[i]`, so whenever
   * `config.placements` happened to already be in stable slot order (which is exactly how a board
   * decoded from a share link arrives) every one of the 720 permutations looked "unchanged" and
   * was skipped, and the advisor reported "(none)" for every shared build. It started working the
   * moment the user dragged anything, because a drag leaves the array out of slot order.
   */
  const currentBySlot = new Map(config.placements.map((p) => [slotKey(p.slot), p]));

  for (const order of permutations(config.placements)) {
    const candidate = order.map((placement, i) => ({ ...placement, slot: occupied[i]! }));
    const unchanged = order.every((p, i) => currentBySlot.get(slotKey(occupied[i]!)) === p);
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
