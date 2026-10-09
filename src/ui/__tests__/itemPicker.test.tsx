import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ItemPicker } from "../GridPicker/ItemPicker";
import { ModifierEditor } from "../Modifiers/ModifierEditor";
import { TeamConfigProvider } from "../../context/TeamConfigContext";
import type { TeamConfiguration } from "../../data/types";
import { CreatureType, GridRow } from "../../data/enums";
import { Species } from "../../data/ids";
import { allCreatureRecords } from "../../data/corpus";
import { STAT_COLORS } from "../../data/statColors";

/**
 * Picking an item uses it (T046, revised 2026-10-08 after the bag was removed).
 *
 * The recipient rules are unit-tested in `engine/__tests__/itemEffects.test.ts`; this is the
 * wiring. `ModifierEditor` is rendered alongside on purpose — "the bonus shows up under Modifiers"
 * is the actual claim the design makes, and asserting it through the real panel is the only way
 * that claim is tested rather than assumed.
 */

function configWith(species: Species[]): TeamConfiguration {
  return {
    placements: species.map((creatureId, i) => ({
      slot: { row: i < 3 ? GridRow.Top : GridRow.Bottom, col: (i % 3) as 0 | 1 | 2 },
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

describe("picking an item uses it", () => {
  it("applies the bonus on the first click, with no intermediate bag", () => {
    open(configWith([Species.Bumblebolt, Species.Pebbler]));

    // One click, straight from the browse list. There is no "your items" section to pass through.
    fireEvent.click(screen.getByLabelText(/^Use Feast/));
    expect(screen.getByText("2 active")).toBeTruthy();
    expect(screen.queryByText("Your items")).toBeNull();
  });

  it("applies again when picked again, accumulating onto one chip", () => {
    open(configWith([Species.Bumblebolt]));
    fireEvent.click(screen.getByLabelText(/^Use Feast/));
    fireEvent.click(screen.getByLabelText(/^Use Feast/));
    // One modifier at +10, not two indistinguishable +5s — `addPlacementModifier` accumulates.
    expect(screen.getByText("1 active")).toBeTruthy();

    // The chips live inside the Modifiers overlay, so the amount has to be read there. The chip
    // names the item that made it, which is the point of `StatModifier.label`.
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(screen.getByText("Modifiers").closest("button")!);
    expect(screen.getByText("Feast: Damage +10")).toBeTruthy();
  });

  it("counts what is applied, derived from the modifiers rather than stored", () => {
    open(configWith([Species.Bumblebolt, Species.Pebbler]));
    expect(screen.getByText("none used")).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/^Use Feast/));
    expect(screen.getByText("2 applied")).toBeTruthy();
  });

  it("says who a pick will reach before it is pressed", () => {
    open(configWith([Species.Bumblebolt, Species.Pebbler]));
    expect(screen.getByLabelText("Use Feast — Applies to 2 monsters.")).toBeTruthy();
  });
});

describe("items that cannot be picked say so", () => {
  it("disables an item no monster on the board matches", () => {
    // Battery Pack is "your Electric monsters"; Pebbler is Rock. A click that applied nothing
    // would look identical to one that worked.
    const pebbler = allCreatureRecords().find((c) => c.id === Species.Pebbler)!;
    expect(pebbler.types).not.toContain(CreatureType.Electric);

    open(configWith([Species.Pebbler]));
    const card = screen.getByLabelText("Battery Pack — No monster on your board matches.");
    expect(card).toHaveProperty("disabled", true);
  });

  it("disables an item whose effect this calculator does not simulate", () => {
    open(configWith([Species.Bumblebolt]));
    const card = screen.getByLabelText("Fake Coin — No stat this calculator simulates.");
    expect(card).toHaveProperty("disabled", true);
  });

  it("disables the whole panel until a Batomon is placed", () => {
    render(
      <TeamConfigProvider initialConfig={configWith([])}>
        <ItemPicker />
      </TeamConfigProvider>,
    );
    const panel = screen.getByText("Items").closest("button")!;
    expect(panel).toHaveProperty("disabled", true);
    expect(screen.getByText("place a Batomon first")).toBeTruthy();
  });
});

describe("items that name a count ask who got it", () => {
  it("refuses to apply until the published count is picked", () => {
    open(configWith([Species.Bumblebolt, Species.Pebbler, Species.Scorchimp]));
    // Cake: "Give 2 random monsters +5 Damage."
    fireEvent.click(screen.getByLabelText(/^Use Cake/));

    const confirm = () => screen.getByRole("button", { name: /^Use on \d+ monsters?$/ });
    expect(confirm()).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByLabelText("Select Bumblebolt"));
    // One of two is still not two, and a half-used Cake is not a board the game can produce.
    expect(confirm()).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByLabelText("Select Scorchimp"));
    expect(confirm()).toHaveProperty("disabled", false);
    fireEvent.click(confirm());

    // Exactly the two chosen monsters carry a modifier — Pebbler, unchosen, carries none.
    expect(screen.getByText("2 applied")).toBeTruthy();
  });

  it("will not let a third monster be chosen for a two-monster item", () => {
    open(configWith([Species.Bumblebolt, Species.Pebbler, Species.Scorchimp]));
    fireEvent.click(screen.getByLabelText(/^Use Cake/));
    fireEvent.click(screen.getByLabelText("Select Bumblebolt"));
    fireEvent.click(screen.getByLabelText("Select Pebbler"));
    // Refused visibly, before the click, rather than being a click that appears to do nothing.
    expect(screen.getByLabelText("Select Scorchimp")).toHaveProperty("disabled", true);
  });

  it("can be cancelled without applying anything", () => {
    open(configWith([Species.Bumblebolt, Species.Pebbler]));
    fireEvent.click(screen.getByLabelText(/^Use Cake/));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("none used")).toBeTruthy();
    expect(screen.getByText("none active")).toBeTruthy();
  });
});

describe("effect text is highlighted the way ability text is (Principle VII)", () => {
  it("colours '+5 Damage' on an item card in the Damage hue", () => {
    // The user's report: the item card rendered its text flat while the creature card beside it
    // coloured the identical phrase. Both go through `AbilityText` now.
    const { container } = open(configWith([Species.Bumblebolt]));
    const run = [...container.querySelectorAll("span")].find((s) => s.textContent === "+5 Damage");
    expect(run, "no '+5 Damage' run rendered — the text is not being tokenized").toBeTruthy();
    expect(run!.style.color).toBe(asRgb(STAT_COLORS.damage));
  });
});

/** jsdom normalizes an inline hex colour to `rgb(...)`, so the expectation has to match its form. */
function asRgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}
