import { NextResponse } from "next/server";
import { loadCatalog } from "../../../lib/catalog";
import { search, parseQuery } from "../../../lib/search";

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
  const results = search(catalog, q, {
    relax,
    naive,
    category: body.category || null,
    occasion: body.occasion || null,
    budgetMax: numOrNull(body.budget),
    brand: body.brand || null,
    limit: Math.max(1, Math.min(96, Number(body.limit) || 12)),
  });
  return NextResponse.json({
    results: results.map((r) => ({
      sku: r.sku, title: r.title, category: r.category,
      price: r.price, rating: r.rating, num_ratings: r.num_ratings, tags: r.tags,
      brand: r.brand || "",
      score: Math.round((r.score || 0) * 100) / 100,
      intent: !!r.intent,
    })),
    parsed,
    catalogSize: catalog.length,
  });
}
