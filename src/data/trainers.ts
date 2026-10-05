import type { TrainerRecord, SourceRef } from "./types";

const RETRIEVED = "2026-10-05";

const allBatomonListGuide: SourceRef = {
  url: "https://www.batomon-showdown.wiki/batomon/batomon-showdown-all-batomon-list",
  title:
    "Batomon Showdown All Batomon List: Complete Creature Guide, Tier Rankings & Team Tips",
  retrievedAt: RETRIEVED,
};

/**
 * Seed Trainer (Constitution Principle VI — one real, cited example before widening to the
 * full Trainer corpus in tasks.md T044 / User Story 3).
 */
export const trainers: TrainerRecord[] = [
  {
    id: "musician",
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
    sourceRefs: [allBatomonListGuide],
    patch: "reported in community discussion, exact patch version not stated by the source",
  },
];
