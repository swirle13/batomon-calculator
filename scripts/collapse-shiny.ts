/**
 * One-shot migration (2026-10-08), the shiny half of `collapse-creatures.ts`.
 *
 * `SHINY_STATS` was keyed `${Species}|${level}` with 536 entries — 134 species x exactly 4 levels,
 * with no species partially covered. It becomes one entry per species with level 2-4 overrides,
 * matching how `creatures.ts` now stores the normal lines.
 *
 *     npx tsx scripts/collapse-shiny.ts
 */
import { writeFileSync } from "node:fs";
import { SHINY_STATS } from "../src/data/shiny";
import {
  AbilityTagKind,
  CreatureType,
  EventLabel,
  GridRow,
  ModifierStat,
  MultiplierScope,
  Rarity,
  StatChangeStat,
  StatusEffectType,
  TargetKind,
} from "../src/data/enums";
import { Species } from "../src/data/ids";

type EnumObject = Record<string, string>;
const reverse = (name: string, e: EnumObject) =>
  new Map(Object.entries(e).map(([m, v]) => [v, `${name}.${m}`]));

const SPECIES = reverse("Species", Species as unknown as EnumObject);
const STATUS = reverse("StatusEffectType", StatusEffectType as unknown as EnumObject);
const TAG_KIND = reverse("AbilityTagKind", AbilityTagKind as unknown as EnumObject);
const TARGET_KIND = reverse("TargetKind", TargetKind as unknown as EnumObject);
const STAT_CHANGE = reverse("StatChangeStat", StatChangeStat as unknown as EnumObject);
const MODIFIER_STAT = reverse("ModifierStat", ModifierStat as unknown as EnumObject);
const EVENT_LABEL = reverse("EventLabel", EventLabel as unknown as EnumObject);
const CREATURE_TYPE = reverse("CreatureType", CreatureType as unknown as EnumObject);
const RARITY = reverse("Rarity", Rarity as unknown as EnumObject);
const MULTIPLIER_SCOPE = reverse("MultiplierScope", MultiplierScope as unknown as EnumObject);
const ROW = reverse("GridRow", GridRow as unknown as EnumObject);

function member(map: Map<string, string>, value: unknown, where: string): string {
  const hit = map.get(String(value));
  if (!hit) throw new Error(`No enum member for ${JSON.stringify(value)} at ${where}`);
  return hit;
}

const str = (s: string) => JSON.stringify(s);

function selector(sel: any, where: string): string {
  const parts = [`kind: ${member(TARGET_KIND, sel.kind, where)}`];
  if (sel.sameTeamOnly !== undefined) parts.push(`sameTeamOnly: ${sel.sameTeamOnly}`);
  if (sel.typeFilter !== undefined) parts.push(`typeFilter: ${member(CREATURE_TYPE, sel.typeFilter, where)}`);
  if (sel.rarityFilter !== undefined) parts.push(`rarityFilter: ${member(RARITY, sel.rarityFilter, where)}`);
  if (sel.minLevelFilter !== undefined) parts.push(`minLevelFilter: ${sel.minLevelFilter}`);
  return `{ ${parts.join(", ")} }`;
}

function effect(eff: any, where: string): string {
  const parts: string[] = [];
  if (eff.statChange) {
    parts.push(`statChange: { stat: ${member(STAT_CHANGE, eff.statChange.stat, where)}, amount: ${eff.statChange.amount} }`);
  }
  if (eff.statusGrant) {
    parts.push(`statusGrant: { type: ${member(STATUS, eff.statusGrant.type, where)}, amount: ${eff.statusGrant.amount} }`);
  }
  if (eff.extraOngoingApplications !== undefined) {
    parts.push(`extraOngoingApplications: ${eff.extraOngoingApplications}`);
  }
  return `{ ${parts.join(", ")} }`;
}

function tag(t: any, where: string): string {
  const parts = [`kind: ${member(TAG_KIND, t.kind, where)}`];
  for (const [key, value] of Object.entries(t)) {
    if (key === "kind" || value === undefined) continue;
    const at = `${where}.${key}`;
    switch (key) {
      case "target":
      case "sourceSelector":
        parts.push(`${key}: ${selector(value, at)}`);
        break;
      case "effect":
      case "effectPerKnockout":
        parts.push(`${key}: ${effect(value, at)}`);
        break;
      case "effects":
        parts.push(`effects: [${(value as any[]).map((e) => `{ stat: ${member(MODIFIER_STAT, e.stat, at)}, amount: ${e.amount} }`).join(", ")}]`);
        break;
      case "event":
        parts.push(`event: ${member(EVENT_LABEL, value, at)}`);
        break;
      case "status":
        parts.push(`status: ${member(STATUS, value, at)}`);
        break;
      case "typeFilter":
        parts.push(`typeFilter: ${member(CREATURE_TYPE, value, at)}`);
        break;
      case "rarityFilter":
        parts.push(`rarityFilter: ${member(RARITY, value, at)}`);
        break;
      case "rowFilter":
        parts.push(`rowFilter: ${member(ROW, value, at)}`);
        break;
      case "stat":
        parts.push(`stat: ${t.kind === AbilityTagKind.StatMultiplier ? member(MULTIPLIER_SCOPE, value, at) : member(STAT_CHANGE, value, at)}`);
        break;
      case "sourceStat":
        parts.push(`sourceStat: ${STATUS.get(String(value)) ?? member(STAT_CHANGE, value, at)}`);
        break;
      default:
        if (typeof value === "number" || typeof value === "boolean") parts.push(`${key}: ${value}`);
        else throw new Error(`Unhandled tag key ${key} at ${at}`);
    }
  }
  return `{ ${parts.join(", ")} }`;
}

const LEVEL_KEYS = [
  "baseDamage",
  "baseCooldownSeconds",
  "baseMulticast",
  "healAmount",
  "appliesStatus",
  "abilityText",
  "abilityTags",
] as const;

function levelField(key: (typeof LEVEL_KEYS)[number], line: any, where: string): string {
  switch (key) {
    case "baseDamage":
      return line.baseDamage === null ? "null" : `${line.baseDamage}`;
    case "baseCooldownSeconds":
      return line.baseCooldownSeconds === null ? "null" : `${line.baseCooldownSeconds}`;
    case "baseMulticast":
    case "healAmount":
      return `${line[key]}`;
    case "appliesStatus":
      return `[${line.appliesStatus.map((s: any) => `{ type: ${member(STATUS, s.type, where)}, amount: ${s.amount} }`).join(", ")}]`;
    case "abilityText":
      return str(line.abilityText);
    case "abilityTags":
      return `[${line.abilityTags.map((t: any) => tag(t, where)).join(", ")}]`;
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// ---------------------------------------------------------------------------

const bySpecies = new Map<string, any[]>();
for (const [key, line] of Object.entries(SHINY_STATS)) {
  const [id] = key.split("|");
  if (!bySpecies.has(id!)) bySpecies.set(id!, []);
  bySpecies.get(id!)!.push(line);
}
for (const list of bySpecies.values()) list.sort((a, b) => a.level - b.level);

const blocks: string[] = [];
for (const [id, levels] of [...bySpecies].sort(([a], [b]) => a.localeCompare(b))) {
  if (levels.length !== 4 || levels.some((l, i) => l.level !== i + 1)) {
    throw new Error(`${id}: expected exactly shiny levels 1-4, got [${levels.map((l) => l.level)}]`);
  }
  const [l1] = levels;

  for (const l of levels.slice(1)) {
    for (const key of LEVEL_KEYS) {
      if (l1[key] !== undefined && l[key] === undefined) {
        throw new Error(`${id}@L${l.level}: drops "${key}", which overrides cannot express`);
      }
    }
  }
  const sprites = new Set(levels.map((l) => JSON.stringify(l.spriteFile ?? null)));
  if (sprites.size > 1) throw new Error(`${id}: spriteFile is not level-invariant`);

  // One line per species, matching the density of the pre-collapse file. These are generated
  // rows nobody hand-edits, and 134 long lines read better in a diff than 2.8k short ones.
  const fields: string[] = [];
  if (l1.spriteFile !== undefined) fields.push(`spriteFile: ${str(l1.spriteFile)}`);
  for (const key of LEVEL_KEYS) {
    if (l1[key] === undefined) continue;
    fields.push(`${key}: ${levelField(key, l1, `${id}@L1.${key}`)}`);
  }

  const overrides: string[] = [];
  for (const l of levels.slice(1)) {
    const changed = LEVEL_KEYS.filter((key) => !same(l[key], l1[key]));
    if (changed.length === 0) continue;
    const inner = changed.map((key) => `${key}: ${levelField(key, l, `${id}@L${l.level}.${key}`)}`);
    overrides.push(`${l.level}: { ${inner.join(", ")} }`);
  }
  if (overrides.length > 0) fields.push(`levels: { ${overrides.join(", ")} }`);

  blocks.push(`  [${member(SPECIES, id, id)}]: { ${fields.join(", ")} },`);
}

const body = blocks.join("\n");
const CANDIDATES = [
  "AbilityTagKind",
  "CreatureType",
  "EventLabel",
  "GridRow",
  "ModifierStat",
  "MultiplierScope",
  "Rarity",
  "StatChangeStat",
  "StatusEffectType",
  "TargetKind",
];
const used = CANDIDATES.filter((n) => new RegExp(`\\b${n}\\.`).test(body));

const header = `import type { AbilityTag } from "./types";
import { ${used.join(", ")} } from "./enums";
import { Species } from "./ids";

/**
 * SHINY stat lines (round 11, WI-R11-001). Extracted by \`scripts/extract-shiny.mjs\`, collapsed to
 * one entry per species by \`scripts/collapse-shiny.ts\` (2026-10-08).
 *
 * ## Why this is a table and not a multiplier
 *
 * Shiny looks like a flat bonus and is not. Measured over all 536 level-records on batodex.com:
 *
 * | shiny/normal stat ratio | records |
 * |---|---|
 * | 1.0 (unchanged) | 475 |
 * | 1.2 | 111 |
 * | **0.8 (worse)** | 7 |
 * | 1.33 / 1.4 / 0.52 / ... | 14 |
 *
 * Cooldown differs on 88 records (Furnadon 5s -> 4s) and Multicast on 25 (Velocect 2 -> 4).
 * A "x1.2 everything" rule — the obvious implementation — would have been wrong for roughly a third
 * of the corpus, in a direction the UI could not reveal.
 *
 * ## Why a separate layer rather than fields on \`CreatureSpecies\`
 *
 * Shiny is a variant of a creature, not a different creature: same id, same ability, same level
 * curve position. Keeping it as an overlay keyed by species means a missing shiny row degrades to
 * the normal stat line instead of to a crash.
 *
 * ## Shape
 *
 * Level 1 sits inline and \`levels\` carries only what changes at 2, 3 and 4, exactly as
 * \`creatures.ts\` does. Coverage is 134 species, each with all four levels — there is no partially
 * covered species, which is why \`hasShinyVariant\` can answer from species presence alone.
 * Species on the site with no match in our corpus are listed in research.md M1.
 */

/** The parts of a shiny line that can differ between levels. */
export interface ShinyLevelStats {
  baseDamage: number | null;
  baseCooldownSeconds: number | null;
  baseMulticast: number;
  healAmount?: number;
  appliesStatus?: { type: StatusEffectType; amount: number }[];
  /**
   * The shiny ability text (T252/FR-101). Differs from the normal text at 343 of the 508
   * level-records that have both — which is where shiny's uplift mostly lives, since 299 stat lines
   * are identical. Absent when batodex publishes no shiny ability for the species.
   */
  abilityText?: string;
  /**
   * Shiny-specific ability tags (T252b/FR-105) — so the shiny text DRIVES RESOLUTION, not just
   * display. Without this a shiny Bunchop reads "+60 HP" while resolving +50.
   *
   * A full tag list rather than a magnitude override, because shiny text can differ structurally
   * and not merely in magnitude, and a second override mechanism would be a third way to express
   * an ability. Absent means the normal tags apply unchanged, which is the common case.
   */
  abilityTags?: AbilityTag[];
}

/** One species' shiny data as STORED: level 1 inline, levels 2-4 as overrides. */
export interface ShinySpecies extends ShinyLevelStats {
  /**
   * Vendored shiny sprite filename (T254/FR-102). Present for **139 of 149** species — batodex
   * publishes none for the egg/NULL families or the 5 species it does not carry. Those fall back
   * to the normal sprite rather than rendering nothing. Never varies by level.
   */
  spriteFile?: string;
  levels?: Partial<Record<2 | 3 | 4, Partial<ShinyLevelStats>>>;
}

/** One species' shiny data AT ONE LEVEL — the resolved view, produced by \`getShinyLine\`. */
export interface ShinyStatLine extends ShinyLevelStats {
  level: number;
  spriteFile?: string;
}

export const SHINY_STATS: Partial<Record<Species, ShinySpecies>> = {
`;

const footer = `};

/**
 * One species' shiny line at one level, or \`null\` if batodex publishes no shiny for it.
 *
 * Replaces \`SHINY_STATS[shinyKey(id, level)]\`. The \`\\\`\${Species}|\${level}\\\`\` key type existed to stop
 * a misspelled species compiling; indexing by \`Species\` directly gives the same protection without
 * a key format to get wrong.
 */
export function getShinyLine(id: Species, level: number): ShinyStatLine | null {
  const species = SHINY_STATS[id];
  if (!species || level < 1 || level > 4) return null;
  const { levels, ...base } = species;
  return level === 1
    ? { ...base, level }
    : { ...base, ...levels?.[level as 2 | 3 | 4], level };
}

/** Every stored shiny species, as \`[id, resolved level line]\` pairs — for corpus-wide audits. */
export function allShinyLines(): { id: Species; line: ShinyStatLine }[] {
  const out: { id: Species; line: ShinyStatLine }[] = [];
  for (const id of Object.keys(SHINY_STATS) as Species[]) {
    for (const level of [1, 2, 3, 4]) out.push({ id, line: getShinyLine(id, level)! });
  }
  return out;
}
`;

writeFileSync(new URL("../src/data/shiny.ts", import.meta.url), `${header}${body}\n${footer}`);
console.log(`Wrote ${blocks.length} shiny species (from ${Object.keys(SHINY_STATS).length} level records).`);
