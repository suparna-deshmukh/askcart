// Calibrate tau + margin on the DEV split ONLY (never on test).
//
//   cd app && node --import ../../eval/chat/register-shim.mjs \
//     ../../eval/semantic/calibrate.mjs
//
// 1. runs every dev query through the REAL /api/search route in-process
//    with EVAL_MODE=1&semantic=only (the semantic-only ablation)
// 2. Qwen-judges each query's top-3 (single judge; thinking off; batch 20)
// 3. sweeps tau x margin:
//      hit rate on positives (top-1 judged relevant/partial; >=2 items pass)
//      dead-end false-resolve (>=2 items pass)          target <= 10%
//      precision@3 among passed items                   target >= 80%
// 4. picks max hit rate subject to the two constraints; if none qualifies,
//    picks best precision and records the shortfall honestly
// 5. writes results/threshold.json and updates semantic_config.json
import fs from "node:fs";
import path from "node:path";

process.env.EVAL_MODE = "1";
const APP = process.cwd();
const REPO = path.join(APP, "..");
process.chdir(APP);

const panel = fs.readFileSync(path.join(REPO, "eval/semantic/panel.jsonl"), "utf8")
  .trim().split("\n").map((l) => JSON.parse(l));
const dev = panel.filter((p) => p.split === "dev");
console.log("dev queries:", dev.length);

const { POST } = await import("../../app/app/api/search/route.js");
const { judgeBatch } = await import("./judge.mjs");

// 1) run dev queries through the real route (semantic-only)
const rows = [];
for (const p of dev) {
  const resp = await POST(new Request("http://eval/api/search?semantic=only", {
    method: "POST", body: JSON.stringify({ query: p.query, limit: 48 }),
  }));
  const j = await resp.json();
  const sem = j.semantic || {};
  const top = (sem.top || []).slice(0, 3);
  rows.push({
    id: p.id, q: p.query, kind: p.kind,
    reason: sem.reason || null, ms: sem.ms,
    top, intentN: j.results.filter((r) => r.intent).length,
  });
  if (sem.reason) console.log("  ", p.id, p.kind, "reason:", sem.reason);
}
const withTop = rows.filter((r) => r.top.length >= 1);
console.log("semantic candidates for", withTop.length, "dev queries,",
  rows.length - withTop.length, "empty (reason)");

// 2) judge top-3 per query
const judged = await judgeBatch(withTop.map((r) => ({
  id: r.id, q: r.q, results: r.top.map((t) => ({ title: t.title, price: t.price })),
})));
for (const r of withTop) r.judge = judged[r.id];
fs.writeFileSync(path.join(REPO, "eval/semantic/results/dev_judged.json"),
  JSON.stringify(rows, null, 1));

// 3) sweep
const cfg = JSON.parse(fs.readFileSync(path.join(APP, "lib/semantic_config.json"), "utf8"));
const positives = withTop.filter((r) => r.kind !== "dead_end" && r.judge[0] <= 2);
const deads = withTop.filter((r) => r.kind === "dead_end");
console.log("positives:", positives.length, "| dead-ends:", deads.length);

const tauMin = cfg.floor, tauMax = 0.95, step = 0.005;
const margins = [0.03, 0.06, 0.10];
function passes(r, tau, margin) {
  const top1 = r.top[0].cos;
  return r.top.filter((t) => t.cos >= tau && t.cos >= top1 - margin);
}
const sweep = [];
for (let tau = tauMin; tau <= tauMax + 1e-9; tau += step) {
  const t = Math.round(tau * 1000) / 1000;
  for (const margin of margins) {
    let hit = 0, hitTot = 0;
    for (const r of positives) { hitTot++; if (passes(r, t, margin).length >= 2) hit++; }
    let fr = 0, frTot = 0;
    for (const r of deads) { frTot++; if (passes(r, t, margin).length >= 2) fr++; }
    let precNum = 0, precDen = 0;
    for (const r of withTop) {
      const ps = passes(r, t, margin).slice(0, 3);
      for (let i = 0; i < ps.length; i++) { precDen++; if (r.judge[i] <= 2) precNum++; }
    }
    sweep.push({
      tau: t, margin,
      hit_rate: hitTot ? hit / hitTot : null,
      hit: `${hit}/${hitTot}`,
      false_resolve: frTot ? fr / frTot : null,
      false_resolve_n: fr,
      precision3: precDen ? precNum / precDen : null,
      precision_n: precDen,
    });
  }
}
const okPairs = sweep.filter((r) => r.hit_rate != null &&
  r.false_resolve <= 0.10 && (r.precision3 == null || r.precision3 >= 0.80));
let chosen;
if (okPairs.length) {
  chosen = okPairs.sort((a, b) =>
    (b.hit_rate - a.hit_rate) || (a.false_resolve - b.false_resolve) ||
    ((b.precision3 || 0) - (a.precision3 || 0)))[0];
} else {
  chosen = [...sweep].sort((a, b) => ((b.precision3 || 0) - (a.precision3 || 0) ||
    (b.hit_rate || 0) - (a.hit_rate || 0)))[0];
  chosen.shortfall = "no pair met false-resolve<=10% AND precision3>=80%; best precision chosen";
}
console.log("\nchosen:", JSON.stringify(chosen));
console.log("top 8 sweep rows:");
for (const r of okPairs.slice(0, 8) || []) console.log("  ", JSON.stringify(r));

// 4) distributions (positives vs dead-ends, top-1 cosine)
const dist = {
  positives_top1: positives.map((r) => r.top[0].cos).sort((a, b) => a - b),
  deadends_top1: deads.map((r) => r.top[0].cos).sort((a, b) => a - b),
};
// 5) write artifacts + config
fs.writeFileSync(path.join(REPO, "eval/semantic/results/threshold.json"), JSON.stringify({
  chosen, sweep, distributions: dist,
  dev_queries: dev.length, positives: positives.length, dead_ends: deads.length,
  empty_semantic: rows.filter((r) => !r.top.length).map((r) => ({ id: r.id, q: r.q, reason: r.reason })),
  tau_range: [tauMin, tauMax], margins,
  calibrated_at: new Date().toISOString(),
}, null, 2));
cfg.tau = chosen.tau;
cfg.margin = chosen.margin;
fs.writeFileSync(path.join(APP, "lib/semantic_config.json"), JSON.stringify(cfg, null, 2) + "\n");
console.log("semantic_config.json updated: tau =", cfg.tau, "margin =", cfg.margin);
