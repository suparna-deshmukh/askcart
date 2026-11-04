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
      // The alias line is the first content line when it is a pipe list
      // (the reply body always starts with "Demo:"). Multi-word first
      // aliases ("why do you ask|...") must be accepted too.
      if (i === 1 && l.includes("|") && l.length < 200 && !/^Demo:/i.test(l)) {
        aliases = l.split("|").map((x) => x.trim());
        continue;
      }
      body.push(l);
    }
    _passages.push({ id, aliases, text: body.join(" ") });
  }
  return _passages;
}

const FAQ_STOP = new Set(["the", "a", "an", "is", "are", "do", "does", "i", "my", "me", "what",
  "when", "how", "will", "you", "your", "this", "that", "it", "for", "of", "to", "and",
  "can", "could", "please", "tell", "about", "ka", "ki", "ke", "ko", "hai", "kya", "mein",
  "some", "shown", "know", "after", "placing", "here", "they", "them"]);

// Light stem so "deliver" matches the "delivery" alias and "prices" matches
// "price" (one pass, longest suffix first).
function stem(w) {
  return w.replace(/(ing|ed|es|s|y)$/, "");
}

export function faqMatch(text) {
  const q = String(text || "").toLowerCase();
  // Strip possessives/edge apostrophes so "CEO's" still matches the "ceo" alias.
  const qwords = (q.match(/[a-z']+/g) || [])
    .map((w) => w.replace(/^'+|'+$/g, "").replace(/'s$/, ""))
    .filter(Boolean);
  const content = qwords.filter((w) => !FAQ_STOP.has(w) && w.length > 2);
  if (!content.length) return null;
  const cStems = content.map((w) => ({ w, s: stem(w) }));
  let best = null, bestScore = 0;
  for (const p of loadPassages()) {
    let score = 0;
    for (const a of p.aliases) {
      const parts = a.toLowerCase().split(/\s+/);
      for (const { w, s } of cStems) {
        if (parts.some((x) => x === w || (x.length >= 4 && stem(x) === s))) { score += 2; break; }
      }
      if (parts.length > 1 && new RegExp("\\b" + parts.join("\\s+") + "\\b").test(q)) score += 2;
    }
    const hay = (p.text + " " + p.aliases.join(" ")).toLowerCase();
    for (const { w, s } of cStems) if (hay.includes(w) || (s.length >= 4 && hay.includes(s))) score += 0.5;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  if (!best || bestScore < 2) return null;
  return { id: best.id, text: best.text, score: Math.round(bestScore * 10) / 10 };
}
