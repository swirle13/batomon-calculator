import { memo, useDeferredValue, useMemo, useState } from "react";
import type { SimulationResult, TeamConfiguration } from "../../data/types";
import { windowAverageDps } from "../../engine/simulate";
import { MAX_TTK_SECONDS, timeToKillSeconds } from "../../engine/timeToKill";
import { corpus } from "../../data/corpus";
import { formatDuration, formatRate } from "../../data/format";
import {
  MAX_PROJECTED_DAY,
  MAX_RECORDED_DAY,
  enemyHpEntryForDay,
} from "../../data/enemyHealth";
import { Range, Select } from "../primitives";
import styles from "./TotalDps.module.css";

interface TotalDpsProps {
  config: TeamConfiguration;
  result: SimulationResult;
  /**
   * Lifted to `CalculatorView` (2026-10-08) because the cumulative chart draws this day's HP as a
   * threshold. Two selectors for one concept would let the figure and the line disagree.
   */
  day: number;
  onDayChange: (day: number) => void;
}

/**
 * The headline output figure (FR-072 / WI-002, WI-006) plus a time scrubber (FR-076 / WI-007).
 *
 * ## Why this exists at all
 *
 * `perCreatureDps` counts **direct damage only** — `perCreatureDamage` is incremented solely inside
 * the `isDirectHit` branch. So an all-status team reads `0.00` in every row of the DPS table while
 * actually dealing substantial damage, all of which lands in the separate "Facilitated DPS" column.
 * The user hit exactly this: four Poison creatures, every row `0.00`, and 136.6 damage/second of
 * real output. A combined figure is a correctness fix for how the table reads, not a convenience.
 *
 * ## Why summing direct + facilitated is safe, and summing the status record is not
 *
 * `perCreatureDamage` takes only direct-hit damage; `facilitatedDamage` takes exactly the
 * status-tick damage plus Shock-proc damage split by shares that sum to the whole proc. Together
 * they partition all damage with no overlap and no remainder.
 *
 * `perStatusPerSecond` must NOT be summed for this purpose: its `Shield` entry is Shield *granted*,
 * never damage, and never enters `facilitatedDamage` — so that route would inflate any Shield team.
 *
 * ## What is NOT here
 *
 * The "not in this figure" caveats — creatures a teammate knocked out at battle start, abilities
 * the engine cannot compute, abilities that fire between battles — lived under these numbers until
 * 2026-10-08 and now live in `PlacementAdvisor`. They are statements about which abilities the
 * board is and is not getting value from, which is that section's subject; here they were
 * footnotes to a number.
 */
/** Memoized for the same reason as `CumulativeChart` — see the note there. */
export const TotalDps = memo(function TotalDps({
  config,
  result,
  day,
  onDayChange,
}: TotalDpsProps) {
  // An index into `dpsRateSeries`, never a count of seconds — see the lookup below.
  const [scrubIndex, setScrubIndex] = useState(0);

  const windowAverage = windowAverageDps(result);

  // The scrubbed value comes from `dpsRateSeries` itself, so this figure and the DPS-over-time
  // chart agree by construction rather than via a second computation.
  const series = result.dpsRateSeries;
  // 2026-10-06. The slider is an INDEX into the series, not a count of seconds.
  //
  // It used to look up `series.find((p) => p.tSeconds === scrubT)` while the slider ran 0..length
  // in steps of 1. That held only while the series happened to be 1-second spaced. Once it became
  // 0.5s (FR-106) every index above the window length — and index 0, which no bucket has — matched
  // nothing, fell through `?? null` to `shown = scrubbed ?? windowAverage`, and displayed the
  // WINDOW AVERAGE under a label reading "at t = Ns". That is the reported "DPS is high at t=0":
  // it was not a reading at all.
  //
  // Indexing cannot desynchronize from the grid, whatever the grid becomes.
  const scrubPoint = series[scrubIndex] ?? null;
  const scrubbedOrZero = scrubPoint?.dps ?? 0;

  /*
   * TIME TO KILL, NO LONGER CAPPED BY THE SIMULATION WINDOW (2026-10-08, user-reported).
   *
   * This read `timeToKill(result.cumulativeSeries, day)`, so it could only see as far as the
   * chart: a board that kills day 12 at 47s reported ">30s" at the default window. That is a
   * statement about the window, not the board, and it changed when the window changed — so two
   * builds compared at different windows were not comparable. `timeToKillSeconds` runs the engine
   * out past the window to find the real crossing; see its header on why extrapolating from
   * average DPS cannot work for a status team.
   *
   * ## Why this one value is deferred when nothing else in this component is
   *
   * The note at the top of `CalculatorView` says only the charts are deferred, because a stale
   * number in a table misreads more easily than a chart that redraws a frame late. That still
   * holds for every other figure here — they are microseconds of arithmetic over an existing
   * result. This one re-runs the simulation, up to ~8ms for a board that never gets there, which
   * is half the budget of the whole drop gesture the charts were deferred to protect. One render
   * pass of staleness on a single derived number is the cheaper of the two costs.
   */
  const deferredConfig = useDeferredValue(config);
  const deferredSeries = useDeferredValue(result.cumulativeSeries);
  const ttkSeconds = useMemo(
    () => timeToKillSeconds(deferredConfig, corpus, day, deferredSeries),
    [deferredConfig, deferredSeries, day],
  );
  const dayHp = enemyHpEntryForDay(day);
  const hpText = dayHp === null ? "unknown" : `${dayHp.hp.toLocaleString()} HP`;
  // Days past the recording carry their own caveat on top of the floor caveat, and the tooltip is
  // where it belongs: the `(est.)` in the option text says a figure is projected, not by how much.
  const projectedNote =
    dayHp?.source === "projected"
      ? " That HP is PROJECTED from the recorded day 1-19 curve, not observed."
      : "";

  return (
    <section className={styles.wrap}>
      {/*
        Two figures side by side (item 4). The scrubbed reading answers "what is happening now?" and
        the average answers "what did the whole fight look like?" — they are different questions and
        a user comparing builds wants both at once, rather than toggling and remembering.

        Fixed-width columns: a DPS figure ranges from single digits to five, and without reserved
        space the two numbers shuffle left and right as you drag the scrubber, which makes them
        hard to read at exactly the moment you are reading them.
      */}
      <div className={styles.headline}>
        <div className={styles.figure}>
          <div className={styles.value}>{formatRate(scrubbedOrZero)}</div>
          <div className={styles.label}>DPS at t={scrubPoint?.tSeconds ?? 0}s</div>
        </div>
        <div className={styles.figure}>
          <div className={`${styles.value} ${styles.secondary}`}>{formatRate(windowAverage)}</div>
          <div className={styles.label}>DPS average</div>
        </div>
        <div className={styles.figure}>
          <div
            className={`${styles.value} ${styles.secondary}`}
            title={
              ttkSeconds === null
                ? `This team does not clear day ${day}'s ${hpText} within ${formatDuration(MAX_TTK_SECONDS)}, which is as far as the search runs.${projectedNote}`
                : `Clears day ${day}'s ${hpText} at ${ttkSeconds}s. Independent of the ${config.simulationWindowSeconds}s simulation window — the engine is run out as far as it takes. Assumes an enemy that never heals, shields or clears statuses, so this is a FLOOR on the real time.${projectedNote}`
            }
          >
            {ttkSeconds === null
              ? `>${formatDuration(MAX_TTK_SECONDS)}`
              : formatDuration(ttkSeconds)}
          </div>
          <div className={styles.label}>
            TTK on day{" "}
            <Select
              size="sm"
              className={styles.daySelect}
              value={day}
              onChange={(e) => onDayChange(Number(e.target.value))}
              aria-label="Day to compute time-to-kill against"
            >
              {/* Runs past day 19, so the selector does too. Days beyond the recording are marked
                  in the option itself rather than only in the tooltip — the marking has to survive
                  the select being closed, which is when it is read. */}
              {Array.from({ length: MAX_PROJECTED_DAY }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                  {d > MAX_RECORDED_DAY ? " (est.)" : ""}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {series.length > 0 && (
        <div className={styles.scrubRow}>
          <label className={styles.scrubLabel}>
            Time{" "}
            <Range
              min={0}
              max={Math.max(0, series.length - 1)}
              step={1}
              value={scrubIndex}
              onChange={(e) => setScrubIndex(Number(e.target.value))}
              aria-label="Scrub battle time to see damage per second at that moment"
            />
          </label>
        </div>
      )}

    </section>
  );
});
