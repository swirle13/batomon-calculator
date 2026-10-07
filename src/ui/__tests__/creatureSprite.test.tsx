import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { CreatureSprite } from "../shared/CreatureSprite";
import { BatomonCard } from "../shared/BatomonCard/BatomonCard";
import { corpus } from "../../data/corpus";

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
  const magmite = corpus.creatures.find((c) => c.id === "magmite" && c.level === 1)!;

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
