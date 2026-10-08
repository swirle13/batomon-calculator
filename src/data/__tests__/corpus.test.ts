import { describe, expect, it } from "vitest";
import { searchCreatures, filterCreatures } from "../corpus";
import { CreatureType, Rarity } from "../enums";

describe("searchCreatures", () => {
  it("matches by case-insensitive name substring", () => {
    const results = searchCreatures("bumble");
    expect(results.map((c) => c.id)).toContain("bumblebolt");
  });

  it("returns an empty array for no match", () => {
    expect(searchCreatures("zzz-not-a-creature")).toEqual([]);
  });
});

describe("filterCreatures", () => {
  it("filters by CreatureType", () => {
    const results = filterCreatures({ type: CreatureType.Fire });
    // 2026-10-06 (T230/FR-086): a creature typed "All" matches EVERY filter, so Omnichrome is a
    // legitimate result here. This assertion previously read `c.types.includes("Fire")`, which
    // encoded the old bug: the one creature in the game that is every type matched no type filter
    // at all, because `["All"].includes("Fire")` is false.
    expect(results.every((c) => c.types.includes(CreatureType.Fire) || c.types.includes(CreatureType.All))).toBe(true);
    expect(results.some((c) => c.types.includes(CreatureType.All))).toBe(true);
    expect(results.map((c) => c.id)).toContain("scorchimp");
  });

  it("filters by Rarity", () => {
    const results = filterCreatures({ rarity: Rarity.Legendary });
    expect(results.every((c) => c.rarity === Rarity.Legendary)).toBe(true);
    expect(results.map((c) => c.id)).toContain("onsetra");
  });

  it("combines type and rarity filters", () => {
    const results = filterCreatures({ type: CreatureType.Bug, rarity: Rarity.Common });
    expect(results.map((c) => c.id)).toContain("bumblebolt");
  });
});
