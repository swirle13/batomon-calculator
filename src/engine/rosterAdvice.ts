import type {
  BenchIndex,
  BenchedCreature,
  Corpus,
  GridSlot,
  RosterRef,
  RosteredCreature,
  TeamConfiguration,
  TeamPlacement,
} from "../data/types";
import { BENCH_INDEXES, RosterZone } from "../data/types";
import { analyzePositionalCoverage, permutations, timeWeightedScore } from "./optimize";
import { simulate, windowAverageDps } from "./simulate";
import { STABLE_SLOT_ORDER, slotKey, slotsEqual } from "./grid";
import { BENCH_SIZE, benchOf, benchRef, creatureOf, gridRef, rosterRefKey, settleOnBench, settleOnGrid } from "./roster";
import { applyShinyOverlay, findCreature } from "../data/corpus";

/**
 * "Which of these would actually help?" — the bench's half of the placement advice (2026-10-08).
 *
 * ## The question this answers
 *
 * Judging a monster in the shop used to require selling one you owned, because the only way to
 * see a monster's contribution was to put it on the board. The bench removes the selling; this
 * module removes the putting. Every figure below is produced by building the board that WOULD
 * result and simulating it, so the answer is the engine's own, not an estimate of it.
 *
 * ## Why benched monsters count for nothing until they are fielded, and everything after
 *
 * `simulate()` never reads `config.bench`, so a parked monster contributes no damage and no aura
 * to the current board. But a CANDIDATE board is a real `TeamConfiguration` with that monster in a
 * real slot, so everything positional about it — adjacency auras, `behind`/`above` selectors, the
 * knockouts Petrirex and Rattleghast inflict on their neighbours — is simulated exactly as it
 * would be if you dragged it there. There is no separate, weaker model of a benched monster that
 * could disagree with the board; there is only the board.
 *
 * The honest caveat is unchanged from `optimize.ts` and inherited rather than restated: positional
 * effects are barely MODELLED at all. If a bench candidate's positional ability is one the engine
 * does not read, its swap figure is wrong in the same way and by the same amount that the existing
 * arrangement search is wrong. `unreadablePositional` below names those candidates so the UI can
 * say so.
 *
 * ## Why the lineup search is two-stage
 *
 * Choosing which six of a roster of R to field AND how to arrange them is `P(R, 6)` boards:
 * 5,040 at R=7 but 151,200 at R=10, which is the full roster a six-strong board and a four-strong
 * bench produce. At roughly 0.1-0.25ms a simulation that is 15 to 40 seconds, which is not a
 * search, it is a hang.
 *
 * It is split instead. Stage one scores each SELECTION once, in a canonical arrangement that
 * keeps placed monsters where they already stand; stage two takes the few best selections and
 * permutes them exhaustively. That is 210 + 3x720 boards for a full roster — about 2,400, or a
 * quarter of a second — and it is a sound split precisely because of the limitation above: with
 * so few positional effects modelled, which six you field dominates where you put them. The two
 * questions are very nearly independent, so answering them in sequence loses very little.
 *
 * It is not exhaustive, and the UI says "searched N lineups" rather than claiming optimality.
 */

/** How many of stage one's best selections get an exhaustive arrangement search in stage two. */
const LINEUP_FINALISTS = 3;

/** The board holds six. */
const GRID_CAPACITY = STABLE_SLOT_ORDER.length;

/** One monster in the roster, with where it currently stands and what to call it. */
interface RosterMember {
  origin: RosterRef;
  creature: RosteredCreature;
  name: string;
}

/** The slot a member currently stands in, or `null` when it is benched. */
function currentSlot(member: RosterMember): GridSlot | null {
  return member.origin.zone === RosterZone.Grid ? member.origin.slot : null;
}

/** A proposed board: who stands where. */
interface Assignment {
  member: RosterMember;
  slot: GridSlot;
}

export interface BenchSwap {
  benchIndex: BenchIndex;
  name: string;
  /** The grid slot this candidate would take. */
  slot: GridSlot;
  /** Who it displaces, or `null` when the slot is empty and the team simply grows. */
  replaces: string | null;
  /** Window-average DPS of the board after the swap. */
  dps: number;
  /** That figure minus the current board's. Negative is a real and useful answer. */
  dpsDelta: number;
}

export interface LineupSuggestion {
  placements: TeamPlacement[];
  bench: BenchedCreature[];
  dps: number;
  /** Benched monsters this lineup brings on, and where it puts them. */
  bringIn: { name: string; slot: GridSlot }[];
  /** Placed monsters this lineup sends to the bench. */
  sendOut: string[];
  /** Monsters already on the board that only change slot. */
  moves: { name: string; slot: GridSlot }[];
  /** How many boards the two stages simulated between them. */
  evaluated: number;
}

export interface BenchAdvice {
  /**
   * The best single slot for each benched monster, ranked by what it gains. A straight one-for-one
   * swap with nothing else moving, because that is the action the figure describes — rearranging
   * is what `lineup` is for, and folding it in here would make each row promise a gain the swap
   * alone does not deliver.
   */
  swaps: BenchSwap[];
  /** The best roster-wide lineup, or `null` when the current board already wins. */
  lineup: LineupSuggestion | null;
  /** Benched monsters carrying a positional ability the engine does not read. See the header. */
  unreadablePositional: string[];
}

/**
 * How a monster is named in the advice: "Thorntail Lv.4", with a ✦ when it is shiny.
 *
 * The level is part of the NAME here rather than a detail beside it, because duplicates are the
 * normal case on a board that has a bench — you park a second Bumblebolt precisely to weigh it
 * against the one you are playing. Without the level, "bringing on Bumblebolt and benching
 * Bumblebolt" is advice the user cannot act on, and that sentence is one this module really did
 * produce. The level is also usually the substance of the comparison.
 */
function creatureName(member: RosteredCreature, corpus: Corpus): string {
  const record = applyShinyOverlay(findCreature(corpus, member.creatureId, member.level), member.shiny);
  return `${record?.name ?? member.creatureId} Lv.${member.level}${member.shiny ? " ✦" : ""}`;
}

/**
 * Every monster the user owns, placed or benched, in a stable order.
 *
 * Placed first so that ties in the search resolve toward the board the user already has — a
 * suggestion that reshuffles three monsters to gain nothing is noise.
 */
function rosterOf(config: TeamConfiguration, corpus: Corpus): RosterMember[] {
  const placed = [...config.placements]
    .sort((a, b) => STABLE_SLOT_ORDER.findIndex((s) => slotsEqual(s, a.slot)) - STABLE_SLOT_ORDER.findIndex((s) => slotsEqual(s, b.slot)))
    .map((p) => ({ origin: gridRef(p.slot), creature: creatureOf(p), name: creatureName(p, corpus) }));
  const benched = [...benchOf(config)]
    .sort((a, b) => a.index - b.index)
    .map((b) => ({ origin: benchRef(b.index), creature: creatureOf(b), name: creatureName(b, corpus) }));
  return [...placed, ...benched];
}

/**
 * The slots a lineup of `count` monsters uses: the ones already occupied first, then empty ones.
 *
 * Occupied-first is what keeps a suggestion minimal. Any six distinct slots hold six monsters
 * equally well as far as the board is concerned, so without an ordering the search would happily
 * propose moving an untouched team one column to the right.
 */
function slotsForLineup(config: TeamConfiguration, count: number): GridSlot[] {
  const occupied = STABLE_SLOT_ORDER.filter((s) => config.placements.some((p) => slotsEqual(p.slot, s)));
  const empty = STABLE_SLOT_ORDER.filter((s) => !config.placements.some((p) => slotsEqual(p.slot, s)));
  return [...occupied, ...empty].slice(0, count);
}

/**
 * Turns an assignment into a real board, applying the SAME modifier rule a drag applies.
 *
 * `settle` (in `engine/roster.ts`) is what the context calls when the user actually performs the
 * move, so a slot-scoped bonus transfers to whoever takes the slot here exactly as it would there.
 * Computing it any other way would let the advisor quote a DPS the board does not then produce,
 * and the difference would be a modifier the user cannot see.
 *
 * Everyone not assigned a slot goes to the bench, renumbered from zero.
 */
function boardFor(config: TeamConfiguration, roster: RosterMember[], assignments: Assignment[]): TeamConfiguration {
  const occupantBySlot = new Map(config.placements.map((p) => [slotKey(p.slot), p]));
  const placements = assignments.map(({ member, slot }) =>
    settleOnGrid(member.creature, slot, occupantBySlot.get(slotKey(slot))),
  );
  const fielded = new Set(assignments.map((a) => rosterRefKey(a.member.origin)));
  const bench = roster
    .filter((m) => !fielded.has(rosterRefKey(m.origin)))
    .slice(0, BENCH_SIZE)
    .map((m, i) => settleOnBench(m.creature, BENCH_INDEXES[i]!));
  return { ...config, placements, bench };
}

/** One board, one `simulate()`, both figures the advisor reports. */
function evaluate(config: TeamConfiguration, corpus: Corpus): { score: number; dps: number } {
  const result = simulate(config, corpus);
  return { score: timeWeightedScore(result), dps: windowAverageDps(result) };
}

/**
 * The best slot for each benched monster, as a plain one-for-one swap.
 *
 * Six boards per candidate — every slot, occupied or not — which for a four-strong bench is 24
 * simulations and costs less than the arrangement search it sits beside.
 */
function bestSwaps(
  config: TeamConfiguration,
  roster: RosterMember[],
  corpus: Corpus,
  currentDps: number,
): BenchSwap[] {
  /** The board as it stands, as assignments — the thing a swap changes exactly one entry of. */
  const standing: Assignment[] = roster.flatMap((member) => {
    const slot = currentSlot(member);
    return slot ? [{ member, slot }] : [];
  });

  const swaps: BenchSwap[] = [];
  for (const candidate of roster) {
    if (candidate.origin.zone !== RosterZone.Bench) continue;
    const benchIndex = candidate.origin.index;
    let best: BenchSwap | null = null;
    for (const slot of STABLE_SLOT_ORDER) {
      // Everyone else stays exactly where they are; whoever held `slot` steps off the board.
      const others = standing.filter((a) => !slotsEqual(a.slot, slot));
      const { dps } = evaluate(boardFor(config, roster, [...others, { member: candidate, slot }]), corpus);
      if (best !== null && dps <= best.dps) continue;
      const displaced = config.placements.find((p) => slotsEqual(p.slot, slot));
      best = {
        benchIndex,
        name: candidate.name,
        slot,
        replaces: displaced ? creatureName(displaced, corpus) : null,
        dps,
        dpsDelta: dps - currentDps,
      };
    }
    if (best) swaps.push(best);
  }
  // Biggest gain first. A candidate that makes the team worse still earns a row — "do not buy
  // this" is as useful an answer as the other kind, and omitting it would read as a missing result.
  return swaps.sort((a, b) => b.dpsDelta - a.dpsDelta);
}

/** Every `size`-strong selection from `items`. `C(10, 6)` = 210 at the roster's largest. */
function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const [head, ...rest] = items as [T, ...T[]];
  return [...combinations(rest, size - 1).map((c) => [head, ...c]), ...combinations(rest, size)];
}

/**
 * Stage one's arrangement: everyone keeps the slot they already hold, newcomers take what is left.
 *
 * This is the board a user would get by dragging the candidates in one at a time without thinking
 * about position, which makes it the right baseline to COMPARE selections by — it isolates the
 * change of personnel from the change of arrangement.
 */
function canonicalAssignment(selection: RosterMember[], slots: GridSlot[]): Assignment[] {
  /** The slot a member keeps, which is its current one only if the lineup actually uses it. */
  const kept = (member: RosterMember): GridSlot | null => {
    const slot = currentSlot(member);
    return slot && slots.some((s) => slotsEqual(s, slot)) ? slot : null;
  };
  const free = slots.filter((s) => !selection.some((m) => kept(m) && slotsEqual(kept(m)!, s)));
  let next = 0;
  return selection.map((member) => ({ member, slot: kept(member) ?? free[next++]! }));
}

function bestLineup(
  config: TeamConfiguration,
  roster: RosterMember[],
  corpus: Corpus,
  currentScore: number,
): LineupSuggestion | null {
  const count = Math.min(GRID_CAPACITY, roster.length);
  if (count === 0) return null;
  const slots = slotsForLineup(config, count);
  let evaluated = 0;

  // Stage one: score each selection once, in the arrangement that moves the fewest monsters.
  const selections = combinations(roster, count).map((selection) => {
    const assignments = canonicalAssignment(selection, slots);
    evaluated++;
    return { assignments, score: evaluate(boardFor(config, roster, assignments), corpus).score };
  });

  /*
   * The selection the user already fields, which stage two SKIPS.
   *
   * Permuting it would re-run the search `suggestPlacement` has just finished — the two would
   * cover identical boards — and would then report the winner twice, once as a rearrangement and
   * once as a "lineup" that changes nobody. The division is cleaner for it: the section above
   * answers where to put the monsters you are fielding, this one answers which to field. It also
   * takes roughly 150ms off the common case, since the current selection is usually a finalist.
   */
  const standing = new Set(
    roster.filter((m) => currentSlot(m) !== null).map((m) => rosterRefKey(m.origin)),
  );
  const isStandingSelection = (members: RosterMember[]) =>
    members.length === standing.size && members.every((m) => standing.has(rosterRefKey(m.origin)));

  // Stage two: permute the finalists exhaustively. The canonical arrangement is already among
  // these permutations, so stage two can only improve on stage one's figure, never contradict it.
  let bestScore = currentScore;
  let best: Assignment[] | null = null;
  for (const finalist of selections.sort((a, b) => b.score - a.score).slice(0, LINEUP_FINALISTS)) {
    const members = finalist.assignments.map((a) => a.member);
    if (isStandingSelection(members)) continue;
    for (const order of permutations(members)) {
      const assignments = order.map((member, i) => ({ member, slot: slots[i]! }));
      evaluated++;
      const { score } = evaluate(boardFor(config, roster, assignments), corpus);
      if (score > bestScore + 1e-9) {
        bestScore = score;
        best = assignments;
      }
    }
  }
  if (!best) return null;

  const board = boardFor(config, roster, best);
  const bringIn = best
    .filter((a) => currentSlot(a.member) === null)
    .map((a) => ({ name: a.member.name, slot: a.slot }));
  const fielded = new Set(best.map((a) => rosterRefKey(a.member.origin)));
  const sendOut = roster
    .filter((m) => currentSlot(m) !== null && !fielded.has(rosterRefKey(m.origin)))
    .map((m) => m.name);
  // Only the monsters that actually change slot. Listing the ones already in place made the
  // instructions hard to find among no-ops — the same lesson `placementAdvice.ts` records.
  const moves = best
    .filter((a) => {
      const from = currentSlot(a.member);
      return from !== null && !slotsEqual(from, a.slot);
    })
    .map((a) => ({ name: a.member.name, slot: a.slot }));

  return {
    placements: board.placements,
    bench: board.bench ?? [],
    dps: evaluate(board, corpus).dps,
    bringIn,
    sendOut,
    moves,
    evaluated,
  };
}

/**
 * The bench half of the advice, or `null` when there is no bench to reason about.
 *
 * `currentScore` and `currentDps` are passed in rather than recomputed: `computePlacementAdvice`
 * has already simulated the current board to produce them, and a second simulation could not
 * disagree but would cost the same as four candidate boards.
 */
export function computeBenchAdvice(
  config: TeamConfiguration,
  corpus: Corpus,
  currentScore: number,
  currentDps: number,
): BenchAdvice | null {
  const bench = benchOf(config);
  if (bench.length === 0) return null;

  const roster = rosterOf(config, corpus);

  /*
   * The blind-spot disclosure for the candidates specifically.
   *
   * `analyzePositionalCoverage` reads a config's PLACEMENTS, so the bench is invisible to it by
   * the same design that makes the bench inert everywhere else. Handing it a board made of the
   * bench is how to ask it about them — the two fields read below are derived from each
   * creature's ability tags and not from where it is standing, so the fabricated slots do not
   * affect the answer.
   */
  const asBoard = bench
    .slice(0, GRID_CAPACITY)
    .map((b, i) => ({ ...b, slot: STABLE_SLOT_ORDER[i]! }) as TeamPlacement);
  const benchCoverage = analyzePositionalCoverage({ ...config, placements: asBoard }, corpus);
  const unreadablePositional = benchCoverage.withPositionalTag.filter(
    (n) => !benchCoverage.actionable.includes(n),
  );

  return {
    swaps: bestSwaps(config, roster, corpus, currentDps),
    lineup: bestLineup(config, roster, corpus, currentScore),
    unreadablePositional,
  };
}
