export interface DecadeAxis {
  domain: [number, number];
  /** Every power of ten from `domain[0]` to `domain[1]`, inclusive. */
  ticks: number[];
}

/**
 * Whole decades spanning every positive value, or `null` when there are none to span.
 *
 * The domain is snapped OUT to powers of ten rather than fitted to the data, so the gridlines
 * come out as 1 / 10 / 100 / 1K — numbers a reader can count in their head. A log axis fitted
 * tightly to the actual bounds gets ticks like 437 and 2,160, which is worse than linear for the
 * one job a log axis is here to do: letting someone eyeball how many times over a gap is.
 *
 * Non-positive values are skipped rather than rejected. A cumulative damage series is zero until
 * the first cast and `null` is not a sensible return for "this chart starts at zero, like all of
 * them" — the caller drops those samples instead, which is a gap in the line and the truth.
 *
 * Kept out of `SeriesChart.tsx` for the reason `yAxisWidth` is: a lowercase-named function export
 * in that module takes it off React Fast Refresh's path.
 */
export function decadeAxis(values: number[]): DecadeAxis | null {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (!(v > 0) || !Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === Infinity) return null;

  const loExp = Math.floor(Math.log10(min));
  // `max` exactly on a decade keeps that decade as the top rather than gaining an empty one
  // above it: a series peaking at precisely 1000 should not be plotted against a 10K ceiling.
  const hiExp = Math.max(Math.ceil(Math.log10(max)), loExp + 1);

  const ticks: number[] = [];
  // Exponentiating a fresh integer each step, never multiplying an accumulator by 10: that
  // accumulates float error (1e-7 scaled up seven times is not 1), and a tick that misses its
  // power of ten by an ulp is one Recharts will not place on the axis.
  for (let e = loExp; e <= hiExp; e++) ticks.push(10 ** e);
  return { domain: [10 ** loExp, 10 ** hiExp], ticks };
}
