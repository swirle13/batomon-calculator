import type { CSSProperties } from "react";
import { Sprite } from "./Sprite";
import { spriteVerticalOffset } from "../../data/spriteOffsets";
import styles from "./CreatureSprite.module.css";

/**
 * A creature's sprite, including its painted-type treatment — the ONE place that pairing lives.
 *
 * ## Why this exists
 *
 * The rainbow overlay was applied by whichever call site happened to know about painting. Exactly
 * one did. `BatomonCard` put the class on its `.spriteFrame` wrapper and the team grid rendered a
 * bare `<Sprite>`, so the same painted creature was rainbow in the detail panel and plain on the
 * board — the two places a user compares side by side.
 *
 * Pairing "sprite" with "is it painted" in a component means a call site cannot render one without
 * the other, which is the only thing that keeps them in step.
 *
 * ## Why the overlay is masked to the artwork
 *
 * Putting it on the frame tinted the whole square, including the empty space around the creature.
 * The overlay is masked by the sprite itself, so the rainbow follows the creature's own silhouette
 * and the transparent background stays transparent.
 */
interface CreatureSpriteProps {
  spriteFile: string | undefined;
  /** Fixed px size. Prefer `sizeVar` when a token governs it — see `Sprite`. */
  size?: number;
  /** CSS custom property governing the size, e.g. `--sprite-grid`. Wins over `size`. */
  sizeVar?: string;
  alt: string;
  /** Painted by Painter, or natively `All`-typed. */
  painted?: boolean;
  /**
   * GRANTED Fire typing by Chef (2026-10-08). Like `painted`, the treatment marks a creature whose
   * typing is not what its card says — so a creature that was already Fire does not get it, even
   * though Chef's Burn reaches it too.
   *
   * Yields to `painted`: that overlay already says this creature's typing is not its own, and
   * stacking a second one over it would only make both harder to read.
   */
  chefFire?: boolean;
  /**
   * Centre the ARTWORK in the box rather than the canvas it is drawn on (2026-10-09).
   *
   * The vendored sprites are ground-anchored — a median 6px of transparent headroom against 1px
   * underfoot — so a box that centres the canvas renders the creature visibly low. Each sprite's
   * own lean comes from `spriteOffsets.ts`; the spread runs from 0 to 24 source px, so there is no
   * single nudge that would do.
   *
   * OPT-IN, because the lean is correct where sprites stand on a shared line: the team grid reads
   * as a board, and lifting each creature by a different amount there would leave them floating at
   * different heights. It is the bordered single-sprite well on the detail card that needs this.
   */
  opticalCenter?: boolean;
  className?: string;
}

export function CreatureSprite({
  spriteFile,
  size,
  sizeVar,
  alt,
  painted,
  chefFire,
  opticalCenter,
  className,
}: CreatureSpriteProps) {
  if (!spriteFile) return null;

  const url = `${import.meta.env.BASE_URL}sprites/monster/${spriteFile}`;
  // The wrapper carries the painted overlay, so it must track the image exactly. Sizing both from
  // the same source — a var or a number — is what keeps the mask aligned to the artwork.
  const box = sizeVar ? `var(${sizeVar})` : `${size ?? 48}px`;
  const lean = opticalCenter ? spriteVerticalOffset(spriteFile) : 0;

  return (
    <span
      className={`${styles.wrap} ${painted ? styles.painted : chefFire ? styles.chefFire : ""} ${className ?? ""}`}
      // The mask needs the same URL the <img> resolves, so it is passed as a custom property
      // rather than duplicating the path-building that `Sprite` already owns.
      style={{
        width: box,
        height: box,
        /*
         * Offset via `top` on the already-relative wrapper, against the sprite's OWN box.
         *
         * A percentage `top` would resolve against the containing block — the card's 84px well,
         * not the 96px sprite — and a transform would promote a layer and resample artwork that
         * `image-rendering: pixelated` exists to keep sharp. The calc lands on a whole pixel at
         * any integer scale of the source, because the lean is always a whole number of half
         * source pixels.
         *
         * The painted/Chef overlays are `inset: 0` on this element, so they travel with it and
         * stay masked to the artwork.
         */
        top: lean ? `calc(${box} * ${-lean})` : undefined,
        "--sprite-url": `url("${url}")`,
      } as CSSProperties}
    >
      <Sprite spriteFile={spriteFile} kind="monster" size={size} sizeVar={sizeVar} alt={alt} />
    </span>
  );
}
