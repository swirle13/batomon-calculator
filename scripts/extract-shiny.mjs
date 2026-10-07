/**
 * Extracts each monster's SHINY stat line from batodex.com (round 11, WI-R11-001).
 *
 * Shiny is not a cosmetic and NOT a uniform multiplier — that was the obvious assumption and it is
 * wrong. Measured across all 536 level-records on the site:
 *
 *   stat ratio shiny/normal:  1.0 x475   1.2 x111   0.8 x7   1.333 x4   1.4 x4   0.52 x2  ...
 *   cooldown differs on 88 records (Furnadon 5s -> 4s)
 *   multicast differs on 25 records (Velocect 2 -> 4, Plunderbird 2 -> 3)
 *
 * Most stats are unchanged, a minority are better, and a few are WORSE. So the shiny line has to be
 * stored per creature per level like any other data, not derived. Deriving it would have silently
 * produced wrong numbers for ~30% of the corpus and been invisible in the UI.
 *
 * Usage: node scripts/extract-shiny.mjs > src/data/__tests__/fixtures/batodex-shiny-series.json
 */
const SOURCE = "https://batodex.com/monsters/beetbud";

const html = await (await fetch(SOURCE)).text();
const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,\s*("(?:[^"\\]|\\.)*")\]\)/g)].map((m) =>
  JSON.parse(m[1]),
);
const payload = chunks.join("");

// The RSC stream embeds the whole site database on every page (research.md F5).
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
const entries = JSON.parse(payload.slice(start, end)).entries;

const out = {};
for (const e of entries) {
  if (!Array.isArray(e.shinyLevels)) continue;
  out[e.name] = e.shinyLevels
    .filter((l) => l && typeof l === "object")
    .map((l) => ({
      level: l.level,
      cooldown: l.cooldown,
      multicast: l.multicast,
      stats: (l.stats ?? []).map((s) => ({ key: s.key, value: s.value })),
    }));
}
process.stdout.write(JSON.stringify(out, null, 1) + "\n");
