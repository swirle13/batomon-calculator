import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { corpus, distinctCreatures } from "../corpus";
import type { Provenance } from "../types";

/**
 * SC-004 / FR-004's enforcement surface (2026-10-06 round 6, tasks.md T118).
 *
 * Until this round, "every record is cited, and every recorded source conflict is visible" was
 * enforced by the Corpus Browser *rendering* those fields — a user could click a disclosure and
 * see them. FR-030 (user-requested) removes that UI, so the obligation moves here rather than
 * lapsing: the citation/conflict data is still mandatory on every record, and this test is what
 * now holds it to that. See spec.md's round 6 Amendment.
 *
 * This is deliberately a guard against future regression rather than a red-then-green test, so it
 * passes on first run. That is the point: it had to exist and pass *before* the UI was deleted,
 * so the handover was never a gap.
 */

/** Every record type in the corpus, flattened with a human-readable label for failure messages. */
function allRecords(): { label: string; record: Provenance }[] {
  return [
    ...corpus.creatures.map((c) => ({ label: `creature ${c.id}@L${c.level}`, record: c as Provenance })),
    ...corpus.trainers.map((t) => ({ label: `trainer ${t.id}`, record: t as Provenance })),
    ...corpus.trinkets.map((t) => ({ label: `trinket ${t.id}`, record: t as Provenance })),
    // `items` is still an empty seed stub (tasks.md T046), so these assertions hold vacuously
    // today and start guarding the moment the first item is added — rather than this type being
    // quietly omitted and shipping uncited, which is what happened when it was left out of the
    // first draft of this test.
    ...corpus.items.map((i) => ({ label: `item ${i.id}`, record: i as Provenance })),
  ];
}

describe("corpus provenance (SC-004 / FR-004)", () => {
  it("every record carries at least one well-formed source citation", () => {
    const offenders: string[] = [];
    for (const { label, record } of allRecords()) {
      if (!record.sourceRefs || record.sourceRefs.length === 0) {
        offenders.push(`${label}: no sourceRefs`);
        continue;
      }
      for (const ref of record.sourceRefs) {
        if (!ref.url?.trim() || !ref.title?.trim() || !ref.retrievedAt?.trim()) {
          offenders.push(`${label}: incomplete sourceRef ${JSON.stringify(ref)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every record states which patch it reflects", () => {
    const offenders = allRecords()
      .filter(({ record }) => !record.patch?.trim())
      .map(({ label }) => label);
    expect(offenders).toEqual([]);
  });

  it("every recorded source conflict is well-formed and not silently resolved away", () => {
    const offenders: string[] = [];
    for (const { label, record } of allRecords()) {
      for (const conflict of record.conflicts ?? []) {
        if (!conflict.field?.trim()) offenders.push(`${label}: conflict with no field`);
        // A "conflict" with fewer than two values is not a conflict -- it would mean a
        // disagreement was recorded after being flattened to one answer, which is exactly what
        // SC-004 exists to prevent.
        if (!conflict.values || conflict.values.length < 2) {
          offenders.push(`${label}: conflict on "${conflict.field}" has <2 values`);
          continue;
        }
        for (const value of conflict.values) {
          if (!value.sourceRefs || value.sourceRefs.length === 0) {
            offenders.push(`${label}: conflict value on "${conflict.field}" has no sourceRefs`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("at least one conflict is actually recorded, so the above is not vacuous", () => {
    const total = allRecords().reduce((sum, { record }) => sum + (record.conflicts?.length ?? 0), 0);
    expect(total).toBeGreaterThan(0);
  });
});

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
