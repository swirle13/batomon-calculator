import type { Corpus, SimulationResult, TeamConfiguration } from "../data/types";
import { AbilityTagKind, StatusEffectType } from "../data/enums";
import { applyShinyOverlay, findCreature } from "../data/corpus";
import { placementKey } from "./grid";
import { windowAverageDps } from "./simulate";

/**
 * What the team's shielding, healing and cleansing are worth (2026-10-08, user-reported).
 *
 * ## The problem this exists to fix
 *
 * Every suggestion the advisor makes — arrangement, bench swap, lineup — is ranked by
 * `timeWeightedScore`, which sums `event.damage` and nothing else. A Runerock therefore scored
 * exactly zero: 140 Shield every 8 seconds, plus a cleanse the engine did not even have a tag for,
 * came to no damage at all and so to no reason to field it. Coalem's 550 Shield was worth only its
 * 20 Burn. The user's words: "DPS isn't the whole picture, but as it stands, he is very devalued
 * in the equation."
 *
 * ## The model: mitigation does not add to the score, it STRETCHES the discount
 *
 * The obvious fix is a defence term added to the damage term, and it is the wrong one, because it
 * needs an exchange rate — how many DPS is one Shield per second worth? — that nobody can defend.
 * Pick it high and six Runerocks win; pick it low and nothing changes.
 *
 * There is no need to invent one, because the objective already contains a survivability
 * assumption: the `TIME_WEIGHT_HALF_LIFE_SECONDS` discount exists precisely because "a slow ramp
 * may arrive after you are already dead". That constant *is* a guess at how long you live, and
 * mitigation is exactly the thing that changes how long you live. So shielding and healing buy a
 * LONGER HALF-LIFE rather than a bonus:
 *
 *     halfLife = 10s x (1 + mitigation per second / assumed incoming damage per second)
 *
 * This pays Runerock in the currency the objective already uses — it makes your Venopuff and
 * Lignite ramps count for more — and it has three properties a bonus term does not:
 *
 * - **It cannot be gamed.** Six Runerocks give you an enormous half-life applied to no damage,
 *   which is a score of zero. There is a real optimum between offence and defence and the search
 *   finds it instead of being told where it is.
 * - **It is board-sensitive in the right direction.** Shield is worth a great deal to a slow DOT
 *   ramp and very little to a burst team whose damage all lands in the first few seconds. That
 *   falls out of the arithmetic rather than being tuned in, and it is how the game actually plays.
 * - **It degrades honestly.** With no mitigation the factor is exactly 1 and every number the
 *   advisor produced before this existed is unchanged.
 *
 * The linear form is deliberate. The physically "correct" shape for mitigation offsetting incoming
 * damage is `1 / (1 - m)`, which agrees with `1 + m` to first order and then goes to infinity at
 * `m = 1`. That pole sits exactly where the assumption underneath it (below) is least trustworthy,
 * so the first-order form is used and capped.
 */

/**
 * The ceiling on the half-life multiplier.
 *
 * Past roughly this point the premise has dissolved: a 40-second half-life against the 30-second
 * window the UI defaults to is no discount at all, so further mitigation is buying something the
 * objective has already stopped charging for. Capping says that plainly instead of letting a
 * degenerate all-defence board produce an impressive-looking number.
 */
export const MAX_SURVIVABILITY_FACTOR = 4;

/**
 * Effective HP that one removed debuff stack is worth, as a fraction of the window.
 *
 * Priced off POISON, the one debuff whose arithmetic is exact: a Poison stack deals 1 damage per
 * second and never decays (`status.ts`), so a stack removed at time `t` prevents exactly `W - t`
 * damage, and a stack removed at the midpoint of the fight prevents `W / 2`.
 *
 * Burn is worth more than this and Shock less — a Burn layer drives 2 damage per second but the
 * pool sheds a layer every tick, and Shock only pays out when something hits you. Averaging the
 * three into a more precise-looking constant would be false precision on top of the far larger
 * assumption below, so the exact case is used for all three and the overstatement on Shock is
 * accepted.
 */
const DEBUFF_STACK_EHP_AS_WINDOW_FRACTION = 0.5;

/** The debuffs an enemy can put on your team — Shield is a buff and is not one of them. */
const DEBUFFS = [StatusEffectType.Burn, StatusEffectType.Poison, StatusEffectType.Shock] as const;

export interface SurvivabilityEstimate {
  /** Shield granted per second. Already simulated; it had simply never been scored. */
  shieldPerSecond: number;
  /** HP restored per second. New to the engine on 2026-10-08 — see `TimelineEventKind.Heal`. */
  healPerSecond: number;
  /** Debuff removal, priced as effective HP per second. The assumption-heavy term; see below. */
  cleansePerSecond: number;
  /** The three above, summed: effective HP the team adds to itself each second. */
  mitigationPerSecond: number;
  /**
   * The enemy damage this is measured against — the MIRROR assumption, see `estimateSurvivability`.
   */
  assumedIncomingDps: number;
  /** The half-life multiplier, in `[1, MAX_SURVIVABILITY_FACTOR]`. */
  factor: number;
  /** Placed creatures whose cleanse was priced, for the UI to name. */
  cleansers: string[];
}

/** The estimate for a board with nothing to say: no mitigation, no stretch, no assumptions made. */
const INERT: SurvivabilityEstimate = {
  shieldPerSecond: 0,
  healPerSecond: 0,
  cleansePerSecond: 0,
  mitigationPerSecond: 0,
  assumedIncomingDps: 0,
  factor: 1,
  cleansers: [],
};

/**
 * Debuff removal priced in effective HP per second, under the MIRROR assumption.
 *
 * ## The assumption, stated plainly
 *
 * A cleanse is worth nothing against an opponent applying no debuffs and a very great deal against
 * a Poison team, and this engine simulates against an "idealized target" that fights back in no
 * way at all. There is no honest way to price removal without assuming something about what is
 * being removed.
 *
 * The assumption taken is that **the enemy applies debuffs at the same rate your team does**. In a
 * game where the opponent is another player's team at your own power level that is the least
 * arbitrary option available, and crucially it is SCALE-FREE: it keeps working as you level up,
 * where a hard-coded "assume 20 Poison per second" would be roughly right at level 1 and absurd at
 * level 4. `perStatusAppliedPerSecond` is already computed, so the assumption costs nothing.
 *
 * ## Why removal is capped by that rate
 *
 * You cannot remove a stack that is not there. Runerock's 15-stacks-of-everything every 8 seconds
 * is 1.875 stacks per second of headroom against each debuff, but against an enemy applying half a
 * Poison stack per second only half a stack per second is actually removed — and the rest of its
 * capacity is wasted, which is the true answer and the reason a cleanser is a situational pick
 * rather than a staple.
 *
 * A PERCENTAGE cleanse (Sirenade) is treated as fully offsetting the inflow instead. Removing a
 * fixed fraction of the standing pool on a cadence is a decay term, and any decay term reaches an
 * equilibrium where removal equals inflow regardless of how small the fraction is; it just settles
 * at a larger standing pool. That makes percentage cleansers look strong, and bounded by inflow
 * they cannot look stronger than "the opponent's entire debuff output, nullified".
 */
function cleanseValue(
  config: TeamConfiguration,
  corpus: Corpus,
  result: SimulationResult,
): { perSecond: number; cleansers: string[] } {
  /** Flat stacks removed per second, pooled across cleansers — it applies to every debuff alike. */
  let flatCapacity = 0;
  let anyFractional = false;
  const cleansers: string[] = [];

  for (const placement of config.placements) {
    const creature = applyShinyOverlay(
      findCreature(corpus, placement.creatureId, placement.level),
      placement.shiny,
    );
    if (!creature) continue;
    const tag = creature.abilityTags.find((t) => t.kind === AbilityTagKind.CleanseDebuffs);
    if (!tag || tag.kind !== AbilityTagKind.CleanseDebuffs) continue;
    /*
     * The EFFECTIVE cooldown, read off the result rather than off the creature, so Tempo Charm and
     * every cooldown aura on the board count toward the cleanse exactly as they count toward a
     * cast. A missing entry means the creature is not in the battle at all — a teammate's Petrirex
     * knocked it out — and a corpse cleanses nothing, which is what skipping it says.
     */
    const cooldown = result.perCreatureEffectiveStats[placementKey(creature.id, placement.slot)]?.cooldownSeconds;
    if (!cooldown || cooldown <= 0) continue;
    cleansers.push(creature.name);
    if (tag.stacks !== undefined) flatCapacity += tag.stacks / cooldown;
    else anyFractional = true;
  }

  if (cleansers.length === 0) return { perSecond: 0, cleansers };

  const stackEhp = result.windowSeconds * DEBUFF_STACK_EHP_AS_WINDOW_FRACTION;
  let perSecond = 0;
  for (const debuff of DEBUFFS) {
    const incoming = result.perStatusAppliedPerSecond[debuff];
    const removed = anyFractional ? incoming : Math.min(flatCapacity, incoming);
    perSecond += removed * stackEhp;
  }
  return { perSecond, cleansers };
}

/**
 * What this board's defence is worth, as a half-life multiplier for `timeWeightedScore`.
 *
 * ## The other assumption: incoming damage
 *
 * The factor is a ratio of mitigation to incoming damage, and the simulation does not model
 * incoming damage. The same MIRROR assumption as the cleanse pricing answers it: the enemy deals
 * what you deal. It is scale-free for the same reason and it has one further virtue here — it
 * makes the whole model unit-free, so a Runerock is judged against the team it is standing in
 * rather than against a constant that would have to be re-tuned every balance patch.
 *
 * Where the team deals no damage there is no ratio to take, and also nothing to discount: the
 * score is zero whatever the half-life is. Returning an unstretched estimate keeps that case
 * arithmetically quiet instead of dividing by zero.
 */
export function estimateSurvivability(
  config: TeamConfiguration,
  corpus: Corpus,
  result: SimulationResult,
): SurvivabilityEstimate {
  const shieldPerSecond = result.perStatusPerSecond[StatusEffectType.Shield];
  const healPerSecond = result.healPerSecond;
  const assumedIncomingDps = windowAverageDps(result);

  const cleanse = cleanseValue(config, corpus, result);
  const mitigationPerSecond = shieldPerSecond + healPerSecond + cleanse.perSecond;
  if (mitigationPerSecond <= 0 || assumedIncomingDps <= 0) {
    return { ...INERT, shieldPerSecond, healPerSecond, assumedIncomingDps };
  }

  return {
    shieldPerSecond,
    healPerSecond,
    cleansePerSecond: cleanse.perSecond,
    mitigationPerSecond,
    assumedIncomingDps,
    factor: Math.min(MAX_SURVIVABILITY_FACTOR, 1 + mitigationPerSecond / assumedIncomingDps),
    cleansers: cleanse.cleansers,
  };
}
