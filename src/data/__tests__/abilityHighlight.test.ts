import { describe, expect, it } from "vitest";
import { corpus } from "../corpus";
import { hasAbilityText } from "../display";
import { runColor, tokenizeAbilityText, type AbilityTextRun } from "../abilityHighlight";
import { STAT_COLORS } from "../statColors";
import { StatColorKey } from "../enums";

/**
 * Ability-text keyword highlighting (2026-10-07, round 7 WI-007 / FR-115).
 *
 * The ask is "for all mon's ability text, keywords are colored in-line", with three in-game cards as
 * the reference. These tests pin the reference cards, the two matching rules that are easy to get
 * subtly wrong, and — the important one — that highlighting never alters the text it highlights.
 */

const withText = corpus.creatures.filter((c) => hasAbilityText(c.abilityText));
const coloured = (runs: AbilityTextRun[]) => runs.filter((r) => r.colorKey !== undefined);
const render = (text: string) =>
  tokenizeAbilityText(text)
    .map((r) => (r.colorKey ? `[${r.text}|${r.colorKey}]` : r.text))
    .join("");

describe("tokenizeAbilityText — the reference cards from the ask", () => {
  it("colours Shikitsune's '+15% Cooldown Speed' as ONE run, sign and percent included", () => {
    const c = corpus.creatures.find((x) => x.id === "shikitsune" && x.level === 1)!;
    expect(render(c.abilityText)).toBe(
      "Knocked-out allies are revived and gain [+15% Cooldown Speed|cooldown] for this battle.",
    );
  });

  it("colours Pebbler's '+15 Shield' in the Shield colour", () => {
    const c = corpus.creatures.find((x) => x.id === "pebbler" && x.level === 1)!;
    const runs = coloured(tokenizeAbilityText(c.abilityText));
    expect(runs).toEqual([{ text: "+15 Shield", colorKey: StatColorKey.Shield }]);
    expect(runColor(runs[0]!)).toBe(STAT_COLORS.shield);
  });

  it("colours Craghorn's two keywords DIFFERENTLY in one sentence", () => {
    // This card is the proof that highlighting is per-keyword rather than per-card: the game renders
    // "+20 Damage" pink and "Shield" tan inside the same sentence.
    const c = corpus.creatures.find((x) => x.id === "craghorn" && x.level === 1)!;
    expect(render(c.abilityText)).toBe(
      "When you use an item, this gains [+20 Damage|damage] and [Shield|shield].",
    );
  });
});

describe("tokenizeAbilityText — the two rules that are easy to get wrong", () => {
  it("prefers the LONGEST keyword, so 'Cooldown Speed' never splits", () => {
    // "Cooldown" is itself a keyword. Matched greedily short, this would colour "Cooldown" and leave
    // " Speed" grey — half a phrase.
    const runs = coloured(tokenizeAbilityText("+10% Cooldown Speed permanently."));
    expect(runs.map((r) => r.text)).toEqual(["+10% Cooldown Speed"]);
  });

  it("still colours a bare 'Cooldown', which the corpus also writes", () => {
    const runs = coloured(tokenizeAbilityText("increase this monster's Cooldown by 6 for this battle."));
    // Just the word: a quantity joins the run only when ADJACENT, and "by" sits between them.
    // Colouring "Cooldown by 6" would tint a preposition.
    expect(runs.map((r) => r.text)).toEqual(["Cooldown"]);
  });

  it("takes the quantity on whichever side the corpus wrote it", () => {
    expect(coloured(tokenizeAbilityText("+30 Shield"))[0]!.text).toBe("+30 Shield");
    expect(coloured(tokenizeAbilityText("applies 1 Shock"))[0]!.text).toBe("1 Shock");
  });

  it("does not match a keyword inside a longer word", () => {
    // `\b` anchors: "day" must not fire inside "Dayglow", nor "level" inside "levelled-up".
    expect(coloured(tokenizeAbilityText("Dayglow Sunday"))).toEqual([]);
  });
});

describe("tokenizeAbilityText — it must not change the text", () => {
  it("round-trips EVERY record with ability text, exactly", () => {
    // The assertion that matters most: a highlighter that drops or duplicates a character is worse
    // than one that colours nothing, and jsdom would not notice.
    const broken = withText.filter(
      (c) => tokenizeAbilityText(c.abilityText).map((r) => r.text).join("") !== c.abilityText,
    );
    expect(broken.map((c) => `${c.id} L${c.level}`)).toEqual([]);
  });

  it("leaves a keywordless ability as a single plain run", () => {
    // "renders unchanged rather than degrade" — no empty spans, no changed spacing.
    const runs = tokenizeAbilityText("Identity otherwise unconfirmed.");
    expect(runs).toEqual([{ text: "Identity otherwise unconfirmed." }]);
  });

  it("does not mangle the flavour quote some abilities carry", () => {
    const c = corpus.creatures.find((x) => x.id === "bumblebolt" && x.level === 1)!;
    // Its text ends `... applies 1 Shock. "The poster Common: 2.5s, Shock, cheap."` — concatenation
    // is covered above; this pins that the quote's own "Shock" is reached rather than swallowed.
    expect(c.abilityText).toContain('"The poster Common');
    expect(coloured(tokenizeAbilityText(c.abilityText)).length).toBeGreaterThan(1);
  });
});

describe("WI-007 coverage — stated, not implied", () => {
  it("colours at least one keyword in EVERY record with ability text", () => {
    const bare = withText.filter((c) => coloured(tokenizeAbilityText(c.abilityText)).length === 0);

    /*
     * 542 of 542 — the ask ("for all mon's ability text") is now literally met.
     *
     * It read 542 of 543 until the holdout was investigated, and the holdout turned out not to be a
     * highlighting gap at all: `dewlotl`'s `abilityText` held a sourcing disclaimer rather than an
     * ability (research.md R7.4), which `hasAbilityText` accepted, so a provenance note was being
     * rendered as a creature's ability. Fixing the record dropped the denominator to 542 and the
     * exceptions to none.
     *
     * The previous version of this test pinned the holdout as an exact list precisely so that
     * fixing it would fail loudly rather than quietly stay true of some other creature. It did.
     */
    expect(withText.length).toBe(542);
    expect(bare.map((c) => c.id)).toEqual([]);
  });

  it("uses the stat badges' own palette, so text and badges cannot drift", () => {
    // Principle VII: one colour source. If these diverged, a card would show the same stat in two
    // different reds six pixels apart.
    expect(runColor({ text: "+20 Damage", colorKey: StatColorKey.Damage })).toBe(STAT_COLORS.damage);
    expect(runColor({ text: "Burn", colorKey: StatColorKey.Burn })).toBe(STAT_COLORS.burn);
    expect(runColor({ text: "plain" })).toBeUndefined();
  });
});
