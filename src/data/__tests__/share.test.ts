import { describe, expect, it } from "vitest";
import { InvalidBuildCodeError, buildId, canonicalise, exportBuild, importBuild } from "../share";
import type { TeamConfiguration } from "../types";

const base: TeamConfiguration = {
  selectedRegion: "pantra",
  trainerId: "painter",
  placements: [
    { slot: { row: "front", col: 1 }, creatureId: "miasmaw", level: 2, shiny: true },
    { slot: { row: "back", col: 0 }, creatureId: "cobrex", level: 1,
      modifiers: [{ id: "x1", stat: "damageFlatAdd", amount: 10 }] },
  ],
  trinketIds: ["link_cable", "gold_nugget"],
  itemIds: [],
  paintedCreatureIds: ["mosslug"],
  smuggledCreatureIds: [],
  simulationWindowSeconds: 30,
  teamModifiers: [{ id: "t1", stat: "poisonAmountAdd", amount: 4 }],
};

describe("build export/import", () => {
  it("round-trips losslessly", () => {
    const restored = importBuild(exportBuild(base));
    expect(canonicalise(restored)).toEqual(canonicalise(base));
    expect(restored.placements).toHaveLength(2);
    expect(restored.placements.find((p) => p.creatureId === "miasmaw")!.shiny).toBe(true);
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
        modifiers: p.modifiers?.map((m) => ({ ...m, id: "regenerated" })),
      })),
      trinketIds: ["gold_nugget", "link_cable"],
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
      ["slot", { ...base, placements: base.placements.map((p, i) => (i === 0 ? { ...p, slot: { row: "back" as const, col: 2 } } : p)) }],
      ["creature", { ...base, placements: base.placements.map((p, i) => (i === 0 ? { ...p, creatureId: "drumire" } : p)) }],
      ["region", { ...base, selectedRegion: "jinto" }],
      ["trainer", { ...base, trainerId: "smuggler" }],
      ["trinkets", { ...base, trinketIds: ["link_cable"] }],
      ["painted", { ...base, paintedCreatureIds: [] }],
      ["window", { ...base, simulationWindowSeconds: 20 }],
      ["modifier amount", { ...base, teamModifiers: [{ id: "t1", stat: "poisonAmountAdd", amount: 5 }] }],
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
