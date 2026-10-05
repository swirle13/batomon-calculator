import { useMemo, useState } from "react";
import { TeamConfigProvider, useTeamConfig } from "./context/TeamConfigContext";
import { GridPicker } from "./ui/GridPicker/GridPicker";
import { TrainerPicker } from "./ui/GridPicker/TrainerPicker";
import { TeamSummary } from "./ui/TeamSummary/TeamSummary";
import { PlacedCreatureDetails } from "./ui/TeamSummary/PlacedCreatureDetails";
import { ModifierEditor } from "./ui/Modifiers/ModifierEditor";
import { CumulativeChart } from "./ui/CumulativeChart/CumulativeChart";
import { CorpusBrowser } from "./ui/CorpusBrowser/CorpusBrowser";
import { corpus } from "./data/corpus";
import { simulate } from "./engine/simulate";
import "./App.css";

type View = "calculator" | "corpus";

/** FR-014: state which corpus/patch snapshot is active, on both views. */
const CORPUS_PATCH_LABEL =
  "Balance 24 / 1.2.0 (community-imported build) — 149 named Batomon, 8 with confirmed cooldown/damage, 23 Trainers, see README";

function CalculatorView() {
  const { config, setSimulationWindowSeconds } = useTeamConfig();
  const result = useMemo(() => simulate(config, corpus), [config]);

  return (
    <div>
      <h2>Build your team</h2>
      {/* FR-015 (2026-10-05 round 2): Trainer choice is presented first, above the grid, since
          it's the first decision made in the team-building flow. */}
      <p>
        <TrainerPicker />
      </p>
      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "flex-start" }}>
        <GridPicker />
        <div style={{ flex: "1 1 16rem", minWidth: "16rem", textAlign: "left" }}>
          <h3>Placed Banto stats</h3>
          <PlacedCreatureDetails result={result} />
        </div>
      </div>
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
      <TeamSummary config={config} result={result} />
      <ModifierEditor />
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
        <p>
          <small>Corpus snapshot: {CORPUS_PATCH_LABEL}</small>
        </p>
      </header>
      <main>{view === "calculator" ? <CalculatorView /> : <CorpusBrowser />}</main>
    </TeamConfigProvider>
  );
}

export default App;
