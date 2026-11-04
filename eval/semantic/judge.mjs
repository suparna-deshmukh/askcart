// Shared Qwen relevance judge for the semantic eval (single LLM judge).
// Batch of up to 20 queries per call, minimal prompt, thinking off
// (temperature 0, tight maxTokens) — per the work-order cost discipline.
// Returns { [queryId]: [1|2|3, 1|2|3, 1|2|3] } (1 relevant, 2 partial, 3 irrelevant).
import { chat } from "../../app/lib/llm.js";

const SYS =
  "You judge product-search results for an Indian e-commerce site. " +
  "For each numbered query, rate EACH shown product: 1 = relevant, " +
  "2 = partial (related but not the product asked), 3 = irrelevant. " +
  "Reply ONLY with JSON: {\"q1\":[1,2,3],...}";

export async function judgeBatch(items, { batchSize = 20 } = {}) {
  // items: [{id, q, results: [{title, price}, ...3]}]
  const out = {};
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const lines = batch.map((it, k) =>
      `q${k + 1}: ${it.q}\n` +
      it.results.map((r, j) => ` ${j + 1}. ${String(r.title).slice(0, 70)} | Rs ${r.price}`).join("\n"));
    const { text } = await chat(
      [{ role: "system", content: SYS }, { role: "user", content: lines.join("\n") }],
      { maxTokens: batch.length * 40 + 40, temperature: 0, thinking: false, timeoutMs: 90000 },
    );
    const raw = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const obj = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    for (const it of batch) {
      const qn = batch.indexOf(it) + 1;
      const v = obj["q" + qn];
      if (!Array.isArray(v) || v.length !== it.results.length) throw new Error("judge shape: " + text.slice(0, 120));
      out[it.id] = v.map((x) => Math.max(1, Math.min(3, parseInt(x, 10) || 3)));
    }
  }
  return out;
}
