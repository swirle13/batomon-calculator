import { useMemo, useState } from "react";
import { filterCreatures, searchCreatures } from "../../data/corpus";
import type { CreatureType, Rarity } from "../../data/types";
import { RARITIES_ASC } from "../../data/statColors";
import { BatomonCard } from "../shared/BatomonCard/BatomonCard";
import styles from "./CorpusBrowser.module.css";

/* FR-067 (WI-016): sorted at the point of display. This was a hard-coded, non-alphabetical array --
   a list in the very view the user screenshotted, while the picker's equivalent list WAS sorted, so
   the app contradicted itself. The ask covers lists "anywhere in this site", not just creature lists. */
const TYPES: CreatureType[] = [
  "Fire", "Water", "Electric", "Toxic", "Flying", "Rock", "Grass", "Bug",
  "Steel", "Dragon", "Ghost", "Fighting", "Curio", "NULL", "All",
].sort() as CreatureType[];

/**
 * User Story 3: search/filter the corpus (FR-013).
 *
 * 2026-10-06 round 6: each result now renders through the shared `BatomonCard` (FR-028 — the same
 * component the Calculator's selected-creature panel uses, so the two can't drift), laid out in a
 * multi-column grid (FR-031).
 *
 * **Source citations, patch tags, and recorded source conflicts are deliberately NOT rendered
 * here** (FR-030, user-requested). That data is unchanged and still mandatory on every record —
 * what moved is only where it is enforced: `src/data/__tests__/provenance.test.ts` now asserts
 * every record is cited and every recorded conflict is well-formed, which is how SC-004 is met
 * without a disclosure widget a reader has to click past. See spec.md's round 6 Amendment.
 *
 * Listings iterate `distinctCreatures` (one record per species), not `corpus.creatures` — since
 * round 5 the latter holds up to 4 level records per species and would show duplicate cards.
 */
export function CorpusBrowser() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<CreatureType | "">("");
  const [rarity, setRarity] = useState<Rarity | "">("");

  const results = useMemo(() => {
    const byQuery = searchCreatures(query);
    const byFilter = filterCreatures({ type: type || undefined, rarity: rarity || undefined });
    const filterIds = new Set(byFilter.map((c) => c.id));
    return byQuery.filter((c) => filterIds.has(c.id));
  }, [query, type, rarity]);

  return (
    <div>
      <h2>Batomon Browser</h2>
      <p className={styles.filters}>
        <label>
          Search:{" "}
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Creature name…" />
        </label>
        <label>
          Type:{" "}
          <select value={type} onChange={(e) => setType(e.target.value as CreatureType | "")}>
            <option value="">(any)</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Rarity:{" "}
          <select value={rarity} onChange={(e) => setRarity(e.target.value as Rarity | "")}>
            <option value="">(any)</option>
            {RARITIES_ASC.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      </p>

      {results.length === 0 && <p>No creatures match this search/filter combination.</p>}

      <div className={styles.results}>
        {results.map((creature) => (
          <BatomonCard key={creature.id} creature={creature} fixedHeight="browser" />
        ))}
      </div>
    </div>
  );
}
