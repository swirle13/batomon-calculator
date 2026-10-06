import type { CreatureType } from "../../data/types";
import { typeColor } from "../../data/typeColors";

interface TypeTagProps {
  type: CreatureType;
}

/**
 * One canonical type -> color chip (2026-10-05 round 3, FR-020 / data-model.md's "Canonical
 * `CreatureType` color mapping" amendment). Every place a type is shown as a color MUST render
 * through `typeColor()`/`typeBackground()` from `src/data/typeColors.ts` -- this component is
 * the chip half of that; `typeBackground()` (used directly by card backgrounds) is the other.
 * Fixes a defect observed in an external reference UI (research.md E2.4): its card backgrounds
 * were colored by type but its type tag chips were not, two different treatments for the same
 * information.
 */
export function TypeTag({ type }: TypeTagProps) {
  const color = typeColor(type);
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.1rem 0.5rem",
        borderRadius: 999,
        background: color,
        color: "#fff",
        fontSize: "0.8em",
        fontWeight: 600,
        textShadow: "0 1px 2px rgba(0,0,0,0.5)",
      }}
    >
      {type}
    </span>
  );
}
