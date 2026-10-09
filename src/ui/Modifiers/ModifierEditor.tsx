import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import type { GridCol, GridSlot, TeamPlacement } from "../../data/types";
import { resolveCreatureVariant } from "../../data/corpus";
import { useTeamConfig } from "../../context/teamConfig";
import {
  Button,
  CardGrid,
  Chip,
  CreatureTile,
  EditorPanel,
  Modal,
  NumberField,
  OVERLAY_COLUMNS,
  Select,
  Surface,
} from "../primitives";
import { slotKey } from "../../engine/grid";
import styles from "./ModifierEditor.module.css";
import { GridRow, ModifierStat } from "../../data/enums";

interface StatOption {
  value: ModifierStat;
  /** The option in the select. Carries its unit, because typing is where the unit matters. */
  label: string;
  /** The chip's prefix. Shorter than `label` — the formatted value already carries the unit. */
  chip: string;
  /**
   * What the user typed, converted to what the ENGINE stores. Identity for every stat whose unit is
   * already the engine's.
   */
  store: (typed: number) => number;
  /** A stored amount, as the chip shows it. The inverse of `store`, including its sign. */
  show: (stored: number) => string;
  step: string;
}

/**
 * Short labels (FR-039c), and the one place the user's units are translated into the engine's
 * (2026-10-07).
 *
 * Two conversions, both user-reported, both because the engine's unit is a bad thing to type:
 *
 * 1. **Cooldown Speed is a whole percentage.** It was the raw decimal the formula uses, so +20%
 *    meant typing `0.2` — and `0.2` looks like a typo for a stat every other field takes as a plain
 *    number. The engine still stores 0.2; only the keyboard and the chip changed.
 * 2. **Cooldown seconds are a REDUCTION.** A positive entry made the creature slower, which is
 *    never what a user means: the game's own "+20% Cooldown Speed" wording describes casting
 *    sooner, so "1" here now means one second sooner. A negative entry still adds time, which is
 *    what keeps "give a creature with no published cooldown a cast cycle" reachable.
 *
 * The rule the two share, and the one the supporting note states: a POSITIVE number always means
 * better output.
 */
const STAT_OPTIONS: StatOption[] = [
  { value: ModifierStat.DamageFlatAdd, label: "Damage", chip: "Damage", store: same, show: signed, step: "any" },
  { value: ModifierStat.HealAmountAdd, label: "Heal", chip: "Heal", store: same, show: signed, step: "any" },
  {
    value: ModifierStat.CooldownFlatAddSeconds,
    label: "Cooldown reduction (sec)",
    chip: "Cooldown",
    // Typed 1 = one second SOONER. The engine adds seconds, so a reduction is stored negative.
    store: (typed) => -typed,
    show: (stored) => `${signed(stored)}s`,
    step: "any",
  },
  {
    value: ModifierStat.CooldownSpeedAdd,
    label: "Cooldown Speed (%)",
    chip: "Cooldown Speed",
    store: (typed) => typed / 100,
    // Rounded through a tenth of a percent: 0.2 stored is "+20%", and a fractional 0.125 is
    // "+12.5%" rather than 13 significant digits of binary float.
    show: (stored) => `${signed(Math.round(stored * 1000) / 10)}%`,
    step: "1",
  },
  { value: ModifierStat.BurnAmountAdd, label: "Burn applied", chip: "Burn applied", store: same, show: signed, step: "any" },
  { value: ModifierStat.PoisonAmountAdd, label: "Poison applied", chip: "Poison applied", store: same, show: signed, step: "any" },
  { value: ModifierStat.ShockAmountAdd, label: "Shock applied", chip: "Shock applied", store: same, show: signed, step: "any" },
  { value: ModifierStat.ShieldAmountAdd, label: "Shield applied", chip: "Shield applied", store: same, show: signed, step: "any" },
];

function same(typed: number): number {
  return typed;
}

/** Modifiers are signed deltas, so a positive one is shown with its sign. */
function signed(amount: number): string {
  return amount > 0 ? `+${amount}` : String(amount);
}

function optionFor(stat: ModifierStat): StatOption {
  // Every `ModifierStat` the UI can produce is in the table; `multicastAdd` is engine/trigger-only,
  // so it falls back to its own key rather than rendering `undefined`.
  return STAT_OPTIONS.find((o) => o.value === stat) ?? { value: stat, label: stat, chip: stat, store: same, show: signed, step: "any" };
}

/**
 * A chip's full text: "Damage +40", "Cooldown -1s", "Cooldown Speed +20%".
 *
 * A labelled modifier says where it came from — "Tempo Charm: Cooldown Speed +12%" (2026-10-08).
 * Labels have existed since items were added and were never rendered, which was survivable while
 * same-stat bonuses merged into one chip. They no longer do: a monster carrying a hand-typed
 * cooldown bonus AND a banked Tempo Charm grant has two cooldown chips, and without the label
 * there is nothing on screen that says which is which or which one the stepper owns.
 */
function chipText(stat: ModifierStat, amount: number, label?: string): string {
  const option = optionFor(stat);
  const text = `${option.chip} ${option.show(amount)}`;
  return label === undefined ? text : `${label}: ${text}`;
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
const ROWS: GridRow[] = [GridRow.Top, GridRow.Bottom];
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

        {/* One rule, stated once: positive is better. The previous version asked for the engine's
            own units — "Cooldown Speed is a decimal: enter 0.2 for +20%" — and said nothing about
            which way a cooldown second pointed, which is how a +1 that meant "slower" got entered
            as if it meant "faster". */}
        <p className={styles.note}>
          A <strong>positive</strong> number always means better output. Enter <code>20</code> for
          +20% Cooldown Speed, or <code>1</code> on Cooldown reduction to cast one second sooner; a
          negative amount goes the other way. Damage and status amounts may <em>create</em> an effect
          the creature does not publish — +4 Burn on a creature that applies none gives it Burn, the
          way a trinket or an ally's ability would — but a cooldown change needs a published cooldown
          to act on.
        </p>
      </Modal>
    </>
  );
}

function countModifiers(placements: TeamPlacement[]): number {
  return placements.reduce((sum, p) => sum + (p.modifiers?.length ?? 0), 0);
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
  const [stat, setStat] = useState<ModifierStat>(ModifierStat.DamageFlatAdd);
  // Starts EMPTY, not "0". A prefilled zero meant typing 20 produced "020" unless you deleted it
  // first — the field is for a number you are about to type, so it should not already contain one.
  // The placeholder still shows a 0 so the expected shape is obvious.
  const [amount, setAmount] = useState("");
  const amountRef = useRef<HTMLInputElement>(null);
  const option = optionFor(stat);

  /**
   * FR-078 (amended 2026-10-07): a modifier may CREATE an effect, so almost nothing is inert.
   *
   * This used to warn that `+50 damage` on a creature with `baseDamage: null` had "nothing to
   * scale", and the same for a status the creature did not already apply. Both the warning and the
   * clamping behind it were wrong: trinkets and ally abilities routinely give a creature damage or
   * a status it did not have, and that is exactly the board a user is trying to record. See
   * engine/modifiers.ts.
   *
   * What is left is a creature with no published cooldown: it has no cast cycle, so neither a
   * percentage of that cycle nor a reduction of it has anything to act on. A NEGATIVE reduction
   * still creates one (it adds seconds), so that case is called out rather than warned about.
   */
  const inertReason = ((): string | null => {
    if (!creature || creature.baseCooldownSeconds !== null) return null;
    if (stat === ModifierStat.CooldownSpeedAdd)
      return `${name} has no published cooldown, so there is no cast cycle for a percentage to speed up.`;
    if (stat === ModifierStat.CooldownFlatAddSeconds && Number(amount) > 0)
      return `${name} has no published cooldown, so there is nothing to shorten. A negative amount gives it one instead: -3 means it casts every 3 seconds.`;
    return null;
  })();

  function handleAdd() {
    const typed = Number(amount);
    if (Number.isNaN(typed) || typed === 0) return;
    // The modifier is still ADDED when inert — the warning informs, it does not block. The user may
    // be recording a trinket they are about to buy, and refusing the input would be worse than
    // telling them it currently does nothing.
    //
    // `store` is where the user's unit becomes the engine's: a typed 20 on Cooldown Speed is stored
    // as 0.2, and a typed 1 on Cooldown reduction is stored as -1 second.
    onAdd(stat, option.store(typed));
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
                removeLabel={`Remove ${optionFor(modifier.stat).chip} modifier from ${name}`}
              >
                {/* In the user's units, not the engine's: a stored 0.2 reads "+20%" and a stored
                    -1 second reads "-1s", so the chip says back what was typed. */}
                {chipText(modifier.stat, modifier.amount, modifier.label)}
              </Chip>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.addControls}>
        <Select
          size="sm"
          block
          value={stat}
          onChange={handleStatChange}
          aria-label={`Stat to modify for ${name}`}
        >
          {STAT_OPTIONS.map((statOption) => (
            <option key={statOption.value} value={statOption.value}>
              {statOption.label}
            </option>
          ))}
        </Select>
        <NumberField
          ref={amountRef}
          size="sm"
          // Whole percentages step by 1; everything else takes a decimal, since a damage or status
          // amount can legitimately be fractional.
          step={option.step}
          value={amount}
          placeholder="0"
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={handleAmountKeyDown}
          aria-label={`Amount to add for ${name}`}
          className={styles.amount}
        />
        <Button variant="primary" size="sm" onClick={handleAdd} aria-label={`Add modifier to ${name}`}>
          Add
        </Button>
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
