import { useMemo, useState } from "react";
import { distinctCreatures } from "../../../data/corpus";
import { isInOppositeRegion } from "../../../data/typing";
import { useTeamConfig } from "../../../context/TeamConfigContext";
import { RARITIES_ASC, RARITIES_DESC, RARITY_COLORS, rarityLabel } from "../../../data/statColors";
import type { CreatureRecord, Rarity } from "../../../data/types";
import {
  CreatureTile,
  EmptyNote,
  FilterBar,
  Modal,
  OVERLAY_COLUMNS,
  PickerCard,
  PickerSection,
  ResultCount,
  TextField,
} from "../../primitives";
import styles from "./TrainerCard.module.css";

/**
 * Picks the species a set-designating trainer affects (T235 / FR-090).
 *
 * ## User-chosen, never generated
 *
 * The obvious implementation is to roll 9 random species, since that is what the game does. It
 * would also be useless: the player is looking at a run that has *already* rolled, and a second
 * independent roll produces a board they cannot reconcile with their screen. The app models the
 * state of their game, so the set is always theirs to enter.
 *
 * ## It is the trinket picker, not a list (2026-10-07, WI-001)
 *
 * This was the last picker still hand-rolling its own results: a single-column `<ul>` of up to 149
 * rows, each a sprite, a name and a right-aligned "SuperRare · Pantra" line, with its own
 * `.pickerList` / `.pickerItem` / `.pickerSearch` rules in `TrainerCard.module.css`. It now composes
 * from exactly what the trinket picker composes from — `Modal`, `FilterBar`, `TextField`,
 * `ResultCount`, `PickerSection` at `OVERLAY_COLUMNS`, `PickerCard`, `CreatureTile`, `EmptyNote` —
 * so the three overlays in this app are one idiom rather than three (Principle VII, FR-058).
 *
 * The cards are `CreatureTile`, the same tile the Batomon picker and the team grid use, because the
 * thing being picked here is the same thing: a species. Rarity is structure (a section per tier,
 * Common → Mythical, alphabetical within) rather than a label on each row.
 *
 * ## Nine slots, shown and enforced (WI-002)
 *
 * The cap was a counter reading "4/9" above a list that would happily take a tenth. It is now the
 * shape of the overlay: a **Selected** section of nine slots in three columns, empty ones included,
 * the way the Modifiers overlay renders all six board slots. A tenth selection is refused and says
 * why, rather than being silently dropped or silently replacing one of the nine.
 *
 * `MAX_AFFECTED_SPECIES` is one constant for both trainers, and the place to split if Smuggler's
 * nine is ever disproved: **Painter's nine is published** ("Nine random species are painted with
 * every type") and **Smuggler's is this project's assumption** — its published text states no count
 * at all, and is itself in `unconfirmedFields`. See research.md Q1.
 */
export const MAX_AFFECTED_SPECIES = 9;

/**
 * Painter's reported assignment: 2 Common / 2 Uncommon / 2 Rare / 2 Super Rare / 1 Legendary.
 *
 * Guidance, never enforced — the source says "typically", and hard-locking a soft constraint would
 * make the tool unable to represent a real run that happens to differ. The COUNT is enforced and the
 * SHAPE is not, because they have different evidence.
 *
 * Keyed by `Rarity` (2026-10-07, WI-002 validation finding): this was
 * `Record<string, number>` with a `"Super Rare"` key, while the corpus's union spells it
 * `"SuperRare"` — so the Super Rare chip was filtered out of the row and the shape silently added up
 * to 7 of 9. `statColors.ts` documents that exact spelling trap; this map had fallen into it. A
 * `Partial<Record<Rarity, number>>` makes the compiler reject the next misspelling.
 */
const PAINTER_RARITY_SHAPE: Partial<Record<Rarity, number>> = {
  Common: 2,
  Uncommon: 2,
  Rare: 2,
  SuperRare: 2,
  Legendary: 1,
};

interface AffectedCreaturePickerProps {
  kind: "painted" | "smuggled";
  onClose: () => void;
}

export function AffectedCreaturePicker({ kind, onClose }: AffectedCreaturePickerProps) {
  const { config, setPaintedCreatureIds, setSmuggledCreatureIds } = useTeamConfig();
  const [query, setQuery] = useState("");

  const selectedIds = (kind === "painted" ? config.paintedCreatureIds : config.smuggledCreatureIds) ?? [];
  const setSelected = kind === "painted" ? setPaintedCreatureIds : setSmuggledCreatureIds;
  const isFull = selectedIds.length >= MAX_AFFECTED_SPECIES;

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return distinctCreatures.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q)) return false;
      // Smuggler brings in creatures from the OPPOSITE region — "in the other region and not in
      // this one", never the set complement. 14 species are in both regions and 13 in neither, so
      // a `!== selectedRegion` filter would wrongly offer all 27 (FR-088).
      if (kind === "smuggled") return isInOppositeRegion(c.id, config.selectedRegion);
      return true;
    });
  }, [query, kind, config.selectedRegion]);

  /** The chosen species as records, in the picker's own order rather than click order (FR-067). */
  const selected = useMemo(
    () =>
      selectedIds
        .map((id) => distinctCreatures.find((c) => c.id === id))
        .filter((c): c is CreatureRecord => c !== undefined)
        .sort(byRarityThenName),
    [selectedIds],
  );

  const rarityCounts = useMemo(() => {
    const counts: Partial<Record<Rarity, number>> = {};
    for (const creature of selected) counts[creature.rarity] = (counts[creature.rarity] ?? 0) + 1;
    return counts;
  }, [selected]);

  const sections = RARITIES_ASC.map((rarity) => ({
    rarity,
    creatures: candidates.filter((c) => c.rarity === rarity).sort(byName),
  })).filter((section) => section.creatures.length > 0);

  const needsRegion = kind === "smuggled" && !config.selectedRegion;

  function remove(id: string) {
    setSelected(selectedIds.filter((x) => x !== id));
  }

  /**
   * Adding is REFUSED at the cap rather than rotating the oldest out. A silent replacement would
   * lose a species the user chose deliberately, and they have no way to know which one went.
   */
  function add(id: string) {
    if (selectedIds.includes(id) || isFull) return;
    setSelected([...selectedIds, id]);
  }

  return (
    <Modal
      isOpen
      title={kind === "painted" ? "Painted species" : "Smuggled species"}
      onClose={onClose}
      closeLabel="Done"
      width="880px"
      toolbar={
        <>
          <p className={styles.pickerIntro}>
            {kind === "painted"
              ? "Pick the species your Painter painted this run. Painted species count as every type."
              : "Pick the species your Smuggler brought in from the other region."}
          </p>

          {needsRegion && (
            <p className={styles.pickerWarn}>
              Choose a region first — &ldquo;the other region&rdquo; has no meaning until you do.
            </p>
          )}

          {/* Painter's rarity shape, as a target the user can ignore. */}
          {kind === "painted" && (
            <div className={styles.shapeRow}>
              {RARITIES_DESC.filter((r) => PAINTER_RARITY_SHAPE[r] !== undefined).map((r) => {
                const have = rarityCounts[r] ?? 0;
                const want = PAINTER_RARITY_SHAPE[r]!;
                return (
                  <span
                    key={r}
                    className={`${styles.shapeChip} ${have === want ? styles.shapeMet : ""}`}
                    title={`Typically ${want} ${rarityLabel(r)}; this is guidance, not a rule`}
                  >
                    {rarityLabel(r)} {have}/{want}
                  </span>
                );
              })}
            </div>
          )}

          <FilterBar>
            <TextField
              type="search"
              placeholder="Search species…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search species"
            />
            <ResultCount shown={candidates.length} total={distinctCreatures.length} />
          </FilterBar>
        </>
      }
    >
      {/*
        The nine slots. Empty ones are rendered, not omitted, so the cap is the shape of the section
        rather than a number in a sentence — the same reason the Modifiers overlay draws all six board
        slots. Nine is also exactly three rows of OVERLAY_COLUMNS, which is why "3xN" and "max 9" are
        the same requirement.
      */}
      <PickerSection
        heading="Selected"
        count={`${selected.length}/${MAX_AFFECTED_SPECIES}`}
        columns={OVERLAY_COLUMNS}
      >
        {selected.map((creature) => (
          <PickerCard
            key={creature.id}
            onClick={() => remove(creature.id)}
            aria-label={`Remove ${creature.name}`}
          >
            <CreatureTile
              name={creature.name}
              types={creature.types}
              spriteFile={creature.spriteFile}
              spriteSizeVar="--sprite-modifier"
              className={styles.slotTile}
              overlay={
                <span className={styles.removeMark} aria-hidden="true">
                  −
                </span>
              }
            />
          </PickerCard>
        ))}
        {Array.from({ length: MAX_AFFECTED_SPECIES - selected.length }, (_, i) => (
          <div key={`empty-${i}`} className={styles.emptySlot} aria-hidden="true">
            — empty —
          </div>
        ))}
      </PickerSection>

      {isFull && (
        <p className={styles.pickerWarn} role="status">
          All {MAX_AFFECTED_SPECIES} slots are taken. Remove one above to choose a different species.
        </p>
      )}

      {sections.length === 0 && (
        <EmptyNote>{needsRegion ? "No region selected." : "No species match this search."}</EmptyNote>
      )}

      {sections.map((section) => (
        <PickerSection
          key={section.rarity}
          heading={rarityLabel(section.rarity)}
          color={RARITY_COLORS[section.rarity]}
          count={section.creatures.length}
          columns={OVERLAY_COLUMNS}
        >
          {section.creatures.map((creature) => {
            const on = selectedIds.includes(creature.id);
            return (
              <PickerCard
                key={creature.id}
                selected={on}
                // A full set disables what it cannot accept, so the refusal is visible before the
                // click rather than being a click that appears to do nothing.
                disabled={!on && isFull}
                title={!on && isFull ? `All ${MAX_AFFECTED_SPECIES} slots are taken` : undefined}
                onClick={() => (on ? remove(creature.id) : add(creature.id))}
                aria-label={`${on ? "Remove" : "Add"} ${creature.name}`}
              >
                <CreatureTile
                  name={creature.name}
                  types={creature.types}
                  spriteFile={creature.spriteFile}
                  spriteSizeVar="--sprite-modifier"
                  className={styles.slotTile}
                />
              </PickerCard>
            );
          })}
        </PickerSection>
      ))}
    </Modal>
  );
}

function byName(a: CreatureRecord, b: CreatureRecord): number {
  return a.name.localeCompare(b.name);
}

function byRarityThenName(a: CreatureRecord, b: CreatureRecord): number {
  return RARITIES_ASC.indexOf(a.rarity) - RARITIES_ASC.indexOf(b.rarity) || byName(a, b);
}
