import { describe, expect, it } from "vitest";
import { allCreatureRecords, getCreatureByIdAndLevel } from "../corpus";
import { TRIGGER_DEFINITIONS, manualTriggersFor, modifiersForPress } from "../triggers";
import { isResolvableTag } from "../../engine/effects";
import { recipientsOfPress } from "../../engine/manualTriggers";
import type { CreatureRecord, GridSlot } from "../types";
import { AbilityTrigger, GridRow, ModifierStat, Rarity, TargetKind } from "../enums";
import { Species } from "../ids";

describe("manual trigger framework", () => {
  it("Craghorn offers its item trigger with the right per-level amounts", () => {
    // "When you use an item, this gains +20 Damage and Shield" — ONE amount covering both stats,
    // scaling 20/40/60/120 by level.
    const expected = { 1: 20, 2: 40, 3: 60, 4: 120 };
    for (const [level, amount] of Object.entries(expected)) {
      const c = getCreatureByIdAndLevel(Species.Craghorn, Number(level))!;
      const [trigger] = manualTriggersFor(c);
      expect(trigger, `craghorn L${level}`).toBeDefined();
      expect(trigger!.trigger).toBe("On Item Used");
      expect(trigger!.effects).toEqual([
        { stat: ModifierStat.DamageFlatAdd, amount },
        { stat: ModifierStat.ShieldAmountAdd, amount },
      ]);
    }
  });

  it("gives Craghorn an abilityTrigger, which it previously lacked entirely", () => {
    // batodex's own `trigger` field is null for it, so the value had to come from the text. Its
    // absence is why the creature showed no trigger at all.
    const c = getCreatureByIdAndLevel(Species.Craghorn, 1)!;
    expect(c.abilityTrigger).toBe("On Item Used");
  });

  it("GUARD: no creature has BOTH a manual button and an engine-resolved tag", () => {
    // The double-count hazard: if the engine already applies the effect, a button would let the
    // user bank it again. This is the assertion that keeps the two mechanisms disjoint.
    const offenders: string[] = [];
    for (const c of allCreatureRecords()) {
      if (manualTriggersFor(c).length === 0) continue;
      if (c.abilityTags.some(isResolvableTag)) offenders.push(`${c.id} L${c.level}`);
    }
    expect(offenders).toEqual([]);
  });

  it("GUARD: no manual trigger uses a trigger the engine propagates", () => {
    // The same hazard stated at the trigger level rather than the creature level.
    for (const c of allCreatureRecords()) {
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
      AbilityTrigger.Ongoing, AbilityTrigger.OnCast, AbilityTrigger.OnBattleStart, AbilityTrigger.OnBought, AbilityTrigger.OnVictory,
      AbilityTrigger.OnKnockedOut, AbilityTrigger.OnKnockout, AbilityTrigger.OnTrinketGained, AbilityTrigger.OnItemUsed, AbilityTrigger.OnBattleLost,
    ];
    for (const t of triggers) {
      expect(TRIGGER_DEFINITIONS[t], `no definition for ${t}`).toBeDefined();
      expect(TRIGGER_DEFINITIONS[t].actionLabel.length).toBeGreaterThan(0);
    }
  });

  it("a press yields modifiers with no id, for the caller to accumulate", () => {
    const c = getCreatureByIdAndLevel(Species.Craghorn, 1)!;
    const press = modifiersForPress(manualTriggersFor(c)[0]!);
    expect(press).toEqual([
      { stat: ModifierStat.DamageFlatAdd, amount: 20 },
      { stat: ModifierStat.ShieldAmountAdd, amount: 20 },
    ]);
    for (const m of press) expect("id" in m).toBe(false);
  });

  it("covers the creatures whose triggers the engine cannot fire", () => {
    const withButtons = new Set(
      allCreatureRecords().filter((c) => manualTriggersFor(c).length > 0).map((c) => c.id),
    );
    for (const id of [
      Species.Craghorn, Species.Guardiant, Species.Dollhime, Species.Ratacomb,
      Species.Cawnushi, Species.Emburn, Species.Vipair,
    ]) {
      expect(withButtons.has(id), `${id} has no manual trigger`).toBe(true);
    }
  });

  it("the overwhelming majority of creatures offer nothing, and render nothing", () => {
    const withButtons = allCreatureRecords().filter((c) => manualTriggersFor(c).length > 0);
    expect(withButtons.length).toBeGreaterThan(0);
    expect(withButtons.length).toBeLessThan(allCreatureRecords().length / 2);
    expect(manualTriggersFor(getCreatureByIdAndLevel(Species.Bumblebolt, 1)!)).toEqual([]);
  });
});

/**
 * Who a press lands on (2026-10-07, user-reported).
 *
 * Two of the nine species grant to allies, and the tag had no field for a recipient — so a press
 * banked the bonus on the presser and silently skipped the allies the ability text names.
 */
describe("manual trigger recipients", () => {
  const lv1 = (id: Species) => allCreatureRecords().find((c) => c.id === id, 1)!;

  const SLOTS: GridSlot[] = [
    { row: GridRow.Back, col: 0 },
    { row: GridRow.Back, col: 1 },
    { row: GridRow.Back, col: 2 },
    { row: GridRow.Front, col: 0 },
    { row: GridRow.Front, col: 1 },
    { row: GridRow.Front, col: 2 },
  ];

  /** A full board in the shape the selectors read, `source` first. */
  function board(ids: Species[]) {
    const members = ids.map((id, i) => ({
      slot: SLOTS[i]!,
      key: `${id}@${i}`,
      creature: lv1(id) as CreatureRecord,
    }));
    return { source: members[0]!, members };
  }

  it("Brawlmantis reaches itself and the Common allies, at every level", () => {
    for (const level of [1, 2, 3, 4]) {
      const c = getCreatureByIdAndLevel(Species.Brawlmantis, level)!;
      const [trigger] = manualTriggersFor(c);
      expect(trigger!.target, `brawlmantis L${level}`).toEqual({ kind: TargetKind.AllAllies, rarityFilter: Rarity.Common });
      expect(trigger!.includeSelf).toBe(true);
    }

    // The user's board: Pebbler and Venopuff are Common; Pyronade and Craghorn are Uncommon and
    // Shikitsune is Rare.
    const { source, members } = board([
      Species.Brawlmantis, Species.Pebbler, Species.Venopuff, Species.Pyronade, Species.Craghorn, Species.Shikitsune,
    ]);
    const got = recipientsOfPress(manualTriggersFor(source.creature)[0]!, source, members);
    expect(got.map((m) => m.creature.id).sort()).toEqual(["brawlmantis", "pebbler", "venopuff"]);
  });

  it("Kickrane reaches the whole board, Common or not", () => {
    const { source, members } = board([Species.Kickrane, Species.Pebbler, Species.Pyronade, Species.Shikitsune]);
    const got = recipientsOfPress(manualTriggersFor(source.creature)[0]!, source, members);
    expect(got.length).toBe(members.length);
  });

  it("a trigger with no target stays on the creature itself", () => {
    // The default seven rely on this. Craghorn's item bonus is its own, however many allies it has.
    const { source, members } = board([Species.Craghorn, Species.Pebbler, Species.Venopuff, Species.Kickrane]);
    const got = recipientsOfPress(manualTriggersFor(source.creature)[0]!, source, members);
    expect(got.map((m) => m.creature.id)).toEqual(["craghorn"]);
  });

  it("banks on the presser exactly once, never twice", () => {
    // `includeSelf` prepends the source and the selector may also return it; a duplicate would
    // double the amount for the one creature the user is looking at.
    const { source, members } = board([Species.Kickrane, Species.Pebbler]);
    const got = recipientsOfPress(manualTriggersFor(source.creature)[0]!, source, members);
    expect(got.filter((m) => m.key === source.key).length).toBe(1);
  });

  it("GUARD: every ally-granting trigger is reachable, i.e. names the presser too", () => {
    // Every "This and ... allies" ability in the corpus includes the presser. An ally-only trigger
    // is legal in the schema but none exists yet, so this states the corpus fact rather than a rule.
    for (const c of allCreatureRecords()) {
      for (const t of manualTriggersFor(c)) {
        if (t.target.kind === TargetKind.Self) continue;
        expect(t.includeSelf, `${c.id} L${c.level} targets allies but excludes itself`).toBe(true);
      }
    }
  });

  it("GUARD: a trigger targets allies exactly when its ability text says allies GAIN", () => {
    /*
     * The original defect was the data and the button disagreeing silently, so this compares them
     * directly and a newly tagged creature cannot repeat it.
     *
     * The predicate is "allies gain", not "allies": Emburn's "On Knockout of this or an ally, this
     * gains +3 Burn permanently" mentions an ally as the TRIGGER and grants to itself. Who gains is
     * the only thing a target selector decides.
     */
    for (const c of allCreatureRecords()) {
      for (const t of manualTriggersFor(c)) {
        expect(
          t.target.kind !== TargetKind.Self,
          `${c.id} L${c.level}: "${c.abilityText}" vs target ${JSON.stringify(t.target)}`,
        ).toBe(/allies gain/i.test(c.abilityText));
      }
    }
  });
});
