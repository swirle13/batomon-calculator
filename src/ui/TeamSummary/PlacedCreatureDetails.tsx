import { resolveCreatureVariant } from "../../data/corpus";
import { VariantToggles } from "../shared/VariantToggles/VariantToggles";
import { TriggerButtons } from "./TriggerButtons";
import { isPainted } from "../../data/typing";
import { useTeamConfig } from "../../context/TeamConfigContext";
import type { GridSlot, SimulationResult } from "../../data/types";
import {  } from "../../engine/grid";
import { formatCooldown } from "../../data/format";
import { BatomonCard, CooldownBlock, StatLines, buildStatLines, perCastOutputOf } from "../shared/BatomonCard/BatomonCard";
import { placementKey } from "../../engine/grid";

interface PlacedCreatureDetailsProps {
  result: SimulationResult;
  /**
   * 2026-10-05 round 3 (FR-021 / data-model.md's "Persistent side-panel... is UI state, not
   * team data" amendment): which placement's details to show. `null` means "no slot has been
   * hovered/focused yet" -- falls back to the first placement, not to nothing, so the panel is
   * never blank while a team exists. Owned by `CalculatorView` (src/App.tsx), updated by
   * `GridPicker` on hover/focus of a card -- crucially, hover/focus *leaving* a card does NOT
   * reset this back to `null` (sticky), so the panel never disappears.
   */
  highlightedSlot: GridSlot | null;
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
export function PlacedCreatureDetails({ result, highlightedSlot }: PlacedCreatureDetailsProps) {
  const { config } = useTeamConfig();

  if (config.placements.length === 0) {
    return (
      <p>
        <em>Place a Batomon in the grid to see its stats here.</em>
      </p>
    );
  }

  const activeSlot = highlightedSlot ?? config.placements[0]!.slot;
  const placement =
    config.placements.find((p) => p.slot.row === activeSlot.row && p.slot.col === activeSlot.col) ??
    // The previously-highlighted slot's placement may have just been cleared/moved by a drag;
    // fall back to the first remaining placement rather than rendering nothing.
    config.placements[0]!;

  const creature = resolveCreatureVariant(placement.creatureId, placement.level, placement.shiny);

  if (!creature) {
    return (
      <div style={{ border: "1px solid #444857", borderRadius: 4, padding: "0.5rem" }}>
        <strong>{placement.creatureId}</strong> — no corpus record at level {placement.level}
      </div>
    );
  }

  const effective = result.perCreatureEffectiveStats[placementKey(creature.id, placement.slot)];

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
  const base = perCastOutputOf(creature, placement.modifiers);
  const differs =
    effective !== undefined &&
    (JSON.stringify(effective.output) !== JSON.stringify(base) ||
      (effective.cooldownSeconds !== null &&
        effective.cooldownSeconds !== creature.baseCooldownSeconds));

  return (
    <BatomonCard
      creature={creature}
      levelLabel={`Lv.${placement.level}${placement.shiny ? " ✦" : ""}`}
      fixedHeight="panel"
      painted={isPainted(creature.id, config)}
      modifiers={placement.modifiers}
      meta={
        <>
          <VariantToggles placement={placement} />
          {/* Renders nothing unless this creature has a manualTrigger tag. */}
          <TriggerButtons creature={creature} placement={placement} />
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
