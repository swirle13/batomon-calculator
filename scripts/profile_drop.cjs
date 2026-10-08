/**
 * Profiles the JS executed during a single card-to-card drop, attributing self-time by function.
 *
 * Usage: node scripts/profile_drop.cjs <baseUrl> <label> [cpuThrottle]
 */
const { chromium } = require("playwright");
const fs = require("fs");

const BUILD = fs.readFileSync(__dirname + "/board.txt", "utf8").trim();

(async () => {
  const [baseUrl, label, throttle] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  const client = await page.context().newCDPSession(page);
  if (throttle && Number(throttle) > 1) {
    await client.send("Emulation.setCPUThrottlingRate", { rate: Number(throttle) });
  }

  await page.goto(`${baseUrl}?b=${encodeURIComponent(BUILD)}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  const cards = page.locator('[role="button"][aria-label*="Click to change, or drag"]');
  if ((await cards.count()) < 4) {
    console.log("board failed to load");
    await browser.close();
    process.exit(1);
  }

  await client.send("Profiler.enable");
  await client.send("Profiler.setSamplingInterval", { interval: 100 }); // 0.1ms
  await client.send("Profiler.start");

  for (let i = 0; i < 6; i++) {
    const a = await cards.nth(i % 2 === 0 ? 0 : 3).boundingBox();
    const b = await cards.nth(i % 2 === 0 ? 3 : 0).boundingBox();
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
    await page.waitForTimeout(600);
  }

  const { profile } = await client.send("Profiler.stop");

  // Self time per node.
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const interval = (profile.endTime - profile.startTime) / profile.samples.length / 1000; // ms
  for (const id of profile.samples) self.set(id, (self.get(id) || 0) + interval);

  const agg = new Map();
  for (const [id, ms] of self) {
    const n = byId.get(id);
    const cf = n && n.callFrame;
    if (!cf) continue;
    const file = (cf.url || "").split("/").pop() || "";
    const key = `${cf.functionName || "(anonymous)"}  [${file}]`;
    agg.set(key, (agg.get(key) || 0) + ms);
  }

  const total = [...agg.values()].reduce((a, b) => a + b, 0);
  const idle = agg.get("(idle)  []") || agg.get("(idle)  ") || 0;
  console.log(`\n===== JS self-time during 6 drops — ${label} ${throttle > 1 ? `(${throttle}x throttle)` : ""} =====`);
  console.log(`total sampled ${total.toFixed(0)}ms, of which idle ${idle.toFixed(0)}ms\n`);
  const rows = [...agg.entries()]
    .filter(([k]) => !k.startsWith("(idle)"))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);
  for (const [k, ms] of rows) console.log(`${ms.toFixed(1).padStart(8)}ms  ${k}`);

  // Group by source file, which is the more actionable view.
  const byFile = new Map();
  for (const [k, ms] of agg) {
    if (k.startsWith("(idle)")) continue;
    const file = k.slice(k.lastIndexOf("[") + 1, -1) || "(native)";
    byFile.set(file, (byFile.get(file) || 0) + ms);
  }
  console.log("\n--- by file ---");
  for (const [f, ms] of [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`${ms.toFixed(1).padStart(8)}ms  ${f || "(native)"}`);
  }

  await browser.close();
})();
