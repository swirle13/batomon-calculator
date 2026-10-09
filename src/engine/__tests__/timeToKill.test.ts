import { describe, expect, it } from "vitest";
import { MAX_TTK_SECONDS, timeToKillSeconds } from "../timeToKill";
import { simulate, windowAverageDps } from "../simulate";
import { corpus } from "../../data/corpus";
import { enemyHpForDay } from "../../data/enemyHealth";
import { GridRow } from "../../data/enums";
import { Species } from "../../data/ids";
import type { TeamConfiguration } from "../../data/types";

const team = (
  placements: TeamConfiguration["placements"],
  windowSeconds = 30,
): TeamConfiguration => ({
  placements,
  trainerId: null,
  trinketIds: [],
  itemIds: [],
  simulationWindowSeconds: windowSeconds,
  teamModifiers: [],
});

const poisonPair = (windowSeconds = 30) =>
  team(
    [
      { slot: { row: GridRow.Back, col: 0 }, creatureId: Species.Venopuff, level: 1 },
      { slot: { row: GridRow.Back, col: 1 }, creatureId: Species.Magmite, level: 1 },
    ],
    windowSeconds,
  );

const ttk = (config: TeamConfiguration, day: number) =>
  timeToKillSeconds(config, corpus, day, simulate(config, corpus).cumulativeSeries);

describe("time to kill past the simulation window", () => {
  it("answers for a day the window cannot reach", () => {
    // The whole point. At a 30s window this pair's series stops at 524 damage against day 10's
    // 17,300, and the old window-bound figure could only say ">30s".
    expect(ttk(poisonPair(), 10)).toBe(174);
  });

  it("gives the same answer whatever the window is set to", () => {
    // The regression that motivated this: the figure used to move with the window, so two builds
    // compared at different windows were not comparable. The board is the same board.
    const answers = [10, 30, 120, 300].map((w) => ttk(poisonPair(w), 10));
    expect(new Set(answers).size, `windows disagreed: ${answers.join(", ")}`).toBe(1);
  });

  it("still uses the existing series when the kill is already inside the window", () => {
    // Cheap path, and it must agree with the chart — the threshold crossing a user can SEE is
    // this same number, so a search that re-derived it differently would contradict the plot.
    const config = poisonPair();
    const series = simulate(config, corpus).cumulativeSeries;
    expect(timeToKillSeconds(config, corpus, 1, series)).toBe(23);
  });

  it("is not what dividing HP by average DPS would give, for a status team", () => {
    /*
     * Poison never decays, so cumulative damage grows roughly quadratically and the window
     * average is an average of a rate that is still climbing. Dividing by it is the cheap
     * implementation this function deliberately is not, and the gap is nearly two orders of
     * magnitude — not a rounding difference someone could decide to live with.
     */
    const config = poisonPair();
    const naive = enemyHpForDay(10)! / windowAverageDps(simulate(config, corpus));
    expect(naive).toBeGreaterThan(900);
    expect(ttk(config, 10)).toBeLessThan(200);
  });

  it("returns null for a board that cannot get there within the search limit", () => {
    const trickle = team([
      { slot: { row: GridRow.Back, col: 0 }, creatureId: Species.Magmite, level: 1 },
    ]);
    expect(ttk(trickle, 19)).toBeNull();
  });

  it("returns null without searching when the board deals no damage at all", () => {
    // An empty grid is the first thing anyone sees. Running an hour of simulation to rediscover
    // zero, on every edit, would be the most expensive no-op on the page.
    const empty = team([]);
    const t0 = performance.now();
    expect(ttk(empty, 19)).toBeNull();
    expect(performance.now() - t0).toBeLessThan(50);
  });

  it("returns null for a day with no HP figure", () => {
    expect(ttk(poisonPair(), 99)).toBeNull();
  });

  it("searches the whole range, leaving no gap below the cap", () => {
    // Doubling from 60 gives 1920 then 3840; without clamping the last probe to the cap, the
    // hour between them is never searched and a kill in it reports "never".
    const config = poisonPair();
    const found = ttk(config, 25);
    expect(found).not.toBeNull();
    expect(found!).toBeGreaterThan(960);
    expect(found!).toBeLessThanOrEqual(MAX_TTK_SECONDS);
  });
});
