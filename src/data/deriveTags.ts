import type {
  AbilityTag,
  CreatureRecord,
  CreatureType,
  EffectDescriptor,
  Rarity,
  TargetSelector,
} from "./types";
import { ABILITY_TRIGGER, CREATURE_TYPE, RARITY } from "./vocabularies";
import { AbilityTagKind, ModifierStat, StatChangeStat, StatusEffectType, TargetKind } from "./enums";

/**
 * Ability tags DERIVED from a creature's own published text (2026-10-07, round 7 WI-002 / FR-113).
 *
 * ## The problem this replaces
 *
 * `abilityTags` was hand-maintained per creature, and the maintenance had not kept up: **424 of 596
 * records (106 of 149 level-1 species) had published ability text and an empty tag array.** Ninflora
 * was the reported case — "This and your Grass allies gain +10% Cooldown Speed permanently", no tag,
 * so no button — while Brawlmantis and Kickrane, the identical ability shape, had one. Ninflora was
 * not an oversight; it was the median.
 *
 * ## Why a rule TABLE and not a parser
 *
 * The ask was to work from "inherent properties about a mon's ability instead of having to manually
 * manage a separate list of tags across 140+ mons". A table makes adding a shape **one row**; a
 * hardcoded parser would have fixed Ninflora and left the next shape exactly as hand-managed. The
 * measurement backs this up: "permanently" alone selects 60 records spanning six different
 * mechanisms, so **a family identified by one keyword is not a family** (research.md R4).
 *
 * ## Rules of engagement
 *
 * 1. **Read the TEXT, not the trigger.** 134 records have ability text and no published
 *    `abilityTrigger` at all, so keying on the trigger would miss a quarter of the corpus. The
 *    trigger is corroboration where present.
 * 2. **Hand-authored tags win.** Applied in `corpus.ts`; some abilities cannot be read from prose at
 *    any effort — see `deriveTags.test.ts` for the enumerated set and each one's reason.
 * 3. **`manualTrigger` only, for now.** Deliberately outside `RESOLVED_TAG_KINDS`, so widening the
 *    derivation cannot inflate the engine-coverage counter into claiming abilities the engine does
 *    not compute. A family that IS resolved may legitimately move that figure, but it must be a
 *    deliberate choice with the number reported, not a side effect.
 */

/** A text shape and how to turn a match of it into a tag. One row per shape. */
interface DerivationRule {
  /** Which ability family this row produces, for the per-family coverage report. */
  readonly family: string;
  /** Anchored at both ends: a partial match means the text says something more than we modelled. */
  readonly pattern: RegExp;
  readonly build: (m: RegExpMatchArray, record: CreatureRecord) => AbilityTag | null;
}

// ---------------------------------------------------------------------------
// Shared fragments
// ---------------------------------------------------------------------------

/** `+10`, `+10%`, `10` — the grant amount. */
const AMOUNT = String.raw`\+?(\d+(?:\.\d+)?)(%?)`;

/** The stat names a grant can name, mapped to the `ModifierStat` they write. */
const STAT_BY_NAME: Record<string, ModifierStat> = {
  damage: ModifierStat.DamageFlatAdd,
  shield: ModifierStat.ShieldAmountAdd,
  burn: ModifierStat.BurnAmountAdd,
  poison: ModifierStat.PoisonAmountAdd,
  shock: ModifierStat.ShockAmountAdd,
  multicast: ModifierStat.MulticastAdd,
  "cooldown speed": ModifierStat.CooldownSpeedAdd,
  heal: ModifierStat.HealAmountAdd,
};

const STAT_NAMES = Object.keys(STAT_BY_NAME).join("|");

/**
 * `"+10% Cooldown Speed"` -> `{ stat, amount }`.
 *
 * Percentages store as FRACTIONS (`10%` -> `0.1`), matching `ModifierEditor`'s existing
 * `store: (typed) => typed / 100`, so a derived modifier and a typed one are the same value.
 */
function effect(amount: string, percent: string, statName: string): { stat: ModifierStat; amount: number } | null {
  const stat = STAT_BY_NAME[statName.toLowerCase()];
  if (!stat) return null;
  const n = Number(amount);
  return { stat, amount: percent === "%" ? n / 100 : n };
}

/** Every `+N <Stat>` pair in a clause, so "+20 Damage and +20 Shield" yields two effects. */
function allEffects(clause: string): { stat: ModifierStat; amount: number }[] {
  const out: { stat: ModifierStat; amount: number }[] = [];
  const re = new RegExp(String.raw`${AMOUNT}\s*(${STAT_NAMES})\b`, "gi");
  for (const m of clause.matchAll(re)) {
    const e = effect(m[1]!, m[2]!, m[3]!);
    if (e) out.push(e);
  }
  return out;
}

/**
 * Craghorn's shape: "this gains +20 Damage and Shield" — ONE amount covering TWO stats, with the
 * second stat named bare. Handled explicitly because reading it as a single `+20 Damage` grant would
 * silently drop half the published ability.
 */
function sharedAmountEffects(clause: string): { stat: ModifierStat; amount: number }[] {
  const m = new RegExp(String.raw`^${AMOUNT}\s*(${STAT_NAMES})\s+and\s+(${STAT_NAMES})$`, "i").exec(clause.trim());
  if (!m) return [];
  const a = effect(m[1]!, m[2]!, m[3]!);
  const b = effect(m[1]!, m[2]!, m[4]!);
  return a && b ? [a, b] : [];
}

const TYPE_BY_NAME = new Map(Object.keys(CREATURE_TYPE).map((t) => [t.toLowerCase(), t as CreatureType]));
const RARITY_BY_NAME = new Map(Object.keys(RARITY).map((r) => [r.toLowerCase(), r as Rarity]));

/** "your Grass", "Common", "Water" — the filter words in front of "allies". */
function filtersFrom(words: string | undefined): { typeFilter?: CreatureType; rarityFilter?: Rarity } {
  if (!words) return {};
  const out: { typeFilter?: CreatureType; rarityFilter?: Rarity } = {};
  for (const word of words.split(/\s+/)) {
    const type = TYPE_BY_NAME.get(word.toLowerCase());
    // The wildcard is not a filter: "All allies" means every ally, which is the unfiltered selector.
    if (type && CREATURE_TYPE[type].kind === "element") out.typeFilter = type;
    const rarity = RARITY_BY_NAME.get(word.toLowerCase());
    if (rarity) out.rarityFilter = rarity;
  }
  return out;
}

function manualTrigger(
  record: CreatureRecord,
  effects: { stat: ModifierStat; amount: number }[],
  target: TargetSelector,
  includeSelf: boolean,
): AbilityTag | null {
  if (effects.length === 0) return null;

  // No trigger on the record means no button could be offered, and guessing one would assert a fact
  // no source supports (research.md R4).
  if (!record.abilityTrigger) return null;

  /*
   * THE DOUBLE-COUNT GUARD, and it fires on real creatures.
   *
   * `enginePropagated` means `simulate()` already fires this trigger during a battle, so offering a
   * manual "bank it once" button would let the user add a bonus the engine is already computing.
   * Round 6 made that a hard invariant and two tests enforce it.
   *
   * Six species reach here and are refused: Aster, Ginsage, Lumijel, Brimtoad and Emperooze (On
   * Battle Start) and Boomagon (On Cast). Their text IS a permanent grant and the rule table reads
   * it correctly — but the family is wrong for them. "On Battle Start: adjacent Water allies gain
   * +25 Heal permanently" is something the effect resolver can act on, so it wants a resolvable tag
   * (`ongoing`/`statusGrant` with a target), not a manual button. Deriving that family is
   * outstanding work; deriving a button here would be a regression dressed as coverage.
   */
  if (ABILITY_TRIGGER[record.abilityTrigger].enginePropagated) return null;

  return { kind: AbilityTagKind.ManualTrigger, trigger: record.abilityTrigger, effects, target, includeSelf };
}

/**
 * An `ongoing` aura grant, which the effect resolver ACTS ON — unlike `manualTrigger`.
 *
 * Returns `null` when the grant names a stat the tag vocabulary cannot carry, which is a real and
 * common case rather than a defensive check: `EffectDescriptor.statChange` covers only damage,
 * multicast and the two cooldown stats, and `statusGrant` only the four statuses. So Aster's
 * "Adjacent Water allies gain +25 Heal permanently" has **nowhere to be written** — `Heal` is a
 * published output stat with no slot in the ability vocabulary. Refusing is correct; inventing a
 * near-miss tag would make the engine compute something the card does not say.
 */
function ongoingGrant(
  targetWord: string,
  filterWords: string | undefined,
  clause: string,
  record: CreatureRecord,
): AbilityTag | null {
  const effects = allEffects(clause);
  if (effects.length !== 1) return null; // multi-stat auras need one tag each; not this round

  const effect = effects[0]!;
  const descriptor = EFFECT_FOR_STAT[effect.stat]?.(effect.amount);
  if (!descriptor) return null;

  const word = targetWord.toLowerCase();
  const filters = filtersFrom(filterWords);
  const target: TargetSelector | null =
    word === TargetKind.Adjacent
      ? { kind: TargetKind.Adjacent, ...filters }
      : word === "ally behind"
        ? { kind: TargetKind.Behind }
        : word === "allies"
          ? { kind: TargetKind.AllAllies, ...filters }
          : null;
  if (!target) return null;

  // Belt and braces: an `ongoing` tag IS engine-resolved, so a creature must never end up with both
  // this and a manual button. Round 6's guard asserts it; this makes it true by construction.
  if (record.abilityTags.length > 0) return null;

  return { kind: AbilityTagKind.Ongoing, target, effect: descriptor };
}

/** How a `ModifierStat` grant maps onto an `EffectDescriptor`. Absent = no slot in the vocabulary. */
const EFFECT_FOR_STAT: Partial<Record<ModifierStat, (amount: number) => EffectDescriptor>> = {
  [ModifierStat.DamageFlatAdd]: (amount) => ({ statChange: { stat: StatChangeStat.Damage, amount } }),
  [ModifierStat.MulticastAdd]: (amount) => ({ statChange: { stat: StatChangeStat.Multicast, amount } }),
  [ModifierStat.CooldownSpeedAdd]: (amount) => ({
    statChange: { stat: StatChangeStat.CooldownSpeed, amount },
  }),
  [ModifierStat.BurnAmountAdd]: (amount) => ({ statusGrant: { type: StatusEffectType.Burn, amount } }),
  [ModifierStat.PoisonAmountAdd]: (amount) => ({ statusGrant: { type: StatusEffectType.Poison, amount } }),
  [ModifierStat.ShockAmountAdd]: (amount) => ({ statusGrant: { type: StatusEffectType.Shock, amount } }),
  [ModifierStat.ShieldAmountAdd]: (amount) => ({ statusGrant: { type: StatusEffectType.Shield, amount } }),
  [ModifierStat.HealAmountAdd]: (amount) => ({ statChange: { stat: StatChangeStat.Heal, amount } }),
  // Still absent: `cooldownFlatAddSeconds`. `CooldownSpeedAdd` IS carried, but `effects.ts`
  // deliberately does not resolve it -- `simulate()` already sums it in `resolveCooldownSpeedTotal`
  // and resolving it twice would double-count.
};

// ---------------------------------------------------------------------------
// The rule table
// ---------------------------------------------------------------------------

/**
 * Ordered most specific first, because the first match wins. The ordering that matters: every rule
 * naming a TARGET must precede the bare self-grant, or "Adjacent Water allies gain +25 Heal
 * permanently" would be read as the creature buffing itself.
 */
const RULES: DerivationRule[] = [
  // "This and your Grass allies gain +10% Cooldown Speed permanently." — Ninflora, Brawlmantis,
  // Kickrane. `includeSelf` because the ally selectors exclude the source while the text names it.
  {
    family: "manualTrigger/this-and-allies",
    pattern: new RegExp(
      String.raw`^This and (?:all )?(?:your )?((?:\w+ )*?)all(?:y|ies) gain ((?:${AMOUNT}\s*(?:${STAT_NAMES})(?:,? and )?)+) permanently\.$`,
      "i",
    ),
    build: (m, r) =>
      manualTrigger(r, allEffects(m[2]!), { kind: TargetKind.AllAllies, ...filtersFrom(m[1]) }, true),
  },

  // "Adjacent Water allies gain +25 Heal permanently." — Aster, Ginsage. Self NOT included: the text
  // does not name it, and "adjacent" already excludes the source.
  {
    family: "manualTrigger/adjacent-allies",
    pattern: new RegExp(
      String.raw`^(?:Give )?Adjacent ((?:\w+ )*?)all(?:y|ies) (?:gain )?((?:${AMOUNT}\s*(?:${STAT_NAMES})(?:,? and )?)+) permanently\.$`,
      "i",
    ),
    build: (m, r) => manualTrigger(r, allEffects(m[2]!), { kind: TargetKind.Adjacent, ...filtersFrom(m[1]) }, false),
  },

  // "Give adjacent allies +1 Multicast permanently." — the imperative word order.
  {
    family: "manualTrigger/adjacent-allies",
    pattern: new RegExp(
      String.raw`^Give adjacent ((?:\w+ )*?)all(?:y|ies) ((?:${AMOUNT}\s*(?:${STAT_NAMES})(?:,? and )?)+) permanently\.$`,
      "i",
    ),
    build: (m, r) => manualTrigger(r, allEffects(m[2]!), { kind: TargetKind.Adjacent, ...filtersFrom(m[1]) }, false),
  },

  // "Give the ally behind +3% Cooldown Speed permanently." — Boomagon.
  {
    family: "manualTrigger/ally-behind",
    pattern: new RegExp(
      String.raw`^Give the ally behind ((?:${AMOUNT}\s*(?:${STAT_NAMES})(?:,? and )?)+) permanently\.$`,
      "i",
    ),
    build: (m, r) => manualTrigger(r, allEffects(m[1]!), { kind: TargetKind.Behind }, false),
  },

  // "Allies of level 3 or above gain +15 Damage and +15 Heal permanently." — Lumijel.
  {
    family: "manualTrigger/allies-min-level",
    pattern: new RegExp(
      String.raw`^Allies of level (\d) or above gain ((?:${AMOUNT}\s*(?:${STAT_NAMES})(?:,? and )?)+) permanently\.$`,
      "i",
    ),
    build: (m, r) =>
      manualTrigger(r, allEffects(m[2]!), { kind: TargetKind.AllAllies, minLevelFilter: Number(m[1]) }, false),
  },

  // "When you use an item, this gains +20 Damage and Shield." — Craghorn, Guardiant, Cawnushi,
  // Emburn. A leading trigger clause, then a self-grant; note Craghorn carries no "permanently" and
  // shares one amount across two stats.
  {
    family: "manualTrigger/triggered-self",
    pattern: /^(?:When|After|On)\b[^,]*,?\s*this gains (.+?)(?: permanently)?\.$/i,
    build: (m, r) => {
      const clause = m[1]!;
      const effects = sharedAmountEffects(clause);
      return manualTrigger(r, effects.length > 0 ? effects : allEffects(clause), { kind: TargetKind.Self }, false);
    },
  },

  /*
   * ONGOING AURA GRANTS — the first family that produces a RESOLVED tag.
   *
   * "Adjacent Grass allies gain +7% Cooldown Speed permanently." (Ginsage), "Ally behind has +100%
   * Shock." (Pylong). These are the six species the double-count guard refuses a manual button:
   * their trigger is one the engine already fires, so the correct representation is a tag the
   * resolver acts on, not a button the user presses.
   *
   * Scoped tightly to the SIMPLE shape — one target, one or two flat stat grants, nothing else in
   * the sentence. The family's other members are structurally different ("Allies gain Damage for
   * this battle equal to 0.8x their Shield" is `statFromStat`; "+10% Damage per Mythical Item used"
   * has no input in this model) and matching them loosely would fabricate engine behaviour.
   */
  {
    family: "ongoing/aura-grant",
    pattern: new RegExp(
      String.raw`^(?:Give )?(Adjacent|Ally behind|Allies)\s*((?:\w+ )*?)all(?:y|ies)?\s*(?:gain|has|have)\s+((?:${AMOUNT}\s*(?:${STAT_NAMES})(?:,? and )?)+)(?: permanently)?\.$`,
      "i",
    ),
    build: (m, r) => ongoingGrant(m[1]!, m[2], m[3]!, r),
  },

  // "+4 Burn and +4 Poison permanently." / "+50 Damage permanently." — the bare self-grant.
  // LAST, so any targeted shape above claims its text first.
  {
    family: "manualTrigger/self",
    pattern: new RegExp(
      String.raw`^((?:${AMOUNT}\s*(?:${STAT_NAMES})(?:,? and )?)+) permanently\.$`,
      "i",
    ),
    build: (m, r) => manualTrigger(r, allEffects(m[1]!), { kind: TargetKind.Self }, false),
  },
];

/** Which rule family matched, for the coverage report. `null` when nothing matched. */
export function derivedFamilyFor(record: CreatureRecord): string | null {
  for (const rule of RULES) {
    const m = rule.pattern.exec(record.abilityText.trim());
    if (m && rule.build(m, record)) return rule.family;
  }
  return null;
}

/**
 * The tags `record`'s own published text implies. `[]` when no rule matches, which is the common
 * case and deliberately silent — an unmatched ability is one the corpus has not modelled, exactly as
 * before, not an error.
 */
export function deriveAbilityTags(record: CreatureRecord): AbilityTag[] {
  for (const rule of RULES) {
    const m = rule.pattern.exec(record.abilityText.trim());
    if (!m) continue;
    const tag = rule.build(m, record);
    if (tag) return [tag];
  }
  return [];
}

/** Every family the table can produce, for the report and for the per-family tests. */
export const DERIVATION_FAMILIES: string[] = [...new Set(RULES.map((r) => r.family))];
