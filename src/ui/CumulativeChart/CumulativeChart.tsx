import { memo } from "react";
import type { SimulationResult } from "../../data/types";
import { STAT_COLORS } from "../../data/statColors";

interface CumulativeChartProps {
  result: SimulationResult;
  /** Day whose enemy HP is drawn as a threshold. Shares the selector in `TotalDps`. */
  day: number;
}

const THRESHOLD_COLOR = "#ef5350";

/**
 * FR-010: cumulative total damage + per-status-effect value over the simulated window.
 * Renders `SimulationResult.cumulativeSeries` directly — no separate recomputation
 * (data-model.md's single-source-of-truth rule; Constitution Development Workflow).
 */
import { SeriesChart } from "./SeriesChart";
import { sameSeries } from "./sameSeries";
import { enemyThresholdFor } from "./enemyThreshold";
import styles from "./CumulativeChart.module.css";
/*
 * `memo` is load-bearing, not a reflex. `CalculatorView` holds the hovered-slot state that drives
 * the detail panel, so every pointer move across the grid re-renders the whole view — and a
 * Recharts tree is one of the most expensive things in it to rebuild. `result` is unchanged by a
 * hover, so this bails out instead.
 *
 * Compared BY VALUE (2026-10-08), not by `result` identity: a drag that swaps two Batomon produces
 * a new result object holding an identical damage curve, and this chart was rebuilding every path
 * in it to draw the same line. See `sameSeries` — including its rule about reading a second field.
 */
export const CumulativeChart = memo(function CumulativeChart({ result, day }: CumulativeChartProps) {
  const series = result.cumulativeSeries;
  const xValues = series.map((p) => p.tSeconds);
  // FR-017 / research.md D4: the window end is always the last sample, used as an explicit numeric
  // domain so Recharts picks clean ticks instead of a category axis keyed off raw timestamps.
  const windowSeconds = xValues.length > 0 ? xValues[xValues.length - 1]! : 0;

  /*
   * THE ENEMY'S HP AS A LINE TO CROSS (2026-10-08).
   *
   * `timeToKill` has existed since the HP table was recorded, but only ever as a figure in
   * `TotalDps` — "14.5s" with no way to see how it was arrived at, or how close a build that
   * misses came. Drawing the threshold puts the kill back where it happens: the instant the Total
   * line crosses the dashes. It also makes the SHAPE legible, which the number cannot — a curve
   * that crosses while still steepening has headroom, one that crosses as it flattens is finished.
   */
  const threshold = enemyThresholdFor(series, day);
  const hpText = threshold === null ? "" : `${threshold.hp.toLocaleString()} HP`;
  const estimated = threshold?.source === "projected" ? " (est.)" : "";

  return (
    <section>
      <h2>Cumulative damage over time, by type</h2>
      {/* T256: the shared chart. These five lines are why the component takes a LIST of series —
          a single-series signature could not express this chart at all. T257: the 0.5s increment is
          stated once on the axis instead of in every hover card. */}
      <SeriesChart
        xValues={xValues}
        /*
          EVERY series is `stepAfter`.

          Cumulative damage is a step function: it changes at an instant — a cast, a tick — and
          holds until the next one. Only Total and Direct said so once; the status lines fell back
          to straight-line interpolation, which drew a DIAGONAL between samples and made damage look
          like it accrued continuously in between.

          That was not cosmetic. Magmite casts at t=4.5, and the sloping line reached its new value
          by then from a start at t=4.0 — so the chart appeared to show the cast beginning half a
          second early, and the engine looked wrong when it was right. A chart that invents
          intermediate values is worse than a coarse one, because it reads as evidence.

          SHIELD IS DELIBERATELY ABSENT. It deals no damage and is already excluded from
          `totalDamage` for that reason, so a Shield line on a damage chart contradicted the
          chart's own total — the one line that could never add up to it. Shield output still
          appears in the status table and on the stat badges, where it is not being passed off as
          damage.
        */
        series={[
          { name: "Total", values: series.map((p) => p.totalDamage), color: "#f5f5f5", lineType: "stepAfter" },
          // Direct damage as its own line: it was previously only inside Total, so on a mixed team
          // you could see the Total move without being able to tell what moved it. Cyan is far
          // from Burn's orange and from the white Total it used to hide inside.
          { name: "Direct", values: series.map((p) => p.directDamage), color: "#4dd0e1", lineType: "stepAfter" },
          { name: "Burn", values: series.map((p) => p.byStatus.Burn), color: STAT_COLORS.burn, lineType: "stepAfter" },
          { name: "Poison", values: series.map((p) => p.byStatus.Poison), color: STAT_COLORS.poison, lineType: "stepAfter" },
          { name: "Shock", values: series.map((p) => p.byStatus.Shock), color: STAT_COLORS.shock, lineType: "stepAfter" },
        ]}
        referenceLines={
          threshold?.drawable
            ? [
                {
                  y: threshold.hp,
                  label:
                    threshold.killSeconds === null
                      ? `Day ${day} · ${hpText}${estimated}`
                      : `Day ${day} · ${hpText}${estimated} — cleared at ${threshold.killSeconds}s`,
                  color: THRESHOLD_COLOR,
                },
              ]
            : []
        }
        xLabel="seconds (0.5s increments)"
        yLabel="cumulative damage"
        xMax={windowSeconds}
        xTickInterval={1}
        ariaLabel={
          threshold?.drawable
            ? `Line chart of cumulative damage by source over the simulated time window, sampled every 0.5 seconds, with day ${day}'s enemy team health of ${hpText} marked as a threshold`
            : "Line chart of cumulative damage by source over the simulated time window, sampled every 0.5 seconds"
        }
        formatValue={(v) => v.toFixed(0)}
      />
      {/* The caption carries whatever the line cannot: either why it is not drawn, or the standing
          caveat that the HP table assumes an enemy that never heals, shields or clears status. */}
      {/* `peakDamage > 0` keeps the empty board quiet. With nothing placed the ratio is a division
          by zero dressed up as a fact — "300x the 0 this team deals" — and an empty chart does not
          need telling that it cannot kill anything. */}
      {threshold !== null && !threshold.drawable && threshold.peakDamage > 0 && (
        <p className={styles.note}>
          Day {day}&apos;s {hpText}
          {estimated} is {(threshold.hp / Math.max(threshold.peakDamage, 1)).toFixed(1)}× the{" "}
          {threshold.peakDamage.toLocaleString(undefined, { maximumFractionDigits: 0 })} this team
          deals in {windowSeconds}s, so the threshold is left off the chart rather than flattening
          the curve into the axis.
        </p>
      )}
      {threshold?.drawable && (
        <p className={styles.note}>
          The threshold is a <strong>floor</strong>: it assumes an enemy that never heals, shields
          or clears status, all of which exist, so a real fight runs longer.
          {estimated !== "" && " This day's HP is projected from the recorded curve, not observed."}
        </p>
      )}
    </section>
  );
}, (prev, next) =>
  // The comparator MUST cover `day` as well — see `sameSeries` on exactly this rule. Without it a
  // day change leaves the old threshold on screen, since the series it is drawn over is unchanged.
  prev.day === next.day && sameSeries(prev.result.cumulativeSeries, next.result.cumulativeSeries));
