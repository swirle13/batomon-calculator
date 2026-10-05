import { getCreatureById } from "../../data/corpus";
import { displayField, isUnconfirmed } from "../../data/display";
import { useTeamConfig } from "../../context/TeamConfigContext";
import type { GridSlot } from "../../data/types";

function slotLabel(slot: GridSlot): string {
  return `${slot.row === "back" ? "Back" : "Front"} ${slot.col + 1}`;
}

/**
 * User-requested (prototyping phase): the plain <select> dropdown in GridPicker doesn't show a
 * creature's stats once picked. Rather than redesign the picker itself yet, this shows a compact
 * stat card per placed creature to the side of the grid — full stats stay one glance away without
 * giving up the simple dropdown while mechanics are still being built out.
 */
export function PlacedCreatureDetails() {
  const { config } = useTeamConfig();

  if (config.placements.length === 0) {
    return <p><em>Place a Banto in the grid to see its stats here.</em></p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {config.placements.map((placement) => {
        const creature = getCreatureById(placement.creatureId);
        const key = `${placement.slot.row}-${placement.slot.col}`;
        if (!creature) {
          return (
            <div key={key} style={{ border: "1px solid #444857", borderRadius: 4, padding: "0.5rem" }}>
              <strong>{placement.creatureId}</strong> ({slotLabel(placement.slot)}) — unknown creature id
            </div>
          );
        }
        return (
          <div key={key} style={{ border: "1px solid #444857", borderRadius: 4, padding: "0.5rem" }}>
            <strong>{creature.name}</strong>{" "}
            <small>
              ({slotLabel(placement.slot)} · {displayField(creature, "rarity", creature.rarity)} ·{" "}
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
            <div style={{ fontSize: "0.9em", opacity: 0.85 }}>{creature.abilityText}</div>
          </div>
        );
      })}
    </div>
  );
}
