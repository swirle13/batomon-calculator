import { Fragment, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { CreatureRecord, CreatureType, GridCol, StatModifier, GridSlot } from "../../data/types";
import { resolveCreatureVariant } from "../../data/corpus";
import { isPainted } from "../../data/typing";
import { useTeamConfig } from "../../context/TeamConfigContext";
import { typeBackground } from "../../data/typeColors";
import { STAT_COLORS } from "../../data/statColors";
import { STATUS_COLOR_KEY } from "../../data/format";
import { slotKey, slotsEqual } from "../../engine/grid";
import { CreatureSprite } from "../shared/CreatureSprite";
import { perCastOutputOf } from "../shared/BatomonCard/BatomonCard";
import { CreatureSearchModal } from "./CreatureSearchModal";
import styles from "./GridPicker.module.css";
import { isWildcardType } from "../../data/vocabularies";
import { GridRow, StatColorKey } from "../../data/enums";

/**
 * 2x3 slot assignment UI (FR-005). Back row first (research.md B5 — A-row/back, B-row/front),
 * bound directly to TeamConfigContext; enforces data-model.md's placement rules by construction
 * (one slot per `{row, col}`, so duplicate-slot assignment is structurally impossible from this
 * UI).
 *
 * 2026-10-05 round 3 (research.md section E): type-colored card + search modal (FR-018) as the
 * primary assignment flow, drag-and-drop between slots (FR-019), and an evolution-aware level
 * selector (FR-022) — while keeping the original plain `<select>` fully functional as an
 * always-available fallback for keyboard/screen-reader users, behind a `<details>` disclosure.
 *
 * 2026-10-06 round 6: panes are square (FR-035) and show the creature's sprite (FR-036), a level
 * badge, colour-coded per-cast stat badges along the bottom matching the in-game team panel
 * (FR-035), and a clear control (FR-033). The BACK ROW / FRONT ROW labels are gone (FR-034).
 */
const ROWS: GridRow[] = [GridRow.Back, GridRow.Front];
const COLS: GridCol[] = [0, 1, 2];

/**
 * User-requested: rarity isn't otherwise visible in a plain flat <option> list. Grouping by
 * rarity via native <optgroup> needs no extra UI surface and keeps the plain dropdown the user
 * asked to keep, while making it much faster to visually scan for a specific rarity.
 */

/**
 * Exported so it can be asserted directly (tasks.md T147). jsdom cannot reproduce either half of
 * the real click-vs-drag behaviour -- its synthetic pointer events don't drive @dnd-kit's
 * activation, and its `fireEvent.click` isn't subject to the capture-phase suppression @dnd-kit
 * installs -- so a behavioural test there would pass for the wrong reason in both directions.
 * The presence of this constraint IS the fix (its absence was the bug), so it is what gets pinned.
 * End-to-end behaviour is verified in a real browser per quickstart Scenario 25.
 */
export const POINTER_ACTIVATION_CONSTRAINT = { distance: 8 } as const;

interface GridPickerProps {
  /** 2026-10-05 round 3 (FR-021): hovering/focusing an occupied card reports its slot upward so
   * the persistent side panel (PlacedCreatureDetails, lifted state in App.tsx) can update. */
  onHighlightSlot: (slot: GridSlot) => void;
  /*
   * 2026-10-06 round 9b: the `result` prop is gone. Round 6 threaded the simulation in so the slot
   * badges could show modifier-adjusted values; those badges now show BASE stats (matching the
   * game's own team pane), so the grid needs no simulation at all. A side benefit: the grid no
   * longer re-renders on every simulation change.
   */
}

/** One colour-coded stat pill. Number-only, like the in-game pane — the colour carries the
 * meaning, so an accessible `title` names the stat for anyone who can't rely on hue. */
function StatBadge({ statKey, value, label }: { statKey: StatColorKey; value: number; label: string }) {
  return (
    <span className={styles.badge} style={{ background: STAT_COLORS[statKey] }} title={`${label}: ${value}`}>
      {value}
    </span>
  );
}

interface SlotBadgesProps {
  creature: CreatureRecord;
  /** The user's own manual modifiers for this slot (FR-077). */
  modifiers: StatModifier[] | undefined;
}

/**
 * The in-game pane's bottom row of pills. Shows damage and each applied status; cooldown is
 * deliberately NOT a pill (the game shows cooldown as its own block on the card, not down here),
 * and Multicast only appears when it is actually above 1.
 *
 * 2026-10-06 round 9b (user-reported): these show **BASE** stats, matching how the game's own team
 * pane reads. Round 6 (T128) deliberately drove them from `perCreatureEffectiveStats` so they
 * "could never disagree with the tables" — that was right while effective meant base-plus-manual-
 * modifiers, but once round 9's resolver made on-battle-start abilities real it produced a
 * confusing chip: Miasmaw's tile read **336** while its card read **10**. The game shows base on
 * the tile and the live value on the inspect sheet, so that split is now mirrored here — the chip
 * is base, and "Effective this battle" on the detail card is where resolved values live.
 */
function SlotBadges({ creature, modifiers }: SlotBadgesProps) {
  // Base stats PLUS the user's own manual modifiers (T210 / FR-077), through the SAME producer the
  // card uses. The arithmetic lived here and nowhere else, so the card showed unmodified stats
  // while these chips showed modified ones — the inconsistency this now removes.
  const { damage, appliesStatus, multicast } = perCastOutputOf(creature, modifiers);

  return (
    <div className={styles.badges}>
      {/* An unknown damage value shows NO badge rather than a `0` -- 62 of 149 species still have
          `baseDamage: null`, so a 0 here would be actively misleading, not merely empty. */}
      {damage !== null && <StatBadge statKey={StatColorKey.Damage} value={damage} label="Damage" />}
      {appliesStatus.map((status) => (
        <StatBadge
          key={status.type}
          statKey={STATUS_COLOR_KEY[status.type]}
          value={status.amount}
          label={status.type}
        />
      ))}
      {/* T209 (WI-001): Heal lives in `healAmount`, not `appliesStatus`, so it was never shown. */}
      {creature.healAmount != null && creature.healAmount > 0 && (
        <StatBadge statKey={StatColorKey.Heal} value={creature.healAmount} label="Heal" />
      )}
      {multicast > 1 && <StatBadge statKey={StatColorKey.Multicast} value={multicast} label="Multicast" />}
    </div>
  );
}

interface DraggableCardProps {
  slot: GridSlot;
  creature: CreatureRecord;
  level: number;
  modifiers: StatModifier[] | undefined;
  /** Painted by Painter, or natively `All`-typed — drives the rainbow treatment. */
  painted: boolean;
  onHighlight: () => void;
  /** FR-023 (round 4): the card itself is the click target that opens CreatureSearchModal — no
   * separate "Change…" button. Coexists with dragging on the same element: @dnd-kit/core's pointer
   * sensor only starts an actual drag once the pointer moves past its activation threshold, so a
   * plain click (no movement) still fires this normally. */
  onOpenSearch: () => void;
  /** FR-033 (round 6). */
  onClear: () => void;
}

function DraggableCard({ slot, creature, level, modifiers, painted, onHighlight, onOpenSearch, onClear }: DraggableCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: slotKey(slot),
    data: { slot },
  });

  /**
   * The clear button lives inside an element that is BOTH a drag handle and a click target that
   * opens the picker, so every path that could reach the parent has to be stopped here
   * (research.md H5):
   *  - `pointerDown`: otherwise @dnd-kit treats the press as the start of a drag.
   *  - `click`: otherwise the card's onClick opens the picker over the now-empty slot.
   *  - `keyDown`: otherwise the card's onKeyDown calls preventDefault() and opens the picker on
   *    Enter/Space -- which would suppress the button's own click and give a keyboard user the
   *    exact opposite of "clear this slot".
   */
  function handleClearPointerDown(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
  }
  function handleClearClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onClear();
  }
  function handleClearKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    event.stopPropagation();
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`${styles.card} ${isDragging ? styles.cardDragging : ""}`}
      style={{ background: typeBackground(creature.types) }}
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
      aria-label={`${creature.name}, level ${level}. Click to change, or drag to another slot.`}
    >
      <button
        type="button"
        className={styles.clear}
        onPointerDown={handleClearPointerDown}
        onClick={handleClearClick}
        onKeyDown={handleClearKeyDown}
        aria-label={`Remove ${creature.name} from this slot`}
        title={`Remove ${creature.name}`}
      >
        ×
      </button>
      <div className={styles.level}>Lv. {level}</div>
      <div className={styles.spriteWrap}>
        {/* Same component as the detail panel's, so a painted creature cannot be rainbow in one
            place and plain in the other — which is precisely what happened before. */}
        <CreatureSprite
          spriteFile={creature.spriteFile}
          // The token drives the size in CSS, so the 640px breakpoint applies on resize with no
          // re-render — reading it into JS froze it at first render.
          sizeVar="--sprite-grid"
          alt={creature.name}
          painted={painted}
        />
      </div>
      <div className={styles.name}>{creature.name}</div>
      <SlotBadges creature={creature} modifiers={modifiers} />
    </div>
  );
}

function EmptyCard({ onOpenSearch }: { onOpenSearch: () => void }) {
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

  /**
   * FR-047 (2026-10-06 round 7, research.md I7): WITHOUT an explicit activation constraint,
   * @dnd-kit's default PointerSensor activates on `pointerdown` and installs a capture-phase
   * `click` stopPropagation listener -- so the card's own onClick never fires and a placed
   * creature could only be dragged, never clicked to reassign. Round 4's comment claiming the
   * sensor "only engages past a drag-distance threshold" was wrong: there is no default threshold,
   * it has to be configured. 8px absorbs click jitter while keeping an intentional drag immediate.
   *
   * No KeyboardSensor is added, and that is deliberate rather than an omission: DraggableCard
   * spreads {...listeners} and then defines its own onKeyDown, which overrides the sensor's and
   * already owns Enter/Space (the default keyboard-drag activators). Adding one would change
   * nothing while implying keyboard dragging worked. Keyboard users press Enter/Space to OPEN THE
   * PICKER, which is the accessible route to reassignment; keyboard drag is a known limitation.
   */
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: POINTER_ACTIVATION_CONSTRAINT }));

  function handleDragEnd(event: DragEndEvent) {
    const fromSlot = event.active.data.current?.slot as GridSlot | undefined;
    const toSlot = event.over?.data.current?.slot as GridSlot | undefined;
    if (!fromSlot || !toSlot || slotsEqual(fromSlot, toSlot)) return;
    movePlacement(fromSlot, toSlot);
  }

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className={styles.grid}>
          {ROWS.map((row) => (
            <Fragment key={row}>
              {COLS.map((col) => {
                const slot: GridSlot = { row, col };
                const placement = config.placements.find((p) => p.slot.row === row && p.slot.col === col);
                // 2026-10-06 round 10 (T209b / WI-002): resolve by (id, LEVEL). This used
                // `getCreatureById`, which returns the first matching record — always level 1 — so
                // every chip on every levelled creature silently showed level-1 stats. The user
                // reported the missing Multicast chip because it was the one visibly absent; the
                // rest looked plausible at any level, which is why it went unnoticed.
                const creature = placement
                  ? resolveCreatureVariant(placement.creatureId, placement.level, placement.shiny)
                  : null;
                // FR-022 (data-model.md's "Evolution-aware leveling"): never offer a level the
                // corpus has no backing record for -- checked via the exact same resolver that
                // performs the swap (resolveLevelUp), so a level only appears here if selecting
                // it will actually resolve to something, whether that's the same species or an
                // evolved one.

                return (
                  <div key={`${row}-${col}`} className={styles.slot}>
                    <DroppableZone slot={slot}>
                      {placement && creature ? (
                        <DraggableCard
                          slot={slot}
                          creature={creature}
                          level={placement.level}
                          modifiers={placement.modifiers}
                          painted={creature.types.some(isWildcardType) || isPainted(creature.id, config)}
                          onHighlight={() => onHighlightSlot(slot)}
                          onOpenSearch={() => setSearchModalSlot(slot)}
                          onClear={() => setPlacement(slot, null)}
                        />
                      ) : (
                        <EmptyCard onOpenSearch={() => setSearchModalSlot(slot)} />
                      )}
                    </DroppableZone>

                    {/*
                      Round 11 (WI-R11-001): the per-slot level <select> lived here. It is replaced
                      by the level/shiny bubbles on the selected-creature card, because a dropdown
                      cannot express "pick one of four, plus an independent boolean" without
                      becoming two controls — and at 64px wide this slot had no room for two.
                    */}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </DndContext>

      <CreatureSearchModal
        config={config}
        slot={searchModalSlot}
        onClose={() => setSearchModalSlot(null)}
        onSelect={(creatureId) => {
          if (searchModalSlot) setPlacement(searchModalSlot, creatureId, 1);
        }}
      />
    </>
  );
}

export type { CreatureType };
