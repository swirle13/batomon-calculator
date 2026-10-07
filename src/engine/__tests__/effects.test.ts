import { describe, expect, it } from "vitest";
import { resolveEffects } from "../effects";
import { simulate } from "../simulate";
import { corpus } from "../../data/corpus";
import type { TeamConfiguration } from "../../data/types";

/**
 * FR-073/FR-074 (WI-003, WI-004, WI-009). The user's own worked example is the acceptance
 * criterion — they supplied the arithmetic, so the test pins their numbers, not mine.
 */

/** The team from the user's screenshot. */
const USER_TEAM: TeamConfiguration = {
  placements: [
    { slot: { row: "front", col: 1 }, creatureId: "miasmaw", level: 1 },
    { slot: { row: "front", col: 2 }, creatureId: "cobrex", level: 1 },
    { slot: { row: "back", col: 0 }, creatureId: "drumire", level: 1 },
    { slot: { row: "back", col: 1 }, creatureId: "fumungus", level: 1 },
  ],
  trainerId: null,
  trinketIds: [],
  itemIds: [],
  simulationWindowSeconds: 20,
  teamModifiers: [],
};

describe("effect resolution (FR-073)", () => {
  it("resolves Miasmaw's on-battle-start grant to Poison 336 (the user's arithmetic)", () => {
    // "Gain Poison for this battle equal to 1x the total Poison of your allies.
    //  (Except other Miasmaw)" -- allies 6 + 20 + 300 = 326, plus its own 10 = 336.
    const resolved = resolveEffects(USER_TEAM, corpus);
    const miasmaw = resolved.find((r) => r.creature.id === "miasmaw");
    expect(miasmaw).toBeDefined();
    const poison = miasmaw!.appliesStatus.find((s) => s.type === "Poison");
    expect(poison?.amount).toBe(336);
  });

  it("leaves a creature with no relevant ability exactly at its base stats", () => {
    // The resolver must not perturb teams it has nothing to say about.
    const plain: TeamConfiguration = {
      ...USER_TEAM,
      placements: [{ slot: { row: "back", col: 0 }, creatureId: "bumblebolt", level: 1 }],
    };
    const resolved = resolveEffects(plain, corpus);
    expect(resolved[0]!.appliesStatus).toEqual([{ type: "Shock", amount: 1 }]);
    expect(resolved[0]!.cooldownSeconds).toBe(2.5);
    expect(resolved[0]!.baseDamage).toBe(3);
  });

  it("excludes the creature itself from 'total Poison of your allies'", () => {
    // Decided in writing in T200: "ally" excludes self, matching simulate()'s existing self-skip.
    const soloMiasmaw: TeamConfiguration = {
      ...USER_TEAM,
      placements: [{ slot: { row: "front", col: 1 }, creatureId: "miasmaw", level: 1 }],
    };
    const resolved = resolveEffects(soloMiasmaw, corpus);
    // No allies -> gains nothing -> stays at its base 10.
    expect(resolved[0]!.appliesStatus.find((s) => s.type === "Poison")?.amount).toBe(10);
  });
});

describe("charge mechanic (FR-073 / WI-009)", () => {
  it("fires Cobrex far earlier than its 15s base cooldown, charged by allied Poison", () => {
    // "Whenever an ally inflicts Poison, Charge this by 1 second(s)."
    // Allies apply Poison at t = 3, 3, 6, 6, 8, 9, 9, 12, 12 -- 9 applications strictly before
    // t=15. Unmodelled, Cobrex's first cast is at t=15; modelled it must be far earlier.
    const result = simulate(USER_TEAM, corpus);
    // Matched by SLOT, not by amount: Miasmaw now applies 336 once resolved, so an
    // amount-based finder would match Miasmaw's cast instead of Cobrex's.
    const firstCobrexCast = result.timeline.find(
      (e) => e.statusDelta?.type === "Poison" && e.sourceSlot.row === "front" && e.sourceSlot.col === 2,
    );
    expect(firstCobrexCast).toBeDefined();
    expect(firstCobrexCast!.tSeconds).toBeLessThan(15);
    // Pinned exactly so the tie-break rule cannot drift silently -- see effects.ts for why.
    expect(firstCobrexCast!.tSeconds).toBeCloseTo(9.1, 5);
  });

  it("does not charge a creature from its own status applications", () => {
    const soloCobrex: TeamConfiguration = {
      ...USER_TEAM,
      placements: [{ slot: { row: "front", col: 2 }, creatureId: "cobrex", level: 1 }],
      simulationWindowSeconds: 40,
    };
    const result = simulate(soloCobrex, corpus);
    const casts = result.timeline.filter((e) => e.statusDelta?.type === "Poison");
    // Base cooldown 15s over 40s with no allies = casts at 15 and 30 only.
    expect(casts.map((c) => c.tSeconds)).toEqual([15, 30]);
  });
});
