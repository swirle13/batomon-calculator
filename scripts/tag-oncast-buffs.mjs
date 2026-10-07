/**
 * Tags `buffOnCast` abilities from ability text (round 11, T224/T219).
 *
 * Only UNAMBIGUOUS forms are tagged, and each record is parsed from ITS OWN text so per-level
 * amounts are correct (round 9b's bug was tagging level 1 only). Deliberately NOT tagged:
 *
 *   pebbler/bonshell/pyrokami — the grant restates a status the creature already applies
 *     ("+15 Shield" vs appliesStatus Shield 20). Whether those are the same effect or two
 *     different ones is genuinely unclear, and guessing wrong double-counts. This is the exact
 *     trap that doubled Bumblebolt's Shock in round 10.
 *   saberhorn  — grants +1 Multicast but also adds 8s to its OWN cooldown. Tagging only the
 *     upside would overstate it.
 *   aerophim   — also transforms the allies into random monsters, which is unmodellable.
 *   petrirex/prismagon/galvanine — knockout, unique-type counting, % cooldown; other families.
 *
 * Usage: node scripts/tag-oncast-buffs.mjs   (rewrites src/data/creatures.ts in place)
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "src/data/creatures.ts";
let src = readFileSync(FILE, "utf8");

const STATUS = new Set(["Burn", "Poison", "Shock", "Shield"]);
const RULES = [
  { id: "magmalith", re: /^Give the ally above \+(\d+) (\w+) permanently\.$/, target: '{ kind: "above" }' },
  { id: "noxalith", re: /^Give the ally above \+(\d+) (\w+) permanently\.$/, target: '{ kind: "above" }' },
  { id: "voltalith", re: /^Give the ally above \+(\d+) (\w+) permanently\.$/, target: '{ kind: "above" }' },
  { id: "zephyrex", re: /^Give the Flying ally in front \+(\d+) (Multicast) permanently\./, target: '{ kind: "inFront" }' },
  { id: "noxnimbus", re: /^Adjacent Toxic allies gain \+(\d+) (\w+) for this battle\.$/, target: '{ kind: "adjacent", typeFilter: "Toxic" }' },
  { id: "mosslug", re: /^\+(\d+) (Damage) for this battle\.$/, target: '{ kind: "self" }' },
  { id: "bambudo", re: /^\+(\d+) (Damage) permanently\.$/, target: '{ kind: "self" }' },
];

let tagged = 0;
// Each creature record is a `{ ... }` block opening with `id: "<id>",`.
for (const rule of RULES) {
  const blockRe = new RegExp(`(\\n    id: "${rule.id}",[\\s\\S]*?)(\\n    abilityTags: )(\\[\\]|\\[[\\s\\S]*?\\n    \\])`, "g");
  src = src.replace(blockRe, (whole, head, key, existing) => {
    const textMatch = /abilityText:\s*\n?\s*"((?:[^"\\]|\\.)*)"/.exec(head);
    if (!textMatch) return whole;
    const m = rule.re.exec(textMatch[1].trim());
    if (!m) return whole;
    const amount = Number(m[1]);
    const stat = m[2];
    const effect = STATUS.has(stat)
      ? `{ statusGrant: { type: "${stat}", amount: ${amount} } }`
      : stat === "Multicast"
        ? `{ statChange: { stat: "multicast", amount: ${amount} } }`
        : `{ statChange: { stat: "damage", amount: ${amount} } }`;
    const tag = `{ kind: "buffOnCast", target: ${rule.target}, effect: ${effect} }`;
    tagged++;
    const inner = existing === "[]" ? "" : existing.slice(1, -1).replace(/\s+$/, "") + ",\n";
    return `${head}${key}[\n${inner}      ${tag},\n    ]`;
  });
}
writeFileSync(FILE, src);
console.log("records tagged:", tagged);
