import { corpus } from "../../data/corpus";
import { useTeamConfig } from "../../context/TeamConfigContext";
import { TrainerCard } from "../shared/TrainerCard/TrainerCard";
import type { RegionId } from "../../data/types";

/**
 * Region + Trainer selection (FR-006, FR-087, FR-089).
 *
 * The trainer `<select>` is kept and a `TrainerCard` now renders *beneath* it. The card replaces
 * the select as the trainer UI in the sense that matters — it is where the ability, its provenance,
 * and the affected-species picker live — but a 23-item list still picks faster from a native
 * control than from a grid of cards, so selection stays a select.
 *
 * ## Region comes first, and gates
 *
 * "The player chooses a region before they choose anything else when starting a game." The region
 * control is therefore rendered above the trainer and the trainer is disabled until a region is
 * chosen. That ordering is not cosmetic: Smuggler's entire ability is "the other region", which has
 * no referent until one is picked.
 */
const REGIONS: { id: RegionId; label: string }[] = [
  { id: "pantra", label: "Pantra" },
  { id: "jinto", label: "Jinto" },
];

export function TrainerPicker() {
  const { config, setTrainerId, setSelectedRegion } = useTeamConfig();
  const trainer = corpus.trainers.find((t) => t.id === config.trainerId) ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <label>
        Region:{" "}
        <select
          value={config.selectedRegion ?? ""}
          onChange={(e) => setSelectedRegion(e.target.value === "" ? undefined : e.target.value)}
        >
          <option value="">— choose a region —</option>
          {REGIONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        Trainer:{" "}
        <select
          value={config.trainerId ?? ""}
          disabled={!config.selectedRegion}
          title={config.selectedRegion ? undefined : "Choose a region first"}
          onChange={(e) => setTrainerId(e.target.value === "" ? null : e.target.value)}
        >
          <option value="">— none —</option>
          {[...corpus.trainers]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
        </select>
      </label>

      {trainer && <TrainerCard trainer={trainer} />}
    </div>
  );
}
