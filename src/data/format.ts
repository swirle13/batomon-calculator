import type { StatusEffectType } from "./types";
import { StatColorKey } from "./enums";

/**
 * Shared display formatters (2026-10-06 round 7, Constitution Principle VII, FR-044).
 *
 * Exists because the base stat band rendered `toFixed(1)` and the "Effective this battle" band
 * rendered `toFixed(2)`, so the same cooldown appeared as `6.0` and `6.00` directly above itself
 * and read like a discrepancy. Any value shown on more than one surface goes through here, so two
 * surfaces cannot disagree about precision or wording.
 */

/** Cooldown in seconds, one decimal — matching the in-game card. */
export function formatCooldown(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  return seconds.toFixed(1);
}

/** A per-second rate (DPS, status output). Two decimals. */
export function formatRate(value: number): string {
  return value.toFixed(2);
}

/**
 * A number short enough to label something narrow: a stat chip, or a chart's y axis.
 *
 * Under 10,000 the figure is shown exactly, by `formatBelow` — the caller's own formatter, because
 * what "exactly" means differs (a chip holds an integer, a rate axis holds two decimals). From
 * 10,000 up it is written in thousands, millions or billions, at most one decimal, which holds any
 * value this engine can produce inside four characters: "10K", "123K", "1.2M", "49M".
 *
 * Four characters is not incidental. It is the stat chip's width (`--stat-chip-width`), and it is
 * what keeps a chart's y-axis gutter from growing without limit — an unbounded poison build drew
 * ticks like "18000000.00", and `yAxisWidthFor` sizes that gutter from the widest tick it will
 * draw. The exact figure stays reachable: a chip keeps it in its `title`, a chart in its tooltip.
 */
export function formatCompactValue(value: number, formatBelow: (v: number) => string = String): string {
  const abs = Math.abs(value);
  for (const [limit, suffix] of [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ] as const) {
    // 10,000 rather than 1,000 is the floor for abbreviating at all: "9999" is no wider than "10K"
    // and says more, so thousands only start paying for themselves in five digits.
    if (abs < Math.max(limit, 10_000)) continue;
    const scaled = value / limit;
    // One decimal below 10 ("1.2M"), none above it ("49M") — four characters at most either way.
    // The bound is 9.95 rather than 10 because `toFixed(1)` rounds: 9.999 would otherwise render
    // as "10.0M", which is the five characters this exists to avoid.
    return `${Math.abs(scaled) < 9.95 ? scaled.toFixed(1) : Math.round(scaled)}${suffix}`;
  }
  return formatBelow(value);
}

/** A signed modifier amount, e.g. `+20` / `-5`. */
export function formatSignedAmount(amount: number): string {
  return amount > 0 ? `+${amount}` : String(amount);
}

/**
 * The single `StatusEffectType` -> stat colour key mapping (FR-058 / tasks.md T172).
 * Previously declared twice as a `STATUS_COLOR_KEY` literal (`GridPicker`, `BatomonCard`) plus a
 * third `toLowerCase()`-based variant in `statColors.ts`.
 */
export const STATUS_COLOR_KEY: Record<StatusEffectType, StatColorKey> = {
  Burn: StatColorKey.Burn,
  Poison: StatColorKey.Poison,
  Shock: StatColorKey.Shock,
  Shield: StatColorKey.Shield,
};
