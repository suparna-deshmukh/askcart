import { NextResponse } from "next/server";
import { loadCatalog } from "../../../lib/catalog";

// Deterministic home-page preview: the best-rated ("trending") items per
// price band, so the store feels alive before the first search.
// Tags are internal search keys only - they never leave the backend to the UI.
export async function GET() {
  const catalog = loadCatalog();
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
