import { useState } from "react";
import type { TrainerRecord } from "../../../data/types";
import { Disclosure, Surface } from "../../primitives";
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
  trainer: TrainerRecord;
}

export function TrainerCard({ trainer }: TrainerCardProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const designation = designatesCreatureSet(trainer.id);
  const unconfirmed = trainer.unconfirmedFields?.includes("abilityText");

  return (
    <Surface className={styles.card}>
      <div className={styles.header}>
        {/* T255/FR-102 */}
        <Sprite spriteFile={trainer.spriteFile} kind="trainer" size={40} alt={trainer.name} />
        <h3 className={styles.name}>{trainer.name}</h3>
        {unconfirmed && (
          <span className={styles.unconfirmed} title="This ability text is not yet confirmed against a primary source">
            unconfirmed
          </span>
        )}
      </div>

      <p className={styles.ability}>{trainer.abilityText}</p>

      {/* An ability we previously recorded wrongly stays visible rather than vanishing, so a user
          who remembers the old text can see it was corrected rather than wonder if we lost it. */}
      {trainer.supersededText && (
        <Disclosure label="Previously recorded (corrected)" hint="(superseded)">
          <p className={styles.superseded}>{trainer.supersededText}</p>
        </Disclosure>
      )}

      {designation && (
        <>
          <button type="button" className={styles.showButton} onClick={() => setPickerOpen(true)}>
            {designation.label} <span className={styles.hint}>— {designation.hint}</span>
          </button>
          {pickerOpen && (
            <AffectedCreaturePicker kind={designation.kind} onClose={() => setPickerOpen(false)} />
          )}
        </>
      )}
    </Surface>
  );
}
