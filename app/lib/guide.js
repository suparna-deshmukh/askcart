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

import fs from "fs";
import path from "path";
import { parseQuery, searchStats } from "./search.js";

const CATEGORY_FLOWS = {
  electronics: ["budget", "brand"],
  phones: ["budget", "brand"],
  computers: ["budget", "brand"],
  // G3: for-whom + size are the most decisive fashion facets (46.7% of the
  // catalogue is fashion); occasion stays first for gift queries (override).
  fashion: ["for_whom", "occasion", "size", "budget", "brand"],
  appliances: ["budget", "capacity", "brand"],
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
  if (/appliance/.test(c)) return "appliances";
  if (/electronic|camera|audio|video game/.test(c)) return "electronics";
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

// G7: festival calendar (region-aware). Dates carry approx=true where lunar/
// estimated. Upcoming-within-window festivals lead the occasion options.
let _festivals = null;
function festivals() {
  if (_festivals === null) {
    try {
      _festivals = JSON.parse(fs.readFileSync(
        path.join(process.cwd(), "lib", "festivals_2026_27.json"), "utf8")).festivals;
    } catch { _festivals = []; }
  }
  return _festivals;
}
function regionMatches(f, region) {
  if (!region || region === "pan") return true;
  return f.region === "pan" || f.region === region;
}
function upcomingFestivals(region, today, days = 45) {
  const t = new Date(today || Date.now());
  const out = [];
  for (const f of festivals()) {
    if (!f.date || !regionMatches(f, region)) continue;
    const d = new Date(f.date + "T00:00:00Z");
    const delta = (d - t) / 86400000;
    if (delta >= -3 && delta <= days) out.push({ name: f.name, delta });
  }
  return out.sort((a, b) => a.delta - b.delta).map((f) => f.name);
}

export function occasionOptions(region) {
  const fest = upcomingFestivals(region).slice(0, 3);
  const opts = [...fest];
  for (const base of ["Wedding / Shaadi", "Birthday", "Anniversary"]) {
    if (opts.length >= 5) break;
    if (!opts.includes(base)) opts.push(base);
  }
  if (!opts.length) opts.push("Gift", "Birthday", "Wedding / Shaadi", "Anniversary", "Everyday use");
  if (opts.length < 5) opts.push("Everyday use");
  return opts.slice(0, 6);
}

// G3: for-whom / size / capacity option generators - counts come from the
// candidate set (top-300), same rule as the budget/occasion/brand facets.
const FOR_WHOM_WORDS = {
  Women: /\b(women|womens|ladies|female)\b/i,
  Men: /\b(men|mens|male|groom)\b/i,
  Kids: /\b(kids|kid|children|child|toddler|baby|infant|boy|boys|girl|girls|school)\b/i,
};
export function forWhomOptions(items, n) {
  const counts = {};
  for (const [label, re] of Object.entries(FOR_WHOM_WORDS)) {
    counts[label] = items.filter((it) => re.test(it.title)).length;
  }
  return [
    { label: "Women", count: counts.Women },
    { label: "Men", count: counts.Men },
    { label: "Kids", count: counts.Kids },
    { label: "Unisex / any", count: n },
  ];
}
const SIZE_ORDER = ["xs", "s", "m", "l", "xl", "xxl"];
export function sizeOptions(items, n) {
  const counts = {};
  for (const it of items) {
    const ms = String(it.title).match(/\b(xxxl|xxl|xl|l|m|s|xs)\b/gi) || [];
    for (const w of ms) {
      const k = w.toLowerCase();
      if (SIZE_ORDER.includes(k)) counts[k] = (counts[k] || 0) + 1;
    }
  }
  const opts = SIZE_ORDER.filter((s) => counts[s])
    .map((s) => ({ label: s.toUpperCase(), count: counts[s] }));
  opts.push({ label: "Any size", count: n });
  return opts;
}
export function capacityOptions(items, n) {
  const counts = new Map();
  for (const it of items) {
    const ms = String(it.title).match(/(\d+(?:\.\d+)?)\s*(ton|kg|l)\b/g) || [];
    for (const raw of ms) {
      const m = raw.match(/(\d+(?:\.\d+)?)\s*(ton|kg|l)/i);
      const u = m[2].toLowerCase();
      const key = `${m[1]} ${u === "l" ? "L" : u}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const opts = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([label, count]) => ({ label, count }));
  if (opts.length) opts.push({ label: "Any", count: n });
  return opts;
}

// G3 eligibility: don't re-ask what the query already states.
const RECIPIENT_HINT = /\b(papa|dad|father|husband|brother|ammi|amma|mom|mum|mummy|maa|dadi|nani|beta|beti|bachche|kid|kids|girl|boy|women|men|for her|for him)\b/i;
function hasRecipientHint(query) { return RECIPIENT_HINT.test(String(query)); }

function clean(n) {
  if (!n || n <= 0) return 0;
  const step = n < 2000 ? 250 : n < 10000 ? 500 : 1000;
  return Math.max(step, Math.round(n / step) * step);
}

function inr(n) {
  return "₹" + clean(n).toLocaleString("en-IN");
}

// O5: stepDown shifts all budget bands one step lower (student persona).
function budgetOptions(stats, { stepDown = false } = {}) {
  const f = stepDown ? 0.75 : 1;
  const { p25, p50, p75 } = stats.priceP;
  if (!p25 || !p75) return ["Under ₹2,000", "₹2,000 – ₹5,000", "₹5,000 – ₹10,000", "Not sure / flexible"];
  const a = clean(p25 * f), b = clean(Math.max(p50 * f, p25 * f + 500)), c = clean(p75 * f);
  const opts = [`Under ${inr(a)}`, `${inr(a)} – ${inr(b)}`];
  if (c > b) opts.push(`${inr(b)} – ${inr(c)}`);
  opts.push("Not sure / flexible");
  return opts;
}

// G1: facet counts per option, from the candidate set (top-300).
const parseInr = (s) => parseInt(String(s).replace(/[₹,\s]/g, ""), 10) || 0;
function countBudget(items, n, label) {
  if (label.startsWith("Not sure")) return n;
  const range = label.match(/₹[\d,]+\s*–\s*₹([\d,]+)/);
  if (range) {
    const lo = parseInr(label.slice(label.indexOf("₹") + 1, label.indexOf("–")));
    const hi = parseInr(range[1]);
    return items.filter((x) => x.price >= lo && x.price < hi).length;
  }
  const under = label.match(/^Under (₹[\d,]+)/);
  if (under) return items.filter((x) => x.price < parseInr(under[1])).length;
  return 0;
}
const OCCASION_TAG = { "Wedding / Shaadi": "wedding", Birthday: "birthday",
  Anniversary: "anniversary", Gift: "gift", "Housewarming": "housewarming" };
// Festival calendar names -> nearest catalogue tag (honest counts: the
// Diwali window maps to the diwali tag; other festivals to party).
const FESTIVAL_TAG = { Diwali: "diwali", Dhanteras: "diwali", "Bhai Dooj": "diwali",
  "Guru Nanak Jayanti": "diwali" };
function countOccasion(items, n, tagCounts, label) {
  const tag = OCCASION_TAG[label];
  if (!tag) return label === "Everyday use"
    ? Math.max(0, n - tagCounts.reduce((a, t) => a + (["wedding", "birthday", "anniversary", "gift"].includes(t.name) ? t.count : 0), 0))
    : (tagCounts.find((t) => t.name === (FESTIVAL_TAG[label] || "party")) || { count: 0 }).count;
  return (tagCounts.find((t) => t.name === tag) || { count: 0 }).count;
}

const TEMPLATES = {
  budget: "Got it - what budget should I keep in mind?",
  occasion: "Quick one: what's the occasion?",
  category: "I can point you better - which of these are you after?",
  brand: "Any brand preference? Or I'll pick the best-rated ones.",
  for_whom: "Quick one - who's it for?",
  size: "Any size you need? (or I'll show all)",
  capacity: "What size / capacity do you need?",
};

// Returns the decision. `context`: { turn, prevTypes } from the client.
export function decideGuide(catalog, query, nResults, context = {}) {
  const parsed = parseQuery(query);
  const stats = searchStats(catalog, query, {});
  const dominant = stats.categories[0] || null;
  const dominantShare = dominant && stats.n ? dominant.count / stats.n : 0;
  const flow = CATEGORY_FLOWS[flowKey(dominant ? dominant.name : null)] || DEFAULT_FLOW;
  const prev = new Set((context.prevTypes || []).map(String));
  // O5: a Gifting persona gets the gift ordering even on non-"gift" queries.
  const gift = hasGiftIntent(query) || context.persona?.context === "Gifting";

  const isRescue = nResults < 2;
  // brand is a refinement: never the first question of a journey
  const eligible = flow.filter((t) => {
    if (prev.has(t)) return false;
    if (t === "brand" && context.turn <= 1) return false;
    if (t === "budget" && parsed.budgetMax !== null) return false;
    // "gift" is a generic occasion tag: still worth refining to a real occasion
    if (t === "occasion" && parsed.occasion && parsed.occasion !== "gift") return false;
    if (t === "category" && !isRescue && dominantShare > 0.7) return false;
    // G3: facet questions are only eligible when their data supports them
    if (t === "for_whom" && hasRecipientHint(query)) return false;
    if (t === "for_whom") {
      // Gender tokens must actually exist in the candidate set, or the
      // chip tap would re-rank nothing (India-layer titles carry no
      // women/men tokens: "kurti" -> Women 1 / Men 0 / Kids 0).
      const fw = forWhomOptions(stats.items, stats.n);
      const named = fw[0].count + fw[1].count + fw[2].count;
      if (stats.n < 20 || named < 15 || named / stats.n < 0.05) return false;
    }
    if (t === "size" && ((parsed.specs && parsed.specs.size) || sizeOptions(stats.items, stats.n).length < 3)) return false;
    if (t === "capacity" && (capacityOptions(stats.items, stats.n).length < 3 ||
        (parsed.specs && (parsed.specs.tonnage !== undefined || parsed.specs.kg !== undefined || parsed.specs.volume !== undefined)))) return false;
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
  // Gift-override: a gift query whose occasion is unknown asks occasion
  // first, whatever the flow (the occasion IS the product).
  if (gift && !parsed.occasion && order.includes("occasion") && order[0] !== "occasion") {
    order = ["occasion", ...order.filter((t) => t !== "occasion")];
  }

  const type = order[0] || null;
  if (!type) {
    return { ask: false, type: null, options: [], question: "", reason: "no actionable question left (all constraints present)", stats };
  }

  let options = [];
  let optionCounts = [];
  let reason = "";
  if (type === "budget") {
    options = budgetOptions(stats, { stepDown: context.persona?.userType === "Student" });
    reason = `no explicit budget in query; candidate set price range p25 ${inr(stats.priceP.p25)} – p75 ${inr(stats.priceP.p75)} (budget_mismatch = 9.4% of mined complaints; price spread is the issue, not the label)`;
    optionCounts = options.map((o) => ({ label: o, count: countBudget(stats.items, stats.n, o) }));
  } else if (type === "occasion") {
    // G7: calendar- and region-aware ordering (Diwali leads in Nov 2026).
    options = occasionOptions(context.region);
    reason = gift
      ? `gift intent without occasion; occasion tags decide ranking (occasion_blindness = 0.7% overall, but the top driver of gift-query failures in the corpus)`
      : `category flow prioritizes occasion (fashion/gift-adjacent)`;
    optionCounts = options.map((o) => ({ label: o, count: countOccasion(stats.items, stats.n, stats.tagCounts, o) }));
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
    reason = `ambiguous across categories (top share ${(dominantShare * 100).toFixed(0)}%); zero_or_wrong = 3.5% of mined complaints`;
    const catCount = (name) => {
      if (stats.n > 0) return counts.get(name) || 0;
      return catalog.filter((x) => x.category === name).length; // dead-end: whole catalogue
    };
    optionCounts = options.map((o) => ({ label: o, count: catCount(o) }));
  } else if (type === "brand") {
    options = stats.brands.slice(0, 3).map((b) => b.name);
    options.push("No preference - best rated");
    reason = `brand-driven category, results fragmented (${stats.brands.length} brands in candidate set); brand = strongest trust proxy (trust_gap = 54.4% of mined complaints)`;
    const brandCount = (name) => (stats.brands.find((b) => b.name === name) || { count: 0 }).count;
    optionCounts = options.map((o) => ({ label: o, count: o.startsWith("No preference") ? stats.n : brandCount(o) }));
  } else if (type === "for_whom") {
    // G3: fashion for-whom facet
    optionCounts = forWhomOptions(stats.items, stats.n);
    options = optionCounts.map((o) => o.label);
    reason = `fashion candidate set spans women/men/kids lines; for-whom is the strongest single filter on fashion (46.7% of the catalogue is fashion)`;
  } else if (type === "size") {
    // G3: size facet, derived from title variants (S/M/L/XL)
    optionCounts = sizeOptions(stats.items, stats.n);
    options = optionCounts.map((o) => o.label);
    reason = `size is stated in most candidate titles; picking one removes the largest cluster of near-duplicate variant cards`;
  } else if (type === "capacity") {
    // G3: appliance capacity facet (tonnage / kg / litres from titles)
    optionCounts = capacityOptions(stats.items, stats.n);
    options = optionCounts.map((o) => o.label);
    reason = `appliance candidate set spans multiple capacities (tonnage/kg/litres); the spec slot re-ranks on it`;
  }

  return {
    ask: true,
    type,
    options,
    optionCounts,
    question: TEMPLATES[type],
    reason,
    stats: { n: stats.n, topCategory: dominant ? dominant.name : null, dominantShare, flow, rescue: isRescue },
  };
}
