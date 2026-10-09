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

/**
 * A battle duration, as the headline time-to-kill figure reads it.
 *
 * Raw seconds up to a minute, because that is how the engine's grid and every other time on this
 * page are expressed and "47s" needs no decoding. Past that, minutes: time-to-kill stopped being
 * bounded by the simulation window on 2026-10-08 and can now legitimately return 603, which is a
 * number a reader has to do arithmetic on before it means anything.
 *
 * Half-seconds survive below the minute mark (the grid is 0.5s) and are dropped above it, where
 * they are false precision on a figure built from a projected HP table.
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds - minutes * 60);
  // `60s` is reachable by rounding — 119.7 would otherwise render "1m 60s".
  if (rest === 60) return `${minutes + 1}m`;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

/**
 * A per-second rate (DPS, status output). One decimal below 100, whole numbers at or above it —
 * hundredths of a point of DPS are noise next to a three-digit figure, and dropping them keeps
 * these to four characters so the slider readout and the table columns stay narrow.
 *
 * The bound is 99.95 rather than 100 because `toFixed(1)` rounds: 99.99 would otherwise render as
 * "100.0", the five characters this avoids.
 */
export function formatRate(value: number): string {
  return Math.abs(value) < 99.95 ? value.toFixed(1) : String(Math.round(value));
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
