import { describe, expect, it } from "vitest";
import { ENEMY_HP_BY_DAY, MAX_RECORDED_DAY, enemyHpForDay, timeToKill } from "../enemyHealth";
import { simulate } from "../../engine/simulate";
import { corpus } from "../corpus";
import type { TeamConfiguration } from "../types";

describe("enemy HP by day", () => {
  it("covers days 1 through 19 and grows monotonically", () => {
    for (let day = 1; day <= MAX_RECORDED_DAY; day++) {
      expect(enemyHpForDay(day), `day ${day}`).not.toBeNull();
    }
    for (let day = 2; day <= MAX_RECORDED_DAY; day++) {
      expect(ENEMY_HP_BY_DAY[day]!).toBeGreaterThan(ENEMY_HP_BY_DAY[day - 1]!);
    }
  });

  it("day 19 is the trinket-adjusted value, and the arithmetic is exact", () => {
    // Observed 259,625 while carrying a +25% max-health trinket. Recorded as the base so it is
    // comparable with the other days, which were not boosted.
    expect(ENEMY_HP_BY_DAY[19]! * 1.25).toBe(259_625);
  });

  it("returns null beyond the recording rather than extrapolating", () => {
    // The growth ratio is still falling at the last sample (1.67 -> 1.25 and dropping), so the
    // curve has not settled. Projecting it would produce a confident number with nothing behind it.
    expect(enemyHpForDay(MAX_RECORDED_DAY + 1)).toBeNull();
    expect(enemyHpForDay(0)).toBeNull();
  });
});

describe("timeToKill", () => {
  const team = (windowSeconds: number): TeamConfiguration => ({
    placements: [
      { slot: { row: "back", col: 0 }, creatureId: "venopuff", level: 1 },
      { slot: { row: "back", col: 1 }, creatureId: "magmite", level: 1 },
    ],
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: windowSeconds,
    teamModifiers: [],
  });

  it("finds the first sample where cumulative damage clears the day's HP", () => {
    // The recorded run killed a 300 HP day-1 enemy at t=23 with 8 points of overkill; this pair is
    // that run minus the healer, so it should land in the same neighbourhood.
    const r = simulate(team(30), corpus);
    const ttk = timeToKill(r.cumulativeSeries, 1);
    expect(ttk).not.toBeNull();
    expect(ttk!).toBeGreaterThan(20);
    expect(ttk!).toBeLessThanOrEqual(30);
  });

  it("returns null when the window ends first — 'not within this window', not 'never'", () => {
    const r = simulate(team(30), corpus);
    expect(timeToKill(r.cumulativeSeries, 10)).toBeNull();
  });

  it("returns null for a day with no recorded HP", () => {
    const r = simulate(team(30), corpus);
    expect(timeToKill(r.cumulativeSeries, 99)).toBeNull();
  });
});
