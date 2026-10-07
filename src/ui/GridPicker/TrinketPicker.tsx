import { useEffect, useMemo, useRef, useState } from "react";
import { corpus } from "../../data/corpus";
import { useTeamConfig } from "../../context/TeamConfigContext";
import { RARITY_COLORS, RARITIES_ASC } from "../../data/statColors";
import type { Rarity, TrinketRecord } from "../../data/types";
import {
  ClearFiltersButton,
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
 * ## The "★ affects DPS" marker is gone (2026-10-07, user-reported)
 *
 * It marked the 6 trinkets with populated `effectTags` — the ones the engine simulates — and was
 * defended across three rounds as an honest distinction. It was not honest, because of what it
 * SAID: "affects DPS" is a claim about the game, and the game disagrees. Speed Whistle's +12%
 * Cooldown Speed plainly affects DPS and carried no marker, so the badge quietly told users that
 * trinket does nothing to their output.
 *
 * The information it was really carrying is "this one is wired into our engine", which is a fact
 * about the tool's coverage rather than about the board, and the user is right that a per-card
 * badge is the wrong place for it. The honest fix is to model the missing effects; the dishonest
 * half-measure was the badge.
 *
 * ## Second pass, same day
 *
 * The first pass still built the result card by hand — a local `.card` rule that was the creature
 * picker's `.card` with a different background, which is the duplication this was supposed to be
 * removing. It is now `PickerCard` + `SpriteTile`, with only the effect-text caption local to
 * trinkets.
 *
 * The grid is **three fixed columns**, matching the team grid and the other overlays, instead of
 * auto-fit: auto-fit gave two 400px columns on a narrower window, so the cards were enormous and
 * mostly empty. Their declared height is gone with it — rows equalize to their own tallest card
 * now, which removes the ~3rem of reserved dead space under every short description.
 *
 * The panel is an `EditorPanel`, the same one Modifiers uses, so the two sit side by side above the
 * grid as a matched pair.
 *
 * ## Third pass: everything about a selection lives in the overlay (2026-10-07)
 *
 * The panel used to list each selected trinket as a chip, so it grew and shrank as trinkets were
 * added and removed and the team grid below it moved every time. The panel now shows only a count,
 * and the overlay gained a **Selected** section above the browse list — so the state and the thing
 * that changes it are in the same place, which is also the only place with room for it.
 *
 * Two behavioural consequences, both the user's:
 *
 * - **A selected trinket is NOT removed from the browse list, and selecting is not a toggle.** The
 *   same trinket can be acquired more than once — a shop can offer it again — so clicking a browse
 *   card always ADDS a copy, and the card shows `×N` when copies are already held. Previously the
 *   card was `aria-pressed` and a second click took the first copy away, which made two Hero's
 *   Swords unrepresentable.
 * - **Removing happens in the Selected section**, one copy per click, because that is now the only
 *   control that means "take one away".
 */
export function TrinketPicker() {
  const { config, addTrinketId, removeTrinketId } = useTeamConfig();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rarityFilter, setRarityFilter] = useState<Rarity | "">("");
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * The DISTINCT selected trinkets with how many copies are held, in the picker's own order
   * (rarity, then name) rather than click order — FR-067: a list's display order must not depend on
   * how its items got there.
   *
   * Grouped rather than one entry per copy: three Hero's Swords are one trinket you have three of,
   * and three identical cards would be three things to read and no clearer about the count.
   */
  /** How many copies of each trinket are held. Also drives the `×N` badge on a browse card. */
  const copiesOf = useMemo(() => {
    const counts = new Map<string, number>();
    for (const id of config.trinketIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
  }, [config.trinketIds]);

  const selected = useMemo(
    () =>
      [...copiesOf]
        .map(([id, count]) => ({ trinket: corpus.trinkets.find((t) => t.id === id), count }))
        .filter((held): held is Held => held.trinket !== undefined)
        .sort((a, b) => byRarityThenName(a.trinket, b.trinket)),
    [copiesOf],
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
    <>
      {/* FR-052's original concern — that selected trinkets displace the team grid — is answered
          structurally now rather than by collapsing a list: nothing here grows. */}
      <EditorPanel
        title="Trinkets"
        hint={config.trinketIds.length === 0 ? "none selected" : `${config.trinketIds.length} selected`}
        action="Choose trinkets…"
        onOpen={() => setIsOpen(true)}
      />

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
            <TextField
              ref={inputRef}
              type="search"
              placeholder="Name or effect text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search trinkets"
            />
            <Select
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
            <ResultCount shown={results.length} total={corpus.trinkets.length} />
          </FilterBar>
        }
      >
        {/*
          The selected trinkets, in the overlay rather than on the panel (2026-10-07). This is the
          section the user asked for: the state and the control that changes it in one place, and a
          place with room for the state to grow.

          It is deliberately the SAME card as the browse list below. The only differences are what
          a click means — remove one copy here, add one there — and the mark that says so.
        */}
        {selected.length > 0 && (
          <PickerSection heading="Selected" count={config.trinketIds.length} columns={OVERLAY_COLUMNS}>
            {selected.map(({ trinket, count }) => (
              <TrinketCard
                key={trinket.id}
                trinket={trinket}
                count={count}
                action="remove"
                onClick={() => removeTrinketId(trinket.id)}
              />
            ))}
          </PickerSection>
        )}

        {sections.length === 0 && <EmptyNote>No trinkets match this search.</EmptyNote>}

        {sections.map((section) => (
          <PickerSection
            key={section.rarity ?? "unranked"}
            heading={section.rarity ?? "Unranked"}
            color={section.rarity ? RARITY_COLORS[section.rarity] : undefined}
            count={section.trinkets.length}
            columns={OVERLAY_COLUMNS}
          >
            {/* Every trinket stays listed however many copies are held: a shop can offer the same
                one again, so removing it from this list would make a second copy unreachable. */}
            {section.trinkets.map((trinket) => (
              <TrinketCard
                key={trinket.id}
                trinket={trinket}
                count={copiesOf.get(trinket.id) ?? 0}
                action="add"
                onClick={() => addTrinketId(trinket.id)}
              />
            ))}
          </PickerSection>
        ))}
      </Modal>
    </>
  );
}

interface Held {
  trinket: TrinketRecord;
  count: number;
}

interface TrinketCardProps extends Held {
  /** What clicking this card does. Drives the mark, the accessible name, and nothing else. */
  action: "add" | "remove";
  onClick: () => void;
}

/**
 * One trinket as a result card: the rarity-coloured tile the Batomon picker paints with types, the
 * effect text that is the whole reason this is not a dropdown, and a `×N` badge when copies are
 * held.
 *
 * ONE component for both of the overlay's sections. They were briefly separate and that is how the
 * browse card ended up `aria-pressed` — selection state on a card that no longer toggles.
 */
function TrinketCard({ trinket, count, action, onClick }: TrinketCardProps) {
  const label =
    action === "add"
      ? `Add ${trinket.name}${count > 0 ? `, ${count} already selected` : ""}`
      : `Remove one ${trinket.name}${count > 1 ? ` of ${count}` : ""}`;

  return (
    <PickerCard onClick={onClick} aria-label={label}>
      <SpriteTile
        name={trinket.name}
        // One band, the rarity's own colour — the same tile the Batomon picker paints with a
        // creature's types.
        colors={trinket.rarity ? [RARITY_COLORS[trinket.rarity]] : []}
        spriteFile={trinket.spriteFile}
        spriteKind="trinket"
        className={styles.cardTile}
        overlay={
          <>
            {count > 0 && (
              <span className={styles.countBadge} aria-hidden="true">
                ×{count}
              </span>
            )}
            {action === "remove" && (
              <span className={styles.removeMark} aria-hidden="true">
                −
              </span>
            )}
          </>
        }
      />
      <p className={styles.cardEffect}>{trinket.effectText}</p>
    </PickerCard>
  );
}

function byName(a: TrinketRecord, b: TrinketRecord): number {
  return a.name.localeCompare(b.name);
}

function byRarityThenName(a: TrinketRecord, b: TrinketRecord): number {
  const rank = (t: TrinketRecord) => (t.rarity ? RARITIES_ASC.indexOf(t.rarity) : RARITIES_ASC.length);
  return rank(a) - rank(b) || byName(a, b);
}
