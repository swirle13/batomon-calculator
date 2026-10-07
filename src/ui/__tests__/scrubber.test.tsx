import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TotalDps } from "../TeamSummary/TotalDps";
import { simulate } from "../../engine/simulate";
import { corpus } from "../../data/corpus";
import { hasAbilityText } from "../../data/display";
import type { TeamConfiguration } from "../../data/types";

const team: TeamConfiguration = {
  placements: [{ slot: { row: "back", col: 0 }, creatureId: "bumblebolt", level: 1 }],
  trainerId: null,
  trinketIds: [],
  itemIds: [],
  simulationWindowSeconds: 10,
  teamModifiers: [],
};

describe("DPS scrubber indexes the series, not seconds (2026-10-06)", () => {
  it("every slider position maps to a real sample", () => {
    // The bug: the slider ran 0..length in steps of 1 while looking up `tSeconds === value`. That
    // held only while the series was 1-second spaced. At 0.5s spacing, index 0 and every index past
    // the window length matched NOTHING, fell through to the window average, and rendered it under
    // a label reading "at t = Ns" — so the figure looked implausibly high at t=0.
    const series = simulate(team, corpus).dpsRateSeries;
    expect(series.length).toBeGreaterThan(0);
    for (let i = 0; i <= series.length - 1; i++) {
      expect(series[i], `slider index ${i} has no sample`).toBeDefined();
    }
    // The old lookup is the thing that failed: no sample sits at t=0.
    expect(series.find((p) => p.tSeconds === 0)).toBeUndefined();
    expect(series[0]!.tSeconds).toBe(0.5);
  });

  it("at rest the caption says average, not a time", () => {
    const result = simulate(team, corpus);
    render(<TotalDps config={team} result={result} />);
    expect(screen.getByText("DPS average")).toBeTruthy();
  });
});

describe("placeholder ability text never reaches the UI (2026-10-06)", () => {
  it("treats both corpus placeholder strings as absent", () => {
    expect(hasAbilityText("No ability text shown")).toBe(false);
    expect(hasAbilityText("No ability text transcribed in sources reviewed.")).toBe(false);
    expect(hasAbilityText("   ")).toBe(false);
    expect(hasAbilityText(undefined)).toBe(false);
    expect(hasAbilityText("Deals 3 direct damage every 2.5 seconds.")).toBe(true);
  });

  it("GUARD: the corpus still uses only the placeholder strings this predicate knows", () => {
    // If a third placeholder phrasing is ever introduced, it would silently render as an ability.
    const placeholders = new Set(
      corpus.creatures
        .map((c) => c.abilityText ?? "")
        .filter((t) => /no ability text/i.test(t)),
    );
    expect(placeholders.size).toBeGreaterThan(0);
    for (const p of placeholders) {
      expect(hasAbilityText(p), `unrecognised placeholder: ${p}`).toBe(false);
    }
  });
});
