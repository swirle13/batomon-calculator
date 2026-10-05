import type { SimulationResult, TeamConfiguration } from "../../data/types";
import { getCreatureById } from "../../data/corpus";

interface TeamSummaryProps {
  config: TeamConfiguration;
  result: SimulationResult;
}

/**
 * FR-009: show each creature's DPS and each active status effect's per-second value side by
 * side, reading only from the one `SimulationResult` the Calculator view computed (never a
 * separate recomputation — Constitution's "cannot silently diverge" rule).
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
    return { key, name: creature?.name ?? placement.creatureId, slot: placement.slot, dps, facilitatedDps };
  });

  const statusRows = Object.entries(result.perStatusPerSecond).filter(([, value]) => value > 0);

  return (
    <section>
      <h2>Team Summary</h2>
      <table>
        <caption>Damage per second, by creature</caption>
        <thead>
          <tr>
            <th>Creature</th>
            <th>Slot</th>
            <th>DPS</th>
            <th title="Damage this creature's own status grants (e.g. Shock) enabled on other hits, not counted in its own DPS">
              Facilitated DPS
            </th>
          </tr>
        </thead>
        <tbody>
          {dpsRows.length === 0 && (
            <tr>
              <td colSpan={4}>No creatures placed yet.</td>
            </tr>
          )}
          {dpsRows.map((row) => (
            <tr key={row.key}>
              <td>{row.name}</td>
              <td>
                {row.slot.row} {row.slot.col + 1}
              </td>
              <td>{row.dps.toFixed(2)}</td>
              <td>{row.facilitatedDps > 0 ? row.facilitatedDps.toFixed(2) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table>
        <caption>Status effect output, per second</caption>
        <thead>
          <tr>
            <th>Status</th>
            <th>Per second</th>
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
                  the other three (data-model.md's "Shield counted as an output stat"). */}
              <td>{status === "Shield" ? "Shield (granted)" : status}</td>
              <td>{value.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
