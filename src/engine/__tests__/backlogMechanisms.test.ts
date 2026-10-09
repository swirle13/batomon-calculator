import { describe, expect, it } from "vitest";
import { corpus } from "../../data/corpus";
import { simulate } from "../simulate";
import { resolveEffects } from "../effects";
import { GridRow, StatusEffectType, TimelineEventKind } from "../../data/enums";
import { Species } from "../../data/ids";
import type { CreatureLevel, GridCol, TeamConfiguration } from "../../data/types";

function board(entries: [GridRow, GridCol, Species, CreatureLevel?][], windowSeconds = 30): TeamConfiguration {
  return {
    placements: entries.map(([row, col, creatureId, level]) => ({
      slot: { row, col },
      creatureId,
      level: level ?? 1,
    })),
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: windowSeconds,
  };
}

const resolvedAt = (config: TeamConfiguration, id: Species) =>
  resolveEffects(config, corpus).find((r) => r.creature.id === id);

const castTimes = (config: TeamConfiguration, row: GridRow, col: GridCol) =>
  simulate(config, corpus)
    .timeline.filter(
      (e) => e.kind === TimelineEventKind.Attack && e.sourceSlot.row === row && e.sourceSlot.col === col,
    )
    .map((e) => e.tSeconds);

/**
 * 2026-10-09, user-instructed: "let's implement those then instead of leaving them undone."
 *
 * The backlog `abilityQualifiers.test.ts` had recorded as "mechanism the engine does not have".
 * Each of these was an ability that resolved to nothing at all, so the test that matters is not
 * "the number is right" but "the ability does something, to the right monster, and not to the
 * wrong one". Remember the geometry: `behind` is one column LEFT, same row.
 */
describe("mechanisms built for the backlog", () => {
  describe("Blixie — a grant whose amount comes from the GIVER's own stat", () => {
    it("hands the Fire ally behind its own Burn", () => {
      // Blixie publishes Burn 30 and Lignite is Fire, so Lignite should gain 30 Burn on top of
      // its own. The hole this fills: every other grant shape carries a fixed amount, and
      // statFromStat is the receiver's view of the same idea rather than the giver's.
      const alone = resolvedAt(board([[GridRow.Top, 0, Species.Lignite]]), Species.Lignite);
      const behind = resolvedAt(
        board([[GridRow.Top, 1, Species.Blixie], [GridRow.Top, 0, Species.Lignite]]),
        Species.Lignite,
      );
      const burn = (r: typeof alone) => r?.appliesStatus.find((s) => s.type === StatusEffectType.Burn)?.amount ?? 0;
      expect(burn(behind)).toBe(burn(alone) + 30);
    });

    it("does not reach a non-Fire ally behind", () => {
      const rock = resolvedAt(
        board([[GridRow.Top, 1, Species.Blixie], [GridRow.Top, 0, Species.Pebbler]]),
        Species.Pebbler,
      );
      expect(rock?.appliesStatus.find((s) => s.type === StatusEffectType.Burn)).toBeUndefined();
    });
  });

  describe("Stellagon — the 'allies with no abilities' filter", () => {
    const multicastOf = (config: TeamConfiguration, id: Species) => resolvedAt(config, id)?.multicast;

    it("buffs a neighbour that publishes no ability", () => {
      // Humbolt's abilityText is empty, which is what the filter selects on.
      const alone = multicastOf(board([[GridRow.Top, 1, Species.Humbolt]]), Species.Humbolt);
      const beside = multicastOf(
        board([[GridRow.Top, 0, Species.Stellagon], [GridRow.Top, 1, Species.Humbolt]]),
        Species.Humbolt,
      );
      expect(beside).toBe(alone! + 2);
    });

    it("skips a neighbour that has one", () => {
      // Pebbler publishes "+15 Shield for this battle", so the filter reads straight past it.
      const alone = multicastOf(board([[GridRow.Top, 1, Species.Pebbler]]), Species.Pebbler);
      const beside = multicastOf(
        board([[GridRow.Top, 0, Species.Stellagon], [GridRow.Top, 1, Species.Pebbler]]),
        Species.Pebbler,
      );
      expect(beside).toBe(alone);
    });
  });

  describe("the charge GIVERS — Dracana, Ironcore, Steamscuttle", () => {
    it("pulls the ally behind's casts earlier", () => {
      /*
       * `chargeRules` was the receiving half only (Cobrex pulling its OWN cast forward), so three
       * creatures whose entire ability is accelerating a neighbour did nothing. Dracana casts
       * every 3s and charges by 1s, so its neighbour's cadence compresses steadily.
       */
      const alone = castTimes(board([[GridRow.Top, 0, Species.Pebbler]]), GridRow.Top, 0);
      const charged = castTimes(
        board([[GridRow.Top, 1, Species.Dracana], [GridRow.Top, 0, Species.Pebbler]]),
        GridRow.Top,
        0,
      );
      expect(charged.length).toBeGreaterThan(alone.length);
    });

    it("honours '(Dracana can't receive charge)' between a pair of them", () => {
      // Both are the givers AND the refusers, so a pair standing together is exactly the case the
      // parenthetical exists for. Each keeps its own 3s cadence, untouched.
      const pair = board([[GridRow.Top, 1, Species.Dracana], [GridRow.Top, 0, Species.Dracana]]);
      expect(castTimes(pair, GridRow.Top, 0)).toEqual(castTimes(board([[GridRow.Top, 0, Species.Dracana]]), GridRow.Top, 0));
    });

    it("applies Ironcore's type filter", () => {
      // "Charge adjacent ELECTRIC allies". Pebbler is Rock and gets nothing.
      const alone = castTimes(board([[GridRow.Top, 1, Species.Pebbler]]), GridRow.Top, 1);
      const beside = castTimes(
        board([[GridRow.Top, 0, Species.Ironcore], [GridRow.Top, 1, Species.Pebbler]]),
        GridRow.Top,
        1,
      );
      expect(beside).toEqual(alone);
    });
  });

  describe("Rhizuka — reacting to an ally APPLYING a status", () => {
    it("fires when an ally applies Shield", () => {
      /*
       * The third reactive hook. The event was already recorded per instant for the charge and
       * `gainOnAllyStatus` passes — only the listener was missing. Pebbler applies Shield every
       * 5s; Rhizuka's own cooldown is 15s, so any cast off that cadence is a reaction.
       */
      const alone = castTimes(board([[GridRow.Top, 0, Species.Rhizuka]]), GridRow.Top, 0);
      const withShielder = castTimes(
        board([[GridRow.Top, 0, Species.Rhizuka], [GridRow.Top, 1, Species.Pebbler]]),
        GridRow.Top,
        0,
      );
      expect(withShielder.length).toBeGreaterThan(alone.length);
      // And its own cycle is untouched: a reaction is an extra cast, never a rescheduled one.
      for (const t of alone) expect(withShielder).toContain(t);
    });

    it("does not fire on its own Shield, nor on another Rhizuka's", () => {
      // Rhizuka applies no Shield itself, so the self-exclusion is exercised through a pair:
      // "(Except other Rhizuka)" means a second copy is not a trigger source.
      const pair = board([[GridRow.Top, 0, Species.Rhizuka], [GridRow.Top, 1, Species.Rhizuka]]);
      const alone = castTimes(board([[GridRow.Top, 0, Species.Rhizuka]]), GridRow.Top, 0);
      expect(castTimes(pair, GridRow.Top, 0)).toEqual(alone);
    });
  });

  describe("Snapscald — reacting to a LEVEL-filtered ally casting", () => {
    it("fires for a level 3 ally and not for a level 1 one", () => {
      // No new hook needed: `triggerOnAllyCast` resolves a selector, and the selector learned
      // `minLevelFilter` long ago. The ability was simply never tagged.
      const high = board([[GridRow.Top, 0, Species.Snapscald], [GridRow.Top, 1, Species.Pebbler, 3]]);
      const low = board([[GridRow.Top, 0, Species.Snapscald], [GridRow.Top, 1, Species.Pebbler, 1]]);
      expect(castTimes(high, GridRow.Top, 0).length).toBeGreaterThan(castTimes(low, GridRow.Top, 0).length);
    });
  });

  describe("Danuki — gaining from an ally's knockout", () => {
    it("takes a share of a battle-start casualty's Damage", () => {
      /*
       * Reachable only because the engine models the one knockout family it can: Petrirex kills
       * its neighbours by POSITION at battle start, so the casualty list exists before the first
       * cast. Petrirex sits between its victim and nobody else; Danuki stands clear of it so it
       * survives to collect.
       */
      const withKnockout = board([
        [GridRow.Top, 0, Species.Petrirex],
        [GridRow.Top, 1, Species.Beetbud],
        [GridRow.Bottom, 2, Species.Danuki],
      ]);
      const withoutKnockout = board([
        [GridRow.Top, 1, Species.Beetbud],
        [GridRow.Bottom, 2, Species.Danuki],
      ]);
      const damage = (c: TeamConfiguration) => resolvedAt(c, Species.Danuki)?.baseDamage ?? 0;
      expect(damage(withKnockout)).toBeGreaterThan(damage(withoutKnockout));
    });

    it("gains nothing on a board where nobody is knocked out", () => {
      // Which is most boards, and is an UNDERSTATEMENT rather than a guess: there is no HP model
      // here for an ally to die to mid-fight.
      const quiet = board([[GridRow.Top, 0, Species.Danuki], [GridRow.Top, 1, Species.Beetbud]]);
      const solo = board([[GridRow.Top, 0, Species.Danuki]]);
      expect(resolvedAt(quiet, Species.Danuki)?.baseDamage).toBe(resolvedAt(solo, Species.Danuki)?.baseDamage);
    });
  });
});
