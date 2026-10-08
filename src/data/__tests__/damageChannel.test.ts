import { describe, expect, it } from "vitest";
import { creatures } from "../creatures";
import { corpus, applyShinyOverlay } from "../corpus";
import { SHINY_STATS } from "../shiny";
import { DamageChannel } from "../enums";

/**
 * `publishedCast` — one optional field instead of two nullable ones (2026-10-07, round 7 WI-004).
 *
 * The ask was "damageType is also just either null or 'Direct', which I'm not sure how we should
 * handle this… propose a reasonable change". The measurement answered it: across all 596 records
 * `damageType` was `null` exactly when `baseDamage` was `null`, zero exceptions either way. The pair
 * stored ONE fact in two places, with four representable combinations of which two were legal.
 *
 * The previous version of this file pinned that correlation with a test, which is the right move
 * while a restructure is deferred. **It is no longer needed**: the illegal state is now
 * unrepresentable rather than merely unobserved, and a test asserting two fields agree cannot be
 * written against a shape that has one field. These tests assert the new invariant instead.
 */
describe("WI-004: the illegal state is gone, not guarded", () => {
  it("has no record carrying a damage without a channel, by construction", () => {
    // Not an assertion about the data so much as a demonstration of the shape: `publishedCast` is
    // present with BOTH fields, or absent. There is no third option to test for.
    for (const c of creatures) {
      if (c.publishedCast === undefined) continue;
      expect(typeof c.publishedCast.damage, `${c.id} L${c.level}`).toBe("number");
      expect(Object.values(DamageChannel)).toContain(c.publishedCast.channel);
    }
  });

  it("preserves the measured split exactly: 356 records with a cast, 240 without", () => {
    // The same two numbers the old correlation test reported, which is the evidence that the
    // migration changed representation and not meaning. 356 + 240 = 596.
    const withCast = creatures.filter((c) => c.publishedCast !== undefined);
    const without = creatures.filter((c) => c.publishedCast === undefined);
    expect(withCast.length).toBe(356);
    expect(without.length).toBe(240);
    expect(withCast.length + without.length).toBe(creatures.length);
  });

  it("uses only Direct on records, so the other channels stay hit-side", () => {
    // The user's "just null or Direct" was right about the RECORD and wrong about the type: Burn,
    // Poison and Shock are alive at runtime on `TimelineEvent` and in `shield.ts`'s status-vs-shield
    // branch. One type was doing two jobs, which is why it looked half-empty.
    const channels = new Set(creatures.map((c) => c.publishedCast?.channel).filter(Boolean));
    expect([...channels]).toEqual([DamageChannel.Direct]);
  });

  it("drops 'SuddenDeath', which no record and no runtime site ever produced", () => {
    // research.md P2 retracted the sudden-death claim it was added for; this was its type-level
    // residue.
    expect(Object.values(DamageChannel)).not.toContain("SuddenDeath");
  });
});

describe("WI-004: the shiny override is now atomic", () => {
  /**
   * The quiet argument that made this restructure worth doing rather than deferring.
   *
   * `ShinyStatLine` publishes a damage NUMBER and no channel. Under the old pair, a shiny line could
   * set `baseDamage` while leaving `damageType` as the normal record's value — producing damage with
   * a mismatched or missing channel, the exact state the pair was meant to exclude. It held together
   * only because the UI read `damage` and ignored `damageType`. So the invariant was true by luck on
   * that path, not by construction.
   */
  it("still has no channel on the shiny stat line, which is why this needed deciding once", () => {
    const lines = Object.values(SHINY_STATS);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((s) => s.baseDamage !== null)).toBe(true);
    expect(lines.every((s) => !("damageType" in s))).toBe(true);
  });

  it("gives a shiny cast a channel, never a damage without one", () => {
    const shinies = corpus.creatures
      .map((c) => applyShinyOverlay(c, true))
      .filter((c): c is NonNullable<typeof c> => c !== null);

    expect(shinies.length).toBeGreaterThan(0);
    for (const s of shinies) {
      if (s.publishedCast === undefined) continue;
      expect(s.publishedCast.channel, `${s.id} L${s.level} shiny has no channel`).toBeDefined();
    }
  });

  it("drops the cast entirely when the shiny line publishes no damage", () => {
    // Shiny can be a DOWNGRADE for a handful of species, so a shiny line with `baseDamage: null`
    // against a normal record that has a cast must remove it rather than keep the normal number.
    const id = Object.keys(SHINY_STATS).find((k) => SHINY_STATS[k]!.baseDamage === null);
    if (id === undefined) return; // nothing to check in this corpus revision
    const [species, level] = id.split("|");
    const base = corpus.creatures.find((c) => c.id === species && c.level === Number(level))!;
    expect(applyShinyOverlay(base, true)!.publishedCast).toBeUndefined();
  });
});
