/**
 * Round-4 tagging (T231, T227a, T220). Each record is parsed from ITS OWN ability text so per-level
 * amounts are correct.
 *
 * T231's three creatures were held back in round 11 because their grant names a status they already
 * apply, and the text alone could not say whether that was one effect or two. The user settled it
 * from play: two effects. Base `appliesStatus` is cast 1; the grant accumulates from cast 2.
 */
import { readFileSync, writeFileSync } from "node:fs";
const FILE = "src/data/creatures.ts";
let src = readFileSync(FILE, "utf8");
const STATUS = new Set(["Burn", "Poison", "Shock", "Shield"]);

const effectFor = (stat, amount) =>
  STATUS.has(stat)
    ? `statusGrant: { type: "${stat}", amount: ${amount} }`
    : stat === "Multicast"
      ? `statChange: { stat: "multicast", amount: ${amount} }`
      : `statChange: { stat: "damage", amount: ${amount} }`;

const RULES = [
  // T231 — cascading self-grants. "+80 Damage and +80 Shield" yields TWO effect clauses.
  { id: "pebbler", re: /^\+(\d+) (\w+) for this battle\.$/, build: (m) =>
      [`{ kind: "buffOnCast", target: { kind: "self" }, effect: { ${effectFor(m[2], m[1])} } }`] },
  { id: "pyrokami", re: /^\+(\d+) (\w+) for this battle\.$/, build: (m) =>
      [`{ kind: "buffOnCast", target: { kind: "self" }, effect: { ${effectFor(m[2], m[1])} } }`] },
  { id: "bonshell", re: /^\+(\d+) (\w+) and \+(\d+) (\w+) for this battle\.$/, build: (m) => [
      `{ kind: "buffOnCast", target: { kind: "self" }, effect: { ${effectFor(m[2], m[1])} } }`,
      `{ kind: "buffOnCast", target: { kind: "self" }, effect: { ${effectFor(m[4], m[3])} } }`,
    ] },
  // T227a — Saberhorn: the grant AND its cost. Tagging only the upside would overstate it.
  { id: "saberhorn", re: /^Give the ally in front \+(\d+) Multicast and increase this monster's Cooldown by (\d+) seconds for this battle\.$/, build: (m) => [
      `{ kind: "buffOnCast", target: { kind: "inFront" }, effect: { statChange: { stat: "multicast", amount: ${m[1]} } } }`,
      `{ kind: "buffOnCast", target: { kind: "self" }, effect: { statChange: { stat: "cooldownFlatSeconds", amount: ${m[2]} } } }`,
    ] },
  // T220 — Prismagon: unique TYPES, not matching allies.
  { id: "prismagon", re: /^\+(\d+) (\w+) permanently for each unique type on your team\.$/, build: (m) =>
      [`{ kind: "statFromUniqueTypes", target: { kind: "self" }, effect: { ${effectFor(m[2], m[1])} } }`] },
  // T220 — Petrirex: self-inflicted, position-chosen knockout, decidable before the battle starts.
  { id: "petrirex", re: /^Knockout adjacent allies and gain \+(\d+) (\w+) permanently for each ally Knockout\.$/, build: (m) =>
      [`{ kind: "knockoutAlliesOnBattleStart", target: { kind: "adjacent" }, effectPerKnockout: { ${effectFor(m[2], m[1])} } }`] },
];

let tagged = 0;
for (const rule of RULES) {
  const blockRe = new RegExp(`(\\n    id: "${rule.id}",[\\s\\S]*?)(\\n    abilityTags: )(\\[\\]|\\[[\\s\\S]*?\\n    \\])`, "g");
  src = src.replace(blockRe, (whole, head, key, existing) => {
    const t = /abilityText:\s*\n?\s*"((?:[^"\\]|\\.)*)"/.exec(head);
    if (!t) return whole;
    const m = rule.re.exec(t[1].trim());
    if (!m) return whole;
    const tags = rule.build(m);
    tagged += 1;
    const inner = existing === "[]" ? "" : existing.slice(1, -1).replace(/\s+$/, "") + ",\n";
    return `${head}${key}[\n${inner}${tags.map((x) => `      ${x},`).join("\n")}\n    ]`;
  });
}
writeFileSync(FILE, src);
console.log("records tagged:", tagged);
