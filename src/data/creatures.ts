import type { CreatureRecord, SourceRef } from "./types";

/**
 * Seed corpus slice (Constitution Principle VI — a small, real slice before widening to full
 * corpus coverage). Each creature below was chosen to exercise one of the mechanics the engine
 * must prove first: Shock (reactive, non-decaying), Burn (periodic, self-decaying), Poison
 * (periodic, non-decaying), Shield (support/absorption), and an Ongoing/positional ability.
 *
 * Widening this file to the full ~144-entry community dex is tracked as task T043
 * (specs/001-batomon-dps-calculator/tasks.md, User Story 3).
 */

const RETRIEVED = "2026-10-05";

const shockBuildGuide: SourceRef = {
  url: "https://batomonshowdowngame.wiki/guides/shock-build/",
  title: "Batomon Showdown Shock Builds Guide",
  retrievedAt: RETRIEVED,
};

const combatMechanicsGuide: SourceRef = {
  url: "https://batomonshowdowngame.wiki/guides/combat/",
  title: "Batomon Showdown Combat Mechanics",
  retrievedAt: RETRIEVED,
};

const communityDex: SourceRef = {
  url: "https://batomon.net/batomon/",
  title: "Batomon List – All 144 Community Dex Entries",
  retrievedAt: RETRIEVED,
};

const batodexFormiqueen: SourceRef = {
  url: "https://batodex.com/monsters/formiqueen",
  title: "Formiqueen - Batodex",
  retrievedAt: RETRIEVED,
};

const batodexVenopuff: SourceRef = {
  url: "https://batodex.com/monsters/venopuff",
  title: "Venopuff - Batodex",
  retrievedAt: RETRIEVED,
};

const batodexScorchimp: SourceRef = {
  url: "https://batodex.com/monsters/scorchimp",
  title: "Scorchimp - Batodex",
  retrievedAt: RETRIEVED,
};

const poisonBuildGuide: SourceRef = {
  url: "https://batomon-showdown-wiki.wiki/builds/batomon-showdown-poison-build",
  title: "Batomon Showdown Poison Build: The Complete Meta Guide",
  retrievedAt: RETRIEVED,
};

const patchNotesBreakdown: SourceRef = {
  url: "https://batomon-showdown-wiki.wiki/updates/batomon-showdown-patch-notes",
  title: "Batomon Showdown Patch Notes: Balance & Meta Breakdown",
  retrievedAt: RETRIEVED,
};

const tierListGuide: SourceRef = {
  url: "https://batomonshowdowngame.wiki/tier-list/batomon/",
  title: "Batomon Showdown Batomon Tier List",
  retrievedAt: RETRIEVED,
};

export const creatures: CreatureRecord[] = [
  {
    id: "bumblebolt",
    name: "Bumblebolt",
    rarity: "Common",
    types: ["Bug", "Electric"],
    level: 1,
    shopCost: 10,
    baseCooldownSeconds: 2.5,
    baseDamage: 3,
    damageType: "Direct",
    appliesStatus: [{ type: "Shock", amount: 1 }],
    abilityText:
      "Deals 3 direct damage every 2.5 seconds and applies 1 Shock. \"The poster Common: 2.5s, Shock, cheap.\"",
    abilityTags: [
      { kind: "statusGrant", target: { kind: "self" }, status: "Shock", amount: 1 },
    ],
    sourceRefs: [shockBuildGuide, communityDex, tierListGuide],
    patch: "Balance 24 / 1.2.0 (community-imported build)",
  },
  {
    id: "formiqueen",
    name: "Formiqueen",
    rarity: "Rare",
    types: ["Bug"],
    level: 1,
    shopCost: 25,
    baseCooldownSeconds: 4.0,
    baseDamage: 60,
    damageType: "Direct",
    abilityText: "Ongoing: Adjacent Common allies have +25% Cooldown Speed.",
    abilityTags: [
      {
        kind: "ongoing",
        target: { kind: "adjacent", sameTeamOnly: true },
        effect: { statChange: { stat: "cooldownSpeed", amount: 0.25 } },
      },
      { kind: "cooldownSpeedModifier", target: { kind: "adjacent", sameTeamOnly: true }, amount: 0.25 },
    ],
    sourceRefs: [batodexFormiqueen, combatMechanicsGuide, tierListGuide],
    patch: "post-nerf value (25/50/75% by level, down from 33/67/100%); Balance 24 / 1.2.0 imported build",
    conflicts: [
      {
        field: "abilityTags[0].target.typeFilter",
        values: [
          {
            value: "Common only (adjacent Common allies)",
            sourceRefs: [batodexFormiqueen, combatMechanicsGuide],
          },
        ],
        resolution:
          "No disagreement on the Common-only filter itself; recorded because the exact " +
          "cooldown-speed value differs by creature LEVEL (25/50/75%), not by source — this " +
          "record stores the level-1 value and the per-level progression in prose until the " +
          "data model grows a per-level stat table (see tasks.md US3 widening pass).",
      },
    ],
  },
  {
    id: "venopuff",
    name: "Venopuff",
    rarity: "Common",
    types: ["Toxic"],
    level: 1,
    shopCost: 15,
    baseCooldownSeconds: 3.5,
    baseDamage: null,
    damageType: null,
    appliesStatus: [{ type: "Poison", amount: 4 }],
    abilityText:
      "Applies 4 Poison per cast (scaling to 8 at level 2 and 12 at level 3). No separate direct-damage line is published for this creature.",
    abilityTags: [
      { kind: "statusGrant", target: { kind: "self" }, status: "Poison", amount: 4 },
    ],
    sourceRefs: [batodexVenopuff, poisonBuildGuide, communityDex],
    patch: "Balance 24 / 1.2.0 (community-imported build)",
    conflicts: [
      {
        field: "shopCost",
        values: [
          { value: 15, sourceRefs: [batodexVenopuff] },
          {
            value: 10,
            sourceRefs: [poisonBuildGuide],
          },
        ],
        resolution:
          "Adopted $15 (batodex.com, matches the community dex table's $15 figure); the Poison " +
          "Build guide's $10 is recorded here as a conflicting value rather than silently dropped.",
      },
    ],
  },
  {
    id: "scorchimp",
    name: "Scorchimp",
    rarity: "Common",
    types: ["Fire"],
    level: 1,
    shopCost: 10,
    baseCooldownSeconds: 5.5,
    baseDamage: 5,
    damageType: "Direct",
    appliesStatus: [{ type: "Burn", amount: 5 }],
    abilityText: "Deals 5 direct damage and applies 5 Burn every 5.5 seconds. Evolves at level 3 into Sunsage.",
    abilityTags: [
      { kind: "statusGrant", target: { kind: "self" }, status: "Burn", amount: 5 },
    ],
    evolvesInto: "sunsage",
    sourceRefs: [batodexScorchimp, communityDex],
    patch: "Balance 24 / 1.2.0 (community-imported build)",
  },
  {
    id: "pebbler",
    name: "Pebbler",
    rarity: "Common",
    types: ["Rock"],
    level: 1,
    shopCost: 15,
    baseCooldownSeconds: 4.0,
    baseDamage: null,
    damageType: null,
    appliesStatus: [{ type: "Shield", amount: 15 }],
    abilityText: "+15 Shield for this battle.",
    abilityTags: [
      { kind: "statusGrant", target: { kind: "self" }, status: "Shield", amount: 15 },
    ],
    unconfirmedFields: ["baseDamage", "damageType"],
    sourceRefs: [communityDex, patchNotesBreakdown],
    patch:
      "Cooldown shown is the current (post Hotfix 0.6.1) value — Demo Patch 0.6.0 had briefly " +
      "lowered it from 5.5s to 4s alongside a cost drop to $10 that Hotfix 0.6.1 then reverted " +
      "to $15; cooldown stayed at 4s. Shield amount from the Balance 24 / 1.2.0 imported dex.",
    conflicts: [
      {
        field: "baseCooldownSeconds",
        values: [
          { value: 5.5, sourceRefs: [patchNotesBreakdown] },
          { value: 4.0, sourceRefs: [patchNotesBreakdown] },
        ],
        resolution:
          "Both values come from the same patch-notes page describing a change over time " +
          "(5.5s pre-0.6.0 → 4s post-0.6.0), not a same-moment disagreement between two sources. " +
          "Adopted 4.0s as the current value; 5.5s retained here as the historical pre-patch value.",
      },
    ],
  },
  {
    id: "onsetra",
    name: "Onsetra",
    rarity: "Legendary",
    types: ["Dragon"],
    level: 1,
    shopCost: 50,
    baseCooldownSeconds: null,
    baseDamage: null,
    damageType: null,
    abilityText: "Ongoing: the ally behind applies its Ongoing abilities 1 additional time.",
    abilityTags: [
      {
        kind: "ongoing",
        target: { kind: "behind" },
        effect: { extraOngoingApplications: 1 },
      },
    ],
    unconfirmedFields: ["baseCooldownSeconds", "baseDamage", "damageType"],
    sourceRefs: [communityDex, combatMechanicsGuide, tierListGuide],
    patch: "Balance 24 / 1.2.0 (community-imported build) — cooldown/damage not published in sources reviewed",
  },
];
