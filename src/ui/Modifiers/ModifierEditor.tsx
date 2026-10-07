import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import type { GridCol, GridRow, ModifierStat, GridSlot, TeamPlacement } from "../../data/types";
import { resolveCreatureVariant } from "../../data/corpus";
import { useTeamConfig } from "../../context/TeamConfigContext";
import { CardGrid, Chip, CreatureTile, EditorPanel, Modal, OVERLAY_COLUMNS, Surface } from "../primitives";
import { slotKey } from "../../engine/grid";
import styles from "./ModifierEditor.module.css";

/**
 * Short labels only (FR-039c). The unit/format explanation that used to live inside the Cooldown
 * Speed option's own text now sits in one supporting line below the list, where it is readable
 * without opening a dropdown and doesn't stretch the control.
 */
const STAT_OPTIONS: { value: ModifierStat; label: string }[] = [
  { value: "damageFlatAdd", label: "Damage" },
  { value: "cooldownFlatAddSeconds", label: "Cooldown (seconds)" },
  { value: "cooldownSpeedAdd", label: "Cooldown Speed" },
  { value: "burnAmountAdd", label: "Burn applied" },
  { value: "poisonAmountAdd", label: "Poison applied" },
  { value: "shockAmountAdd", label: "Shock applied" },
  { value: "shieldAmountAdd", label: "Shield applied" },
];

function statLabel(stat: ModifierStat): string {
  return STAT_OPTIONS.find((o) => o.value === stat)?.label ?? stat;
}

/**
 * Per-creature carry-over modifiers (FR-039, 2026-10-06 round 6, research.md H7).
 *
 * Four user-requested changes from the previous design, which was one global scope dropdown plus
 * one combined table:
 *
 * 1. **Collapsed by default** — this is occasional-use, and it previously occupied permanent
 *    vertical space between the DPS tables and the chart for a feature most sessions never touch.
 * 2. **No team-wide option.** Removed from the UI only. `TeamConfiguration.teamModifiers` and
 *    `simulate()`'s team-wide summation both stay, because round 5 routes selected Trinkets'
 *    `effectTags` through exactly that path — deleting the engine support would silently disable
 *    trinkets. This is an affordance removal, not a capability removal.
 * 3. **Short stat labels**, with the decimal/percent explanation as supporting text.
 * 4. **Integrated per creature.** One row per placed creature, each with its own add-control and
 *    its own modifier chips, so the creature a modifier belongs to is structural rather than
 *    something the user picks from a dropdown and has to keep re-binding as the roster shifts
 *    around it (the user's "new mons will be added before/after a mon that affects the whole team"
 *    point).
 *
 * 2026-10-07: rebuilt on the primitives layer. This was the last surface still hand-rolling its
 * own `<details>`, its own card border, its own chip and its own hex colours — nine raw literals
 * in a stylesheet whose header file says a literal is a defect. Each placed creature's cell now
 * opens with the SAME `CreatureTile` the Batomon picker and the team grid use, so a creature looks
 * the same in all three places, and the chips are the shared `Chip` (Principle VII, FR-058).
 *
 * ## The editor moved into an overlay (2026-10-07, second pass)
 *
 * Point 1 above — "collapsed by default" — is now served by an overlay rather than a disclosure,
 * and the reason is width rather than height. The disclosure expanded INSIDE the team column, so
 * each of the six creature cells got a third of it; once the column became two panels side by
 * side, a cell was a third of half of a column and the stat select, the amount field and the Add
 * button could not sit on one line. The requirement was never "be a `<details>`", it was "do not
 * occupy permanent space" — which an overlay satisfies while giving each cell ~270px to work in.
 *
 * What stays on the page is an `EditorPanel`: the panel is itself the control that opens the
 * overlay, and it shows a COUNT and nothing else. Trinkets uses the same panel, so the pair reads
 * as one row of two matched controls above the grid.
 *
 * The panel briefly summarised the active modifiers as removable chips, grouped by creature. That
 * is gone at the user's request and for a good reason: the chips changed the panel's height as
 * modifiers were added and removed, so the team grid below moved while you were working in it. The
 * overlay is where a modifier is read and removed now, which is also where it is created — one
 * place for the whole job, and one that can grow without displacing anything.
 */
const ROWS: GridRow[] = ["back", "front"];
const COLS: GridCol[] = [0, 1, 2];

export function ModifierEditor() {
  const { config, addPlacementModifier, removePlacementModifier } = useTeamConfig();
  const [isOpen, setIsOpen] = useState(false);
  const activeCount = countModifiers(config.placements);
  const nothingPlaced = config.placements.length === 0;

  return (
    <>
      <EditorPanel
        title="Modifiers"
        // The empty-board case states itself here rather than in a line of prose below the panel:
        // an overlay of six empty cells would be a dead end, and the hint is the one place a
        // fixed-shape panel has to say why.
        hint={nothingPlaced ? "place a Batomon first" : activeCount === 0 ? "none active" : `${activeCount} active`}
        action="Edit modifiers…"
        onOpen={() => setIsOpen(true)}
        disabled={nothingPlaced}
      />

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Modifiers"
        // "Done", as in the trinket picker: this overlay is multi-edit and stays open while you
        // work, so dismissing it ends a task rather than abandoning a choice.
        closeLabel="Done"
        width="880px"
        toolbar={
          <p className={styles.intro}>
            Carry-over bonuses from previous rounds — the engine simulates one battle at a time, not
            a whole match. For example, a creature's "On Victory" ability that granted it +10 Damage
            permanently earlier in the run.
          </p>
        }
      >
        {/* FR-079 (WI-004): the same 2x3 shape as the team grid, including empty cells, so each
            modifier cell sits where its creature sits on the board. Three columns is also what
            every other overlay uses (OVERLAY_COLUMNS). */}
        <CardGrid columns={OVERLAY_COLUMNS} role="list" aria-label="Modifiers by grid slot">
          {ROWS.flatMap((row) =>
            COLS.map((col) => {
              const placement = config.placements.find((p) => p.slot.row === row && p.slot.col === col);
              if (!placement) {
                return (
                  <div key={`${row}-${col}`} className={styles.emptyCell} aria-hidden="true">
                    — empty —
                  </div>
                );
              }
              return (
                <PlacementModifierCell
                  key={slotKey(placement.slot)}
                  placement={placement}
                  onAdd={(stat, amount) => addPlacementModifier(placement.slot, { stat, amount })}
                  onRemove={(id) => removePlacementModifier(placement.slot, id)}
                />
              );
            }),
          )}
        </CardGrid>

        {/* The last sentence was stale (2026-10-07): it still told users a modifier "can only
            scale an effect the creature already has", which `engine/modifiers.ts` stopped being
            true of when FR-078 was amended. It was stating the opposite of what the engine would
            do with their input. */}
        <p className={styles.note}>
          Cooldown Speed is a decimal, not a percentage: enter <code>0.2</code> for +20%. Damage and
          status amounts are flat additions, and they may <em>create</em> an effect the creature does
          not publish — +4 Burn on a creature that applies none gives it Burn, the way a trinket or
          an ally's ability would. Cooldown speed is the one exception: it needs an existing cast
          cycle to speed up.
        </p>
      </Modal>
    </>
  );
}

function countModifiers(placements: TeamPlacement[]): number {
  return placements.reduce((sum, p) => sum + (p.modifiers?.length ?? 0), 0);
}

/** Modifiers are entered as signed deltas, so a positive one is shown with its sign. */
function formatAmount(amount: number): string {
  return amount > 0 ? `+${amount}` : String(amount);
}

interface PlacementModifierCellProps {
  placement: TeamPlacement;
  onAdd: (stat: ModifierStat, amount: number) => void;
  onRemove: (id: string) => void;
}

/** One creature's cell in the overlay: who it is, its current chips, and its own add-control. */
function PlacementModifierCell({ placement, onAdd, onRemove }: PlacementModifierCellProps) {
  const creature = resolveCreatureVariant(placement.creatureId, placement.level, placement.shiny);
  const name = creature?.name ?? placement.creatureId;
  const [stat, setStat] = useState<ModifierStat>("damageFlatAdd");
  // Starts EMPTY, not "0". A prefilled zero meant typing 20 produced "020" unless you deleted it
  // first — the field is for a number you are about to type, so it should not already contain one.
  // The placeholder still shows a 0 so the expected shape is obvious.
  const [amount, setAmount] = useState("");
  const amountRef = useRef<HTMLInputElement>(null);

  /**
   * FR-078 (amended 2026-10-07): a modifier may CREATE an effect, so almost nothing is inert.
   *
   * This used to warn that `+50 damage` on a creature with `baseDamage: null` had "nothing to
   * scale", and the same for a status the creature did not already apply. Both the warning and the
   * clamping behind it were wrong: trinkets and ally abilities routinely give a creature damage or
   * a status it did not have, and that is exactly the board a user is trying to record. See
   * engine/modifiers.ts.
   *
   * The one genuine case left is a creature with no published cooldown. It has no cast cycle, so a
   * RELATIVE change to that cycle has nothing to act on — but an absolute `+N seconds` now gives it
   * one, so only the speed modifier is called out.
   */
  const inertReason = ((): string | null => {
    if (!creature) return null;
    if (stat === "cooldownSpeedAdd" && creature.baseCooldownSeconds === null)
      return `${name} has no published cooldown, so a cooldown-speed modifier has no cast cycle to speed up. Add a cooldown in seconds to give it one.`;
    return null;
  })();

  function handleAdd() {
    const parsed = Number(amount);
    if (Number.isNaN(parsed) || parsed === 0) return;
    // The modifier is still ADDED when inert — the warning informs, it does not block. The user may
    // be recording a trinket they are about to buy, and refusing the input would be worse than
    // telling them it currently does nothing.
    onAdd(stat, parsed);
    setAmount("");
    // Keep focus here so a second modifier can be typed straight away. Adding several in a row is
    // the normal case, and returning to the mouse between each is the thing being fixed.
    amountRef.current?.focus();
  }

  function handleStatChange(event: ChangeEvent<HTMLSelectElement>) {
    // The cast is the one narrow exception the project's TS rules allow in UI glue: a `<select>`'s
    // value is typed `string` by the DOM, and every option here comes from STAT_OPTIONS, whose
    // values ARE the `ModifierStat` union.
    setStat(event.target.value as ModifierStat);
  }

  function handleAmountKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Enter submits. This sits inside a form-less layout, so there is no implicit submit to rely on
    // and the key has to be handled explicitly.
    if (event.key !== "Enter") return;
    event.preventDefault();
    handleAdd();
  }

  return (
    <Surface tone="flat" pad="sm" className={styles.cell} role="listitem">
      {/* The same tile as the team grid and the picker, so this cell is recognisably the creature
          sitting in that slot rather than a name in a different-looking box. */}
      <CreatureTile
        name={name}
        types={creature?.types ?? []}
        spriteFile={creature?.spriteFile}
        // Smaller than the picker's 96px: this tile identifies the creature, and the controls below
        // it are what the cell is for. The token is shared with `.cellTile`'s height, so the tile
        // cannot be shorter than the sprite it holds.
        spriteSizeVar="--sprite-modifier"
        className={styles.cellTile}
        overlay={<span className={styles.levelBadge}>Lv.{placement.level}</span>}
      />

      {(placement.modifiers ?? []).length > 0 && (
        <ul className={styles.chips}>
          {(placement.modifiers ?? []).map((modifier) => (
            <li key={modifier.id} className={styles.chipItem}>
              <Chip
                className={styles.modifierChip}
                onRemove={() => onRemove(modifier.id)}
                removeLabel={`Remove ${statLabel(modifier.stat)} modifier from ${name}`}
              >
                {statLabel(modifier.stat)} {formatAmount(modifier.amount)}
              </Chip>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.addControls}>
        <select value={stat} onChange={handleStatChange} aria-label={`Stat to modify for ${name}`}>
          {STAT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          ref={amountRef}
          type="number"
          step="any"
          value={amount}
          placeholder="0"
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={handleAmountKeyDown}
          aria-label={`Amount to add for ${name}`}
          className={styles.amount}
        />
        <button type="button" onClick={handleAdd} aria-label={`Add modifier to ${name}`}>
          Add
        </button>
      </div>

      {/* T211/FR-078: stated before the user commits, not discovered afterwards in an unchanged
          number. */}
      {inertReason && (
        <p className={styles.inertWarning} role="status">
          {inertReason} This modifier will be recorded but will not change any output.
        </p>
      )}
    </Surface>
  );
}

export type { GridSlot };
