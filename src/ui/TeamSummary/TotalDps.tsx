import { useState } from "react";
import type { SimulationResult, TeamConfiguration } from "../../data/types";
import { corpus } from "../../data/corpus";
import { analyzePositionalCoverage } from "../../engine/optimize";
import { formatRate } from "../../data/format";
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
  const [scrubT, setScrubT] = useState<number | null>(null);

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
  // Indexing cannot desynchronise from the grid, whatever the grid becomes.
  const scrubPoint = scrubT === null ? null : series[scrubT] ?? null;
  const scrubbed = scrubPoint?.dps ?? null;
  const shown = scrubbed ?? windowAverage;

  const coverage = analyzePositionalCoverage(config, corpus);
  const placedCount = config.placements.length;

  return (
    <section className={styles.wrap}>
      {/*
        2026-10-06 round 11 (FR-085 / WI-R11-003). One figure, one caption, no prose.
        The caption still distinguishes the two readings, because they are genuinely different
        quantities -- an average over the window versus an instantaneous rate -- and a bare number
        that silently switched between them would be worse than the prose it replaces.
      */}
      <div className={styles.headline}>
        <div className={styles.value}>{formatRate(shown)}</div>
        <div className={styles.label}>
          {scrubT === null || scrubPoint === null
            ? "DPS average"
            : `DPS at t=${scrubPoint.tSeconds}s`}
        </div>
      </div>


      {/*
        2026-10-06 round 10 (FR-083 / WI-009). Two bugs here, one reported and one found alongside.
        Reported: at rest the thumb sat hard left while the figure read the window average, so the
        control asserted "t = 0" about a number that was not a reading at any time.
        Found: `v === 0 ? null : v` hijacked 0 to mean "no scrub", which made **t = 0 unreachable** —
        the one moment the user is most likely to check, since it is where every cooldown starts.
        Now 0 is an ordinary time, "whole window" is its own state reached by the button, and at rest
        the slider is visibly inert so its thumb position makes no claim.
      */}
      {series.length > 0 && (
        <div className={`${styles.scrubRow} ${scrubT === null ? styles.scrubIdle : ""}`}>
          <label className={styles.scrubLabel}>
            Time{" "}
            <input
              type="range"
              min={0}
              max={Math.max(0, series.length - 1)}
              step={1}
              value={scrubT ?? 0}
              onChange={(e) => setScrubT(Number(e.target.value))}
              aria-label="Scrub battle time to see damage per second at that moment"
            />
          </label>
          <button type="button" onClick={() => setScrubT(null)} disabled={scrubT === null}>
            Whole window
          </button>
        </div>
      )}

      {/*
        FR-075 still applies: a DPS figure reads as authoritative in a way an empty list does not, so
        the coverage ceiling stays next to the number. Round 11 reduces it from a sentence to a
        counter, which is what the user asked for -- the fact survives, the prose does not. Dropping
        it entirely would let a confident-looking number imply coverage the engine does not have.
      */}
      <p className={styles.coverage} title={`${coverage.actionable.length} of ${placedCount} placed Batomon have an ability this engine computes. The rest contribute base stats and your manual modifiers only.`}>
        abilities modelled {coverage.actionable.length}/{placedCount}
      </p>
    </section>
  );
}
