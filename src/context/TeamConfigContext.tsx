import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { TeamConfiguration, TeamPlacement, GridSlot } from "../data/types";
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
  };
}

interface TeamConfigContextValue {
  config: TeamConfiguration;
  setPlacement: (slot: GridSlot, creatureId: string | null, level?: 1 | 2 | 3) => void;
  setTrainerId: (trainerId: string | null) => void;
  setSimulationWindowSeconds: (seconds: number) => void;
}

const TeamConfigContext = createContext<TeamConfigContextValue | null>(null);

export function TeamConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<TeamConfiguration>(emptyConfig());

  const value = useMemo<TeamConfigContextValue>(
    () => ({
      config,
      setPlacement: (slot, creatureId, level = 1) => {
        setConfig((prev) => {
          const withoutSlot = prev.placements.filter((p) => !slotsEqual(p.slot, slot));
          if (creatureId === null) {
            return { ...prev, placements: withoutSlot };
          }
          const next: TeamPlacement = { slot, creatureId, level };
          return { ...prev, placements: [...withoutSlot, next] };
        });
      },
      setTrainerId: (trainerId) => setConfig((prev) => ({ ...prev, trainerId })),
      setSimulationWindowSeconds: (seconds) =>
        setConfig((prev) => ({ ...prev, simulationWindowSeconds: seconds })),
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
