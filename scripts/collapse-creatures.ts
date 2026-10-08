/**
 * One-shot migration (2026-10-08): collapses `src/data/creatures.ts` from one record per
 * (species, level) to one entry per species with level 2-4 overrides.
 *
 * Reads the CURRENT module and re-emits it, so the transformation is a function of the data that
 * is actually there rather than of a regex over source text. Run with:
 *
 *     npx tsx scripts/collapse-creatures.ts
 *
 * Kept in the repo as the record of how the collapse was performed; it is not part of the build
 * and is not expected to be run again.
 */
import { writeFileSync } from "node:fs";
import { creatures } from "../src/data/creatures";
import {
  AbilityTagKind,
  AbilityTrigger,
  CreatureType,
  DamageChannel,
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

// ---------------------------------------------------------------------------
// Emitting enum members rather than their string values
// ---------------------------------------------------------------------------

type EnumObject = Record<string, string>;

/** value -> `EnumName.Member`, so `"Shock"` emits as `StatusEffectType.Shock`. */
function reverse(name: string, e: EnumObject): Map<string, string> {
  return new Map(Object.entries(e).map(([member, value]) => [value, `${name}.${member}`]));
}

const SPECIES = reverse("Species", Species as unknown as EnumObject);
const RARITY = reverse("Rarity", Rarity as unknown as EnumObject);
const CREATURE_TYPE = reverse("CreatureType", CreatureType as unknown as EnumObject);
const DAMAGE_CHANNEL = reverse("DamageChannel", DamageChannel as unknown as EnumObject);
const STATUS = reverse("StatusEffectType", StatusEffectType as unknown as EnumObject);
const TRIGGER = reverse("AbilityTrigger", AbilityTrigger as unknown as EnumObject);
const TAG_KIND = reverse("AbilityTagKind", AbilityTagKind as unknown as EnumObject);
const TARGET_KIND = reverse("TargetKind", TargetKind as unknown as EnumObject);
const STAT_CHANGE = reverse("StatChangeStat", StatChangeStat as unknown as EnumObject);
const MODIFIER_STAT = reverse("ModifierStat", ModifierStat as unknown as EnumObject);
const EVENT_LABEL = reverse("EventLabel", EventLabel as unknown as EnumObject);
const MULTIPLIER_SCOPE = reverse("MultiplierScope", MultiplierScope as unknown as EnumObject);
const ROW = reverse("GridRow", GridRow as unknown as EnumObject);

function member(map: Map<string, string>, value: unknown, where: string): string {
  const hit = map.get(String(value));
  if (!hit) throw new Error(`No enum member for ${JSON.stringify(value)} at ${where}`);
  return hit;
}

const str = (s: string) => JSON.stringify(s);

// ---------------------------------------------------------------------------
// Ability tags
// ---------------------------------------------------------------------------

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
    parts.push(
      `statChange: { stat: ${member(STAT_CHANGE, eff.statChange.stat, where)}, amount: ${eff.statChange.amount} }`,
    );
  }
  if (eff.statusGrant) {
    parts.push(
      `statusGrant: { type: ${member(STATUS, eff.statusGrant.type, where)}, amount: ${eff.statusGrant.amount} }`,
    );
  }
  if (eff.extraOngoingApplications !== undefined) {
    parts.push(`extraOngoingApplications: ${eff.extraOngoingApplications}`);
  }
  return `{ ${parts.join(", ")} }`;
}

/**
 * `stat` and `sourceStat` are the only keys whose enum depends on the tag that contains them, so
 * they are resolved per-kind rather than by a flat key->enum table.
 */
function statFor(kind: string, value: unknown, where: string): string {
  if (kind === AbilityTagKind.StatMultiplier) return member(MULTIPLIER_SCOPE, value, where);
  return member(STAT_CHANGE, value, where);
}

function sourceStatFor(value: unknown, where: string): string {
  return STATUS.get(String(value)) ?? member(STAT_CHANGE, value, where);
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
        parts.push(
          `effects: [${(value as any[])
            .map((e) => `{ stat: ${member(MODIFIER_STAT, e.stat, at)}, amount: ${e.amount} }`)
            .join(", ")}]`,
        );
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
      case "trigger":
        parts.push(`trigger: ${member(TRIGGER, value, at)}`);
        break;
      case "stat":
        parts.push(`stat: ${statFor(t.kind, value, at)}`);
        break;
      case "sourceStat":
        parts.push(`sourceStat: ${sourceStatFor(value, at)}`);
        break;
      default:
        if (typeof value === "number" || typeof value === "boolean") parts.push(`${key}: ${value}`);
        else throw new Error(`Unhandled tag key ${key} at ${at}`);
    }
  }
  return `{ ${parts.join(", ")} }`;
}

function tags(list: any[], where: string, indent: string): string {
  if (list.length === 0) return "[]";
  return `[\n${list.map((t) => `${indent}  ${tag(t, where)},`).join("\n")}\n${indent}]`;
}

// ---------------------------------------------------------------------------
// Level-varying stats
// ---------------------------------------------------------------------------

/** Exactly the keys of `CreatureLevelStats`, in emit order. */
const LEVEL_KEYS = [
  "shopCost",
  "baseCooldownSeconds",
  "baseMulticast",
  "publishedCast",
  "appliesStatus",
  "healAmount",
  "abilityText",
  "abilityTags",
] as const;

function levelField(key: (typeof LEVEL_KEYS)[number], r: any, indent: string): string {
  const where = `${r.id}@L${r.level}.${key}`;
  switch (key) {
    case "shopCost":
    case "baseMulticast":
    case "healAmount":
      return `${r[key]}`;
    case "baseCooldownSeconds":
      return r.baseCooldownSeconds === null ? "null" : `${r.baseCooldownSeconds}`;
    case "publishedCast":
      return `{ damage: ${r.publishedCast.damage}, channel: ${member(DAMAGE_CHANNEL, r.publishedCast.channel, where)} }`;
    case "appliesStatus":
      return `[${r.appliesStatus
        .map((s: any) => `{ type: ${member(STATUS, s.type, where)}, amount: ${s.amount} }`)
        .join(", ")}]`;
    case "abilityText":
      return str(r.abilityText);
    case "abilityTags":
      return tags(r.abilityTags, where, indent);
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const bySpecies = new Map<string, any[]>();
for (const c of creatures) {
  if (!bySpecies.has(c.id)) bySpecies.set(c.id, []);
  bySpecies.get(c.id)!.push(c);
}
for (const list of bySpecies.values()) list.sort((a, b) => a.level - b.level);

const blocks: string[] = [];

for (const [id, levels] of bySpecies) {
  if (levels.length !== 4 || levels.some((r, i) => r.level !== i + 1)) {
    throw new Error(`${id}: expected exactly levels 1-4, got [${levels.map((r) => r.level)}]`);
  }
  const [l1] = levels;

  // Guard the inheritance rule: an override can only RESTATE a field, never remove one. If a
  // higher level ever drops a stat level 1 has, omission would silently re-add it.
  for (const r of levels.slice(1)) {
    for (const key of LEVEL_KEYS) {
      if (l1[key] !== undefined && r[key] === undefined) {
        throw new Error(`${id}@L${r.level}: drops "${key}", which overrides cannot express`);
      }
    }
  }

  // Level-invariant fields must genuinely be invariant, or hoisting them loses data.
  for (const key of ["name", "rarity", "types", "confirmedMaxLevel", "sellValue", "abilityTrigger", "spriteFile"]) {
    const values = new Set(levels.map((r) => JSON.stringify(r[key] ?? null)));
    if (values.size > 1) throw new Error(`${id}: "${key}" is not level-invariant: ${[...values]}`);
  }

  const lines: string[] = [];
  lines.push(`\tid: ${member(SPECIES, id, id)},`);
  lines.push(`\tname: ${str(l1.name)},`);
  lines.push(`\trarity: ${member(RARITY, l1.rarity, id)},`);
  lines.push(`\ttypes: [${l1.types.map((t: string) => member(CREATURE_TYPE, t, id)).join(", ")}],`);
  if (l1.confirmedMaxLevel !== undefined) lines.push(`\tconfirmedMaxLevel: ${l1.confirmedMaxLevel},`);
  if (l1.sellValue !== undefined) lines.push(`\tsellValue: ${l1.sellValue},`);

  /*
   * `evolvesInto` is hoisted from whichever level records it. Eight species (Emberpaw, Fernfowl,
   * Flarilisk, Ignit, Kindlepot, Pipskull, Riglet, Sproutquill) recorded it at levels 2-4 but left
   * it blank at level 1, which was data-entry drift rather than a real per-level difference.
   *
   * Their `evolvesAtLevel` stays ABSENT, which is correct and not an oversight: these evolve on a
   * condition, not on a merge ("Evolve when your team inflicts Burn 25 times", "Evolve after
   * collecting 5 more Trinkets"). `resolveLevelUp` requires both fields, so it still declines to
   * evolve them at any level — see the test that pins exactly this behaviour for Ignit.
   */
  const evolvesInto = levels.map((r) => r.evolvesInto).find((v) => v !== undefined);
  if (evolvesInto !== undefined) lines.push(`\tevolvesInto: ${member(SPECIES, evolvesInto, id)},`);
  if (l1.evolvesAtLevel !== undefined) lines.push(`\tevolvesAtLevel: ${l1.evolvesAtLevel},`);
  if (l1.abilityTrigger !== undefined) lines.push(`\tabilityTrigger: ${member(TRIGGER, l1.abilityTrigger, id)},`);
  if (l1.spriteFile !== undefined) lines.push(`\tspriteFile: ${str(l1.spriteFile)},`);

  for (const key of LEVEL_KEYS) {
    if (l1[key] === undefined) continue;
    lines.push(`\t${key}: ${levelField(key, l1, "\t")},`);
  }

  const overrides: string[] = [];
  for (const r of levels.slice(1)) {
    const changed = LEVEL_KEYS.filter((key) => !same(r[key], l1[key]));
    if (changed.length === 0) continue;
    const fields = changed.map((key) => `\t\t\t${key}: ${levelField(key, r, "\t\t\t")},`);
    overrides.push(`\t\t${r.level}: {\n${fields.join("\n")}\n\t\t},`);
  }
  if (overrides.length > 0) lines.push(`\tlevels: {\n${overrides.join("\n")}\n\t},`);

  blocks.push(`{\n${lines.join("\n")}\n}`);
}

/** Only the enums the emitted corpus actually references, so the file has no unused imports. */
const CANDIDATE_IMPORTS = [
  "AbilityTagKind",
  "AbilityTrigger",
  "CreatureType",
  "DamageChannel",
  "EventLabel",
  "GridRow",
  "ModifierStat",
  "MultiplierScope",
  "Rarity",
  "StatChangeStat",
  "StatusEffectType",
  "TargetKind",
];

const body = blocks.join(", ");
const used = CANDIDATE_IMPORTS.filter((name) => new RegExp(`\\b${name}\\.`).test(body));

const header = `import type { CreatureSpecies } from "./types";
import { ${used.join(", ")} } from "./enums";
import { Species } from "./ids";

/**
 * The creature corpus: 149 named Batomon, reconciled from berrymint's imported Balance 24 / 1.2.0
 * catalog and patched to v1.3.0 from the official notes.
 *
 * ## One entry per species (2026-10-08)
 *
 * This file used to hold 596 records — one per (species, level) — which repeated each creature's
 * name, rarity, types, sprite and trigger four times and ran to 11.5k lines. It now holds 149
 * entries whose level 1 stat line sits inline, with \`levels\` carrying only what changes at 2, 3
 * and 4. Anything a level omits is inherited from level 1.
 *
 * Nothing downstream reads this shape. \`data/corpus.ts\` materialises all four levels of every
 * species into the flat \`CreatureRecord\` the engine and the UI have always read, so the collapse
 * is a change of storage and not of meaning. \`corpusIntegrity\` and \`levelSeries\` both still
 * check all 596 resolved records value-for-value against the authoritative source.
 *
 * The level progressions are stored, never computed. Levels 2 and 3 are usually 2x and 3x level 1,
 * but level 4 multipliers observed across the corpus run 1x, 2x, 3x, 6x, 12x, 24x, 30x, 100x and
 * 999x, and damage alone has 15 distinct progression shapes — there is no formula to replace them
 * with.
 *
 * ## Provenance
 *
 * Sources: batomon.net's community dex (Rarity/Types/ability text), batomonshowdown.wiki's demo
 * tier/cost table (Cost), batodex.com's per-level series (stats). The sources disagree on the
 * roster total (144 vs. 149 vs. 88) because they count different things — ordinary shop entries
 * vs. all dex rows including events/placeholders vs. species. This file reconciles them into one
 * list.
 *
 * Two creature types absent from the original union were observed directly in these sources and
 * added to \`CreatureType\`: "Curio" and "NULL" (see \`types.ts\` for the inline citation).
 */

export const creatures: CreatureSpecies[] = [`;

writeFileSync(new URL("../src/data/creatures.ts", import.meta.url), `${header}${body}];\n`);

console.log(`Wrote ${blocks.length} species (from ${creatures.length} level records).`);
