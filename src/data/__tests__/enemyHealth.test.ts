import { describe, expect, it } from "vitest";
import {
  ENEMY_HP_BY_DAY,
  MAX_PROJECTED_DAY,
  MAX_RECORDED_DAY,
  enemyHpEntryForDay,
  enemyHpForDay,
  timeToKill,
} from "../enemyHealth";
import { simulate } from "../../engine/simulate";
import { corpus } from "../corpus";
import type { TeamConfiguration } from "../types";
import { GridRow } from "../enums";
import { Species } from "../ids";

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

  it("returns null before day 1 and past the projection limit", () => {
    expect(enemyHpForDay(0)).toBeNull();
    expect(enemyHpForDay(MAX_PROJECTED_DAY + 1)).toBeNull();
    expect(enemyHpForDay(19.5)).toBeNull();
  });
});

describe("projected days", () => {
  it("marks observed days as observed and projected days as projected", () => {
    expect(enemyHpEntryForDay(19)).toEqual({ hp: 207_700, source: "observed" });
    expect(enemyHpEntryForDay(20)?.source).toBe("projected");
  });

  it("reproduces the recorded curve from day 9 on, which is what licenses the projection", () => {
    // The exponent is fitted, so this is the fit's own accuracy claim held to. If someone retunes
    // it against new observations and this still passes, the projection is still earned.
    for (let day = 9; day <= MAX_RECORDED_DAY; day++) {
      const fitted = 207_700 * (day / MAX_RECORDED_DAY) ** 3.833;
      expect(Math.abs(fitted / ENEMY_HP_BY_DAY[day]! - 1), `day ${day}`).toBeLessThan(0.029);
    }
  });

  it("continues the curve without a step or a kink at the day 19 boundary", () => {
    // Anchoring at the last observation is the point: a free-floating fit undershoots day 19 by
    // 2.4%, so day 20 would have grown by only 1.19x where the observed trend says ~1.22x.
    const ratios: number[] = [];
    let prev = ENEMY_HP_BY_DAY[MAX_RECORDED_DAY]!;
    for (let day = MAX_RECORDED_DAY + 1; day <= MAX_PROJECTED_DAY; day++) {
      const hp = enemyHpForDay(day)!;
      ratios.push(hp / prev);
      prev = hp;
    }
    // Still growing, still decelerating, and starting below the last observed ratio of 1.236.
    expect(ratios[0]!).toBeGreaterThan(1.2);
    expect(ratios[0]!).toBeLessThan(ENEMY_HP_BY_DAY[19]! / ENEMY_HP_BY_DAY[18]!);
    for (let i = 1; i < ratios.length; i++) {
      expect(ratios[i]!).toBeGreaterThan(1);
      expect(ratios[i]!).toBeLessThan(ratios[i - 1]!);
    }
  });
});

describe("timeToKill", () => {
  const team = (windowSeconds: number): TeamConfiguration => ({
    placements: [
      { slot: { row: GridRow.Top, col: 0 }, creatureId: Species.Venopuff, level: 1 },
      { slot: { row: GridRow.Top, col: 1 }, creatureId: Species.Magmite, level: 1 },
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
