import { useEffect, useMemo, useRef, useState } from "react";
import type { CreatureType, GridSlot, Rarity } from "../../data/types";
import { distinctCreatures } from "../../data/corpus";
import { RARITIES_ASC, RARITY_COLORS, rarityLabel } from "../../data/statColors";
import { slotKey } from "../../engine/grid";
import {
  CardGrid,
  ClearFiltersButton,
  CreatureTile,
  EmptyNote,
  FilterBar,
  Modal,
  PickerCard,
  PickerSection,
  ResultCount,
  Select,
  TextField,
} from "../primitives";
import styles from "./CreatureSearchModal.module.css";
import { creatureHasType, isOutOfRegion } from "../../data/typing";
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
    // The QUERY still clears on every open — that is FR-018, and the original complaint was
    // reopening onto a stale search for a creature you already placed.
    setQuery("");
    // The rarity and type DROPDOWNS deliberately persist (2026-10-07). Filling six slots usually
    // means six picks from the same tier, and re-selecting "Common" each time is pure friction.
    // They differ from the query in kind: a query names ONE creature you have already found, a
    // filter describes the KIND you are shopping for, and that rarely changes between slots.
    // The Clear button exists for when it does.
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [slot ? slotKey(slot) : null]);

  const needle = query.trim().toLowerCase();
  const results = distinctCreatures.filter((c) => {
    if (needle !== "" && !c.name.toLowerCase().includes(needle)) return false;
    if (rarityFilter !== "" && c.rarity !== rarityFilter) return false;
    // T230/FR-086: painted and natively-"All" species match every type filter.
    if (typeFilter !== "" && !creatureHasType(c, typeFilter, config)) return false;
    // Region is NOT a filter. It used to be, and that hid creatures the Travelling Merchant event
    // can legitimately put on your team — leaving no way to select them at all. Out-of-region
    // creatures are marked below instead.
    return true;
  });

  // Rarest first, and sections with no matches are omitted entirely rather than rendering an empty
  // heading that implies a filter failure.
  // Common FIRST (FR-018 amendment, 2026-10-07). The list opened Mythical-first, which put the
  // rarest creatures — the ones you pick least — at the top and pushed Commons below the fold. The
  // ordering now matches how often a tier is actually chosen. Alphabetical within each tier is
  // unchanged.
  const sections = RARITIES_ASC.map((rarity) => ({
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
        <FilterBar>
          <TextField
            ref={inputRef}
            type="search"
            placeholder="Name or ID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            // Enter commits when the filters have narrowed to EXACTLY one creature. Only one,
            // because picking "the first of several" would silently choose for the user; with one
            // result there is nothing to choose between and reaching for the mouse is pure cost.
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (results.length !== 1) return;
              e.preventDefault();
              onSelect(results[0]!.id);
              onClose();
            }}
            aria-label="Search by name"
          />
          <Select
            value={rarityFilter}
            onChange={(e) => setRarityFilter(e.target.value as Rarity | "")}
            aria-label="Filter by rarity"
          >
            <option value="">All rarities</option>
            {RARITIES_ASC.map((r) => (
              <option key={r} value={r}>
                {rarityLabel(r)}
              </option>
            ))}
          </Select>
          <Select
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
          </Select>
          {(rarityFilter !== "" || typeFilter !== "" || query !== "") && (
            <ClearFiltersButton
              title="Clear the search and both filters"
              onClick={() => {
                setQuery("");
                setRarityFilter("");
                setTypeFilter("");
                inputRef.current?.focus();
              }}
            />
          )}
          <ResultCount shown={results.length} total={distinctCreatures.length} />
        </FilterBar>
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

      {sections.length === 0 && <EmptyNote>No Batomon match this search.</EmptyNote>}

      {sections.map((section) => (
        <PickerSection
          key={section.rarity}
          heading={rarityLabel(section.rarity)}
          color={RARITY_COLORS[section.rarity]}
          count={section.creatures.length}
          cardMinWidth="var(--picker-card-min-width)"
        >
          {section.creatures.map((creature) => (
            <PickerCard
              key={creature.id}
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
                className={`${styles.cardTile} ${isOutOfRegion(creature.id, config) ? styles.outOfRegion : ""}`}
              />
              {/* Marked, not hidden: an event can legitimately put this on your team. */}
              {isOutOfRegion(creature.id, config) && (
                <span className={styles.outOfRegionTag} title="Not from your selected region — reachable via events, gifts or Smuggler">
                  other region
                </span>
              )}
            </PickerCard>
          ))}
        </PickerSection>
      ))}
    </Modal>
  );
}
