import { describe, expect, it } from "vitest";
import { analyzePositionalCoverage, suggestPlacement, scoreConfiguration } from "../optimize";
import { corpus } from "../../data/corpus";
import type { TeamConfiguration } from "../../data/types";
import { GridRow } from "../../data/enums";

/**
 * FR-069 (WI-018). The optimiser is only honest if it is clear about what it cannot see, so the
 * coverage reporting is tested as carefully as the search.
 */
describe("placement optimiser (FR-069)", () => {
  /** Formiqueen buffs ADJACENT Common allies. Bumblebolt is Common, so adjacency matters here. */
  const adjacent: TeamConfiguration = {
    placements: [
      { slot: { row: GridRow.Back, col: 0 }, creatureId: "formiqueen", level: 1 },
      { slot: { row: GridRow.Back, col: 1 }, creatureId: "bumblebolt", level: 1 },
    ],
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: 20,
  };

  it("weights earlier damage more heavily than later damage", () => {
    // The user's requirement: raw totals over-reward a slow ramp that may arrive after death.
    const early = scoreConfiguration(
      { ...adjacent, placements: [{ slot: { row: GridRow.Back, col: 0 }, creatureId: "bumblebolt", level: 1 }] },
      corpus,
    );
    const rawTotal = 3 * 8; // Bumblebolt: 3 damage x 8 casts in 20s
    expect(early).toBeLessThan(rawTotal);
    expect(early).toBeGreaterThan(0);
  });

  it("reports positional coverage distinguishing 'has a tag' from 'engine can act on it'", () => {
    // This distinction is the whole point. Onsetra carries a `behind` tag that simulate() ignores,
    // so counting tags would reassure the user about a creature the optimiser cannot reason about.
    const withOnsetra: TeamConfiguration = {
      ...adjacent,
      placements: [
        { slot: { row: GridRow.Back, col: 0 }, creatureId: "formiqueen", level: 1 },
        { slot: { row: GridRow.Back, col: 1 }, creatureId: "onsetra", level: 1 },
      ],
    };
    const coverage = analyzePositionalCoverage(withOnsetra, corpus);
    expect(coverage.withPositionalTag).toContain("Onsetra");
    expect(coverage.withPositionalTag).toContain("Formiqueen");
    // 2026-10-06 round 10 (T219): Onsetra's `behind` grant WAS inert and is now resolved by the
    // general selector-based resolver, so it joins `actionable`. This assertion previously read
    // `["Formiqueen"]`; the change is the point of the round, not a regression.
    //
    // The two lists still differ in general -- `withPositionalTag` is "the data records something
    // positional", `actionable` is "the engine computes it" -- and that gap is what the coverage
    // note in the UI reports. Keeping them separate is what stops a working resolver from implying
    // full coverage.
    expect(coverage.actionable).toEqual(["Formiqueen", "Onsetra"]);
  });

  it("flags selected trinkets whose positional effect the engine cannot model", () => {
    const withLinkCable: TeamConfiguration = { ...adjacent, trinketIds: ["link_cable"] };
    const coverage = analyzePositionalCoverage(withLinkCable, corpus);
    // Link Cable makes every monster adjacent, which would invalidate the one interaction the
    // optimiser CAN see -- so a result computed while it is selected must be caveated.
    expect(coverage.unmodelledTrinkets).toContain("Link Cable");
  });

  it("searches every arrangement and never claims an improvement it did not find", () => {
    const result = suggestPlacement(adjacent, corpus);
    expect(result.evaluated).toBeGreaterThan(0);
    expect(result.bestScore).toBeGreaterThanOrEqual(result.currentScore);
    // An honest null: when nothing beats the current layout, `placements` is null rather than a
    // cosmetic reshuffle presented as an upgrade.
    if (result.placements === null) expect(result.bestScore).toBeCloseTo(result.currentScore, 9);
  });

  it("is a no-op for a team too small to rearrange", () => {
    const solo: TeamConfiguration = {
      ...adjacent,
      placements: [{ slot: { row: GridRow.Back, col: 0 }, creatureId: "bumblebolt", level: 1 }],
    };
    expect(suggestPlacement(solo, corpus).placements).toBeNull();
  });
});
