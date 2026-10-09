import type { AbilityTag, PerCastOutput, StatusEffectType } from "../data/types";
import { AbilityTagKind, DamageChannel, StatChangeStat } from "../data/enums";

/**
 * Ongoing abilities that scale off the monster's OWN stats (2026-10-08).
 *
 * Lignite is the reported case: "Has additional Damage equal to 20 times this monster's Burn."
 * Holding 5 Burn, the game shows it a **100 Damage chip on its team-pane tile** and 100 on its
 * ability card — and shows no sign anywhere that a battle effect is responsible.
 *
 * ## Why this is not part of the effect resolver
 *
 * `effects.ts` answers "what does the battle do to this creature?", and the Calculator renders
 * that answer in the "Effective this battle" band, leaving the card and grid chip on the published
 * figure. That split is deliberate and documented in `GridPicker.tsx`, and it is wrong for this
 * family. An Ongoing self-scaling ability is a restatement of what the monster IS: no ally, trinket
 * or battle event is involved, and the game folds it straight into the displayed stats. Resolving
 * it in `resolveBoard` would have produced exactly the band the game's own UI declines to show —
 * a Lignite reading "Deal 60 damage" under a card reading nothing.
 *
 * So it resolves HERE instead, in a module both paths run:
 *
 *   - `perCastOutput.ts` -> the grid chip and the card's stat band;
 *   - `simulate.ts` -> the effective-stats snapshot and the per-cast damage in the timeline.
 *
 * Because both apply it, the two agree and the band stays hidden, which is the behaviour the game
 * has. The band still appears when an ALLY changes the input — a Magmalith next door taking Burn
 * from 3 to 5 really is the battle making a difference, and the band is where that belongs.
 *
 * ## Ordering: this runs LAST, after modifiers
 *
 * The input stat has to be the one the creature actually applies, so trinkets, trainer bonuses and
 * the user's own modifiers all have to have landed first. A Lignite whose Burn a modifier raised to
 * 5 scales off 5, not off its published 3 — that is the user's own 100-damage observation.
 */

/** The scaled addition to one stat, summed over every self-scaling tag that writes it. */
export function selfScaledAmount(
  tags: AbilityTag[],
  stat: StatChangeStat.Damage | StatChangeStat.Heal,
  statusAmount: (status: StatusEffectType) => number,
): number {
  let total = 0;
  for (const tag of tags) {
    if (tag.kind !== AbilityTagKind.StatFromOwnStat || tag.stat !== stat) continue;
    total += statusAmount(tag.sourceStat) * tag.multiplier;
  }
  // Rounded once at the end, matching `statFromTargetStatus`'s treatment in `simulate()`: two
  // tags on one stat should not each contribute a rounding error.
  return Math.round(total);
}

/**
 * `output` with every self-scaling tag applied.
 *
 * Damage and Heal are CREATED from `null` where there was none, the same rule
 * `engine/modifiers.ts` follows: Lignite publishes no cast at all, so a family that could only
 * scale an existing number would leave the whole ability inert on the one creature that has it.
 */
export function applySelfScaling(tags: AbilityTag[], output: PerCastOutput): PerCastOutput {
  const statusAmount = (status: StatusEffectType) =>
    output.appliesStatus.find((s) => s.type === status)?.amount ?? 0;

  const damageAdd = selfScaledAmount(tags, StatChangeStat.Damage, statusAmount);
  const healAdd = selfScaledAmount(tags, StatChangeStat.Heal, statusAmount);
  if (damageAdd === 0 && healAdd === 0) return output;

  const damage = output.damage === null ? (damageAdd !== 0 ? damageAdd : null) : output.damage + damageAdd;
  return {
    ...output,
    damage,
    damageType: output.damageType ?? (damage !== null ? DamageChannel.Direct : null),
    heal: output.heal === null ? (healAdd !== 0 ? healAdd : null) : output.heal + healAdd,
  };
}
