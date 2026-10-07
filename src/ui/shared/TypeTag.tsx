import type { CreatureType } from "../../data/types";
import { TypeChip } from "../primitives";
import styles from "./TypeTag.module.css";

/**
 * A creature type rendered as a colour chip (FR-020, round 3).
 *
 * 2026-10-06 round 7: this is now a thin alias over the shared `Chip` primitive rather than its
 * own styled `<span>` (Constitution Principle VII). It previously defined pill styling that the
 * modifier chips and trinket badges each defined again separately — three definitions of one
 * pattern, which is exactly the divergence Principle VII exists to stop.
 */
export function TypeTag({ type }: { type: CreatureType }) {
  return <TypeChip type={type} />;
}

/**
 * The ALL-type chip (T236 / FR-092) — one rainbow chip, not twelve type chips.
 *
 * Used for creatures Painter has painted and for those natively typed `"All"` (Omnichrome). Both
 * mean the same thing in-game, so they render identically; only their provenance differs.
 */
export function AllTypeTag() {
  return (
    <span className={styles.allChip} title="Every type — counts for any effect that checks typing">
      All
    </span>
  );
}
