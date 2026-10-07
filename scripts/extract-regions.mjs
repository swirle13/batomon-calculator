/**
 * Extracts each monster's REGION membership from batodex.com (round 4 orchestration, T229).
 *
 * The payload's `sets` field is the attribution source. Three naming schemes are in play
 * (research.md M6) and this script maps them:
 *
 *   batodex `starter` -> Pantra   (the user's "starter"; the official patch notes' name)
 *   batodex `oshima`  -> Jinto    (INFERENCE: 1.0.0 added "50+ new Batomon"; oshima holds 56)
 *
 * The extract is COMMITTED rather than re-fetched on demand. An uncommitted external source is how
 * the wrong Painter ability entered the corpus in the first place (research.md M1).
 *
 * Usage: node scripts/extract-regions.mjs > src/data/__tests__/fixtures/batodex-regions.json
 */
const SOURCE = "https://batodex.com/monsters/beetbud";

const html = await (await fetch(SOURCE)).text();
const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,\s*("(?:[^"\\]|\\.)*")\]\)/g)].map((m) =>
  JSON.parse(m[1]),
);
const payload = chunks.join("");
const start = payload.indexOf('{"category":"monsters","entries":');
if (start < 0) throw new Error("monsters payload not found — site structure changed");

let depth = 0, end = -1, inStr = false, esc = false;
for (let i = start; i < payload.length; i++) {
  const ch = payload[i];
  if (esc) { esc = false; continue; }
  if (ch === "\\") { esc = true; continue; }
  if (ch === '"') { inStr = !inStr; continue; }
  if (inStr) continue;
  if (ch === "{") depth++;
  else if (ch === "}" && --depth === 0) { end = i + 1; break; }
}

const SET_TO_REGION = { starter: "pantra", oshima: "jinto" };
const out = {};
for (const e of JSON.parse(payload.slice(start, end)).entries) {
  if (!Array.isArray(e.sets)) continue;
  out[e.name] = e.sets.map((s) => SET_TO_REGION[s] ?? s).filter(Boolean);
}
process.stdout.write(JSON.stringify(out, null, 1) + "\n");
