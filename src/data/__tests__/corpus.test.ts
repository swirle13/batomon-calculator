import { describe, expect, it } from "vitest";
import { searchCreatures, filterCreatures } from "../corpus";

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
    const results = filterCreatures({ type: "Fire" });
    expect(results.every((c) => c.types.includes("Fire"))).toBe(true);
    expect(results.map((c) => c.id)).toContain("scorchimp");
  });

  it("filters by Rarity", () => {
    const results = filterCreatures({ rarity: "Legendary" });
    expect(results.every((c) => c.rarity === "Legendary")).toBe(true);
    expect(results.map((c) => c.id)).toContain("onsetra");
  });

  it("combines type and rarity filters", () => {
    const results = filterCreatures({ type: "Bug", rarity: "Common" });
    expect(results.map((c) => c.id)).toContain("bumblebolt");
  });
});
