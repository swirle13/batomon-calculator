import type { CreatureRecord, PerCastOutput, StatModifier, StatusEffectType } from "../../../data/types";
import { STATUS_COLOR_KEY } from "../../../data/format";
import { applyModifiers } from "../../../engine/modifiers";
import { applySelfScaling } from "../../../engine/selfScaling";
import { effectiveCooldown } from "../../../engine/cooldown";
import { ModifierStat, StatColorKey } from "../../../data/enums";

/**
 * Band 3's arithmetic, split out of `BatomonCard.tsx` (2026-10-08).
 *
 * These two functions are not components, and a module that exports a non-component is not a
 * React Fast Refresh boundary — so editing the card invalidated it and every importer
 * (`GridPicker`, `PlacedCreatureDetails`, `CorpusBrowser`) rather than hot-swapping it. See
 * `src/context/teamConfig.ts` for the failure this causes. The component that renders these lines
 * stays in the card; only the computation moved.
 */

/** One rendered output line, e.g. "Deal 25 damage" or "Poison 4". */
export interface StatLine {
  key: StatColorKey;
  label: string;
}

/**
 * A creature's published output, plus the user's own manual modifiers.
 *
 * ## Why modifiers belong in the BASE figure, not only in "Effective this battle"
 *
 * A modifier is how you record something the engine has no trigger for — a carry-over bonus from
 * an earlier round, an On Victory grant, a buff the run already applied. Once entered, it is part
 * of what the creature *is*; it is not something the battle does to it. Showing Craghorn's card as
 * "Deal 20" with a separate band reading "Deal 40" invites you to hunt for a battle effect that
 * does not exist — the 20 came from you.
 *
 * The grid chips already worked this way. The card did not, which is the inconsistency this fixes,
 * and the arithmetic now lives here rather than in both places.
 *
 * "Effective this battle" keeps its own job: the difference the *battle* makes — ally auras,
 * resolved abilities, trinkets. With only manual modifiers in play the two now agree, so the band
 * correctly hides.
 */
export function perCastOutputOf(creature: CreatureRecord, modifiers?: StatModifier[]): PerCastOutput {
  const sum = (stat: ModifierStat) =>
    (modifiers ?? []).filter((m) => m.stat === stat).reduce((total, m) => total + m.amount, 0);

  const statusAdd: Record<StatusEffectType, number> = {
    Burn: sum(ModifierStat.BurnAmountAdd),
    Poison: sum(ModifierStat.PoisonAmountAdd),
    Shock: sum(ModifierStat.ShockAmountAdd),
    Shield: sum(ModifierStat.ShieldAmountAdd),
  };

  // Shared with the engine so the card and the simulation cannot disagree about what a modifier
  // does. This is also where "a modifier may CREATE an effect" lives -- see engine/modifiers.ts.
  const modified = applyModifiers(
    {
      damage: creature.publishedCast?.damage ?? null,
      damageType: creature.publishedCast?.channel ?? null,
      appliesStatus: creature.appliesStatus ?? [],
      baseMulticast: creature.baseMulticast,
      heal: creature.healAmount ?? null,
    },
    {
      damageFlatAdd: sum(ModifierStat.DamageFlatAdd),
      multicastAdd: sum(ModifierStat.MulticastAdd),
      healAmountAdd: sum(ModifierStat.HealAmountAdd),
      status: statusAdd,
    },
  );

  // Ongoing self-scaling ("additional Damage equal to 20 times this monster's Burn") belongs in
  // the BASE figure for the same reason manual modifiers do, and the game agrees: it shows the
  // scaled number on the team-pane chip and the ability card, not as a battle effect. Last, so it
  // reads the Burn the modifiers above produced -- see engine/selfScaling.ts.
  return applySelfScaling(creature.abilityTags, modified);
}

/**
 * The cooldown the card shows: published, plus the user's own modifiers.
 *
 * Cooldown was the one stat left out of the rule this file exists to state (2026-10-08,
 * user-reported). `perCastOutputOf` folds manual modifiers into damage, statuses, heal and
 * multicast, but `PerCastOutput` carries no cooldown, so the card went on printing the published
 * seconds. A Panbud holding Tempo Charm therefore read "5.0 SEC" on the card and "4.8 SEC" in
 * "Effective this battle" -- and because the band only appears when something differs, a trinket
 * the user chose and can see was presented as a hidden battle effect.
 *
 * The same argument as the rest of the file: a banked Tempo Charm press is part of what the
 * monster IS, not something this battle does to it. "Effective this battle" keeps the effects the
 * BATTLE contributes -- ally cooldown auras, Shikitsune's revive bonus -- so with only manual
 * modifiers in play the two now agree and the band correctly hides.
 *
 * Deliberately NOT ally auras: that is the band's job, and computing them needs the whole board,
 * which the Corpus Browser (the other caller of this card) does not have.
 */
export function cooldownWithModifiers(
  creature: Pick<CreatureRecord, "baseCooldownSeconds">,
  modifiers?: StatModifier[],
): number | null {
  if (creature.baseCooldownSeconds === null) return null;
  const sum = (stat: ModifierStat) =>
    (modifiers ?? []).filter((m) => m.stat === stat).reduce((total, m) => total + m.amount, 0);
  // Through the engine's own formula, so the card cannot disagree with the schedule about what
  // +4% Cooldown Speed means -- the division-then-flat-addition order is easy to get backwards.
  return effectiveCooldown(
    creature.baseCooldownSeconds,
    sum(ModifierStat.CooldownSpeedAdd),
    sum(ModifierStat.CooldownFlatAddSeconds),
  );
}

/**
 * Builds band 3's stat lines from a record. Shared with the Calculator's "Effective this battle"
 * band so it renders the modifier-adjusted numbers in the identical shape rather than falling back
 * to a run-on sentence (FR-028 applies to the effective values too, not only the base stats).
 */
export function buildStatLines(input: PerCastOutput): StatLine[] {
  const lines: StatLine[] = [];
  // An unknown damage value renders no line at all rather than "0" or "unknown damage" -- 62 of
  // 149 species still have `baseDamage: null`, so this is the common path, not an edge case
  // (research.md H9).
  if (input.damage !== null) {
    // 2026-10-07 (round 7 WI-004): this read `input.damageType === DamageChannel.Direct ? "Deal" : "Deal"` --
    // a branch whose two arms were the same string, so the field was consulted for a decision that
    // could not have an outcome. It is the clearest evidence that `damageType` on a record carries
    // no information: measured over all 596 records it is `null` exactly when `baseDamage` is null,
    // with zero exceptions either way (research.md R3).
    lines.push({ key: StatColorKey.Damage, label: `Deal ${input.damage} damage` });
  }
  for (const status of input.appliesStatus) {
    lines.push({ key: STATUS_COLOR_KEY[status.type], label: `${status.type} ${status.amount}` });
  }
  if (input.heal != null && input.heal > 0) {
    lines.push({ key: StatColorKey.Heal, label: `Heal ${input.heal}` });
  }
  if (input.multicast > 1) {
    lines.push({ key: StatColorKey.Multicast, label: `Multicast ×${input.multicast}` });
  }
  return lines;
}
