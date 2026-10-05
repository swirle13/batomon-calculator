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
});
