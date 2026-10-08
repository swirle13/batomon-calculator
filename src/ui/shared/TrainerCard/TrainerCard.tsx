import { useState, type ReactNode } from "react";
import type { TrainerRecord } from "../../../data/types";
import { Button, Surface } from "../../primitives";
import { Sprite } from "../Sprite";
import { AffectedCreaturePicker } from "./AffectedCreaturePicker";
import { designatesCreatureSet } from "./setDesignatingTrainers";
import styles from "./TrainerCard.module.css";

/**
 * The trainer card (T233 / FR-089), replacing the bare `<select>` that was the entire trainer UI.
 *
 * Which trainers get the "affected mons" button — and why the answer is exactly two — is recorded
 * beside the table that decides it, in `setDesignatingTrainers.ts`.
 */

interface TrainerCardProps {
  /**
   * `null` renders the card's EMPTY state rather than nothing at all (2026-10-07).
   *
   * The card used to be mounted only once a trainer was chosen, and the region and trainer selects
   * sat above it. Now that those selects live in this card's right half, not rendering the card
   * would take the only control that can choose a trainer off the page whenever none is chosen —
   * so the empty state is what makes the card's own content reachable.
   */
  trainer: TrainerRecord | null;
  /**
   * The region and trainer selects, stacked in the card's right half.
   *
   * A SLOT rather than the selects themselves: this component is a presentation of a trainer record
   * and is rendered in tests with no `TeamConfigProvider`. Reading the run's configuration here to
   * build its own controls would couple it to that context, which is the coupling `painted` was
   * deliberately kept out of `BatomonCard` for.
   */
  controls?: ReactNode;
}

export function TrainerCard({ trainer, controls }: TrainerCardProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const designation = designatesCreatureSet(trainer?.id);

  return (
    <Surface className={styles.card}>
      <div className={styles.identity}>
        {/* T255/FR-102. The placeholder holds the art's exact footprint, so choosing a trainer
            fills the frame instead of growing the card and shifting the selects beside it — which
            would move the control you just used. Both read the same two tokens; the sprite used to
            carry the 120x80 as literal props, with only a comment tying it to the placeholder. */}
        {trainer ? (
          <Sprite
            spriteFile={trainer.spriteFile}
            kind="trainer"
            widthVar="--sprite-trainer-width"
            heightVar="--sprite-trainer-height"
            alt={trainer.name}
          />
        ) : (
          <div className={styles.spritePlaceholder} aria-hidden="true" />
        )}
        <h3 className={`${styles.name} ${trainer ? "" : styles.namePlaceholder}`}>
          {trainer?.name ?? "No trainer"}
        </h3>
      </div>

      {controls ? <div className={styles.controls}>{controls}</div> : null}

      {/* Spans BOTH columns, below them (2026-10-07). Confined to the left half it wrapped to five
          lines for the wordiest trainer and made the card grow by ~90px on selection; at the card's
          full width the longest ability in the corpus takes two. */}
      <div className={styles.footer}>
        <p className={`${styles.ability} ${trainer ? "" : styles.abilityPlaceholder}`}>
          {trainer?.abilityText ?? "Choose a trainer to see their ability."}
        </p>

        {designation && (
          <>
            <Button size="sm" className={styles.showButton} onClick={() => setPickerOpen(true)}>
              {designation.label} <span className={styles.hint}>— {designation.hint}</span>
            </Button>
            {pickerOpen && (
              <AffectedCreaturePicker kind={designation.kind} onClose={() => setPickerOpen(false)} />
            )}
          </>
        )}
      </div>
    </Surface>
  );
}
