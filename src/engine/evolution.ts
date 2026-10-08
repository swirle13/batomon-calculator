import type { Corpus, CreatureRecord } from "../data/types";
import { findCreature } from "../data/corpus";

/**
 * Walks `evolvesInto`/`evolvesAtLevel` chains (contracts/engine-api.md, data-model.md's
 * "Evolution-aware leveling" amendment, 2026-10-05 round 3) to resolve which species a
 * placement should display at `targetLevel`, starting from `baseSpeciesId`.
 *
 * - A species with no `evolvesInto` resolves to itself at `targetLevel`.
 * - A species whose `evolvesAtLevel` is at or below `targetLevel` resolves transitively through
 *   `evolvesInto` (so a multi-stage chain keeps walking until no further evolution applies at
 *   `targetLevel`, or until a cycle/missing link is detected).
 * - Resolution ends with an exact `(id, level)` lookup — same discipline as `simulate()`'s
 *   lookup-fix amendment: this function NEVER falls back to a different level's record. If the
 *   resolved species has no record at `targetLevel`, it returns `null`.
 */
export function resolveLevelUp(
  corpus: Corpus,
  baseSpeciesId: string,
  targetLevel: 1 | 2 | 3 | 4,
): CreatureRecord | null {
  let currentId = baseSpeciesId;
  const visited = new Set<string>();

  while (true) {
    if (visited.has(currentId)) {
      // Cycle guard: a malformed corpus (A evolves into B, B evolves into A) must not loop
      // forever. Not expected from real data, but this function's contract is to never hang.
      return null;
    }
    visited.add(currentId);

    // The evolution chain lives on the SPECIES, not on a level record -- it never varied by level,
    // which is why the 2026-10-08 collapse could hoist it without changing what this reads.
    const species = corpus.creatures.find((c) => c.id === currentId);
    if (!species) return null;

    const { evolvesInto, evolvesAtLevel } = species;
    if (evolvesInto !== undefined && evolvesAtLevel !== undefined && targetLevel >= evolvesAtLevel) {
      currentId = evolvesInto;
      continue;
    }

    // No further evolution applies at targetLevel -- resolve the exact (id, level) record,
    // same lookup discipline as simulate()'s teamMembers construction.
    return findCreature(corpus, currentId, targetLevel);
  }
}
