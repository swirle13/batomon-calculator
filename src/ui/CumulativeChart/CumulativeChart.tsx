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
        xLabel="seconds (0.5s increments)"
        yLabel="cumulative damage"
        xMax={windowSeconds}
        xTickInterval={1}
        ariaLabel="Line chart of cumulative damage by source over the simulated time window, sampled every 0.5 seconds"
        formatValue={(v) => v.toFixed(0)}
      />
    </section>
  );
}
