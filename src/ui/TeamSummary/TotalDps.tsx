import { useState } from "react";
import type { SimulationResult, TeamConfiguration } from "../../data/types";
import { corpus } from "../../data/corpus";
import { analyzePositionalCoverage } from "../../engine/optimize";
import { formatRate } from "../../data/format";
import { MAX_RECORDED_DAY, enemyHpForDay, timeToKill } from "../../data/enemyHealth";
import { Range, Select } from "../primitives";
import styles from "./TotalDps.module.css";

interface TotalDpsProps {
  config: TeamConfiguration;
  result: SimulationResult;
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
 */
export function TotalDps({ config, result }: TotalDpsProps) {
  // An index into `dpsRateSeries`, never a count of seconds — see the lookup below.
  const [scrubIndex, setScrubIndex] = useState(0);
  const [day, setDay] = useState(1);

  const directTotal = Object.values(result.perCreatureDps).reduce((a, b) => a + b, 0);
  const facilitatedTotal = Object.values(result.perCreatureFacilitatedDps).reduce((a, b) => a + b, 0);
  const windowAverage = directTotal + facilitatedTotal;

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

  /**
   * Time to kill the day's enemy. Day 1 by default — the day most boards are built against, and
   * the only one with an observed battle to check against.
   *
   * `null` means the team does not get there inside the simulated window, which is a real answer
   * rather than a missing one, so it renders as "> <window>s" instead of a dash.
   */
  const ttkSeconds = timeToKill(result.cumulativeSeries, day);

  const coverage = analyzePositionalCoverage(config, corpus);
  /*
   * 2026-10-07: this read `needsModelling.filter((n) => !actionable.includes(n))`, and `actionable`
   * only ever counts POSITIONAL tags — it belongs to the placement optimiser (FR-069). So any
   * creature whose ability the engine resolves NON-positionally was reported as unmodelled, and the
   * figure was simply false: a board of Ninflora, Mosslug, Thorntail, Drumire, Cobrex and Miasmaw
   * claimed "3 of 6 abilities not yet modelled" when the true answer was 1 of 6.
   *
   * `coverage.unmodelled` is computed from `isResolvableTag`, the same predicate the engine uses to
   * decide what it acts on, so the claim and the behaviour cannot disagree.
   */
  const unmodelled = coverage.unmodelled.length;
  const manuallyBanked = coverage.manuallyBanked.length;

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
                ? `This team does not clear day ${day}'s ${enemyHpForDay(day)?.toLocaleString()} HP within the ${config.simulationWindowSeconds}s window.`
                : `Clears day ${day}'s ${enemyHpForDay(day)?.toLocaleString()} HP at ${ttkSeconds}s. Assumes an enemy that never heals, shields or clears statuses, so this is a FLOOR on the real time.`
            }
          >
            {ttkSeconds === null ? `>${config.simulationWindowSeconds}s` : `${ttkSeconds}s`}
          </div>
          <div className={styles.label}>
            TTK on day{" "}
            <Select
              size="sm"
              className={styles.daySelect}
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
              aria-label="Day to compute time-to-kill against"
            >
              {Array.from({ length: MAX_RECORDED_DAY }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
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

      {/*
        FR-075: a DPS figure reads as authoritative, so a real coverage gap stays beside it.
        But the counter now measures abilities that NEED modelling. It previously used every placed
        creature as the denominator, so a team of Venopuff, Magmite and Dribblet read "0 of 3
        modelled" — implying the figure was untrustworthy — when none of the three has an ability to
        model and the DPS was entirely correct. With nothing outstanding it says nothing at all,
        because a counter reading 0/0 is noise.
      */}
      {unmodelled > 0 && (
        <p
          className={styles.coverage}
          title={`${unmodelled} of the ${coverage.needsModelling.length} placed Batomon with a battle ability have one this engine does not yet compute: ${coverage.unmodelled.join(", ")}. Creatures with no ability, evolution-only text, or text that just restates their stats are not counted — there is nothing to model.`}
        >
          {unmodelled} of {coverage.needsModelling.length} abilities not yet modelled
        </p>
      )}
      {/*
        A SEPARATE line, because this is a different fact and the old counter told the wrong story
        about it. These abilities fire outside the battle being simulated — winning a round, buying
        a monster, using an item — so the engine cannot fire them, but the card offers a button that
        banks each occurrence. Calling them "not modelled" both overstated the gap and hid the
        feature that closes it.
      */}
      {manuallyBanked > 0 && (
        <p
          className={styles.coverage}
          title={`${coverage.manuallyBanked.join(", ")}: the trigger happens outside the battle this engine simulates, so there is a button on the creature's card to bank each occurrence.`}
        >
          {manuallyBanked} fire outside the battle — bank them on the card
        </p>
      )}
    </section>
  );
}
