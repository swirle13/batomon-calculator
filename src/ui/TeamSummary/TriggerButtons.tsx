import { useTeamConfig } from "../../context/TeamConfigContext";
import { manualTriggersFor, modifiersForPress } from "../../data/triggers";
import { STAT_COLORS, type StatColorKey } from "../../data/statColors";
import type { CreatureRecord, ModifierStat, TeamPlacement } from "../../data/types";
import styles from "./TriggerButtons.module.css";

/**
 * One-press buttons for abilities the battle engine cannot trigger.
 *
 * Craghorn gains +20 Damage and +20 Shield every time you use an item. That is a real ability with
 * real numbers, but "using an item" happens outside the battle being simulated, so there is nothing
 * for the engine to hook — and recording it meant typing two modifiers by hand, every time.
 *
 * These buttons bank one occurrence per press. They are driven entirely by the creature's own
 * `manualTrigger` data through `manualTriggersFor`, so a creature gaining one of these abilities is
 * a data change with no code here, and a creature without one renders nothing at all.
 *
 * ## Why they write modifiers rather than a separate counter
 *
 * A banked trigger is indistinguishable from a modifier the user typed — both are "this creature
 * carries a bonus the engine cannot derive". Writing to the same place means one representation,
 * one display path, and the build code already round-trips it. `addPlacementModifier` accumulates
 * same-stat entries, so pressing twice gives one chip at double the amount rather than two chips,
 * which is what pressing twice should mean.
 */
interface TriggerButtonsProps {
  creature: CreatureRecord;
  placement: TeamPlacement;
}

/** Which colour a modifier's stat should read as, so the preview matches the stat badges. */
const STAT_KEY: Partial<Record<ModifierStat, StatColorKey>> = {
  damageFlatAdd: "damage",
  burnAmountAdd: "burn",
  poisonAmountAdd: "poison",
  shockAmountAdd: "shock",
  shieldAmountAdd: "shield",
  multicastAdd: "multicast",
};

const STAT_LABEL: Partial<Record<ModifierStat, string>> = {
  damageFlatAdd: "Damage",
  burnAmountAdd: "Burn",
  poisonAmountAdd: "Poison",
  shockAmountAdd: "Shock",
  shieldAmountAdd: "Shield",
  multicastAdd: "Multicast",
};

export function TriggerButtons({ creature, placement }: TriggerButtonsProps) {
  const { addPlacementModifier, removePlacementModifier } = useTeamConfig();
  const triggers = manualTriggersFor(creature);
  if (triggers.length === 0) return null;

  // Only the modifiers these buttons could have produced, so "Reset" cannot discard something the
  // user typed by hand for an unrelated reason.
  const bankedStats = new Set(triggers.flatMap((t) => t.effects.map((e) => e.stat)));
  const banked = (placement.modifiers ?? []).filter((m) => bankedStats.has(m.stat));

  return (
    <div className={styles.wrap}>
      {triggers.map((trigger) => (
        <div key={trigger.trigger} className={styles.row}>
          <button
            type="button"
            className={styles.button}
            title={`${trigger.definition.description} Each press banks it once.`}
            onClick={() => {
              for (const modifier of modifiersForPress(trigger)) {
                addPlacementModifier(placement.slot, modifier);
              }
            }}
          >
            + {trigger.definition.actionLabel}
          </button>
          <span className={styles.effects}>
            {trigger.effects.map((e) => (
              <span
                key={e.stat}
                className={styles.effect}
                style={{ color: STAT_COLORS[STAT_KEY[e.stat] ?? "damage"] }}
              >
                +{e.amount} {STAT_LABEL[e.stat] ?? e.stat}
              </span>
            ))}
          </span>
        </div>
      ))}

      {banked.length > 0 && (
        <button
          type="button"
          className={styles.reset}
          title="Clears only the bonuses these buttons added, not modifiers you entered yourself."
          onClick={() => {
            for (const m of banked) removePlacementModifier(placement.slot, m.id);
          }}
        >
          Reset banked
        </button>
      )}
    </div>
  );
}
