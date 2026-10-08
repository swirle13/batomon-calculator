/**
 * Recomputes the shiny STAT comparisons quoted in research.md N1, from committed data.
 *
 * Separate from `audit-batodex.mjs` because these compare `src/data/shiny.ts` against
 * `src/data/creatures.ts` — both committed — rather than reading the batodex snapshot. Pass-2
 * validation found research.md claimed "every figure in this section is regenerable" when the stat
 * figures were regenerable by nothing.
 *
 * Usage: npx vite-node scripts/audit-shiny.mjs
 */
import { getCreatureByIdAndLevel } from "../src/data/corpus.ts";
import { allShinyLines } from "../src/data/shiny.ts";

const worseBy = new Map();
let worseRecords = 0;

for (const { id, line } of allShinyLines()) {
  const base = getCreatureByIdAndLevel(id, line.level);
  if (!base) continue;

  const regressions = [];
  const lower = (b, s, name) => { if (b != null && s != null && s < b) regressions.push(name); };
  lower(base.publishedCast?.damage, line.baseDamage, "damage");
  lower(base.baseMulticast, line.baseMulticast, "multicast");
  lower(base.healAmount, line.healAmount, "heal");
  // Cooldown is inverted: HIGHER is worse.
  if (base.baseCooldownSeconds != null && line.baseCooldownSeconds != null &&
      line.baseCooldownSeconds > base.baseCooldownSeconds) regressions.push("cooldown");
  // Status amounts — the axis the first count forgot, which is how 4 species went unnoticed.
  for (const s of base.appliesStatus ?? []) {
    const m = (line.appliesStatus ?? []).find((x) => x.type === s.type);
    if (m && m.amount < s.amount) regressions.push(s.type.toLowerCase());
  }

  if (regressions.length) {
    worseRecords++;
    if (!worseBy.has(id)) worseBy.set(id, new Set());
    for (const r of regressions) worseBy.get(id).add(r);
  }
}

// Aggregate throughput: (damage + statuses + heal) * multicast / cooldown.
const thr = (c, l) => {
  const pick = (a, b) => (l ? a : b);
  const dmg = pick(l?.baseDamage, c.publishedCast?.damage) ?? 0;
  const mc = pick(l?.baseMulticast, c.baseMulticast) ?? 1;
  const cd = pick(l?.baseCooldownSeconds, c.baseCooldownSeconds) ?? 1;
  const st = (pick(l?.appliesStatus, c.appliesStatus) ?? []).reduce((a, s) => a + s.amount, 0);
  const hl = pick(l?.healAmount, c.healAmount) ?? 0;
  return cd > 0 ? (dmg + st + hl) * mc / cd : 0;
};
let better = 0, equal = 0, worseAgg = 0;
for (const { id, line } of allShinyLines()) {
  const base = getCreatureByIdAndLevel(id, line.level);
  if (!base) continue;
  const n = thr(base, null), s = thr(base, line);
  if (s > n + 1e-9) better++; else if (s < n - 1e-9) worseAgg++; else equal++;
}

console.log(`PER-STAT regressions: ${worseBy.size} species = ${worseRecords} level-records`);
for (const [id, stats] of worseBy) console.log(`  ${id}: ${[...stats].join(", ")}`);
console.log(`\nAGGREGATE throughput: ${better} better / ${equal} equal / ${worseAgg} worse`);
