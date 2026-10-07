import { CREATURE_REGIONS } from "./regions";
import type { CreatureRecord, CreatureType, RegionId, TeamConfiguration } from "./types";

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
 * `CreatureType` already includes `"All"`, and Omnichrome natively carries `types: ["All"]`.
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
  config?: Pick<TeamConfiguration, "paintedCreatureIds">,
): boolean {
  if (creature.types.includes("All")) return true;
  if (config?.paintedCreatureIds?.includes(creature.id)) return true;
  return creature.types.includes(type);
}

/** True when this species is painted in the given configuration. Drives the chip and the overlay. */
export function isPainted(
  creatureId: string,
  config?: Pick<TeamConfiguration, "paintedCreatureIds">,
): boolean {
  return config?.paintedCreatureIds?.includes(creatureId) === true;
}

/** The regions a species belongs to. Empty = belongs to none (events/fossils) OR is unsourced. */
export function regionsOf(creatureId: string): readonly RegionId[] {
  return CREATURE_REGIONS[creatureId] ?? [];
}

/**
 * Species in the region OPPOSITE to `current` — "in the other region AND not in this one".
 *
 * NOT the set complement (FR-088). 14 species belong to both regions and 13 to neither, so
 * `!== current` would wrongly offer all 27: a dual-region species is not smuggled (you already have
 * it) and a region-less event creature was never regional stock to begin with.
 */
export function isInOppositeRegion(creatureId: string, current: RegionId | undefined): boolean {
  if (!current) return false;
  const regions = regionsOf(creatureId);
  return regions.length > 0 && !regions.includes(current) ;
}

/**
 * Whether a species is obtainable this run: in the selected region, or smuggled in, or region-less.
 *
 * Region-less species stay available deliberately — they are events, fossils and shop-only
 * creatures rather than regional stock, so gating them behind a region would hide them entirely
 * and break teams that already use them.
 */
export function isAvailableInRun(
  creatureId: string,
  config?: Pick<TeamConfiguration, "selectedRegion" | "smuggledCreatureIds">,
): boolean {
  if (!config?.selectedRegion) return true; // no region chosen yet — nothing is filtered out
  const regions = regionsOf(creatureId);
  if (regions.length === 0) return true;
  if (regions.includes(config.selectedRegion)) return true;
  return config.smuggledCreatureIds?.includes(creatureId) === true;
}
