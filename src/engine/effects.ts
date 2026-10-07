import type {
  Corpus,
  CreatureRecord,
  GridSlot,
  StatusEffectType,
  TeamConfiguration,
} from "../data/types";
import { slotKey } from "./grid";

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
  /** Abilities recorded on this creature that the engine cannot act on, for honest reporting. */
  unmodelledAbilities: string[];
}

/** True when `tag` is one this resolver understands. Keeps the "can we act on it?" test in one place. */
export function isResolvableTag(tag: { kind: string }): boolean {
  return (
    tag.kind === "battleStartStatusFromAllies" ||
    tag.kind === "chargeOnAllyStatus" ||
    tag.kind === "cooldownSpeedModifier"
  );
}

export function resolveEffects(config: TeamConfiguration, corpus: Corpus): ResolvedPlacement[] {
  const members = config.placements
    .map((placement) => {
      const creature = corpus.creatures.find(
        (c) => c.id === placement.creatureId && c.level === placement.level,
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
