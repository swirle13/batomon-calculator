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
  ConfirmableField: {
    shopCost: "ShopCost", abilityText: "AbilityText", evolvesInto: "EvolvesInto",
    rarity: "Rarity", types: "Types", publishedCast: "PublishedCast",
    baseCooldownSeconds: "BaseCooldownSeconds", healAmount: "HealAmount", sellValue: "SellValue",
  },
  TargetKind: {self: "Self", adjacent: "Adjacent", row: "Row", behind: "Behind", above: "Above", inFront: "InFront", allAllies: "AllAllies"},
  AbilityTagKind: {ongoing: "Ongoing", trigger: "Trigger", onEvent: "OnEvent", cooldownSpeedModifier: "CooldownSpeedModifier", statusGrant: "StatusGrant", battleStartStatusFromAllies: "BattleStartStatusFromAllies", chargeOnAllyStatus: "ChargeOnAllyStatus", cooldownSpeedOnAllyCast: "CooldownSpeedOnAllyCast", statFromCount: "StatFromCount", buffOnCast: "BuffOnCast", triggerOnAllyCast: "TriggerOnAllyCast", statMultiplier: "StatMultiplier", statFromTargetStatus: "StatFromTargetStatus", triggerOnAllyTrigger: "TriggerOnAllyTrigger", manualTrigger: "ManualTrigger", gainOnAllyStatus: "GainOnAllyStatus", statFromUniqueTypes: "StatFromUniqueTypes", knockoutAlliesOnBattleStart: "KnockoutAlliesOnBattleStart", statFromStat: "StatFromStat"},
  TypeKind: { element: "Element", wildcard: "Wildcard", placeholder: "Placeholder" },
  AffectedSpeciesKind: { painted: "Painted", smuggled: "Smuggled" },
  Species: { "aegistruct": "Aegistruct", "aerophim": "Aerophim", "aristobat": "Aristobat", "aster": "Aster", "aviarab": "Aviarab", "bambudo": "Bambudo", "basilord": "Basilord", "beetbud": "Beetbud", "beetdown": "Beetdown", "berroon": "Berroon", "blazewing": "Blazewing", "blessom": "Blessom", "blixie": "Blixie", "bonshell": "Bonshell", "boomagon": "Boomagon", "brawlmantis": "Brawlmantis", "brimtoad": "Brimtoad", "bumblebolt": "Bumblebolt", "bunchop": "Bunchop", "cairnage": "Cairnage", "cawnushi": "Cawnushi", "celestia": "Celestia", "cherubble": "Cherubble", "cicadence": "Cicadence", "cinderfly": "Cinderfly", "cinnabark": "Cinnabark", "clawnetic": "Clawnetic", "coalem": "Coalem", "cobrex": "Cobrex", "cordycant": "Cordycant", "cosmivore": "Cosmivore", "craghorn": "Craghorn", "danuki": "Danuki", "dewlotl": "Dewlotl", "dirgefin": "Dirgefin", "dollhime": "Dollhime", "dracana": "Dracana", "draconarch": "Draconarch", "dragonegg": "Dragonegg", "dribblet": "Dribblet", "drumire": "Drumire", "dryadell": "Dryadell", "electranade": "Electranade", "emberpaw": "Emberpaw", "emburn": "Emburn", "emperooze": "Emperooze", "faebloom": "Faebloom", "fernfowl": "Fernfowl", "flarilisk": "Flarilisk", "formiqueen": "Formiqueen", "frillet": "Frillet", "frizzly": "Frizzly", "fumungus": "Fumungus", "furnadon": "Furnadon", "gachapod": "Gachapod", "gaiadrasil": "Gaiadrasil", "galvanine": "Galvanine", "geminiss": "Geminiss", "gemwing": "Gemwing", "gildshell": "Gildshell", "ginsage": "Ginsage", "goldora": "Goldora", "guardiant": "Guardiant", "humbolt": "Humbolt", "ignit": "Ignit", "ironcore": "Ironcore", "joltail": "Joltail", "kappow": "Kappow", "kickrane": "Kickrane", "kindlepot": "Kindlepot", "lamplet": "Lamplet", "leafleap": "Leafleap", "lignite": "Lignite", "lumijel": "Lumijel", "magmalith": "Magmalith", "magmite": "Magmite", "mallogre": "Mallogre", "miasmaw": "Miasmaw", "missingn": "Missingn", "mosslug": "Mosslug", "nekoffin": "Nekoffin", "ninflora": "Ninflora", "noxalith": "Noxalith", "noxnimbus": "Noxnimbus", "null00": "Null00", "null7f": "Null7f", "nullff": "Nullff", "omnichrome": "Omnichrome", "oniclaw": "Oniclaw", "onsetra": "Onsetra", "opalion": "Opalion", "orcana": "Orcana", "ouroblaze": "Ouroblaze", "panbud": "Panbud", "pawsperity": "Pawsperity", "pebbler": "Pebbler", "petrirex": "Petrirex", "pipskull": "Pipskull", "plunderbird": "Plunderbird", "pompummel": "Pompummel", "prismagon": "Prismagon", "puffloon": "Puffloon", "purpleegg": "Purpleegg", "pylong": "Pylong", "pyrokami": "Pyrokami", "pyronade": "Pyronade", "quillustrous": "Quillustrous", "ratacomb": "Ratacomb", "rattleghast": "Rattleghast", "reapra": "Reapra", "rhizuka": "Rhizuka", "rigalord": "Rigalord", "riglet": "Riglet", "rubbin": "Rubbin", "runerock": "Runerock", "saberhorn": "Saberhorn", "sarudo": "Sarudo", "scorchimp": "Scorchimp", "scorubble": "Scorubble", "shelldra": "Shelldra", "shellter": "Shellter", "shikitsune": "Shikitsune", "shogapede": "Shogapede", "shrinell": "Shrinell", "sirenade": "Sirenade", "snapscald": "Snapscald", "spinarai": "Spinarai", "sproach": "Sproach", "sproutquill": "Sproutquill", "stalagrove": "Stalagrove", "steamscuttle": "Steamscuttle", "stellagon": "Stellagon", "stingarde": "Stingarde", "sukoi": "Sukoi", "sunsage": "Sunsage", "swoonet": "Swoonet", "talonite": "Talonite", "tengusto": "Tengusto", "thorntail": "Thorntail", "torrantler": "Torrantler", "toximoth": "Toximoth", "tsunamere": "Tsunamere", "velocect": "Velocect", "vengrieve": "Vengrieve", "venopuff": "Venopuff", "vipair": "Vipair", "voltalith": "Voltalith", "wishwash": "Wishwash", "zephyrex": "Zephyrex" },
  TrainerId: { "black-belt": "BlackBelt", "bug-catcher": "BugCatcher", "burglar": "Burglar", "chef": "Chef", "chemist": "Chemist", "egg-breeder": "EggBreeder", "gamer": "Gamer", "gentleman": "Gentleman", "lucky-girl": "LuckyGirl", "mad-scientist": "MadScientist", "masked-man": "MaskedMan", "monster-ranger": "MonsterRanger", "musician": "Musician", "painter": "Painter", "redhead": "Redhead", "rich-lady": "RichLady", "scavenger": "Scavenger", "shopkeeper": "Shopkeeper", "smuggler": "Smuggler", "swim-coach": "SwimCoach", "treasure-hunter": "TreasureHunter", "twins": "Twins", "youngster": "Youngster" },
  TrinketId: { "alphas_crown": "AlphasCrown", "ancient_plume": "AncientPlume", "arcade_coins": "ArcadeCoins", "barbell": "Barbell", "bargain_bin": "BargainBin", "blitz_bell": "BlitzBell", "blue_incense": "BlueIncense", "boxing_glove": "BoxingGlove", "bug_net": "BugNet", "candy_jar": "CandyJar", "dryads_charm": "DryadsCharm", "earth_crest": "EarthCrest", "echo_bell": "EchoBell", "echo_charm": "EchoCharm", "excalibur": "Excalibur", "fake_diamond": "FakeDiamond", "fancy_sword": "FancySword", "fire_bell": "FireBell", "fire_orb": "FireOrb", "fools_gold": "FoolsGold", "giant_club": "GiantClub", "gold_bar": "GoldBar", "gold_bracelet": "GoldBracelet", "gold_incense": "GoldIncense", "gold_nugget": "GoldNugget", "gold_o_matic": "GoldOMatic", "gold_trophy": "GoldTrophy", "greedy_gloves": "GreedyGloves", "grow_lamp": "GrowLamp", "haste_crown": "HasteCrown", "haste_orb": "HasteOrb", "heros_sword": "HerosSword", "holy_grail": "HolyGrail", "junk": "Junk", "kaleidoscope": "Kaleidoscope", "link_cable": "LinkCable", "locked_box": "LockedBox", "market_license": "MarketLicense", "master_crown": "MasterCrown", "mega_duplicator": "MegaDuplicator", "mega_upgrade_disc": "MegaUpgradeDisc", "membership_card": "MembershipCard", "metal_bat": "MetalBat", "meteorite": "Meteorite", "metronome": "Metronome", "mighty_bell": "MightyBell", "mini_duplicator": "MiniDuplicator", "momentum_flag": "MomentumFlag", "mysterious_charm": "MysteriousCharm", "mysterious_chest": "MysteriousChest", "mysterious_gem": "MysteriousGem", "mysterious_mask": "MysteriousMask", "mystic_incense": "MysticIncense", "piggy_bank": "PiggyBank", "poison_bell": "PoisonBell", "poison_orb": "PoisonOrb", "power_band": "PowerBand", "power_bell": "PowerBell", "power_crown": "PowerCrown", "power_pouch": "PowerPouch", "purple_incense": "PurpleIncense", "quick_bell": "QuickBell", "quick_flag": "QuickFlag", "rainbow_berry": "RainbowBerry", "rainbow_pearl": "RainbowPearl", "rally_flag": "RallyFlag", "razor_beak": "RazorBeak", "repeater_charm": "RepeaterCharm", "research_notes": "ResearchNotes", "rigged_dice": "RiggedDice", "rocket_boots": "RocketBoots", "sapphire_amulet": "SapphireAmulet", "sapphire_ring": "SapphireRing", "scrap_sword": "ScrapSword", "sea_crest": "SeaCrest", "silver_watch": "SilverWatch", "small_club": "SmallClub", "speed_crest": "SpeedCrest", "speed_whistle": "SpeedWhistle", "tempo_charm": "TempoCharm", "terrarium": "Terrarium", "topaz_amulet": "TopazAmulet", "topaz_ring": "TopazRing", "training_weights": "TrainingWeights", "treasure_map": "TreasureMap", "ultra_duplicator": "UltraDuplicator", "upgrade_disc": "UpgradeDisc", "vip_pass": "VipPass", "warhorn": "Warhorn", "winged_crown": "WingedCrown", "winged_fossil": "WingedFossil", "wood_sword": "WoodSword", "zenith_stone": "ZenithStone" },
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
