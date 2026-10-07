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
import { aboveSlot, behindSlot, isAdjacent, slotKey, slotsEqual } from "./grid";
import { applyShinyOverlay } from "../data/corpus";

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
  key: string;
  slot: GridSlot;
  creature: CreatureRecord;
  /** Effective status applications per cast, after battle-start grants. */
  appliesStatus: { type: StatusEffectType; amount: number }[];
  /** Effective direct damage per hit. */
  baseDamage: number | null;
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
] as const;

/** True when `tag` is one this resolver understands. Keeps the "can we act on it?" test in one place. */
export function isResolvableTag(tag: { kind: string }): boolean {
  return (RESOLVED_TAG_KINDS as readonly string[]).includes(tag.kind);
}

/**
 * The creatures a `TargetSelector` picks out, relative to `source`.
 *
 * All six selectors in the vocabulary resolve here, which is what turns seven separate "mechanism
 * families" (adjacency auras, positional grants, row-wide effects, on-battle-start team grants,
 * self-buffs, and the two cooldown-speed grant shapes) into one code path. They were only ever
 * distinct families in the *ability text*; structurally they differ just by selector.
 *
 * Board geometry is `grid.ts`'s, so "adjacent" stays side-sharing and never diagonal (research.md
 * B5) in exactly one place.
 */
export function selectTargets<T extends { slot: GridSlot; key: string; creature: CreatureRecord }>(
  selector: TargetSelector,
  source: T,
  all: T[],
): T[] {
  const others = all.filter((m) => m.key !== source.key);

  // T225: type/rarity/level filters apply to every selector that can carry them, in one place.
  const filtered = (list: T[]) => {
    const f = selector as Partial<SelectorFilters>;
    return list.filter(
      (m) =>
        (!f.typeFilter || m.creature.types.includes(f.typeFilter)) &&
        (!f.rarityFilter || m.creature.rarity === f.rarityFilter) &&
        (!f.minLevelFilter || m.creature.level >= f.minLevelFilter),
    );
  };

  switch (selector.kind) {
    case "self":
      return [source];
    case "adjacent":
      return filtered(others.filter((m) => isAdjacent(source.slot, m.slot)));
    case "row":
      return filtered(others.filter((m) => m.slot.row === source.slot.row));
    case "inFront": {
      // The mirror of `behind`: defined only from the back row, looking forward.
      if (source.slot.row !== "back") return [];
      return others.filter((m) => m.slot.row === "front" && m.slot.col === source.slot.col);
    }
    case "behind": {
      const slot = behindSlot(source.slot);
      return slot ? others.filter((m) => slotsEqual(m.slot, slot)) : [];
    }
    case "above": {
      const slot = aboveSlot(source.slot);
      return slot ? others.filter((m) => slotsEqual(m.slot, slot)) : [];
    }
    case "allAllies":
      return filtered(others);
    default:
      return [];
  }
}

export function resolveEffects(config: TeamConfiguration, corpus: Corpus): ResolvedPlacement[] {
  const members = config.placements
    .map((placement) => {
      // Round 11 (WI-R11-001): the SHINY line when the placement is shiny. This is the single
      // point where the engine turns a placement into stats, so routing it here means shiny flows
      // into DPS, the charts, the optimiser and the effective-stat band without four separate fixes.
      const creature = applyShinyOverlay(
        corpus.creatures.find(
          (c) => c.id === placement.creatureId && c.level === placement.level,
        ) ?? null,
        placement.shiny,
      );
      return creature ? { placement, creature } : null;
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  // --- Pass 1: base stats, untouched. Resolution order is explicit (see the doc comment): every
  //     battle-start effect that reads *other* creatures' values must read their BASE values, or
  //     the result would depend on which creature happened to resolve first. ---
  const base = members.map(({ placement, creature }) => ({
    key: `${creature.id}@${slotKey(placement.slot)}`,
    slot: placement.slot,
    creature,
    appliesStatus: (creature.appliesStatus ?? []).map((s) => ({ ...s })),
    baseDamage: creature.baseDamage,
    cooldownSeconds: creature.baseCooldownSeconds,
    multicast: creature.baseMulticast,
    chargeRules: [] as { status: StatusEffectType; seconds: number }[],
    extraOngoingApplications: 0,
    unmodelledAbilities: [] as string[],
  }));

  // --- Pass 2: battle-start grants scaled from allies' base totals ---
  for (const resolved of base) {
    for (const tag of resolved.creature.abilityTags) {
      if (tag.kind !== "battleStartStatusFromAllies") continue;
      const allyTotal = base
        .filter((other) => other.key !== resolved.key)
        // "(Except other Miasmaw)" — same-species allies are excluded too, per the ability text.
        .filter((other) => other.creature.id !== resolved.creature.id)
        .reduce(
          (sum, other) =>
            sum + (other.appliesStatus.find((s) => s.type === tag.status)?.amount ?? 0),
          0,
        );
      const gained = Math.round(allyTotal * tag.multiplier);
      if (gained === 0) continue;
      const existing = resolved.appliesStatus.find((s) => s.type === tag.status);
      if (existing) existing.amount += gained;
      else resolved.appliesStatus.push({ type: tag.status, amount: gained });
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
        extraOngoing: 0,
        status: new Map<StatusEffectType, number>(),
      },
    ]),
  );

  const addStatus = (key: string, type: StatusEffectType, amount: number) => {
    const d = deltas.get(key);
    if (!d || amount === 0) return;
    d.status.set(type, (d.status.get(type) ?? 0) + amount);
  };

  const applyEffect = (targetKey: string, effect: EffectDescriptor, scale = 1) => {
    const d = deltas.get(targetKey);
    if (!d) return;
    if (effect.statChange) {
      const amount = effect.statChange.amount * scale;
      // "cooldownSpeed" is intentionally absent — see the double-counting note above.
      if (effect.statChange.stat === "damage") d.damage += amount;
      else if (effect.statChange.stat === "multicast") d.multicast += amount;
    }
    if (effect.statusGrant) {
      addStatus(targetKey, effect.statusGrant.type, effect.statusGrant.amount * scale);
    }
    if (effect.extraOngoingApplications) {
      d.extraOngoing += effect.extraOngoingApplications * scale;
    }
  };

  for (const source of base) {
    for (const tag of source.creature.abilityTags) {
      switch (tag.kind) {
        case "ongoing":
          for (const target of selectTargets(tag.target, source, base)) {
            applyEffect(target.key, tag.effect);
          }
          break;

        case "statusGrant":
          for (const target of selectTargets(tag.target, source, base)) {
            addStatus(target.key, tag.status, tag.amount);
          }
          break;

        case "onEvent":
          // Only OnBattleStart is resolvable: it is the one event whose timing is known before the
          // simulation runs. OnCast/OnVictory/OnKnockout depend on battle state this engine either
          // schedules itself (OnCast) or does not model at all (victory, knockout — there is no
          // death or HP system), so acting on them here would fabricate output.
          if (tag.event === "OnBattleStart") applyEffect(source.key, tag.effect);
          break;

        case "statFromCount": {
          // Count scaling: "+N Damage for each <type> ally", "for each ally in the back row", etc.
          const matches = base.filter((m) => {
            if (m.key === source.key && !tag.includeSelf) return false;
            if (tag.typeFilter && !m.creature.types.includes(tag.typeFilter)) return false;
            if (tag.rarityFilter && m.creature.rarity !== tag.rarityFilter) return false;
            if (tag.minLevelFilter && m.creature.level < tag.minLevelFilter) return false;
            if (tag.rowFilter && m.slot.row !== tag.rowFilter) return false;
            return true;
          }).length;
          if (matches > 0) {
            for (const target of selectTargets(tag.target, source, base)) {
              applyEffect(target.key, tag.effect, matches);
            }
          }
          break;
        }

        case "statFromStat": {
          // Stat scaling: "+Damage equal to 50% of the Shield of your allies".
          const pool = selectTargets(tag.sourceSelector, source, base);
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
      }
    }
  }

  for (const resolved of base) {
    const d = deltas.get(resolved.key);
    if (!d) continue;
    if (d.damage !== 0 && resolved.baseDamage !== null) {
      resolved.baseDamage = Math.round(resolved.baseDamage + d.damage);
    }
    // Multicast is a repetition count: it must stay a whole number >= 1, and a debuff must never
    // silence a creature entirely.
    if (d.multicast !== 0) resolved.multicast = Math.max(1, Math.round(resolved.multicast + d.multicast));
    resolved.extraOngoingApplications = Math.max(0, Math.round(d.extraOngoing));
    for (const [type, amount] of d.status) {
      const rounded = Math.round(amount);
      if (rounded === 0) continue;
      const existing = resolved.appliesStatus.find((s) => s.type === type);
      if (existing) existing.amount += rounded;
      else resolved.appliesStatus.push({ type, amount: rounded });
    }
    // A status application cannot go negative — a debuff at worst removes the application.
    for (const s of resolved.appliesStatus) s.amount = Math.max(0, s.amount);
  }

  // --- Pass 3: collect charge rules and record what we could NOT model ---
  for (const resolved of base) {
    for (const tag of resolved.creature.abilityTags) {
      if (tag.kind === "chargeOnAllyStatus") {
        resolved.chargeRules.push({ status: tag.status, seconds: tag.seconds });
      }
    }
    // An ability with text but no tag the resolver understands is inert — say so rather than
    // letting a working engine imply the creature's ability is being counted.
    const hasResolvable = resolved.creature.abilityTags.some(isResolvableTag);
    const hasAbilityText =
      resolved.creature.abilityText.trim().length > 0 &&
      !/^no ability text/i.test(resolved.creature.abilityText);
    if (!hasResolvable && hasAbilityText) {
      resolved.unmodelledAbilities.push(resolved.creature.name);
    }
  }

  return base;
}
