import { Suspense, lazy, useDeferredValue, useMemo, useState } from "react";
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
/*
 * THE CHARTS ARE A SEPARATE DOWNLOAD (2026-10-08, load performance).
 *
 * Recharts is the single largest thing the app ships, and all three charts sit BELOW THE FOLD —
 * nobody has seen one at first paint. Importing them normally put them in the critical bundle
 * anyway, so every visitor waited for a chart library before the grid could render. Splitting them
 * out takes the initial download from 264kB to 149kB gzipped.
 *
 * That matters because this page is entirely client-rendered: `index.html` ships an empty
 * `<div id="root">`, so LCP cannot happen until the bundle has arrived, parsed and executed. Load
 * time is therefore roughly linear in bundle size, and measurably so — a cold load went 0.20s on a
 * fast connection, 0.70s on 4G, 1.86s on slow 4G and 6.24s on 3G before this.
 *
 * `.then()` unwrapping the named export, rather than adding default exports: `lazy` requires a
 * module whose `default` is the component, and the rest of the codebase exports by name.
 */
const CumulativeChart = lazy(() =>
  import("./ui/CumulativeChart/CumulativeChart").then((m) => ({ default: m.CumulativeChart })),
);
const DpsRateChart = lazy(() =>
  import("./ui/CumulativeChart/DpsRateChart").then((m) => ({ default: m.DpsRateChart })),
);
const StatusStackChart = lazy(() =>
  import("./ui/CumulativeChart/StatusStackChart").then((m) => ({ default: m.StatusStackChart })),
);

/**
 * Holds a chart's space while its chunk is in flight.
 *
 * The heights are the rendered heights of the three sections, measured rather than guessed (316 /
 * 370 / 32 at the time of writing). A `Suspense` fallback that does not reserve the right space
 * is a layout shift by construction: the content below would jump when the chunk lands, which is
 * the exact cost code-splitting is supposed to avoid paying. The status chart is 32 because it is
 * COLLAPSED by default — reserving a chart's worth of space for it would itself shift the page.
 *
 * Approximate is fine and exact is not required: CLS only counts movement of content that is
 * already visible, and these sit below the fold. It must not be wildly wrong, which is why the
 * numbers are measured and why this comment says where they came from.
 */
function ChartPlaceholder({ height }: { height: number }) {
  return <div style={{ height }} aria-hidden />;
}
import { CorpusBrowser } from "./ui/CorpusBrowser/CorpusBrowser";
import { Button, ClampedNumberField, Field } from "./ui/primitives";
import { corpus } from "./data/corpus";
import { DEFAULT_RUN_DAY } from "./data/enemyHealth";
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
  const { config, setSimulationWindowSeconds, setRunDay } = useTeamConfig();
  const result = useMemo(() => simulate(config, corpus), [config]);
  /*
   * THE CHARTS RENDER A PASS LATE, ON PURPOSE (2026-10-08, performance).
   *
   * Dragging a Batomon onto an occupied slot measured an INP of 256ms. The engine was never the
   * problem — `simulate()` on a full board is 0.22ms, and the placement search that costs 66ms
   * already runs on a worker. It was the three Recharts trees: they are memoized on `result`, so a
   * drop correctly invalidates all three and rebuilds every axis, tick and path SYNCHRONOUSLY, in
   * the same commit that moves the card. Deleting the charts and re-measuring put the number
   * beyond doubt: `mouseup` processing fell from 78ms to 17ms at a 4x CPU throttle, and every
   * long task disappeared.
   *
   * `useDeferredValue` keeps the charts without keeping them in the gesture's way. The urgent
   * render — the one the user is waiting on, which moves the two cards — sees the PREVIOUS result
   * here, so all three charts hit their `memo` bail-out and cost nothing. React then re-renders
   * them at background priority, yielding to the browser so the swap paints first.
   *
   * Only the charts are deferred. `PlacedCreatureDetails`, `TotalDps` and `TeamSummary` read the
   * live `result` and stay exact, because they are cheap and because a stale number in a table is
   * much easier to misread than a chart that redraws a frame late.
   *
   * No "recalculating…" marker, unlike `PlacementAdvisor`. That one can lag by seconds and is
   * genuinely a board behind; this lags by one render pass, and a badge that flickered on every
   * drop would cost more attention than the staleness it reports.
   */
  const deferredResult = useDeferredValue(result);
  // 2026-10-05 round 3 (FR-021 / data-model.md's "Persistent side-panel... is UI state, not
  // team data" amendment): transient, lifted here (not TeamConfigContext) because it's purely
  // a display concern, never read by simulate() or persisted with the team configuration.
  const [highlightedSlot, setHighlightedSlot] = useState<GridSlot | null>(null);
  /*
   * The run day now lives in `TeamConfigContext` (2026-10-08, user-reported), REVERSING the note
   * that used to stand here: "NOT put in `TeamConfigContext` … it must not travel in a shared
   * build or be saved with one."
   *
   * That was right about what a day means and wrong about what it costs. The report — "I keep
   * having to set that value back to day 7 every time I save" — is a field being re-entered after
   * every save, and the library's own save form was separately tracking the same number, so the
   * app held two unconnected ideas of what day it was. `TeamConfiguration.runDay` records the
   * reversal in full; `share.ts` keeps it out of the build FINGERPRINT, which is the half of the
   * old reasoning that survives.
   */
  const day = config.runDay ?? DEFAULT_RUN_DAY;

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
      <TotalDps config={config} result={result} day={day} onDayChange={setRunDay} />
      <TeamSummary config={config} result={result} />
      {/* FR-037: the simulation window governs the chart's time axis, not the per-second summary
          values, so it sits immediately above the chart and below the tables. */}
      <div className={layout.windowControl}>
        <Field label="Simulation window (seconds)" inline>
          <ClampedNumberField
            min={1}
            max={120}
            width="5rem"
            value={config.simulationWindowSeconds}
            onCommit={setSimulationWindowSeconds}
          />
        </Field>
      </div>
      {/* One boundary each, so a chart appears as soon as its own chunk is ready and each one
          reserves only the space it will actually occupy. */}
      <Suspense fallback={<ChartPlaceholder height={316} />}>
        <CumulativeChart result={deferredResult} day={day} />
      </Suspense>
      <Suspense fallback={<ChartPlaceholder height={370} />}>
        <DpsRateChart result={deferredResult} />
      </Suspense>
      <Suspense fallback={<ChartPlaceholder height={32} />}>
        <StatusStackChart result={deferredResult} />
      </Suspense>
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
