import { NextResponse, NextRequest } from "next/server";
import { loadCatalog } from "../../../lib/catalog";

// Deterministic home-page preview: the best-rated ("trending") items per
// price band, so the store feels alive before the first search.
// Tags are internal search keys only - they never leave the backend to the UI.
export async function GET(req) {
  const catalog = loadCatalog();
  // 7.1: linkable PDP (?sku=...) - single-item lookup, public fields only.
  const sku = new URL(req.url).searchParams.get("sku");
  if (sku) {
    const it = catalog.find((x) => x.sku === sku);
    if (!it) return NextResponse.json({ error: "not found" }, { status: 404 });
    // S7: sibling variants of the same listing-matrix family (variant selector)
    let family = null;
    if (it.family_id) {
      family = catalog.filter((x) => x.family_id === it.family_id && x.sku !== it.sku)
        .slice(0, 24)
        .map((x) => ({ sku: x.sku, title: x.title, variant: x.variant || null,
                       price: x.price, rating: x.rating, num_ratings: x.num_ratings }));
    }
    const resp = { item: { sku: it.sku, title: it.title, category: it.category,
      brand: it.brand || "", price: it.price, rating: it.rating,
      num_ratings: it.num_ratings, rating_basis: it.rating_basis || "source" },
      catalogSize: catalog.length };
    if (family) resp.family = family;
    return NextResponse.json(resp);
  }
  const bands = [
    { cap: 2000, min: 0 }, { cap: 5000, min: 2000 }, { cap: 10000, min: 5000 },
    { cap: 20000, min: 10000 }, { cap: Infinity, min: 20000 },
  ];
  const picks = [];
  for (const b of bands) {
    const inBand = catalog.filter((x) => x.price > b.min && x.price <= b.cap);
    inBand.sort((a, c) => (c.num_ratings || 0) - (a.num_ratings || 0));
    for (const x of inBand.slice(0, 3)) picks.push(x);
  }
  const seen = new Set();
  const items = picks.filter((x) => !seen.has(x.sku) && seen.add(x.sku)).slice(0, 12)
    .map((x) => ({ sku: x.sku, title: x.title, category: x.category,
                    brand: x.brand || "",
                    price: x.price, rating: x.rating, num_ratings: x.num_ratings }));
  return NextResponse.json({ items, catalogSize: catalog.length });
}
