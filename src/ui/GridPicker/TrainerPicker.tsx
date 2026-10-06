import { corpus } from "../../data/corpus";
import { useTeamConfig } from "../../context/TeamConfigContext";

/** Single-select Trainer control (FR-006), wired into TeamConfigContext.trainerId. */
export function TrainerPicker() {
  const { config, setTrainerId } = useTeamConfig();

  return (
    <label>
      Trainer:{" "}
      <select
        value={config.trainerId ?? ""}
        onChange={(e) => setTrainerId(e.target.value === "" ? null : e.target.value)}
      >
        <option value="">— none —</option>
        {[...corpus.trainers].sort((a, b) => a.name.localeCompare(b.name)).map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}
