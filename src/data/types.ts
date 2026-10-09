/**
 * Shared data-model types for the Batomon Showdown DPS & Status Calculator.
 *
 * Source of truth: specs/001-batomon-dps-calculator/data-model.md
 * These types are implemented exactly as specified there (Constitution Principle II —
 * strict mode, closed discriminated unions, no bare strings for closed vocabularies).
 */

// ---------------------------------------------------------------------------
// Shared primitive types
// ---------------------------------------------------------------------------

/**
 * The closed vocabularies are STRING ENUMS, declared once in `./enums.ts` (2026-10-07, round 7).
 *
 * Imported as VALUES and re-exported, which serves both roles: every existing
 * `import type { Rarity } from "./types"` keeps working, this file can use them in type positions
 * below, and new code can reach for `Rarity.SuperRare`.
 *
 * The enums are **nominal** — a bare `"SuperRare"` is no longer assignable — which is the property
 * three rounds of literal unions could not provide and the whole reason the representation changed.
 * Per-member data (label, ordering, colour) lives in `./vocabularies.ts`.
 */
/*
 * Imported for this file's own type positions AND re-exported for consumers. Both are needed: a
 * bare `export … from` does not bring the names into local scope.
 */
import { AbilityTrigger, CreatureType, DamageChannel, EventLabel, GrantableStat, GridRow, ItemTargetKind, ModifierScope, ModifierStat, MultiplierScope, RegionId, RosterZone, StatusEffectType, TimelineEventKind } from "./enums";
import { ItemId, Species, TrainerId, TrinketId } from "./ids";
import { Rarity } from "./enums";
import { AbilityTagKind, StatChangeStat, TargetKind } from "./enums";

// Re-exports the LOCAL bindings above rather than a second `export … from "./enums"`, which would
// be a duplicate declaration of each name.
export { ItemId, Species, TrainerId, TrinketId };

export {
  AbilityTrigger,
  CreatureType,
  DamageChannel,
  EventLabel,
  GridRow,
  ItemTargetKind,
  ModifierScope,
  ModifierStat,
  MultiplierScope,
  Rarity,
  RegionId,
  RosterZone,
  StatChangeStat,
  StatusEffectType,
  TimelineEventKind,
};
export { StatColorKey } from "./enums";

/*
 * `CreatureType`'s provenance notes, which the registry's members now carry a `kind` for:
 *
 * research.md B7: "Fighting" is retained with a confidence flag rather than omitted or silently
 * trusted — it appears in ability text in creator footage per one source, but is explicitly flagged
 * there as unconfirmed by official publication.
 *
 * "Curio" and "NULL" added 2026-10-05 during the full-corpus widening pass (tasks.md T043): both
 * appear as literal Type-column values for multiple creatures across two independent sources —
 * https://batomonshowdown.wiki/batomon/ (Goldora: Curio) and https://batomon.net/batomon/
 * (Dollhime/Furnadon/Gachapod/Mallogre/Nekoffin/Pawsperity/Rubbin/Shrinell/Vipair: Curio;
 * MissingN./NULL-00/NULL-7F/NULL-FF: NULL) — so they are real closed-vocabulary members, not typos,
 * per Constitution Principle II. They are marked `placeholder` rather than `element` and remain
 * filterable; only the `wildcard` ("All") is withheld from filter lists.
 */

// ---------------------------------------------------------------------------
// Structured, closed-vocabulary ability hints
// ---------------------------------------------------------------------------

/**
 * A region: the pool of creatures a run draws from, chosen before anything else (T229/FR-087).
 * Open union, not a strict pair — the official notes say "the power level of **all regions**",
 * which does not commit to there being exactly two (research.md M4).
 */

/** T250/FR-100. The closed set of ability triggers (research.md N2). */
/*
 * `AbilityTrigger` now derives from the `ABILITY_TRIGGER` registry, which also absorbed
 * `TRIGGER_DEFINITIONS`' action labels, descriptions and `enginePropagated` flags — those were a
 * second map keyed by this union, i.e. the duplication round 7 removes.
 *
 * Two of its members, `On Item Used` and `On Knockout`, are values batodex's own `trigger` field
 * leaves null and had to be read from ability text instead. Both describe real, repeatable triggers
 * — Craghorn's "when you use an item" and Cawnushi's "on knockout of any monster" — and their
 * absence is why those creatures had no trigger at all. `On Knocked Out` is about THIS creature
 * dying; `On Knockout` is about any monster dying. Different events, easily conflated, so both are
 * spelled out.
 */

/**
 * Filters a selector can additionally apply. Round 11 (T225): real ability text needs all three,
 * and tagging creatures before these existed would have meant either skipping them or encoding
 * them wrongly:
 *   rarity  — "This and Common allies gain +10 Damage permanently." (Brawlmantis)
 *   level   — "+160 Damage for each ally of level 3 or above." (Orcana)
 */
export interface SelectorFilters {
  typeFilter?: CreatureType;
  rarityFilter?: Rarity;
  /** Matches allies at or above this level. */
  minLevelFilter?: number;
  /**
   * Matches only allies with NO ability — Stellagon's "adjacent allies with no abilities have +2
   * Multicast" (2026-10-09).
   *
   * Read through `hasAbilityText`, the same predicate the coverage report uses to decide whether
   * a creature has an ability worth modelling at all, so "no abilities" means one thing in the
   * engine and on screen. 62 species in the corpus publish no ability text, so this is a real
   * archetype and not a one-creature special case.
   */
  noAbilityFilter?: boolean;
}

export type TargetSelector =
  | { kind: TargetKind.Self }
  | ({ kind: TargetKind.Adjacent; sameTeamOnly?: boolean } & SelectorFilters)
  | ({ kind: TargetKind.Row; sameTeamOnly?: boolean } & SelectorFilters)
  /** One column LEFT, same row. Carries `SelectorFilters` for Blixie's "the Fire ally behind". */
  | ({ kind: TargetKind.Behind } & SelectorFilters)
  /**
   * Carries `SelectorFilters` as of 2026-10-08, for Cicadence's "Trigger the **Bug** ally above"
   * and Dryadell's "**Grass** ally above". A no-op for the nine existing `above` tags, which are
   * all unfiltered `buffOnCast` grants — but the filter is load-bearing for the two new ones: the
   * ability does nothing at all when the monster above is of the wrong type, and an unfiltered
   * selector would have triggered whoever happened to be standing there.
   */
  | ({ kind: TargetKind.Above } & SelectorFilters)
  /**
   * The ally directly IN FRONT — the opposite direction to `behind`. Distinct because the board is
   * two rows and the relationship is not symmetric: Saberhorn's "give the ally in front +1
   * Multicast" reads from the back row forward, where `behind`/`above` read from the front row back.
   *
   * Carries `SelectorFilters` as of 2026-10-08, user-reported. Zephyrex reads "give the **Flying**
   * ally in front +1 Multicast" and the selector had no way to say so, so the engine handed the
   * Multicast to whoever was standing there — on the reporting user's own board that was a Toxic
   * Venopuff, whose cast count it more than doubled. Saberhorn's is genuinely unfiltered and is
   * unaffected.
   */
  | ({ kind: TargetKind.InFront } & SelectorFilters)
  | ({ kind: TargetKind.AllAllies } & SelectorFilters);

export interface EffectDescriptor {
  /**
   * `cooldownFlatSeconds` added 2026-10-06 (T227a) for Saberhorn's "+8 seconds to this monster's
   * Cooldown". Deliberately NOT expressed as a `cooldownSpeed` percentage: "+8 seconds" is an
   * absolute quantity, and converting it would make the cost depend on the base cooldown, which is
   * not what the ability says.
   */
  statChange?: {
    stat: StatChangeStat;
    amount: number;
  };
  statusGrant?: { type: StatusEffectType; amount: number };
  extraOngoingApplications?: number;
}

/**
 * Structured hints extracted from abilityText so the engine does not parse free text at
 * runtime. Each tag encodes one part of the ability's cited description.
 */
export type AbilityTag =
  | { kind: AbilityTagKind.Ongoing; target: TargetSelector; effect: EffectDescriptor }
  /**
   * "Trigger <target>" — one creature making another cast out of turn.
   *
   * Both halves of the family resolve as of 2026-10-08, and they resolve by different mechanisms
   * because they mean different things:
   *
   * - `OnBattleStart` (Coalem, Frizzly, NULL-FF) pulls the target's FIRST cast to t=0. See the
   *   battle-start block in `simulate.ts` for why that is identical to an extra cast at zero and
   *   why the identity makes the simpler implementation the right one.
   * - `OnCast` (Cicadence, Dryadell, Torrantler, Opalion) queues an EXTRA cast for the target,
   *   leaving its own cooldown untouched — FR-099's rule, established by Puffloon.
   */
  | {
      kind: AbilityTagKind.Trigger;
      target: TargetSelector;
      event: EventLabel;
      /**
       * "(Except other Torrantler)" / "(Except other Opalion)" — the ability skips its own
       * species. Both creatures carrying this clause are of the type they target, so without it
       * two of them standing together would trigger each other every cast.
       */
      excludeSameSpecies?: boolean;
      /**
       * "Trigger **1 random** Rock allies" — Opalion, the only creature in the corpus whose target
       * is chosen at random.
       *
       * The engine is deterministic and must stay so: the placement optimiser simulates 720 boards
       * and compares their scores, which a coin flip inside `simulate()` would turn into noise. So
       * `count` targets are picked deterministically, and `simulate()` picks them by SPECIES ID
       * rather than by slot order — see there. That keeps the choice independent of where anybody
       * is standing, so this models the right NUMBER of extra casts without inventing a positional
       * preference the game does not have for the optimiser to chase.
       */
      count?: number;
    }
  | { kind: AbilityTagKind.OnEvent; event: EventLabel; effect: EffectDescriptor }
  | { kind: AbilityTagKind.CooldownSpeedModifier; target: TargetSelector; amount: number }
  | { kind: AbilityTagKind.StatusGrant; target: TargetSelector; status: StatusEffectType; amount: number }
  /**
   * 2026-10-06 round 9 (FR-073). Three kinds the effect resolver acts on.
   *
   * "On Battle Start: gain <status> equal to <multiplier>x the total <status> of your allies."
   * Reads allies' per-application amounts (not accumulated stacks) and excludes self and
   * same-species allies — see `effects.ts` for why each of those is decided rather than guessed.
   */
  | { kind: AbilityTagKind.BattleStartStatusFromAllies; status: StatusEffectType; multiplier: number }
  /** "Whenever an ally inflicts <status>, Charge this by <seconds> second(s)." Shortens this
   * creature's remaining cooldown during the battle, so it needs the event-driven scheduler. */
  | { kind: AbilityTagKind.ChargeOnAllyStatus; status: StatusEffectType; seconds: number }
  /** "When a <typeFilter> ally casts, give it +<amount> Cooldown Speed for this battle."
   * Recorded for completeness; see `effects.ts` for current coverage. */
  | { kind: AbilityTagKind.CooldownSpeedOnAllyCast; typeFilter?: CreatureType; amount: number }
  /**
   * 2026-10-06 round 10 (T219). Two scaling shapes that the selector-based tags above cannot
   * express, because their magnitude depends on the board rather than being a fixed amount.
   *
   * Count scaling: "+<effect> for each <typeFilter> ally [in <rowFilter>]". `effect` is applied
   * once per match, to whoever `target` selects.
   */
  | {
      kind: AbilityTagKind.StatFromCount;
      target: TargetSelector;
      effect: EffectDescriptor;
      typeFilter?: CreatureType;
      rarityFilter?: Rarity;
      minLevelFilter?: number;
      rowFilter?: GridRow;
      /** Default false: "each ally" excludes the creature itself, matching `effects.ts` ally rule. */
      includeSelf?: boolean;
    }
  /**
   * Stat scaling: "gain <effect> equal to <multiplier>x the <sourceStat> of <sourceSelector>".
   * Reads BASE values of the pool, so two creatures scaling off each other cannot feed back.
   */
  /**
   * 2026-10-06 round 11 (T224). "On Cast: +N <stat> for this battle" — the ACCUMULATING buff.
   *
   * research.md L5: this is the single largest mechanism in the corpus (~40 creatures) and the
   * reason the taxonomy's "Unclassified" bucket resisted classification. It reads like a static
   * self-buff and is not: the trigger fires on every cast, so Mosslug is at +20 Damage after its
   * first cast, +40 after its second. "For this battle" scopes how long the bonus PERSISTS, not how
   * often it is GRANTED.
   *
   * It cannot live in `effects.ts`, which resolves once before the battle starts. It is applied by
   * `simulate()` inside the cast loop.
   */
  | { kind: AbilityTagKind.BuffOnCast; target: TargetSelector; effect: EffectDescriptor }
  /**
   * 2026-10-06 (T220). "+N <stat> for each UNIQUE TYPE on your team" — Prismagon.
   *
   * `statFromCount` cannot express this: it counts *allies matching a filter*, whereas this counts
   * *distinct type values across the team*, a different cardinality. Two Fire allies are two
   * matches for `statFromCount` but one unique type here.
   */
  /**
   * 2026-10-06 (T214 / FR-080). "Trigger this when <target> allies trigger" — a CHAINED cast.
   *
   * The creature casts in response to an ally rather than only on its own cooldown, so it needs
   * the ally-cast hook from T213. Chains are depth-capped; see `MAX_CHAIN_DEPTH` in `simulate.ts`.
   */
  | {
      kind: AbilityTagKind.TriggerOnAllyCast;
      target: TargetSelector;
      /** "(Except other Snapscald)". Same clause, same meaning, as on `TriggerOnAllyTrigger`. */
      excludeSameSpecies?: boolean;
    }
  /**
   * 2026-10-06 (T240 / FR-094). Multiplicative stat scaling — "+70% to mons with cooldown >= 5s".
   * The tag vocabulary could not express a multiplier at all; the capture shows one driving the
   * board's largest numbers.
   */
  /**
   * `stat` accepts a SINGLE `StatusEffectType` as of 2026-10-09, alongside the broad scopes.
   *
   * `MultiplierScope.Status` multiplies every status at once, which is right for "+70% to all
   * stats" and wrong for Geminiss's "+50% **Shield**" and Pylong's "+100% **Shock**" — on a target
   * carrying more than one status it would inflate the others too.
   */
  | {
      kind: AbilityTagKind.StatMultiplier;
      target: TargetSelector;
      stat: MultiplierScope | StatusEffectType;
      factor: number;
    }
  /**
   * 2026-10-06 (T244 / FR-098). "additional Damage equal to 200% of the Poison stacks on the
   * enemy" — Fumungus. Read from the SHARED TARGET's accumulated status, recomputed every cast and
   * never persisted. `statFromStat` cannot express it: that reads a selector over **allies**.
   *
   * This was the captured team's largest damage term (14K+ by t~6.3, against Thorntail's 7994) and
   * it grows superlinearly, because Poison stacks only ever accumulate.
   */
  | { kind: AbilityTagKind.StatFromTargetStatus; status: StatusEffectType; multiplier: number }
  /**
   * 2026-10-06 (T245 / FR-099). "Trigger this when adjacent Toxic allies trigger" — Puffloon.
   *
   * Distinct from `triggerOnAllyCast`: this fires on an ally's TRIGGER and **must not reset or
   * consume the reactor's own cooldown**. The capture is unambiguous — Puffloon's bar climbed
   * monotonically 13 -> 19px through a four-hit cascade and it still cast off its own 10s cycle
   * afterwards.
   */
  | {
      kind: AbilityTagKind.TriggerOnAllyTrigger;
      target: TargetSelector;
      /**
       * "(Except other Puffloon)" — 2026-10-09. Puffloon is itself Toxic and reacts to adjacent
       * TOXIC allies, so two of them standing together satisfied each other's selector and traded
       * free casts. The clause was in the text from the start and expressed nowhere.
       */
      excludeSameSpecies?: boolean;
    }
  /**
   * 2026-10-07. A repeatable permanent stat gain whose trigger the BATTLE ENGINE cannot fire —
   * buying a monster, using an item, winning a round, gaining a trinket.
   *
   * These are real abilities with real numbers, but they fire on run events outside the battle this
   * engine simulates, so there is nothing for the resolver to hook. Recording them as data anyway
   * lets the UI offer a one-click way to bank each occurrence, instead of the user hand-typing
   * "+20 Damage, +20 Shield" into the modifier editor every time they use an item.
   *
   * Deliberately NOT in `RESOLVED_TAG_KINDS`: the engine must keep treating these as unmodelled, or
   * the coverage counter would claim abilities it does not compute.
   */
  | {
      kind: AbilityTagKind.ManualTrigger;
      trigger: AbilityTrigger;
      /** Applied once per press, as placement modifiers. */
      effects: { stat: ModifierStat; amount: number }[];
      /**
       * 2026-10-07 (user-reported). WHO receives `effects`. Absent means the creature itself, which
       * is the case for seven of the nine species carrying this tag.
       *
       * The other two grant to allies — Brawlmantis's "This and Common allies gain +10 Damage
       * permanently", Kickrane's "This and all your allies" — and the tag previously could not say
       * so, so every press banked the bonus on the presser alone and the allies named in the
       * ability text were silently left out.
       */
      target?: TargetSelector;
      /**
       * Whether the presser is also a recipient. Needed because the ally selectors exclude the
       * source (`effects.ts`'s rule that "ally" means someone else), while these abilities read
       * "**This** and ... allies" — the presser is named separately from the selector. Defaults to
       * false, matching `statFromCount`'s `includeSelf`; irrelevant when `target` is self.
       */
      includeSelf?: boolean;
    }
  /**
   * 2026-10-06 (T241 / FR-095). "When allies inflict <status>, this gains +N <stat> permanently" —
   * Thorntail.
   *
   * The gain is **never scaled**. Thorntail entered the recorded battle at 7082 displayed damage
   * against a listed base of 50 — so it carried enormous modifiers — and every single increment was
   * still exactly its listed +24. It therefore lands in `postMultiplierFlatAdd`, not `base`.
   */
  | { kind: AbilityTagKind.GainOnAllyStatus; status: StatusEffectType; stat: StatChangeStat.Damage; amount: number }
  | { kind: AbilityTagKind.StatFromUniqueTypes; target: TargetSelector; effect: EffectDescriptor }
  /**
   * 2026-10-06 (T220). "Knockout adjacent allies and gain <effect> for each ally knocked out" —
   * Petrirex. A SELF-INFLICTED knockout resolved at battle start.
   *
   * This is the narrow slice of the knockout family a battle simulator can model, and the reason it
   * is tractable where the rest is not: the victims are chosen by POSITION, not by who happens to
   * die during the fight, so the outcome is known before the first cast. The general knockout
   * family (a creature dying to incoming damage) still needs an HP model this engine does not have.
   */
  | {
      kind: AbilityTagKind.KnockoutAlliesOnBattleStart;
      target: TargetSelector;
      effectPerKnockout: EffectDescriptor;
    }
  /**
   * 2026-10-08. "Knocked-out allies are revived and gain +N% Cooldown Speed for this battle" —
   * Shikitsune. The other half of `KnockoutAlliesOnBattleStart`, and only meaningful beside it.
   *
   * The victims it can reach are exactly the ones that tag produces: allies knocked out by a
   * teammate's own battle-start ability, where who dies is decided by POSITION and so is known
   * before the first cast. A creature that dies to incoming damage is still outside this engine,
   * because there is no HP model to kill it with.
   *
   * `cooldownSpeedBonus` is a FRACTION (`0.15` for +15%), matching every other cooldown-speed
   * amount in the vocabulary.
   */
  | { kind: AbilityTagKind.ReviveKnockedOutAllies; cooldownSpeedBonus: number }
  | {
      kind: AbilityTagKind.StatFromStat;
      sourceSelector: TargetSelector;
      sourceStat: StatusEffectType | StatChangeStat.Damage | StatChangeStat.Multicast;
      multiplier: number;
      effect: EffectDescriptor;
      /**
       * "(Except other Aegistruct / Gaiadrasil / Quillustrous)" — 2026-10-09. All three scale off
       * a pool of allies and all three exclude their own species from it, which matters most
       * precisely when you would reach for a second copy: two Gaiadrasil would otherwise each
       * count the other's damage, and the pair would feed each other.
       */
      excludeSameSpecies?: boolean;
    }
  /**
   * 2026-10-08. "Has additional Damage equal to 20 times this monster's Burn" — Lignite.
   *
   * The third member of the stat-scaling trio, which previously had a hole in the middle:
   * `StatFromStat` reads a selector over ALLIES and `StatFromTargetStatus` reads the enemy, so a
   * monster scaling off its OWN stat had nowhere to be written.
   *
   * ## This is not an "Effective this battle" effect, and that is the point
   *
   * Every other resolvable tag describes something the BATTLE does — an ally's aura, a trinket, an
   * on-battle-start grant — so the Calculator shows it in the "Effective this battle" band and
   * leaves the card and grid chip reading the published figure. The game does the opposite with
   * this family: a Lignite holding 5 Burn shows a **100 Damage chip** on its team-pane tile and
   * 100 on its ability card, because the ability is a restatement of what the monster IS rather
   * than something happening to it. So this tag resolves in `engine/selfScaling.ts`, which runs on
   * the card and chip path as well as the engine's, and deliberately NOT in `resolveBoard`.
   *
   * `sourceStat` is a status and never a stat this tag can itself write, so the scaling cannot
   * feed itself: the value is a fixed point by construction rather than by iteration limit.
   */
  | {
      kind: AbilityTagKind.StatFromOwnStat;
      sourceStat: StatusEffectType;
      stat: StatChangeStat.Damage | StatChangeStat.Heal;
      multiplier: number;
    }
  /**
   * 2026-10-08. "Remove 15 stacks of every debuff on your team" (Runerock) and "Remove 20% of
   * debuffs on your team" (Sirenade) — the corpus's only two cleansers, and until now the only
   * defensive mechanic with no representation at all.
   *
   * ## It describes an effect on US, which is why it took a new shape
   *
   * Every other tag in this union acts on the team's OUTPUT — what a monster emits, or what a
   * teammate's aura does to that. This one acts on the enemy's output, and the engine simulates
   * against an "idealized target" with no incoming side at all. So there is nothing in
   * `simulate()` for it to hook, and it is deliberately not resolved there.
   *
   * It is read by `engine/survivability.ts` instead, which prices it against an ASSUMED incoming
   * debuff rate rather than a simulated one. That makes it the one tag whose value depends on an
   * assumption about the opponent — see that module for the assumption and why it is the least
   * arbitrary one available.
   *
   * Exactly one of `stacks` and `fraction` is set, matching the two wordings the corpus uses.
   * `fraction` is a proportion (`0.2` for 20%), like every other fractional amount here.
   */
  | { kind: AbilityTagKind.CleanseDebuffs; stacks: number; fraction?: undefined }
  | { kind: AbilityTagKind.CleanseDebuffs; fraction: number; stacks?: undefined }
  /**
   * "(Zephyrex can't have Multicast)" — a restriction on what this monster may RECEIVE, as opposed
   * to anything it does (2026-10-08, user-reported).
   *
   * It is the first tag of its shape and it earns one. Zephyrex is itself Flying, so the most
   * obvious board to build around it — a second Zephyrex in front of the first — is exactly the
   * one the parenthetical forbids, and without this the engine would quietly reward stacking them.
   * The clause is in the ability text precisely because a player would otherwise try it.
   *
   * Enforced at both places a Multicast grant can land: the static resolver in `effects.ts` and
   * the per-cast `buffOnCast` accumulation in `simulate.ts`. A USER modifier still applies — that
   * is the user asserting something about their own run, and the engine does not overrule it.
   *
   * Three further creatures carry the same shape for Charge (Dracana, Ironcore, Steamscuttle). They
   * are deliberately NOT tagged: the granting half of their abilities is itself unmodelled, so a
   * restriction on it would guard nothing and would claim coverage this engine does not have.
   */
  | { kind: AbilityTagKind.CannotGain; stat: GrantableStat }
  /**
   * "Give the Fire ally behind [Nx] **this monster's Burn**" — Blixie (2026-10-09).
   *
   * The giver's view of `StatFromStat`, and the hole that family left. `StatFromStat` is the
   * RECEIVER scaling off a pool of allies; every other grant shape carries a fixed amount. Blixie
   * is neither: it hands a neighbour an amount derived from its OWN stat, so the magnitude is
   * known only once Blixie's own line has resolved.
   *
   * Resolved in the delta pass for that reason — reading the giver's post-multiplier value and
   * writing the target's, so a Blixie whose Burn an aura has raised passes on the raised figure.
   */
  | {
      kind: AbilityTagKind.GrantFromOwnStat;
      target: TargetSelector;
      /** The giver's stat that sets the amount. */
      sourceStat: StatusEffectType;
      /** What the target gains. Separate from `sourceStat` because nothing says they must match. */
      grantStat: StatusEffectType;
      multiplier: number;
    }
  /**
   * "Charge the ally behind by N second(s)" — Dracana, Ironcore, Steamscuttle (2026-10-09).
   *
   * The GIVING half of charge. `ChargeOnAllyStatus` is the receiving half (Cobrex pulling its own
   * cast forward when an ally inflicts Poison), and only that half existed, so three creatures
   * whose entire ability is accelerating a neighbour did nothing at all.
   *
   * Fires on the giver's cast and shortens the target's remaining cooldown, which is exactly what
   * `simulate()` already does for `chargeRules` — the same clamp against scheduling into the past
   * applies, so a charge that would make a creature ready retroactively fires it at the next step.
   */
  | { kind: AbilityTagKind.ChargeAlly; target: TargetSelector; seconds: number }
  /**
   * "Trigger this when an ally applies Shield. (Except other Rhizuka)" — Rhizuka (2026-10-09).
   *
   * A third reactive hook beside `triggerOnAllyCast` (react to the ACT of casting) and
   * `triggerOnAllyTrigger` (react to another reaction). This one reacts to a status APPLICATION,
   * which the engine already records per instant as `appliedThisInstant` for the charge and
   * `gainOnAllyStatus` hooks — so the event existed and only this listener was missing.
   */
  | {
      kind: AbilityTagKind.TriggerOnAllyStatus;
      status: StatusEffectType;
      excludeSameSpecies?: boolean;
    }
  /**
   * "On ally knockout, this gains 70% of their Damage for this battle. (Except other Danuki)" —
   * Danuki (2026-10-09).
   *
   * Reachable precisely because the engine models the one knockout family it can: a teammate's
   * Petrirex or Rattleghast kills its neighbours at battle start, by POSITION, so who dies is
   * known before the first cast. Danuki reads those casualties. A creature dying to incoming
   * damage is still outside this engine, and on such a board Danuki simply gains nothing — which
   * understates it rather than inventing a figure.
   */
  | {
      kind: AbilityTagKind.GainOnAllyKnockout;
      stat: StatChangeStat.Damage;
      /** `0.7` for "70% of their Damage". */
      fraction: number;
      excludeSameSpecies?: boolean;
    };

// ---------------------------------------------------------------------------
// Corpus entities
// ---------------------------------------------------------------------------

/**
 * The parts of a creature that are the SAME at every level (2026-10-08).
 *
 * Measured over the pre-collapse corpus of 596 records (149 species x exactly 4 levels): every
 * field below held an identical value across all four of a species' records, without exception.
 * That measurement is what makes the split safe, and it is why these fields live on the species
 * once instead of being repeated four times.
 */
interface CreatureIdentity {
  /** Stable slug across levels, e.g. `Species.Bumblebolt` -> "bumblebolt". */
  id: Species;
  name: string;
  rarity: Rarity;
  /** 1 or 2 entries typically; ["All"] for Omnichrome-style exceptions */
  types: CreatureType[];
  /** Per-species confirmed level cap, when sourced; absent = not yet researched (NOT every
   * creature is assumed to reach 4 by default — see research.md D2's Sukoi example). */
  confirmedMaxLevel?: 1 | 2 | 3 | 4;
  /** Extra gold gained when sold (2026-10-05 round 4, research.md F3) — shop/economy data
   * (research.md B6, out of scope for the engine), recorded for Corpus Browser completeness. */
  sellValue?: number;
  /** CreatureRecord.id this transforms into, if any (e.g. Riglet -> Rigalord) */
  evolvesInto?: Species;
  /**
   * The level at which `evolvesInto` takes effect, e.g. 3 for Panbud -> Bambudo (2026-10-05
   * round 3, data-model.md's "Evolution-aware leveling" amendment). Required whenever
   * `evolvesInto` is set; a species with no evolution has neither field.
   */
  evolvesAtLevel?: 2 | 3 | 4;
  /**
   * The ability's trigger label, which the in-game card renders as its own emphasised line
   * *above* the description (e.g. "On Battle Start", "On Cast", "Ongoing") -- 2026-10-06 round 6,
   * research.md H1. `abilityText` holds only the description, so without this the card silently
   * drops a line the reference card shows. Absent = render the description alone, never an empty
   * trigger line.
   */
  /**
   * T250/FR-100: a CLOSED union, not a free string.
   *
   * Sourced from batodex's own `trigger` field, which is already discrete — 8 values across 144
   * monsters (research.md N2), matching our corpus's distribution exactly. `undefined` is a real
   * state (an ability with no trigger), distinct from "not yet researched".
   *
   * Note for the record: nothing in this codebase ever parsed this string — it has one consumer, a
   * display in `BatomonCard`, and the engine branches on `tag.event`. The defect being fixed is
   * that `string` permitted typos no compiler would catch, which is how `"On Knocked Out"` and
   * `"On Knockout"` could have silently coexisted.
   */
  abilityTrigger?: AbilityTrigger;
  /**
   * Vendored sprite filename (2026-10-06 round 6, research.md H3), resolved at render time
   * against `${import.meta.env.BASE_URL}sprites/monster/` -- see `src/ui/shared/Sprite.tsx`.
   *
   * Stored per record rather than derived from `id` because 11 of 149 species publish under a
   * different slug than their corpus id (e.g. `craghorn` -> `alpinine.png`, `pyronade` ->
   * `infernade.png`, `null00` -> `null_00.png`). Absent = render the text-only presentation,
   * never a broken <img>.
   */
  spriteFile?: string;
}

/**
 * The parts of a creature that CAN differ between its four levels.
 *
 * Every one of these was measured to actually vary for at least one species, so the split is drawn
 * from the data rather than guessed: `abilityText` varies for 103 species, `publishedCast` for 61,
 * `appliesStatus` for 48, `baseMulticast` for 37, `abilityTags` for 30, `baseCooldownSeconds` for
 * 17, `healAmount` for 13 and `shopCost` for exactly one (Kindlepot, which publishes 10/0/0/0).
 *
 * The progressions are NOT formulaic and must stay as stored values: level 2 and 3 are usually 2x
 * and 3x level 1, but level 4 multipliers observed across the corpus include 1x, 2x, 3x, 6x, 12x,
 * 24x, 30x, 100x and 999x. Damage alone has 15 distinct progression shapes.
 */
export interface CreatureLevelStats {
  /** Gold cost at level 1; merge levels typically have no independent shop cost */
  shopCost: number;
  /** null for creatures with no ordinary cooldown cast */
  baseCooldownSeconds: number | null;
  /**
   * The creature's published damaging cast, or ABSENT if it has none (2026-10-07, round 7 WI-004).
   *
   * Replaces the `(baseDamage, damageType)` pair, which was two nullable fields that had to agree.
   * Measured over all 596 records they always did — `damageType` was `null` exactly when
   * `baseDamage` was, zero exceptions either way — so the pair stored one fact in two places and
   * four representable combinations of which only two were legal. One optional field cannot
   * disagree with itself, which is the whole point: the illegal state stops being representable
   * rather than being prevented by a test.
   *
   * 240 of 596 records have no cast at all. That is the common case, not an edge case: a shield or
   * status creature deals no direct damage, and absence says so better than two nulls did.
   *
   * A modifier or an ability grant can still CREATE a cast for a creature with none — see
   * `engine/modifiers.ts`. That now reads as "no `publishedCast`, but a resolved cast", instead of
   * two nullables that had to be updated together.
   */
  publishedCast?: { damage: number; channel: DamageChannel };
  /**
   * Number of independent direct-damage events a single cooldown completion fires (2026-10-05
   * round 2, research.md D3). Default `1` ("no stated Multicast bonus") — backfilled onto all
   * existing records rather than flagged unconfirmed, since "1 = none" is the reasonable
   * baseline absent contrary evidence in `abilityText`.
   */
  baseMulticast: number;
  /**
   * HP restored per cast, resolved after damage in the same tick (2026-10-05 round 4,
   * research.md F3). Corpus data only — not simulated, same "no modeled target/HP pool" gap as
   * Shield absorption (tasks.md T037) — until/unless a target entity exists.
   */
  healAmount?: number;
  /** Layers/shield applied per cast, if any */
  appliesStatus?: { type: StatusEffectType; amount: number }[];
  abilityText: string;
  abilityTags: AbilityTag[];
}

/**
 * What a level 2-4 entry may restate. Anything omitted is INHERITED from level 1.
 *
 * The inheritance rule means absence here cannot express "this creature loses a stat as it levels".
 * That is deliberate and it is safe against the real corpus: measured across all 596 pre-collapse
 * records, no species gains or loses its `publishedCast` between levels, and no `appliesStatus`
 * array changes length. Every observed difference is a change of MAGNITUDE, never of shape. If a
 * future creature does drop a stat at level 4, this type has to grow an explicit sentinel — it
 * must not be faked by omission.
 */
export type CreatureLevelOverride = Partial<CreatureLevelStats>;

/**
 * One creature, STORED once (2026-10-08).
 *
 * This is the shape `creatures.ts` holds. The level 1 stat line sits inline on the species, and
 * `levels` carries only what changes at 2, 3 and 4 — which is a small fraction of the whole: 119
 * of 149 species have identical `abilityTags` at every level, 132 an identical cooldown, and 112
 * an identical multicast.
 *
 * Consumers do NOT read this. They read `CreatureRecord`, the resolved view for one level, which
 * `data/corpus.ts` materialises. Keeping the stored shape and the read shape as separate types is
 * what let this collapse happen without touching the renderers and the engine's stat maths.
 */
export interface CreatureSpecies extends CreatureIdentity, CreatureLevelStats {
  /**
   * Never set. Declared so a `CreatureRecord` is NOT assignable to a `CreatureSpecies`.
   *
   * Without it the two types are structurally compatible — `CreatureRecord` is a `CreatureSpecies`
   * plus a `level` — so a test fixture built as level records could be handed to the engine as a
   * species list and compile. Three such fixtures existed, and they did not fail loudly: the
   * engine read the LAST entry for a duplicated id and silently simulated the wrong stat line.
   */
  level?: never;
  levels?: Partial<Record<2 | 3 | 4, CreatureLevelOverride>>;
}

/**
 * One creature AT ONE LEVEL — the flat, fully-resolved view everything downstream reads.
 *
 * Identical in shape to what the corpus stored directly before the 2026-10-08 collapse, which is
 * the point: the engine, the cards and the pickers were not rewritten, only the storage was.
 * Produced by `resolveSpeciesLevel` in `data/corpus.ts`; never written by hand outside tests.
 */
export interface CreatureRecord extends CreatureIdentity, CreatureLevelStats {
  /**
   * Widened 1-3 -> 1-4 (2026-10-05 round 2, research.md D2): standard merging only reaches
   * level 3 (3x L1 -> L2, 2x L2 -> L3); level 4 is reachable only via rare in-run events or
   * consumable level-up items, and is NOT guaranteed for every species.
   */
  level: 1 | 2 | 3 | 4;
}

/** The levels every species publishes a stat line for. */
export const CREATURE_LEVELS = [1, 2, 3, 4] as const;
export type CreatureLevel = (typeof CREATURE_LEVELS)[number];

/**
 * Everything a creature emits in one cast — the ONE shape the stat band renders from.
 *
 * ## Why this type exists
 *
 * `buildStatLines` was already shared by both bands, so the *component* was never duplicated. The
 * duplication was one level down: it took a loose bag of parameters in which `healAmount` and
 * `multicast` were **optional**, and each call site hand-mapped its own differently-named source
 * onto them — `creature.healAmount` here, `effective.heal` there; `creature.baseMulticast` here,
 * `effective.multicast` there.
 *
 * Optional plus hand-mapping meant forgetting a field compiled cleanly. It did: the effective band
 * omitted healing, so nine creatures whose only output is a heal rendered "No published per-cast
 * output" directly beneath a card showing their heal.
 *
 * Every field here is **required**, so a producer that forgets one is a type error rather than a
 * blank panel. Adding a future output stat breaks both producers at compile time, which is the
 * point — that is the only thing that keeps two renderings of the same concept honest.
 */
export interface PerCastOutput {
  damage: number | null;
  damageType: DamageChannel | null;
  appliesStatus: { type: StatusEffectType; amount: number }[];
  heal: number | null;
  multicast: number;
}

export interface TrainerRecord {
  id: TrainerId;
  name: string;
  /** Vendored trainer sprite filename (T255/FR-102), under `public/sprites/trainer/`. */
  spriteFile?: string;
  abilityText: string;
  abilityTags: AbilityTag[];
}

export interface TrinketRecord {
  id: TrinketId;
  name: string;
  effectText: string;
  /** Added 2026-10-06 round 5 -- batodex.com's trinket database publishes rarity directly,
   * same closed Rarity union creatures already use. */
  rarity?: Rarity;
  abilityTags: AbilityTag[];
  /**
   * Added 2026-10-06 round 5 (research.md G2): flat, unconditional, permanent team-wide stat
   * bonuses this trinket grants when selected -- the only trinket-effect shape this engine
   * simulates. Most trinket effects (shop/economy mechanics) have no entry here and remain
   * real, cited, browsable-only corpus data. Deliberately a flat list, not the full creature
   * AbilityTag/TargetSelector shape -- every trinket effect this maps applies to "your team,"
   * unconditionally, so there is no positional targeting to encode.
   */
  effectTags?: { stat: ModifierStat; amount: number }[];
  /**
   * A permanent grant that lands on ONE monster rather than on the whole team (2026-10-08).
   *
   * Tempo Charm reads "On Battle Start, a random monster gains +4% Cooldown Speed permanently",
   * which `effectTags` cannot express in either direction: as a team-wide +4% it is six times too
   * much, and as nothing at all it is a trinket the tool says does nothing. The recipient is also
   * not ours to decide — the game already rolled it, and the user is reconciling a board they are
   * looking at, the same argument `ItemTargetKind.Chosen` makes for Cake.
   *
   * So this is never applied automatically. It drives a stepper on each placed monster's card,
   * and a press banks the grant as a labelled modifier on that monster — the manual-trigger
   * treatment, for the same reason: it recurs (every battle start, all run) and only the user
   * knows how often and on whom.
   */
  chosenMonsterGrant?: { stat: ModifierStat; amount: number }[];
  /**
   * Vendored sprite filename (2026-10-06 round 6, research.md H3), resolved against
   * `${import.meta.env.BASE_URL}sprites/trinket/` -- see `src/ui/shared/Sprite.tsx`.
   * Absent = render the text-only presentation, never a broken <img>.
   */
  spriteFile?: string;
}

/**
 * Who one USE of an item grants its stats to (2026-10-08, T046).
 *
 * `Team` carries its own narrowing rather than deferring to `SelectorFilters`, because the two
 * filters items actually need are not the ones creatures need. Seven items read "your <Type>
 * monsters" and one reads "your monsters with no abilities"; none reads "allies of rarity X" or
 * "allies of level 3+", which is most of what `SelectorFilters` offers.
 */
export type ItemTarget =
  | {
      kind: ItemTargetKind.Team;
      /** "Give your Electric monsters +1 Shock" — Battery Pack. */
      typeFilter?: CreatureType;
      /**
       * "Your monsters with no abilities gain +15% Cooldown Speed" — Focus Pill, the only item
       * with this condition. A flag rather than a general predicate: one case does not justify a
       * filter language, and a boolean says exactly what the card says.
       */
      abilitylessOnly?: boolean;
    }
  | { kind: ItemTargetKind.FixedSlot; slot: GridSlot }
  | { kind: ItemTargetKind.Chosen; count: number };

/**
 * The flat, permanent stat grant a used item makes, and who receives it.
 *
 * Shaped like `TrinketRecord.effectTags` — a flat `{ stat, amount }[]`, not the creature
 * `AbilityTag`/`EffectDescriptor` machinery — for the same reason that one is: an item grants a
 * fixed quantity, unconditionally, once. There is no trigger, no scaling and no duration to
 * encode. What it adds over trinkets is `target`, because an item's recipients vary and a
 * trinket's never do.
 *
 * Only 11 of the 40 items have one. The other 29 are shop/economy mechanics (rerolls, shop rank,
 * gifts, gold), run-state changes the battle engine has no model for (level-ups, turning a
 * monster SHINY, copying an enemy), or `Coffee`'s "On Battle Start abilities activate an
 * additional time" — real effects, all of them, but not flat stat grants. They stay cited and
 * browsable with no `effect`, exactly how 87 of the 93 trinkets are treated.
 */
export interface ItemEffect {
  target: ItemTarget;
  /** Applied once per recipient, per use. */
  stats: { stat: ModifierStat; amount: number }[];
}

export interface ItemRecord {
  id: ItemId;
  name: string;
  effectText: string;
  abilityTags: AbilityTag[];
  /** batodex publishes a tier per item, which maps 1:1 onto the same `Rarity` everything else uses. */
  rarity?: Rarity;
  /** Gold cost in the shop. `0` is a real, common price here — 21 of 40 items are free. */
  cost?: number;
  /** Whether only one may be used per round. Published per item; not simulated. */
  uniquePerRound?: boolean;
  /**
   * What USING this item does, when that is a flat stat grant this engine can apply. Absent =
   * browsable corpus data only, and the UI offers no Use button rather than a dead one.
   */
  effect?: ItemEffect;
  /**
   * Vendored sprite filename, resolved against `${import.meta.env.BASE_URL}sprites/item/` —
   * see `src/ui/shared/Sprite.tsx`. Absent = render the text-only presentation.
   */
  spriteFile?: string;
}

export interface Corpus {
  /**
   * ONE ENTRY PER SPECIES since 2026-10-08, not one per (species, level).
   *
   * Code that needs a specific level must go through `findCreature(corpus, id, level)` in
   * `data/corpus.ts` rather than scanning this array — a `.find(c => c.id === x && c.level === y)`
   * over these no longer compiles, which is how every such site got found.
   */
  creatures: CreatureSpecies[];
  trainers: TrainerRecord[];
  trinkets: TrinketRecord[];
  items: ItemRecord[];
}

// ---------------------------------------------------------------------------
// Team configuration
// ---------------------------------------------------------------------------

/** B5: back row = "A" row, front row = "B" row in the wiki's own labeling */

export type GridCol = 0 | 1 | 2;

export interface GridSlot {
  row: GridRow;
  col: GridCol;
}

/**
 * Data-model amendment, 2026-10-05 (post-MVP, user-requested): manual carry-over stat
 * modifiers. The engine only simulates one isolated battle against an idealized target
 * (spec.md Assumptions) — it has no concept of a multi-round match. Real play often carries
 * bonuses between rounds (e.g. a creature's "On Victory" ability granting +10 Damage to every
 * ally permanently for the rest of the run). Rather than simulate the whole match history,
 * the user can describe the net effect of such carry-overs directly as a flat adjustment on
 * top of a creature's base stats for this one simulated battle.
 */
/*
 * `ModifierStat` is now an enum in `./enums.ts`; the rationale that lived here is kept because it
 * explains why the vocabulary exists at all.
 */

export interface StatModifier {
  /** Stable id for list management/removal in the UI; not otherwise meaningful */
  id: string;
  /** Optional free-text user note, e.g. "Round 2 win bonus from Brawlmantis" */
  label?: string;
  stat: ModifierStat;
  amount: number;
  /** What this bonus is attached to. Absent means `ModifierScope.Creature` — see the enum. */
  scope?: ModifierScope;
}

/**
 * What a monster IS, with no statement about where it is standing (2026-10-08).
 *
 * Extracted when the bench arrived, because a benched monster and a placed one carry exactly the
 * same four facts and differ only in their position. Writing them out twice would have been two
 * declarations to keep in step, and the first thing to fall out of step would have been `shiny` or
 * `modifiers` — the two that make a bench worth having, since preserving them across a swap is the
 * entire point of parking a monster rather than selling it.
 */
export interface RosteredCreature {
  creatureId: Species;
  /** Widened 1-3 -> 1-4 alongside CreatureRecord.level (2026-10-05 round 2) — must match an
   * actual `(creatureId, level)` corpus record; see data-model.md's lookup-fix amendment. */
  level: 1 | 2 | 3 | 4;
  /**
   * SHINY variant (round 11, WI-R11-001). Independent of level: a creature can be shiny at any
   * level. Shiny substitutes a different published stat line (see `shiny.ts`) — it is NOT a
   * multiplier, and for a handful of creatures it is strictly worse.
   */
  shiny?: boolean;
  /** Applies only to this creature, on top of any teamModifiers */
  modifiers?: StatModifier[];
  /**
   * "Never advise taking this one off the board" (2026-10-09, user-reported).
   *
   * Some monsters are held for a reason the simulation cannot see. Ignit is the reported case: it
   * is deliberately weak until two victories evolve it into a strong dragon, so it has to stay
   * fielded to reach that form — and the advisor, which only ever measures the fight in front of
   * it, correctly concluded it should be benched and said so in every suggestion it made. The
   * result was that no OTHER swap was ever visible, because the one the user could not take
   * occupied the top of the list.
   *
   * So this is not an engine input. `simulate()` never reads it; a locked monster fights exactly
   * as it did before. It constrains the SEARCH in `engine/rosterAdvice.ts`: the lineup must keep
   * every locked monster fielded, and no bench candidate is offered the slot one stands in. The
   * arrangement search is left alone, because moving a monster between slots does not take it off
   * the board — which is the only thing the lock is about.
   *
   * Only ever set on a placement. `settleOnBench` drops it, so parking a locked monster by hand
   * unlocks it: the user has just done the thing the lock was preventing being suggested.
   */
  locked?: boolean;
}

export interface TeamPlacement extends RosteredCreature {
  slot: GridSlot;
}

/** The bench's positions, addressed by index the way the grid is addressed by slot. */
export const BENCH_INDEXES = [0, 1, 2, 3] as const;
export type BenchIndex = (typeof BENCH_INDEXES)[number];

/**
 * A monster kept out of the fight (2026-10-08, user-requested).
 *
 * ## The bench is inert, and that is its whole specification
 *
 * Nothing in `engine/` reads `TeamConfiguration.bench`. `simulate()`, `resolveEffects()` and
 * every item and trinket target all iterate `placements`, so a benched monster deals no damage,
 * grants no aura, counts for no `statFromCount`, and is not adjacent to anybody. Adding a field
 * they do not read is what makes that true by construction rather than by six separate exclusions
 * that could each be forgotten.
 *
 * "Inert" is about the BATTLE, not about the monster's stat line. A trainer's per-monster grant
 * does reach the bench — Chef's +2 Burn shows on a benched card, because the game shows it on the
 * bench and in the shop (2026-10-08, from a screenshot: Coalem reads 22 Burn against a published
 * 20). That is the card reporting what the monster IS, and it changes no figure the engine
 * produces, because the engine is still only looking at `placements`.
 *
 * ## Why it exists
 *
 * Judging whether a monster from the shop is worth buying used to mean selling one you had, which
 * threw away its level, its shiny and every modifier you had banked on it — work that cannot be
 * recovered by buying it back. A benched monster keeps all four, so trying a candidate is a drag
 * out and a drag back.
 *
 * `index` rather than an opaque id: the bench is four fixed positions on screen, so a position is
 * what the user drags to and what the UI has to address. It also means bench entries sort and
 * compare the same way placements do.
 */
export interface BenchedCreature extends RosteredCreature {
  index: BenchIndex;
}

/**
 * A position in the roster — one of the six grid slots, or one of the four bench positions.
 *
 * Exists so dragging has a single vocabulary: without it, moving a monster needs four functions
 * (grid-to-grid, grid-to-bench, bench-to-grid, bench-to-bench) that would each have to decide
 * independently what happens to the monster's modifiers. `engine/roster.ts` takes two of these and
 * decides once.
 */
export type RosterRef =
  | { zone: RosterZone.Grid; slot: GridSlot }
  | { zone: RosterZone.Bench; index: BenchIndex };

export interface TeamConfiguration {
  /**
   * The region this run draws from (FR-087). The player picks it "before they choose anything
   * else", so the builder gates on it.
   */
  selectedRegion?: RegionId;
  /**
   * Species painted "all"-type by Painter (FR-085/086). **Species ids, not slots** — the ability
   * reads "whenever these specific species appear… on your board", so painting Mosslug paints
   * every Mosslug (research.md M1).
   */
  paintedCreatureIds?: Species[];
  /** Species brought in from the opposite region by Smuggler (FR-091). */
  smuggledCreatureIds?: Species[];
  /** Max 6; one per unique slot — see Validation rules in data-model.md */
  placements: TeamPlacement[];
  /**
   * Monsters kept out of the fight (2026-10-08). Max 4; one per unique `index`.
   *
   * OPTIONAL, and absent is the same as empty: every build saved or shared before the bench
   * existed has none, and `share.ts` omits it when it is empty so those builds keep their ids.
   */
  bench?: BenchedCreature[];
  trainerId: TrainerId | null;
  trinketIds: TrinketId[];
  itemIds: ItemId[];
  /** Configurable per FR-007/FR-008 */
  simulationWindowSeconds: number;
  /**
   * Which day of the run this board is being built for (2026-10-08, user-reported).
   *
   * ## A deliberate reversal
   *
   * This lived in `CalculatorView`'s local state, under an explicit comment saying it must NOT be
   * here: "it describes who you are fighting, not what your team is, so it must not travel in a
   * shared build or be saved with one." That reasoning is sound about what a day MEANS and wrong
   * about what the user needs, which is the report: "I keep having to set that value back to day 7
   * every time I save." A field you must re-enter after every save is not neutral about the team,
   * it is a recurring cost.
   *
   * It also turned out to be the SAME number the library's save form was tracking separately, so
   * keeping it out of the config meant the app held two unconnected ideas of what day it was.
   *
   * ## It is build CONTEXT, not build CONTENT
   *
   * Which is why `share.ts` carries it in the code but deliberately leaves it out of `canonicalize`
   * and therefore out of `buildId`. Two boards identical except for the day you fought them are the
   * same board, and the fingerprint has to go on saying so — see that module.
   *
   * Optional, defaulting to {@link DEFAULT_RUN_DAY}, because every build that predates this has no
   * day recorded and day 1 is the right reading of that.
   */
  runDay?: number;
  /** Applies to every placement's creature when resolving its effective stats */
  teamModifiers?: StatModifier[];
}

// ---------------------------------------------------------------------------
// Simulation entities
// ---------------------------------------------------------------------------

/**
 * The key identifying one PLACED creature across a `SimulationResult` (2026-10-07, round 7).
 *
 * `perCreatureDps`, `perCreatureFacilitatedDps` and `perCreatureEffectiveStats` are all keyed by
 * this. It was a bare `string`, built inline at TWELVE sites across
 * `simulate.ts`, `effects.ts` and the UI, with nothing checking that the producer and the consumer
 * built it the same way. `TeamSummary` is the proof that this was not theoretical: it assembled the
 * key by hand as `` `${creatureId}@${row}${col}` ``, bypassing `slotKey` entirely, and matched only
 * because `slotKey` happens to have that exact format. A change to either would have made every
 * lookup on that page silently return 0 rather than fail.
 *
 * Branded, so a raw string cannot be used as one; built only by `engine/grid.ts`'s `placementKey`.
 */
export type PlacementKey = string & { readonly __brand: "PlacementKey" };

export interface TimelineEvent {
  tSeconds: number;
  kind: TimelineEventKind;
  sourceSlot: GridSlot;
  /** Absent for self/ongoing-only events */
  targetSlot?: GridSlot;
  damage?: number;
  damageType?: DamageChannel;
  /**
   * HP restored to your own team, on a `TimelineEventKind.Heal` event (2026-10-08).
   *
   * A SEPARATE field from `damage` rather than a negative one. Four different places sum
   * `event.damage` across the timeline — the cumulative chart, the DPS rate buckets, the per-status
   * totals and the placement objective — and every one of them would have silently absorbed
   * healing as damage dealt to the enemy.
   */
  heal?: number;
  statusDelta?: { type: StatusEffectType; slot: GridSlot; layerDelta: number };
}

export interface StatusEffectInstance {
  type: StatusEffectType;
  targetSlot: GridSlot;
  /** Current stack count ("layers" per the cited wiki's own terminology) */
  layers: number;
  sourceSlot: GridSlot;
  appliedAtSeconds: number;
}

export interface SimulationResult {
  /** Every event in time order — single source of truth for both UI consumers */
  timeline: TimelineEvent[];
  perCreatureDps: Record<PlacementKey, number>;
  /** Window-AVERAGE damage per second, by status. See the three fields below before reading this
   * as "the" rate: for a status whose stacks never decay it understates the end of a fight. */
  perStatusPerSecond: Record<StatusEffectType, number>;
  /**
   * 2026-10-06 round 7 (FR-055): status stacks APPLIED per second. Distinct from
   * `perStatusPerSecond`, which is DAMAGE per second -- a user reading only the damage figure
   * cannot tell whether it is steady or still climbing.
   */
  /**
   * 2026-10-06 round 8 (FR-068): instantaneous damage per second, in 1-second buckets.
   * The cumulative series only ever rises, so it cannot show whether the team's output is
   * accelerating; this is the rate view that makes a Poison or Shock ramp legible. Derived from
   * the same `timeline` as `cumulativeSeries`, so integrating this reproduces that.
   */
  dpsRateSeries: { tSeconds: number; dps: number }[];
  /**
   * LIVE stack counts on the shared target over time — what is on the enemy right now, not what
   * has been dealt. Poison and Shock only accumulate; Burn climbs as it is applied and decays by
   * one layer per 0.5s tick, so this is the only view that shows a Burn team's stacks burning off.
   */
  statusStackSeries: { tSeconds: number; Burn: number; Poison: number; Shock: number }[];
  perStatusAppliedPerSecond: Record<StatusEffectType, number>;
  /**
   * The instantaneous damage rate as the window closes (`live layers / tickInterval`). The
   * interpretable form of the second-order information: "16.00/s average, but 40/s by the end".
   * Shock is reported as its window average (it deals damage reactively on direct hits, not on a
   * timer); Shield is always 0 (it deals no damage).
   */
  perStatusFinalDamageRate: Record<StatusEffectType, number>;
  /**
   * Growth of the damage rate, in damage per second per second:
   * `(finalRate - initialRate) / windowSeconds`, and the initial rate is always 0.
   * Computed exactly rather than by curve-fitting -- a least-squares slope over 1-second buckets
   * was measured against a known-exact case and was both noisy and NaN-prone at a 1s window
   * (research.md I13).
   *
   * Positive for BOTH Poison and Burn in practice, for different reasons -- an earlier version of
   * this comment wrongly claimed Burn was ~0. Poison's stacks never decay, so it grows without
   * bound forever. Burn's instances each decay at a fixed 1 layer per 0.5s tick regardless of
   * size, so an N-layer instance lives N/2 seconds -- Basilord's 170 burn lasts 85s, far longer
   * than a battle. Burn therefore climbs throughout any realistic fight and plateaus only in
   * principle. Only a *tiny* burn stack settles quickly.
   */
  perStatusDamageGrowthPerSecond: Record<StatusEffectType, number>;
  /**
   * User-requested amendment, 2026-10-05 ("facilitated damage"): per-creature rate of damage
   * *enabled* by that creature's own status grants on OTHER hits — currently just Shock procs,
   * the only implemented mechanic where one creature's status grant amplifies a separate hit's
   * damage. Proportionally attributed by each contributing creature's share of current Shock
   * layers when multiple creatures grant Shock on the same team. Keyed the same way as
   * `perCreatureDps`. Deliberately excludes a creature's own direct-damage contribution (that's
   * what `perCreatureDps` already measures) — see data-model.md's "Facilitated damage" amendment.
   */
  perCreatureFacilitatedDps: Record<PlacementKey, number>;
  /**
   * User-requested amendment, 2026-10-05 round 2 (item 2 — "no visualization of the current
   * mon's damage/shield/burn/poison/multi-cast/shock"): per-placement *effective* (post-
   * modifier) output, resolved from the exact same per-cast modifier resolution Phase A
   * already performs — not a second, divergent computation path. Keyed the same way as
   * `perCreatureDps`. See data-model.md's "perCreatureEffectiveStats" amendment.
   */
  perCreatureEffectiveStats: Record<
    string,
    {
      /**
       * The same `PerCastOutput` the creature card renders, so the "Effective this battle" band
       * needs no mapping layer at all — it passes this straight to `buildStatLines`. Hand-mapping
       * between two parallel shapes is what silently dropped healing.
       */
      output: PerCastOutput;
      /**
       * The cooldown the creature ENTERED the battle with, after modifiers, trinkets and ally
       * auras. Resolved before the simulation runs, so it cannot see anything the battle did to
       * the cast rate — see `effectiveCooldownSeconds`.
       */
      cooldownSeconds: number | null;
      /**
       * How many times it cast over the window: scheduled casts and reactive ones, never multicast
       * repetitions (2026-10-09, user-requested).
       *
       * Multicast is its own reported stat and a repetition is one cast landing more than once, so
       * counting them here would report Multicast twice.
       */
      casts: number;
      /**
       * The mean gap between those casts — "effectively a 2.9s cooldown this battle".
       *
       * Puffloon is why this exists. It publishes a 10s cooldown, and beside a Toxic ally on a 4s
       * one it casts roughly every 2.9s, because `TriggerOnAllyTrigger` fires it on that ally's
       * cast without advancing its own schedule. `cooldownSeconds` above is right about what it
       * started with and silent about what happened, and the card had no other figure to show.
       *
       * Equals `cooldownSeconds` exactly when nothing changed the rate, so a difference is always
       * something the battle did. `null` below two casts, which establish no interval.
       */
      effectiveCooldownSeconds: number | null;
    }
  >;
  /**
   * Creatures a TEAMMATE knocked out at battle start — Petrirex and Rattleghast knock out their
   * own neighbours — with nobody on the board to revive them (2026-10-08).
   *
   * They are absent from every other record here, because they are absent from the battle: no
   * casts, no stats, no ally auras. That is correct and it is also invisible, which is why this
   * field exists. Placing a Rattleghast silently deleted two of the user's creatures from the
   * maths with nothing on screen to say so — and it crashed instead, because `simulate()` assumed
   * `resolveEffects()` returned one entry per placement, which it has never done for this family.
   */
  knockedOutAtBattleStart: { key: PlacementKey; name: string; knockedOutBy: string }[];
  /**
   * The window this result was simulated over, carried so a consumer never has to be told it
   * separately (2026-10-08).
   *
   * Added when `timeWeightedScore` grew a survivability term that needs the window length: a
   * debuff stack removed at the midpoint of a 30s fight is worth five times one removed at the
   * midpoint of a 6s fight. Threading it as a second parameter through `timeWeightedScore`,
   * `scoreConfiguration` and `rosterAdvice`'s `evaluate` would have given three call sites the
   * chance to pass a window that did not produce this result.
   */
  windowSeconds: number;
  /**
   * HP restored to your own team per second, summed over everything that healed (2026-10-08).
   *
   * Beside `perStatusPerSecond.Shield` — which has always meant shield GRANTED per second, an
   * output stat, never absorption — these are the two halves of what the team does to keep itself
   * alive. Neither reduces any damage in this simulation, because there is no modelled incoming
   * side for them to reduce; both exist so `engine/survivability.ts` can price them.
   */
  healPerSecond: number;
  cumulativeSeries: {
    tSeconds: number;
    totalDamage: number;
    /** Direct-hit damage only. Was previously visible only folded into `totalDamage`. */
    directDamage: number;
    byStatus: Record<StatusEffectType, number>;
  }[];
}
