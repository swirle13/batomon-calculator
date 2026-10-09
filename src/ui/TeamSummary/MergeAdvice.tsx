import type { GridSlot } from "../../data/types";
import { GridRow } from "../../data/enums";
import { formatRate } from "../../data/format";
import type { MergeSuggestion } from "../../engine/rosterAdvice";
import { Button } from "../primitives";
import styles from "./MergeAdvice.module.css";

/** The grid renders `Back` above `Front`, so name the rows the way the user sees them. */
const slotLabel = (slot: GridSlot) =>
  `${slot.row === GridRow.Top ? "top" : "bottom"} row, slot ${slot.col + 1}`;

/** `+1.2k` / `-340`. The sign is the whole message, so it is never dropped. */
function signedRate(value: number): string {
  return `${value >= 0 ? "+" : "−"}${formatRate(Math.abs(value))}`;
}

interface MergeAdviceProps {
  merges: MergeSuggestion[];
  /** Window-average DPS of the board as it stands — every delta here is relative to it. */
  currentDps: number;
  /** Disabled while the worker is behind the board; see `PlacementAdvisor`. */
  isStale: boolean;
  onApply: (merge: MergeSuggestion) => void;
}

/**
 * "Would levelling this up be worth it?" — the duplicates half of the advice (2026-10-09).
 *
 * ## Why this is a section of its own
 *
 * Every other figure in the panel takes the roster's levels as given. A merge changes one, and it
 * does so by SPENDING monsters, which makes it the only suggestion here that costs something other
 * than a rearrangement. Folding it into the bench's swap table would have put a row that consumes
 * three monsters beside rows that consume none, under a heading ("one swap at a time") that was
 * then false of one of them.
 *
 * ## Both figures are quoted, always
 *
 * A merge can empty a grid slot, so the board immediately afterwards may be worse even when the
 * merge is right. The row therefore states what merging alone reaches AND what the shrunken roster
 * reaches once the vacancy is filled — the second being what the bench section will then walk them
 * through, since applying a merge leaves the panel looking at a new board.
 */
export function MergeAdvice({ merges, currentDps, isStale, onApply }: MergeAdviceProps) {
  if (merges.length === 0) return null;

  return (
    <div className={styles.merge}>
      <p className={styles.heading}>Level up by merging</p>

      <ul className={styles.rows}>
        {merges.map((merge) => {
          /*
           * Named by the merge itself rather than by an index. Two groups of the same species at
           * different levels are two distinct rows — three Lv.1s and two Lv.2s can both be
           * available — and the level is part of `from`, so this separates them.
           */
          const key = `${merge.from}->${merge.to}`;
          const refield = merge.bestDps !== null && merge.bestDps > merge.dps + 0.05;
          return (
            <li key={key} className={styles.row}>
              <div className={styles.figures}>
                <span className={styles.name}>
                  {merge.from} ×{merge.copies}
                </span>
                <span className={styles.detail}>
                  → {merge.to}
                  {merge.destination ? `, ${slotLabel(merge.destination)}` : ", on your bench"}
                </span>
                <span className={merge.dpsDelta >= 0 ? styles.gain : styles.loss}>
                  {signedRate(merge.dpsDelta)}
                </span>
                <span className={styles.resulting}>{formatRate(merge.dps)} DPS</span>
              </div>
              {/*
                The price, stated as monsters rather than as a number. "Spends 2 more copies" is
                the part of the decision a DPS delta cannot carry: those copies could have been
                fielded instead, which is precisely what the bench table above prices them at.
              */}
              <p className={styles.cost}>
                Spends {merge.copies - 1} more {merge.copies - 1 === 1 ? "copy" : "copies"}
                {merge.vacated.length > 0 && (
                  <>
                    , emptying {merge.vacated.map(slotLabel).join(" and ")}
                  </>
                )}
                {refield && (
                  <>
                    {" "}
                    — <strong>{formatRate(merge.bestDps!)} DPS</strong> once you re-field what is left
                  </>
                )}
                .
              </p>
              <Button
                /*
                 * Applies the MERGE only, not the re-fielding. One action per button, and the
                 * board it leaves is one the panel immediately has advice about: the bench section
                 * will name the monster to bring on next, costed against the new board rather
                 * than predicted from the old one.
                 */
                disabled={isStale}
                onClick={() => onApply(merge)}
              >
                Merge into {merge.to}
              </Button>
            </li>
          );
        })}
      </ul>

      <p className={styles.basis}>
        Against <strong>{formatRate(currentDps)}</strong> now. Three Lv.1 copies make a Lv.2 and two
        Lv.2 copies make a Lv.3; Lv.4 comes from trinkets and items, so it is never offered here.
      </p>
    </div>
  );
}
