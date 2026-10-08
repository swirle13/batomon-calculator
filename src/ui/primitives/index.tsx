import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import type { CreatureType } from "../../data/types";
import { STAT_COLORS, type StatColorKey } from "../../data/statColors";
import { formatCompactValue } from "../../data/format";
import { typeColor } from "../../data/typeColors";
import { Sprite, type SpriteKind } from "../shared/Sprite";
import { Button } from "./controls";
import styles from "./primitives.module.css";

/**
 * Controls live in `./controls` and are re-exported here, so every surface still imports its
 * primitives from one place (`../primitives`) and no call site has to know which file a given
 * primitive is declared in.
 */
export { Button, Field, NumberField, Range, Select, TextArea, TextField } from "./controls";

/**
 * The shared UI primitives layer (2026-10-06 round 7, Constitution Principle VII, FR-058).
 *
 * Every visual surface composes from these. The rule they exist to enforce: any pattern appearing
 * on two or more surfaces is ONE component, so the surfaces cannot drift. Before this layer, the
 * project had three independent card treatments, chip styling defined in three files, duplicated
 * modal chrome, and six call sites hard-coding sprite sizes — which reached the user as several
 * separate visual bugs that were really one cause (research.md I14).
 *
 * Props are discriminated//closed unions rather than open `string` or `any`, per the installed
 * React skill's typing rules.
 */

/* ---------------------------------- Surface ---------------------------------- */

type SurfaceTone = "default" | "flat" | "inset";
type SurfacePad = "none" | "sm" | "md";

type SurfaceProps = {
  children: ReactNode;
  tone?: SurfaceTone;
  pad?: SurfacePad;
} & Omit<React.ComponentPropsWithoutRef<"div">, "children">;

const TONE_CLASS: Record<SurfaceTone, string> = {
  default: "",
  flat: styles.surfaceFlat!,
  inset: styles.surfaceInset!,
};
const PAD_CLASS: Record<SurfacePad, string> = {
  none: styles.padNone!,
  sm: styles.padSm!,
  md: styles.padMd!,
};

/** The one card/panel container. */
export function Surface({ children, tone = "default", pad = "md", className = "", ...rest }: SurfaceProps) {
  return (
    <div className={`${styles.surface} ${TONE_CLASS[tone]} ${PAD_CLASS[pad]} ${className}`} {...rest}>
      {children}
    </div>
  );
}

/* ----------------------------------- Chip ------------------------------------ */

interface ChipProps {
  children: ReactNode;
  /** Solid fill (e.g. a type colour). Omit for the neutral grey chip. */
  color?: string;
  /** Renders a trailing remove button when provided. */
  onRemove?: () => void;
  removeLabel?: string;
  title?: string;
  className?: string;
}

/** The one pill. Used by type tags, modifier chips, and trinket markers. */
export function Chip({ children, color, onRemove, removeLabel, title, className }: ChipProps) {
  const toneClass = color ? styles.chipSolid : styles.chipNeutral;
  return (
    <span
      className={`${styles.chip} ${toneClass} ${className ?? ""}`}
      style={color ? { background: color } : undefined}
      title={title}
    >
      {children}
      {onRemove && (
        <button type="button" className={styles.chipRemove} onClick={onRemove} aria-label={removeLabel}>
          ×
        </button>
      )}
    </span>
  );
}

/** A creature type rendered as a chip — the canonical type→colour surface. */
export function TypeChip({ type }: { type: CreatureType }) {
  return (
    <Chip color={typeColor(type)} className={styles.chipFixedWidth}>
      {type}
    </Chip>
  );
}

/* --------------------------------- StatBadge --------------------------------- */

interface StatBadgeProps {
  statKey: StatColorKey;
  value: number;
  /** Human-readable stat name, used for the accessible title — the game distinguishes these by
   * colour alone, which is not sufficient on its own. */
  label: string;
  /**
   * A marker written before the number, used by Multicast for its `×`. Multicast is the one output
   * stat that is a MULTIPLIER rather than a magnitude, and a bare `2` beside a `25` read as two of
   * something; the card's stat line has always said "Multicast ×2", so the chip now agrees.
   */
  prefix?: string;
}

/** The one colour-coded numeric stat pill, matching the in-game team pane. */
export function StatBadge({ statKey, value, label, prefix }: StatBadgeProps) {
  return (
    <span
      className={styles.statBadge}
      style={{ background: STAT_COLORS[statKey] }}
      // The EXACT value, even when the label is abbreviated to "123K" to fit the chip.
      title={`${label}: ${prefix ?? ""}${value}`}
    >
      {prefix}
      {formatCompactValue(value)}
    </span>
  );
}

/* --------------------------------- StatLine ---------------------------------- */

/** The one coloured "Deal 25 damage" / "Poison 4" output row. */
export function StatLine({ statKey, children }: { statKey: StatColorKey; children: ReactNode }) {
  return (
    <div className={styles.statLine} style={{ color: STAT_COLORS[statKey] }}>
      {children}
    </div>
  );
}

/* ------------------------------ SectionHeading ------------------------------- */

export function SectionHeading({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  return <div className={`${styles.sectionHeading} ${accent ? styles.sectionHeadingAccent : ""}`}>{children}</div>;
}

/* --------------------------------- CardGrid ---------------------------------- */

type CardGridProps = {
  children: ReactNode;
  /** Auto-fit mode: as many columns as fit at this minimum width. */
  minWidth?: string;
  /**
   * Fixed mode: exactly this many equal columns, collapsing to one on phones.
   *
   * Used by the overlay panels, which all show **three** columns — the same shape as the team
   * grid. Auto-fit was wrong for them: it gave the trinket picker two 400px columns on a narrower
   * window, which wasted horizontal space and left the cards mostly empty.
   */
  columns?: number;
  maxWidth?: string;
} & Omit<React.ComponentPropsWithoutRef<"div">, "children" | "style">;

/** The one responsive grid. Four bespoke copies existed before this. */
export function CardGrid({ children, minWidth = "15rem", columns, maxWidth, className = "", ...rest }: CardGridProps) {
  const fixed = columns !== undefined;
  return (
    <div
      className={`${styles.cardGrid} ${fixed ? styles.cardGridFixed : ""} ${className}`}
      style={{
        ...(fixed ? { ["--grid-columns" as string]: String(columns) } : { ["--grid-min" as string]: minWidth }),
        maxWidth,
        marginInline: maxWidth ? "auto" : undefined,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

/* -------------------------------- PickerCard --------------------------------- */

type PickerCardProps = {
  /**
   * Present only for MULTI-select pickers, which must show selection on the card because the modal
   * stays open across choices. Omitted entirely by the creature picker, which closes on the single
   * choice it exists to make — so it renders no `aria-pressed` rather than a permanent "false".
   */
  selected?: boolean;
} & React.ComponentPropsWithoutRef<"button">;

/**
 * The one clickable result card in a picker grid (2026-10-07).
 *
 * The creature picker and the trinket picker each had their own `.card` rule: the same button
 * reset, the same 2px reserved border, the same hover/focus treatment, written twice with
 * different backgrounds. The CONTENT differs between them — a creature card is all tile, a trinket
 * card is a tile plus its effect text — so the content stays at the call site and only the card
 * itself is shared.
 */
export function PickerCard({ selected, className = "", children, ...rest }: PickerCardProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`${styles.pickerCard} ${selected ? styles.pickerCardSelected : ""} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/* -------------------------------- EditorPanel -------------------------------- */

interface EditorPanelProps {
  title: string;
  /** The panel's current state in a few words: "1 selected", "2 active", "none active". */
  hint: string;
  /** What activating the panel opens: "Choose trinkets…", "Edit modifiers…". */
  action: string;
  onOpen: () => void;
  /** True when there is nothing to edit yet — a disabled panel states that better than an overlay
   * of six empty cells would. The reason belongs in `hint`. */
  disabled?: boolean;
}

/**
 * The one "what you have, and the editor that changes it" panel, shared by Trinkets and Modifiers
 * (2026-10-07, at the user's request that the two look alike).
 *
 * Both were previously squeezed into the team column full-width — Modifiers as a disclosure whose
 * six creature cells each got a third of half the page, which is what ran it out of room. The
 * editing happens in an overlay with room to do it in, and the two panels sit side by side above
 * the grid.
 *
 * ## The panel IS the control, and it holds nothing that can grow
 *
 * Second revision the same day, both parts the user's:
 *
 * 1. **No embedded button.** It was a panel containing a full-width `<button>` whose only job was
 *    to open the panel's own editor — a control inside a control, where the outer box looked
 *    clickable and wasn't. The panel is now the button. It reuses the `Surface` classes rather than
 *    restating them, so it is the same box as every other panel; it just happens to be pressable.
 * 2. **No summary chips.** Each selected trinket and each modifier used to render a chip here, so
 *    the panel grew and shrank as they were added and removed — and the team grid below it moved
 *    every time. The count in `hint` is fixed-width in practice, so these two panels now hold a
 *    constant shape for the whole session. What the chips showed lives in the overlay, which can
 *    grow without displacing anything.
 */
export function EditorPanel({ title, hint, action, onOpen, disabled = false }: EditorPanelProps) {
  return (
    <button
      type="button"
      className={`${styles.surface} ${styles.padSm} ${styles.editorPanel}`}
      onClick={onOpen}
      disabled={disabled}
      aria-haspopup="dialog"
    >
      <span className={styles.editorPanelTitle}>{title}</span>
      <span className={styles.editorPanelHint}>{hint}</span>
      {/* Part of the accessible name on purpose: "Trinkets, 1 selected, Choose trinkets…" says what
          pressing this does, which a chevron alone would not. */}
      <span className={styles.editorPanelCue}>{action}</span>
    </button>
  );
}

/* ------------------------------- Picker chrome ------------------------------- */

/**
 * Every overlay panel lays its cards out in THREE columns — the same shape as the team grid, which
 * is the board the whole app is about. Declared once, so "the overlays all look alike" is a fact
 * about the code rather than three call sites that currently agree.
 */
export const OVERLAY_COLUMNS = 3;

/**
 * The parts a picker modal is made of, shared by the creature picker and the trinket picker
 * (2026-10-07). Both had their own copy of each rule, in two CSS files, differing only by
 * accident — a `--space-sm` gap in one and `0.5rem` in the other, a 12rem search basis against
 * 14rem. Principle VII: a pattern on two surfaces is one component.
 */

/** The row of search/filter controls above a picker's results. Sizes any text input it contains. */
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className={styles.filterBar}>{children}</div>;
}

/** "41 of 93" — how much the current filters are hiding. */
export function ResultCount({ shown, total }: { shown: number; total: number }) {
  return (
    <span className={styles.resultCount}>
      {shown} of {total}
    </span>
  );
}

/**
 * Resets a picker's search and filters. Call sites render it only when something is actually set,
 * so it is never a dead control.
 */
export function ClearFiltersButton({ onClick, title }: { onClick: () => void; title: string }) {
  // `secondary`, not `ghost`: it sits in a row of bordered filter controls, and without chrome of
  // its own it read as a label rather than something to press.
  return (
    <Button size="sm" title={title} onClick={onClick}>
      Clear
    </Button>
  );
}

/**
 * One rarity section of a picker's results: a left-justified heading in the rarity's own colour,
 * its match count, and a card grid beneath it (FR-048). Sections with no matches are omitted by
 * the caller rather than rendering an empty heading that implies a filter failure.
 */
export function PickerSection({
  heading,
  color,
  count,
  cardMinWidth,
  columns,
  children,
}: {
  heading: string;
  color?: string;
  /**
   * `number` for "how many matched"; a STRING for a count against a cap, e.g. `"4/9"` — the
   * affected-species picker fills nine fixed slots, so its heading has to say how many of nine
   * rather than how many exist. A second heading component for that one difference is the
   * duplication this layer exists to prevent.
   */
  count: number | string;
  /** Auto-fit column sizing. Mutually exclusive with `columns`; `columns` wins. */
  cardMinWidth?: string;
  columns?: number;
  children: ReactNode;
}) {
  return (
    <section className={styles.pickerSection}>
      <h4 className={styles.pickerSectionHeading} style={color ? { color } : undefined}>
        {/* The space is for the ACCESSIBLE NAME, not the layout — the heading is a flex row with its
            own gap, so sighted readers already saw one while screen readers heard "Common(19)". */}
        {heading}{" "}
        <span className={styles.pickerSectionCount}>({count})</span>
      </h4>
      <CardGrid minWidth={cardMinWidth} columns={columns}>
        {children}
      </CardGrid>
    </section>
  );
}

/** "Nothing matches this search" — the one muted note for an empty result set. */
export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className={styles.emptyNote}>{children}</p>;
}

/* ---------------------------------- Modal ------------------------------------ */

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** Used for the dialog's accessible name when it should differ from the visible title. */
  ariaLabel?: string;
  closeLabel?: string;
  width?: string;
  /** Rendered between the header and the scrolling body (filters, counts). */
  toolbar?: ReactNode;
  children: ReactNode;
}

/** The one modal chrome: overlay, panel, header, Escape-to-close, click-outside-to-close. */
export function Modal({
  isOpen,
  onClose,
  title,
  ariaLabel,
  closeLabel = "Close",
  width,
  toolbar,
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? title}
      className={styles.overlay}
      onKeyDown={handleKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={panelRef} className={styles.modalPanel} style={width ? { ["--modal-width" as string]: width } : undefined}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{title}</h3>
          <Button onClick={onClose}>{closeLabel}</Button>
        </div>
        {toolbar}
        <div className={styles.modalBody}>{children}</div>
      </div>
    </div>
  );
}

/* -------------------------------- Disclosure --------------------------------- */

interface DisclosureProps {
  label: string;
  /** Shown next to the label, e.g. a count. */
  hint?: string;
  defaultOpen?: boolean;
  /**
   * Optional: a Disclosure with nothing to disclose renders as a plain, non-expandable row.
   * Round 11 (WI-R11-002) needs this for the "no placement suggestion" case, where the whole point
   * is that there is no body — an expandable arrow promising content that turns out to be empty is
   * worse than no arrow.
   */
  children?: ReactNode;
}

/** The one collapsible section. Collapsed by default — an expanded default would still displace
 * the content below it, which is the complaint these exist to fix. */
export function Disclosure({ label, hint, defaultOpen = false, children }: DisclosureProps) {
  if (!children) {
    return (
      <div className={`${styles.disclosure} ${styles.disclosureInert}`}>
        <div className={styles.disclosureSummary}>
          {label}
          {hint ? <span className={styles.disclosureHint}> {hint}</span> : null}
        </div>
      </div>
    );
  }

  return (
    <details className={styles.disclosure} open={defaultOpen}>
      <summary className={styles.disclosureSummary}>
        {label}
        {hint ? <span className={styles.disclosureHint}> {hint}</span> : null}
      </summary>
      {children}
    </details>
  );
}

/* -------------------------------- ColorSplit --------------------------------- */

/** The neutral background for a record with no colour of its own (an unknown type, no rarity). */
const COLOR_SPLIT_FALLBACK = "#444857";

/**
 * A background of N explicitly-sized, equal vertical bands.
 *
 * Replaces `typeBackground()`'s `linear-gradient(..., A 50%, B 50%, ...)`, which banded the far
 * colour along the element's edge: CSS positions a background against the padding box but paints it
 * across the border box, so a transparent border let the gradient repeat outward on every side
 * (research.md I8). Bands cannot produce that artifact at any size.
 */
function ColorSplit({ colors, children, className = "" }: { colors: string[]; children?: ReactNode; className?: string }) {
  const bands = colors.length === 0 ? [COLOR_SPLIT_FALLBACK] : colors;
  return (
    <div className={`${styles.typeSplitHost} ${className}`}>
      <div className={styles.typeSplit} aria-hidden="true">
        {bands.map((color, i) => (
          <div key={`${color}-${i}`} className={styles.typeSplitHalf} style={{ background: color }} />
        ))}
      </div>
      {children ? <div className={styles.typeSplitContent}>{children}</div> : null}
    </div>
  );
}

/* --------------------------------- TypeSplit --------------------------------- */

/** A creature's type background: one band per type. */
export function TypeSplit({ types, children, className = "" }: { types: CreatureType[]; children?: ReactNode; className?: string }) {
  return (
    <ColorSplit colors={types.map(typeColor)} className={className}>
      {children}
    </ColorSplit>
  );
}

/* -------------------------------- SpriteTile --------------------------------- */

interface SpriteTileProps {
  name: string;
  /**
   * The tile's background, as equal vertical bands — a creature's types, or a trinket's single
   * rarity colour. Empty renders the neutral fallback rather than nothing.
   */
  colors: string[];
  spriteFile: string | undefined;
  spriteKind: SpriteKind;
  /**
   * The design token governing the sprite's size, e.g. `--sprite-modifier`. A TOKEN rather than a
   * number so the size stays in CSS: a px value read into JS is frozen at render time, which is
   * how a 64px sprite survived a token change to 96 (see Sprite.tsx). It also lets the tile's own
   * height be computed from the same token instead of a second literal that can drift.
   */
  spriteSizeVar?: string;
  /** Rendered over the art area (level badge, clear button, selected mark, stat badges). */
  overlay?: ReactNode;
  showName?: boolean;
  className?: string;
}

/**
 * The one "sprite on a colour-banded background, with a name band" unit — the user's "mon's colour
 * subframe". Used by the team grid's slot, the creature picker's result card, the trinket picker's
 * result card, and each Modifiers cell's header.
 *
 * Generalized from `CreatureTile` on 2026-10-07: the trinket picker needed the same tile over a
 * rarity colour instead of a type colour, and a second copy differing only in where the background
 * colour came from is exactly what Constitution Principle VII forbids.
 */
export function SpriteTile({
  name,
  colors,
  spriteFile,
  spriteKind,
  spriteSizeVar = "--sprite-picker",
  overlay,
  showName = true,
  className = "",
}: SpriteTileProps) {
  return (
    <ColorSplit colors={colors} className={`${styles.spriteTile} ${className}`}>
      <div className={styles.spriteTileArt}>
        <Sprite spriteFile={spriteFile} kind={spriteKind} sizeVar={spriteSizeVar} alt={name} />
      </div>
      {showName && <div className={styles.spriteTileName}>{name}</div>}
      {overlay}
    </ColorSplit>
  );
}

/* ------------------------------- CreatureTile -------------------------------- */

interface CreatureTileProps {
  name: string;
  types: CreatureType[];
  spriteFile: string | undefined;
  spriteSizeVar?: string;
  overlay?: ReactNode;
  showName?: boolean;
  className?: string;
}

/** A `SpriteTile` whose bands are the creature's types. */
export function CreatureTile({ name, types, spriteFile, spriteSizeVar, overlay, showName = true, className = "" }: CreatureTileProps) {
  return (
    <SpriteTile
      name={name}
      colors={types.map(typeColor)}
      spriteFile={spriteFile}
      spriteKind="monster"
      spriteSizeVar={spriteSizeVar}
      overlay={overlay}
      showName={showName}
      className={className}
    />
  );
}
