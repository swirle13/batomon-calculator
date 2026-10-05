import { describe, expect, it } from "vitest";
import { applyShieldReduction, STATUS_VS_SHIELD_REDUCTION } from "../shield";

/**
 * Source (research.md B3): status damage (Burn/Poison ticks, Shock's triggered hit) hitting a
 * Shield is reduced by the current patch's constant (25% as of Hotfix 0.6.1) before absorption;
 * "Direct" damage is not reduced.
 */
describe("applyShieldReduction", () => {
  it("reduces non-Direct damage by STATUS_VS_SHIELD_REDUCTION before absorption", () => {
    const result = applyShieldReduction(20, "Burn", 100);
    const expectedAfterReduction = 20 * (1 - STATUS_VS_SHIELD_REDUCTION);
    expect(result.damageToShield).toBeCloseTo(expectedAfterReduction, 5);
    expect(result.shieldRemaining).toBeCloseTo(100 - expectedAfterReduction, 5);
    expect(result.damageToHp).toBe(0);
  });

  it("does not reduce Direct damage", () => {
    const result = applyShieldReduction(20, "Direct", 100);
    expect(result.damageToShield).toBe(20);
    expect(result.shieldRemaining).toBe(80);
  });

  it("overflow beyond remaining shield spills to HP", () => {
    const result = applyShieldReduction(20, "Direct", 5);
    expect(result.damageToShield).toBe(5);
    expect(result.shieldRemaining).toBe(0);
    expect(result.damageToHp).toBe(15);
  });
});
