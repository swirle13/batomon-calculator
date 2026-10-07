import { describe, expect, it } from "vitest";
import { simulate } from "../simulate";
import type { Corpus, CreatureRecord, TeamConfiguration } from "../../data/types";

/**
 * T224: per-cast ACCUMULATING buffs (research.md L5).
 *
 * The distinction this pins is the whole point of the family. "+10 Damage for this battle" on an
 * On Cast trigger is not a one-off: it fires on every cast, so output grows as the fight goes on.
 * A static reading would be right about the first cast and increasingly wrong after it.
 */
const base: Omit<CreatureRecord, "id" | "name"> = {
  rarity: "Common",
  types: ["Fire"],
  level: 1,
  shopCost: 10,
  baseCooldownSeconds: 1,
  baseDamage: 10,
  damageType: "Direct",
  baseMulticast: 1,
  abilityText: "+10 Damage for this battle.",
  abilityTrigger: "On Cast",
  abilityTags: [
    { kind: "buffOnCast", target: { kind: "self" }, effect: { statChange: { stat: "damage", amount: 10 } } },
  ],
  sourceRefs: [],
  patch: "test",
};

const grower: CreatureRecord = { ...base, id: "grower", name: "Grower" };
const flat: CreatureRecord = { ...base, id: "flat", name: "Flat", abilityTags: [], abilityText: "test fixture" };
const testCorpus: Corpus = { creatures: [grower, flat], trainers: [], trinkets: [], items: [] };

const team = (creatureId: string, windowSeconds: number): TeamConfiguration => ({
  placements: [{ slot: { row: "back", col: 0 }, creatureId, level: 1 }],
  trainerId: null,
  trinketIds: [],
  itemIds: [],
  simulationWindowSeconds: windowSeconds,
  teamModifiers: [],
});

describe("buffOnCast (T224)", () => {
  it("the FIRST cast is unbuffed — a cast does not buff itself", () => {
    // FR-040 snapshot semantics: the grant lands after the instant it was granted in. Applying it
    // inline would make the buff appear one cast early and overstate the whole family.
    const r = simulate(team("grower", 1), testCorpus);
    const attacks = r.timeline.filter((e) => e.kind === "attack" && e.damage !== undefined);
    expect(attacks).toHaveLength(1);
    expect(attacks[0]!.damage).toBe(10);
  });

  it("each later cast adds another +10: 10, 20, 30, 40", () => {
    const r = simulate(team("grower", 4), testCorpus);
    const damages = r.timeline
      .filter((e) => e.kind === "attack" && e.damage !== undefined)
      .map((e) => e.damage);
    expect(damages).toEqual([10, 20, 30, 40]);
  });

  it("an identical creature WITHOUT the tag stays flat, so growth is the tag's doing", () => {
    const r = simulate(team("flat", 4), testCorpus);
    const damages = r.timeline
      .filter((e) => e.kind === "attack" && e.damage !== undefined)
      .map((e) => e.damage);
    expect(damages).toEqual([10, 10, 10, 10]);
  });

  it("total output is superlinear in the window, which is what makes this family matter", () => {
    // 4s: 10+20+30+40 = 100. 8s: 10+...+80 = 360. Doubling the window near-quadruples the damage.
    const short = simulate(team("grower", 4), testCorpus);
    const long = simulate(team("grower", 8), testCorpus);
    const total = (r: typeof short) =>
      r.timeline.filter((e) => e.kind === "attack").reduce((s, e) => s + (e.damage ?? 0), 0);
    expect(total(short)).toBe(100);
    expect(total(long)).toBe(360);
  });
});
