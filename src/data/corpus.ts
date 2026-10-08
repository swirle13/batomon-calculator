import type { Corpus, CreatureRecord, Rarity, TeamConfiguration } from "./types";
import { creatures } from "./creatures";
import { trainers } from "./trainers";
import { trinkets } from "./trinkets";
import { items } from "./items";
import { SHINY_STATS } from "./shiny";
import { creatureHasType } from "./typing";
import { deriveAbilityTags } from "./deriveTags";
import { CreatureType } from "./enums";

/**
 * The single assembled corpus lookup object. UI and engine code should import `corpus` from
 * here rather than importing the individual arrays directly (Constitution Principle I — data
 * layer presents one stable surface to its consumers).
 */
/**
 * Ability tags are DERIVED here, at corpus-construction time (2026-10-07, round 7 WI-002).
 *
 * ## The merge rule
 *
 *     effective tags = hand-authored tags, else derived tags
 *
 * Hand-authored wins, and the escape hatch is required rather than defensive: some published
 * abilities cannot be read from prose at any effort. Omnichrome multiplies off an enemy's stats,
 * Mallogre scales "for each Trinket that you own" and Sproach "for each life lost this run" —
 * **inputs this model does not have** — Gildshell grants `Sell Value`, which is not a
 * `ModifierStat`, and Aerophim carries a transform clause no tag expresses. `deriveTags.test.ts`
 * enumerates the survivors with a reason each, and fails if one of them becomes derivable, so the
 * exception list cannot quietly regrow into the hand-maintained array this change removes.
 *
 * ## Why at construction time rather than in a codegen script
 *
 * `scripts/tag-shiny-abilities.mjs` is the precedent for the other choice and carries its flaw:
 * generated tags are correct only as of the last time somebody remembered to run it. Deriving here
 * means a tag cannot drift from the text it came from. The reviewability that codegen's git diff
 * would have given is recovered by a snapshot test over the derived output.
 */
function withDerivedTags(record: CreatureRecord): CreatureRecord {
  if (record.abilityTags.length > 0) return record;
  const derived = deriveAbilityTags(record);
  return derived.length > 0 ? { ...record, abilityTags: derived } : record;
}

export const corpus: Corpus = {
  creatures: creatures.map(withDerivedTags),
  trainers,
  trinkets,
  items,
};

export function getCreatureById(id: string) {
  return corpus.creatures.find((c) => c.id === id) ?? null;
}

/**
 * 2026-10-06 round 5: one representative record per species, for UI listings (search modal,
 * dropdowns, Corpus Browser search/filter) that must show each species exactly once rather
 * than once per level. `corpus.creatures` now holds up to 4 records per species (one per
 * level, since round 5's level 2-4 corpus population) -- level-1 is always present and used as
 * the canonical representative; level-specific stats are resolved separately via
 * `getCreatureByIdAndLevel`/`resolveLevelUp` once a specific placement's level is known.
 */
/**
 * One record per species, SORTED BY NAME (FR-067, 2026-10-06 round 8).
 *
 * The sort is the point: this used to be a bare `filter()`, which preserves **file order** --
 * and `creatures.ts` opens with the six original seed records (Bumblebolt, Formiqueen, Venopuff,
 * Scorchimp, Pebbler, Onsetra) before running alphabetically, so every consumer rendered those six
 * first. Display order must never be an accident of where a record sits in a source file; a corpus
 * edit must not be able to reorder the UI.
 */
export const distinctCreatures: CreatureRecord[] = corpus.creatures
  .filter((c) => c.level === 1)
  .sort((a, b) => a.name.localeCompare(b.name));

/**
 * 2026-10-05 round 2 — level-aware lookup, matching the (id, level) key `simulate()` now
 * requires (data-model.md's lookup-fix amendment). `getCreatureById` above is kept for existing
 * callers that don't yet care about level (every corpus record is still level 1 today).
 */
export function getCreatureByIdAndLevel(id: string, level: number): CreatureRecord | null {
  return corpus.creatures.find((c) => c.id === id && c.level === level) ?? null;
}

/**
 * The stat line actually in play for a placement — the normal record, or its SHINY variant.
 *
 * Round 11 (WI-R11-001). Returns a NEW record rather than mutating, so the corpus stays the
 * immutable published data and "shiny" stays a view of it.
 *
 * A species with no shiny row falls back to its normal line rather than throwing: the site lists
 * shiny stats for 134 of our species, and a creature we have but batodex does not should render as
 * an ordinary creature, not as a crash.
 */
export function resolveCreatureVariant(
  id: string,
  level: number,
  shiny?: boolean,
): CreatureRecord | null {
  return applyShinyOverlay(getCreatureByIdAndLevel(id, level), shiny);
}

/**
 * The shiny overlay as a PURE function of a record you already hold.
 *
 * Kept separate from `resolveCreatureVariant` because the engine is given its corpus as a
 * parameter — `simulate(config, corpus)` is called with an injected fixture in tests. Routing the
 * engine through the id-based lookup made it silently read the GLOBAL corpus instead, which broke
 * every test using a fake creature. The lookup and the overlay are now separable for that reason.
 */
export function applyShinyOverlay(
  base: CreatureRecord | null,
  shiny?: boolean,
): CreatureRecord | null {
  if (!base || !shiny) return base;
  const line = SHINY_STATS[`${base.id}|${base.level}`];
  if (!line) return base;
  return {
    ...base,
    baseDamage: line.baseDamage,
    baseCooldownSeconds: line.baseCooldownSeconds,
    baseMulticast: line.baseMulticast,
    // `??` not `||`: a published healAmount/appliesStatus of 0 is a real value, and a shiny line
    // that drops a status the normal line has must drop it, since shiny can be a downgrade.
    healAmount: line.healAmount,
    appliesStatus: line.appliesStatus ?? [],
    // T252/T252b (FR-101/FR-105): the shiny ability, both for display and for RESOLUTION. Without
    // the tags a shiny Bunchop would read "+60 HP" while the engine computed +50.
    // `?? base.x` not `||`: a species with no published shiny ability keeps its normal one.
    abilityText: line.abilityText ?? base.abilityText,
    abilityTags: line.abilityTags ?? base.abilityTags,
    // T254: the shiny sprite where one exists; 10 species have none and keep the normal art.
    spriteFile: line.spriteFile ?? base.spriteFile,
  };
}

/** True when this species+level has a published shiny stat line to switch to. */
export function hasShinyVariant(id: string, level: number): boolean {
  return SHINY_STATS[`${id}|${level}`] !== undefined;
}

/** Every level the corpus actually has a record for, for a given species id — sorted
 * ascending. Drives the GridPicker level selector so it never offers a level with no backing
 * data (data-model.md: "restricted to levels the corpus actually has a record for"). */
export function getAvailableLevelsFor(id: string): number[] {
  return corpus.creatures
    .filter((c) => c.id === id)
    .map((c) => c.level)
    .sort((a, b) => a - b);
}

export function getTrainerById(id: string) {
  return corpus.trainers.find((t) => t.id === id) ?? null;
}

/** FR-013: search the creature corpus by case-insensitive name substring. Searches
 * `distinctCreatures` (one row per species, round 5) -- never one row per level. */
export function searchCreatures(query: string): CreatureRecord[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return distinctCreatures;
  return distinctCreatures.filter((c) => c.name.toLowerCase().includes(needle));
}

/** FR-013: filter the creature corpus by type and/or rarity (both optional, combined with AND).
 * Filters `distinctCreatures` (round 5) for the same one-row-per-species reason as above. */
export function filterCreatures(criteria: {
  type?: CreatureType;
  rarity?: Rarity;
  /** T230: needed so painted species surface under any type filter. */
  config?: Pick<TeamConfiguration, "paintedCreatureIds">;
}): CreatureRecord[] {
  return distinctCreatures.filter((c) => {
    // T230/FR-086: painted and natively-"All" creatures surface under EVERY type filter. Before
    // this, Omnichrome (types: [CreatureType.All]) matched no filter at all.
    if (criteria.type && !creatureHasType(c, criteria.type, criteria.config)) return false;
    if (criteria.rarity && c.rarity !== criteria.rarity) return false;
    return true;
  });
}
