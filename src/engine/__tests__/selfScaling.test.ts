import { describe, expect, it } from "vitest";
import { corpus, resolveCreatureVariant } from "../../data/corpus";
import { simulate } from "../simulate";
import { resolveEffects } from "../effects";
import { perCastOutputOf } from "../../ui/shared/BatomonCard/perCastOutput";
import type { GridSlot, StatModifier, TeamConfiguration } from "../../data/types";
import { AbilityTagKind, GridRow, ModifierStat, StatChangeStat, StatusEffectType, TimelineEventKind } from "../../data/enums";
import { Species } from "../../data/ids";

/**
 * Ongoing abilities that scale off the monster's OWN stat (2026-10-08).
 *
 * The reported case: a Lignite holding 5 Burn shows a **100 Damage chip** in game — on the
 * team-pane tile and on its ability card — while this project showed it no damage at all. Its
 * "Has additional Damage equal to 20 times this monster's Burn" carried no tag, so the ability was
 * inert everywhere.
 *
 * What makes the family distinct is not the arithmetic but WHERE the answer belongs. Every other
 * resolved ability lands in "Effective this battle"; the game puts this one in the monster's own
 * displayed stats and shows no battle effect, because the ability restates what the monster IS.
 * So the assertions below come in pairs: the number is right, AND it is right on the base figure.
 */

const BACK0: GridSlot = { row: GridRow.Back, col: 0 };
const FRONT0: GridSlot = { row: GridRow.Front, col: 0 };

const team = (
  placements: { id: Species; slot: GridSlot; level?: 1 | 2 | 3 | 4; modifiers?: StatModifier[] }[],
): TeamConfiguration => ({
  placements: placements.map((p) => ({
    slot: p.slot,
    creatureId: p.id,
    level: p.level ?? 1,
    modifiers: p.modifiers,
  })),
  trainerId: null,
  trinketIds: [],
  itemIds: [],
  simulationWindowSeconds: 20,
  teamModifiers: [],
});

const lignite = (level: 1 | 2 | 3 | 4 = 1, shiny = false) =>
  resolveCreatureVariant(Species.Lignite, level, shiny)!;

describe("the tag is read off the published text, not hand-written", () => {
  it("derives one scaling rule per level, with that level's multiplier", () => {
    // 20/40/60/120 across the four levels. A rule row rather than four hand-written tags is the
    // whole reason the levels cannot drift apart from the text they came from.
    for (const [level, multiplier] of [[1, 20], [2, 40], [3, 60], [4, 120]] as const) {
      expect(lignite(level).abilityTags).toEqual([
        {
          kind: AbilityTagKind.StatFromOwnStat,
          sourceStat: StatusEffectType.Burn,
          stat: StatChangeStat.Damage,
          multiplier,
        },
      ]);
    }
  });

  it("reads the SHINY text's multiplier rather than inheriting the normal form's", () => {
    // Shiny Lignite publishes "24 times" at level 1 while the normal form says 20. The shiny line
    // carries text but no tags, and inheriting the normal tag put a number on screen that
    // contradicted the card directly above it. See `shinyAbilityTags` in corpus.ts.
    expect(lignite(1, true).abilityTags).toEqual([
      {
        kind: AbilityTagKind.StatFromOwnStat,
        sourceStat: StatusEffectType.Burn,
        stat: StatChangeStat.Damage,
        multiplier: 24,
      },
    ]);
  });
});

describe("the scaled value lands on the BASE figure, which is where the game shows it", () => {
  it("gives the card and the grid chip a damage value the creature does not publish", () => {
    // Lignite has no published cast at all, so this is create-from-nothing: a family that could
    // only scale an existing number would leave the ability inert on the one creature that has it.
    expect(lignite().publishedCast).toBeUndefined();
    expect(perCastOutputOf(lignite()).damage).toBe(60); // 20 x Burn 3
  });

  it("scales off the Burn a MODIFIER produced, not the published Burn", () => {
    // The user's own reading: 5 Burn, 100 Damage. Self-scaling runs last, after modifiers, so the
    // input is the Burn the creature actually applies.
    const output = perCastOutputOf(lignite(), [
      { id: "m1", stat: ModifierStat.BurnAmountAdd, amount: 2 },
    ]);
    expect(output.appliesStatus).toContainEqual({ type: StatusEffectType.Burn, amount: 5 });
    expect(output.damage).toBe(100);
  });

  it("is NOT applied by the effect resolver, so the two cannot double it", () => {
    // `resolveBoard` is the "what does the battle do" layer and deliberately leaves this alone.
    // If it ever starts resolving it, `simulate()` and the card would each add it once more.
    const resolved = resolveEffects(team([{ id: Species.Lignite, slot: BACK0 }]), corpus);
    expect(resolved[0]!.baseDamage).toBeNull();
  });

  it("leaves nothing for the 'Effective this battle' band to report", () => {
    // The acceptance criterion from the report: the game states this in the ability section and
    // shows no battle effect, so a band here would invent a difference the game does not show.
    // The band renders only when effective differs from base — see `PlacedCreatureDetails`.
    const config = team([{ id: Species.Lignite, slot: BACK0 }]);
    const result = simulate(config, corpus);
    const effective = Object.values(result.perCreatureEffectiveStats)[0]!;
    expect(effective.output).toEqual(perCastOutputOf(lignite()));
  });
});

describe("the battle uses the same number the card shows", () => {
  it("deals the scaled damage on every cast", () => {
    // 5s cooldown over a 20s window is 4 casts of 60 direct damage. Before this the creature
    // published no damage and contributed only its Burn.
    const config = { ...team([{ id: Species.Lignite, slot: BACK0 }]), simulationWindowSeconds: 20 };
    const result = simulate(config, corpus);
    const directHits = result.timeline.filter((e) => "damage" in e && e.damage === 60);
    expect(directHits.length).toBe(4);
  });

  it("re-reads the Burn an ally granted MID-BATTLE, so the hits grow", () => {
    /*
     * Magmalith in front gives "the ally above +2 Burn permanently" on each of its casts, and
     * Lignite is the ally above it. Burn 3 -> 5 -> 7, so Lignite's hits go 60 -> 100 -> 140.
     *
     * This is why the scaling is recomputed per cast rather than resolved once: a stored value
     * would be the opening 60 for the whole battle. It is also where the reported 100 comes from
     * without the user touching a modifier.
     */
    const config = team([
      { id: Species.Lignite, slot: BACK0 },
      { id: Species.Magmalith, slot: FRONT0 },
    ]);
    const hits = simulate(config, corpus)
      .timeline.filter((e) => e.kind === TimelineEventKind.Attack && e.sourceSlot.row === GridRow.Back)
      .map((e) => (e as { tSeconds: number; damage?: number }).damage);

    // Lignite casts at 5/10/15/20; Magmalith's land at 9 and 18.
    expect(hits).toEqual([60, 100, 100, 140]);
  });
});
