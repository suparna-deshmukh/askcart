// Gemini "ai-refine" (Item 6, 2026-11-06): after each guided answer the
// shopper gives, Gemini looks at (query, answered slots, the new answer,
// a summary of the narrowed result set) and returns ACTIONABLE OUTPUT:
//   filters  - facets to apply to the re-search (brand / category /
//              for_whom / size / occasion / budget_max / keyword)
//   question - the next question (type + prompt + 3-4 grounded options)
// Every value is validated server-side against the LIVE narrowed set, so
// the model can never invent a brand, category, size, occasion, price or
// keyword. Gemini down / timeout / ungrounded -> the caller falls back to
// the deterministic policy (identical behaviour to v6).
//
// Providers: Gemini REST. Model chain: GEMINI_MODEL (env) first, then
// gemini-3-flash-preview, gemini-3.5-flash - with a sticky "known-good"
// model remembered per process and 5-minute cooldowns on failing models
// (the 3.x line flaps between 200/404/503 under this key). 3 s timeout
// per model, at most 2 attempts per call, 3 consecutive total failures
// open a 5-minute breaker. 10-minute in-memory cache keyed on the
// conversation state (repeat answers are free).
import { chat, env, llmAvailable } from "./llm.js";

const G = globalThis;
const cache = (G.__askcartAiRefineCache ??= new Map());
const breaker = (G.__askcartAiRefineBreaker ??= { fails: 0, openUntil: 0 });
const sticky = (G.__askcartAiSticky ??= { model: null });
const cooling = (G.__askcartAiCooling ??= new Map()); // model -> until(ms)

const OCCASIONS = ["gift", "birthday", "wedding", "anniversary", "diwali",
                   "party", "christmas", "valentines", "graduation", "housewarming"];
const FOR_WOM = ["men", "women", "kids"];
const QTYPES = ["brand", "category", "budget", "occasion", "for_whom", "size", "any"];
const TYPE_SLOT = { brand: "brand", category: "category", for_whom: "forWhom",
                    size: "size", occasion: "occasion", budget: "budget" };

const AI_SYSTEM =
  "You are the refinement engine for AskCart, a guided e-commerce search for India. " +
  "You receive a query, the constraints already answered, the answer the shopper JUST gave, " +
  "and a summary of the current result set. Output ONLY one JSON object, no prose:\n" +
  '{"filters":{...},"question":{...}|null}\n' +
  '"filters" - at most 2 keys, only for constraints the NEW answer explicitly implies: ' +
  '"brand" (exactly as listed in set brands), "category" (exactly as listed in set categories), ' +
  '"for_whom" (men|women|kids; family words map: ammi/amma/mummy/sister/didi/nani/dadi/daughter/aunt -> women, papa/dad/brother/sasur/beta/son/uncle -> men, child/beti/young cousin -> kids), "size" (exactly as listed in set sizes), ' +
  '"occasion" (gift|birthday|wedding|anniversary|diwali|party|christmas|valentines|graduation|housewarming), ' +
  '"budget_max" (integer INR, not above set maxPrice), "keyword" (1-3 short words, every word present in the set titles or tags). ' +
  'If the answer adds no new constraint, "filters" is {}.\n' +
  '"question" - almost always required: the single most useful NEXT question to cut the set roughly in half ' +
  '(choose the unasked facet whose options split the set most), or null ONLY when n<=12 or no unasked facet ' +
  'has at least 2 options in the set: ' +
  '{"type": brand|category|budget|occasion|for_whom|size|any, "prompt": one warm line, max 10 words, ' +
  '"options": 3-4 of {"label":"...","kind":"brand|category|tag|size|band|for_whom"}}. ' +
  'Option labels must be real values of the set for their kind (case-insensitive); ' +
  'kind "band" labels look like "Under N000" (N000 a round number not above set maxPrice); ' +
  'kind "for_whom" labels are Men / Women / Kids. ' +
  "Never re-ask a facet already in 'Answered so far' or in 'Asked types'. " +
  "Never invent a value that is not in the set.";

function extractJson(raw) {
  const m = String(raw || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function inList(v, list) {
  const x = String(v).toLowerCase().trim();
  const hit = list.find((e) => String(e).toLowerCase() === x);
  return hit === undefined ? null : hit;
}
// Looser match for QUESTION OPTIONS only: the model may say "Wedding /
// Shaadi" or "boAt Airdopes" when the set has "wedding" / "boAt" - map to
// the canonical set value instead of dropping the option. Filters stay
// strict (inList) so nothing ungrounded is ever APPLIED.
function optionMatch(v, list) {
  const x = String(v).toLowerCase().trim();
  const exact = inList(v, list);
  if (exact) return exact;
  const partial = (list || []).find((e) => {
    const e2 = String(e).toLowerCase().trim();
    if (!e2 || e2.length < 3) return false;
    return x.includes(e2) || e2.includes(x);
  });
  return partial || null;
}

// Strict grounding: drop every value the set does not contain.
function validateAi(obj, set, answered, askedTypes) {
  const out = { filters: {}, question: null };
  const f = obj.filters && typeof obj.filters === "object" ? obj.filters : {};
  const brand = inList(f.brand, set.brands);
  const category = inList(f.category, set.categories);
  const fw = FOR_WOM.includes(String(f.for_whom).toLowerCase()) ? String(f.for_whom).toLowerCase() : null;
  const size = inList(f.size, set.sizes);
  const occ = OCCASIONS.includes(String(f.occasion).toLowerCase()) ? String(f.occasion).toLowerCase() : null;
  const budget = Number.isInteger(f.budget_max) && f.budget_max >= 100 && set.maxPrice > 0 && f.budget_max <= set.maxPrice ? f.budget_max : null;
  let keyword = null;
  if (typeof f.keyword === "string") {
    const toks = f.keyword.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    if (toks.length >= 1 && toks.length <= 3 && toks.every((t) => set.titleVocab.has(t))) keyword = toks.join(" ");
  }
  const cand = { brand, category, for_whom: fw, size, occasion: occ, budget_max: budget, keyword };
  for (const [k, v] of Object.entries(cand)) {
    if (v == null) continue;
    const answeredKey = { brand: "brand", category: "category", for_whom: "forWhom",
                          size: "size", occasion: "occasion", budget_max: "budget" }[k];
    if (answeredKey && (answered[answeredKey] !== null && answered[answeredKey] !== undefined)) continue; // redundant
    out.filters[k] = v;
  }
  const KEYS = ["brand", "category", "for_whom", "size", "occasion", "budget_max", "keyword"];
  const kept = KEYS.filter((k) => out.filters[k] != null);
  if (kept.length > 2) for (const k of kept.slice(2)) delete out.filters[k];

  const q = obj.question && typeof obj.question === "object" ? obj.question : null;
  if (q && set.n > 12) {
    const type = QTYPES.includes(q.type) ? q.type : null;
    const slotKey = type ? TYPE_SLOT[type] : null;
    const alreadyAnswered = slotKey && answered[slotKey] != null;
    if (type && !alreadyAnswered && !askedTypes.includes(type)) {
      const seen = new Set();
      const opts = (Array.isArray(q.options) ? q.options : []).slice(0, 4).map((o) => {
        if (!o || typeof o !== "object") return null;
        let label = String(o.label || "").trim();
        const kind = String(o.kind || "").toLowerCase();
        let ok = false;
        if (kind === "brand") { const m = optionMatch(label, set.brands); if (m) { label = m; ok = true; } }
        else if (kind === "category") { const m = optionMatch(label, set.categories); if (m) { label = m; ok = true; } }
        else if (kind === "tag") { const m = optionMatch(label, set.tags); if (m) { label = m; ok = true; } }
        else if (kind === "size") { if (inList(label, set.sizes)) ok = true; }
        else if (kind === "for_whom" && ["men", "women", "kids", "unisex"].includes(label.toLowerCase())) ok = true;
        else if (kind === "band") {
          const nums = (label.match(/[\d,]+/g) || []).map((x) => parseInt(x.replace(/,/g, ""), 10)).filter((n) => n > 0);
          ok = nums.length > 0 && nums.every((n) => n <= set.maxPrice);
        }
        if (!ok || seen.has(label.toLowerCase())) return null;
        seen.add(label.toLowerCase());
        return { label, kind };
      }).filter(Boolean);
      if (opts.length >= 2) {
        const prompt = String(q.prompt || "").trim().slice(0, 80) ||
          "Which of these fits best? (or type your own)";
        out.question = { type, prompt, options: opts };
      }
    }
  }
  return out;
}

async function callGemini(model, system, userMsg) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": env("GEMINI_API_KEY") },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: userMsg }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 512 },
        }),
      },
    );
    clearTimeout(to);
    if (!res.ok) {
      cooling.set(model, Date.now() + 300000); // 404/503: cool down, try next
      return null;
    }
    const j = await res.json();
    return j?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch {
    clearTimeout(to);
    cooling.set(model, Date.now() + 60000); // timeout/5xx: short cooldown
    return null;
  }
}

const isCooling = (m) => (cooling.get(m) || 0) > Date.now();
function modelChain() {
  const list = [];
  if (sticky.model && !isCooling(sticky.model)) list.push(sticky.model);
  for (const m of [env("GEMINI_MODEL"), "gemini-3-flash-preview", "gemini-3.5-flash"]) {
    if (m && !list.includes(m) && !isCooling(m)) list.push(m);
  }
  return list.slice(0, 2); // at most 2 attempts: total latency bounded
}

// Returns { filters, question, via } or null (deterministic fallback).
export async function aiRefine({ query, queryExt, slots, answerLabel, answerType, prevTypes, set }) {
  const answered = slots || {};
  const askedTypes = (prevTypes || []).map(String);
  const key = [query, queryExt || "", JSON.stringify(answered), answerLabel, answerType, askedTypes.join(",")].join("\u0001");
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.out;
  if (Date.now() < breaker.openUntil) return null;

  const fmtList = (xs) => (xs || []).slice(0, 8).map((x) => x + " (" + (set.counts && set.counts.get(x) || "") + ")").filter((s) => !s.endsWith("()")).join(", ");
  const facetAvail = [];
  if ((set.brands || []).length >= 2) facetAvail.push("brand");
  if ((set.categories || []).length >= 2) facetAvail.push("category");
  if ((set.sizes || []).length >= 2) facetAvail.push("size");
  if ((set.tags || []).length >= 2) facetAvail.push("tags/occasion");
  if (set.maxPrice > 0) facetAvail.push("budget bands");
  const userMsg =
    `Query: "${query}${queryExt ? " " + queryExt : ""}"\n` +
    `Answered so far: ${JSON.stringify(answered)}\n` +
    `Asked types: ${JSON.stringify(askedTypes)}\n` +
    `Just answered: "${answerLabel}" (to a ${answerType} question)\n` +
    (/[a-z]/.test(answerLabel) && /\b(mother|father|sister|brother|ammi|amma|mummy|papa|dad|dadi|nani|bhai|didi|cousin|friend|wife|husband|kids?|daughter|son)\b/i.test(answerLabel)
      ? "The answer names a person - you MUST set filters.for_whom (men|women|kids).\n" : "") +
    `Unasked facets still available in this set: ${facetAvail.join(", ") || "none"}. ` +
    `Allowed question types now: ${QTYPES.filter((t) => !askedTypes.includes(t) && !(TYPE_SLOT[t] && answered[TYPE_SLOT[t]] != null)).join(", ") || "none"}. ` +
    `You may answer question:null ONLY if the allowed-types list is empty or n<=12.\n` +
    `Set: ${set.n} items | brands: ${fmtList(set.brands)} | categories: ${fmtList(set.categories)} | ` +
    `tags: ${fmtList(set.tags)} | sizes: ${(set.sizes || []).join(",")} | ` +
    `prices p25/p50/p75/max: ${set.p25}/${set.p50}/${set.p75}/${set.maxPrice}\n` +
    `Sample titles: ${(set.titles || []).slice(0, 8).join(" | ")}`;

  let raw = null;
  let via = null;
  for (const model of modelChain()) {
    raw = await callGemini(model, AI_SYSTEM, userMsg);
    if (raw) { sticky.model = model; via = "gemini"; break; }
  }
  let obj = raw ? extractJson(raw) : null;
  if (!obj && llmAvailable()) {
    // Qwen (LiteLLM proxy) second provider - used when Gemini is down OR
    // returned truncated/unparseable JSON (3.x thinking can eat the budget).
    // Same prompt, same schema, same validation - the page cannot tell
    // which model answered.
    try {
      const { text } = await chat(
        [{ role: "system", content: AI_SYSTEM }, { role: "user", content: userMsg }],
        { maxTokens: 500, temperature: 0, timeoutMs: 3000, thinking: false, attempts: 2 },
      );
      const o2 = text ? extractJson(text) : null;
      if (o2) { raw = text; via = "qwen"; obj = o2; }
    } catch { /* keep gemini state; unparseable branch below */ }
  }
  try {
    // Debug trace (localhost): raw model output + validation result.
    const fs = await import("node:fs");
    fs.appendFileSync("/tmp/ai_refine_debug.log", JSON.stringify({
      at: Date.now(), via, query, answer: answerLabel,
      raw: raw ? String(raw).slice(0, 500) : null,
      parsed: !!obj,
      question: obj && obj.question ? obj.question.type : null,
      setN: set.n, brands: set.brands.slice(0, 5), asked: prevTypes,
    }) + "\n");
  } catch {}
  if (!obj) {
    if (raw) console.warn("[ai-refine] model returned unparseable JSON:", String(raw).slice(0, 300));
    breaker.fails += 1;
    if (breaker.fails >= 3) { breaker.openUntil = Date.now() + 300000; breaker.fails = 0; }
    return null;
  }
  const out = validateAi(obj, set, answered, askedTypes);
  if (Object.keys(out.filters).length === 0 && !out.question) {
    // grounded but empty is a legitimate "nothing to do" - not a failure
  }
  if (cache.size > 500) cache.clear();
  const val = { out: { ...out, via }, exp: Date.now() + 600000 };
  cache.set(key, val);
  breaker.fails = 0;
  return val.out;
}
