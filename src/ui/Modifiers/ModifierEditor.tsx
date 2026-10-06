import { useState } from "react";
import type { ModifierStat, GridSlot, TeamPlacement } from "../../data/types";
import { getCreatureByIdAndLevel } from "../../data/corpus";
import { useTeamConfig } from "../../context/TeamConfigContext";
import { Sprite } from "../shared/Sprite";
import { slotKey } from "../../engine/grid";
import styles from "./ModifierEditor.module.css";

/**
 * Short labels only (FR-039c). The unit/format explanation that used to live inside the Cooldown
 * Speed option's own text now sits in one supporting line below the list, where it is readable
 * without opening a dropdown and doesn't stretch the control.
 */
const STAT_OPTIONS: { value: ModifierStat; label: string }[] = [
  { value: "damageFlatAdd", label: "Damage" },
  { value: "cooldownFlatAddSeconds", label: "Cooldown (seconds)" },
  { value: "cooldownSpeedAdd", label: "Cooldown Speed" },
  { value: "burnAmountAdd", label: "Burn applied" },
  { value: "poisonAmountAdd", label: "Poison applied" },
  { value: "shockAmountAdd", label: "Shock applied" },
  { value: "shieldAmountAdd", label: "Shield applied" },
];

function statLabel(stat: ModifierStat): string {
  return STAT_OPTIONS.find((o) => o.value === stat)?.label ?? stat;
}

/**
 * Per-creature carry-over modifiers (FR-039, 2026-10-06 round 6, research.md H7).
 *
 * Four user-requested changes from the previous design, which was one global scope dropdown plus
 * one combined table:
 *
 * 1. **Collapsed by default** — this is occasional-use, and it previously occupied permanent
 *    vertical space between the DPS tables and the chart for a feature most sessions never touch.
 * 2. **No team-wide option.** Removed from the UI only. `TeamConfiguration.teamModifiers` and
 *    `simulate()`'s team-wide summation both stay, because round 5 routes selected Trinkets'
 *    `effectTags` through exactly that path — deleting the engine support would silently disable
 *    trinkets. This is an affordance removal, not a capability removal.
 * 3. **Short stat labels**, with the decimal/percent explanation as supporting text.
 * 4. **Integrated per creature.** One row per placed creature, each with its own add-control and
 *    its own modifier chips, so the creature a modifier belongs to is structural rather than
 *    something the user picks from a dropdown and has to keep re-binding as the roster shifts
 *    around it (the user's "new mons will be added before/after a mon that affects the whole team"
 *    point).
 */
export function ModifierEditor() {
  const { config, addPlacementModifier, removePlacementModifier } = useTeamConfig();

  return (
    <details className={styles.section}>
      <summary className={styles.summary}>
        Modifiers
        <span className={styles.summaryHint}>
          {countModifiers(config.placements) > 0
            ? ` — ${countModifiers(config.placements)} active`
            : " — optional carry-over bonuses"}
        </span>
      </summary>

      <p className={styles.intro}>
        Carry-over bonuses from previous rounds — the engine simulates one battle at a time, not a
        whole match. For example, a creature's "On Victory" ability that granted it +10 Damage
        permanently earlier in the run.
      </p>

      {config.placements.length === 0 ? (
        <p className={styles.empty}>
          <em>Place a Batomon in the grid to give it a modifier.</em>
        </p>
      ) : (
        <>
          <ul className={styles.rows}>
            {config.placements.map((placement) => (
              <PlacementModifierRow
                key={slotKey(placement.slot)}
                placement={placement}
                onAdd={(stat, amount) => addPlacementModifier(placement.slot, { stat, amount })}
                onRemove={(id) => removePlacementModifier(placement.slot, id)}
              />
            ))}
          </ul>
          <p className={styles.note}>
            Cooldown Speed is a decimal, not a percentage: enter <code>0.2</code> for +20%. Damage
            and status amounts are flat additions. A modifier can only scale an effect the creature
            already has — it never creates a new attack on a creature with no published damage.
          </p>
        </>
      )}
    </details>
  );
}

function countModifiers(placements: TeamPlacement[]): number {
  return placements.reduce((sum, p) => sum + (p.modifiers?.length ?? 0), 0);
}

interface PlacementModifierRowProps {
  placement: TeamPlacement;
  onAdd: (stat: ModifierStat, amount: number) => void;
  onRemove: (id: string) => void;
}

/** One creature's row: who it is, its current modifier chips, and its own add-control. */
function PlacementModifierRow({ placement, onAdd, onRemove }: PlacementModifierRowProps) {
  const creature = getCreatureByIdAndLevel(placement.creatureId, placement.level);
  const name = creature?.name ?? placement.creatureId;
  const [stat, setStat] = useState<ModifierStat>("damageFlatAdd");
  const [amount, setAmount] = useState("0");

  function handleAdd() {
    const parsed = Number(amount);
    if (Number.isNaN(parsed) || parsed === 0) return;
    onAdd(stat, parsed);
    setAmount("0");
  }

  return (
    <li className={styles.row}>
      <div className={styles.rowHeader}>
        <Sprite spriteFile={creature?.spriteFile} kind="monster" size={24} alt={name} />
        <strong>{name}</strong>
        <small className={styles.level}>Lv.{placement.level}</small>
      </div>

      {(placement.modifiers ?? []).length > 0 && (
        <ul className={styles.chips}>
          {(placement.modifiers ?? []).map((modifier) => (
            <li key={modifier.id} className={styles.chip}>
              <span>
                {statLabel(modifier.stat)} {modifier.amount > 0 ? `+${modifier.amount}` : modifier.amount}
              </span>
              <button
                type="button"
                onClick={() => onRemove(modifier.id)}
                aria-label={`Remove ${statLabel(modifier.stat)} modifier from ${name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.addControls}>
        <select
          value={stat}
          onChange={(e) => setStat(e.target.value as ModifierStat)}
          aria-label={`Stat to modify for ${name}`}
        >
          {STAT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          type="number"
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-label={`Amount to add for ${name}`}
          className={styles.amount}
        />
        <button type="button" onClick={handleAdd} aria-label={`Add modifier to ${name}`}>
          Add
        </button>
      </div>
    </li>
  );
}

export type { GridSlot };
