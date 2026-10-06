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
interface SpriteProps {
  /** The record's `spriteFile`. Renders nothing when absent. */
  spriteFile: string | undefined;
  /** Selects the subdirectory under `public/sprites/`. */
  kind: "monster" | "trinket";
  /** Rendered size in px. Sprites are uniformly 48x48, so scale with `imageRendering: pixelated`. */
  size?: number;
  /** Usually the record's `name`. */
  alt: string;
  className?: string;
}

/**
 * Reads the `--sprite-grid` token (tasks.md T142/T165) rather than hard-coding a size at the call
 * site. Six call sites each passed their own literal before this; the grid size was an arbitrary
 * 40 with no reasoning behind it (research.md I11).
 */
export function spriteSizeFromToken(token: string, fallback = 64): number {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function spriteGridSize(): number {
  return spriteSizeFromToken("--sprite-grid");
}

export function Sprite({ spriteFile, kind, size = 48, alt, className }: SpriteProps) {
  if (!spriteFile) return null;
  return (
    <img
      src={`${import.meta.env.BASE_URL}sprites/${kind}/${spriteFile}`}
      alt={alt}
      width={size}
      height={size}
      className={className}
      loading="lazy"
      // 48x48 source art: keep the pixel grid crisp when scaled up rather than blurring it.
      style={{ imageRendering: "pixelated", flexShrink: 0 }}
    />
  );
}
