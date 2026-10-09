/**
 * Analyses a Chrome DevTools Performance trace of card drags.
 *
 * Usage: node scripts/analyze_trace.cjs <trace.gz> [label]
 */
const fs = require("fs");
const zlib = require("zlib");

const file = process.argv[2];
const label = process.argv[3] || file;

let raw = fs.readFileSync(file);
if (file.endsWith(".gz")) raw = zlib.gunzipSync(raw);
const json = JSON.parse(raw.toString("utf8"));
const ev = Array.isArray(json) ? json : json.traceEvents;

console.log(`\n================ ${label} ================`);
console.log(`events: ${ev.length}`);

// ---------- 1. Is this dev or prod? ----------
const urls = new Set();
for (const e of ev) {
  const d = e.args && (e.args.data || e.args.beginData);
  const u = d && (d.url || d.documentLoaderURL);
  if (typeof u === "string" && u.startsWith("http")) urls.add(u.split("?")[0]);
}
const list = [...urls];
const isDev =
  list.some((u) => /localhost:\d+/.test(u) && /\/src\/|\/@vite|\/node_modules\/\.vite/.test(u)) ||
  list.some((u) => /@react-refresh|\/@vite\/client/.test(u));
const isProd = list.some((u) => /\/assets\/index-[A-Za-z0-9_-]+\.js/.test(u));
console.log(`origin: ${[...new Set(list.map((u) => u.replace(/^(https?:\/\/[^/]+).*/, "$1")))].join(", ")}`);
console.log(`looks like: ${isDev ? "DEV (unbundled /src modules or vite client present)" : isProd ? "PRODUCTION (hashed /assets bundle)" : "unclear"}`);
const sample = list.filter((u) => /\.js|\.tsx|\.ts/.test(u)).slice(0, 6);
if (sample.length) console.log("  js urls seen: " + sample.map((u) => u.split("/").slice(-1)[0]).join(", "));

// ---------- 2. Interactions ----------
const begins = new Map();
const inter = [];
for (const e of ev) {
  if (e.name !== "EventTiming") continue;
  if (e.ph === "b") begins.set(e.id, e);
  else if (e.ph === "e") {
    const b = begins.get(e.id);
    if (!b) continue;
    const d = (b.args && b.args.data) || {};
    inter.push({
      type: d.type,
      interactionId: d.interactionId,
      dur: (e.ts - b.ts) / 1000,
      processingStart: d.processingStart,
      processingEnd: d.processingEnd,
      nodeName: d.nodeName,
      ts: b.ts,
    });
  }
}
const withId = inter.filter((i) => i.interactionId);
const byId = new Map();
for (const i of withId) {
  if (!byId.has(i.interactionId)) byId.set(i.interactionId, []);
  byId.get(i.interactionId).push(i);
}
console.log(`\ninteractions (distinct non-zero interactionId): ${byId.size}`);
const groups = [...byId.entries()]
  .map(([id, g]) => ({ id, dur: Math.max(...g.map((x) => x.dur)), types: [...new Set(g.map((x) => x.type))], ts: Math.min(...g.map((x) => x.ts)) }))
  .sort((a, b) => a.ts - b.ts);
for (const g of groups) {
  console.log(`  id ${String(g.id).padStart(5)}  ${g.dur.toFixed(0).padStart(5)}ms   ${g.types.join(",")}`);
}
if (groups.length) {
  const sorted = [...groups].sort((a, b) => b.dur - a.dur);
  console.log(`  -> INP (worst interaction): ${sorted[0].dur.toFixed(0)}ms`);
}

// Did the browser start a native drag?
const dragStarts = inter.filter((i) => i.type === "dragstart").length;
const cancels = inter.filter((i) => i.type === "pointercancel").length;
console.log(`  native dragstart events: ${dragStarts}, pointercancel events: ${cancels}`);

// ---------- 3. Long tasks ----------
const tasks = ev.filter((e) => e.name === "RunTask" && e.dur > 50000).sort((a, b) => b.dur - a.dur);
console.log(`\nlong tasks >50ms: ${tasks.length}`);
for (const t of tasks.slice(0, 8)) console.log(`  ${(t.dur / 1000).toFixed(0)}ms`);

// ---------- 4. CPU profile ----------
const nodesById = new Map();
const selfTime = new Map();
let totalMs = 0;
for (const c of ev) {
  if (c.name !== "ProfileChunk") continue;
  const cpu = c.args && c.args.data && c.args.data.cpuProfile;
  if (!cpu) continue;
  for (const n of cpu.nodes || []) nodesById.set(n.id, n);
  const deltas = (c.args.data.timeDeltas) || [];
  const samples = cpu.samples || [];
  for (let i = 0; i < samples.length; i++) {
    const dt = (deltas[i] || 0) / 1000;
    if (dt < 0 || dt > 100) continue;
    selfTime.set(samples[i], (selfTime.get(samples[i]) || 0) + dt);
    totalMs += dt;
  }
}
if (totalMs > 0) {
  const agg = new Map();
  for (const [id, ms] of selfTime) {
    const n = nodesById.get(id);
    const cf = n && n.callFrame;
    if (!cf) continue;
    const fileName = (cf.url || "").split("/").pop() || "(native)";
    const key = `${cf.functionName || "(anonymous)"}  [${fileName.slice(0, 40)}]`;
    agg.set(key, (agg.get(key) || 0) + ms);
  }
  const idle = [...agg.entries()].filter(([k]) => k.startsWith("(idle)")).reduce((s, [, v]) => s + v, 0);
  console.log(`\nCPU: ${totalMs.toFixed(0)}ms sampled, ${idle.toFixed(0)}ms idle, ${(totalMs - idle).toFixed(0)}ms busy`);
  console.log("top self-time (excluding idle):");
  for (const [k, ms] of [...agg.entries()].filter(([k]) => !k.startsWith("(idle)")).sort((a, b) => b[1] - a[1]).slice(0, 22)) {
    console.log(`  ${ms.toFixed(1).padStart(8)}ms  ${k}`);
  }
  const byFile = new Map();
  for (const [k, ms] of agg) {
    if (k.startsWith("(idle)")) continue;
    const f = k.slice(k.lastIndexOf("[") + 1, -1);
    byFile.set(f, (byFile.get(f) || 0) + ms);
  }
  console.log("by file:");
  for (const [f, ms] of [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${ms.toFixed(1).padStart(8)}ms  ${f}`);
  }
}
