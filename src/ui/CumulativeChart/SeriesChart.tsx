import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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

export interface SeriesChartProps {
  /** Shared x positions, in seconds. */
  xValues: number[];
  series: ChartSeries[];
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
  /** Formats values in the tooltip and on the y axis, so both charts read alike. */
  formatValue?: (value: number) => string;
  /**
   * Total height including the legend row and both axis labels — not the plot area alone. 284
   * keeps the plot itself at the ~260 it had before the legend moved to the top.
   */
  height?: number;
}

const AXIS = "#9ca3af";

/** Width of the rotated axis label's strip, in px. */
const LABEL_STRIP = 22;
/** Approximate advance width of one digit at the tick font size, in px. */
const CHAR_PX = 7;

/**
 * Width the y-axis band needs, MEASURED from the tick text rather than fixed.
 *
 * A constant gutter cannot serve both charts: the rate chart draws "0.00".."24.00" while the
 * cumulative one can reach five digits, and whatever constant fits the widest case wastes space on
 * the narrowest. At a fixed 64px the rotated label sat on top of the ticks and ate their leading
 * digits — "12.00" rendered as "2.00".
 *
 * Ticks are right-aligned inside this band and the label is anchored at its left edge, so sizing
 * the band from the longest string the chart will actually draw is what keeps them apart — and it
 * keeps doing so as the numbers grow, which is the part a constant could never do.
 */
export function yAxisWidthFor(
  series: { values: number[] }[],
  formatValue: (v: number) => string,
  yMax?: number,
): number {
  const widest = Math.max(
    1,
    ...series.flatMap((s) => s.values).map((v) => formatValue(v).length),
    yMax === undefined ? 1 : formatValue(yMax).length,
  );
  return LABEL_STRIP + widest * CHAR_PX + 10;
}
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
  const yAxisWidth = yAxisWidthFor(series, formatValue, yMax);

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
            tickFormatter={formatValue}
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
