import { useMemo, useState } from "react";
import { filterCreatures, searchCreatures } from "../../data/corpus";
import type { CreatureType, Rarity } from "../../data/types";
import { RARITIES_ASC, rarityLabel } from "../../data/statColors";
import { FILTERABLE_CREATURE_TYPES } from "../../data/vocabularies";
import { BatomonCard } from "../shared/BatomonCard/BatomonCard";
import { Field, Select, TextField } from "../primitives";
import styles from "./CorpusBrowser.module.css";

/*
 * FR-067 (WI-016): sorted at the point of display. This was a hard-coded, non-alphabetical array --
 * a list in the very view the user screenshotted, while the picker's equivalent list WAS sorted, so
 * the app contradicted itself. The ask covers lists "anywhere in this site", not just creature lists.
 *
 * 2026-10-07 (round 7 WI-003): the hand-written member list is gone, derived from the
 * `CREATURE_TYPE` registry instead. It had restated all fifteen members, so a new type would have
 * been filterable in the pickers and invisible here. `FILTERABLE_CREATURE_TYPES` also withholds the
 * `"All"` wildcard, which this list used to offer as though it were an element -- selecting it
 * filtered to the single species that carries it rather than matching everything, which is the
 * opposite of what it means.
 */
const TYPES: CreatureType[] = [...FILTERABLE_CREATURE_TYPES].sort((a, b) => a.localeCompare(b));

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
      <div className={styles.filters}>
        <Field label="Search" inline>
          <TextField
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Creature name…"
          />
        </Field>
        <Field label="Type" inline>
          <Select value={type} onChange={(e) => setType(e.target.value as CreatureType | "")}>
            <option value="">(any)</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Rarity" inline>
          <Select value={rarity} onChange={(e) => setRarity(e.target.value as Rarity | "")}>
            <option value="">(any)</option>
            {RARITIES_ASC.map((r) => (
              <option key={r} value={r}>
                {rarityLabel(r)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {results.length === 0 && <p>No creatures match this search/filter combination.</p>}

      <div className={styles.results}>
        {results.map((creature) => (
          <BatomonCard key={creature.id} creature={creature} fixedHeight="browser" />
        ))}
      </div>
    </div>
  );
}
