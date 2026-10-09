import type {
  BenchedCreature,
  Corpus,
  GridSlot,
  RosterRef,
  RosteredCreature,
  TeamConfiguration,
  TeamPlacement,
} from "../data/types";
import { RosterZone } from "../data/types";
import type { Species } from "../data/ids";
import { resolveLevelUp } from "./evolution";
import { STABLE_SLOT_ORDER, slotsEqual } from "./grid";
import { benchOf, benchRef, gridRef } from "./roster";

/**
 * Levelling a monster by spending duplicates of it (2026-10-09, user-reported).
 *
 * ## The question this answers
 *
 * Every figure the advisor produced took each monster's level as given, because that is what the
 * roster says. But a level is something you BUY with duplicates, and the user owning three Lignite
 * Lv.1 is one merge away from a Lignite Lv.2 whose ability does twice the work — a change the
 * engine models in full (`selfScaling.ts`) and the advisor had no way to propose. "I'm trying to
 * tell if levelling up Lignite would be worth it" was not answerable with the tool.
 *
 * ## The rules, and where they come from
 *
 * Three Lv.1 copies make a Lv.2; two Lv.2 copies make a Lv.3. Level 4 is reachable only through
 * trinkets and items, so there is no Lv.3 rule and a Lv.3 monster is never a merge candidate here.
 * These came from the user and are stated in `MERGE_RULES` rather than spread through the search,
 * because they are the one thing in this module that is a fact about the GAME.
 *
 * ## One step at a time
 *
 * Six Lv.1 copies are, in principle, two Lv.2s and then a Lv.3. This proposes only the single
 * merge available now, which is the same discipline the bench's swap table follows: a row the user
 * can act on in one go, costed exactly as performed. A chain would have to quote a figure for a
 * board two decisions away, and the second decision is one they may well not want to make.
 *
 * ## What a merge costs, and what it keeps
 *
 * The copies are spent, so the roster shrinks by `copies - 1` monsters. That is the real price and
 * the reason this cannot be read off a DPS figure alone: three bodies become one, and on a full
 * board that can empty a slot. `vacated` names those slots so the advice can say so.
 *
 * The SURVIVOR keeps its position, its modifiers and its lock; the copies that are spent take
 * theirs with them. That mirrors what the app already does when a level changes by hand — see
 * `setPlacement`'s carry-over rule — and it is why a placed copy is always chosen as the survivor
 * in preference to a benched one: it keeps the board as full as the merge allows.
 */

/** Levels that can be bought with duplicates, and what buying one costs. */
export const MERGE_RULES: Record<1 | 2, { copies: number; into: 2 | 3 }> = {
  1: { copies: 3, into: 2 },
  2: { copies: 2, into: 3 },
};

/** One merge the roster can pay for right now. */
export interface MergeStep {
  /** A copy as it stands now — the species, level and shiny the merge consumes. */
  source: RosteredCreature;
  /** The single monster the merge produces. */
  result: RosteredCreature;
  /** How many copies are spent, the survivor included. */
  copies: number;
  /** Where the merged monster ends up: the survivor's own position. */
  destination: RosterRef;
  /** Grid slots the merge empties, because a placed copy was spent. */
  vacated: GridSlot[];
  /** The whole roster after the merge — the board to simulate, and the board to apply. */
  config: TeamConfiguration;
}

/** One monster in the roster, with the position it would be removed from. */
interface Copy {
  ref: RosterRef;
  member: RosteredCreature;
}

/**
 * Every monster, placed first in board order and then benched by position.
 *
 * The order is what makes the survivor choice deterministic, so the same roster always yields the
 * same suggestion. Placed-first in particular: the survivor is the first placed copy when there is
 * one, which keeps a body on the board.
 */
function rosterCopies(config: TeamConfiguration): Copy[] {
  const placed = STABLE_SLOT_ORDER.flatMap((slot) => {
    const member = config.placements.find((p) => slotsEqual(p.slot, slot));
    return member ? [{ ref: gridRef(slot), member }] : [];
  });
  const benched = [...benchOf(config)]
    .sort((a, b) => a.index - b.index)
    .map((b) => ({ ref: benchRef(b.index), member: b }));
  return [...placed, ...benched];
}

/**
 * What makes two monsters the same thing for merging: species, level and shiny.
 *
 * Shiny is part of the key, and that is a DELIBERATE restriction rather than an oversight. A shiny
 * monster carries a different published stat line, and for a handful of species a strictly worse
 * one, so merging a shiny copy into a plain result (or the reverse) would silently change what the
 * monster is in a way the user did not ask for. Requiring the copies to match leaves the decision
 * where it belongs: three plain copies merge, and a shiny one is simply not one of them.
 */
function mergeKey(member: RosteredCreature): string {
  return `${member.creatureId}|${member.level}|${member.shiny === true ? "shiny" : "plain"}`;
}

function isGrid(ref: RosterRef): ref is { zone: RosterZone.Grid; slot: GridSlot } {
  return ref.zone === RosterZone.Grid;
}

/** `config` with every position in `removing` emptied, and `survivor`'s occupant replaced. */
function afterMerge(
  config: TeamConfiguration,
  survivor: RosterRef,
  spent: RosterRef[],
  merged: RosteredCreature,
): TeamConfiguration {
  const spentSlots = spent.filter(isGrid).map((r) => r.slot);
  const spentIndexes = spent.filter((r) => !isGrid(r)).map((r) => (r as { index: number }).index);

  const placements: TeamPlacement[] = config.placements
    .filter((p) => !spentSlots.some((s) => slotsEqual(s, p.slot)))
    .map((p) =>
      isGrid(survivor) && slotsEqual(p.slot, survivor.slot) ? { ...merged, slot: p.slot } : p,
    );
  /*
   * Bench POSITIONS are left as they were, gaps included, rather than being closed up. The bench is
   * four places on screen that the user drags things to; resliding the survivors one position left
   * because something above them was spent would move cards they did not touch.
   */
  const bench: BenchedCreature[] = benchOf(config)
    .filter((b) => !spentIndexes.includes(b.index))
    .map((b) => (!isGrid(survivor) && b.index === survivor.index ? { ...merged, index: b.index } : b));

  return { ...config, placements, bench };
}

/**
 * Every merge the roster can pay for, one step per species.
 *
 * Cheap enough to run on every board change: a group-by over at most ten monsters, and an empty
 * result — the overwhelmingly common case — costs nothing beyond that.
 */
export function availableMerges(config: TeamConfiguration, corpus: Corpus): MergeStep[] {
  const groups = new Map<string, Copy[]>();
  for (const copy of rosterCopies(config)) {
    const key = mergeKey(copy.member);
    groups.set(key, [...(groups.get(key) ?? []), copy]);
  }

  const steps: MergeStep[] = [];
  for (const copies of groups.values()) {
    const first = copies[0]!;
    const rule = MERGE_RULES[first.member.level as 1 | 2];
    if (!rule || copies.length < rule.copies) continue;

    // The survivor keeps its place; the benched copies are spent before the placed ones, so the
    // merge takes as few monsters off the board as it can.
    const survivor = copies.find((c) => isGrid(c.ref)) ?? first;
    const others = copies.filter((c) => c !== survivor);
    const spent = [...others.filter((c) => !isGrid(c.ref)), ...others.filter((c) => isGrid(c.ref))]
      .slice(0, rule.copies - 1)
      .map((c) => c.ref);

    /*
     * Resolved through the SAME function the level bubbles use, so a merge that crosses an
     * evolution boundary produces the species the app would show if the user had set that level by
     * hand — Panbud's three Lv.1 copies become a Lv.2 Panbud, and a further merge a Lv.3 Bambudo.
     * `null` means the corpus has no record at that level, and a merge the app could not then
     * display is not one to suggest.
     */
    const resolved = resolveLevelUp(corpus, survivor.member.creatureId, rule.into);
    if (!resolved) continue;

    const merged: RosteredCreature = {
      creatureId: resolved.id as Species,
      level: rule.into,
      ...(survivor.member.shiny ? { shiny: true as const } : {}),
      // Kept, both of them, because the survivor is the same monster one level up: this is the
      // carry-over rule `setPlacement` applies to a hand-typed level change, not a new monster.
      ...(survivor.member.modifiers ? { modifiers: survivor.member.modifiers } : {}),
      ...(survivor.member.locked ? { locked: true as const } : {}),
    };

    steps.push({
      source: first.member,
      result: merged,
      copies: rule.copies,
      destination: survivor.ref,
      vacated: spent.filter(isGrid).map((ref) => ref.slot),
      config: afterMerge(config, survivor.ref, spent, merged),
    });
  }
  return steps;
}
