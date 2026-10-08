import { describe, expect, it } from "vitest";
import { RECORDED_RUNS } from "./fixtures/recordedRuns";
import { buildId, exportBuild, importBuild } from "../share";
import { simulate } from "../../engine/simulate";
import { corpus, getCreatureByIdAndLevel } from "../corpus";
import { timeToKill } from "../enemyHealth";
import { perCastOutputOf } from "../../ui/shared/BatomonCard/perCastOutput";
import { StatusEffectType } from "../enums";
import { Species } from "../ids";

/**
 * Regression anchors from recorded play. Each board came from a real run with a video reference.
 *
 * These assert that a recorded board still LOADS and SIMULATES — not that its output is correct,
 * which a team code cannot say. Where observed output exists it is asserted separately, in
 * `statusStacks.test.ts`'s 28-row battle.
 */
describe("recorded run fixtures", () => {
  for (const run of RECORDED_RUNS) {
    describe(`${run.id} — ${run.label}`, () => {
      it("decodes to a valid team", () => {
        // `simulate` validates its input, so simulating without throwing IS the validity check —
        // no need to export the internal validator just to call it here.
        const config = importBuild(run.code);
        expect(config.placements.length).toBeGreaterThan(0);
        expect(() => simulate(config, corpus)).not.toThrow();
      });

      it("re-exports to the same code — the fixture is canonical", () => {
        // If this fails, the stored code is not in canonical form and the id below would differ
        // from what the app shows for the same board.
        expect(exportBuild(importBuild(run.code))).toBe(run.code);
      });

      it("simulates without throwing and produces a finite result", () => {
        const result = simulate(importBuild(run.code), corpus);
        for (const v of Object.values(result.perCreatureDps)) expect(Number.isFinite(v)).toBe(true);
        for (const p of result.cumulativeSeries) expect(Number.isFinite(p.totalDamage)).toBe(true);
      });
    });
  }

  it("every fixture has a distinct build id", () => {
    const ids = RECORDED_RUNS.map((r) => buildId(importBuild(r.code)));
    expect(new Set(ids).size).toBe(RECORDED_RUNS.length);
  });

  it("r2d2 carries Craghorn's manual modifiers into its displayed stats", () => {
    // The board that motivated folding modifiers into the base figure. Craghorn is 20 damage /
    // 20 shield published, with +20/+20 entered by hand to stand in for its untriggerable ability;
    // the card must read 40/40, not 20/20 with a separate band showing 40.
    const config = importBuild(RECORDED_RUNS.find((r) => r.id === "r2d2")!.code);
    const craghorn = config.placements.find((p) => p.creatureId === Species.Craghorn)!;
    const record = getCreatureByIdAndLevel(Species.Craghorn, 1)!;

    expect(record.publishedCast?.damage ?? null).toBe(20);
    const shown = perCastOutputOf(record, craghorn.modifiers);
    expect(shown.damage).toBe(40);
    expect(shown.appliesStatus.find((s) => s.type === StatusEffectType.Shield)?.amount).toBe(40);
  });
});

describe("time-to-kill against the one board with observed ground truth", () => {
  it("r1d1 kills the day-1 enemy at t=23, matching the recording", () => {
    // The recorded battle ends at t=23 with 8 points of overkill against 300 HP. This is the only
    // place TTK can be checked against reality rather than against itself, so it is worth pinning:
    // it ties the enemy-HP table, the cumulative series and the tick model together in one number.
    const config = importBuild(RECORDED_RUNS.find((r) => r.id === "r1d1")!.code);
    const result = simulate(config, corpus);
    expect(timeToKill(result.cumulativeSeries, 1)).toBe(23);
  });

  it("returns null past the window rather than guessing", () => {
    // Day 3 is 800 HP, which this board does not reach inside its 24s window. The UI renders that
    // as "> 24s" — "not within this window", not "never".
    const config = importBuild(RECORDED_RUNS.find((r) => r.id === "r1d1")!.code);
    const result = simulate(config, corpus);
    expect(timeToKill(result.cumulativeSeries, 3)).toBeNull();
  });
});
