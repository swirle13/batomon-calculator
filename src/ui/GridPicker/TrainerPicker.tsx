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
 * ## Region is first, but it does not gate anything
 *
 * The ask was "the player chooses a region before they choose anything else", so the region control
 * sits above the trainer — but it no longer DISABLES the trainer, and the creature pool no longer
 * excludes other regions.
 *
 * Gating was wrong because the region is not actually a wall: the Travelling Merchant event can put
 * a rare creature from another region in your shop, and once it is on your team you need to be able
 * to find it. A filter that hides it makes the tool unable to represent a board the player is
 * looking at, which is the one thing it must always do.
 *
 * Region still earns its place: it drives Smuggler's "opposite region" list, and out-of-region
 * creatures are MARKED in the picker rather than removed.
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
