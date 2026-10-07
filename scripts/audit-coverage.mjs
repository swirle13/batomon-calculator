/**
 * Ability-coverage audit (T218). COMMITTED so the figures are regenerable rather than going stale
 * the moment a creature is tagged.
 *
 * The reason this exists: round 10 published "9 of 135 abilities modelled" from a one-off probe
 * that counted creatures carrying a TAG rather than creatures the engine RESOLVES. The real figure
 * was 3. A number quoted in two design artifacts and the UI was wrong in exactly the dimension the
 * user had asked about, and nothing could recompute it.
 *
 * `isResolvableTag` is imported rather than reimplemented, so this script and the app cannot drift.
 *
 * Usage: npx vite-node scripts/audit-coverage.mjs
 */
import { corpus } from "../src/data/corpus.ts";
import { isResolvableTag } from "../src/engine/effects.ts";

const hasRealAbility = (c) =>
  c.abilityText?.trim() && !/^no ability text/i.test(c.abilityText);

const battle = corpus.creatures.filter((c) => c.level === 1 && hasRealAbility(c));
const resolved = battle.filter((c) => c.abilityTags.some(isResolvableTag));
const tagged = battle.filter((c) => c.abilityTags.length > 0);

// Families the engine structurally cannot compute, named rather than hidden in the denominator.
const EXCLUSIONS = [
  { name: "knockout (needs a death/HP model)", re: /knock(ed)? ?out/i },
  { name: "shop / economy", re: /shop|gold|\$|reroll|sell value|buy/i },
  { name: "evolution-only", re: /evolv|hatch/i },
];
const excluded = new Set();
for (const c of battle) {
  if (resolved.includes(c)) continue;
  for (const e of EXCLUSIONS) if (e.re.test(c.abilityText)) { excluded.add(c.id); break; }
}

console.log(`battle-relevant abilities : ${battle.length}`);
console.log(`  RESOLVED by the engine  : ${resolved.length}`);
console.log(`  carry a tag             : ${tagged.length}  (tagged != resolved -- the round-10 error)`);
console.log(`  structurally excluded   : ${excluded.size}`);
console.log(`  remaining unsupported   : ${battle.length - resolved.length - excluded.size}`);
console.log(`\nresolved: ${resolved.map((c) => c.name).sort().join(", ")}`);

const inert = tagged.filter((c) => !c.abilityTags.some(isResolvableTag));
if (inert.length) {
  console.log(`\nINERT TAGS (recorded but read by no engine code): ${inert.map((c) => c.name).join(", ")}`);
}
