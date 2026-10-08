import { describe, expect, it } from "vitest";
import { resolveLevelUp } from "../evolution";
import { corpus } from "../../data/corpus";
import type { Corpus, CreatureSpecies } from "../../data/types";

import { syntheticSpecies } from "../../data/ids";
import { CreatureType, DamageChannel, Rarity } from "../../data/enums";
import { Species } from "../../data/ids";

/**
 * Synthetic corpus isolating the evolution-chain resolver from the real corpus's current data
 * completeness (research.md E2.6 / data-model.md's "Evolution-aware leveling" amendment) — the
 * real corpus doesn't have real level-3 Bambudo/Sunsage records yet (only level 1), so a
 * synthetic fixture lets this test assert the full chain-walk + (id, level) lookup logic
 * end-to-end, the same pattern already used in simulate.test.ts's synthetic fixtures.
 */
function evolutionCorpus(): Corpus {
  const panbudL1: CreatureSpecies = {
    id: Species.Panbud,
    name: "Panbud",
    rarity: Rarity.Common,
    types: [CreatureType.Grass],
    baseMulticast: 1,
    shopCost: 10,
    baseCooldownSeconds: 5.5,
    publishedCast: { damage: 25, channel: DamageChannel.Direct },
    evolvesInto: Species.Bambudo,
    evolvesAtLevel: 3,
    abilityText: "Evolves at level 3.",
    abilityTags: [],
  };
  const bambudoL3: CreatureSpecies = {
    id: Species.Bambudo,
    name: "Bambudo",
    rarity: Rarity.Common,
    types: [CreatureType.Grass],
    baseMulticast: 1,
    shopCost: 10,
    baseCooldownSeconds: 5,
    publishedCast: { damage: 60, channel: DamageChannel.Direct },
    abilityText: "test fixture",
    abilityTags: [],
  };
  const nonEvolving: CreatureSpecies = {
    id: syntheticSpecies("steadymon"),
    name: "Steadymon",
    rarity: Rarity.Common,
    types: [CreatureType.Rock],
    baseMulticast: 1,
    shopCost: 10,
    baseCooldownSeconds: 2,
    publishedCast: { damage: 5, channel: DamageChannel.Direct },
    abilityText: "test fixture, no evolution",
    abilityTags: [],
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

  /**
   * 2026-10-08: this used to assert that resolving Panbud at level 4 returned `null`, because the
   * fixture carried a Bambudo record at level 3 only.
   *
   * That state is no longer REPRESENTABLE. A `CreatureSpecies` publishes all four levels — level 1
   * inline and 2-4 as overrides — so a species that exists, exists at every level. The old
   * assertion was pinning an artefact of how the fixture was written, not a rule the resolver has.
   *
   * What the resolver actually guarantees is the half of the lookup-fix discipline that survives:
   * it resolves the EVOLVED species or nothing, and never falls back to the pre-evolution record
   * when the evolution target is missing from the corpus.
   */
  it("returns null when the species it evolves into is absent from the corpus (never falls back to the pre-evolution record)", () => {
    const synthetic = evolutionCorpus();
    const orphan: CreatureSpecies = {
      id: syntheticSpecies("orphanmon"),
      name: "Orphanmon",
      rarity: Rarity.Common,
      types: [CreatureType.Grass],
      baseMulticast: 1,
      shopCost: 10,
      baseCooldownSeconds: 3,
      evolvesInto: syntheticSpecies("nowheremon"), // deliberately not in the corpus
      evolvesAtLevel: 3,
      abilityText: "Evolves at level 3.",
      abilityTags: [],
    };
    const withOrphan: Corpus = { ...synthetic, creatures: [...synthetic.creatures, orphan] };

    expect(resolveLevelUp(withOrphan, "orphanmon", 3)).toBeNull();
    // Below the threshold it still resolves to itself, so the null above is the missing TARGET.
    expect(resolveLevelUp(withOrphan, "orphanmon", 2)?.id).toBe("orphanmon");
  });

  it("resolves the evolved species at every level at or above the threshold", () => {
    const synthetic = evolutionCorpus();
    for (const level of [3, 4] as const) {
      expect(resolveLevelUp(synthetic, "panbud", level)?.id).toBe("bambudo");
    }
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
    const victoryTriggered: CreatureSpecies = {
      id: syntheticSpecies("victoryMon"),
      name: "Victory Mon",
      rarity: Rarity.SuperRare,
      types: [CreatureType.Fire],
      baseMulticast: 1,
      shopCost: 40,
      baseCooldownSeconds: 8,
      evolvesInto: syntheticSpecies("evolvedVictoryMon"), // no evolvesAtLevel -- victory-triggered, not level-based
      abilityText: "Evolve on victory.",
      abilityTags: [],
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
