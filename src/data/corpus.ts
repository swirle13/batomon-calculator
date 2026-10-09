import type {
  AbilityTag,
  Corpus,
  CreatureLevel,
  CreatureRecord,
  CreatureSpecies,
  ItemRecord,
  Rarity,
  TeamConfiguration,
} from "./types";
import { CREATURE_LEVELS } from "./types";
import { creatures } from "./creatures";
import { trainers } from "./trainers";
import { trinkets } from "./trinkets";
import { items } from "./items";
import { getShinyLine } from "./shiny";
import { creatureHasType } from "./typing";
import { deriveAbilityTags } from "./deriveTags";
import { CreatureType } from "./enums";

import type { ItemId, Species } from "./ids";
import { DamageChannel } from "./enums";

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
  creatures,
  trainers,
  trinkets,
  items,
};

// ---------------------------------------------------------------------------
// Species -> level records
// ---------------------------------------------------------------------------

/**
 * Materialise one level of a species (2026-10-08).
 *
 * `creatures.ts` stores level 1 inline and levels 2-4 as overrides; this applies one of those
 * overrides to produce the flat `CreatureRecord` that the engine, the cards and the pickers have
 * always read. Pure, so a caller can resolve a fixture it built itself.
 */
export function resolveSpeciesLevel(species: CreatureSpecies, level: CreatureLevel): CreatureRecord {
  const { levels, ...base } = species;
  return level === 1 ? { ...base, level } : { ...base, ...levels?.[level], level };
}

/**
 * Every (species, level) record, resolved once and cached per corpus.
 *
 * Tags are derived HERE rather than on the stored species, because `deriveAbilityTags` reads
 * `abilityText` — which is the single most level-dependent field in the corpus (103 of 149 species
 * publish different text per level). Deriving before the override was applied would have given all
 * four levels the level 1 ability.
 *
 * Keyed on the corpus OBJECT, not built against the module-level `corpus`, because the engine is
 * handed its corpus as a parameter and tests inject fixtures — the same reasoning as
 * `applyShinyOverlay`. A `WeakMap` so an injected fixture is collectable with its test.
 */
const recordsByCorpus = new WeakMap<Corpus, Map<string, CreatureRecord>>();

function levelIndex(source: Corpus): Map<string, CreatureRecord> {
  let index = recordsByCorpus.get(source);
  if (!index) {
    index = new Map();
    for (const species of source.creatures) {
      for (const level of CREATURE_LEVELS) {
        index.set(`${species.id}|${level}`, withDerivedTags(resolveSpeciesLevel(species, level)));
      }
    }
    recordsByCorpus.set(source, index);
  }
  return index;
}

/**
 * The level-aware lookup the ENGINE uses, against whichever corpus it was handed.
 *
 * Replaces the `getCreatureByIdAndLevel(x, y)` that was written out by
 * hand at a dozen call sites. Those stopped compiling when `Corpus.creatures` became one entry per
 * species, which is how they were all found.
 */
export function findCreature(source: Corpus, id: string, level: number): CreatureRecord | null {
  return levelIndex(source).get(`${id}|${level}`) ?? null;
}

/** Whether `source` has a record for this exact (species, level). */
export function hasCreatureRecord(source: Corpus, id: string, level: number): boolean {
  return levelIndex(source).has(`${id}|${level}`);
}

/**
 * All 596 resolved (species, level) records, in species-then-level order.
 *
 * For corpus-WIDE passes only — integrity checks, coverage audits, the ability-text and
 * derived-tag guards. Anything looking up a specific creature wants `findCreature` instead.
 */
export function allCreatureRecords(source: Corpus = corpus): CreatureRecord[] {
  return [...levelIndex(source).values()];
}

/**
 * The same records with HAND-AUTHORED tags only — `deriveAbilityTags` not applied.
 *
 * Exists so the derivation guard can measure before-and-after: `allCreatureRecords` is the merged
 * view, and comparing it against itself would report that derivation changed nothing. Before the
 * collapse that test read the raw `creatures` array directly, which was the 596 records; now that
 * `creatures` is 149 species, this reproduces what it used to see.
 */
export function rawCreatureRecords(source: Corpus = corpus): CreatureRecord[] {
  return source.creatures.flatMap((species) =>
    CREATURE_LEVELS.map((level) => resolveSpeciesLevel(species, level)),
  );
}

/** The species entry as STORED, without resolving a level. */
export function getSpeciesById(id: Species): CreatureSpecies | null {
  return corpus.creatures.find((c) => c.id === id) ?? null;
}

export function getCreatureById(id: Species) {
  return getCreatureByIdAndLevel(id, 1);
}

/** One item by id, or `null`. Mirrors `getCreatureById` (T046). */
export function getItemById(id: ItemId): ItemRecord | null {
  return corpus.items.find((i) => i.id === id) ?? null;
}

/**
 * 2026-10-06 round 5: one representative record per species, for UI listings (search modal,
 * dropdowns, Corpus Browser search/filter) that must show each species exactly once rather
 * than once per level. The corpus holds four level records per species (one per
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
  .map((species) => getCreatureByIdAndLevel(species.id, 1)!)
  .sort((a, b) => a.name.localeCompare(b.name));

/**
 * 2026-10-05 round 2 — level-aware lookup, matching the (id, level) key `simulate()` now
 * requires (data-model.md's lookup-fix amendment). `getCreatureById` above is kept for existing
 * callers that don't yet care about level (every corpus record is still level 1 today).
 */
export function getCreatureByIdAndLevel(id: Species, level: number): CreatureRecord | null {
  return findCreature(corpus, id, level);
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
  id: Species,
  level: number,
  shiny?: boolean,
): CreatureRecord | null {
  return applyShinyOverlay(getCreatureByIdAndLevel(id, level), shiny);
}

/**
 * The tags a shiny record should carry when its stat line publishes text but no tags of its own.
 *
 * Inheriting the normal form's tags is right for a HAND-AUTHORED tag: those encode something no
 * rule can read, so the normal one is the best available reading of the shiny text too. It is
 * wrong for a DERIVED tag, which is by definition a reading of the normal text — and the shiny
 * line has just replaced that text. Shiny magnitudes differ from normal ones almost everywhere, so
 * the inherited tag is not merely stale but numerically wrong: shiny Lignite published "24 times
 * this monster's Burn" while carrying the normal form's 20, and the same gap sat on Brawlmantis,
 * Ginsage, Kickrane and Ninflora. This is the `abilityText`/`abilityTags` split that T252b fixed
 * for the species `scripts/tag-shiny-abilities.mjs` reached, reaching the rest of them.
 *
 * Falls back to the normal tags when the shiny text derives nothing — Aster's does — because
 * dropping a working tag would be a worse answer than keeping an approximate one.
 */
function shinyAbilityTags(base: CreatureRecord, shinyText: string | undefined): AbilityTag[] {
  if (shinyText === undefined || shinyText === base.abilityText) return base.abilityTags;
  const fromNormal = deriveAbilityTags({ ...base, abilityTags: [] });
  const wasDerived =
    fromNormal.length > 0 && JSON.stringify(fromNormal) === JSON.stringify(base.abilityTags);
  if (!wasDerived) return base.abilityTags;
  const fromShiny = deriveAbilityTags({ ...base, abilityTags: [], abilityText: shinyText });
  return fromShiny.length > 0 ? fromShiny : base.abilityTags;
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
  const line = getShinyLine(base.id, base.level);
  if (!line) return base;
  return {
    ...base,
    /*
     * The shiny line publishes a damage NUMBER and no channel, which under the old
     * `(baseDamage, damageType)` pair meant a shiny could set one without the other -- exactly the
     * state the pair was supposed to exclude, held together only by the UI reading just `damage`.
     * With one optional field the override is atomic, and the channel question has to be answered
     * here, once, instead of being left implicit: a shiny keeps the normal line's channel, and a
     * shiny that GRANTS a cast the normal line lacks deals it directly.
     */
    publishedCast:
      line.baseDamage === null
        ? undefined
        : { damage: line.baseDamage, channel: base.publishedCast?.channel ?? DamageChannel.Direct },
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
    abilityTags: line.abilityTags ?? shinyAbilityTags(base, line.abilityText),
    // T254: the shiny sprite where one exists; 10 species have none and keep the normal art.
    spriteFile: line.spriteFile ?? base.spriteFile,
  };
}

/** True when this species+level has a published shiny stat line to switch to. */
export function hasShinyVariant(id: Species, level: number): boolean {
  return getShinyLine(id, level) !== null;
}

/** Every level the corpus actually has a record for, for a given species id — sorted
 * ascending. Drives the GridPicker level selector so it never offers a level with no backing
 * data (data-model.md: "restricted to levels the corpus actually has a record for"). */
export function getAvailableLevelsFor(id: string): number[] {
  return corpus.creatures.some((c) => c.id === id) ? [...CREATURE_LEVELS] : [];
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
