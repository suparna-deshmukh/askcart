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
import { geminiGenerate } from "./gemini_keys.js";
import { optionMatch } from "./facets.js";

const G = globalThis;
const cache = (G.__askcartAiRefineCache ??= new Map());
const breaker = (G.__askcartAiRefineBreaker ??= { fails: 0, openUntil: 0 });

const OCCASIONS = ["gift", "birthday", "wedding", "anniversary", "diwali",
                   "party", "christmas", "valentines", "graduation", "housewarming"];
const FOR_WOM = ["men", "women", "kids"];
const QTYPES = ["brand", "category", "budget", "occasion", "for_whom", "size", "any"];
const TYPE_SLOT = { brand: "brand", category: "category", for_whom: "forWhom",
                    size: "size", occasion: "occasion", budget: "budget" };

const AI_SYSTEM_BASE =
  "You are the refinement engine for AskCart, a guided e-commerce search for India. " +
  "You receive a query, the constraints already answered, the answer the shopper JUST gave, " +
  "and a summary of the current result set. Output ONLY one JSON object, no prose. " +
  '"filters" - at most 2 keys, only for constraints the NEW answer explicitly implies: ' +
  '"brand" (exactly as listed in set brands), "category" (exactly as listed in set categories), ' +
  '"for_whom" (men|women|kids; family words map: ammi/amma/mummy/sister/didi/nani/dadi/daughter/aunt -> women, papa/dad/brother/sasur/beta/son/uncle -> men, child/beti/young cousin -> kids), "size" (exactly as listed in set sizes), ' +
  '"occasion" (gift|birthday|wedding|anniversary|diwali|party|christmas|valentines|graduation|housewarming), ' +
  '"budget_max" (integer INR, not above set maxPrice), "keyword" (1-3 short words, every word present in the set titles or tags). ' +
  'If the answer adds no new constraint, "filters" is {}.';
const AI_SYSTEM_Q =
  '\nOutput shape: {"filters":{...},"question":{...}|null}. ' +
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
// Item B: when the journey plan owns the question sequence, refine returns
// FILTERS ONLY (cheaper call, no duplicate question authority).
const AI_SYSTEM_NOQ =
  '\nOutput shape: {"filters":{...}} ONLY. The follow-up question sequence is ' +
  'owned by the journey plan - do NOT output a question field. Never invent a value that is not in the set.';
const systemPrompt = (questionMode) => AI_SYSTEM_BASE + (questionMode ? AI_SYSTEM_Q : AI_SYSTEM_NOQ);

function extractJson(raw) {
  const m = String(raw || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
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

// Returns { filters, question, via } or null (deterministic fallback).
export async function aiRefine({ query, queryExt, slots, answerLabel, answerType, prevTypes, set, question = true }) {
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
    (question
      ? `Unasked facets still available in this set: ${facetAvail.join(", ") || "none"}. ` +
        `Allowed question types now: ${QTYPES.filter((t) => !askedTypes.includes(t) && !(TYPE_SLOT[t] && answered[TYPE_SLOT[t]] != null)).join(", ") || "none"}. ` +
        `You may answer question:null ONLY if the allowed-types list is empty or n<=12.\n`
      : `Question planning: NOT needed - the journey plan owns the question sequence. Return filters only.\n`) +
    `Set: ${set.n} items | brands: ${fmtList(set.brands)} | categories: ${fmtList(set.categories)} | ` +
    `tags: ${fmtList(set.tags)} | sizes: ${(set.sizes || []).join(",")} | ` +
    `prices p25/p50/p75/max: ${set.p25}/${set.p50}/${set.p75}/${set.maxPrice}\n` +
    `Sample titles: ${(set.titles || []).slice(0, 8).join(" | ")}`;

  let raw = null;
  let via = null;
  let aiMeta = {};
  // Gemini 3-key chain (20 RPD per key) is the only LLM provider (Qwen
  // retired 2026-11-06 per user work order - docs/llm_routing.md).
  try {
    const g = await geminiGenerate({ system: systemPrompt(question), user: userMsg, maxTokens: question ? 512 : 160, timeoutMs: 2500 });
    if (g) {
      raw = g.text; via = "gemini";
      aiMeta = { keyIdx: g.keyIdx, rotatedFrom: g.rotatedFrom ?? null, model: g.model };
    }
  } catch { /* deterministic fallback below */ }
  const obj = raw ? extractJson(raw) : null;
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
  if (!question) out.question = null; // the journey plan owns the question
  if (Object.keys(out.filters).length === 0 && !out.question) {
    // grounded but empty is a legitimate "nothing to do" - not a failure
  }
  if (cache.size > 500) cache.clear();
  const val = { out: { ...out, via, ai: aiMeta }, exp: Date.now() + 24 * 60 * 60 * 1000 }; // 24 h (2026-11-08: minimizes repeat refine calls)
  cache.set(key, val);
  breaker.fails = 0;
  return val.out;
}
