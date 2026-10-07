import type { SimulationResult, StatusEffectType, TeamConfiguration } from "../../data/types";
import { getCreatureById } from "../../data/corpus";
import { statusColor } from "../../data/statColors";
import { formatRate } from "../../data/format";
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
  // FR-067: placements follow insertion order, so sort for a stable, readable table.
  const dpsRows = [...config.placements].map((placement) => {
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
  }).sort((a, b) => a.name.localeCompare(b.name));

  // FR-067 (WI-016): sorted at the point of display. These followed `Object.entries` key order,
  // i.e. the order the engine happened to build the record in -- a list whose order was an accident.
  const statusRows = Object.entries(result.perStatusPerSecond)
    .filter(([, value]) => value > 0)
    .sort(([a], [b]) => a.localeCompare(b));

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
                title="Damage this creature caused through the statuses it applied -- Burn/Poison ticks and Shock procs on other creatures' hits. Counted separately from its own direct damage, never folded into it."
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
            {/* FR-072 (WI-002): a combined total. Direct + facilitated partition all damage with no
                overlap, so summing them is safe -- unlike summing `perStatusPerSecond`, whose Shield
                entry is granted-not-damage. */}
            {dpsRows.length > 0 && (
              <tr className={styles.totalRow}>
                <th scope="row">Total</th>
                <th className={styles.numeric}>
                  {dpsRows.reduce((sum, r) => sum + r.dps, 0).toFixed(2)}
                </th>
                <th className={styles.numeric}>
                  {dpsRows.reduce((sum, r) => sum + r.facilitatedDps, 0).toFixed(2)}
                </th>
              </tr>
            )}
          </tbody>
        </table>

        <table>
          <caption>Status effect output</caption>
          <thead>
            <tr>
              <th>Status</th>
              <th className={styles.numeric} title="Damage per second, averaged across the whole simulated window">
                Dmg/s (avg)
              </th>
              <th className={styles.numeric} title="Damage per second as the window closes. For a status whose stacks never decay (Poison) this is much higher than the average, because the rate climbs all battle.">
                Dmg/s (end)
              </th>
              {/*
                Growth/s² was removed 2026-10-06. For Poison it was ALWAYS exactly equal to
                Applied/s — not by coincidence but structurally: Poison stacks never decay and a
                tick deals the current stack count, so the damage rate grows by precisely the
                applied rate. Verified identical across every team tried. For Shield it was always
                0 (Shield is not damage), and for Burn and Shock it was a small second derivative
                in units nobody reasons in, saying less clearly what the DPS-over-time chart and
                the avg-vs-end pair beside it already show.

                Applied/s stays: it is the only meaningful figure for Shield, where "damage" has no
                meaning, and it separates "I apply a lot of Poison" from "my Poison deals a lot".
              */}
              <th className={styles.numeric} title="Status stacks applied per second -- the input rate, NOT damage">
                Applied/s
              </th>
            </tr>
          </thead>
          <tbody>
            {statusRows.length === 0 && (
              <tr>
                <td colSpan={5}>No active status effects.</td>
              </tr>
            )}
            {statusRows.map(([status, value]) => (
              <tr key={status}>
                {/* Shield deals no damage — it's a granted/sec rate, not a damage/sec rate like
                    the other three (data-model.md's "Shield counted as an output stat"). The
                    status name carries its published colour (FR-029), the same colour the card
                    stat lines and the grid badges use. */}
                <td style={{ color: statusColor(status as "Burn" | "Poison" | "Shock" | "Shield"), fontWeight: 600 }}>
                  {status}
                </td>
                <td className={styles.numeric}>{formatRate(value)}</td>
                <td className={styles.numeric}>
                  {formatRate(result.perStatusFinalDamageRate[status as StatusEffectType])}
                </td>
                <td className={styles.numeric}>
                  {formatRate(result.perStatusAppliedPerSecond[status as StatusEffectType])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.note}>
        Status damage climbs as a fight goes on, so <strong>Dmg/s (avg)</strong> understates a long
        battle — compare it with <strong>Dmg/s (end)</strong>. Poison never stops growing: its
        stacks don&rsquo;t decay at all. Burn grows too, for most of a realistic fight — each burn
        instance sheds 1 stack per tick no matter how big it was, so a large application takes a
        long time to burn out (a 170-stack burn lasts ~85s) and new ones pile up faster than old
        ones drain. Only small burn stacks settle quickly.{" "}
        <strong>Applied/s</strong> is the stack <em>input</em> rate, not damage.
      </p>
    </section>
  );
}
