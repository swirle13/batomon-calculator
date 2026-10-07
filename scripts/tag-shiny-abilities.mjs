/**
 * Derives shiny `abilityTags` from shiny ability text (T252b / FR-105).
 *
 * ## Why this is needed
 *
 * `ShinyStatLine` carried stats and (since T252) text, but resolution read the NORMAL tags — so a
 * shiny Bunchop displayed "+60 HP" while computing +50. The ask was explicit: "add all shiny
 * ability text to all mons **and use those in calculations**".
 *
 * ## Why re-running the taggers is the right approach
 *
 * Shiny text is overwhelmingly the normal text with different magnitudes ("+2 Burn" -> "+3 Burn").
 * So the same patterns that produced the normal tags produce the shiny ones, read off the shiny
 * string. Where a shiny ability differs structurally, no pattern matches and no tag is emitted —
 * the creature keeps its normal tags, which is strictly better than emitting a guess.
 *
 * Only species that ALREADY have normal tags are considered: this task is "make shiny match", not
 * "tag new creatures", and conflating the two would inflate the coverage counter with species whose
 * normal form is still unmodelled.
 *
 * Usage: node scripts/tag-shiny-abilities.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const STATUS = new Set(["Burn", "Poison", "Shock", "Shield"]);
const effectFor = (stat, amount) =>
  STATUS.has(stat)
    ? `statusGrant: { type: "${stat}", amount: ${amount} }`
    : stat === "Multicast"
      ? `statChange: { stat: "multicast", amount: ${amount} }`
      : `statChange: { stat: "damage", amount: ${amount} }`;

/** Same patterns as the normal taggers, applied to the shiny string. */
const PATTERNS = [
  [/^Give the ally above \+(\d+) (\w+) permanently\.$/,
    (m) => `{ kind: "buffOnCast", target: { kind: "above" }, effect: { ${effectFor(m[2], m[1])} } }`],
  [/^Adjacent Toxic allies gain \+(\d+) (\w+) for this battle\.$/,
    (m) => `{ kind: "buffOnCast", target: { kind: "adjacent", typeFilter: "Toxic" }, effect: { ${effectFor(m[2], m[1])} } }`],
  [/^\+(\d+) (Damage) (?:for this battle|permanently)\.$/,
    (m) => `{ kind: "buffOnCast", target: { kind: "self" }, effect: { ${effectFor(m[2], m[1])} } }`],
  [/^\+(\d+) (\w+) for this battle\.$/,
    (m) => `{ kind: "buffOnCast", target: { kind: "self" }, effect: { ${effectFor(m[2], m[1])} } }`],
  [/^When allies inflict (\w+), this gains \+(\d+) Damage permanently\.$/,
    (m) => `{ kind: "gainOnAllyStatus", status: "${m[1]}", stat: "damage", amount: ${m[2]} }`],
  [/^Has additional Damage equal to (\d+)% of the (\w+) stacks on the enemy\.$/,
    (m) => `{ kind: "statFromTargetStatus", status: "${m[2]}", multiplier: ${Number(m[1]) / 100} }`],
  [/^Gain (\w+) for this battle equal to ([\d.]+)x the total \1 of your allies\./,
    (m) => `{ kind: "battleStartStatusFromAllies", status: "${m[1]}", multiplier: ${m[2]} }`],
  [/^Whenever an ally inflicts (\w+), Charge this by (\d+) second/,
    (m) => `{ kind: "chargeOnAllyStatus", status: "${m[1]}", seconds: ${m[2]} }`],
];

const creatures = readFileSync("src/data/creatures.ts", "utf8");
// Species that already carry a non-empty abilityTags array somewhere.
const tagged = new Set();
for (const m of creatures.matchAll(/id: "([a-z0-9_]+)",[\s\S]{0,2500}?abilityTags: \[\n/g)) tagged.add(m[1]);

let src = readFileSync("src/data/shiny.ts", "utf8");
let added = 0, skipped = 0;
src = src.replace(/^(  "([a-z0-9_]+)\|(\d)": \{ )(.*?)(, abilityText: "((?:[^"\\]|\\.)*)")( \},)$/gm,
  (whole, head, id, _lvl, body, textPart, rawText, tail) => {
    if (!tagged.has(id)) return whole;
    const text = rawText.replace(/\\n/g, " ").replace(/\\"/g, '"').trim();
    for (const [re, build] of PATTERNS) {
      const m = re.exec(text);
      if (m) { added++; return `${head}${body}${textPart}, abilityTags: [${build(m)}]${tail}`; }
    }
    skipped++;
    return whole;
  });
writeFileSync("src/data/shiny.ts", src);
console.log(`shiny abilityTags derived: ${added} | tagged species with unmatched shiny text: ${skipped}`);
