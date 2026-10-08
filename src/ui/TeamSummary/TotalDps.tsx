import { memo, useState } from "react";
import type { SimulationResult, TeamConfiguration } from "../../data/types";
import { corpus } from "../../data/corpus";
import { analyzePositionalCoverage } from "../../engine/optimize";
import { windowAverageDps } from "../../engine/simulate";
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
/** Memoized for the same reason as `CumulativeChart` — see the note there. */
export const TotalDps = memo(function TotalDps({ config, result }: TotalDpsProps) {
  // An index into `dpsRateSeries`, never a count of seconds — see the lookup below.
  const [scrubIndex, setScrubIndex] = useState(0);
  const [day, setDay] = useState(1);

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
  const casualties = result.knockedOutAtBattleStart;
  /*
   * A creature a teammate knocked out is reported ONCE, on the casualty line.
   *
   * `analyzePositionalCoverage` walks `config.placements`, which still contains the corpses — it
   * is a report about the board the user built, not about who survived battle start. Without this
   * filter a knocked-out creature with an unresolved ability would be listed under "the engine
   * does not compute this ability yet" as well, which is true in the abstract and useless here:
   * its ability is not missing from the figure because of an engine gap, it is missing because
   * the creature is dead.
   */
  const dead = new Set(casualties.map((c) => c.name));
  const unmodelledNames = coverage.unmodelled.filter((n) => !dead.has(n));
  const bankedNames = coverage.manuallyBanked.filter((n) => !dead.has(n));
  const unmodelled = unmodelledNames.length;
  const manuallyBanked = bankedNames.length;

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

        2026-10-08, user-reported: both lines used to be COUNTS ("1 of 4 abilities not yet
        modelled", "2 fire outside the battle — bank them on the card") with the names of the
        creatures only in a `title` tooltip. A count tells you a gap exists and nothing about
        whether it matters to you; the names are the whole content, and the user found them by
        accident. They are in the text now, and the tooltips are gone rather than demoted — there
        was nothing left in them worth a second discovery.

        The second line also used to end "bank them on the card", which the user correctly called
        out as an instruction they did not need. What they do need is WHY these abilities are
        absent from the figure, which is the clause that replaced it.

        Both lines say nothing at all when there is nothing outstanding: a counter reading 0/0, or
        a caveat naming nobody, is noise next to a number.
      */}
      {(unmodelled > 0 || manuallyBanked > 0 || casualties.length > 0) && (
        <div className={styles.coverage}>
          <p className={styles.coverageHeading}>Not in this figure</p>
          {/*
            2026-10-08, user-reported. Placing a Rattleghast beside two allies removed both from
            the simulation — correctly, that is what its ability does — but removed them SILENTLY,
            which reads as the tool losing track of half the board. Naming the creature that
            killed them is the part that makes it legible rather than alarming.

            This line comes FIRST because it is the one that changes what the user should do: the
            other two describe a limit of the engine, this describes a consequence of their board.
          */}
          {casualties.length > 0 && (
            <p className={styles.coverageLine}>
              <span className={styles.coverageNames}>{casualties.map((c) => c.name).join(", ")}</span> — knocked
              out at battle start by {[...new Set(casualties.map((c) => c.knockedOutBy))].join(" and ")}
            </p>
          )}
          {unmodelled > 0 && (
            <p className={styles.coverageLine}>
              <span className={styles.coverageNames}>{unmodelledNames.join(", ")}</span> — the engine does not
              compute {unmodelled === 1 ? "this ability" : "these abilities"} yet
            </p>
          )}
          {/*
            A SEPARATE line, because this is a different fact and the old counter told the wrong
            story about it: the ability is fully representable, it just fires on something outside
            the battle — winning a round, buying a monster, using an item — so the engine has no
            occurrence to count. Calling them "not modelled" overstated the gap.
          */}
          {manuallyBanked > 0 && (
            <p className={styles.coverageLine}>
              <span className={styles.coverageNames}>{bankedNames.join(", ")}</span> —{" "}
              {manuallyBanked === 1 ? "this ability triggers" : "these abilities trigger"} between battles, not
              during one
            </p>
          )}
        </div>
      )}
    </section>
  );
});
