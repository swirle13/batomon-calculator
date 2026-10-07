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
import { CorpusBrowser } from "./ui/CorpusBrowser/CorpusBrowser";
import { corpus } from "./data/corpus";
import { simulate } from "./engine/simulate";
import type { GridSlot } from "./data/types";
import "./App.css";

/**
 * FR-014's home as of round 8, and its third relocation — recorded because the pattern matters.
 * Round 7 removed this from the app header (FR-050) and put it in the Corpus Browser's summary
 * line specifically so the requirement kept a surface; round 8 (WI-014) asked for that prose gone
 * too. The user's objection both times was to provenance PROSE AT THE TOP OF A VIEW, not to the
 * version being recorded at all, so it moves to one unobtrusive footer line rather than being
 * silently dropped — which would leave FR-014 unmet everywhere, the exact failure review caught
 * last round. If a future round removes this too, FR-014 should be RETIRED with a stated
 * rationale rather than quietly unmet.
 */
const CORPUS_PATCH_LABEL = "Balance 24 / 1.2.0 (community-imported build)";

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
        <GridPicker onHighlightSlot={setHighlightedSlot} />
        <div style={{ flex: "0 0 var(--detail-panel-width)", textAlign: "left" }}>
          <PlacedCreatureDetails result={result} highlightedSlot={highlightedSlot} />
        </div>
      </div>
      {/* 2026-10-06 round 8 (FR-066 / WI-011): Modifiers sits between the grid and the summary. */}
      <ModifierEditor />
      <PlacementAdvisor />
      <ShareBuild />
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
      <footer style={{ fontSize: "0.7rem", color: "var(--text-muted)", padding: "1rem 0 0.5rem" }}>
        Corpus: {CORPUS_PATCH_LABEL}
      </footer>
    </TeamConfigProvider>
  );
}

export default App;
