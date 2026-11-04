// Substring/alias FAQ retrieval over faq/policies.md. Deterministic, zero LLM.
// Below-threshold matches return null -> the dialog answers faq_unknown.
import fs from "node:fs";
import path from "node:path";

let _passages = null;
function loadPassages() {
  if (_passages) return _passages;
  const file = path.join(process.cwd(), "lib", "chat", "faq", "policies.md");
  const text = fs.readFileSync(file, "utf8");
  _passages = [];
  for (const block of text.split(/\n## /).slice(1)) {
    const lines = block.split("\n");
    const id = lines[0].trim();
    let aliases = [];
    let body = [];
    for (let i = 1; i < lines.length; i++) {
      const l = lines[i].trim();
      if (!l) continue;
      if (!aliases.length && !body.length && !l.includes(":") === false && i === 1 && /^\S+(\|\S+)+$/.test(l)) { aliases = l.split("|").map((x) => x.trim()); continue; }
      if (!aliases.length && !body.length && /^\S+\|/.test(l) && l.length < 200) { aliases = l.split("|").map((x) => x.trim()); continue; }
      body.push(l);
    }
    _passages.push({ id, aliases, text: body.join(" ") });
  }
  return _passages;
}

const FAQ_STOP = new Set(["the", "a", "an", "is", "are", "do", "does", "i", "my", "me", "what",
  "when", "how", "will", "you", "your", "this", "that", "it", "for", "of", "to", "and",
  "can", "could", "please", "tell", "about", "ka", "ki", "ke", "ko", "hai", "kya", "mein"]);

export function faqMatch(text) {
  const q = String(text || "").toLowerCase();
  const qwords = q.match(/[a-z']+/g) || [];
  const content = qwords.filter((w) => !FAQ_STOP.has(w) && w.length > 2);
  if (!content.length) return null;
  let best = null, bestScore = 0;
  for (const p of loadPassages()) {
    let score = 0;
    for (const a of p.aliases) {
      const parts = a.toLowerCase().split(/\s+/);
      for (const w of content) if (parts.includes(w)) { score += 2; break; }
      if (parts.length > 1 && new RegExp("\\b" + parts.join("\\s+") + "\\b").test(q)) score += 2;
    }
    const hay = (p.text + " " + p.aliases.join(" ")).toLowerCase();
    for (const w of content) if (hay.includes(w)) score += 0.5;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  if (!best || bestScore < 2) return null;
  return { id: best.id, text: best.text, score: Math.round(bestScore * 10) / 10 };
}
