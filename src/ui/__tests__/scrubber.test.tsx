import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TotalDps } from "../TeamSummary/TotalDps";
import { simulate } from "../../engine/simulate";
import { allCreatureRecords, corpus } from "../../data/corpus";
import { hasAbilityText } from "../../data/display";
import { MAX_PROJECTED_DAY, MAX_RECORDED_DAY } from "../../data/enemyHealth";
import type { SimulationResult, TeamConfiguration } from "../../data/types";
import { GridRow } from "../../data/enums";
import { Species } from "../../data/ids";

/**
 * Supplies the day state `CalculatorView` now owns.
 *
 * The selector became controlled when the cumulative chart started drawing the same day's HP as a
 * threshold — one piece of state, two readers. Changing the select is still the gesture under
 * test, so the harness holds the value rather than the tests asserting on a spy.
 */
function TotalDpsHarness({
  config,
  result,
}: {
  config: TeamConfiguration;
  result: SimulationResult;
}) {
  const [day, setDay] = useState(1);
  return <TotalDps config={config} result={result} day={day} onDayChange={setDay} />;
}

const team: TeamConfiguration = {
  placements: [{ slot: { row: GridRow.Back, col: 0 }, creatureId: Species.Bumblebolt, level: 1 }],
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
    // t=0 is now a real sample (item 4): at the instant the battle starts nothing has cast, so the
    // rate genuinely is zero. It was previously unreachable on the scrubber.
    expect(series[0]).toEqual({ tSeconds: 0, dps: 0 });
    expect(series[1]!.tSeconds).toBe(0.5);
  });

  it("shows the scrubbed reading AND the average at once", () => {
    // Both are always visible (item 4), so comparing "right now" against "the whole fight" needs no
    // toggling — and the "Whole window" button is gone, since "window" was never defined for users.
    const result = simulate(team, corpus);
    render(<TotalDpsHarness config={team} result={result} />);
    expect(screen.getByText("DPS average")).toBeTruthy();
    expect(screen.getByText("DPS at t=0s")).toBeTruthy();
    expect(screen.queryByText("Whole window")).toBeNull();
  });
});

describe("placeholder ability text never reaches the UI (2026-10-06)", () => {
  it("treats an empty text and the retired placeholder strings as absent", () => {
    expect(hasAbilityText("")).toBe(false);
    expect(hasAbilityText("   ")).toBe(false);
    expect(hasAbilityText(undefined)).toBe(false);
    // The corpus no longer stores either phrasing, but the predicate keeps rejecting them so a
    // reverted record or a new source transcribed the old way cannot render as an ability.
    expect(hasAbilityText("No ability text shown")).toBe(false);
    expect(hasAbilityText("No ability text transcribed in sources reviewed.")).toBe(false);
    expect(hasAbilityText("Deals 3 direct damage every 2.5 seconds.")).toBe(true);
  });

  it("GUARD: no record ships unresolved template syntax as ability text", () => {
    /*
     * Added 2026-10-07 (research.md R7.1). `purpleegg` shipped "Hatches a level 2 {monster_name} in
     * {amount} day(s)." to the card -- literal substitution tokens from the extracted database,
     * rendered to the user as though they were the ability.
     *
     * The guard below catches placeholder PROSE ("unknown", "n/a"); it could not see template
     * syntax, which is a different shape of the same mistake. Both are checked now.
     */
    const templated = allCreatureRecords()
      .filter((c) => /\{[a-z_]+\}|%[sd]\b|\$\{/i.test(c.abilityText ?? ""))
      .map((c) => `${c.id} L${c.level}: ${c.abilityText}`);
    expect(templated).toEqual([]);
  });

  it("GUARD: the corpus spells 'no ability' as an empty string, never as prose", () => {
    // Prose placeholders are indistinguishable from real abilities to anything but this predicate,
    // so a newly-introduced phrasing would silently render as an ability called e.g. "Unknown".
    const prose = allCreatureRecords()
      .map((c) => ({ id: c.id, text: c.abilityText ?? "" }))
      .filter((c) => /^(no ability|none|unknown|n\/a|not transcribed|tbd)/i.test(c.text.trim()));
    expect(prose, `placeholder prose in corpus: ${prose.map((c) => c.id).join(", ")}`).toEqual([]);
  });
});

describe("TTK figure (2026-10-07)", () => {
  const poisonTeam: TeamConfiguration = {
    placements: [
      { slot: { row: GridRow.Back, col: 0 }, creatureId: Species.Venopuff, level: 1 },
      { slot: { row: GridRow.Back, col: 1 }, creatureId: Species.Magmite, level: 1 },
    ],
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: 30,
    teamModifiers: [],
  };

  it("defaults to day 1 and shows a time", () => {
    const result = simulate(poisonTeam, corpus);
    render(<TotalDpsHarness config={poisonTeam} result={result} />);
    expect(screen.getByLabelText("Day to compute time-to-kill against")).toHaveProperty("value", "1");
    expect(screen.getByText(/TTK on day/)).toBeTruthy();
  });

  it("offers every day the module can produce a figure for, marking the projected ones", () => {
    // Bounded by `MAX_PROJECTED_DAY`, not by the recording: runs go past day 19, and a fitted
    // power law reproduces days 9-19 within 2.9%, so refusing to offer day 20 withholds a usable
    // answer. The "(est.)" suffix is what keeps the offer honest — see `enemyHealth.ts`.
    const result = simulate(poisonTeam, corpus);
    render(<TotalDpsHarness config={poisonTeam} result={result} />);
    const select = screen.getByLabelText("Day to compute time-to-kill against") as HTMLSelectElement;
    expect(select.options.length).toBe(MAX_PROJECTED_DAY);
    expect(select.options[MAX_RECORDED_DAY - 1]!.textContent).toBe(String(MAX_RECORDED_DAY));
    expect(select.options[MAX_RECORDED_DAY]!.textContent).toBe(`${MAX_RECORDED_DAY + 1} (est.)`);
    expect(select.options[MAX_PROJECTED_DAY - 1]!.value).toBe(String(MAX_PROJECTED_DAY));
  });

  it("answers past the simulation window instead of reporting the window back", () => {
    /*
     * This used to assert ">30s" for day 10 — the window, not the board. The pair DOES kill day
     * 10, at 174s, and the old figure could not say so because it only read the 30s series. Worse,
     * it moved with the window, so two builds compared at different windows were not comparable.
     */
    const result = simulate(poisonTeam, corpus);
    const { container } = render(<TotalDpsHarness config={poisonTeam} result={result} />);
    fireEvent.change(screen.getByLabelText("Day to compute time-to-kill against"), {
      target: { value: "10" },
    });
    expect(container.textContent).not.toContain(">30s");
    expect(container.textContent).toContain("2m 54s");
  });

  it("shows the search limit, not the window, for a board that never gets there", () => {
    // "Not within an hour" is a real answer and reads differently from missing data. One Magmite
    // is the board that earns it: the Venopuff pair above clears even day 25, at 17 minutes.
    const trickle: TeamConfiguration = {
      ...poisonTeam,
      placements: [{ slot: { row: GridRow.Back, col: 0 }, creatureId: Species.Magmite, level: 1 }],
    };
    const { container } = render(
      <TotalDpsHarness config={trickle} result={simulate(trickle, corpus)} />,
    );
    fireEvent.change(screen.getByLabelText("Day to compute time-to-kill against"), {
      target: { value: "19" },
    });
    expect(container.textContent).toContain(">60m");
  });
});
