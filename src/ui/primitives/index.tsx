import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import type { CreatureType } from "../../data/types";
import { STAT_COLORS, type StatColorKey } from "../../data/statColors";
import { typeColor } from "../../data/typeColors";
import { Sprite, spriteSizeFromToken } from "../shared/Sprite";
import styles from "./primitives.module.css";

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

interface SurfaceProps {
  children: ReactNode;
  tone?: SurfaceTone;
  pad?: SurfacePad;
  className?: string;
  style?: React.CSSProperties;
}

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
export function Surface({ children, tone = "default", pad = "md", className = "", style }: SurfaceProps) {
  return (
    <div className={`${styles.surface} ${TONE_CLASS[tone]} ${PAD_CLASS[pad]} ${className}`} style={style}>
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
}

/** The one pill. Used by type tags, modifier chips, and trinket markers. */
export function Chip({ children, color, onRemove, removeLabel, title }: ChipProps) {
  const toneClass = color ? styles.chipSolid : styles.chipNeutral;
  return (
    <span className={`${styles.chip} ${toneClass}`} style={color ? { background: color } : undefined} title={title}>
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
  return <Chip color={typeColor(type)}>{type}</Chip>;
}

/* --------------------------------- StatBadge --------------------------------- */

interface StatBadgeProps {
  statKey: StatColorKey;
  value: number;
  /** Human-readable stat name, used for the accessible title — the game distinguishes these by
   * colour alone, which is not sufficient on its own. */
  label: string;
}

/** The one colour-coded numeric stat pill, matching the in-game team pane. */
export function StatBadge({ statKey, value, label }: StatBadgeProps) {
  return (
    <span className={styles.statBadge} style={{ background: STAT_COLORS[statKey] }} title={`${label}: ${value}`}>
      {value}
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

/** The one responsive auto-fit grid. Four bespoke copies existed before this. */
export function CardGrid({
  children,
  minWidth = "15rem",
  maxWidth,
  className = "",
}: {
  children: ReactNode;
  minWidth?: string;
  maxWidth?: string;
  className?: string;
}) {
  return (
    <div
      className={`${styles.cardGrid} ${className}`}
      style={{ ["--grid-min" as string]: minWidth, maxWidth, marginInline: maxWidth ? "auto" : undefined }}
    >
      {children}
    </div>
  );
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
          <button type="button" onClick={onClose}>
            {closeLabel}
          </button>
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
  children: ReactNode;
}

/** The one collapsible section. Collapsed by default — an expanded default would still displace
 * the content below it, which is the complaint these exist to fix. */
export function Disclosure({ label, hint, defaultOpen = false, children }: DisclosureProps) {
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

/* --------------------------------- TypeSplit --------------------------------- */

/**
 * A creature's type background as two explicitly-sized halves.
 *
 * Replaces `typeBackground()`'s `linear-gradient(..., A 50%, B 50%, ...)`, which banded the far
 * colour along the element's edge: CSS positions a background against the padding box but paints it
 * across the border box, so a transparent border let the gradient repeat outward on every side
 * (research.md I8). Halves cannot produce that artifact at any size.
 */
export function TypeSplit({ types, children, className = "" }: { types: CreatureType[]; children?: ReactNode; className?: string }) {
  const halves = types.length === 0 ? ["#444857"] : types.length === 1 ? [typeColor(types[0]!)] : types.map(typeColor);
  return (
    <div className={`${styles.typeSplitHost} ${className}`}>
      <div className={styles.typeSplit} aria-hidden="true">
        {halves.map((color, i) => (
          <div key={`${color}-${i}`} className={styles.typeSplitHalf} style={{ background: color }} />
        ))}
      </div>
      {children ? <div className={styles.typeSplitContent}>{children}</div> : null}
    </div>
  );
}

/* ------------------------------- CreatureTile -------------------------------- */

interface CreatureTileProps {
  name: string;
  types: CreatureType[];
  spriteFile: string | undefined;
  spriteSize?: number;
  /** Rendered over the art area (level badge, clear button, stat badges). */
  overlay?: ReactNode;
  showName?: boolean;
  className?: string;
}

/**
 * The one "sprite on a type background, with a name band" unit — the user's "mon's color subframe".
 * Used by the team grid's slot, the creature picker's result card, and the detail card's identity
 * band, which each assembled it separately before.
 */
export function CreatureTile({
  name,
  types,
  spriteFile,
  spriteSize,
  overlay,
  showName = true,
  className = "",
}: CreatureTileProps) {
  return (
    <TypeSplit types={types} className={`${styles.creatureTile} ${className}`}>
      <div className={styles.creatureTileArt}>
        <Sprite spriteFile={spriteFile} kind="monster" size={spriteSize ?? spriteSizeFromToken("--sprite-picker")} alt={name} />
      </div>
      {showName && <div className={styles.creatureTileName}>{name}</div>}
      {overlay}
    </TypeSplit>
  );
}
