// Qwen suite - RAG dimension (300 cases). In-process /api/chat route
// (CHAT_LLM=0, CHAT_EVAL=1): 250 product Q&A (turn1 = SKU title search,
// turn2 = question) + 50 FAQ (single turn). Deterministic checks:
// <=40 words, meta.grounded !== false, no banned phrases. Then one Qwen
// call per case judges: does the reply answer the question correctly,
// honestly about unknowns, helpfully, using only the SKU facts?
// PASS = deterministic ok AND Qwen pass. Resume-safe.
import fs from "node:fs";
import path from "node:path";

process.env.CHAT_LLM = "0";
process.env.CHAT_EVAL = "1";
const APP = path.resolve(process.cwd(), "..");
process.chdir(path.join(APP, "app"));

const { POST } = await import("../../app/app/api/chat/route.js");
const { signState, freshState } = await import("../../app/lib/chat/state.js");

const HERE = path.join(App(), "eval", "qwen_suite");
function App() { return path.resolve(process.cwd(), ".."); }
const PANEL = fs.readFileSync(path.join(HERE, "panel.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const CASES = PANEL.filter((p) => p.dim === "rag");
const OUT = path.join(HERE, "results", "verdicts_rag.jsonl");
const COST = path.join(HERE, "results", "cost_rag.json");
const BANNED = ["100%", "guaranteed", "best quality", "will definitely", "genuine", "authentic", "free shipping", "free delivery", "lifetime"];

// Qwen via the same proxy config as extractor/llm_client.py (read .env)
function env(name) {
  const v = process.env[name];
  if (v) return v.trim();
  try {
    for (const line of fs.readFileSync(path.join(App(), ".env"), "utf8").split("\n")) {
      const t = line.trim();
      if (t && !t.startsWith("#") && t.includes("=")) {
        const [k, ...rest] = t.split("=");
        if (k === name && rest.join("=").trim()) return rest.join("=").trim();
      }
    }
  } catch {}
  return null;
}
const LLM = { base: (env("LLM_BASE_URL") || "").replace(/\/$/, ""), key: env("LLM_API_KEY"), model: env("LLM_MODEL") || "qwen38-27b" };
let cost = { calls: 0, est_tokens: 0 };
try { cost = JSON.parse(fs.readFileSync(COST, "utf8")); } catch {}

async function qwen(prompt) {
  const r = await fetch(LLM.base + "/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LLM.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: LLM.model, temperature: 0, max_tokens: 120,
                           messages: [{ role: "user", content: prompt }],
                           extra_body: { chat_template_kwargs: { enable_thinking: false } } }),
  });
  if (!r.ok) throw new Error("qwen " + r.status);
  const j = await r.json();
  const content = j.choices?.[0]?.message?.content;
  if (!content) throw new Error("empty completion");
  cost.calls++; cost.est_tokens += Math.floor((prompt.length + content.length) / 4);
  fs.writeFileSync(COST, JSON.stringify(cost));
  return content;
}

function words(t) { return String(t || "").split(/\s+/).filter(Boolean).length; }

const JUDGE_PROMPT = (facts, question, reply) => `You audit an AI shopping assistant's answer for an Indian demo e-commerce app.
FACTS about the product (the ONLY data the assistant may use): ${JSON.stringify(facts)}
SHOPPER QUESTION: ${question}
ASSISTANT REPLY: ${reply}
Judge the reply:
1) grounded: every concrete claim (number, spec, brand, tag) appears in FACTS
2) answers: it actually addresses the question
3) honest: if the answer is NOT in FACTS, the reply must say it doesn't have that detail (an invented detail = fail)
4) tone: short, plain, no promises of delivery/quality beyond facts
Reply with exactly one line: PASS or FAIL, then a 5-word reason.
Example: PASS addresses tonnage from title
Example: FAIL invented battery life not in facts`;

// Product Q&A is evaluated on the documented PDP path (spec 6.4): a fresh
// conversation with context.sku set - no artificial pending-question state
// from a search turn. FAQ cases are single-turn, context-free.
async function runCase(c) {
  let state = signState(freshState({}));
  const resp = await POST(new Request("http://eval/api/chat", {
    method: "POST",
    body: JSON.stringify({ state, input: { type: "text", text: c.question },
                           context: c.sku ? { sku: c.sku } : {} }),
  }));
  const body = await resp.json();
  const reply = body.reply || {};
  const meta = body.meta || {};
  const text = String(reply.text || "");
  const wordsN = words(text);
  const banned = BANNED.filter((b) => text.toLowerCase().includes(b.toLowerCase()));
  const det_ok = wordsN <= 40 && meta.grounded !== false && banned.length === 0;
  return { id: c.id, kind: c.kind, question: c.question, sku: c.sku || null, facts: c.facts || null,
           act: reply.act || null, intent: meta.intent || null, reply_text: text.slice(0, 300),
           words: wordsN, grounded_meta: meta.grounded !== false, banned, det_ok,
           expect_answerable: c.expect_answerable };
}

const POLICY_TEXT = fs.readFileSync(path.join(App(), "app", "lib", "chat", "faq", "policies.md"), "utf8");

async function main() {
  const done = new Set();
  if (fs.existsSync(OUT)) for (const l of fs.readFileSync(OUT, "utf8").split("\n")) if (l.trim()) done.add(JSON.parse(l).id);
  const todo = CASES.filter((c) => !done.has(c.id));
  console.log(`rag: ${CASES.length} cases, ${done.size} done, ${todo.length} todo`);
  // NOTE: fs.createWriteStream is unusable in this in-process route import
  // graph (its fs.open hangs forever; sync fs works). Use appendFileSync.
  const fOut = { write: (s2) => fs.appendFileSync(OUT, s2), end: () => {} };
  let i = 0;
  const workers = Array.from({ length: 6 }, async () => {
    while (i < todo.length) {
      const idx = i++;
      const c = todo[idx];
      try {
        const r = await runCase(c);
        let q = "FAIL", reason = "judge_error";
        try {
          const facts = r.facts || POLICY_TEXT;
          const t = await qwen(JUDGE_PROMPT(facts, r.question, r.reply_text));
          const m = t.match(/(PASS|FAIL)\s*([^.!?]*)/);
          if (m) { q = m[1]; reason = m[2].trim().slice(0, 60); }
        } catch (e) { reason = "judge_error: " + String(e).slice(0, 60); }
        r.qwen = q; r.reason = reason;
        r.pass = r.det_ok && q === "PASS";
        fOut.write(JSON.stringify(r) + "\n");
      } catch (e) {
        fOut.write(JSON.stringify({ id: c.id, kind: c.kind, question: c.question, error: String(e).slice(0, 200) }) + "\n");
      }
      if ((idx + 1) % 30 === 0) console.log(`${idx + 1}/${todo.length}`, { calls: cost.calls });
    }
  });
  await Promise.all(workers);
  fOut.end();
  console.log("rag done");
}
main();
