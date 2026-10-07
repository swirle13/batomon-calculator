/**
 * The evaluable stat (T240/T241, FR-094/FR-095) — the round-5 "load-bearing refactor".
 *
 * A resolved stat stops being a final number and becomes four slots read through one helper:
 *
 *   value = (base + flatAdd) * multiplier + postMultiplierFlatAdd
 *
 * ## Why each slot exists
 *
 * Every slot is here because a recorded battle produced a number no simpler model can reach
 * (`orchestration/engine-handoff-gameplay-capture.md`, Findings 2 and 3).
 *
 * **`multiplier` is applied at READ time, never baked in.** When Noxnimbus granted +6 Poison to a
 * board where two creatures carried a +70% effect, those two gained **+10**, not +6:
 *
 * | model | Cobrex (604 base) | Puffloon (11 base) |
 * |---|---|---|
 * | **`(base + 6) x 1.7`** | **1037** | **29** |
 * | snapshot-then-add | 1033 | 25 |
 *
 * Only the first reproduces both. The multiplier is re-evaluated on every change, and the
 * compounding is visible across the fight: Cobrex 1027 -> 1037 -> 1047.
 *
 * **`postMultiplierFlatAdd` is separate because reactive gains are never scaled.** Thorntail
 * entered that battle at 7082 displayed damage against a listed base of 50 — so it carried enormous
 * modifiers — yet every single increment from `+24 Damage permanently` was exactly **+24**. Adding
 * it to `base` would have inflated it by its whole modifier factor, roughly 140x per stack.
 *
 * ## What this deliberately does NOT do
 *
 * It does not round. Callers round at the point of display or application, because the capture
 * shows the game rounding a *read*, not a stored value: `(11 + 6) x 1.7 = 28.9` displays as 29, but
 * the next grant computes from 17, not from 28.9 or 29.
 */
export interface StatValue {
  base: number;
  /** Added BEFORE the multiplier. Battle-start grants and ally buffs land here. */
  flatAdd: number;
  /** Multiplicative scaling, default 1. Applied to `base + flatAdd` at read time. */
  multiplier: number;
  /** Added AFTER the multiplier, and never scaled. Reactive "permanently" gains land here. */
  postMultiplierFlatAdd: number;
}

export function statValue(base = 0): StatValue {
  return { base, flatAdd: 0, multiplier: 1, postMultiplierFlatAdd: 0 };
}

/** The single read helper. Every consumer goes through this so the order of operations is stated once. */
export function read(v: StatValue): number {
  return (v.base + v.flatAdd) * v.multiplier + v.postMultiplierFlatAdd;
}

/** `read` rounded for display/application, matching the game's integer badges. */
export function readRounded(v: StatValue): number {
  return Math.round(read(v));
}

/** A grant that scales — battle-start and ally buffs. */
export function addFlat(v: StatValue, amount: number): void {
  v.flatAdd += amount;
}

/** A reactive gain that does NOT scale (Finding 3). */
export function addPostMultiplier(v: StatValue, amount: number): void {
  v.postMultiplierFlatAdd += amount;
}

/**
 * Multipliers COMPOUND rather than summing: two +70% effects give x2.89, not x2.4.
 *
 * The capture cannot distinguish these — it only ever shows one multiplier at a time — so this is
 * a judgement call and is flagged as one. Compounding is chosen because it is what "+70% Cooldown
 * Speed" means when applied twice in essentially every game of this kind, and because summing
 * makes a large enough stack of debuffs reach a negative multiplier, which has no meaning.
 */
export function applyMultiplier(v: StatValue, factor: number): void {
  v.multiplier *= factor;
}
