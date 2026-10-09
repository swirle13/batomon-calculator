import { Fragment, memo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { CreatureRecord, CreatureType, GridCol, StatModifier, GridSlot } from "../../data/types";
import { resolveCreatureVariant } from "../../data/corpus";
import { isChefAffected, isPainted } from "../../data/typing";
import { trainerModifiersFor } from "../../engine/trainerEffects";
import { useTeamConfig } from "../../context/teamConfig";
import { typeBackground } from "../../data/typeColors";
import { STATUS_COLOR_KEY } from "../../data/format";
import { slotKey, slotsEqual } from "../../engine/grid";
import { CreatureSprite } from "../shared/CreatureSprite";
import { StatBadge } from "../primitives";
import { perCastOutputOf } from "../shared/BatomonCard/perCastOutput";
import { CreatureSearchModal } from "./CreatureSearchModal";
import { POINTER_ACTIVATION_CONSTRAINT, TOUCH_ACTIVATION_CONSTRAINT } from "./dragActivation";
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
 *
 * 2026-10-08: the chips are a fixed width and wrap four to a row, both decided in CSS — see
 * `.badges` for why a row caps at four and why the extra row grows upward over the sprite.
 */
function SlotBadges({ creature, modifiers }: SlotBadgesProps) {
  // Base stats PLUS the user's own manual modifiers (T210 / FR-077), through the SAME producer the
  // card uses. The arithmetic lived here and nowhere else, so the card showed unmodified stats
  // while these chips showed modified ones — the inconsistency this now removes.
  const { damage, appliesStatus, heal, multicast } = perCastOutputOf(creature, modifiers);

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
      {/* T209 (WI-001): Heal lives in `healAmount`, not `appliesStatus`, so it was never shown.
          Read off the same producer as everything else here, so a Heal modifier moves this chip —
          `creature.healAmount` was the published figure and silently ignored them. */}
      {heal != null && heal > 0 && <StatBadge statKey={StatColorKey.Heal} value={heal} label="Heal" />}
      {/* `×2`, matching the card's "Multicast ×2" line. Multicast is a multiplier, and an
          unmarked 2 beside a 25 read as a second magnitude. */}
      {multicast > 1 && (
        <StatBadge statKey={StatColorKey.Multicast} value={multicast} label="Multicast" prefix="×" />
      )}
    </div>
  );
}

interface CardFaceProps {
  creature: CreatureRecord;
  level: number;
  modifiers: StatModifier[] | undefined;
  /** Painted by Painter, or natively `All`-typed — drives the rainbow treatment. */
  painted: boolean;
  /** Reached by Chef's ability — drives the red/orange treatment. */
  chefFire: boolean;
}

/**
 * Everything a placed card LOOKS like, with none of what it does.
 *
 * Split out of `DraggableCard` (2026-10-08) because the floating card under the pointer during a
 * drag is the same pane rendered a second time, inside `<DragOverlay>`. Rendering it from the same
 * component is what keeps the two from drifting — a lifted card that is missing its chips, or sized
 * differently from the one it came from, reads as a different creature.
 */
function CardFace({ creature, level, modifiers, painted, chefFire }: CardFaceProps) {
  return (
    <>
      {/* Name and level share the top row, so everything below the sprite is chips. See `.header`. */}
      <div className={styles.header}>
        <span className={styles.name}>{creature.name}</span>
        <span className={styles.level}>Lv. {level}</span>
      </div>
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
          chefFire={chefFire}
        />
      </div>
      <SlotBadges creature={creature} modifiers={modifiers} />
    </>
  );
}

interface DraggableCardProps extends CardFaceProps {
  slot: GridSlot;
  onHighlight: () => void;
  /** FR-023 (round 4): the card itself is the click target that opens CreatureSearchModal — no
   * separate "Change…" button. Coexists with dragging on the same element: @dnd-kit/core's pointer
   * sensor only starts an actual drag once the pointer moves past its activation threshold, so a
   * plain click (no movement) still fires this normally. */
  onOpenSearch: () => void;
  /** FR-033 (round 6). */
  onClear: () => void;
}

function DraggableCard({ slot, creature, level, modifiers, painted, chefFire, onHighlight, onOpenSearch, onClear }: DraggableCardProps) {
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
      <CardFace creature={creature} level={level} modifiers={modifiers} painted={painted} chefFire={chefFire} />
    </div>
  );
}

/**
 * The card that follows the pointer (2026-10-08, FR-019). Without it, a drag showed only a faded
 * source pane and a dashed outline on the target, so there was nothing in hand — on a phone, where
 * the finger covers the pane it started from, the gesture gave no feedback at all.
 *
 * It carries no handlers and no clear button: it is a picture of the card, not the card.
 */
function DragGhost({ creature, level, modifiers, painted, chefFire }: CardFaceProps) {
  return (
    <div
      className={`${styles.card} ${styles.cardGhost}`}
      style={{ background: typeBackground(creature.types) }}
      aria-hidden
    >
      <CardFace creature={creature} level={level} modifiers={modifiers} painted={painted} chefFire={chefFire} />
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

/*
 * Memoized because the grid is what you hover, and hovering it sets `CalculatorView`'s
 * highlighted-slot state — so without this, moving the pointer across the board re-rendered the
 * board. `onHighlightSlot` is a `useState` setter, whose identity is stable, so the bail-out
 * actually holds; passing an inline arrow from the parent would silently defeat it.
 */
export const GridPicker = memo(function GridPicker({ onHighlightSlot }: GridPickerProps) {
  const { config, setPlacement, movePlacement } = useTeamConfig();
  const [searchModalSlot, setSearchModalSlot] = useState<GridSlot | null>(null);
  /** The slot being dragged, so `<DragOverlay>` knows which card to draw under the pointer. */
  const [draggingSlot, setDraggingSlot] = useState<GridSlot | null>(null);

  /**
   * ONE SENSOR PER INPUT, because mouse and touch need different activation rules (2026-10-08).
   *
   * This was a single PointerSensor with a distance threshold, which made the board undraggable on
   * phones: the browser claims a touch-drag as a page scroll before the threshold is reached. See
   * `dragActivation.ts` for why the mouse gets a distance and touch gets a delay — the two
   * constraints are the substance of this, the sensors are just where they are installed.
   *
   * FR-047 (2026-10-06 round 7, research.md I7): the mouse constraint is not optional. WITHOUT an
   * explicit one, the sensor activates on `pointerdown`/`mousedown` and installs a capture-phase
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
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: POINTER_ACTIVATION_CONSTRAINT }),
    useSensor(TouchSensor, { activationConstraint: TOUCH_ACTIVATION_CONSTRAINT }),
  );

  /** The placed creature in a slot, resolved at its own level — `null` for an empty slot. */
  function cardAt(slot: GridSlot) {
    const placement = config.placements.find((p) => slotsEqual(p.slot, slot));
    if (!placement) return null;
    // 2026-10-06 round 10 (T209b / WI-002): resolve by (id, LEVEL). This used `getCreatureById`,
    // which returns the first matching record — always level 1 — so every chip on every levelled
    // creature silently showed level-1 stats. The user reported the missing Multicast chip because
    // it was the one visibly absent; the rest looked plausible at any level, which is why it went
    // unnoticed.
    const creature = resolveCreatureVariant(placement.creatureId, placement.level, placement.shiny);
    if (!creature) return null;
    return {
      creature,
      level: placement.level,
      // The trainer's per-monster bonus reads as part of the creature here, the same way a manual
      // modifier does — see `PlacedCreatureDetails` for why the chips are the third place it has
      // to show up rather than living only in the simulation.
      modifiers: [...(placement.modifiers ?? []), ...trainerModifiersFor(creature, config)],
      painted: creature.types.some(isWildcardType) || isPainted(creature.id, config),
      chefFire: isChefAffected(creature, config),
    };
  }

  function handleDragStart(event: DragStartEvent) {
    setDraggingSlot((event.active.data.current?.slot as GridSlot | undefined) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingSlot(null);
    const fromSlot = event.active.data.current?.slot as GridSlot | undefined;
    const toSlot = event.over?.data.current?.slot as GridSlot | undefined;
    if (!fromSlot || !toSlot || slotsEqual(fromSlot, toSlot)) return;
    movePlacement(fromSlot, toSlot);
  }

  const draggingCard = draggingSlot ? cardAt(draggingSlot) : null;

  return (
    <>
      <DndContext
        sensors={sensors}
        /*
         * NO AUTO-SCROLL (2026-10-08). @dnd-kit scrolls the page whenever the pointer is within
         * 25% of a viewport edge, which on a phone is where the FRONT ROW sits: a back-to-front
         * drag — the most common move there is — put the finger in the bottom band and the board
         * then scrolled away under it, so the drop landed below the grid and nothing moved.
         *
         * Nothing is lost by turning it off. The whole board is six panes that fit on any screen
         * it renders on, so there is never a slot to scroll TO mid-drag.
         */
        autoScroll={false}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDraggingSlot(null)}
      >
        <div className={styles.grid}>
          {ROWS.map((row) => (
            <Fragment key={row}>
              {COLS.map((col) => {
                const slot: GridSlot = { row, col };
                const card = cardAt(slot);
                // FR-022 (data-model.md's "Evolution-aware leveling"): never offer a level the
                // corpus has no backing record for -- checked via the exact same resolver that
                // performs the swap (resolveLevelUp), so a level only appears here if selecting
                // it will actually resolve to something, whether that's the same species or an
                // evolved one.

                return (
                  <div key={`${row}-${col}`} className={styles.slot}>
                    <DroppableZone slot={slot}>
                      {card ? (
                        <DraggableCard
                          slot={slot}
                          creature={card.creature}
                          level={card.level}
                          modifiers={card.modifiers}
                          painted={card.painted}
                          chefFire={card.chefFire}
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

        {/* Sized by @dnd-kit to the pane it was lifted from, so the ghost matches the hole it
            left — nothing here needs to know the slot's dimensions.

            No drop animation: the default one flies the ghost back to the slot it STARTED in,
            which is the one place the creature now isn't. The swap is instant, so the ghost
            simply goes away and the two panes have already changed underneath it. */}
        <DragOverlay dropAnimation={null}>
          {draggingCard ? <DragGhost {...draggingCard} /> : null}
        </DragOverlay>
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
});

export type { CreatureType };
