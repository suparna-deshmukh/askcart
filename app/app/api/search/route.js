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
    results: results.map((r) => {
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
      return o;
    }),
    parsed,
    catalogSize: catalog.length,
  });
}
