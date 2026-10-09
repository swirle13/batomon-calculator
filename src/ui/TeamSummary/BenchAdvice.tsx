import type { GridSlot } from "../../data/types";
import { GridRow } from "../../data/enums";
import { formatRate } from "../../data/format";
import type { BenchAdvice as BenchAdviceData } from "../../engine/rosterAdvice";
import { Button } from "../primitives";
import styles from "./BenchAdvice.module.css";

/** The grid renders `Back` above `Front`, so name the rows the way the user sees them. */
const slotLabel = (slot: GridSlot) =>
  `${slot.row === GridRow.Back ? "top" : "bottom"} row, slot ${slot.col + 1}`;

/** `+1.2k` / `-340`. The sign is the whole message, so it is never dropped. */
function signedRate(value: number): string {
  return `${value >= 0 ? "+" : "−"}${formatRate(Math.abs(value))}`;
}

interface BenchAdviceProps {
  advice: BenchAdviceData;
  /** Window-average DPS of the board as it stands — every figure here is relative to it. */
  currentDps: number;
  /** Disabled while the worker is behind the board; see `PlacementAdvisor`. */
  isStale: boolean;
  onApplyLineup: (lineup: NonNullable<BenchAdviceData["lineup"]>) => void;
}

/**
 * What the bench is worth, as two different answers to two different questions (2026-10-08).
 *
 * **"Is this one worth buying?"** is the swap table. One row per benched monster, each showing
 * the single best straight swap for it and what that does to the team's DPS. Nothing else moves,
 * which is what makes the number actionable: it is the result of one drag.
 *
 * **"What is the best I can field?"** is the lineup. It may bring on two monsters, bench two
 * others and rearrange the rest, so it is a plan rather than a move, and it gets a button that
 * applies the whole thing at once.
 *
 * They are shown together because they disagree usefully. A candidate can be the best single
 * addition and still be absent from the best lineup — it duplicates something already there — and
 * seeing only one of the two would leave that invisible.
 */
export function BenchAdvice({ advice, currentDps, isStale, onApplyLineup }: BenchAdviceProps) {
  const { swaps, lineup, unreadablePositional } = advice;
  if (swaps.length === 0) return null;

  return (
    <div className={styles.bench}>
      <p className={styles.heading}>From your bench</p>

      <ul className={styles.swaps}>
        {swaps.map((swap) => (
          <li key={swap.benchIndex} className={styles.swap}>
            <span className={styles.name}>{swap.name}</span>
            <span className={styles.detail}>
              {swap.replaces === null
                ? `into the empty ${slotLabel(swap.slot)}`
                : `for ${swap.replaces}, ${slotLabel(swap.slot)}`}
            </span>
            <span className={swap.dpsDelta >= 0 ? styles.gain : styles.loss}>
              {signedRate(swap.dpsDelta)}
            </span>
            <span className={styles.resulting}>{formatRate(swap.dps)} DPS</span>
          </li>
        ))}
      </ul>

      <p className={styles.basis}>
        Each row is that one swap alone, with nothing else moving, against your current{" "}
        <strong>{formatRate(currentDps)}</strong> DPS average.
      </p>

      {lineup && (
        <div className={styles.lineup}>
          <p>
            The best lineup from everything you own reaches{" "}
            <strong>{formatRate(lineup.dps)}</strong> DPS average
            {lineup.bringIn.length > 0 && (
              <>
                {" "}
                by bringing on{" "}
                <strong>{lineup.bringIn.map((b) => `${b.name} (${slotLabel(b.slot)})`).join(", ")}</strong>
              </>
            )}
            {lineup.sendOut.length > 0 && <> and benching {lineup.sendOut.join(", ")}</>}
            {lineup.moves.length > 0 && (
              <>
                , moving {lineup.moves.map((m) => `${m.name} to ${slotLabel(m.slot)}`).join(", ")}
              </>
            )}
            .
          </p>
          {/*
            Applies the placements AND the bench together. They are one plan: writing the board
            without the bench would leave the monsters it displaced nowhere, which is the one
            outcome a bench exists to prevent.
          */}
          <Button variant="primary" disabled={isStale} onClick={() => onApplyLineup(lineup)}>
            Apply this lineup
          </Button>
          <p className={styles.searched}>
            Searched {lineup.evaluated} lineups — the selections first, then arrangements of the
            best few, rather than every arrangement of every selection. Exhausting both is hundreds
            of thousands of boards.
          </p>
        </div>
      )}

      {unreadablePositional.length > 0 && (
        <p className={styles.caveat}>
          <strong>{unreadablePositional.join(", ")}</strong>{" "}
          {unreadablePositional.length === 1 ? "has a positional ability" : "have positional abilities"}{" "}
          the engine does not read, so {unreadablePositional.length === 1 ? "its" : "their"} figures
          above are understated by whatever that ability is worth.
        </p>
      )}
    </div>
  );
}
