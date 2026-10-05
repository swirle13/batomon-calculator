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
    return { key, name: creature?.name ?? placement.creatureId, slot: placement.slot, dps };
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
          </tr>
        </thead>
        <tbody>
          {dpsRows.length === 0 && (
            <tr>
              <td colSpan={3}>No creatures placed yet.</td>
            </tr>
          )}
          {dpsRows.map((row) => (
            <tr key={row.key}>
              <td>{row.name}</td>
              <td>
                {row.slot.row} {row.slot.col + 1}
              </td>
              <td>{row.dps.toFixed(2)}</td>
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
              <td>{status}</td>
              <td>{value.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
