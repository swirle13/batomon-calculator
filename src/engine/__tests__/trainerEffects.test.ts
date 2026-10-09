import { describe, expect, it } from "vitest";
import { simulate } from "../simulate";
import { trainerModifiersFor } from "../trainerEffects";
import { corpus, getCreatureByIdAndLevel } from "../../data/corpus";
import type { TeamConfiguration } from "../../data/types";
import { GridRow, ModifierStat, StatusEffectType } from "../../data/enums";
import { Species, TrainerId } from "../../data/ids";
import { placementKey } from "../grid";

/**
 * Chef (2026-10-08, user-reported: "Chef trainer's ability doesn't actually apply to any mons").
 * The ability was card text with no code behind it; these pin both halves of it.
 */
const PEBBLER_SLOT = { row: GridRow.Bottom, col: 0 } as const; // Rock — single-typed
const BUMBLEBOLT_SLOT = { row: GridRow.Bottom, col: 1 } as const; // Bug/Electric — dual, not Fire

function team(trainerId: TrainerId | null): TeamConfiguration {
  return {
    placements: [
      { slot: PEBBLER_SLOT, creatureId: Species.Pebbler, level: 1 },
      { slot: BUMBLEBOLT_SLOT, creatureId: Species.Bumblebolt, level: 1 },
    ],
    trainerId,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: 20,
    teamModifiers: [],
  };
}

function burnOf(result: ReturnType<typeof simulate>, creatureId: Species, slot: { row: GridRow; col: 0 | 1 | 2 }) {
  const stats = result.perCreatureEffectiveStats[placementKey(creatureId, slot)];
  return stats?.output.appliesStatus.find((s) => s.type === StatusEffectType.Burn)?.amount ?? 0;
}

describe("trainerModifiersFor — Chef", () => {
  it("gives +2 Burn to a monster its own Fire grant created", () => {
    // Pebbler is Rock. Chef makes it Fire, and "your Fire monsters have +2 Burn" then includes it
    // — the two clauses are one ability, and resolving them independently is the bug this avoids.
    const pebbler = getCreatureByIdAndLevel(Species.Pebbler, 1)!;
    expect(trainerModifiersFor(pebbler, { trainerId: TrainerId.Chef })).toEqual([
      expect.objectContaining({ stat: ModifierStat.BurnAmountAdd, amount: 2 }),
    ]);
  });

  it("gives nothing to a dual-typed monster that is not Fire, and nothing under another trainer", () => {
    const bumblebolt = getCreatureByIdAndLevel(Species.Bumblebolt, 1)!;
    expect(trainerModifiersFor(bumblebolt, { trainerId: TrainerId.Chef })).toEqual([]);
    const pebbler = getCreatureByIdAndLevel(Species.Pebbler, 1)!;
    expect(trainerModifiersFor(pebbler, { trainerId: TrainerId.Painter })).toEqual([]);
    expect(trainerModifiersFor(pebbler, { trainerId: null })).toEqual([]);
  });

  it("reaches the simulation, not just the card", () => {
    // The whole complaint was that the ability changed no number anywhere, so this asserts
    // through `simulate` rather than against the helper it calls.
    const without = simulate(team(null), corpus);
    const withChef = simulate(team(TrainerId.Chef), corpus);

    expect(burnOf(withChef, Species.Pebbler, PEBBLER_SLOT)).toBe(
      burnOf(without, Species.Pebbler, PEBBLER_SLOT) + 2,
    );
    expect(burnOf(withChef, Species.Bumblebolt, BUMBLEBOLT_SLOT)).toBe(
      burnOf(without, Species.Bumblebolt, BUMBLEBOLT_SLOT),
    );
  });

  it("burns in the BATTLE, not only on the card, when the monster publishes no Burn of its own", () => {
    // Pebbler applies Shield and nothing else, so Chef's +2 Burn is create-from-nothing. The test
    // above passes on `perCreatureEffectiveStats`, which goes through `applyModifiers` and
    // therefore always created it — the cast loop did not, so the Burn existed on the chip and the
    // card and nowhere in the simulation.
    expect(
      (getCreatureByIdAndLevel(Species.Pebbler, 1)!.appliesStatus ?? []).map((s) => s.type),
    ).not.toContain(StatusEffectType.Burn);

    const without = simulate(team(null), corpus);
    const withChef = simulate(team(TrainerId.Chef), corpus);

    expect(without.perStatusPerSecond.Burn).toBe(0);
    expect(withChef.perStatusPerSecond.Burn).toBeGreaterThan(0);
    expect(withChef.perStatusAppliedPerSecond.Burn).toBeGreaterThan(0);
    // And it is credited to Pebbler, which is the "— in the Facilitated DPS column" the user saw.
    expect(
      withChef.perCreatureFacilitatedDps[placementKey(Species.Pebbler, PEBBLER_SLOT)] ?? 0,
    ).toBeGreaterThan(0);
  });
});
