/**
 * Measures real interaction latency for a card-to-card drag on the team grid.
 *
 * Usage: node scripts/measure_inp.cjs <baseUrl> <label> [cpuThrottle]
 */
const { chromium } = require("playwright");
const fs = require("fs");

const BUILD = fs.readFileSync(__dirname + "/board.txt", "utf8").trim();

const OBSERVER = `
  window.__events = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      window.__events.push({
        name: e.name,
        duration: e.duration,
        start: e.startTime,
        processingStart: e.processingStart,
        processingEnd: e.processingEnd,
        interactionId: e.interactionId,
      });
    }
  }).observe({ type: 'event', durationThreshold: 16, buffered: true });

  window.__longtasks = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__longtasks.push({ duration: e.duration, start: e.startTime });
  }).observe({ type: 'longtask', buffered: true });
`;

(async () => {
  const [baseUrl, label, throttle] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  await page.addInitScript(OBSERVER);

  let client;
  if (throttle && Number(throttle) > 1) {
    client = await page.context().newCDPSession(page);
    await client.send("Emulation.setCPUThrottlingRate", { rate: Number(throttle) });
  }

  await page.goto(`${baseUrl}?b=${encodeURIComponent(BUILD)}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  const cards = page.locator('[role="button"][aria-label*="Click to change, or drag"]');
  const count = await cards.count();
  if (count < 2) {
    console.log(`${label}: FAILED to load board (found ${count} cards)`);
    await browser.close();
    process.exit(1);
  }

  // Clear the warm-up noise, then do several drags back and forth.
  await page.evaluate("window.__events = []; window.__longtasks = [];");

  const DRAGS = Number(process.env.DRAGS || 10);
  const perDrag = [];
  const allEvents = [];
  const allLongtasks = [];
  for (let i = 0; i < DRAGS; i++) {
    await page.evaluate("window.__events = []; window.__longtasks = [];");
    const a = await cards.nth(i % 2 === 0 ? 0 : 3).boundingBox();
    const b = await cards.nth(i % 2 === 0 ? 3 : 0).boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    // Past the 8px activation threshold, then across in steps like a real drag.
    for (let s = 1; s <= 12; s++) {
      await page.mouse.move(
        a.x + a.width / 2 + ((b.x - a.x) * s) / 12,
        a.y + a.height / 2 + ((b.y - a.y) * s) / 12,
      );
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await page.waitForTimeout(600);
    const evs = await page.evaluate("window.__events");
    const lts = await page.evaluate("window.__longtasks");
    allEvents.push(...evs);
    allLongtasks.push(...lts);
    const worst = evs.reduce((m, e) => (e.duration > (m ? m.duration : -1) ? e : m), null);
    const mu = evs.filter((e) => e.name === "mouseup");
    perDrag.push({
      i: i + 1,
      worst: worst ? worst.duration : 0,
      worstName: worst ? worst.name : "-",
      // The three subparts DevTools shows, for the worst event of this gesture.
      inputDelay: worst ? worst.processingStart - worst.start : 0,
      processing: worst ? worst.processingEnd - worst.processingStart : 0,
      presentation: worst ? worst.start + worst.duration - worst.processingEnd : 0,
      mouseupProc: mu.length ? Math.max(...mu.map((e) => e.processingEnd - e.processingStart)) : 0,
      longest: lts.length ? Math.max(...lts.map((t) => t.duration)) : 0,
    });
  }

  console.log(`\n===== PER-DRAG, IN ORDER — ${label} ${throttle > 1 ? `(${throttle}x throttle)` : "(no throttle)"} =====`);
  console.log("drag | worst event         | input delay | processing | presentation | longest task");
  for (const d of perDrag) {
    console.log(
      `${String(d.i).padStart(4)} | ${d.worst.toFixed(0).padStart(5)}ms ${d.worstName.padEnd(12)} | ${d.inputDelay.toFixed(0).padStart(8)}ms | ${d.processing.toFixed(0).padStart(7)}ms | ${d.presentation.toFixed(0).padStart(9)}ms | ${d.longest.toFixed(0).padStart(9)}ms`,
    );
  }
  const avg = (k) => perDrag.reduce((s, d) => s + d[k], 0) / perDrag.length;
  console.log(
    `MEAN | ${avg("worst").toFixed(0).padStart(5)}ms              | ${avg("inputDelay").toFixed(0).padStart(8)}ms | ${avg("processing").toFixed(0).padStart(7)}ms | ${avg("presentation").toFixed(0).padStart(9)}ms |`,
  );

  const events = allEvents;
  const longtasks = allLongtasks;

  const byType = {};
  for (const e of events) {
    const cur = byType[e.name] || { count: 0, max: 0, maxProc: 0 };
    cur.count++;
    cur.max = Math.max(cur.max, e.duration);
    cur.maxProc = Math.max(cur.maxProc, e.processingEnd - e.processingStart);
    byType[e.name] = cur;
  }

  console.log(`\n===== ${label} ${throttle > 1 ? `(${throttle}x CPU throttle)` : "(no throttle)"} =====`);
  const worst = [...events].sort((a, b) => b.duration - a.duration).slice(0, 6);
  console.log("Worst individual events:");
  for (const e of worst) {
    console.log(
      `  ${e.name.padEnd(14)} total ${e.duration.toFixed(0).padStart(5)}ms   processing ${(e.processingEnd - e.processingStart).toFixed(0).padStart(5)}ms   presentation ${(e.start + e.duration - e.processingEnd).toFixed(0).padStart(5)}ms`,
    );
  }
  console.log("By event type (max duration / max processing):");
  for (const [k, v] of Object.entries(byType).sort((a, b) => b[1].max - a[1].max)) {
    console.log(`  ${k.padEnd(14)} n=${String(v.count).padStart(3)}  max ${v.max.toFixed(0).padStart(5)}ms  proc ${v.maxProc.toFixed(0).padStart(5)}ms`);
  }
  const lt = longtasks.sort((a, b) => b.duration - a.duration).slice(0, 5);
  console.log("Longest long-tasks: " + (lt.map((t) => t.duration.toFixed(0) + "ms").join(", ") || "none"));

  await browser.close();
})();
