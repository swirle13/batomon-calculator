import type { ManualTrigger } from "../data/triggers";
import type { CreatureRecord, GridSlot, TeamConfiguration } from "../data/types";
import { selectTargets } from "./effects";

/**
 * Who a single press of a manual trigger lands on (2026-10-07, user-reported).
 *
 * Pressing Brawlmantis's "Win a round" used to add its +10 Damage to Brawlmantis and nobody else,
 * on a board where the ability reads "This and Common allies gain +10 Damage permanently" and two
 * Common allies were placed. The effects were right and the recipients were missing, because the
 * press wrote to the pressing creature's slot by construction — there was no notion of a recipient
 * anywhere between the tag and `addPlacementModifier`.
 *
 * This lives in the engine rather than beside `manualTriggersFor` in `src/data` for one reason:
 * resolving a `TargetSelector` is `selectTargets`' job, and nothing in `src/data` imports the
 * engine. Routing through it also means the board geometry and the type/rarity/level filters are
 * the same ones every ability already uses, so "Common ally" means here exactly what it means to
 * the resolver — including for a painted creature.
 *
 * `includeSelf` is separate from the selector because the ally selectors deliberately exclude the
 * source, while these abilities name the presser separately: "**This** and Common allies".
 */
export function recipientsOfPress<
  T extends { slot: GridSlot; key: string; creature: CreatureRecord },
>(
  trigger: ManualTrigger,
  source: T,
  board: readonly T[],
  config?: Pick<TeamConfiguration, "paintedCreatureIds" | "trinketIds">,
): T[] {
  const selected = selectTargets(trigger.target, source, [...board], config);
  const withSelf = trigger.includeSelf ? [source, ...selected] : selected;

  // The self selector already returns the source, so "self plus includeSelf" would otherwise bank
  // the bonus twice on the same slot.
  const seen = new Set<string>();
  return withSelf.filter((m) => {
    if (seen.has(m.key)) return false;
    seen.add(m.key);
    return true;
  });
}
