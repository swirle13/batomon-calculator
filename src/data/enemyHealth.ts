/**
 * Enemy team HP by day, observed from play.
 *
 * Recorded 2026-10-07 from a single run, read off the battle UI. Useful for a rough time-to-kill:
 * given a team's cumulative damage curve, the day tells you roughly how much there is to chew
 * through.
 *
 * ## What this is NOT
 *
 * One run. The game may scale HP by more than the day — opponent strength, rank, or run seed are
 * all plausible and none is ruled out by a single sample. Treat a TTK built on this as an estimate
 * of the right order of magnitude, not a number to tune against.
 *
 * It also assumes the enemy does nothing: **no healing, no status clearing, no shields**. Every one
 * of those exists in the game, so a real fight lasts longer than this implies — the figure is a
 * floor on time-to-kill, not a prediction.
 *
 * ## Sudden death
 *
 * A prior note in this codebase claimed sudden death begins at 15s, and the default simulation
 * window was set to 15s on that basis. **That claim came from a search result and is not
 * supported by observation** — the recorded battle ran past 23s with no sign of it. Whether sudden
 * death has a fixed onset, or varies by day, is **unknown**. Nothing in the engine should assume a
 * value for it until someone records one.
 */

/** Day -> enemy team HP. */
export const ENEMY_HP_BY_DAY: Readonly<Record<number, number>> = {
  1: 300,
  2: 500,
  3: 800,
  4: 1_400,
  5: 2_400,
  6: 3_800,
  7: 5_700,
  8: 8_300,
  9: 11_600,
  10: 17_300,
  11: 24_900,
  12: 34_700,
  13: 47_300,
  14: 63_000,
  15: 82_400,
  16: 106_000,
  17: 134_300,
  18: 168_000,
  /**
   * DERIVED, not read directly. The run was carrying a +25% max-health trinket by this point and
   * the UI showed 259,625; 259,625 / 1.25 = **207,700** exactly, and the implied day-18→19 ratio of
   * 1.236 sits right on the curve's declining trend (1.267, 1.251, …). Recorded because the
   * arithmetic is clean, flagged because it is one step removed from the observation.
   */
  19: 207_700,
};

/** The highest day with recorded HP. Day 20 was reached but not captured. */
export const MAX_RECORDED_DAY = 19;

/**
 * The day a build is assumed to be for when it does not say (2026-10-08).
 *
 * Day 1 because it is the only day with an observed battle to check a figure against, and because
 * a build that predates `TeamConfiguration.runDay` recorded no day at all — reading that as "day
 * 1" is the one choice that cannot silently re-target an old saved board at a harder fight.
 */
export const DEFAULT_RUN_DAY = 1;

/**
 * Exponent of the power law fitted to the late curve, anchored at the last observation:
 *
 *     HP(d) = HP(19) · (d / 19) ^ 3.833
 *
 * ## Why this supersedes "do not extrapolate"
 *
 * This file used to refuse to project, on the grounds that the day-over-day growth ratio was
 * "still falling at the last sample" and so had not settled. That reasoning held while the ratio
 * was all anyone had looked at. Fitted on a log-log axis the curve is not unsettled at all — it is
 * a clean power law from day 9 on, and the falling ratio is simply what a power law DOES
 * (1.236 at day 18 is just (19/18)^3.833).
 *
 * The fit reproduces every recorded day from 9 to 19 within 2.9%, and the anchor makes day 20
 * continuous with the day-19 observation rather than stepping off it. The implied ratios continue
 * the observed trend without a kink: …1.251, 1.236 observed, then 1.217, 1.206, 1.195 projected.
 *
 * ## Where it fails
 *
 * Day 8 is off by 9% and everything below it is off by far more — days 1 to 7 are clearly
 * hand-authored and no curve through the late game describes them. That does not matter here,
 * since those days are all observed, but it is why the exponent must never be used to interpolate
 * BACKWARDS as a sanity check on the table.
 */
const LATE_GROWTH_EXPONENT = 3.833;

/**
 * The last day this module will produce a figure for.
 *
 * The recorded run reached day 20, so one day past the table is a near-certain real day and the
 * rest are a guess at how long a run goes. 25 is where the projection stops being useful rather
 * than where it stops being arithmetically possible: at ~1.17× per day the error bar on an
 * unvalidated exponent compounds past anything a build decision should rest on.
 */
export const MAX_PROJECTED_DAY = 25;

/** Whether a day's HP was read off the battle UI or produced by {@link LATE_GROWTH_EXPONENT}. */
export type EnemyHpSource = "observed" | "projected";

export interface EnemyHpEntry {
  hp: number;
  source: EnemyHpSource;
}

/**
 * Enemy HP for a day with its provenance, or `null` past {@link MAX_PROJECTED_DAY}.
 *
 * Callers that show the number to a user should show the source alongside it. A projected figure
 * that looks like an observed one is the failure this return shape exists to prevent.
 */
export function enemyHpEntryForDay(day: number): EnemyHpEntry | null {
  const recorded = ENEMY_HP_BY_DAY[day];
  if (recorded !== undefined) return { hp: recorded, source: "observed" };
  if (!Number.isInteger(day) || day <= MAX_RECORDED_DAY || day > MAX_PROJECTED_DAY) return null;

  const raw = ENEMY_HP_BY_DAY[MAX_RECORDED_DAY]! * (day / MAX_RECORDED_DAY) ** LATE_GROWTH_EXPONENT;
  // Rounded to the hundred, which is the granularity the observed rows are recorded at. Carrying
  // the raw float would print "252799.7" and claim a precision the fit does not have.
  return { hp: Math.round(raw / 100) * 100, source: "projected" };
}

/** Enemy HP for a day, observed or projected, or `null` past {@link MAX_PROJECTED_DAY}. */
export function enemyHpForDay(day: number): number | null {
  return enemyHpEntryForDay(day)?.hp ?? null;
}

/**
 * Rough time-to-kill: the first sample time at which cumulative damage reaches the day's HP.
 *
 * `null` when the team does not get there inside the simulated window, which is a useful answer in
 * itself — it means "not within this window", not "never".
 *
 * Carries every caveat above: one run's HP data, and an enemy that neither heals, shields, nor
 * clears statuses.
 */
export function timeToKill(
  cumulativeSeries: { tSeconds: number; totalDamage: number }[],
  day: number,
): number | null {
  const hp = enemyHpForDay(day);
  if (hp === null) return null;
  for (const point of cumulativeSeries) {
    if (point.totalDamage >= hp) return point.tSeconds;
  }
  return null;
}
