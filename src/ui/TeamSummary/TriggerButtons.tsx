import { useTeamConfig } from "../../context/teamConfig";
import { corpus, resolveCreatureVariant } from "../../data/corpus";
import { manualTriggersFor, modifiersForPress } from "../../data/triggers";
import { chosenTrinketGrants, modifiersForGrantPress } from "../../data/trinketGrants";
import { isCreatureScoped } from "../../data/modifierScope";
import { STAT_COLORS } from "../../data/statColors";
import type { CreatureRecord, GridSlot, StatModifier, TeamPlacement } from "../../data/types";
import { slotKey } from "../../engine/grid";
import { recipientsOfPress } from "../../engine/manualTriggers";
import { Button } from "../primitives";
import { Sprite } from "../shared/Sprite";
import styles from "./TriggerButtons.module.css";
import { ModifierStat, StatColorKey } from "../../data/enums";

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
 *
 * ## Why a stepper rather than a button plus a reset
 *
 * Undoing used to be a single "Reset banked" ghost button that appeared under the whole group once
 * anything was banked and cleared all of it. That read as a second, unrelated control — it was
 * visible on Craghorn and absent on Brawlmantis purely because one had presses banked — and it was
 * the wrong grain: having pressed four times, the way back to three was to clear to zero and press
 * three times. Each trigger now carries its own `− n +`, so the count is always on screen, the
 * control never appears or disappears, and one press back is one press back.
 *
 * ## Trinkets that grant to one monster press here too (2026-10-08)
 *
 * Tempo Charm reads "On Battle Start, a random monster gains +4% Cooldown Speed permanently".
 * That is the same shape as Craghorn's item bonus in every way that matters to this component: it
 * recurs, the engine cannot fire it, and only the user knows how many times it has landed on which
 * monster. The one difference is where it comes from — the board's trinkets rather than the open
 * card's ability — so a held `chosenMonsterGrant` trinket adds a row to every placed monster, and
 * a press banks it on that monster alone. See `data/trinketGrants.ts`.
 *
 * Putting it here rather than in the trinket picker is the point: the question a press answers is
 * "which monster got it", and the monster is what you are looking at.
 */
interface TriggerButtonsProps {
  creature: CreatureRecord;
  placement: TeamPlacement;
}

/** Which colour a modifier's stat should read as, so the preview matches the stat badges. */
const STAT_KEY: Partial<Record<ModifierStat, StatColorKey>> = {
  damageFlatAdd: StatColorKey.Damage,
  burnAmountAdd: StatColorKey.Burn,
  poisonAmountAdd: StatColorKey.Poison,
  shockAmountAdd: StatColorKey.Shock,
  shieldAmountAdd: StatColorKey.Shield,
  multicastAdd: StatColorKey.Multicast,
  healAmountAdd: StatColorKey.Heal,
  cooldownSpeedAdd: StatColorKey.Cooldown,
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
  if (stat !== ModifierStat.CooldownSpeedAdd) return `+${amount}`;
  return `+${Math.round(amount * 1000) / 10}%`;
}

/** A placement in the shape `selectTargets` reads, carrying the placement so a press can write. */
interface BoardMember {
  slot: GridSlot;
  key: string;
  creature: CreatureRecord;
  placement: TeamPlacement;
}

/**
 * One pressable row: a creature's manual trigger, or a held trinket that grants to one monster.
 *
 * The two differ only in where they come from and who they reach, so they are one shape here
 * rather than two near-identical blocks of JSX free to drift in spacing, wording and stepper
 * behaviour.
 */
interface PressRow {
  key: string;
  /** What the presses stand for — the action for a trigger, the trinket's name for a grant. */
  label: string;
  /** The `+` button's tooltip. */
  description: string;
  effects: readonly { stat: ModifierStat; amount: number }[];
  recipients: readonly BoardMember[];
  /** What one press writes to each recipient. */
  modifiers: Omit<StatModifier, "id">[];
  /**
   * The `label` the written modifier carries, and therefore the one a press is read back from.
   * `undefined` for manual triggers, which write unlabelled chips.
   */
  sourceLabel: string | undefined;
  /** Shown beside the label for a trinket row, so a press is traceable to the thing that caused it. */
  sprite?: { file: string | undefined; name: string };
}

/**
 * How many presses of this row the recipients are currently carrying.
 *
 * Read back out of the modifiers a press writes, because that is the only record of one — banking
 * into the same representation the user types into is what makes the amounts display and round-trip
 * for free, and the cost is that nothing is labelled "banked". So the count is whatever number of
 * presses *every* effect on *every* recipient can account for: it never offers to take back more
 * than a press put there, and a hand-typed modifier on a recipient can only make it read high,
 * never make a decrement go below what was banked.
 *
 * Matched on the modifier's `label` as well as its stat, which is what keeps two rows on one card
 * from reading each other's presses: Tempo Charm's +4% Cooldown Speed and Ninflora's +10% are both
 * creature-scoped cooldown, and before labels were part of the match they were one chip and one
 * count. `addPlacementModifier` matches the same way, so the chip a press lands on is the chip this
 * reads.
 *
 * The epsilon is for `cooldownSpeedAdd`, which is stored as a fraction — three presses of Ninflora's
 * +10% accumulate to 0.30000000000000004 or 0.29999999999999993 depending on the order, and a bare
 * `Math.floor` turns the second one into two presses.
 */
function bankedPresses(row: PressRow): number {
  if (row.recipients.length === 0) return 0;
  let presses = Infinity;
  for (const recipient of row.recipients) {
    const modifiers = recipient.placement.modifiers ?? [];
    for (const effect of row.effects) {
      // Creature-scoped only: a press banks onto the monster, so a slot-scoped modifier of the
      // same stat is somebody else's and must not be read back as a press.
      const carried =
        modifiers.find((m) => m.stat === effect.stat && isCreatureScoped(m) && m.label === row.sourceLabel)?.amount ??
        0;
      presses = Math.min(presses, Math.floor(carried / effect.amount + 1e-9));
    }
  }
  return Math.max(0, presses);
}

export function TriggerButtons({ creature, placement }: TriggerButtonsProps) {
  const { config, addPlacementModifier } = useTeamConfig();
  const triggers = manualTriggersFor(creature);
  const grants = chosenTrinketGrants(config.trinketIds, corpus.trinkets);
  if (triggers.length === 0 && grants.length === 0) return null;

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

  const rows: PressRow[] = [
    ...triggers.map((trigger): PressRow => ({
      key: `trigger-${trigger.trigger}`,
      label: trigger.definition.actionLabel,
      description: trigger.definition.description,
      effects: trigger.effects,
      recipients: recipientsOfPress(trigger, source, board, config),
      modifiers: modifiersForPress(trigger),
      sourceLabel: undefined,
    })),
    /*
     * A held trinket's grant reaches THIS monster and nobody else, because the press is the user
     * saying "this is the one the game rolled". No selector, no board walk — the recipient is the
     * card the row is drawn on.
     */
    ...grants.map((grant): PressRow => ({
      key: `trinket-${grant.trinket.id}`,
      label: grant.copies > 1 ? `${grant.trinket.name} ×${grant.copies}` : grant.trinket.name,
      description:
        grant.copies > 1
          ? `${grant.trinket.effectText} You hold ${grant.copies}, so it lands ${grant.copies} times per battle start.`
          : grant.trinket.effectText,
      effects: grant.effects,
      recipients: [source],
      modifiers: modifiersForGrantPress(grant),
      sourceLabel: grant.trinket.name,
      sprite: { file: grant.trinket.spriteFile, name: grant.trinket.name },
    })),
  ];

  /**
   * One step in either direction, written to every recipient of that row.
   *
   * A decrement is the same write with the amounts negated, because `addPlacementModifier`
   * accumulates onto the matching stat and drops the entry when it reaches zero — so stepping back
   * down to nothing leaves no "+0" chip behind, and there is no second code path that has to agree
   * with the first about which slots a press touched.
   */
  function step(row: PressRow, direction: 1 | -1) {
    for (const recipient of row.recipients) {
      for (const modifier of row.modifiers) {
        addPlacementModifier(recipient.slot, { ...modifier, amount: modifier.amount * direction });
      }
    }
  }

  return (
    <div className={styles.wrap}>
      {rows.map((row) => {
        const presses = bankedPresses(row);
        return (
          <div key={row.key} className={styles.row}>
            <div className={styles.stepper} role="group" aria-label={row.label}>
              <Button
                size="sm"
                className={styles.step}
                disabled={presses === 0}
                aria-label={`Unbank: ${row.label}`}
                title={`Takes back one ${row.label.toLowerCase()}.`}
                onClick={() => step(row, -1)}
              >
                −
              </Button>
              <span className={styles.count} aria-live="polite">
                {presses}
              </span>
              <Button
                size="sm"
                className={styles.step}
                disabled={row.recipients.length === 0}
                aria-label={`Bank: ${row.label}`}
                title={`${row.description} Each press banks it once.`}
                onClick={() => step(row, 1)}
              >
                +
              </Button>
            </div>
            {row.sprite && (
              <Sprite spriteFile={row.sprite.file} kind="trinket" size={16} alt="" className={styles.rowSprite} />
            )}
            <span className={styles.label}>{row.label}</span>
            <span className={styles.effects}>
              {row.effects.map((e) => (
                <span
                  key={e.stat}
                  className={styles.effect}
                  style={{ color: STAT_COLORS[STAT_KEY[e.stat] ?? "damage"] }}
                >
                  {formatAmount(e.stat, e.amount)} {STAT_LABEL[e.stat] ?? e.stat}
                </span>
              ))}
              {/* Only said when it is news: a self-only trigger would be stating the obvious. */}
              {row.recipients.length > 1 && (
                <span className={styles.scope}>to {row.recipients.length} monsters</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
