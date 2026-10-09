import { describe, expect, it } from "vitest";
import { allCreatureRecords, getCreatureByIdAndLevel } from "../corpus";
import { CREATURE_REGIONS, REGION_UNSOURCED } from "../regions";
import { creatureHasType, isChefAffected, isInOppositeRegion, isOutOfRegion, isPainted, isSingleTyped } from "../typing";
import { CreatureType, RegionId } from "../enums";
import { Species, TrainerId } from "../ids";

/** Round 4 orchestration: painting, the "All" type, and region membership. */
describe("type matching (T230 / FR-086)", () => {
  const omnichrome = getCreatureByIdAndLevel(Species.Omnichrome, 1)!;
  const bumblebolt = getCreatureByIdAndLevel(Species.Bumblebolt, 1)!;

  it("a natively-'All' creature matches every type — the pre-existing bug this fixes", () => {
    // Before the single predicate, every call site did `types.includes(t)`, and
    // `["All"].includes("Fire")` is false. The one creature in the game that is every type was
    // matched by no type-based ability at all.
    expect(omnichrome.types).toEqual([CreatureType.All]);
    for (const t of [CreatureType.Fire, CreatureType.Grass, CreatureType.Flying, CreatureType.Rock]) {
      expect(creatureHasType(omnichrome, t), `All should match ${t}`).toBe(true);
    }
  });

  it("a painted species matches every type; the same species unpainted does not", () => {
    const painted = { paintedCreatureIds: [Species.Bumblebolt] };
    expect(creatureHasType(bumblebolt, CreatureType.Fire, painted)).toBe(true);
    expect(creatureHasType(bumblebolt, CreatureType.Fire, { paintedCreatureIds: [] })).toBe(false);
    // Its real typing still matches either way.
    expect(creatureHasType(bumblebolt, CreatureType.Electric, { paintedCreatureIds: [] })).toBe(true);
  });

  it("painting is by SPECIES, so it is not slot- or level-dependent", () => {
    const cfg = { paintedCreatureIds: [Species.Bumblebolt] };
    for (const c of allCreatureRecords().filter((x) => x.id === Species.Bumblebolt)) {
      expect(isPainted(c.id, cfg)).toBe(true);
      expect(creatureHasType(c, CreatureType.Rock, cfg)).toBe(true);
    }
  });
});

/**
 * Chef (2026-10-08, user-reported: the ability "doesn't actually apply to any mons"). Its typing
 * half has to go through the same predicate painting does, or a Chef-Fire monster is Fire for some
 * effects and not others.
 */
describe("Chef's Fire typing", () => {
  const pebbler = getCreatureByIdAndLevel(Species.Pebbler, 1)!; // Rock — single-typed
  const magmite = getCreatureByIdAndLevel(Species.Magmite, 1)!; // Fire/Rock — dual, already Fire
  const bumblebolt = getCreatureByIdAndLevel(Species.Bumblebolt, 1)!; // Bug/Electric — dual, not Fire
  const omnichrome = getCreatureByIdAndLevel(Species.Omnichrome, 1)!;
  const chef = { trainerId: TrainerId.Chef };

  it("grants Fire to a single-typed monster, and only while Chef is the trainer", () => {
    expect(creatureHasType(pebbler, CreatureType.Fire, chef)).toBe(true);
    expect(creatureHasType(pebbler, CreatureType.Fire, { trainerId: null })).toBe(false);
    // Its own typing is untouched — this is a gain, not a replacement.
    expect(creatureHasType(pebbler, CreatureType.Rock, chef)).toBe(true);
  });

  it("does not grant Fire to a dual-typed monster", () => {
    expect(creatureHasType(bumblebolt, CreatureType.Fire, chef), "Bug/Electric").toBe(false);
  });

  it("affects the single-typed and the already-Fire, and nobody else", () => {
    expect(isChefAffected(pebbler, chef), "gains Fire").toBe(true);
    expect(isChefAffected(magmite, chef), "dual-typed but Fire, so it gets the Burn").toBe(true);
    expect(isChefAffected(bumblebolt, chef), "dual-typed and not Fire").toBe(false);
    expect(isChefAffected(pebbler, { trainerId: TrainerId.Painter })).toBe(false);
  });

  it("counts a wildcard-typed monster as every type rather than as single-typed", () => {
    // `types: ["All"]` has length 1, so a naive count would call Omnichrome single-typed. It is
    // the opposite — it is already every type, Fire included.
    expect(isSingleTyped(omnichrome)).toBe(false);
    expect(isChefAffected(omnichrome, chef), "already Fire").toBe(true);
  });
});

describe("regions (T229 / FR-087, FR-088)", () => {
  it("the two regions do NOT partition the corpus", () => {
    const counts = { both: 0, neither: 0, one: 0 };
    for (const regions of Object.values(CREATURE_REGIONS)) {
      if (regions.length === 0) counts.neither++;
      else if (regions.length > 1) counts.both++;
      else counts.one++;
    }
    // 14 in both, 13 in neither. This is why "opposite" cannot be a set complement.
    expect(counts.both).toBe(14);
    expect(counts.neither).toBe(13);
  });

  it("'opposite region' excludes dual-region and region-less species", () => {
    const dual = (Object.entries(CREATURE_REGIONS) as [Species, RegionId[]][]).find(([, r]) => r.length > 1)![0];
    const none = (Object.entries(CREATURE_REGIONS) as [Species, RegionId[]][]).find(([, r]) => r.length === 0)![0];
    const jintoOnly = (Object.entries(CREATURE_REGIONS) as [Species, RegionId[]][]).find(([, r]) => r.length === 1 && r[0] === RegionId.Jinto)![0];

    // From Pantra, only a Jinto-exclusive species is "the other region".
    expect(isInOppositeRegion(jintoOnly, RegionId.Pantra)).toBe(true);
    expect(isInOppositeRegion(dual, RegionId.Pantra), "dual-region is already yours").toBe(false);
    expect(isInOppositeRegion(none, RegionId.Pantra), "region-less was never regional stock").toBe(false);
  });

  it("marks out-of-region species without ever hiding them", () => {
    // This was a FILTER until 2026-10-07, which made creatures the Travelling Merchant event can
    // put on your team unselectable — the tool could not represent a board the player was looking
    // at. It is now a marker, so nothing is unreachable.
    const jintoOnly = (Object.entries(CREATURE_REGIONS) as [Species, RegionId[]][]).find(([, r]) => r.length === 1 && r[0] === RegionId.Jinto)![0];
    const none = (Object.entries(CREATURE_REGIONS) as [Species, RegionId[]][]).find(([, r]) => r.length === 0)![0];

    expect(isOutOfRegion(jintoOnly, { selectedRegion: RegionId.Pantra })).toBe(true);
    // Smuggled in deliberately, so not foreign.
    expect(isOutOfRegion(jintoOnly, { selectedRegion: RegionId.Pantra, smuggledCreatureIds: [jintoOnly] })).toBe(false);
    // Events and fossils were never regional stock.
    expect(isOutOfRegion(none, { selectedRegion: RegionId.Pantra })).toBe(false);
    // Nothing is foreign before a region is chosen.
    expect(isOutOfRegion(jintoOnly, {})).toBe(false);
  });

  it("species missing from the source are tracked separately from species with no region", () => {
    // research.md M6 says explicitly these must not be conflated: "in neither set" is a fact about
    // the creature; "absent from the payload" is a gap in our data.
    expect(REGION_UNSOURCED.length).toBe(10);
    for (const id of REGION_UNSOURCED) expect(CREATURE_REGIONS[id as Species]).toBeUndefined();
  });
});
