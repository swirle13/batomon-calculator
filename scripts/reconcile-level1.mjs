#!/usr/bin/env node
/**
 * Repairs level-1 creature stats against the authoritative per-level series (tasks.md T133,
 * research.md H10/H11).
 *
 * WHY THIS EXISTS: round 5's "fill in the remaining level-1 records" pass had an off-by-one row
 * alignment bug, so 55 of 149 level-1 records were written with the PREVIOUS creature's stats. A
 * further 6 differ from the authoritative source by a plausible margin and are treated as genuine
 * source disagreements. Levels 2-4 were populated by a different, correctly-aligned pass and are
 * 100% consistent with the source — this script deliberately touches level 1 only.
 *
 * The 55 shifted records are a transcription bug, not a disagreement: the value belongs to a
 * different creature entirely, so they are corrected outright. The 6 genuine discrepancies adopt
 * the authoritative value AND record the superseded community-dex value as a FieldConflict, per
 * Constitution Principle IV (never silently drop a sourced value).
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const MONSTERS_JSON = process.env.MONSTERS_JSON ?? "/tmp/monsters_extracted.json";

/** Records whose disagreement is a plausible source difference, not the row shift. */
const GENUINE_DISCREPANCIES = new Set(["pebbler", "dribblet", "magmalith", "nekoffin", "noxalith", "opalion"]);

const STATUS_KEYS = { burn: "Burn", poison: "Poison", shock: "Shock", shield: "Shield" };

function authFields(entry) {
  const level1 = (entry.levels ?? []).find((l) => l.level === 1);
  if (!level1) return null;
  const stats = level1.stats ?? [];
  const damage = stats.find((s) => s.key === "damage");
  const heal = stats.find((s) => s.key === "heal");
  const statuses = stats
    .filter((s) => STATUS_KEYS[s.key])
    .map((s) => ({ type: STATUS_KEYS[s.key], amount: s.value }));
  return {
    cooldown: level1.cooldown,
    damage: damage ? damage.value : null,
    heal: heal ? heal.value : null,
    multicast: level1.multicast ?? 1,
    statuses,
  };
}

/** Replaces `key: <value>,` within one record segment, or inserts it before `sourceRefs:`. */
function setField(segment, key, literal) {
  const re = new RegExp(`^(\\s+)${key}: [^\\n]*?,$`, "m");
  if (re.test(segment)) return segment.replace(re, (_m, indent) => `${indent}${key}: ${literal},`);
  return segment.replace(/^(\s+)sourceRefs: /m, (_m, indent) => `${indent}${key}: ${literal},\n${indent}sourceRefs: `);
}

function removeField(segment, key) {
  // Handles both single-line values and the multi-line appliesStatus array form.
  return segment
    .replace(new RegExp(`^\\s+${key}: \\[[\\s\\S]*?\\],\\n`, "m"), "")
    .replace(new RegExp(`^\\s+${key}: [^\\n]*?,\\n`, "m"), "");
}

async function main() {
  const data = JSON.parse(await readFile(MONSTERS_JSON, "utf8"));
  const byName = {};
  for (const entry of Object.values(data)) byName[entry.name.toLowerCase()] = entry;

  const file = path.join(ROOT, "src/data/creatures.ts");
  const parts = (await readFile(file, "utf8")).split(/(\n  \{\n)/);

  const corrected = [];
  const conflicted = [];

  for (let i = 0; i < parts.length; i++) {
    let segment = parts[i];
    const idMatch = segment.match(/^ {4}id: "([^"]+)",$/m);
    if (!idMatch) continue;
    const level = (segment.match(/^ {4}level: (\d),$/m) ?? [])[1];
    if (level !== "1") continue;

    const id = idMatch[1];
    const name = (segment.match(/^ {4}name: "([^"]+)",$/m) ?? [])[1];
    const auth = authFields(byName[(name ?? "").toLowerCase()] ?? {});
    if (!auth) continue;

    const ourCd = (segment.match(/baseCooldownSeconds: ([^,]+),/) ?? [])[1];
    const ourDmg = (segment.match(/baseDamage: ([^,]+),/) ?? [])[1];
    // Statuses and heal are compared too, not just cooldown/damage: a record can have the right
    // cooldown and damage while its status amounts came from a different source entirely (Brimtoad
    // -- Burn 5/Poison 5 recorded vs Burn 1/Poison 1 published, which the user's own in-game
    // screenshot adjudicates in the source's favour). The first version of this script compared
    // only cooldown+damage and silently skipped 6 such records.
    const ourStatuses = [...(((segment.match(/appliesStatus: \[([^\]]*)\]/) ?? [])[1] ?? "").matchAll(/type: "(\w+)", amount: ([\d.]+)/g))]
      .map((m) => `${m[1]}:${m[2]}`)
      .sort()
      .join(",");
    const authStatuses = auth.statuses.map((s) => `${s.type}:${s.amount}`).sort().join(",");
    const ourHeal = (segment.match(/healAmount: ([^,]+),/) ?? [])[1] ?? "none";
    const authHeal = auth.heal === null ? "none" : String(auth.heal);
    const matches =
      Number(ourCd) === Number(auth.cooldown) &&
      String(ourDmg) === String(auth.damage === null ? "null" : auth.damage) &&
      ourStatuses === authStatuses &&
      ourHeal === authHeal;
    if (matches) continue;

    const isGenuine = GENUINE_DISCREPANCIES.has(id);

    segment = setField(segment, "baseCooldownSeconds", String(auth.cooldown));
    segment = setField(segment, "baseDamage", auth.damage === null ? "null" : String(auth.damage));
    segment = setField(segment, "damageType", auth.damage === null ? "null" : '"Direct"');
    segment = setField(segment, "baseMulticast", String(auth.multicast));

    segment = removeField(segment, "appliesStatus");
    if (auth.statuses.length > 0) {
      const literal = `[${auth.statuses.map((s) => `{ type: "${s.type}", amount: ${s.amount} }`).join(", ")}]`;
      segment = setField(segment, "appliesStatus", literal);
    }
    segment = removeField(segment, "healAmount");
    if (auth.heal !== null) segment = setField(segment, "healAmount", String(auth.heal));

    // Any field this script just supplied is, by definition, no longer unconfirmed.
    segment = segment.replace(/^\s+unconfirmedFields: \[[^\]]*\],\n/m, (whole) => {
      const kept = [...whole.matchAll(/"([^"]+)"/g)]
        .map((m) => m[1])
        .filter((f) => !["baseCooldownSeconds", "baseDamage", "damageType", "appliesStatus", "healAmount"].includes(f));
      if (kept.length === 0) return "";
      return whole.replace(/\[[^\]]*\]/, `[${kept.map((f) => `"${f}"`).join(", ")}]`);
    });

    if (isGenuine) {
      // Preserve the superseded value rather than deleting it (Principle IV).
      const conflictEntry =
        `    conflicts: [\n` +
        `      {\n` +
        `        field: "baseCooldownSeconds/baseDamage (level 1)",\n` +
        `        values: [\n` +
        `          { value: "cooldown ${auth.cooldown}s, damage ${auth.damage === null ? "none published" : auth.damage}", sourceRefs: [batodexLevelSeries] },\n` +
        `          { value: "cooldown ${ourCd}s, damage ${ourDmg === "null" ? "none published" : ourDmg}", sourceRefs: [communityDex] },\n` +
        `        ],\n` +
        `        resolution:\n` +
        `          "Adopted the batodex per-level series value, because it is the same source levels 2-4 " +\n` +
        `          "come from -- keeping the community-dex figure at level 1 would leave this species' own " +\n` +
        `          "four records internally inconsistent. The community value is retained here rather than " +\n` +
        `          "dropped (2026-10-06 round 6, tasks.md T133).",\n` +
        `      },\n` +
        `    ],\n`;
      if (!/^\s+conflicts: \[/m.test(segment)) {
        segment = segment.replace(/^( {4}patch: [^\n]*\n)/m, (_m, patchLine) => `${patchLine}${conflictEntry}`);
      }
      conflicted.push(id);
    } else {
      corrected.push(id);
    }

    parts[i] = segment;
  }

  await writeFile(file, parts.join(""));
  console.log(`corrected (off-by-one shift, wrong creature's data): ${corrected.length}`);
  console.log(`  ${corrected.join(", ")}`);
  console.log(`reconciled with recorded conflict (genuine source disagreement): ${conflicted.length}`);
  console.log(`  ${conflicted.join(", ")}`);
}

await main();
