import { enemyHpForDay, timeToKill } from "../data/enemyHealth";
import { simulate } from "./simulate";
import type { Corpus, TeamConfiguration } from "../data/types";

/**
 * How far past the simulation window the search will run before giving up.
 *
 * An hour is not a plausible battle. It is a bound on a loop, chosen so that the answer "this
 * board never gets there" is reached by exhausting a real search rather than by hitting a limit a
 * user might reasonably have wanted raised. Past this, a build comparison is not what anyone is
 * doing any more.
 */
export const MAX_TTK_SECONDS = 3600;

/** Where a doubling search starts when the configured window is very short. */
const MIN_PROBE_SECONDS = 60;

/**
 * Time to kill the day's enemy, NOT limited by the simulation window.
 *
 * ## Why the window had to stop being the answer
 *
 * `timeToKill` reads the cumulative series, so it could only ever see as far as the chart does —
 * a board that kills day 12 at 47s read `>30s` at the default window, which is a fact about the
 * chart rather than about the board. Worse, the figure MOVED when the window moved, so two builds
 * compared at different windows were not comparable at all.
 *
 * ## Why this re-simulates instead of extrapolating
 *
 * The obvious cheap answer — `hp / windowAverageDps` — is wrong here, and not slightly. Poison
 * never decays, so a status board's cumulative damage grows roughly quadratically: the two-mon
 * Venopuff/Magmite pair deals 524 over 30s and 206,017 over 600s, which is 20x the window but
 * 393x the damage. Dividing by an average rate would have reported a time-to-kill some two orders
 * of magnitude too long for exactly the archetype this calculator exists to evaluate.
 *
 * So the engine is run further out instead, and the answer is read off a real curve.
 *
 * ## Cost
 *
 * The already-computed series is checked first and costs nothing, which is the common case — most
 * boards are built against a day they clear. Only a board that does NOT clear pays for the
 * search, and the doubling keeps that proportional to the answer: a kill at 90s costs one 120s
 * run, not an hour-long one. A full search to {@link MAX_TTK_SECONDS} is ~20ms and happens only
 * for a board that cannot win.
 *
 * @param known The caller's existing `cumulativeSeries`, so the common case needs no simulation.
 * @returns Seconds on the engine's 0.5s grid, or `null` for "not within {@link MAX_TTK_SECONDS}"
 *   — which also covers a day with no recorded HP and a board that deals no damage at all.
 */
export function timeToKillSeconds(
  config: TeamConfiguration,
  corpus: Corpus,
  day: number,
  known: { tSeconds: number; totalDamage: number }[],
): number | null {
  if (enemyHpForDay(day) === null) return null;

  const withinWindow = timeToKill(known, day);
  if (withinWindow !== null) return withinWindow;

  // A board dealing nothing will deal nothing for an hour too, and the doubling search cannot
  // learn that — it would run every probe to the cap to rediscover zero. This is the empty grid
  // and the all-passive board, both of which a user hits just by opening the page.
  if ((known[known.length - 1]?.totalDamage ?? 0) <= 0) return null;

  for (
    let probe = Math.max(config.simulationWindowSeconds * 2, MIN_PROBE_SECONDS);
    probe <= MAX_TTK_SECONDS;
    probe *= 2
  ) {
    // `Math.min` on the last step: without it a window of 30 probes 60/120/…/1920/3840 and the
    // final doubling overshoots the cap, so the hour between 1920 and 3600 is never searched and
    // a board that kills at 2000s reports "never".
    const seconds = Math.min(probe, MAX_TTK_SECONDS);
    const result = simulate({ ...config, simulationWindowSeconds: seconds }, corpus);
    const found = timeToKill(result.cumulativeSeries, day);
    if (found !== null) return found;
    if (seconds === MAX_TTK_SECONDS) break;
  }
  return null;
}
