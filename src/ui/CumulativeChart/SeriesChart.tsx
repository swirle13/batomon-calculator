import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompactValue } from "../../data/format";
import { yAxisWidthFor } from "./yAxisWidth";

/**
 * The ONE line chart (T256 / FR-103), parameterised rather than duplicated.
 *
 * Both charts previously hand-rolled their own axes, margins, dark-mode colours, legend and
 * tooltip. They diverged in exactly the way the user reported — "the hover tooltip representing
 * different values" — because only one of them had a tooltip `formatter` at all, so the same hover
 * gesture produced a formatted rate on one chart and a raw number on the other. That is a
 * Constitution Principle VII violation, and the user named it as one.
 *
 * ## Why the contract is a LIST of series
 *
 * The ask says "name, list of values, color of line". Singular would not fit: the cumulative chart
 * draws five lines (Total, Burn, Poison, Shock, Shield), each with its own stat colour and one
 * using a stepped interpolation, while the rate chart draws one. So "name / values / colour" is
 * read as a property of each series rather than of the chart.
 *
 * ## Why x values are indices into a shared grid
 *
 * Both series are now sampled on the same 0.5s grid (FR-106), so a point means the same thing in
 * both charts. The chart states the increment itself rather than repeating it per-point in the
 * tooltip — which is what the user asked for, and is also why the tooltip no longer needs a
 * `labelFormatter`.
 */
export interface ChartSeries {
  /** Legend label, e.g. "Poison". */
  name: string;
  /** One value per `xValues` entry. */
  values: number[];
  /** Stroke colour. */
  color: string;
  /** `stepAfter` for quantities that change discretely; defaults to a straight line. */
  lineType?: "linear" | "stepAfter";
}

/**
 * A horizontal threshold drawn across the plot, e.g. the enemy's HP for a day.
 *
 * Unlike a series it has no x extent and takes no part in the tooltip — it is a line you read the
 * series AGAINST, so the crossing is the information, not the line itself.
 */
export interface ChartReferenceLine {
  /** Position on the y axis, in data units. */
  y: number;
  /** Drawn above the line, inside the plot. */
  label: string;
  color: string;
}

export interface SeriesChartProps {
  /** Shared x positions, in seconds. */
  xValues: number[];
  series: ChartSeries[];
  /**
   * Thresholds drawn across the plot. The y domain EXTENDS to include them, so a caller passing a
   * line far above its data will flatten its own series — see `CumulativeChart` on the guard that
   * decides when a line is worth that cost.
   */
  referenceLines?: ChartReferenceLine[];
  xLabel: string;
  yLabel: string;
  /** Upper bound of each axis. Omit for Recharts' auto-domain. */
  xMax?: number;
  yMax?: number;
  /** Tick interval. The user's "x axis scale" — a spacing, not a log/linear switch. */
  xTickInterval?: number;
  yTickInterval?: number;
  /** Accessible description of the whole chart. */
  ariaLabel: string;
  /** Formats values in the tooltip, where there is room for the exact figure. */
  formatValue?: (value: number) => string;
  /**
   * Total height including the legend row and both axis labels — not the plot area alone. 284
   * keeps the plot itself at the ~260 it had before the legend moved to the top.
   */
  height?: number;
}

const AXIS = "#9ca3af";
const GRID = "#444857";

function ticksFor(max: number | undefined, interval: number | undefined): number[] | undefined {
  if (max === undefined || interval === undefined || interval <= 0) return undefined;
  const out: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += interval) out.push(Number(v.toFixed(4)));
  return out;
}

export function SeriesChart({
  xValues,
  series,
  referenceLines = [],
  xLabel,
  yLabel,
  xMax,
  yMax,
  xTickInterval,
  yTickInterval,
  ariaLabel,
  formatValue = (v) => v.toFixed(2),
  height = 284,
}: SeriesChartProps) {
  /*
   * Ticks are ABBREVIATED, the tooltip is not (2026-10-08).
   *
   * The gutter is measured from the widest tick, and these series have no ceiling: a poison build
   * compounds, so a few modifiers took the cumulative axis to "120000000" and the rate axis to
   * "18000000.00". At 7px a character that is a 100px gutter eating a phone-width plot, and it was
   * part of what pushed the page wider than the screen. Four characters cap it, by the same rule
   * the stat chips use — and no precision is lost, because hovering still gives the exact figure.
   */
  const formatTick = (v: number) => formatCompactValue(v, formatValue);
  // Reference lines are measured too: they extend the y domain, so a threshold above every sample
  // is what sets the widest tick, and leaving them out would size the gutter for the series alone.
  const yAxisWidth = yAxisWidthFor(
    [...series, { values: referenceLines.map((r) => r.y) }],
    formatTick,
    yMax,
  );

  const data = xValues.map((x, i) => {
    const row: Record<string, number> = { x };
    for (const s of series) row[s.name] = s.values[i] ?? 0;
    return row;
  });

  return (
    <div role="img" aria-label={ariaLabel} style={{ width: "100%", height }}>
      <ResponsiveContainer>
        {/*
          Margins carry the axis labels, so each one is sized for what sits in it:
          `left` holds up-to-5-digit ticks AND the rotated y label beside them; `bottom` holds the
          x label alone, now that the legend has moved to the top (see <Legend/>).
        */}
        <LineChart data={data} margin={{ top: 8, right: 24, bottom: 28, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
          <XAxis
            dataKey="x"
            type="number"
            domain={[0, xMax ?? "dataMax"]}
            ticks={ticksFor(xMax, xTickInterval)}
            stroke={AXIS}
            // `offset: -20` sits it below the tick row, in the bottom margin. It previously
            // overlapped the legend, which was also bottom-aligned — two things competing for one
            // strip. The legend moved rather than the label, since the label belongs to the axis.
            label={{ value: xLabel, position: "insideBottom", offset: -20, fill: AXIS }}
          />
          <YAxis
            // Explicit width rather than Recharts' default 60: the ticks are right-aligned inside
            // this band and the label is anchored at its left edge, so sizing the band is what
            // keeps them apart.
            width={yAxisWidth}
            domain={[0, yMax ?? "auto"]}
            ticks={ticksFor(yMax, yTickInterval)}
            stroke={AXIS}
            tickFormatter={formatTick}
            /*
              `textAnchor: middle` is the fix for the clipped y label, and it is not obvious:
              a rotated SVG label anchors at its START by default, so "cumulative damage" was being
              drawn from the vertical midpoint downward and ran off the bottom of the plot. Centring
              the anchor makes `position: insideLeft` actually centre it on the axis.

              `offset` is dropped: with the anchor centred it is no longer compensating for the
              mis-anchoring, and a negative offset now just pushes the label out of the margin.
            */
            label={{
              value: yLabel,
              angle: -90,
              position: "insideLeft",
              fill: AXIS,
              style: { textAnchor: "middle" },
            }}
          />
          <Tooltip
            // 50% transparent so the lines behind the card stay readable while hovering — the card
            // is large enough to cover the part of the chart you are reading.
            contentStyle={{
              background: "rgba(36, 38, 46, 0.5)",
              backdropFilter: "blur(2px)",
              border: `1px solid ${GRID}`,
              color: "#e8eaed",
            }}
            formatter={(value, name) => [formatValue(Number(value)), String(name)]}
            // Deliberately NO `labelFormatter`: the per-point time is removed from the hover card
            // (FR-106). The chart states its 0.5s increment once, in the axis label.
            labelFormatter={() => ""}
          />
          {/*
            Top-aligned. At the bottom it shared a strip with the x-axis label and the two
            overlapped; moving the legend is the right half of that fix because the label belongs to
            the axis and cannot move far from it.
          */}
          <Legend verticalAlign="top" height={24} wrapperStyle={{ color: AXIS, lineHeight: "24px" }} />
          {/*
            Before the lines, so a series always draws ON TOP of a threshold it crosses. The
            crossing point is the thing being read, and a 2px reference stroke over a 1px series
            stroke hides exactly the pixels that carry it.

            `ifOverflow="extendDomain"` rather than the default `discard`: a threshold the team
            does not reach is not a mistake to hide, it is the answer — "this board does not get
            there" has to be visible as distance, which means the axis has to grow to show it.
          */}
          {referenceLines.map((r) => (
            <ReferenceLine
              key={r.label}
              y={r.y}
              stroke={r.color}
              strokeDasharray="6 4"
              ifOverflow="extendDomain"
              /*
                `insideBottomLeft`, which for a horizontal reference line means ABOVE it.

                A reference line's label box is the line itself — zero height — so `insideTopLeft`
                anchors the text's top at the stroke and the dashes run straight through the
                digits the label exists to state. `insideBottomLeft` anchors its BOTTOM there
                instead, lifting the whole string clear. `offset` is the gap.
              */
              label={{
                value: r.label,
                position: "insideBottomLeft",
                offset: 6,
                fill: r.color,
                fontSize: 12,
              }}
            />
          ))}
          {series.map((s) => (
            <Line
              key={s.name}
              type={s.lineType ?? "linear"}
              dataKey={s.name}
              stroke={s.color}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
