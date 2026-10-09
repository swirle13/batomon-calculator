import { describe, expect, it } from "vitest";
import { itemRecipients, modifiersForUse } from "../itemEffects";
import { corpus, getItemById } from "../../data/corpus";
import { slotKey } from "../grid";
import type { CreatureRecord, GridSlot, ItemRecord, TeamPlacement } from "../../data/types";
import { CreatureType, GridRow, ItemTargetKind, ModifierStat, Rarity } from "../../data/enums";
import { ItemId, Species } from "../../data/ids";

/**
 * Using an item (tasks.md T046 / the 2026-10-08 "items are usable" amendment).
 *
 * The behaviour under test is only the RECIPIENT rule and the stat grant. Everything downstream —
 * accumulating onto a same-stat chip, resolving the modifier into a cast — is already covered by
 * `modifiers.test.ts` and the context tests, and routing items through `addPlacementModifier`
 * rather than a parallel effect path is the whole design point: there is one thing to test here
 * because there is one thing that is new.
 */

/** A board member in the shape the resolver reads. Only the fields the rules actually consult. */
function member(slot: GridSlot, creature: Partial<CreatureRecord> & { id: Species }) {
  return {
    slot,
    creature: {
      types: [],
      abilityText: "",
      ...creature,
    } as CreatureRecord,
  };
}

const BACK_0: GridSlot = { row: GridRow.Top, col: 0 };
const BACK_1: GridSlot = { row: GridRow.Top, col: 1 };
const FRONT_2: GridSlot = { row: GridRow.Bottom, col: 2 };

const keys = (slots: GridSlot[]) => slots.map(slotKey).sort();

describe("itemRecipients — team scope", () => {
  it("lands on every placed monster for an unfiltered team item (Feast)", () => {
    const board = [
      member(BACK_0, { id: Species.Bumblebolt }),
      member(BACK_1, { id: Species.Pebbler }),
      member(FRONT_2, { id: Species.Scorchimp }),
    ];
    const feast = getItemById(ItemId.Feast)!;
    expect(keys(itemRecipients(feast.effect!, board, []))).toEqual(keys([BACK_0, BACK_1, FRONT_2]));
  });

  it("narrows to the matching type (Battery Pack hits Electric and nobody else)", () => {
    const board = [
      member(BACK_0, { id: Species.Bumblebolt, types: [CreatureType.Electric] }),
      member(BACK_1, { id: Species.Pebbler, types: [CreatureType.Rock] }),
    ];
    const batteryPack = getItemById(ItemId.BatteryPack)!;
    expect(keys(itemRecipients(batteryPack.effect!, board, []))).toEqual([slotKey(BACK_0)]);
  });

  it("counts a PAINTED species as the filtered type", () => {
    // Painter makes a species every type, so a type-filtered item must see it — the same rule
    // `creatureHasType` enforces for every other type comparison in the app.
    const board = [member(BACK_0, { id: Species.Pebbler, types: [CreatureType.Rock] })];
    const batteryPack = getItemById(ItemId.BatteryPack)!;
    expect(itemRecipients(batteryPack.effect!, board, [], { paintedCreatureIds: [Species.Pebbler] })).toHaveLength(1);
  });

  it("restricts Focus Pill to monsters with no ability text", () => {
    const board = [
      member(BACK_0, { id: Species.Bumblebolt, abilityText: "On Cast: deal 10 damage." }),
      member(BACK_1, { id: Species.Pebbler, abilityText: "" }),
    ];
    const focusPill = getItemById(ItemId.FocusPill)!;
    expect(keys(itemRecipients(focusPill.effect!, board, []))).toEqual([slotKey(BACK_1)]);
  });
});

describe("itemRecipients — fixed slot", () => {
  it("lands on the bottom right monster only (Pom Berry)", () => {
    const board = [member(BACK_0, { id: Species.Bumblebolt }), member(FRONT_2, { id: Species.Pebbler })];
    const pomBerry = getItemById(ItemId.PomBerry)!;
    expect(keys(itemRecipients(pomBerry.effect!, board, []))).toEqual([slotKey(FRONT_2)]);
  });

  it("lands on nobody when that slot is empty, rather than falling back to someone else", () => {
    const board = [member(BACK_0, { id: Species.Bumblebolt })];
    const pomBerry = getItemById(ItemId.PomBerry)!;
    expect(itemRecipients(pomBerry.effect!, board, [])).toEqual([]);
  });
});

describe("itemRecipients — chosen", () => {
  const cake = () => getItemById(ItemId.Cake)!;

  it("lands on exactly the slots the user chose", () => {
    const board = [
      member(BACK_0, { id: Species.Bumblebolt }),
      member(BACK_1, { id: Species.Pebbler }),
      member(FRONT_2, { id: Species.Scorchimp }),
    ];
    expect(keys(itemRecipients(cake().effect!, board, [BACK_0, FRONT_2]))).toEqual(keys([BACK_0, FRONT_2]));
  });

  it("ignores a chosen slot that holds no monster", () => {
    const board = [member(BACK_0, { id: Species.Bumblebolt })];
    expect(keys(itemRecipients(cake().effect!, board, [BACK_0, BACK_1]))).toEqual([slotKey(BACK_0)]);
  });

  it("never grants to more monsters than the item names, even if more are chosen", () => {
    // The cap is the item's own published count. Enforcing it here as well as in the UI means a
    // stale selection cannot over-grant.
    const board = [
      member(BACK_0, { id: Species.Bumblebolt }),
      member(BACK_1, { id: Species.Pebbler }),
      member(FRONT_2, { id: Species.Scorchimp }),
    ];
    expect(itemRecipients(cake().effect!, board, [BACK_0, BACK_1, FRONT_2])).toHaveLength(2);
  });
});

describe("modifiersForUse", () => {
  it("grants the published amount, labelled with the item that granted it", () => {
    const feast = getItemById(ItemId.Feast)!;
    expect(modifiersForUse(feast)).toEqual([
      { stat: ModifierStat.DamageFlatAdd, amount: 5, label: "Feast" },
    ]);
  });

  it("keeps Cooldown Speed as the engine's fraction, not the published whole percent", () => {
    // Nana Berry publishes "+5% Cooldown Speed"; the engine stores 0.05. A 100x error here would
    // be invisible in every type check and obvious only in the output.
    const nanaBerry = getItemById(ItemId.NanaBerry)!;
    expect(modifiersForUse(nanaBerry)).toEqual([
      { stat: ModifierStat.CooldownSpeedAdd, amount: 0.05, label: "Nana Berry" },
    ]);
  });
});

describe("which items this engine models", () => {
  it("models 11 of the 40, and the picker is responsible for saying so", () => {
    // The count is pinned so that hand-authoring an effect for a 12th item is a deliberate edit
    // here rather than a silent change in what the calculator claims to simulate.
    const modelled = corpus.items.filter((item) => (item.effect?.stats.length ?? 0) > 0);
    expect(modelled).toHaveLength(11);
    // A reroll is a real item and an unmodelled one: `ItemPicker` disables its card rather than
    // offering a click that would appear to work and change nothing.
    expect(modelled.map((i) => i.id)).not.toContain(ItemId.FakeCoin);
    expect(modelled.map((i) => i.id)).toContain(ItemId.Feast);
  });
});

/**
 * Corpus integrity. These are the assertions that would have caught the two real traps in this
 * extraction — the RSC `$`-reference rarities and the 100x Cooldown Speed unit.
 */
describe("the item corpus", () => {
  it("holds all 40 published items, each rarity-tagged and sprited", () => {
    expect(corpus.items).toHaveLength(40);
    for (const item of corpus.items) {
      expect(item.rarity, item.name).toBeDefined();
      expect(item.spriteFile, item.name).toBeDefined();
    }
  });

  it("covers every rarity tier", () => {
    const tiers = new Set(corpus.items.map((i) => i.rarity));
    expect(tiers).toEqual(
      new Set([Rarity.Common, Rarity.Uncommon, Rarity.Rare, Rarity.SuperRare, Rarity.Legendary, Rarity.Mythical]),
    );
  });

  it("declares an ItemId for exactly the ids in the corpus", () => {
    // `ids.ts` is generated from the corpus, so a hand-edit to either is a drift this catches.
    expect(new Set(Object.values(ItemId))).toEqual(new Set(corpus.items.map((i) => i.id)));
  });

  it("stores every Cooldown Speed grant as a fraction below 1", () => {
    for (const item of corpus.items) {
      for (const grant of item.effect?.stats ?? []) {
        if (grant.stat !== ModifierStat.CooldownSpeedAdd) continue;
        expect(Math.abs(grant.amount), item.name).toBeLessThan(1);
      }
    }
  });

  it("names a real board slot for every fixed-slot item", () => {
    for (const item of corpus.items) {
      const target = item.effect?.target;
      if (target?.kind !== ItemTargetKind.FixedSlot) continue;
      expect([GridRow.Top, GridRow.Bottom], item.name).toContain(target.slot.row);
      expect([0, 1, 2], item.name).toContain(target.slot.col);
    }
  });
});

/** The unused-import guard: `ItemRecord`/`TeamPlacement` are referenced only in type positions. */
export type _Used = [ItemRecord, TeamPlacement];
