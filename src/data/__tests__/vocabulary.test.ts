import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  ABILITY_TRIGGER,
  CREATURE_TYPE,
  DAMAGE_CHANNEL,
  FILTERABLE_CREATURE_TYPES,
  RARITY,
  STATUS_EFFECT,
  damageChannelOf,
  isWildcardType,
} from "../vocabularies";
import { keysInOrder, type VocabularyMember } from "../vocabulary";
import { RARITIES_ASC, RARITIES_DESC, RARITY_COLORS, rarityLabel } from "../statColors";
import { TYPE_COLORS } from "../typeColors";
import { ABILITY_TRIGGERS, TRIGGER_DEFINITIONS } from "../triggers";
import { corpus } from "../corpus";

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
const files = () => sourceFiles().filter((f) => !f.includes("__tests__") && !f.endsWith("vocabularies.ts"));

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

  it("orders keys by `order`, which is what every derived list reads", () => {
    expect(keysInOrder(RARITY)).toEqual([
      "Common", "Uncommon", "Rare", "SuperRare", "Legendary", "Mythical",
    ]);
  });
});

describe("derived lists are key-complete against their registry", () => {
  // The drift this round removes: a list that restates a vocabulary and then falls behind it.
  it("RARITIES_ASC / RARITIES_DESC / RARITY_COLORS cover exactly the registry's keys", () => {
    const keys = keysInOrder(RARITY);
    expect(RARITIES_ASC).toEqual(keys);
    expect(RARITIES_DESC).toEqual([...keys].reverse());
    expect(Object.keys(RARITY_COLORS).sort()).toEqual([...keys].sort());
  });

  it("TYPE_COLORS covers exactly the creature-type registry's keys", () => {
    expect(Object.keys(TYPE_COLORS).sort()).toEqual(Object.keys(CREATURE_TYPE).sort());
  });

  it("the trigger list covers exactly the trigger registry's keys", () => {
    // Replaces a hand-written ten-value array in `triggers.test.ts`, which could not see a value
    // added to the union and omitted from itself — the exact drift its own guard existed to catch.
    expect(ABILITY_TRIGGERS).toEqual(keysInOrder(ABILITY_TRIGGER));
    for (const t of ABILITY_TRIGGERS) {
      expect(TRIGGER_DEFINITIONS[t].actionLabel.length, `no actionLabel for ${t}`).toBeGreaterThan(0);
    }
  });

  it("FILTERABLE_CREATURE_TYPES withholds the wildcard and KEEPS the placeholders", () => {
    // Curio (11 level-1 species) and NULL (4) are real published Type values attested by two
    // independent sources. An earlier draft of this round excluded them along with the wildcard,
    // which would have made 15 species unreachable by type filter.
    expect(FILTERABLE_CREATURE_TYPES).not.toContain("All");
    expect(FILTERABLE_CREATURE_TYPES).toContain("Curio");
    expect(FILTERABLE_CREATURE_TYPES).toContain("NULL");
    expect(FILTERABLE_CREATURE_TYPES.length).toBe(Object.keys(CREATURE_TYPE).length - 1);
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
    expect(rarityLabel("SuperRare")).toBe("Super Rare");
    // The stored key is deliberately unchanged, which is what makes this a zero-churn change: no
    // corpus record and no cited fixture was edited for it.
    expect(corpus.creatures.some((c) => c.rarity === "SuperRare")).toBe(true);
    expect(Object.keys(RARITY)).toContain("SuperRare");
  });

  it("keeps every corpus rarity value a registry key", () => {
    for (const c of corpus.creatures) {
      expect(RARITY[c.rarity], `${c.id} has rarity ${c.rarity}, not a registry key`).toBeDefined();
    }
  });
});

describe("WI-004: DamageChannel and StatusEffectType are related, not merged", () => {
  it("maps a damaging status onto the channel its ticks land on", () => {
    expect(damageChannelOf("Burn")).toBe("Burn");
    expect(damageChannelOf("Poison")).toBe("Poison");
    expect(damageChannelOf("Shock")).toBe("Shock");
  });

  it("gives Shield no channel, because Shield absorbs damage rather than dealing it", () => {
    // This is the asymmetry that keeps them two vocabularies: "Shield" is a status and never a
    // channel, "Direct" is a channel and never a status. Merging them would let the compiler accept
    // `applyShieldReduction(n, "Shield", s)` (research.md R3a).
    expect(damageChannelOf("Shield")).toBeUndefined();
  });

  it("keeps Direct out of the status vocabulary and Shield out of the channel one", () => {
    expect(Object.keys(STATUS_EFFECT)).not.toContain("Direct");
    expect(Object.keys(DAMAGE_CHANNEL)).not.toContain("Shield");
  });

  it('drops "SuddenDeath", which no record and no runtime site ever produced', () => {
    expect(Object.keys(DAMAGE_CHANNEL)).not.toContain("SuddenDeath");
    // Scanned over production files only: this file and the registry both NAME the dropped member
    // in comments explaining why it is gone, which is documentation rather than use.
    const offenders = files().filter((f) => readFileSync(f, "utf8").includes("SuddenDeath"));
    expect(offenders).toEqual([]);
  });
});

describe("WI-003: the wildcard is marked, not guessed", () => {
  it("treats only All as the wildcard", () => {
    expect(isWildcardType("All")).toBe(true);
    for (const t of FILTERABLE_CREATURE_TYPES) expect(isWildcardType(t)).toBe(false);
  });

  it("keeps typeless representable, which is a real state for the egg species", () => {
    // dragonegg and purpleegg carry `types: []` at all four levels. That is a shop item that
    // hatches into a creature rather than being one, not a gap to fill with a placeholder member.
    const typeless = corpus.creatures.filter((c) => c.types.length === 0);
    expect(typeless.length).toBeGreaterThan(0);
    expect(new Set(typeless.map((c) => c.id))).toEqual(new Set(["dragonegg", "purpleegg"]));
  });
});
