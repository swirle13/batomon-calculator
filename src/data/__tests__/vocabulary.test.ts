import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  ABILITY_TRIGGER,
  CREATURE_TYPE,
  CREATURE_TYPES_ASC,
  DAMAGE_CHANNEL,
  FILTERABLE_CREATURE_TYPES,
  RARITY,
  STATUS_EFFECT,
  damageChannelOf,
  isWildcardType,
} from "../vocabularies";
import type { VocabularyMember } from "../vocabularies";
import { RARITIES_ASC, RARITIES_DESC, RARITY_COLORS, rarityLabel } from "../statColors";
import { TYPE_COLORS } from "../typeColors";
import { ABILITY_TRIGGERS, TRIGGER_DEFINITIONS } from "../triggers";
import { allCreatureRecords, getCreatureByIdAndLevel } from "../corpus";
import { AbilityTrigger, DamageChannel } from "../enums";
import { CreatureType, Rarity, StatusEffectType } from "../enums";
import { Species } from "../ids";

/**
 * The vocabulary registries (2026-10-07, round 7 WI-001/003/004/005/006).
 *
 * These tests exist to make the registry's *point* permanent rather than true once. The round was
 * motivated by two shipped defects, both of which were a hand-written list disagreeing with the
 * union it restated — three rarity orderings with inconsistent order (T172), and a rarity key
 * misspelling that silently dropped a guidance chip (round 6, research.md Q3). A registry only
 * prevents those if nothing is allowed to restate it, which is what the drift tests below assert.
 */

/** Every `.ts`/`.tsx` file under `src/`, for the source-level drift assertions. */
function sourceFiles(dir = "src"): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

/** Production source only: tests and the registry itself are allowed to name a vocabulary. */
const files = () =>
  sourceFiles().filter(
    (f) =>
      !f.includes("__tests__") &&
      // The declaration files are allowed to NAME a vocabulary -- that is what they are for, and
      // `enums.ts` documents the dropped `SuddenDeath` member in a comment explaining its removal.
      !f.endsWith("vocabularies.ts") &&
      !f.endsWith("enums.ts"),
  );

describe("vocabulary registries — one declaration each", () => {
  // Widened to the base member shape so all five can be checked in one loop; the per-vocabulary
  // extras (colour, kind, enginePropagated) are asserted by their own call sites below.
  const registries: [string, Readonly<Record<string, VocabularyMember>>][] = [
    ["RARITY", RARITY],
    ["CREATURE_TYPE", CREATURE_TYPE],
    ["DAMAGE_CHANNEL", DAMAGE_CHANNEL],
    ["STATUS_EFFECT", STATUS_EFFECT],
    ["ABILITY_TRIGGER", ABILITY_TRIGGER],
  ];

  it("gives every member a non-empty label and a unique order", () => {
    for (const [name, registry] of registries) {
      const keys = Object.keys(registry);
      const orders = keys.map((k) => registry[k]!.order);
      expect(new Set(orders).size, `${name} has duplicate order values`).toBe(keys.length);
      for (const key of keys) {
        expect(registry[key]!.label.length, `${name}.${key} has an empty label`).toBeGreaterThan(0);
      }
    }
  });

  it("registers all five vocabularies, not four", () => {
    // `StatusEffectType` was the one closed vocabulary left as a bare union beside four registered
    // ones, which is the inconsistency this round exists to remove (research.md R3a).
    expect(registries.length).toBe(5);
  });

  it("is frozen, so a member cannot be mutated at runtime", () => {
    // The registries are module-level singletons read by the whole app; a stray write would be a
    // global change with no call site to find.
    expect(Object.isFrozen(RARITY)).toBe(true);
    expect(Object.isFrozen(CREATURE_TYPE)).toBe(true);
  });

  it("orders members by `order`, which is what every derived list reads", () => {
    expect(RARITIES_ASC).toEqual([
      Rarity.Common, Rarity.Uncommon, Rarity.Rare, Rarity.SuperRare, Rarity.Legendary, Rarity.Mythical,
    ]);
  });

  it("is a real enum, so a bare string is not a member", () => {
    // The property three rounds of literal unions could not give. `Object.values` is the runtime
    // list; the compile-time half is asserted by the codebase continuing to build at all, since a
    // stray `"SuperRare"` anywhere is now an error rather than a silent pass.
    expect(Object.values(Rarity)).toContain("SuperRare");
    expect(Rarity.SuperRare).toBe("SuperRare");
    expect(RARITY[Rarity.SuperRare].label).toBe("Super Rare");
  });
});

describe("derived lists are key-complete against their registry", () => {
  // The drift this round removes: a list that restates a vocabulary and then falls behind it.
  it("RARITIES_ASC / RARITIES_DESC / RARITY_COLORS cover exactly the enum's members", () => {
    const members = Object.values(Rarity);
    expect([...RARITIES_ASC].sort()).toEqual([...members].sort());
    expect(RARITIES_DESC).toEqual([...RARITIES_ASC].reverse());
    expect(Object.keys(RARITY_COLORS).sort()).toEqual([...members].sort());
  });

  it("TYPE_COLORS covers exactly the creature-type registry's keys", () => {
    expect(Object.keys(TYPE_COLORS).sort()).toEqual(Object.keys(CREATURE_TYPE).sort());
  });

  it("the trigger list covers exactly the trigger enum's members", () => {
    // Replaces a hand-written ten-value array in `triggers.test.ts`, which could not see a value
    // added to the union and omitted from itself — the exact drift its own guard existed to catch.
    expect([...ABILITY_TRIGGERS].sort()).toEqual(Object.values(AbilityTrigger).sort());
    for (const t of ABILITY_TRIGGERS) {
      expect(TRIGGER_DEFINITIONS[t].actionLabel.length, `no actionLabel for ${t}`).toBeGreaterThan(0);
    }
  });

  it("FILTERABLE_CREATURE_TYPES withholds the wildcard and KEEPS the placeholders", () => {
    // Curio (11 level-1 species) and NULL (4) are real published Type values attested by two
    // independent sources. An earlier draft of this round excluded them along with the wildcard,
    // which would have made 15 species unreachable by type filter.
    expect(FILTERABLE_CREATURE_TYPES).not.toContain(CreatureType.All);
    expect(FILTERABLE_CREATURE_TYPES).toContain(CreatureType.Curio);
    expect(FILTERABLE_CREATURE_TYPES).toContain(CreatureType.NULL);
    expect(FILTERABLE_CREATURE_TYPES.length).toBe(CREATURE_TYPES_ASC.length - 1);
  });
});

describe("GUARD: nothing restates a vocabulary", () => {

  it("no source file hand-writes a rarity ordering array", () => {
    // `RARITIES = ["Mythical", "Legendary", ...]` was declared in three files with inconsistent
    // ordering between them. One declaration, so a fourth cannot appear.
    const offenders = files().filter((f) => /const RARITIES\w*[^=]*=\s*\[\s*["']/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("no source file hand-writes a creature-type list", () => {
    const offenders = files().filter((f) =>
      /const (TYPES|CREATURE_TYPES|ALL_TYPES)\w*[^=]*=\s*\[\s*["']/.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it('no source file compares the "All" wildcard as a literal', () => {
    // Four production sites did: typing.ts, effects.ts, GridPicker.tsx and BatomonCard.tsx. The
    // literal comparison is what caused round 10's Omnichrome bug — the one creature that is every
    // type matched no type filter — so it routes through `isWildcardType` in one place now.
    const offenders = files().filter((f) => readFileSync(f, "utf8").includes('includes("All")'));
    expect(offenders).toEqual([]);
  });
});

describe("WI-006: the stored key is never the displayed label", () => {
  it('spells SuperRare as "Super Rare" for display while storing "SuperRare"', () => {
    expect(rarityLabel(Rarity.SuperRare)).toBe("Super Rare");
    // The stored key is deliberately unchanged, which is what makes this a zero-churn change: no
    // corpus record and no cited fixture was edited for it.
    expect(allCreatureRecords().some((c) => c.rarity === Rarity.SuperRare)).toBe(true);
    expect(Object.keys(RARITY)).toContain("SuperRare");
  });

  it("keeps every corpus rarity value a registry key", () => {
    for (const c of allCreatureRecords()) {
      expect(RARITY[c.rarity], `${c.id} has rarity ${c.rarity}, not a registry key`).toBeDefined();
    }
  });
});

describe("WI-004: DamageChannel and StatusEffectType are related, not merged", () => {
  it("maps a damaging status onto the channel its ticks land on", () => {
    expect(damageChannelOf(StatusEffectType.Burn)).toBe("Burn");
    expect(damageChannelOf(StatusEffectType.Poison)).toBe("Poison");
    expect(damageChannelOf(StatusEffectType.Shock)).toBe("Shock");
  });

  it("gives Shield no channel, because Shield absorbs damage rather than dealing it", () => {
    // This is the asymmetry that keeps them two vocabularies: "Shield" is a status and never a
    // channel, "Direct" is a channel and never a status. Merging them would let the compiler accept
    // `applyShieldReduction(n, "Shield", s)` (research.md R3a).
    expect(damageChannelOf(StatusEffectType.Shield)).toBeUndefined();
  });

  it("keeps Direct out of the status vocabulary and Shield out of the channel one", () => {
    expect(Object.values(StatusEffectType)).not.toContain("Direct");
    expect(Object.values(DamageChannel)).not.toContain("Shield");
  });

  it('drops "SuddenDeath", which no record and no runtime site ever produced', () => {
    expect(Object.values(DamageChannel)).not.toContain("SuddenDeath");
    // Scanned over production files only: this file and the registry both NAME the dropped member
    // in comments explaining why it is gone, which is documentation rather than use.
    const offenders = files().filter((f) => readFileSync(f, "utf8").includes("SuddenDeath"));
    expect(offenders).toEqual([]);
  });
});

describe("WI-003: the wildcard is marked, not guessed", () => {
  it("treats only All as the wildcard", () => {
    expect(isWildcardType(CreatureType.All)).toBe(true);
    for (const t of FILTERABLE_CREATURE_TYPES) expect(isWildcardType(t)).toBe(false);
  });

  it("keeps typeless representable, which is a real state for the egg species", () => {
    // dragonegg and purpleegg carry `types: []` at all four levels. That is a shop item that
    // hatches into a creature rather than being one, not a gap to fill with a placeholder member.
    const typeless = allCreatureRecords().filter((c) => c.types.length === 0);
    expect(typeless.length).toBeGreaterThan(0);
    expect(new Set(typeless.map((c) => c.id))).toEqual(new Set(["dragonegg", "purpleegg"]));
  });
});

describe("GUARD: the corpus stores enum members, never bare strings", () => {
  /**
   * The regression this round exists to prevent.
   *
   * Three earlier rounds left the vocabularies as literal unions, which were type-safe at their
   * literals but meant the DATA was 596 records of bare strings. That is what let two spellings of
   * one tier coexist, and what made every boundary a cast. These assertions are on the SOURCE TEXT
   * rather than the parsed values, because a parsed value cannot tell you how it was written.
   */
  const DATA_FILES = ["src/data/creatures.ts", "src/data/trinkets.ts", "src/data/trainers.ts", "src/data/items.ts"];

  it.each(DATA_FILES)("%s writes no bare vocabulary literal", (file) => {
    const source = readFileSync(file, "utf8");
    const offenders = [
      /\brarity: "/,
      /\bdamageType: "/,
      /\babilityTrigger: "/,
      /\btypes: \["/,
      /\btypeFilter: "/,
      /\brarityFilter: "/,
      /\bstat: "/,
      /\btrigger: "/,
    ].filter((re) => re.test(source));
    expect(offenders.map(String)).toEqual([]);
  });

  it("keeps ability TEXT untouched, which the migration could easily have corrupted", () => {
    // The migration rewrote literals only where a known field name preceded them. A blind
    // find-and-replace of `"Common"` would have mangled this sentence, and 148 others like it.
    const brawlmantis = getCreatureByIdAndLevel(Species.Brawlmantis, 1)!;
    expect(brawlmantis.abilityText).toBe("This and Common allies gain +10 Damage permanently.");
    expect(brawlmantis.rarity).toBe(Rarity.Uncommon);
    expect(brawlmantis.types).toEqual([CreatureType.Bug, CreatureType.Fighting]);
  });

  it("still serializes to the published strings, so nothing on the wire changed", () => {
    // String enums carry their stored value as the initialiser, so a record round-trips exactly as
    // before. This is why no build code, cited fixture or share URL needed migrating.
    expect(JSON.stringify({ r: Rarity.SuperRare, t: CreatureType.Bug })).toBe(
      '{"r":"SuperRare","t":"Bug"}',
    );
  });
});
