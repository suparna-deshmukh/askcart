import { NextResponse } from "next/server";
import { loadCatalog } from "../../../lib/catalog";
import { parseQuery } from "../../../lib/search";
import { decideGuide } from "../../../lib/guide.js";
import { chat, llmAvailable } from "../../../lib/llm";
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
  const decision = decideGuide(loadCatalog(), q, nResults, {
    turn, prevTypes, region: body.region || null, persona: body.persona || null, lang,
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
  } else if (llmAvailable() && forceMode !== "fallback") {
    try {
      const userMsg =
        `User query: "${q}"\n` +
        `Decided question type: ${decision.type}\n` +
        `Reason: ${decision.reason}\n` +
        `Draft: ${decision.question}\n` +
        `Options (use exactly, same order): ${JSON.stringify(options)}\n` +
        "Rewrite ONLY the question sentence (max 12 words). Keep options identical.";
      const { text, model: m } = await chat(
        [{ role: "system", content: PHRASE_SYSTEM }, { role: "user", content: userMsg }],
        { maxTokens: 240, temperature: 0.4 },
      );
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
  if (optionCounts.length) guide.optionCounts = optionCounts;
  if (model) guide.model = model;
  return NextResponse.json({
    guide,
    mode,
    parsed,
    decision: {
      type: decision.type,
      reason: decision.reason,
      rescue: decision.stats ? decision.stats.rescue : null,
      topCategory: decision.stats ? decision.stats.topCategory : null,
    },
  });
}
