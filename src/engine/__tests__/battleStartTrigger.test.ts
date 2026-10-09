import { describe, expect, it } from "vitest";
import { corpus } from "../../data/corpus";
import { simulate } from "../simulate";
import { DamageChannel, GridRow, StatusEffectType, TimelineEventKind } from "../../data/enums";
import { Species } from "../../data/ids";
import type { CreatureLevel, GridCol, TeamConfiguration } from "../../data/types";

function board(creatureIds: Species[], level: CreatureLevel = 1, windowSeconds = 30): TeamConfiguration {
  return {
    placements: creatureIds.map((creatureId, i) => ({
      slot: { row: GridRow.Top, col: i as GridCol },
      creatureId,
      level,
    })),
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: windowSeconds,
  };
}

/** Every instant at which `creatureId` put something on the shared target. */
function applicationTimes(config: TeamConfiguration, col: GridCol): number[] {
  return simulate(config, corpus)
    .timeline.filter((e) => e.statusDelta !== undefined && e.sourceSlot.col === col)
    .map((e) => e.tSeconds)
    .filter((t, i, all) => all.indexOf(t) === i);
}

/**
 * 2026-10-08, user-reported: "he also gets a 0.0s cast because of his ability, '[On Battle Start]
 * Trigger this.' It looks like our creatures.ts for Coalem only has abilityTrigger: OnBattleStart,
 * but it technically does both that *and* onCast. Is this taken into account? it appears it is not"
 *
 * It was not. Coalem, Frizzly and NULL-FF all published the trigger and all three carried no
 * `abilityTags`, so the engine gave them no opening cast — on a 15s cooldown over a 30s window
 * that is two casts where the game gives three, a third of the creature's output missing.
 */
describe("On Battle Start: Trigger this (AbilityTagKind.Trigger)", () => {
  it("gives Coalem its opening cast at t=0", () => {
    expect(applicationTimes(board([Species.Coalem]), 0)).toContain(0);
  });

  it("does not consume the cooldown cycle — the opening cast is in ADDITION", () => {
    /*
     * The property that makes "move the first cast to t=0" the right implementation rather than a
     * shortcut: it has to produce the same three casts an extra-cast-at-zero reading would.
     * Coalem on 15s over a 30s window casts at 0, 15 and 30 — not 0 and 15, and not 0, 0.1 and 15.
     */
    expect(applicationTimes(board([Species.Coalem]), 0)).toEqual([0, 15, 30]);
  });

  it("leaves a creature without the tag starting at its cooldown, not at zero", () => {
    // The regression guard. Venopuff has no battle-start trigger and must still open at 3.5s.
    const times = applicationTimes(board([Species.Venopuff]), 0);
    expect(times[0]).toBeGreaterThan(0);
  });

  it("triggers row-mates too, for NULL-FF's 'this AND allies in this row'", () => {
    // Venopuff's own first cast is at 3.5s; standing in NULL-FF's row it opens at 0 instead.
    const alone = applicationTimes(board([Species.Venopuff]), 0);
    const inRow = applicationTimes(board([Species.Nullff, Species.Venopuff]), 1);

    expect(alone).not.toContain(0);
    expect(inRow).toContain(0);
  });

  it("runs the opening cast through Multicast, which a queued reaction would have skipped", () => {
    /*
     * The concrete reason the implementation moves `nextAt` instead of pushing onto `reactions`:
     * the reaction path does not expand Multicast, so NULL-FF (999 at Lv4) and Frizzly (2 at Lv4)
     * would have opened with a single hit. Frizzly Lv4 applies 48 Shock per repetition, so a
     * multicast opening puts on 96 before its cooldown has run once.
     */
    const result = simulate(board([Species.Frizzly], 4), corpus);
    const opening = result.timeline.filter(
      (e) => e.tSeconds < 1 && e.statusDelta?.type === StatusEffectType.Shock,
    );
    expect(opening.length).toBe(2);
    expect(opening.reduce((sum, e) => sum + (e.statusDelta?.layerDelta ?? 0), 0)).toBe(96);
  });

  it("reports a finite DPS when the only hit lands at t=0", () => {
    /*
     * Per-creature DPS divides by the time of the creature's LAST direct hit, which this feature
     * made zero for the first time. Frizzly's cooldown is 7s, so in a 3s window it casts once, at
     * the opening bell, and the old divisor would have returned Infinity. The UI permits a 1s
     * window, so this is reachable by hand and not only in theory.
     */
    const result = simulate(board([Species.Frizzly], 1, 3), corpus);

    for (const dps of Object.values(result.perCreatureDps)) {
      expect(Number.isFinite(dps)).toBe(true);
    }
    // 1 damage over the 3s window, rather than 1 damage over a zero-length span.
    expect(result.perCreatureDps["frizzly@back0"]).toBeCloseTo(1 / 3, 6);
  });

  it("puts Coalem's Burn on the pool fifteen seconds earlier than before", () => {
    // The user's actual question, as a number: the opening cast is worth a whole extra
    // application of 20 Burn, and Burn sheds only one layer per tick however large the pool, so
    // an early application compounds for the entire fight rather than decaying away.
    const result = simulate(board([Species.Coalem]), corpus);
    const firstTick = result.timeline.find(
      (e) => e.kind === TimelineEventKind.StatusTick && e.damageType === DamageChannel.Burn,
    );
    expect(firstTick?.tSeconds).toBe(0.5);
    expect(firstTick?.damage).toBe(20);
  });
});
