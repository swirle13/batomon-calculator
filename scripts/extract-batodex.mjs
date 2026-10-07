/**
 * The ONE batodex extractor (round 5). Fetches the embedded site database and writes a committed
 * snapshot that every other batodex-derived script and figure reads from.
 *
 * ## Why this exists
 *
 * Rounds 11 and 4 each re-derived this payload into an ephemeral `/tmp` file, quoted figures from
 * it in research.md and tasks.md, and then discarded it. Round-5 validation found two of those
 * published figures did not reproduce, and `vendor-sprites.mjs` already referenced this filename
 * for a script that did not exist. A number nobody can recompute is a number nobody can check.
 *
 * Usage: node scripts/extract-batodex.mjs
 *   -> src/data/__tests__/fixtures/batodex-monsters.json
 *   -> src/data/__tests__/fixtures/batodex-trainers.json
 */
import { writeFileSync } from "node:fs";

const SET_TO_REGION = { starter: "pantra", oshima: "jinto" };

async function rscPayload(url) {
  const html = await (await fetch(url)).text();
  const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,\s*("(?:[^"\\]|\\.)*")\]\)/g)].map(
    (m) => JSON.parse(m[1]),
  );
  return chunks.join("");
}

/** Balanced-brace scan — the payload is a stream, so `JSON.parse` on a slice needs the exact end. */
function extractObject(payload, marker) {
  const start = payload.indexOf(marker);
  if (start < 0) throw new Error(`marker not found: ${marker} — site structure changed`);
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < payload.length; i++) {
    const ch = payload[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return JSON.parse(payload.slice(start, i + 1));
  }
  throw new Error("unterminated object");
}

const monstersPayload = await rscPayload("https://batodex.com/monsters/beetbud");
const entries = extractObject(monstersPayload, '{"category":"monsters","entries":').entries;

// RSC inlines some values as `$17:props:...` references rather than literals. Those are NOT data,
// and silently keeping them is how a previous pass counted 144 usable entries where there are 149.
const isRef = (v) => typeof v === "string" && v.startsWith("$");
const textAt = (ability, level) => {
  if (!ability || typeof ability !== "object") return null;
  const t = (ability.byLevel ?? {})[String(level)] ?? ability.description ?? null;
  return isRef(t) || !t ? null : t;
};

const monsters = entries.map((e) => ({
  id: e.id,
  name: e.name,
  rarity: e.rarity,
  trigger: e.ability && typeof e.ability === "object" && !isRef(e.ability.trigger)
    ? (e.ability.trigger ?? null)
    : null,
  sprite: isRef(e.sprite) ? null : e.sprite ?? null,
  shinySprite: isRef(e.shinySprite) ? null : e.shinySprite ?? null,
  regions: Array.isArray(e.sets) ? e.sets.map((s) => SET_TO_REGION[s] ?? s) : null,
  abilityByLevel: Object.fromEntries([1, 2, 3, 4].map((l) => [l, textAt(e.ability, l)])),
  shinyAbilityByLevel: Object.fromEntries([1, 2, 3, 4].map((l) => [l, textAt(e.shinyAbility, l)])),
}));

writeFileSync(
  "src/data/__tests__/fixtures/batodex-monsters.json",
  JSON.stringify(monsters, null, 1) + "\n",
);

let trainers = [];
try {
  const tp = await rscPayload("https://batodex.com/trainers");
  const te = extractObject(tp, '{"category":"trainers","entries":').entries;
  trainers = te.map((e) => ({
    id: e.id,
    name: e.name,
    sprite: isRef(e.sprite) ? null : e.sprite ?? null,
    ability: textAt(e.ability, 1),
  }));
} catch (err) {
  console.error("trainers extraction failed:", err.message);
}
writeFileSync(
  "src/data/__tests__/fixtures/batodex-trainers.json",
  JSON.stringify(trainers, null, 1) + "\n",
);

console.log(`monsters: ${monsters.length} | trainers: ${trainers.length}`);
