import { writeFileSync } from "node:fs";
import { creatures } from "/Users/matthew.johnson/Programming/batomon_calculator/src/data/creatures";
import { trainers } from "/Users/matthew.johnson/Programming/batomon_calculator/src/data/trainers";
import { trinkets } from "/Users/matthew.johnson/Programming/batomon_calculator/src/data/trinkets";
import { items } from "/Users/matthew.johnson/Programming/batomon_calculator/src/data/items";

const member = (id: string) =>
  id.split(/[^a-zA-Z0-9]+/).filter(Boolean).map((w) => w[0]!.toUpperCase() + w.slice(1)).join("")
    .replace(/^(\d)/, "_$1");

function block(name: string, ids: string[], doc: string) {
  const uniq = [...new Set(ids)].sort();
  const seen = new Map<string, string>();
  for (const id of uniq) {
    const m = member(id);
    if (seen.has(m)) throw new Error(`member collision: ${id} and ${seen.get(m)} both -> ${m}`);
    seen.set(m, id);
  }
  return `${doc}\nexport enum ${name} {\n${uniq.map((id) => `  ${member(id)} = "${id}",`).join("\n")}\n}\n`;
}

const out = `/**
 * Identifier enums, GENERATED from the corpus (2026-10-07, round 7).
 *
 * Regenerate: \`node scripts/generate-ids.mjs\`
 *
 * ## Why ids are a closed vocabulary too
 *
 * Every id was a bare \`string\`, so \`creatureId: "ninflorra"\` compiled, \`SHINY_STATS["ninflorra|1"]\`
 * returned \`undefined\`, and the UI silently showed a creature with no shiny line instead of
 * failing. Same for \`CREATURE_REGIONS\`, keyed by raw id strings. These sets are finite, published
 * and change only when the corpus does -- which is exactly the shape an enum is for.
 *
 * Generated rather than hand-written because the corpus is the source of truth: a hand-maintained
 * list of 149 species would be a fifth parallel structure free to drift, which is the problem this
 * round exists to remove.
 */

${block("Species", creatures.map((c) => c.id), "/** The 149 creature species. */")}
${block("TrainerId", trainers.map((t) => t.id), "/** The trainers. */")}
${block("TrinketId", trinkets.map((t) => t.id), "/** The trinkets. */")}
${block("ItemId", items.map((i) => i.id), "/** The items. */")}`;

writeFileSync("src/data/ids.ts", out);
console.log(`species=${new Set(creatures.map(c=>c.id)).size} trainers=${trainers.length} trinkets=${trinkets.length} items=${items.length}`);
