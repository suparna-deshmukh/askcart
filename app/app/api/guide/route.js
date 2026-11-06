import { NextResponse } from "next/server";
import { loadCatalog } from "../../../lib/catalog";
import { parseQuery } from "../../../lib/search";
import { decideGuide } from "../../../lib/guide.js";
import { geminiChat, geminiStatus } from "../../../lib/gemini_keys.js";
import { record } from "../../../lib/analyticsStore";
import { t, budgetLabel, occasionLabel } from "../../../app/lib/i18n.js";

// The policy engine decides WHAT to ask (type + data-driven options + reason);
// Qwen only phrases the question naturally. Fallback mode uses the policy's
// template verbatim (deterministic study runs). See docs/followup_algorithm.md.
const PHRASE_SYSTEM =
  "You phrase a single, warm, one-line follow-up question for AskCart, a guided " +
  "e-commerce search assistant for India (prices in INR). The question TYPE and " +
  "OPTIONS are already decided by policy - keep them exactly as given, same order. " +
  "Match the user's language/register if evident (English or light Hinglish). " +
  'Output JSON only: {"question": string, "options": [strings]}';

export async function POST(req) {
  const t0g = Date.now();
  const body = await req.json().catch(() => ({}));
  const q = String(body.query || "");
  if (!q.trim()) return NextResponse.json({ guide: null, mode: "policy", error: "empty query" });
  const parsed = parseQuery(q);
  const nResults = Number(body.n_results || 0);
  const turn = Number(body.turn || 1);
  const prevTypes = body.prev_types || (body.asked || []).map((a) => String(a).split(":")[0]);
  const forceMode = body.mode || null;
  // O2: region/persona/lang are additive context (client carries them).
  const lang = ["en", "hi", "hinglish"].includes(body.lang) ? body.lang : "en";
  const decision = await decideGuide(loadCatalog(), q, nResults, {
    turn, prevTypes, region: body.region || null, persona: body.persona || null, lang,
    slots: body.slots || {},
    // Item D: the page opts into the AI question-type planner; canaries and
    // the chat dialog keep the deterministic policy order.
    planner: body.planner === true,
  });

  if (!decision.ask) {
    return NextResponse.json({ guide: null, mode: "policy", parsed, decision: { type: null, reason: decision.reason } });
  }

  let question = decision.question;
  let options = decision.options;
  let optionCounts = decision.optionCounts || [];
  let mode = forceMode === "fallback" ? "fallback" : "policy";
  let model = null;
  const translateOption = (o) => {
    if (o === "Gift") return t(lang, "occGift");
    if (o === "Not sure / flexible") return t(lang, "notSure");
    if (o.startsWith("No preference")) return t(lang, "noPref");
    if (/^Under /.test(o)) return budgetLabel(lang, o);
    const occ = { "Gift": "gift", "Birthday": "birthday", "Wedding / Shaadi": "wedding",
      "Anniversary": "anniversary" }[o];
    return occ ? occasionLabel(lang, occ) : o;
  };
  if (lang !== "en") {
    // O2: non-English phrasing comes from static tables (no LLM) so it is
    // deterministic and never invents vocabulary.
    question = t(lang, "q" + decision.type[0].toUpperCase() + decision.type.slice(1));
    options = options.map(translateOption);
    optionCounts = optionCounts.map((c) => ({ ...c, label: translateOption(c.label) }));
  } else if (decision.planPhrase) {
    // Item B: the one-call journey plan already phrased this question
    // (server-validated: <=12 words, no prices/URLs) - no second LLM
    // call. This is what makes a chip-only journey cost exactly one
    // Gemini call.
    mode = "plan";
  } else if (!geminiStatus().allExhausted && forceMode !== "fallback") {
    try {
      const userMsg =
        `User query: "${q}"\n` +
        `Decided question type: ${decision.type}\n` +
        `Reason: ${decision.reason}\n` +
        `Draft: ${decision.question}\n` +
        `Options (use exactly, same order): ${JSON.stringify(options)}\n` +
        "Rewrite ONLY the question sentence (max 12 words). Keep options identical.";
      const g = await geminiChat({ system: PHRASE_SYSTEM, user: userMsg, maxTokens: 240, temperature: 0.4, timeoutMs: 1500 });
      if (!g) throw new Error("no gemini key available");
      const text = g.text, m = g.model;
      const raw = text.replace(/```json/gi, "").replace(/```/g, "").trim();
      const obj = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
      if (typeof obj.question === "string" && obj.question.trim()) question = obj.question.trim();
      if (Array.isArray(obj.options) && obj.options.length === options.length &&
          obj.options.every((o, i) => String(o) === String(options[i]))) options = obj.options;
      mode = "llm";
      model = m;
    } catch {
      mode = "fallback"; // policy template is always a valid answer
    }
  }

  const guide = { type: decision.type, question, options, reason: decision.reason };
  if (decision.subType) guide.subType = decision.subType;
  if (optionCounts.length) guide.optionCounts = optionCounts;
  if (model) guide.model = model;
  try {
    const via = decision.planner || (mode === "llm" ? "gemini" : null);
    if (via || body.planner === true) {
      record("ai_call", {
        kind: "plan", via: via || "rules",
        key_idx: (decision.plannerAi && decision.plannerAi.keyIdx) ?? null,
        cached: !!(decision.plannerAi && decision.plannerAi.cached),
        ms: Date.now() - t0g,
        session_id: String(body.session_id || "").slice(0, 40) || undefined,
        turn,
      });
      if (decision.plannerAi && decision.plannerAi.rotatedFrom != null) {
        record("ai_key_exhausted", { key_idx: decision.plannerAi.rotatedFrom, reason: "rpd_or_quota", kind: "planner" });
      }
    }
  } catch { /* analytics must never break the guide */ }
  return NextResponse.json({
    guide,
    mode,
    parsed,
    decision: {
      type: decision.type,
      reason: decision.reason,
      rescue: decision.stats ? decision.stats.rescue : null,
      topCategory: decision.stats ? decision.stats.topCategory : null,
      planner: decision.planner || null,
      plannerAi: decision.plannerAi || null,
      planPhrase: decision.planPhrase || null,
      gemini: geminiStatus(),
    },
  });
}
