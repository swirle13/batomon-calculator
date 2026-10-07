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

describe("statuses tick as ONE pool on the target, not per application", () => {
  it("Venopuff's second cast grows the SAME pool — 20 cumulative by t=7.5, not 16", () => {
    // Observed step-by-step against a real turn-1 run. Venopuff (3.5s cooldown, Poison 4) first
    // applies at t=3.5, so the cadence is 4.5, 5.5, 6.5, 7.5... Its second cast at t=7.0 takes the
    // pool to 8, and the very next tick at 7.5 deals 8 — cumulative 20.
    //
    // Per-application timers gave 16 here and then wrongly ticked AGAIN at 8.0, because the second
    // cast had started its own clock.
    const r = simulate(solo("venopuff", 10), corpus);
    const cumulative = r.cumulativeSeries
      .filter((p) => p.tSeconds >= 6.5 && p.tSeconds <= 9)
      .map((p) => `${p.tSeconds}:${p.byStatus.Poison}`);
    expect(cumulative).toEqual(["6.5:12", "7:12", "7.5:20", "8:20", "8.5:28", "9:28"]);
  });

  it("there is exactly one Poison cadence, on whole seconds from first application", () => {
    const ticks = simulate(solo("venopuff", 10), corpus)
      .timeline.filter((e) => e.kind === "statusTick" && e.damageType === "Poison")
      .map((e) => e.tSeconds);
    // 1s apart throughout. Two interleaved clocks showed up as 7.5 AND 8.0, 8.5 AND 9.0.
    expect(ticks).toEqual([4.5, 5.5, 6.5, 7.5, 8.5, 9.5]);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]! - ticks[i - 1]!).toBeCloseTo(1, 5);
    }
  });

  it("a later application adds to the stack WITHOUT resetting the cadence", () => {
    // The opposite failure mode to the one fixed: if a new cast restarted the timer, a fast
    // applier could postpone its own damage indefinitely.
    const ticks = simulate(solo("venopuff", 10), corpus)
      .timeline.filter((e) => e.kind === "statusTick" && e.damageType === "Poison")
      .map((e) => e.tSeconds);
    expect(ticks[0]).toBe(4.5); // 1s after the first application at 3.5
    expect(ticks).toContain(7.5); // unmoved by the second cast at 7.0
  });

  it("Burn pools too, and still sheds exactly one layer per tick", () => {
    // Pooling must not change Burn's decay: the pool is one stack, so it loses one layer per tick
    // no matter how many casts contributed to it.
    const r = simulate(solo("magmite", 12), corpus);
    const burnTicks = r.timeline
      .filter((e) => e.kind === "statusTick" && e.damageType === "Burn")
      .map((e) => e.damage);
    expect(burnTicks.slice(0, 4)).toEqual([4, 3, 2, 1]);
  });

  it("splits a shared pool's damage across contributors in proportion", () => {
    // Two Poison appliers feeding one pool: neither may be credited with the whole tick, and the
    // parts must sum to it (FR-056).
    const team: TeamConfiguration = {
      placements: [
        { slot: { row: "back", col: 0 }, creatureId: "venopuff", level: 1 },
        { slot: { row: "back", col: 1 }, creatureId: "miasmaw", level: 1 },
      ],
      trainerId: null,
      trinketIds: [],
      itemIds: [],
      simulationWindowSeconds: 15,
      teamModifiers: [],
    };
    const r = simulate(team, corpus);
    const facilitated = Object.values(r.perCreatureFacilitatedDps);
    expect(facilitated.length).toBe(2);
    for (const v of facilitated) expect(v).toBeGreaterThan(0);
    const poisonDealt = r.cumulativeSeries[r.cumulativeSeries.length - 1]!.byStatus.Poison;
    const attributed = facilitated.reduce((a, b) => a + b, 0) * team.simulationWindowSeconds;
    expect(attributed).toBeCloseTo(poisonDealt, 4);
  });
});
