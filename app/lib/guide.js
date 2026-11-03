// Follow-up question policy for AskCart.
//
// Design: the policy DECIDES (type + data-driven options + reason); the LLM
// only phrases it naturally (see api/guide). This keeps behaviour stable,
// auditable and minimal - at most one question per turn, up to three per
// journey (4-turn budget, the same turn budget the n=150 study measures).
//
// Grounding (corpus of 94,643 reviews -> 6,041 complaints -> 4 root causes):
//   trust_gap 42.2%  -> brand/trust question (asked late, as refinement)
//   budget_mismatch 31.4% -> budget question (earliest, biggest lever)
//   zero_or_wrong 19.3%  -> category disambiguation (rescue mode)
//   occasion_blindness 7.1% -> occasion question (gift-intent queries)
// Per-category flows differ by product type (see CATEGORY_FLOWS).

import { parseQuery, searchStats } from "./search.js";

const CATEGORY_FLOWS = {
  electronics: ["budget", "brand"],
  phones: ["budget", "brand"],
  computers: ["budget", "brand"],
  fashion: ["occasion", "budget", "brand"],
  beauty: ["occasion", "budget", "brand"],
  home: ["budget", "occasion"],
  toys: ["occasion", "budget"],
  baby: ["occasion", "budget"],
  handmade: ["occasion", "budget"],
  arts: ["occasion", "budget"],
  hobby: ["budget", "brand"],
  sports: ["budget", "category"],
  office: ["budget", "category"],
  pets: ["budget", "category"],
  automotive: ["budget", "category"],
};
const DEFAULT_FLOW = ["budget", "category", "brand"];

function flowKey(category) {
  const c = String(category || "").toLowerCase();
  if (/cell phone|phone/.test(c)) return "phones";
  if (/computer/.test(c)) return "computers";
  if (/electronic|camera|audio|appliance|video game/.test(c)) return "electronics";
  if (/fashion/.test(c)) return "fashion";
  if (/beauty/.test(c)) return "beauty";
  if (/toys/.test(c)) return "toys";
  if (/\bbaby\b/.test(c)) return "baby";
  if (/handmade/.test(c)) return "handmade";
  if (/arts|crafts/.test(c)) return "arts";
  if (/musical/.test(c)) return "hobby";
  if (/sport/.test(c)) return "sports";
  if (/office/.test(c)) return "office";
  if (/pet/.test(c)) return "pets";
  if (/automotive|car/.test(c)) return "automotive";
  if (/home|tools/.test(c)) return "home";
  return null;
}

const GIFT_WORDS = ["gift", "present", "gifts", "gifting", "for him", "for her"];
function hasGiftIntent(q) {
  const s = String(q).toLowerCase();
  return GIFT_WORDS.some((w) => s.includes(w));
}

function clean(n) {
  if (!n || n <= 0) return 0;
  const step = n < 2000 ? 250 : n < 10000 ? 500 : 1000;
  return Math.max(step, Math.round(n / step) * step);
}

function inr(n) {
  return "₹" + clean(n).toLocaleString("en-IN");
}

function budgetOptions(stats) {
  const { p25, p50, p75 } = stats.priceP;
  if (!p25 || !p75) return ["Under ₹2,000", "₹2,000 – ₹5,000", "₹5,000 – ₹10,000", "Not sure / flexible"];
  const a = clean(p25), b = clean(Math.max(p50, p25 + 500)), c = clean(p75);
  const opts = [`Under ${inr(a)}`, `${inr(a)} – ${inr(b)}`];
  if (c > b) opts.push(`${inr(b)} – ${inr(c)}`);
  opts.push("Not sure / flexible");
  return opts;
}

const OCCASION_OPTIONS = ["Gift", "Birthday", "Wedding / Shaadi", "Anniversary", "Diwali / Festival", "Everyday use"];

const TEMPLATES = {
  budget: "Got it - what budget should I keep in mind?",
  occasion: "Quick one: what's the occasion?",
  category: "I can point you better - which of these are you after?",
  brand: "Any brand preference? Or I'll pick the best-rated ones.",
};

// Returns the decision. `context`: { turn, prevTypes } from the client.
export function decideGuide(catalog, query, nResults, context = {}) {
  const parsed = parseQuery(query);
  const stats = searchStats(catalog, query, {});
  const dominant = stats.categories[0] || null;
  const dominantShare = dominant && stats.n ? dominant.count / stats.n : 0;
  const flow = CATEGORY_FLOWS[flowKey(dominant ? dominant.name : null)] || DEFAULT_FLOW;
  const prev = new Set((context.prevTypes || []).map(String));
  const gift = hasGiftIntent(query);

  const isRescue = nResults < 2;
  // brand is a refinement: never the first question of a journey
  const eligible = flow.filter((t) => {
    if (prev.has(t)) return false;
    if (t === "brand" && context.turn <= 1) return false;
    if (t === "budget" && parsed.budgetMax !== null) return false;
    // "gift" is a generic occasion tag: still worth refining to a real occasion
    if (t === "occasion" && parsed.occasion && parsed.occasion !== "gift") return false;
    if (t === "category" && !isRescue && dominantShare > 0.7) return false;
    return true;
  });
  // Rescue mode: disambiguation is the rescue - category question always
  // eligible so a dead-end search can always be converted.
  if (isRescue && !prev.has("category") && !eligible.includes("category")) {
    eligible.push("category");
  }

  // Rescue mode: disambiguation first (a dead-end or weak search needs a
  // category choice before budget/brand can be useful).
  let order = eligible;
  if (isRescue && eligible.includes("category") && dominantShare < 0.5 && stats.categories.length > 1) {
    order = ["category", ...eligible.filter((t) => t !== "category")];
  }
  // Gift-override: a gift query whose occasion is unknown should ask
  // occasion before budget (the occasion IS the product).
  if (gift && !parsed.occasion && order.includes("occasion") && order[0] === "budget") {
    order = ["occasion", ...order.filter((t) => t !== "occasion")];
  }

  const type = order[0] || null;
  if (!type) {
    return { ask: false, type: null, options: [], question: "", reason: "no actionable question left (all constraints present)", stats };
  }

  let options = [];
  let reason = "";
  if (type === "budget") {
    options = budgetOptions(stats);
    reason = `no explicit budget in query; candidate set price range p25 ${inr(stats.priceP.p25)} – p75 ${inr(stats.priceP.p75)} (budget_mismatch = 31.4% of mined complaints)`;
  } else if (type === "occasion") {
    options = OCCASION_OPTIONS;
    reason = gift
      ? `gift intent without occasion; occasion tags decide ranking (occasion_blindness = 7.1% of mined complaints, top driver of gift-query failures)`
      : `category flow prioritizes occasion (fashion/gift-adjacent)`;
  } else if (type === "category") {
    // Dead-end (n=0) gift queries: offer gift-adjacent categories.
    const GIFT_AFFINITY = ["Toys & Games", "Handmade", "Arts, Crafts & Sewing", "AMAZON FASHION",
      "Amazon Home", "All Beauty", "Baby", "Video Games", "Musical Instruments"];
    const counts = new Map(stats.categories.map((c) => [c.name, c.count]));
    let names = stats.categories.slice(0, 4).map((c) => c.name);
    if (stats.n === 0) {
      names = GIFT_AFFINITY.filter((c) => catalog.some((x) => x.category === c));
      names.sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0));
      names = names.slice(0, 4);
    }
    options = names;
    reason = `ambiguous across categories (top share ${(dominantShare * 100).toFixed(0)}%); zero_or_wrong = 19.3% of mined complaints`;
  } else if (type === "brand") {
    options = stats.brands.slice(0, 3).map((b) => b.name);
    options.push("No preference - best rated");
    reason = `brand-driven category, results fragmented (${stats.brands.length} brands in candidate set); brand = strongest trust proxy (trust_gap = 42.2% of mined complaints)`;
  }

  return {
    ask: true,
    type,
    options,
    question: TEMPLATES[type],
    reason,
    stats: { n: stats.n, topCategory: dominant ? dominant.name : null, dominantShare, flow, rescue: isRescue },
  };
}
