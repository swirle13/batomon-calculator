import type { ModifierStat, StatModifier, TrinketId, TrinketRecord } from "./types";
import { ModifierScope } from "./enums";

/**
 * Trinkets that grant to ONE monster the user names (2026-10-08).
 *
 * ## Why these cannot be folded in with `effectTags`
 *
 * `simulate()` turns every held trinket's `effectTags` into a team modifier, unconditionally,
 * because every trinket it models says "your monsters". Tempo Charm says "a random monster", and
 * there is no honest team-wide number for that: a sixth of +4% is not what the game did to
 * anybody, and the full +4% on all six is five grants that never happened.
 *
 * ## Why they are pressed rather than rolled
 *
 * Rolling a recipient is the one thing this tool must not do. The player's run has already rolled,
 * and a second independent roll produces a board they cannot reconcile with their screen — the
 * argument `AffectedCreaturePicker` and the item chooser both make. It also recurs: Tempo Charm
 * fires at the start of *every* battle, so by day 7 it has landed seven times, spread across
 * whichever monsters the game picked. Only the user knows that spread, and a stepper per monster
 * is exactly how they can state it.
 *
 * That makes these the trinket counterpart of a creature's manual trigger, which is why the two
 * share a row in `TriggerButtons` rather than getting a second control of their own.
 */
export interface ChosenTrinketGrant {
  readonly trinket: TrinketRecord;
  /**
   * How many copies are held. A shop can offer the same trinket again, and two Tempo Charms grant
   * twice per battle start — but to two *separately rolled* monsters, so this is not a multiplier
   * on a press. It widens how often a press is warranted, which is a thing to say in the tooltip
   * and nothing for the arithmetic to do.
   */
  readonly copies: number;
  readonly effects: readonly { stat: ModifierStat; amount: number }[];
}

/**
 * The held trinkets that grant to a chosen monster, one entry per distinct trinket.
 *
 * Deduplicated: two copies are one row showing `×2`, not two identical steppers that would ask the
 * user to remember which press belonged to which copy.
 */
export function chosenTrinketGrants(
  trinketIds: readonly TrinketId[],
  trinkets: readonly TrinketRecord[],
): ChosenTrinketGrant[] {
  const copies = new Map<TrinketId, number>();
  for (const id of trinketIds) copies.set(id, (copies.get(id) ?? 0) + 1);

  return [...copies]
    .flatMap(([id, count]) => {
      const trinket = trinkets.find((t) => t.id === id);
      const effects = trinket?.chosenMonsterGrant;
      return trinket && effects && effects.length > 0 ? [{ trinket, copies: count, effects }] : [];
    })
    .sort((a, b) => a.trinket.name.localeCompare(b.trinket.name));
}

/**
 * What one press of a grant writes to the chosen monster.
 *
 * Labelled with the trinket's name, so the chip under Modifiers says where the +4% came from — the
 * same attribution a used item's chip carries, and the thing that lets the press count be read
 * back out of the modifiers rather than stored beside them.
 *
 * Creature-scoped, because the ability's subject is a monster: sell it and the bonus goes with it,
 * exactly as a banked manual trigger does.
 */
export function modifiersForGrantPress(grant: ChosenTrinketGrant): Omit<StatModifier, "id">[] {
  return grant.effects.map((e) => ({
    stat: e.stat,
    amount: e.amount,
    scope: ModifierScope.Creature,
    label: grant.trinket.name,
  }));
}
