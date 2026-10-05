import { describe, expect, it } from "vitest";
import { simulate } from "../simulate";
import { corpus } from "../../data/corpus";
import type { TeamConfiguration } from "../../data/types";
import { InvalidTeamConfigurationError } from "../errors";

/**
 * quickstart.md Validation Scenario 1: a single creature with known baseDamage and
 * baseCooldownSeconds placed alone should report DPS = damage / effectiveCooldown.
 */
describe("simulate", () => {
  it("single Bumblebolt: DPS equals 3 / 2.5 = 1.2", () => {
    const config: TeamConfiguration = {
      placements: [{ slot: { row: "front", col: 0 }, creatureId: "bumblebolt", level: 1 }],
      trainerId: null,
      trinketIds: [],
      itemIds: [],
      simulationWindowSeconds: 20,
    };

    const result = simulate(config, corpus);
    const dpsValues = Object.values(result.perCreatureDps);
    expect(dpsValues).toHaveLength(1);
    expect(dpsValues[0]).toBeCloseTo(1.2, 5);
  });

  it("rejects a configuration with more than 6 placements", () => {
    const tooMany: TeamConfiguration = {
      placements: [
        { slot: { row: "front", col: 0 }, creatureId: "bumblebolt", level: 1 },
        { slot: { row: "front", col: 1 }, creatureId: "bumblebolt", level: 1 },
        { slot: { row: "front", col: 2 }, creatureId: "bumblebolt", level: 1 },
        { slot: { row: "back", col: 0 }, creatureId: "bumblebolt", level: 1 },
        { slot: { row: "back", col: 1 }, creatureId: "bumblebolt", level: 1 },
        { slot: { row: "back", col: 2 }, creatureId: "bumblebolt", level: 1 },
        { slot: { row: "back", col: 2 }, creatureId: "scorchimp", level: 1 }, // duplicate slot, also 7th entry
      ],
      trainerId: null,
      trinketIds: [],
      itemIds: [],
      simulationWindowSeconds: 20,
    };
    expect(() => simulate(tooMany, corpus)).toThrow(InvalidTeamConfigurationError);
  });

  it("rejects a configuration referencing an unknown creature id", () => {
    const bad: TeamConfiguration = {
      placements: [{ slot: { row: "front", col: 0 }, creatureId: "not-a-real-creature", level: 1 }],
      trainerId: null,
      trinketIds: [],
      itemIds: [],
      simulationWindowSeconds: 20,
    };
    expect(() => simulate(bad, corpus)).toThrow(InvalidTeamConfigurationError);
  });

  it("timeline is sorted ascending by tSeconds", () => {
    const config: TeamConfiguration = {
      placements: [
        { slot: { row: "front", col: 0 }, creatureId: "bumblebolt", level: 1 },
        { slot: { row: "front", col: 1 }, creatureId: "scorchimp", level: 1 },
      ],
      trainerId: null,
      trinketIds: [],
      itemIds: [],
      simulationWindowSeconds: 10,
    };
    const result = simulate(config, corpus);
    const times = result.timeline.map((e) => e.tSeconds);
    const sorted = [...times].sort((a, b) => a - b);
    expect(times).toEqual(sorted);
  });

  /**
   * User Story 2 (FR-010): cumulativeSeries must be monotonically non-decreasing (damage never
   * "un-happens") and must exactly match the running sum of timeline events up to each sampled
   * tSeconds — the chart has no separate recomputation path from the timeline.
   */
  it("cumulativeSeries is monotonically non-decreasing and matches the timeline running sum", () => {
    const config: TeamConfiguration = {
      placements: [
        { slot: { row: "front", col: 0 }, creatureId: "bumblebolt", level: 1 },
        { slot: { row: "front", col: 1 }, creatureId: "scorchimp", level: 1 },
        { slot: { row: "front", col: 2 }, creatureId: "venopuff", level: 1 },
      ],
      trainerId: null,
      trinketIds: [],
      itemIds: [],
      simulationWindowSeconds: 15,
    };
    const result = simulate(config, corpus);

    let prevTotal = -Infinity;
    for (const point of result.cumulativeSeries) {
      expect(point.totalDamage).toBeGreaterThanOrEqual(prevTotal);
      prevTotal = point.totalDamage;

      const expectedTotal = result.timeline
        .filter((e) => e.tSeconds <= point.tSeconds && e.damage !== undefined)
        .reduce((sum, e) => sum + (e.damage ?? 0), 0);
      expect(point.totalDamage).toBeCloseTo(expectedTotal, 5);
    }
  });

  /**
   * User-requested amendment (data-model.md "Manual carry-over StatModifiers", 2026-10-05):
   * a teamModifier of stat "damageFlatAdd" raises every placement's effective damage by that
   * flat amount, on top of its own baseDamage, before computing DPS.
   */
  it("teamModifiers damageFlatAdd raises DPS by the flat amount for every placement", () => {
    const config: TeamConfiguration = {
      placements: [{ slot: { row: "front", col: 0 }, creatureId: "bumblebolt", level: 1 }],
      trainerId: null,
      trinketIds: [],
      itemIds: [],
      simulationWindowSeconds: 20,
      teamModifiers: [{ id: "m1", label: "Round 2 win bonus", stat: "damageFlatAdd", amount: 10 }],
    };
    const result = simulate(config, corpus);
    const dps = Object.values(result.perCreatureDps)[0];
    expect(dps).toBeCloseTo((3 + 10) / 2.5, 5);
  });

  it("placement-level modifiers stack additively on top of teamModifiers", () => {
    const config: TeamConfiguration = {
      placements: [
        {
          slot: { row: "front", col: 0 },
          creatureId: "bumblebolt",
          level: 1,
          modifiers: [{ id: "p1", label: "Per-banto bonus", stat: "damageFlatAdd", amount: 7 }],
        },
      ],
      trainerId: null,
      trinketIds: [],
      itemIds: [],
      simulationWindowSeconds: 20,
      teamModifiers: [{ id: "m1", label: "Round 2 win bonus", stat: "damageFlatAdd", amount: 10 }],
    };
    const result = simulate(config, corpus);
    const dps = Object.values(result.perCreatureDps)[0];
    expect(dps).toBeCloseTo((3 + 10 + 7) / 2.5, 5);
  });

  it("cooldownFlatAddSeconds and cooldownSpeedAdd modifiers change effective cooldown", () => {
    const config: TeamConfiguration = {
      placements: [{ slot: { row: "front", col: 0 }, creatureId: "bumblebolt", level: 1 }],
      trainerId: null,
      trinketIds: [],
      itemIds: [],
      simulationWindowSeconds: 2.5,
      teamModifiers: [{ id: "m1", label: "Slow aura", stat: "cooldownFlatAddSeconds", amount: 2.5 }],
    };
    const result = simulate(config, corpus);
    // Effective cooldown becomes 2.5 (base) + 2.5 (flat add) = 5s, so within a 2.5s window the
    // creature never casts at all.
    expect(Object.keys(result.perCreatureDps)).toHaveLength(0);
  });

  it("a damage modifier on a creature with no base direct-damage cast is a documented no-op", () => {
    const config: TeamConfiguration = {
      placements: [{ slot: { row: "front", col: 0 }, creatureId: "venopuff", level: 1 }],
      trainerId: null,
      trinketIds: [],
      itemIds: [],
      simulationWindowSeconds: 10,
      teamModifiers: [{ id: "m1", label: "Should not create an attack", stat: "damageFlatAdd", amount: 99 }],
    };
    const result = simulate(config, corpus);
    expect(Object.keys(result.perCreatureDps)).toHaveLength(0);
  });

  it("status-amount modifiers increase the applied layer count for a creature that already applies that status", () => {
    const withoutModifier: TeamConfiguration = {
      placements: [{ slot: { row: "front", col: 0 }, creatureId: "venopuff", level: 1 }],
      trainerId: null,
      trinketIds: [],
      itemIds: [],
      simulationWindowSeconds: 5,
      teamModifiers: [],
    };
    const withModifier: TeamConfiguration = {
      ...withoutModifier,
      teamModifiers: [{ id: "m1", label: "+2 Poison", stat: "poisonAmountAdd", amount: 2 }],
    };
    const base = simulate(withoutModifier, corpus).perStatusPerSecond.Poison;
    const boosted = simulate(withModifier, corpus).perStatusPerSecond.Poison;
    // Venopuff applies 4 Poison per cast; +2 should raise the single-cast tick damage from 4 to 6.
    expect(boosted).toBeCloseTo(base * (6 / 4), 5);
  });

  /**
   * Shield counters (user-requested): Shield grants are now tracked as an output stat, same
   * treatment as Burn/Poison/Shock, per data-model.md's "Shield counted as an output stat"
   * amendment.
   */
  it("Shield grants are tracked in perStatusPerSecond and cumulativeSeries", () => {
    const config: TeamConfiguration = {
      placements: [{ slot: { row: "front", col: 0 }, creatureId: "pebbler", level: 1 }],
      trainerId: null,
      trinketIds: [],
      itemIds: [],
      simulationWindowSeconds: 8,
      teamModifiers: [],
    };
    const result = simulate(config, corpus);
    expect(result.perStatusPerSecond.Shield).toBeGreaterThan(0);
    const lastPoint = result.cumulativeSeries[result.cumulativeSeries.length - 1]!;
    expect(lastPoint.byStatus.Shield).toBeGreaterThan(0);
  });
});
