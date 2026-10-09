import { describe, expect, it } from "vitest";
import { corpus } from "../../data/corpus";
import { simulate } from "../simulate";
import { GridRow, TimelineEventKind } from "../../data/enums";
import { Species } from "../../data/ids";
import type { CreatureLevel, GridCol, TeamConfiguration } from "../../data/types";

function board(entries: [GridRow, GridCol, Species, CreatureLevel?][]): TeamConfiguration {
  return {
    placements: entries.map(([row, col, creatureId, level]) => ({
      slot: { row, col },
      creatureId,
      level: level ?? 1,
    })),
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: 30,
  };
}

/** How many times the monster at `row`/`col` actually hit — the only place Multicast shows up. */
function hitCount(config: TeamConfiguration, row: GridRow, col: GridCol): number {
  return simulate(config, corpus).timeline.filter(
    (e) => e.kind === TimelineEventKind.Attack && e.sourceSlot.row === row && e.sourceSlot.col === col,
  ).length;
}

/**
 * 2026-10-08, user-reported: "is Zephyrex's ability … 'Give the Flying ally in front +1 Multicast
 * permanently. (Zephyrex can't have Multicast)' take into account if any mons are or have flying".
 *
 * It did not. `TargetKind.InFront` carried no `SelectorFilters` at all and `selectTargets` never
 * filtered that branch, so the Multicast went to whoever was standing there. On the reporting
 * user's own board that was a Toxic Venopuff, which went from 8 casts to 17 and took the whole
 * board from a true 125 DPS to a reported 159.
 */
describe("Zephyrex's Flying-only Multicast grant", () => {
  /** Zephyrex casts every 10s, so in a 30s window it grants three times. */
  const ZEPHYREX_GRANTS = 3;

  it("grants to a Flying ally in front", () => {
    // Humbolt is Electric/Flying on a 4s cooldown with a base Multicast of 2 — 7 casts in 30s.
    const flying = board([
      [GridRow.Top, 0, Species.Zephyrex],
      [GridRow.Top, 1, Species.Humbolt],
    ]);
    const alone = hitCount(board([[GridRow.Top, 1, Species.Humbolt]]), GridRow.Top, 1);
    expect(hitCount(flying, GridRow.Top, 1)).toBeGreaterThan(alone);
  });

  it("grants NOTHING to a non-Flying ally in front", () => {
    /*
     * The reported bug, as the smallest board that shows it. Pebbler is Rock, so the ability reads
     * right past it — and before the filter existed it was picking up a Multicast every 10s.
     */
    const rock = board([
      [GridRow.Top, 0, Species.Zephyrex],
      [GridRow.Top, 1, Species.Pebbler],
    ]);
    const alone = hitCount(board([[GridRow.Top, 1, Species.Pebbler]]), GridRow.Top, 1);
    expect(hitCount(rock, GridRow.Top, 1)).toBe(alone);
  });

  it("leaves Saberhorn's genuinely unfiltered grant alone", () => {
    /*
     * The regression guard for the selector change. Saberhorn is the only other `inFront` user and
     * its text carries no type at all — "Give the ally in front +1 Multicast" — so adding filter
     * support must not start filtering it. A Rock Pebbler in front of it still gets the Multicast.
     */
    const saber = board([
      [GridRow.Top, 0, Species.Saberhorn],
      [GridRow.Top, 1, Species.Pebbler],
    ]);
    const alone = hitCount(board([[GridRow.Top, 1, Species.Pebbler]]), GridRow.Top, 1);
    expect(hitCount(saber, GridRow.Top, 1)).toBeGreaterThan(alone);
  });

  it("refuses to give Multicast to another Zephyrex — '(Zephyrex can't have Multicast)'", () => {
    /*
     * Zephyrex is itself Flying, so stacking two is the most obvious board to try and the exact
     * one the parenthetical forbids. The clause is in the ability text precisely because a player
     * would otherwise reach for it, and without `AbilityTagKind.CannotGain` the engine would have
     * recommended it: the front Zephyrex would gain a Multicast every 10 seconds.
     */
    const stacked = board([
      [GridRow.Top, 0, Species.Zephyrex],
      [GridRow.Top, 1, Species.Zephyrex],
    ]);
    const alone = hitCount(board([[GridRow.Top, 1, Species.Zephyrex]]), GridRow.Top, 1);
    expect(hitCount(stacked, GridRow.Top, 1)).toBe(alone);
    // And the grant really was being emitted at it — the refusal is on the recipient's side, not
    // an accident of the Flying filter. Three casts from the back one, every one of them wasted.
    expect(hitCount(stacked, GridRow.Top, 0)).toBe(ZEPHYREX_GRANTS);
  });
});
