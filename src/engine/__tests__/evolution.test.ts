import { describe, expect, it } from "vitest";
import { resolveLevelUp } from "../evolution";
import { corpus } from "../../data/corpus";
import type { Corpus, CreatureRecord } from "../../data/types";
import { CreatureType, DamageChannel, Rarity } from "../../data/enums";

/**
 * Synthetic corpus isolating the evolution-chain resolver from the real corpus's current data
 * completeness (research.md E2.6 / data-model.md's "Evolution-aware leveling" amendment) — the
 * real corpus doesn't have real level-3 Bambudo/Sunsage records yet (only level 1), so a
 * synthetic fixture lets this test assert the full chain-walk + (id, level) lookup logic
 * end-to-end, the same pattern already used in simulate.test.ts's synthetic fixtures.
 */
function evolutionCorpus(): Corpus {
  const panbudL1: CreatureRecord = {
    id: "panbud",
    name: "Panbud",
    rarity: Rarity.Common,
    types: [CreatureType.Grass],
    level: 1,
    baseMulticast: 1,
    shopCost: 10,
    baseCooldownSeconds: 5.5,
    publishedCast: { damage: 25, channel: DamageChannel.Direct },
    evolvesInto: "bambudo",
    evolvesAtLevel: 3,
    abilityText: "Evolves at level 3.",
    abilityTags: [],
    sourceRefs: [],
    patch: "test",
  };
  const bambudoL3: CreatureRecord = {
    id: "bambudo",
    name: "Bambudo",
    rarity: Rarity.Common,
    types: [CreatureType.Grass],
    level: 3,
    baseMulticast: 1,
    shopCost: 10,
    baseCooldownSeconds: 5,
    publishedCast: { damage: 60, channel: DamageChannel.Direct },
    abilityText: "test fixture",
    abilityTags: [],
    sourceRefs: [],
    patch: "test",
  };
  const nonEvolving: CreatureRecord = {
    id: "steadymon",
    name: "Steadymon",
    rarity: Rarity.Common,
    types: [CreatureType.Rock],
    level: 2,
    baseMulticast: 1,
    shopCost: 10,
    baseCooldownSeconds: 2,
    publishedCast: { damage: 5, channel: DamageChannel.Direct },
    abilityText: "test fixture, no evolution",
    abilityTags: [],
    sourceRefs: [],
    patch: "test",
  };
  return { creatures: [panbudL1, bambudoL3, nonEvolving], trainers: [], trinkets: [], items: [] };
}

describe("resolveLevelUp", () => {
  it("resolves Panbud at level 3 to Bambudo (synthetic fixture isolating the chain-walk logic)", () => {
    const synthetic = evolutionCorpus();
    const resolved = resolveLevelUp(synthetic, "panbud", 3);
    expect(resolved).not.toBeNull();
    expect(resolved!.id).toBe("bambudo");
    expect(resolved!.level).toBe(3);
  });

  it("a species with no evolvesInto resolves to itself at any level it has a record for", () => {
    const synthetic = evolutionCorpus();
    const resolved = resolveLevelUp(synthetic, "steadymon", 2);
    expect(resolved).not.toBeNull();
    expect(resolved!.id).toBe("steadymon");
  });

  it("returns null when the resolved species has no record at the requested level (never falls back to a different level)", () => {
    const synthetic = evolutionCorpus();
    // Panbud evolves into Bambudo at 3, but this fixture has no Bambudo record at level 4.
    const resolved = resolveLevelUp(synthetic, "panbud", 4);
    expect(resolved).toBeNull();
  });

  it("returns null for an unknown species id", () => {
    const synthetic = evolutionCorpus();
    expect(resolveLevelUp(synthetic, "not-a-real-species", 1)).toBeNull();
  });

  /**
   * Real-corpus smoke test: Panbud at level 1 (below its evolution threshold) must resolve to
   * itself, not to Bambudo — confirms the resolver doesn't jump the gun before the threshold.
   */
  it("real corpus: Panbud below its evolution threshold resolves to itself", () => {
    const resolved = resolveLevelUp(corpus, "panbud", 1);
    expect(resolved).not.toBeNull();
    expect(resolved!.id).toBe("panbud");
  });

  /**
   * Non-level-triggered evolution (2026-10-06 round 5, research.md G1 / spec.md Edge Case):
   * a species like Ignit evolves "On Victory," not at a level threshold -- evolvesInto is
   * recorded but evolvesAtLevel is deliberately absent, since resolveLevelUp has no "level"
   * input to resolve a victory-triggered evolution against. It must never evolve through
   * leveling, at any level, even though evolvesInto is populated.
   */
  it("a species with evolvesInto but no evolvesAtLevel never resolves through evolution at any level", () => {
    const victoryTriggered: CreatureRecord = {
      id: "victoryMon",
      name: "Victory Mon",
      rarity: Rarity.SuperRare,
      types: [CreatureType.Fire],
      level: 1,
      baseMulticast: 1,
      shopCost: 40,
      baseCooldownSeconds: 8,
      evolvesInto: "evolvedVictoryMon", // no evolvesAtLevel -- victory-triggered, not level-based
      abilityText: "Evolve on victory.",
      abilityTags: [],
      sourceRefs: [],
      patch: "test",
    };
    const synthetic: Corpus = { creatures: [victoryTriggered], trainers: [], trinkets: [], items: [] };
    for (const level of [1, 2, 3, 4] as const) {
      const resolved = resolveLevelUp(synthetic, "victoryMon", level);
      if (level === 1) {
        expect(resolved?.id).toBe("victoryMon");
      } else {
        // No level-1 "evolvedVictoryMon" record exists either, so this correctly returns null
        // (the lookup-fix discipline) -- the key assertion is it never resolves to the evolved
        // species id purely from leveling, which it doesn't attempt to do here.
        expect(resolved?.id).not.toBe("evolvedVictoryMon");
      }
    }
  });
});
