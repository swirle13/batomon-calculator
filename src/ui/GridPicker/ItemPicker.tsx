import { useEffect, useMemo, useRef, useState } from "react";
import { corpus, resolveCreatureVariant } from "../../data/corpus";
import { useTeamConfig } from "../../context/TeamConfigContext";
import { RARITY_COLORS, RARITIES_ASC, rarityLabel } from "../../data/statColors";
import type { CreatureRecord, GridSlot, ItemRecord, Rarity, TeamConfiguration } from "../../data/types";
import { ItemTargetKind, ModifierStat } from "../../data/enums";
import { slotKey, STABLE_SLOT_ORDER } from "../../engine/grid";
import {
  itemRecipients,
  modifiersForUse,
  requiredChoiceCount,
  type ItemBoardMember,
} from "../../engine/itemEffects";
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
  Surface,
  TextField,
} from "../primitives";
import styles from "./ItemPicker.module.css";

/**
 * Item selection and USE (tasks.md T046, 2026-10-08).
 *
 * ## Holding and using are two different acts
 *
 * `config.itemIds` is the bag: items you hold and have not spent. Using one applies its bonus and
 * takes it out of the bag, because that is what using a consumable does — and because the bonus
 * does not need the item to persist. It is written as `StatModifier`s on the monsters that
 * received it (`engine/itemEffects.ts`), which is the same representation a manual trigger banks
 * into and the same one the user types by hand in the Modifiers overlay.
 *
 * That is the whole design: an item's lasting effect IS a modifier, so there is one place to see
 * it, one place to remove it, and the share link round-trips it with no extra work. The
 * alternative — a `usedItemIds` list that `simulate()` re-resolves every render — would have been
 * a second way to say the same thing, and the two would drift the way every other duplicated
 * resolution path in this project has.
 *
 * ## Only 11 of the 40 items offer a Use button
 *
 * The rest are shop/economy mechanics and run-state changes with no battle-stat expression. They
 * are still listed, still cited, still browsable — they just have nothing for this engine to
 * apply, and a Use button that silently did nothing would be the dishonest option the trinket
 * picker's "★ affects DPS" badge was removed for.
 *
 * ## The chooser replaces the body instead of opening a second modal
 *
 * Cake gives "2 random monsters" +5 Damage. The game rolls; the user picks, for the reason
 * `AffectedCreaturePicker` states — the player is reconciling a run that has already rolled, so a
 * second independent roll produces a board they cannot match against their screen. Picking happens
 * in this same overlay, as a step, because two stacked dialogs mean two focus traps and two Escape
 * handlers competing over one decision.
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

export function ItemPicker() {
  const { config, addItemId, removeItemId, addPlacementModifier } = useTeamConfig();
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

  /** How many copies of each item are in the bag. Also drives the `×N` badge on a browse card. */
  const copiesOf = useMemo(() => {
    const counts = new Map<string, number>();
    for (const id of config.itemIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
  }, [config.itemIds]);

  const bag = useMemo(
    () =>
      [...copiesOf]
        .map(([id, count]) => ({ item: corpus.items.find((i) => i.id === id), count }))
        .filter((held): held is Held => held.item !== undefined)
        .sort((a, b) => byRarityThenName(a.item, b.item)),
    [copiesOf],
  );

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
    // All 40 publish a rarity today, so this renders nothing — but a future record without one
    // must land somewhere rather than silently drop out of a rarity-sectioned list.
    { rarity: null, items: results.filter((i) => i.rarity === undefined) },
  ]
    .map((section) => ({ ...section, items: [...section.items].sort(byName) }))
    .filter((section) => section.items.length > 0);

  const filtersActive = query !== "" || rarityFilter !== "";

  /** Applies one use of `item` to `slots`, then spends the copy. */
  function use(item: ItemRecord, slots: GridSlot[]) {
    for (const slot of slots) {
      for (const modifier of modifiersForUse(item)) addPlacementModifier(slot, modifier);
    }
    // Using a consumable consumes it. The bonus survives as the modifier chips just written, so
    // nothing is lost by the item leaving the bag — that is what "used" means.
    removeItemId(item.id);
    setStep({ kind: "browse" });
  }

  function startUse(item: ItemRecord) {
    if (!item.effect) return;
    if (item.effect.target.kind === ItemTargetKind.Chosen) {
      setStep({ kind: "choosing", item, slots: [] });
      return;
    }
    use(item, itemRecipients(item.effect, board, [], config));
  }

  return (
    <>
      <EditorPanel
        title="Items"
        hint={config.itemIds.length === 0 ? "none held" : `${config.itemIds.length} held`}
        action="Choose items…"
        onOpen={() => setIsOpen(true)}
      />

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={step.kind === "choosing" ? `Use ${step.item.name}` : "Choose items"}
        // "Done", as in the trinket picker: this overlay is multi-edit and stays open while you
        // work, so dismissing it ends a task rather than abandoning a choice.
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
            onConfirm={() => use(step.item, itemRecipients(step.item.effect!, board, step.slots, config))}
          />
        ) : (
          <>
            {bag.length > 0 && (
              <PickerSection heading="Your items" count={config.itemIds.length} columns={OVERLAY_COLUMNS}>
                {bag.map(({ item, count }) => (
                  <BagCard
                    key={item.id}
                    item={item}
                    count={count}
                    board={board}
                    config={config}
                    onUse={() => startUse(item)}
                    onRemove={() => removeItemId(item.id)}
                  />
                ))}
              </PickerSection>
            )}

            {sections.length === 0 && <EmptyNote>No items match this search.</EmptyNote>}

            {sections.map((section) => (
              <PickerSection
                key={section.rarity ?? "unranked"}
                heading={section.rarity ? rarityLabel(section.rarity) : "Unranked"}
                color={section.rarity ? RARITY_COLORS[section.rarity] : undefined}
                count={section.items.length}
                columns={OVERLAY_COLUMNS}
              >
                {/* Every item stays listed however many copies are held: the shop can stock the
                    same one again, so removing it here would make a second copy unreachable. */}
                {section.items.map((item) => (
                  <PickerCard
                    key={item.id}
                    onClick={() => addItemId(item.id)}
                    aria-label={`Add ${item.name}${copiesOf.get(item.id) ? `, ${copiesOf.get(item.id)} already held` : ""}`}
                  >
                    <ItemTile item={item} count={copiesOf.get(item.id) ?? 0} />
                    <p className={styles.cardEffect}>{item.effectText}</p>
                  </PickerCard>
                ))}
              </PickerSection>
            ))}

            <p className={styles.note}>
              Items you pick go into <strong>your items</strong> above. Using one applies its bonus
              to the monsters that received it and spends the item — the bonus stays as a modifier
              on each of those monsters, where you can see and remove it under{" "}
              <strong>Modifiers</strong>. Items whose effect is a reroll, a shop change or a
              level-up have no Use button: they are real, but this calculator simulates one battle
              and they do not change a stat in it.
            </p>
          </>
        )}
      </Modal>
    </>
  );
}

interface Held {
  item: ItemRecord;
  count: number;
}

/** The item's art over its rarity colour, with a `×N` badge when copies are held. */
function ItemTile({ item, count, removable = false }: { item: ItemRecord; count: number; removable?: boolean }) {
  return (
    <SpriteTile
      name={item.name}
      colors={item.rarity ? [RARITY_COLORS[item.rarity]] : []}
      spriteFile={item.spriteFile}
      spriteKind="item"
      className={styles.cardTile}
      overlay={
        <>
          {count > 1 && (
            <span className={styles.countBadge} aria-hidden="true">
              ×{count}
            </span>
          )}
          {removable && (
            <span className={styles.removeMark} aria-hidden="true">
              −
            </span>
          )}
        </>
      }
    />
  );
}

interface BagCardProps extends Held {
  board: BoardMember[];
  /** Carried through so a PAINTED species counts as the type a type-filtered item looks for. */
  config: Pick<TeamConfiguration, "paintedCreatureIds">;
  onUse: () => void;
  onRemove: () => void;
}

/**
 * One held item, with the controls that spend or discard it.
 *
 * Not a `PickerCard`: that primitive IS the button, and this card holds two of its own. A button
 * inside a button is invalid HTML and the inner one is unreachable by keyboard.
 */
function BagCard({ item, count, board, config, onUse, onRemove }: BagCardProps) {
  const effect = item.effect;
  const needsChoice = effect ? requiredChoiceCount(effect) > 0 : false;
  // For a Chosen item the recipients are not known until the user picks, so the preview says what
  // it CAN say: how many must be picked.
  const recipients = effect && !needsChoice ? itemRecipients(effect, board, [], config) : [];

  const blocked = ((): string | null => {
    if (!effect) return null;
    if (board.length === 0) return "Place a Batomon first.";
    if (needsChoice) return null;
    if (recipients.length === 0) return "No monster on your board matches this item.";
    return null;
  })();

  return (
    <Surface tone="flat" pad="sm" className={styles.bagCard}>
      <ItemTile item={item} count={count} />

      {effect ? (
        <p className={`${styles.useSummary} ${blocked ? styles.blocked : ""}`}>
          {blocked ?? `${grantSummary(item)} ${recipientSummary(effect, recipients.length)}`}
        </p>
      ) : (
        <p className={styles.useSummary}>No effect this calculator can apply.</p>
      )}

      <div className={styles.bagControls}>
        {effect && (
          <Button
            variant="primary"
            size="sm"
            disabled={blocked !== null}
            onClick={onUse}
            aria-label={`Use ${item.name}`}
            title="Applies the bonus as a modifier on each monster that receives it, and spends the item."
          >
            {needsChoice ? "Use…" : "Use"}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onRemove} aria-label={`Discard one ${item.name}`}>
          Discard
        </Button>
      </div>
    </Surface>
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
 * The "who gets it?" step for an item that names a COUNT rather than a rule.
 *
 * Draws the board, including empty slots, so the choice is made against the shape the user is
 * looking at in-game rather than against a list — the same reason the Modifiers overlay renders
 * all six cells.
 */
function ChooseRecipients({ item, chosen, board, onToggle, onCancel, onConfirm }: ChooseRecipientsProps) {
  const required = item.effect ? requiredChoiceCount(item.effect) : 0;
  const isFull = chosen.length >= required;
  const bySlot = new Map(board.map((m) => [slotKey(m.slot), m]));

  return (
    <>
      <p className={styles.chooseIntro}>
        {item.effectText}
        <br />
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

/** "+5 Damage", "+5% Cooldown Speed", "+5 Damage and +1 Multicast" — in the user's units. */
function grantSummary(item: ItemRecord): string {
  const parts = (item.effect?.stats ?? []).map((g) => `${formatAmount(g.stat, g.amount)} ${STAT_LABEL[g.stat] ?? g.stat}`);
  return parts.join(" and ");
}


/** Who it lands on, said as a count where a count is what the user needs to know. */
function recipientSummary(effect: NonNullable<ItemRecord["effect"]>, recipientCount: number): string {
  if (effect.target.kind === ItemTargetKind.Chosen) {
    return `to ${effect.target.count} ${effect.target.count === 1 ? "monster" : "monsters"} you pick.`;
  }
  return `to ${recipientCount} ${recipientCount === 1 ? "monster" : "monsters"}.`;
}

const STAT_LABEL: Partial<Record<ModifierStat, string>> = {
  [ModifierStat.DamageFlatAdd]: "Damage",
  [ModifierStat.BurnAmountAdd]: "Burn",
  [ModifierStat.PoisonAmountAdd]: "Poison",
  [ModifierStat.ShockAmountAdd]: "Shock",
  [ModifierStat.ShieldAmountAdd]: "Shield",
  [ModifierStat.MulticastAdd]: "Multicast",
  [ModifierStat.HealAmountAdd]: "Heal",
  [ModifierStat.CooldownSpeedAdd]: "Cooldown Speed",
};

/**
 * Cooldown Speed is STORED as a fraction and PUBLISHED as a percentage, so 0.05 reads "+5%" —
 * the same conversion `ModifierEditor`'s chips and `TriggerButtons` both make, and the same one
 * that would make a raw print read "+0.05 Cooldown Speed" against a card saying "+5%".
 */
function formatAmount(stat: ModifierStat, amount: number): string {
  if (stat !== ModifierStat.CooldownSpeedAdd) return `+${amount}`;
  return `+${Math.round(amount * 1000) / 10}%`;
}

function byName(a: ItemRecord, b: ItemRecord): number {
  return a.name.localeCompare(b.name);
}

function byRarityThenName(a: ItemRecord, b: ItemRecord): number {
  const rank = (i: ItemRecord) => (i.rarity ? RARITIES_ASC.indexOf(i.rarity) : RARITIES_ASC.length);
  return rank(a) - rank(b) || byName(a, b);
}
