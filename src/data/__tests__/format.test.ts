import { describe, expect, it } from "vitest";
import { formatCompactValue } from "../format";

/**
 * A stat chip is a FIXED three characters wide (`--stat-chip-width`), and the number inside it is
 * the only part that can be made to fit. These cases are the width boundary, stated as a test
 * because the chip's geometry and this function are a pair: loosen either one and a row of chips
 * either goes ragged or spills over its own edge.
 */
describe("formatCompactValue", () => {
  it("shows anything under 10,000 exactly", () => {
    expect(formatCompactValue(1)).toBe("1");
    expect(formatCompactValue(25)).toBe("25");
    expect(formatCompactValue(336)).toBe("336");
    // Four digits are the deliberate upper bound: they fill the chip edge to edge rather than
    // widening it, which is why they are shown in full rather than abbreviated early.
    expect(formatCompactValue(9999)).toBe("9999");
  });

  it("switches to thousands at 10,000, which is where a fifth character would be needed", () => {
    expect(formatCompactValue(10_000)).toBe("10K");
    expect(formatCompactValue(123_000)).toBe("123K");
  });

  it("keeps every reachable value inside four characters", () => {
    // The point of the rule, rather than an incidental case: a chip holds any figure a stack of
    // modifiers can produce without the row it sits in changing shape.
    expect(formatCompactValue(12_345)).toBe("12K");
    expect(formatCompactValue(999_499)).toBe("999K");
    // Millions and billions carry on past where thousands would need a fifth character. This read
    // "9999K" until the chart axes started using the same rule (2026-10-08) — four characters is
    // the bound, and "10M" keeps it where "9999K" was already over.
    expect(formatCompactValue(9_999_000)).toBe("10M");
    expect(formatCompactValue(49_000_196)).toBe("49M");
    expect(formatCompactValue(1_250_000_000)).toBe("1.3B");
  });

  it("abbreviates negative amounts on the same threshold", () => {
    // A modifier may be negative, so the threshold is on the magnitude. `-99` would otherwise have
    // been compared as smaller than every positive bound and never abbreviated at all.
    expect(formatCompactValue(-25)).toBe("-25");
    expect(formatCompactValue(-10_000)).toBe("-10K");
  });
});
