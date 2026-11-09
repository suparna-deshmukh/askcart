// LLM suite - RAG verdict refresh (token saver, 0 LLM tokens).
// Re-runs every case in template mode (CHAT_LLM=0) and keeps old verdicts
// ONLY where the assistant reply is byte-identical (same input to the
// frozen judge -> same verdict). FAQ fact corpus (policies.md) is a
// superset of the frozen one, so an unchanged FAQ reply keeps its verdict.
// Everything else is dropped so judge_rag.mjs re-judges it.
import fs from "node:fs";
import path from "node:path";

process.env.CHAT_LLM = "0";
process.env.CHAT_EVAL = "1";
const APP = path.resolve(process.cwd(), "..");
process.chdir(path.join(APP, "app"));

const { POST } = await import("../../app/app/api/chat/route.js");
const { signState, freshState } = await import("../../app/lib/chat/state.js");

const HERE = path.join(APP, "eval", "llm_suite");
const PANEL = fs.readFileSync(path.join(HERE, "panel.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const CASES = PANEL.filter((p) => p.dim === "rag");
const OUT = path.join(HERE, "results", "verdicts_rag.jsonl");

const old = {};
for (const l of fs.readFileSync(OUT, "utf8").split("\n")) if (l.trim()) { const d = JSON.parse(l); old[d.id] = d; }

function words(t) { return String(t || "").split(/\s+/).filter(Boolean).length; }
const BANNED = ["100%", "guaranteed", "best quality", "will definitely", "genuine",
  "authentic", "free shipping", "free delivery", "lifetime"];

async function replyFor(c) {
  const state = signState(freshState({}));
  const resp = await POST(new Request("http://eval/api/chat", {
    method: "POST",
    body: JSON.stringify({ state, input: { type: "text", text: c.question },
                           context: c.sku ? { sku: c.sku } : {} }),
  }));
  const body = await resp.json();
  const reply = body.reply || {};
  const meta = body.meta || {};
  const text = String(reply.text || "");
  const banned = BANNED.filter((b) => text.toLowerCase().includes(b.toLowerCase()));
  // det_ok must mirror judge_rag.mjs exactly, or the keep-test is useless.
  const det_ok = words(text) <= 40 && meta.grounded !== false && banned.length === 0;
  return { text, words: words(text), act: reply.act || null,
           intent: meta.intent || null, grounded_meta: meta.grounded !== false, det_ok };
}

const DEBUG = process.argv.includes("--debug");
const keep = [];
const freshN = [];
let i = 0;
const workers = Array.from({ length: 6 }, async () => {
  while (i < CASES.length) {
    const idx = i++;
    const c = CASES[idx];
    try {
      const cur = await replyFor(c);
      const o = old[c.id];
      if (o && !o.error && o.reply_text === cur.text && o.act === cur.act && o.intent === cur.intent && o.det_ok === cur.det_ok) {
        keep.push(o);
      } else if (DEBUG && keep.length + freshN.length < 3) {
        freshN.push(c.id);
        console.log("DIFF", c.id, o ? JSON.stringify({
          stored: [o.reply_text && o.reply_text.slice(0, 60), o.act, o.intent, o.det_ok],
          live: [cur.text.slice(0, 60), cur.act, cur.intent, cur.det_ok],
        }) : "no stored record");
      }
    } catch (e) {
      console.error("refresh error", c.id, String(e).slice(0, 120));
    }
    if (idx % 50 === 49) console.log(idx + 1 + "/" + CASES.length);
  }
});
await Promise.all(workers);
fs.writeFileSync(OUT, keep.map((o) => JSON.stringify(o)).join("\n") + "\n");
console.log(`rag refresh: keep(unchanged)=${keep.length} re-judge=${CASES.length - keep.length}`);
