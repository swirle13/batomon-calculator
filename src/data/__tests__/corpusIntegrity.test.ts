import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { corpus, distinctCreatures } from "../corpus";

/**
 * tasks.md T116's companion assertion. A `spriteFile` naming a file that isn't on disk is
 * invisible until a user sees a broken image, and the vendoring script's first draft silently
 * skipped 6 records whose field ordering differed — this is what caught it.
 */
describe("vendored sprites (FR-036)", () => {
  const publicDir = path.resolve(import.meta.dirname, "../../../public/sprites");

  it("every creature record names a sprite file that exists on disk", () => {
    const missing = corpus.creatures
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
    const creaturesWithout = corpus.creatures.filter((c) => !c.spriteFile).map((c) => `${c.id}@L${c.level}`);
    const trinketsWithout = corpus.trinkets.filter((t) => !t.spriteFile).map((t) => t.id);
    expect({ creaturesWithout, trinketsWithout }).toEqual({ creaturesWithout: [], trinketsWithout: [] });
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
