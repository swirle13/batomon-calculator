#!/usr/bin/env node
/**
 * Extracts batodex.com's Item database and vendors the item sprites (tasks.md T046).
 *
 * The third application of research.md G2's technique, after monsters and trinkets:
 * `https://batodex.com/items` server-renders one `self.__next_f.push([1, "..."])` chunk holding
 * `{"category":"items","entries":[...]}` — 40 entries, the whole table in one request.
 *
 * Writes a COMMITTED snapshot rather than an ephemeral /tmp file, for the reason
 * `extract-batodex.mjs` states: a number nobody can recompute is a number nobody can check.
 *
 * Usage: node scripts/extract-batodex-items.mjs
 *   -> src/data/__tests__/fixtures/batodex-items.json
 *   -> public/sprites/item/*.png
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const ORIGIN = "https://batodex.com";

async function rscPayload(url) {
  const html = await (await fetch(url)).text();
  return [...html.matchAll(/self\.__next_f\.push\(\[1,\s*("(?:[^"\\]|\\.)*")\]\)/g)]
    .map((m) => JSON.parse(m[1]))
    .join("");
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

/**
 * RSC deduplicates repeated values into `$<id>:props:...` back-references, so 33 of the 40
 * entries carry a STRING where `rarity` should be an object. Reading `rarity.label` off those
 * yields `undefined`, which is how a naive pass would land 7 rarities and 33 blanks.
 *
 * `tier` is the literal that survives deduplication, and it determines the rarity outright: the 7
 * entries that DO carry a literal rarity object are one per tier, and each agrees with the mapping
 * below. Deriving from `tier` therefore resolves all 40 without inventing anything.
 */
const TIER_TO_RARITY = {
  1: "Common",
  2: "Uncommon",
  3: "Rare",
  4: "SuperRare",
  5: "Legendary",
  6: "Mythical",
};

const payload = await rscPayload(`${ORIGIN}/items`);
const entries = extractObject(payload, '{"category":"items","entries":').entries;

// Cross-check the tier mapping against every literal rarity the payload did inline, so a future
// re-tiering on batodex's side fails here instead of silently relabelling the corpus.
for (const e of entries) {
  if (!e.rarity || typeof e.rarity !== "object") continue;
  const expected = TIER_TO_RARITY[e.tier];
  const actual = e.rarity.label.replace(/\s+/g, "");
  if (expected !== actual) {
    throw new Error(`tier ${e.tier} maps to ${expected} but ${e.id} publishes ${actual}`);
  }
}

const items = entries.map((e) => ({
  id: e.id,
  name: e.name,
  rarity: TIER_TO_RARITY[e.tier] ?? null,
  tier: e.tier,
  cost: e.cost,
  uniquePerRound: e.uniquePerRound === true,
  description: e.description,
  sprite: typeof e.sprite === "string" && !e.sprite.startsWith("$") ? e.sprite : null,
}));

await writeFile(
  path.join(ROOT, "src/data/__tests__/fixtures/batodex-items.json"),
  JSON.stringify(items, null, 1) + "\n",
);

// --- sprites ---
await mkdir(path.join(ROOT, "public/sprites/item"), { recursive: true });
let ok = 0;
const missing = [];
for (const item of items) {
  if (!item.sprite) { missing.push(item.id); continue; }
  // `pom berry` really does publish with a space in its id, its sprite path and nothing else in
  // the corpus — encode the path, keep the filename verbatim so `spriteFile` matches what is on
  // disk. Renaming it here would make the record disagree with its own source.
  const res = await fetch(ORIGIN + item.sprite.split("/").map(encodeURIComponent).join("/"));
  if (!res.ok) { missing.push(item.id); continue; }
  const file = path.posix.basename(item.sprite);
  await writeFile(path.join(ROOT, "public/sprites/item", file), Buffer.from(await res.arrayBuffer()));
  ok++;
}

console.log(`items: ${items.length} | sprites: ${ok}/${items.length}`);
if (missing.length) console.log(`  no sprite: ${missing.join(", ")}`);
