import { KEYWORD_MECHANIC_COLOR, STAT_COLORS, type StatColorKey } from "./statColors";
import { ABILITY_TRIGGERS } from "./triggers";

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
 * 3. **Two tiers.** Output stats take their `STAT_COLORS` hue; mechanic nouns (Evolve, Knockout,
 *    Trinket, Protect, HP…) take one amber. 225 of 543 ability texts contain no stat term at all, so
 *    a stat-only vocabulary would leave a visible minority of cards flat against an ask that says
 *    "all mon's ability text".
 *
 * ## What it reaches, measured
 *
 * 502 of the 543 records with real ability text get at least one coloured run. The remaining 41
 * carry no term in either tier — "Trigger this.", "Disable abilities of all Ongoing monsters in this
 * row." — and render exactly as before. That is the ask approached, not met, and the figure is
 * stated rather than implied.
 */

/** One span of ability text: `colorKey` present means "render this coloured". */
export interface AbilityTextRun {
  readonly text: string;
  /** A stat hue, `"mechanic"` for the second tier, or absent for plain prose. */
  readonly colorKey?: StatColorKey | "mechanic";
}

/**
 * The keyword vocabulary. `pattern` is a regex source fragment, so a term can carry its own
 * inflections ("Evolves?") without the caller knowing which ones.
 *
 * Tier is implied by `colorKey`: a `StatColorKey` is an output stat, `"mechanic"` is a mechanic noun.
 */
const KEYWORDS: { pattern: string; colorKey: StatColorKey | "mechanic" }[] = [
  // --- tier 1: output stats, coloured as their badges are ---
  // "Cooldown Speed" must outrank any future "Cooldown" entry; the sort below guarantees it, but
  // the adjacency is called out because this is the pair that motivated rule 1.
  { pattern: "Cooldown Speed", colorKey: "multicast" },
  { pattern: "Multicast", colorKey: "multicast" },
  { pattern: "Damage", colorKey: "damage" },
  // Lowercase "damage" appears in two records ("Deals 3 direct damage every 2.5 seconds"); matching
  // is case-insensitive, so one entry covers both.
  { pattern: "Shield", colorKey: "shield" },
  { pattern: "Burn", colorKey: "burn" },
  { pattern: "Poison", colorKey: "poison" },
  { pattern: "Shock", colorKey: "shock" },
  { pattern: "Heal", colorKey: "heal" },

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
  { pattern: "days?", colorKey: "mechanic" },
  { pattern: "shop", colorKey: "mechanic" },
  // "Cooldown" alone is a real stat and appears without "Speed" ("increase this monster's Cooldown
  // by 6"). It MUST lose to "Cooldown Speed", which the length sort guarantees — this pair is the
  // whole reason rule 1 exists.
  { pattern: "Cooldown", colorKey: "mechanic" },
  { pattern: "debuffs?", colorKey: "mechanic" },
  { pattern: "stacks?", colorKey: "mechanic" },

  // --- tier 2, continued: trigger names appearing INSIDE the prose ---
  // "Activate the On Battle Start abilities of adjacent allies" names a trigger mid-sentence, and
  // the game colours a trigger label amber. Derived from the registry rather than hand-listed, so a
  // new trigger is highlighted without an edit here — the same single-declaration rule the round is
  // about, applied to its own keyword list.
  ...ABILITY_TRIGGERS.map((trigger) => ({ pattern: trigger, colorKey: "mechanic" as const })),
];

/** A signed, optionally fractional, optionally percentage quantity: `+15%`, `-20`, `2.5`. */
const QUANTITY = String.raw`[+\-]?\d+(?:\.\d+)?%?`;

/**
 * Longest pattern first, so a shorter keyword can never claim a prefix of a longer phrase. Sorted
 * rather than hand-ordered because hand-ordering is the kind of invariant that survives exactly
 * until someone appends to the list.
 */
const ALTERNATION = [...KEYWORDS]
  .sort((a, b) => b.pattern.length - a.pattern.length)
  .map((k) => k.pattern)
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

const RUN = new RegExp(
  String.raw`(?:${QUANTITY}\s+)?\b(?:${ALTERNATION})\b(?:\s+${QUANTITY})?|${GOLD}`,
  "gi",
);

/** Which colour a run resolves to, by matching the same patterns the alternation was built from. */
function colorKeyFor(run: string): StatColorKey | "mechanic" | undefined {
  if (new RegExp(GOLD).test(run)) return "mechanic";
  for (const keyword of [...KEYWORDS].sort((a, b) => b.pattern.length - a.pattern.length)) {
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
  return run.colorKey === "mechanic" ? KEYWORD_MECHANIC_COLOR : STAT_COLORS[run.colorKey];
}
