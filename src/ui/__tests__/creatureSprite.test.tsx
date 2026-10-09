import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { CreatureSprite } from "../shared/CreatureSprite";
import { BatomonCard } from "../shared/BatomonCard/BatomonCard";
import { getCreatureByIdAndLevel } from "../../data/corpus";
import { SPRITE_VERTICAL_OFFSETS, spriteVerticalOffset } from "../../data/spriteOffsets";
import { Species } from "../../data/ids";

/**
 * 2026-10-06. Three defects, all visible in one screenshot of a painted Magmite:
 *
 * 1. The rainbow tinted the whole card window, because the class sat on `.spriteFrame` rather than
 *    on the artwork.
 * 2. The same creature was rainbow in the detail panel and plain on the board, because the grid
 *    rendered a bare `<Sprite>` that knew nothing about painting.
 * 3. The drift ran north-west instead of south-east.
 */
describe("CreatureSprite", () => {
  const magmite = getCreatureByIdAndLevel(Species.Magmite, 1)!;

  it("puts the painted treatment on the sprite, not on an enclosing frame", () => {
    const { container } = render(
      <CreatureSprite spriteFile={magmite.spriteFile} size={72} alt="Magmite" painted />,
    );
    const img = container.querySelector("img")!;
    const treated = container.querySelector('[class*="painted"]')!;
    expect(treated).toBeTruthy();
    // The treated element must be the sprite's own wrapper — it contains the img directly, rather
    // than being some larger ancestor that also contains padding, types or badges.
    expect(treated.contains(img)).toBe(true);
    expect(treated.children).toHaveLength(1);
  });

  it("renders no painted treatment when the creature is not painted", () => {
    const { container } = render(
      <CreatureSprite spriteFile={magmite.spriteFile} size={72} alt="Magmite" />,
    );
    expect(container.querySelector('[class*="painted"]')).toBeNull();
  });

  it("exposes the sprite URL for the mask, so the rainbow follows the artwork's silhouette", () => {
    const { container } = render(
      <CreatureSprite spriteFile={magmite.spriteFile} size={72} alt="Magmite" painted />,
    );
    const wrap = container.firstElementChild as HTMLElement;
    const url = wrap.style.getPropertyValue("--sprite-url");
    expect(url).toContain(magmite.spriteFile!);
    // Same file the <img> resolves — a mask pointing at a different path would silently show nothing.
    expect(container.querySelector("img")!.getAttribute("src")).toContain(magmite.spriteFile!);
  });

  it("BatomonCard routes its sprite through CreatureSprite rather than tinting its frame", () => {
    const { container } = render(<BatomonCard creature={magmite} painted />);
    const treated = container.querySelector('[class*="painted"]')!;
    expect(treated, "card renders no painted treatment at all").toBeTruthy();
    // The guard against the original bug: the treated node must NOT be the frame that also holds
    // the type chips, or the rainbow covers the whole card window again.
    expect(treated.querySelectorAll("img")).toHaveLength(1);
    expect(treated.textContent).toBe("");
  });
});

/**
 * 2026-10-09, user-reported: "the mons are slightly too low in the details pane".
 *
 * They were, and the card's CSS was innocent — the artwork is drawn against the bottom of its
 * canvas, so centring the canvas puts the creature below centre by half the headroom.
 */
describe("optical centring of ground-anchored sprites", () => {
  // 12px of headroom against 1px underfoot in a 48px canvas, so the artwork's centre is 5.5px low
  // — a lean of 5.5/48, and an 11px lift at the card's 96px render.
  const panbud = getCreatureByIdAndLevel(Species.Panbud, 1)!;

  it("lifts the card's sprite by the artwork's own lean", () => {
    const { container } = render(<BatomonCard creature={panbud} />);
    const wrap = container.querySelector('[class*="wrap"]') as HTMLElement;
    // Against the sprite's OWN box, which is the token the well is also derived from. A percentage
    // would resolve against the containing block — the well — and the two are not the same size.
    expect(wrap.style.top).toBe(
      `calc(var(--card-sprite-size) * ${-spriteVerticalOffset(panbud.spriteFile)})`,
    );
  });

  it("lands every 48x48 sprite's lean on a whole pixel at the card's 2x render", () => {
    // `image-rendering: pixelated` is only crisp on whole pixels, and a lean is always a whole
    // number of HALF source pixels — so 2x of the 48x48 source is exactly where it comes out even.
    //
    // The two Aviarab sprites are the corpus's only 44x44 art. 96px is a 2.18x scale of those, so
    // they are resampled by the <img> before any offset is applied and there is no crispness left
    // for a whole-pixel lean to protect. They are named rather than filtered by a tolerance, so a
    // THIRD odd-sized sprite entering the corpus fails this instead of slipping through.
    const fractional = Object.entries(SPRITE_VERTICAL_OFFSETS)
      .filter(([, lean]) => Math.abs(lean * 96 - Math.round(lean * 96)) > 1e-3)
      .map(([file]) => file);
    expect(fractional).toEqual(["aviarab.png", "aviarab_shiny.png"]);
  });

  it("leaves a sprite alone unless the call site opts in", () => {
    // The team grid reads as a board: lifting each creature by a different amount would leave them
    // standing at different heights, which is worse than all of them standing low together.
    const { container } = render(
      <CreatureSprite spriteFile={panbud.spriteFile} size={96} alt="Panbud" />,
    );
    expect((container.firstElementChild as HTMLElement).style.top).toBe("");
  });

  it("reports no lean for a sprite that is already centred", () => {
    // A centred sprite is OMITTED from the generated table rather than stored as 0, so a lookup
    // miss has to read as centred for those 19 records to render correctly at all.
    expect(spriteVerticalOffset("stellagon.png")).toBe(0);
    expect(spriteVerticalOffset(undefined)).toBe(0);
  });
});

describe("cumulative chart draws steps, not slopes (2026-10-06)", () => {
  it("every series on the cumulative chart is stepAfter", () => {
    // Cumulative damage changes at an instant and holds. Straight-line interpolation drew a
    // diagonal between samples: Magmite casts at t=4.5, and the Shield line sloped up from (4, 0)
    // to (4.5, 40), so the chart appeared to show the cast starting at t=4.0 and the engine looked
    // half a second wrong when it was right.
    //
    // Asserted against the source rather than the DOM because Recharts renders an SVG path whose
    // `type` is not recoverable from the markup.
    const src = readFileSync("src/ui/CumulativeChart/CumulativeChart.tsx", "utf8");
    const seriesEntries = src.match(/\{ name: "[^"]+", values:[^}]+\}/g) ?? [];
    // Five: Total, Direct, Burn, Poison, Shock. Shield is deliberately not on a DAMAGE chart.
    expect(seriesEntries.length).toBe(5);
    for (const entry of seriesEntries) {
      const name = /name: "([^"]+)"/.exec(entry)![1];
      expect(entry, `${name} is not stepAfter`).toContain('lineType: "stepAfter"');
    }
  });
});
