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
  size: number;
  alt: string;
  /** Painted by Painter, or natively `All`-typed. */
  painted?: boolean;
  className?: string;
}

export function CreatureSprite({ spriteFile, size, alt, painted, className }: CreatureSpriteProps) {
  if (!spriteFile) return null;

  const url = `${import.meta.env.BASE_URL}sprites/monster/${spriteFile}`;

  return (
    <span
      className={`${styles.wrap} ${painted ? styles.painted : ""} ${className ?? ""}`}
      // The mask needs the same URL the <img> resolves, so it is passed as a custom property
      // rather than duplicating the path-building that `Sprite` already owns.
      style={{ width: size, height: size, "--sprite-url": `url("${url}")` } as CSSProperties}
    >
      <Sprite spriteFile={spriteFile} kind="monster" size={size} alt={alt} />
    </span>
  );
}
