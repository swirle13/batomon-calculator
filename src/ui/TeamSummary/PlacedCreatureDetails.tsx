import { resolveCreatureVariant } from "../../data/corpus";
import { VariantToggles } from "../shared/VariantToggles/VariantToggles";
import { TriggerButtons } from "./TriggerButtons";
import { hasChefFireTyping, isPainted } from "../../data/typing";
import { trainerModifiersFor } from "../../engine/trainerEffects";
import { CreatureType } from "../../data/enums";
import { useTeamConfig } from "../../context/teamConfig";
import type { RosterRef, SimulationResult } from "../../data/types";
import { RosterZone } from "../../data/types";
import { gridRef, rosterMemberAt } from "../../engine/roster";
import { formatCooldown } from "../../data/format";
import { BatomonCard, CooldownBlock, StatLines } from "../shared/BatomonCard/BatomonCard";
import { buildStatLines, cooldownWithModifiers, perCastOutputOf } from "../shared/BatomonCard/perCastOutput";
import { placementKey } from "../../engine/grid";

interface PlacedCreatureDetailsProps {
  result: SimulationResult;
  /**
   * 2026-10-05 round 3 (FR-021 / data-model.md's "Persistent side-panel... is UI state, not
   * team data" amendment): which monster's details to show. `null` means "nothing has been
   * hovered/focused yet" -- falls back to the first placement, not to nothing, so the panel is
   * never blank while a team exists. Owned by `CalculatorView` (src/App.tsx), updated by
   * `GridPicker` on hover/focus of a card -- crucially, hover/focus *leaving* a card does NOT
   * reset this back to `null` (sticky), so the panel never disappears.
   *
   * 2026-10-08: a `RosterRef`, not a `GridSlot`, so hovering a BENCH monster opens its card too
   * (user-requested). The bench used to pass an empty handler under a comment arguing that a
   * benched monster "has none to show — it is in no simulation", which confused the one band that
   * needs a simulation for the whole card: the sprite, the typing, the ability text and the
   * published stat line are all properties of the monster and are exactly what you want while
   * deciding whether to field it.
   */
  highlighted: RosterRef | null;
}

/**
 * The Calculator's "currently selected mon" card.
 *
 * 2026-10-06 round 6 (FR-028): now renders through the shared `BatomonCard`, the same component
 * the Corpus Browser uses, so the two surfaces cannot drift apart in layout -- item 1 named both.
 *
 * It keeps one band the game card has no equivalent of: "Effective this battle", the
 * modifier-adjusted output `simulate()` resolved. That band is **rendered in the same
 * cooldown-block-plus-one-line-per-stat shape** as the base stats rather than as the old
 * `Damage 3 · Cooldown 2.50s · Multicast ×1 · Applies: 1 Shock` sentence -- that sentence was
 * itself an instance of the run-on formatting item 1 asked to remove, so passing it through
 * unchanged would have left the complaint half-addressed in the very card it was reported against.
 *
 * Values come from `result.perCreatureEffectiveStats` only; this component never recomputes a
 * modifier total of its own (data-model.md's single-source-of-truth rule).
 */
export function PlacedCreatureDetails({ result, highlighted }: PlacedCreatureDetailsProps) {
  const { config } = useTeamConfig();

  /*
   * The fallback is still the first PLACED monster, never a benched one.
   *
   * A bench entry only becomes the subject by being pointed at. Letting one be the default would
   * mean a board with an empty grid and a full bench opened on a monster that is not fighting,
   * which is not what this panel is for — it just also answers questions about the bench now.
   */
  const fallback = config.placements[0];
  const where = highlighted ?? (fallback ? gridRef(fallback.slot) : null);
  // The highlighted position may have just been emptied by a drag or a clear, so this resolves
  // through `rosterMemberAt` and then falls back rather than rendering nothing.
  const member = (where ? rosterMemberAt(config, where) : undefined) ?? fallback;

  if (!member || !where) {
    return (
      <p>
        <em>Place a Batomon in the grid to see its stats here.</em>
      </p>
    );
  }

  /** Where the monster we actually resolved is standing — not where the hover pointed. */
  const at: RosterRef = rosterMemberAt(config, where) === undefined ? gridRef(fallback!.slot) : where;
  const placement = member;

  const creature = resolveCreatureVariant(placement.creatureId, placement.level, placement.shiny);

  if (!creature) {
    return (
      <div style={{ border: "1px solid #444857", borderRadius: 4, padding: "0.5rem" }}>
        <strong>{placement.creatureId}</strong> — no corpus record at level {placement.level}
      </div>
    );
  }

  /*
   * Only a PLACED monster has resolved stats: `simulate()` never reads `config.bench`, so there is
   * no entry to look up for a benched one. The "Effective this battle" band below is already
   * conditional on this being present, so a bench card simply renders without it — which is the
   * truth. It is in no battle, so there is nothing this battle does to it.
   */
  const effective =
    at.zone === RosterZone.Grid
      ? result.perCreatureEffectiveStats[placementKey(creature.id, at.slot)]
      : undefined;

  /*
   * The trainer's own per-monster bonus is shown as part of what the creature IS, alongside the
   * user's manual modifiers (2026-10-08, user-reported: "the mons still don't have their extra +2
   * burn applied to each of them").
   *
   * It was reaching the simulation and therefore the tables and the "Effective this battle" band,
   * but not the card's own stat lines or the grid chips — so a Chef board read "Burn 2" in one
   * place and nothing in the other two. Chef's Burn is a property of the run, not something this
   * battle does, which is the same argument `perCastOutput.ts` makes for manual modifiers.
   */
  const displayModifiers = [...(placement.modifiers ?? []), ...trainerModifiersFor(creature, config)];

  /**
   * Only show "Effective this battle" when it actually differs from the card above it.
   *
   * A second panel repeating the first invites the user to hunt for the difference and find none,
   * which is worse than no panel: it implies something changed. Most boards are like this — no
   * modifiers, no trinkets, no ally effects — so the band was usually pure noise.
   *
   * Compared through the shared `PerCastOutput` shape, so a future output stat is included in the
   * comparison automatically rather than being silently ignored here.
   */
  // Includes the user's manual modifiers, so the band compares like with like. Without that, every
  // modifier made the band appear and show a difference the user had typed in themselves.
  //
  // 2026-10-08: the cooldown half compared against `creature.baseCooldownSeconds`, i.e. the
  // PUBLISHED seconds, while the output half already compared against the modified values. So a
  // Tempo Charm press opened the band to report a 4% speed-up the user had banked themselves.
  const base = perCastOutputOf(creature, displayModifiers);
  const baseCooldown = cooldownWithModifiers(creature, displayModifiers);
  const differs =
    effective !== undefined &&
    (JSON.stringify(effective.output) !== JSON.stringify(base) ||
      (effective.cooldownSeconds !== null && effective.cooldownSeconds !== baseCooldown));

  return (
    <BatomonCard
      creature={creature}
      levelLabel={`Lv.${placement.level}${placement.shiny ? " ✦" : ""}`}
      fixedHeight="panel"
      painted={isPainted(creature.id, config)}
      // Both key off the GRANT, not off "Chef affects this monster": the marking and the extra
      // type chip say the same thing, and a monster that was already Fire has neither to say.
      chefFire={hasChefFireTyping(creature, config)}
      grantedTypes={hasChefFireTyping(creature, config) ? [CreatureType.Fire] : undefined}
      modifiers={displayModifiers}
      meta={
        <>
          <VariantToggles member={placement} where={at} />
          {/*
            Renders nothing unless this creature has a manualTrigger tag — and nothing at all for a
            benched monster (2026-10-08). A press banks a permanent bonus on a set of RECIPIENTS
            that `recipientsOfPress` picks out by board position ("This and Common allies"), which
            cannot be resolved for a monster that is not on the board. Offering the button and
            banking it on the presser alone is the exact bug that selector was written to fix.
          */}
          {at.zone === RosterZone.Grid && (
            <TriggerButtons creature={creature} placement={{ ...placement, slot: at.slot }} />
          )}
        </>
      }
    >
      {effective && differs ? (
        <div title="Reflects any active modifiers and selected Trinkets">
          <div
            style={{
              fontSize: "0.7rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#9ca3af",
              marginBottom: "0.35rem",
            }}
          >
            Effective this battle
          </div>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <CooldownBlock
              seconds={formatCooldown(effective.cooldownSeconds)}
            />
            <StatLines
              // No mapping: the engine produces the same `PerCastOutput` the card renders from,
              // so there is no hand-written field list here to forget a stat in.
              lines={buildStatLines(effective.output)}
            />
          </div>
        </div>
      ) : null}
    </BatomonCard>
  );
}
