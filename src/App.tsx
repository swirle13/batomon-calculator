import { useMemo, useState } from "react";
import { TeamConfigProvider } from "./context/TeamConfigContext";
import { useTeamConfig } from "./context/teamConfig";
import { GridPicker } from "./ui/GridPicker/GridPicker";
import { TrainerPicker } from "./ui/GridPicker/TrainerPicker";
import { TrinketPicker } from "./ui/GridPicker/TrinketPicker";
import { ItemPicker } from "./ui/GridPicker/ItemPicker";
import { TeamSummary } from "./ui/TeamSummary/TeamSummary";
import { TotalDps } from "./ui/TeamSummary/TotalDps";
import { PlacedCreatureDetails } from "./ui/TeamSummary/PlacedCreatureDetails";
import { ModifierEditor } from "./ui/Modifiers/ModifierEditor";
import { PlacementAdvisor } from "./ui/TeamSummary/PlacementAdvisor";
import { ShareBuild } from "./ui/TeamSummary/ShareBuild";
import { TeamLibrary } from "./ui/TeamLibrary/TeamLibrary";
import { CumulativeChart } from "./ui/CumulativeChart/CumulativeChart";
import { DpsRateChart } from "./ui/CumulativeChart/DpsRateChart";
import { StatusStackChart } from "./ui/CumulativeChart/StatusStackChart";
import { CorpusBrowser } from "./ui/CorpusBrowser/CorpusBrowser";
import { Button, Field, NumberField } from "./ui/primitives";
import { corpus } from "./data/corpus";
import { simulate } from "./engine/simulate";
import type { GridSlot } from "./data/types";
import layout from "./App.module.css";
import "./App.css";

/*
 * FR-014 (display the corpus patch version) is RETIRED as of 2026-10-06, which is what the comment
 * that used to live here instructed should happen on a third removal rather than letting the
 * requirement go quietly unmet.
 *
 * It was shown in the app header (round 7), then the Corpus Browser summary (round 8), then a
 * footer line — and removal was requested each time. Three refusals is the answer: the version is
 * not something a user wants on screen. `spec.md` records the retirement.
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
      {/*
        Two columns. The left one holds the grid and everything that edits the team; the right is
        the creature detail panel.

        The editors live in the LEFT column because they are things you do TO the team, so they
        belong with the team rather than below the whole page — and because the detail panel is tall
        and the space beside it was empty.
      */}
      <div aria-label="Team Builder" className={layout.builderRow}>
        <div aria-label="Team Grid" className={layout.teamColumn}>
          <TrainerPicker />
          {/* Trinkets, Items and Modifiers are matched EditorPanels, so they sit in one row rather
              than stacking three near-identical full-width rows above the grid. Items sits in the
              middle because it feeds Modifiers: using an item writes the chips Modifiers shows. */}
          <div className={layout.panelRow}>
            <TrinketPicker />
            <ItemPicker />
            <ModifierEditor />
          </div>
          <GridPicker onHighlightSlot={setHighlightedSlot} />
        </div>
        <div className={layout.detailColumn}>
          <ShareBuild />
          <PlacedCreatureDetails result={result} highlightedSlot={highlightedSlot} />
        </div>
      </div>
      <PlacementAdvisor result={result} />
      <TotalDps config={config} result={result} />
      <TeamSummary config={config} result={result} />
      {/* FR-037: the simulation window governs the chart's time axis, not the per-second summary
          values, so it sits immediately above the chart and below the tables. */}
      <div className={layout.windowControl}>
        <Field label="Simulation window (seconds)" inline>
          <NumberField
            min={1}
            max={120}
            width="5rem"
            value={config.simulationWindowSeconds}
            onChange={(e) => setSimulationWindowSeconds(Number(e.target.value) || 1)}
          />
        </Field>
      </div>
      <CumulativeChart result={result} />
      <DpsRateChart result={result} />
      <StatusStackChart result={result} />
      {/* Fixed to the viewport, so its position in this tree is immaterial to the layout — it is
          last because it is last in reading order for anyone tabbing through the page, and the
          board and its readouts should come first. */}
      <TeamLibrary />
    </div>
  );
}

function App() {
  const [view, setView] = useState<View>("calculator");

  return (
    <TeamConfigProvider>
      <header>
        <h1>Batomon Showdown DPS &amp; Status Calculator</h1>
        {/*
          The current view is marked, not DISABLED (2026-10-07). It used to be disabled, which took
          it out of the tab order — so a keyboard user arriving at the nav could not focus the item
          telling them where they were, and the only reachable control was the one they were not on.
          `selected` carries the appearance and `aria-current` carries the meaning.
        */}
        <nav aria-label="Primary" className={layout.viewNav}>
          <Button
            variant="ghost"
            selected={view === "calculator"}
            onClick={() => setView("calculator")}
            aria-current={view === "calculator" ? "page" : undefined}
          >
            Calculator
          </Button>
          <Button
            variant="ghost"
            selected={view === "corpus"}
            onClick={() => setView("corpus")}
            aria-current={view === "corpus" ? "page" : undefined}
          >
            Corpus Browser
          </Button>
        </nav>
      </header>
      <main>{view === "calculator" ? <CalculatorView /> : <CorpusBrowser />}</main>
    </TeamConfigProvider>
  );
}

export default App;
