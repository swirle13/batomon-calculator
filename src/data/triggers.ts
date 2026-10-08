import type {
  AbilityTrigger,
  CreatureRecord,
  ModifierStat,
  StatModifier,
  TargetSelector,
} from "./types";
import { ABILITY_TRIGGER, ABILITY_TRIGGERS } from "./vocabularies";
import { AbilityTagKind, TargetKind } from "./enums";

/**
 * The trigger registry: one entry per `AbilityTrigger`, describing how that trigger behaves and
 * how it is presented.
 *
 * ## Why a registry rather than per-creature handling
 *
 * Sixteen creatures have a repeatable permanent stat gain the battle engine cannot fire — Craghorn
 * on using an item, Guardiant on buying a Bug, Dollhime on gaining a trinket, and so on. Handling
 * them one at a time would mean sixteen places to update and sixteen chances to miss one.
 *
 * Instead the *trigger* is the unit. A creature declares `{ kind: AbilityTagKind.ManualTrigger, trigger,
 * effects }` in its data; this table says what that trigger is called and whether the engine owns
 * it. Adding a creature is a data change with no code; adding a trigger is one entry here.
 *
 * ## `enginePropagated` is the important field
 *
 * It records whether the simulation already applies this trigger's effects. Anything true here
 * must NOT also get a manual button, or the user would bank a bonus the engine is already
 * computing and double it. It is the single place that distinction is stated.
 */
export interface TriggerDefinition {
  /** Button text, e.g. "Use an item". Phrased as the action the player takes. */
  readonly actionLabel: string;
  /** What the trigger means, for the button's tooltip. */
  readonly description: string;
  /**
   * True when `simulate()` already fires this trigger during a battle. Such triggers are never
   * offered as manual buttons — the engine owns them.
   */
  readonly enginePropagated: boolean;
}

/**
 * The trigger registry IS the definition table now (2026-10-07, round 7 WI-001).
 *
 * This used to be a second `Record<AbilityTrigger, ...>` declared beside the union — exactly the
 * "per-member data in a parallel structure" problem the round removes. The fields moved into
 * `ABILITY_TRIGGER` in `vocabularies.ts`; this alias keeps every call site working.
 */
export const TRIGGER_DEFINITIONS: Readonly<Record<AbilityTrigger, TriggerDefinition>> =
  ABILITY_TRIGGER;

/** Every trigger, in canonical order. Re-exported from the registry, so a new enum member cannot
 * be missed by a hand-written list -- the drift this round removes. */
export { ABILITY_TRIGGERS };

/** One press-able trigger on a creature: what it is called, what one press banks, and on whom. */
export interface ManualTrigger {
  readonly trigger: AbilityTrigger;
  readonly definition: TriggerDefinition;
  readonly effects: readonly { stat: ModifierStat; amount: number }[];
  /** Resolved, never absent — the tag's `target` defaulted to self. See `recipientsOfPress`. */
  readonly target: TargetSelector;
  readonly includeSelf: boolean;
}

/**
 * The manual triggers a creature offers.
 *
 * Reads the creature's own tags, so this works for any creature carrying one and needs no list of
 * special cases. Returns `[]` for the overwhelming majority that have none.
 */
export function manualTriggersFor(creature: CreatureRecord): ManualTrigger[] {
  return creature.abilityTags
    .filter((tag): tag is Extract<typeof tag, { kind: AbilityTagKind.ManualTrigger }> => tag.kind === AbilityTagKind.ManualTrigger)
    .map((tag) => ({
      trigger: tag.trigger,
      definition: TRIGGER_DEFINITIONS[tag.trigger],
      effects: tag.effects,
      // Defaulted here rather than at each read, so no caller can forget and silently bank an
      // ally-wide bonus on the presser alone — the bug these two fields exist to fix.
      target: tag.target ?? { kind: TargetKind.Self },
      includeSelf: tag.includeSelf ?? false,
    }));
}

/**
 * The placement modifiers a single press should add.
 *
 * Returned without ids; the caller supplies those, because `addPlacementModifier` already
 * accumulates same-stat modifiers rather than appending duplicates — so pressing twice yields one
 * chip at double the amount rather than two chips, which is what "click it twice" should mean.
 */
export function modifiersForPress(trigger: ManualTrigger): Omit<StatModifier, "id">[] {
  return trigger.effects.map((e) => ({ stat: e.stat, amount: e.amount }));
}
