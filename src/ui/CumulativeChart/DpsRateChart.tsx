import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SimulationResult } from "../../data/types";
import { STAT_COLORS } from "../../data/statColors";

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
export function DpsRateChart({ result }: DpsRateChartProps) {
  const data = result.dpsRateSeries.map((point) => ({ t: point.tSeconds, DPS: point.dps }));
  const windowSeconds = data.length > 0 ? data[data.length - 1]!.t : 0;

  return (
    <section>
      <h2>Damage per second over time</h2>
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", maxWidth: "48rem", margin: "0 auto 0.5rem" }}>
        Output <em>at each moment</em>, not the running total. A team leaning on stacking statuses
        ramps upward here; a direct-damage team stays flat. Use it to judge early versus late output.
      </p>
      <div
        role="img"
        aria-label="Line chart of instantaneous damage per second over the simulated time window"
        style={{ width: "100%", height: 260 }}
      >
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 24, bottom: 24, left: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#444857" />
            <XAxis
              dataKey="t"
              type="number"
              domain={[0, windowSeconds]}
              stroke="#9ca3af"
              tick={{ fill: "#9ca3af" }}
              height={44}
              label={{ value: "seconds", position: "insideBottom", offset: -8, fill: "#9ca3af" }}
            />
            <YAxis
              stroke="#9ca3af"
              tick={{ fill: "#9ca3af" }}
              label={{
                value: "damage per second",
                angle: -90,
                position: "insideLeft",
                fill: "#9ca3af",
                style: { textAnchor: "middle" },
              }}
            />
            <Tooltip
              contentStyle={{ background: "#1f2028", border: "1px solid #444857" }}
              labelStyle={{ color: "#f3f4f6" }}
              itemStyle={{ color: "#f3f4f6" }}
              formatter={(value) => [Number(value).toFixed(2), "DPS"] as [string, string]}
              labelFormatter={(t) => `t = ${String(t)}s`}
            />
            <Legend wrapperStyle={{ color: "#9ca3af" }} />
            <Line type="monotone" dataKey="DPS" stroke={STAT_COLORS.damage} dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
