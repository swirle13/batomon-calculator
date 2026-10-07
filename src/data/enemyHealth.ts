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
 * Enemy HP for a day, or `null` beyond what was recorded.
 *
 * Returns `null` rather than extrapolating. The growth ratio is still falling at the last sample
 * (1.67 → 1.25 and dropping), so it has not settled, and projecting from an unsettled curve would
 * produce a confident-looking number with nothing behind it.
 */
export function enemyHpForDay(day: number): number | null {
  return ENEMY_HP_BY_DAY[day] ?? null;
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
