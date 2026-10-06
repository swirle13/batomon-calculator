import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { corpus } from "../../data/corpus";
import { useTeamConfig } from "../../context/TeamConfigContext";
import { RARITY_COLORS } from "../../data/statColors";
import type { Rarity, TrinketRecord } from "../../data/types";
import { Sprite } from "../shared/Sprite";
import styles from "./TrinketPicker.module.css";

const RARITIES: Rarity[] = ["Mythical", "Legendary", "SuperRare", "Rare", "Uncommon", "Common"];

/**
 * Trinket selection (FR-032, 2026-10-06 round 6).
 *
 * Replaces round 5's bare `<select>` of 93 names. A dropdown `<option>` can render neither a
 * sprite nor the effect text — and the effect text is the entire basis for choosing one trinket
 * over another, so the old control hid the only information that mattered at selection time
 * (research.md H4).
 *
 * This reuses `CreatureSearchModal`'s interaction (searchable, filterable grid of clickable cards)
 * rather than inventing a second selection idiom for the same job — but as a sibling component,
 * not a generalisation of it, because of one real behavioural difference: trinkets are
 * **multi-select**, so this modal stays open as you pick (a running "selected" strip updates in
 * place) whereas the creature modal closes on the single choice it exists to make.
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

  const selected = useMemo(
    () =>
      config.trinketIds
        .map((id) => corpus.trinkets.find((t) => t.id === id))
        .filter((t): t is TrinketRecord => t !== undefined),
    [config.trinketIds],
  );

  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setRarityFilter("");
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

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") setIsOpen(false);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.summaryRow}>
        <span>Trinkets:</span>
        <button type="button" onClick={() => setIsOpen(true)}>
          {selected.length === 0 ? "Choose trinkets…" : `Choose trinkets… (${selected.length} selected)`}
        </button>
      </div>

      {selected.length > 0 && (
        <ul className={styles.selectedList}>
          {selected.map((trinket) => (
            <li key={trinket.id} className={styles.selectedItem}>
              <Sprite spriteFile={trinket.spriteFile} kind="trinket" size={24} alt={trinket.name} />
              <span className={styles.selectedName} style={{ color: trinket.rarity ? RARITY_COLORS[trinket.rarity] : undefined }}>
                {trinket.name}
              </span>
              <span className={styles.selectedEffect}>{trinket.effectText}</span>
              {trinket.effectTags && trinket.effectTags.length > 0 && (
                <span className={styles.affectsDps} title="This trinket's effect is reflected in the DPS table">
                  ★ affects DPS
                </span>
              )}
              <button type="button" onClick={() => removeTrinketId(trinket.id)} aria-label={`Remove ${trinket.name}`}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Choose trinkets"
          className={styles.overlay}
          onKeyDown={handleKeyDown}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsOpen(false);
          }}
        >
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h3 className={styles.panelTitle}>Choose trinkets</h3>
              <button type="button" onClick={() => setIsOpen(false)}>
                Done
              </button>
            </div>

            <div className={styles.filters}>
              <input
                ref={inputRef}
                type="text"
                placeholder="Name or effect text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search trinkets"
                className={styles.search}
              />
              <select
                value={rarityFilter}
                onChange={(e) => setRarityFilter(e.target.value as Rarity | "")}
                aria-label="Filter trinkets by rarity"
              >
                <option value="">All rarities</option>
                {RARITIES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <span className={styles.count}>
                {results.length} of {corpus.trinkets.length}
              </span>
            </div>

            <div className={styles.grid}>
              {results.map((trinket) => {
                const isSelected = config.trinketIds.includes(trinket.id);
                return (
                  <button
                    key={trinket.id}
                    type="button"
                    className={`${styles.card} ${isSelected ? styles.cardSelected : ""}`}
                    style={{ borderColor: trinket.rarity ? RARITY_COLORS[trinket.rarity] : undefined }}
                    aria-pressed={isSelected}
                    onClick={() => (isSelected ? removeTrinketId(trinket.id) : addTrinketId(trinket.id))}
                  >
                    <div className={styles.cardHeader}>
                      <Sprite spriteFile={trinket.spriteFile} kind="trinket" size={32} alt={trinket.name} />
                      <div>
                        <div className={styles.cardName}>{trinket.name}</div>
                        {trinket.rarity && (
                          <div className={styles.cardRarity} style={{ color: RARITY_COLORS[trinket.rarity] }}>
                            {trinket.rarity}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* The whole reason this isn't a dropdown: the effect is what you choose on. */}
                    <div className={styles.cardEffect}>{trinket.effectText}</div>
                    {trinket.effectTags && trinket.effectTags.length > 0 && (
                      <div className={styles.affectsDps}>★ affects DPS</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
