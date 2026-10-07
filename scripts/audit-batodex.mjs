/**
 * Recomputes every batodex-derived figure quoted in research.md, from the COMMITTED snapshot.
 * Round-5 validation found two published figures that did not reproduce; this makes them checkable.
 *
 * Usage: node scripts/audit-batodex.mjs
 */
import { readFileSync } from "node:fs";
const m = JSON.parse(readFileSync("src/data/__tests__/fixtures/batodex-monsters.json", "utf8"));

const trig = {};
for (const x of m) trig[x.trigger ?? "(none)"] = (trig[x.trigger ?? "(none)"] ?? 0) + 1;

let diff = 0, identical = 0, normalOnly = 0, neither = 0;
for (const x of m) {
  for (const lv of [1, 2, 3, 4]) {
    const n = x.abilityByLevel[lv], s = x.shinyAbilityByLevel[lv];
    if (!n && !s) neither++;
    else if (n && !s) normalOnly++;
    else if (n === s) identical++;
    else diff++;
  }
}
console.log(`monsters in snapshot: ${m.length}`);
console.log(`triggers:`, JSON.stringify(trig));
console.log(`\nability level-records (${m.length} x 4 = ${m.length * 4}):`);
console.log(`  shiny text DIFFERS : ${diff}`);
console.log(`  identical          : ${identical}`);
console.log(`  normal only        : ${normalOnly}`);
console.log(`  neither            : ${neither}`);
console.log(`  => of the ${diff + identical} records having BOTH, ${diff} differ`);
console.log(`\nsprites: shiny ${m.filter((x) => x.shinySprite).length}, normal ${m.filter((x) => x.sprite).length}`);
console.log(`regions attributed: ${m.filter((x) => x.regions?.length).length}`);
