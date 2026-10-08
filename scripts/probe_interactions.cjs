/**
 * Why does one press-drag-release produce TWO "pointer" interactions in DevTools?
 *
 * Logs the raw event sequence plus the interactionId Chrome assigns to each event. A single
 * gesture should carry ONE non-zero interactionId; two means the browser tore the gesture in half.
 */
const { chromium } = require("playwright");
const fs = require("fs");

const BUILD = fs.readFileSync(__dirname + "/board.txt", "utf8").trim();

const PROBE = `
  window.__seq = [];
  const types = ['pointerdown','mousedown','pointercancel','dragstart','drag','dragend','drop','pointerup','mouseup','click'];
  for (const t of types) {
    document.addEventListener(t, (e) => {
      window.__seq.push({ t, target: e.target && e.target.tagName ? e.target.tagName.toLowerCase() : String(e.target), defaultPrevented: e.defaultPrevented });
    }, true);
  }
  window.__inter = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      window.__inter.push({ name: e.name, dur: e.duration, id: e.interactionId, proc: e.processingEnd - e.processingStart });
    }
  }).observe({ type: 'event', durationThreshold: 0, buffered: true });
`;

(async () => {
  const [baseUrl] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  await page.addInitScript(PROBE);
  await page.goto(`${baseUrl}?b=${encodeURIComponent(BUILD)}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  const cards = page.locator('[role="button"][aria-label*="Click to change, or drag"]');

  for (let i = 0; i < 3; i++) {
    await page.evaluate("window.__seq = []; window.__inter = [];");
    // Always slot 0 -> slot 1, matching the user's "top-left to top-middle, every time".
    const a = await cards.nth(0).boundingBox();
    const b = await cards.nth(1).boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    for (let s = 1; s <= 12; s++) {
      await page.mouse.move(
        a.x + a.width / 2 + ((b.x - a.x) * s) / 12,
        a.y + a.height / 2 + ((b.y - a.y) * s) / 12,
      );
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await page.waitForTimeout(700);

    const seq = await page.evaluate("window.__seq");
    const inter = await page.evaluate("window.__inter");
    console.log(`\n--- gesture ${i + 1} ---`);
    console.log("  event sequence: " + seq.map((s) => `${s.t}(${s.target})`).join(" -> "));
    const ids = [...new Set(inter.filter((e) => e.id).map((e) => e.id))];
    console.log(`  distinct non-zero interactionIds: ${ids.length}  ${JSON.stringify(ids)}`);
    for (const id of ids) {
      const group = inter.filter((e) => e.id === id);
      const dur = Math.max(...group.map((e) => e.dur));
      console.log(`    id ${id}: ${group.map((e) => e.name).join(",")}  maxDuration=${dur.toFixed(0)}ms`);
    }
  }

  await browser.close();
})();
