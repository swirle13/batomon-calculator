import { describe, expect, it } from "vitest";
import { abilityNeedsModelling } from "../display";
import { getCreatureByIdAndLevel } from "../corpus";
import { Species } from "../ids";

const needs = (id: Species) => abilityNeedsModelling(getCreatureByIdAndLevel(id, 1)!);

/**
 * `abilityNeedsModelling` is the denominator of "these abilities are not counted in this
 * calculation", which the user reads directly beside a DPS figure. A false entry there says a
 * correct number is untrustworthy, which is the failure mode these pin.
 */
describe("abilityNeedsModelling — text that announces progression", () => {
  it("excludes every phrasing the corpus uses, not just 'Evolves at level N.'", () => {
    expect(needs(Species.Dribblet)).toBe(false); // "Evolves at level 3."
    expect(needs(Species.Ignit)).toBe(false); // "Evolve." on On Victory
    expect(needs(Species.Beetdown)).toBe(false); // "Evolution result of Beetbud at level 3."
  });

  it("still counts an ability that merely MENTIONS evolving", () => {
    // Rigalord: "At the start of the next day, devour the ally in front and evolve into Rigalord."
    // The devouring is a real board change the engine does not model, so hiding it would turn a
    // coverage fix into a coverage lie. This is why the progression test is anchored.
    expect(needs(Species.Rigalord)).toBe(true);
  });
});

describe("abilityNeedsModelling — text that restates the stat line", () => {
  it("excludes a restatement whatever order the three facts come in", () => {
    // Scorchimp: damage, then status, then cooldown, plus a trailing evolution sentence.
    expect(needs(Species.Scorchimp)).toBe(false);
    // Bumblebolt: damage, then cooldown, then status, plus a quoted marketing aside.
    expect(needs(Species.Bumblebolt)).toBe(false);
  });

  it("counts a sentence whose numbers the stat line does NOT carry", () => {
    // The claims are only removed when they match the record, so an ability that states a figure
    // the engine has no value for survives as a genuine gap.
    expect(
      abilityNeedsModelling({
        abilityText: "Deals 40 direct damage every 2 seconds.",
        publishedCast: { damage: 5 },
        baseCooldownSeconds: 2,
      }),
    ).toBe(true);
  });

  it("counts a sentence that restates the stats AND then adds something", () => {
    expect(
      abilityNeedsModelling({
        abilityText: "Deals 5 direct damage and applies 5 Burn to all adjacent allies.",
        publishedCast: { damage: 5 },
        appliesStatus: [{ type: "Burn", amount: 5 }],
        baseCooldownSeconds: 5.5,
      }),
    ).toBe(true);
  });
});
