// Run arms A/B/C on the TEST split through the real /api/search route
// (in-process, EVAL_MODE=1) with a deterministic guided loop, then judge
// top-3 (arms A and C) and generate results.json + summary.md.
//
//   cd app && node --import ../../eval/chat/register-shim.mjs \
//     ../../eval/semantic/run.mjs
//
// Arm A: ?semantic=0  lexical only (current engine)
// Arm B: ?semantic=only  embeddings alone (ablation)
// Arm C: ?semantic=1   lexical + semantic fallback (the feature)
import fs from "node:fs";
import path from "node:path";

process.env.EVAL_MODE = "1";
const APP = process.cwd();
const REPO = path.join(APP, "..");
process.chdir(APP);

const panel = fs.readFileSync(path.join(REPO, "eval/semantic/panel.jsonl"), "utf8")
  .trim().split("\n").map((l) => JSON.parse(l));
const test = panel.filter((p) => p.split === "test");
console.log("test queries:", test.length);

const { POST } = await import("../../app/app/api/search/route.js");
const { loadCatalog } = await import("../../app/lib/catalog.js");
const { decideGuide } = await import("../../app/lib/guide.js");
const { judgeBatch } = await import("./judge.mjs");
const catalog = loadCatalog();

const z = 1.96;
function wilson(k, n) {
  if (!n) return [0, 0];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const m = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - m), Math.min(1, c + m)];
}
const pct = (k, n) => {
  const [lo, hi] = wilson(k, n);
  return { k, n, pct: n ? Math.round((100 * k) / n * 10) / 10 : 0, ci: [Math.round(lo * 1000) / 10, Math.round(hi * 1000) / 10] };
};

// ---- deterministic user simulator (same policy as E3) ----------------------
function pickOption(guide) {
  const opts = guide.options || [];
  const counts = {};
  for (const c of guide.optionCounts || []) counts[c.label] = c.count || 0;
  const t = guide.type;
  if (t === "budget") {
    const nums = [];
    for (const o of opts) {
      const m = String(o).match(/(\d[\d,]*)/);
      if (m && !/not sure|flexible/i.test(o)) nums.push([parseInt(m[1].replace(/,/g, ""), 10), String(o)]);
    }
    if (nums.length) return nums.sort((a, b) => a[0] - b[0])[Math.floor(nums.length / 2)][1];
    return String(opts[0] || "");
  }
  if (t === "brand") {
    for (const o of opts) if (/no preference|best rated/i.test(o)) return String(o);
    return String(opts[0] || "");
  }
  for (const o of opts) if (counts[String(o)] > 0) return String(o);
  return String(opts[0] || "");
}
const OCC_MAP = { wedding: "wedding", birthday: "birthday", anniversary: "anniversary",
  diwali: "diwali", dhanteras: "diwali", "bhai dooj": "diwali", christmas: "christmas",
  party: "party", graduation: "graduation", housewarming: "housewarming",
  "everyday use": null };
function mapSlots(guide, label) {
  const t = guide.type;
  if (t === "budget") {
    const m = String(label).match(/(\d[\d,]*)/);
    return { budget: m ? parseInt(m[1].replace(/,/g, ""), 10) : null, flexible: !m };
  }
  if (t === "occasion") return { occasion: OCC_MAP[String(label).toLowerCase()] ?? String(label).toLowerCase() };
  if (t === "category") return { category: String(label).toLowerCase() };
  if (t === "brand") return { brand: /no preference|best rated/i.test(label) ? "best_rated" : String(label).toLowerCase() };
  if (t === "for_whom") return { forWhom: String(label).toLowerCase() };
  if (t === "size") return { size: String(label).toLowerCase() };
  if (t === "capacity") return { capacity: String(label) };
  return {};
}

async function runArm(armParam, queries) {
  const out = [];
  for (const p of queries) {
    const url = `http://eval/api/search?semantic=${armParam}`;
    const slots = {};
    let results, intentN, sem = { used: false };
    const t0 = Date.now();
    const doSearch = async () => {
      const body = { query: p.query, limit: 48, relax: true };
      if (slots.budget) body.budget = slots.budget;
      if (slots.occasion) body.occasion = slots.occasion;
      if (slots.category) body.category = slots.category;
      if (slots.brand) body.brand = slots.brand;
      if (slots.forWhom) body.forWhom = slots.forWhom;
      if (slots.size) body.size = slots.size;
      if (slots.capacity) body.capacity = slots.capacity;
      const r = await POST(new Request(url, { method: "POST", body: JSON.stringify(body) }));
      return await r.json();
    };
    let j = await doSearch();
    results = j.results; intentN = results.filter((r) => r.intent).length;
    sem = j.semantic || { used: false };
    let questions = 0;
    let prevN = intentN;
    const asked = [];
    while (intentN < 2 && questions < 3) {
      const g = decideGuide(catalog, p.query, intentN, { turn: questions + 2, prevTypes: asked, lang: "en" });
      if (!g.ask) break;
      const label = pickOption(g);
      asked.push(g.type); questions++;
      const delta = mapSlots(g, label);
      Object.assign(slots, delta);
      const prevResults = results, prevSem = sem;
      j = await doSearch();
      results = j.results; intentN = results.filter((r) => r.intent).length;
      sem = j.semantic || sem;
      // client rollback rule: a refine that halves intentN keeps the old set
      if (prevN >= 2 && intentN < prevN * 0.5) {
        results = prevResults; intentN = prevN; sem = prevSem;
      }
    }
    out.push({
      id: p.id, q: p.query, kind: p.kind, arm: armParam,
      intentN, null: intentN < 2, questions,
      slots: { ...slots },
      top3: results.slice(0, 3).map((r) => ({ sku: r.sku, title: r.title, price: r.price, brand: r.brand || "", intent: !!r.intent })),
      n_results: results.length,
      sem, ms: Date.now() - t0,
    });
    if (p.kind === "dead_end") process.stdout.write(`  [${armParam}] ${p.id} ${p.query} -> intentN=${intentN} sem=${sem.used ? "used" : (sem.reason || "-")} q=${questions}\n`);
  }
  return out;
}

const A = await runArm("0", test);
console.log("arm A done");
const B = await runArm("only", test);
console.log("arm B done");
const C = await runArm("1", test);
console.log("arm C done");

// ---- judge top-3 for arms A and C (B: ablation, not judged this pass) ------
// Reuses prior verdicts when the (deterministic) top-3 sets are unchanged, so
// re-runs do not re-spend LLM tokens on identical results.
const prevPath = path.join(REPO, "eval/semantic/results/results.json");
const sameRecords = (cur, prev) => Array.isArray(prev) && cur.length === prev.length &&
  cur.every((r, i) => r.id === prev[i].id &&
    JSON.stringify((r.top3 || []).map((t) => t.sku)) === JSON.stringify((prev[i].top3 || []).map((t) => t.sku)));
let jA, jC;
try {
  const prev = JSON.parse(fs.readFileSync(prevPath, "utf8"));
  if (sameRecords(A, prev.records?.A) && sameRecords(C, prev.records?.C)) {
    jA = {}; jC = {};
    for (const r of prev.records.A) if (Array.isArray(r.judge)) jA[r.id] = r.judge;
    for (const r of prev.records.C) if (Array.isArray(r.judge)) jC[r.id] = r.judge;
    console.log("judge: reusing existing verdicts (top-3 unchanged)");
  } else throw new Error("records changed; re-judging");
} catch (e) {
  console.log("judge: fresh run (" + e.message + ")");
  jA = await judgeBatch(A.filter((r) => r.top3.length >= 1).map((r) => ({ id: r.id, q: r.q, results: r.top3 })));
  jC = await judgeBatch(C.filter((r) => r.top3.length >= 1).map((r) => ({ id: r.id, q: r.q, results: r.top3 })));
}
for (const r of A) r.judge = jA[r.id] || [];
for (const r of C) r.judge = jC[r.id] || [];

// ---- metrics ----------------------------------------------------------------
function armMetrics(recs, judgedRecs, judgeMap) {
  const n = recs.length;
  const nulls = recs.filter((r) => r.null);
  const qSum = recs.reduce((a, r) => a + r.questions, 0);
  const judgedN = judgedRecs.length;
  const s3 = judgedRecs.filter((r) => (r.judge || []).includes(1)).length;
  const u3 = judgedRecs.filter((r) => (r.judge || []).some((x) => x <= 2)).length;
  const m = {
    n, null: pct(nulls.length, n),
    success_at3: pct(s3, judgedN), usable_at3: pct(u3, judgedN),
    questions_avg: Math.round((qSum / n) * 100) / 100,
    by_kind: {},
  };
  const kinds = [...new Set(recs.map((r) => r.kind))];
  for (const k of kinds) {
    const rk = recs.filter((r) => r.kind === k);
    const jk = judgedRecs.filter((r) => r.kind === k);
    m.by_kind[k] = {
      n: rk.length,
      null: pct(rk.filter((r) => r.null).length, rk.length),
      success_at3: pct(jk.filter((r) => (r.judge || []).includes(1)).length, jk.length),
      usable_at3: pct(jk.filter((r) => (r.judge || []).some((x) => x <= 2)).length, jk.length),
      questions_avg: Math.round((rk.reduce((a, r) => a + r.questions, 0) / rk.length) * 100) / 100,
    };
  }
  return m;
}
const MA = armMetrics(A, A, null);
const MB = armMetrics(B, [], null);
const MC = armMetrics(C, C, null);
const deadC = C.filter((r) => r.kind === "dead_end");
const falseResolve = pct(deadC.filter((r) => !r.null).length, deadC.length);
const semUsed = C.filter((r) => r.sem && r.sem.used);
const semReasons = {};
for (const r of C) { const k = r.sem && (r.sem.reason || (r.sem.used ? "used" : "-")); semReasons[k] = (semReasons[k] || 0) + 1; }
const lat = C.filter((r) => r.sem && r.sem.ms != null).map((r) => r.sem.ms).sort((a, b) => a - b);
const p95 = (a) => a[Math.min(a.length - 1, Math.ceil(0.95 * a.length) - 1)] || 0;
const p50 = (a) => a[Math.floor(a.length / 2)] || 0;

// failure examples: arm C dead-ends that resolved (false) + worst judged
const failures = [
  ...deadC.filter((r) => !r.null).map((r) => ({ type: "dead_end_false_resolve", id: r.id, q: r.q, top3: r.top3 })),
];
for (const r of C) {
  if (r.judge && r.judge.length === 3 && r.judge.every((x) => x === 3) && r.kind !== "dead_end")
    failures.push({ type: "irrelevant_top3", id: r.id, q: r.q, top3: r.top3 });
}

const out = {
  generated_at: new Date().toISOString(),
  panel: "eval/semantic/panel.jsonl (frozen pre-run)",
  arms: { A: MA, B: MB, C: MC },
  dead_end_false_resolve_C: falseResolve,
  armC_semantic: { used: semUsed.length, n: C.length, reasons: semReasons,
                   p50_ms: p50(lat), p95_ms: p95(lat) },
  cfg: JSON.parse(fs.readFileSync(path.join(APP, "lib/semantic_config.json"), "utf8")),
  failures: failures.slice(0, 10),
  records: { A, B, C },
};
fs.mkdirSync(path.join(REPO, "eval/semantic/results"), { recursive: true });
fs.writeFileSync(path.join(REPO, "eval/semantic/results/results.json"), JSON.stringify(out, null, 1));
console.log("\n=== summary ===");
console.log("A null:", JSON.stringify(MA.null), "s@3:", JSON.stringify(MA.success_at3), "u@3:", JSON.stringify(MA.usable_at3), "q:", MA.questions_avg);
console.log("B null:", JSON.stringify(MB.null), "q:", MB.questions_avg);
console.log("C null:", JSON.stringify(MC.null), "s@3:", JSON.stringify(MC.success_at3), "u@3:", JSON.stringify(MC.usable_at3), "q:", MC.questions_avg);
console.log("dead-end false-resolve (C):", JSON.stringify(falseResolve));
console.log("semantic used:", semUsed.length, "/", C.length, "| reasons:", JSON.stringify(semReasons));
console.log("semantic latency p50/p95 ms:", p50(lat), p95(lat));
