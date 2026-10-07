import { readFileSync } from "node:fs";
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
  it("derives the team column from the slot size, the cell chrome and the gap", () => {
    // The cell chrome term is load-bearing: `.dropZone`'s border and padding sit OUTSIDE the card,
    // so a track budgeted at only --grid-slot-size is narrower than the cell's min-content, and the
    // grid then overflows sideways across the detail panel instead of shrinking.
    expect(tokens.replace(/\s+/g, " ")).toMatch(
      /--team-column-width: calc\( 3 \* \(var\(--grid-slot-size\) \+ var\(--grid-cell-chrome\)\) \+ 2 \* var\(--grid-gap\) \)/,
    );
  });

  it("the cell chrome token matches the drop zone's actual border and padding", () => {
    // These two must move together; the token is a budget for what that rule really draws.
    expect(tokens).toMatch(/--grid-cell-chrome:\s*calc\(2 \* 2px \+ 2 \* 0\.15rem\)/);
    const grid = read("ui/GridPicker/GridPicker.module.css");
    expect(grid).toMatch(/\.dropZone \{[^}]*box-sizing: border-box/);
    expect(grid).toMatch(/\.dropZone \{[^}]*border: 2px dashed/);
    expect(grid).toMatch(/\.dropZone \{[^}]*padding: 0\.15rem/);
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

describe("the two 2x3 grids stay aligned", () => {
  const grid = read("ui/GridPicker/GridPicker.module.css");
  const modifiers = read("ui/Modifiers/ModifierEditor.module.css");

  it("the Modifiers panel is exactly as wide as the team grid it mirrors", () => {
    // At 44rem it was 172px wider, so expanding it stretched the whole layout open and the cells
    // no longer sat above their creatures.
    expect(modifiers).toMatch(/max-width:\s*var\(--team-column-width\)/);
    expect(grid).toMatch(/width:\s*var\(--team-column-width\)/);
  });

  it("both share one gap token, so columns line up", () => {
    expect(grid).toMatch(/gap:\s*var\(--grid-gap\)/);
    expect(modifiers).toMatch(/gap:\s*var\(--grid-gap\)/);
  });

  it("both use minmax(0, 1fr) so a squeezed column cannot overflow sideways", () => {
    // A bare `1fr` floors each track at the card's min-content width; the grid then grows past its
    // own max-width and paints across the detail panel instead of shrinking.
    expect(grid).toMatch(/repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
    expect(modifiers).toMatch(/repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  });
});
