/**
 * Derives `manualTrigger` tags from ability text (2026-10-07).
 *
 * These are repeatable permanent stat gains whose trigger the BATTLE ENGINE cannot fire — buying a
 * monster, using an item, winning a round. They are real abilities with real numbers; the engine
 * simply has no hook, so the UI offers a button to bank each occurrence instead.
 *
 * Derived from text rather than hand-listed so that per-level magnitudes are right (Craghorn is
 * +20/+40/+60/+120 by level) and so adding a creature means adding a pattern, not an entry.
 *
 * Creatures whose trigger the engine DOES fire are skipped: a button for those would let the user
 * bank a bonus the simulation is already applying, doubling it. The check is
 * `TRIGGER_DEFINITIONS[...].enginePropagated` plus "does it already carry a resolvable tag", so the
 * rule lives in one place rather than in a skip-list here.
 *
 * Usage: node scripts/tag-manual-triggers.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "src/data/creatures.ts";
let src = readFileSync(FILE, "utf8");

const STAT = {
  damage: "damageFlatAdd",
  burn: "burnAmountAdd",
  poison: "poisonAmountAdd",
  shock: "shockAmountAdd",
  shield: "shieldAmountAdd",
  multicast: "multicastAdd",
};

/**
 * Each rule yields `{ trigger, effects }` from one creature's ability text.
 * `effects` is a list of `{ stat, amount }`.
 */
const RULES = [
  {
    id: "craghorn",
    // "+20 Damage and Shield" — ONE amount covering both stats, not "+20 Damage and +20 Shield".
    re: /^When you use an item, this gains \+(\d+) Damage and Shield\.$/i,
    build: (m) => ({ trigger: "On Item Used", effects: [["damage", +m[1]], ["shield", +m[1]]] }),
  },
  {
    id: "cawnushi",
    re: /^On Knockout of any monster, this gains \+(\d+) (\w+) permanently\.$/i,
    build: (m) => ({ trigger: "On Knockout", effects: [[m[2].toLowerCase(), +m[1]]] }),
  },
  {
    id: "emburn",
    re: /^On Knockout of this or an ally, this gains \+(\d+) (\w+) permanently\.$/i,
    build: (m) => ({ trigger: "On Knockout", effects: [[m[2].toLowerCase(), +m[1]]] }),
  },
  {
    id: "guardiant",
    re: /^After you buy a \w+ monster, this gains \+(\d+) (\w+)\.$/i,
    build: (m) => ({ trigger: "On Bought", effects: [[m[2].toLowerCase(), +m[1]]] }),
  },
  {
    id: "dollhime",
    re: /^\+(\d+) (\w+) permanently\.$/i,
    build: (m) => ({ trigger: "On Trinket Gained", effects: [[m[2].toLowerCase(), +m[1]]] }),
  },
  {
    id: "vipair",
    re: /^\+(\d+) (\w+) permanently\.$/i,
    build: (m) => ({ trigger: "On Trinket Gained", effects: [[m[2].toLowerCase(), +m[1]]] }),
  },
  {
    id: "ratacomb",
    re: /^\+(\d+) (\w+) permanently\.$/i,
    build: (m) => ({ trigger: "On Knocked Out", effects: [[m[2].toLowerCase(), +m[1]]] }),
  },
  {
    id: "brawlmantis",
    re: /^This and \w+ allies gain \+(\d+) (\w+) permanently\.$/i,
    build: (m) => ({ trigger: "On Victory", effects: [[m[2].toLowerCase(), +m[1]]] }),
  },
  {
    id: "kickrane",
    re: /^This and all your allies gain \+(\d+) (\w+) permanently\.$/i,
    build: (m) => ({ trigger: "On Victory", effects: [[m[2].toLowerCase(), +m[1]]] }),
  },
];

let tagged = 0;
const touched = new Set();

for (const rule of RULES) {
  const blockRe = new RegExp(
    `(\\n    id: "${rule.id}",[\\s\\S]*?)(\\n    abilityTags: )(\\[\\]|\\[[\\s\\S]*?\\n    \\])`,
    "g",
  );
  src = src.replace(blockRe, (whole, head, key, existing) => {
    const t = /abilityText:\s*\n?\s*"((?:[^"\\]|\\.)*)"/.exec(head);
    if (!t) return whole;
    const m = rule.re.exec(t[1].replace(/\\n/g, " ").trim());
    if (!m) return whole;

    const { trigger, effects } = rule.build(m);
    const mapped = effects.map(([word, amount]) => {
      const stat = STAT[word];
      if (!stat) throw new Error(`${rule.id}: no ModifierStat for "${word}"`);
      return `{ stat: "${stat}", amount: ${amount} }`;
    });
    const tag =
      `{ kind: "manualTrigger", trigger: "${trigger}", effects: [${mapped.join(", ")}] }`;

    tagged++;
    touched.add(rule.id);
    const inner = existing === "[]" ? "" : existing.slice(1, -1).replace(/\s+$/, "") + ",\n";
    return `${head}${key}[\n${inner}      ${tag},\n    ]`;
  });
}

writeFileSync(FILE, src);
console.log(`records tagged: ${tagged} across ${touched.size} species`);
console.log([...touched].sort().join(", "));
