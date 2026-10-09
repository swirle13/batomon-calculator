import { describe, expect, it } from "vitest";
import { corpus } from "../../data/corpus";
import { simulate } from "../simulate";
import { estimateSurvivability, MAX_SURVIVABILITY_FACTOR } from "../survivability";
import { scoreConfiguration, TIME_WEIGHT_HALF_LIFE_SECONDS, timeWeightedScore } from "../optimize";
import type { GridCol, TeamConfiguration } from "../../data/types";
import { GridRow, StatusEffectType, TimelineEventKind } from "../../data/enums";
import { Species } from "../../data/ids";

const WINDOW = 30;

function board(...creatureIds: Species[]): TeamConfiguration {
  return {
    placements: creatureIds.map((creatureId, i) => ({
      slot: { row: i < 3 ? GridRow.Top : GridRow.Bottom, col: (i % 3) as GridCol },
      creatureId,
      level: 1,
    })),
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: WINDOW,
  };
}

function estimate(config: TeamConfiguration) {
  return estimateSurvivability(config, corpus, simulate(config, corpus));
}

/**
 * 2026-10-08, user-reported: "Runerock is pointless when it comes to DPS, but DPS isn't the whole
 * picture, but as it stands, he is very devalued in the equation."
 *
 * These tests are about the SHAPE of the answer, not its magnitude. The magnitudes rest on two
 * assumptions about an opponent the engine does not simulate (see `survivability.ts`), so pinning
 * them to three decimal places would be pinning a guess. What must hold is that defence is counted
 * at all, that it is counted in the right direction, and that it cannot run away with the search.
 */
describe("survivability in the placement objective", () => {
  it("prices a pure shielder that contributes no damage at all", () => {
    // Bumblebolt supplies the damage the ratio is taken against; Runerock supplies the defence.
    const withShielder = estimate(board(Species.Bumblebolt, Species.Runerock));

    expect(withShielder.shieldPerSecond).toBeGreaterThan(0);
    expect(withShielder.factor).toBeGreaterThan(1);
    expect(estimate(board(Species.Bumblebolt)).factor).toBe(1);
  });

  it("leaves a board with no defence of any kind exactly where it was", () => {
    // The regression guard for every figure this feature did not intend to touch: with no shield,
    // heal or cleanse the factor is 1, so the score is the pre-2026-10-08 one to the last bit.
    const plain = board(Species.Bumblebolt);
    const result = simulate(plain, corpus);
    const survivability = estimateSurvivability(plain, corpus, result);

    expect(survivability.mitigationPerSecond).toBe(0);
    expect(survivability.factor).toBe(1);

    let unstretched = 0;
    for (const event of result.timeline) {
      if (event.damage === undefined) continue;
      unstretched += event.damage * Math.pow(0.5, event.tSeconds / TIME_WEIGHT_HALF_LIFE_SECONDS);
    }
    expect(timeWeightedScore(result, survivability)).toBe(unstretched);
  });

  it("cannot be won by defence alone — six shielders score nothing", () => {
    // The property that makes stretching the half-life safe where a bonus term is not. A board
    // with an enormous factor and no damage is still a board with no damage.
    const allDefence = board(
      Species.Runerock, Species.Runerock, Species.Runerock,
      Species.Runerock, Species.Runerock, Species.Runerock,
    );
    expect(scoreConfiguration(allDefence, corpus)).toBe(0);
    expect(scoreConfiguration(board(Species.Bumblebolt), corpus)).toBeGreaterThan(0);
  });

  it("caps the stretch rather than letting a lopsided board run away", () => {
    // Runerock x5 behind a single Bumblebolt: mitigation dwarfs the 3-damage-per-cast it is
    // measured against, which is exactly where the linear approximation stops being trustworthy.
    const lopsided = board(
      Species.Bumblebolt, Species.Runerock, Species.Runerock,
      Species.Runerock, Species.Runerock, Species.Runerock,
    );
    const s = estimate(lopsided);
    expect(s.mitigationPerSecond / s.assumedIncomingDps).toBeGreaterThan(MAX_SURVIVABILITY_FACTOR);
    expect(s.factor).toBe(MAX_SURVIVABILITY_FACTOR);
  });

  describe("healing", () => {
    it("reaches the timeline, which it never did before 2026-10-08", () => {
      // Thirteen species publish a `healAmount`; the battle used to discard every point of it, so
      // a healer was indistinguishable from a monster that did nothing.
      const result = simulate(board(Species.Dribblet), corpus);
      const heals = result.timeline.filter((e) => e.kind === TimelineEventKind.Heal);

      expect(heals.length).toBeGreaterThan(0);
      expect(result.healPerSecond).toBeGreaterThan(0);
    });

    it("is never mistaken for damage dealt", () => {
      // The reason `heal` is its own field. Four separate places sum `event.damage`, and a healer
      // silently inflating the DPS readout would be a far worse bug than not counting it at all.
      const result = simulate(board(Species.Dribblet), corpus);

      for (const event of result.timeline) {
        if (event.kind === TimelineEventKind.Heal) expect(event.damage).toBeUndefined();
      }
      expect(result.cumulativeSeries[result.cumulativeSeries.length - 1]!.totalDamage).toBe(0);
    });
  });

  describe("cleansing", () => {
    it("is worth nothing to a team whose own output implies no incoming debuffs", () => {
      /*
       * The mirror assumption's most important consequence, and the honest one: Beetbud deals
       * direct damage and applies no status at all, so the assumed opponent applies none either,
       * so there is nothing for Runerock to remove. Its shield still counts; its cleanse does not.
       *
       * Beetbud specifically, rather than the Bumblebolt the tests above use — Bumblebolt applies
       * 1 Shock per cast, which under the mirror is an opponent applying Shock back, so its board
       * correctly gives Runerock's cleanse something to do.
       */
      const s = estimate(board(Species.Beetbud, Species.Runerock));
      expect(s.cleansePerSecond).toBe(0);
      expect(s.shieldPerSecond).toBeGreaterThan(0);
    });

    it("is worth something beside a team that applies debuffs", () => {
      // Venopuff applies Poison, so the mirrored enemy does too, so removal has a target.
      const s = estimate(board(Species.Venopuff, Species.Runerock));
      expect(s.cleansePerSecond).toBeGreaterThan(0);
      expect(s.cleansers).toEqual(["Runerock"]);
    });

    it("is capped by the inflow — surplus removal is wasted, not banked", () => {
      /*
       * Runerock removes 15 stacks of every debuff every 8 seconds, which is far more headroom
       * than one Venopuff's Poison needs. A second Runerock therefore adds shield but no cleanse,
       * which is the difference between pricing a cleanser on what it CAN remove and on what is
       * actually there to remove.
       */
      const one = estimate(board(Species.Venopuff, Species.Runerock));
      const two = estimate(board(Species.Venopuff, Species.Runerock, Species.Runerock));

      expect(two.cleansePerSecond).toBe(one.cleansePerSecond);
      expect(two.shieldPerSecond).toBeGreaterThan(one.shieldPerSecond);
    });

    it("never removes more than the enemy is assumed to apply", () => {
      const config = board(Species.Venopuff, Species.Runerock);
      const result = simulate(config, corpus);
      const s = estimateSurvivability(config, corpus, result);

      const incomingStacks =
        result.perStatusAppliedPerSecond[StatusEffectType.Burn] +
        result.perStatusAppliedPerSecond[StatusEffectType.Poison] +
        result.perStatusAppliedPerSecond[StatusEffectType.Shock];
      // Each removed stack is priced at half the window; see DEBUFF_STACK_EHP_AS_WINDOW_FRACTION.
      expect(s.cleansePerSecond).toBeLessThanOrEqual(incomingStacks * (WINDOW / 2) + 1e-9);
    });
  });

  it("keeps the shielder the bench search used to discard (the reported board, reduced)", () => {
    /*
     * The regression this whole feature exists to prevent, as the smallest board that shows it.
     *
     * Scored on damage alone, swapping Runerock out for a second attacker is a straight gain and
     * the search took it every time. Scored with survivability, the attacker's extra damage has to
     * beat the half-life Runerock's shield buys for the Poison ramp already on the board — and on
     * the user's real team it no longer does.
     */
    const withShielder = board(Species.Venopuff, Species.Runerock);
    const withoutShielder = board(Species.Venopuff, Species.Bumblebolt);

    const shielderScore = scoreConfiguration(withShielder, corpus);
    const attackerScore = scoreConfiguration(withoutShielder, corpus);
    const shielderDps = simulate(withShielder, corpus);
    const attackerDps = simulate(withoutShielder, corpus);

    // Bumblebolt genuinely out-damages Runerock, which deals nothing...
    expect(
      Object.values(attackerDps.perCreatureDps).reduce((a, b) => a + b, 0),
    ).toBeGreaterThan(Object.values(shielderDps.perCreatureDps).reduce((a, b) => a + b, 0));
    // ...and Runerock still wins the slot, because Venopuff's Poison needs time to pay off.
    expect(shielderScore).toBeGreaterThan(attackerScore);
  });
});
