import type { GridSlot } from "../../data/types";
import { GridRow } from "../../data/enums";
import { formatRate } from "../../data/format";
import type { BenchAdvice as BenchAdviceData } from "../../engine/rosterAdvice";
import { Button } from "../primitives";
import styles from "./BenchAdvice.module.css";

/** The grid renders `Back` above `Front`, so name the rows the way the user sees them. */
const slotLabel = (slot: GridSlot) =>
  `${slot.row === GridRow.Top ? "top" : "bottom"} row, slot ${slot.col + 1}`;

/** `+1.2k` / `-340`. The sign is the whole message, so it is never dropped. */
function signedRate(value: number): string {
  return `${value >= 0 ? "+" : "−"}${formatRate(Math.abs(value))}`;
}

interface BenchAdviceProps {
  advice: BenchAdviceData;
  /** Window-average DPS of the board as it stands — every figure here is relative to it. */
  currentDps: number;
  /** The current board's mitigation, so the lineup's can be read as a change rather than a level. */
  currentMitigation: number;
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
export function BenchAdvice({
  advice,
  currentDps,
  currentMitigation,
  isStale,
  onApplyLineup,
}: BenchAdviceProps) {
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
        One swap at a time, against <strong>{formatRate(currentDps)}</strong> now.
      </p>

      {lineup && (
        <div className={styles.lineup}>
          {/*
            A labelled row per kind of change rather than one sentence listing all three.
            The sentence version named up to six monsters and six slots inside a single clause, so
            working out what to actually do meant parsing it; the question here is "what moves
            where", and that is a table.
          */}
          <p className={styles.lineupHeading}>
            Best lineup you own <strong className={styles.lineupDps}>{formatRate(lineup.dps)} DPS</strong>
          </p>
          <dl className={styles.plan}>
            {lineup.bringIn.length > 0 && (
              <>
                <dt>Bring on</dt>
                <dd>{lineup.bringIn.map((b) => `${b.name} → ${slotLabel(b.slot)}`).join(" · ")}</dd>
              </>
            )}
            {lineup.sendOut.length > 0 && (
              <>
                <dt>Bench</dt>
                <dd>{lineup.sendOut.join(" · ")}</dd>
              </>
            )}
            {lineup.moves.length > 0 && (
              <>
                <dt>Move</dt>
                <dd>{lineup.moves.map((m) => `${m.name} → ${slotLabel(m.slot)}`).join(" · ")}</dd>
              </>
            )}
          </dl>
          {/*
            Applies the placements AND the bench together. They are one plan: writing the board
            without the bench would leave the monsters it displaced nowhere, which is the one
            outcome a bench exists to prevent.
          */}
          <Button variant="primary" disabled={isStale} onClick={() => onApplyLineup(lineup)}>
            Apply this lineup
          </Button>
          {/*
            2026-10-08. The lineup is chosen on a score that counts survivability, so it can
            reach a LOWER DPS than the board you already have and still be the right answer.

            Quoting only the DPS there reads as the advisor recommending a downgrade, so the other
            half of the trade is stated — but only when there IS a trade, since a lineup that wins
            on damage alone needs no defending.
          */}
          {lineup.mitigationPerSecond > currentMitigation + 1e-9 && (
            <p className={styles.basis}>
              {lineup.dps < currentDps ? "Less" : "More"} damage behind{" "}
              <strong>{formatRate(lineup.mitigationPerSecond)}</strong> effective HP/s of defence,
              against <strong>{formatRate(currentMitigation)}</strong> now.
            </p>
          )}
        </div>
      )}

      {unreadablePositional.length > 0 && (
        <p className={styles.caveat}>
          {unreadablePositional.join(", ")} {unreadablePositional.length === 1 ? "has a" : "have"}{" "}
          positional {unreadablePositional.length === 1 ? "ability" : "abilities"} the engine does not
          read, so the figures above are understated.
        </p>
      )}
    </div>
  );
}
