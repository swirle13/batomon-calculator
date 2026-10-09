/**
 * Per-thread CPU attribution for a Performance trace.
 *
 * The whole point: work on the renderer's main thread blocks interaction; identical work on a
 * DedicatedWorker does not. An aggregate profile cannot tell the two apart.
 *
 * Usage: node scripts/analyze_threads.cjs <trace.gz> [label]
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

// Thread names come from metadata events.
const threadName = new Map();
for (const e of ev) {
  if (e.name === "thread_name" && e.args && e.args.name) threadName.set(`${e.pid}:${e.tid}`, e.args.name);
}

// Per-thread CPU self time.
const perThread = new Map();
for (const c of ev) {
  if (c.name !== "ProfileChunk") continue;
  const data = c.args && c.args.data;
  const cpu = data && data.cpuProfile;
  if (!cpu) continue;
  const key = `${c.pid}:${c.tid}`;
  if (!perThread.has(key)) perThread.set(key, { nodes: new Map(), self: new Map(), total: 0 });
  const slot = perThread.get(key);
  for (const n of cpu.nodes || []) slot.nodes.set(n.id, n);
  const deltas = data.timeDeltas || [];
  const samples = cpu.samples || [];
  for (let i = 0; i < samples.length; i++) {
    const dt = (deltas[i] || 0) / 1000;
    if (dt < 0 || dt > 100) continue;
    slot.self.set(samples[i], (slot.self.get(samples[i]) || 0) + dt);
    slot.total += dt;
  }
}

console.log(`\n================ ${label} — PER THREAD ================`);

// ProfileChunk tid often refers to the profiled thread via a separate mapping; fall back to
// correlating with the Profile event that started it.
const profileThread = new Map();
for (const e of ev) {
  if (e.name === "Profile" && e.args && e.args.data) {
    profileThread.set(`${e.pid}:${e.tid}`, e.args.data.startTime);
  }
}

for (const [key, slot] of [...perThread.entries()].sort((a, b) => b[1].total - a[1].total)) {
  const agg = new Map();
  for (const [id, ms] of slot.self) {
    const n = slot.nodes.get(id);
    const cf = n && n.callFrame;
    if (!cf) continue;
    const f = (cf.url || "").split("/").pop() || "(native)";
    agg.set(`${cf.functionName || "(anonymous)"} [${f.slice(0, 34)}]`, (agg.get(`${cf.functionName || "(anonymous)"} [${f.slice(0, 34)}]`) || 0) + ms);
  }
  const idle = [...agg.entries()].filter(([k]) => k.startsWith("(idle)")).reduce((s, [, v]) => s + v, 0);
  const busy = slot.total - idle;
  const name = threadName.get(key) || "(unnamed)";
  console.log(`\nthread ${key}  "${name}"   sampled ${slot.total.toFixed(0)}ms, busy ${busy.toFixed(0)}ms`);
  for (const [k, ms] of [...agg.entries()].filter(([k]) => !k.startsWith("(idle)")).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`     ${ms.toFixed(1).padStart(8)}ms  ${k}`);
  }
}

// Long tasks per thread, which is what actually blocks input.
console.log(`\n---- RunTask > 50ms, by thread ----`);
const tasksByThread = new Map();
for (const e of ev) {
  if (e.name !== "RunTask" || !e.dur || e.dur <= 50000) continue;
  const key = `${e.pid}:${e.tid}`;
  if (!tasksByThread.has(key)) tasksByThread.set(key, []);
  tasksByThread.get(key).push(e.dur / 1000);
}
for (const [key, arr] of [...tasksByThread.entries()].sort((a, b) => b[1].length - a[1].length)) {
  arr.sort((a, b) => b - a);
  console.log(`  ${key} "${threadName.get(key) || "(unnamed)"}": ${arr.length} tasks, longest ${arr.slice(0, 5).map((v) => v.toFixed(0) + "ms").join(", ")}`);
}
