import { describe, expect, it } from "vitest";
import { corpus, getCreatureByIdAndLevel } from "../../data/corpus";
import { resolveEffects } from "../effects";
import { simulate } from "../simulate";
import { placementKey, slotsEqual } from "../grid";
import type { GridSlot, TeamConfiguration } from "../../data/types";
import { GridRow, TimelineEventKind } from "../../data/enums";
import { Species } from "../../data/ids";

/**
 * The knockout/revive pairing (2026-10-08, user-reported).
 *
 * Shikitsune reads "Knocked-out allies are revived and gain +15% Cooldown Speed for this battle",
 * which is inert text on its own board: this engine has no HP model, so nothing ever dies of its
 * own accord. It only means something beside `KnockoutAlliesOnBattleStart` — Petrirex and
 * Rattleghast, who knock out their own neighbours at battle start, picking victims by POSITION and
 * therefore deciding the whole thing before the first cast.
 *
 * That is why the pair is tractable where the general knockout family is not, and why these tests
 * exercise them together. A test of either half alone would pass on a board where the combo does
 * nothing.
 */

const BACK0: GridSlot = { row: GridRow.Top, col: 0 };
const BACK1: GridSlot = { row: GridRow.Top, col: 1 };
const BACK2: GridSlot = { row: GridRow.Top, col: 2 };
const FRONT1: GridSlot = { row: GridRow.Bottom, col: 1 };

const team = (placements: { id: Species; slot: GridSlot }[]): TeamConfiguration => ({
  placements: placements.map((p) => ({ slot: p.slot, creatureId: p.id, level: 1 })),
  trainerId: null,
  trinketIds: [],
  itemIds: [],
  simulationWindowSeconds: 30,
  teamModifiers: [],
});

/** Petrirex knocks out its ADJACENT allies, so the victim sits beside it and the reviver does not. */
const KNOCKED_OUT_BOARD = [
  { id: Species.Petrirex, slot: BACK0 },
  { id: Species.Bumblebolt, slot: BACK1 },
  { id: Species.Shikitsune, slot: FRONT1 },
];

describe("knocked-out allies, and Shikitsune's revive", () => {
  it("leaves a victim dead when nobody on the board can revive it", () => {
    const resolved = resolveEffects(
      team([
        { id: Species.Petrirex, slot: BACK0 },
        { id: Species.Bumblebolt, slot: BACK1 },
      ]),
      corpus,
    );
    // The pre-existing behaviour, asserted here so the revive path cannot quietly become the
    // default: a knocked-out creature is removed from the board entirely.
    expect(resolved.map((r) => r.creature.id)).toEqual([Species.Petrirex]);
  });

  it("revives the victim and grants it the published Cooldown Speed bonus", () => {
    const resolved = resolveEffects(team(KNOCKED_OUT_BOARD), corpus);
    const victim = resolved.find((r) => r.creature.id === Species.Bumblebolt);

    expect(victim, "Bumblebolt should be back on the board").toBeDefined();
    expect(victim!.revivedBy).toBe(placementKey(Species.Shikitsune, FRONT1));
    expect(victim!.cooldownSpeedGrant).toBeCloseTo(0.15);

    // Nobody else is touched: the bonus belongs to having been revived, not to being an ally of
    // Shikitsune.
    for (const other of resolved.filter((r) => r.creature.id !== Species.Bumblebolt)) {
      expect(other.cooldownSpeedGrant, other.creature.name).toBe(0);
      expect(other.revivedBy, other.creature.name).toBeNull();
    }
  });

  it("still pays the knocker for the kill", () => {
    /*
     * The combo's whole appeal, and the obvious way to get it wrong. Petrirex's "+20 Shield
     * permanently for each ally Knockout" is earned at the moment of the knockout; Shikitsune
     * undoing the knockout afterwards does not claw it back. A revive that cancelled the grant
     * would make the pairing strictly worse than Petrirex alone.
     */
    const shieldOf = (config: TeamConfiguration) =>
      resolveEffects(config, corpus)
        .find((r) => r.creature.id === Species.Petrirex)!
        .appliesStatus.find((s) => s.type === "Shield")?.amount ?? 0;

    const withoutReviver = shieldOf(
      team([
        { id: Species.Petrirex, slot: BACK0 },
        { id: Species.Bumblebolt, slot: BACK1 },
      ]),
    );
    expect(withoutReviver).toBeGreaterThan(0);
    expect(shieldOf(team(KNOCKED_OUT_BOARD))).toBe(withoutReviver);
  });

  it("does not revive anyone when the reviver is itself a victim", () => {
    // Shikitsune's ability fires on cast, and a knocked-out creature never casts. Standing it next
    // to Petrirex makes it another corpse, not a self-raising one.
    const resolved = resolveEffects(
      team([
        { id: Species.Petrirex, slot: BACK1 },
        { id: Species.Shikitsune, slot: BACK0 },
        { id: Species.Bumblebolt, slot: BACK2 },
      ]),
      corpus,
    );
    expect(resolved.map((r) => r.creature.id)).toEqual([Species.Petrirex]);
  });

  it("holds the revived ally's first cast until the reviver has cast", () => {
    /*
     * The timing that stops this being a free buff. Shikitsune revives ON CAST, so a victim is a
     * corpse for the reviver's whole first cooldown. Scheduling it from t=0 like everybody else
     * would hand every revived ally an extra opening cast — more output than the +15% Cooldown
     * Speed the combo is actually played for.
     */
    const result = simulate(team(KNOCKED_OUT_BOARD), corpus);
    const firstCastFrom = (slot: GridSlot) =>
      result.timeline.find(
        (e) => e.kind === TimelineEventKind.Attack && slotsEqual(e.sourceSlot, slot),
      )?.tSeconds ?? null;

    const reviveAt = firstCastFrom(FRONT1);
    expect(reviveAt, "Shikitsune should cast").not.toBeNull();
    expect(firstCastFrom(BACK1)).toBeGreaterThan(reviveAt!);
  });

  it("makes the revived ally faster than an untouched one, by the published amount", () => {
    // The point of the ability, measured where the user reads it: Bumblebolt's effective cooldown.
    const cooldownOf = (config: TeamConfiguration) =>
      simulate(config, corpus).perCreatureEffectiveStats[placementKey(Species.Bumblebolt, BACK1)]!.cooldownSeconds!;

    const normal = cooldownOf(
      team([
        { id: Species.Bumblebolt, slot: BACK1 },
        { id: Species.Shikitsune, slot: FRONT1 },
      ]),
    );
    const revived = cooldownOf(team(KNOCKED_OUT_BOARD));
    expect(revived).toBeLessThan(normal);
    expect(revived).toBeCloseTo(normal / 1.15, 5);
  });

  /**
   * The crash (2026-10-08, user-reported): placing a Rattleghast blacked the page out with
   * `Cannot read properties of undefined (reading 'cooldownSpeedGrant')`.
   *
   * `resolveBoard` removes a knocked-out creature from its result, and `simulate()` indexed that
   * result by placement key with a non-null assertion — so every victim produced `undefined` and
   * the first property read off it took the app down. The assertion had been wrong since the
   * knockout family was first modelled; tagging Rattleghast only made it reachable in one click.
   */
  it("survives a knockout with no reviver, rather than crashing on the missing placement", () => {
    const board = team([
      // Rattleghast in the middle, so BOTH neighbours die and neither can revive: Shikitsune is
      // adjacent too, which is what makes this the board the user actually built.
      { id: Species.Shikitsune, slot: BACK0 },
      { id: Species.Rattleghast, slot: BACK1 },
      { id: Species.Pebbler, slot: BACK2 },
    ]);
    const result = simulate(board, corpus);

    expect(result.knockedOutAtBattleStart.map((c) => c.name).sort()).toEqual(["Pebbler", "Shikitsune"]);
    for (const casualty of result.knockedOutAtBattleStart) {
      expect(casualty.knockedOutBy).toBe("Rattleghast");
    }
    // A corpse casts nothing, so it has no entry anywhere — the state the old `!` assumed could
    // not happen. Rattleghast is still fighting.
    expect(result.perCreatureEffectiveStats[placementKey(Species.Pebbler, BACK2)]).toBeUndefined();
    expect(result.perCreatureEffectiveStats[placementKey(Species.Rattleghast, BACK1)]).toBeDefined();
  });

  it("reports no casualties when the reviver brings everyone back", () => {
    // The casualty list is "dead and stayed dead", not "was knocked out at some point" — telling
    // the user a revived ally is missing from the figure would be the opposite of true.
    expect(simulate(team(KNOCKED_OUT_BOARD), corpus).knockedOutAtBattleStart).toEqual([]);
  });

  it("models Rattleghast's knockout too, not only Petrirex's", () => {
    // Identical ability shape, untagged until 2026-10-08 — so a Shikitsune board built around
    // Rattleghast silently did nothing at all.
    const resolved = resolveEffects(
      team([
        { id: Species.Rattleghast, slot: BACK0 },
        { id: Species.Bumblebolt, slot: BACK1 },
        { id: Species.Shikitsune, slot: FRONT1 },
      ]),
      corpus,
    );
    const victim = resolved.find((r) => r.creature.id === Species.Bumblebolt);
    expect(victim?.cooldownSpeedGrant).toBeCloseTo(0.15);

    const rattleghast = resolved.find((r) => r.creature.id === Species.Rattleghast)!;
    const base = getCreatureByIdAndLevel(Species.Rattleghast, 1)!;
    const basePoison = base.appliesStatus!.find((s) => s.type === "Poison")!.amount;
    expect(rattleghast.appliesStatus.find((s) => s.type === "Poison")!.amount).toBe(basePoison + 4);
  });
});
