import { resolveCreatureVariant } from "../../data/corpus";
import { VariantToggles } from "../shared/VariantToggles/VariantToggles";
import { useTeamConfig } from "../../context/TeamConfigContext";
import type { GridSlot, SimulationResult } from "../../data/types";
import { slotKey } from "../../engine/grid";
import { formatCooldown } from "../../data/format";
import { BatomonCard, CooldownBlock, StatLines, buildStatLines } from "../shared/BatomonCard/BatomonCard";

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

  const effective = result.perCreatureEffectiveStats[`${creature.id}@${slotKey(placement.slot)}`];

  return (
    <BatomonCard
      creature={creature}
      levelLabel={`Lv.${placement.level}${placement.shiny ? " ✦" : ""}`}
      fixedHeight="panel"
      meta={<VariantToggles placement={placement} />}
    >
      {effective ? (
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
              lines={buildStatLines({
                damage: effective.damage,
                damageType: effective.damageType,
                appliesStatus: effective.appliesStatus,
                multicast: effective.multicast,
              })}
            />
          </div>
        </div>
      ) : null}
    </BatomonCard>
  );
}
