import { AffectedSpeciesKind } from "../../../data/enums";

/**
 * Which trainers designate an enumerable set of species, and what to call that set.
 *
 * ## Why this is not in TrainerCard.tsx, which is its only consumer
 *
 * React Fast Refresh can only hot-swap a module whose exports are all components. A module that
 * also exports a plain object gets a NEW object identity on every re-evaluation, which the refresh
 * runtime reads as an incompatible export and answers by invalidating the module instead of
 * swapping it — so the whole importing tree remounts on every save:
 *
 *     [vite] hmr invalidate /src/ui/shared/TrainerCard/TrainerCard.tsx
 *            Could not Fast Refresh ("SET_DESIGNATING_TRAINERS" export is incompatible)
 *
 * `designatesCreatureSet` moves with it: a lowercase-named function is not a component either, so
 * leaving it behind would keep the module off the refresh path for the same reason.
 *
 * ## Which trainers get the "affected mons" button, and why it is only two (T233 / FR-089)
 *
 * Only trainers that designate an **enumerable set of species**. Scanning all 23 trainers
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
    kind: AffectedSpeciesKind.Painted,
  },
  smuggler: {
    label: "Smuggled species",
    hint: "9 species from the opposite region",
    kind: AffectedSpeciesKind.Smuggled,
  },
};

export function designatesCreatureSet(trainerId: string | null | undefined) {
  if (!trainerId) return null;
  return SET_DESIGNATING_TRAINERS[trainerId as keyof typeof SET_DESIGNATING_TRAINERS] ?? null;
}
