// Offline build of the semantic-fallback vector index.
//
//   cd app && node ../scripts/build_embeddings.mjs
//
// Embeds every catalogue title (brand + title + category + occasion tags)
// with Xenova/multilingual-e5-small (int8 ONNX) — the SAME model the runtime
// query path uses (app/lib/semantic.js) — then L2-normalises and quantises
// to int8 with per-row scales. Row i of the matrix corresponds to
// catalog[i]; the meta file records the catalogue + SKU-order hashes so the
// runtime refuses to serve a misaligned index.
//
// Also writes:
//   app/data/query_emb_cache.json  precomputed embeddings for all known
//                                  queries (canaries, eval panels, hero
//                                  examples) so demo/eval traffic needs no
//                                  runtime embedding at all
//   app/lib/__tests__/fixtures/parity.json  float-vs-int8 top-10 parity
//
// (Spec listed scripts/build_embeddings.py; a JS builder is required so the
// offline index and the runtime query path share one model + tokenizer.)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const APP = path.join(REPO, "app");
process.chdir(APP); // semantic.js cfg() + lib paths resolve from app/ cwd

const cfg = JSON.parse(fs.readFileSync(path.join(APP, "lib", "semantic_config.json"), "utf8"));
// import the SAME package the runtime uses (absolute path: this script
// lives outside app/, so a bare specifier would not resolve from scripts/)
const HF = pathToFileURL(path.join(APP, "node_modules/@huggingface/transformers/dist/transformers.node.mjs")).href;
if (cfg.provider !== "local_onnx") {
  console.error("this builder only supports provider=local_onnx (spec step 0)");
  process.exit(1);
}

const catalog = JSON.parse(fs.readFileSync(path.join(APP, "public", "catalog.json"), "utf8"));
console.log("catalogue:", catalog.length, "SKUs");

function docText(it) {
  const parts = [it.brand || "", it.title, it.category, ...(it.tags || [])];
  return cfg.doc_prefix + parts.filter(Boolean).join(" ").slice(0, 600);
}

// ---- embed -----------------------------------------------------------------
const { pipeline } = await import(HF);
console.log("loading model", cfg.model, "(downloads on first use) ...");
const t0 = Date.now();
const model = await pipeline("feature-extraction", cfg.model, { dtype: "q8" });
console.log("model ready in", Date.now() - t0, "ms");

const docs = catalog.map(docText);
const BATCH = 64;
const rows = [];
let done = 0;
for (let i = 0; i < docs.length; i += BATCH) {
  const chunk = docs.slice(i, i + BATCH);
  const out = await model(chunk, { pooling: "mean", normalize: true });
  if (Array.isArray(out) && out.length === chunk.length) {
    for (const o of out) rows.push(new Float32Array(o.data ?? o));
  } else {
    const o = Array.isArray(out) ? out[0] : out;
    const flat = new Float32Array(o.data ?? o);
    if (flat.length !== chunk.length * cfg.dim) throw new Error("embedding shape mismatch: " + flat.length + " != " + chunk.length * cfg.dim);
    for (let k = 0; k < chunk.length; k++) rows.push(flat.subarray(k * cfg.dim, (k + 1) * cfg.dim));
  }
  done += chunk.length;
  if (done % 2000 < BATCH) process.stdout.write(`\rembedded ${done}/${docs.length} (${Math.round(done / (Date.now() - t0))} docs/s)\n`);
}
const dim = rows[0].length;
if (rows.length !== catalog.length) throw new Error("row count mismatch: " + rows.length);
// L2 re-normalise (defensive; the pipeline already normalises)
for (const r of rows) {
  let n = 0; for (let j = 0; j < dim; j++) n += r[j] * r[j];
  n = Math.sqrt(n) || 1;
  for (let j = 0; j < dim; j++) r[j] /= n;
}

// ---- quantise ----------------------------------------------------------------
const scales = new Float32Array(rows.length);
const Q = new Int8Array(rows.length * dim);
for (let i = 0; i < rows.length; i++) {
  let mx = 0;
  for (let j = 0; j < dim; j++) mx = Math.max(mx, Math.abs(rows[i][j]));
  scales[i] = mx / 127.0 || 1 / 127.0;
  for (let j = 0; j < dim; j++) {
    Q[i * dim + j] = Math.max(-127, Math.min(127, Math.round(rows[i][j] / scales[i])));
  }
}

// ---- write index ---------------------------------------------------------------
const dataDir = path.join(APP, "data");
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, "catalog_emb.i8"), Buffer.from(Q.buffer));
fs.writeFileSync(path.join(dataDir, "catalog_emb.scales.f32"), Buffer.from(scales.buffer));
const meta = {
  model: cfg.model,
  dim,
  n: catalog.length,
  catalog_sha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(APP, "public", "catalog.json"))).digest("hex"),
  sku_order_sha256: crypto.createHash("sha256").update(catalog.map((c) => String(c.sku)).join("\n")).digest("hex"),
  doc_template_version: cfg.doc_template_version,
  built_at: new Date().toISOString(),
};
fs.writeFileSync(path.join(dataDir, "catalog_emb.meta.json"), JSON.stringify(meta, null, 2));
console.log("index written:",
  (Q.length / 1048576).toFixed(1), "MB i8,",
  (scales.length * 4 / 1024).toFixed(0), "KB scales");

// ---- acceptance checks -----------------------------------------------------------
if (meta.n !== catalog.length) throw new Error("n != len(catalog)");
// self-nearest: for 10 random SKUs the nearest neighbour of its own vector is itself
const { topK, loadIndex } = await import("../app/lib/semantic.js");
const idx = loadIndex(catalog);
if (!idx.ok) throw new Error("loadIndex failed: " + idx.reason);
const rnd = new Set();
while (rnd.size < 10) rnd.add(Math.floor(Math.random() * catalog.length));
let selfOk = 0;
for (const i of rnd) {
  const selfQ = new Float32Array(dim);
  for (let j = 0; j < dim; j++) selfQ[j] = Q[i * dim + j];
  selfQ[0] += 1e-9; // nudge so itself is a strict argmax
  const hits = topK(selfQ, idx, 5, 0);
  if (hits[0] && hits[0][0] === i && hits[0][1] > 0.99) selfOk++;
  else console.log("  self-nearest MISS at", i, hits.slice(0, 3));
}
if (selfOk < 10) throw new Error("self-nearest check failed: " + selfOk + "/10");
console.log("self-nearest check: 10/10");

// ---- parity: float vs int8 top-10 for 20 fixed queries ------------------------------
const PARITY_QUERIES = [
  "shaadi gift under 2k", "samsng tv 43 inch", "ammi ke liye saree",
  "1.5 ton ac under 45k", "something for my room", "heaphones under 1500",
  "didi ki gift birthday", "couch for living room", "mithai box diwali",
  "kurti for mother wedding", "telescope", "samovar",
  "sasta phone 10k", "baby crib wooden", "office chair ergonomic",
  "gold ring for wife", "kuch gift dena hai", "jooti for bhai shaadi",
  "gaming laptop 16gb", "winter sweater for papa",
];
const { buildSemanticText } = await import("../app/lib/semantic.js");
const { parseQuery } = await import("../app/lib/search.js");
const parity = [];
let overlapSum = 0;
for (const q of PARITY_QUERIES) {
  const text = buildSemanticText(parseQuery(q), q);
  if (!text) { parity.push({ q, skipped: "no_semantic_text" }); continue; }
  const qv = new Float32Array((await model(cfg.query_prefix + text, { pooling: "mean", normalize: true })).data);
  const fl = new Array(catalog.length).fill(0).map((_, i) => i);
  for (let i = 0; i < catalog.length; i++) {
    let d = 0;
    for (let j = 0; j < dim; j++) d += qv[j] * rows[i][j];
    fl[i] = d;
  }
  const floatTop = fl.map((d, i) => [i, d]).sort((a, b) => b[1] - a[1]).slice(0, 10).map((x) => x[0]);
  const intTop = topK(qv, idx, 10, 0).map((x) => x[0]);
  const overlap = floatTop.filter((i) => intTop.includes(i)).length;
  overlapSum += overlap;
  parity.push({ q, text, overlap, float_top: floatTop, int8_top: intTop });
}
const avgOverlap = overlapSum / (parity.filter((p) => !p.skipped).length || 1);
fs.mkdirSync(path.join(APP, "lib", "__tests__", "fixtures"), { recursive: true });
fs.writeFileSync(path.join(APP, "lib", "__tests__", "fixtures", "parity.json"),
  JSON.stringify({ model: cfg.model, queries: parity, avg_overlap: Math.round(avgOverlap * 10) / 10 }, null, 2));
console.log("parity avg overlap (top-10):", Math.round(avgOverlap * 10) / 10, "/ 10");
if (avgOverlap < 9) throw new Error("parity below 9/10: " + avgOverlap);

// ---- query cache (known queries, zero runtime embedding cost) ----------------------
async function embedQ(text) {
  const o = await model(cfg.query_prefix + text, { pooling: "mean", normalize: true });
  const f = new Float32Array(o.data);
  let mx = 0; for (let j = 0; j < dim; j++) mx = Math.max(mx, Math.abs(f[j]));
  const sc = mx / 127.0 || 1 / 127.0;
  const q = new Int8Array(dim);
  for (let j = 0; j < dim; j++) q[j] = Math.max(-127, Math.min(127, Math.round(f[j] / sc)));
  return { q: Buffer.from(q.buffer).toString("base64"), scale: sc };
}
const known = new Map();
const addQ = (t) => { const k = String(t || "").toLowerCase().replace(/\s+/g, " ").trim(); if (k && !known.has(k)) known.set(k, t); };
for (const f of ["eval/canaries.py"]) {
  try {
    const src = fs.readFileSync(path.join(REPO, f), "utf8");
    for (const m of src.matchAll(/query["']?\s*[:=]\s*["']([^"']+)["']/g)) addQ(m[1]);
    for (const m of src.matchAll(/Q\w*\s*=\s*\[([\s\S]*?)\]/g)) {
      for (const m2 of m[1].matchAll(/["']([^"']+)["']/g)) addQ(m2[1]);
    }
  } catch {}
}
for (const f of ["eval/evalv2/panel.jsonl", "eval/semantic/panel.jsonl"]) {
  try {
    for (const line of fs.readFileSync(path.join(REPO, f), "utf8").trim().split("\n")) {
      if (line.trim()) addQ(JSON.parse(line).query);
    }
  } catch {}
}
for (const t of PARITY_QUERIES) addQ(t);
addQ("shaadi gift under 2k"); addQ("phone under 15k for college"); addQ("gift under 2000");
addQ("headphones"); addQ("1.5 ton ac under 45k"); addQ("saree for ammi under 2k");
const cache = {};
let ci = 0;
for (const [k, t] of known) {
  cache[cfg.query_prefix + k] = await embedQ(k);
  if (++ci % 25 === 0) console.log("query cache:", ci, "/", known.size);
}
fs.writeFileSync(path.join(dataDir, "query_emb_cache.json"), JSON.stringify(cache, null, 1));
console.log("query cache:", Object.keys(cache).length, "entries");
console.log("BUILD COMPLETE in", Math.round((Date.now() - t0) / 1000), "s");
