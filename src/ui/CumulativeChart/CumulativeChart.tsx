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
            {/* Recharts' defaults assume a light background; this app is dark-mode-aware
                (src/index.css prefers-color-scheme: dark), so axis/grid/legend/tooltip colors
                are set explicitly rather than left to default near-black-on-black. */}
            <CartesianGrid strokeDasharray="3 3" stroke="#444857" />
            <XAxis
              dataKey="t"
              stroke="#9ca3af"
              tick={{ fill: "#9ca3af" }}
              label={{ value: "seconds", position: "insideBottomRight", offset: -4, fill: "#9ca3af" }}
            />
            <YAxis
              stroke="#9ca3af"
              tick={{ fill: "#9ca3af" }}
              label={{ value: "cumulative value", angle: -90, position: "insideLeft", fill: "#9ca3af" }}
            />
            <Tooltip
              contentStyle={{ background: "#1f2028", border: "1px solid #444857" }}
              labelStyle={{ color: "#f3f4f6" }}
              itemStyle={{ color: "#f3f4f6" }}
            />
            <Legend wrapperStyle={{ color: "#9ca3af" }} />
            {/* User-reported: dark gray was unreadable against the app's black background. */}
            <Line type="stepAfter" dataKey="Total" stroke="#f5f5f5" dot={false} />
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
