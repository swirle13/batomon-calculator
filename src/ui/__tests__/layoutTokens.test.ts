import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the one invariant the builder layout depends on: `main` is never narrower than the row it
 * has to lay out side by side.
 *
 * The team grid and the detail panel are both fixed-width, so there is no width at which they can
 * share less space and still fit. Three separate hardcoded numbers — a 30rem grid, a 44rem
 * Modifiers panel, a 60rem `main` — drifted out of agreement as the sprite size grew, and the grid
 * ended up painted across the detail panel. These assertions fail if anyone reintroduces a literal
 * where a derived value belongs.
 *
 * jsdom does not evaluate `calc()` or resolve custom properties across stylesheets, so this reads
 * the sources directly. That is the point: the bug was in the AUTHORED relationship between files,
 * not in anything a rendered DOM would reveal.
 */

const read = (p: string) => readFileSync(join(__dirname, "..", "..", p), "utf8");
const tokens = read("ui/tokens.css");

describe("layout width tokens", () => {
  it("derives the team column from the slot size and the gap, with nothing else in the track", () => {
    expect(tokens.replace(/\s+/g, " ")).toMatch(
      /--team-column-width: calc\(3 \* var\(--grid-slot-size\) \+ 2 \* var\(--grid-gap\)\)/,
    );
  });

  /**
   * The drop zone used to reserve a 2px dashed transparent border plus 0.15rem of padding for its
   * drag-over state, budgeted by a `--grid-cell-chrome` token. The reservation inset every card
   * 4.7px inside its own cell, so the grid's outer edge sat inside the panels above it and the cards
   * were 18.4px apart while the gap token said 9px — reported as "a bit more margin around the mon
   * selector".
   */
  it("the drop zone reserves no space, so a card fills its cell", () => {
    const grid = read("ui/GridPicker/GridPicker.module.css");
    const dropZone = /\.dropZone \{([^}]*)\}/.exec(grid.replace(/\s+/g, " "))?.[1] ?? "";
    expect(dropZone).not.toMatch(/border:/);
    expect(dropZone).not.toMatch(/padding:/);
    // An outline is painted outside the box and takes part in no layout, which is the whole reason
    // it can carry an indicator that costs nothing until it is shown.
    expect(grid.replace(/\s+/g, " ")).toMatch(/\.dropZoneOver \{[^}]*outline: 2px dashed/);
    // Neither declared nor referenced. Matched that way rather than on the bare name, because the
    // comment recording WHY it went is worth keeping where the token used to be.
    expect(tokens).not.toMatch(/^\s*--grid-cell-chrome\s*:/m);
    expect(tokens).not.toMatch(/var\(--grid-cell-chrome/);
  });

  it("derives the slot size from the sprite, the rows under it AND the card's own padding", () => {
    // The padding term is separate on purpose. Cards are border-box, so padding is taken OUT of the
    // usable height; folding it into --grid-card-chrome left the sprite overlapping the name.
    expect(tokens.replace(/\s+/g, " ")).toMatch(
      /--grid-slot-size: calc\( var\(--sprite-grid\) \+ var\(--grid-card-chrome\) \+ 2 \* var\(--grid-card-padding\) \)/,
    );
    expect(tokens).toMatch(/--grid-card-padding:\s*0\.3rem/);
    expect(read("ui/GridPicker/GridPicker.module.css")).toMatch(/\.card \{[^}]*padding: 0\.3rem/);
  });

  it("box-sizing is border-box globally, so a width token is the width an element occupies", () => {
    // Set only on #root before; every other element was content-box, which made padding and borders
    // silently widen elements past the size they were given.
    expect(read("index.css")).toMatch(/\*,\s*\*::before,\s*\*::after \{\s*box-sizing: border-box/);
  });

  it("budgets the builder row as team column + gap + detail panel", () => {
    expect(tokens).toMatch(
      /--builder-row-width:\s*calc\(var\(--team-column-width\) \+ var\(--column-gap\) \+ var\(--detail-panel-width\)\)/,
    );
  });

  it("the page frame is never narrower than the builder row", () => {
    // #root carried a flat 1126px that predated the grid growing, leaving the row fitting with
    // single-digit pixels to spare.
    expect(read("index.css")).toMatch(/width:\s*max\(1126px,\s*calc\([^)]*var\(--builder-row-width\)/);
  });

  it("main is never narrower than the builder row, padding included", () => {
    // `max(...)` keeps a comfortable reading width for the prose below while guaranteeing the row
    // that cannot compress always fits. A bare `max-width: 60rem` here is the regression.
    //
    // The padding term is required: `main` is border-box, so max-width is the OUTER width. Omitting
    // it cost the row 2rem of usable width and the detail panel wrapped below the grid.
    const main = read("App.css");
    expect(main).toMatch(/max-width:\s*max\(60rem,\s*calc\(var\(--builder-row-width\)[^)]*\+ 2 \* 1rem/);
  });
});

/**
 * The modifier cells used to sit on the page beside the team grid, so the invariant worth pinning
 * was that the two were the same width and shared a gap token — at 44rem the panel was 172px wider
 * and the cells no longer sat above their creatures.
 *
 * They moved into an overlay on 2026-10-07, so that invariant is retired rather than weakened: the
 * cells are no longer beside the grid, and a width assertion against the panel would now be
 * asserting against a half-column summary that holds no cells at all. What survives is the SHAPE —
 * three columns in board order — which every overlay now shares through one declaration.
 */
describe("the overlays keep the board's three-column shape", () => {
  const grid = read("ui/GridPicker/GridPicker.module.css");
  const primitives = read("ui/primitives/primitives.module.css");
  const primitivesSource = read("ui/primitives/index.tsx");

  it("the team grid still declares the board itself", () => {
    expect(grid).toMatch(/width:\s*var\(--team-column-width\)/);
    expect(grid).toMatch(/gap:\s*var\(--grid-gap\)/);
    expect(grid).toMatch(/repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  });

  it("three columns is declared once, for every overlay", () => {
    // Three call sites that merely happen to pass 3 would drift; one constant cannot.
    expect(primitivesSource).toMatch(/export const OVERLAY_COLUMNS = 3;/);
  });

  it("the overlay grid uses minmax(0, 1fr) so a squeezed column cannot overflow sideways", () => {
    // A bare `1fr` floors each track at the card's min-content width; the grid then grows past its
    // container and paints across it instead of shrinking. The stat select inside a modifier cell
    // is exactly the kind of wide min-content that does it.
    expect(primitives).toMatch(/repeat\(var\(--grid-columns,\s*3\),\s*minmax\(0,\s*1fr\)\)/);
  });

  it("the overlay grid stretches its rows rather than reserving a worst-case card height", () => {
    // The reserved height was measured honestly and still left ~3rem of dead space under most
    // cards. Row stretch is what replaced it, so it is what has to stay.
    expect(primitives.replace(/\s+/g, " ")).toMatch(/\.cardGridFixed \{[^}]*align-items: stretch/);
  });

  it("Modifiers declares no width of its own", () => {
    // It is one track of the panel pair now. A width here would fight the grid that places it.
    expect(read("ui/Modifiers/ModifierEditor.module.css")).not.toMatch(/max-width:\s*var\(--team-column-width\)/);
  });
});

/**
 * The stat chips along the bottom of a team-grid pane (2026-10-08).
 *
 * Reported as "these need a consistent width": Plunderbird's 1 / 25 / 2 were padding-sized, so no
 * two chips in the board lined up. Every assertion here is on an authored relationship between two
 * files, which is what jsdom cannot see — it does no layout, so a rendered DOM would report a chip
 * of width 0 either way.
 */
describe("stat chips hold one width and one row height", () => {
  const primitives = read("ui/primitives/primitives.module.css");
  const grid = read("ui/GridPicker/GridPicker.module.css");

  it("gives the chip a fixed width, not a minimum", () => {
    // `min-width: 1.4rem` was the bug: it set a floor and then let the content widen the chip past
    // it, which is the one thing a column of aligned pills must not do.
    const badge = /\.statBadge \{([^}]*)\}/.exec(primitives.replace(/\s+/g, " "))?.[1] ?? "";
    expect(badge).toMatch(/width: var\(--stat-chip-width\)/);
    expect(badge).not.toMatch(/min-width:/);
    // Both are load-bearing for "three characters": proportional digits are narrower for 1 than for
    // 0, and the inherited 145% line-height would untie the height from --stat-chip-height.
    expect(badge).toMatch(/font-variant-numeric: tabular-nums/);
    expect(badge).toMatch(/line-height: 1\.3/);
  });

  it("sizes the chip for three characters at the chip's own font size", () => {
    // `ch` resolves against the font of whichever element reads the token, so a container that
    // budgets four chips has to carry the chip's font size or its sum comes out wrong.
    expect(tokens).toMatch(/--stat-chip-width: calc\(3ch \+ 2 \* var\(--space-2xs\)\)/);
    expect(grid.replace(/\s+/g, " ")).toMatch(/\.badges \{[^}]*font-size: var\(--font-2xs\)/);
  });

  it("caps a row at four chips by width, which is the only thing that caps it", () => {
    // Five fixed-width chips fit a pane comfortably, so without this max-width they would sit in a
    // single row of five and the board would go ragged again.
    expect(tokens.replace(/\s+/g, " ")).toMatch(
      /--stat-chip-row-width: calc\( var\(--stat-chips-per-row\) \* var\(--stat-chip-width\) \+ \(var\(--stat-chips-per-row\) - 1\) \* var\(--stat-chip-gap\) \)/,
    );
    const badges = /\.badges \{([^}]*)\}/.exec(grid.replace(/\s+/g, " "))?.[1] ?? "";
    expect(badges).toMatch(/max-width: var\(--stat-chip-row-width\)/);
    // The overflow row goes ABOVE the row already there, centred like it.
    expect(badges).toMatch(/flex-wrap: wrap-reverse/);
    expect(badges).toMatch(/justify-content: center/);
  });

  it("reserves the chip band in the pane, since the chips are out of flow", () => {
    // The pair that keeps a pane square however many chips it holds: the chips are positioned
    // against its bottom edge, and the height they occupy is reserved as padding. Reserve without
    // the positioning and a second row grows the pane; position without the reserve and the name
    // sits underneath the chips.
    const badges = /\.badges \{([^}]*)\}/.exec(grid.replace(/\s+/g, " "))?.[1] ?? "";
    expect(badges).toMatch(/position: absolute/);
    expect(grid.replace(/\s+/g, " ")).toMatch(
      /\.card \{[^}]*padding-bottom: calc\(0\.3rem \+ var\(--stat-chip-height\)\)/,
    );
    // Derived from the chip's own box rather than measured, so the two cannot drift apart.
    expect(tokens).toMatch(
      /--stat-chip-height: calc\(var\(--font-2xs\) \* 1\.3 \+ 2 \* var\(--space-3xs\) \+ 2px\)/,
    );
  });

  it("keeps the pane's name on one line, so every sprite lands at the same height", () => {
    // Clamped to two lines before. The second line was reserved per-card rather than globally, so a
    // long-named creature's sprite sat 16px lower than its neighbour's.
    const name = /\.name \{([^}]*)\}/.exec(grid.replace(/\s+/g, " "))?.[1] ?? "";
    expect(name).toMatch(/white-space: nowrap/);
    expect(name).toMatch(/text-overflow: ellipsis/);
    expect(name).not.toMatch(/line-clamp/);
  });
});

/**
 * FR-043: a panel reserves space for the corpus's worst case rather than resizing as its contents
 * change. The trainer card is the newest instance and the one with a measured number behind it.
 */
describe("the trainer card holds one height for every trainer", () => {
  const card = read("ui/shared/TrainerCard/TrainerCard.module.css");

  it("spans the ability text across both columns", () => {
    // In the left column alone the wordiest trainer wrapped to five lines and grew the card by ~90px
    // on selection, which moved the panels and the whole team grid below it.
    expect(card.replace(/\s+/g, " ")).toMatch(/\.footer \{[^}]*grid-column: 1 \/ -1/);
  });

  it("reserves the measured worst-case footer height", () => {
    // 4.5rem covers Painter (two lines plus the affected-species button, 4.32rem measured in a real
    // browser) and Musician (three lines, 3.48rem). Deleting this makes the card resize again, which
    // no unit test in jsdom can see — jsdom does no layout.
    expect(card).toMatch(/min-height:\s*4\.5rem/);
  });

  it("anchors the affected-species button to the bottom of that reserved space", () => {
    // Only Painter and Smuggler have this button, and their ability texts are one and two lines, so
    // following the text put the same control 21px apart between them. Anchored, both sit 10px above
    // the card's bottom edge — measured.
    expect(card).toMatch(/\.showButton \{[^}]*margin-top: auto/);
  });
});

/**
 * A `var(--x)` with no fallback, where `--x` is defined nowhere, makes the WHOLE declaration invalid
 * at computed-value time — so the property silently falls back to its inherited or initial value and
 * the page renders as if the line had not been written.
 *
 * That is not hypothetical here: `--surface-sunken`, `--text-primary` and `--text-secondary` were
 * referenced across five stylesheets and defined nowhere, so the Share panel's code box had no
 * background, the trainer card's button had no fill, and several text colours were simply inherited.
 * It is invisible in review — the line looks correct — which is exactly the kind of thing to pin.
 */
describe("every custom property referenced without a fallback is defined", () => {
  /**
   * Set from JS via a `style` prop, so no stylesheet declares them.
   *
   * `--stat-rows` is the output band's row count, which `StatLines` computes as `ceil(n / 2)` — the
   * one part of the two-column grid that has to come from the data (WI-003).
   */
  const SET_INLINE = new Set(["--sprite-url", "--rarity-color", "--stat-rows"]);

  it("has no dangling var() references", () => {
    const cssFiles = cssFilesUnder(join(__dirname, "..", ".."));
    const defined = new Set<string>();
    for (const file of cssFiles) {
      for (const match of readFileSync(file, "utf8").matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)) {
        defined.add(match[1]!);
      }
    }

    const dangling: string[] = [];
    for (const file of cssFiles) {
      // Only references with NO fallback: `var(--x, 1rem)` degrades to the fallback, which is a
      // deliberate default rather than a defect.
      for (const match of readFileSync(file, "utf8").matchAll(/var\((--[a-z0-9-]+)\s*\)/g)) {
        const name = match[1]!;
        if (!defined.has(name) && !SET_INLINE.has(name)) dangling.push(`${name} in ${file}`);
      }
    }

    expect(dangling).toEqual([]);
  });
});

function cssFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return cssFilesUnder(full);
    return full.endsWith(".css") ? [full] : [];
  });
}
