/**
 * Correctness check for the deferred charts: they must still reach the right state, just later.
 *
 * Changes the board in a way that provably moves the numbers (removing a creature), then compares
 * the rendered chart against a FRESH page load of the same resulting board. If deferral left
 * anything stale the two would differ.
 */
const { chromium } = require("playwright");
const fs = require("fs");

const BUILD = fs.readFileSync(__dirname + "/board.txt", "utf8").trim();

const chartSignature = async (page) =>
  page.evaluate(`
    [...document.querySelectorAll('svg path.recharts-line-curve')]
      .map((p) => (p.getAttribute('d') || '').slice(0, 120)).join(' | ')
  `);

(async () => {
  const [baseUrl] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1400 } });
  await page.goto(`${baseUrl}?b=${encodeURIComponent(BUILD)}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  const before = await chartSignature(page);
  console.log("chart lines rendered:", (before.match(/\|/g) || []).length + 1);

  // Remove one creature — this definitely changes total damage.
  await page.locator('button[aria-label^="Remove "]').first().click();
  await page.waitForTimeout(1500);
  const afterDeferred = await chartSignature(page);

  console.log("chart changed after edit:", before !== afterDeferred);

  // Now grab the resulting build code and load it fresh, as ground truth.
  const code = await page.evaluate(`
    (() => {
      const ta = [...document.querySelectorAll('textarea')].find((t) => (t.value || '').startsWith('bat1:'));
      return ta ? ta.value : null;
    })()
  `);
  if (!code) {
    console.log("could not read build code from ShareBuild; skipping ground-truth comparison");
    await browser.close();
    return;
  }

  const fresh = await browser.newPage({ viewport: { width: 1600, height: 1400 } });
  await fresh.goto(`${baseUrl}?b=${encodeURIComponent(code)}`, { waitUntil: "networkidle" });
  await fresh.waitForTimeout(2500);
  const truth = await chartSignature(fresh);

  console.log("deferred render matches fresh load:", afterDeferred === truth);
  if (afterDeferred !== truth) {
    console.log("  deferred:", afterDeferred.slice(0, 200));
    console.log("  fresh   :", truth.slice(0, 200));
  }

  await page.screenshot({ path: "/tmp/after_fix.png", fullPage: false });
  await browser.close();
})();
