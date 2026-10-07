import { runColor, tokenizeAbilityText } from "../../data/abilityHighlight";

/**
 * Ability text with its keywords coloured in place (2026-10-07, round 7 WI-007 / FR-115).
 *
 * The ONE renderer for this, so the Corpus Browser, the Calculator's selected-creature panel and any
 * future surface cannot drift to different reds — the colours come from the same `STAT_COLORS` layer
 * that paints the stat badges directly above the text (Principle VII).
 *
 * All the matching lives in `tokenizeAbilityText`; this is deliberately thin enough that there is
 * nothing here to get wrong and nothing to test through the DOM.
 *
 * **Trainers are out of scope.** The ask was "for all mon's ability text", and `TrainerCard` renders
 * its own `abilityText` plainly at a different size. This component would work there unchanged if
 * that is wanted later; it is not used there yet, and saying so here is cheaper than leaving the
 * inconsistency to be rediscovered.
 */
export function AbilityText({ text, className }: { text: string; className?: string }) {
  return (
    <p className={className}>
      {tokenizeAbilityText(text).map((run, i) => {
        const color = runColor(run);
        // Plain prose stays a bare string: a creature whose text contains no keyword must render
        // exactly as it did before, with no wrapper spans to change inline layout.
        if (color === undefined) return run.text;
        return (
          <span key={i} style={{ color, fontWeight: 600 }}>
            {run.text}
          </span>
        );
      })}
    </p>
  );
}
