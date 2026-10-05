import { describe, expect, it } from "vitest";
import { applyStatusTick, applyShockProc } from "../status";
import type { StatusEffectInstance } from "../../data/types";

/**
 * Source (research.md B2): "Batomon Showdown Status Effects and Debuff Removal"
 * https://batomonshowdown.wiki/mechanics/status-effects-and-debuff-removal/ and
 * "Batomon Showdown Shock Builds Guide" https://batomonshowdowngame.wiki/guides/shock-build/
 */

const baseSlot = { row: "front" as const, col: 0 as const };
const sourceSlot = { row: "back" as const, col: 0 as const };

describe("applyStatusTick", () => {
  it("Burn: tick damage equals current layers, then loses 1 layer", () => {
    const burn: StatusEffectInstance = {
      type: "Burn",
      targetSlot: baseSlot,
      sourceSlot,
      layers: 5,
      appliedAtSeconds: 0,
    };
    const { damage, nextInstance } = applyStatusTick(burn, 0.5);
    expect(damage).toBe(5);
    expect(nextInstance?.layers).toBe(4);
  });

  it("Burn: fully decays (nextInstance null) once layers reach 0", () => {
    const burn: StatusEffectInstance = {
      type: "Burn",
      targetSlot: baseSlot,
      sourceSlot,
      layers: 1,
      appliedAtSeconds: 0,
    };
    const { damage, nextInstance } = applyStatusTick(burn, 0.5);
    expect(damage).toBe(1);
    expect(nextInstance).toBeNull();
  });

  it("Poison: tick damage equals current layers, layers unchanged after", () => {
    const poison: StatusEffectInstance = {
      type: "Poison",
      targetSlot: baseSlot,
      sourceSlot,
      layers: 4,
      appliedAtSeconds: 0,
    };
    const { damage, nextInstance } = applyStatusTick(poison, 1);
    expect(damage).toBe(4);
    expect(nextInstance?.layers).toBe(4);
  });

  it("throws when given a Shock instance (Shock is reactive, not tick-based)", () => {
    const shock: StatusEffectInstance = {
      type: "Shock",
      targetSlot: baseSlot,
      sourceSlot,
      layers: 2,
      appliedAtSeconds: 0,
    };
    expect(() => applyStatusTick(shock, 0.5)).toThrow();
  });
});

describe("applyShockProc", () => {
  it("resolves a Shock hit equal to current layers before the direct hit", () => {
    const shock: StatusEffectInstance = {
      type: "Shock",
      targetSlot: baseSlot,
      sourceSlot,
      layers: 5,
      appliedAtSeconds: 0,
    };
    const result = applyShockProc({ damage: 30, damageType: "Direct" }, shock);
    expect(result.shockDamage).toBe(5);
    expect(result.orderedHits).toEqual([
      { damage: 5, damageType: "Shock" },
      { damage: 30, damageType: "Direct" },
    ]);
  });

  it("produces no Shock hit when there is no active Shock instance", () => {
    const result = applyShockProc({ damage: 30, damageType: "Direct" }, null);
    expect(result.shockDamage).toBe(0);
    expect(result.orderedHits).toEqual([{ damage: 30, damageType: "Direct" }]);
  });
});
