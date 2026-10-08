import { describe, expect, it } from "vitest";
import { yAxisWidthFor } from "../CumulativeChart/yAxisWidth";
import { formatRate } from "../../data/format";

/**
 * The y-axis gutter is measured, not fixed. A fixed 64px let the rotated label overlap the ticks
 * once values reached five characters — "12.00" rendered as "2.00" on the DPS chart.
 */
describe("yAxisWidthFor", () => {
  const toFixed0 = (v: number) => v.toFixed(0);

  it("grows as the numbers get wider", () => {
    const small = yAxisWidthFor([{ values: [0, 9] }], toFixed0);
    const medium = yAxisWidthFor([{ values: [0, 140] }], toFixed0);
    const large = yAxisWidthFor([{ values: [0, 99999] }], toFixed0);
    expect(small).toBeLessThan(medium);
    expect(medium).toBeLessThan(large);
  });

  it("accounts for the formatter, not just the raw magnitude", () => {
    // The rate chart formats to 2dp, so 24 occupies "24.00" — five characters, not two. Sizing from
    // the number instead of its rendered text is what made the DPS chart overlap.
    const raw = yAxisWidthFor([{ values: [24] }], toFixed0);
    const formatted = yAxisWidthFor([{ values: [24] }], formatRate);
    expect(formatRate(24)).toBe("24.00");
    expect(formatted).toBeGreaterThan(raw);
  });

  it("always leaves a clear strip for the rotated label", () => {
    // Whatever the ticks need, the label gets its own room — that separation is the entire point.
    const width = yAxisWidthFor([{ values: [0] }], toFixed0);
    expect(width).toBeGreaterThanOrEqual(22 + 7);
  });

  it("considers an explicit yMax that exceeds the plotted values", () => {
    // A chart can be given a domain larger than its data; the ticks drawn then come from yMax.
    const withoutMax = yAxisWidthFor([{ values: [1] }], toFixed0);
    const withMax = yAxisWidthFor([{ values: [1] }], toFixed0, 100000);
    expect(withMax).toBeGreaterThan(withoutMax);
  });

  it("handles an empty series without collapsing to zero", () => {
    expect(yAxisWidthFor([], toFixed0)).toBeGreaterThan(0);
    expect(Number.isFinite(yAxisWidthFor([{ values: [] }], toFixed0))).toBe(true);
  });
});
