import { useMemo, useState, type ReactNode } from "react";
import type { BenchedCreature, StatModifier, TeamConfiguration, TeamPlacement } from "../data/types";
import type { Species } from "../data/ids";
import { corpus } from "../data/corpus";
import { DEFAULT_RUN_DAY } from "../data/enemyHealth";
import { isSlotScoped, scopeOf } from "../data/modifierScope";
import { resolveLevelUp } from "../engine/evolution";
import { slotsEqual } from "../engine/grid";
import { benchOf, gridRef, modifiersOrUndefined, moveRoster } from "../engine/roster";
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
    bench: [],
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: DEFAULT_WINDOW_SECONDS,
    runDay: DEFAULT_RUN_DAY,
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
function isSameMonster(existing: { creatureId: Species }, creatureId: Species, level: 1 | 2 | 3 | 4): boolean {
  if (existing.creatureId === creatureId) return true;
  return resolveLevelUp(corpus, existing.creatureId, level)?.id === creatureId;
}

/*
 * `relocate` and `modifiersOrUndefined` moved to `engine/roster.ts` (2026-10-08). They are the
 * rule for what a monster carries when it changes position, and the placement advisor now has to
 * apply the same rule to the hypothetical swaps it costs — see that module's header for why a
 * second copy here would be a defect rather than a convenience.
 */

/**
 * Which modifiers survive a WRITE to a position — a different monster being put there, or the one
 * already there changing level. Distinct from a move, where the monster keeps its own and
 * inherits the destination's.
 *
 * The same monster keeps everything (it is still itself, one level up). A different monster keeps
 * only what belongs to the position, and on the bench that is nothing at all.
 */
function modifiersAfterWrite(
  existing: { modifiers?: StatModifier[] } | undefined,
  sameMonster: boolean,
  positionOwnsModifiers: boolean,
): StatModifier[] | undefined {
  if (existing === undefined) return undefined;
  if (sameMonster) return existing.modifiers;
  if (!positionOwnsModifiers) return undefined;
  return modifiersOrUndefined(existing.modifiers?.filter(isSlotScoped) ?? []);
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
          const carried = modifiersAfterWrite(
            existing,
            existing !== undefined && isSameMonster(existing, creatureId, level),
            true,
          );
          const next: TeamPlacement = { slot, creatureId, level, modifiers: carried };
          return { ...prev, placements: [...withoutSlot, next] };
        });
      },
      /*
       * Each side brings its creature-scoped modifiers and inherits the destination slot's
       * slot-scoped ones (2026-10-08). A bonus attached to a POSITION does not ride along with the
       * monster that happened to be standing in it.
       *
       * The logic that says so moved to `engine/roster.ts` when the bench arrived, so the advisor
       * can cost a swap by the same rule the drag applies. These two are now its grid-to-grid and
       * general cases, and neither decides anything itself.
       */
      movePlacement: (fromSlot, toSlot) =>
        setConfig((prev) => moveRoster(prev, gridRef(fromSlot), gridRef(toSlot))),
      moveRoster: (from, to) => setConfig((prev) => moveRoster(prev, from, to)),
      setBenchCreature: (index, creatureId, level = 1) => {
        setConfig((prev) => {
          const bench = benchOf(prev);
          const existing = bench.find((b) => b.index === index);
          const withoutIndex = bench.filter((b) => b.index !== index);
          if (creatureId === null) {
            return { ...prev, bench: withoutIndex };
          }
          // `false` for the position: the bench owns nothing, so a different monster arriving here
          // inherits nothing. See `engine/roster.ts` for the asymmetry this is the other half of.
          const carried = modifiersAfterWrite(
            existing,
            existing !== undefined && isSameMonster(existing, creatureId, level),
            false,
          );
          const next: BenchedCreature = { index, creatureId, level, modifiers: carried };
          return { ...prev, bench: [...withoutIndex, next] };
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
      setRunDay: (day) => setConfig((prev) => ({ ...prev, runDay: day })),
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
            // And on LABEL (2026-10-08): a labelled modifier names what produced it — a used item,
            // a trinket grant — and merging Tempo Charm's +4% Cooldown Speed into an unrelated
            // cooldown chip both loses that attribution and breaks the press count, which is read
            // back out of the chip. Unlabelled entries still merge with each other, because
            // `undefined === undefined`: the hand-typed case is unchanged.
            const match = existing.find(
              (m) => m.stat === modifier.stat && scopeOf(m) === scopeOf(modifier) && m.label === modifier.label,
            );
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
      /*
       * The run day SURVIVES a replacement that does not mention one (2026-10-08).
       *
       * Every real caller states it — `importBuild` always writes a `runDay`, and the library's
       * load prefers the saved entry's day over it — so this clause never fires for an import or a
       * load, and those still win outright. It exists for the other kind of caller: anything that
       * swaps the BOARD wholesale without having an opinion about which day of the run you are on.
       * Defaulting those to day 1 would silently re-aim the TTK readout and the chart's enemy-HP
       * line at the wrong fight, which is a worse failure than the one it would be guarding
       * against, since "what day is it" is run context and a new board does not end the run.
       */
      replaceConfig: (next) =>
        setConfig((prev) => ({ ...next, runDay: next.runDay ?? prev.runDay ?? DEFAULT_RUN_DAY })),
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
      // Same rule as the grid's, one line down: shiny swaps the published stat line and leaves the
      // monster's own modifiers alone.
      setBenchShiny: (index, shiny) =>
        setConfig((prev) => ({
          ...prev,
          bench: benchOf(prev).map((b) => (b.index === index ? { ...b, shiny } : b)),
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
