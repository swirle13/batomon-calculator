import type { Corpus, CreatureRecord, CreatureType, Rarity } from "./types";
import { creatures } from "./creatures";
import { trainers } from "./trainers";
import { trinkets } from "./trinkets";
import { items } from "./items";

/**
 * The single assembled corpus lookup object. UI and engine code should import `corpus` from
 * here rather than importing the individual arrays directly (Constitution Principle I — data
 * layer presents one stable surface to its consumers).
 */
export const corpus: Corpus = {
  creatures,
  trainers,
  trinkets,
  items,
};

export function getCreatureById(id: string) {
  return corpus.creatures.find((c) => c.id === id) ?? null;
}

/**
 * 2026-10-06 round 5: one representative record per species, for UI listings (search modal,
 * dropdowns, Corpus Browser search/filter) that must show each species exactly once rather
 * than once per level. `corpus.creatures` now holds up to 4 records per species (one per
 * level, since round 5's level 2-4 corpus population) -- level-1 is always present and used as
 * the canonical representative; level-specific stats are resolved separately via
 * `getCreatureByIdAndLevel`/`resolveLevelUp` once a specific placement's level is known.
 */
export const distinctCreatures: CreatureRecord[] = corpus.creatures.filter((c) => c.level === 1);

/**
 * 2026-10-05 round 2 — level-aware lookup, matching the (id, level) key `simulate()` now
 * requires (data-model.md's lookup-fix amendment). `getCreatureById` above is kept for existing
 * callers that don't yet care about level (every corpus record is still level 1 today).
 */
export function getCreatureByIdAndLevel(id: string, level: number) {
  return corpus.creatures.find((c) => c.id === id && c.level === level) ?? null;
}

/** Every level the corpus actually has a record for, for a given species id — sorted
 * ascending. Drives the GridPicker level selector so it never offers a level with no backing
 * data (data-model.md: "restricted to levels the corpus actually has a record for"). */
export function getAvailableLevelsFor(id: string): number[] {
  return corpus.creatures
    .filter((c) => c.id === id)
    .map((c) => c.level)
    .sort((a, b) => a - b);
}

export function getTrainerById(id: string) {
  return corpus.trainers.find((t) => t.id === id) ?? null;
}

/** FR-013: search the creature corpus by case-insensitive name substring. Searches
 * `distinctCreatures` (one row per species, round 5) -- never one row per level. */
export function searchCreatures(query: string): CreatureRecord[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return distinctCreatures;
  return distinctCreatures.filter((c) => c.name.toLowerCase().includes(needle));
}

/** FR-013: filter the creature corpus by type and/or rarity (both optional, combined with AND).
 * Filters `distinctCreatures` (round 5) for the same one-row-per-species reason as above. */
export function filterCreatures(criteria: { type?: CreatureType; rarity?: Rarity }): CreatureRecord[] {
  return distinctCreatures.filter((c) => {
    if (criteria.type && !c.types.includes(criteria.type)) return false;
    if (criteria.rarity && c.rarity !== criteria.rarity) return false;
    return true;
  });
}
