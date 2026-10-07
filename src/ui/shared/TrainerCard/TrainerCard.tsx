import { useState, type ReactNode } from "react";
import type { TrainerRecord } from "../../../data/types";
import { Button, Surface } from "../../primitives";
import { Sprite } from "../Sprite";
import { AffectedCreaturePicker } from "./AffectedCreaturePicker";
import styles from "./TrainerCard.module.css";

/**
 * The trainer card (T233 / FR-089), replacing the bare `<select>` that was the entire trainer UI.
 *
 * ## Which trainers get the "affected mons" button, and why it is only two
 *
 * Only trainers that designate an **enumerable set of species** get it. Scanning all 23 trainers
 * (research.md M2/M7) gives exactly two:
 *
 * - **Painter** — paints 9 species with every type.
 * - **Smuggler** — brings 9 species in from the opposite region.
 *
 * **Chef** also grants typing ("your single-typed monsters gain Fire typing") but is rule-based:
 * the affected set is derivable from the board, so there is nothing for the user to pick.
 * **Mad Scientist** and **Monster Ranger** do designate sets, but both are scoped by *day*, and
 * this engine simulates one battle with no day counter — neither has a stable set the player could
 * enumerate for a given fight.
 */
export const SET_DESIGNATING_TRAINERS = {
  painter: {
    label: "Painted species",
    hint: "9 species painted with every type",
    kind: "painted" as const,
  },
  smuggler: {
    label: "Smuggled species",
    hint: "9 species from the opposite region",
    kind: "smuggled" as const,
  },
};

export function designatesCreatureSet(trainerId: string | null | undefined) {
  if (!trainerId) return null;
  return SET_DESIGNATING_TRAINERS[trainerId as keyof typeof SET_DESIGNATING_TRAINERS] ?? null;
}

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
        <div className={styles.header}>
          {/* T255/FR-102. The placeholder holds the art's exact 120x80 footprint, so choosing a
              trainer fills the frame instead of growing the card and shifting the selects beside
              it — which would move the control you just used. */}
          {trainer ? (
            <Sprite spriteFile={trainer.spriteFile} kind="trainer" width={120} height={80} alt={trainer.name} />
          ) : (
            <div className={styles.spritePlaceholder} aria-hidden="true" />
          )}
          <div className={styles.titles}>
            <h3 className={`${styles.name} ${trainer ? "" : styles.namePlaceholder}`}>
              {trainer?.name ?? "No trainer"}
            </h3>
          </div>
        </div>

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

      {controls ? <div className={styles.controls}>{controls}</div> : null}
    </Surface>
  );
}
