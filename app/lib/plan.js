// Item B (2026-11-06): the ONE-call journey planner.
//
// A single Gemini call at journey start plans the WHOLE follow-up ladder:
// up to 7 question types, in ask-order, each with a <=12-word phrasing.
// The plan is cached 24 hours keyed on query|parsed-slots|persona, so a
// chip-only journey costs exactly ONE LLM call; later turns read the
// cached plan (zero calls). decideGuide validates every plan entry
// against the live grounded set - the model can only ORDER and PHRASE,
// never choose options, counts, or a type the data doesn't support.
// Model down / breaker open / all keys exhausted -> null -> the
// deterministic per-category policy order carries the journey (v6
// behaviour). Disagreements with the policy order are logged to
// app/.plan_disagreements.jsonl (free training/QA set).
import fs from "node:fs";
import path from "node:path";
import { geminiGenerate, geminiStatus } from "./gemini_keys.js";

const G = globalThis;
const cache = (G.__askcartPlanCache ??= new Map());
const breaker = (G.__askcartPlanBreaker ??= { fails: 0, openUntil: 0 });
const PLAN_TTL = 24 * 60 * 60 * 1000; // 24 h (2026-11-08: a chip journey re-visited the same day costs zero extra planner calls)
const MAX_PLAN = 7;

const TYPE_HINT = {
  budget: "price range",
  occasion: "event / gift context",
  brand: "brand preference",
  for_whom: "who it is for",
  size: "size",
  capacity: "appliance capacity (ton / kg / litre)",
  category: "product family",
  any: "open refinement",
};

let _kb = null;
function loadKb() {
  if (_kb !== null) return _kb;
  _kb = [];
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "query_kb.json"), "utf8"));
    _kb = Array.isArray(raw.entries) ? raw.entries : [];
  } catch { _kb = []; }
  return _kb;
}

// Few-shot from the mined query KB (scripts/build_query_kb.py): real
// query shapes with their already-stated facets, matched by shared
// content tokens. Keeps the prompt small (<=3 examples, ~40 words).
function kbExamples(query, max = 3) {
  const kb = loadKb();
  if (!kb.length) return [];
  const toks = String(query).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
  const scored = [];
  for (const e of kb) {
    const q = String(e.q || "").toLowerCase();
    let hit = 0;
    for (const t of toks) if (q.includes(t)) hit += 1;
    if (hit >= 1) scored.push([hit, e]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  return scored.slice(0, max).map(([, e]) =>
    `"${e.q}" -> already stated: ${(e.facets || []).join(", ") || "none"}`);
}

function validQuestion(q) {
  const s = String(q || "").trim();
  if (!s || s.length > 120) return null;
  if (/\d|₹|https?:|www\./.test(s)) return null; // no prices/URLs in a question
  if (s.split(/\s+/).length > 12) return null;
  return s;
}

export function planCacheKey(query, parsed, persona) {
  const p = parsed || {};
  const slots = {
    b: p.budgetMax ?? null,
    o: p.occasion ?? null,
    br: p.brand ?? null,
    s: p.specs ? Object.keys(p.specs).sort().join(".") : null,
  };
  const per = persona ? [persona.ageBand || "", persona.userType || "", persona.context || ""].join("|") : "";
  return [String(query).trim().toLowerCase(), JSON.stringify(slots), per].join("\u0001");
}

// Returns { plan: [{type, question}], via, keyIdx, rotatedFrom, model,
// cached } or null. Never throws into the search path.
export async function getLadderPlan({ query, parsed, persona, types, setSummary }) {
  if (!types || types.length < 2) return null;
  const key = planCacheKey(query, parsed, persona);
  const hit = cache.get(key);
  if (hit) {
    if (hit.exp > Date.now() && hit.val && hit.val.plan) return { ...hit.val, cached: true };
    cache.delete(key);
  }
  if (Date.now() < breaker.openUntil) return null;
  if (geminiStatus().allExhausted) return null;

  const answeredBits = [];
  if (parsed && parsed.budgetMax != null) answeredBits.push("budget " + parsed.budgetMax);
  if (parsed && parsed.occasion) answeredBits.push("occasion " + parsed.occasion);
  if (parsed && parsed.brand) answeredBits.push("brand " + parsed.brand);
  if (parsed && parsed.specs && Object.keys(parsed.specs).length) answeredBits.push("specs " + JSON.stringify(parsed.specs));

  const ex = kbExamples(query);
  const userMsg =
    `Query: "${query}"\n` +
    (persona ? `Persona: age ${persona.ageBand || "?"}, type ${persona.userType || "?"}, context ${persona.context || "?"}\n` : "") +
    `Already stated by the query: ${answeredBits.join("; ") || "nothing"}\n` +
    `Result set: ${setSummary}\n` +
    `Candidate question types (use ONLY these): ${types.map((t) => `${t}=${TYPE_HINT[t] || t}`).join("; ")}\n` +
    (ex.length ? `Known patterns from real traffic: ${ex.join(" | ")}\n` : "") +
    `Plan the follow-up ladder for this journey. Ask what halves the set most first; ` +
    `never plan a type the query already answers; never repeat a type. ` +
    `Output ONLY JSON: {"plan":[{"type":"<candidate>","question":"warm one-line question, max 12 words, no emoji, no prices"}, ...]}`;

  const PLAN_SYSTEM =
    "You plan the follow-up question sequence for AskCart, a guided e-commerce " +
    "search for India (INR). You choose the ORDER of question types and their " +
    "wording only - options, counts and filtering are computed by the server " +
    "from live data and are not your concern. At most " + MAX_PLAN + " entries.";

  let raw = null;
  let meta = null;
  try {
    const g = await geminiGenerate({ system: PLAN_SYSTEM, user: userMsg, maxTokens: 420, timeoutMs: 3000 });
    if (g) { raw = g.text; meta = { via: "gemini", keyIdx: g.keyIdx, rotatedFrom: g.rotatedFrom ?? null, model: g.model }; }
  } catch { /* fall through to null */ }

  if (!raw) {
    breaker.fails += 1;
    if (breaker.fails >= 3) { breaker.openUntil = Date.now() + 300000; breaker.fails = 0; }
    return null;
  }
  let obj = null;
  try {
    const m = String(raw).match(/\{[\s\S]*\}/);
    obj = m ? JSON.parse(m[0]) : null;
  } catch { obj = null; }
  if (!obj || !Array.isArray(obj.plan)) {
    if (String(raw).slice(0, 80)) console.warn("[plan] unparseable model output:", String(raw).slice(0, 200));
    breaker.fails += 1;
    if (breaker.fails >= 3) { breaker.openUntil = Date.now() + 300000; breaker.fails = 0; }
    return null;
  }
  const seen = new Set();
  const plan = [];
  for (const e of obj.plan.slice(0, MAX_PLAN)) {
    const type = e && types.includes(e.type) ? String(e.type) : null;
    if (!type || seen.has(type)) continue;
    seen.add(type);
    plan.push({ type, question: validQuestion(e.question) });
  }
  if (!plan.length) {
    breaker.fails += 1;
    if (breaker.fails >= 3) { breaker.openUntil = Date.now() + 300000; breaker.fails = 0; }
    return null;
  }
  breaker.fails = 0;
  if (cache.size > 200) cache.clear();
  const val = { plan, ...meta };
  cache.set(key, { exp: Date.now() + PLAN_TTL, val });
  return val;
}

// Log where the AI plan disagrees with the deterministic policy order
// (the free training/QA set the brief asks for).
export function logPlanDisagreement({ query, policyFirst, planFirst, types, via, cached }) {
  if (!planFirst || planFirst === policyFirst) return;
  try {
    fs.appendFileSync(path.join(process.cwd(), ".plan_disagreements.jsonl"), JSON.stringify({
      at: new Date().toISOString(), query: String(query).slice(0, 120),
      policy_first: policyFirst, plan_first: planFirst,
      types, via: via || null, cached: !!cached,
    }) + "\n");
  } catch { /* logging must never break the guide */ }
}
