// Persona-driven recommendation helpers (update-prompt section 4).
// Pure, dependency-free: interest -> product/category matching, example
// queries, chat starter prompts. Everything is rule-based (no LLM) and
// grounded: queries and prompts use the catalogue's own vocabulary.

export const INTEREST_MATCH = {
  Fashion: /\bfashion|clothing|apparel|dress|kurt|kurti|saree|sari|shoe|footwear|jean|shirt|sweater|coat\b|legging|jacket/i,
  Electronics: /\belectron|phone|laptop|headphone|earbud|speaker|television|\btv\b|camera|appliance|fridge|washing machine|computer|tablet|gaming|charger|smartwatch/i,
  "Home and kitchen": /\bhome|kitchen|cookware|utensil|furniture|sofa|lamp|decor|curtain|bedding|tools|home improvement|diya/i,
  Beauty: /\bbeauty|cosmetic|lipstick|skincare|perfume|serum|makeup|personal care|cream|lotion|haircare/i,
  "Toys and baby": /\btoy|toys|baby|stroller|doll|puzzle|games|kids|cradle|diaper/i,
  Sports: /\bsport|yoga|gym|dumbbell|cricket|football|badminton|fitness|outdoor|running|cycling|ball/i,
  "Watches and jewellery": /\bwatch|wristwatch|jewel|ring|necklace|earring|pendant|bracelet|gold|diamond|chain\b/i,
};

export const INTEREST_QUERIES = {
  Fashion: "cotton kurti under 2k",
  Electronics: "headphones under 5000",
  "Home and kitchen": "non stick cookware set",
  Beauty: "lipstick gift set",
  "Toys and baby": "building blocks toy under 1500",
  Sports: "yoga mat with strap",
  "Watches and jewellery": "wristwatch under 5000",
};

// Tokens from a free-text custom interest (>= 4 chars, lowercased).
export function customInterestTokens(customInterest) {
  const s = String(customInterest || "").toLowerCase();
  if (!s) return [];
  return [...new Set(s.split(/[^a-z0-9]+/).filter((t) => t.length >= 4))].slice(0, 4);
}

function productText(r) {
  return [r.title, r.category, r.brand, (r.tags || []).join(" ")].join(" ").toLowerCase();
}

// 1 = a chosen standard interest matches, 0.4 = a custom-interest token
// matches. Returns { score, matched } for the "Because you like X" note.
export function interestScore(r, interests = [], tokens = []) {
  const txt = productText(r);
  let score = 0;
  const matched = [];
  for (const it of interests) {
    const m = INTEREST_MATCH[it];
    if (m && m.test(txt)) { score += 1; matched.push(it); }
  }
  for (const tk of tokens) {
    if (txt.includes(tk)) { score += 0.4; }
  }
  return { score: Math.min(score, 1.8), matched };
}

// Category-tile ordering: interest-first stable sort (0 = no match,
// 1 = interest match, 0.5 = custom token in the category name).
export function catsInterestScore(name, interests = [], tokens = []) {
  const n = String(name || "").toLowerCase();
  let best = 0;
  for (const it of interests) {
    if (INTEREST_MATCH[it] && INTEREST_MATCH[it].test(n)) best = 1;
  }
  for (const tk of tokens) if (n.includes(tk)) best = Math.max(best, 0.5);
  return best;
}

// Hero "Try:" chips: interest-based queries lead, then the regular pool.
export function interestQueries(interests = [], tokens = []) {
  const qs = interests.map((it) => INTEREST_QUERIES[it]).filter(Boolean);
  for (const tk of tokens.slice(0, 1)) qs.push(tk + " under 2000");
  return [...new Set(qs)];
}

// Chat starter prompts (rule-based, canonical English send text).
// cap: spend-style default budget (null -> 5000), half: cap/2.
export function starterPrompts(persona, cap = 5000) {
  const ints = (persona && Array.isArray(persona.interests)) ? persona.interests.filter(Boolean) : [];
  const tok = (persona && Array.isArray(persona.interests)) ? customInterestTokens(persona.interests.find((x) => !INTEREST_MATCH[x])) : [];
  const I0 = ints.length ? (INTEREST_MATCH[ints[0]] ? ints[0] : (tok[0] || ints[0])) : null;
  if (!I0) return null; // caller falls back to the default cards
  const capN = cap || 5000;
  const out = [
    { send: `Best ${I0} under \u20b9${capN}`, label: "chtSt1", vars: { x: I0, cap: capN } },
    { send: `Compare the top 3 ${I0}`, label: "chtSt2", vars: { x: I0 } },
  ];
  if (persona.context === "Gifting") {
    out.push({ send: `Gift under \u20b9${capN} for a birthday`, label: "chtSt3a", vars: { cap: capN } });
  } else {
    out.push({ send: `Top rated ${I0} under \u20b9${Math.max(500, Math.round(capN / 2))}`, label: "chtSt3b", vars: { x: I0, cap: Math.max(500, Math.round(capN / 2)) } });
  }
  const I1 = ints.length > 1 && INTEREST_MATCH[ints[1]] ? ints[1] : null;
  out.push(I1 ? { send: `What are the best ${I1} options?`, label: "chtSt4", vars: { x: I1 } }
              : { send: "Wristwatch for dad under 5k", label: "chtCardWatch", vars: {} });
  return out;
}
