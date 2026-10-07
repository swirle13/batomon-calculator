/**
 * Tags the three mons the gameplay capture found inert (T246).
 *
 * The handoff says four; it is three. Noxnimbus was tagged in round 11 and resolves at every level
 * — the handoff's board table predates that (research.md N6). Reporting four would overstate the
 * coverage delta, which is the exact dishonesty the handoff itself warns against.
 *
 * Each record is parsed from its own ability text so per-level magnitudes are right.
 *
 * Usage: node scripts/tag-round5.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
const FILE = "src/data/creatures.ts";
let src = readFileSync(FILE, "utf8");

const RULES = [
  {
    id: "thorntail",
    re: /^When allies inflict (\w+), this gains \+(\d+) Damage permanently\.$/,
    build: (m) => [`{ kind: "gainOnAllyStatus", status: "${m[1]}", stat: "damage", amount: ${m[2]} }`],
  },
  {
    // "(Except other Puffloon)" — same-species exclusion is already how `selectTargets` behaves for
    // `battleStartStatusFromAllies`; the generic `others` filter covers self, and the adjacency
    // selector plus the Toxic type filter covers the rest.
    id: "puffloon",
    re: /^Trigger this when adjacent Toxic allies trigger\./,
    build: () => [`{ kind: "triggerOnAllyTrigger", target: { kind: "adjacent", typeFilter: "Toxic" } }`],
  },
  {
    id: "fumungus",
    re: /^Has additional Damage equal to (\d+)% of the (\w+) stacks on the enemy\.$/,
    build: (m) => [`{ kind: "statFromTargetStatus", status: "${m[2]}", multiplier: ${Number(m[1]) / 100} }`],
  },
];

let tagged = 0;
for (const rule of RULES) {
  const blockRe = new RegExp(
    `(\\n    id: "${rule.id}",[\\s\\S]*?)(\\n    abilityTags: )(\\[\\]|\\[[\\s\\S]*?\\n    \\])`,
    "g",
  );
  src = src.replace(blockRe, (whole, head, key, existing) => {
    const t = /abilityText:\s*\n?\s*"((?:[^"\\]|\\.)*)"/.exec(head);
    if (!t) return whole;
    // Ability text may contain an escaped newline before the parenthetical.
    const text = t[1].replace(/\\n/g, " ").trim();
    const m = rule.re.exec(text);
    if (!m) return whole;
    tagged++;
    const inner = existing === "[]" ? "" : existing.slice(1, -1).replace(/\s+$/, "") + ",\n";
    return `${head}${key}[\n${inner}${rule.build(m).map((x) => `      ${x},`).join("\n")}\n    ]`;
  });
}
writeFileSync(FILE, src);
console.log("records tagged:", tagged);
