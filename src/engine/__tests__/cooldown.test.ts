import { describe, expect, it } from "vitest";
import { effectiveCooldown } from "../cooldown";

/**
 * Worked examples cited in specs/001-batomon-dps-calculator/research.md B1, sourced from
 * "How Cooldown Speed works in Batomon Showdown"
 * (https://batomonshowdown.wiki/mechanics/cooldown-speed/), cross-checked against
 * Build 25037381 · Balance 14.
 */
describe("effectiveCooldown", () => {
  it("reduces a 4.5s cooldown by +20% speed to 3.75s", () => {
    expect(effectiveCooldown(4.5, 0.2, 0)).toBeCloseTo(3.75, 5);
  });

  it("halves a 4.5s cooldown to 2.25s at +100% speed", () => {
    expect(effectiveCooldown(4.5, 1.0, 0)).toBeCloseTo(2.25, 5);
  });

  it("applies a positive flat addition after the speed division: 4.5s/+20%/+1s -> 4.75s", () => {
    expect(effectiveCooldown(4.5, 0.2, 1)).toBeCloseTo(4.75, 5);
  });

  it("clamps the result to a 0.1s floor", () => {
    expect(effectiveCooldown(0.5, 100, 0)).toBeCloseTo(0.1, 5);
  });
});
