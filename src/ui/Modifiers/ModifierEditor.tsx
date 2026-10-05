import { useState, type FormEvent } from "react";
import type { ModifierStat, GridSlot } from "../../data/types";
import { getCreatureById } from "../../data/corpus";
import { useTeamConfig } from "../../context/TeamConfigContext";

const STAT_OPTIONS: { value: ModifierStat; label: string }[] = [
  { value: "damageFlatAdd", label: "Damage (flat +)" },
  { value: "cooldownFlatAddSeconds", label: "Cooldown (flat seconds +)" },
  { value: "cooldownSpeedAdd", label: "Cooldown Speed (+decimal, e.g. 0.2 = +20%)" },
  { value: "burnAmountAdd", label: "Burn applied (flat +)" },
  { value: "poisonAmountAdd", label: "Poison applied (flat +)" },
  { value: "shockAmountAdd", label: "Shock applied (flat +)" },
  { value: "shieldAmountAdd", label: "Shield applied (flat +)" },
];

function statLabel(stat: ModifierStat): string {
  return STAT_OPTIONS.find((o) => o.value === stat)?.label ?? stat;
}

function slotLabel(slot: GridSlot): string {
  return `${slot.row === "back" ? "Back" : "Front"} ${slot.col + 1}`;
}

const TEAM_WIDE_SCOPE = "team";

/**
 * User-requested redesign (2026-10-05): the previous one-section-per-placement layout was
 * unsightly; this is one compact add-form plus one combined table (team-wide and per-Banto
 * modifiers together, distinguished by a Scope column), and drops the free-text note field.
 */
export function ModifierEditor() {
  const { config, addTeamModifier, removeTeamModifier, addPlacementModifier, removePlacementModifier } =
    useTeamConfig();

  const scopeOptions = [
    { value: TEAM_WIDE_SCOPE, label: "Team-wide (every placed Banto)" },
    ...config.placements.map((p) => ({
      value: `${p.slot.row}-${p.slot.col}`,
      label: `${getCreatureById(p.creatureId)?.name ?? p.creatureId} (${slotLabel(p.slot)})`,
    })),
  ];

  const [scope, setScope] = useState<string>(TEAM_WIDE_SCOPE);
  const [stat, setStat] = useState<ModifierStat>("damageFlatAdd");
  const [amount, setAmount] = useState("0");

  const scopeStillValid = scopeOptions.some((o) => o.value === scope);
  const effectiveScope = scopeStillValid ? scope : TEAM_WIDE_SCOPE;

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    const parsed = Number(amount);
    if (Number.isNaN(parsed) || parsed === 0) return;
    if (effectiveScope === TEAM_WIDE_SCOPE) {
      addTeamModifier({ stat, amount: parsed });
    } else {
      const [row, col] = effectiveScope.split("-");
      addPlacementModifier({ row: row as GridSlot["row"], col: Number(col) as GridSlot["col"] }, { stat, amount: parsed });
    }
    setAmount("0");
  }

  type Row = { scopeLabel: string; stat: ModifierStat; amount: number; onRemove: () => void; key: string };
  const rows: Row[] = [
    ...(config.teamModifiers ?? []).map((m) => ({
      scopeLabel: "Team-wide",
      stat: m.stat,
      amount: m.amount,
      onRemove: () => removeTeamModifier(m.id),
      key: `team-${m.id}`,
    })),
    ...config.placements.flatMap((p) =>
      (p.modifiers ?? []).map((m) => ({
        scopeLabel: `${getCreatureById(p.creatureId)?.name ?? p.creatureId} (${slotLabel(p.slot)})`,
        stat: m.stat,
        amount: m.amount,
        onRemove: () => removePlacementModifier(p.slot, m.id),
        key: `${p.slot.row}-${p.slot.col}-${m.id}`,
      })),
    ),
  ];

  return (
    <section>
      <h2>Modifiers</h2>
      <p>
        <em>
          Carry-over bonuses from previous rounds (the engine simulates one battle at a time, not a
          whole match) — e.g. a creature's "On Victory" ability granting +10 Damage to every ally.
        </em>
      </p>

      <form
        onSubmit={handleAdd}
        style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", marginBottom: "0.5rem" }}
      >
        <select value={effectiveScope} onChange={(e) => setScope(e.target.value)} aria-label="Modifier scope">
          {scopeOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select value={stat} onChange={(e) => setStat(e.target.value as ModifierStat)} aria-label="Modifier stat">
          {STAT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <input
          type="number"
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-label="Modifier amount"
          style={{ width: "5rem" }}
        />
        <button type="submit">Add</button>
      </form>

      {rows.length === 0 ? (
        <p><em>No modifiers yet.</em></p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Scope</th>
              <th>Stat</th>
              <th>Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{r.scopeLabel}</td>
                <td>{statLabel(r.stat)}</td>
                <td>{r.amount > 0 ? `+${r.amount}` : r.amount}</td>
                <td>
                  <button type="button" onClick={r.onRemove} aria-label={`Remove modifier on ${r.scopeLabel}`}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
