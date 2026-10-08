import { useEffect, useMemo, useRef, useState } from "react";
import { corpus, resolveCreatureVariant } from "../../data/corpus";
import { useTeamConfig } from "../../context/TeamConfigContext";
import { RARITY_COLORS, RARITIES_ASC, rarityLabel } from "../../data/statColors";
import type { CreatureRecord, GridSlot, ItemRecord, Rarity, TeamConfiguration } from "../../data/types";
import { ItemTargetKind } from "../../data/enums";
import { slotKey, STABLE_SLOT_ORDER } from "../../engine/grid";
import { itemRecipients, modifiersForUse, requiredChoiceCount, type ItemBoardMember } from "../../engine/itemEffects";
import { AbilityText } from "../shared/AbilityText";
import {
  Button,
  CardGrid,
  ClearFiltersButton,
  CreatureTile,
  EditorPanel,
  EmptyNote,
  FilterBar,
  Modal,
  OVERLAY_COLUMNS,
  PickerCard,
  PickerSection,
  ResultCount,
  Select,
  SpriteTile,
  TextField,
} from "../primitives";
import styles from "./ItemPicker.module.css";

/**
 * Using an item (tasks.md T046, 2026-10-08).
 *
 * ## Picking an item USES it — there is no bag
 *
 * The first version of this screen had one: clicking a card put the item in a "your items" section,
 * which then offered Use and Discard buttons. The user's verdict was that the bag is pointless, and
 * they are right. An item in this calculator has exactly one interesting moment — the moment its
 * bonus lands on your monsters — and modelling the seconds before that adds a step, a second
 * section and two buttons to reach the only outcome anyone wants. Holding an unused item changes
 * nothing this tool computes.
 *
 * So a click applies the effect. `TeamConfiguration.itemIds` is left alone and unwritten: the
 * record of "I used a Feast" is the `+5 Damage` modifier chip labelled **Feast** that the use
 * created, which is removable, visible under Modifiers, and already in the share link. A parallel
 * `itemIds` log would be a second record of the same fact, free to disagree with the chips — and
 * the chips are the one that is actually load-bearing.
 *
 * ## Where the bonus goes
 *
 * `addPlacementModifier`, the same call `TriggerButtons` banks a manual trigger with and the same
 * one the user types into by hand. An item is spent in the shop between battles, so by the time the
 * simulated battle starts all that remains of it is a permanent bonus on some monsters — which is
 * what a `StatModifier` already is. See `engine/itemEffects.ts`.
 *
 * Because `addPlacementModifier` accumulates same-stat entries, using Feast twice gives one chip at
 * +10 rather than two indistinguishable +5s. That is what using it twice should mean.
 *
 * ## The chooser replaces the body instead of opening a second modal
 *
 * Cake gives "2 random monsters" +5 Damage. The game rolls; the user picks, for the reason
 * `AffectedCreaturePicker` states — the player is reconciling a run that has *already* rolled, so a
 * second independent roll produces a board they cannot match against their screen. Two stacked
 * dialogs would mean two focus traps and two Escape handlers over one decision.
 */

/**
 * What the overlay is currently doing. A discriminated union rather than
 * `choosingItem`/`chosenSlots`/`isChoosing` as three loose pieces of state, so "choosing, but no
 * item" is not representable.
 */
type Step =
  | { kind: "browse" }
  | { kind: "choosing"; item: ItemRecord; slots: GridSlot[] };

/**
 * A placed monster, fully resolved. Wider than the engine's `ItemBoardMember`, which carries only
 * the three fields the recipient RULES read — the chooser also has to draw each monster, so it
 * needs the name and sprite the rules have no use for.
 */
interface BoardMember extends ItemBoardMember {
  creature: CreatureRecord;
}

/** Every item name, so a modifier can be recognised as one an item created. */
const ITEM_NAMES: ReadonlySet<string> = new Set(corpus.items.map((i) => i.name));

export function ItemPicker() {
  const { config, addPlacementModifier } = useTeamConfig();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "browse" });
  const [query, setQuery] = useState("");
  const [rarityFilter, setRarityFilter] = useState<Rarity | "">("");
  const inputRef = useRef<HTMLInputElement>(null);

  /** The placed monsters, resolved to the variant each slot actually holds (level and shiny). */
  const board = useMemo<BoardMember[]>(
    () =>
      config.placements.flatMap((p) => {
        const creature = resolveCreatureVariant(p.creatureId, p.level, p.shiny);
        return creature ? [{ slot: p.slot, creature }] : [];
      }),
    [config.placements],
  );

  /**
   * How many item-sourced bonuses are currently on the board — the panel's state, DERIVED from the
   * modifiers rather than stored beside them.
   *
   * Derived is the point: remove a Feast chip under Modifiers and this count drops, because it was
   * only ever reading the chips. A stored counter would have been the bag by another name, and
   * would have gone stale the first time a chip was removed somewhere else.
   */
  const appliedCount = config.placements.reduce(
    (sum, p) => sum + (p.modifiers ?? []).filter((m) => m.label !== undefined && ITEM_NAMES.has(m.label)).length,
    0,
  );

  const nothingPlaced = board.length === 0;

  useEffect(() => {
    if (!isOpen) return;
    // The query names ONE item you have already found, so it clears on every open; the rarity
    // filter describes the tier you are shopping in and persists (FR-018 as amended), the same
    // split the trinket and creature pickers settled on.
    setQuery("");
    setStep({ kind: "browse" });
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [isOpen]);

  const needle = query.trim().toLowerCase();
  const results = corpus.items.filter((item) => {
    if (
      needle !== "" &&
      !item.name.toLowerCase().includes(needle) &&
      !item.effectText.toLowerCase().includes(needle)
    ) {
      return false;
    }
    if (rarityFilter !== "" && item.rarity !== rarityFilter) return false;
    return true;
  });

  const sections = [
    ...RARITIES_ASC.map((rarity) => ({
      rarity: rarity as Rarity | null,
      items: results.filter((i) => i.rarity === rarity),
    })),
    // All 40 publish a rarity today, so this renders nothing — but a future record without one must
    // land somewhere rather than silently drop out of a rarity-sectioned list.
    { rarity: null, items: results.filter((i) => i.rarity === undefined) },
  ]
    .map((section) => ({ ...section, items: [...section.items].sort(byName) }))
    .filter((section) => section.items.length > 0);

  const filtersActive = query !== "" || rarityFilter !== "";

  function apply(item: ItemRecord, slots: GridSlot[]) {
    for (const slot of slots) {
      for (const modifier of modifiersForUse(item)) addPlacementModifier(slot, modifier);
    }
    setStep({ kind: "browse" });
  }

  function pick(item: ItemRecord) {
    if (!item.effect) return;
    if (item.effect.target.kind === ItemTargetKind.Chosen) {
      setStep({ kind: "choosing", item, slots: [] });
      return;
    }
    apply(item, itemRecipients(item.effect, board, [], config));
  }

  return (
    <>
      <EditorPanel
        title="Items"
        hint={
          nothingPlaced
            ? "place a Batomon first"
            : appliedCount === 0
              ? "none used"
              : `${appliedCount} applied`
        }
        action="Use an item…"
        onOpen={() => setIsOpen(true)}
        // Every item effect needs a recipient, so an overlay of 40 unusable cards would be a dead
        // end. The reason is in the hint, as it is for Modifiers.
        disabled={nothingPlaced}
      />

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={step.kind === "choosing" ? `Use ${step.item.name}` : "Use an item"}
        // "Done", as in the trinket picker: this overlay stays open while you work, so dismissing it
        // ends a task rather than abandoning a choice.
        closeLabel="Done"
        width="880px"
        toolbar={
          step.kind === "choosing" ? undefined : (
            <FilterBar>
              <TextField
                ref={inputRef}
                type="search"
                placeholder="Name or effect text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search items"
              />
              <Select
                value={rarityFilter}
                onChange={(e) => setRarityFilter(e.target.value as Rarity | "")}
                aria-label="Filter items by rarity"
              >
                <option value="">All rarities</option>
                {RARITIES_ASC.map((r) => (
                  <option key={r} value={r}>
                    {rarityLabel(r)}
                  </option>
                ))}
              </Select>
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
              <ResultCount shown={results.length} total={corpus.items.length} />
            </FilterBar>
          )
        }
      >
        {step.kind === "choosing" ? (
          <ChooseRecipients
            item={step.item}
            chosen={step.slots}
            board={board}
            onToggle={(slot) =>
              setStep((prev) => {
                if (prev.kind !== "choosing") return prev;
                const already = prev.slots.some((s) => slotKey(s) === slotKey(slot));
                return {
                  ...prev,
                  slots: already ? prev.slots.filter((s) => slotKey(s) !== slotKey(slot)) : [...prev.slots, slot],
                };
              })
            }
            onCancel={() => setStep({ kind: "browse" })}
            onConfirm={() => apply(step.item, itemRecipients(step.item.effect!, board, step.slots, config))}
          />
        ) : (
          <>
            {sections.length === 0 && <EmptyNote>No items match this search.</EmptyNote>}

            {sections.map((section) => (
              <PickerSection
                key={section.rarity ?? "unranked"}
                heading={section.rarity ? rarityLabel(section.rarity) : "Unranked"}
                color={section.rarity ? RARITY_COLORS[section.rarity] : undefined}
                count={section.items.length}
                columns={OVERLAY_COLUMNS}
              >
                {section.items.map((item) => (
                  <ItemCard key={item.id} item={item} board={board} config={config} onPick={() => pick(item)} />
                ))}
              </PickerSection>
            ))}

            <p className={styles.note}>
              Picking an item <strong>uses</strong> it: its bonus lands on the monsters that received
              it and stays there as a modifier, which you can see and remove under{" "}
              <strong>Modifiers</strong>. Pick the same item twice to apply it twice. Items whose
              effect is a reroll, a shop change or a level-up cannot be picked — they are real, but
              this calculator simulates one battle and they change no stat in it.
            </p>
          </>
        )}
      </Modal>
    </>
  );
}

interface ItemCardProps {
  item: ItemRecord;
  board: BoardMember[];
  config: Pick<TeamConfiguration, "paintedCreatureIds">;
  onPick: () => void;
}

/**
 * One item as a pickable card: its art over its rarity colour, its published text, and a line
 * saying who a pick would reach.
 *
 * That last line is the honest part. "Give your Electric monsters +1 Shock" on a board with no
 * Electric monster is a card that would do nothing, and a click that silently does nothing is
 * indistinguishable from one that worked — so the card is disabled and says why, before the press
 * rather than after it.
 */
function ItemCard({ item, board, config, onPick }: ItemCardProps) {
  const effect = item.effect;
  const choiceCount = effect ? requiredChoiceCount(effect) : 0;
  const recipients = effect && choiceCount === 0 ? itemRecipients(effect, board, [], config) : [];

  const status = ((): { text: string; usable: boolean } => {
    if (!effect) return { text: "No stat this calculator simulates.", usable: false };
    if (choiceCount > 0) return { text: `You choose ${choiceCount}.`, usable: true };
    if (recipients.length === 0) return { text: "No monster on your board matches.", usable: false };
    return { text: `Applies to ${recipients.length} ${recipients.length === 1 ? "monster" : "monsters"}.`, usable: true };
  })();

  return (
    <PickerCard
      onClick={onPick}
      disabled={!status.usable}
      aria-label={status.usable ? `Use ${item.name} — ${status.text}` : `${item.name} — ${status.text}`}
    >
      <SpriteTile
        name={item.name}
        // One band, the rarity's own colour — the same tile the trinket picker and the Batomon
        // picker paint.
        colors={item.rarity ? [RARITY_COLORS[item.rarity]] : []}
        spriteFile={item.spriteFile}
        spriteKind="item"
        className={styles.cardTile}
      />
      {/* The SAME renderer the Batomon card uses, so "+5 Damage" is the same pink here as on the
          creature whose ability says it (Principle VII). It was raw text until 2026-10-08. */}
      <AbilityText text={item.effectText} className={styles.cardEffect} />
      <p className={`${styles.cardStatus} ${status.usable ? "" : styles.blocked}`}>{status.text}</p>
    </PickerCard>
  );
}

interface ChooseRecipientsProps {
  item: ItemRecord;
  chosen: GridSlot[];
  board: BoardMember[];
  onToggle: (slot: GridSlot) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * The "who got it?" step for an item that names a COUNT rather than a rule.
 *
 * Draws the board, including empty slots, so the choice is made against the shape the user is
 * looking at in-game rather than against a list — the same reason the Modifiers overlay renders all
 * six cells.
 */
function ChooseRecipients({ item, chosen, board, onToggle, onCancel, onConfirm }: ChooseRecipientsProps) {
  const required = item.effect ? requiredChoiceCount(item.effect) : 0;
  const isFull = chosen.length >= required;
  const bySlot = new Map(board.map((m) => [slotKey(m.slot), m]));

  return (
    <>
      <AbilityText text={item.effectText} className={styles.chooseIntro} />
      <p className={styles.chooseCount}>
        Pick {required === 1 ? "the monster" : `the ${required} monsters`} that got it —{" "}
        <strong>
          {chosen.length} of {required}
        </strong>{" "}
        chosen.
      </p>

      <CardGrid columns={OVERLAY_COLUMNS} role="list" aria-label="Board slots">
        {STEP_SLOTS.map((slot) => {
          const member = bySlot.get(slotKey(slot));
          if (!member) {
            return (
              <div key={slotKey(slot)} className={styles.emptySlot} aria-hidden="true">
                — empty —
              </div>
            );
          }
          const on = chosen.some((s) => slotKey(s) === slotKey(slot));
          return (
            <PickerCard
              key={slotKey(slot)}
              role="listitem"
              selected={on}
              // A full selection disables what it cannot accept, so the refusal is visible before
              // the click rather than being a click that appears to do nothing.
              disabled={!on && isFull}
              title={!on && isFull ? `${required} already chosen` : undefined}
              onClick={() => onToggle(slot)}
              aria-label={`${on ? "Deselect" : "Select"} ${member.creature.name}`}
            >
              <CreatureTile
                name={member.creature.name}
                types={member.creature.types}
                spriteFile={member.creature.spriteFile}
                className={styles.cardTile}
              />
            </PickerCard>
          );
        })}
      </CardGrid>

      <div className={styles.chooseActions}>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          // Fewer than the item names is refused rather than silently under-applying: "2 random
          // monsters" is two, and a half-used Cake is not a board the game can produce.
          disabled={chosen.length !== required}
          onClick={onConfirm}
        >
          Use on {chosen.length} {chosen.length === 1 ? "monster" : "monsters"}
        </Button>
      </div>
    </>
  );
}

/**
 * The six board slots in reading order, so the chooser's grid matches the team grid's.
 *
 * `STABLE_SLOT_ORDER` already is that sequence — the engine's tie-break order and the board's
 * reading order are the same thing — so restating it here would be a second copy free to disagree.
 */
const STEP_SLOTS: readonly GridSlot[] = STABLE_SLOT_ORDER;

function byName(a: ItemRecord, b: ItemRecord): number {
  return a.name.localeCompare(b.name);
}
