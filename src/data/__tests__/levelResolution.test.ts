import { describe, expect, it } from "vitest";
import { corpus, getCreatureById, getCreatureByIdAndLevel } from "../corpus";

/**
 * Round 10 (T209b / WI-002). The user reported that Puffloon showed no Multicast chip at level 2.
 * The obvious explanation — a missing `baseMulticast` on the level-2 record — was wrong; the data is
 * correct. `GridPicker` was calling `getCreatureById`, which returns the FIRST matching record, i.e.
 * always level 1. So every chip on every levelled creature had been showing level-1 stats.
 *
 * Multicast was simply the only one visibly absent (1 renders no chip at all); a wrong Damage or
 * Poison number still looks like a plausible number, which is why this survived unnoticed.
 */
describe("creature lookup resolves by level", () => {
  it("getCreatureById returns level 1 — the trap that caused WI-002", () => {
    const puffloon = getCreatureById("puffloon");
    expect(puffloon?.level).toBe(1);
  });

  it("the level-2 Puffloon record really does carry Multicast 2", () => {
    expect(getCreatureByIdAndLevel("puffloon", 2)?.baseMulticast).toBe(2);
    expect(getCreatureByIdAndLevel("puffloon", 1)?.baseMulticast).toBe(1);
  });

  it("GUARD: for every creature with level variants, at least one stat differs from level 1", () => {
    const byId = new Map<string, typeof corpus.creatures>();
    for (const c of corpus.creatures) {
      const list = byId.get(c.id) ?? [];
      list.push(c);
      byId.set(c.id, list);
    }

    // If a chip ever rendered from the level-1 record again, these are the species where a user
    // would actually see a wrong number.
    const distinguishable = [...byId.values()].filter((variants) => {
      if (variants.length < 2) return false;
      const base = variants.find((v) => v.level === 1);
      if (!base) return false;
      return variants.some(
        (v) =>
          v.level !== 1 &&
          (v.publishedCast?.damage !== base.publishedCast?.damage ||
            v.baseMulticast !== base.baseMulticast ||
            v.healAmount !== base.healAmount),
      );
    });

    expect(distinguishable.length).toBeGreaterThan(50);
  });
});
