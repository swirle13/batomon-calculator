import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { TeamConfiguration, TeamPlacement, GridSlot, RegionId, StatModifier } from "../data/types";
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
  /** FR-087 (round 11, WI-R11-001): toggle this placement's SHINY variant, independent of level. */
  setPlacementShiny: (slot: GridSlot, shiny: boolean) => void;
  /** T229/T235 (FR-087, FR-090). */
  /** Replaces the entire team, for build import (item 5). Not a merge — see `ShareBuild`. */
  replaceConfig: (next: TeamConfiguration) => void;
  setSelectedRegion: (region: RegionId | undefined) => void;
  setPaintedCreatureIds: (ids: string[]) => void;
  setSmuggledCreatureIds: (ids: string[]) => void;
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
          placements: prev.placements.map((p) => {
            if (!slotsEqual(p.slot, slot)) return p;
            const existing = p.modifiers ?? [];
            // 2026-10-06 round 7 (FR-045, item 6): ACCUMULATE onto an existing modifier of the
            // same stat instead of appending a second indistinguishable chip. Adding +10 twice
            // gave two "+10" chips the user had no way to tell apart and no reason to care about;
            // the engine already summed them, so this only ever changed the display.
            const match = existing.find((m) => m.stat === modifier.stat);
            if (!match) {
              return { ...p, modifiers: [...existing, { ...modifier, id: freshModifierId() }] };
            }
            const total = match.amount + modifier.amount;
            // Accumulating to zero removes the entry rather than leaving a "+0" chip that renders
            // but does nothing.
            if (total === 0) {
              return { ...p, modifiers: existing.filter((m) => m.id !== match.id) };
            }
            return {
              ...p,
              modifiers: existing.map((m) => (m.id === match.id ? { ...m, amount: total } : m)),
            };
          }),
        })),
      replaceConfig: (next) => setConfig(next),
      setSelectedRegion: (region) => setConfig((prev) => ({ ...prev, selectedRegion: region })),
      setPaintedCreatureIds: (ids) => setConfig((prev) => ({ ...prev, paintedCreatureIds: ids })),
      setSmuggledCreatureIds: (ids) => setConfig((prev) => ({ ...prev, smuggledCreatureIds: ids })),
      setPlacementShiny: (slot, shiny) =>
        setConfig((prev) => ({
          ...prev,
          // Modifiers are preserved: shiny swaps the published stat line, it does not reset the
          // user's own inputs. (Levelling up goes through `setPlacement`, which does drop them,
          // because it can change species entirely via evolution.)
          placements: prev.placements.map((p) => (slotsEqual(p.slot, slot) ? { ...p, shiny } : p)),
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
