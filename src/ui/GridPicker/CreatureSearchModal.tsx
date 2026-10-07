import { useEffect, useMemo, useRef, useState } from "react";
import type { CreatureType, GridSlot, Rarity } from "../../data/types";
import { distinctCreatures } from "../../data/corpus";
import { RARITIES_DESC, RARITY_COLORS } from "../../data/statColors";
import { slotKey } from "../../engine/grid";
import { CardGrid, CreatureTile, Modal } from "../primitives";
import styles from "./CreatureSearchModal.module.css";
import { creatureHasType, isAvailableInRun } from "../../data/typing";
import type { TeamConfiguration } from "../../data/types";

interface CreatureSearchModalProps {
  /** `null` = closed. Changing to a different slot while already open re-triggers the
   * clear+autofocus effect below, same as opening fresh (FR-018). */
  slot: GridSlot | null;
  onClose: () => void;
  onSelect: (creatureId: string | null) => void;
  /**
   * The run's configuration, for painting and region availability. A PROP rather than a context
   * read: this modal is rendered standalone in tests and must not require a `TeamConfigProvider`.
   * Omitted means "no run context", which correctly filters nothing.
   */
  config?: Pick<TeamConfiguration, "paintedCreatureIds" | "selectedRegion" | "smuggledCreatureIds">;
}

/**
 * FR-018 (round 3): clears its query and refocuses the search field every time it opens for a new
 * slot, so the first thing a user sees is never a stale, over-filtered list.
 *
 * 2026-10-06 round 7 (FR-048/FR-049), rebuilt on the primitives layer — this file had 14 inline
 * `style={{}}` blocks and now has none:
 *
 * - **Rarity is structure, not a label.** Results are grouped into rarity sections with a small
 *   left-justified heading, instead of each card carrying a `rarity · type/type` line that squeezed
 *   the sprite. This conveys more (how many of each rarity match the filter) with less text.
 * - **Cards follow the in-game shop card**: a type-coloured art area with a large centred sprite
 *   and the name in a band across the bottom, at the shop card's measured ~1.2:1 (landscape)
 *   proportions. No rarity text and no price — the user excluded price explicitly, it being a shop
 *   concept rather than a planning one.
 * - **The type background is `TypeSplit`, not a gradient**, which is what removes the "sliver" of
 *   the far colour along the card edge (research.md I8).
 */
export function CreatureSearchModal({ slot, onClose, onSelect, config}: CreatureSearchModalProps) {
  const [query, setQuery] = useState("");
  const [rarityFilter, setRarityFilter] = useState<Rarity | "">("");
  const [typeFilter, setTypeFilter] = useState<CreatureType | "">("");
  const inputRef = useRef<HTMLInputElement>(null);

  const allTypes = useMemo(() => Array.from(new Set(distinctCreatures.flatMap((c) => c.types))).sort(), []);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on the slot's
  // identity (slotKey), not the slot object reference, so re-opening for a *different* slot
  // re-runs this even if the slot prop happens to be a new object with the same row/col.
  useEffect(() => {
    if (slot === null) return;
    setQuery("");
    setRarityFilter("");
    setTypeFilter("");
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [slot ? slotKey(slot) : null]);

  const needle = query.trim().toLowerCase();
  const results = distinctCreatures.filter((c) => {
    if (needle !== "" && !c.name.toLowerCase().includes(needle)) return false;
    if (rarityFilter !== "" && c.rarity !== rarityFilter) return false;
    // T230/FR-086: painted and natively-"All" species match every type filter.
    if (typeFilter !== "" && !creatureHasType(c, typeFilter, config)) return false;
    // T235b/FR-091: the pool is the selected region plus whatever Smuggler brought in. Region-less
    // species (events, fossils) stay available — they were never regional stock, and hiding them
    // would break existing teams.
    if (!isAvailableInRun(c.id, config)) return false;
    return true;
  });

  // Rarest first, and sections with no matches are omitted entirely rather than rendering an empty
  // heading that implies a filter failure.
  const sections = RARITIES_DESC.map((rarity) => ({
    rarity,
    creatures: results.filter((c) => c.rarity === rarity).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((section) => section.creatures.length > 0);

  return (
    <Modal
      isOpen={slot !== null}
      onClose={onClose}
      title="Choose a Batomon"
      // The visible heading drops the slot position (FR-034, round 6) — the user just clicked that
      // slot — but assistive tech still gets it, for anyone who didn't see the click.
      ariaLabel={slot ? `Choose a Batomon for ${slot.row} row, slot ${slot.col + 1}` : "Choose a Batomon"}
      width="880px"
      toolbar={
        <div className={styles.filters}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Name or ID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search by name"
            className={styles.search}
          />
          <select
            value={rarityFilter}
            onChange={(e) => setRarityFilter(e.target.value as Rarity | "")}
            aria-label="Filter by rarity"
          >
            <option value="">All rarities</option>
            {RARITIES_DESC.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as CreatureType | "")}
            aria-label="Filter by type"
          >
            <option value="">All types</option>
            {allTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <span className={styles.count}>
            {results.length} of {distinctCreatures.length}
          </span>
        </div>
      }
    >
      <CardGrid minWidth="var(--picker-card-min-width)">
        <button
          type="button"
          className={styles.clearCard}
          onClick={() => {
            onSelect(null);
            onClose();
          }}
        >
          Clear slot
        </button>
      </CardGrid>

      {sections.length === 0 && <p className={styles.empty}>No Batomon match this search.</p>}

      {sections.map((section) => (
        <section key={section.rarity} className={styles.raritySection}>
          <h4 className={styles.rarityHeading} style={{ color: RARITY_COLORS[section.rarity] }}>
            {section.rarity}
            <span className={styles.rarityCount}>({section.creatures.length})</span>
          </h4>
          <CardGrid minWidth="var(--picker-card-min-width)">
            {section.creatures.map((creature) => (
              <button
                key={creature.id}
                type="button"
                className={styles.card}
                onClick={() => {
                  onSelect(creature.id);
                  onClose();
                }}
              >
                <CreatureTile
                  name={creature.name}
                  types={creature.types}
                  spriteFile={creature.spriteFile}
                  className={styles.cardTile}
                />
              </button>
            ))}
          </CardGrid>
        </section>
      ))}
    </Modal>
  );
}
