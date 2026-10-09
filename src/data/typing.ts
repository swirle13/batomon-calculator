import { CREATURE_REGIONS } from "./regions";
import { isWildcardType } from "./vocabularies";
import type { CreatureRecord, RegionId, TeamConfiguration } from "./types";
import { CreatureType } from "./enums";
import { TrainerId, type Species } from "./ids";

/**
 * The ONE type-matching predicate (T230 / FR-086).
 *
 * Every `typeFilter` comparison in the app routes through here. There were six direct
 * `creature.types.includes(...)` sites — `effects.ts` ×2, `simulate.ts` ×2, `corpus.ts`,
 * `CreatureSearchModal.tsx` — and a painted creature has to satisfy all of them, or it is painted
 * for adjacency auras but not for cooldown grants, which is worse than not painting it at all.
 * One predicate, because round 10's lesson was that a duplicated "is this supported?" test drifts.
 *
 * ## Painted and native "All" mean the same thing
 *
 * `CreatureType` already includes `"All"`, and Omnichrome natively carries `types: [CreatureType.All]`.
 * Painter's effect is precisely "make this species an Omnichrome for typing purposes", so both
 * return true for every type. They differ only in provenance: native `"All"` is corpus data,
 * painted is run configuration.
 *
 * This also fixes a pre-existing bug as a side effect — before this, Omnichrome matched *no* type
 * filter, because `["All"].includes("Fire")` is false. The one creature in the game that is every
 * type was the one creature no type-based ability could see.
 */
export function creatureHasType(
  creature: Pick<CreatureRecord, "id" | "types">,
  type: CreatureType,
  config?: TypingConfig,
): boolean {
  // 2026-10-07 (round 7 WI-003): reads the registry's `kind` rather than comparing the literal
  // `"All"`. One predicate, because comparing the wildcard as if it were an element is exactly what
  // caused this function's Omnichrome bug in the first place.
  if (creature.types.some(isWildcardType)) return true;
  if (config?.paintedCreatureIds?.includes(creature.id)) return true;
  if (type === CreatureType.Fire && hasChefFireTyping(creature, config)) return true;
  return creature.types.includes(type);
}

/**
 * What the typing predicate needs from the run.
 *
 * `trainerId` is `Partial` because most callers pass the whole `TeamConfiguration` and a few —
 * corpus filters, picker tests — pass a bare `{ paintedCreatureIds }`. Requiring it would make
 * every one of those a compile error for a field they have no opinion about.
 */
export type TypingConfig = Pick<TeamConfiguration, "paintedCreatureIds"> &
  Partial<Pick<TeamConfiguration, "trainerId">>;

/**
 * One published type, as opposed to two — or the wildcard, which is "every type" and so is the
 * opposite of single-typed however many entries the array has.
 */
export function isSingleTyped(creature: Pick<CreatureRecord, "types">): boolean {
  return creature.types.length === 1 && !creature.types.some(isWildcardType);
}

/**
 * Chef's half of the typing rule: "Your single-typed monsters gain Fire typing" (2026-10-08,
 * user-reported — the ability was card text and nothing else, applying to no monster anywhere).
 *
 * It lands in `creatureHasType` rather than in the engine for the same reason painting does: a
 * monster that counts as Fire has to count as Fire for *every* effect that checks typing — the
 * adjacency auras, the type-filtered item targets, the picker's type filter — or it is Fire for
 * some of them and not the others, which is worse than not granting it at all.
 *
 * Note that this grant is by RULE, not by designation: it is derived from the monster's own typing
 * and the trainer, so there is nothing for the user to pick (see `setDesignatingTrainers.ts`).
 *
 * This is also what the sprite treatment and the extra type chip key off, and deliberately not
 * "Chef affects this monster" (2026-10-08, user-reported: the overlay "should only affect mons
 * that have had the fire type ADDED to them"). Both markings say the same thing — this monster's
 * typing is not what its card says — and a Scorchimp that was already Fire takes the Burn with no
 * change to what it is.
 */
export function hasChefFireTyping(
  creature: Pick<CreatureRecord, "types">,
  config?: TypingConfig,
): boolean {
  if (config?.trainerId !== TrainerId.Chef) return false;
  // A single-typed FIRE monster is granted nothing: it is already what the ability would make it.
  // Without this the treatment landed on Scorchimp and Lignite, which is the "all 6 mons have the
  // fire sprite effect" report — being single-typed is not the same as having gained something.
  return isSingleTyped(creature) && !creature.types.includes(CreatureType.Fire);
}

/** True when this species is painted in the given configuration. Drives the chip and the overlay. */
export function isPainted(
  creatureId: Species,
  config?: Pick<TeamConfiguration, "paintedCreatureIds">,
): boolean {
  return config?.paintedCreatureIds?.includes(creatureId) === true;
}

/** The regions a species belongs to. Empty = belongs to none (events/fossils) OR is unsourced. */
export function regionsOf(creatureId: Species): readonly RegionId[] {
  return CREATURE_REGIONS[creatureId] ?? [];
}

/**
 * Species in the region OPPOSITE to `current` — "in the other region AND not in this one".
 *
 * NOT the set complement (FR-088). 14 species belong to both regions and 13 to neither, so
 * `!== current` would wrongly offer all 27: a dual-region species is not smuggled (you already have
 * it) and a region-less event creature was never regional stock to begin with.
 */
export function isInOppositeRegion(creatureId: Species, current: RegionId | undefined): boolean {
  if (!current) return false;
  const regions = regionsOf(creatureId);
  return regions.length > 0 && !regions.includes(current) ;
}

/**
 * Whether a species is OUT of the run's region — shown as a marker, never used to hide it.
 *
 * ## Why this stopped being a filter
 *
 * It used to exclude out-of-region creatures from the picker. That is wrong, because the region is
 * not a wall: the **Travelling Merchant** event can put a rare creature from another region in your
 * shop, and once it is on your team you have to be able to find it. A filter that hides it makes
 * the tool unable to represent a board the player is looking at — the one thing it must always do.
 * Events, gifts and fossils all create the same situation.
 *
 * So region became information rather than a gate. The picker marks these creatures; it does not
 * remove them, and nothing is unreachable.
 *
 * Returns `false` when no region is chosen (nothing is foreign yet), for region-less species
 * (events and fossils were never regional stock), and for anything smuggled in deliberately.
 */
export function isOutOfRegion(
  creatureId: Species,
  config?: Pick<TeamConfiguration, "selectedRegion" | "smuggledCreatureIds">,
): boolean {
  if (!config?.selectedRegion) return false;
  const regions = regionsOf(creatureId);
  if (regions.length === 0) return false;
  if (regions.includes(config.selectedRegion)) return false;
  return config.smuggledCreatureIds?.includes(creatureId) !== true;
}
