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
