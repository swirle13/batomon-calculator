#!/usr/bin/env node
/**
 * Vendors creature/trinket sprites into `public/sprites/` and populates each corpus record's
 * `spriteFile` + `abilityTrigger` (tasks.md T116, research.md H3).
 *
 * Committed rather than left in /tmp deliberately: round 5's extraction pipeline was thrown away
 * after use and had to be rebuilt from scratch this round. Run with `node scripts/vendor-sprites.mjs`.
 *
 * Sprites are VENDORED, not hot-linked (Principle V: zero-backend, offline-capable once loaded).
 * They are the game's own assets as redistributed by batodex.com — see README's attribution note.
 *
 * Mapping is by creature/trinket NAME, case-insensitively, not by `id`: 11 of 149 species publish
 * under a different slug than this corpus's id (`craghorn` -> `alpinine`, `pyronade` ->
 * `infernade`, the Egg/NULL families' underscored slugs, ...). Name-matching resolves 149/149;
 * id-matching silently misses 11.
 */
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const ORIGIN = "https://batodex.com";

/** Raw extraction inputs. Regenerate with scripts/extract-batodex.mjs if absent. */
const MONSTERS_JSON = process.env.MONSTERS_JSON ?? "/tmp/monsters_extracted.json";
const TRINKETS_JSON = process.env.TRINKETS_JSON ?? "/tmp/trinkets_extracted.json";

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function download(spritePath, destDir) {
  const filename = path.basename(spritePath);
  const dest = path.join(destDir, filename);
  if (await exists(dest)) return { filename, cached: true };
  const res = await fetch(`${ORIGIN}${spritePath}`);
  if (!res.ok) throw new Error(`${res.status} fetching ${spritePath}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  return { filename, cached: false };
}

async function main() {
  for (const p of [MONSTERS_JSON, TRINKETS_JSON]) {
    if (!(await exists(p))) {
      console.error(`Missing extraction input: ${p}`);
      console.error("Set MONSTERS_JSON / TRINKETS_JSON, or re-run the batodex extraction first.");
      process.exit(1);
    }
  }

  const monsters = Object.values(JSON.parse(await readFile(MONSTERS_JSON, "utf8")));
  const trinkets = JSON.parse(await readFile(TRINKETS_JSON, "utf8"));

  const monsterDir = path.join(ROOT, "public/sprites/monster");
  const trinketDir = path.join(ROOT, "public/sprites/trinket");
  await mkdir(monsterDir, { recursive: true });
  await mkdir(trinketDir, { recursive: true });

  // --- download every sprite, keyed by lowercased name for corpus matching ---
  const monsterByName = new Map();
  for (const entry of monsters) {
    if (!entry.sprite) continue;
    const { filename } = await download(entry.sprite, monsterDir);
    monsterByName.set(entry.name.toLowerCase(), {
      spriteFile: filename,
      abilityTrigger: entry.ability?.trigger ?? null,
    });
  }
  const trinketByName = new Map();
  for (const entry of trinkets) {
    if (!entry.sprite) continue;
    const { filename } = await download(entry.sprite, trinketDir);
    trinketByName.set(entry.name.toLowerCase(), { spriteFile: filename });
  }
  console.log(`downloaded: ${monsterByName.size} monster sprites, ${trinketByName.size} trinket sprites`);

  // --- populate spriteFile/abilityTrigger on every corpus record ---
  // Anchored on each record's `sourceRefs:` line, inserting just before it. Every record has
  // exactly one, always as a single line, so the anchor is unambiguous without parsing
  // TypeScript. (An earlier draft anchored on `abilityTags: [],` and silently skipped the 6
  // oldest seed records, whose `abilityTags` is a populated multi-line array — caught by the
  // spriteFile-coverage assertion this script's companion test performs.)
  let matched = 0;
  let unmatched = new Set();

  function patch(source, lookup, extraFields) {
    return source.replace(
      /(\n(\s+)id: "([^"]+)",\n\s+name: "([^"]+)",)([\s\S]*?)(\n\s+sourceRefs: )/g,
      (whole, head, indent, _id, name, middle, tagsLine) => {
        const data = lookup.get(name.toLowerCase());
        if (!data) {
          unmatched.add(name);
          return whole;
        }
        // Idempotent: skip records already carrying spriteFile.
        if (middle.includes("spriteFile:")) return whole;
        matched++;
        const added = extraFields(data, indent);
        // `added` goes BEFORE the anchor: the anchor is a partial line (`\n  sourceRefs: `), so
        // appending after it would splice the new fields between the key and its value.
        return `${head}${middle}${added}${tagsLine}`;
      },
    );
  }

  const creaturesPath = path.join(ROOT, "src/data/creatures.ts");
  const creatures = patch(await readFile(creaturesPath, "utf8"), monsterByName, (d, indent) => {
    const lines = [`\n${indent}spriteFile: "${d.spriteFile}",`];
    if (d.abilityTrigger) lines.push(`\n${indent}abilityTrigger: ${JSON.stringify(d.abilityTrigger)},`);
    return lines.join("");
  });
  await writeFile(creaturesPath, creatures);

  const trinketsPath = path.join(ROOT, "src/data/trinkets.ts");
  const trinketsSrc = patch(await readFile(trinketsPath, "utf8"), trinketByName, (d, indent) => `\n${indent}spriteFile: "${d.spriteFile}",`);
  await writeFile(trinketsPath, trinketsSrc);

  console.log(`patched ${matched} corpus records`);
  if (unmatched.size > 0) {
    console.log(`UNMATCHED (${unmatched.size}):`, [...unmatched].join(", "));
  }
}

await main();
