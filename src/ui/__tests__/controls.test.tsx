import { describe, expect, it } from "vitest";
import { createRef, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Button, ClampedNumberField, Field, NumberField, Select, TextField } from "../primitives";

/**
 * The control primitives (2026-10-07).
 *
 * These assertions are all about the same promise, which is the reason the components are thin: a
 * styled control must still BE the native element underneath. Every test in this project queries by
 * role or by label, every picker focuses its search field imperatively, and the modifier amount
 * field is driven by keyboard — so a control that wrapped or reimplemented the native element would
 * break those quietly, in ways a visual check would not show.
 */

describe("Button", () => {
  it("is a real button, defaults to type=button, and passes props through", () => {
    render(
      <Button aria-label="Add modifier to Bumblebolt" disabled>
        Add
      </Button>,
    );
    const button = screen.getByRole("button", { name: /add modifier to bumblebolt/i });
    expect(button.tagName).toBe("BUTTON");
    // A bare <button> submits the form it is in, and this app has several control clusters that look
    // like forms and are not.
    expect(button.getAttribute("type")).toBe("button");
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("leaves ARIA state to the call site when `selected` is set", () => {
    // `selected` is styling only. The correct ARIA differs by group — the view nav wants
    // `aria-current="page"`, a toggle wants `aria-pressed` — so guessing here would put the wrong
    // one on half the call sites.
    render(
      <Button selected aria-current="page">
        Calculator
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Calculator" });
    expect(button.getAttribute("aria-current")).toBe("page");
    expect(button.getAttribute("aria-pressed")).toBeNull();
  });
});

describe("Select", () => {
  it("is a real select whose options the caller owns", () => {
    // `selectOption` and `.options` both depend on this: the chevron is a sibling span, never a
    // replacement for the native listbox.
    render(
      <Select aria-label="Filter by rarity" defaultValue="Rare">
        <option value="">All rarities</option>
        <option value="Rare">Rare</option>
      </Select>,
    );
    const select = screen.getByLabelText(/filter by rarity/i) as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["", "Rare"]);
    expect(select.value).toBe("Rare");
  });
});

describe("text fields", () => {
  it("forward a ref, which three call sites focus imperatively", () => {
    // Both pickers focus their search field when the overlay opens, and Modifiers returns focus to
    // the amount field after an add so a second one can be typed straight away.
    const search = createRef<HTMLInputElement>();
    const amount = createRef<HTMLInputElement>();
    render(
      <>
        <TextField ref={search} aria-label="Search trinkets" />
        <NumberField ref={amount} aria-label="Amount to add for Bumblebolt" />
      </>,
    );
    expect(search.current).toBe(screen.getByLabelText(/search trinkets/i));
    expect(amount.current?.type).toBe("number");

    search.current?.focus();
    expect(document.activeElement).toBe(search.current);
  });
});

describe("ClampedNumberField", () => {
  /** Renders the field against real state, the way every call site drives it. */
  function Harness({ min = 1, max = 120, start = 10 }: { min?: number; max?: number; start?: number }) {
    const [value, setValue] = useState(start);
    return (
      <Field label="Simulation window (seconds)" inline>
        <ClampedNumberField min={min} max={max} value={value} onCommit={setValue} />
      </Field>
    );
  }

  const windowField = () => screen.getByLabelText(/simulation window/i) as HTMLInputElement;
  const type = (text: string) => fireEvent.change(windowField(), { target: { value: text } });

  it("can be emptied, which a value-bound NumberField cannot", () => {
    // The report: changing 10 to 30 was impossible by typing. Backspacing to empty parsed as 0,
    // fell through `|| 1` to the minimum, and React wrote `1` straight back into the box — so the
    // only way through was to type 30 in front of it, get 130, and then delete the 1.
    render(<Harness />);
    type("");
    expect(windowField().value).toBe("");
    type("3");
    type("30");
    expect(windowField().value).toBe("30");
  });

  it("reverts to the last good value when left empty, rather than snapping to the minimum", () => {
    render(<Harness />);
    type("");
    fireEvent.blur(windowField());
    expect(windowField().value).toBe("10");
  });

  it("clamps an out-of-range entry on blur instead of committing it mid-type", () => {
    // "200" is out of range, so it is held as a draft and resolved only when the user leaves —
    // clamping rather than reverting, since someone who typed 200 into a field capped at 120 wants
    // the cap, not their old value.
    render(<Harness />);
    type("200");
    expect(windowField().value).toBe("200");
    fireEvent.blur(windowField());
    expect(windowField().value).toBe("120");
  });
});

describe("Field", () => {
  it("binds its label by wrapping the control, so no id/htmlFor pair can fall out of step", () => {
    render(
      <Field label="Simulation window (seconds)" inline>
        <NumberField defaultValue={30} />
      </Field>,
    );
    const input = screen.getByLabelText(/simulation window/i);
    expect(input.tagName).toBe("INPUT");
  });
});
