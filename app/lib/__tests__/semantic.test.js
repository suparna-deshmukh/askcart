// Semantic fallback unit tests (plain node; no test runner in this repo).
//
//   cd app && node --import ../../eval/chat/register-shim.mjs \
//     lib/__tests__/semantic.test.js
//
// Gates: index integrity, float/int8 parity (>=9/10 overlap), constraint
// behaviour, and the CRITICAL no-op guarantee: every canary + study panel
// query that lexical resolves (intentN >= 2) returns a byte-identical
// response with SEMANTIC_FALLBACK=1 vs =0 (ignoring only the new
// `semantic` field).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const APP = process.cwd();
process.chdir(APP);
const REPO = path.join(APP, "..");

let fails = 0;
const ok = (cond, name, extra = "") => {
  console.log((cond ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : ""));
  if (!cond) fails++;
};

const {
  loadIndex, topK, buildSemanticText, applyConstraints, thresholdPicks,
  mergeResults, semanticItem,
} = await import("../semantic.js");
const { parseQuery } = await import("../search.js");
const catalog = JSON.parse(fs.readFileSync(path.join(APP, "public", "catalog.json"), "utf8"));

// ---- pure functions (run even without the index) --------------------------
{
  const text = buildSemanticText(parseQuery("under 500"), "under 500");
  ok(text === null, "buildSemanticText: pure budget query -> null (browse mode)");
  const t2 = buildSemanticText(parseQuery("saree for ammi under 2k"), "saree for ammi under 2k");
  ok(t2 === "saree ammi", "buildSemanticText: keeps product + recipient, strips budget/stopwords", t2);
  const t3 = buildSemanticText(parseQuery("iphone15"), "iphone15");
  ok(t3 === "iphone 15", "buildSemanticText: splits glued alphanumerics", t3);
  const t4 = buildSemanticText(parseQuery("samovar"), "samovar");
  ok(t4 === "samovar", "buildSemanticText: dead-end word kept", t4);

  const fake = [
    { sku: "A", title: "Red Cotton Kurti (M)", brand: "Fabindia", price: 999, rating: 4.0, tags: ["wedding"] },
    { sku: "B", title: "Red Cotton Kurti (L)", brand: "Fabindia", price: 1099, rating: 4.1, tags: ["wedding"] },
    { sku: "C", title: "Red Cotton Kurti (XL)", brand: "Fabindia", price: 1199, rating: 4.2, tags: ["wedding"] },
    { sku: "D", title: "Blue Silk Saree", brand: "Myntra", price: 1999, rating: 4.3, tags: ["gift"] },
    { sku: "E", title: "Kids Red Cotton Kurti", brand: "Fabindia", price: 599, rating: 3.9, tags: [] },
  ];
  const hits = fake.map((_, i) => [i, 0.9 - i * 0.01]);
  const parsed = parseQuery("kurti under 1200 for papa");
  const picks = applyConstraints(hits, parsed, fake, { budgetMax: 1200, relax: true, forWhom: "men" });
  ok(picks.every((p) => p.item.price <= 1200 * 1.6), "applyConstraints: budget strict+relax respected");
  ok(!picks.some((p) => p.item.sku === "D"), "applyConstraints: over-budget strict item excluded until relax");
  const stemCount = {};
  for (const p of applyConstraints(hits, parseQuery("kurti"), fake, {})) stemCount[p.item.title.slice(0, 10)] = (stemCount[p.item.title.slice(0, 10)] || 0) + 1;
  ok(Object.values(stemCount).every((n) => n <= 2), "applyConstraints: diversity cap <=2 per title stem");
  const gender = applyConstraints(hits, parseQuery("kurti for papa"), fake, { forWhom: "men" });
  ok(!gender.some((p) => p.item.sku === "E"), "applyConstraints: adult-recipient drops kids' titles");
  const cfgT = JSON.parse(fs.readFileSync(path.join(APP, "lib", "semantic_config.json"), "utf8"));
  const tau0 = cfgT.tau != null ? cfgT.tau : 0.0;
  const margin0 = cfgT.margin != null ? cfgT.margin : 0;
  const base = Math.max(tau0 + 0.02, 0.72);
  const thr = thresholdPicks([{ cos: base }, { cos: base - margin0 - 0.05 }, { cos: 0.4 }]);
  ok(thr.length === 1 && thr[0].cos === base, "thresholdPicks: keeps top1, drops far-below-margin",
    "thr=" + thr.map((t) => t.cos).join(","));
  const merged = mergeResults(
    [{ sku: "L1", intent: false }, { sku: "L2", intent: true }],
    [semanticItem(fake[3], 0.85, false)],
    48, { only: false });
  ok(merged[0].sku === "L2" && merged[1].sku === "D" && merged[2].sku === "L1",
    "mergeResults: lexical intent first, semantic fill, lexical leftovers last", merged.map((m) => m.sku).join(","));
  const only = mergeResults([{ sku: "L1", intent: true }], [semanticItem(fake[3], 0.85, false)], 48, { only: true });
  ok(only.length === 1 && only[0].sku === "D", "mergeResults: only= ignores lexical (ablation)");
}

// ---- index + parity (requires app/data built) --------------------------------
let idx = null;
try { idx = loadIndex(catalog); } catch (e) { console.log("index load error:", e.message); }
if (idx && idx.ok) {
  ok(idx.n === catalog.length && idx.dim === idx.meta.dim, "loadIndex: n/dim match meta", `n=${idx.n} dim=${idx.dim}`);
  const meta = idx.meta;
  const shuffled = [...catalog.slice(1), catalog[0]];
  const { topK: _t, ...rest } = idx; // (loadIndex caches; verify mismatch on a fresh global)
  globalThis.__askcartSem = null;
  const bad = loadIndex(shuffled);
  ok(bad.ok === false && bad.reason === "index_mismatch", "loadIndex: shuffled catalogue -> index_mismatch");
  globalThis.__askcartSem = null;
  idx = loadIndex(catalog);
  ok(idx.ok === true, "loadIndex: restores after mismatch check");

  const pf = path.join(APP, "lib", "__tests__", "fixtures", "parity.json");
  if (fs.existsSync(pf)) {
    const par = JSON.parse(fs.readFileSync(pf, "utf8"));
    ok(par.avg_overlap >= 9, "parity: float-vs-int8 top-10 overlap >= 9/10", "avg " + par.avg_overlap);
  } else {
    console.log("SKIP parity fixture (run scripts/build_embeddings.mjs first)");
  }
} else {
  console.log("SKIP index tests (index not built: " + (idx ? idx.reason : "load error") + ")");
}

// ---- no-op guarantee (CRITICAL): route-level, SEMANTIC_FALLBACK 1 vs 0 -------
{
  const { POST } = await import("../../app/api/search/route.js");
  async function run(q, env) {
    const prev = process.env.SEMANTIC_FALLBACK;
    process.env.SEMANTIC_FALLBACK = env;
    try {
      const resp = await POST(new Request("http://eval/api/search", {
        method: "POST",
        body: JSON.stringify({ query: q, limit: 48 }),
      }));
      return await resp.json();
    } finally { process.env.SEMANTIC_FALLBACK = prev; }
  }
  const strip = (j) => { const { semantic, ...rest } = j; return rest; };
  const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  const queries = [];
  try {
    const out = execFileSync(process.execPath === "" ? "python3" : path.join(REPO, ".venv", "bin", "python"), [
      "-c",
      "import json, sys; sys.path.insert(0, 'eval'); import canaries; " +
      "qs = [q for q, _ in canaries.CANARIES] + [q for _, q, _, _ in canaries.G3_CHECKS]; " +
      "print(json.dumps(qs))",
    ], { cwd: REPO }).toString();
    queries.push(...JSON.parse(out));
  } catch (e) { console.log("canary extraction failed:", e.message.slice(0, 100)); }
  const study = JSON.parse(fs.readFileSync(path.join(REPO, "eval", "results", "queries_final.json"), "utf8"));
  for (const s of study) queries.push(s.query);
  const evalv2 = fs.readFileSync(path.join(REPO, "eval", "evalv2", "panel.jsonl"), "utf8").trim().split("\n")
    .filter(Boolean).map((l) => JSON.parse(l).query);
  queries.push(...evalv2);
  const uniq = [...new Set(queries.map((q) => String(q).trim()).filter(Boolean))];
  console.log("\nno-op guarantee over", uniq.length, "queries (canaries + 150 study + eval v2 panel)");

  let checked = 0, mismatches = 0, nulls = 0;
  for (const q of uniq) {
    const a = await run(q, "0");
    const b = await run(q, "1");
    const n = a.results.filter((r) => r.intent).length;
    if (n < 2) { nulls++; continue; } // semantic may (correctly) change these
    checked++;
    if (!deepEq(strip(a), strip(b))) {
      mismatches++;
      console.log("  MISMATCH:", JSON.stringify(q));
      if (mismatches <= 3) {
        console.log("   off:", JSON.stringify(strip(b)).slice(0, 200));
      }
    }
  }
  ok(mismatches === 0, "no-op guarantee: intentN>=2 responses identical (SEMANTIC_FALLBACK 1 vs 0)",
    `${checked} resolved queries, ${mismatches} mismatches, ${nulls} null queries skipped`);
}

console.log(fails ? `\n${fails} FAILURES` : "\nALL TESTS PASS");
process.exit(fails ? 1 : 0);
