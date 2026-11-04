// Semantic fallback (multilingual embeddings) — invoked ONLY when the
// lexical search returns <2 on-intent results. Additive: any query that
// lexical already resolves returns a byte-identical response (the no-op
// guarantee, tested in app/lib/__tests__/semantic.test.js).
//
// Design: docs/semantic_fallback.md. Same model builds the index offline
// (scripts/build_embeddings.mjs) and embeds queries at runtime — no mixed
// embedding spaces. int8 vectors, brute-force cosine, ~15-40 ms per scan.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  BUDGET_RELAX, ADULT_RECIPIENTS, MALE_RECIPIENTS, FEMALE_RECIPIENTS,
  CHILD_RECIPIENTS, KID_WORDS, autoContextDelta, audienceDelta, accessoryDelta,
} from "./search.js";

const G = globalThis;
let _cfg = null;
export function cfg() {
  if (!_cfg) _cfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "lib", "semantic_config.json"), "utf8"));
  return _cfg;
}
function dataDir() { return path.join(process.cwd(), "data"); }

// ---- model (local ONNX; loaded lazily, warmed up outside the timeout) ----
let modelPromise = null;
function onnxModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      return pipeline("feature-extraction", cfg().model, { dtype: "q8" });
    })();
    modelPromise.catch(() => { modelPromise = null; });
  }
  return modelPromise;
}
export function warmupSemantic() { try { onnxModel(); } catch {} }

const breaker = { fails: 0, openUntil: 0 };
const lru = new Map();
const LRU_MAX = 500;
let qcache = null;
function loadQCache() {
  if (qcache === null) {
    try { qcache = JSON.parse(fs.readFileSync(path.join(dataDir(), "query_emb_cache.json"), "utf8")); }
    catch { qcache = {}; }
  }
  return qcache;
}
function b64ToBytes(b) { return new Uint8Array(Buffer.from(b, "base64")); }

function normText(t) { return String(t || "").toLowerCase().replace(/\s+/g, " ").trim(); }

function quantToFloat(entry) {
  // bytes were written from an Int8Array (two's complement)
  const bytes = b64ToBytes(entry.q);
  const q = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const v = bytes[i];
    q[i] = v >= 128 ? v - 256 : v;
  }
  for (let i = 0; i < q.length; i++) q[i] *= entry.scale;
  const n = Math.sqrt([...q].reduce((a, b) => a + b * b, 0)) || 1;
  for (let i = 0; i < q.length; i++) q[i] /= n;
  return q;
}

async function withTimeout(p, ms) {
  return await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

// Embed a query text. Returns a L2-normalised Float32Array, or null on any
// failure (timeout, breaker open, model missing) — the caller then skips
// semantic with a reason; the search path never throws.
export async function embedQuery(text) {
  const c = cfg();
  const key = normText(c.query_prefix + text);
  if (Date.now() < breaker.openUntil) return null;
  if (lru.has(key)) { const v = lru.get(key); lru.delete(key); lru.set(key, v); return v; }
  const cache = loadQCache();
  if (cache[key]) { const v = quantToFloat(cache[key]); lruSet(key, v); return v; }
  try {
    const model = await onnxModel();
    const out = await withTimeout(model(key, { pooling: "mean", normalize: true }), c.timeout_ms);
    const v = new Float32Array(out.data);
    lruSet(key, v);
    breaker.fails = 0;
    return v;
  } catch (e) {
    breaker.fails += 1;
    if (breaker.fails >= 3) { breaker.openUntil = Date.now() + 300000; breaker.fails = 0; }
    return null;
  }
}
function lruSet(key, v) {
  if (lru.size >= LRU_MAX) lru.delete(lru.keys().next().value);
  lru.set(key, v);
}

// ---- index ---------------------------------------------------------------
export function loadIndex(catalog) {
  if (G.__askcartSem) return G.__askcartSem;
  const d = dataDir();
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(d, "catalog_emb.meta.json"), "utf8"));
    const skuHash = crypto.createHash("sha256")
      .update(catalog.map((c) => String(c.sku)).join("\n")).digest("hex");
    if (meta.n !== catalog.length || meta.sku_order_sha256 !== skuHash) {
      return (G.__askcartSem = { ok: false, reason: "index_mismatch" });
    }
    const t0 = Date.now();
    const iBuf = fs.readFileSync(path.join(d, "catalog_emb.i8"));
    const sBuf = fs.readFileSync(path.join(d, "catalog_emb.scales.f32"));
    const Q = new Int8Array(iBuf.buffer.slice(iBuf.byteOffset, iBuf.byteOffset + iBuf.byteLength));
    const scales = new Float32Array(sBuf.buffer.slice(sBuf.byteOffset, sBuf.byteOffset + sBuf.byteLength));
    return (G.__askcartSem = { ok: true, meta, Q, scales, n: meta.n, dim: meta.dim, loadMs: Date.now() - t0 });
  } catch (e) {
    return (G.__askcartSem = { ok: false, reason: "index_missing" });
  }
}

// Brute-force cosine over int8 vectors (docs are L2-normalised; the scale
// converts the dot product back to cosine).
export function topK(q, idx, K, floor) {
  const c = cfg();
  const k = K || c.K;
  const fl = floor != null ? floor : c.floor;
  const { Q, scales, n, dim } = idx;
  const hits = [];
  for (let i = 0, o = 0; i < n; i++, o += dim) {
    let s = 0;
    for (let j = 0; j < dim; j++) s += q[j] * Q[o + j];
    s *= scales[i];
    if (s >= fl) hits.push([i, s]);
  }
  hits.sort((a, b) => b[1] - a[1]);
  return hits.slice(0, k);
}

// ---- semantic query text ---------------------------------------------------
const SEM_STOP = new Set([
  "under", "below", "less", "than", "within", "up", "to", "max", "budget", "of",
  "rs", "rupees", "inr", "kam", "se", "andar", "tak", "ke", "ki", "ka", "ko",
  "hai", "hain", "kya", "mujhe", "tumhe", "liye", "wala", "wali", "wale",
  "the", "a", "an", "and", "or", "for", "with", "in", "on", "at", "my", "me",
  "set", "sets", "pcs", "pc", "pack", "piece", "pieces", "no", "yes",
  "best", "good", "nice", "new", "old", "cheap", "cheaper", "costlier",
  "sasta", "sasti", "mehnga", "mehngi", "price", "cost", "value", "deal",
  "offer", "sale", "discount", "size", "ton", "kg", "litre", "liter", "gb",
  "ram", "va", "watt", "star", "stars", "inch", "inches", "year", "years",
  "old", "month", "months", "num", "number", "something", "anything", "kuch",
]);
export function buildSemanticText(parsed, rawQuery) {
  let s = String(rawQuery || "").toLowerCase().replace(/₹/g, " ");
  s = s.replace(/([a-z])(\d)/g, "$1 $2");
  const words = s.match(/[a-z0-9']+/g) || [];
  const keep = [];
  let prevRaw = "";
  for (const w of words) {
    if (SEM_STOP.has(w)) { prevRaw = w; continue; }
    if (/^\d+(\.\d+)?$/.test(w) && (prevRaw === "" || SEM_STOP.has(prevRaw))) { prevRaw = w; continue; }
    if (/^\d+(k|l|lakh|kg|ton|gb|ram|va|w|ml|g|in|l)$/i.test(w)) { prevRaw = w; continue; }
    if (w.length < 2) { prevRaw = w; continue; }
    keep.push(w);
    prevRaw = w;
  }
  return keep.length >= 1 ? keep.join(" ").slice(0, 200) : null;
}

// ---- constraints + thresholds ----------------------------------------------
const COLOR_SIZE = new Set(["red", "blue", "green", "black", "white", "maroon",
  "navy", "pink", "grey", "gray", "beige", "brown", "orange", "purple", "gold",
  "golden", "silver", "multicolor", "multi", "assorted", "cream", "ivory",
  "tan", "teal", "yellow", "xs", "s", "m", "l", "xl", "xxl", "size", "small",
  "medium", "large"]);
function titleStem(title) {
  const t = String(title || "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[\[\]{}]/g, " ");
  const ws = t.split(/\s+/).filter((w) => /[a-z0-9]/.test(w) && !COLOR_SIZE.has(w));
  return ws.slice(0, 5).join(" ") || "root";
}
const ACC_HINT_WORDS = ["case", "cover", "strap", "holder", "stand", "cable", "charger", "mount", "protector", "skin", "sticker", "brush", "pad", "mat", "cover", "frame", "ring", "grip"];

export function itemWordSet(item) {
  const ws = new Set(String(item.title || "").toLowerCase().match(/[a-z0-9']+/g) || []);
  const b = item.brand ? String(item.brand).toLowerCase() : "";
  if (b) ws.add(b);
  return ws;
}

// Hard constraints: budget (strict, then x1.6 relax), brand, recipient/gender/
// kids exclusions, car/auto context, accessory hints, per-stem diversity cap.
export function applyConstraints(hits, parsed, catalog, { budgetMax = null, brand = null, forWhom = null, relax = false } = {}) {
  const c = cfg();
  const tokenSet = new Set((parsed && parsed.tokens) || []);
  const rawWords = new Set(String((parsed && parsed.raw) || "").toLowerCase().match(/[a-z']+/g) || []);
  const brandKey = brand ? String(brand).toLowerCase() : null;
  const tryBudget = (cap) => {
    const out = [];
    for (const [i, cos] of hits) {
      const item = catalog[i];
      if (!item) continue;
      if (budgetMax != null && item.price > cap) continue;
      if (brandKey && !(item.brand && String(item.brand).toLowerCase() === brandKey)) continue;
      const ws = itemWordSet(item);
      if (audienceDelta(rawWords, ws, forWhom) < 0) continue;
      if (autoContextDelta(tokenSet, ws) < 0) continue;
      if (accessoryDelta(ACC_HINT_WORDS.filter((w) => !tokenSet.has(w)), ws) < 0) continue;
      out.push({ item, cos, relaxed: budgetMax != null && cap > budgetMax });
    }
    return out;
  };
  let picks = tryBudget(budgetMax != null ? budgetMax : Infinity);
  if (picks.length < 2 && relax && budgetMax != null) picks = tryBudget(budgetMax * BUDGET_RELAX);
  // diversity: max 2 per normalised title stem (variant families flood)
  const stems = new Map();
  const out = [];
  for (const p of picks) {
    const st = titleStem(p.item.title);
    const n = stems.get(st) || 0;
    if (n >= 2) continue;
    stems.set(st, n + 1);
    p.score = p.cos + 0.01 * (p.item.rating || 0); // tiny rating tiebreak
    out.push(p);
  }
  return out;
}

export function thresholdPicks(picks) {
  const c = cfg();
  const tau = c.tau != null ? c.tau : 0.0;
  const margin = c.margin != null ? c.margin : 0;
  if (!picks.length) return [];
  const top1 = picks[0].cos;
  const out = picks.filter((p) => p.cos >= tau && p.cos >= top1 - margin);
  return out;
}

// Merge: lexical on-intent first, semantic fill, then lexical leftovers.
// Semantic items carry intent: true (they pass tau + all hard constraints —
// the semantic-aware "on-intent" definition; see docs/semantic_fallback.md).
export function mergeResults(lexical, semItems, limit = 48, { only = false } = {}) {
  const seen = new Set();
  const out = [];
  const push = (it) => { if (!seen.has(it.sku)) { seen.add(it.sku); out.push(it); } };
  if (only) {
    for (const it of semItems) { push(it); if (out.length >= limit) break; }
    return out;
  }
  const lexIntent = lexical.filter((r) => r.intent);
  const lexRest = lexical.filter((r) => !r.intent);
  for (const r of lexIntent) { push(r); if (out.length >= limit) break; }
  for (const r of semItems) { push(r); if (out.length >= limit) break; }
  for (const r of lexRest) { push(r); if (out.length >= limit) break; }
  return out;
}

export function recomputeIntentN(merged) {
  return merged.filter((r) => r.intent).length;
}

export function semanticItem(catalogItem, cos, relaxed) {
  return { ...catalogItem, score: Math.round(cos * 1000) / 1000, intent: true,
           source: "semantic", relaxed: !!relaxed };
}
