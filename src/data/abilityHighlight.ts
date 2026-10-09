import { KEYWORD_MECHANIC_COLOR, STAT_COLORS } from "./statColors";
import { TYPE_COLORS } from "./typeColors";
import { ABILITY_TRIGGERS } from "./triggers";
import { ELEMENT_CREATURE_TYPES } from "./vocabularies";
import { StatColorKey } from "./enums";
import type { CreatureType } from "./types";

/**
 * Ability-text keyword highlighting (2026-10-07, round 7 WI-007 / FR-115).
 *
 * The game colours keywords inside an ability's prose, in place. This app rendered the whole string
 * as one grey `<p>`, so a card said "this gains +20 Damage and Shield" in a single flat colour while
 * the stat badges six pixels above it were pink and tan.
 *
 * ## A pure tokeniser, not a component
 *
 * Returning data rather than JSX keeps the keyword vocabulary next to `STAT_COLORS` — Principle
 * VII's "any value rendered in more than one place goes through one shared formatter" — and makes
 * the hard part (the matching) testable without rendering anything.
 *
 * ## Three rules, each read off the corpus rather than assumed
 *
 * 1. **Longest match first.** "Cooldown Speed" contains "Cooldown"; matching greedily short would
 *    colour half a phrase. Enforced by sorting the alternation by pattern length, so adding a
 *    keyword cannot quietly break an existing longer one.
 * 2. **The sign and number join the run.** The game colours "+20 Damage" entire, not just the word.
 *    Craghorn's card is the proof that this is per-keyword and not per-card: "this gains +20 Damage
 *    and Shield" renders the first run pink and the second tan, in one sentence.
 * 3. **Three tiers.** Output stats take their `STAT_COLORS` hue; mechanic nouns (Evolve, Knockout,
 *    Trinket, Protect, HP…) take one amber; a typing named in the prose takes its `TYPE_COLORS` hue.
 *    225 of 543 ability texts contain no stat term at all, so a stat-only vocabulary would leave a
 *    visible minority of cards flat against an ask that says "all mon's ability text".
 *
 * ## The typing tier's colours are an original choice, and that is a real difference
 *
 * `STAT_COLORS` are the game's published values, cross-checked against in-game captures. The game
 * colours typings in its ability text too — Chef's card reads "Your single-typed monsters gain
 * <Fire> typing. Your <Fire> monsters have <+2 Burn>." with all three runs coloured — so the TIER is
 * a corpus fact. The hues are not: `TYPE_COLORS` says plainly that no official type palette is
 * published and that its values were chosen for this app's dark background. So one sentence can now
 * mix a cited colour with an invented one, which is a weaker footing than the rest of this file
 * stands on, and the fix if it ever matters is to sample the game rather than to adjust to taste.
 *
 * ## What it reaches, measured
 *
 * Re-measured 2026-10-08 over all 564 texts this now renders — 541 creature records with real
 * ability text plus the 23 trainers. Every creature record gets at least one coloured run, and 98
 * of the 564 carry a typing. The single text that stays entirely flat is Lucky Girl's "SHINY
 * monsters are more likely to appear.", which names no stat, no mechanic and no typing; whether the
 * game gives SHINY a colour of its own is unverified, so nothing is invented for it here.
 */

/**
 * Which tier a run belongs to. The three are distinguishable at runtime because their value spaces
 * do not overlap: `StatColorKey` is lowercase (`"damage"`), a `CreatureType` is capitalised
 * (`"Fire"`), and `"mechanic"` is itself.
 */
export type RunColorKey = StatColorKey | "mechanic" | CreatureType;

/** One span of ability text: `colorKey` present means "render this coloured". */
export interface AbilityTextRun {
  readonly text: string;
  /** A stat hue, a typing's hue, `"mechanic"`, or absent for plain prose. */
  readonly colorKey?: RunColorKey;
}

/**
 * The keyword vocabulary. `pattern` is a regex source fragment, so a term can carry its own
 * inflections ("Evolves?") without the caller knowing which ones.
 *
 * Tier is implied by `colorKey`: a `StatColorKey` is an output stat, `"mechanic"` is a mechanic noun.
 */
const KEYWORDS: { pattern: string; colorKey: RunColorKey }[] = [
  // --- tier 1: output stats, coloured as their badges are ---
  // "Cooldown Speed" must outrank any future "Cooldown" entry; the sort below guarantees it, but
  // the adjacency is called out because this is the pair that motivated rule 1.
  { pattern: "Cooldown Speed", colorKey: StatColorKey.Cooldown },
  { pattern: "Multicast", colorKey: StatColorKey.Multicast },
  { pattern: "Damage", colorKey: StatColorKey.Damage },
  // Lowercase "damage" appears in two records ("Deals 3 direct damage every 2.5 seconds"); matching
  // is case-insensitive, so one entry covers both.
  { pattern: "Shield", colorKey: StatColorKey.Shield },
  { pattern: "Burn", colorKey: StatColorKey.Burn },
  { pattern: "Poison", colorKey: StatColorKey.Poison },
  { pattern: "Shock", colorKey: StatColorKey.Shock },
  { pattern: "Heal", colorKey: StatColorKey.Heal },

  // --- tier 2: mechanic nouns ---
  { pattern: "Sell Value", colorKey: "mechanic" },
  { pattern: "Knockout", colorKey: "mechanic" },
  { pattern: "Trinkets?", colorKey: "mechanic" },
  { pattern: "Evolves?", colorKey: "mechanic" },
  { pattern: "Berries", colorKey: "mechanic" },
  { pattern: "Protect", colorKey: "mechanic" },
  { pattern: "Ongoing", colorKey: "mechanic" },
  { pattern: "Charge", colorKey: "mechanic" },
  { pattern: "Trigger(?:s|ed)?", colorKey: "mechanic" },
  { pattern: "HP", colorKey: "mechanic" },
  { pattern: "level", colorKey: "mechanic" },
  // "day" is NOT here, and the omission is deliberate (2026-10-08). It was added on the assumption
  // that a unit of run time is a mechanic noun; the in-game trainer cards leave it plain — "Gain a
  // random Water monster each day." colours the typing and nothing else — so it was colouring a
  // word the game does not. Evidence over inference, the same rule `shield` was corrected under.
  { pattern: "shop", colorKey: "mechanic" },
  // "Cooldown" alone is a real stat and appears without "Speed" ("increase this monster's Cooldown
  // by 6"). It MUST lose to "Cooldown Speed", which the length sort guarantees — this pair is the
  // whole reason rule 1 exists.
  { pattern: "Cooldown", colorKey: StatColorKey.Cooldown },
  { pattern: "debuffs?", colorKey: "mechanic" },
  { pattern: "stacks?", colorKey: "mechanic" },

  // --- tier 2, continued: trigger names appearing INSIDE the prose ---
  // "Activate the On Battle Start abilities of adjacent allies" names a trigger mid-sentence, and
  // the game colours a trigger label amber. Derived from the registry rather than hand-listed, so a
  // new trigger is highlighted without an edit here — the same single-declaration rule the round is
  // about, applied to its own keyword list.
  ...ABILITY_TRIGGERS.map((trigger) => ({ pattern: trigger, colorKey: "mechanic" as const })),
];

/**
 * Tier 3: typings, matched WITHOUT the adjacent-quantity rule the other two tiers use.
 *
 * Derived from the type registry for the same reason the triggers are: a thirteenth element would
 * otherwise be highlighted everywhere except here. `ELEMENT_CREATURE_TYPES` and not every
 * `CreatureType`, because "All" and "NULL" are ordinary words that appear in prose meaning
 * something else ("Disable abilities of all Ongoing monsters in this row").
 *
 * Kept out of `KEYWORDS` because rule 2 is wrong for a typing. A number beside a stat is that
 * stat's amount, so "Poison 1" is one run — but a number beside a typing counts MONSTERS, not
 * typing: in "if you have exactly 1 Fighting monster on your team" the 1 belongs to "monster", and
 * folding it into the coloured run would say the card grants one Fighting. Two records in the
 * corpus put a digit next to a type name, and both read that way.
 */
const TYPINGS: { pattern: string; colorKey: RunColorKey }[] = ELEMENT_CREATURE_TYPES.map(
  (type) => ({ pattern: type, colorKey: type }),
);

/** A signed, optionally fractional, optionally percentage quantity: `+15%`, `-20`, `2.5`. */
const QUANTITY = String.raw`[+\-]?\d+(?:\.\d+)?%?`;

/**
 * Longest pattern first, so a shorter keyword can never claim a prefix of a longer phrase. Sorted
 * rather than hand-ordered because hand-ordering is the kind of invariant that survives exactly
 * until someone appends to the list.
 */
const byLengthDesc = <T extends { pattern: string }>(list: readonly T[]): T[] =>
  [...list].sort((a, b) => b.pattern.length - a.pattern.length);

const ALTERNATION = byLengthDesc(KEYWORDS)
  .map((k) => k.pattern)
  .join("|");

const TYPE_ALTERNATION = byLengthDesc(TYPINGS)
  .map((t) => t.pattern)
  .join("|");

/**
 * A keyword run: the keyword, plus an immediately adjacent quantity on either side.
 *
 * Both sides are allowed because the corpus writes it both ways — "+30 Shield" and "Poison 1" — and
 * `\b` anchors keep "day" out of the middle of a longer word.
 */
/**
 * Gold, which is written as a bare sigil rather than a word: "Gain $1.", "+$2 Sell Value".
 *
 * It needs its own alternative because every other keyword is `\b`-anchored, and `$` is not a word
 * character — a word boundary before it would require a preceding letter. Three records say nothing
 * else highlightable, so without this they stay entirely grey.
 */
const GOLD = String.raw`\$\d+`;

/**
 * The stat/mechanic branch comes FIRST, so where the two tiers could both claim a span the
 * quantity-bearing one wins and the typing branch sees only what is left.
 */
const RUN = new RegExp(
  String.raw`(?:${QUANTITY}\s+)?\b(?:${ALTERNATION})\b(?:\s+${QUANTITY})?|\b(?:${TYPE_ALTERNATION})\b|${GOLD}`,
  "gi",
);

/** Which colour a run resolves to, by matching the same patterns the alternation was built from. */
function colorKeyFor(run: string): RunColorKey | undefined {
  if (new RegExp(GOLD).test(run)) return "mechanic";
  for (const keyword of byLengthDesc([...KEYWORDS, ...TYPINGS])) {
    if (new RegExp(String.raw`\b(?:${keyword.pattern})\b`, "i").test(run)) return keyword.colorKey;
  }
  return undefined;
}

/**
 * Splits ability text into coloured and plain runs.
 *
 * Concatenating the returned `text` values reproduces the input **exactly** — asserted over all 543
 * records with ability text, because a highlighter that drops or duplicates a character is worse
 * than one that colours nothing.
 */
export function tokenizeAbilityText(text: string): AbilityTextRun[] {
  const runs: AbilityTextRun[] = [];
  let cursor = 0;

  for (const match of text.matchAll(RUN)) {
    const start = match.index;
    const matched = match[0];
    if (start > cursor) runs.push({ text: text.slice(cursor, start) });
    const colorKey = colorKeyFor(matched);
    runs.push(colorKey ? { text: matched, colorKey } : { text: matched });
    cursor = start + matched.length;
  }

  if (cursor < text.length) runs.push({ text: text.slice(cursor) });
  return runs;
}

/** The CSS colour a run renders in, or `undefined` for plain prose. */
export function runColor(run: AbilityTextRun): string | undefined {
  if (run.colorKey === undefined) return undefined;
  if (run.colorKey === "mechanic") return KEYWORD_MECHANIC_COLOR;
  return STAT_COLORS[run.colorKey as StatColorKey] ?? TYPE_COLORS[run.colorKey as CreatureType];
}
