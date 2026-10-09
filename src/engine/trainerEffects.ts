import type { CreatureRecord, StatModifier, TeamConfiguration } from "../data/types";
import { CreatureType, ModifierScope, ModifierStat } from "../data/enums";
import { TrainerId } from "../data/ids";
import { creatureHasType } from "../data/typing";

/**
 * The stat bonuses a chosen TRAINER gives individual monsters (2026-10-08, user-reported: "Chef
 * trainer's ability doesn't actually apply to any mons").
 *
 * ## Why this is not folded into `teamModifiers`
 *
 * Trinkets already fold into that list, and the reason they can is that every trinket effect is
 * unconditional across the whole board. A trainer's is not: Chef gives "+2 Burn" to *your Fire
 * monsters*, so the amount depends on who is receiving it. A team-wide entry cannot express a
 * recipient test, which is why these are produced per placement and appended to that placement's
 * own modifiers — the same list the user's carry-overs and a banked ability press go into, and
 * therefore the same `sumModifier` resolution path with no precedence rules to invent.
 *
 * ## Only Chef, and why the other twenty-two are absent rather than forgotten
 *
 * Most trainer abilities are about the RUN, not the battle: Rich Lady gives shop rank and money,
 * Egg Breeder gives an egg that hatches in five days, Gamer gives a monster on day 9. This engine
 * simulates one fight with no economy and no day counter, so there is nothing for them to change.
 * Of the ones that do touch battle stats:
 *
 * - **Chef** — implemented here, plus the Fire-typing half in `data/typing.ts`.
 * - **Chemist** — "+3 Poison to your Toxic monsters, +1 more whenever any monster levels up". The
 *   base is expressible; the escalation is a count of events earlier in the run that the tool does
 *   not track, so applying the base alone would quietly understate it. Left to a hand-typed
 *   modifier, where the user supplies the number they actually have.
 * - **Redhead** — "On Victory: +3 Burn to your Fire monsters permanently", likewise a run-history
 *   count rather than a property of the board.
 * - **Painter** / **Smuggler** — designate species rather than grant stats; they already apply
 *   through `paintedCreatureIds` / `smuggledCreatureIds`.
 */
export function trainerModifiersFor(
  creature: Pick<CreatureRecord, "id" | "types">,
  config: Pick<TeamConfiguration, "trainerId" | "paintedCreatureIds">,
): StatModifier[] {
  if (config.trainerId !== TrainerId.Chef) return [];

  /*
   * "Your Fire monsters have +2 Burn" — read through `creatureHasType`, so it includes the
   * monsters Chef's own first clause just made Fire, and a painted species, and Omnichrome. The
   * two clauses are one ability and resolving them independently is how a single-typed monster
   * would end up Fire for adjacency auras but not for its own trainer's Burn.
   */
  if (!creatureHasType(creature, CreatureType.Fire, config)) return [];
  return [
    {
      // Deterministic rather than freshly generated: this is derived from the configuration every
      // time it is read, not a user edit that needs session identity.
      id: `trainer-${TrainerId.Chef}-burn-${creature.id}`,
      label: "Chef",
      stat: ModifierStat.BurnAmountAdd,
      amount: 2,
      // The trainer buffs monsters, not positions. It is recomputed per placement anyway, so the
      // scope is what it means rather than what it does: nothing carries this one around.
      scope: ModifierScope.Creature,
    },
  ];
}
