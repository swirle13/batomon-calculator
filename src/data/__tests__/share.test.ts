import { describe, expect, it } from "vitest";
import { InvalidBuildCodeError, buildId, canonicalize, exportBuild, importBuild, readBuildFromUrl } from "../share";
import type { TeamConfiguration } from "../types";

import { syntheticSpecies } from "../ids";
import { DEFAULT_RUN_DAY } from "../enemyHealth";
import { GridRow, ModifierStat, RegionId } from "../enums";
import { Species, TrainerId, TrinketId } from "../ids";

const base: TeamConfiguration = {
  selectedRegion: RegionId.Pantra,
  trainerId: TrainerId.Painter,
  placements: [
    { slot: { row: GridRow.Bottom, col: 1 }, creatureId: Species.Miasmaw, level: 2, shiny: true },
    { slot: { row: GridRow.Top, col: 0 }, creatureId: Species.Cobrex, level: 1,
      modifiers: [{ id: syntheticSpecies("x1"), stat: ModifierStat.DamageFlatAdd, amount: 10 }] },
  ],
  trinketIds: [TrinketId.LinkCable, TrinketId.GoldNugget],
  itemIds: [],
  paintedCreatureIds: [Species.Mosslug],
  smuggledCreatureIds: [],
  simulationWindowSeconds: 30,
  teamModifiers: [{ id: syntheticSpecies("t1"), stat: ModifierStat.PoisonAmountAdd, amount: 4 }],
};

describe("build export/import", () => {
  it("round-trips losslessly", () => {
    const restored = importBuild(exportBuild(base));
    expect(canonicalize(restored)).toEqual(canonicalize(base));
    expect(restored.placements).toHaveLength(2);
    expect(restored.placements.find((p) => p.creatureId === Species.Miasmaw)!.shiny).toBe(true);
    expect(restored.selectedRegion).toBe("pantra");
    expect(restored.trainerId).toBe("painter");
    expect(restored.paintedCreatureIds).toEqual(["mosslug"]);
    expect(restored.teamModifiers![0]!.amount).toBe(4);
  });

  it("the id is stable across representations of the SAME build", () => {
    // Everything here is a different encoding of an identical team: slots in another array order,
    // trinkets listed backwards, an absent optional vs an empty one, and different modifier ids.
    // If any of these changed the id, it would be fingerprinting the editing history, not the team.
    const shuffled: TeamConfiguration = {
      ...base,
      placements: [...base.placements].reverse().map((p) => ({
        ...p,
        modifiers: p.modifiers?.map((m) => ({ ...m, id: syntheticSpecies("regenerated") })),
      })),
      trinketIds: [TrinketId.GoldNugget, TrinketId.LinkCable],
      smuggledCreatureIds: undefined,
    };
    expect(buildId(shuffled)).toBe(buildId(base));
    expect(exportBuild(shuffled)).toBe(exportBuild(base));
  });

  it("the id changes when ANY build-defining field changes", () => {
    const id = buildId(base);
    const variants: [string, TeamConfiguration][] = [
      ["level", { ...base, placements: base.placements.map((p, i) => (i === 0 ? { ...p, level: 3 as const } : p)) }],
      ["shiny", { ...base, placements: base.placements.map((p, i) => (i === 0 ? { ...p, shiny: false } : p)) }],
      ["slot", { ...base, placements: base.placements.map((p, i) => (i === 0 ? { ...p, slot: { row: GridRow.Top as const, col: 2 } } : p)) }],
      ["creature", { ...base, placements: base.placements.map((p, i) => (i === 0 ? { ...p, creatureId: Species.Drumire } : p)) }],
      ["region", { ...base, selectedRegion: RegionId.Jinto }],
      ["trainer", { ...base, trainerId: TrainerId.Smuggler }],
      ["trinkets", { ...base, trinketIds: [TrinketId.LinkCable] }],
      ["painted", { ...base, paintedCreatureIds: [] }],
      ["window", { ...base, simulationWindowSeconds: 20 }],
      ["modifier amount", { ...base, teamModifiers: [{ id: syntheticSpecies("t1"), stat: ModifierStat.PoisonAmountAdd, amount: 5 }] }],
    ];
    for (const [label, variant] of variants) {
      expect(buildId(variant), `${label} did not change the id`).not.toBe(id);
    }
  });

  it("an empty team round-trips and has an id", () => {
    const empty: TeamConfiguration = {
      placements: [], trainerId: null, trinketIds: [], itemIds: [],
      simulationWindowSeconds: 20, teamModifiers: [],
    };
    expect(importBuild(exportBuild(empty)).placements).toEqual([]);
    expect(buildId(empty)).toMatch(/^[0-9a-f]{8}$/);
  });

  it("rejects bad input rather than loading a partial team", () => {
    // A build that silently drops a creature is worse than one that refuses to load: the user
    // would keep working against a team they did not build.
    expect(() => importBuild("not-a-code")).toThrow(InvalidBuildCodeError);
    expect(() => importBuild("bat1:@@@not-base64@@@")).toThrow(InvalidBuildCodeError);
    expect(() => importBuild("bat1:" + btoa('{"v":99}'))).toThrow(/format v99/);
  });

  it("the code is URL- and chat-safe", () => {
    expect(exportBuild(base)).toMatch(/^bat1:[A-Za-z0-9\-_]+$/);
  });
});

describe("sharing by URL", () => {
  it("accepts a pasted URL as readily as a bare code", () => {
    // People paste whichever they were handed; the import field must not care which.
    const code = exportBuild(base);
    const asUrl = `https://example.test/batomon-calculator/?b=${code}`;
    expect(canonicalize(importBuild(asUrl))).toEqual(canonicalize(base));
    expect(canonicalize(importBuild(code))).toEqual(canonicalize(base));
  });

  it("a URL carrying other params still round-trips", () => {
    const code = exportBuild(base);
    const asUrl = `https://example.test/?utm=x&b=${code}&other=1`;
    expect(canonicalize(importBuild(asUrl))).toEqual(canonicalize(base));
  });

  it("a malformed URL still produces a readable error, not a crash", () => {
    expect(() => importBuild("https://example.test/?b=garbage")).toThrow(InvalidBuildCodeError);
    expect(() => importBuild("https://example.test/?nothing=here")).toThrow(InvalidBuildCodeError);
  });

  /**
   * The bench travels with the build (2026-10-08), because the setup work it preserves — levels,
   * shiny, banked modifiers — is exactly what the user did not want to lose.
   */
  describe("the bench", () => {
    const withBench: TeamConfiguration = {
      ...base,
      bench: [
        { index: 1, creatureId: Species.Thorntail, level: 4, shiny: true },
        {
          index: 0,
          creatureId: Species.Mosslug,
          level: 2,
          modifiers: [{ id: syntheticSpecies("b1"), stat: ModifierStat.DamageFlatAdd, amount: 25 }],
        },
      ],
    };

    it("round-trips with its levels, shiny and modifiers intact", () => {
      const restored = importBuild(exportBuild(withBench));
      expect(restored.bench).toHaveLength(2);
      // Sorted by position on the way out, so the order it was built in does not survive and
      // should not: two benches holding the same monsters in the same places are one build.
      expect(restored.bench![0]).toMatchObject({ index: 0, creatureId: Species.Mosslug, level: 2 });
      expect(restored.bench![0]!.modifiers![0]!.amount).toBe(25);
      expect(restored.bench![1]).toMatchObject({ index: 1, creatureId: Species.Thorntail, shiny: true });
    });

    it("changes the build id, because a different bench is a different build", () => {
      expect(buildId(withBench)).not.toBe(buildId(base));
    });

    /*
     * The compatibility guarantee that let `FORMAT_VERSION` stay at 1. Every team saved before
     * the bench existed has to keep its fingerprint, or the library's duplicate warning and its
     * per-build caches would all miss on data nobody touched.
     */
    it("leaves a benchless build's id exactly where it was", () => {
      expect(buildId({ ...base, bench: [] })).toBe(buildId(base));
      expect(buildId({ ...base, bench: undefined })).toBe(buildId(base));
      expect(canonicalize(base)).not.toHaveProperty("bench");
    });

    it("reads a code that predates the bench as having an empty one, not an unknown one", () => {
      expect(importBuild(exportBuild(base)).bench).toEqual([]);
    });
  });

  /**
   * 2026-10-08, user-reported: "I keep having to set that value back to day 7 every time I save."
   *
   * The run day is the first field that is build CONTEXT rather than build CONTENT, so it is the
   * first to travel in the code while staying out of the fingerprint. Both halves are load-bearing
   * and both are pinned here.
   */
  describe("the run day", () => {
    const day7: TeamConfiguration = { ...base, runDay: 7 };

    it("survives a round trip, which is the whole point", () => {
      expect(importBuild(exportBuild(day7)).runDay).toBe(7);
    });

    it("does NOT change the build id — the same board on two days is one board", () => {
      /*
       * If the day were hashed, advancing from day 7 to day 8 would make the library stop
       * recognising the board you saved yesterday: the duplicate warning would clear and Save
       * would offer to store a second copy of a team you already have.
       */
      expect(buildId(day7)).toBe(buildId(base));
      expect(canonicalize(day7)).not.toHaveProperty("day");
    });

    it("leaves the code of a build on the default day byte-identical", () => {
      // The compatibility guarantee that let `FORMAT_VERSION` stay at 1, same as the bench's.
      expect(exportBuild({ ...base, runDay: DEFAULT_RUN_DAY })).toBe(exportBuild(base));
      expect(exportBuild({ ...base, runDay: undefined })).toBe(exportBuild(base));
    });

    it("reads a code that predates the field as day 1, not as unknown", () => {
      expect(importBuild(exportBuild(base)).runDay).toBe(DEFAULT_RUN_DAY);
    });

    it("produces a different CODE for a different day, even at the same id", () => {
      // The id and the code answer different questions, and this is the one case where they
      // visibly disagree. Worth stating as a property rather than leaving it to be inferred.
      expect(exportBuild(day7)).not.toBe(exportBuild(base));
      expect(buildId(day7)).toBe(buildId(base));
    });
  });

  /**
   * Locked placements (2026-10-09). Same bargain as the run day above: carried by the code because
   * the library saves and loads builds as codes, left out of the fingerprint because a padlock
   * changes nothing the engine computes.
   */
  describe("locked placements", () => {
    const pinned: TeamConfiguration = {
      ...base,
      placements: base.placements.map((p) => (p.creatureId === Species.Cobrex ? { ...p, locked: true } : p)),
    };

    it("survives a round trip, on the right placement", () => {
      const restored = importBuild(exportBuild(pinned));
      expect(restored.placements.find((p) => p.creatureId === Species.Cobrex)!.locked).toBe(true);
      expect(restored.placements.find((p) => p.creatureId === Species.Miasmaw)!.locked).toBeUndefined();
    });

    it("does NOT change the build id — a padlock is not a different team", () => {
      expect(buildId(pinned)).toBe(buildId(base));
      expect(canonicalize(pinned)).not.toHaveProperty("locked");
    });

    it("leaves the code of a build with no locks byte-identical", () => {
      // The compatibility guarantee that let `FORMAT_VERSION` stay at 1, same as the bench's.
      expect(exportBuild({ ...base, placements: base.placements.map((p) => ({ ...p, locked: false })) })).toBe(
        exportBuild(base),
      );
    });

    it("reads a code that predates the field as nothing locked", () => {
      expect(importBuild(exportBuild(base)).placements.every((p) => p.locked === undefined)).toBe(true);
    });

    it("produces a different CODE, even at the same id", () => {
      expect(exportBuild(pinned)).not.toBe(exportBuild(base));
      expect(buildId(pinned)).toBe(buildId(base));
    });
  });

  it("readBuildFromUrl returns null for a bad link rather than throwing", () => {
    // A bad LINK should leave a usable empty builder; a bad PASTE throws, because there the user is
    // waiting on a specific action and silence would look like the button is broken.
    expect(readBuildFromUrl("?b=garbage")).toBeNull();
    expect(readBuildFromUrl("")).toBeNull();
    expect(readBuildFromUrl(`?b=${exportBuild(base)}`)).not.toBeNull();
  });
});
