import { useMemo, useState, type ReactNode } from "react";
import type { GridSlot, StatModifier, TeamConfiguration, TeamPlacement } from "../data/types";
import type { Species } from "../data/ids";
import { corpus } from "../data/corpus";
import { isCreatureScoped, isSlotScoped, scopeOf } from "../data/modifierScope";
import { resolveLevelUp } from "../engine/evolution";
import { slotsEqual } from "../engine/grid";
import { TeamConfigContext, type TeamConfigContextValue } from "./teamConfig";

/**
 * The one shared, editable object (research.md A3) feeding both the DPS/status summary and
 * the cumulative chart. No external state library — a single React Context is sufficient at
 * this scale (Constitution Principle VI).
 *
 * This module exports ONLY the provider component, and must keep doing so: the context object and
 * `useTeamConfig` live in `./teamConfig` because a non-component export here takes the whole tree
 * off React Fast Refresh's path. The reasoning is recorded there.
 */

/**
 * 30s (2026-10-07).
 *
 * This was briefly 15s, justified by "sudden death begins at 15s". **That was wrong** — the claim
 * came from a search result, and a recorded battle ran past 23s with no sign of it. Whether sudden
 * death has a fixed onset at all is unknown (see `enemyHealth.ts`), so nothing here should be
 * tuned to it.
 *
 * 30s instead, chosen for a reason the data supports: enemy HP grows roughly 25% per day and keeps
 * growing, so later-day fights take substantially longer than early ones. A window that ends before
 * a team has done its work makes a slow, scaling build look worse than it is.
 */
const DEFAULT_WINDOW_SECONDS = 30;

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

/**
 * Whether a write to this slot is the monster already standing there, or a different one.
 *
 * The two reach `setPlacement` through the same call. A level bubble passes the species the level
 * resolves to, which for Panbud at Lv.3 is Bambudo — a different id for the same monster growing
 * up. The search modal passes whatever the user picked. Asking the evolution resolver is what
 * separates them, and it is the same resolver `VariantToggles` used to produce the id.
 *
 * Re-picking the SAME species is read as the same monster, because nothing distinguishes buying a
 * second Craghorn from re-selecting the one already placed.
 */
function isSameMonster(existing: TeamPlacement, creatureId: Species, level: 1 | 2 | 3 | 4): boolean {
  if (existing.creatureId === creatureId) return true;
  return resolveLevelUp(corpus, existing.creatureId, level)?.id === creatureId;
}

/** Empty lists are stored as `undefined`, so a placement that carries nothing looks like one. */
function modifiersOrUndefined(modifiers: StatModifier[]): StatModifier[] | undefined {
  return modifiers.length > 0 ? modifiers : undefined;
}

/**
 * A placement arriving at `toSlot`: it brings what belongs to the monster and inherits what
 * belongs to the position.
 *
 * Its own slot-scoped modifiers are left behind by construction — they were never its to carry.
 * When the slot it left ends up empty they have nowhere to live and are gone, which is the one
 * lossy case here and is accepted: a bonus attached to a position with nothing in it is not
 * something the engine can apply or the card can show.
 */
function relocate(placement: TeamPlacement, toSlot: GridSlot, inheritedFrom: TeamPlacement | undefined): TeamPlacement {
  const carried = (placement.modifiers ?? []).filter(isCreatureScoped);
  const inherited = (inheritedFrom?.modifiers ?? []).filter(isSlotScoped);
  return { ...placement, slot: toSlot, modifiers: modifiersOrUndefined([...carried, ...inherited]) };
}

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

  /*
   * The actions are built ONCE, not once per config change.
   *
   * Every one of them updates through `setConfig(prev => ...)` and reads nothing from the render
   * scope, so none of them needs `config` as a dependency — and keeping them in the same memo as
   * `config` meant all twelve got a fresh identity on every edit. That made them useless as
   * dependencies: any `useCallback`/`useEffect`/`memo` downstream keyed on one of these would
   * re-run on every unrelated change to the team, so `memo()` anywhere in the tree would be
   * silently inert. Splitting the memo is what makes bailing out possible at all.
   */
  const actions = useMemo(
    () => ({
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
          //
          // 2026-10-08 (user-reported): carried over by SCOPE, not wholesale. The clause above is
          // about the same monster changing level; a DIFFERENT monster taking the slot was getting
          // the same treatment, so selling a Craghorn that had banked +40 Damage / +40 Shield and
          // buying something else handed the newcomer forty points of Craghorn's ability. Only
          // slot-scoped modifiers belong to the position and survive that.
          const carried =
            existing === undefined || isSameMonster(existing, creatureId, level)
              ? existing?.modifiers
              : modifiersOrUndefined(existing.modifiers?.filter(isSlotScoped) ?? []);
          const next: TeamPlacement = { slot, creatureId, level, modifiers: carried };
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
          // Each side brings its creature-scoped modifiers and inherits the destination slot's
          // slot-scoped ones (2026-10-08). A bonus attached to a POSITION does not ride along with
          // the monster that happened to be standing in it — see `relocate`.
          const movedFrom = relocate(fromPlacement, toSlot, toPlacement);
          if (!toPlacement) {
            // Empty destination: a plain move.
            return { ...prev, placements: [...others, movedFrom] };
          }
          // Occupied destination: swap -- toPlacement's full object (level/modifiers intact)
          // goes to fromSlot, fromPlacement's goes to toSlot.
          const movedTo = relocate(toPlacement, fromSlot, fromPlacement);
          return { ...prev, placements: [...others, movedFrom, movedTo] };
        });
      },
      setTrainerId: (trainerId) => setConfig((prev) => ({ ...prev, trainerId })),
      /**
       * DUPLICATES ARE ALLOWED (2026-10-07, user-reported).
       *
       * This used to return `prev` unchanged when the trinket was already selected, which modelled
       * a rule the game does not have: a shop can offer the same trinket again, and two Hero's
       * Swords are two lots of +12 Damage. Silently dropping the second copy meant the tool could
       * not represent a board the player was looking at, and `trinketIds` is a LIST precisely
       * because a count matters.
       *
       * `simulate()` already summed per entry, so the engine needed no change beyond making each
       * copy's modifier id unique.
       */
      addTrinketId: (trinketId) =>
        setConfig((prev) => ({ ...prev, trinketIds: [...prev.trinketIds, trinketId] })),
      /** Removes ONE copy. A `filter` here would drop all of them, which is now a different act. */
      removeTrinketId: (trinketId) =>
        setConfig((prev) => {
          const index = prev.trinketIds.lastIndexOf(trinketId);
          if (index === -1) return prev;
          return {
            ...prev,
            trinketIds: [...prev.trinketIds.slice(0, index), ...prev.trinketIds.slice(index + 1)],
          };
        }),
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
            // Matched on scope as well as stat (2026-10-08): a +10 Damage the monster earned and a
            // +10 Damage attached to the slot are not the same entry, because placing a different
            // monster here keeps one and discards the other.
            const match = existing.find((m) => m.stat === modifier.stat && scopeOf(m) === scopeOf(modifier));
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
    }) satisfies Omit<TeamConfigContextValue, "config">,
    [],
  );

  const value = useMemo<TeamConfigContextValue>(() => ({ config, ...actions }), [config, actions]);

  return <TeamConfigContext.Provider value={value}>{children}</TeamConfigContext.Provider>;
}
