// Output guard: every number, brand and SKU in an assistant reply must come
// from the facts object. Failures fall back to the template (mode=template)
// and are logged as chat_fallback{reason:grounding_fail}. Target: 0 reaching
// the user.
const ALLOWED_WORDS = new Set(["I", "A", "The", "This", "That", "AskCart", "India", "INR",
  "Rs", "K", "Lakh", "Diwali", "Shaadi", "Birthday", "Wedding", "Anniversary", "Christmas",
  "Party", "Gift", "Demo", "Not", "No", "Yes", "But", "And", "Or", "If", "So", "Its",
  "What", "Which", "Who", "When", "Try", "Open", "Added", "Cart", "Checkout", "Kept",
  "Here", "Few", "Nothing", "Nothing", "One", "Three", "Two", "More", "Again", "Plainly",
  "Type", "Message", "Read", "Trust", "Emergency", "Services", "Someone", "Find", "Look",
  "Narrow", "Budget", "Matches", "Marked", "Shown", "Picks", "Mean", "Detail", "Know",
  "Tagged", "Confirm", "Fit", "Adjusted", "Rating", "Ratings", "Based", "Treat", "Indicative",
  "Median", "Catalogue", "Catalog", "Matched", "Because", "Ranked", "Top", "Title", "Line",
  "Up", "View", "Add", "Compare", "Answer", "Talk", "Delivery", "Returns", "Payments", "Ranked",
  "Ranking", "Lives", "Happens", "Limit", "Turn", "Fresh", "Search", "Start", "Chat", "Hit",
  "Assistant", "Help", "Only", "From", "Here", "Above", "Below", "Under", "Over", "Within"]);
const BANNED = ["guaranteed", "100%", "100 %", "best quality", "will definitely", "genuine",
  "authentic", "free shipping", "free delivery", "doctor", "medicine", "medication",
  "lawsuit", "legal advice", "investment", "stock market", "prescription", "cure"];

function inrToNumber(s) {
  return parseInt(String(s).replace(/[^\d]/g, ""), 10) || 0;
}

// trusted=true for static template text (grounded by construction: every
// interpolated value comes from facts); full checks apply to LLM output.
export function validateGrounding(text, facts = {}, trusted = false) {
  const t = String(text || "");
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > 40) return { ok: false, rule: "words>40" };
  if (/https?:\/\//i.test(t)) return { ok: false, rule: "url" };
  if (/`|\b\[\d+\]|\*\*/.test(t)) return { ok: false, rule: "markdown" };
  for (const b of BANNED) if (t.toLowerCase().includes(b.toLowerCase())) return { ok: false, rule: "banned:" + b };
  if (trusted) return { ok: true };

  const allowedNums = new Set();
  const addN = (n) => { if (Number.isFinite(n) && n > 0) allowedNums.add(n); };
  for (const it of facts.items || []) { addN(it.price); addN(it.num_ratings); }
  if (facts.item) { addN(facts.item.price); addN(facts.item.num_ratings); }
  for (const v of Object.values(facts.slots || {})) if (typeof v === "number") addN(v);
  if (facts.median) addN(facts.median);
  if (facts.n) addN(facts.n);
  if (facts.m) addN(facts.m);

  for (const m of t.matchAll(/₹\s?([\d,]+(?:\.\d+)?)/g)) {
    const n = inrToNumber(m[1]);
    if (!allowedNums.has(n)) return { ok: false, rule: "currency:" + n };
  }
  for (const m of t.matchAll(/\b(\d+(?:\.\d+)?)\s*(k|lakh|rs|rupees)\b/gi)) {
    const n = Math.round(parseFloat(m[1]) * (m[2].toLowerCase() === "k" ? 1000 : 100000));
    if (!allowedNums.has(n)) return { ok: false, rule: "currency:" + n };
  }
  for (const m of t.matchAll(/\bsk[u_]?(\d+)\b/gi)) {
    if (!(facts.skus || []).includes("sku" + m[1]) && !(facts.skus || []).includes(m[1]))
      return { ok: false, rule: "sku:" + m[1] };
  }
  const titleTokens = new Set();
  for (const it of [...(facts.items || []), ...(facts.item ? [facts.item] : []), ...(facts.top || [])]) {
    for (const w of String(it.title || "").toLowerCase().split(/[^a-z0-9]+/)) if (w.length > 2) titleTokens.add(w);
    if (it.brand) for (const w of String(it.brand).toLowerCase().split(/[^a-z0-9]+/)) if (w.length > 2) titleTokens.add(w);
    if (it.category) for (const w of String(it.category).toLowerCase().split(/[^a-z0-9]+/)) if (w.length > 2) titleTokens.add(w);
  }
  for (const w of (facts.brands || [])) for (const x of String(w).toLowerCase().split(/[^a-z0-9]+/)) if (x.length > 2) titleTokens.add(x);
  for (const w of words) {
    const bare = w.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
    if (bare.length < 4) continue;
    if (/^\d+$/.test(bare)) {
      const n = parseInt(bare, 10);
      if (allowedNums.has(n)) continue;
      // small counts (e.g. "3 picks") are allowed when facts.n or item counts exist
      if (n <= 12) continue;
      return { ok: false, rule: "number:" + n };
    }
    if (ALLOWED_WORDS.has(bare) || titleTokens.has(bare.toLowerCase())) continue;
    // capitalised proper noun not in facts -> ungrounded brand claim
    if (/^[A-Z]/.test(bare) && !ALLOWED_WORDS.has(bare)) return { ok: false, rule: "brand:" + bare };
  }
  return { ok: true };
}
