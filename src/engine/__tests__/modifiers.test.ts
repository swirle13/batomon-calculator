import { describe, expect, it } from "vitest";
import { applyModifiers, type ModifierAmounts } from "../modifiers";
import { simulate } from "../simulate";
import { corpus } from "../../data/corpus";
import type { TeamConfiguration } from "../../data/types";
import { DamageChannel, GridRow, ModifierStat, StatusEffectType } from "../../data/enums";

/**
 * FR-078 (amended 2026-10-07): a user modifier may CREATE an effect, not only scale one.
 *
 * The previous rule — "a modifier can only scale an effect the creature already has" — was
 * implemented separately in three places and each one silently discarded the user's input. These
 * tests pin the creating behaviour at the one shared helper they now all go through.
 *
 * The rule was unfounded in the game: trinkets and ally abilities routinely give a creature damage
 * or a status it did not previously have, and recording that board is the whole point of the
 * modifier panel.
 */

const NONE: ModifierAmounts = {
  damageFlatAdd: 0,
  multicastAdd: 0,
  healAmountAdd: 0,
  status: {
    [StatusEffectType.Burn]: 0,
    [StatusEffectType.Poison]: 0,
    [StatusEffectType.Shock]: 0,
    [StatusEffectType.Shield]: 0,
  },
};

/** Pebbler's real shape: no published damage and no damage type, but it does apply Shield. */
const pebbler = {
  damage: null,
  damageType: null,
  appliesStatus: [{ type: StatusEffectType.Shield, amount: 20 }],
  baseMulticast: 1,
  heal: null,
};

describe("applyModifiers — a modifier may create an effect", () => {
  it("gives damage to a creature with no published damage", () => {
    const out = applyModifiers(pebbler, { ...NONE, damageFlatAdd: 40 });
    // Previously `null`: the card and the engine both dropped this, which is what produced the
    // "Pebbler has no published damage, so a damage modifier has nothing to scale" warning.
    expect(out.damage).toBe(40);
  });

  it("types created damage as Direct, since a bare damage modifier is a plain hit", () => {
    const out = applyModifiers(pebbler, { ...NONE, damageFlatAdd: 40 });
    expect(out.damageType).toBe("Direct");
  });

  it("leaves an existing damage type alone rather than converting it to Direct", () => {
    // A +40 on a Burn-type attacker scales the burn; it does not bolt a direct hit on as well.
    const burner = { ...pebbler, damage: 10, damageType: DamageChannel.Burn as const };
    const out = applyModifiers(burner, { ...NONE, damageFlatAdd: 40 });
    expect(out.damage).toBe(50);
    expect(out.damageType).toBe("Burn");
  });

  it("applies a damage modifier to a non-Direct attacker", () => {
    // The engine gated this behind `damageType === DamageChannel.Direct`, so every Burn/Poison/Shock-type
    // attacker silently ignored a damage modifier.
    const poisoner = { ...pebbler, damage: 12, damageType: DamageChannel.Poison as const };
    expect(applyModifiers(poisoner, { ...NONE, damageFlatAdd: 8 }).damage).toBe(20);
  });

  it("applies a status the creature does not already apply", () => {
    const out = applyModifiers(pebbler, { ...NONE, status: { ...NONE.status, Burn: 15 } });
    expect(out.appliesStatus).toContainEqual({ type: StatusEffectType.Burn, amount: 15 });
  });

  it("keeps published statuses ahead of created ones so the card's lines do not reshuffle", () => {
    const out = applyModifiers(pebbler, { ...NONE, status: { ...NONE.status, Burn: 15 } });
    expect(out.appliesStatus.map((s) => s.type)).toEqual(["Shield", "Burn"]);
  });

  it("adds to a status the creature does publish", () => {
    const out = applyModifiers(pebbler, { ...NONE, status: { ...NONE.status, Shield: 5 } });
    expect(out.appliesStatus).toEqual([{ type: StatusEffectType.Shield, amount: 25 }]);
  });
});

describe("applyModifiers — null still means nothing is there", () => {
  it("reports no damage when there is neither a base value nor a modifier", () => {
    // This is the common path, not an edge case: 62 species have `baseDamage: null`, and the card
    // renders no damage line at all for them rather than a misleading "0".
    const out = applyModifiers(pebbler, NONE);
    expect(out.damage).toBeNull();
    expect(out.damageType).toBeNull();
  });

  it("does not invent a status entry for a modifier of zero", () => {
    expect(applyModifiers(pebbler, NONE).appliesStatus).toEqual([{ type: StatusEffectType.Shield, amount: 20 }]);
  });

  it("never drops multicast below 1, so a negative modifier cannot silence a creature", () => {
    expect(applyModifiers(pebbler, { ...NONE, multicastAdd: -5 }).multicast).toBe(1);
  });
});

/**
 * The helper above is shared, but the ENGINE had its own gates on top of it. These run the real
 * simulation so a regression in `simulate` cannot hide behind a passing unit test.
 */
describe("simulate — modifiers reach a creature that had nothing to scale", () => {
  function pebblerTeam(modifiers: TeamConfiguration["placements"][number]["modifiers"]): TeamConfiguration {
    return {
      placements: [{ slot: { row: GridRow.Front, col: 0 }, creatureId: "pebbler", level: 1, modifiers }],
      trainerId: null,
      trinketIds: [],
      itemIds: [],
      simulationWindowSeconds: 30,
    };
  }

  it("a damage modifier on damage-less Pebbler produces real damage in the timeline", () => {
    const total = (r: ReturnType<typeof simulate>) =>
      r.cumulativeSeries[r.cumulativeSeries.length - 1]?.totalDamage ?? 0;
    const before = simulate(pebblerTeam([]), corpus);
    const after = simulate(
      pebblerTeam([{ id: "m1", stat: ModifierStat.DamageFlatAdd, amount: 40, label: "trinket" }]),
      corpus,
    );
    expect(total(before)).toBe(0);
    // Pebbler casts every 5s across a 30s window, so the modifier has to show up repeatedly rather
    // than once. The engine previously gated this on `damageType === DamageChannel.Direct`, which Pebbler is
    // not, so the number stayed at 0 and the user saw their input do nothing.
    expect(total(after)).toBeGreaterThan(0);
  });

  it("a creature with no published cooldown still reports its modified per-cast output", () => {
    const passive = corpus.creatures.find((c) => c.baseCooldownSeconds === null);
    if (!passive) return;
    const config: TeamConfiguration = {
      placements: [
        {
          slot: { row: GridRow.Front, col: 0 },
          creatureId: passive.id,
          level: passive.level,
          modifiers: [{ id: "m1", stat: ModifierStat.DamageFlatAdd, amount: 25, label: "trinket" }],
        },
      ],
      trainerId: null,
      trinketIds: [],
      itemIds: [],
      simulationWindowSeconds: 30,
    };
    // It does not cast, so it deals nothing — but the modifier must still be REPORTED rather than
    // the creature being skipped outright, which is what `continue` used to do.
    const stats = Object.values(simulate(config, corpus).perCreatureEffectiveStats)[0];
    expect(stats?.cooldownSeconds).toBeNull();
    expect(stats?.output.damage).toBe(25);
  });
});
