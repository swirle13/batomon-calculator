import type {
  Corpus,
  CreatureRecord,
  EffectDescriptor,
  GridSlot,
  SelectorFilters,
  StatusEffectType,
  TargetSelector,
  TeamConfiguration,
} from "../data/types";
import { aboveSlot, adjacentUnder, behindSlot, inFrontSlot, slotsEqual } from "./grid";
import type { AbilityTag, PlacementKey } from "../data/types";
import type { Species } from "../data/ids";
import { applyShinyOverlay, findCreature } from "../data/corpus";
import { creatureHasType } from "../data/typing";
import { isWildcardType } from "../data/vocabularies";
import { hasAbilityText } from "../data/display";
import { addFlat, addPostMultiplier, applyMultiplier, readRounded, statValue, type StatValue } from "./statValue";
import { TYPE_COLORS } from "../data/typeColors";
import { AbilityTagKind, EventLabel, GrantableStat, StatChangeStat } from "../data/enums";
import { placementKey } from "./grid";

/**
 * Effect resolution (FR-073/FR-074, 2026-10-06 round 9).
 *
 * Computes each placed creature's **effective** stats after the effects that apply before and
 * during a battle, so the simulation, the "Effective this battle" card band, and the placement
 * optimiser all read one answer instead of three.
 *
 * ## Why this exists
 *
 * Before this, `perCreatureEffectiveStats` reported *base* stats with manual modifiers applied, and
 * every creature ability was inert. On the user's own board all four creatures had unmodelled
 * abilities: Miasmaw should apply Poison 336 rather than 10, and Cobrex should fire long before its
 * 15-second cooldown. The DPS figures were correspondingly wrong.
 *
 * ## Ambiguities, decided here rather than guessed at the call site
 *
 * 1. **"total Poison of your allies"** means the sum of allies' per-application
 *    `appliesStatus.amount` (6 + 20 + 300), **not** accumulated stacks over the battle. The user's
 *    own arithmetic (336) settles it.
 * 2. **"ally" excludes self.** This matches `simulate()`'s existing self-skip in
 *    `resolveCooldownSpeedTotal`, and keeps a lone creature resolving to its base stats.
 * 3. **Fumungus is deliberately NOT modelled.** "Has additional Damage equal to 100% of the Poison
 *    stacks on the enemy" needs a modelled target carrying stacks, and this engine simulates
 *    against an idealised target with no such state (spec.md Assumptions). Granting it damage
 *    anyway would fabricate output. It is reported as uncovered rather than silently approximated.
 *
 * ## Coverage ceiling — read before trusting any number this produces
 *
 * A resolver can only act on structured `abilityTags`. Before this round **6 of 149** level-1
 * creatures had any; this round adds four more. The other ~139 have their abilities recorded only
 * as prose in `abilityText`, so they remain inert. Building this engine does not retroactively make
 * them work, and the UI states the count rather than letting a working resolver imply full coverage.
 */

export interface ResolvedPlacement {
  /** `${creatureId}@${slotKey}` — the key used across `SimulationResult`'s per-creature records. */
  key: PlacementKey;
  slot: GridSlot;
  creature: CreatureRecord;
  /** Effective status applications per cast, after battle-start grants. */
  appliesStatus: { type: StatusEffectType; amount: number }[];
  /** Effective direct damage per hit. */
  baseDamage: number | null;
  /**
   * Effective heal per cast, after ally grants (2026-10-07). Previously `simulate()` read
   * `creature.healAmount` directly, which meant a granted heal could not exist -- the resolver had
   * no slot to put one in, so Aster's "Adjacent Water allies gain +25 Heal" was unmodellable by
   * construction rather than by choice.
   */
  healAmount: number | null;
  /** Base cooldown before modifiers; charge rules shorten it dynamically during the battle. */
  cooldownSeconds: number | null;
  multicast: number;
  /** Seconds removed from this creature's remaining cooldown per matching **ally** application. */
  chargeRules: { status: StatusEffectType; seconds: number }[];
  /**
   * Extra repetitions of this creature's ongoing (status) applications per cast, granted by an
   * ally — e.g. Onsetra's "the ally behind applies its Ongoing abilities 1 additional time".
   */
  extraOngoingApplications: number;
  /**
   * The evaluable form of this creature's stats (T240/T241, FR-094/FR-095).
   *
   * `baseDamage` / `appliesStatus` above remain the READ values, kept so existing consumers keep
   * working; these are the structure those are read from. A caller that needs to add a scaling
   * grant must go through `stats`, not the flattened numbers, or the multiplier is lost.
   */
  stats: {
    damage: StatValue;
    status: Map<StatusEffectType, StatValue>;
  };
  /** "Damage equal to N% of <status> on the enemy" — recomputed per cast, never persisted (T244). */
  targetStatusScaling: { status: StatusEffectType; multiplier: number }[];
  /**
   * Set when a teammate's battle-start knockout killed this creature and a Shikitsune-style revive
   * brought it back: the key of the reviver, whose FIRST CAST is when this creature re-enters the
   * battle (2026-10-08).
   *
   * `null` covers both "never died" and "died and stayed dead" — but the two are distinguishable,
   * because a creature that stayed dead is not in the returned array at all.
   */
  revivedBy: PlacementKey | null;
  /**
   * Cooldown Speed granted by effects resolved HERE, as a fraction. Currently only the revive
   * bonus.
   *
   * Deliberately NOT folded into a `cooldownSpeedModifier` tag: `simulate()` sums those itself in
   * `resolveCooldownSpeedTotal`, so writing one here would be counted twice. A separate field is
   * the same reason `applyEffect` refuses `StatChangeStat.CooldownSpeed`.
   */
  cooldownSpeedGrant: number;
  /** Abilities recorded on this creature that the engine cannot act on, for honest reporting. */
  unmodelledAbilities: string[];
}

/**
 * Tag kinds this resolver acts on.
 *
 * 2026-10-06 round 10 (T219). **This list is exported and is the single source of truth for
 * "supported".** The round-10 audit reported "9 of 135 abilities modelled" — a figure that counted
 * creatures carrying a *tag* rather than creatures the engine actually *resolves*. Only three were
 * genuinely working. The two tests drifted because "supported" was defined twice, so the coverage
 * reporter now derives its predicate from this constant instead of keeping its own copy.
 */
export const RESOLVED_TAG_KINDS = [
  "battleStartStatusFromAllies",
  "chargeOnAllyStatus",
  "cooldownSpeedModifier",
  // Round 10: the general positional/aura resolver below.
  "ongoing",
  "statusGrant",
  "onEvent",
  "statFromCount",
  "statFromStat",
  // Round 11: resolved, but by `simulate()` inside the cast loop rather than here — see T224.
  "buffOnCast",
  // Round 4 orchestration (T220).
  "statFromUniqueTypes",
  "knockoutAlliesOnBattleStart",
  // 2026-10-08: the revive half of the knockout family, resolved here and scheduled by `simulate()`.
  "reviveKnockedOutAllies",
  // T213/T214: resolved by `simulate()`'s ally-cast hook, not by the static resolver.
  "cooldownSpeedOnAllyCast",
  "triggerOnAllyCast",
  // Round 5 (gameplay-capture handoff).
  "statMultiplier",
  "statFromTargetStatus",
  "triggerOnAllyTrigger",
  "gainOnAllyStatus",
  /*
   * 2026-10-08. Resolved in `engine/selfScaling.ts`, which the CARD runs as well as the engine —
   * not here, and not anywhere else, or it would be counted twice.
   *
   * An Ongoing ability that scales off the monster's own stat is folded into its displayed stats
   * by the game rather than shown as a battle effect, so it cannot live in the resolver whose
   * output the UI labels "Effective this battle". It is listed here regardless because the engine
   * genuinely computes it, and `RESOLVED_TAG_KINDS` is the coverage report's definition of
   * "supported" — omitting it would under-report a modelled family, which is the mirror of the
   * dishonesty this constant exists to prevent.
   */
  "statFromOwnStat",
  /*
   * 2026-10-08. Resolved in `engine/survivability.ts`, and in neither this resolver nor
   * `simulate()` — a cleanse acts on debuffs the ENEMY put on us, and the simulation has no
   * incoming side to remove them from.
   *
   * Listed here for the same reason `statFromOwnStat` is: this constant means "the engine acts on
   * this", not "`resolveBoard` acts on this", and leaving Runerock in the advisor's "does not
   * compute this ability yet" list while the placement objective was pricing its cleanse would be
   * its own kind of wrong number.
   */
  "cleanseDebuffs",
  /*
   * 2026-10-08, user-reported. Resolved by `simulate()` in Phase A, which pulls the target's first
   * cast to t=0 — see the battle-start block there for why that is the whole of the mechanism.
   *
   * Both events resolve as of later the same day: the `OnCast` half (Cicadence, Dryadell,
   * Torrantler, Opalion) goes through the reaction queue in the cast loop. The note that used to
   * stand here — warning that the kind was listed as resolved while one of its two events was not
   * — is discharged rather than deleted, because the condition it set is the one that was met.
   */
  "trigger",
  // 2026-10-09, the backlog pass. Three resolved here (`grantFromOwnStat`, `gainOnAllyKnockout`
  // via the delta pass, and the `cannotGain` restriction) and two by `simulate()`'s cast loop.
  "grantFromOwnStat",
  "gainOnAllyKnockout",
  "chargeAlly",
  "triggerOnAllyStatus",
] as const;

/** True when `tag` is one this resolver understands. Keeps the "can we act on it?" test in one place. */
export function isResolvableTag(tag: { kind: string }): boolean {
  return (RESOLVED_TAG_KINDS as readonly string[]).includes(tag.kind);
}

/**
 * Whether this monster REFUSES a grant of `stat` — "(Zephyrex can't have Multicast)".
 *
 * Shared by the two places a Multicast grant can land, `applyEffect` below and the `buffOnCast`
 * accumulation in `simulate()`, because a restriction enforced in one of them is a restriction a
 * board can route around. Zephyrex's own grant goes through `buffOnCast`, so checking only the
 * static resolver would have let a pair of them stack exactly as if the clause did not exist.
 */
export function cannotGain(
  creature: { abilityTags: AbilityTag[] } | undefined,
  stat: GrantableStat,
): boolean {
  return (creature?.abilityTags ?? []).some(
    (tag) => tag.kind === AbilityTagKind.CannotGain && tag.stat === stat,
  );
}

/**
 * Whether `creature` passes a selector's type/rarity/level filters.
 *
 * Extracted from `selectTargets` on 2026-10-09 because it had a second, SHORTER copy:
 * `resolveCooldownSpeedTotal` in `simulate.ts` re-implemented the same test and checked only
 * `typeFilter`. That is the path Formiqueen's aura actually takes, so the moment its tag gained the
 * `rarityFilter` its text has always specified — "adjacent **Common** allies" — the filter would
 * have been honoured everywhere except the one place it mattered. Two copies of a predicate is how
 * the Zephyrex and `inFront` defects both happened; this is the same lesson applied before it
 * bites rather than after.
 */
export function selectorAccepts(
  selector: TargetSelector,
  creature: CreatureRecord,
  config?: Pick<TeamConfiguration, "paintedCreatureIds" | "trinketIds">,
): boolean {
  const f = selector as Partial<SelectorFilters>;
  return (
    (!f.typeFilter || creatureHasType(creature, f.typeFilter, config)) &&
    (!f.rarityFilter || creature.rarity === f.rarityFilter) &&
    (!f.minLevelFilter || creature.level >= f.minLevelFilter) &&
    // Stellagon's "allies with NO abilities", through the same predicate the coverage report
    // uses, so the phrase means one thing across the app.
    (!f.noAbilityFilter || !hasAbilityText(creature.abilityText))
  );
}

/**
 * The creatures a `TargetSelector` picks out, relative to `source`.
 *
 * All six selectors in the vocabulary resolve here, which is what turns seven separate "mechanism
 * families" (adjacency auras, positional grants, row-wide effects, on-battle-start team grants,
 * self-buffs, and the two cooldown-speed grant shapes) into one code path. They were only ever
 * distinct families in the *ability text*; structurally they differ just by selector.
 *
 * Board geometry is `grid.ts`'s, so "adjacent" means the four cardinal neighbours and never a
 * diagonal (research.md B5, as corrected 2026-10-08) in exactly one place.
 */
export function selectTargets<T extends { slot: GridSlot; key: string; creature: CreatureRecord }>(
  selector: TargetSelector,
  source: T,
  all: T[],
  // `trinketIds` joins `paintedCreatureIds` as of 2026-10-09: Link Cable redefines `adjacent`, so
  // the selector cannot be resolved from the board alone.
  config?: Pick<TeamConfiguration, "paintedCreatureIds" | "trinketIds">,
): T[] {
  const others = all.filter((m) => m.key !== source.key);

  // T225: type/rarity/level filters apply to every selector that can carry them, in one place.
  const filtered = (list: T[]) => list.filter((m) => selectorAccepts(selector, m.creature, config));

  switch (selector.kind) {
    case "self":
      return [source];
    case "adjacent":
      // Link Cable widens this to the whole team (2026-10-09) — see `adjacentUnder`.
      return filtered(others.filter((m) => adjacentUnder(config, source.slot, m.slot)));
    case "row":
      return filtered(others.filter((m) => m.slot.row === source.slot.row));
    case "inFront": {
      // One column RIGHT, same row (2026-10-09). This read "the front row, same column" — see
      // `engine/grid.ts` for the correction and `GridRow` for the rename that removes the
      // name collision that caused it.
      const slot = inFrontSlot(source.slot);
      return slot ? filtered(others.filter((m) => slotsEqual(m.slot, slot))) : [];
    }
    case "behind": {
      const slot = behindSlot(source.slot);
      return slot ? filtered(others.filter((m) => slotsEqual(m.slot, slot))) : [];
    }
    case "above": {
      const slot = aboveSlot(source.slot);
      // `filtered` as of 2026-10-08 — see `TargetSelector`'s `above` member. Every pre-existing
      // `above` tag is unfiltered, so this changes nothing for them.
      return slot ? filtered(others.filter((m) => slotsEqual(m.slot, slot))) : [];
    }
    case "allAllies":
      return filtered(others);
    default:
      return [];
  }
}

/**
 * Flattens `stats` (the evaluable structure) into `baseDamage` / `appliesStatus` (the read values).
 *
 * Called between phases so each phase reads the completed output of the previous, and once at the
 * end so existing consumers — `simulate`, the UI, the optimiser — keep seeing plain numbers.
 */
function syncReadValues(placements: ResolvedPlacement[]): void {
  for (const p of placements) {
    p.baseDamage =
      p.creature.publishedCast === undefined && readRounded(p.stats.damage) === 0
        ? null
        : readRounded(p.stats.damage);
    p.appliesStatus = [...p.stats.status.entries()]
      .map(([type, v]) => ({ type, amount: Math.max(0, readRounded(v)) }))
      .filter((s) => s.amount !== 0 || (p.creature.appliesStatus ?? []).some((b) => b.type === s.type));
  }
}

export interface ResolvedBoard {
  /**
   * One entry per placement **that is still on the board**, which is NOT one per placement: a
   * creature a teammate knocked out at battle start is removed entirely, because a corpse must
   * not keep feeding adjacency auras and ally totals.
   */
  placements: ResolvedPlacement[];
  /**
   * The ones removed, named alongside whoever killed them (2026-10-08).
   *
   * This exists because the removal above used to be silent, and silence is not a safe way to
   * drop a creature from the maths. `simulate()` indexed the returned array by placement key and
   * asserted a hit (`resolvedByKey.get(...)!`), so a Petrirex or Rattleghast standing next to any
   * ally produced `undefined` and crashed the page. Reporting the casualties makes the gap both
   * handleable and visible: the UI names them under the DPS figure.
   */
  knockedOut: { key: PlacementKey; name: string; knockedOutBy: string }[];
}

/**
 * `resolveBoard`, keeping only the survivors.
 *
 * The convenient form for the many callers that have no interest in who died — the optimiser, the
 * coverage report, most tests. `simulate()` must use `resolveBoard` instead, because it is the one
 * caller that walks `config.placements` and needs to know which of them are no longer there.
 */
export function resolveEffects(config: TeamConfiguration, corpus: Corpus): ResolvedPlacement[] {
  return resolveBoard(config, corpus).placements;
}

export function resolveBoard(config: TeamConfiguration, corpus: Corpus): ResolvedBoard {
  const members = config.placements
    .map((placement) => {
      // Round 11 (WI-R11-001): the SHINY line when the placement is shiny. This is the single
      // point where the engine turns a placement into stats, so routing it here means shiny flows
      // into DPS, the charts, the optimiser and the effective-stat band without four separate fixes.
      const creature = applyShinyOverlay(
        findCreature(corpus, placement.creatureId, placement.level),
        placement.shiny,
      );
      return creature ? { placement, creature } : null;
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  // --- PHASE 1: base stats, then MULTIPLIERS (T242 / FR-096) ---
  //
  // 2026-10-06: this previously read "every battle-start effect that reads other creatures' values
  // must read their BASE values, or the result would depend on which creature happened to resolve
  // first". **That rule is superseded, and the comment is kept here rather than deleted so the
  // reversal is visible.**
  //
  // The order-dependence hazard it names is real. But a recorded battle shows the game solving it
  // by PHASE ORDERING, not by reading base values: Miasmaw's on-battle-start copy summed its
  // allies' POST-multiplier values, landing on 1080. Reading base values gives 657 — a 39%
  // understatement on that board's largest Poison application, which then propagates into two more
  // abilities that read it.
  //
  // Three phases, each reading the COMPLETED output of the previous. Writers before readers:
  //   1. multiplier stat scaling
  //   2. position-based battle-start effects
  //   3. dynamic battle-start abilities that read team state, over a fully-buffed board
  //
  // Every tag kind must be classified into a phase. An unclassified kind is a bug, not a default.
  const base = members.map(({ placement, creature }) => ({
    key: placementKey(creature.id, placement.slot),
    slot: placement.slot,
    creature,
    appliesStatus: (creature.appliesStatus ?? []).map((s) => ({ ...s })),
    baseDamage: creature.publishedCast?.damage ?? null,
    healAmount: creature.healAmount ?? null,
    cooldownSeconds: creature.baseCooldownSeconds,
    multicast: creature.baseMulticast,
    chargeRules: [] as { status: StatusEffectType; seconds: number }[],
    extraOngoingApplications: 0,
    stats: {
      damage: statValue(creature.publishedCast?.damage ?? 0),
      status: new Map<StatusEffectType, StatValue>(
        (creature.appliesStatus ?? []).map((s) => [s.type, statValue(s.amount)]),
      ),
    },
    targetStatusScaling: [] as { status: StatusEffectType; multiplier: number }[],
    /** Filled by the knockout pass, applied with the other deltas so ordering stays uniform. */
    pendingKnockoutGrants: [] as { effect: EffectDescriptor; count: number }[],
    revivedBy: null as PlacementKey | null,
    cooldownSpeedGrant: 0,
    unmodelledAbilities: [] as string[],
  }));

  // --- PHASE 1b: multipliers, applied before ANY reader runs (T240/T242) ---
  //
  // This is the ordering that makes Miasmaw land on 1080. Cobrex is 604 -> 1027 here, and phase 3
  // then sums the 1027.
  for (const source of base) {
    for (const tag of source.creature.abilityTags) {
      if (tag.kind !== AbilityTagKind.StatMultiplier) continue;
      for (const target of selectTargets(tag.target, source, base, config)) {
        if (tag.stat === "damage" || tag.stat === "all") applyMultiplier(target.stats.damage, tag.factor);
        if (tag.stat === "status" || tag.stat === "all") {
          for (const v of target.stats.status.values()) applyMultiplier(v, tag.factor);
        }
        // A SINGLE named status (2026-10-09): Geminiss's "+50% Shield", Pylong's "+100% Shock".
        // Absent from the target, there is nothing to scale — a multiplier creates no effect,
        // unlike the flat grants FR-078 governs.
        const single = target.stats.status.get(tag.stat as StatusEffectType);
        if (single) applyMultiplier(single, tag.factor);
      }
    }
  }
  // Flatten phase 1 so phase 2 and 3 read post-multiplier values, not base ones.
  syncReadValues(base);

  // --- PHASE 2/3: battle-start grants, now summing allies' POST-MULTIPLIER totals ---
  for (const resolved of base) {
    for (const tag of resolved.creature.abilityTags) {
      if (tag.kind !== AbilityTagKind.BattleStartStatusFromAllies) continue;
      const allyTotal = base
        .filter((other) => other.key !== resolved.key)
        // "(Except other Miasmaw)" — same-species allies are excluded too, per the ability text.
        .filter((other) => other.creature.id !== resolved.creature.id)
        // Phase 3 reads the COMPLETED phase-1 output: `appliesStatus` has been re-synced from
        // `stats` above, so this sums post-multiplier values. Summing base values here is the
        // 657-vs-1080 bug.
        .reduce(
          (sum, other) =>
            sum + (other.appliesStatus.find((s) => s.type === tag.status)?.amount ?? 0),
          0,
        );
      const gained = Math.round(allyTotal * tag.multiplier);
      if (gained === 0) continue;
      // Into `stats`, not the flattened array: `syncReadValues` re-derives `appliesStatus` from
      // `stats` after the delta pass, so a grant written only to the array would be discarded.
      const existing = resolved.stats.status.get(tag.status);
      if (existing) addFlat(existing, gained);
      else resolved.stats.status.set(tag.status, statValue(gained));
    }
  }

  syncReadValues(base);

  // --- Pass 2a: self-inflicted battle-start knockouts (T220, Petrirex) ---
  //
  // Runs FIRST and physically removes the victims from `base` (unless pass 2a' revives them),
  // because a knocked-out ally must not then contribute to adjacency auras, unique-type counts or
  // ally totals. Resolving it after those would let a creature Petrirex just removed still buff
  // the team.
  //
  // Petrirex's "+20 Shield permanently for each ally Knockout" is the SELF-inflicted case, which is
  // decidable before the battle starts because the victims are chosen by position. Deaths caused by
  // incoming damage remain unmodelled (no HP system) — see the coverage report.
  // Keyed by victim, valued by KILLER — the name is what lets the UI say "knocked out by
  // Rattleghast" rather than leaving the user to work out why two of their creatures stopped
  // contributing.
  const knockedOut = new Map<PlacementKey, string>();
  for (const source of base) {
    for (const tag of source.creature.abilityTags) {
      if (tag.kind !== AbilityTagKind.KnockoutAlliesOnBattleStart) continue;
      const victims = selectTargets(tag.target, source, base, config);
      for (const v of victims) knockedOut.set(v.key, source.creature.name);
      if (victims.length > 0) {
        source.pendingKnockoutGrants.push({ effect: tag.effectPerKnockout, count: victims.length });
      }
    }
  }
  /*
   * --- Pass 2a': the revive half (2026-10-08, Shikitsune) ---
   *
   * "Knocked-out allies are revived and gain +15% Cooldown Speed for this battle" is dead text on
   * its own board — nothing in this engine kills anybody. It only means something next to the pass
   * above, which is why the two resolve together: the victims a reviver can reach are exactly the
   * ones a teammate's positional knockout produced.
   *
   * A reviver that is ITSELF among the victims does not revive anyone. Its ability fires on cast
   * and a knocked-out creature never casts, so a Shikitsune standing adjacent to Petrirex is just
   * another corpse. Filtering here rather than after the splice is what makes that true.
   *
   * The knockout still HAPPENED: `pendingKnockoutGrants` was filled above from `victims.length` and
   * is untouched by any of this, so Petrirex keeps its Shield per kill. That double payout is the
   * whole point of the pairing, and silently cancelling it would be the obvious way to get this
   * wrong.
   *
   * Revived allies are NOT spliced out, so they resume buffing the team. That is right for an ally
   * who is standing on the board again by the time the fight is under way, and it is the same
   * simplification the engine already makes everywhere else: auras are resolved once, at battle
   * start, not re-resolved as the board changes. The timing cost is carried instead by
   * `revivedBy`, which `simulate()` turns into a delayed first cast.
   */
  const revivers =
    knockedOut.size > 0
      ? base.filter(
          (m) =>
            !knockedOut.has(m.key) &&
            m.creature.abilityTags.some((t) => t.kind === AbilityTagKind.ReviveKnockedOutAllies),
        )
      : [];
  if (revivers.length > 0) {
    // Two revivers stack their bonuses but not their revivals — a creature is alive or it is not.
    const bonus = revivers.reduce(
      (sum, r) =>
        sum +
        r.creature.abilityTags.reduce(
          (s, t) => (t.kind === AbilityTagKind.ReviveKnockedOutAllies ? s + t.cooldownSpeedBonus : s),
          0,
        ),
      0,
    );
    // Timing is attributed to the first PLACED reviver. With two of them the earliest cast might
    // be the other one, which would revive marginally sooner; two Shikitsune on one board is not
    // worth a cross-module cast-time comparison to resolve.
    const reviver = revivers[0]!;
    for (const m of base) {
      if (!knockedOut.has(m.key)) continue;
      m.revivedBy = reviver.key;
      m.cooldownSpeedGrant += bonus;
      knockedOut.delete(m.key);
    }
  }
  const casualties: ResolvedBoard["knockedOut"] = [];
  /**
   * What each casualty was worth, captured BEFORE it leaves `base` (2026-10-09).
   *
   * Danuki's "on ally knockout, this gains 70% of their Damage" needs the victim's damage, and
   * the victim is spliced out of the board a line below — after which there is nothing left to
   * ask. Captured here rather than re-derived later for that reason.
   */
  const casualtyDamage: { speciesId: Species; damage: number }[] = [];
  if (knockedOut.size > 0) {
    for (let i = base.length - 1; i >= 0; i--) {
      const victim = base[i]!;
      const killer = knockedOut.get(victim.key);
      if (killer === undefined) continue;
      casualties.unshift({ key: victim.key, name: victim.creature.name, knockedOutBy: killer });
      casualtyDamage.unshift({ speciesId: victim.creature.id, damage: victim.baseDamage ?? 0 });
      base.splice(i, 1);
    }
  }

  // --- Pass 2b: general positional / aura / team effects (round 10, T219) ---
  //
  // Deltas accumulate against the PASS-1 BASE snapshot and are applied only after every source has
  // been read. Without that, two creatures buffing each other would resolve differently depending on
  // which happened to sit earlier in the placement array — the same ordering hazard pass 2 avoids,
  // and the reason these are not applied inline.
  //
  // Deliberately NOT handled here: `cooldownSpeedModifier`, which `simulate()` already sums in
  // `resolveCooldownSpeedTotal`. Resolving it in both places would double-count it.
  const deltas = new Map(
    base.map((r) => [
      r.key,
      {
        damage: 0,
        multicast: 0,
        heal: 0,
        extraOngoing: 0,
        status: new Map<StatusEffectType, number>(),
      },
    ]),
  );

  /** The resolved placement a delta belongs to, so a grant can ask about its RECIPIENT. */
  const byKey = new Map(base.map((r) => [r.key, r]));

  const addStatus = (key: PlacementKey, type: StatusEffectType, amount: number) => {
    const d = deltas.get(key);
    if (!d || amount === 0) return;
    d.status.set(type, (d.status.get(type) ?? 0) + amount);
  };

  const applyEffect = (targetKey: PlacementKey, effect: EffectDescriptor, scale = 1) => {
    const d = deltas.get(targetKey);
    if (!d) return;
    if (effect.statChange) {
      const amount = effect.statChange.amount * scale;
      // `CooldownSpeed` is intentionally absent — see the double-counting note above.
      if (effect.statChange.stat === StatChangeStat.Damage) d.damage += amount;
      // "(Zephyrex can't have Multicast)" — a restriction on the RECIPIENT, so it is checked here
      // where the grant lands rather than wherever it was emitted. See `AbilityTagKind.CannotGain`.
      else if (effect.statChange.stat === StatChangeStat.Multicast) {
        if (!cannotGain(byKey.get(targetKey)?.creature, GrantableStat.Multicast)) d.multicast += amount;
      }
      else if (effect.statChange.stat === StatChangeStat.Heal) d.heal += amount;
    }
    if (effect.statusGrant) {
      addStatus(targetKey, effect.statusGrant.type, effect.statusGrant.amount * scale);
    }
    if (effect.extraOngoingApplications) {
      d.extraOngoing += effect.extraOngoingApplications * scale;
    }
  };

  // Knockout rewards, applied through the same delta path as everything else.
  for (const source of base) {
    for (const grant of source.pendingKnockoutGrants) {
      // "+20 Shield **permanently** for each ally Knockout" is a reactive gain, so by Finding 3 it
      // is never scaled — it lands after the multiplier rather than being folded into base.
      if (grant.effect.statusGrant) {
        const v = source.stats.status.get(grant.effect.statusGrant.type);
        const amount = grant.effect.statusGrant.amount * grant.count;
        if (v) addPostMultiplier(v, amount);
        else source.stats.status.set(grant.effect.statusGrant.type, { ...statValue(0), postMultiplierFlatAdd: amount });
      }
      if (grant.effect.statChange?.stat === "damage") {
        addPostMultiplier(source.stats.damage, grant.effect.statChange.amount * grant.count);
      }
    }
  }

  for (const source of base) {
    for (const tag of source.creature.abilityTags) {
      switch (tag.kind) {
        case "ongoing":
          for (const target of selectTargets(tag.target, source, base, config)) {
            applyEffect(target.key, tag.effect);
          }
          break;

        case "statusGrant":
          for (const target of selectTargets(tag.target, source, base, config)) {
            addStatus(target.key, tag.status, tag.amount);
          }
          break;

        case "onEvent":
          // Only OnBattleStart is resolvable: it is the one event whose timing is known before the
          // simulation runs. OnCast/OnVictory/OnKnockout depend on battle state this engine either
          // schedules itself (OnCast) or does not model at all (victory, knockout — there is no
          // death or HP system), so acting on them here would fabricate output.
          if (tag.event === EventLabel.OnBattleStart) applyEffect(source.key, tag.effect);
          break;

        case "statFromCount": {
          // Count scaling: "+N Damage for each <type> ally", "for each ally in the back row", etc.
          const matches = base.filter((m) => {
            if (m.key === source.key && !tag.includeSelf) return false;
            if (tag.typeFilter && !creatureHasType(m.creature, tag.typeFilter, config)) return false;
            if (tag.rarityFilter && m.creature.rarity !== tag.rarityFilter) return false;
            if (tag.minLevelFilter && m.creature.level < tag.minLevelFilter) return false;
            if (tag.rowFilter && m.slot.row !== tag.rowFilter) return false;
            return true;
          }).length;
          if (matches > 0) {
            for (const target of selectTargets(tag.target, source, base, config)) {
              applyEffect(target.key, tag.effect, matches);
            }
          }
          break;
        }

        case "statFromUniqueTypes": {
          // Distinct type VALUES across the team, not a count of matching allies. A painted or
          // natively-"All" ally contributes every type, which is exactly the Painter/Prismagon
          // combination the community guides call out as the archetype.
          const types = new Set<string>();
          for (const m of base) {
            if (m.creature.types.some(isWildcardType) || config.paintedCreatureIds?.includes(m.creature.id)) {
              for (const t of Object.keys(TYPE_COLORS)) types.add(t);
            } else {
              for (const t of m.creature.types) types.add(t);
            }
          }
          if (types.size > 0) {
            for (const target of selectTargets(tag.target, source, base, config)) {
              applyEffect(target.key, tag.effect, types.size);
            }
          }
          break;
        }

        case "statFromStat": {
          // Stat scaling: "+Damage equal to 50% of the Shield of your allies".
          const pool = selectTargets(tag.sourceSelector, source, base, config).filter(
            // "(Except other Gaiadrasil)" — 2026-10-09. Without it a pair of them each counts the
            // other's damage, so two copies feed each other instead of merely stacking.
            (m) => !tag.excludeSameSpecies || m.creature.id !== source.creature.id,
          );
          const total = pool.reduce((sum, m) => {
            if (tag.sourceStat === "damage") return sum + (m.baseDamage ?? 0);
            if (tag.sourceStat === "multicast") return sum + m.multicast;
            return sum + (m.appliesStatus.find((s) => s.type === tag.sourceStat)?.amount ?? 0);
          }, 0);
          if (total !== 0) {
            applyEffect(source.key, tag.effect, total * tag.multiplier);
          }
          break;
        }

        /*
         * Blixie: "give the Fire ally behind [Nx] THIS MONSTER'S Burn" (2026-10-09).
         *
         * Reads the giver's POST-MULTIPLIER value — `appliesStatus` has been re-synced from
         * `stats` by the phase-1 flatten above — so a Blixie whose Burn an aura raised passes on
         * the raised figure. Summing its base would be the same 657-vs-1080 mistake the
         * battle-start pass records two cases up.
         */
        /*
         * Danuki: "on ally knockout, this gains 70% of their Damage for this battle" (2026-10-09).
         *
         * Only the battle-start knockout family can reach this, which is the whole reason it is
         * modellable: Petrirex and Rattleghast kill by POSITION, so the casualty list is known
         * before the first cast. On a board with no such killer Danuki gains nothing, which
         * understates it against a real fight rather than inventing a figure — there is no HP
         * model here for anyone to die to.
         */
        case "gainOnAllyKnockout": {
          const gained = casualtyDamage
            .filter((v) => !tag.excludeSameSpecies || v.speciesId !== source.creature.id)
            .reduce((sum, v) => sum + v.damage * tag.fraction, 0);
          if (gained !== 0) {
            // Post-multiplier, like every other reactive "permanently" gain (Finding 3): a gain
            // triggered by an event is never scaled by the holder's own multipliers.
            addPostMultiplier(source.stats.damage, Math.round(gained));
          }
          break;
        }

        case "grantFromOwnStat": {
          const own = source.appliesStatus.find((s) => s.type === tag.sourceStat)?.amount ?? 0;
          const amount = Math.round(own * tag.multiplier);
          if (amount === 0) break;
          for (const target of selectTargets(tag.target, source, base, config)) {
            addStatus(target.key, tag.grantStat, amount);
          }
          break;
        }
      }
    }
  }

  for (const resolved of base) {
    const d = deltas.get(resolved.key);
    if (!d) continue;
    // T240/T241: deltas go into the STRUCTURE, not onto the flattened number, so a later
    // multiplier still scales them. `addFlat` — these are battle-start/ally grants, which the
    // capture shows being scaled (Noxnimbus's +6 became +10 on multiplied creatures).
    if (d.damage !== 0) addFlat(resolved.stats.damage, d.damage);
    // Multicast is a repetition count: it must stay a whole number >= 1, and a debuff must never
    // silence a creature entirely.
    if (d.multicast !== 0) resolved.multicast = Math.max(1, Math.round(resolved.multicast + d.multicast));
    resolved.extraOngoingApplications = Math.max(0, Math.round(d.extraOngoing));
    for (const [type, amount] of d.status) {
      if (amount === 0) continue;
      const existing = resolved.stats.status.get(type);
      if (existing) addFlat(existing, amount);
      else resolved.stats.status.set(type, statValue(amount));
    }
  }
  syncReadValues(base);

  // --- T244: target-status scaling, collected for per-cast evaluation by `simulate()` ---
  //
  // NOT flattened into a number here: "Damage equal to 200% of the Poison stacks on the enemy" is
  // recomputed every cast from a counter that only grows, so a resolved-once value would be wrong
  // from the second cast onward.
  for (const resolved of base) {
    for (const tag of resolved.creature.abilityTags) {
      if (tag.kind === AbilityTagKind.StatFromTargetStatus) {
        resolved.targetStatusScaling.push({ status: tag.status, multiplier: tag.multiplier });
      }
    }
  }

  // --- Pass 3: collect charge rules and record what we could NOT model ---
  for (const resolved of base) {
    for (const tag of resolved.creature.abilityTags) {
      if (tag.kind === AbilityTagKind.ChargeOnAllyStatus) {
        resolved.chargeRules.push({ status: tag.status, seconds: tag.seconds });
      }
    }
    // An ability with text but no tag the resolver understands is inert — say so rather than
    // letting a working engine imply the creature's ability is being counted.
    const hasResolvable = resolved.creature.abilityTags.some(isResolvableTag);
    if (!hasResolvable && hasAbilityText(resolved.creature.abilityText)) {
      resolved.unmodelledAbilities.push(resolved.creature.name);
    }
  }

  return { placements: base, knockedOut: casualties };
}
