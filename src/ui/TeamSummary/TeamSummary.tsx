import type { SimulationResult, TeamConfiguration } from "../../data/types";
import { getCreatureById } from "../../data/corpus";
import { statusColor } from "../../data/statColors";
import styles from "./TeamSummary.module.css";

interface TeamSummaryProps {
  config: TeamConfiguration;
  result: SimulationResult;
}

/**
 * FR-009: show each creature's DPS and each active status effect's per-second value side by
 * side, reading only from the one `SimulationResult` the Calculator view computed (never a
 * separate recomputation — Constitution's "cannot silently diverge" rule).
 *
 * 2026-10-06 round 6 (FR-038): the two tables are now laid out as one aligned, centred pair rather
 * than two separately left-justified blocks in different divs.
 */
export function TeamSummary({ config, result }: TeamSummaryProps) {
  const dpsRows = config.placements.map((placement) => {
    const creature = getCreatureById(placement.creatureId);
    const key = `${placement.creatureId}@${placement.slot.row}${placement.slot.col}`;
    const dps = result.perCreatureDps[key] ?? 0;
    // "Facilitated DPS" (user-requested, data-model.md amendment): damage this creature's own
    // status grants enabled on OTHER hits (currently just Shock procs) — separate from its own
    // direct-damage DPS, so a Shock-granter's real value is visible even if its own DPS is 0.
    const facilitatedDps = result.perCreatureFacilitatedDps[key] ?? 0;
    // 2026-10-05 round 4 (FR-024): no longer carries `slot` for display -- the grid already
    // shows position, so repeating it as text here was redundant (user-reported).
    return { key, name: creature?.name ?? placement.creatureId, dps, facilitatedDps };
  });

  const statusRows = Object.entries(result.perStatusPerSecond).filter(([, value]) => value > 0);

  return (
    <section>
      <h2>Team Summary</h2>
      <div className={styles.tables}>
        <table>
          <caption>Damage per second, by creature</caption>
          <thead>
            <tr>
              <th>Creature</th>
              <th className={styles.numeric}>DPS</th>
              <th
                className={styles.numeric}
                title="Damage this creature's own status grants (e.g. Shock) enabled on other hits, not counted in its own DPS"
              >
                Facilitated DPS
              </th>
            </tr>
          </thead>
          <tbody>
            {dpsRows.length === 0 && (
              <tr>
                {/* 2026-10-05 round 4 (FR-024): slot position is no longer shown as text here --
                    the grid itself already shows it, so this is 3 columns now, not 4. */}
                <td colSpan={3}>No creatures placed yet.</td>
              </tr>
            )}
            {dpsRows.map((row) => (
              <tr key={row.key}>
                <td>{row.name}</td>
                <td className={styles.numeric}>{row.dps.toFixed(2)}</td>
                <td className={styles.numeric}>
                  {row.facilitatedDps > 0 ? row.facilitatedDps.toFixed(2) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <table>
          <caption>Status effect output, per second</caption>
          <thead>
            <tr>
              <th>Status</th>
              <th className={styles.numeric}>Per second</th>
            </tr>
          </thead>
          <tbody>
            {statusRows.length === 0 && (
              <tr>
                <td colSpan={2}>No active status effects.</td>
              </tr>
            )}
            {statusRows.map(([status, value]) => (
              <tr key={status}>
                {/* Shield deals no damage — it's a granted/sec rate, not a damage/sec rate like
                    the other three (data-model.md's "Shield counted as an output stat"). The
                    status name carries its published colour (FR-029), the same colour the card
                    stat lines and the grid badges use. */}
                <td style={{ color: statusColor(status as "Burn" | "Poison" | "Shock" | "Shield"), fontWeight: 600 }}>
                  {status === "Shield" ? "Shield (granted)" : status}
                </td>
                <td className={styles.numeric}>{value.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
