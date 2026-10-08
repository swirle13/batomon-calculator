import { describe, expect, it } from "vitest";
import { simulate } from "../simulate";
import { corpus } from "../../data/corpus";
import { resolveEffects } from "../effects";
import { addFlat, applyMultiplier, read, statValue } from "../statValue";
import type { GridSlot, TeamConfiguration } from "../../data/types";
import { GridRow, TimelineEventKind } from "../../data/enums";
import { Species } from "../../data/ids";

/**
 * Round 5: the findings from `orchestration/engine-handoff-gameplay-capture.md`.
 *
 * **Every assertion here is an arithmetic identity or a ratio, never a wall-clock time.** The
 * recording was made with fast-forward engaged, compressing time ~2.6x, so "no absolute
 * second-count from this footage is usable". A test pinning seconds would encode the fast-forward
 * factor as if it were a game rule.
 */
const team = (ps: { id: Species; slot: GridSlot; level?: 1 | 2 | 3 | 4 }[], w = 20): TeamConfiguration => ({
  placements: ps.map((p) => ({ slot: p.slot, creatureId: p.id, level: p.level ?? 1 })),
  trainerId: null,
  trinketIds: [],
  itemIds: [],
  simulationWindowSeconds: w,
  teamModifiers: [],
});

describe("Finding 2 — multipliers are re-evaluated on read (T240)", () => {
  it("(604 + 6) x 1.7 = 1037, and (11 + 6) x 1.7 = 29", () => {
    // The two mons carrying +70% gained +10 from a +6 grant. Only read-time multiplication
    // reproduces BOTH numbers.
    const cobrex = statValue(604);
    applyMultiplier(cobrex, 1.7);
    addFlat(cobrex, 6);
    expect(Math.round(read(cobrex))).toBe(1037);

    const puffloon = statValue(11);
    applyMultiplier(puffloon, 1.7);
    addFlat(puffloon, 6);
    expect(Math.round(read(puffloon))).toBe(29);
  });

  it("rejects snapshot-then-add, which gives 1033 and 25", () => {
    // Documented here because it is the model the engine used before this round, and it happens to
    // look right for one creature while being wrong for the other.
    expect(Math.round(604 * 1.7) + 6).toBe(1033);
    expect(Math.round(11 * 1.7) + 6).toBe(25);
  });

  it("compounds across repeated grants: 1027 -> 1037 -> 1047", () => {
    const v = statValue(604);
    applyMultiplier(v, 1.7);
    expect(Math.round(read(v))).toBe(1027);
    addFlat(v, 6);
    expect(Math.round(read(v))).toBe(1037);
    addFlat(v, 6);
    expect(Math.round(read(v))).toBe(1047);
  });
});

describe("Finding 3 — reactive gains are never scaled (T241)", () => {
  it("a +24 gain stays +24 on a creature carrying a huge multiplier", () => {
    // Thorntail entered at 7082 displayed damage against a listed base of 50, and every increment
    // was still exactly 24. Folding the gain into `base` would scale it by the whole factor.
    const v = statValue(50);
    applyMultiplier(v, 140);
    const before = read(v);
    v.postMultiplierFlatAdd += 24;
    expect(read(v) - before).toBe(24);
  });
});

describe("Finding 5 — damage from the TARGET's status (T244)", () => {
  it("Fumungus deals damage proportional to accumulated enemy Poison, from a null base", () => {
    const fumungus = corpus.creatures.find((c) => c.id === Species.Fumungus && c.level === 2)!;
    expect(fumungus.publishedCast?.damage ?? null, "base damage is null; all of it comes from the target").toBeNull();

    // Paired with a Poison applier so stacks accumulate.
    const r = simulate(
      team([
        { id: Species.Fumungus, slot: { row: GridRow.Front, col: 0 }, level: 2 },
        { id: Species.Miasmaw, slot: { row: GridRow.Front, col: 1 } },
      ]),
      corpus,
    );
    const hits = r.timeline.filter((e) => e.kind === TimelineEventKind.Attack && e.damage !== undefined);
    expect(hits.length).toBeGreaterThan(1);
    // It GROWS, because Poison stacks only ever accumulate — the finding's central claim.
    expect(hits[hits.length - 1]!.damage!).toBeGreaterThan(hits[0]!.damage!);
  });
});

describe("Finding 7b — a reaction must not consume the reactor's cooldown (T245)", () => {
  it("Puffloon reacts AND still casts on its own cycle", () => {
    // The capture: through a four-hit cascade Puffloon's bar "climbs monotonically with no reset",
    // and it later cast off its own 10s cycle. Before this round the engine rescheduled the
    // reactor, so a reaction consumed the cast it should have been additional to.
    const r = simulate(
      team([
        { id: Species.Puffloon, slot: { row: GridRow.Back, col: 1 }, level: 2 },
        { id: Species.Miasmaw, slot: { row: GridRow.Back, col: 2 } },
      ], 30),
      corpus,
    );
    const puffloonCasts = r.timeline.filter(
      (e) => e.kind === TimelineEventKind.Attack && e.sourceSlot.row === GridRow.Back && e.sourceSlot.col === 1,
    );
    const base = corpus.creatures.find((c) => c.id === Species.Puffloon && c.level === 2)!.baseCooldownSeconds!;
    // More casts than its own cooldown alone could produce in the window — the reactions are extra.
    expect(puffloonCasts.length).toBeGreaterThan(Math.floor(30 / base));
  });
});

describe("Finding 1 — phase ordering (T242)", () => {
  it("a battle-start ability that reads allies sums their POST-multiplier values", () => {
    // The mechanism, on synthetic values. The captured board itself cannot be reproduced
    // end-to-end (research.md N8): it needs four run modifiers nothing models, and two terms of the
    // handoff's own decomposition do not reproduce from our corpus. Pinning 1080 would encode a
    // guess as a fixture.
    const resolved = resolveEffects(
      team([
        { id: Species.Miasmaw, slot: { row: GridRow.Front, col: 1 } },
        { id: Species.Cobrex, slot: { row: GridRow.Front, col: 2 } },
      ]),
      corpus,
    );
    const miasmaw = resolved.find((r) => r.creature.id === Species.Miasmaw)!;
    const cobrex = resolved.find((r) => r.creature.id === Species.Cobrex)!;
    const cobrexPoison = cobrex.appliesStatus.find((s) => s.type === "Poison")!.amount;
    const miasmawPoison = miasmaw.appliesStatus.find((s) => s.type === "Poison")!.amount;
    // Miasmaw's own 10 plus its ally's resolved (not base) total.
    expect(miasmawPoison).toBe(10 + cobrexPoison);
  });
});
