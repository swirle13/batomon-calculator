#!/usr/bin/env node
/**
 * Emits `src/data/items.ts` and the `ItemId` block in `src/data/ids.ts` from the committed
 * batodex snapshot (tasks.md T046).
 *
 * Generated rather than hand-typed for the reason `generate-ids.ts` gives: 40 records transcribed
 * by hand is a second copy of the snapshot, free to drift from it. Everything a record states
 * about the GAME is read from the fixture; the only hand-authored part is the `EFFECTS` table
 * below, which is a reading of each item's published text and is therefore a judgement rather
 * than a transcription.
 *
 * Usage: node scripts/build-items.mjs   (after scripts/extract-batodex-items.mjs)
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

/** The same member-name derivation `generate-ids.ts` uses, so the two cannot disagree. */
const member = (id) =>
  id.split(/[^a-zA-Z0-9]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join("")
    .replace(/^(\d)/, "_$1");

/**
 * The 11 items whose published text is a flat, permanent stat grant this engine can apply.
 *
 * The other 29 get no entry. That is a statement about THIS ENGINE, not about the game: rerolls,
 * shop rank, gifts, gold, level-ups, SHINY and "copy the enemy's top middle Batomon" are all real
 * effects with no battle-stat expression, and `Coffee`'s extra On Battle Start activation is a
 * trigger-count change rather than a stat. Same treatment as the 87 trinkets without `effectTags`.
 *
 * Two readings worth stating, because both are decisions rather than transcriptions:
 *
 *  - **"the bottom right monster"** is `front/2`. The front row is the one rendered BELOW the back
 *    row (`ModifierEditor`'s `ROWS`, the team grid's order), and col 2 is the rightmost.
 *  - **Cooldown Speed is stored as a fraction.** "+5%" is `0.05`, matching `ModifierEditor`'s own
 *    `store: (typed) => typed / 100` and the `cooldownSpeedAdd` values already in `trinkets.ts`.
 *    Writing `5` here would be a 100x error the type system cannot catch.
 */
const TEAM = "{ kind: ItemTargetKind.Team }";
const typed = (t) => `{ kind: ItemTargetKind.Team, typeFilter: CreatureType.${t} }`;
const bottomRight = "{ kind: ItemTargetKind.FixedSlot, slot: { row: GridRow.Front, col: 2 } }";
const chosen = (n) => `{ kind: ItemTargetKind.Chosen, count: ${n} }`;

const EFFECTS = {
  // "Give 2 random monsters +5 Damage."
  cake: { target: chosen(2), stats: [["DamageFlatAdd", 5]] },
  // "Give your monsters +5 Damage."
  feast: { target: TEAM, stats: [["DamageFlatAdd", 5]] },
  // "Give the bottom right monster +5% Cooldown Speed. You can use 1 more item(s) today."
  // The second sentence is an item-economy grant with no battle expression, so only the first is
  // encoded -- the full published text is still carried verbatim in `effectText`.
  nana_berry: { target: bottomRight, stats: [["CooldownSpeedAdd", 0.05]] },
  // "Give the bottom right monster +8 Damage. You can use 1 more item(s) today."
  "pom berry": { target: bottomRight, stats: [["DamageFlatAdd", 8]] },
  // "Give your Electric monsters +1 Shock."
  battery_pack: { target: typed("Electric"), stats: [["ShockAmountAdd", 1]] },
  // "Give your Toxic monsters +1 Poison."
  black_sludge: { target: typed("Toxic"), stats: [["PoisonAmountAdd", 1]] },
  // "Give your Fire monsters +1 Burn."
  hot_pepper: { target: typed("Fire"), stats: [["BurnAmountAdd", 1]] },
  // "Give your Water monsters +10 Heal."
  mystic_pearl: { target: typed("Water"), stats: [["HealAmountAdd", 10]] },
  // "Give your Rock monsters +20 Shield."
  shiny_pebble: { target: typed("Rock"), stats: [["ShieldAmountAdd", 20]] },
  // "Your monsters with no abilities gain +15% Cooldown Speed."
  focus_pill: {
    target: "{ kind: ItemTargetKind.Team, abilitylessOnly: true }",
    stats: [["CooldownSpeedAdd", 0.15]],
  },
  // "Give 1 random monsters +1 Multicast." (batodex's own pluralisation)
  black_feather: { target: chosen(1), stats: [["MulticastAdd", 1]] },
};

const items = JSON.parse(
  readFileSync(path.join(ROOT, "src/data/__tests__/fixtures/batodex-items.json"), "utf8"),
);

for (const id of Object.keys(EFFECTS)) {
  if (!items.some((i) => i.id === id)) throw new Error(`EFFECTS names unknown item "${id}"`);
}

const str = (s) => JSON.stringify(s);

function record(item) {
  const effect = EFFECTS[item.id];
  const lines = [
    `    id: ItemId.${member(item.id)},`,
    `    name: ${str(item.name)},`,
    `    effectText: ${str(item.description)},`,
    item.rarity ? `    rarity: Rarity.${item.rarity},` : null,
    `    cost: ${item.cost},`,
    item.uniquePerRound ? `    uniquePerRound: true,` : null,
    effect
      ? `    effect: {\n      target: ${effect.target},\n      stats: [${effect.stats
          .map(([stat, amount]) => `{ stat: ModifierStat.${stat}, amount: ${amount} }`)
          .join(", ")}],\n    },`
      : null,
    `    abilityTags: [],`,
    item.sprite ? `    spriteFile: ${str(path.posix.basename(item.sprite))},` : null,
  ].filter((l) => l !== null);
  return `  {\n${lines.join("\n")}\n  },`;
}

const withEffect = items.filter((i) => EFFECTS[i.id]).length;

const out = `import type { ItemRecord } from "./types";
import { CreatureType, GridRow, ItemTargetKind, ModifierStat, Rarity } from "./enums";
import { ItemId } from "./ids";

/**
 * Full Item corpus (tasks.md T046, 2026-10-08) -- all ${items.length} entries extracted from
 * batodex.com's items listing page, which embeds the complete database as structured JSON for
 * client-side hydration (research.md G2), the same technique used for the creature and trinket
 * corpora. Supersedes the empty stub this file held since round 1.
 *
 * Regenerate: \`node scripts/extract-batodex-items.mjs && node scripts/build-items.mjs\`
 *
 * ## Rarity is derived from \`tier\`, and that is not a shortcut
 *
 * batodex inlines a literal \`rarity\` object on only 7 of the ${items.length} entries; React Server
 * Components deduplicate the other 33 into \`$...\` back-references, which are not data. \`tier\` is
 * the field that survives deduplication, and the 7 literals are one per tier and agree with the
 * mapping exactly -- so the extractor derives all ${items.length} from \`tier\` and ASSERTS the agreement,
 * failing loudly if batodex ever re-tiers an item.
 *
 * ## Only ${withEffect} items have an \`effect\`
 *
 * The other ${items.length - withEffect} are shop/economy mechanics (rerolls, shop rank, gifts, gold), run-state
 * changes with no battle-stat expression (level-ups, turning a monster SHINY, copying an enemy's
 * monster), or Coffee's extra On Battle Start activation. They are real, cited, browsable corpus
 * data with no Use button -- the same treatment 87 of the 93 trinkets already get, and the same
 * reason: this engine simulates one battle, and most of an item's job happens outside it.
 */
export const items: ItemRecord[] = [
${items.map(record).join("\n")}
];
`;

writeFileSync(path.join(ROOT, "src/data/items.ts"), out);

// --- the ItemId block in ids.ts ---
const idsPath = path.join(ROOT, "src/data/ids.ts");
const ids = readFileSync(idsPath, "utf8");
const block = `/** The ${items.length} items. */\nexport enum ItemId {\n${[...items]
  .map((i) => i.id)
  .sort()
  .map((id) => `  ${member(id)} = "${id}",`)
  .join("\n")}\n}\n`;
const replaced = ids.replace(/\/\*\*[^*]*(?:\*(?!\/)[^*]*)*\*\/\nexport enum ItemId \{[^}]*\}\n/, block);
if (replaced === ids) throw new Error("ItemId block not found in ids.ts");
writeFileSync(idsPath, replaced);

console.log(`items: ${items.length} | with effect: ${withEffect}`);
