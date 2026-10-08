/**
 * What is the browser doing between the drop handler finishing and the frame appearing?
 *
 * Reports layout shifts attributed to a drag, and the size of the area that has to be re-laid-out
 * and repainted when the two cards swap.
 */
const { chromium } = require("playwright");
const fs = require("fs");

const BUILD = fs.readFileSync(__dirname + "/board.txt", "utf8").trim();

const PROBE = `
  window.__shifts = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      window.__shifts.push({
        value: e.value,
        sources: (e.sources || []).map((s) => ({
          node: s.node && s.node.tagName ? s.node.tagName.toLowerCase() + '.' + (String(s.node.className || '').trim().split(/\\s+/)[0] || '') : String(s.node),
          from: s.previousRect ? [s.previousRect.x, s.previousRect.y, s.previousRect.width, s.previousRect.height] : null,
          to: s.currentRect ? [s.currentRect.x, s.currentRect.y, s.currentRect.width, s.currentRect.height] : null,
        })),
      });
    }
  }).observe({ type: 'layout-shift', buffered: true });
`;

(async () => {
  const [baseUrl] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(PROBE);
  await page.goto(`${baseUrl}?b=${encodeURIComponent(BUILD)}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  const cards = page.locator('[role="button"][aria-label*="Click to change, or drag"]');

  for (let i = 0; i < 3; i++) {
    await page.evaluate("window.__shifts = []");
    const a = await cards.nth(0).boundingBox();
    const b = await cards.nth(1).boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    for (let s = 1; s <= 12; s++) {
      await page.mouse.move(a.x + a.width / 2 + ((b.x - a.x) * s) / 12, a.y + a.height / 2 + ((b.y - a.y) * s) / 12);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await page.waitForTimeout(900);
    const shifts = await page.evaluate("window.__shifts");
    console.log(`\ndrag ${i + 1}: ${shifts.length} layout shift(s)`);
    for (const s of shifts) {
      console.log(`  value=${s.value.toFixed(4)}`);
      for (const src of s.sources) console.log(`    ${src.node}  ${JSON.stringify(src.from)} -> ${JSON.stringify(src.to)}`);
    }
  }

  // How much of the page is below the grid and therefore re-laid-out when things resize?
  const geom = await page.evaluate(`
    (() => {
      const out = {};
      const pick = (sel) => { const el = document.querySelector(sel); return el ? Math.round(el.getBoundingClientRect().height) : null; };
      out.documentHeight = document.documentElement.scrollHeight;
      out.viewport = window.innerHeight;
      out.svgCount = document.querySelectorAll('svg').length;
      out.svgPathCount = document.querySelectorAll('svg path').length;
      out.totalElements = document.querySelectorAll('*').length;
      return out;
    })()
  `);
  console.log("\npage geometry:", JSON.stringify(geom, null, 1));

  await browser.close();
})();
