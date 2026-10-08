/**
 * Functional check: dragging a card onto an occupied slot must still swap the two creatures,
 * and a plain click (no movement) must still open the picker rather than being eaten.
 */
const { chromium } = require("playwright");
const fs = require("fs");

const BUILD = fs.readFileSync(__dirname + "/board.txt", "utf8").trim();

const names = (page) =>
  page.evaluate(`
    [...document.querySelectorAll('[role="button"][aria-label*="Click to change, or drag"]')]
      .map((el) => (el.getAttribute('aria-label') || '').split(',')[0])
  `);

(async () => {
  const [baseUrl] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  await page.goto(`${baseUrl}?b=${encodeURIComponent(BUILD)}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const cards = page.locator('[role="button"][aria-label*="Click to change, or drag"]');
  const before = await names(page);
  console.log("before:", before.join(", "));

  const a = await cards.nth(0).boundingBox();
  const b = await cards.nth(1).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  for (let s = 1; s <= 12; s++) {
    await page.mouse.move(a.x + a.width / 2 + ((b.x - a.x) * s) / 12, a.y + a.height / 2 + ((b.y - a.y) * s) / 12);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(800);

  const after = await names(page);
  console.log("after: ", after.join(", "));
  const swapped = after[0] === before[1] && after[1] === before[0];
  console.log("SWAP WORKS:", swapped);

  // A click with no movement must still open the creature picker.
  await page.mouse.click(a.x + a.width / 2, a.y + a.height / 2);
  await page.waitForTimeout(600);
  const modalOpen = await page.evaluate(`!!document.querySelector('[role="dialog"], dialog[open]')`);
  console.log("CLICK STILL OPENS PICKER:", modalOpen);

  // Text selection should not be triggered by the drag either.
  const selection = await page.evaluate("String(window.getSelection())");
  console.log("stray text selection:", JSON.stringify(selection));

  await browser.close();
  process.exit(swapped && modalOpen ? 0 : 1);
})();
