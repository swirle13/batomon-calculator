import { describe, expect, it } from "vitest";
import { simulate } from "../simulate";
import { corpus } from "../../data/corpus";
import type { Corpus, CreatureRecord, GridSlot, TeamConfiguration, TrinketRecord } from "../../data/types";
import { InvalidTeamConfigurationError } from "../errors";

/** Minimal synthetic corpus for isolating "facilitated damage" attribution from real game data. */
function syntheticCorpus(): Corpus {
  const shockApplier: CreatureRecord = {
    id: "shockApplier",
    name: "Shock Applier",
    rarity: "Common",
    types: ["Electric"],
    level: 1,
    shopCost: 10,
    baseCooldownSeconds: 1,
    baseDamage: null,
    damageType: null,
    baseMulticast: 1,
    appliesStatus: [{ type: "Shock", amount: 2 }],
    abilityText: "test fixture",
    abilityTags: [],
    sourceRefs: [],
    patch: "test",
  };
  const attacker: CreatureRecord = {
    id: "attacker",
    name: "Attacker",
    rarity: "Common",
    types: ["Fire"],
    level: 1,
    shopCost: 10,
    baseCooldownSeconds: 1,
    baseDamage: 5,
    damageType: "Direct",
    baseMulticast: 1,
    abilityText: "test fixture",
    abilityTags: [],
    sourceRefs: [],
    patch: "test",
  };
  return { creatures: [shockApplier, attacker], trainers: [], trinkets: [], items: [] };
}

/**
 * Synthetic corpus for Phase 7 (round 2) tests: one creature with a Multicast count > 1, one
 * with a float-drift-prone cooldown, and a two-level variant of the same species id (for the
 * (id, level) lookup test).
 */
function multicastCorpus(): Corpus {
  const multiCaster: CreatureRecord = {
    id: "multiCaster",
    name: "Multi Caster",
    rarity: "Common",
    types: ["Fire"],
    level: 1,
    shopCost: 10,
    baseCooldownSeconds: 1,
    baseDamage: 5,
    damageType: "Direct",
    baseMulticast: 3,
    appliesStatus: [{ type: "Shock", amount: 1 }],
    abilityText: "test fixture",
    abilityTags: [],
    sourceRefs: [],
    patch: "test",
  };
  return { creatures: [multiCaster], trainers: [], trinkets: [], items: [] };
}

function driftCorpus(): Corpus {
  const driftCreature: CreatureRecord = {
    id: "driftCreature",
    name: "Drift Creature",
    rarity: "Common",
    types: ["Fire"],
    level: 1,
    shopCost: 10,
    baseCooldownSeconds: 4.9,
    baseDamage: 1,
    damageType: "Direct",
    baseMulticast: 1,
    abilityText: "test fixture",
    abilityTags: [],
    sourceRefs: [],
    patch: "test",
  };
  return { creatures: [driftCreature], trainers: [], trinkets: [], items: [] };
}

function multiLevelCorpus(): Corpus {
  const level1: CreatureRecord = {
    id: "leveledMon",
    name: "Leveled Mon",
    rarity: "Common",
    types: ["Fire"],
    level: 1,
    shopCost: 10,
    baseCooldownSeconds: 2,
    baseDamage: 5,
    damageType: "Direct",
    baseMulticast: 1,
    abilityText: "test fixture",
    abilityTags: [],
    sourceRefs: [],
    patch: "test",
  };
  const level2: CreatureRecord = { ...level1, level: 2, baseDamage: 10 };
  return { creatures: [level1, level2], trainers: [], trinkets: [], items: [] };
}

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
   * "Facilitated damage" (user-requested, data-model.md amendment, 2026-10-05): a creature
   * that only grants Shock (no direct damage of its own) should show up with 0 perCreatureDps
   * but a positive perCreatureFacilitatedDps equal to the Shock procs its layers enabled on
   * the attacker's hits — and that proc damage must NOT also inflate the attacker's own DPS.
   */
  it("attributes Shock proc damage to the Shock-granting creature as facilitated damage, not the attacker's own DPS", () => {
    const synthetic = syntheticCorpus();
    const config: TeamConfiguration = {
      placements: [
        { slot: { row: "front", col: 0 }, creatureId: "shockApplier", level: 1 },
        { slot: { row: "front", col: 1 }, creatureId: "attacker", level: 1 },
      ],
      trainerId: null,
      trinketIds: [],
      itemIds: [],
      simulationWindowSeconds: 4,
    };
    const result = simulate(config, synthetic);

    const shockApplierKey = Object.keys(result.perCreatureFacilitatedDps).find((k) => k.startsWith("shockApplier@"));
    expect(shockApplierKey).toBeDefined();
    expect(result.perCreatureFacilitatedDps[shockApplierKey!]).toBeGreaterThan(0);

    // shockApplier never deals direct damage itself.
    expect(Object.keys(result.perCreatureDps).some((k) => k.startsWith("shockApplier@"))).toBe(false);

    // attacker's own DPS is exactly its own direct damage (5 dmg / 1s cooldown = 5/s), not
    // inflated by the Shock proc damage its hits triggered.
    const attackerKey = Object.keys(result.perCreatureDps).find((k) => k.startsWith("attacker@"));
    expect(result.perCreatureDps[attackerKey!]).toBeCloseTo(5, 5);

    // 2026-10-06 round 6 (FR-040, research.md H8): this expectation changed from 5 to 3, and the
    // change is the point of the fix rather than a regression. This assertion used to read 5
    // *because* "shockApplier (front0) is processed before attacker (front1) at each tied
    // timestamp (stable slot order), so it grants +2 Shock before attacker's same-tick hit" --
    // i.e. the old expected value was derived from the very slot-ordering dependency the user
    // reported as a bug. Swapping these two creatures' slots would have changed it.
    //
    // Under the per-timestamp snapshot rule, a layer granted at T takes effect from the next
    // distinct timestamp, so both orderings now agree: casts at t=1,2,3,4 give snapshots of
    // 0/2/4/6 layers -> procs of 0+2+4+6 = 12 over a 4s window = 3/s, all attributed to
    // shockApplier (the only Shock source). The alternative semantic (apply all status at T, then
    // all hits at T) is also order-independent but inflates output by letting a layer empower a
    // hit it was simultaneous with -- explicitly considered and rejected in research.md H8.
    expect(result.perCreatureFacilitatedDps[shockApplierKey!]).toBeCloseTo(3, 5);
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

  /**
   * Phase 7 (round 2) T062 — Multicast (research.md D3): a creature with baseMulticast: 3
   * fires 3 independent direct-damage events at the same tSeconds per cooldown completion,
   * each independently eligible to proc Shock.
   */
  it("Multicast fires N independent direct-damage events, staggered 0.1s apart (research.md F2, round 4)", () => {
    const synthetic = multicastCorpus();
    const config: TeamConfiguration = {
      placements: [{ slot: { row: "front", col: 0 }, creatureId: "multiCaster", level: 1 }],
      trainerId: null,
      trinketIds: [],
      itemIds: [],
      // Window must extend to cover the full staggered burst (t=1.0/1.1/1.2), not just the
      // cooldown-triggered timestamp itself -- a tighter window legitimately truncates later
      // repetitions (see the next test).
      simulationWindowSeconds: 1.2,
    };
    const result = simulate(config, synthetic);

    // One cooldown completion at t=1 -> 3 independent "attack" events, staggered 0.1s apart
    // (research.md F2, round 4 correction -- was simultaneous in round 2), NOT all at t=1.
    const attackEvents = result.timeline
      .filter((e) => e.kind === "attack")
      .map((e) => e.tSeconds)
      .sort((a, b) => a - b);
    expect(attackEvents).toHaveLength(3);
    expect(attackEvents[0]).toBeCloseTo(1, 5);
    expect(attackEvents[1]).toBeCloseTo(1.1, 5);
    expect(attackEvents[2]).toBeCloseTo(1.2, 5);

    // Each of the 3 hits deals its own 5 damage -> total 15 damage / 1.2s window = 12.5 DPS.
    const key = Object.keys(result.perCreatureDps)[0]!;
    expect(result.perCreatureDps[key]).toBeCloseTo(15 / 1.2, 5);

    // Each hit independently procs Shock off the layers granted by the previous hits in the
    // same Multicast burst (1 Shock granted per hit, applied after that hit's own damage) ->
    // hit 1 procs 0 (no layers yet), hit 2 procs 1 (1 layer from hit 1), hit 3 procs 2 (2
    // layers from hits 1+2) = 3 total Shock proc damage, now spread across t=1/1.1/1.2.
    const shockProcs = result.timeline.filter((e) => e.kind === "shockProc");
    const totalShockProcDamage = shockProcs.reduce((sum, e) => sum + (e.damage ?? 0), 0);
    expect(totalShockProcDamage).toBeCloseTo(3, 5);
  });

  it("a Multicast repetition staggered past the simulation window is not generated", () => {
    const synthetic = multicastCorpus(); // baseMulticast: 3, baseCooldownSeconds: 1
    const config: TeamConfiguration = {
      placements: [{ slot: { row: "front", col: 0 }, creatureId: "multiCaster", level: 1 }],
      trainerId: null,
      trinketIds: [],
      itemIds: [],
      // Window ends exactly between the 2nd (t=1.1) and 3rd (t=1.2) repetition.
      simulationWindowSeconds: 1.15,
    };
    const result = simulate(config, synthetic);
    const attackEvents = result.timeline.filter((e) => e.kind === "attack");
    expect(attackEvents).toHaveLength(2);
  });

  /**
   * Phase 7 (round 2) T063 — perCreatureEffectiveStats (data-model.md): reflects an active
   * StatModifier as a post-modifier amount, resolved via the same path as the cast loop.
   */
  it("perCreatureEffectiveStats reflects an active damageFlatAdd modifier", () => {
    const config: TeamConfiguration = {
      placements: [{ slot: { row: "front", col: 0 }, creatureId: "bumblebolt", level: 1 }],
      trainerId: null,
      trinketIds: [],
      itemIds: [],
      simulationWindowSeconds: 20,
      teamModifiers: [{ id: "m1", stat: "damageFlatAdd", amount: 10 }],
    };
    const result = simulate(config, corpus);
    const key = Object.keys(result.perCreatureEffectiveStats).find((k) => k.startsWith("bumblebolt@"));
    expect(key).toBeDefined();
    const stats = result.perCreatureEffectiveStats[key!]!;
    expect(stats.output.damage).toBeCloseTo(3 + 10, 5);
    expect(stats.output.damageType).toBe("Direct");
    expect(stats.cooldownSeconds).toBeCloseTo(2.5, 5);
    expect(stats.output.multicast).toBe(1);
  });

  /**
   * Phase 7 (round 2) T064 — chart X-axis float drift (research.md D4): cast times for a
   * drift-prone cooldown (4.9) must never accumulate float garbage, across a 20+ cast window.
   */
  it("cast times never accumulate floating-point drift across many casts", () => {
    const synthetic = driftCorpus();
    const config: TeamConfiguration = {
      placements: [{ slot: { row: "front", col: 0 }, creatureId: "driftCreature", level: 1 }],
      trainerId: null,
      trinketIds: [],
      itemIds: [],
      simulationWindowSeconds: 4.9 * 25, // 25 casts
    };
    const result = simulate(config, synthetic);
    const attackTimes = result.timeline.filter((e) => e.kind === "attack").map((e) => e.tSeconds);
    expect(attackTimes.length).toBeGreaterThanOrEqual(24);
    for (const t of attackTimes) {
      // Rounding to 6 decimal places must be a no-op if there is no drift beyond that
      // precision -- i.e. the value already has at most 6 significant decimal digits.
      expect(t).toBeCloseTo(Math.round(t * 1e6) / 1e6, 9);
    }
  });

  /**
   * Phase 7 (round 2) T065 — (id, level) lookup (data-model.md's lookup-fix amendment):
   * simulate() must resolve the exact (creatureId, level) pair, never silently fall back to a
   * different level's record, and must throw when no record exists for that exact pair.
   */
  it("resolves a placement's creature by the exact (id, level) pair, not id alone", () => {
    const synthetic = multiLevelCorpus();
    const level1Config: TeamConfiguration = {
      placements: [{ slot: { row: "front", col: 0 }, creatureId: "leveledMon", level: 1 }],
      trainerId: null,
      trinketIds: [],
      itemIds: [],
      simulationWindowSeconds: 2,
    };
    const level2Config: TeamConfiguration = { ...level1Config, placements: [{ ...level1Config.placements[0]!, level: 2 }] };

    const level1Result = simulate(level1Config, synthetic);
    const level2Result = simulate(level2Config, synthetic);
    expect(Object.values(level1Result.perCreatureDps)[0]).toBeCloseTo(5 / 2, 5);
    expect(Object.values(level2Result.perCreatureDps)[0]).toBeCloseTo(10 / 2, 5);
  });

  it("throws InvalidTeamConfigurationError when no record exists for the exact (id, level) pair", () => {
    const synthetic = multiLevelCorpus(); // only has level 1 and 2 records
    const config: TeamConfiguration = {
      placements: [{ slot: { row: "front", col: 0 }, creatureId: "leveledMon", level: 3 }],
      trainerId: null,
      trinketIds: [],
      itemIds: [],
      simulationWindowSeconds: 2,
    };
    expect(() => simulate(config, synthetic)).toThrow(InvalidTeamConfigurationError);
  });

  /**
   * Trinket effectTags (2026-10-06 round 5, data-model.md's "Trinket effect application"
   * amendment): a selected trinket's flat team-wide stat bonus must apply through the exact
   * same modifier-resolution path as a manual teamModifier -- not a separate computation.
   */
  it("a selected trinket's effectTags apply as an implicit team-wide modifier", () => {
    const base = multicastCorpus(); // reuse: has "multiCaster" (baseDamage 5, cooldown 1)
    const bonusTrinket: TrinketRecord = {
      id: "test-trinket",
      name: "Test Trinket",
      effectText: "Your team gains +10 Damage permanently.",
      effectTags: [{ stat: "damageFlatAdd", amount: 10 }],
      abilityTags: [],
      sourceRefs: [],
      patch: "test",
    };
    const synthetic = { ...base, trinkets: [bonusTrinket] };
    const config: TeamConfiguration = {
      placements: [{ slot: { row: "front", col: 0 }, creatureId: "multiCaster", level: 1 }],
      trainerId: null,
      trinketIds: ["test-trinket"],
      itemIds: [],
      // Must cover the full staggered Multicast burst (t=1.0/1.1/1.2) -- see round 4's own
      // Multicast stagger test for why a window of exactly 1 would truncate to 1 hit.
      simulationWindowSeconds: 1.2,
    };
    const result = simulate(config, synthetic);
    const key = Object.keys(result.perCreatureDps)[0]!;
    // multiCaster has baseMulticast: 3, baseDamage: 5 -> 3 hits of (5+10) = 45 over 1.2s window.
    expect(result.perCreatureDps[key]).toBeCloseTo(45 / 1.2, 5);
  });

  it("an unselected trinket's effectTags have no effect", () => {
    const base = multicastCorpus();
    const bonusTrinket: TrinketRecord = {
      id: "test-trinket",
      name: "Test Trinket",
      effectText: "Your team gains +10 Damage permanently.",
      effectTags: [{ stat: "damageFlatAdd", amount: 10 }],
      abilityTags: [],
      sourceRefs: [],
      patch: "test",
    };
    const synthetic = { ...base, trinkets: [bonusTrinket] };
    const config: TeamConfiguration = {
      placements: [{ slot: { row: "front", col: 0 }, creatureId: "multiCaster", level: 1 }],
      trainerId: null,
      trinketIds: [], // not selected
      itemIds: [],
      simulationWindowSeconds: 1.2,
    };
    const result = simulate(config, synthetic);
    const key = Object.keys(result.perCreatureDps)[0]!;
    // No bonus -> 3 hits of 5 = 15 total over 1.2s, not 45.
    expect(result.perCreatureDps[key]).toBeCloseTo(15 / 1.2, 5);
  });
});

/**
 * FR-040 (2026-10-06 round 6, research.md H8): slot position must not change any computed value
 * for creatures that have no position-dependent ability. User-reported: dragging Bumblebolt
 * between slots moved its Facilitated DPS from 4.10 to 4.30.
 *
 * These assert the INVARIANT (permuting slots changes nothing), not a specific number --
 * research.md H8 is explicit that no source documents how the real game resolves two abilities
 * landing on the same frame, so pinning either observed value would encode a guess as a
 * requirement.
 */
describe("slot-permutation invariance (FR-040)", () => {
  /**
   * A Shock applier that also hits, plus a bigger hitter on a multiple of its cooldown, so the
   * two collide on exactly the same timestamps (t=2,4,6... vs t=4,8...). `multicast` is a
   * parameter because Multicast is a SECOND, independent manifestation of the same root cause
   * (Phase B expanded repetitions inline, so it never walked timestamps in global order) --
   * the per-timestamp snapshot alone does not fix it.
   */
  function collidingCorpus(multicast: number): Corpus {
    const shockHitter: CreatureRecord = {
      id: "shockHitter",
      name: "Shock Hitter",
      rarity: "Common",
      types: ["Electric"],
      level: 1,
      shopCost: 10,
      baseCooldownSeconds: 2,
      baseDamage: 3,
      damageType: "Direct",
      baseMulticast: multicast,
      appliesStatus: [{ type: "Shock", amount: 1 }],
      abilityText: "test fixture -- no positional ability",
      abilityTags: [],
      sourceRefs: [],
      patch: "test",
    };
    const bigHitter: CreatureRecord = {
      id: "bigHitter",
      name: "Big Hitter",
      rarity: "Common",
      types: ["Fire"],
      level: 1,
      shopCost: 10,
      baseCooldownSeconds: 4,
      baseDamage: 25,
      damageType: "Direct",
      baseMulticast: 1,
      abilityText: "test fixture -- no positional ability",
      abilityTags: [],
      sourceRefs: [],
      patch: "test",
    };
    return { creatures: [shockHitter, bigHitter], trainers: [], trinkets: [], items: [] };
  }

  /**
   * Re-keys the per-creature maps from `id@slot` to just `id`, so results from two different
   * layouts are comparable (the slot is part of the key by design).
   */
  function outputsByCreature(corpusToUse: Corpus, slots: Record<string, GridSlot>) {
    const config: TeamConfiguration = {
      placements: Object.entries(slots).map(([creatureId, slot]) => ({ slot, creatureId, level: 1 })),
      trainerId: null,
      trinketIds: [],
      itemIds: [],
      simulationWindowSeconds: 20,
    };
    const result = simulate(config, corpusToUse);
    const strip = (record: Record<string, number>) =>
      Object.fromEntries(Object.entries(record).map(([key, value]) => [key.split("@")[0]!, value]));
    return {
      dps: strip(result.perCreatureDps),
      facilitated: strip(result.perCreatureFacilitatedDps),
      status: result.perStatusPerSecond,
    };
  }

  it("moving a creature with no positional ability does not change any output (same-timestamp collision)", () => {
    const synthetic = collidingCorpus(1);
    // The reported case: the Shock applier sorts AFTER the big hitter in one layout (front-1)
    // and BEFORE it in the other (back-2), because STABLE_SLOT_ORDER puts all of `back` first.
    const before = outputsByCreature(synthetic, {
      bigHitter: { row: "front", col: 0 },
      shockHitter: { row: "front", col: 1 },
    });
    const after = outputsByCreature(synthetic, {
      bigHitter: { row: "front", col: 0 },
      shockHitter: { row: "back", col: 2 },
    });

    expect(after.facilitated).toEqual(before.facilitated);
    expect(after.dps).toEqual(before.dps);
    expect(after.status).toEqual(before.status);
  });

  it("moving a MULTICAST creature with no positional ability does not change any output", () => {
    // Shape (b): repetitions were expanded inline inside the cast loop, so a cast at t=4.0 with
    // a repetition at 4.1 was fully processed before another creature's t=4.0 cast that sorted
    // later -- Phase B was never chronological. Reproduced with real data before the fix:
    // Bumblebolt Lv4 (Multicast 2) gave Shock 20.55/s at front-1 vs 21.60/s at back-1.
    const synthetic = collidingCorpus(2);
    const before = outputsByCreature(synthetic, {
      bigHitter: { row: "front", col: 0 },
      shockHitter: { row: "front", col: 1 },
    });
    const after = outputsByCreature(synthetic, {
      bigHitter: { row: "front", col: 0 },
      shockHitter: { row: "back", col: 1 },
    });

    expect(after.facilitated).toEqual(before.facilitated);
    expect(after.dps).toEqual(before.dps);
    expect(after.status).toEqual(before.status);
  });

  it("holds against the real corpus for the user's reported Bumblebolt formation", () => {
    const front = outputsByCreature(corpus, {
      panbud: { row: "front", col: 0 },
      bumblebolt: { row: "front", col: 1 },
    });
    const back = outputsByCreature(corpus, {
      panbud: { row: "front", col: 0 },
      bumblebolt: { row: "back", col: 0 },
    });

    expect(back.facilitated).toEqual(front.facilitated);
    expect(back.status).toEqual(front.status);
  });
});

/**
 * FR-055/056/057 (2026-10-06 round 7, research.md I13): second-order status metrics and DOT
 * attribution. The user's complaint: a Poison team reports 0.00 DPS and 0.00 facilitated DPS, and
 * the one averaged status figure hides a damage rate that climbs for the whole battle.
 */
describe("second-order status metrics (FR-055/056/057)", () => {
  /** A lone Drumire: Poison 20, 8s cooldown, no direct damage. */
  const drumireOnly = (windowSeconds: number): TeamConfiguration => ({
    placements: [{ slot: { row: "back", col: 0 }, creatureId: "drumire", level: 1 }],
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: windowSeconds,
  });

  it("records Burn and Poison applications in the timeline, not only their ticks", () => {
    // Before this round only Shock and Shield applications were recorded, which made application
    // rates underivable for exactly the two statuses whose rates matter most.
    const result = simulate(drumireOnly(20), corpus);
    const applications = result.timeline.filter((e) => e.statusDelta?.type === "Poison");
    expect(applications.length).toBeGreaterThan(0);
    expect(applications.reduce((sum, e) => sum + (e.statusDelta?.layerDelta ?? 0), 0)).toBe(40);
  });

  it("pins the exact worked case so the arithmetic cannot drift (20s)", () => {
    // Measured, not hand-derived: casts at t=8 and t=16, Poison ticks every 1s and never decays.
    //
    // 320 briefly became 340 while an application was ordered before a tick sharing its instant.
    // Frame-by-frame play says the opposite — a tick on a cast's instant reads the PRE-cast stack —
    // so this is back to 320. Drumire's cast at t=16 lands on a tick; that tick deals 20, not 40.
    const result = simulate(drumireOnly(20), corpus);
    expect(result.perStatusPerSecond.Poison).toBeCloseTo(16.0, 5); // 320 total / 20s
    expect(result.perStatusFinalDamageRate.Poison).toBeCloseTo(40, 5); // 2 casts x 20 layers
    expect(result.perStatusDamageGrowthPerSecond.Poison).toBeCloseTo(2.0, 5); // 40 / 20
    expect(result.perStatusAppliedPerSecond.Poison).toBeCloseTo(2.0, 5); // 40 stacks / 20s
  });

  it("pins the same case at 60s, where the average and the end-of-window rate diverge further", () => {
    const result = simulate(drumireOnly(60), corpus);
    expect(result.perStatusPerSecond.Poison).toBeCloseTo(3920 / 60, 4);
    expect(result.perStatusFinalDamageRate.Poison).toBeCloseTo(140, 5);
    expect(result.perStatusDamageGrowthPerSecond.Poison).toBeCloseTo(140 / 60, 5);
  });

  it("reports growth for BOTH Poison and a real Burn build -- Burn does not sit at zero", () => {
    // CORRECTION (user-reported, 2026-10-06): an earlier version of this test asserted Burn's
    // growth was ~0, using a LONE BRIMTOAD applying Burn 1 every 6s. That was fixture selection
    // bias -- a 1-layer instance lives 0.5s, so it is at steady state instantly. It is the
    // weakest burn in the corpus, and it confirmed an assumption instead of testing it.
    //
    // Each burn INSTANCE decays at a fixed 1 layer per 0.5s tick regardless of its size, so an
    // N-layer instance lives N/2 seconds. Basilord's 170 burn lives 85s; with a new application
    // every 8s, instances pile up faster than any one drains. Burn therefore climbs throughout
    // any realistic battle and plateaus only in principle.
    const fireBuild: TeamConfiguration = {
      placements: [
        { slot: { row: "back", col: 0 }, creatureId: "basilord", level: 1 },
        { slot: { row: "back", col: 1 }, creatureId: "blixie", level: 1 },
        { slot: { row: "back", col: 2 }, creatureId: "pyronade", level: 1 },
      ],
      trainerId: null,
      trinketIds: [],
      itemIds: [],
      simulationWindowSeconds: 20,
    };
    const burn = simulate(fireBuild, corpus);
    // Emphatically not zero, and not a rounding artifact.
    expect(burn.perStatusDamageGrowthPerSecond.Burn).toBeGreaterThan(5);
    // The end-of-window rate is far above the window average -- the same distortion Poison has.
    expect(burn.perStatusFinalDamageRate.Burn).toBeGreaterThan(burn.perStatusPerSecond.Burn * 1.5);
  });

  it("still reaches steady state quickly when burn stacks are tiny", () => {
    // The flip side, kept so the real distinction is recorded rather than over-corrected: a small
    // burn stack DOES plateau fast, because its instance expires in well under a second.
    const tinyBurn = simulate(
      {
        placements: [{ slot: { row: "back", col: 0 }, creatureId: "brimtoad", level: 1 }],
        trainerId: null,
        trinketIds: [],
        itemIds: [],
        simulationWindowSeconds: 60,
      },
      corpus,
    );
    expect(tinyBurn.perStatusDamageGrowthPerSecond.Burn).toBeLessThan(0.1);
  });

  it("Poison grows without bound, which Burn does not -- the difference is duration, not presence", () => {
    // Poison's growth persists at ANY window length because its stacks never decay at all.
    // Burn's decays away eventually; it simply takes longer than a battle for big stacks.
    const poisonShort = simulate(drumireOnly(20), corpus);
    const poisonLong = simulate(drumireOnly(600), corpus);
    expect(poisonShort.perStatusDamageGrowthPerSecond.Poison).toBeGreaterThan(1);
    expect(poisonLong.perStatusDamageGrowthPerSecond.Poison).toBeGreaterThan(1);
  });

  it("attributes DOT damage to the creature that applied it, without inflating its own DPS", () => {
    const result = simulate(drumireOnly(20), corpus);
    const key = Object.keys(result.perCreatureFacilitatedDps).find((k) => k.startsWith("drumire@"));
    expect(key).toBeDefined();
    // All 320 Poison damage exists because Drumire applied it.
    expect(result.perCreatureFacilitatedDps[key!]).toBeCloseTo(16.0, 5);
    // ...but Drumire deals no DIRECT damage, so its own DPS stays zero. Facilitated output is
    // reported separately rather than folded in, so a DOT team's DPS column stays comparable with
    // a direct-damage team's.
    expect(Object.keys(result.perCreatureDps).some((k) => k.startsWith("drumire@"))).toBe(false);
  });

  it("produces no NaN at a 1-second window (the UI's minimum)", () => {
    const result = simulate(drumireOnly(1), corpus);
    for (const record of [
      result.perStatusAppliedPerSecond,
      result.perStatusFinalDamageRate,
      result.perStatusDamageGrowthPerSecond,
    ]) {
      for (const value of Object.values(record)) expect(Number.isNaN(value)).toBe(false);
    }
  });

  // NOTE: this fixture covers Poison and Burn only. Shock and Shield are NOT exercised here —
  // Shock's damage arrives via shockProc rather than ticks, and Shield deals no damage at all, so
  // their entries in these Records carry the documented fallbacks rather than tested values.
});


/**
 * FR-068 (WI-017, 2026-10-06 round 8): an instantaneous DPS series, so a rising output rate is
 * visible as a curve rather than implied by a number. The cumulative chart is monotonic and so can
 * never show the "ebb and flow" the user asked for.
 */
describe("instantaneous DPS series (FR-068)", () => {
  function teamOf(ids: string[], windowSeconds: number): TeamConfiguration {
    const slots = [
      { row: "back", col: 0 }, { row: "back", col: 1 }, { row: "back", col: 2 },
    ] as const;
    return {
      placements: ids.map((creatureId, i) => ({ creatureId, level: 1 as const, slot: slots[i]! })),
      trainerId: null,
      trinketIds: [],
      itemIds: [],
      simulationWindowSeconds: windowSeconds,
    };
  }

  it("rises across the window for a Poison team, whose stacks never decay", () => {
    const series = simulate(teamOf(["drumire"], 40), corpus).dpsRateSeries;
    expect(series.length).toBeGreaterThan(2);
    const first = series[1]!.dps;
    const last = series[series.length - 1]!.dps;
    expect(last).toBeGreaterThan(first);
  });

  it("stays flat for a pure direct-damage team, whose output does not compound", () => {
    // Rubbin: 40 damage every 6.5s, no status. Its rate is steady once casting begins, so the
    // second half's average must not exceed the first half's by a meaningful margin.
    const series = simulate(teamOf(["rubbin"], 60), corpus).dpsRateSeries;
    const mid = Math.floor(series.length / 2);
    const avg = (xs: { dps: number }[]) => xs.reduce((s, x) => s + x.dps, 0) / Math.max(1, xs.length);
    expect(avg(series.slice(mid))).toBeLessThan(avg(series.slice(1, mid)) * 1.5);
  });

  it("agrees with the cumulative series it is derived from", () => {
    // Single source of truth: integrating the rate must reproduce the cumulative total.
    const result = simulate(teamOf(["drumire", "rubbin"], 20), corpus);
    // 2026-10-06 (T257/FR-106): buckets are 0.5s now, and `dps` is a RATE, so integrating means
    // rate x width. This previously summed `dps` directly, which was only correct while the bucket
    // width happened to be exactly 1 second — the sum and the integral silently coincided.
    const BUCKET = 0.5;
    const integrated = result.dpsRateSeries.reduce((sum, p) => sum + p.dps * BUCKET, 0);
    const cumulative = result.cumulativeSeries[result.cumulativeSeries.length - 1]!.totalDamage;
    expect(integrated).toBeCloseTo(cumulative, 5);
  });
});
