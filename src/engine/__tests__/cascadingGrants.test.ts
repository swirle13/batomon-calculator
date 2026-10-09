import { describe, expect, it } from "vitest";
import { simulate } from "../simulate";
import { corpus, getCreatureByIdAndLevel } from "../../data/corpus";
import type { TeamConfiguration } from "../../data/types";
import { GridRow, TimelineEventKind } from "../../data/enums";
import { Species } from "../../data/ids";

/**
 * T231 / WI-009-011. The three creatures round 11 deliberately left untagged.
 *
 * Their ability text grants a status they ALREADY apply ("+15 Shield" against an `appliesStatus` of
 * Shield 20), and the text alone cannot say whether that is one effect restated or two effects
 * stacking. Round 11 filed it as T226 rather than guess, because guessing wrong double-counts —
 * which is exactly how Bumblebolt's Shock doubled in round 10.
 *
 * The user settled it from play: **two effects**. The base is what cast 1 emits; the grant
 * accumulates from cast 2. These numbers are theirs, quoted verbatim in the ledger, and are asserted
 * here so the answer cannot be re-litigated by a future refactor.
 */
const solo = (creatureId: Species, windowSeconds: number): TeamConfiguration => ({
  placements: [{ slot: { row: GridRow.Top, col: 0 }, creatureId, level: 1 }],
  trainerId: null,
  trinketIds: [],
  itemIds: [],
  simulationWindowSeconds: windowSeconds,
  teamModifiers: [],
});

const grantsOf = (creatureId: Species, windowSeconds: number, type: string) =>
  simulate(solo(creatureId, windowSeconds), corpus)
    .timeline.filter((e) => e.kind === TimelineEventKind.OngoingChange && e.statusDelta?.type === type)
    .map((e) => e.statusDelta!.layerDelta);

const damageOf = (creatureId: Species, windowSeconds: number) =>
  simulate(solo(creatureId, windowSeconds), corpus)
    .timeline.filter((e) => e.kind === TimelineEventKind.Attack && e.damage !== undefined)
    .map((e) => e.damage);

describe("cascading on-cast grants (T231)", () => {
  it("Pebbler: 'grants 20 shield… 35 sheild… grants 50 shield, and so on'", () => {
    expect(grantsOf(Species.Pebbler, 21, "Shield")).toEqual([20, 35, 50, 65]);
  });

  it("Pyrokami: 'cast 1 deal 5 burn… cast 2 deals 15 burn… cast 3 deals 25 burn'", () => {
    expect(grantsOf(Species.Pyrokami, 17, "Burn")).toEqual([5, 15, 25, 35]);
  });

  it("Bonshell: shield 100, 180, 260 on a 7.0s cooldown", () => {
    expect(getCreatureByIdAndLevel(Species.Bonshell, 1)?.baseCooldownSeconds).toBe(7);
    expect(grantsOf(Species.Bonshell, 29, "Shield")).toEqual([100, 180, 260, 340]);
  });

  it("Bonshell's FIRST cast deals no damage, then 80, 160 — damage created from a null base", () => {
    // "First cast grants 100 shield, then updates its state to 80 damage and 180 shield for the
    // next cast." Bonshell's `baseDamage` is null, so this only works because an ability grant may
    // bring a damage effect into existence (FR-093). A user modifier still may not.
    expect(getCreatureByIdAndLevel(Species.Bonshell, 1)?.publishedCast?.damage ?? null).toBeNull();
    expect(damageOf(Species.Bonshell, 29)).toEqual([80, 160, 240]);
  });

  it("the base amount is NOT double-counted — cast 1 equals the published stat exactly", () => {
    // The failure mode this family was held back for: if the grant were treated as restating the
    // base, cast 1 would read 35 for Pebbler rather than 20.
    expect(grantsOf(Species.Pebbler, 6, "Shield")).toEqual([20]);
    expect(grantsOf(Species.Pyrokami, 5, "Burn")).toEqual([5]);
  });
});
