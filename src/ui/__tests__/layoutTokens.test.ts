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
