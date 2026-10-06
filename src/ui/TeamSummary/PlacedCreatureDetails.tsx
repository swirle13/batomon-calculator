import { getCreatureByIdAndLevel } from "../../data/corpus";
import { displayField, isUnconfirmed } from "../../data/display";
import { useTeamConfig } from "../../context/TeamConfigContext";
import type { GridSlot, SimulationResult } from "../../data/types";
import { slotKey } from "../../engine/grid";
import { TypeTag } from "../shared/TypeTag";

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
 * User-requested (prototyping phase, round 1) stat visibility, redesigned round 3 into a single
 * persistent side panel (FR-021) rather than a stacked list of every placement: an external
 * reference UI's hover-anchored popup disappeared on pointer-leave and could visually cover
 * other cards (research.md E2.7) -- this panel is layout-reserved (never an overlay) and always
 * shows exactly one creature's details, defaulting to the first placement.
 *
 * 2026-10-05 round 2 (item 2 — FR-016): also renders `result.perCreatureEffectiveStats`, the
 * *modifier-adjusted* damage/status/Multicast output for this placement. Resolved by
 * `simulate()` itself (data-model.md's single-source-of-truth rule) — this component never
 * recomputes a modifier total of its own.
 */
export function PlacedCreatureDetails({ result, highlightedSlot }: PlacedCreatureDetailsProps) {
  const { config } = useTeamConfig();

  if (config.placements.length === 0) {
    return <p><em>Place a Banto in the grid to see its stats here.</em></p>;
  }

  const activeSlot = highlightedSlot ?? config.placements[0]!.slot;
  const placement = config.placements.find((p) => p.slot.row === activeSlot.row && p.slot.col === activeSlot.col)
    // The previously-highlighted slot's placement may have just been cleared/moved by a drag;
    // fall back to the first remaining placement rather than rendering nothing.
    ?? config.placements[0]!;

  const creature = getCreatureByIdAndLevel(placement.creatureId, placement.level);

  if (!creature) {
    return (
      <div style={{ border: "1px solid #444857", borderRadius: 4, padding: "0.5rem" }}>
        <strong>{placement.creatureId}</strong> — no corpus record at level {placement.level}
      </div>
    );
  }

  const effectiveKey = `${creature.id}@${slotKey(placement.slot)}`;
  const effective = result.perCreatureEffectiveStats[effectiveKey];

  return (
    <div style={{ border: "1px solid #444857", borderRadius: 4, padding: "0.75rem" }}>
      <strong style={{ fontSize: "1.1em" }}>{creature.name}</strong>{" "}
      {/* 2026-10-05 round 4 (FR-024): slot position dropped from this label -- the grid already
          shows it (user-reported redundancy); level is kept since it's not visible elsewhere. */}
      <small>(Lv.{placement.level})</small>
      <div style={{ margin: "0.4rem 0", display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
        {creature.types.length > 0 ? (
          creature.types.map((t) => <TypeTag key={t} type={t} />)
        ) : (
          <span style={{ opacity: 0.75 }}>unknown type</span>
        )}
        <span style={{ opacity: 0.75 }}>{displayField(creature, "rarity", creature.rarity)}</span>
      </div>
      <div>
        Cost ${displayField(creature, "shopCost", creature.shopCost)} · Cooldown{" "}
        {displayField(creature, "baseCooldownSeconds", creature.baseCooldownSeconds ?? "unknown")}
        {typeof creature.baseCooldownSeconds === "number" && !isUnconfirmed(creature, "baseCooldownSeconds")
          ? "s"
          : ""}{" "}
        · Damage {displayField(creature, "baseDamage", creature.baseDamage ?? "unknown")}{" "}
        {creature.damageType && !isUnconfirmed(creature, "damageType") ? `(${creature.damageType})` : ""}
      </div>
      {creature.appliesStatus && creature.appliesStatus.length > 0 && (
        <div>Applies: {creature.appliesStatus.map((s) => `${s.amount} ${s.type}`).join(", ")}</div>
      )}
      {effective && (
        <div
          style={{
            marginTop: "0.5rem",
            paddingTop: "0.5rem",
            borderTop: "1px dashed #444857",
            fontSize: "0.9em",
          }}
          title="Reflects any active modifiers from the Modifiers section below"
        >
          <strong>Effective this battle:</strong>{" "}
          Damage {effective.damage ?? "—"} · Cooldown{" "}
          {effective.cooldownSeconds !== null ? `${effective.cooldownSeconds.toFixed(2)}s` : "—"} ·{" "}
          Multicast ×{effective.multicast}
          {effective.appliesStatus.length > 0 && (
            <>
              {" "}
              · Applies: {effective.appliesStatus.map((s) => `${s.amount} ${s.type}`).join(", ")}
            </>
          )}
        </div>
      )}
      <div style={{ fontSize: "0.9em", opacity: 0.85, marginTop: "0.5rem" }}>{creature.abilityText}</div>
    </div>
  );
}
