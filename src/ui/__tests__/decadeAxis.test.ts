import { describe, expect, it } from "vitest";
import { decadeAxis } from "../CumulativeChart/decadeAxis";

describe("decade axis for the log damage scale", () => {
  it("snaps out to whole powers of ten so the gridlines are countable", () => {
    expect(decadeAxis([4, 524])).toEqual({ domain: [1, 1000], ticks: [1, 10, 100, 1000] });
  });

  it("spans the case it was built for: a 500-damage curve against day 19's 207,700", () => {
    // The user's report — a board that cannot approach late-game HP at any window length. Six
    // decades is the whole point: on a linear axis one of these two is always flat on an edge.
    const a = decadeAxis([4, 524, 207_700])!;
    expect(a.domain).toEqual([1, 1_000_000]);
    expect(a.ticks).toEqual([1, 10, 100, 1000, 10_000, 100_000, 1_000_000]);
  });

  it("emits exact powers of ten, not float-drifted near-misses", () => {
    // Recharts will not place a tick that misses its coordinate by an ulp, so a decade walk that
    // multiplies an accumulator silently loses gridlines at the top of a wide axis.
    for (const t of decadeAxis([1e-6, 1e9])!.ticks) {
      expect(Math.log10(t)).toBe(Math.round(Math.log10(t)));
    }
  });

  it("does not add an empty decade above a value sitting exactly on one", () => {
    expect(decadeAxis([5, 1000])!.domain).toEqual([1, 1000]);
  });

  it("always spans at least one decade, so a flat series still gets an axis", () => {
    const a = decadeAxis([300, 300])!;
    expect(a.domain).toEqual([100, 1000]);
    expect(a.ticks.length).toBe(2);
  });

  it("ignores zero and negative samples rather than failing on them", () => {
    // Every cumulative series starts at zero; log has no position for it.
    expect(decadeAxis([0, 0, 0, 42])!.domain).toEqual([10, 100]);
  });

  it("returns null when nothing is plottable, so the caller can stay linear", () => {
    expect(decadeAxis([])).toBeNull();
    expect(decadeAxis([0, 0])).toBeNull();
    expect(decadeAxis([Number.NaN, Number.POSITIVE_INFINITY])).toBeNull();
  });
});
