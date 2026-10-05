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
    Shield: point.byStatus.Shield,
  }));

  return (
    <section>
      <h2>Cumulative damage &amp; status over time</h2>
      <div
        role="img"
        aria-label="Line chart of cumulative total damage, Burn, Poison, and Shock damage, and Shield granted, over the simulated time window"
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
            {/* User-requested: Poison is purple, not green (previously #5b8c3f). */}
            <Line type="monotone" dataKey="Poison" stroke="#8e44ad" dot={false} />
            <Line type="monotone" dataKey="Shock" stroke="#d4b106" dot={false} />
            {/* Shield counters (user-requested): cumulative Shield granted, not absorbed. */}
            <Line type="monotone" dataKey="Shield" stroke="#2e86de" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
