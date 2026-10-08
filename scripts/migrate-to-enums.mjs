/**
 * One-shot migration: string literals -> enum members (2026-10-07, round 7).
 *
 * Replaces literals only where a known FIELD NAME precedes them, never by matching the string
 * alone. `"Common"` is a rarity in `rarity: "Common"` and a word in an ability text; a blind
 * find-and-replace would have corrupted 149 ability descriptions. Every rule below is anchored to
 * the key it belongs to.
 *
 * Idempotent: a value already written as `Rarity.Common` matches no rule.
 *
 * Usage: node scripts/migrate-to-enums.mjs [--dry] [file ...]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** value -> enum member name, per enum. */
const MEMBERS = {
  ConfirmableField: {
    shopCost: "ShopCost", abilityText: "AbilityText", evolvesInto: "EvolvesInto",
    rarity: "Rarity", types: "Types", publishedCast: "PublishedCast",
    baseCooldownSeconds: "BaseCooldownSeconds", healAmount: "HealAmount", sellValue: "SellValue",
  },
  TargetKind: {self: "Self", adjacent: "Adjacent", row: "Row", behind: "Behind", above: "Above", inFront: "InFront", allAllies: "AllAllies"},
  AbilityTagKind: {ongoing: "Ongoing", trigger: "Trigger", onEvent: "OnEvent", cooldownSpeedModifier: "CooldownSpeedModifier", statusGrant: "StatusGrant", battleStartStatusFromAllies: "BattleStartStatusFromAllies", chargeOnAllyStatus: "ChargeOnAllyStatus", cooldownSpeedOnAllyCast: "CooldownSpeedOnAllyCast", statFromCount: "StatFromCount", buffOnCast: "BuffOnCast", triggerOnAllyCast: "TriggerOnAllyCast", statMultiplier: "StatMultiplier", statFromTargetStatus: "StatFromTargetStatus", triggerOnAllyTrigger: "TriggerOnAllyTrigger", manualTrigger: "ManualTrigger", gainOnAllyStatus: "GainOnAllyStatus", statFromUniqueTypes: "StatFromUniqueTypes", knockoutAlliesOnBattleStart: "KnockoutAlliesOnBattleStart", statFromStat: "StatFromStat"},
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
};

/**
 * Which enum a given object key's string value belongs to.
 *
 * `type` and `stat` are overloaded in the corpus, so they carry a list and the first enum that
 * knows the value wins. That is safe here because the overloaded sets are disjoint in practice:
 * `type` is either a creature type or a status, and no value is both.
 */
const KEY_ENUMS = {
  rarity: ["Rarity"],
  rarityFilter: ["Rarity"],
  types: ["CreatureType"],
  typeFilter: ["CreatureType"],
  damageType: ["DamageChannel"],
  channel: ["DamageChannel"],
  abilityTrigger: ["AbilityTrigger"],
  trigger: ["AbilityTrigger"],
  status: ["StatusEffectType"],
  type: ["StatusEffectType", "CreatureType"],
  stat: ["ModifierStat", "StatChangeStat"],
  sourceStat: ["StatusEffectType", "StatChangeStat"],
  row: ["GridRow"],
  rowFilter: ["GridRow"],
  selectedRegion: ["RegionId"],
  region: ["RegionId"],
  event: ["EventLabel"],
  colorKey: ["StatColorKey"],
  key: ["StatColorKey"],
  kind: ["TargetKind", "AbilityTagKind"],
  id: ["Species", "TrainerId", "TrinketId"],
  creatureId: ["Species"],
  evolvesInto: ["Species"],
  trainerId: ["TrainerId"],
  trinketIds: ["TrinketId"],
  paintedCreatureIds: ["Species"],
  smuggledCreatureIds: ["Species"],
};

/** Resolve a literal to `Enum.Member`, or null when no configured enum owns it. */
function resolve(key, value) {
  for (const enumName of KEY_ENUMS[key] ?? []) {
    const member = MEMBERS[enumName]?.[value];
    if (member) return `${enumName}.${member}`;
  }
  return null;
}

function migrate(source) {
  const used = new Set();

  // `key: "value"` and `key: ["a", "b"]` -- the array form is handled by rewriting each element.
  let out = source.replace(
    /\b([a-zA-Z][a-zA-Z0-9_]*)(\s*:\s*)(\[[^\][]*\]|"(?:[^"\\]|\\.)*")/g,
    (whole, key, sep, rhs) => {
      if (!KEY_ENUMS[key]) return whole;

      if (rhs.startsWith("[")) {
        let touched = false;
        const inner = rhs.replace(/"((?:[^"\\]|\\.)*)"/g, (lit, value) => {
          const r = resolve(key, value);
          if (!r) return lit;
          used.add(r.split(".")[0]);
          touched = true;
          return r;
        });
        return touched ? `${key}${sep}${inner}` : whole;
      }

      const value = rhs.slice(1, -1);
      const r = resolve(key, value);
      if (!r) return whole;
      used.add(r.split(".")[0]);
      return `${key}${sep}${r}`;
    },
  );

  // Comparisons and arguments: `=== "Direct"`, `includes("Grass")`, `filter((x) => x === "Burn")`.
  // Only for values that are UNAMBIGUOUS across every enum, so a bare `"damage"` is left alone.
  const unambiguous = new Map();
  for (const [enumName, members] of Object.entries(MEMBERS)) {
    for (const [value, member] of Object.entries(members)) {
      if (unambiguous.has(value)) unambiguous.set(value, null);
      else unambiguous.set(value, `${enumName}.${member}`);
    }
  }

  out = out.replace(/(===|!==)(\s*)"((?:[^"\\]|\\.)*)"/g, (whole, op, sp, value) => {
    const r = unambiguous.get(value);
    if (!r) return whole;
    used.add(r.split(".")[0]);
    return `${op}${sp}${r}`;
  });

  return { out, used: [...used].sort() };
}

/** Relative specifier from `file` to `src/data/enums`. */
function enumsSpecifier(file) {
  const depth = file.split("/").length - 2; // minus "src" and the filename
  const inData = file.startsWith("src/data/");
  if (inData) return file.includes("__tests__") ? "../enums" : "./enums";
  return `${"../".repeat(depth)}data/enums`;
}

/**
 * Adds a value import for the enums a file now uses.
 *
 * Merges into an existing `import { … } from ".../enums"` when there is one, so re-running cannot
 * produce two import statements for the same module.
 */
function addImport(source, file, used) {
  if (used.length === 0) return source;
  const spec = enumsSpecifier(file);

  const existing = new RegExp(`import \\{([^}]*)\\} from "${spec.replace(/\./g, "\\.")}";`);
  const match = existing.exec(source);
  if (match) {
    const already = match[1].split(",").map((s) => s.trim()).filter(Boolean);
    const merged = [...new Set([...already, ...used])].sort();
    return source.replace(match[0], `import { ${merged.join(", ")} } from "${spec}";`);
  }

  const line = `import { ${used.join(", ")} } from "${spec}";\n`;
  const lines = source.split("\n");
  // After the last top-of-file import, so the new line joins the existing block.
  let last = -1;
  for (let i = 0; i < Math.min(lines.length, 60); i++) {
    if (/^import\b/.test(lines[i])) last = i;
  }
  if (last === -1) return line + source;
  lines.splice(last + 1, 0, line.trimEnd());
  return lines.join("\n");
}

const DEFAULT_TARGETS = ["src"];
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const explicit = args.filter((a) => !a.startsWith("--"));

function files(dir) {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(e) ? [p] : [];
  });
}

const targets = explicit.length > 0 ? explicit : DEFAULT_TARGETS.flatMap(files);
let changed = 0;
for (const file of targets) {
  if (file.endsWith("enums.ts")) continue; // the declarations themselves
  const source = readFileSync(file, "utf8");
  const { out, used } = migrate(source);
  if (out === source) continue;
  changed++;
  console.log(`${file}  [${used.join(", ")}]`);
  if (!dry) writeFileSync(file, addImport(out, file, used));
}
console.log(`\n${changed} file(s) ${dry ? "would change" : "changed"}`);
