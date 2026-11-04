import { NextResponse, NextRequest } from "next/server";
import { loadCatalog } from "../../../lib/catalog";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";

// G8: festival rails for the home page. During the Diwali gifting window
// (up to 14 days before the date, 3 days after) the hero shows 4 budget
// rails of best-rated Diwali-adjacent items instead of the static
// price-band grid. Pool = diwali-tagged SKUs + titles with Diwali-family
// keywords (diya, rangoli, mithai, dry fruits, ...). 372 SKUs qualify;
// per exclusive band: 32 / 63 / 103 / 111 items. No festival active ->
// no `rails` field, page falls back to the trending grid.
function festivalRails(catalog) {
  let cal;
  try {
    const f = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../lib/festivals_2026_27.json");
    cal = JSON.parse(fs.readFileSync(f, "utf8"));
  } catch { return null; }
  const now = new Date();
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diy = (cal.festivals || []).find((f) => f.name === "Diwali" && f.date);
  if (!diy) return null;
  const days = Math.round((new Date(diy.date + "T00:00:00").getTime() - t0) / 86400000);
  if (days < -3 || days > 14) return null;
  const KW = /diwali|deepawali|diya|rangoli|mithai|dry fruit|chand ka/i;
  const pool = catalog.filter((x) => (x.tags || []).includes("diwali") || KW.test(x.title));
  const bands = [
    { label: "under \u20b9500", min: 0, cap: 500 },
    { label: "\u20b9500 \u2013 \u20b91,000", min: 500, cap: 1000 },
    { label: "\u20b91,000 \u2013 \u20b92,000", min: 1000, cap: 2000 },
    { label: "\u20b92,000 \u2013 \u20b95,000", min: 2000, cap: 5000 },
  ];
  const out = bands.map((b) => ({
    label: b.label,
    items: pool.filter((x) => x.price > b.min && x.price <= b.cap)
      .sort((a, c) => (c.num_ratings || 0) - (a.num_ratings || 0))
      .slice(0, 8)
      .map((x) => ({ sku: x.sku, title: x.title, category: x.category,
                     brand: x.brand || "", price: x.price, rating: x.rating,
                     num_ratings: x.num_ratings })),
  }));
  if (out.every((b) => b.items.length < 4)) return null;
  return { festival: diy.name, date: diy.date, days, bands: out };
}

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
  const resp = { items, catalogSize: catalog.length };
  if (new URL(req.url).searchParams.get("festival")) {
    const rails = festivalRails(catalog);
    if (rails) resp.rails = rails;
  }
  return NextResponse.json(resp);
}
