import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { loadCatalog } from "../../../../lib/catalog";

// Validation evidence endpoint: reads the actual eval artifacts at request
// time so the Validation tab shows the same numbers the docs claim -
// nothing preset in the dashboard.

const RES = path.join(process.cwd(), "..", "eval", "results");

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(path.join(RES, file), "utf8")); } catch { return null; }
}

function countCanaries() {
  try {
    const src = fs.readFileSync(path.join(process.cwd(), "..", "eval", "canaries.py"), "utf8");
    const m = src.match(/CANARIES = \[([\s\S]*?)\n\]/);
    if (!m) return null;
    return (m[1].match(/^\s*\(/gm) || []).length;
  } catch { return null; }
}

export async function GET() {
  const study = readJSON("summary.txt");
  const llm = readJSON("summary_llm.txt");
  const sim = readJSON("sim_summary.json");
  const relevance = readJSON("relevance_summary.json");

  let catalog = null;
  try {
    const cat = loadCatalog();
    const prices = cat.map((x) => x.price).sort((a, b) => a - b);
    const pct = (p) => prices[Math.min(prices.length - 1, Math.floor(p * prices.length))];
    const mid = Math.floor(prices.length / 2);
    const branded = cat.filter((x) => x.brand).length;
    catalog = {
      total: cat.length,
      median: prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2,
      p25: pct(0.25), p75: pct(0.75), p90: pct(0.9),
      min: prices[0], max: prices[prices.length - 1],
      brandedShare: branded / cat.length,
    };
  } catch { /* catalogue not built */ }

  return NextResponse.json({
    generatedAt: Date.now(),
    study,
    llm,
    sim: sim ? {
      n: sim.n, errors: sim.errors,
      baseline_null_pct: sim.baseline_null_pct, guided_null_pct: sim.guided_null_pct,
      resolved_pct: sim.resolved_pct, strict_resolved_pct: sim.strict_resolved_pct,
      by_turn2_pct: sim.by_turn2_pct, by_turn: sim.by_turn, guide_modes: sim.guide_modes,
      ts: sim.ts,
    } : null,
    relevance: relevance ? {
      queries: relevance.queries, results_judged: relevance.results_judged,
      verdicts: relevance.verdicts,
      usable_pct: +((100 * ((relevance.verdicts.relevant || 0) + (relevance.verdicts.partial || 0))) / relevance.results_judged).toFixed(1),
      ts: relevance.ts,
    } : null,
    canaries: { count: countCanaries() },
    catalog,
    artifacts: {
      study: "eval/results/summary.txt + results.json",
      llm: "eval/results/summary_llm.txt + results_llm.json",
      sim: "eval/results/sim_summary.json + logs/sim_*.jsonl",
      relevance: "eval/results/relevance_summary.json",
      canaries: "eval/canaries.py",
      catalogue: "app/public/catalog.json",
      provenance: "docs/evidence/claim_provenance.md",
    },
  });
}
