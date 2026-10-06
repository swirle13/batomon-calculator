import { useState } from "react";
import { corpus } from "../../data/corpus";
import { useTeamConfig } from "../../context/TeamConfigContext";

/**
 * Multi-select Trinket control (FR-027, 2026-10-06 round 5), mirroring `TrainerPicker`'s
 * single-select pattern. Selected trinkets whose `effectTags` map onto this engine's flat
 * team-wide `ModifierStat` vocabulary are automatically reflected in the DPS table
 * (data-model.md's "Trinket effect application" amendment) -- the rest are browsable/
 * selectable for reference only, same as most Trainer abilities.
 */
export function TrinketPicker() {
  const { config, addTrinketId, removeTrinketId } = useTeamConfig();
  const [pendingId, setPendingId] = useState("");

  const selected = config.trinketIds
    .map((id) => corpus.trinkets.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => t !== undefined);

  const available = corpus.trinkets
    .filter((t) => !config.trinketIds.includes(t.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <label>
        Trinkets:{" "}
        <select
          value={pendingId}
          onChange={(e) => {
            const value = e.target.value;
            if (value !== "") {
              addTrinketId(value);
              setPendingId("");
            }
          }}
        >
          <option value="">— add a trinket —</option>
          {available.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.rarity ? ` (${t.rarity})` : ""}
              {t.effectTags && t.effectTags.length > 0 ? " ★ affects DPS" : ""}
            </option>
          ))}
        </select>
      </label>
      {selected.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0.5rem 0" }}>
          {selected.map((t) => (
            <li key={t.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <button type="button" onClick={() => removeTrinketId(t.id)} aria-label={`Remove ${t.name}`}>
                ×
              </button>
              <strong>{t.name}</strong>
              <small style={{ opacity: 0.8 }}>{t.effectText}</small>
              {t.effectTags && t.effectTags.length > 0 && (
                <small title="This trinket's effect is reflected in the DPS table below" style={{ color: "#9ca3af" }}>
                  ★ affects DPS
                </small>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
