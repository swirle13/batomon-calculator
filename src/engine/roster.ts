import type {
  BenchIndex,
  BenchedCreature,
  GridSlot,
  RosterRef,
  RosteredCreature,
  StatModifier,
  TeamConfiguration,
  TeamPlacement,
} from "../data/types";
import { BENCH_INDEXES, RosterZone } from "../data/types";
import { isCreatureScoped, isSlotScoped } from "../data/modifierScope";
import { slotKey, slotsEqual } from "./grid";

/**
 * The roster: the six slots that fight, and the four bench positions that do not.
 *
 * ## Why moving a monster lives here rather than in the context
 *
 * `TeamConfigContext.movePlacement` used to own the rule, and it was the only caller, so that was
 * the right place for it. The bench added a second caller that MUST agree with it: the placement
 * advisor builds hypothetical boards ("what if this benched monster took that slot?") and reports
 * a DPS figure for each. If the advisor's hypothetical and the drag that realises it disagree
 * about where a modifier ends up, the advisor promises a number the board then does not produce —
 * and the user has no way to see why, because the discrepancy is a modifier they cannot find.
 *
 * So the rule is written once, here, and both go through it.
 *
 * ## The rule
 *
 * A modifier is scoped either to the MONSTER or to the POSITION (`ModifierScope`). A monster
 * carries its own and inherits the destination's:
 *
 *     arriving modifiers = creature-scoped(mover) + slot-scoped(whoever was standing there)
 *
 * with one asymmetry: **the bench has no positions that own anything**. A benched monster is out
 * of the fight entirely, so there is no position for a bonus to be attached to, and a monster
 * dragged to the bench brings only what belongs to it. Slot-scoped modifiers left behind on a slot
 * that ends up empty are gone — the same accepted loss grid-to-grid moves already had, since a
 * bonus attached to a position with nothing in it is not something the engine can apply.
 */

export const BENCH_SIZE = BENCH_INDEXES.length;

/** A roster position as a string, for keying maps and React lists. Never parsed back. */
export function rosterRefKey(ref: RosterRef): string {
  return ref.zone === RosterZone.Grid ? `grid:${slotKey(ref.slot)}` : `bench:${ref.index}`;
}

export function rosterRefsEqual(a: RosterRef, b: RosterRef): boolean {
  if (a.zone !== b.zone) return false;
  return a.zone === RosterZone.Grid && b.zone === RosterZone.Grid
    ? slotsEqual(a.slot, b.slot)
    : rosterRefKey(a) === rosterRefKey(b);
}

export function gridRef(slot: GridSlot): RosterRef {
  return { zone: RosterZone.Grid, slot };
}

export function benchRef(index: BenchIndex): RosterRef {
  return { zone: RosterZone.Bench, index };
}

export function benchOf(config: Pick<TeamConfiguration, "bench">): BenchedCreature[] {
  return config.bench ?? [];
}

/** Whoever is standing at `ref`, or `undefined`. */
export function rosterMemberAt(
  config: Pick<TeamConfiguration, "placements" | "bench">,
  ref: RosterRef,
): TeamPlacement | BenchedCreature | undefined {
  return ref.zone === RosterZone.Grid
    ? config.placements.find((p) => slotsEqual(p.slot, ref.slot))
    : benchOf(config).find((b) => b.index === ref.index);
}

/** Empty lists are stored as `undefined`, so a monster that carries nothing looks like one. */
export function modifiersOrUndefined(modifiers: StatModifier[]): StatModifier[] | undefined {
  return modifiers.length > 0 ? modifiers : undefined;
}

/** The monster, with no statement about where it stands. Drops `slot`/`index`. */
export function creatureOf(member: RosteredCreature): RosteredCreature {
  return {
    creatureId: member.creatureId,
    level: member.level,
    ...(member.shiny ? { shiny: true as const } : {}),
    ...(member.modifiers ? { modifiers: member.modifiers } : {}),
    // The lock is part of what the monster IS as far as this function is concerned — the user
    // pinned this monster, not this square. `settleOnBench` is where it stops being true.
    ...(member.locked ? { locked: true as const } : {}),
  };
}

/**
 * The modifiers a monster arrives at `destination` holding.
 *
 * `previousOccupant` is whoever was standing there BEFORE the move, and is the source of the
 * inherited slot-scoped half. Passing the destination's occupant when the mover is already
 * standing there is correct and is the identity case: a monster "moving" to its own slot inherits
 * its own slot-scoped modifiers, which is exactly what it already had.
 */
export function arrivingModifiers(
  mover: RosteredCreature,
  destination: RosterRef,
  previousOccupant: RosteredCreature | undefined,
): StatModifier[] | undefined {
  const carried = (mover.modifiers ?? []).filter(isCreatureScoped);
  // The bench owns nothing: see the asymmetry noted in this module's header.
  const inherited =
    destination.zone === RosterZone.Grid ? (previousOccupant?.modifiers ?? []).filter(isSlotScoped) : [];
  return modifiersOrUndefined([...carried, ...inherited]);
}

/**
 * `mover`, standing in `slot`, carrying what the rule above says it carries.
 *
 * The LOCK rides along with the monster rather than staying with the slot (2026-10-09). It means
 * "keep this one fielded", which is a statement about the monster and not about where it stands —
 * so dragging a locked monster one column over must not quietly unlock it, and the monster it
 * swapped with must not inherit a lock it never had.
 */
export function settleOnGrid(
  mover: RosteredCreature,
  slot: GridSlot,
  previousOccupant: RosteredCreature | undefined,
): TeamPlacement {
  const ref = gridRef(slot);
  return { ...creatureOf(mover), modifiers: arrivingModifiers(mover, ref, previousOccupant), slot };
}

/**
 * `mover`, parked at `index`. No `previousOccupant`: the bench has nothing to inherit.
 *
 * Drops the lock, because the bench is where a lock has no meaning: it exists to stop the advisor
 * SUGGESTING this monster be taken off the board, and the user has just taken it off themselves.
 * Leaving it set would show a padlock on a bench card that constrains nothing.
 */
export function settleOnBench(mover: RosteredCreature, index: BenchIndex): BenchedCreature {
  const monster = creatureOf(mover);
  delete monster.locked;
  return { ...monster, modifiers: arrivingModifiers(mover, benchRef(index), undefined), index };
}

/** `mover`, settled into `destination`, whichever zone that is. */
export function settle(
  mover: RosteredCreature,
  destination: RosterRef,
  previousOccupant: RosteredCreature | undefined,
): TeamPlacement | BenchedCreature {
  return destination.zone === RosterZone.Grid
    ? settleOnGrid(mover, destination.slot, previousOccupant)
    : settleOnBench(mover, destination.index);
}

/** `config` with `member` written in at `ref`, replacing whatever was there. */
function withMemberAt(
  config: TeamConfiguration,
  ref: RosterRef,
  member: TeamPlacement | BenchedCreature | null,
): TeamConfiguration {
  if (ref.zone === RosterZone.Grid) {
    const others = config.placements.filter((p) => !slotsEqual(p.slot, ref.slot));
    return { ...config, placements: member ? [...others, member as TeamPlacement] : others };
  }
  const others = benchOf(config).filter((b) => b.index !== ref.index);
  return { ...config, bench: member ? [...others, member as BenchedCreature] : others };
}

/**
 * Moves the monster at `from` to `to`, swapping with whoever is already there.
 *
 * The single entry point for every drag on the board, in all four directions. A no-op when `from`
 * is empty or the two refs are the same — both are things a stray drop produces, and neither is
 * an error.
 *
 * SWAPS rather than overwrites when `to` is occupied, so no monster is ever destroyed by a drag.
 * That matters more with a bench than it did without one: dragging a candidate onto a full board
 * is the main gesture this feature exists for, and it has to put the displaced monster somewhere.
 */
export function moveRoster(config: TeamConfiguration, from: RosterRef, to: RosterRef): TeamConfiguration {
  if (rosterRefsEqual(from, to)) return config;
  const mover = rosterMemberAt(config, from);
  if (!mover) return config;
  const displaced = rosterMemberAt(config, to);

  // Both reads happen against the ORIGINAL config, before either write: each side inherits what
  // the other was holding, so writing one first would have the second inherit the first's new
  // state instead of the state it is swapping with.
  const arriving = settle(mover, to, displaced);
  const returning = displaced ? settle(displaced, from, mover) : null;

  return withMemberAt(withMemberAt(config, to, arriving), from, returning);
}
