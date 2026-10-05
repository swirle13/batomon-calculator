/**
 * Cooldown Speed (attack-timing) formula.
 *
 * Source (research.md B1): "How Cooldown Speed works in Batomon Showdown"
 * https://batomonshowdown.wiki/mechanics/cooldown-speed/ — cross-checked against
 * Build 25037381 · Balance 14.
 *
 *   effective cooldown = base / (1 + cooldownSpeedTotal) + positiveFlatAddedSeconds
 *   then clamp to a minimum of 0.1 seconds.
 *
 * `cooldownSpeedTotal` is a decimal (20% = 0.20, 100% = 1.00). The flat addition is applied
 * AFTER the speed division, never before — this is explicitly called out in the source as the
 * most common mistake when reproducing this formula.
 */
const MIN_COOLDOWN_SECONDS = 0.1;

export function effectiveCooldown(
  baseCooldownSeconds: number,
  cooldownSpeedTotal: number,
  positiveFlatAddedSeconds: number,
): number {
  const sped = baseCooldownSeconds / (1 + cooldownSpeedTotal);
  const withFlat = sped + positiveFlatAddedSeconds;
  return Math.max(withFlat, MIN_COOLDOWN_SECONDS);
}
