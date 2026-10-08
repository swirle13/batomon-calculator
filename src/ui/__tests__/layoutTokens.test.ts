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
    // it cost the row 2rem of usable width and the detail panel wrapped below the grid. It is the
    // token rather than a literal 1rem because the padding halves on a phone, and the team board
    // sizes its sprite against whatever the padding leaves of the viewport.
    const main = read("App.css");
    expect(main).toMatch(
      /max-width:\s*max\(60rem,\s*calc\(var\(--builder-row-width\)[^)]*\+ 2 \* var\(--page-pad\)/,
    );
    expect(main).toMatch(/padding: var\(--page-pad\)/);
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

  const badge = /\.statBadge \{([^}]*)\}/.exec(primitives.replace(/\s+/g, " "))?.[1] ?? "";
  const badges = /\.badges \{([^}]*)\}/.exec(grid.replace(/\s+/g, " "))?.[1] ?? "";

  it("gives the chip a width that binds, inside a flex container", () => {
    expect(badge).toMatch(/width: var\(--stat-chip-width\)/);
    // `min-width: auto` is the flex default and it floors an item at its own min-content size, so
    // the declared width was only ever a minimum: a four-character value widened the chip, and the
    // row sized for four of them fit three. The chips are flex items wherever they are used.
    expect(badge).toMatch(/min-width: 0/);
    // Both are load-bearing for a fixed character count: proportional digits are narrower for 1
    // than for 0, and the inherited 145% line-height would untie the height from the token below.
    expect(badge).toMatch(/font-variant-numeric: tabular-nums/);
    expect(badge).toMatch(/line-height: 1\.3/);
  });

  it("centres the value rather than letting it run off one edge", () => {
    // As an inline box the chip ignored `width` entirely and the value sat against the left padding,
    // overflowing to the right. Flex centring is symmetric however long the value is.
    expect(badge).toMatch(/display: inline-flex/);
    expect(badge).toMatch(/justify-content: center/);
  });

  it("sizes the chip for four characters, the longest label the formatter produces", () => {
    expect(tokens).toMatch(/--stat-chip-width: calc\(4ch \+ 2 \* var\(--space-3xs\)\)/);
    // Symmetric, and the same term the token adds, so four characters land exactly inside it.
    expect(badge).toMatch(/padding: var\(--space-3xs\);/);
  });

  it("reads the chip width in the chip's own font wherever it budgets several", () => {
    // `ch` is the advance of a `0` in the READING element's font. Matching only the font size left
    // this cap measured in regular digits against chips painted in bold ones, which is narrower —
    // so the row wrapped after three chips instead of four.
    for (const declaration of [/font-size: var\(--font-2xs\)/, /font-weight: 700/, /font-variant-numeric: tabular-nums/]) {
      expect(badges).toMatch(declaration);
      expect(badge).toMatch(declaration);
    }
  });

  it("caps a row at four chips by width, which is the only thing that caps it", () => {
    // Five fixed-width chips fit a pane comfortably, so without this max-width they would sit in a
    // single row of five and the board would go ragged again.
    expect(tokens.replace(/\s+/g, " ")).toMatch(
      /--stat-chip-row-width: calc\( var\(--stat-chips-per-row\) \* var\(--stat-chip-width\) \+ \(var\(--stat-chips-per-row\) - 1\) \* var\(--stat-chip-gap\) \)/,
    );
    expect(badges).toMatch(/max-width: var\(--stat-chip-row-width\)/);
    // The overflow row goes ABOVE the row already there, centred like it.
    expect(badges).toMatch(/flex-wrap: wrap-reverse/);
    expect(badges).toMatch(/justify-content: center/);
  });

  it("reserves the chip band in the pane, since the chips are out of flow", () => {
    // The pair that keeps a pane square however many chips it holds: the chips are positioned
    // against its bottom edge, and the height they occupy is reserved as padding. Reserve without
    // the positioning and a second row grows the pane; position without the reserve and the sprite
    // centres itself over the top of the chips.
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
 * A phone shows the creature at the size a desktop does (2026-10-08).
 *
 * The breakpoint used to drop `--sprite-grid` to 48px — 1x the source art, a quarter of the area —
 * so that the pane could stay square. Reported as "the mons are very undersized". There is no
 * middle size to compromise on: `image-rendering: pixelated` is only crisp at integer multiples of
 * the 48x48 source, so either the pane's shape gives or the art does.
 */
describe("the mobile breakpoint shrinks the pane, not the sprite", () => {
  const grid = read("ui/GridPicker/GridPicker.module.css");
  const mobileRoot = /@media \(max-width: 640px\) \{ :root \{([^}]*)\}/.exec(tokens.replace(/\s+/g, " "))?.[1] ?? "";

  it("caps the board's sprite at the desktop size rather than setting it below", () => {
    // `min(96px, …)` is the whole claim: the art is the desktop's 2x at any viewport that can hold
    // it, and only a screen too narrow for three of them takes anything off. A flat smaller value
    // here is the regression.
    expect(mobileRoot).toMatch(/--sprite-grid: min\( 96px,/);
    expect(mobileRoot).not.toMatch(/--sprite-picker:/);
  });

  it("measures that cap against the viewport the page padding leaves", () => {
    // Hence --page-pad being a token at all: the board is a third of the screen per pane, and it
    // cannot work out what a third is without naming the inset around it.
    expect(mobileRoot).toMatch(
      /calc\(\(100vw - 2 \* var\(--page-pad\) - 2 \* var\(--grid-gap\)\) \/ 3 - 2 \* var\(--grid-card-padding\)\)/,
    );
    expect(mobileRoot).toMatch(/--page-pad: var\(--space-sm\)/);
  });

  it("makes the slot size a WIDTH there: the sprite plus the card's padding", () => {
    expect(mobileRoot).toMatch(/--grid-slot-size: calc\(var\(--sprite-grid\) \+ 2 \* var\(--grid-card-padding\)\)/);
  });

  it("reserves both header lines, tightly, so every pane's sprite is at one height", () => {
    // Two things at once. The lines are TIGHT because at the desktop's name size and the inherited
    // 145% leading they measured 42px of a 166px pane, which pushed the sprite down onto the chips
    // and out of the middle. And both are RESERVED because the level only wraps below the name when
    // the name is long enough to need the line — otherwise a short-named pane's sprite sat 13px
    // higher than its neighbour's.
    const mobileGrid = grid.replace(/\s+/g, " ");
    expect(mobileGrid).toMatch(/\.header \{[^}]*min-height: var\(--grid-card-header\)/);
    expect(mobileGrid).toMatch(/\.header \.name, \.header \.level \{ font-size: var\(--font-2xs\); line-height: 1\.15/);
    expect(mobileRoot).toMatch(/--grid-card-header: calc\(2 \* 1\.15 \* var\(--font-2xs\)\)/);
  });

  it("drops the clear button below the header, so the name gets the whole row", () => {
    // The two competed for the top-right corner of a ~103px row: the button is 20px of it and the
    // longest name needs ~87px, which is why "Brawlmantis" was still "Brawlman…" with the row's
    // left fifth empty. Derived from the header's own height, so they cannot overlap.
    expect(grid.replace(/\s+/g, " ")).toMatch(
      /\.clear \{ top: calc\(var\(--grid-card-header\) \+ var\(--grid-card-padding\)\)/,
    );
  });

  it("caps a chip row at what the pane can hold, which is three here", () => {
    // Four chips and their gaps need ~130px; a third of a 360px screen is ~103px inside the card's
    // padding. Left at four, the rows broke where they ran out of room rather than where the rule
    // said — which is the same thing by accident, until a narrower phone makes it two.
    expect(mobileRoot).toMatch(/--stat-chips-per-row: 3/);
  });

  it("lets the board fill the screen instead of holding a column's width", () => {
    // `--team-column-width` is three FIXED slots wide and lands short of a phone, so the board sat
    // in a narrow column with the page's second column reserved, empty, beside it.
    expect(grid.replace(/\s+/g, " ")).toMatch(/@media \(max-width: 640px\) \{[^}]*\.grid \{ width: 100%/);
  });

  it("adds the pane's chrome to its height, since the square is gone", () => {
    // Without this the pane would be 96px tall and clip everything that is not the sprite — the
    // rows no longer have a square to sit inside.
    expect(grid.replace(/\s+/g, " ")).toMatch(
      /height: calc\(var\(--grid-slot-size\) \+ var\(--grid-card-chrome\)\)/,
    );
  });

  it("stacks the builder row rather than wrapping it", () => {
    // Wrapping is not stacking: both columns kept their side-by-side widths, so the detail panel
    // (a fixed 352px) overflowed a 360px screen and the team column stayed capped well inside it.
    const app = read("App.module.css").replace(/\s+/g, " ");
    expect(app).toMatch(/@media \(max-width: 640px\) \{ \.builderRow \{ flex-direction: column/);
    expect(app).toMatch(/\.teamColumn, \.detailColumn \{ flex: 1 1 auto; max-width: 100%/);
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
