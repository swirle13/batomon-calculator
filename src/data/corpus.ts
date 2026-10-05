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

export function getTrainerById(id: string) {
  return corpus.trainers.find((t) => t.id === id) ?? null;
}

/** FR-013: search the creature corpus by case-insensitive name substring. */
export function searchCreatures(query: string): CreatureRecord[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return corpus.creatures;
  return corpus.creatures.filter((c) => c.name.toLowerCase().includes(needle));
}

/** FR-013: filter the creature corpus by type and/or rarity (both optional, combined with AND). */
export function filterCreatures(criteria: { type?: CreatureType; rarity?: Rarity }): CreatureRecord[] {
  return corpus.creatures.filter((c) => {
    if (criteria.type && !c.types.includes(criteria.type)) return false;
    if (criteria.rarity && c.rarity !== criteria.rarity) return false;
    return true;
  });
}
