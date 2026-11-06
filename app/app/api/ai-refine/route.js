import { NextResponse } from "next/server";
import { loadCatalog } from "../../../lib/catalog";
import { searchStats } from "../../../lib/search";
import { forWhomOptions, sizeOptions } from "../../../lib/guide.js";
import { aiRefine } from "../../../lib/guide_ai.js";

// Item 6 (2026-11-06): after each guided answer the client posts
// {query, query_ext, slots, answer:{label,opts}, answer_type, prev_types}.
// The route rebuilds the NARROWED set exactly the way the deterministic
// policy does (same slot -> search-opts mapping as guide.js, plus this
// answer's opts merged in), summarises it, and lets Gemini propose
// actionable filters and the next question. EVERY proposed value is
// validated against this live set (see guide_ai.js); nothing ungrounded
// can reach the client. Gemini down -> {ok:true, via:null} and the page
// behaves exactly as v6 (deterministic policy).
const SIZE_RE = /\b(xxxl|xxl|xl|l|m|s|xs)\b/gi;
const SIZE_SET = new Set(["XS", "S", "M", "L", "XL", "XXL", "XXXL"]);

function setFromStats(stats) {
  const items = (stats.items || []).map((i) => ({ title: i.title, price: i.price, tags: i.tags || [], brand: i.brand || null, category: i.category || null }));
  const brandAll = new Map();
  const catAll = new Map();
  const sizes = new Set();
  for (const it of items) {
    if (it.brand) brandAll.set(it.brand, (brandAll.get(it.brand) || 0) + 1);
    if (it.category) catAll.set(it.category, (catAll.get(it.category) || 0) + 1);
    for (const w of String(it.title).match(SIZE_RE) || []) {
      const u = w.toUpperCase();
      if (SIZE_SET.has(u)) sizes.add(u);
    }
  }
  // Tag facets come from searchStats' FULL-POOL counts (stats.items is
  // capped at the top-300 by score - rare-but-real tags like "wedding"
  // fell out of the item slice and their options were silently voided).
  const tagAll = new Map();
  for (const tg of stats.tagCounts || []) tagAll.set(tg.name, tg.count);
  const topN = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));
  const brands = topN(brandAll, 12);
  const cats = topN(catAll, 12);
  const tags = topN(tagAll, 16);
  const counts = new Map();
  for (const b of brands) counts.set(b.name, b.count);
  for (const c of cats) counts.set(c.name, c.count);
  for (const t of tags) counts.set(t.name, t.count);
  const vocab = new Set();
  for (const it of items) {
    for (const t of String(it.title).toLowerCase().split(/[^a-z0-9]+/)) if (t) vocab.add(t);
    for (const tg of it.tags || []) for (const t of String(tg).toLowerCase().split(/[^a-z0-9]+/)) if (t) vocab.add(t);
  }
  return {
    n: stats.n,
    brands: brands.map((b) => b.name),
    categories: cats.map((c) => c.name),
    tags: tags.map((t) => t.name),
    sizes: [...sizes],
    maxPrice: stats.priceMax || 0,
    p25: stats.priceP.p25, p50: stats.priceP.p50, p75: stats.priceP.p75,
    titles: items.slice(0, 8).map((i) => i.title),
    titleVocab: vocab,
    counts,
    items,
  };
}

// G1-style facet counts for the AI question's options, on the set the
// shopper will actually see next (post-filter when the AI also filters).
function optionCount(o, set) {
  const lc = String(o.label).toLowerCase();
  const items = set.items || [];
  if (o.kind === "brand" || o.kind === "category" || o.kind === "tag") {
    for (const [k, v] of set.counts) if (k.toLowerCase() === lc) return v;
    return 0;
  }
  if (o.kind === "size") {
    const so = sizeOptions(items, items.length).find((x) => x.label.toLowerCase() === lc || x.label.toLowerCase() === lc.replace(" any", ""));
    return so ? so.count : 0;
  }
  if (o.kind === "for_whom") {
    const fw = forWhomOptions(items, items.length).find((x) => x.label.toLowerCase().startsWith(lc));
    return fw ? fw.count : 0;
  }
  if (o.kind === "band") {
    const nums = (String(o.label).match(/[\d,]+/g) || []).map((x) => parseInt(x.replace(/,/g, ""), 10)).filter((n) => n > 0);
    if (!nums.length) return 0;
    if (nums.length === 1) return items.filter((i) => i.price <= nums[0]).length;
    return items.filter((i) => i.price > nums[0] && i.price <= nums[1]).length;
  }
  return 0;
}

export async function POST(req) {
  const t0 = Date.now();
  const body = await req.json().catch(() => ({}));
  const q = String(body.query || "");
  if (!q.trim()) return NextResponse.json({ ok: false, error: "empty query" });
  const answer = body.answer && typeof body.answer === "object" ? body.answer : {};
  const slots = { ...(body.slots || {}), ...((answer.opts && typeof answer.opts === "object") ? answer.opts : {}) };
  const queryExt = String(body.query_ext || "").trim();

  const statsOpts = {};
  if (slots.brand) statsOpts.brand = slots.brand;
  if (slots.budget != null) statsOpts.budgetMax = slots.budget;
  if (slots.occasion) statsOpts.occasion = slots.occasion;
  if (slots.category) statsOpts.category = slots.category;
  if (slots.forWhom) statsOpts.forWhom = slots.forWhom;
  if (slots.size) statsOpts.size = slots.size;
  if (slots.capacity) statsOpts.capacity = slots.capacity;

  const catalog = loadCatalog();
  const base = q + (queryExt ? " " + queryExt : "");
  const preSet = setFromStats(searchStats(catalog, base, statsOpts));
  const out = await aiRefine({
    query: q,
    queryExt,
    slots,
    answerLabel: String(answer.label || "").slice(0, 120),
    answerType: String(body.answer_type || "any").slice(0, 24),
    prevTypes: Array.isArray(body.prev_types) ? body.prev_types : [],
    set: preSet,
  });

  // When the AI also proposes filters, its question must be grounded on
  // the POST-filter set - recompute, count options there, and void a
  // question when the filtered set is already at a pickable size.
  let filters = (out && out.filters) || {};
  let question = (out && out.question) || null;
  let via = out ? out.via : null;
  if (question) {
    const post = { ...statsOpts };
    if (filters.brand) post.brand = filters.brand;
    if (filters.category) post.category = filters.category;
    if (filters.for_whom) post.forWhom = filters.for_whom;
    if (filters.size) post.size = filters.size;
    if (filters.occasion) post.occasion = filters.occasion;
    if (filters.budget_max != null) post.budgetMax = filters.budget_max;
    const base2 = base + (filters.keyword ? " " + filters.keyword : "");
    const postSet = setFromStats(searchStats(catalog, base2, post));
    question.options = question.options.map((o) => ({ ...o, count: optionCount(o, postSet) }));
    if (postSet.n <= 12) question = null;
  }

  return NextResponse.json({
    ok: true,
    via,
    filters,
    question: question ? { type: question.type, prompt: question.prompt, options: question.options } : null,
    set_n: preSet.n,
    ms: Date.now() - t0,
  });
}
