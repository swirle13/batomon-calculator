import { describe, expect, it } from "vitest";
import { InvalidBuildCodeError, buildId, canonicalize, exportBuild, importBuild, readBuildFromUrl } from "../share";
import type { TeamConfiguration } from "../types";

import { syntheticSpecies } from "../ids";
import { GridRow, ModifierStat, RegionId } from "../enums";
import { Species, TrainerId, TrinketId } from "../ids";

const base: TeamConfiguration = {
  selectedRegion: RegionId.Pantra,
  trainerId: TrainerId.Painter,
  placements: [
    { slot: { row: GridRow.Front, col: 1 }, creatureId: Species.Miasmaw, level: 2, shiny: true },
    { slot: { row: GridRow.Back, col: 0 }, creatureId: Species.Cobrex, level: 1,
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
      ["slot", { ...base, placements: base.placements.map((p, i) => (i === 0 ? { ...p, slot: { row: GridRow.Back as const, col: 2 } } : p)) }],
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

  it("readBuildFromUrl returns null for a bad link rather than throwing", () => {
    // A bad LINK should leave a usable empty builder; a bad PASTE throws, because there the user is
    // waiting on a specific action and silence would look like the button is broken.
    expect(readBuildFromUrl("?b=garbage")).toBeNull();
    expect(readBuildFromUrl("")).toBeNull();
    expect(readBuildFromUrl(`?b=${exportBuild(base)}`)).not.toBeNull();
  });
});
