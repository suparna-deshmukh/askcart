// AskCart LLM client - Gemini (OpenAI-compatible endpoint).
// Gemini-only routing (docs/llm_routing.md): the product surface (guided
// flow, phrasing, chatbot) routes through gemini_keys.js; this module is
// the shared client for eval tooling plus the zero-LLM helpers:
//   - env(): read a value from process.env or the repo-root .env
//   - chat(): OpenAI-compatible chat against the Gemini API
//   - ruleBasedGuide(): zero-LLM deterministic fallback used by the study
import fs from "fs";
import path from "path";

function envFile() {
  const cands = [path.resolve(process.cwd(), "..", ".env")];
  if (typeof __dirname !== "undefined") cands.push(path.join(__dirname, "..", "..", ".env"));
  for (const c of cands) {
    try { if (fs.existsSync(c)) return c; } catch {}
  }
  return cands[0];
}

export function env(name) {
  const v = process.env[name];
  if (v) return v.trim();
  try {
    for (const line of fs.readFileSync(envFile(), "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const [k, ...rest] = t.split("=");
      if (k === name && rest.join("=").trim()) return rest.join("=").trim();
    }
  } catch {}
  return null;
}

const BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
const KEY = env("GEMINI_API_KEY") || env("LIVE_LLM_API_KEY") ||
  (env("GEMINI_API_KEYS") || "").split(",").map((s) => s.trim()).filter(Boolean)[0] || null;
const MODEL = env("GEMINI_MODEL") || env("LIVE_LLM_MODEL") || "gemini-3-flash-preview";

export function llmAvailable() {
  return !!KEY;
}

export async function chat(messages, { maxTokens = 500, temperature = 0.2, timeoutMs = 45000, thinking = null, attempts = 4 } = {}) {
  if (!KEY) throw new Error("NO_KEY");
  let budget = maxTokens;
  let lastErr = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const payload = { model: MODEL, messages, temperature, max_tokens: budget };
      if (thinking === false) payload.reasoning_effort = "none";
      const r = await fetch(BASE + "/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        lastErr = new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 150)}`);
        if (r.status === 404 || r.status === 400) break;
        if (attempt + 1 < attempts) await new Promise((res) => setTimeout(res, 2500 * (attempt + 1)));
        continue;
      }
      const d = await r.json();
      const choice = d.choices[0];
      const content = choice?.message?.content;
      if (content === null || content === undefined) {
        // thinking model spent the whole token budget on reasoning
        if (choice?.finish_reason === "length" && attempt + 1 < attempts) {
          budget = Math.floor(budget * 2.5);
          continue;
        }
        throw new Error(`empty completion (finish=${choice?.finish_reason})`);
      }
      if (choice?.finish_reason === "length" && attempt + 1 < attempts) {
        // Output was truncated mid-way (a thinking model can spend most of
        // the budget on reasoning and leave a half-finished JSON). Retry
        // with a bigger budget instead of returning a broken string.
        budget = Math.floor(budget * 2.5);
        continue;
      }
      return { text: content, model: d.model || MODEL };
    } catch (e) {
      lastErr = e;
      if (attempt + 1 < attempts) await new Promise((res) => setTimeout(res, 2500 * (attempt + 1)));
    }
  }
  throw lastErr || new Error("LLM_FAILED");
}

export function ruleBasedGuide(parsed, catalogSize, asked = []) {
  // zero-LLM fallback: ask the first missing slot, budget -> occasion -> category
  const askedTypes = (asked || []).map((a) => String(a).split(":")[0]);
  if (parsed.budgetMax === null && !askedTypes.includes("budget")) {
    return { question: "Got it - a few things could fit. What budget should I stay under?",
             type: "budget", options: ["500", "2,000", "5,000", "10,000"] };
  }
  if (parsed.occasion === null && !askedTypes.includes("occasion")) {
    return { question: "Nice. Is this for an occasion or everyday use?",
             type: "occasion", options: ["gift", "birthday", "wedding/shaadi", "everyday use"] };
  }
  if (!askedTypes.includes("category")) {
    return { question: "What kind of item are you hoping for?",
             type: "category", options: ["electronics", "fashion", "home & decor", "beauty"] };
  }
  const wider = [2000, 5000, 10000, 20000].filter((v) => (parsed.budgetMax || 0) < v);
  if (wider.length) {
    return { question: "Almost there - want me to widen the budget a bit?",
             type: "budget", options: wider.slice(0, 3).map((v) => v.toLocaleString("en-IN")) };
  }
  return { question: "Should I drop one of your filters to find more?",
           type: "category", options: ["any category"] };
}

export const GUIDE_SYSTEM =
  "You are AskCart, a guided e-commerce shopping assistant. The user typed a shopping " +
  "query and the store search returned no (or very few) results. Ask exactly ONE short, " +
  "easy-to-answer follow-up question to recover the search. Priority order: (1) budget, " +
  "(2) occasion/use, (3) item category. Respond ONLY with JSON: " +
  '{"question": "...", "type": "budget"|"occasion"|"category", "options": ["...","...","..."]} ' +
  "with 3-5 short options. Keep the question under 15 words. Indian context (INR, shaadi, " +
  "diwali) is common - use it when relevant.";
