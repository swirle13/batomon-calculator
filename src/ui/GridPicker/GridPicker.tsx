import { Fragment, useState, type ReactNode } from "react";
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import type { CreatureType, GridCol, GridRow, GridSlot, Rarity } from "../../data/types";
import { corpus, getCreatureById } from "../../data/corpus";
import { useTeamConfig } from "../../context/TeamConfigContext";
import { resolveLevelUp } from "../../engine/evolution";
import { typeBackground } from "../../data/typeColors";
import { slotKey, slotsEqual } from "../../engine/grid";
import { CreatureSearchModal } from "./CreatureSearchModal";
import styles from "./GridPicker.module.css";

/**
 * 2x3 slot assignment UI (FR-005). Back row first (research.md B5 — A-row/back, B-row/front),
 * bound directly to TeamConfigContext; enforces data-model.md's placement rules by construction
 * (one slot per `{row, col}`, so duplicate-slot assignment is structurally impossible from this
 * UI).
 *
 * 2026-10-05 round 3 redesign (research.md section E): adds a type-colored card + search modal
 * (FR-018) as the primary assignment flow, drag-and-drop between slots (FR-019), and an
 * evolution-aware level selector (FR-022) — while keeping the original plain `<select>` fully
 * functional as an always-available fallback for keyboard/screen-reader users, tucked behind a
 * `<details>` disclosure rather than removed.
 */
const ROWS: GridRow[] = ["back", "front"];
const COLS: GridCol[] = [0, 1, 2];

/**
 * User-requested: rarity isn't otherwise visible in a plain flat <option> list. Grouping by
 * rarity via native <optgroup> needs no extra UI surface and keeps the plain dropdown the user
 * asked to keep, while making it much faster to visually scan for a specific rarity.
 */
const RARITY_ORDER: Rarity[] = ["Mythical", "Legendary", "SuperRare", "Rare", "Uncommon", "Common"];
const creaturesByRarity = RARITY_ORDER.map((rarity) => ({
  rarity,
  creatures: corpus.creatures.filter((c) => c.rarity === rarity).sort((a, b) => a.name.localeCompare(b.name)),
}));

interface GridPickerProps {
  /** 2026-10-05 round 3 (FR-021): hovering/focusing an occupied card reports its slot upward so
   * the persistent side panel (PlacedCreatureDetails, lifted state in App.tsx) can update. */
  onHighlightSlot: (slot: GridSlot) => void;
}

interface DraggableCardProps {
  slot: GridSlot;
  name: string;
  types: CreatureType[];
  level: number;
  onHighlight: () => void;
  /** FR-023 (2026-10-05 round 4): the card itself is the click target that opens
   * CreatureSearchModal — no separate "Change…" button. Coexists with dragging on the same
   * element: @dnd-kit/core's pointer sensor only starts an actual drag once the pointer moves
   * past its activation threshold, so a plain click (no movement) still fires this normally. */
  onOpenSearch: () => void;
}

function DraggableCard({ slot, name, types, level, onHighlight, onOpenSearch }: DraggableCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: slotKey(slot),
    data: { slot },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`${styles.card} ${isDragging ? styles.cardDragging : ""}`}
      style={{ background: typeBackground(types) }}
      onMouseEnter={onHighlight}
      onFocus={onHighlight}
      onClick={onOpenSearch}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenSearch();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`${name}, level ${level}. Click to change, or drag to another slot.`}
    >
      <div style={{ fontWeight: 600 }}>{name}</div>
      <div style={{ fontSize: "0.8em", opacity: 0.9 }}>Lv.{level}</div>
    </div>
  );
}

interface EmptyCardProps {
  onOpenSearch: () => void;
}

function EmptyCard({ onOpenSearch }: EmptyCardProps) {
  return (
    <div
      className={styles.emptyCard}
      onClick={onOpenSearch}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenSearch();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label="Empty slot. Click to choose a creature."
    >
      — empty —
    </div>
  );
}

function DroppableZone({ slot, children }: { slot: GridSlot; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: slotKey(slot), data: { slot } });
  return (
    <div ref={setNodeRef} className={`${styles.dropZone} ${isOver ? styles.dropZoneOver : ""}`}>
      {children}
    </div>
  );
}

export function GridPicker({ onHighlightSlot }: GridPickerProps) {
  const { config, setPlacement, movePlacement } = useTeamConfig();
  const [searchModalSlot, setSearchModalSlot] = useState<GridSlot | null>(null);

  function handleDragEnd(event: DragEndEvent) {
    const fromSlot = event.active.data.current?.slot as GridSlot | undefined;
    const toSlot = event.over?.data.current?.slot as GridSlot | undefined;
    if (!fromSlot || !toSlot || slotsEqual(fromSlot, toSlot)) return;
    movePlacement(fromSlot, toSlot);
  }

  return (
    <>
      <DndContext onDragEnd={handleDragEnd}>
        <div className={styles.grid}>
          {ROWS.map((row) => (
            <Fragment key={row}>
              <div className={styles.rowLabel}>{row === "back" ? "Back row" : "Front row"}</div>
              {COLS.map((col) => {
                const slot: GridSlot = { row, col };
                const placement = config.placements.find((p) => p.slot.row === row && p.slot.col === col);
                const creature = placement ? getCreatureById(placement.creatureId) : null;
                // FR-022 (data-model.md's "Evolution-aware leveling"): never offer a level the
                // corpus has no backing record for -- checked via the exact same resolver that
                // performs the swap (resolveLevelUp), so a level only appears here if selecting
                // it will actually resolve to something, whether that's the same species or an
                // evolved one. (Not `getAvailableLevelsFor`, which only checks for records
                // sharing the *current* id -- that would never surface a level reachable only
                // by evolving into a different species.)
                const availableLevels = placement
                  ? ([1, 2, 3, 4] as const).filter(
                      (lvl) => resolveLevelUp(corpus, placement.creatureId, lvl) !== null,
                    )
                  : [];

                return (
                  <div key={`${row}-${col}`} className={styles.slot}>
                    <DroppableZone slot={slot}>
                      {placement && creature ? (
                        <DraggableCard
                          slot={slot}
                          name={creature.name}
                          types={creature.types}
                          level={placement.level}
                          onHighlight={() => onHighlightSlot(slot)}
                          onOpenSearch={() => setSearchModalSlot(slot)}
                        />
                      ) : (
                        <EmptyCard onOpenSearch={() => setSearchModalSlot(slot)} />
                      )}
                    </DroppableZone>

                    {placement && availableLevels.length > 0 && (
                      <select
                        value={placement.level}
                        onChange={(e) => {
                          const requestedLevel = Number(e.target.value) as 1 | 2 | 3 | 4;
                          // FR-022: resolve through any evolution chain (e.g. Panbud@3 ->
                          // Bambudo) rather than just raising the level on the same species id.
                          const resolved = resolveLevelUp(corpus, placement.creatureId, requestedLevel);
                          if (resolved) {
                            setPlacement(slot, resolved.id, requestedLevel);
                          }
                        }}
                        aria-label={`${row} row, slot ${col + 1} level`}
                        title="Level (restricted to levels this corpus has data for; evolves species where documented)"
                      >
                        {availableLevels.map((level) => (
                          <option key={level} value={level}>
                            Lv. {level}
                          </option>
                        ))}
                      </select>
                    )}

                    {/* FR-018/FR-019 parity: the original plain <select> stays fully functional
                        for keyboard/screen-reader users who don't use the search modal or
                        drag-and-drop (research.md E2.5). */}
                    <details className={styles.fallbackDetails}>
                      <summary>Or choose from dropdown</summary>
                      <select
                        value={placement?.creatureId ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setPlacement(slot, value === "" ? null : value, 1);
                        }}
                        aria-label={`${row} row, slot ${col + 1}`}
                      >
                        <option value="">— empty —</option>
                        {creaturesByRarity.map(
                          ({ rarity, creatures }) =>
                            creatures.length > 0 && (
                              <optgroup key={rarity} label={rarity}>
                                {creatures.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </optgroup>
                            ),
                        )}
                      </select>
                    </details>
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </DndContext>

      <CreatureSearchModal
        slot={searchModalSlot}
        onClose={() => setSearchModalSlot(null)}
        onSelect={(creatureId) => {
          if (searchModalSlot) setPlacement(searchModalSlot, creatureId, 1);
        }}
      />
    </>
  );
}
