import { useTeamConfig } from "../../context/TeamConfigContext";
import { resolveCreatureVariant } from "../../data/corpus";
import { manualTriggersFor, modifiersForPress } from "../../data/triggers";
import { STAT_COLORS, type StatColorKey } from "../../data/statColors";
import type { CreatureRecord, GridSlot, ModifierStat, TeamPlacement } from "../../data/types";
import { slotKey } from "../../engine/grid";
import { recipientsOfPress } from "../../engine/manualTriggers";
import { Button } from "../primitives";
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
 *
 * ## A press is not necessarily about the card it sits on
 *
 * Brawlmantis reads "This and Common allies gain +10 Damage permanently", so one press writes to up
 * to six slots. `recipientsOfPress` decides which; this component only renders the result and
 * writes a modifier per recipient. Before that existed, a press banked the bonus on the presser
 * alone, which is the whole reason the recipient count is now shown next to the button — a press
 * with a board-wide effect should say so before it is pressed.
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
  healAmountAdd: "heal",
  cooldownSpeedAdd: "multicast",
};

const STAT_LABEL: Partial<Record<ModifierStat, string>> = {
  damageFlatAdd: "Damage",
  burnAmountAdd: "Burn",
  poisonAmountAdd: "Poison",
  shockAmountAdd: "Shock",
  shieldAmountAdd: "Shield",
  multicastAdd: "Multicast",
  healAmountAdd: "Heal",
  cooldownSpeedAdd: "Cooldown Speed",
};

/**
 * The amount as the ability text writes it.
 *
 * `cooldownSpeedAdd` is STORED as a fraction — Ninflora's published "+10% Cooldown Speed" is `0.1`,
 * matching `ModifierEditor`'s own `store: (typed) => typed / 100` — so printing the raw number gave
 * a button reading "+0.1 Cooldown Speed" against an ability that says "+10%". Rounded through a
 * tenth of a percent, the same way the modifier chips do it, so `0.1` is "+10%" and a fractional
 * `0.125` is "+12.5%" rather than binary-float noise.
 */
function formatAmount(stat: ModifierStat, amount: number): string {
  if (stat !== "cooldownSpeedAdd") return `+${amount}`;
  return `+${Math.round(amount * 1000) / 10}%`;
}

/** A placement in the shape `selectTargets` reads, carrying the placement so a press can write. */
interface BoardMember {
  slot: GridSlot;
  key: string;
  creature: CreatureRecord;
  placement: TeamPlacement;
}

export function TriggerButtons({ creature, placement }: TriggerButtonsProps) {
  const { config, addPlacementModifier, removePlacementModifier } = useTeamConfig();
  const triggers = manualTriggersFor(creature);
  if (triggers.length === 0) return null;

  /*
   * The whole board, because an ally-wide trigger's recipients are decided by position and rarity
   * rather than by which card is open. Each placement's creature is resolved the same way this
   * card's was, so a shiny or levelled-up ally is matched on the stats it actually has.
   */
  const sourceKey = slotKey(placement.slot);
  const board: BoardMember[] = config.placements.flatMap((p) => {
    const resolved =
      slotKey(p.slot) === sourceKey ? creature : resolveCreatureVariant(p.creatureId, p.level, p.shiny);
    return resolved ? [{ slot: p.slot, key: slotKey(p.slot), creature: resolved, placement: p }] : [];
  });
  // Falls back to a source built from the props, so the component still works when rendered
  // against a placement that is not in the config (component tests do this).
  const source: BoardMember =
    board.find((m) => m.key === sourceKey) ?? { slot: placement.slot, key: sourceKey, creature, placement };

  const recipientsByTrigger = triggers.map((trigger) => ({
    trigger,
    recipients: recipientsOfPress(trigger, source, board, config),
  }));

  /*
   * Only the stats these buttons could have produced, and only on the slots they could have written
   * to — so "Reset" cannot discard a modifier the user typed on an unrelated creature. It still
   * cannot tell a banked +10 Damage from a hand-typed one on a creature it does target, which is
   * the accepted cost of banking into the same representation.
   */
  const bankedStats = new Set(triggers.flatMap((t) => t.effects.map((e) => e.stat)));
  const banked = [...new Map(recipientsByTrigger.flatMap(({ recipients }) => recipients.map((r) => [r.key, r]))).values()]
    .flatMap((r) =>
      (r.placement.modifiers ?? [])
        .filter((m) => bankedStats.has(m.stat))
        .map((m) => ({ slot: r.slot, id: m.id })),
    );

  return (
    <div className={styles.wrap}>
      {recipientsByTrigger.map(({ trigger, recipients }) => (
        <div key={trigger.trigger} className={styles.row}>
          <Button
            size="sm"
            className={styles.button}
            disabled={recipients.length === 0}
            title={`${trigger.definition.description} Each press banks it once.`}
            onClick={() => {
              for (const recipient of recipients) {
                for (const modifier of modifiersForPress(trigger)) {
                  addPlacementModifier(recipient.slot, modifier);
                }
              }
            }}
          >
            + {trigger.definition.actionLabel}
          </Button>
          <span className={styles.effects}>
            {trigger.effects.map((e) => (
              <span
                key={e.stat}
                className={styles.effect}
                style={{ color: STAT_COLORS[STAT_KEY[e.stat] ?? "damage"] }}
              >
                {formatAmount(e.stat, e.amount)} {STAT_LABEL[e.stat] ?? e.stat}
              </span>
            ))}
            {/* Only said when it is news: a self-only trigger would be stating the obvious. */}
            {recipients.length > 1 && (
              <span className={styles.scope}>to {recipients.length} monsters</span>
            )}
          </span>
        </div>
      ))}

      {banked.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className={styles.reset}
          title="Clears only the bonuses these buttons added, not modifiers you entered yourself."
          onClick={() => {
            for (const m of banked) removePlacementModifier(m.slot, m.id);
          }}
        >
          Reset banked
        </Button>
      )}
    </div>
  );
}
