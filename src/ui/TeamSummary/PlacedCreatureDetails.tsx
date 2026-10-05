import { getCreatureByIdAndLevel } from "../../data/corpus";
import { displayField, isUnconfirmed } from "../../data/display";
import { useTeamConfig } from "../../context/TeamConfigContext";
import type { GridSlot, SimulationResult } from "../../data/types";
import { slotKey } from "../../engine/grid";

function slotLabel(slot: GridSlot): string {
  return `${slot.row === "back" ? "Back" : "Front"} ${slot.col + 1}`;
}

interface PlacedCreatureDetailsProps {
  result: SimulationResult;
}

/**
 * User-requested (prototyping phase): the plain <select> dropdown in GridPicker doesn't show a
 * creature's stats once picked. Rather than redesign the picker itself yet, this shows a compact
 * stat card per placed creature to the side of the grid — full stats stay one glance away without
 * giving up the simple dropdown while mechanics are still being built out.
 *
 * 2026-10-05 round 2 (item 2 — FR-016): now also renders `result.perCreatureEffectiveStats`, the
 * *modifier-adjusted* damage/status/Multicast output for this placement, so a user can see what
 * an active StatModifier actually changes without having to infer it from the aggregate DPS
 * table. Resolved by `simulate()` itself (data-model.md's single-source-of-truth rule) — this
 * component never recomputes a modifier total of its own.
 */
export function PlacedCreatureDetails({ result }: PlacedCreatureDetailsProps) {
  const { config } = useTeamConfig();

  if (config.placements.length === 0) {
    return <p><em>Place a Banto in the grid to see its stats here.</em></p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {config.placements.map((placement) => {
        const creature = getCreatureByIdAndLevel(placement.creatureId, placement.level);
        const key = `${placement.slot.row}-${placement.slot.col}`;
        if (!creature) {
          return (
            <div key={key} style={{ border: "1px solid #444857", borderRadius: 4, padding: "0.5rem" }}>
              <strong>{placement.creatureId}</strong> ({slotLabel(placement.slot)}) — no corpus
              record at level {placement.level}
            </div>
          );
        }
        const effectiveKey = `${creature.id}@${slotKey(placement.slot)}`;
        const effective = result.perCreatureEffectiveStats[effectiveKey];
        return (
          <div key={key} style={{ border: "1px solid #444857", borderRadius: 4, padding: "0.5rem" }}>
            <strong>{creature.name}</strong>{" "}
            <small>
              ({slotLabel(placement.slot)} · Lv.{placement.level} ·{" "}
              {displayField(creature, "rarity", creature.rarity)} ·{" "}
              {creature.types.length > 0 ? creature.types.join("/") : "unknown type"})
            </small>
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
                  marginTop: "0.35rem",
                  paddingTop: "0.35rem",
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
                    · Applies:{" "}
                    {effective.appliesStatus.map((s) => `${s.amount} ${s.type}`).join(", ")}
                  </>
                )}
              </div>
            )}
            <div style={{ fontSize: "0.9em", opacity: 0.85, marginTop: "0.35rem" }}>{creature.abilityText}</div>
          </div>
        );
      })}
    </div>
  );
}
