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
  const scrubbed = scrubT === null ? null : series.find((p) => p.tSeconds === scrubT)?.dps ?? null;
  const shown = scrubbed ?? windowAverage;

  const coverage = analyzePositionalCoverage(config, corpus);
  const placedCount = config.placements.length;

  return (
    <section className={styles.wrap}>
      <div className={styles.headline}>
        <div className={styles.value}>{formatRate(shown)}</div>
        <div className={styles.label}>
          {scrubT === null ? "total damage per second (window average)" : `total damage per second at t = ${scrubT}s`}
        </div>
      </div>

      <div className={styles.breakdown}>
        direct {formatRate(directTotal)} + status/facilitated {formatRate(facilitatedTotal)}
        {directTotal === 0 && facilitatedTotal > 0 && (
          <span className={styles.note}>
            {" "}
            — every per-creature DPS row reads 0.00 because that column counts <em>direct</em> damage
            only; this team&rsquo;s output is all status damage.
          </span>
        )}
      </div>

      {series.length > 0 && (
        <div className={styles.scrubRow}>
          <label className={styles.scrubLabel}>
            Time{" "}
            <input
              type="range"
              min={0}
              max={series.length}
              step={1}
              value={scrubT ?? 0}
              onChange={(e) => {
                const v = Number(e.target.value);
                setScrubT(v === 0 ? null : v);
              }}
              aria-label="Scrub battle time to see damage per second at that moment"
            />
          </label>
          <button type="button" onClick={() => setScrubT(null)} disabled={scrubT === null}>
            Whole window
          </button>
        </div>
      )}

      {/* FR-075: a DPS figure reads as authoritative in a way an empty suggestion list does not, so
          the coverage ceiling is stated right where the number is. */}
      <p className={styles.coverage}>
        {coverage.actionable.length === 0
          ? `None of the ${placedCount} placed Batomon have an ability this engine can act on, so this figure reflects base stats plus your manual modifiers only.`
          : `${coverage.actionable.length} of ${placedCount} placed Batomon have an ability this engine acts on.`}
        {coverage.withPositionalTag.length > coverage.actionable.length &&
          " Some recorded abilities are not yet read by the engine and were ignored."}
      </p>
    </section>
  );
}
