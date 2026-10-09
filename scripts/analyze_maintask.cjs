/**
 * Breaks down the biggest main-thread (CrRendererMain) tasks in a trace, and says whether each
 * one overlapped a user interaction or happened at load.
 *
 * Usage: node scripts/analyze_maintask.cjs <trace.gz> [label]
 */
const fs = require("fs");
const zlib = require("zlib");

const file = process.argv[2];
const label = process.argv[3] || file;
let raw = fs.readFileSync(file);
if (file.endsWith(".gz")) raw = zlib.gunzipSync(raw);
const ev = (() => {
  const j = JSON.parse(raw.toString("utf8"));
  return Array.isArray(j) ? j : j.traceEvents;
})();

const threadName = new Map();
for (const e of ev) {
  if (e.name === "thread_name" && e.args && e.args.name) threadName.set(`${e.pid}:${e.tid}`, e.args.name);
}
const mainKey = [...threadName.entries()].find(([, n]) => n === "CrRendererMain");
if (!mainKey) {
  console.log("no CrRendererMain thread found");
  process.exit(0);
}
const [mpid, mtid] = mainKey[0].split(":").map(Number);

// Interaction windows, so we can say "this task was during a drag".
const begins = new Map();
const interactions = [];
for (const e of ev) {
  if (e.name !== "EventTiming") continue;
  if (e.ph === "b") begins.set(e.id, e);
  else if (e.ph === "e") {
    const b = begins.get(e.id);
    if (!b) continue;
    const d = (b.args && b.args.data) || {};
    if (d.interactionId) interactions.push({ start: b.ts, end: e.ts, type: d.type, id: d.interactionId });
  }
}
const firstInteraction = interactions.length ? Math.min(...interactions.map((i) => i.start)) : Infinity;

const mainEvents = ev.filter((e) => e.pid === mpid && e.tid === mtid);
const tasks = mainEvents.filter((e) => e.name === "RunTask" && e.dur > 40000).sort((a, b) => b.dur - a.dur);

console.log(`\n================ ${label} — MAIN THREAD TASKS ================`);
console.log(`CrRendererMain = ${mpid}:${mtid};  ${tasks.length} tasks > 40ms\n`);

for (const t of tasks.slice(0, 6)) {
  const lo = t.ts;
  const hi = t.ts + t.dur;
  const during = interactions.find((i) => i.start < hi && i.end > lo);
  const when = during
    ? `DURING interaction ${during.id} (${during.type})`
    : lo < firstInteraction
      ? "before any interaction (page load)"
      : "between interactions";
  console.log(`--- ${(t.dur / 1000).toFixed(0)}ms task, ${when}`);

  const inside = mainEvents
    .filter((e) => e.ph === "X" && e.dur > 2000 && e.ts >= lo && e.ts + e.dur <= hi && e.name !== "RunTask")
    .sort((a, b) => b.dur - a.dur);

  // Roll up by event name, which is what tells you layout vs script vs paint.
  const byName = new Map();
  for (const e of inside) byName.set(e.name, (byName.get(e.name) || 0) + e.dur / 1000);
  const top = [...byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  for (const [n, ms] of top) console.log(`      ${ms.toFixed(0).padStart(5)}ms (sum)  ${n}`);

  // Name the actual functions called, where the trace records them.
  const fns = inside
    .filter((e) => e.args && e.args.data && e.args.data.functionName)
    .slice(0, 5)
    .map((e) => `${e.args.data.functionName}@${(e.args.data.url || "").split("/").pop()}:${e.args.data.lineNumber}`);
  if (fns.length) console.log(`      functions: ${[...new Set(fns)].join(", ")}`);
  console.log();
}

// Totals: how much main-thread time is spent in each phase across the whole trace.
console.log("---- whole-trace main-thread totals by event name ----");
const totals = new Map();
for (const e of mainEvents) {
  if (e.ph !== "X" || !e.dur) continue;
  if (["RunTask", "EventDispatch"].includes(e.name)) continue;
  totals.set(e.name, (totals.get(e.name) || 0) + e.dur / 1000);
}
for (const [n, ms] of [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)) {
  console.log(`  ${ms.toFixed(0).padStart(6)}ms  ${n}`);
}
