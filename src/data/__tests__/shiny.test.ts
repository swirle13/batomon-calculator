import { describe, expect, it } from "vitest";
import { corpus, hasShinyVariant, resolveCreatureVariant } from "../corpus";
import { SHINY_STATS } from "../shiny";

/**
 * Round 11 (WI-R11-001). Shiny is a published per-creature stat line, not a multiplier.
 *
 * The obvious implementation — "shiny is +20%" — matches Beetbud exactly and is wrong for roughly a
 * third of the corpus. These tests pin the counterexamples specifically, because a multiplier
 * regression would still look right on most creatures and would be invisible in the UI.
 */
describe("shiny variants", () => {
  it("is not a uniform multiplier: most stats are unchanged", () => {
    let unchanged = 0;
    let changed = 0;
    for (const [key, line] of Object.entries(SHINY_STATS)) {
      const [id, lvl] = key.split("|");
      const base = corpus.creatures.find((c) => c.id === id && c.level === Number(lvl));
      if (!base || base.baseDamage == null || line.baseDamage == null) continue;
      if (base.baseDamage === line.baseDamage) unchanged++;
      else changed++;
    }
    // If someone replaces this table with `base * 1.2`, `unchanged` collapses to 0.
    expect(unchanged).toBeGreaterThan(changed);
  });

  it("changes cooldown for some species (Furnadon 5s -> 4s)", () => {
    const normal = resolveCreatureVariant("furnadon", 1, false);
    const shiny = resolveCreatureVariant("furnadon", 1, true);
    expect(normal?.baseCooldownSeconds).toBe(5);
    expect(shiny?.baseCooldownSeconds).toBe(4);
  });

  it("changes multicast for some species (Velocect 2 -> 4)", () => {
    expect(resolveCreatureVariant("velocect", 1, false)?.baseMulticast).toBe(2);
    expect(resolveCreatureVariant("velocect", 1, true)?.baseMulticast).toBe(4);
  });

  it("GUARD: shiny is a DOWNGRADE for at least one species, so it is never assumed strictly better", () => {
    // 7 stat records measured at ratio 0.8. A UI or optimiser that treats shiny as a pure upgrade
    // would mislead on exactly these.
    const worse: string[] = [];
    for (const [key, line] of Object.entries(SHINY_STATS)) {
      const [id, lvl] = key.split("|");
      const base = corpus.creatures.find((c) => c.id === id && c.level === Number(lvl));
      if (!base?.baseDamage || line.baseDamage == null) continue;
      if (line.baseDamage < base.baseDamage) worse.push(key);
    }
    expect(worse.length).toBeGreaterThan(0);
  });

  it("falls back to the normal line rather than throwing when a species has no shiny row", () => {
    const missing = corpus.creatures.find((c) => !hasShinyVariant(c.id, c.level));
    if (!missing) return; // every species has shiny data; nothing to assert
    const resolved = resolveCreatureVariant(missing.id, missing.level, true);
    expect(resolved?.baseDamage).toBe(missing.baseDamage);
  });

  it("leaves the creature's identity and ability alone — shiny swaps stats, not behaviour", () => {
    const normal = resolveCreatureVariant("velocect", 1, false)!;
    const shiny = resolveCreatureVariant("velocect", 1, true)!;
    expect(shiny.id).toBe(normal.id);
    expect(shiny.abilityText).toBe(normal.abilityText);
    expect(shiny.abilityTags).toEqual(normal.abilityTags);
    expect(shiny.rarity).toBe(normal.rarity);
  });
});
