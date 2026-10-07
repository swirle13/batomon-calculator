import { useMemo, useState } from "react";
import { distinctCreatures } from "../../../data/corpus";
import { isInOppositeRegion, regionsOf } from "../../../data/typing";
import { useTeamConfig } from "../../../context/TeamConfigContext";
import { RARITIES_DESC } from "../../../data/statColors";
import { Modal, TextField } from "../../primitives";
import { Sprite } from "../Sprite";
import styles from "./TrainerCard.module.css";

/**
 * Picks the 9 species a set-designating trainer affects (T235 / FR-090).
 *
 * ## User-chosen, never generated
 *
 * The obvious implementation is to roll 9 random species, since that is what the game does. It
 * would also be useless: the player is looking at a run that has *already* rolled, and a second
 * independent roll produces a board they cannot reconcile with their screen. The app models the
 * state of their game, so the set is always theirs to enter.
 *
 * ## The rarity shape is guidance, not a rule
 *
 * Painter's assignment is reported as 2 Common / 2 Uncommon / 2 Rare / 2 Super Rare / 1 Legendary.
 * The source says "typically", so it is shown as a target and never enforced — hard-locking a soft
 * constraint would make the tool unable to represent a real run that happens to differ. The shape
 * is Painter's only; Smuggler's text mentions neither 9 creatures nor rarity.
 */
const PAINTER_RARITY_SHAPE: Record<string, number> = {
  Common: 2,
  Uncommon: 2,
  Rare: 2,
  "Super Rare": 2,
  Legendary: 1,
};

const TARGET_SIZE = 9;

interface AffectedCreaturePickerProps {
  kind: "painted" | "smuggled";
  onClose: () => void;
}

export function AffectedCreaturePicker({ kind, onClose }: AffectedCreaturePickerProps) {
  const { config, setPaintedCreatureIds, setSmuggledCreatureIds } = useTeamConfig();
  const [query, setQuery] = useState("");

  const selected = (kind === "painted" ? config.paintedCreatureIds : config.smuggledCreatureIds) ?? [];
  const setSelected = kind === "painted" ? setPaintedCreatureIds : setSmuggledCreatureIds;

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return distinctCreatures.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q)) return false;
      // Smuggler brings in creatures from the OPPOSITE region — "in the other region and not in
      // this one", never the set complement. 14 species are in both regions and 13 in neither, so
      // a `!== selectedRegion` filter would wrongly offer all 27 (FR-088).
      if (kind === "smuggled") return isInOppositeRegion(c.id, config.selectedRegion);
      return true;
    });
  }, [query, kind, config.selectedRegion]);

  const toggle = (id: string) =>
    setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const rarityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const id of selected) {
      const c = distinctCreatures.find((x) => x.id === id);
      if (c) counts[c.rarity] = (counts[c.rarity] ?? 0) + 1;
    }
    return counts;
  }, [selected]);

  const needsRegion = kind === "smuggled" && !config.selectedRegion;

  return (
    <Modal
      isOpen
      title={kind === "painted" ? "Painted species" : "Smuggled species"}
      onClose={onClose}
    >
      <p className={styles.pickerIntro}>
        {kind === "painted"
          ? "Pick the species your Painter painted this run. Painted species count as every type."
          : "Pick the species your Smuggler brought in from the other region."}{" "}
        <strong>
          {selected.length}/{TARGET_SIZE}
        </strong>{" "}
        selected.
      </p>

      {needsRegion && (
        <p className={styles.pickerWarn}>
          Choose a region first — &ldquo;the other region&rdquo; has no meaning until you do.
        </p>
      )}

      {/* Painter's rarity shape, as a target the user can ignore. */}
      {kind === "painted" && (
        <div className={styles.shapeRow}>
          {RARITIES_DESC.filter((r) => PAINTER_RARITY_SHAPE[r] !== undefined).map((r) => {
            const have = rarityCounts[r] ?? 0;
            const want = PAINTER_RARITY_SHAPE[r]!;
            return (
              <span
                key={r}
                className={`${styles.shapeChip} ${have === want ? styles.shapeMet : ""}`}
                title={`Typically ${want} ${r}; this is guidance, not a rule`}
              >
                {r} {have}/{want}
              </span>
            );
          })}
        </div>
      )}

      <TextField
        type="search"
        block
        className={styles.pickerSearch}
        placeholder="Search species…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search species"
      />

      <ul className={styles.pickerList}>
        {candidates.map((c) => {
          const on = selected.includes(c.id);
          const regions = regionsOf(c.id);
          return (
            <li key={c.id}>
              <button
                type="button"
                className={`${styles.pickerItem} ${on ? styles.pickerItemOn : ""}`}
                aria-pressed={on}
                onClick={() => toggle(c.id)}
              >
                {/* 24 = a clean 0.5x downscale; 32 was 0.667x and dropped source pixels unevenly. */}
                <Sprite spriteFile={c.spriteFile} kind="monster" size={24} alt={c.name} />
                <span className={styles.pickerName}>{c.name}</span>
                <span className={styles.pickerMeta}>
                  {c.rarity}
                  {regions.length > 0 && ` · ${regions.map((r) => (r === "pantra" ? "Pantra" : "Jinto")).join("/")}`}
                </span>
              </button>
            </li>
          );
        })}
        {candidates.length === 0 && (
          <li className={styles.pickerEmpty}>
            {needsRegion ? "No region selected." : "No species match."}
          </li>
        )}
      </ul>
    </Modal>
  );
}
