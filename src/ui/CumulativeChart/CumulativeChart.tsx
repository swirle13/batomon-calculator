import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SimulationResult } from "../../data/types";

interface CumulativeChartProps {
  result: SimulationResult;
}

/**
 * FR-010: cumulative total damage + per-status-effect value over the simulated window.
 * Renders `SimulationResult.cumulativeSeries` directly — no separate recomputation
 * (data-model.md's single-source-of-truth rule; Constitution Development Workflow).
 */
export function CumulativeChart({ result }: CumulativeChartProps) {
  const data = result.cumulativeSeries.map((point) => ({
    t: point.tSeconds,
    Total: point.totalDamage,
    Burn: point.byStatus.Burn,
    Poison: point.byStatus.Poison,
    Shock: point.byStatus.Shock,
  }));

  return (
    <section>
      <h2>Cumulative damage &amp; status over time</h2>
      <div
        role="img"
        aria-label="Line chart of cumulative total damage and per-status-effect damage over the simulated time window"
        style={{ width: "100%", height: 320 }}
      >
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="t" label={{ value: "seconds", position: "insideBottomRight", offset: -4 }} />
            <YAxis label={{ value: "cumulative value", angle: -90, position: "insideLeft" }} />
            <Tooltip />
            <Legend />
            <Line type="stepAfter" dataKey="Total" stroke="#333333" dot={false} />
            <Line type="monotone" dataKey="Burn" stroke="#e07b39" dot={false} />
            <Line type="monotone" dataKey="Poison" stroke="#5b8c3f" dot={false} />
            <Line type="monotone" dataKey="Shock" stroke="#d4b106" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
