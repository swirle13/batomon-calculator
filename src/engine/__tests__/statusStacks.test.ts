import { describe, expect, it } from "vitest";
import { simulate } from "../simulate";
import { corpus } from "../../data/corpus";
import type { TeamConfiguration } from "../../data/types";
import { GridRow, TimelineEventKind } from "../../data/enums";
import { Species } from "../../data/ids";

const solo = (creatureId: Species, windowSeconds = 10): TeamConfiguration => ({
  placements: [{ slot: { row: GridRow.Top, col: 0 }, creatureId, level: 1 }],
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
    const burn = simulate(solo(Species.Magmite), corpus)
      .statusStackSeries.filter((p) => p.tSeconds >= 4 && p.tSeconds <= 7)
      .map((p) => `${p.tSeconds}:${p.Burn}`);
    expect(burn).toEqual(["4:0", "4.5:4", "5:3", "5.5:2", "6:1", "6.5:0", "7:0"]);
  });

  it("Poison only accumulates — it never sheds from ticking", () => {
    const series = simulate(solo(Species.Venopuff, 12), corpus).statusStackSeries;
    const poison = series.map((p) => p.Poison);
    for (let i = 1; i < poison.length; i++) {
      expect(poison[i]!, `Poison fell at t=${series[i]!.tSeconds}`).toBeGreaterThanOrEqual(poison[i - 1]!);
    }
    expect(poison[poison.length - 1]!).toBeGreaterThan(0);
  });

  it("is sampled on the same 0.5s grid as the other two charts", () => {
    // All three charts must agree about what a point means; different grids were the original
    // inconsistency (FR-106).
    const r = simulate(solo(Species.Magmite), corpus);
    expect(r.statusStackSeries.map((p) => p.tSeconds)).toEqual(
      r.cumulativeSeries.map((p) => p.tSeconds),
    );
  });

  it("tracks stacks, NOT damage — the two diverge for Burn", () => {
    // At t=6 Magmite has 1 live stack left but has already dealt several points of burn damage.
    // If this series were accidentally wired to damage, it would be monotonic like the other chart.
    const r = simulate(solo(Species.Magmite), corpus);
    const at6 = r.statusStackSeries.find((p) => p.tSeconds === 6)!;
    const dmg6 = r.cumulativeSeries.find((p) => p.tSeconds === 6)!;
    expect(at6.Burn).toBe(1);
    expect(dmg6.byStatus.Burn).toBeGreaterThan(at6.Burn);
  });
});

describe("cumulativeSeries exposes direct damage separately", () => {
  it("direct damage is its own series, not only folded into the total", () => {
    const r = simulate(solo(Species.Bumblebolt, 10), corpus);
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
    const ticks = simulate(solo(Species.Magmite), corpus)
      .timeline.filter((e) => e.kind === TimelineEventKind.StatusTick && e.damageType === "Burn")
      .map((e) => e.damage);
    expect(ticks.slice(0, 4)).toEqual([4, 3, 2, 1]);
  });

  it("so cumulative Burn damage is 10 from a single 4-stack application, not 4", () => {
    const cumulative = simulate(solo(Species.Magmite), corpus)
      .cumulativeSeries.filter((p) => p.tSeconds >= 4.5 && p.tSeconds <= 7)
      .map((p) => `${p.tSeconds}:${p.byStatus.Burn}`);
    expect(cumulative).toEqual(["4.5:0", "5:4", "5.5:7", "6:9", "6.5:10", "7:10"]);
  });

  it("the first tick lands 0.5s AFTER application, not on it", () => {
    // Magmite casts at t=4.5; the stacks exist from that instant but have not ticked yet, which is
    // why cumulative burn damage is still 0 at 4.5 while the stack chart already reads 4.
    const r = simulate(solo(Species.Magmite), corpus);
    expect(r.statusStackSeries.find((p) => p.tSeconds === 4.5)!.Burn).toBe(4);
    expect(r.cumulativeSeries.find((p) => p.tSeconds === 4.5)!.byStatus.Burn).toBe(0);
  });
});

describe("statuses tick as ONE pool on a GLOBAL clock", () => {
  it("reproduces the frame-by-frame observed Venopuff series exactly", () => {
    // Hand-recorded from play. Venopuff (3.5s cooldown, Poison 4) casts at 3.5, 7.0, 10.5, 14.0,
    // 17.5, 21.0. Poison ticks on WHOLE SECONDS regardless of when it was applied, and a tick
    // sharing a cast's instant uses the PRE-cast stack.
    const r = simulate(solo(Species.Venopuff, 23), corpus);
    const ticks = r.timeline
      .filter((e) => e.kind === TimelineEventKind.StatusTick && e.damageType === "Poison")
      .map((e) => `${e.tSeconds}:${e.damage}`);
    expect(ticks).toEqual([
      "4:4", "5:4", "6:4",
      "7:4",            // cast 2 lands here; this tick still reads 4
      "8:8", "9:8", "10:8",
      "11:12", "12:12", "13:12",
      "14:12",          // cast 4 lands here; still 12
      "15:16", "16:16", "17:16",
      "18:20", "19:20", "20:20",
      "21:20",          // cast 6 lands here; still 20
      "22:24", "23:24",
    ]);
  });

  it("the cadence is anchored to BATTLE START, not to the application", () => {
    // The bug this replaces: the clock started at `application + interval`, so a cast at 3.5 put
    // the first tick at 4.5. Observed play puts it at 4.0 — the next whole second.
    const ticks = simulate(solo(Species.Venopuff, 10), corpus)
      .timeline.filter((e) => e.kind === TimelineEventKind.StatusTick && e.damageType === "Poison")
      .map((e) => e.tSeconds);
    expect(ticks[0]).toBe(4);
    for (const t of ticks) expect(Number.isInteger(t), `tick at ${t} is off the whole-second grid`).toBe(true);
  });

  it("a tick sharing a cast's instant uses the PRE-cast stack", () => {
    // FR-040 snapshot semantics. Venopuff casts at 7.0 onto a tick instant; observed damage is 4,
    // the stack as it stood before the cast, and 8 only from the next tick.
    const r = simulate(solo(Species.Venopuff, 10), corpus);
    const at = (t: number) =>
      r.timeline.find((e) => e.kind === TimelineEventKind.StatusTick && e.damageType === "Poison" && e.tSeconds === t)?.damage;
    expect(at(7)).toBe(4);
    expect(at(8)).toBe(8);
  });

  it("a later application joins the running cadence without resetting it", () => {
    // The opposite failure mode: if a cast restarted the clock, a fast applier could postpone its
    // own damage indefinitely.
    const ticks = simulate(solo(Species.Venopuff, 12), corpus)
      .timeline.filter((e) => e.kind === TimelineEventKind.StatusTick && e.damageType === "Poison")
      .map((e) => e.tSeconds);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]! - ticks[i - 1]!).toBeCloseTo(1, 5);
  });

  it("Burn runs on the half-second grid and still sheds one layer per tick", () => {
    // Magmite casts Burn 4 at 4.5; observed ticks are 5.0, 5.5, 6.0, 6.5 for 4, 3, 2, 1. Note the
    // first tick is 5.0 and not 4.5, even though 4.5 is already on the grid: a status applied on a
    // grid line waits for the next one.
    const ticks = simulate(solo(Species.Magmite, 12), corpus)
      .timeline.filter((e) => e.kind === TimelineEventKind.StatusTick && e.damageType === "Burn")
      .map((e) => `${e.tSeconds}:${e.damage}`);
    expect(ticks.slice(0, 4)).toEqual(["5:4", "5.5:3", "6:2", "6.5:1"]);
  });

  it("splits a shared pool's damage across contributors in proportion", () => {
    // Two Poison appliers feeding one pool: neither may be credited with the whole tick, and the
    // parts must sum to it (FR-056).
    const team: TeamConfiguration = {
      placements: [
        { slot: { row: GridRow.Top, col: 0 }, creatureId: Species.Venopuff, level: 1 },
        { slot: { row: GridRow.Top, col: 1 }, creatureId: Species.Miasmaw, level: 1 },
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

/**
 * The whole observed battle, as recorded frame by frame from play.
 *
 * Venopuff + Magmite + shiny Dribblet against a 300 HP enemy. This is the strongest evidence the
 * project has about status timing: 28 consecutive events with the enemy's health after each, so
 * every tick amount AND every tick time is constrained simultaneously. A model that gets any one
 * of them wrong diverges from the health column and cannot recover, because the column is
 * cumulative.
 */
describe("observed battle: Venopuff + Magmite + shiny Dribblet vs 300 HP", () => {
  /** [time, poison damage, burn damage, enemy HP after] */
  const OBSERVED: [number, number, number, number][] = [
    [4, 4, 0, 296], [5, 4, 4, 288], [5.5, 0, 3, 285], [6, 4, 2, 279], [6.5, 0, 1, 278],
    [7, 4, 0, 274], [8, 8, 0, 266], [9, 8, 0, 258], [9.5, 0, 4, 254], [10, 8, 3, 243],
    [10.5, 0, 2, 241], [11, 12, 1, 228], [12, 12, 0, 216], [13, 12, 0, 204], [14, 12, 4, 188],
    [14.5, 0, 3, 185], [15, 16, 2, 167], [15.5, 0, 1, 166], [16, 16, 0, 150], [17, 16, 0, 134],
    [18, 20, 0, 114], [18.5, 0, 4, 110], [19, 20, 3, 87], [19.5, 0, 2, 85], [20, 20, 1, 64],
    [21, 20, 0, 44], [22, 24, 0, 20], [23, 24, 4, -8],
  ];

  const team: TeamConfiguration = {
    placements: [
      { slot: { row: GridRow.Top, col: 0 }, creatureId: Species.Venopuff, level: 1 },
      { slot: { row: GridRow.Top, col: 1 }, creatureId: Species.Magmite, level: 1 },
      { slot: { row: GridRow.Top, col: 2 }, creatureId: Species.Dribblet, level: 1, shiny: true },
    ],
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: 24,
    teamModifiers: [],
  };

  it("reproduces every tick, and the enemy's health after each", () => {
    const r = simulate(team, corpus);
    const byTime = new Map<number, { Poison: number; Burn: number }>();
    for (const e of r.timeline) {
      if (e.kind !== TimelineEventKind.StatusTick || e.damage === undefined) continue;
      const slot = byTime.get(e.tSeconds) ?? { Poison: 0, Burn: 0 };
      slot[e.damageType as "Poison" | "Burn"] += e.damage;
      byTime.set(e.tSeconds, slot);
    }

    let hp = 300;
    const actual: string[] = [];
    const expected: string[] = [];
    for (const [t, poison, burn, health] of OBSERVED) {
      const got = byTime.get(t) ?? { Poison: 0, Burn: 0 };
      hp -= got.Poison + got.Burn;
      actual.push(`${t}: ${got.Poison}p ${got.Burn}b -> ${hp}`);
      expected.push(`${t}: ${poison}p ${burn}b -> ${health}`);
    }
    expect(actual).toEqual(expected);
  });

  it("kills on the t=23 tick, with the observed 8 points of overkill", () => {
    const r = simulate(team, corpus);
    const dealtBy23 = r.cumulativeSeries.find((p) => p.tSeconds === 23)!.totalDamage;
    expect(dealtBy23).toBe(308); // 300 HP + 8 overkill
  });

  it("fires no tick at a time the recording has none", () => {
    // The sharper half of the fixture: a model can match every amount and still be wrong by
    // ticking where nothing happened. An application-anchored clock did exactly that.
    const r = simulate(team, corpus);
    const observedTimes = new Set(OBSERVED.map(([t]) => t));
    const engineTimes = r.timeline
      .filter((e) => e.kind === TimelineEventKind.StatusTick && (e.damage ?? 0) > 0 && e.tSeconds <= 23)
      .map((e) => e.tSeconds);
    for (const t of engineTimes) {
      expect(observedTimes.has(t), `engine ticked at t=${t}, which the recording has no event for`).toBe(true);
    }
  });
});
