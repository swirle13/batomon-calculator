import type { CSSProperties } from "react";
import { Sprite } from "./Sprite";
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
   * Touched by Chef — single-typed and so granted Fire, or Fire already and so carrying the +2
   * Burn (2026-10-08). Yields to `painted`: a creature that is every type is already wearing an
   * overlay that says its typing is not what the card says, and stacking a second one over it
   * would only make both harder to read.
   */
  chefFire?: boolean;
  className?: string;
}

export function CreatureSprite({ spriteFile, size, sizeVar, alt, painted, chefFire, className }: CreatureSpriteProps) {
  if (!spriteFile) return null;

  const url = `${import.meta.env.BASE_URL}sprites/monster/${spriteFile}`;
  // The wrapper carries the painted overlay, so it must track the image exactly. Sizing both from
  // the same source — a var or a number — is what keeps the mask aligned to the artwork.
  const box = sizeVar ? `var(${sizeVar})` : `${size ?? 48}px`;

  return (
    <span
      className={`${styles.wrap} ${painted ? styles.painted : chefFire ? styles.chefFire : ""} ${className ?? ""}`}
      // The mask needs the same URL the <img> resolves, so it is passed as a custom property
      // rather than duplicating the path-building that `Sprite` already owns.
      style={{ width: box, height: box, "--sprite-url": `url("${url}")` } as CSSProperties}
    >
      <Sprite spriteFile={spriteFile} kind="monster" size={size} sizeVar={sizeVar} alt={alt} />
    </span>
  );
}
