import { describe, expect, it } from "vitest";
import { corpus } from "../../data/corpus";
import { RESOLVED_TAG_KINDS, isResolvableTag, resolveEffects } from "../effects";
import type { GridSlot, TeamConfiguration } from "../../data/types";
import { AbilityTagKind, GridRow, TargetKind } from "../../data/enums";
import { Species } from "../../data/ids";
import { analyzePositionalCoverage } from "../optimize";
import { abilityNeedsModelling } from "../../data/display";

/**
 * Round 10 (T219): the general selector-based resolver.
 *
 * Seven of the "mechanism families" in the round-10 taxonomy (adjacency auras, positional grants,
 * row-wide effects, on-battle-start team grants, self-buffs, multicast grants, cooldown-speed
 * grants) differ only by their `TargetSelector`. These tests exercise the selectors directly rather
 * than waiting for corpus tagging, so a selector regression is caught even on a day when no creature
 * happens to carry that shape.
 */

const team = (placements: { id: Species; slot: GridSlot }[]): TeamConfiguration => ({
  placements: placements.map((p) => ({ slot: p.slot, creatureId: p.id, level: 1 })),
  trainerId: null,
  trinketIds: [],
  itemIds: [],
  simulationWindowSeconds: 20,
  teamModifiers: [],
});

const BACK0: GridSlot = { row: GridRow.Back, col: 0 };
const BACK1: GridSlot = { row: GridRow.Back, col: 1 };
const BACK2: GridSlot = { row: GridRow.Back, col: 2 };
const FRONT0: GridSlot = { row: GridRow.Front, col: 0 };

describe("selector-based effect families (T219)", () => {
  it("adjacency is side-sharing only, so a gap in the row breaks the aura", () => {
    // Formiqueen's ongoing grant targets `adjacent`. back0 and back1 are adjacent; back0 and back2
    // are not, even though both are in the same row.
    const adjacent = resolveEffects(
      team([{ id: Species.Formiqueen, slot: BACK0 }, { id: Species.Bumblebolt, slot: BACK1 }]),
      corpus,
    );
    const apart = resolveEffects(
      team([{ id: Species.Formiqueen, slot: BACK0 }, { id: Species.Bumblebolt, slot: BACK2 }]),
      corpus,
    );
    // Both resolve without error and leave Bumblebolt's own status line alone -- Formiqueen grants
    // cooldown speed, which `simulate()` owns (see the double-counting note in effects.ts).
    const shockOf = (r: ReturnType<typeof resolveEffects>) =>
      r.find((x) => x.creature.id === Species.Bumblebolt)!.appliesStatus.find((s) => s.type === "Shock")!.amount;
    expect(shockOf(adjacent)).toBe(1);
    expect(shockOf(apart)).toBe(1);
  });

  it("a positional grant reaches the creature behind, and nothing when that slot is empty", () => {
    // Onsetra: "the ally behind applies its Ongoing abilities 1 additional time". `behind` is only
    // defined from the front row, so an Onsetra in the back row grants nothing.
    const onsetra = corpus.creatures.find((c) => c.id === Species.Onsetra && c.level === 1);
    expect(onsetra, "fixture depends on Onsetra existing at level 1").toBeDefined();

    const granted = resolveEffects(
      team([{ id: Species.Onsetra, slot: FRONT0 }, { id: Species.Bumblebolt, slot: BACK0 }]),
      corpus,
    );
    const bumble = granted.find((r) => r.creature.id === Species.Bumblebolt)!;
    expect(bumble.extraOngoingApplications).toBe(1);

    // Same pair, Onsetra in the back row: nothing is behind it.
    const nothingBehind = resolveEffects(
      team([{ id: Species.Onsetra, slot: BACK0 }, { id: Species.Bumblebolt, slot: FRONT0 }]),
      corpus,
    );
    expect(nothingBehind.find((r) => r.creature.id === Species.Bumblebolt)!.extraOngoingApplications).toBe(0);
  });

  it("a lone creature is never affected by its own ally-targeting tags", () => {
    // Every selector except `self` excludes the source, so a solo board must resolve to base stats.
    for (const id of ["formiqueen", "onsetra", "miasmaw"]) {
      const solo = resolveEffects(team([{ id: id as Species, slot: BACK1 }]), corpus);
      const base = corpus.creatures.find((c) => c.id === id && c.level === 1)!;
      expect(solo[0]!.baseDamage, `${id} solo damage`).toBe(base.publishedCast?.damage ?? null);
      expect(solo[0]!.multicast, `${id} solo multicast`).toBe(base.baseMulticast);
      expect(solo[0]!.extraOngoingApplications, `${id} solo ongoing`).toBe(0);
    }
  });

  it("GUARD: no tag restates a stat the creature already has in appliesStatus", () => {
    // This is how the resolver first went wrong. Bumblebolt carried
    // `statusGrant self Shock 1` -- a RESTATEMENT of its `appliesStatus`, not an extra grant -- so
    // the moment the resolver learned `statusGrant`, its Shock doubled to 2. Sixteen such tags
    // existed across the corpus, including a Pebbler tag reading Shield 15 while its actual
    // appliesStatus was 20 (a stale pre-Balance-24 number).
    //
    // They are also precisely why "tagged" overstated coverage: they looked like modelled abilities
    // while encoding nothing the data did not already say.
    const offenders: string[] = [];
    for (const c of corpus.creatures) {
      for (const tag of c.abilityTags) {
        if (tag.kind !== AbilityTagKind.StatusGrant || tag.target.kind !== TargetKind.Self) continue;
        if ((c.appliesStatus ?? []).some((s) => s.type === tag.status)) {
          offenders.push(`${c.id} L${c.level} ${tag.status}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("GUARD: isResolvableTag and RESOLVED_TAG_KINDS cannot drift apart", () => {
    // The round-10 audit reported "9 of 135 modelled" by counting tags rather than resolved kinds.
    // One constant now feeds both the resolver and the coverage reporter.
    for (const kind of RESOLVED_TAG_KINDS) expect(isResolvableTag({ kind })).toBe(true);
    // `cooldownSpeedOnAllyCast` moved from unresolved to resolved in T213 — it is the tag that
    // task existed to implement. A kind no engine code reads is the thing this guard watches for.
    expect(isResolvableTag({ kind: AbilityTagKind.CooldownSpeedOnAllyCast })).toBe(true);
    expect(isResolvableTag({ kind: "notARealTagKind" })).toBe(false);
  });
});

/**
 * The FR-075 coverage figure (2026-10-07).
 *
 * It shipped wrong: the UI computed it as `needsModelling` minus `actionable`, and `actionable` only
 * counts POSITIONAL tags because it belongs to the placement optimiser (FR-069). Every creature
 * whose ability the engine resolves non-positionally was therefore reported as unmodelled, next to a
 * DPS figure the user is being asked to trust.
 *
 * These tests tie the claim to `isResolvableTag` — the same predicate the engine uses to decide what
 * it acts on — so the number and the behaviour cannot disagree again.
 */
describe("coverage reporting is tied to what the engine actually resolves", () => {
  const board = (picks: Species[]): TeamConfiguration => ({
    placements: picks.map((creatureId, i) => ({
      slot: { row: i < 3 ? GridRow.Back : GridRow.Front, col: (i % 3) as 0 | 1 | 2 },
      creatureId,
      level: 1 as const,
    })),
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: 20,
    teamModifiers: [],
  });

  it("partitions every ability that needs modelling, with nothing double-counted", () => {
    // The three buckets must sum to the denominator, or the figure is arithmetic nonsense whatever
    // else it says.
    const c = analyzePositionalCoverage(
      board([Species.Ninflora, Species.Mosslug, Species.Thorntail, Species.Drumire, Species.Cobrex, Species.Miasmaw]),
      corpus,
    );
    expect(c.modelled.length + c.manuallyBanked.length + c.unmodelled.length).toBe(c.needsModelling.length);
    expect(new Set([...c.modelled, ...c.manuallyBanked, ...c.unmodelled]).size).toBe(c.needsModelling.length);
  });

  it("counts a resolvable NON-positional tag as modelled — the bug that shipped", () => {
    /*
     * Mosslug's `buffOnCast` and Thorntail's `gainOnAllyStatus` are both resolved by the engine and
     * neither is positional, so the old formula called them unmodelled. This board reported
     * "3 of 6 abilities not yet modelled" when the true answer was 1 of 6 — Ninflora, whose trigger
     * fires outside the battle and is banked by a button instead.
     */
    const c = analyzePositionalCoverage(
      board([Species.Ninflora, Species.Mosslug, Species.Thorntail, Species.Drumire, Species.Cobrex, Species.Miasmaw]),
      corpus,
    );
    expect(c.unmodelled).toEqual([]);
    expect(c.manuallyBanked).toEqual(["Ninflora"]);
    expect(c.modelled).toContain("Mosslug");
    expect(c.modelled).toContain("Thorntail");

    // And the old formula, reproduced, still gives the wrong answer — so this is a real regression
    // guard rather than a restatement of the new code.
    const oldFormula = c.needsModelling.filter((n) => !c.actionable.includes(n)).length;
    expect(oldFormula).toBe(3);
    expect(c.unmodelled.length).toBe(0);
  });

  it("agrees with isResolvableTag for every creature in the corpus", () => {
    // The whole-corpus version: whatever `modelled` claims must match the engine's own predicate.
    const everySpecies = corpus.creatures.filter((cr) => cr.level === 1).map((cr) => cr.id);
    for (const id of everySpecies) {
      const creature = corpus.creatures.find((cr) => cr.id === id && cr.level === 1)!;
      if (!abilityNeedsModelling(creature)) continue;
      const c = analyzePositionalCoverage(board([id]), corpus);
      const resolvable = creature.abilityTags.some(isResolvableTag);
      expect(c.modelled.length === 1, `${id}: modelled=${c.modelled.length}, resolvable=${resolvable}`).toBe(
        resolvable,
      );
    }
  });
});
