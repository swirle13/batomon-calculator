import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { TeamConfiguration, TeamPlacement, GridSlot, StatModifier } from "../data/types";
import { slotsEqual } from "../engine/grid";

/**
 * The one shared, editable object (research.md A3) feeding both the DPS/status summary and
 * the cumulative chart. No external state library — a single React Context is sufficient at
 * this scale (Constitution Principle VI).
 */

const DEFAULT_WINDOW_SECONDS = 20;

function emptyConfig(): TeamConfiguration {
  return {
    placements: [],
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: DEFAULT_WINDOW_SECONDS,
    teamModifiers: [],
  };
}

let nextModifierId = 1;
function freshModifierId(): string {
  return `mod-${nextModifierId++}`;
}

interface TeamConfigContextValue {
  config: TeamConfiguration;
  setPlacement: (slot: GridSlot, creatureId: string | null, level?: 1 | 2 | 3 | 4) => void;
  /**
   * Drag-and-drop support (2026-10-05 round 3, data-model.md's "Drag-and-drop placement
   * editing" amendment): moves the placement at `fromSlot` to `toSlot`. If `toSlot` is already
   * occupied, the two placements SWAP (each keeps its own level and modifiers) rather than one
   * overwriting/discarding the other -- unlike `setPlacement`, which always creates a fresh
   * `TeamPlacement` with no `modifiers`, this preserves the full placement object for both
   * sides. A no-op if `fromSlot` has no placement.
   */
  movePlacement: (fromSlot: GridSlot, toSlot: GridSlot) => void;
  setTrainerId: (trainerId: string | null) => void;
  /** FR-027 (2026-10-06 round 5): multi-select, mirroring the Trainer single-select pattern --
   * `TeamConfiguration.trinketIds` already existed in the type (round 1) but had no setter. */
  addTrinketId: (trinketId: string) => void;
  removeTrinketId: (trinketId: string) => void;
  setSimulationWindowSeconds: (seconds: number) => void;
  addTeamModifier: (modifier: Omit<StatModifier, "id">) => void;
  removeTeamModifier: (id: string) => void;
  addPlacementModifier: (slot: GridSlot, modifier: Omit<StatModifier, "id">) => void;
  removePlacementModifier: (slot: GridSlot, id: string) => void;
}

const TeamConfigContext = createContext<TeamConfigContextValue | null>(null);

export function TeamConfigProvider({
  children,
  /** Seed state. Exists so component tests can render a pre-populated team without driving the
   * whole UI to build one; the app itself never passes it. */
  initialConfig,
}: {
  children: ReactNode;
  initialConfig?: TeamConfiguration;
}) {
  const [config, setConfig] = useState<TeamConfiguration>(initialConfig ?? emptyConfig());

  const value = useMemo<TeamConfigContextValue>(
    () => ({
      config,
      setPlacement: (slot, creatureId, level = 1) => {
        setConfig((prev) => {
          const existing = prev.placements.find((p) => slotsEqual(p.slot, slot));
          const withoutSlot = prev.placements.filter((p) => !slotsEqual(p.slot, slot));
          if (creatureId === null) {
            return { ...prev, placements: withoutSlot };
          }
          // 2026-10-06 round 6 (tasks.md T138): carry this slot's existing modifiers over rather
          // than dropping them. This used to construct a bare placement, so changing a creature's
          // LEVEL -- which routes through here -- silently erased every modifier the user had
          // attached to it. Harmless while modifiers were a niche side panel; not harmless now
          // that round 6 makes per-creature modifiers the primary modifier workflow (FR-039).
          // Modifiers survive an evolution too (Panbud -> Bambudo at Lv.3 keeps its carry-over),
          // which matches what a "carry-over from a previous round" means.
          const next: TeamPlacement = { slot, creatureId, level, modifiers: existing?.modifiers };
          return { ...prev, placements: [...withoutSlot, next] };
        });
      },
      movePlacement: (fromSlot, toSlot) => {
        if (slotsEqual(fromSlot, toSlot)) return;
        setConfig((prev) => {
          const fromPlacement = prev.placements.find((p) => slotsEqual(p.slot, fromSlot));
          if (!fromPlacement) return prev; // no-op: nothing to move
          const toPlacement = prev.placements.find((p) => slotsEqual(p.slot, toSlot));
          const others = prev.placements.filter(
            (p) => !slotsEqual(p.slot, fromSlot) && !slotsEqual(p.slot, toSlot),
          );
          const movedFrom: TeamPlacement = { ...fromPlacement, slot: toSlot };
          if (!toPlacement) {
            // Empty destination: a plain move.
            return { ...prev, placements: [...others, movedFrom] };
          }
          // Occupied destination: swap -- toPlacement's full object (level/modifiers intact)
          // goes to fromSlot, fromPlacement's goes to toSlot.
          const movedTo: TeamPlacement = { ...toPlacement, slot: fromSlot };
          return { ...prev, placements: [...others, movedFrom, movedTo] };
        });
      },
      setTrainerId: (trainerId) => setConfig((prev) => ({ ...prev, trainerId })),
      addTrinketId: (trinketId) =>
        setConfig((prev) =>
          prev.trinketIds.includes(trinketId)
            ? prev // already selected -- no duplicate entries
            : { ...prev, trinketIds: [...prev.trinketIds, trinketId] },
        ),
      removeTrinketId: (trinketId) =>
        setConfig((prev) => ({ ...prev, trinketIds: prev.trinketIds.filter((id) => id !== trinketId) })),
      setSimulationWindowSeconds: (seconds) =>
        setConfig((prev) => ({ ...prev, simulationWindowSeconds: seconds })),
      addTeamModifier: (modifier) =>
        setConfig((prev) => ({
          ...prev,
          teamModifiers: [...(prev.teamModifiers ?? []), { ...modifier, id: freshModifierId() }],
        })),
      removeTeamModifier: (id) =>
        setConfig((prev) => ({
          ...prev,
          teamModifiers: (prev.teamModifiers ?? []).filter((m) => m.id !== id),
        })),
      addPlacementModifier: (slot, modifier) =>
        setConfig((prev) => ({
          ...prev,
          placements: prev.placements.map((p) =>
            slotsEqual(p.slot, slot)
              ? { ...p, modifiers: [...(p.modifiers ?? []), { ...modifier, id: freshModifierId() }] }
              : p,
          ),
        })),
      removePlacementModifier: (slot, id) =>
        setConfig((prev) => ({
          ...prev,
          placements: prev.placements.map((p) =>
            slotsEqual(p.slot, slot) ? { ...p, modifiers: (p.modifiers ?? []).filter((m) => m.id !== id) } : p,
          ),
        })),
    }),
    [config],
  );

  return <TeamConfigContext.Provider value={value}>{children}</TeamConfigContext.Provider>;
}

export function useTeamConfig(): TeamConfigContextValue {
  const ctx = useContext(TeamConfigContext);
  if (!ctx) {
    throw new Error("useTeamConfig must be used within a TeamConfigProvider");
  }
  return ctx;
}
