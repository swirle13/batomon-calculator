import { enemyHpEntryForDay, timeToKill } from "../../data/enemyHealth";
import type { EnemyHpSource } from "../../data/enemyHealth";

/**
 * How far above the team's own output an HP threshold may sit before it is dropped.
 *
 * The y axis extends to fit a reference line, so a day-17 enemy at 134k on a board that deals 9k
 * would squash all five series into the bottom 7% of the plot — the chart would stop showing the
 * thing it exists to show in order to display one dashed line whose only message is "no".
 *
 * Read as a floor on the plot the DATA keeps: 2 means the curve always has at least half the
 * height, which is enough to still read its shape. Stated that way rather than as a tuned
 * constant, because the number is the whole content of the rule and "1.5" could not justify its
 * own caption — a line 50% above the curve is a near miss worth seeing, and telling the user it
 * was "too far above the chart to draw" was not true at that ratio.
 */
export const MAX_THRESHOLD_OVERSHOOT = 2;

export interface EnemyThreshold {
  hp: number;
  source: EnemyHpSource;
  /** Where the Total line crosses `hp`, or `null` if it does not within the window. */
  killSeconds: number | null;
  /** Cumulative total at the end of the window — what `hp` is judged against. */
  peakDamage: number;
  /** False when `hp` is so far above `peakDamage` that drawing it would flatten the series. */
  drawable: boolean;
}

/**
 * Resolves the day's enemy HP into everything the chart needs to draw it, or `null` for a day with
 * no figure at all.
 *
 * Kept out of the component for the reason `yAxisWidth` is: a lowercase-named function export in
 * `CumulativeChart.tsx` takes that module off React Fast Refresh's path. It is also the only part
 * of the threshold with a decision in it, and the repo does not render Recharts under jsdom, so
 * this is the seam where the behaviour can actually be tested.
 */
export function enemyThresholdFor(
  cumulativeSeries: { tSeconds: number; totalDamage: number }[],
  day: number,
): EnemyThreshold | null {
  const entry = enemyHpEntryForDay(day);
  if (entry === null) return null;

  const last = cumulativeSeries[cumulativeSeries.length - 1];
  const peakDamage = last?.totalDamage ?? 0;
  const killSeconds = timeToKill(cumulativeSeries, day);

  return {
    hp: entry.hp,
    source: entry.source,
    killSeconds,
    peakDamage,
    // A crossing is never off-scale, so a team that gets there always gets the line regardless of
    // the ratio — the guard only ever suppresses a threshold the curve never reaches.
    drawable: killSeconds !== null || entry.hp <= peakDamage * MAX_THRESHOLD_OVERSHOOT,
  };
}
