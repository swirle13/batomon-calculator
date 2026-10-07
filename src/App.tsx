import { useMemo, useState } from "react";
import { TeamConfigProvider, useTeamConfig } from "./context/TeamConfigContext";
import { GridPicker } from "./ui/GridPicker/GridPicker";
import { TrainerPicker } from "./ui/GridPicker/TrainerPicker";
import { TrinketPicker } from "./ui/GridPicker/TrinketPicker";
import { TeamSummary } from "./ui/TeamSummary/TeamSummary";
import { TotalDps } from "./ui/TeamSummary/TotalDps";
import { PlacedCreatureDetails } from "./ui/TeamSummary/PlacedCreatureDetails";
import { ModifierEditor } from "./ui/Modifiers/ModifierEditor";
import { PlacementAdvisor } from "./ui/TeamSummary/PlacementAdvisor";
import { ShareBuild } from "./ui/TeamSummary/ShareBuild";
import { CumulativeChart } from "./ui/CumulativeChart/CumulativeChart";
import { DpsRateChart } from "./ui/CumulativeChart/DpsRateChart";
import { StatusStackChart } from "./ui/CumulativeChart/StatusStackChart";
import { CorpusBrowser } from "./ui/CorpusBrowser/CorpusBrowser";
import { corpus } from "./data/corpus";
import { simulate } from "./engine/simulate";
import type { GridSlot } from "./data/types";
import "./App.css";

/*
 * FR-014 (display the corpus patch version) is RETIRED as of 2026-10-06, which is what the comment
 * that used to live here instructed should happen on a third removal rather than letting the
 * requirement go quietly unmet.
 *
 * It was shown in the app header (round 7), then the Corpus Browser summary (round 8), then a
 * footer line — and removal was requested each time. Three refusals is the answer: the version is
 * not something a user wants on screen. It remains recorded per-record in each creature's `patch`
 * field, which is where it is actually useful, and `spec.md` records the retirement.
 */

type View = "calculator" | "corpus";

function CalculatorView() {
  const { config, setSimulationWindowSeconds } = useTeamConfig();
  const result = useMemo(() => simulate(config, corpus), [config]);
  // 2026-10-05 round 3 (FR-021 / data-model.md's "Persistent side-panel... is UI state, not
  // team data" amendment): transient, lifted here (not TeamConfigContext) because it's purely
  // a display concern, never read by simulate() or persisted with the team configuration.
  const [highlightedSlot, setHighlightedSlot] = useState<GridSlot | null>(null);

  return (
    <div>
      <h2>Build your team</h2>
      {/* FR-015 (2026-10-05 round 2): Trainer choice is presented first, above the grid, since
          it's the first decision made in the team-building flow. */}
      <p>
        <TrainerPicker />
      </p>
      <p>
        <TrinketPicker />
      </p>
      {/*
        Two columns. The left one holds the grid and everything that edits the team; the right is
        the creature detail panel.

        Modifiers and Share live in the LEFT column, under the grid, because the detail panel is
        tall and the space beside it was empty — and because both are things you do TO the team, so
        they belong with the team rather than below the whole page. Share in particular was
        full-width before, which stretched a base64 code across the viewport.
      */}
      <div
        style={{
          display: "flex",
          // Same token `--builder-row-width` budgets for, so the row's own gap cannot drift from
          // the width reserved for it.
          gap: "var(--column-gap)",
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            // Sized from the same token as the grid and the Modifiers panel it contains. A 20rem
            // basis let this column settle NARROWER than the grid inside it, and since the grid
            // sets an explicit width it overflowed onto the detail panel rather than being clipped.
            flex: "1 1 var(--team-column-width)",
            maxWidth: "var(--team-column-width)",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            alignItems: "stretch",
          }}
        >
          <GridPicker onHighlightSlot={setHighlightedSlot} />
          {/* FR-066 / WI-011: Modifiers sits with the grid it modifies. */}
          <ModifierEditor />
          <ShareBuild />
        </div>
        <div style={{ flex: "0 0 var(--detail-panel-width)", textAlign: "left" }}>
          <PlacedCreatureDetails result={result} highlightedSlot={highlightedSlot} />
        </div>
      </div>
      <PlacementAdvisor />
      <TotalDps config={config} result={result} />
      <TeamSummary config={config} result={result} />
      {/* FR-037: the simulation window governs the chart's time axis, not the per-second summary
          values, so it sits immediately above the chart and below the tables. Order matters here —
          leaving ModifierEditor between this control and the chart would satisfy "below the tables"
          while breaking "just above the chart" (research.md H7/tasks.md T130). */}
      <p>
        <label>
          Simulation window (seconds):{" "}
          <input
            type="number"
            min={1}
            max={120}
            value={config.simulationWindowSeconds}
            onChange={(e) => setSimulationWindowSeconds(Number(e.target.value) || 1)}
          />
        </label>
      </p>
      <CumulativeChart result={result} />
      <DpsRateChart result={result} />
      <StatusStackChart result={result} />
    </div>
  );
}

function App() {
  const [view, setView] = useState<View>("calculator");

  return (
    <TeamConfigProvider>
      <header>
        <h1>Batomon Showdown DPS &amp; Status Calculator</h1>
        <nav aria-label="Primary">
          <button
            onClick={() => setView("calculator")}
            disabled={view === "calculator"}
            aria-current={view === "calculator" ? "page" : undefined}
          >
            Calculator
          </button>{" "}
          <button
            onClick={() => setView("corpus")}
            disabled={view === "corpus"}
            aria-current={view === "corpus" ? "page" : undefined}
          >
            Corpus Browser
          </button>
        </nav>
      </header>
      <main>{view === "calculator" ? <CalculatorView /> : <CorpusBrowser />}</main>
    </TeamConfigProvider>
  );
}

export default App;
