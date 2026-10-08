/**
 * Compiler-directed literal fixing (2026-10-07, round 7).
 *
 * The field-anchored pass (`migrate-to-enums.mjs`) handles `key: "value"`, which covers the data
 * files. What it cannot see is a literal whose type comes from context — a call argument, a typed
 * declaration, an array element in a `StatusEffectType[]`. Those are exactly the places TypeScript
 * already knows the answer, so this reads its errors instead of guessing:
 *
 *     error TS2322: Type '"back"' is not assignable to type 'GridRow'.
 *     error TS2345: Argument of type '"Fire"' is not assignable to parameter of type 'CreatureType'.
 *
 * Each gives a file, a position, the offending literal and the expected enum, which is everything
 * needed to rewrite it precisely. Edits are applied per file from the LAST position backwards so
 * earlier offsets stay valid, then the compiler is re-run until it stops reporting this class of
 * error.
 *
 * Usage: node scripts/fix-enum-literals.mjs [--dry]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const MEMBERS = {
  Rarity: { Common: "Common", Uncommon: "Uncommon", Rare: "Rare", SuperRare: "SuperRare", Legendary: "Legendary", Mythical: "Mythical" },
  CreatureType: Object.fromEntries(
    ["Fire", "Water", "Electric", "Toxic", "Flying", "Rock", "Grass", "Bug", "Steel", "Dragon", "Ghost", "Fighting", "Curio", "NULL", "All"].map((v) => [v, v]),
  ),
  DamageChannel: { Direct: "Direct", Burn: "Burn", Poison: "Poison", Shock: "Shock" },
  StatusEffectType: { Burn: "Burn", Poison: "Poison", Shock: "Shock", Shield: "Shield" },
  AbilityTrigger: {
    Ongoing: "Ongoing", "On Cast": "OnCast", "On Battle Start": "OnBattleStart",
    "On Bought": "OnBought", "On Victory": "OnVictory", "On Knocked Out": "OnKnockedOut",
    "On Knockout": "OnKnockout", "On Trinket Gained": "OnTrinketGained",
    "On Item Used": "OnItemUsed", "On Battle Lost": "OnBattleLost",
  },
  ModifierStat: {
    damageFlatAdd: "DamageFlatAdd", cooldownFlatAddSeconds: "CooldownFlatAddSeconds",
    cooldownSpeedAdd: "CooldownSpeedAdd", burnAmountAdd: "BurnAmountAdd",
    poisonAmountAdd: "PoisonAmountAdd", shockAmountAdd: "ShockAmountAdd",
    shieldAmountAdd: "ShieldAmountAdd", multicastAdd: "MulticastAdd", healAmountAdd: "HealAmountAdd",
  },
  GridRow: { back: "Back", front: "Front" },
  RegionId: { pantra: "Pantra", jinto: "Jinto" },
  TimelineEventKind: { attack: "Attack", trigger: "Trigger", statusTick: "StatusTick", shockProc: "ShockProc", ongoingChange: "OngoingChange" },
  EventLabel: { OnCast: "OnCast", OnBattleStart: "OnBattleStart", OnVictory: "OnVictory", OnKnockout: "OnKnockout" },
  StatChangeStat: { cooldownSpeed: "CooldownSpeed", damage: "Damage", multicast: "Multicast", cooldownFlatSeconds: "CooldownFlatSeconds" },
  StatColorKey: { damage: "Damage", burn: "Burn", poison: "Poison", shock: "Shock", shield: "Shield", heal: "Heal", multicast: "Multicast" },
  MultiplierScope: { damage: "Damage", status: "Status", all: "All" },
};

/** `Type '"back"' is not assignable to type 'GridRow'` -> the enum name, stripped of unions. */
function enumFrom(expected) {
  for (const raw of expected.split("|").map((s) => s.trim().replace(/^'|'$/g, ""))) {
    // `StatChangeStat` and `StatChangeStat.Damage` both name the same enum.
    const part = raw.split(".")[0];
    if (MEMBERS[part]) return part;
  }
  return null;
}

function tscErrors() {
  try {
    execSync("npx tsc -p tsconfig.app.json --noEmit", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return [];
  } catch (e) {
    return String(e.stdout ?? "").split("\n");
  }
}

const dry = process.argv.includes("--dry");
const PATTERNS = [
  /^(.+?)\((\d+),(\d+)\): error TS2322: Type '"(.*)"' is not assignable to type '(.+)'\.$/,
  /^(.+?)\((\d+),(\d+)\): error TS2345: Argument of type '"(.*)"' is not assignable to parameter of type '(.+)'\.$/,
  /^(.+?)\((\d+),(\d+)\): error TS2820: Type '"(.*)"' is not assignable to type '(.+)'\. Did you mean .*$/,
  /^(.+?)\((\d+),(\d+)\): error TS2769: .*$/, // overload mismatch: skipped, reported
];

let round = 0;
let totalFixed = 0;
for (;;) {
  round++;
  const lines = tscErrors();
  /** file -> [{ line, col, value, enumName }] */
  const byFile = new Map();
  let unmatched = 0;

  for (const line of lines) {
    if (!line.includes("error TS")) continue;
    let m = PATTERNS[0].exec(line) ?? PATTERNS[1].exec(line) ?? PATTERNS[2].exec(line);
    if (!m) {
      unmatched++;
      continue;
    }
    const [, file, ln, col, value, expected] = m;
    const enumName = enumFrom(expected);
    if (!enumName || !MEMBERS[enumName][value]) {
      unmatched++;
      continue;
    }
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push({ line: +ln, col: +col, value, enumName });
  }

  if (byFile.size === 0) {
    console.log(`round ${round}: nothing more to fix (${unmatched} unrelated error line(s) remain)`);
    break;
  }

  let fixed = 0;
  for (const [file, edits] of byFile) {
    const src = readFileSync(file, "utf8").split("\n");
    // Last position first, so earlier column offsets stay valid within a line.
    edits.sort((a, b) => b.line - a.line || b.col - a.col);
    for (const { line, col, value, enumName } of edits) {
      const text = src[line - 1];
      const lit = `"${value}"`;
      /*
       * TypeScript reports TS2322 at the start of the PROPERTY ASSIGNMENT, not at the literal --
       * `row: "back"` is flagged at `row`, four characters early. So search forward from the
       * reported column rather than requiring an exact hit, and take the first occurrence.
       */
      const at = text.indexOf(lit, col - 1);
      if (at === -1) continue; // already rewritten, or the literal moved; a later round retries
      src[line - 1] = text.slice(0, at) + `${enumName}.${MEMBERS[enumName][value]}` + text.slice(at + lit.length);
      fixed++;
    }
    if (!dry) writeFileSync(file, src.join("\n"));
  }
  totalFixed += fixed;
  console.log(`round ${round}: fixed ${fixed} literal(s) across ${byFile.size} file(s)`);
  if (dry || fixed === 0) break;
  if (round > 25) {
    console.log("stopping: too many rounds");
    break;
  }
}
console.log(`\ntotal literals rewritten: ${totalFixed}`);
