import { useState } from "react";
import type { ModifierStat, StatModifier, GridSlot } from "../../data/types";
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

function ModifierForm({ onAdd }: { onAdd: (m: Omit<StatModifier, "id">) => void }) {
  const [label, setLabel] = useState("");
  const [stat, setStat] = useState<ModifierStat>("damageFlatAdd");
  const [amount, setAmount] = useState("0");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = Number(amount);
        if (Number.isNaN(parsed) || parsed === 0) return;
        onAdd({ label: label.trim() || "(no note)", stat, amount: parsed });
        setLabel("");
        setAmount("0");
      }}
      style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", marginTop: "0.5rem" }}
    >
      <input
        type="text"
        placeholder="Note (e.g. Round 2 win bonus)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        aria-label="Modifier note"
      />
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
  );
}

function ModifierList({ modifiers, onRemove }: { modifiers: StatModifier[]; onRemove: (id: string) => void }) {
  if (modifiers.length === 0) return <p><em>No modifiers yet.</em></p>;
  return (
    <table>
      <thead>
        <tr>
          <th>Note</th>
          <th>Stat</th>
          <th>Amount</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {modifiers.map((m) => (
          <tr key={m.id}>
            <td>{m.label}</td>
            <td>{STAT_OPTIONS.find((o) => o.value === m.stat)?.label ?? m.stat}</td>
            <td>{m.amount > 0 ? `+${m.amount}` : m.amount}</td>
            <td>
              <button type="button" onClick={() => onRemove(m.id)} aria-label={`Remove modifier: ${m.label}`}>
                Remove
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function slotLabel(slot: GridSlot): string {
  return `${slot.row} row, slot ${slot.col + 1}`;
}

/**
 * User-requested amendment (data-model.md "Manual carry-over StatModifiers", 2026-10-05):
 * lets the user describe the net effect of previous-round carry-over bonuses (e.g. "+10
 * Damage to every ally from a win condition") as flat adjustments on top of a creature's base
 * stats for this one simulated battle, either team-wide or scoped to a single placement.
 */
export function ModifierEditor() {
  const { config, addTeamModifier, removeTeamModifier, addPlacementModifier, removePlacementModifier } =
    useTeamConfig();

  return (
    <section>
      <h2>Modifiers</h2>
      <p>
        <em>
          Carry-over bonuses from previous rounds (the engine simulates one battle at a time, not a
          whole match) — e.g. a creature's "On Victory" ability granting +10 Damage to every ally.
          Describe the net effect here rather than the whole match history.
        </em>
      </p>

      <h3>Team-wide (applies to every placed Banto)</h3>
      <ModifierList modifiers={config.teamModifiers ?? []} onRemove={removeTeamModifier} />
      <ModifierForm onAdd={addTeamModifier} />

      <h3>Per-Banto</h3>
      {config.placements.length === 0 && <p>Place a Banto in the grid above to add per-Banto modifiers.</p>}
      {config.placements.map((placement) => {
        const creature = getCreatureById(placement.creatureId);
        return (
          <div key={`${placement.slot.row}-${placement.slot.col}`} style={{ marginBottom: "0.75rem" }}>
            <h4>
              {creature?.name ?? placement.creatureId} ({slotLabel(placement.slot)})
            </h4>
            <ModifierList
              modifiers={placement.modifiers ?? []}
              onRemove={(id) => removePlacementModifier(placement.slot, id)}
            />
            <ModifierForm onAdd={(m) => addPlacementModifier(placement.slot, m)} />
          </div>
        );
      })}
    </section>
  );
}
