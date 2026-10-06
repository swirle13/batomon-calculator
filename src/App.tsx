import { useMemo, useState } from "react";
import { TeamConfigProvider, useTeamConfig } from "./context/TeamConfigContext";
import { GridPicker } from "./ui/GridPicker/GridPicker";
import { TrainerPicker } from "./ui/GridPicker/TrainerPicker";
import { TrinketPicker } from "./ui/GridPicker/TrinketPicker";
import { TeamSummary } from "./ui/TeamSummary/TeamSummary";
import { PlacedCreatureDetails } from "./ui/TeamSummary/PlacedCreatureDetails";
import { ModifierEditor } from "./ui/Modifiers/ModifierEditor";
import { CumulativeChart } from "./ui/CumulativeChart/CumulativeChart";
import { CorpusBrowser } from "./ui/CorpusBrowser/CorpusBrowser";
import { corpus } from "./data/corpus";
import { simulate } from "./engine/simulate";
import type { GridSlot } from "./data/types";
import "./App.css";

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
      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "flex-start" }}>
        <GridPicker onHighlightSlot={setHighlightedSlot} result={result} />
        <div style={{ flex: "1 1 16rem", minWidth: "16rem", textAlign: "left" }}>
          <h3>Batomon Stats</h3>
          <PlacedCreatureDetails result={result} highlightedSlot={highlightedSlot} />
        </div>
      </div>
      <TeamSummary config={config} result={result} />
      {/* 2026-10-06 round 6 (FR-039): collapsed by default, so it sits between the tables and the
          chart without pushing them apart. */}
      <ModifierEditor />
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
