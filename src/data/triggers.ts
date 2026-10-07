import type { AbilityTrigger, CreatureRecord, ModifierStat, StatModifier } from "./types";

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
 * Instead the *trigger* is the unit. A creature declares `{ kind: "manualTrigger", trigger,
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

export const TRIGGER_DEFINITIONS: Readonly<Record<AbilityTrigger, TriggerDefinition>> = {
  Ongoing: {
    actionLabel: "Ongoing",
    description: "Always active; the engine applies it for the whole battle.",
    enginePropagated: true,
  },
  "On Cast": {
    actionLabel: "Cast",
    description: "Fires every time this creature casts; the engine schedules those casts.",
    enginePropagated: true,
  },
  "On Battle Start": {
    actionLabel: "Start the battle",
    description: "Fires once as the battle begins.",
    // The resolver handles battle-start grants it has tags for, but several creatures' battle-start
    // text is unmodelled (Mallogre's "for each Trinket that you own" has no trinket-count input).
    // Those carry a manualTrigger tag explicitly; this flag governs only the default.
    enginePropagated: true,
  },
  "On Bought": {
    actionLabel: "Buy a monster",
    description: "Fires when you buy a monster in the shop — outside the battle this simulates.",
    enginePropagated: false,
  },
  "On Victory": {
    actionLabel: "Win a round",
    description: "Fires after you win a round, so the bonus carries into later battles.",
    enginePropagated: false,
  },
  "On Knocked Out": {
    actionLabel: "Get knocked out",
    description: "Fires when THIS creature is knocked out. The engine models no deaths.",
    enginePropagated: false,
  },
  "On Knockout": {
    actionLabel: "Knock out a monster",
    description: "Fires when ANY monster is knocked out. The engine models no deaths.",
    enginePropagated: false,
  },
  "On Trinket Gained": {
    actionLabel: "Gain a trinket",
    description: "Fires when you gain a trinket — outside the battle this simulates.",
    enginePropagated: false,
  },
  "On Item Used": {
    actionLabel: "Use an item",
    description: "Fires when you use an item — outside the battle this simulates.",
    enginePropagated: false,
  },
  "On Battle Lost": {
    actionLabel: "Lose a round",
    description: "Fires after you lose a round.",
    enginePropagated: false,
  },
};

/** One press-able trigger on a creature: what it is called, and what one press banks. */
export interface ManualTrigger {
  readonly trigger: AbilityTrigger;
  readonly definition: TriggerDefinition;
  readonly effects: readonly { stat: ModifierStat; amount: number }[];
}

/**
 * The manual triggers a creature offers.
 *
 * Reads the creature's own tags, so this works for any creature carrying one and needs no list of
 * special cases. Returns `[]` for the overwhelming majority that have none.
 */
export function manualTriggersFor(creature: CreatureRecord): ManualTrigger[] {
  return creature.abilityTags
    .filter((tag): tag is Extract<typeof tag, { kind: "manualTrigger" }> => tag.kind === "manualTrigger")
    .map((tag) => ({
      trigger: tag.trigger,
      definition: TRIGGER_DEFINITIONS[tag.trigger],
      effects: tag.effects,
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
