import { createContext, useContext } from "react";
import type { BenchIndex, TeamConfiguration, GridSlot, RegionId, RosterRef, StatModifier } from "../data/types";
import type { Species, TrainerId, TrinketId } from "../data/ids";

/**
 * The context object and its hook, split out of `TeamConfigContext.tsx` (2026-10-08).
 *
 * ## Why the hook does not live beside the provider
 *
 * React Fast Refresh can only hot-swap a module whose exports are all components, and a function
 * named `useTeamConfig` is not one — so every edit to the provider's module invalidated it instead
 * of swapping it, and the invalidation cascaded to all twelve of its importers, `App.tsx` included:
 *
 *     [vite] hmr invalidate /src/context/TeamConfigContext.tsx
 *            Could not Fast Refresh ("useTeamConfig" export is incompatible)
 *     [vite] hmr update /src/App.tsx, /src/ui/GridPicker/GridPicker.tsx, ... (12 modules)
 *
 * The user-visible symptom was a black page and
 * `Uncaught Error: useTeamConfig must be used within a TeamConfigProvider` — a tree remounted far
 * enough out of step with its provider that the context read as null. That error is below, and it
 * is a real guard worth keeping; it just should not be reachable by saving an unrelated file.
 *
 * The context OBJECT has to move with the hook. It is what `useContext` reads, so leaving it in the
 * `.tsx` would put the hook back on the wrong side of the boundary.
 */
export interface TeamConfigContextValue {
  config: TeamConfiguration;
  setPlacement: (slot: GridSlot, creatureId: Species | null, level?: 1 | 2 | 3 | 4) => void;
  /**
   * Drag-and-drop support (2026-10-05 round 3, data-model.md's "Drag-and-drop placement
   * editing" amendment): moves the placement at `fromSlot` to `toSlot`. If `toSlot` is already
   * occupied, the two placements SWAP (each keeps its own level and modifiers) rather than one
   * overwriting/discarding the other -- unlike `setPlacement`, which always creates a fresh
   * `TeamPlacement` with no `modifiers`, this preserves the full placement object for both
   * sides. A no-op if `fromSlot` has no placement.
   */
  movePlacement: (fromSlot: GridSlot, toSlot: GridSlot) => void;
  /**
   * The general form of `movePlacement`: moves between any two roster positions, grid or bench
   * (2026-10-08). `movePlacement` is now the grid-to-grid case of this, kept because that is what
   * the name says and because three of its callers only ever do that.
   *
   * The rule for what happens to the monster's modifiers lives in `engine/roster.ts`, not here,
   * because the placement advisor has to apply the same one when it costs a hypothetical swap.
   */
  moveRoster: (from: RosterRef, to: RosterRef) => void;
  /**
   * Puts a monster on the bench at `index`, or clears it with `null` — the bench's counterpart to
   * `setPlacement`, and what the search modal writes when it is opened from a bench position.
   *
   * No slot-scoped carry-over clause, unlike `setPlacement`: the bench has no positions that own
   * modifiers, so a different monster arriving inherits nothing. The same monster changing LEVEL
   * keeps everything, which is the clause that matters.
   */
  setBenchCreature: (index: BenchIndex, creatureId: Species | null, level?: 1 | 2 | 3 | 4) => void;
  setTrainerId: (trainerId: TrainerId | null) => void;
  /** FR-027 (2026-10-06 round 5): multi-select, mirroring the Trainer single-select pattern --
   * `TeamConfiguration.trinketIds` already existed in the type (round 1) but had no setter. */
  addTrinketId: (trinketId: TrinketId) => void;
  removeTrinketId: (trinketId: TrinketId) => void;
  /*
   * There is deliberately no `addItemId`/`removeItemId` (2026-10-08, user-reported).
   *
   * Items briefly had the trinket treatment — a bag you added to, then spent from. The bag was
   * pointless: an item has exactly one interesting moment, the moment its bonus lands, and holding
   * an unused one changes nothing this tool computes. Picking an item in `ItemPicker` now applies
   * it directly through `addPlacementModifier`, and the record of the use is the labelled modifier
   * chip it created — removable, visible under Modifiers, and already in the share link.
   *
   * `TeamConfiguration.itemIds` stays in the type and the share format (where it has lived since
   * round 1) and is simply never written. Removing it would be a share-format version bump for no
   * behavioural gain.
   */
  setSimulationWindowSeconds: (seconds: number) => void;
  /**
   * Which day of the run the board is for (2026-10-08). Drives the TTK readout, the cumulative
   * chart's enemy-HP threshold and the library's save form — one number, three consumers, where
   * there used to be two unconnected ones. See `TeamConfiguration.runDay`.
   */
  setRunDay: (day: number) => void;
  addTeamModifier: (modifier: Omit<StatModifier, "id">) => void;
  removeTeamModifier: (id: string) => void;
  /** FR-087 (round 11, WI-R11-001): toggle this placement's SHINY variant, independent of level. */
  setPlacementShiny: (slot: GridSlot, shiny: boolean) => void;
  /**
   * Pins the monster in `slot` onto the board, so the placement advisor stops offering to bench it
   * (2026-10-09). Changes no simulated figure — see `RosteredCreature.locked`.
   */
  setPlacementLocked: (slot: GridSlot, locked: boolean) => void;
  /**
   * The bench's counterpart (2026-10-08), added when the detail card learned to open on a hovered
   * bench monster: the card carries the level/shiny bubbles, and half a roster that could not use
   * them would read as the panel being broken.
   */
  setBenchShiny: (index: BenchIndex, shiny: boolean) => void;
  /** T229/T235 (FR-087, FR-090). */
  /** Replaces the entire team, for build import (item 5). Not a merge — see `ShareBuild`. */
  replaceConfig: (next: TeamConfiguration) => void;
  setSelectedRegion: (region: RegionId | undefined) => void;
  setPaintedCreatureIds: (ids: Species[]) => void;
  setSmuggledCreatureIds: (ids: Species[]) => void;
  addPlacementModifier: (slot: GridSlot, modifier: Omit<StatModifier, "id">) => void;
  removePlacementModifier: (slot: GridSlot, id: string) => void;
}

export const TeamConfigContext = createContext<TeamConfigContextValue | null>(null);

export function useTeamConfig(): TeamConfigContextValue {
  const ctx = useContext(TeamConfigContext);
  if (!ctx) {
    throw new Error("useTeamConfig must be used within a TeamConfigProvider");
  }
  return ctx;
}
