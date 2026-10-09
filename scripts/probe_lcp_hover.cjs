/**
 * Does hovering the grid push LCP later?
 *
 * LCP keeps updating until the first click/keypress, and the detail panel swaps its ability text
 * as you hover each card. A longer paragraph is a BIGGER contentful element, so it becomes a new
 * LCP candidate at the moment it paints -- seconds after load, through no fault of the load.
 */
const { chromium } = require("playwright");
const fs = require("fs");

const BUILD = fs.readFileSync(__dirname + "/board.txt", "utf8").trim();

const PROBE = `
  window.__lcp = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      window.__lcp.push({
        t: e.startTime,
        size: e.size,
        tag: e.element ? e.element.tagName.toLowerCase() : null,
        cls: e.element ? String(e.element.className || '').slice(0, 30) : null,
        text: e.element ? (e.element.textContent || '').slice(0, 45) : null,
      });
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
`;

(async () => {
  const [baseUrl, mode] = process.argv.slice(2);
  const browser = await chromium.launch();
  // Matching the user's window, which is narrower than my earlier runs.
  const page = await browser.newPage({ viewport: { width: 1024, height: 900 } });
  await page.addInitScript(PROBE);
  await page.goto(`${baseUrl}?b=${encodeURIComponent(BUILD)}`, { waitUntil: "load" });
  await page.waitForTimeout(2000);

  const report = async (when) => {
    const lcp = await page.evaluate("window.__lcp");
    const last = lcp[lcp.length - 1];
    console.log(`  ${when.padEnd(34)} LCP=${last ? last.t.toFixed(0) + "ms" : "-"}  <${last ? last.tag : "-"} class="${last ? last.cls : ""}"> size=${last ? last.size : "-"}`);
    return lcp;
  };

  console.log(`\n=== ${mode === "hover" ? "LOAD, WAIT, THEN HOVER CARDS" : "LOAD AND SIT STILL"} ===`);
  await report("after load (2s)");

  if (mode === "hover") {
    const cards = page.locator('[role="button"][aria-label*="Click to change, or drag"]');
    const n = await cards.count();
    for (let i = 0; i < n; i++) {
      await page.waitForTimeout(500);
      const box = await cards.nth(i).boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(300);
      await report(`after hovering card ${i + 1}`);
    }
  } else {
    await page.waitForTimeout(4000);
    await report("after sitting idle 6s");
  }

  const all = await page.evaluate("window.__lcp");
  console.log("\n  every LCP candidate, in order:");
  for (const c of all) {
    console.log(`    ${c.t.toFixed(0).padStart(6)}ms  size=${String(c.size).padStart(7)}  <${c.tag} class="${c.cls}">  "${(c.text || "").replace(/\s+/g, " ")}"`);
  }

  await browser.close();
})();
