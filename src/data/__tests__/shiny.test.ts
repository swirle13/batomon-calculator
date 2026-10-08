import { describe, expect, it } from "vitest";
import { corpus, hasShinyVariant, resolveCreatureVariant } from "../corpus";
import { simulate } from "../../engine/simulate";
import type { TeamConfiguration } from "../types";
import { SHINY_STATS } from "../shiny";
import { GridRow, TimelineEventKind } from "../enums";

/**
 * Round 11 (WI-R11-001). Shiny is a published per-creature stat line, not a multiplier.
 *
 * The obvious implementation — "shiny is +20%" — matches Beetbud exactly and is wrong for roughly a
 * third of the corpus. These tests pin the counterexamples specifically, because a multiplier
 * regression would still look right on most creatures and would be invisible in the UI.
 */
describe("shiny variants", () => {
  it("is not a uniform multiplier: most stats are unchanged", () => {
    let unchanged = 0;
    let changed = 0;
    for (const [key, line] of Object.entries(SHINY_STATS)) {
      const [id, lvl] = key.split("|");
      const base = corpus.creatures.find((c) => c.id === id && c.level === Number(lvl));
      if (!base || base.baseDamage == null || line.baseDamage == null) continue;
      if (base.baseDamage === line.baseDamage) unchanged++;
      else changed++;
    }
    // If someone replaces this table with `base * 1.2`, `unchanged` collapses to 0.
    expect(unchanged).toBeGreaterThan(changed);
  });

  it("changes cooldown for some species (Furnadon 5s -> 4s)", () => {
    const normal = resolveCreatureVariant("furnadon", 1, false);
    const shiny = resolveCreatureVariant("furnadon", 1, true);
    expect(normal?.baseCooldownSeconds).toBe(5);
    expect(shiny?.baseCooldownSeconds).toBe(4);
  });

  it("changes multicast for some species (Velocect 2 -> 4)", () => {
    expect(resolveCreatureVariant("velocect", 1, false)?.baseMulticast).toBe(2);
    expect(resolveCreatureVariant("velocect", 1, true)?.baseMulticast).toBe(4);
  });

  it("GUARD: shiny is a DOWNGRADE for at least one species, so it is never assumed strictly better", () => {
    // 7 stat records measured at ratio 0.8. A UI or optimiser that treats shiny as a pure upgrade
    // would mislead on exactly these.
    const worse: string[] = [];
    for (const [key, line] of Object.entries(SHINY_STATS)) {
      const [id, lvl] = key.split("|");
      const base = corpus.creatures.find((c) => c.id === id && c.level === Number(lvl));
      if (!base?.baseDamage || line.baseDamage == null) continue;
      if (line.baseDamage < base.baseDamage) worse.push(key);
    }
    expect(worse.length).toBeGreaterThan(0);
  });

  it("falls back to the normal line rather than throwing when a species has no shiny row", () => {
    const missing = corpus.creatures.find((c) => !hasShinyVariant(c.id, c.level));
    if (!missing) return; // every species has shiny data; nothing to assert
    const resolved = resolveCreatureVariant(missing.id, missing.level, true);
    expect(resolved?.baseDamage).toBe(missing.baseDamage);
  });

  it("leaves the creature's identity and ability alone — shiny swaps stats, not behaviour", () => {
    const normal = resolveCreatureVariant("velocect", 1, false)!;
    const shiny = resolveCreatureVariant("velocect", 1, true)!;
    expect(shiny.id).toBe(normal.id);
    expect(shiny.abilityText).toBe(normal.abilityText);
    expect(shiny.abilityTags).toEqual(normal.abilityTags);
    expect(shiny.rarity).toBe(normal.rarity);
  });
});

describe("shiny reaches the ENGINE, not just the card (2026-10-06)", () => {
  const place = (creatureId: string, shiny: boolean): TeamConfiguration => ({
    placements: [{ slot: { row: GridRow.Back, col: 0 }, creatureId, level: 1, shiny }],
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: 15,
    teamModifiers: [],
  });

  it("a shiny heal reaches the effective stats", () => {
    // The symptom: a shiny Dribblet's card showed Heal 18 while "Effective this battle" showed 15,
    // so the band rendered a difference that did not exist. The engine looked up the raw corpus
    // record and ignored `placement.shiny`, so `member.resolved` was shiny while every direct
    // `creature.*` read was not.
    const normal = Object.values(simulate(place("dribblet", false), corpus).perCreatureEffectiveStats)[0]!;
    const shiny = Object.values(simulate(place("dribblet", true), corpus).perCreatureEffectiveStats)[0]!;
    expect(normal.output.heal).toBe(15);
    expect(shiny.output.heal).toBe(18);
  });

  it("a shiny multicast actually changes the simulation", () => {
    // Velocect is the sharpest case: shiny trades damage DOWN (15 -> 8) for multicast UP (2 -> 4).
    // Reading the normal record meant the engine simulated neither half, so the trade-off that
    // makes shiny Velocect worth taking was invisible.
    const normal = simulate(place("velocect", false), corpus);
    const shiny = simulate(place("velocect", true), corpus);
    const casts = (r: typeof normal) => r.timeline.filter((e) => e.kind === TimelineEventKind.Attack).length;
    expect(casts(shiny)).toBe(casts(normal) * 2);
    expect(Object.values(shiny.perCreatureEffectiveStats)[0]!.output.damage).toBe(8);
  });

  it("a shiny cooldown changes cast timing", () => {
    // Furnadon's shiny line is a full second faster (5s -> 4s). A 20s window is needed to show it:
    // at 15s both fit exactly 3 casts (5/10/15 against 4/8/12), so the difference is invisible.
    const longWindow = (id: string, shiny: boolean) => ({ ...place(id, shiny), simulationWindowSeconds: 20 });
    const normal = simulate(longWindow("furnadon", false), corpus);
    const shiny = simulate(longWindow("furnadon", true), corpus);
    expect(Object.values(normal.perCreatureEffectiveStats)[0]!.cooldownSeconds).toBe(5);
    expect(Object.values(shiny.perCreatureEffectiveStats)[0]!.cooldownSeconds).toBe(4);
    expect(shiny.timeline.filter((e) => e.kind === TimelineEventKind.Attack).length).toBeGreaterThan(
      normal.timeline.filter((e) => e.kind === TimelineEventKind.Attack).length,
    );
  });

  it("GUARD: the effective band matches the card for every shiny species, so it stays hidden", () => {
    // The band only renders when it DIFFERS from the card. A shiny creature with no modifiers must
    // therefore produce identical values on both, or every shiny placement shows a phantom
    // difference — which is exactly what was reported.
    for (const id of ["dribblet", "velocect", "furnadon", "kappow"]) {
      const effective = Object.values(simulate(place(id, true), corpus).perCreatureEffectiveStats)[0]!;
      const card = resolveCreatureVariant(id, 1, true)!;
      expect(effective.output.heal ?? null, `${id} heal`).toBe(card.healAmount ?? null);
      expect(effective.output.multicast, `${id} multicast`).toBe(card.baseMulticast);
      expect(effective.cooldownSeconds, `${id} cooldown`).toBe(card.baseCooldownSeconds);
    }
  });
});
