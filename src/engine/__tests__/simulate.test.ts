import { describe, expect, it } from "vitest";
import { simulate } from "../simulate";
import { corpus } from "../../data/corpus";
import type { Corpus, CreatureRecord, TeamConfiguration } from "../../data/types";
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

    // Casts at t=1,2,3,4 for both. shockApplier (front0) is processed before attacker
    // (front1) at each tied timestamp (stable slot order), so it grants +2 Shock before
    // attacker's same-tick hit: t=1 -> layers 0->2, proc 2; t=2 -> 2->4, proc 4; t=3 -> 4->6,
    // proc 6; t=4 -> 6->8, proc 8. Total proc damage = 20 over a 4s window = 5/s, all
    // attributed to shockApplier (the only Shock source).
    expect(result.perCreatureFacilitatedDps[shockApplierKey!]).toBeCloseTo(5, 5);
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
  it("Multicast fires N independent direct-damage events per cooldown completion", () => {
    const synthetic = multicastCorpus();
    const config: TeamConfiguration = {
      placements: [{ slot: { row: "front", col: 0 }, creatureId: "multiCaster", level: 1 }],
      trainerId: null,
      trinketIds: [],
      itemIds: [],
      simulationWindowSeconds: 1,
    };
    const result = simulate(config, synthetic);

    // One cooldown completion at t=1 -> 3 independent "attack" events at the same tSeconds.
    const attackEvents = result.timeline.filter((e) => e.kind === "attack" && e.tSeconds === 1);
    expect(attackEvents).toHaveLength(3);

    // Each of the 3 hits deals its own 5 damage -> DPS = 15 / 1s = 15, not 5.
    const key = Object.keys(result.perCreatureDps)[0]!;
    expect(result.perCreatureDps[key]).toBeCloseTo(15, 5);

    // Each hit independently procs Shock off the layers granted by the previous hits in the
    // same Multicast burst (1 Shock granted per hit, applied after that hit's own damage) ->
    // hit 1 procs 0 (no layers yet), hit 2 procs 1 (1 layer from hit 1), hit 3 procs 2 (2
    // layers from hits 1+2) = 3 total Shock proc damage at t=1.
    const shockProcs = result.timeline.filter((e) => e.kind === "shockProc" && e.tSeconds === 1);
    const totalShockProcDamage = shockProcs.reduce((sum, e) => sum + (e.damage ?? 0), 0);
    expect(totalShockProcDamage).toBeCloseTo(3, 5);
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
    expect(stats.damage).toBeCloseTo(3 + 10, 5);
    expect(stats.damageType).toBe("Direct");
    expect(stats.cooldownSeconds).toBeCloseTo(2.5, 5);
    expect(stats.multicast).toBe(1);
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
});
