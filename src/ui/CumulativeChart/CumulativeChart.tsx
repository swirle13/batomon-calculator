import type { SimulationResult } from "../../data/types";
import { STAT_COLORS } from "../../data/statColors";

interface CumulativeChartProps {
  result: SimulationResult;
}

/**
 * FR-010: cumulative total damage + per-status-effect value over the simulated window.
 * Renders `SimulationResult.cumulativeSeries` directly — no separate recomputation
 * (data-model.md's single-source-of-truth rule; Constitution Development Workflow).
 */
import { SeriesChart } from "./SeriesChart";
export function CumulativeChart({ result }: CumulativeChartProps) {
  const series = result.cumulativeSeries;
  const xValues = series.map((p) => p.tSeconds);
  // FR-017 / research.md D4: the window end is always the last sample, used as an explicit numeric
  // domain so Recharts picks clean ticks instead of a category axis keyed off raw timestamps.
  const windowSeconds = xValues.length > 0 ? xValues[xValues.length - 1]! : 0;

  return (
    <section>
      <h2>Cumulative damage over time, by type</h2>
      {/* T256: the shared chart. These five lines are why the component takes a LIST of series —
          a single-series signature could not express this chart at all. T257: the 0.5s increment is
          stated once on the axis instead of in every hover card. */}
      <SeriesChart
        xValues={xValues}
        series={[
          // `stepAfter` for Total: cumulative damage changes discretely, at casts and ticks, so a
          // straight interpolation would imply damage accruing smoothly between events.
          { name: "Total", values: series.map((p) => p.totalDamage), color: "#f5f5f5", lineType: "stepAfter" },
          // Direct damage as its own line: it was previously only inside Total, so on a mixed team
          // you could see the Total move without being able to tell what moved it. Cyan is far
          // from Burn's orange and from the white Total it used to hide inside.
          { name: "Direct", values: series.map((p) => p.directDamage), color: "#4dd0e1", lineType: "stepAfter" },
          { name: "Burn", values: series.map((p) => p.byStatus.Burn), color: STAT_COLORS.burn },
          { name: "Poison", values: series.map((p) => p.byStatus.Poison), color: STAT_COLORS.poison },
          { name: "Shock", values: series.map((p) => p.byStatus.Shock), color: STAT_COLORS.shock },
          // Shield's published colour (#9aa1b8) is a grey-blue that sat too close to the white
          // Total line to tell apart. Shifted blue for legibility ONLY on this chart; the stat
          // badges and chips keep the game's own colour, which is what players match against.
          { name: "Shield", values: series.map((p) => p.byStatus.Shield), color: "#5b8dd9" },
        ]}
        xLabel="seconds (0.5s increments)"
        yLabel="cumulative value"
        xMax={windowSeconds}
        xTickInterval={1}
        ariaLabel="Line chart of cumulative damage and status output over the simulated time window, sampled every 0.5 seconds"
        formatValue={(v) => v.toFixed(0)}
      />
    </section>
  );
}
