/**
 * Reproduces the LCP the user actually sees: scrolled down past the <h1>, reloading with the
 * network cache disabled (both visible in their DevTools screenshots).
 *
 * Usage: node scripts/probe_lcp_reload.cjs <baseUrl> <label> [--nocache] [--scrolled]
 */
const { chromium } = require("playwright");
const fs = require("fs");

const BUILD = fs.readFileSync(__dirname + "/board.txt", "utf8").trim();

const PROBE = `
  window.__lcp = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      window.__lcp.push({
        t: e.startTime, size: e.size,
        tag: e.element ? e.element.tagName.toLowerCase() : null,
        cls: e.element ? String(e.element.className || '').slice(0, 34) : null,
        text: e.element ? (e.element.textContent || '').slice(0, 40) : null,
      });
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
`;

(async () => {
  const args = process.argv.slice(2);
  const [baseUrl, label] = args;
  const noCache = args.includes("--nocache");
  const scrolled = args.includes("--scrolled");

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1024, height: 780 } });
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send("Network.enable");
  if (noCache) await client.send("Network.setCacheDisabled", { cacheDisabled: true });
  await page.addInitScript(PROBE);

  await page.goto(`${baseUrl}?b=${encodeURIComponent(BUILD)}`, { waitUntil: "load" });
  await page.waitForTimeout(1500);

  if (scrolled) {
    // Put the grid at the top of the viewport, exactly as in the screenshots.
    await page.evaluate("window.scrollTo(0, 420)");
    await page.waitForTimeout(400);
  }

  let requests = 0;
  page.on("response", () => requests++);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(4000);

  const lcp = await page.evaluate("window.__lcp");
  const scrollY = await page.evaluate("window.scrollY");
  console.log(`\n===== ${label} ${noCache ? "[cache disabled]" : "[cache on]"} ${scrolled ? "[scrolled to grid]" : "[at top]"} =====`);
  console.log(`  requests on reload: ${requests}, scrollY after reload: ${scrollY}`);
  for (const c of lcp) {
    console.log(`    ${c.t.toFixed(0).padStart(6)}ms  size=${String(c.size).padStart(7)}  <${c.tag} class="${c.cls}">  "${(c.text || "").replace(/\s+/g, " ")}"`);
  }
  const last = lcp[lcp.length - 1];
  console.log(`  FINAL LCP: ${last ? last.t.toFixed(0) + "ms on <" + last.tag + ">" : "none"}`);

  await browser.close();
})();
