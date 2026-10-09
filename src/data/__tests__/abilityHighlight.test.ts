import { describe, expect, it } from "vitest";
import { allCreatureRecords, getCreatureByIdAndLevel, getTrainerById } from "../corpus";
import { trainers } from "../trainers";
import { hasAbilityText } from "../display";
import { runColor, tokenizeAbilityText, type AbilityTextRun } from "../abilityHighlight";
import { STAT_COLORS } from "../statColors";
import { TYPE_COLORS } from "../typeColors";
import { CreatureType, StatColorKey } from "../enums";
import { Species, TrainerId } from "../ids";

/**
 * Ability-text keyword highlighting (2026-10-07, round 7 WI-007 / FR-115).
 *
 * The ask is "for all mon's ability text, keywords are colored in-line", with three in-game cards as
 * the reference. These tests pin the reference cards, the two matching rules that are easy to get
 * subtly wrong, and — the important one — that highlighting never alters the text it highlights.
 */

const withText = allCreatureRecords().filter((c) => hasAbilityText(c.abilityText));
const coloured = (runs: AbilityTextRun[]) => runs.filter((r) => r.colorKey !== undefined);
const render = (text: string) =>
  tokenizeAbilityText(text)
    .map((r) => (r.colorKey ? `[${r.text}|${r.colorKey}]` : r.text))
    .join("");

describe("tokenizeAbilityText — the reference cards from the ask", () => {
  it("colours Shikitsune's '+15% Cooldown Speed' as ONE run, sign and percent included", () => {
    const c = getCreatureByIdAndLevel(Species.Shikitsune, 1)!;
    expect(render(c.abilityText)).toBe(
      "Knocked-out allies are revived and gain [+15% Cooldown Speed|cooldown] for this battle.",
    );
  });

  it("colours Pebbler's '+15 Shield' in the Shield colour", () => {
    const c = getCreatureByIdAndLevel(Species.Pebbler, 1)!;
    const runs = coloured(tokenizeAbilityText(c.abilityText));
    expect(runs).toEqual([{ text: "+15 Shield", colorKey: StatColorKey.Shield }]);
    expect(runColor(runs[0]!)).toBe(STAT_COLORS.shield);
  });

  it("colours Craghorn's two keywords DIFFERENTLY in one sentence", () => {
    // This card is the proof that highlighting is per-keyword rather than per-card: the game renders
    // "+20 Damage" pink and "Shield" tan inside the same sentence.
    const c = getCreatureByIdAndLevel(Species.Craghorn, 1)!;
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

/**
 * The typing tier (2026-10-08).
 *
 * Added from a user screenshot of the in-game Chef card, which colours both occurrences of "Fire"
 * as well as "+2 Burn" — our card had the Burn run and left the typings grey.
 */
describe("tokenizeAbilityText — typings", () => {
  it("renders Chef's card as the game does: both typings AND the status", () => {
    const chef = getTrainerById(TrainerId.Chef)!;
    expect(render(chef.abilityText)).toBe(
      "Your single-typed monsters gain [Fire|Fire] typing. Your [Fire|Fire] monsters have [+2 Burn|burn].",
    );
  });

  it("does NOT swallow a number beside a typing, because it counts monsters", () => {
    // The mirror of "applies 1 Shock", and the reason typings are matched without the quantity
    // rule: here the 1 belongs to "monster", so colouring "1 Fighting" would read as an amount of
    // Fighting granted.
    const runs = coloured(
      tokenizeAbilityText("if you have exactly 1 Fighting monster on your team, activate it."),
    );
    expect(runs.map((r) => r.text)).toEqual(["Fighting"]);
  });

  it("leaves the non-element type labels alone", () => {
    // "All" and "NULL" are `CreatureType`s, but as prose they are ordinary words — this sentence is
    // from the corpus, and its "all" is a quantifier.
    expect(render("Disable abilities of all Ongoing monsters in this row.")).toBe(
      "Disable abilities of all [Ongoing|mechanic] monsters in this row.",
    );
  });

  it("colours a typing in creature text too, not just trainers", () => {
    expect(render("Adjacent Water allies gain +25 Heal permanently.")).toBe(
      "Adjacent [Water|Water] allies gain [+25 Heal|heal] permanently.",
    );
  });
});

describe("tokenizeAbilityText — a count coloured without its noun", () => {
  it("colours the number of rerolls, and nothing else on the card", () => {
    // Youngster, read off an in-game capture (2026-10-08): the digit is coloured and "rerolls" is
    // not. Three records in the whole corpus take this shape — this one, the Reroll Token trinket's
    // "Gain 10 free rerolls." and an item's "Gain 1 free reroll." — and the adjective between the
    // number and the noun is why the ordinary adjacent-quantity rule cannot express it.
    const youngster = getTrainerById(TrainerId.Youngster)!;
    expect(render(youngster.abilityText)).toBe("Gain [3|mechanic] free rerolls every day.");
  });

  it("leaves numbers that count anything ELSE plain", () => {
    // The narrowness is the point: this is a rule about rerolls, not about digits. If it widened
    // into "colour every number", these two would light up and the game does not light them up.
    expect(render("Trinket gifts only offer 2 choices, but you can take both of them.")).toBe(
      "[Trinket|mechanic] gifts only offer 2 choices, but you can take both of them.",
    );
    expect(render("On day 9, gain a Mythical monster and $30.")).toBe(
      "On day 9, gain a Mythical monster and [$30|mechanic].",
    );
  });
});

describe("tokenizeAbilityText — words the game leaves plain", () => {
  it("does not colour 'day'", () => {
    // It was in the mechanic tier on the assumption that a unit of run time is a mechanic noun.
    // The in-game Swim Coach card colours the typing and nothing else (2026-10-08), so this pins
    // the removal: re-adding "days?" turns a plain word amber on eight trainer cards.
    const swimCoach = getTrainerById(TrainerId.SwimCoach)!;
    expect(render(swimCoach.abilityText)).toBe("Gain a random [Water|Water] monster each day.");
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

  it("round-trips every TRAINER's ability text too", () => {
    // Trainers render through this since 2026-10-08, and their prose is a different shape from a
    // creature's — "$30", "shop rank +2", "1 rarity tier higher".
    const broken = trainers.filter(
      (t) => tokenizeAbilityText(t.abilityText).map((r) => r.text).join("") !== t.abilityText,
    );
    expect(broken.map((t) => t.id)).toEqual([]);
  });

  it("leaves a keywordless ability as a single plain run", () => {
    // "renders unchanged rather than degrade" — no empty spans, no changed spacing.
    const runs = tokenizeAbilityText("Identity otherwise unconfirmed.");
    expect(runs).toEqual([{ text: "Identity otherwise unconfirmed." }]);
  });

  it("does not mangle the flavour quote some abilities carry", () => {
    const c = getCreatureByIdAndLevel(Species.Bumblebolt, 1)!;
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
     * 541 of 541 — the ask ("for all mon's ability text") is now literally met.
     *
     * It read 542 of 543 until the holdout was investigated, and the holdout turned out not to be a
     * highlighting gap at all: `dewlotl`'s `abilityText` held a sourcing disclaimer rather than an
     * ability (research.md R7.4), which `hasAbilityText` accepted, so a provenance note was being
     * rendered as a creature's ability. Fixing the record dropped the denominator to 542 and the
     * exceptions to none. 2026-10-08: 541, after Venopuff's level 1 text was cleared — it published
     * no ability, and the line it carried merely restated its Poison stat.
     *
     * The previous version of this test pinned the holdout as an exact list precisely so that
     * fixing it would fail loudly rather than quietly stay true of some other creature. It did.
     */
    expect(withText.length).toBe(541);
    expect(bare.map((c) => c.id)).toEqual([]);
  });

  /**
   * Venopuff publishes NO ability at any level, and must keep publishing none.
   *
   * This is pinned because it has been undone three times. The level 1 record once held "Applies 4
   * Poison per cast.", which is not an ability — it is a restatement of `appliesStatus`, which the
   * card already renders as a stat. Clearing it drops the census above by one, so the failure
   * presents as two off-by-one count assertions, and the tempting fix is to put the text back
   * rather than to correct the counts. That is exactly the wrong direction, so it now fails here
   * too, by name, with the reason attached.
   */
  it("keeps Venopuff ability-text-free at every level", () => {
    for (const level of [1, 2, 3, 4] as const) {
      expect(getCreatureByIdAndLevel(Species.Venopuff, level)!.abilityText).toBe("");
    }
  });

  it("colours a typing from TYPE_COLORS, the same map the type chips use", () => {
    expect(runColor({ text: "Fire", colorKey: CreatureType.Fire })).toBe(TYPE_COLORS.Fire);
  });

  it("uses the stat badges' own palette, so text and badges cannot drift", () => {
    // Principle VII: one colour source. If these diverged, a card would show the same stat in two
    // different reds six pixels apart.
    expect(runColor({ text: "+20 Damage", colorKey: StatColorKey.Damage })).toBe(STAT_COLORS.damage);
    expect(runColor({ text: "Burn", colorKey: StatColorKey.Burn })).toBe(STAT_COLORS.burn);
    expect(runColor({ text: "plain" })).toBeUndefined();
  });
});
