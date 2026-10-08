import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ItemPicker } from "../GridPicker/ItemPicker";
import { ModifierEditor } from "../Modifiers/ModifierEditor";
import { TeamConfigProvider } from "../../context/TeamConfigContext";
import type { TeamConfiguration } from "../../data/types";
import { CreatureType, GridRow } from "../../data/enums";
import { Species } from "../../data/ids";
import { corpus } from "../../data/corpus";

/**
 * Using an item (T046).
 *
 * These assert the ONE behaviour that is new and would otherwise be verified only by eye: that
 * pressing Use lands a modifier on the right monsters and spends the item. The recipient rules
 * themselves are unit-tested in `engine/__tests__/itemEffects.test.ts`; this is the wiring.
 *
 * `ModifierEditor` is rendered alongside, because "the bonus shows up under Modifiers" is the
 * actual user-facing claim the design makes, and asserting it through the real panel is the only
 * way that claim is tested rather than assumed.
 */

function configWith(species: Species[]): TeamConfiguration {
  return {
    placements: species.map((creatureId, i) => ({
      slot: { row: i < 3 ? GridRow.Back : GridRow.Front, col: (i % 3) as 0 | 1 | 2 },
      creatureId,
      level: 1,
    })),
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: 30,
    teamModifiers: [],
  };
}

function open(config: TeamConfiguration) {
  const view = render(
    <TeamConfigProvider initialConfig={config}>
      <ItemPicker />
      <ModifierEditor />
    </TeamConfigProvider>,
  );
  fireEvent.click(screen.getByText("Items").closest("button")!);
  return view;
}

/** The bag card for `name`, found by the Use button's accessible name. */
function bagCard(name: string): HTMLElement {
  return screen.getByLabelText(`Use ${name}`).closest("div")!.parentElement!;
}

function addAndUse(itemName: string) {
  fireEvent.click(screen.getByLabelText(`Add ${itemName}`));
  fireEvent.click(screen.getByLabelText(`Use ${itemName}`));
}

describe("the Items panel", () => {
  it("counts what is held, not what has been used", () => {
    open(configWith([Species.Bumblebolt]));
    expect(screen.getByText("none held")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Add Feast"));
    expect(screen.getByText("1 held")).toBeTruthy();
  });
});

describe("using a team item", () => {
  it("banks the bonus on every placed monster and spends the item", () => {
    open(configWith([Species.Bumblebolt, Species.Pebbler]));
    addAndUse("Feast");

    // Spent: the bag is empty again, and the panel says so.
    expect(screen.getByText("none held")).toBeTruthy();
    expect(screen.queryByLabelText("Use Feast")).toBeNull();

    // Banked: one modifier per placed monster, visible in the Modifiers panel.
    expect(screen.getByText("2 active")).toBeTruthy();
  });

  it("says who it will reach before it is pressed", () => {
    open(configWith([Species.Bumblebolt, Species.Pebbler]));
    fireEvent.click(screen.getByLabelText("Add Feast"));
    expect(within(bagCard("Feast")).getByText(/\+5 Damage to 2 monsters\./)).toBeTruthy();
  });

  it("refuses an item no monster on the board matches, and says why", () => {
    // Battery Pack is "your Electric monsters"; Pebbler is Rock. A Use button that applied nothing
    // would look identical to one that worked.
    const pebbler = corpus.creatures.find((c) => c.id === Species.Pebbler)!;
    expect(pebbler.types).not.toContain(CreatureType.Electric);

    open(configWith([Species.Pebbler]));
    fireEvent.click(screen.getByLabelText("Add Battery Pack"));
    expect(screen.getByLabelText("Use Battery Pack")).toHaveProperty("disabled", true);
    expect(within(bagCard("Battery Pack")).getByText(/No monster on your board matches/)).toBeTruthy();
  });
});

describe("using a chosen-target item", () => {
  it("asks who got it, and refuses to apply until the published count is picked", () => {
    open(configWith([Species.Bumblebolt, Species.Pebbler, Species.Scorchimp]));
    // Cake: "Give 2 random monsters +5 Damage."
    addAndUse("Cake");

    const confirm = () => screen.getByRole("button", { name: /^Use on \d+ monsters?$/ });
    expect(confirm()).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByLabelText("Select Bumblebolt"));
    // One of two is still not two, and a half-used Cake is not a board the game can produce.
    expect(confirm()).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByLabelText("Select Scorchimp"));
    expect(confirm()).toHaveProperty("disabled", false);
    fireEvent.click(confirm());

    // Exactly the two chosen monsters carry a modifier — Pebbler, unchosen, carries none.
    expect(screen.getByText("2 active")).toBeTruthy();
    expect(screen.getByText("none held")).toBeTruthy();
  });

  it("will not let a third monster be chosen for a two-monster item", () => {
    open(configWith([Species.Bumblebolt, Species.Pebbler, Species.Scorchimp]));
    addAndUse("Cake");
    fireEvent.click(screen.getByLabelText("Select Bumblebolt"));
    fireEvent.click(screen.getByLabelText("Select Pebbler"));
    // Refused visibly, before the click, rather than being a click that appears to do nothing.
    expect(screen.getByLabelText("Select Scorchimp")).toHaveProperty("disabled", true);
  });

  it("can be cancelled without spending the item", () => {
    open(configWith([Species.Bumblebolt, Species.Pebbler]));
    addAndUse("Cake");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("1 held")).toBeTruthy();
    expect(screen.getByText("none active")).toBeTruthy();
  });
});

describe("items with no modelled effect", () => {
  it("offer no Use button and say so, rather than a button that does nothing", () => {
    open(configWith([Species.Bumblebolt]));
    fireEvent.click(screen.getByLabelText("Add Fake Coin"));
    expect(screen.queryByLabelText("Use Fake Coin")).toBeNull();
    expect(screen.getByText("No effect this calculator can apply.")).toBeTruthy();
    // Still discardable: holding one is a real state even though using it changes no stat.
    expect(screen.getByLabelText("Discard one Fake Coin")).toBeTruthy();
  });
});
