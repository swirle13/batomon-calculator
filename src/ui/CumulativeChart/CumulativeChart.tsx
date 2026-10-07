import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
export function CumulativeChart({ result }: CumulativeChartProps) {
  const data = result.cumulativeSeries.map((point) => ({
    t: point.tSeconds,
    Total: point.totalDamage,
    Burn: point.byStatus.Burn,
    Poison: point.byStatus.Poison,
    Shock: point.byStatus.Shock,
    Shield: point.byStatus.Shield,
  }));
  // FR-017 / research.md D4 (2026-10-05 round 2): the simulated window end is always the last
  // sample (simulate() always appends `windowSeconds` to its sampleTimes) — used as an explicit
  // numeric domain below so Recharts' own "nice tick" generator picks clean, evenly-spaced
  // values instead of defaulting to a category axis keyed off every raw event timestamp.
  const windowSeconds = data.length > 0 ? data[data.length - 1]!.t : 0;

  return (
    <section>
      <h2>Cumulative damage &amp; status over time</h2>
      <div
        role="img"
        aria-label="Line chart of cumulative total damage, Burn, Poison, and Shock damage, and Shield granted, over the simulated time window"
        style={{ width: "100%", height: 320 }}
      >
        <ResponsiveContainer>
          {/* FR-054 (item 19): `left` was 0, so the rotated Y label had no room and was clipped to
                "cumulative valu"; `bottom` is raised so the centred X label clears the tick labels.
                2026-10-06 (FR-082 / WI-008): `left` went 16 -> 56. Sixteen fit 2-3 digit ticks but
                not the 5-digit totals a stacking-status team reaches, where the rotated label
                collided with them; the label is now offset clear of the tick column. */}
          <LineChart data={data} margin={{ top: 8, right: 24, bottom: 24, left: 56 }}>
            {/* Recharts' defaults assume a light background; this app is dark-mode-aware
                (src/index.css prefers-color-scheme: dark), so axis/grid/legend/tooltip colors
                are set explicitly rather than left to default near-black-on-black. */}
            <CartesianGrid strokeDasharray="3 3" stroke="#444857" />
            {/* FR-017 (2026-10-05 round 2): type="number" + an explicit domain fixes two bugs —
                (1) the default category axis placed one tick per raw data point, evenly spaced
                in *pixels* but not in *value* (e.g. "4, 4.9, 5.9, 6, 6.9..."); (2) occasional
                float-drift artifacts (e.g. "14.7000000000000001") leaking into tick labels.
                A numeric axis uses Recharts' own linear-scale "nice tick" generator instead,
                independent of the underlying data points' exact values. */}
            <XAxis
              dataKey="t"
              type="number"
              domain={[0, windowSeconds]}
              stroke="#9ca3af"
              tick={{ fill: "#9ca3af" }}
              height={44}
              // FR-054: was `insideBottomRight`, i.e. right-justified. Centred now.
              label={{ value: "seconds", position: "insideBottom", offset: -8, fill: "#9ca3af" }}
            />
            <YAxis
              stroke="#9ca3af"
              tick={{ fill: "#9ca3af" }}
              // FR-054: Recharts anchors `insideLeft` at the text's START at the plot's vertical
              // midpoint and the rotated text runs upward, so it reads off-centre even once it
              // fits — `textAnchor: middle` is what actually centres it.
              label={{
                value: "cumulative value",
                angle: -90,
                position: "insideLeft",
                offset: -40,
                fill: "#9ca3af",
                style: { textAnchor: "middle" },
              }}
            />
            <Tooltip
              contentStyle={{ background: "#1f2028", border: "1px solid #444857" }}
              labelStyle={{ color: "#f3f4f6" }}
              itemStyle={{ color: "#f3f4f6" }}
            />
            <Legend wrapperStyle={{ color: "#9ca3af" }} />
            {/* User-reported: dark gray was unreadable against the app's black background. */}
            <Line type="stepAfter" dataKey="Total" stroke="#f5f5f5" dot={false} />
            <Line type="monotone" dataKey="Burn" stroke={STAT_COLORS.burn} dot={false} />
            <Line type="monotone" dataKey="Poison" stroke={STAT_COLORS.poison} dot={false} />
            <Line type="monotone" dataKey="Shock" stroke={STAT_COLORS.shock} dot={false} />
            {/* 2026-10-06 round 7 (FR-041 / Principle VII): these strokes were hard-coded and had
                already drifted from STAT_COLORS — fixing only statColors.ts would have left Shield
                blue here while it was silver everywhere else. */}
            <Line type="monotone" dataKey="Shield" stroke={STAT_COLORS.shield} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
