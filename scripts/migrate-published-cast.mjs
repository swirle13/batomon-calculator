/**
 * One-shot migration: the `(baseDamage, damageType)` pair -> one optional `publishedCast`
 * (2026-10-07, round 7 WI-004).
 *
 * Why: measured over all 596 records, `damageType` is `null` exactly when `baseDamage` is `null`,
 * with zero exceptions in either direction. Two nullable fields that must agree is an illegal state
 * the type system was not preventing — and `BatomonCard` even read the pair for a decision whose two
 * branches were the same string. One optional field cannot disagree with itself.
 *
 *     baseDamage: 50,                           ->  publishedCast: { damage: 50, channel: DamageChannel.Direct },
 *     damageType: DamageChannel.Direct,
 *
 *     baseDamage: null,                         ->  (both lines removed; absence IS the state)
 *     damageType: null,
 *
 * The 596/596 correlation is what makes this mechanical: every record has both fields or neither,
 * so no record changes meaning. `damageChannel.test.ts` pinned that correlation precisely so this
 * migration could be trusted.
 *
 * Usage: node scripts/migrate-published-cast.mjs [--dry]
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILES = ["src/data/creatures.ts"];
const dry = process.argv.includes("--dry");

let totalPaired = 0;
let totalRemoved = 0;
let totalOrphans = 0;

for (const file of FILES) {
  const src = readFileSync(file, "utf8");

  // Both fields present and damaging: collapse onto one line, preserving indentation.
  let out = src.replace(
    /^([ \t]*)baseDamage: (\d+(?:\.\d+)?),\n[ \t]*damageType: (DamageChannel\.\w+),\n/gm,
    (_whole, indent, damage, channel) => {
      totalPaired++;
      return `${indent}publishedCast: { damage: ${damage}, channel: ${channel} },\n`;
    },
  );

  // Both null: the absence of `publishedCast` is the state, so both lines go.
  out = out.replace(/^[ \t]*baseDamage: null,\n[ \t]*damageType: null,\n/gm, () => {
    totalRemoved++;
    return "";
  });

  // Anything left is a pair that did not match either shape -- report rather than guess.
  for (const m of out.matchAll(/^[ \t]*(baseDamage|damageType):.*$/gm)) {
    totalOrphans++;
    const line = src.slice(0, src.indexOf(m[0])).split("\n").length;
    console.log(`  ORPHAN ${file}:~${line}  ${m[0].trim()}`);
  }

  if (!dry && out !== src) writeFileSync(file, out);
}

console.log(`\npaired -> publishedCast: ${totalPaired}`);
console.log(`null pairs removed:      ${totalRemoved}`);
console.log(`orphans (need a human):  ${totalOrphans}`);
console.log(`total records touched:   ${totalPaired + totalRemoved}`);
