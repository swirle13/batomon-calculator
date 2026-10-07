import type { DamageType, PerCastOutput, StatusEffectType } from "../data/types";

/**
 * Applying user modifiers to a creature's per-cast output.
 *
 * ## A modifier MAY create an effect, not only scale one
 *
 * This file exists to retire the opposite rule. Three places independently implemented "a modifier
 * can only scale an effect the creature already has", each citing the same `data-model.md` known
 * limitation, and each therefore discarded the user's input:
 *
 *   - the detail card dropped `damageFlatAdd` whenever `baseDamage` was `null`;
 *   - the engine applied `damageFlatAdd` only when the creature was already `Direct`-damage capable,
 *     so a Burn-type or damage-less creature silently ignored it;
 *   - the engine skipped modifiers ENTIRELY for a creature with no published cooldown;
 *   - and all of them only ever scaled statuses the creature already applied, so `+20 Burn` on a
 *     creature that applies no Burn vanished.
 *
 * The limitation was unfounded. Trinkets and ally abilities routinely give a creature damage or a
 * status it did not previously have, and a user recording that is describing a real board. The
 * engine's own ability path already agreed: `syncReadValues` in `effects.ts` lets a granted effect
 * raise `baseDamage` from `null`, so only the MANUAL path was clamped.
 *
 * `null` still means "nothing here" — it is returned when there is no base value AND no modifier,
 * which keeps "unknown damage renders no line" working for the 62 species with `baseDamage: null`.
 */

export const STATUS_TYPES: StatusEffectType[] = ["Burn", "Poison", "Shock", "Shield"];

/** The modifier totals that bear on a single cast, already summed across team and placement. */
export interface ModifierAmounts {
  damageFlatAdd: number;
  multicastAdd: number;
  healAmountAdd: number;
  status: Record<StatusEffectType, number>;
}

/** The unmodified per-cast values a modifier applies to. */
export interface ModifiableBase {
  damage: number | null;
  damageType: DamageType | null;
  appliesStatus: { type: StatusEffectType; amount: number }[];
  baseMulticast: number;
  heal: number | null;
}

/**
 * Damage a modifier creates from nothing is Direct.
 *
 * A creature with no published damage has no damage TYPE either, and a bare "+40 Damage" is the
 * plain, immediate hit the game shows as "Deal N damage". A creature that already has a type keeps
 * it — a `+40` on a Burn-type attacker scales the burn, it does not bolt a direct hit onto it.
 */
const CREATED_DAMAGE_TYPE: DamageType = "Direct";

export function applyModifiers(base: ModifiableBase, amounts: ModifierAmounts): PerCastOutput {
  const damage =
    base.damage === null
      ? amounts.damageFlatAdd !== 0
        ? amounts.damageFlatAdd
        : null
      : base.damage + amounts.damageFlatAdd;

  const published = new Map(base.appliesStatus.map((s) => [s.type, s.amount]));
  // Published statuses keep their original order so the card's lines do not reshuffle when a
  // modifier is added; created ones are appended in a fixed order.
  const types = [
    ...base.appliesStatus.map((s) => s.type),
    ...STATUS_TYPES.filter((t) => !published.has(t) && amounts.status[t] !== 0),
  ];

  return {
    damage,
    damageType: base.damageType ?? (damage !== null ? CREATED_DAMAGE_TYPE : null),
    appliesStatus: types.map((type) => ({
      type,
      amount: (published.get(type) ?? 0) + amounts.status[type],
    })),
    // Same create-from-nothing rule as damage: a creature with no published heal that is GIVEN one
    // has a heal, and `null` still means "nothing here" so a healer-less card renders no heal line.
    heal:
      base.heal === null
        ? amounts.healAmountAdd !== 0
          ? amounts.healAmountAdd
          : null
        : base.heal + amounts.healAmountAdd,
    multicast: Math.max(1, base.baseMulticast + amounts.multicastAdd),
    damageUnconfirmed: false,
  };
}
