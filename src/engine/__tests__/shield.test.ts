import { describe, expect, it } from "vitest";
import { applyShieldReduction, STATUS_VS_SHIELD_REDUCTION } from "../shield";
import { DamageChannel } from "../../data/enums";

/**
 * Source (research.md F1, 2026-10-05 round 4): status damage (Burn/Poison ticks, Shock's
 * triggered hit) hitting a Shield is reduced by the current patch's constant (15% as of the
 * August 2026 balance pass, corrected from this project's previously-cited 25% — research.md
 * B3/F1) before absorption; "Direct" damage is not reduced.
 */
describe("applyShieldReduction", () => {
  it("reduces non-Direct damage by STATUS_VS_SHIELD_REDUCTION before absorption", () => {
    const result = applyShieldReduction(20, DamageChannel.Burn, 100);
    const expectedAfterReduction = 20 * (1 - STATUS_VS_SHIELD_REDUCTION);
    expect(result.damageToShield).toBeCloseTo(expectedAfterReduction, 5);
    expect(result.shieldRemaining).toBeCloseTo(100 - expectedAfterReduction, 5);
    expect(result.damageToHp).toBe(0);
  });

  /**
   * Pins the literal current-patch value (15%), not just "whatever the constant says" (the
   * test above would pass even if the constant regressed back to an old value) -- 20 damage at
   * 15% reduction = 17 damage to Shield, matching research.md F1's cited sources exactly.
   */
  it("the current reduction is exactly 15% (regression pin against the cited patch value)", () => {
    expect(STATUS_VS_SHIELD_REDUCTION).toBeCloseTo(0.15, 5);
    const result = applyShieldReduction(20, DamageChannel.Burn, 100);
    expect(result.damageToShield).toBeCloseTo(17, 5);
  });

  it("does not reduce Direct damage", () => {
    const result = applyShieldReduction(20, DamageChannel.Direct, 100);
    expect(result.damageToShield).toBe(20);
    expect(result.shieldRemaining).toBe(80);
  });

  it("overflow beyond remaining shield spills to HP", () => {
    const result = applyShieldReduction(20, DamageChannel.Direct, 5);
    expect(result.damageToShield).toBe(5);
    expect(result.shieldRemaining).toBe(0);
    expect(result.damageToHp).toBe(15);
  });
});
