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
 *
 * Kept out of `SeriesChart.tsx` (2026-10-08): a lowercase-named function export takes that module
 * off React Fast Refresh's path, so editing the chart invalidated all three of its wrappers
 * instead of hot-swapping them. See `src/context/teamConfig.ts` for the full reasoning.
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
