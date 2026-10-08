import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TotalDps } from "../TeamSummary/TotalDps";
import { simulate } from "../../engine/simulate";
import { corpus } from "../../data/corpus";
import { hasAbilityText } from "../../data/display";
import { MAX_RECORDED_DAY } from "../../data/enemyHealth";
import type { TeamConfiguration } from "../../data/types";
import { GridRow } from "../../data/enums";

const team: TeamConfiguration = {
  placements: [{ slot: { row: GridRow.Back, col: 0 }, creatureId: "bumblebolt", level: 1 }],
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
    render(<TotalDps config={team} result={result} />);
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

  it("GUARD: the corpus spells 'no ability' as an empty string, never as prose", () => {
    // Prose placeholders are indistinguishable from real abilities to anything but this predicate,
    // so a newly-introduced phrasing would silently render as an ability called e.g. "Unknown".
    const prose = corpus.creatures
      .map((c) => ({ id: c.id, text: c.abilityText ?? "" }))
      .filter((c) => /^(no ability|none|unknown|n\/a|not transcribed|tbd)/i.test(c.text.trim()));
    expect(prose, `placeholder prose in corpus: ${prose.map((c) => c.id).join(", ")}`).toEqual([]);
  });
});

describe("TTK figure (2026-10-07)", () => {
  const poisonTeam: TeamConfiguration = {
    placements: [
      { slot: { row: GridRow.Back, col: 0 }, creatureId: "venopuff", level: 1 },
      { slot: { row: GridRow.Back, col: 1 }, creatureId: "magmite", level: 1 },
    ],
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: 30,
    teamModifiers: [],
  };

  it("defaults to day 1 and shows a time", () => {
    const result = simulate(poisonTeam, corpus);
    render(<TotalDps config={poisonTeam} result={result} />);
    expect(screen.getByLabelText("Day to compute time-to-kill against")).toHaveProperty("value", "1");
    expect(screen.getByText(/TTK on day/)).toBeTruthy();
  });

  it("offers every day the HP table actually has", () => {
    // Bounded by the data rather than an arbitrary range: offering day 25 would imply we know its
    // HP, and `enemyHpForDay` deliberately returns null past the recording.
    const result = simulate(poisonTeam, corpus);
    render(<TotalDps config={poisonTeam} result={result} />);
    const select = screen.getByLabelText("Day to compute time-to-kill against") as HTMLSelectElement;
    expect(select.options.length).toBe(MAX_RECORDED_DAY);
    expect(select.options[MAX_RECORDED_DAY - 1]!.value).toBe(String(MAX_RECORDED_DAY));
  });

  it("renders '>window' rather than a dash when the team cannot finish in time", () => {
    // A late day this pair cannot clear. "Not within this window" is a real answer and reads
    // differently from missing data.
    const result = simulate(poisonTeam, corpus);
    const { container } = render(<TotalDps config={poisonTeam} result={result} />);
    fireEvent.change(screen.getByLabelText("Day to compute time-to-kill against"), {
      target: { value: "10" },
    });
    expect(container.textContent).toContain(">30s");
  });
});
