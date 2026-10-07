import { corpus, hasShinyVariant } from "../../../data/corpus";
import { resolveLevelUp } from "../../../engine/evolution";
import { useTeamConfig } from "../../../context/TeamConfigContext";
import type { TeamPlacement } from "../../../data/types";
import styles from "./VariantToggles.module.css";

/**
 * The level (1-4) and SHINY bubbles for a placed creature — FR-087/FR-088 (round 11, WI-R11-001).
 *
 * Replaces the per-slot `<select>` that used to sit under each grid card. Two reasons that control
 * had to go beyond the user asking: a native dropdown cannot express a *mutually exclusive set plus
 * an independent boolean* without becoming two controls, and the grid card is 64px wide, which is
 * where the cramped look came from.
 *
 * ## Why levels and shiny are different widget shapes
 *
 * Levels are radio-like: exactly one is active, and selecting one deselects the others. Shiny is a
 * checkbox: orthogonal to level, and a creature can be shiny at any level. They are rendered as one
 * strip because they describe the same thing (which variant of this creature is on the board), but
 * their ARIA roles differ so the distinction survives for screen readers — `aria-checked` on a
 * radio group for level, `aria-pressed` on a toggle button for shiny.
 *
 * ## Disabled states are deliberate, not defensive
 *
 * A level with no backing corpus record is rendered disabled rather than hidden, so the set of
 * levels does not reflow as you move between creatures. Shiny is disabled when the species has no
 * published shiny stat line (batodex lists them for 134 of ours) — the alternative, letting it
 * toggle to no effect, is the "control that does nothing" failure this project keeps finding.
 */
interface VariantTogglesProps {
  placement: TeamPlacement;
}

const LEVELS = [1, 2, 3, 4] as const;

export function VariantToggles({ placement }: VariantTogglesProps) {
  const { setPlacement, setPlacementShiny } = useTeamConfig();

  // FR-022: a level is offered only if it resolves to a real record, checked through the SAME
  // resolver that performs the swap — so a level is never selectable into a dead end. Evolutions
  // are resolved here too (Panbud@3 -> Bambudo), which is why this goes through `resolveLevelUp`
  // rather than a plain level-field write.
  const resolvable = LEVELS.map((lvl) => ({
    level: lvl,
    target: resolveLevelUp(corpus, placement.creatureId, lvl),
  }));

  const shinyAvailable = hasShinyVariant(placement.creatureId, placement.level);

  return (
    <div className={styles.strip}>
      <div className={styles.group} role="radiogroup" aria-label="Level">
        {resolvable.map(({ level, target }) => {
          const active = placement.level === level;
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={!target}
              className={`${styles.bubble} ${active ? styles.bubbleActive : ""}`}
              title={target ? `Level ${level}` : `No corpus record at level ${level}`}
              onClick={() => target && setPlacement(placement.slot, target.id, level)}
            >
              {level}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        aria-pressed={placement.shiny === true}
        disabled={!shinyAvailable}
        className={`${styles.bubble} ${styles.shiny} ${placement.shiny ? styles.shinyActive : ""}`}
        title={
          shinyAvailable
            ? "Shiny — a different published stat line, not a flat bonus (it is lower for a few species)"
            : "No published shiny stats for this species at this level"
        }
        onClick={() => setPlacementShiny(placement.slot, !placement.shiny)}
      >
        Shiny
      </button>
    </div>
  );
}
