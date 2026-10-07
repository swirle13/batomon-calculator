/**
 * Applies the v1.3.0 balance changes to the corpus.
 *
 * Source: Steam, "Batomon Showdown - Patch 1.3.0", 2026-10-06
 * https://store.steampowered.com/news/app/4557380/view/686392527015643351
 *
 * ## Level 4 is INFERRED, not quoted
 *
 * The notes give three values for the scaling abilities ("Damage per trinket gained: 40/80/120 ->
 * 50/100/150"), which are levels 1-3. Our corpus carries a level 4 the notes never mention. Each
 * level-4 value is therefore rescaled by the SAME factor as level 1, which preserves the creature's
 * existing L1:L4 ratio — the only defensible inference from the data we have. Those records are
 * marked as inferred in their `patch` string so a later reader is not misled into thinking the
 * number was published.
 *
 * Usage: node scripts/patch-1_3_0.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "src/data/creatures.ts";
let src = readFileSync(FILE, "utf8");

/** Flat per-creature stat changes. Cooldown and cost are not per-level. */
const STATS = {
  opalion: { baseCooldownSeconds: 6 },
  petrirex: { baseCooldownSeconds: 5.5 },
  steamscuttle: { baseCooldownSeconds: 3.5 },
  kappow: { baseCooldownSeconds: 5.5, shopCost: 25 },
  aviarab: { shopCost: 25 },
  mallogre: { baseCooldownSeconds: 8 },
  danuki: { shopCost: 45 },
  sarudo: { shopCost: 25 },
  noxnimbus: { baseCooldownSeconds: 3 },
  lignite: { baseCooldownSeconds: 5 },
  stalagrove: { baseCooldownSeconds: 4.5 },
  aegistruct: { baseCooldownSeconds: 6 },
  geminiss: { baseCooldownSeconds: 10 },
};

/**
 * Per-level ability-text rewrites. `scale` is the L1 multiplier the notes imply, applied to every
 * level including the unpublished level 4.
 */
const TEXT = {
  dollhime: { re: /\+(\d+) Damage permanently\./, scale: 50 / 40, fmt: (n) => `+${n} Damage permanently.` },
  guardiant: {
    re: /After you buy a Bug monster, this gains \+(\d+) Damage\./,
    scale: 8 / 7,
    fmt: (n) => `After you buy a Bug monster, this gains +${n} Damage.`,
  },
  lignite: {
    re: /Has additional Damage equal to (\d+) times this monster's Burn\./,
    scale: 20 / 15,
    fmt: (n) => `Has additional Damage equal to ${n} times this monster's Burn.`,
  },
  // Not a scaling value: the notes say "Rock allies triggered: 2 -> 1" outright, and our corpus has
  // 2 at every level, so every level becomes 1.
  opalion: {
    re: /Trigger (\d+) random Rock allies\./,
    fixed: 1,
    fmt: (n) => `Trigger ${n} random Rock allies.`,
  },
};

const PATCH_NOTE =
  "Balance 25 / 1.3.0 (Steam patch notes 2026-10-06)";
const PATCH_NOTE_INFERRED =
  "Balance 25 / 1.3.0 (Steam patch notes 2026-10-06; LEVEL 4 VALUE INFERRED -- the notes publish " +
  "levels 1-3 only, so L4 is rescaled by the same factor as L1 to preserve the existing ratio)";

let statEdits = 0;
let textEdits = 0;
const touched = new Set();

// Each creature record is a block opening with `id: "<id>",`.
const blockRe = /\n {4}id: "([a-z0-9_]+)",\n[\s\S]*?\n {2}\},\n/g;
src = src.replace(blockRe, (block, id) => {
  const stats = STATS[id];
  const text = TEXT[id];
  if (!stats && !text) return block;

  let out = block;
  const levelMatch = /\n {4}level: (\d),/.exec(block);
  const level = levelMatch ? Number(levelMatch[1]) : 1;
  let inferred = false;

  if (stats) {
    for (const [field, value] of Object.entries(stats)) {
      const fieldRe = new RegExp(`(\\n {4}${field}: )(-?[\\d.]+)(,)`);
      if (fieldRe.test(out)) {
        out = out.replace(fieldRe, `$1${value}$3`);
        statEdits++;
      }
    }
  }

  if (text) {
    out = out.replace(/(abilityText:\s*\n?\s*")((?:[^"\\]|\\.)*)(")/, (whole, open, body, close) => {
      const m = text.re.exec(body);
      if (!m) return whole;
      const next =
        text.fixed !== undefined ? text.fixed : Math.round(Number(m[1]) * text.scale);
      if (level === 4 && text.fixed === undefined) inferred = true;
      textEdits++;
      return open + body.replace(text.re, text.fmt(next)) + close;
    });
  }

  out = out.replace(/(\n {4}patch:\s*)(\n?\s*)"(?:[^"\\]|\\.)*"(?:\s*\+\s*\n?\s*"(?:[^"\\]|\\.)*")*/,
    `$1"${inferred ? PATCH_NOTE_INFERRED : PATCH_NOTE}"`);

  touched.add(id);
  return out;
});

writeFileSync(FILE, src);
console.log(`stat edits: ${statEdits} | text edits: ${textEdits} | species touched: ${touched.size}`);
console.log([...touched].sort().join(", "));
