/**
 * Reconcile enum imports after the literal migration (2026-10-07, round 7).
 *
 * Two problems the earlier passes created, both mechanical:
 *
 * 1. **`import type` used as a value.** An enum is both a type and a value. Files that had
 *    `import type { Rarity }` and now write `Rarity.Common` fail with TS1361. The name has to move
 *    out of the type-only import.
 * 2. **Duplicate imports.** The literal pass appended `import { GridRow } from ".../enums"` to
 *    files that already imported `GridRow` from `".../types"`, giving TS2300.
 *
 * Fix: for every enum a file actually uses as a value, drop the name from all type-only imports and
 * ensure exactly one value import. Enums only used in type positions are left alone — `import type`
 * is correct for those and `verbatimModuleSyntax` prefers it.
 *
 * Usage: node scripts/fix-enum-imports.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";

const ENUMS = [
  "Rarity", "CreatureType", "DamageChannel", "StatusEffectType", "AbilityTrigger",
  "RegionId", "GridRow", "ModifierStat", "EventLabel", "TimelineEventKind",
  "StatChangeStat", "MultiplierScope", "StatColorKey", "ConfirmableField", "TargetKind", "AbilityTagKind", "TypeKind", "AffectedSpeciesKind",
];

function files(dir) {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(e) ? [p] : [];
  });
}

/** Specifier from `file` to `src/data/enums`, POSIX-style and always explicitly relative. */
function spec(file) {
  let r = relative(dirname(file), "src/data/enums").split("\\").join("/");
  return r.startsWith(".") ? r : `./${r}`;
}

let changed = 0;
for (const file of files("src")) {
  if (file.endsWith("src/data/enums.ts")) continue;
  let t = readFileSync(file, "utf8");
  const before = t;

  /*
   * Which enums are used as VALUES, i.e. `Enum.Member` -- measured against the file with COMMENTS
   * STRIPPED. A doc comment quoting `DamageChannel.Direct` while explaining why the code no longer
   * compares it is not a usage, and treating it as one re-added an unused import on every run.
   */
  const codeOnly = t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const used = ENUMS.filter((e) => new RegExp(String.raw`\b${e}\.[A-Z]`).test(codeOnly));

  // Drop every value-used enum from every type-only import in the file.
  t = t.replace(/import type \{([^}]*)\} from ("[^"]+");/g, (whole, names, from) => {
    const kept = names
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((n) => !used.includes(n.split(/\s+as\s+/)[0]));
    if (kept.length === names.split(",").map((s) => s.trim()).filter(Boolean).length) return whole;
    return kept.length === 0 ? "" : `import type { ${kept.join(", ")} } from ${from};`;
  });

  /*
   * Drop every existing import of our enums, so one consolidated line replaces them.
   *
   * Handles the INLINE type specifier too — `import { STAT_COLORS, type StatColorKey }` is the form
   * this codebase mostly uses, and leaving it in place produced a duplicate declaration against
   * the value import rather than a clean replacement.
   */
  t = t.replace(/import \{([^}]*)\} from ("[^"]+");/g, (whole, names, from) => {
    const all = names.split(",").map((s) => s.trim()).filter(Boolean);
    const kept = all.filter((n) => !used.includes(n.replace(/^type\s+/, "")));
    if (kept.length === all.length) return whole;
    return kept.length === 0 ? "" : `import { ${kept.join(", ")} } from ${from};`;
  });

  // Collapse the blank lines the removals left behind, then insert one import.
  t = t.replace(/^\n+/, "").replace(/\n{3,}/g, "\n\n");
  if (used.length > 0) {
    const line = `import { ${[...used].sort().join(", ")} } from "${spec(file)}";`;
    const lines = t.split("\n");
    let last = -1;
    for (let i = 0; i < Math.min(lines.length, 80); i++) if (/^import\b/.test(lines[i])) last = i;
    lines.splice(last + 1, 0, line);
    t = lines.join("\n");
  }

  if (t !== before) {
    writeFileSync(file, t);
    changed++;
    console.log(`${file}  [${used.join(", ")}]`);
  }
}
console.log(`\n${changed} file(s) reconciled`);
