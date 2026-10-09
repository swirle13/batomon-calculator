/**
 * Cold-load LCP breakdown.
 *
 * Usage: node scripts/measure_lcp.cjs <baseUrl> <label> [--board] [--throttle]
 */
const { chromium } = require("playwright");
const fs = require("fs");

const BUILD = fs.readFileSync(__dirname + "/board.txt", "utf8").trim();

const PROBE = `
  window.__lcp = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      window.__lcp.push({
        startTime: e.startTime,
        renderTime: e.renderTime,
        loadTime: e.loadTime,
        size: e.size,
        url: e.url,
        tag: e.element ? e.element.tagName.toLowerCase() : null,
        cls: e.element ? String(e.element.className || '') : null,
      });
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  window.__paints = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__paints.push({ name: e.name, t: e.startTime });
  }).observe({ type: 'paint', buffered: true });
`;

(async () => {
  const args = process.argv.slice(2);
  const baseUrl = args[0];
  const label = args[1];
  const withBoard = args.includes("--board");
  const throttle = args.includes("--throttle");

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  if (throttle) {
    await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await client.send("Network.enable");
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 40,
      downloadThroughput: (10 * 1024 * 1024) / 8,
      uploadThroughput: (3 * 1024 * 1024) / 8,
    });
  }
  await page.addInitScript(PROBE);

  let bytes = 0;
  let requests = 0;
  const big = [];
  page.on("response", async (res) => {
    requests++;
    try {
      const len = Number(res.headers()["content-length"] || 0);
      bytes += len;
      if (len > 50000) big.push(`${Math.round(len / 1024)}kB ${res.url().split("/").pop()}`);
    } catch {}
  });

  const url = withBoard ? `${baseUrl}?b=${encodeURIComponent(BUILD)}` : baseUrl;
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(5000);

  const lcp = await page.evaluate("window.__lcp");
  const paints = await page.evaluate("window.__paints");
  const nav = await page.evaluate(`JSON.parse(JSON.stringify(performance.getEntriesByType('navigation')[0]))`);

  console.log(`\n===== ${label} ${withBoard ? "(with board)" : "(empty board)"} ${throttle ? "[4x CPU, 10Mbit]" : "[no throttle]"} =====`);
  console.log(`  requests ${requests}, declared bytes ${(bytes / 1024).toFixed(0)}kB`);
  if (big.length) console.log(`  large: ${big.join(", ")}`);
  console.log(`  TTFB            ${nav.responseStart.toFixed(0)}ms`);
  for (const p of paints) console.log(`  ${p.name.padEnd(15)} ${p.t.toFixed(0)}ms`);
  const last = lcp[lcp.length - 1];
  if (last) {
    console.log(`  LCP             ${last.startTime.toFixed(0)}ms  <${last.tag} class="${(last.cls || "").slice(0, 40)}"> size=${last.size}`);
    console.log(`  LCP candidates: ${lcp.map((e) => `${e.startTime.toFixed(0)}ms/${e.tag}`).join(", ")}`);
  }
  console.log(`  domContentLoaded ${nav.domContentLoadedEventEnd.toFixed(0)}ms, load ${nav.loadEventEnd.toFixed(0)}ms`);

  await browser.close();
})();
