import type { TrainerRecord } from "./types";
import { TrainerId } from "./ids";

/**
 * Full-roster widening pass (tasks.md T070, round 2, 2026-10-05) — supersedes the single
 * "Musician" seed. Roster + ability text per research.md D1, cross-referenced across 4
 * independent sources.
 */
export const trainers: TrainerRecord[] = [
  {
    id: TrainerId.Musician,
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
  },
  {
    id: TrainerId.BlackBelt,
    spriteFile: "black-belt.png",
    name: "Black Belt",
    abilityText:
      "On Battle Start: if you have exactly 1 Fighting monster on your team, activate its " +
      "On Victory ability immediately.",
    abilityTags: [],
  },
  {
    id: TrainerId.BugCatcher,
    spriteFile: "bug-catcher.png",
    name: "Bug Catcher",
    abilityText: "The first Bug monster you buy each day/round is free.",
    abilityTags: [],
  },
  {
    id: TrainerId.Burglar,
    spriteFile: "burglar.png",
    name: "Burglar",
    abilityText: "Trinket gifts only offer 2 choices, but you can take both of them.",
    abilityTags: [],
  },
  {
    id: TrainerId.Chef,
    spriteFile: "chef.png",
    name: "Chef",
    abilityText:
      "Your single-typed monsters gain Fire typing. Your Fire monsters have +2 Burn.",
    abilityTags: [],
  },
  {
    id: TrainerId.Chemist,
    spriteFile: "chemist.png",
    name: "Chemist",
    abilityText:
      "Your Toxic monsters have +3 Poison. When any monster levels up, increase this effect " +
      "by +1 Poison.",
    abilityTags: [],
  },
  {
    id: TrainerId.EggBreeder,
    spriteFile: "egg-breeder.png",
    name: "Egg Breeder",
    abilityText: "Gain a Purple Egg that hatches into a level 2 Super Rare monster in 5 days.",
    abilityTags: [],
  },
  {
    id: TrainerId.Gamer,
    spriteFile: "gamer.png",
    name: "Gamer",
    abilityText: "On day 9, gain a Mythical monster and $30.",
    abilityTags: [],
  },
  {
    id: TrainerId.Gentleman,
    spriteFile: "gentleman.png",
    name: "Gentleman",
    abilityText: "From day 4 onwards, your shop no longer stocks Common or Uncommon monsters.",
    abilityTags: [],
  },
  {
    id: TrainerId.LuckyGirl,
    spriteFile: "lucky-girl.png",
    name: "Lucky Girl",
    abilityText: "SHINY monsters are more likely to appear.",
    abilityTags: [],
  },
  {
    id: TrainerId.MadScientist,
    spriteFile: "mad-scientist.png",
    name: "Mad Scientist",
    abilityText:
      "On day 7, transform monsters on your active team into random level 1 Legendary monsters.",
    abilityTags: [],
  },
  {
    id: TrainerId.MaskedMan,
    spriteFile: "masked-man.png",
    name: "Masked Man",
    abilityText: "Every 4 days, choose a trainer and gain their ability.",
    abilityTags: [],
  },
  {
    id: TrainerId.MonsterRanger,
    spriteFile: "monster-ranger.png",
    name: "Monster Ranger",
    abilityText: "Start with an Uncommon monster. Get another copy of that monster every 2 days.",
    abilityTags: [],
  },
  {
    id: TrainerId.Painter,
    spriteFile: "painter.png",
    name: "Painter",
    abilityText:
      "Nine random species are painted with every type. Whenever a painted species appears in " +
      "your shop or on your board, it counts as every type for any effect that checks typing.",
    // 2026-10-06 (T228 / FR-085). The previous text was a DIFFERENT ABILITY entirely, taken from a
    // fan trainer sheet, and the doubt was flagged at the time but never followed up. Corrected
    // against two independent sources plus the user's own play — the full before/after is in
    // research.md M1, which is where that belongs. (The superseded text was briefly carried on the
    // record and shown on the card; removed 2026-10-06 as clutter.)
    abilityTags: [],
  },
  {
    id: TrainerId.Redhead,
    spriteFile: "redhead.png",
    name: "Redhead",
    abilityText: "On Victory: give your Fire monsters +3 Burn permanently.",
    abilityTags: [],
  },
  {
    id: TrainerId.RichLady,
    spriteFile: "rich-lady.png",
    name: "Rich Lady",
    abilityText: "Gain shop rank +2 and $10.",
    abilityTags: [],
  },
  {
    id: TrainerId.Scavenger,
    spriteFile: "scavenger.png",
    name: "Scavenger",
    abilityText: "Gain an additional copy of each non-unique Common or Uncommon Trinket from a gift.",
    abilityTags: [],
  },
  {
    id: TrainerId.Shopkeeper,
    spriteFile: "shopkeeper.png",
    name: "Shopkeeper",
    abilityText: "Your shop stocks items one rarity tier higher, and 15% cheaper.",
    abilityTags: [],
  },
  {
    id: TrainerId.Smuggler,
    spriteFile: "smuggler.png",
    name: "Smuggler",
    abilityText: "Batomon from other regions appear in your shop and cost 25% less.",
    abilityTags: [],
  },
  {
    id: TrainerId.SwimCoach,
    spriteFile: "swim-coach.png",
    name: "Swim Coach",
    abilityText: "Gain a random Water monster each day.",
    abilityTags: [],
  },
  {
    id: TrainerId.TreasureHunter,
    spriteFile: "treasure-hunter.png",
    name: "Treasure Hunter",
    abilityText: "When you get Trinket gifts, your choices are 1 rarity tier higher.",
    abilityTags: [],
  },
  {
    id: TrainerId.Twins,
    spriteFile: "twins.png",
    name: "Twins",
    abilityText: "When monsters merge into level 3, gain an exact copy with a sell value of 0.",
    abilityTags: [],
  },
  {
    id: TrainerId.Youngster,
    spriteFile: "youngster.png",
    name: "Youngster",
    abilityText: "Gain 3 free rerolls every day.",
    abilityTags: [],
  },
];
