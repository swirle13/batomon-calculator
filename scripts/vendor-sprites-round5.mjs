#!/usr/bin/env node
/**
 * Vendors SHINY monster sprites and TRAINER sprites (T254/T255, FR-102).
 *
 * Reads the committed snapshot from `scripts/extract-batodex.mjs`, not an ephemeral /tmp file —
 * the lesson of round 5's validation.
 *
 * ## Matching is by NAME, and for trainers that is not a nicety
 *
 * `vendor-sprites.mjs` already records that id-matching "silently misses 11" of 149 monsters.
 * For trainers it is far worse: **12 of our 23 ids diverge** from batodex's —
 * `chef` -> `pyromaniac`, `lucky-girl` -> `youngster_f`, `rich-lady` -> `lady`, `youngster` ->
 * `youngster_m`, plus 8 hyphen-vs-underscore cases. An id-keyed run would quietly produce a
 * mostly-empty sprite set that still looked like a success. All 23 resolve by name.
 *
 * ## Known ceiling, reported rather than hidden
 *
 * batodex publishes shiny sprites for 139 of its 144 monsters, against our 149 species — so ~10
 * have none and fall back to their normal sprite. "All" is not reachable from this source.
 *
 * Usage: node scripts/vendor-sprites-round5.mjs
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const ORIGIN = "https://batodex.com";
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

async function fetchInto(url, dest) {
  const res = await fetch(url);
  if (!res.ok) return false;
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return true;
}

const monsters = JSON.parse(
  await readFile(path.join(ROOT, "src/data/__tests__/fixtures/batodex-monsters.json"), "utf8"),
);
const trainers = JSON.parse(
  await readFile(path.join(ROOT, "src/data/__tests__/fixtures/batodex-trainers.json"), "utf8"),
);
const creaturesSrc = await readFile(path.join(ROOT, "src/data/creatures.ts"), "utf8");
const trainersSrc = await readFile(path.join(ROOT, "src/data/trainers.ts"), "utf8");

const ourMonsters = new Map();
for (const m of creaturesSrc.matchAll(/id: "([^"]+)",\n    name: "([^"]+)"/g)) ourMonsters.set(m[1], m[2]);
const ourTrainers = new Map();
for (const m of trainersSrc.matchAll(/id: "([^"]+)",\n    name: "([^"]+)"/g)) ourTrainers.set(m[1], m[2]);

// --- shiny monster sprites ---
await mkdir(path.join(ROOT, "public/sprites/monster"), { recursive: true });
const byMonsterName = new Map(monsters.map((m) => [norm(m.name), m]));
const shinyMap = {};
let shinyOk = 0;
const shinyMissing = [];
for (const [id, name] of ourMonsters) {
  const entry = byMonsterName.get(norm(name));
  if (!entry?.shinySprite) { shinyMissing.push(id); continue; }
  const file = `${id}_shiny.png`;
  if (await fetchInto(ORIGIN + entry.shinySprite, path.join(ROOT, "public/sprites/monster", file))) {
    shinyMap[id] = file;
    shinyOk++;
  } else shinyMissing.push(id);
}

// --- trainer sprites ---
await mkdir(path.join(ROOT, "public/sprites/trainer"), { recursive: true });
const byTrainerName = new Map(trainers.map((t) => [norm(t.name), t]));
const trainerMap = {};
let trainerOk = 0;
const trainerMissing = [];
for (const [id, name] of ourTrainers) {
  const entry = byTrainerName.get(norm(name));
  if (!entry?.sprite) { trainerMissing.push(id); continue; }
  const file = `${id}.png`;
  if (await fetchInto(ORIGIN + entry.sprite, path.join(ROOT, "public/sprites/trainer", file))) {
    trainerMap[id] = file;
    trainerOk++;
  } else trainerMissing.push(id);
}

await writeFile(
  path.join(ROOT, "src/data/__tests__/fixtures/sprite-maps-round5.json"),
  JSON.stringify({ shiny: shinyMap, trainer: trainerMap }, null, 1) + "\n",
);

console.log(`shiny sprites  : ${shinyOk}/${ourMonsters.size}  (missing: ${shinyMissing.length})`);
console.log(`trainer sprites: ${trainerOk}/${ourTrainers.size} (missing: ${trainerMissing.length})`);
if (shinyMissing.length) console.log(`  no shiny sprite: ${shinyMissing.join(", ")}`);
if (trainerMissing.length) console.log(`  no trainer sprite: ${trainerMissing.join(", ")}`);
