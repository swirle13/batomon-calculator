import { useEffect, useMemo, useRef, useState } from "react";
import { corpus } from "../../data/corpus";
import { useTeamConfig } from "../../context/TeamConfigContext";
import { RARITY_COLORS, RARITIES_ASC } from "../../data/statColors";
import type { Rarity, TrinketRecord } from "../../data/types";
import { Sprite } from "../shared/Sprite";
import {
  Chip,
  ClearFiltersButton,
  Disclosure,
  EmptyNote,
  FilterBar,
  Modal,
  PickerSection,
  ResultCount,
  SpriteTile,
  Surface,
} from "../primitives";
import styles from "./TrinketPicker.module.css";

/**
 * Trinket selection (FR-032, 2026-10-06 round 6; rebuilt on the primitives layer 2026-10-07).
 *
 * Round 6 replaced a bare `<select>` of 93 names, because a dropdown `<option>` can render neither
 * a sprite nor the effect text — and the effect text is the entire basis for choosing one trinket
 * over another, so the old control hid the only information that mattered at selection time
 * (research.md H4).
 *
 * What round 6 did NOT do, despite its own comment claiming it "mirrors the creature picker's
 * card-grid idiom", was use the creature picker's components. It hand-rolled its own modal
 * overlay, panel, header, filter row and grid in 170 lines of CSS that duplicated
 * `primitives.module.css` with different numbers — which is how this ended up looking like a
 * different application than the Batomon picker it sits above. It now composes from `Modal`,
 * `FilterBar`, `PickerSection`, `SpriteTile`, `Surface` and `Chip`, so the two pickers cannot
 * drift again (Constitution Principle VII, FR-058).
 *
 * Three behavioural changes come with it, all matching the Batomon picker:
 *
 * 1. **Results are grouped into rarity sections, Common → Mythical**, alphabetical within each.
 *    They were one flat alphabetical list that ignored rarity entirely — so the 8 Mythicals were
 *    scattered through 93 cards with nothing to distinguish them but a colour, and the tier you
 *    are actually shopping in could not be scanned.
 * 2. **The rarity filter persists between opens; the query does not** (FR-018 as amended), with a
 *    `Clear` button that appears only when something is set.
 * 3. **The card is the shop-card tile**: sprite on a rarity-coloured field with the name in a band
 *    across the bottom, then the effect text. Previously a bordered box with a 32px sprite beside
 *    small-caps rarity text.
 *
 * Trinkets stay **multi-select**, which is the one real behavioural difference from the creature
 * picker: this modal stays open as you pick (the card shows its own selected state) whereas the
 * creature modal closes on the single choice it exists to make.
 *
 * The 6 engine-wired trinkets stay visually distinguished from the 87 reference-only ones — that
 * distinction is honest and already established (round 5), so it is preserved rather than dropped.
 */
export function TrinketPicker() {
  const { config, addTrinketId, removeTrinketId } = useTeamConfig();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rarityFilter, setRarityFilter] = useState<Rarity | "">("");
  const inputRef = useRef<HTMLInputElement>(null);

  /** The selected trinkets, in the picker's own order (rarity, then name) rather than click order
   * — FR-067: a list's display order must not depend on how its items got there. */
  const selected = useMemo(
    () =>
      config.trinketIds
        .map((id) => corpus.trinkets.find((t) => t.id === id))
        .filter((t): t is TrinketRecord => t !== undefined)
        .sort(byRarityThenName),
    [config.trinketIds],
  );

  useEffect(() => {
    if (!isOpen) return;
    // The QUERY clears on every open: it names ONE trinket you have already found. The rarity
    // FILTER persists, because it describes the tier you are shopping in and that rarely changes
    // between picks — the same split the creature picker settled on (FR-018 amended).
    setQuery("");
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [isOpen]);

  const needle = query.trim().toLowerCase();
  const results = corpus.trinkets.filter((t) => {
    if (needle !== "" && !t.name.toLowerCase().includes(needle) && !t.effectText.toLowerCase().includes(needle)) {
      return false;
    }
    if (rarityFilter !== "" && t.rarity !== rarityFilter) return false;
    return true;
  });

  /**
   * Common first, not Mythical first — the same ordering the creature picker uses, and for the same
   * reason: the rarest items are the ones you pick least, so putting them at the top pushes the
   * common ones below the fold.
   *
   * The trailing `null` section exists because `TrinketRecord.rarity` is optional. All 93 trinkets
   * publish one today, so it renders nothing — but a future record without one must appear
   * somewhere rather than silently drop out of a rarity-sectioned list.
   */
  const sections = [
    ...RARITIES_ASC.map((rarity) => ({ rarity: rarity as Rarity | null, trinkets: results.filter((t) => t.rarity === rarity) })),
    { rarity: null, trinkets: results.filter((t) => t.rarity === undefined) },
  ]
    .map((section) => ({ ...section, trinkets: [...section.trinkets].sort(byName) }))
    .filter((section) => section.trinkets.length > 0);

  const filtersActive = query !== "" || rarityFilter !== "";

  return (
    <Surface pad="sm" className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>Trinkets</span>
        <span className={styles.panelHint}>
          {selected.length === 0 ? "none selected" : `${selected.length} selected`}
        </span>
        <button type="button" onClick={() => setIsOpen(true)}>
          Choose trinkets…
        </button>
      </div>

      {/* FR-052 (item 16): collapsed by default. Each selected trinket used to add a full row
          above the team grid, so with 9 selected the grid was pushed off-screen. Defaulting to
          OPEN would still displace it on the first add, which is the actual complaint. */}
      {selected.length > 0 && (
        <Disclosure label="Active trinkets" hint={`(${selected.length})`}>
          <ul className={styles.selectedList}>
            {selected.map((trinket) => (
              <li key={trinket.id} className={styles.selectedItem}>
                {/* The name chip carries its own remove control, so that control sits at a constant
                    position no matter how long the effect text beside it runs (FR-052). */}
                <Chip
                  color={trinket.rarity ? RARITY_COLORS[trinket.rarity] : undefined}
                  onRemove={() => removeTrinketId(trinket.id)}
                  removeLabel={`Remove ${trinket.name}`}
                >
                  <Sprite spriteFile={trinket.spriteFile} kind="trinket" size={20} alt="" />
                  {trinket.name}
                </Chip>
                <span className={styles.selectedEffect}>{trinket.effectText}</span>
                {affectsDps(trinket) && <AffectsDpsMark />}
              </li>
            ))}
          </ul>
        </Disclosure>
      )}

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Choose trinkets"
        // "Done" rather than "Close": this picker is multi-select and stays open while you work,
        // so dismissing it is the end of a task rather than abandoning a choice.
        closeLabel="Done"
        width="880px"
        toolbar={
          <FilterBar>
            <input
              ref={inputRef}
              type="text"
              placeholder="Name or effect text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search trinkets"
            />
            <select
              value={rarityFilter}
              onChange={(e) => setRarityFilter(e.target.value as Rarity | "")}
              aria-label="Filter trinkets by rarity"
            >
              <option value="">All rarities</option>
              {RARITIES_ASC.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {filtersActive && (
              <ClearFiltersButton
                title="Clear the search and the rarity filter"
                onClick={() => {
                  setQuery("");
                  setRarityFilter("");
                  inputRef.current?.focus();
                }}
              />
            )}
            <ResultCount shown={results.length} total={corpus.trinkets.length} />
          </FilterBar>
        }
      >
        {sections.length === 0 && <EmptyNote>No trinkets match this search.</EmptyNote>}

        {sections.map((section) => (
          <PickerSection
            key={section.rarity ?? "unranked"}
            heading={section.rarity ?? "Unranked"}
            color={section.rarity ? RARITY_COLORS[section.rarity] : undefined}
            count={section.trinkets.length}
            cardMinWidth="var(--trinket-card-min-width)"
          >
            {section.trinkets.map((trinket) => {
              const isSelected = config.trinketIds.includes(trinket.id);
              return (
                <button
                  key={trinket.id}
                  type="button"
                  className={`${styles.card} ${isSelected ? styles.cardSelected : ""}`}
                  aria-pressed={isSelected}
                  onClick={() => (isSelected ? removeTrinketId(trinket.id) : addTrinketId(trinket.id))}
                >
                  <SpriteTile
                    name={trinket.name}
                    // One band, the rarity's own colour — the same tile the Batomon picker paints
                    // with a creature's types.
                    colors={trinket.rarity ? [RARITY_COLORS[trinket.rarity]] : []}
                    spriteFile={trinket.spriteFile}
                    spriteKind="trinket"
                    className={styles.cardTile}
                    overlay={
                      isSelected ? (
                        <span className={styles.selectedMark} aria-hidden="true">
                          ✓
                        </span>
                      ) : undefined
                    }
                  />
                  {/* The whole reason this isn't a dropdown: the effect is what you choose on. */}
                  <div className={styles.cardEffect}>{trinket.effectText}</div>
                  {affectsDps(trinket) && <AffectsDpsMark />}
                </button>
              );
            })}
          </PickerSection>
        ))}
      </Modal>
    </Surface>
  );
}

/** 6 of 93 trinkets have effects the engine actually simulates. */
function affectsDps(trinket: TrinketRecord): boolean {
  return trinket.effectTags !== undefined && trinket.effectTags.length > 0;
}

/** The one "this trinket reaches the simulation" marker — on the card and on the selected row. */
function AffectsDpsMark() {
  return (
    <Chip className={styles.affectsDps} title="This trinket's effect is reflected in the DPS table">
      ★ affects DPS
    </Chip>
  );
}

function byName(a: TrinketRecord, b: TrinketRecord): number {
  return a.name.localeCompare(b.name);
}

function byRarityThenName(a: TrinketRecord, b: TrinketRecord): number {
  const rank = (t: TrinketRecord) => (t.rarity ? RARITIES_ASC.indexOf(t.rarity) : RARITIES_ASC.length);
  return rank(a) - rank(b) || byName(a, b);
}
