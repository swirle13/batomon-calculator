/**
 * Cooldown Speed (attack-timing) formula.
 *
 * Source (research.md B1): "How Cooldown Speed works in Batomon Showdown"
 * https://batomonshowdown.wiki/mechanics/cooldown-speed/ — cross-checked against
 * Build 25037381 · Balance 14.
 *
 *   effective cooldown = base / (1 + cooldownSpeedTotal) + flatAddedSeconds
 *   then clamp to a minimum of 0.1 seconds.
 *
 * `cooldownSpeedTotal` is a decimal (20% = 0.20, 100% = 1.00) and a POSITIVE value makes the
 * creature faster, because it divides. The flat addition is applied AFTER the speed division, never
 * before — this is explicitly called out in the source as the most common mistake when reproducing
 * this formula.
 *
 * `flatAddedSeconds` is signed, and NEGATIVE is the ordinary case from the UI (2026-10-07): a user
 * entering a cooldown change means "cast sooner" essentially every time, so the Modifiers control
 * stores what they type as a reduction. It was named `positiveFlatAddedSeconds` while only the
 * published +N-second effects used it. The 0.1s floor below is what keeps a large reduction from
 * producing a zero or negative cast interval.
 */
const MIN_COOLDOWN_SECONDS = 0.1;

export function effectiveCooldown(
  baseCooldownSeconds: number,
  cooldownSpeedTotal: number,
  flatAddedSeconds: number,
): number {
  const sped = baseCooldownSeconds / (1 + cooldownSpeedTotal);
  const withFlat = sped + flatAddedSeconds;
  return Math.max(withFlat, MIN_COOLDOWN_SECONDS);
}
