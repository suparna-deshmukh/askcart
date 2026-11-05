// Cache-only refresh of app/data/query_emb_cache.json.
//
// Embeds the sample-query catalog (app/lib/sample_queries.js) plus the
// canary/eval-panel queries if any are missing, with the SAME model as the
// vector index (Xenova/multilingual-e5-small int8 ONNX, see
// scripts/build_embeddings.mjs), and merges into the existing cache.
// Does NOT touch the index files (catalog_emb.*).
//
// Usage: cd app && node ../scripts/refresh_query_cache.mjs
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { SAMPLE_QUERIES } from "../app/lib/sample_queries.js";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const APP = path.join(REPO, "app");
process.chdir(APP);
const cfg = JSON.parse(fs.readFileSync(path.join(APP, "lib", "semantic_config.json"), "utf8"));
const HF = pathToFileURL(path.join(APP, "node_modules/@huggingface/transformers/dist/transformers.node.mjs")).href;
const { pipeline } = await import(HF);
console.log("loading model", cfg.model, "...");
const model = await pipeline("feature-extraction", cfg.model, { dtype: "q8" });
const dim = cfg.dim;

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
for (const t of SAMPLE_QUERIES) addQ(t);
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

const cachePath = path.join(APP, "data", "query_emb_cache.json");
const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
let added = 0;
for (const [k, t] of known) {
  const key = cfg.query_prefix + k;
  if (!cache[key]) { cache[key] = await embedQ(k); added++; if (added % 10 === 0) console.log("added", added); }
}
fs.writeFileSync(cachePath, JSON.stringify(cache, null, 1));
console.log("query cache:", Object.keys(cache).length, "entries (", added, "added )");
