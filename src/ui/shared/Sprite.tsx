/**
 * The single place a vendored sprite becomes an `<img>` (tasks.md T137, research.md H3).
 *
 * Centralised because four call sites need it (`BatomonCard`, the trinket picker, the team grid's
 * slot panes, and `CreatureSearchModal`) and all four need the *same* two easy-to-get-wrong
 * details:
 *
 * 1. **The base path.** This app is served from `/batomon-calculator/`, so a root-relative
 *    `/sprites/...` src works in `npm run dev` and 404s in production. Resolving against
 *    `import.meta.env.BASE_URL` here means no call site can forget.
 * 2. **The absent case.** A record with no `spriteFile` renders *nothing* — not a broken `<img>`,
 *    and not a placeholder box that would shift the layout relative to records that do have one.
 */
/** The subdirectories that exist under `public/sprites/`. Exported so components that merely pass
 * a kind through (`SpriteTile`) cannot drift from the set this component can resolve. */
export type SpriteKind = "monster" | "trinket" | "trainer" | "item";

interface SpriteProps {
  /** The record's `spriteFile`. Renders nothing when absent. */
  spriteFile: string | undefined;
  /** Selects the subdirectory under `public/sprites/`. */
  kind: SpriteKind;
  /**
   * Rendered size in px for SQUARE sprites. Ignored when `width`/`height` are given.
   *
   * Prefer `sizeVar` where a design token governs the size: a number read from CSS in JS is frozen
   * at render time, so a media query that changes the token has no effect until something else
   * re-renders.
   */
  size?: number;
  /**
   * A CSS custom property that governs the rendered size, e.g. `--sprite-grid`.
   *
   * The size is then applied in CSS rather than read into JS, which matters for two reasons the
   * JS route gets wrong: a `@media` rule changing the token takes effect immediately, on resize,
   * with no re-render; and there is no window in which styles have not yet resolved and a fallback
   * number is rendered instead. The `width`/`height` attributes stay at the intrinsic 48x48 so the
   * browser still reserves the right aspect ratio before the image loads.
   */
  sizeVar?: string;
  /**
   * Per-axis tokens, for art that is not square — trainer icons are **120x80**, so a single `size`
   * would letterbox or stretch them. Each overrides `sizeVar` on its own axis.
   *
   * Tokens rather than the numbers they hold, because the only non-square art here is also drawn
   * by a CSS placeholder that reserves its footprint while no trainer is chosen. Passed as numbers,
   * the two sat in different files with nothing tying them together, and a card that resizes on
   * selection is precisely what the placeholder exists to prevent.
   */
  widthVar?: string;
  heightVar?: string;
  /** Usually the record's `name`. */
  alt: string;
  className?: string;
}

/*
 * `spriteSizeFromToken` and `spriteGridSize` were removed 2026-10-07.
 *
 * They read a CSS custom property into JS at render time, which has two defects the `sizeVar` prop
 * above does not: the value is FROZEN at first render, so a `@media` rule changing the token had no
 * effect until something unrelated re-rendered; and before styles resolve the property reads empty,
 * so a fallback number rendered instead — which is how a stale 64 survived a token change to 96.
 *
 * Leaving them alongside `sizeVar` would have left two ways to size a sprite, one of which is
 * quietly wrong.
 */

/** A token if one governs this axis, the plain pixel size otherwise. */
const axis = (token: string | undefined, px: number) => (token ? `var(${token})` : `${px}px`);

export function Sprite({ spriteFile, kind, size = 48, sizeVar, widthVar, heightVar, alt, className }: SpriteProps) {
  if (!spriteFile) return null;
  const sized = {
    width: axis(widthVar ?? sizeVar, size),
    height: axis(heightVar ?? sizeVar, size),
  };
  return (
    <img
      src={`${import.meta.env.BASE_URL}sprites/${kind}/${spriteFile}`}
      alt={alt}
      // Intrinsic source dimensions, so the browser reserves the correct aspect ratio before load.
      // The DISPLAYED size comes from the style below.
      width={48}
      height={48}
      className={className}
      loading="lazy"
      /*
       * NOT NATIVELY DRAGGABLE (2026-10-08, performance).
       *
       * An `<img>` is draggable by default, and the grid's drag handle is a card whose largest
       * target is this sprite — so pressing a Batomon and moving started the BROWSER's own
       * HTML5 image drag at the same time as @dnd-kit's pointer drag. Two things then went wrong,
       * both visible in a Performance recording:
       *
       *  - The native drag fires `pointercancel`, which ends the pointer interaction Chrome was
       *    measuring. One press-drag-release was therefore reported as TWO interactions, and the
       *    second was the expensive one — which is what "INP 104ms" was actually naming.
       *  - Starting it is not free: the browser rasterises a drag image of the element. `dragstart`
       *    measured 40-56ms, the largest single event left in the gesture.
       *
       * Nothing wants the native behaviour. @dnd-kit drags via pointer events and never reads
       * `dataTransfer`, and no DOM `onDragStart`/`onDrop` handler exists anywhere in the app, so
       * the only thing the browser's drag ever did here was fight the one we implement.
       */
      draggable={false}
      /*
       * 48x48 source art: keep the pixel grid crisp when scaled up rather than blurring it.
       *
       * This makes the rendered size matter. `pixelated` maps each source pixel to whole device
       * pixels, so a non-integer scale distributes the remainder unevenly — some source pixels get
       * 2 device pixels and some get 3 — and the art reads as stretched and off-centre. Only
       * integer multiples of 48 are safe: 48, 96, 144, 192.
       *
       * A 112px size was tried and produced exactly that (2.333x); see --sprite-picker in tokens.css.
       */
      style={{ ...sized, imageRendering: "pixelated", flexShrink: 0 }}
    />
  );
}
