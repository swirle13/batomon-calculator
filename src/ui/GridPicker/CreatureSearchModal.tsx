import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { CreatureType, GridSlot, Rarity } from "../../data/types";
import { distinctCreatures } from "../../data/corpus";
import { typeBackground } from "../../data/typeColors";
import { slotKey } from "../../engine/grid";
import { Sprite } from "../shared/Sprite";

interface CreatureSearchModalProps {
  /** `null` = closed. Changing to a different slot while already open re-triggers the
   * clear+autofocus effect below, same as opening fresh (FR-018). */
  slot: GridSlot | null;
  onClose: () => void;
  onSelect: (creatureId: string | null) => void;
}

const RARITIES: Rarity[] = ["Mythical", "Legendary", "SuperRare", "Rare", "Uncommon", "Common"];

/**
 * FR-018 (2026-10-05 round 3, research.md E2.1): a reference UI left the previous slot's typed
 * query in place when reopened for a different slot, with no autofocus, so the first thing a
 * user saw was a stale, over-filtered result list. This modal clears its query AND moves
 * keyboard focus into the search field every time `slot` changes to a new, non-null value.
 */
export function CreatureSearchModal({ slot, onClose, onSelect }: CreatureSearchModalProps) {
  const [query, setQuery] = useState("");
  const [rarityFilter, setRarityFilter] = useState<Rarity | "">("");
  const [typeFilter, setTypeFilter] = useState<CreatureType | "">("");
  const inputRef = useRef<HTMLInputElement>(null);

  const allTypes = useMemo(
    () => Array.from(new Set(distinctCreatures.flatMap((c) => c.types))).sort(),
    [],
  );

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

  if (slot === null) return null;

  const needle = query.trim().toLowerCase();
  const results = distinctCreatures.filter((c) => {
    if (needle !== "" && !c.name.toLowerCase().includes(needle)) return false;
    if (rarityFilter !== "" && c.rarity !== rarityFilter) return false;
    if (typeFilter !== "" && !c.types.includes(typeFilter)) return false;
    return true;
  });

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Choose a creature for ${slot.row} row, slot ${slot.col + 1}`}
      onKeyDown={handleKeyDown}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "#1f2028",
          border: "1px solid #444857",
          borderRadius: 8,
          padding: "1rem",
          width: "min(680px, 92vw)",
          maxHeight: "82vh",
          display: "flex",
          flexDirection: "column",
          gap: "0.6rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {/* 2026-10-06 round 6 (FR-034): the slot position used to be spelled out here
              ("— back row, slot 2"). Dropped: the user just clicked that slot, and drag-and-drop
              means the choice isn't slot-bound anyway. It stays in the dialog's aria-label above,
              for anyone who didn't see the click. */}
          <h3 style={{ margin: 0 }}>Choose a Banto</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Name or ID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search by name"
            style={{ flex: "1 1 12rem" }}
          />
          <select
            value={rarityFilter}
            onChange={(e) => setRarityFilter(e.target.value as Rarity | "")}
            aria-label="Filter by rarity"
          >
            <option value="">All rarities</option>
            {RARITIES.map((r) => (
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
        </div>

        <p style={{ margin: 0, opacity: 0.75 }}>
          {results.length} of {distinctCreatures.length}
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
            gap: "0.5rem",
            overflowY: "auto",
            paddingRight: "0.25rem",
          }}
        >
          <button
            type="button"
            onClick={() => {
              onSelect(null);
              onClose();
            }}
            style={{
              border: "1px dashed #666",
              borderRadius: 6,
              padding: "0.5rem",
              background: "transparent",
              color: "#9ca3af",
              cursor: "pointer",
            }}
          >
            Clear slot
          </button>
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onSelect(c.id);
                onClose();
              }}
              style={{
                background: typeBackground(c.types),
                border: "2px solid transparent",
                borderRadius: 6,
                padding: "0.4rem",
                color: "#fff",
                textAlign: "left",
                cursor: "pointer",
                textShadow: "0 1px 2px rgba(0,0,0,0.6)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <Sprite spriteFile={c.spriteFile} kind="monster" size={28} alt={c.name} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{c.name}</div>
                  <div style={{ fontSize: "0.75em", opacity: 0.9 }}>
                    {c.rarity} · {c.types.join("/")}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
