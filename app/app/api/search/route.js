import { NextResponse } from "next/server";
import { loadCatalog } from "../../../lib/catalog";
import { search, parseQuery } from "../../../lib/search";
import {
  loadIndex, embedQuery, topK, buildSemanticText, applyConstraints,
  thresholdPicks, mergeResults, semanticItem, warmupSemantic,
} from "../../../lib/semantic";

// Warm the ONNX embedding model in the background so the first
// semantic-eligible query does not pay the model-load cost.
warmupSemantic();

// Normalize client-supplied numeric filters: null/undefined/NaN/<=0 all mean "no filter".
// (Guard against the classic Number(null) === 0 trap.)
function numOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const q = String(body.query || "");
  if (!q.trim()) return NextResponse.json({ results: [], error: "empty query" });
  const catalog = loadCatalog();
  const relax = !!body.relax;
  const naive = !!body.naive;
  const parsed = parseQuery(q);
  const forWhom = ["women", "men", "kids", "unisex"].includes(body.forWhom) ? body.forWhom : null;
  const limit = Math.max(1, Math.min(96, Number(body.limit) || 12));
  const results = search(catalog, q, {
    relax,
    naive,
    category: body.category || null,
    occasion: body.occasion || null,
    budgetMax: numOrNull(body.budget),
    brand: body.brand || null,
    // G3: guided facet answers (for-whom / size / capacity chips)
    forWhom,
    size: ["xxl", "xl", "l", "m", "s", "xs"].includes(String(body.size || "").toLowerCase()) ? String(body.size).toLowerCase() : null,
    capacity: body.capacity && /^[\d.]+\s*(ton|kg|l)$/i.test(String(body.capacity)) ? String(body.capacity) : null,
    limit,
  });
  // ---- semantic fallback (additive) -------------------------------------
  // Runs ONLY when lexical search returns <2 on-intent results (the existing
  // null condition), so resolved queries return byte-identical responses.
  // SEMANTIC_FALLBACK=0 restores v6 exactly. EVAL_MODE=1 honours
  // ?semantic=0|1|only for the eval harness (ignored in production).
  const budget = numOrNull(body.budget) != null ? numOrNull(body.budget) : parsed.budgetMax;
  const sem = { used: false };
  let out = results;
  const override = process.env.EVAL_MODE === "1"
    ? new URL(req.url).searchParams.get("semantic") : null;
  const lexIntentN = results.filter((r) => r.intent).length;
  const browseOnly = parsed.tokens.length === 0 && budget != null;
  const runSemantic = override
    ? (override === "1" || override === "only")
    : (process.env.SEMANTIC_FALLBACK !== "0" && lexIntentN < 2 && !browseOnly && !naive);
  if (runSemantic) {
    const t0 = Date.now();
    try {
      const idx = loadIndex(catalog);
      if (!idx.ok) sem.reason = idx.reason;
      else {
        if (idx.loadMs != null) sem.index_load_ms = idx.loadMs;
        const text = buildSemanticText(parsed, q);
        const qv = text ? await embedQuery(text) : null;
        if (!qv) sem.reason = text ? "embed_unavailable" : "no_semantic_text";
        else {
          const constrained = applyConstraints(topK(qv, idx), parsed, catalog, {
            budgetMax: budget, brand: body.brand || null, forWhom, relax: true,
          });
          const picks = thresholdPicks(constrained);
          if (process.env.EVAL_MODE === "1") {
            // eval-only: pre-threshold top cosines for tau calibration
            sem.top = constrained.slice(0, 3).map((p) => ({
              sku: p.item.sku, title: p.item.title, price: p.item.price,
              cos: Math.round(p.cos * 1000) / 1000,
            }));
          }
          if (!picks.length) sem.reason = "below_threshold";
          else {
            const semItems = picks.map((p) => semanticItem(p.item, p.cos, p.relaxed));
            out = mergeResults(results, semItems, limit, { only: override === "only" });
            sem.used = true;
            sem.added = out.filter((r) => r.source === "semantic").length;
            sem.top_cos = Math.round(picks[0].cos * 1000) / 1000;
          }
          if (override === "only" && !sem.used) out = []; // pure ablation: no lexical fallback
        }
      }
    } catch (e) {
      sem.reason = "error:" + String(e.message || e).slice(0, 60);
    }
    sem.ms = Date.now() - t0;
  }
  return NextResponse.json({
    results: out.map((r) => {
      const o = {
        sku: r.sku, title: r.title, category: r.category,
        price: r.price, rating: r.rating, num_ratings: r.num_ratings, tags: r.tags,
        brand: r.brand || "",
        score: Math.round((r.score || 0) * 100) / 100,
        intent: !!r.intent,
      };
      // S7: variant-family fields (present only for India listing-matrix rows)
      if (r.family_id) o.family_id = r.family_id;
      if (r.variant) o.variant = r.variant;
      if (r.variant_summary) o.variant_summary = r.variant_summary;
      if (r.family_min_price != null) o.family_min_price = r.family_min_price;
      // C2/C3: brand_type (retailers) + accessory flag (filter facet)
      if (r.brand_type) o.brand_type = r.brand_type;
      if (r.is_accessory) o.is_accessory = true;
      // semantic fallback: relaxed-budget items are labelled like lexical
      if (r.source === "semantic" && r.relaxed) o.relaxed = true;
      return o;
    }),
    parsed,
    catalogSize: catalog.length,
    semantic: sem,
  });
}
