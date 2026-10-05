import { Fragment } from "react";
import type { GridCol, GridRow, Rarity } from "../../data/types";
import { corpus } from "../../data/corpus";
import { useTeamConfig } from "../../context/TeamConfigContext";
import styles from "./GridPicker.module.css";

/**
 * 2x3 slot assignment UI (FR-005). Back row first (research.md B5 — A-row/back, B-row/front),
 * bound directly to TeamConfigContext; enforces data-model.md's placement rules by construction
 * (one <select> per slot, so duplicate-slot assignment is structurally impossible from this UI).
 */
const ROWS: GridRow[] = ["back", "front"];
const COLS: GridCol[] = [0, 1, 2];

/**
 * User-requested: rarity isn't otherwise visible in a plain flat <option> list. Grouping by
 * rarity via native <optgroup> needs no extra UI surface and keeps the plain dropdown the user
 * asked to keep, while making it much faster to visually scan for a specific rarity.
 */
const RARITY_ORDER: Rarity[] = ["Mythical", "Legendary", "SuperRare", "Rare", "Uncommon", "Common"];
const creaturesByRarity = RARITY_ORDER.map((rarity) => ({
  rarity,
  creatures: corpus.creatures.filter((c) => c.rarity === rarity).sort((a, b) => a.name.localeCompare(b.name)),
}));

export function GridPicker() {
  const { config, setPlacement } = useTeamConfig();

  return (
    <div className={styles.grid}>
      {ROWS.map((row) => (
        <Fragment key={row}>
          <div className={styles.rowLabel}>{row === "back" ? "Back row" : "Front row"}</div>
          {COLS.map((col) => {
            const placement = config.placements.find((p) => p.slot.row === row && p.slot.col === col);
            return (
              <div key={`${row}-${col}`} className={styles.slot}>
                <select
                  value={placement?.creatureId ?? ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    setPlacement({ row, col }, value === "" ? null : value, 1);
                  }}
                  aria-label={`${row} row, slot ${col + 1}`}
                >
                  <option value="">— empty —</option>
                  {creaturesByRarity.map(
                    ({ rarity, creatures }) =>
                      creatures.length > 0 && (
                        <optgroup key={rarity} label={rarity}>
                          {creatures.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </optgroup>
                      ),
                  )}
                </select>
              </div>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
