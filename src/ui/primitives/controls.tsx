import { useState, type ComponentPropsWithRef, type ReactNode } from "react";
import styles from "./controls.module.css";

/**
 * Form controls: the one Button, Select, text field, number field, textarea, range and Field
 * (2026-10-07, Constitution Principle VII, FR-058).
 *
 * ## Why these exist
 *
 * Everything else in this app composes from a primitives layer, and controls were the hole in it.
 * Every button, select and text field in the app was a bare native element with no styling at all,
 * so a white-on-grey bevelled box rendered in the middle of a dark, token-built page — the trainer
 * dropdowns, the two search fields, the simulation-window number box, Modifiers' stat select and
 * Add button, the Share panel's copy buttons, and the view nav. Meanwhile five component
 * stylesheets had begun growing their own one-off button rules, two of them reaching for
 * `var(--focus-ring, #8ab4f8)` — a blue from no palette in this project, defaulted to because the
 * token did not exist.
 *
 * ## What they are, deliberately
 *
 * **Native elements underneath, always.** Each of these renders the real `<button>`, `<select>`,
 * `<input>` or `<textarea>` and spreads the caller's props onto it, so keyboard behaviour, form
 * semantics, `aria-*`, `ref` and every test that queries by role or label keep working. These add a
 * class and a chevron; they do not reimplement a control.
 *
 * **Props pass through, including `ref`.** Three call sites focus a field imperatively (the two
 * pickers' search inputs on open, Modifiers' amount field after an add). React 19 takes `ref` as an
 * ordinary prop on a function component, so `ComponentPropsWithRef` is enough and no `forwardRef`
 * wrapper is needed.
 *
 * **No `label` prop on the controls themselves.** Labelling is `Field`'s job, or an explicit
 * `aria-label` at the call site. A control that sometimes renders its own label and sometimes does
 * not is two components wearing one name.
 */

type ControlSize = "sm" | "md";

/** `sm` is for the inside of a card cell, where a 36px control does not fit three to a row. */
function sizeClass(size: ControlSize): string {
  return size === "sm" ? styles.sm! : "";
}

/* ----------------------------------- Button ---------------------------------- */

/**
 * - `primary`: the one action a group is for ("Load team", "Add", "Apply"). At most one per group.
 * - `secondary`: the default — an action, but not THE action.
 * - `ghost`: no chrome until hovered, for controls inside dense content where a box per control
 *   would be more border than text.
 * - `danger`: a destructive action, by colour rather than by a second shape.
 */
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ComponentPropsWithRef<"button"> {
  variant?: ButtonVariant;
  size?: ControlSize;
  /**
   * Marks this as the chosen one of a mutually exclusive group (the view nav).
   *
   * STYLING ONLY — it deliberately sets no ARIA state, because the right one depends on what the
   * group means: the nav wants `aria-current="page"`, a toggle wants `aria-pressed`. Guessing here
   * would put the wrong one on half the call sites.
   */
  selected?: boolean;
  /** Fill the container's width, for a button that is the whole row. */
  block?: boolean;
}

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: styles.primary!,
  secondary: styles.secondary!,
  ghost: styles.ghost!,
  danger: styles.danger!,
};

export function Button({
  variant = "secondary",
  size = "md",
  selected = false,
  block = false,
  className = "",
  // `type="button"` by default. A bare <button> inside a form submits it, and this app has several
  // control clusters that look like forms and are not.
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[
        styles.control,
        styles.button,
        BUTTON_VARIANT[variant],
        sizeClass(size),
        block ? styles.block : "",
        selected ? styles.selected : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
}

/* ----------------------------------- Select ---------------------------------- */

/**
 * `size` SHADOWS the native attribute, deliberately, on all three of these. HTML's `size` means
 * "visible rows" on a select and "visible characters" on an input — legacy intrinsic sizing that
 * this project does entirely in CSS, so the name is better spent on the one scale that is real here.
 */
interface SelectProps extends Omit<ComponentPropsWithRef<"select">, "size"> {
  size?: ControlSize;
  /** Grow to fill its container, for a select that is a field's whole row. */
  block?: boolean;
}

/** A native `<select>` with its OS arrow suppressed and ours drawn in its place. */
export function Select({ size = "md", block = false, className = "", children, ...rest }: SelectProps) {
  return (
    <span className={`${styles.selectWrap} ${block ? styles.block : ""}`}>
      <select
        className={`${styles.control} ${styles.select} ${sizeClass(size)} ${className}`}
        {...rest}
      >
        {children}
      </select>
      <span className={styles.selectChevron} aria-hidden="true">
        ▼
      </span>
    </span>
  );
}

/* --------------------------------- text fields -------------------------------- */

interface TextFieldProps extends Omit<ComponentPropsWithRef<"input">, "type" | "size"> {
  size?: ControlSize;
  /** `search` renders a search input, which gets the platform's clear affordance for free. */
  type?: "text" | "search";
  block?: boolean;
}

export function TextField({ size = "md", type = "text", block = false, className = "", ...rest }: TextFieldProps) {
  return (
    <input
      type={type}
      className={`${styles.control} ${styles.input} ${sizeClass(size)} ${block ? styles.block : ""} ${className}`}
      {...rest}
    />
  );
}

interface NumberFieldProps extends Omit<ComponentPropsWithRef<"input">, "type" | "size"> {
  size?: ControlSize;
  /** A CSS width, e.g. `"4rem"`. Numbers are short and a field sized for prose reads as a mistake. */
  width?: string;
}

export function NumberField({ size = "md", width, className = "", style, ...rest }: NumberFieldProps) {
  return (
    <input
      type="number"
      className={`${styles.control} ${styles.input} ${styles.number} ${sizeClass(size)} ${className}`}
      style={width ? { ...style, width } : style}
      {...rest}
    />
  );
}

interface ClampedNumberFieldProps extends Omit<NumberFieldProps, "value" | "defaultValue" | "onChange" | "onBlur"> {
  value: number;
  min: number;
  max?: number;
  /** Called only with a value inside `[min, max]`. */
  onCommit: (value: number) => void;
}

/**
 * A number field you can empty while typing (2026-10-08, user-reported).
 *
 * A `NumberField` driven straight off state — `value={window}` with
 * `onChange={(e) => set(Number(e.target.value) || 1)}` — cannot be cleared: emptying it parses as
 * `0`, falls through `|| 1` to the minimum, and React immediately writes `1` back into the box. So
 * changing 10 to 30 meant typing 30 in front of the 1 to get 130 and then deleting the 1. The
 * simulation window and the library's day field both worked this way.
 *
 * The fix is a DRAFT: while the field is focused it shows what was typed, including nothing at
 * all, and the committed value only moves when the draft is a number in range. Blur drops the
 * draft, so an empty or out-of-range field reverts to the last good value rather than silently
 * becoming the minimum.
 *
 * Committing on every valid keystroke, rather than on blur, is deliberate: these drive a live
 * recomputation, and making the user leave the field to see it would be its own annoyance.
 */
export function ClampedNumberField({ value, min, max, onCommit, ...rest }: ClampedNumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const inRange = (n: number) => Number.isFinite(n) && n >= min && (max === undefined || n <= max);

  return (
    <NumberField
      {...rest}
      min={min}
      max={max}
      // `draft ?? value`: null means "not being edited", which is not the same as an empty draft.
      value={draft ?? value}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const parsed = Number(raw);
        if (raw.trim() !== "" && inRange(parsed)) onCommit(parsed);
      }}
      onBlur={() => {
        const parsed = Number(draft);
        if (draft !== null && draft.trim() !== "" && Number.isFinite(parsed) && !inRange(parsed)) {
          onCommit(Math.min(max ?? parsed, Math.max(min, parsed)));
        }
        setDraft(null);
      }}
    />
  );
}

interface TextAreaProps extends ComponentPropsWithRef<"textarea"> {
  /** Monospace, for an opaque code that is compared character by character. */
  mono?: boolean;
}

export function TextArea({ mono = false, className = "", ...rest }: TextAreaProps) {
  return (
    <textarea
      className={`${styles.control} ${styles.textarea} ${mono ? styles.mono : ""} ${className}`}
      {...rest}
    />
  );
}

/** The time scrubber. A default range control is the most conspicuously unstyled thing on a page. */
export function Range({ className = "", ...rest }: Omit<ComponentPropsWithRef<"input">, "type">) {
  return <input type="range" className={`${styles.control} ${styles.range} ${className}`} {...rest} />;
}

/* ------------------------------------ Field ----------------------------------- */

interface FieldProps {
  label: string;
  children: ReactNode;
  /**
   * `inline` reads as a sentence with its control ("Region: …") and keeps normal case; the default
   * stacks a quiet small-caps label above a full-width control.
   */
  inline?: boolean;
  /**
   * A shared minimum label width, e.g. `"4.5rem"`, for several inline fields stacked in a column.
   *
   * Without it each label sizes to its own text, so the controls beside them start at different
   * x-positions and the column reads as misaligned. A CSS variable rather than a second class,
   * because the right width is the longest label in THAT group and only the caller knows it.
   */
  labelWidth?: string;
  /** Supporting text under the control — a unit, a constraint, a format. */
  hint?: string;
  className?: string;
}

/**
 * A label bound to its control by wrapping it, so no `id`/`htmlFor` pair can fall out of step — the
 * failure mode of the alternative is a label that silently labels nothing.
 */
export function Field({ label, children, inline = false, labelWidth, hint, className = "" }: FieldProps) {
  return (
    <label
      className={`${styles.field} ${inline ? styles.fieldInline : styles.fieldStacked} ${className}`}
      style={labelWidth ? { ["--field-label-width" as string]: labelWidth } : undefined}
    >
      <span className={styles.fieldLabel}>{label}</span>
      {children}
      {hint ? <span className={styles.fieldHint}>{hint}</span> : null}
    </label>
  );
}
