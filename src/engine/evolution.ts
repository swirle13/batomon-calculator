import type { Corpus, CreatureRecord } from "../data/types";

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

    // Find any record for this species id (level-agnostic) purely to read its evolution fields
    // -- the chain itself (evolvesInto/evolvesAtLevel) doesn't vary by level for a given id in
    // this corpus's model, only the stats do.
    const anyRecordForId = corpus.creatures.find((c) => c.id === currentId);
    if (!anyRecordForId) return null;

    const { evolvesInto, evolvesAtLevel } = anyRecordForId;
    if (evolvesInto !== undefined && evolvesAtLevel !== undefined && targetLevel >= evolvesAtLevel) {
      currentId = evolvesInto;
      continue;
    }

    // No further evolution applies at targetLevel -- resolve the exact (id, level) record,
    // same lookup discipline as simulate()'s teamMembers construction.
    return corpus.creatures.find((c) => c.id === currentId && c.level === targetLevel) ?? null;
  }
}
