import { describe, expect, it } from "vitest";
import { simulate } from "../simulate";
import { corpus } from "../../data/corpus";
import type { TeamConfiguration } from "../../data/types";

const solo = (creatureId: string, windowSeconds = 10): TeamConfiguration => ({
  placements: [{ slot: { row: "back", col: 0 }, creatureId, level: 1 }],
  trainerId: null,
  trinketIds: [],
  itemIds: [],
  simulationWindowSeconds: windowSeconds,
  teamModifiers: [],
});

describe("statusStackSeries — live stacks on the enemy", () => {
  it("Burn rises on application and sheds exactly one layer per 0.5s tick", () => {
    // Magmite: 4.5s cooldown, applies Burn 4. The stacks must climb to 4 and drain to 0 over four
    // ticks — the behaviour no damage chart can show, because cumulative damage is monotonic.
    const burn = simulate(solo("magmite"), corpus)
      .statusStackSeries.filter((p) => p.tSeconds >= 4 && p.tSeconds <= 7)
      .map((p) => `${p.tSeconds}:${p.Burn}`);
    expect(burn).toEqual(["4:0", "4.5:4", "5:3", "5.5:2", "6:1", "6.5:0", "7:0"]);
  });

  it("Poison only accumulates — it never sheds from ticking", () => {
    const series = simulate(solo("venopuff", 12), corpus).statusStackSeries;
    const poison = series.map((p) => p.Poison);
    for (let i = 1; i < poison.length; i++) {
      expect(poison[i]!, `Poison fell at t=${series[i]!.tSeconds}`).toBeGreaterThanOrEqual(poison[i - 1]!);
    }
    expect(poison[poison.length - 1]!).toBeGreaterThan(0);
  });

  it("is sampled on the same 0.5s grid as the other two charts", () => {
    // All three charts must agree about what a point means; different grids were the original
    // inconsistency (FR-106).
    const r = simulate(solo("magmite"), corpus);
    expect(r.statusStackSeries.map((p) => p.tSeconds)).toEqual(
      r.cumulativeSeries.map((p) => p.tSeconds),
    );
  });

  it("tracks stacks, NOT damage — the two diverge for Burn", () => {
    // At t=6 Magmite has 1 live stack left but has already dealt several points of burn damage.
    // If this series were accidentally wired to damage, it would be monotonic like the other chart.
    const r = simulate(solo("magmite"), corpus);
    const at6 = r.statusStackSeries.find((p) => p.tSeconds === 6)!;
    const dmg6 = r.cumulativeSeries.find((p) => p.tSeconds === 6)!;
    expect(at6.Burn).toBe(1);
    expect(dmg6.byStatus.Burn).toBeGreaterThan(at6.Burn);
  });
});

describe("cumulativeSeries exposes direct damage separately", () => {
  it("direct damage is its own series, not only folded into the total", () => {
    const r = simulate(solo("bumblebolt", 10), corpus);
    const last = r.cumulativeSeries[r.cumulativeSeries.length - 1]!;
    expect(last.directDamage).toBeGreaterThan(0);
    // Total is direct plus every status damage source.
    const statusDamage = last.byStatus.Burn + last.byStatus.Poison + last.byStatus.Shock;
    expect(last.directDamage + statusDamage).toBeCloseTo(last.totalDamage, 5);
  });
});

describe("Burn tick damage — the full sequence, confirmed against gameplay 2026-10-06", () => {
  it("deals the CURRENT stack count each tick: 4, 3, 2, 1", () => {
    // This was queried and nearly changed. The alternative model — one tick deals 1 damage and
    // consumes 1 stack, so N burn deals N total — was proposed from a control test, then withdrawn
    // after watching the damage numbers: "the tick does the damage of the present value of the burn
    // stack (4), it ticks down by one the next 0.5s and then does 3 damage, then 2, then 1."
    //
    // The distinction is not cosmetic. Total damage from N burn is N(N+1)/2 here against N under
    // the alternative — for a 170-stack burn that is 14,535 versus 170, an 85x difference. Pinned
    // end-to-end rather than per-tick so the sequence AND its timing are both locked.
    const ticks = simulate(solo("magmite"), corpus)
      .timeline.filter((e) => e.kind === "statusTick" && e.damageType === "Burn")
      .map((e) => e.damage);
    expect(ticks.slice(0, 4)).toEqual([4, 3, 2, 1]);
  });

  it("so cumulative Burn damage is 10 from a single 4-stack application, not 4", () => {
    const cumulative = simulate(solo("magmite"), corpus)
      .cumulativeSeries.filter((p) => p.tSeconds >= 4.5 && p.tSeconds <= 7)
      .map((p) => `${p.tSeconds}:${p.byStatus.Burn}`);
    expect(cumulative).toEqual(["4.5:0", "5:4", "5.5:7", "6:9", "6.5:10", "7:10"]);
  });

  it("the first tick lands 0.5s AFTER application, not on it", () => {
    // Magmite casts at t=4.5; the stacks exist from that instant but have not ticked yet, which is
    // why cumulative burn damage is still 0 at 4.5 while the stack chart already reads 4.
    const r = simulate(solo("magmite"), corpus);
    expect(r.statusStackSeries.find((p) => p.tSeconds === 4.5)!.Burn).toBe(4);
    expect(r.cumulativeSeries.find((p) => p.tSeconds === 4.5)!.byStatus.Burn).toBe(0);
  });
});
