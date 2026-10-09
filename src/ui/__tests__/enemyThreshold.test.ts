import { describe, expect, it } from "vitest";
import { MAX_THRESHOLD_OVERSHOOT, enemyThresholdFor } from "../CumulativeChart/enemyThreshold";
import { ENEMY_HP_BY_DAY, MAX_PROJECTED_DAY } from "../../data/enemyHealth";

/** A cumulative curve ending at `peak`, on the engine's 0.5s grid. */
function curveTo(peak: number, samples = 60) {
  return Array.from({ length: samples + 1 }, (_, i) => ({
    tSeconds: i * 0.5,
    totalDamage: (peak * i) / samples,
  }));
}

describe("enemy HP threshold on the cumulative chart", () => {
  it("reports where the curve crosses the day's HP", () => {
    // Day 1 is 300 HP; a curve reaching 600 over 30s passes it at the halfway point.
    const t = enemyThresholdFor(curveTo(600), 1)!;
    expect(t.hp).toBe(ENEMY_HP_BY_DAY[1]);
    expect(t.killSeconds).toBe(15);
    expect(t.drawable).toBe(true);
  });

  it("draws a threshold the team misses, as long as it is a NEAR miss", () => {
    // The near miss is the case the line earns its space on: "no" plus a visible distance is a
    // different answer from "no". At exactly the limit the curve still owns half the plot.
    const hp = ENEMY_HP_BY_DAY[1]!;
    const t = enemyThresholdFor(curveTo(hp / MAX_THRESHOLD_OVERSHOOT), 1)!;
    expect(t.killSeconds).toBeNull();
    expect(t.drawable).toBe(true);

    // A hair under it is not.
    const justOver = enemyThresholdFor(curveTo(hp / MAX_THRESHOLD_OVERSHOOT - 1), 1)!;
    expect(justOver.drawable).toBe(false);
  });

  it("drops a threshold that would flatten the series", () => {
    // 300 HP against a board doing 10 total. Drawing it costs the whole plot to say "no".
    const t = enemyThresholdFor(curveTo(10), 1)!;
    expect(t.killSeconds).toBeNull();
    expect(t.drawable).toBe(false);
    // The caption needs both numbers to explain itself, so they survive the suppression.
    expect(t.peakDamage).toBe(10);
    expect(t.hp).toBe(300);
  });

  it("always draws a threshold the team actually reaches, however small the HP", () => {
    // A crossing cannot be off-scale, so the overshoot guard must not reach this case: day 1's
    // 300 HP on a 100k board is 0.003x the peak and still the single most useful mark on the plot.
    const t = enemyThresholdFor(curveTo(100_000), 1)!;
    expect(t.killSeconds).not.toBeNull();
    expect(t.drawable).toBe(true);
  });

  it("carries provenance through so a projected day can be labelled as one", () => {
    expect(enemyThresholdFor(curveTo(1_000_000), 19)!.source).toBe("observed");
    expect(enemyThresholdFor(curveTo(1_000_000), 20)!.source).toBe("projected");
  });

  it("returns null for a day with no figure at all, rather than a zero threshold", () => {
    expect(enemyThresholdFor(curveTo(600), MAX_PROJECTED_DAY + 1)).toBeNull();
  });

  it("survives an empty series", () => {
    // `simulate()` with a window of 0 produces no samples; a chart with nothing on it must not
    // claim a kill at t=0 against a peak of zero.
    const t = enemyThresholdFor([], 1)!;
    expect(t.peakDamage).toBe(0);
    expect(t.killSeconds).toBeNull();
    expect(t.drawable).toBe(false);
  });
});
