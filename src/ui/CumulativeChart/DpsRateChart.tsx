import { memo } from "react";
import type { SimulationResult } from "../../data/types";
import { STAT_COLORS } from "../../data/statColors";
import { formatRate } from "../../data/format";

interface DpsRateChartProps {
  result: SimulationResult;
}

/**
 * FR-068 (WI-017, 2026-10-06 round 8): damage per second *at each moment*, as opposed to the
 * cumulative chart's running total.
 *
 * Why a second chart rather than another line on the first: the cumulative series is monotonic by
 * construction, so it can never show output falling or accelerating — the "ebb and flow" the user
 * asked to see. A Poison team's cumulative curve and a direct-damage team's look alike in shape;
 * their rate curves do not. This is the same information the status table now reports as
 * "Dmg/s (end)" and "Growth/s²", in the form where a ramp is visible at a glance.
 *
 * Renders `result.dpsRateSeries` directly — no recomputation (data-model.md's single-source-of-truth
 * rule), and the engine test asserts that integrating this series reproduces the cumulative total.
 * Axis/colour treatment is shared with `CumulativeChart` rather than restyled (Principle VII).
 */
import { SeriesChart } from "./SeriesChart";
/** Memoized for the same reason as `CumulativeChart` — see the note there. */
export const DpsRateChart = memo(function DpsRateChart({ result }: DpsRateChartProps) {
  const xValues = result.dpsRateSeries.map((p) => p.tSeconds);
  const windowSeconds = xValues.length > 0 ? xValues[xValues.length - 1]! : 0;

  return (
    <section>
      <h2>Damage per second over time</h2>
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", maxWidth: "48rem", margin: "0 auto 0.5rem" }}>
        Output <em>at each moment</em>, not the running total. A team leaning on stacking statuses
        ramps upward here; a direct-damage team stays flat. Use it to judge early versus late output.
      </p>
      {/* T256/T257: the shared chart, and the 0.5s increment stated on the axis rather than
          repeated in every hover card. */}
      <SeriesChart
        xValues={xValues}
        series={[{ name: "DPS", values: result.dpsRateSeries.map((p) => p.dps), color: STAT_COLORS.damage }]}
        xLabel="seconds (0.5s increments)"
        yLabel="damage per second"
        xMax={windowSeconds}
        xTickInterval={1}
        ariaLabel="Line chart of instantaneous damage per second over the simulated time window, sampled every 0.5 seconds"
        formatValue={formatRate}
      />
    </section>
  );
});
