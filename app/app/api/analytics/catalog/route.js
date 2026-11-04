import { NextResponse } from "next/server";
import { loadCatalog } from "../../../../lib/catalog";

function median(sorted) {
  const n = sorted.length;
  if (!n) return null;
  const mid = Math.floor(n / 2);
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

const PRICE_BANDS = [
  { label: "under ₹2k", min: 0, max: 2000 },
  { label: "₹2k–5k", min: 2000, max: 5000 },
  { label: "₹5k–10k", min: 5000, max: 10000 },
  { label: "₹10k–20k", min: 10000, max: 20000 },
  { label: "over ₹20k", min: 20000, max: Infinity },
];

const RATING_BUCKETS = [
  { label: "4.5+", min: 4.5, max: 6 },
  { label: "4.0–4.5", min: 4.0, max: 4.5 },
  { label: "3.5–4.0", min: 3.5, max: 4.0 },
  { label: "3.0–3.5", min: 3.0, max: 3.5 },
  { label: "under 3.0", min: 0, max: 3.0 },
];

// Live snapshot of the catalogue across every dimension/filter we expose.
// Recomputed on every request, so any future catalogue change shows up here.
// Median is the headline price stat (mean is skewed by gold, ACs, diamonds).
export async function GET() {
  const catalog = loadCatalog();
  const n = catalog.length;
  const prices = catalog.map((x) => x.price).sort((a, b) => a - b);
  const ratings = catalog.map((x) => x.rating);
  const nr = catalog.map((x) => x.num_ratings).sort((a, b) => a - b);

  const byCat = new Map();
  const byBrand = new Map();
  const byTag = new Map();
  let branded = 0;
  let accessories = 0;
  const origins = { us_converted: 0, india_layer: 0 };
  for (const it of catalog) {
    origins[it.origin || "us_converted"]++;
    if (it.is_accessory) accessories++;
    const c = byCat.get(it.category) || { count: 0, priceSum: 0, priceMin: Infinity, priceMax: 0, prices: [] };
    c.count++; c.priceSum += it.price;
    if (it.price < c.priceMin) c.priceMin = it.price;
    if (it.price > c.priceMax) c.priceMax = it.price;
    c.prices.push(it.price);
    byCat.set(it.category, c);
    const b = String(it.brand || "").trim();
    if (b) {
      branded++;
      const bc = byBrand.get(b) || { count: 0, prices: [] };
      bc.count++; bc.prices.push(it.price);
      byBrand.set(b, bc);
    }
    for (const tg of it.tags || []) {
      byTag.set(tg, (byTag.get(tg) || 0) + 1);
    }
  }

  const categories = [...byCat.entries()]
    .map(([name, c]) => ({
      name, count: c.count, share: c.count / n,
      avgPrice: Math.round(c.priceSum / c.count),
      medianPrice: Math.round(median(c.prices.sort((a, b) => a - b))),
      priceMin: c.priceMin, priceMax: c.priceMax,
    }))
    .sort((a, b) => b.count - a.count);

  const brands = [...byBrand.entries()]
    // C2: retailers (Myntra private label) are not brands - excluded from
    // the top-brand stats (they stay in the catalogue as brand tokens).
    .filter(([name]) => name.toLowerCase() !== "myntra")
    .map(([name, c]) => ({
      name, count: c.count, share: c.count / n,
      medianPrice: Math.round(median(c.prices.sort((a, b) => a - b))),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  const priceBands = PRICE_BANDS.map((b) => {
    const count = prices.filter((p) => p >= b.min && p < b.max).length;
    return { label: b.label, count, share: count / n };
  });

  const ratingBuckets = RATING_BUCKETS.map((b) => {
    const count = ratings.filter((r) => r >= b.min && r < b.max).length;
    return { label: b.label, count, share: count / n };
  });

  const tags = [...byTag.entries()]
    .map(([name, count]) => ({ name, count, share: count / n }))
    .sort((a, b) => b.count - a.count);

  const tagged = catalog.filter((x) => (x.tags || []).length > 0).length;
  const rated = catalog.filter((x) => x.num_ratings >= 100).length;

  return NextResponse.json({
    generatedAt: Date.now(),
    total: n,
    price: {
      min: prices[0], max: prices[n - 1],
      median: median(prices), avg: Math.round(prices.reduce((a, b) => a + b, 0) / n),
      p25: pct(prices, 0.25), p75: pct(prices, 0.75), p90: pct(prices, 0.9),
    },
    ratings: {
      min: Math.min(...ratings), max: Math.max(...ratings),
      avg: (ratings.reduce((a, b) => a + b, 0) / n).toFixed(2),
    },
    ratingsStats: {
      median: median(nr),
      with100plus: rated,
      with100plusShare: rated / n,
    },
    brands: { count: byBrand.size, branded, brandedShare: branded / n, top: brands },
    occasionTagged: { count: tagged, share: tagged / n },
    origins,
    accessories: { count: accessories, share: accessories / n },
    categories,
    priceBands,
    ratingBuckets,
    tags,
  });
}
