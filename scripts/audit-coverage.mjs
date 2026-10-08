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
import { abilityNeedsModelling, hasAbilityText } from "../src/data/display.ts";

// Shared with the engine and the card, so "does this creature have an ability?" is answered the
// same way in the coverage denominator, the resolver and the UI.
const hasRealAbility = (c) => hasAbilityText(c.abilityText);

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

// A tag the ENGINE does not resolve is not automatically a problem. `manualTrigger` is
// deliberately engine-unreachable — its trigger happens outside the battle (using an item, buying
// a monster) — and is read by the UI to offer a one-press button. Lumping those in with genuinely
// inert tags would report 9 creatures as broken when they are working as designed.
const manual = tagged.filter((c) => c.abilityTags.some((t) => t.kind === "manualTrigger"));
const inert = tagged.filter(
  (c) => !c.abilityTags.some(isResolvableTag) && !c.abilityTags.some((t) => t.kind === "manualTrigger"),
);

if (manual.length) {
  console.log(
    `\nMANUAL TRIGGERS (engine cannot fire these; the UI offers a button): ${manual.map((c) => c.name).join(", ")}`,
  );
}
if (inert.length) {
  console.log(`\nINERT TAGS (recorded but read by NOTHING): ${inert.map((c) => c.name).join(", ")}`);
} else {
  console.log(`\nINERT TAGS: none — every recorded tag is read by the engine or the UI.`);
}

/*
 * The GAP ITSELF, one line per creature, with the trigger and the published text (2026-10-08).
 *
 * The counts above say how big the gap is; they say nothing about what is in it, and the gap is
 * the only part anyone acts on. `specs/.../ability-coverage-audit.md` groups these lines into
 * families by hand — that grouping is judgement and belongs in prose — but the LIST it groups is
 * generated here, so the audit can be re-checked against the corpus instead of being trusted.
 *
 * `abilityNeedsModelling` rather than `hasRealAbility` is the filter: the same denominator the UI
 * puts next to the DPS figure, so the audit and the user see one gap, not two.
 */
const gap = battle
  .filter((c) => abilityNeedsModelling(c))
  .filter((c) => !c.abilityTags.some(isResolvableTag) && !c.abilityTags.some((t) => t.kind === "manualTrigger"))
  .sort((a, b) => a.name.localeCompare(b.name));

console.log(`\nTHE GAP (${gap.length}) — neither resolved nor banked by a button:`);
for (const c of gap) {
  console.log(`  ${c.name}\t[${c.abilityTrigger ?? "no trigger"}]\t${c.abilityText.replace(/\n/g, " ")}`);
}
