import type {
  CreatureRecord,
  GridSlot,
  ItemEffect,
  ItemRecord,
  StatModifier,
  TeamConfiguration,
} from "../data/types";
import { ItemTargetKind } from "../data/enums";
import { creatureHasType } from "../data/typing";
import { slotKey, stableSlotIndex } from "./grid";

/**
 * Resolving one USE of an item into recipients and stat grants (2026-10-08, T046).
 *
 * ## Why items write modifiers instead of being simulated
 *
 * An item is used in the shop, between battles. By the time the battle this engine simulates
 * begins, the item is gone and all that remains is a permanent stat bonus on some monsters — which
 * is precisely what a `StatModifier` is. So "use an item" is the same act as "bank a manual
 * trigger" (`manualTriggers.ts`) and as "type a carry-over bonus" (`ModifierEditor`): three
 * different ways of saying a monster carries a bonus the battle engine cannot derive.
 *
 * Routing all three to `addPlacementModifier` means one representation, one display path, one set
 * of removable chips in the Modifiers overlay, and the build share code round-trips items for
 * free. A parallel `usedItemIds -> effects` resolution path in `simulate()` would have been a
 * second way to express the same fact, and the two would drift.
 *
 * ## Why not `TargetSelector`
 *
 * `selectTargets` resolves relative to a SOURCE creature — adjacent, behind, in front, allies.
 * An item has no source on the board, and all three of its target kinds are absolute. Reusing
 * that selector would have meant inventing a fake source slot for every item use.
 */

/** A placed monster in the shape the recipient rules read. */
export interface ItemBoardMember {
  slot: GridSlot;
  creature: Pick<CreatureRecord, "id" | "types" | "abilityText">;
}

/**
 * Who one use of `effect` grants to, in stable board order.
 *
 * `chosenSlots` is consulted only by `ItemTargetKind.Chosen` and is the user's selection, never a
 * roll — see `ItemTargetKind.Chosen`'s own note for why generating one would be useless.
 *
 * Every kind filters against the board, so an item can never grant to an empty slot. That matters
 * most for `FixedSlot`: Pom Berry names the bottom right monster, and on a board with no bottom
 * right monster the honest answer is "nobody", not "the nearest one".
 */
export function itemRecipients(
  effect: ItemEffect,
  board: readonly ItemBoardMember[],
  chosenSlots: readonly GridSlot[],
  config?: Pick<TeamConfiguration, "paintedCreatureIds">,
): GridSlot[] {
  const { target } = effect;
  const ordered = [...board].sort((a, b) => stableSlotIndex(a.slot) - stableSlotIndex(b.slot));

  switch (target.kind) {
    case ItemTargetKind.Team:
      return ordered
        .filter((m) => {
          // `creatureHasType` rather than `types.includes`: it is the one predicate that knows a
          // painted species and a native "All" both match every type (FR-086).
          if (target.typeFilter && !creatureHasType(m.creature, target.typeFilter, config)) return false;
          if (target.abilitylessOnly && m.creature.abilityText.trim() !== "") return false;
          return true;
        })
        .map((m) => m.slot);

    case ItemTargetKind.FixedSlot: {
      const wanted = slotKey(target.slot);
      return ordered.filter((m) => slotKey(m.slot) === wanted).map((m) => m.slot);
    }

    case ItemTargetKind.Chosen: {
      const chosen = new Set(chosenSlots.map(slotKey));
      // Capped at the item's own published count, so a selection left over from a larger board
      // cannot over-grant. Board order decides which survive the cap, not click order (FR-067).
      return ordered
        .filter((m) => chosen.has(slotKey(m.slot)))
        .slice(0, target.count)
        .map((m) => m.slot);
    }
  }
}

/**
 * The stat grants one use makes to EACH recipient.
 *
 * Labelled with the item's name so the resulting chip can be traced back to what created it —
 * `StatModifier.label` exists for exactly this, and a bare "+5 Damage" chip next to five others
 * is otherwise unattributable.
 */
export function modifiersForUse(item: ItemRecord): Omit<StatModifier, "id">[] {
  return (item.effect?.stats ?? []).map((grant) => ({
    stat: grant.stat,
    amount: grant.amount,
    label: item.name,
  }));
}

/** How many monsters the user must pick before a `Chosen` item can be used. 0 for every other kind. */
export function requiredChoiceCount(effect: ItemEffect): number {
  return effect.target.kind === ItemTargetKind.Chosen ? effect.target.count : 0;
}
