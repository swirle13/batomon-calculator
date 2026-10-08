import { describe, expect, it } from "vitest";
import { resolveEffects } from "../effects";
import { simulate } from "../simulate";
import { allCreatureRecords, corpus } from "../../data/corpus";
import type { TeamConfiguration } from "../../data/types";
import { GridRow, StatusEffectType } from "../../data/enums";
import { Species } from "../../data/ids";

/**
 * FR-073/FR-074 (WI-003, WI-004, WI-009). The user's own worked example is the acceptance
 * criterion — they supplied the arithmetic, so the test pins their numbers, not mine.
 */

/** The team from the user's screenshot. */
const USER_TEAM: TeamConfiguration = {
  placements: [
    { slot: { row: GridRow.Front, col: 1 }, creatureId: Species.Miasmaw, level: 1 },
    { slot: { row: GridRow.Front, col: 2 }, creatureId: Species.Cobrex, level: 1 },
    { slot: { row: GridRow.Back, col: 0 }, creatureId: Species.Drumire, level: 1 },
    { slot: { row: GridRow.Back, col: 1 }, creatureId: Species.Fumungus, level: 1 },
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
    const miasmaw = resolved.find((r) => r.creature.id === Species.Miasmaw);
    expect(miasmaw).toBeDefined();
    const poison = miasmaw!.appliesStatus.find((s) => s.type === "Poison");
    expect(poison?.amount).toBe(336);
  });

  it("leaves a creature with no relevant ability exactly at its base stats", () => {
    // The resolver must not perturb teams it has nothing to say about.
    const plain: TeamConfiguration = {
      ...USER_TEAM,
      placements: [{ slot: { row: GridRow.Back, col: 0 }, creatureId: Species.Bumblebolt, level: 1 }],
    };
    const resolved = resolveEffects(plain, corpus);
    expect(resolved[0]!.appliesStatus).toEqual([{ type: StatusEffectType.Shock, amount: 1 }]);
    expect(resolved[0]!.cooldownSeconds).toBe(2.5);
    expect(resolved[0]!.baseDamage).toBe(3);
  });

  it("excludes the creature itself from 'total Poison of your allies'", () => {
    // Decided in writing in T200: "ally" excludes self, matching simulate()'s existing self-skip.
    const soloMiasmaw: TeamConfiguration = {
      ...USER_TEAM,
      placements: [{ slot: { row: GridRow.Front, col: 1 }, creatureId: Species.Miasmaw, level: 1 }],
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
      (e) => e.statusDelta?.type === "Poison" && e.sourceSlot.row === GridRow.Front && e.sourceSlot.col === 2,
    );
    expect(firstCobrexCast).toBeDefined();
    expect(firstCobrexCast!.tSeconds).toBeLessThan(15);
    // Pinned exactly so the tie-break rule cannot drift silently -- see effects.ts for why.
    // 2026-10-06 (T213): was 9.1; now 8.957143. Drumire's "When a Toxic ally casts, give it +5%
    // Cooldown Speed for this battle" tag EXISTED in the corpus but was applied nowhere, which is
    // precisely what T213 was filed to fix. Now that ally casts grant it, Cobrex is charged by
    // Poison *and* sped up, so it arrives slightly earlier. The change is the feature working.
    expect(firstCobrexCast!.tSeconds).toBeCloseTo(8.957143, 5);
  });

  it("does not charge a creature from its own status applications", () => {
    const soloCobrex: TeamConfiguration = {
      ...USER_TEAM,
      placements: [{ slot: { row: GridRow.Front, col: 2 }, creatureId: Species.Cobrex, level: 1 }],
      simulationWindowSeconds: 40,
    };
    const result = simulate(soloCobrex, corpus);
    const casts = result.timeline.filter((e) => e.statusDelta?.type === "Poison");
    // Base cooldown 15s over 40s with no allies = casts at 15 and 30 only.
    expect(casts.map((c) => c.tSeconds)).toEqual([15, 30]);
  });
});

/**
 * 2026-10-06 round 9b (user-reported): effects must resolve at EVERY level, not just level 1.
 *
 * This is the third time this exact bug class has appeared — round 6 found Formiqueen's aura
 * vanishing at levels 2-4 (T140), and round 9 then shipped the same mistake by tagging only the
 * level-1 records of the creatures it added. Hence the corpus-wide guard below rather than three
 * more one-off fixes.
 */
describe("effects resolve at every level (round 9b)", () => {
  it("scales Miasmaw's grant with its level multiplier", () => {
    // L1 is "1x the total Poison of your allies"; L2 is "2x". Allies here total 326.
    const atLevel = (level: 1 | 2) =>
      resolveEffects(
        {
          ...USER_TEAM,
          placements: USER_TEAM.placements.map((p) =>
            p.creatureId === Species.Miasmaw ? { ...p, level } : p,
          ),
        },
        corpus,
      ).find((r) => r.creature.id === Species.Miasmaw)!;

    expect(atLevel(1).appliesStatus.find((s) => s.type === "Poison")?.amount).toBe(336);
    // L2's own base Poison is 10 as well, +2x326 = 662.
    const l2 = atLevel(2).appliesStatus.find((s) => s.type === "Poison")?.amount;
    expect(l2).toBeGreaterThan(336);
  });

  it("GUARD: if a species has ability tags at level 1, it has them at every level it exists at", () => {
    // The recurring failure: a creature's ability silently stops working when the user levels it.
    const byId = new Map<string, { level: number; hasTags: boolean }[]>();
    for (const c of allCreatureRecords()) {
      if (!byId.has(c.id)) byId.set(c.id, []);
      byId.get(c.id)!.push({ level: c.level, hasTags: c.abilityTags.length > 0 });
    }
    const offenders: string[] = [];
    for (const [id, levels] of byId) {
      const l1 = levels.find((l) => l.level === 1);
      if (!l1?.hasTags) continue;
      for (const lvl of levels) {
        if (!lvl.hasTags) offenders.push(`${id}@L${lvl.level}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
