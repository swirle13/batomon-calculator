import { describe, expect, it } from "vitest";
import { formatBadgeValue } from "../format";

/**
 * A stat chip is a FIXED three characters wide (`--stat-chip-width`), and the number inside it is
 * the only part that can be made to fit. These cases are the width boundary, stated as a test
 * because the chip's geometry and this function are a pair: loosen either one and a row of chips
 * either goes ragged or spills over its own edge.
 */
describe("formatBadgeValue", () => {
  it("shows anything under 10,000 exactly", () => {
    expect(formatBadgeValue(1)).toBe("1");
    expect(formatBadgeValue(25)).toBe("25");
    expect(formatBadgeValue(336)).toBe("336");
    // Four digits are the deliberate upper bound: they fill the chip edge to edge rather than
    // widening it, which is why they are shown in full rather than abbreviated early.
    expect(formatBadgeValue(9999)).toBe("9999");
  });

  it("switches to thousands at 10,000, which is where a fifth character would be needed", () => {
    expect(formatBadgeValue(10_000)).toBe("10K");
    expect(formatBadgeValue(123_000)).toBe("123K");
  });

  it("keeps every reachable value inside four characters", () => {
    // The point of the rule, rather than an incidental case: a chip holds any figure a stack of
    // modifiers can produce without the row it sits in changing shape.
    expect(formatBadgeValue(12_345)).toBe("12K");
    expect(formatBadgeValue(999_499)).toBe("999K");
    expect(formatBadgeValue(9_999_000)).toBe("9999K");
  });

  it("abbreviates negative amounts on the same threshold", () => {
    // A modifier may be negative, so the threshold is on the magnitude. `-99` would otherwise have
    // been compared as smaller than every positive bound and never abbreviated at all.
    expect(formatBadgeValue(-25)).toBe("-25");
    expect(formatBadgeValue(-10_000)).toBe("-10K");
  });
});
