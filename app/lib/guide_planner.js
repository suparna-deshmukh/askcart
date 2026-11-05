// AI planner for follow-up question TYPE selection (Item D, 2026-11-05).
// The LLM picks ONE question type among the types the data policy has ALREADY
// validated as grounded (>=2 live options on the narrowed set). It can never
// invent a type, an option, or a constraint - decideGuide rejects any pick
// that is not in the grounded set and falls back to the deterministic order.
// Providers: Qwen (LiteLLM, thinking off) first, Gemini REST fallback,
// otherwise the deterministic policy order is used ("policy").
// 3 consecutive failures open a 5-minute breaker; a small in-memory cache
// (10-min TTL) keyed on query|slots|prev|types keeps repeat turns free.
import { chat, llmAvailable, env } from "./llm.js";

const G = globalThis;
const cache = (G.__askcartPlannerCache ??= new Map());
const breaker = (G.__askcartPlannerBreaker ??= { fails: 0, openUntil: 0 });

const PLAN_SYSTEM =
  "You pick ONE follow-up question type for AskCart, a guided shopping search in India. " +
  "Choose ONLY from the given candidate types - never invent another. " +
  "Pick the type whose answer most narrows the current result set for THIS shopper; " +
  "do not re-pick a type that was already asked. " +
  'Output ONLY JSON: {"type":"<candidate type>"}';

function extractType(raw, allowed) {
  const m = String(raw || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]);
    return allowed.includes(obj.type) ? String(obj.type) : null;
  } catch {
    return null;
  }
}

function record(key, type, via) {
  if (cache.size > 500) cache.clear();
  cache.set(key, { type, via, exp: Date.now() + 600000 });
  breaker.fails = 0;
}
function noteFail() {
  breaker.fails += 1;
  if (breaker.fails >= 3) {
    breaker.openUntil = Date.now() + 300000;
    breaker.fails = 0;
  }
}

// Returns { type, via: "llm" | "gemini" } or null (deterministic policy order).
export async function planQuestionType({ query, slots, prevTypes, types, setSummary }) {
  if (!types || types.length < 2) return null;
  const key = [query, JSON.stringify(slots || {}), (prevTypes || []).join(","), types.join("|")].join("\u0001");
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return { type: hit.type, via: hit.via };
  if (Date.now() < breaker.openUntil) return null;

  const userMsg =
    `Query: "${query}"\n` +
    `Answered so far: ${JSON.stringify(slots || {})}\n` +
    `Types already asked: ${JSON.stringify(prevTypes || [])}\n` +
    `Result set: ${setSummary}\n` +
    `Candidate types: ${JSON.stringify(types)}`;

  if (llmAvailable()) {
    try {
      const { text } = await chat(
        [{ role: "system", content: PLAN_SYSTEM }, { role: "user", content: userMsg }],
        { maxTokens: 60, temperature: 0, timeoutMs: 1500, thinking: false, attempts: 1 },
      );
      const type = extractType(text, types);
      if (type) { record(key, type, "llm"); return { type, via: "llm" }; }
      noteFail();
    } catch {
      noteFail();
    }
  }

  const gkey = env("GEMINI_API_KEY");
  const gmodel = env("GEMINI_MODEL") || "gemini-3.8-flash";
  if (gkey) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${gmodel}:generateContent`,
        {
          method: "POST",
          signal: ctrl.signal,
          headers: { "Content-Type": "application/json", "x-goog-api-key": gkey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: PLAN_SYSTEM }] },
            contents: [{ role: "user", parts: [{ text: userMsg }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 60 },
          }),
        },
      );
      clearTimeout(to);
      const j = await res.json();
      const text = j?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const type = extractType(text, types);
      if (type) { record(key, type, "gemini"); return { type, via: "gemini" }; }
      noteFail();
    } catch {
      noteFail();
    }
  }
  return null;
}
