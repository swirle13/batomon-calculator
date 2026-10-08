import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { allCreatureRecords, corpus, distinctCreatures } from "../corpus";

/**
 * tasks.md T116's companion assertion. A `spriteFile` naming a file that isn't on disk is
 * invisible until a user sees a broken image, and the vendoring script's first draft silently
 * skipped 6 records whose field ordering differed — this is what caught it.
 */
describe("vendored sprites (FR-036)", () => {
  const publicDir = path.resolve(import.meta.dirname, "../../../public/sprites");

  it("every creature record names a sprite file that exists on disk", () => {
    const missing = allCreatureRecords()
      .filter((c) => c.spriteFile && !existsSync(path.join(publicDir, "monster", c.spriteFile)))
      .map((c) => `${c.id}@L${c.level} -> ${c.spriteFile}`);
    expect(missing).toEqual([]);
  });

  it("every trinket record names a sprite file that exists on disk", () => {
    const missing = corpus.trinkets
      .filter((t) => t.spriteFile && !existsSync(path.join(publicDir, "trinket", t.spriteFile)))
      .map((t) => `${t.id} -> ${t.spriteFile}`);
    expect(missing).toEqual([]);
  });

  it("every creature and trinket actually has a sprite (full coverage, not just valid ones)", () => {
    const creaturesWithout = allCreatureRecords().filter((c) => !c.spriteFile).map((c) => `${c.id}@L${c.level}`);
    const trinketsWithout = corpus.trinkets.filter((t) => !t.spriteFile).map((t) => t.id);
    expect({ creaturesWithout, trinketsWithout }).toEqual({ creaturesWithout: [], trinketsWithout: [] });
  });
});

/**
 * The collapse to one entry per species (2026-10-08) rests on properties of the data, not on
 * wishful thinking. These pin them, so a hand-edit to `creatures.ts` that violates one fails here
 * rather than showing a wrong number on a card.
 */
describe("collapsed corpus shape", () => {
  it("publishes exactly 149 species and resolves all four levels of each", () => {
    expect(corpus.creatures.length).toBe(149);
    expect(allCreatureRecords().length).toBe(149 * 4);

    const byId = new Map<string, number[]>();
    for (const record of allCreatureRecords()) {
      byId.set(record.id, [...(byId.get(record.id) ?? []), record.level]);
    }
    const wrong = [...byId].filter(([, levels]) => levels.join() !== "1,2,3,4");
    expect(wrong.map(([id, levels]) => `${id}: ${levels}`)).toEqual([]);
  });

  it("has no duplicate species entries", () => {
    const ids = corpus.creatures.map((c) => c.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  /**
   * An override that restates level 1's value is dead weight: it reads as "this changes at level 3"
   * when nothing changes. The generator never emits one, so a failure here means a hand-edit.
   */
  it("carries no level override that merely repeats the level 1 value", () => {
    const redundant: string[] = [];
    for (const species of corpus.creatures) {
      for (const [level, override] of Object.entries(species.levels ?? {})) {
        for (const [key, value] of Object.entries(override)) {
          const atLevel1 = (species as unknown as Record<string, unknown>)[key];
          if (JSON.stringify(value) === JSON.stringify(atLevel1)) {
            redundant.push(`${species.id}@L${level}.${key}`);
          }
        }
      }
    }
    expect(redundant).toEqual([]);
  });

  /**
   * Overrides INHERIT what they omit, so they can restate a stat but never remove one. Nothing in
   * the real corpus drops a stat as it levels — no species gains or loses a `publishedCast`, and no
   * `appliesStatus` array changes length — which is what makes inheritance safe. If that ever stops
   * being true the type needs an explicit sentinel, and this is the test that will say so.
   */
  it("has no species whose cast or status shape changes between levels", () => {
    const offenders: string[] = [];
    for (const species of corpus.creatures) {
      const levels = allCreatureRecords().filter((c) => c.id === species.id);
      const casts = new Set(levels.map((c) => c.publishedCast !== undefined));
      const statuses = new Set(levels.map((c) => (c.appliesStatus ?? []).length));
      if (casts.size > 1) offenders.push(`${species.id}: publishedCast appears/disappears`);
      if (statuses.size > 1) offenders.push(`${species.id}: appliesStatus length varies`);
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * FR-067 (WI-016, 2026-10-06 round 8): display order must never be inherited from source-file
 * order. `distinctCreatures` was a bare `filter()`, and `creatures.ts` opens with six seed records
 * before running alphabetically — so every list in the app showed those six first.
 */
describe("display ordering (FR-067)", () => {
  it("distinctCreatures is sorted by name, not by position in the source file", () => {
    const names = distinctCreatures.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("the six seed records are no longer first", () => {
    // The exact symptom from the user's screenshot: Bumblebolt/Formiqueen/Venopuff/Scorchimp/
    // Pebbler/Onsetra led the list because they lead the file.
    const firstSix = distinctCreatures.slice(0, 6).map((c) => c.name);
    expect(firstSix).not.toEqual(["Bumblebolt", "Formiqueen", "Venopuff", "Scorchimp", "Pebbler", "Onsetra"]);
  });
});
