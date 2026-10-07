import { describe, expect, it } from "vitest";
import { creatures } from "../creatures";
import { SHINY_STATS } from "../shiny";
import { DAMAGE_CHANNEL } from "../vocabularies";

/**
 * `damageType` on a record is redundant (2026-10-07, round 7 WI-004 / FR-111).
 *
 * The ask was "damageType is also just either null or 'Direct', which I'm not sure how we should
 * handle this… propose a reasonable change". The measurement is the answer, and it is stronger than
 * the observation: the field is not merely sparse, it is **derivable**. Over all 596 records,
 * `damageType === null` exactly when `baseDamage === null`, with zero exceptions in either
 * direction, so storing it encodes nothing.
 *
 * The recommended fix is to make the illegal state unrepresentable — one optional
 * `publishedCast?: { damage, channel }` instead of two nullable fields that must agree. That
 * restructure is **deferred**: it reaches `ModifiableBase`, `PerCastOutput`,
 * `perCreatureEffectiveStats`, the card's output band, ~15 engine fixtures and ~1,200 field
 * occurrences across `creatures.ts` and `shiny.ts`.
 *
 * **This file is what makes deferring it safe rather than merely stated.** While the two fields
 * coexist they cannot begin to disagree: the moment a record sets one without the other, this fails
 * and the restructure has evidence behind it instead of an argument.
 */
describe("WI-004: the (baseDamage, damageType) pair cannot start disagreeing", () => {
  it("has damageType null exactly when baseDamage is null, across every record", () => {
    const disagreeing = creatures
      .filter((c) => (c.damageType === null) !== (c.baseDamage === null))
      .map((c) => `${c.id} L${c.level}: baseDamage=${c.baseDamage}, damageType=${c.damageType}`);

    // If this ever fails, the pair has started encoding two different facts and
    // `publishedCast` is no longer a refactor but a correctness fix. See research.md R3.
    expect(disagreeing).toEqual([]);
  });

  it("notes that the SHINY overrides carry baseDamage and NO damageType", () => {
    /*
     * A second, quieter argument for `publishedCast`. `ShinyStatLine` overrides `baseDamage` and has
     * no `damageType` field at all, so a shiny line that gives damage to a species whose normal
     * record has none produces exactly the state the pair is supposed to exclude: damage present,
     * channel absent. Nothing breaks today because the overlay leaves `damageType` as the normal
     * record's value and the UI reads only `damage`, but it means the "they always agree" invariant
     * above holds by luck on this path rather than by construction.
     *
     * One optional `publishedCast` would make the shiny override replace the pair atomically, which
     * is the strongest practical reason to land the restructure rather than keep the guard.
     */
    const lines = Object.values(SHINY_STATS).flat();
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((s) => s.baseDamage !== undefined)).toBe(true);
    expect(lines.every((s) => !("damageType" in s))).toBe(true);
  });

  it("uses only Direct on records, so the other channels are hit-side only", () => {
    // The user's "just null or Direct" is right about the RECORD and wrong about the type: Burn,
    // Poison and Shock are alive at runtime on `TimelineEvent` and in `shield.ts`'s status-vs-shield
    // branch. One type was doing two jobs, which is why it looked half-empty.
    const channels = new Set(creatures.map((c) => c.damageType).filter((d) => d !== null));
    expect([...channels]).toEqual(["Direct"]);
  });

  it("counts the split, so the redundancy claim is a number and not an impression", () => {
    const direct = creatures.filter((c) => c.damageType === "Direct").length;
    const none = creatures.filter((c) => c.damageType === null).length;
    expect(direct).toBe(356);
    expect(none).toBe(240);
    expect(direct + none).toBe(creatures.length);
  });
});

describe("WI-004: the channel vocabulary is the hit-side one", () => {
  it("declares exactly the four channels that actually occur", () => {
    expect(Object.keys(DAMAGE_CHANNEL)).toEqual(["Direct", "Burn", "Poison", "Shock"]);
  });

  it('no longer declares "SuddenDeath"', () => {
    // It appeared in no record and at no runtime site, and research.md P2 retracted the sudden-death
    // claim it was added for -- it was the type-level residue of a retracted finding.
    expect(Object.keys(DAMAGE_CHANNEL)).not.toContain("SuddenDeath");
  });
});
