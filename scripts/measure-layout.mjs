/**
 * Measures the builder row's real geometry in a browser.
 *
 * Added because this layout was debugged three times from arithmetic and the arithmetic was wrong
 * each time — the base font-size is 18px, not the 16px every hand calculation assumed, so every rem
 * token is 12.5% larger than it looks. Overlap is reported as a NUMBER here rather than inferred
 * from a screenshot.
 *
 * Usage: node scripts/measure-layout.mjs [url] [viewportWidth]
 */
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:5174/batomon-calculator/";
const width = Number(process.argv[3] ?? 1649);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 1000 } });
await page.goto(url, { waitUntil: "networkidle" });

const data = await page.evaluate(() => {
  const px = (el, prop) => (el ? getComputedStyle(el).getPropertyValue(prop).trim() : "—");
  const box = (el) => (el ? { left: Math.round(el.getBoundingClientRect().left), right: Math.round(el.getBoundingClientRect().right), width: Math.round(el.getBoundingClientRect().width) } : null);

  const root = document.getElementById("root");
  const main = document.querySelector("main");
  const grid = document.querySelector('[class*="grid"][class*="_"]');
  // The builder row is the flex container holding the team column and the detail panel.
  const row = grid?.closest("div[style*='flex']")?.parentElement;
  const leftCol = grid?.closest("div[style*='column']");
  const panel = leftCol?.nextElementSibling;
  const card = grid?.firstElementChild;
  const sprite = document.querySelector('img[alt][src*="sprites/monster"]');

  const tok = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  return {
    rootFontSize: px(document.documentElement, "font-size"),
    tokens: {
      "--sprite-grid": tok("--sprite-grid"),
      "--grid-slot-size": tok("--grid-slot-size"),
      "--team-column-width": tok("--team-column-width"),
      "--detail-panel-width": tok("--detail-panel-width"),
      "--builder-row-width": tok("--builder-row-width"),
    },
    rootWidth: box(root)?.width,
    mainWidth: box(main)?.width,
    mainMaxWidth: px(main, "max-width"),
    row: box(row),
    leftCol: box(leftCol),
    grid: box(grid),
    gridTemplate: px(grid, "grid-template-columns"),
    card: box(card),
    panel: box(panel),
    sprite: sprite ? { w: Math.round(sprite.getBoundingClientRect().width), h: Math.round(sprite.getBoundingClientRect().height) } : null,
  };
});

const overlap = data.grid && data.panel ? data.grid.right - data.panel.left : null;
console.log(JSON.stringify({ ...data, OVERLAP_PX: overlap }, null, 2));
await browser.close();
