import { describe, expect, it } from "vitest";
import { corpus } from "../corpus";
import { TRIGGER_DEFINITIONS, manualTriggersFor, modifiersForPress } from "../triggers";
import { isResolvableTag } from "../../engine/effects";
import type { AbilityTrigger } from "../types";

describe("manual trigger framework", () => {
  it("Craghorn offers its item trigger with the right per-level amounts", () => {
    // "When you use an item, this gains +20 Damage and Shield" — ONE amount covering both stats,
    // scaling 20/40/60/120 by level.
    const expected = { 1: 20, 2: 40, 3: 60, 4: 120 };
    for (const [level, amount] of Object.entries(expected)) {
      const c = corpus.creatures.find((x) => x.id === "craghorn" && x.level === Number(level))!;
      const [trigger] = manualTriggersFor(c);
      expect(trigger, `craghorn L${level}`).toBeDefined();
      expect(trigger!.trigger).toBe("On Item Used");
      expect(trigger!.effects).toEqual([
        { stat: "damageFlatAdd", amount },
        { stat: "shieldAmountAdd", amount },
      ]);
    }
  });

  it("gives Craghorn an abilityTrigger, which it previously lacked entirely", () => {
    // batodex's own `trigger` field is null for it, so the value had to come from the text. Its
    // absence is why the creature showed no trigger at all.
    const c = corpus.creatures.find((x) => x.id === "craghorn" && x.level === 1)!;
    expect(c.abilityTrigger).toBe("On Item Used");
  });

  it("GUARD: no creature has BOTH a manual button and an engine-resolved tag", () => {
    // The double-count hazard: if the engine already applies the effect, a button would let the
    // user bank it again. This is the assertion that keeps the two mechanisms disjoint.
    const offenders: string[] = [];
    for (const c of corpus.creatures) {
      if (manualTriggersFor(c).length === 0) continue;
      if (c.abilityTags.some(isResolvableTag)) offenders.push(`${c.id} L${c.level}`);
    }
    expect(offenders).toEqual([]);
  });

  it("GUARD: no manual trigger uses a trigger the engine propagates", () => {
    // The same hazard stated at the trigger level rather than the creature level.
    for (const c of corpus.creatures) {
      for (const t of manualTriggersFor(c)) {
        expect(
          t.definition.enginePropagated,
          `${c.id} offers a button for ${t.trigger}, which the engine already fires`,
        ).toBe(false);
      }
    }
  });

  it("every AbilityTrigger value has a registry entry", () => {
    // Adding a trigger to the union without describing it here would render a blank button.
    const triggers: AbilityTrigger[] = [
      "Ongoing", "On Cast", "On Battle Start", "On Bought", "On Victory",
      "On Knocked Out", "On Knockout", "On Trinket Gained", "On Item Used", "On Battle Lost",
    ];
    for (const t of triggers) {
      expect(TRIGGER_DEFINITIONS[t], `no definition for ${t}`).toBeDefined();
      expect(TRIGGER_DEFINITIONS[t].actionLabel.length).toBeGreaterThan(0);
    }
  });

  it("a press yields modifiers with no id, for the caller to accumulate", () => {
    const c = corpus.creatures.find((x) => x.id === "craghorn" && x.level === 1)!;
    const press = modifiersForPress(manualTriggersFor(c)[0]!);
    expect(press).toEqual([
      { stat: "damageFlatAdd", amount: 20 },
      { stat: "shieldAmountAdd", amount: 20 },
    ]);
    for (const m of press) expect("id" in m).toBe(false);
  });

  it("covers the creatures whose triggers the engine cannot fire", () => {
    const withButtons = new Set(
      corpus.creatures.filter((c) => manualTriggersFor(c).length > 0).map((c) => c.id),
    );
    for (const id of ["craghorn", "guardiant", "dollhime", "ratacomb", "cawnushi", "emburn", "vipair"]) {
      expect(withButtons.has(id), `${id} has no manual trigger`).toBe(true);
    }
  });

  it("the overwhelming majority of creatures offer nothing, and render nothing", () => {
    const withButtons = corpus.creatures.filter((c) => manualTriggersFor(c).length > 0);
    expect(withButtons.length).toBeGreaterThan(0);
    expect(withButtons.length).toBeLessThan(corpus.creatures.length / 2);
    expect(manualTriggersFor(corpus.creatures.find((c) => c.id === "bumblebolt")!)).toEqual([]);
  });
});
