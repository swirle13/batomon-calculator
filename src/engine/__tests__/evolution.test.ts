import { describe, expect, it } from "vitest";
import { resolveLevelUp } from "../evolution";
import { corpus } from "../../data/corpus";
import type { Corpus, CreatureRecord } from "../../data/types";

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
    rarity: "Common",
    types: ["Grass"],
    level: 1,
    baseMulticast: 1,
    shopCost: 10,
    baseCooldownSeconds: 5.5,
    baseDamage: 25,
    damageType: "Direct",
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
    rarity: "Common",
    types: ["Grass"],
    level: 3,
    baseMulticast: 1,
    shopCost: 10,
    baseCooldownSeconds: 5,
    baseDamage: 60,
    damageType: "Direct",
    abilityText: "test fixture",
    abilityTags: [],
    sourceRefs: [],
    patch: "test",
  };
  const nonEvolving: CreatureRecord = {
    id: "steadymon",
    name: "Steadymon",
    rarity: "Common",
    types: ["Rock"],
    level: 2,
    baseMulticast: 1,
    shopCost: 10,
    baseCooldownSeconds: 2,
    baseDamage: 5,
    damageType: "Direct",
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
   * Deliberately does NOT assert the level-3 case against the real corpus: as of this round the
   * real corpus only has a level-1 Bambudo record (tasks.md T075's corpus-completeness gap), so
   * resolveLevelUp(corpus, "panbud", 3) correctly returns null today — that's the lookup-fix
   * discipline working as intended, not a bug, and will correctly flip to non-null once a real
   * level-3 Bambudo record is added without needing this test to change.
   */
  it("real corpus: Panbud below its evolution threshold resolves to itself", () => {
    const resolved = resolveLevelUp(corpus, "panbud", 1);
    expect(resolved).not.toBeNull();
    expect(resolved!.id).toBe("panbud");
  });
});
