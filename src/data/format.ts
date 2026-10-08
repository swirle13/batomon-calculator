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
 * A number as it appears on a stat chip, which is a fixed three characters wide
 * (`--stat-chip-width`).
 *
 * Under 10,000 the figure is shown exactly: a fourth digit still fits, filling the chip edge to
 * edge, and that is the deliberate upper bound rather than an accident. From 10,000 up it is
 * written in thousands — "10K", "123K" — which keeps every reachable value inside four characters
 * (a chip would have to hold ten million before "K" ran out of room). The chip's `title` carries
 * the exact figure either way, so nothing is lost by rounding the label.
 */
export function formatBadgeValue(value: number): string {
  if (Math.abs(value) < 10_000) return String(value);
  return `${Math.round(value / 1000)}K`;
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
