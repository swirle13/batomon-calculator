import type { TrainerRecord, SourceRef } from "./types";
import { ConfirmableField } from "./enums";

const RETRIEVED = "2026-10-05";

const allBatomonListGuide: SourceRef = {
  url: "https://www.batomon-showdown.wiki/batomon/batomon-showdown-all-batomon-list",
  title:
    "Batomon Showdown All Batomon List: Complete Creature Guide, Tier Rankings & Team Tips",
  retrievedAt: RETRIEVED,
};

const trainersAbilitiesGuide: SourceRef = {
  url: "https://batomon.net/trainers/",
  title: "Batomon Showdown Trainers – Abilities and Guides",
  retrievedAt: RETRIEVED,
};

const trainerTierListPatch120: SourceRef = {
  url: "https://batomonshowdown.org/tier-list/trainer-tier-list/",
  title: "Batomon Showdown Trainer Tier List — Pantra & Jinto (Patch 1.2.0)",
  retrievedAt: RETRIEVED,
};

const trainersAndPicksGuide: SourceRef = {
  url: "https://batomonshowdown-game.wiki/guide/trainers-and-picks/",
  title: "Batomon Showdown Trainers: Every Ability and Which to Pick",
  retrievedAt: RETRIEVED,
};

const trainerGuidePlayersPage: SourceRef = {
  url: "https://batomonshowdowngame.wiki/players/trainer-guide/",
  title: "Batomon Showdown Trainer Abilities",
  retrievedAt: RETRIEVED,
};

const PATCH_120 = "1.2.0";
/** The six trainers whose names were confirmed in the 1.0.0 patch notes with no official
 * ability text; the text below is secondary-wiki community/observational sourcing — see
 * research.md D1 — so it is flagged via `unconfirmedFields` rather than presented at the same
 * confidence as a directly-cited official ability. */
const NAMED_ONLY_1_0_0 = "1.0.0 (named only; ability text is secondary-wiki sourcing, see research.md D1)";

/**
 * Full-roster widening pass (tasks.md T070, round 2, 2026-10-05) — supersedes the single
 * "Musician" seed. Roster + ability text per research.md D1, cross-referenced across 4
 * independent sources. Two disagreements found between sources are recorded as `FieldConflict`s
 * rather than silently resolved (Constitution Principle IV): Chemist's base Poison bonus and
 * Redhead's base Burn bonus.
 */
export const trainers: TrainerRecord[] = [
  {
    id: "musician",
    spriteFile: "musician.png",
    name: "Musician",
    abilityText:
      "Passive grants a 150% increase to Shock effects if you only run one Shock minion. " +
      "Community discussion (cited source) notes this is considered situational by some " +
      "players compared to flat always-useful bonuses (e.g. +2 Fire, +3 Frost).",
    // NOTE: a percentage *multiplier* on an existing status's magnitude doesn't map cleanly
    // onto the current AbilityTag vocabulary (every `statusGrant` tag is a flat layer amount).
    // Left untagged rather than mis-encoded; the engine falls back to `abilityText` display
    // only for this record until data-model.md grows a multiplier-effect tag.
    abilityTags: [],
    sourceRefs: [allBatomonListGuide, trainersAbilitiesGuide],
    patch: "reported in community discussion, exact patch version not stated by the source",
  },
  {
    id: "black-belt",
    spriteFile: "black-belt.png",
    name: "Black Belt",
    abilityText:
      "On Battle Start: if you have exactly 1 Fighting monster on your team, activate its " +
      "On Victory ability immediately.",
    abilityTags: [],
    unconfirmedFields: [ConfirmableField.AbilityText],
    sourceRefs: [trainersAbilitiesGuide, trainersAndPicksGuide],
    patch: NAMED_ONLY_1_0_0,
  },
  {
    id: "bug-catcher",
    spriteFile: "bug-catcher.png",
    name: "Bug Catcher",
    abilityText: "The first Bug monster you buy each day/round is free.",
    abilityTags: [],
    sourceRefs: [trainersAbilitiesGuide, trainerTierListPatch120, trainersAndPicksGuide, trainerGuidePlayersPage],
    patch: "demo era (confirmed in official itch demo build, captured 2026-09-27)",
  },
  {
    id: "burglar",
    spriteFile: "burglar.png",
    name: "Burglar",
    abilityText: "Trinket gifts only offer 2 choices, but you can take both of them.",
    abilityTags: [],
    unconfirmedFields: [ConfirmableField.AbilityText],
    sourceRefs: [trainersAbilitiesGuide],
    patch: NAMED_ONLY_1_0_0,
  },
  {
    id: "chef",
    spriteFile: "chef.png",
    name: "Chef",
    abilityText:
      "Your single-typed monsters gain Fire typing. Your Fire monsters have +2 Burn.",
    abilityTags: [],
    sourceRefs: [trainersAbilitiesGuide, trainersAndPicksGuide, trainerGuidePlayersPage],
    patch: "Steam store description (demo era)",
  },
  {
    id: "chemist",
    spriteFile: "chemist.png",
    name: "Chemist",
    abilityText:
      "Your Toxic monsters have +3 Poison. When any monster levels up, increase this effect " +
      "by +1 Poison.",
    abilityTags: [],
    sourceRefs: [trainersAbilitiesGuide, trainersAndPicksGuide],
    patch: PATCH_120,
    conflicts: [
      {
        field: "abilityText (base Poison bonus)",
        values: [
          { value: "+3 Poison", sourceRefs: [trainersAbilitiesGuide] },
          { value: "+1 Poison", sourceRefs: [trainersAndPicksGuide] },
        ],
        resolution:
          "Both sources agree on the +1-per-level-up scaling; the base amount disagrees and is " +
          "left unresolved — shown as a recorded conflict rather than picking one.",
      },
    ],
  },
  {
    id: "egg-breeder",
    spriteFile: "egg-breeder.png",
    name: "Egg Breeder",
    abilityText: "Gain a Purple Egg that hatches into a level 2 Super Rare monster in 5 days.",
    abilityTags: [],
    sourceRefs: [trainersAbilitiesGuide, trainersAndPicksGuide],
    patch: PATCH_120,
  },
  {
    id: "gamer",
    spriteFile: "gamer.png",
    name: "Gamer",
    abilityText: "On day 9, gain a Mythical monster and $30.",
    abilityTags: [],
    sourceRefs: [trainersAbilitiesGuide, trainersAndPicksGuide],
    patch: PATCH_120,
  },
  {
    id: "gentleman",
    spriteFile: "gentleman.png",
    name: "Gentleman",
    abilityText: "From day 4 onwards, your shop no longer stocks Common or Uncommon monsters.",
    abilityTags: [],
    unconfirmedFields: [ConfirmableField.AbilityText],
    sourceRefs: [trainersAbilitiesGuide],
    patch: NAMED_ONLY_1_0_0,
  },
  {
    id: "lucky-girl",
    spriteFile: "lucky-girl.png",
    name: "Lucky Girl",
    abilityText: "SHINY monsters are more likely to appear.",
    abilityTags: [],
    sourceRefs: [trainersAbilitiesGuide],
    patch: PATCH_120,
  },
  {
    id: "mad-scientist",
    spriteFile: "mad-scientist.png",
    name: "Mad Scientist",
    abilityText:
      "On day 7, transform monsters on your active team into random level 1 Legendary monsters.",
    abilityTags: [],
    sourceRefs: [trainersAbilitiesGuide, trainersAndPicksGuide, trainerGuidePlayersPage],
    patch: PATCH_120,
  },
  {
    id: "masked-man",
    spriteFile: "masked-man.png",
    name: "Masked Man",
    abilityText: "Every 4 days, choose a trainer and gain their ability.",
    abilityTags: [],
    sourceRefs: [trainersAbilitiesGuide, trainersAndPicksGuide],
    patch: PATCH_120,
  },
  {
    id: "monster-ranger",
    spriteFile: "monster-ranger.png",
    name: "Monster Ranger",
    abilityText: "Start with an Uncommon monster. Get another copy of that monster every 2 days.",
    abilityTags: [],
    sourceRefs: [trainersAndPicksGuide, trainerTierListPatch120],
    patch: "demo era (official devlog, 2026-04-27)",
  },
  {
    id: "painter",
    spriteFile: "painter.png",
    name: "Painter",
    abilityText:
      "Nine random species are painted with every type. Whenever a painted species appears in " +
      "your shop or on your board, it counts as every type for any effect that checks typing.",
    // 2026-10-06 (T228 / FR-085). The previous text was a DIFFERENT ABILITY entirely, taken from a
    // fan trainer sheet; the record already carried `unconfirmedFields: ["abilityText"]`, so the
    // doubt was recorded correctly and simply never followed up. Corrected against two independent
    // sources plus the user's own play — the full before/after is in research.md M1, which is where
    // provenance belongs. (The superseded text was briefly carried on the record and shown on the
    // card; removed 2026-10-06 as clutter, since nothing read it once the card stopped rendering it.)
    abilityTags: [],
    sourceRefs: [trainerGuidePlayersPage],
    patch: NAMED_ONLY_1_0_0,
  },
  {
    id: "redhead",
    spriteFile: "redhead.png",
    name: "Redhead",
    abilityText: "On Victory: give your Fire monsters +3 Burn permanently.",
    abilityTags: [],
    sourceRefs: [trainersAbilitiesGuide, trainersAndPicksGuide],
    patch: "demo era (official itch demo capture, 2026-09-27)",
    conflicts: [
      {
        field: "abilityText (Burn amount)",
        values: [
          { value: "+3 Burn", sourceRefs: [trainersAbilitiesGuide] },
          { value: "+2 Burn", sourceRefs: [trainersAndPicksGuide, trainerTierListPatch120] },
        ],
        resolution: "Two of three sources agree on +2; left as a recorded conflict, not resolved.",
      },
    ],
  },
  {
    id: "rich-lady",
    spriteFile: "rich-lady.png",
    name: "Rich Lady",
    abilityText: "Gain shop rank +2 and $10.",
    abilityTags: [],
    sourceRefs: [trainersAbilitiesGuide, trainersAndPicksGuide],
    patch: PATCH_120,
  },
  {
    id: "scavenger",
    spriteFile: "scavenger.png",
    name: "Scavenger",
    abilityText: "Gain an additional copy of each non-unique Common or Uncommon Trinket from a gift.",
    abilityTags: [],
    unconfirmedFields: [ConfirmableField.AbilityText],
    sourceRefs: [trainersAbilitiesGuide],
    patch: NAMED_ONLY_1_0_0,
  },
  {
    id: "shopkeeper",
    spriteFile: "shopkeeper.png",
    name: "Shopkeeper",
    abilityText: "Your shop stocks items one rarity tier higher, and 15% cheaper.",
    abilityTags: [],
    sourceRefs: [trainersAbilitiesGuide, trainersAndPicksGuide, trainerGuidePlayersPage],
    patch: PATCH_120,
  },
  {
    id: "smuggler",
    spriteFile: "smuggler.png",
    name: "Smuggler",
    abilityText: "Batomon from other regions appear in your shop and cost 25% less.",
    abilityTags: [],
    sourceRefs: [trainersAbilitiesGuide],
    patch: "1.2.0 (added 2026-09-30; exact discount % not in official patch notes themselves)",
    unconfirmedFields: [ConfirmableField.AbilityText],
  },
  {
    id: "swim-coach",
    spriteFile: "swim-coach.png",
    name: "Swim Coach",
    abilityText: "Gain a random Water monster each day.",
    abilityTags: [],
    sourceRefs: [trainersAbilitiesGuide, trainersAndPicksGuide],
    patch: "demo era (official itch demo capture, 2026-09-27)",
  },
  {
    id: "treasure-hunter",
    spriteFile: "treasure-hunter.png",
    name: "Treasure Hunter",
    abilityText: "When you get Trinket gifts, your choices are 1 rarity tier higher.",
    abilityTags: [],
    sourceRefs: [trainersAbilitiesGuide, trainersAndPicksGuide],
    patch: PATCH_120,
  },
  {
    id: "twins",
    spriteFile: "twins.png",
    name: "Twins",
    abilityText: "When monsters merge into level 3, gain an exact copy with a sell value of 0.",
    abilityTags: [],
    unconfirmedFields: [ConfirmableField.AbilityText],
    sourceRefs: [trainersAbilitiesGuide],
    patch: NAMED_ONLY_1_0_0,
  },
  {
    id: "youngster",
    spriteFile: "youngster.png",
    name: "Youngster",
    abilityText: "Gain 3 free rerolls every day.",
    abilityTags: [],
    sourceRefs: [trainersAbilitiesGuide, trainersAndPicksGuide],
    patch: PATCH_120,
  },
];
