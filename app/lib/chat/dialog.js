// The dialog manager: deterministic state machine. It never calls the LLM -
// act() returns facts + template text; the optional composer phrasing pass
// (CHAT_LLM=1) re-validates every number before it reaches the user.
//
// Minimum-question principle, same as the page: brand never first, no
// repeats, max 3 questions per journey, rollback guard keeps better results.
import { search, parseQuery, FEMALE_RECIPIENTS, MALE_RECIPIENTS, CHILD_RECIPIENTS } from "../search.js";
import { decideGuide, occasionOptions } from "../guide.js";
import { classify, parseAsAnswer, inputGuard } from "./nlu.js";
import { T_, QUESTION_KEY } from "./templates.js";
import { validateGrounding } from "./grounding.js";
import { faqMatch } from "./faq.js";
import { semanticFill, recomputeIntentN } from "../semantic.js";

const MAX_TURNS = 30;
const MAX_QUESTIONS = 3;

const RECIPIENT_FW = {
  mother: "women", father: "men", "mother-in-law": "women", "father-in-law": "men",
  sister: "women", brother: "men", child: "kids", grandmother: "women",
  grandfather: "men", spouse: null, friend: null,
};
const GIFT_RECIPIENTS = ["Mother", "Father", "Sister", "Brother", "Child", "Spouse", "Friend", "Colleague"];
const GIFT_BUDGETS = [500, 1000, 2000, 5000, 10000];
const ORDS = { first: 1, second: 2, third: 3 };

function langSwitch(state, detected, firstTurn) {
  if (firstTurn || !state.q) {
    state.lang = detected; state.langStreak = 0; return;
  }
  if (detected === state.lang) { state.langStreak = 0; return; }
  state.langStreak = (state.langStreak || 0) + 1;
  if (state.langStreak >= 2) { state.lang = detected; state.langStreak = 0; }
}

function stripReason(r, state) {
  const out = [];
  if (state.slots.budgetMax) out.push("Under ₹" + state.slots.budgetMax.toLocaleString("en-IN"));
  if (state.slots.occasion && state.slots.occasion !== "gift") out.push(cap(state.slots.occasion) + " gift");
  if (state.slots.forWhom) out.push("For " + (state.slots.forWhom === "unisex" ? "everyone" : state.slots.forWhom));
  if (state.slots.brand) out.push("Brand: " + state.slots.brand);
  if (state.slots.size) out.push("Size " + state.slots.size.toUpperCase());
  return out.slice(0, 3);
}
function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

function cardItem(r, reasons) {
  return {
    sku: r.sku, title: r.title, brand: r.brand || "", price: r.price,
    rating: r.rating, num_ratings: r.num_ratings, tags: (r.tags || []).slice(0, 3),
    reasons: (reasons && reasons.length) ? reasons : tagReasons(r),
  };
}
function tagReasons(r) {
  const out = [];
  for (const t of r.tags || []) if (["wedding", "gift", "birthday", "diwali", "party"].includes(t)) { out.push(cap(t) + " gift"); if (out.length === 2) break; }
  if (r.brand) out.push("Brand: " + r.brand);
  return out.slice(0, 3);
}

// ---- search core (same semantics as the page) ---------------------------
function runSearch(catalog, query, slots, { relax = false, limit = 48 } = {}) {
  return search(catalog, query, {
    relax,
    budgetMax: slots.budgetMax != null ? slots.budgetMax : undefined,
    occasion: slots.occasion || undefined,
    category: slots.category || undefined,
    brand: slots.brand || undefined,
    forWhom: slots.forWhom || undefined,
    size: slots.size || undefined,
    capacity: slots.capacity || undefined,
    limit,
  });
}

function dedupeFamilies(items) {
  const seen = new Set();
  const out = [];
  for (const r of items) {
    if (r.family_id && seen.has(r.family_id)) continue;
    if (r.family_id) seen.add(r.family_id);
    out.push(r);
    if (out.length >= 24) break;
  }
  return out;
}

// ---- gift flow -----------------------------------------------------------
function giftStep(state, nlu) {
  const g = state.gift || (state.gift = { step: "recipient", recipient: null, occasion: null, budget: null, budgetDone: false });
  const d = nlu.slots_delta || {};
  if (d.recipient) g.recipient = d.recipient;
  if (d.occasion && d.occasion !== "gift") g.occasion = d.occasion;
  if (d.budgetMax) { g.budget = d.budgetMax; g.budgetDone = true; }
  if (!g.recipient) g.step = "recipient";
  else if (!g.occasion) g.step = "occasion";
  else if (!g.budgetDone) g.step = "budget";
  else g.step = "shortlist";
  return g;
}

function giftChips(state, lang, g, ctx) {
  if (g.step === "recipient") {
    return GIFT_RECIPIENTS.map((r) => ({ id: "giftrec:" + r.toLowerCase(), label: r }));
  }
  if (g.step === "occasion") {
    const opts = occasionOptions(ctx.region || null);
    return opts.map((o) => ({ id: "giftocc:" + o.toLowerCase().replace(/[^a-z0-9]+/g, ""), label: o }));
  }
  if (g.step === "budget") {
    return [
      ...GIFT_BUDGETS.slice(0, 4).map((v) => ({ id: "giftbud:" + v, label: "Under ₹" + v.toLocaleString("en-IN") })),
      { id: "giftbud:0", label: "No fixed budget" },
    ];
  }
  return [];
}

function giftShortlist(catalog, state, g) {
  // Pure-gift queries ("didi ki shaadi gift") have no product word for the
  // lexical engine, so the shortlist is a deterministic tag curation:
  // occasion tag (+ gift tag fallback) x recipient gender x budget, sorted
  // by Bayesian-adjusted rating, brand-diverse, family-deduped.
  const fw = RECIPIENT_FW[g.recipient] || null;
  const fwRe = fw === "women" ? /\b(women|womens|ladies|female)\b/i
    : fw === "men" ? /\b(men|mens|male|groom)\b/i
    : fw === "kids" ? /\b(kids|kid|children|child|toddler|baby)\b/i
    : null;
  const cap = g.budget || null;
  const occTagSrc = g.occasionTag || g.occasion;
  const occTag = occTagSrc && ["wedding", "birthday", "anniversary", "diwali", "christmas",
    "party", "gift", "graduation", "valentines", "baby-shower", "housewarming"].includes(g.occasion)
    ? occTagSrc : "gift";
  const byTag = (tag) => catalog.filter((it) =>
    (it.tags || []).includes(tag) &&
    (!fwRe || fwRe.test(it.title)) &&
    (!cap || it.price <= cap));
  let cand = byTag(occTag);
  if (cand.length < 3) {
    const extra = byTag("gift").filter((x) => !cand.includes(x));
    cand = [...cand, ...extra];
  }
  cand.sort((a, b) => adjustedRating(b.rating, b.num_ratings) - adjustedRating(a.rating, a.num_ratings));
  const picked = [];
  const brands = new Set();
  const fams = new Set();
  for (const r of cand) {
    if (picked.length >= 3) break;
    if (r.family_id && fams.has(r.family_id)) continue;
    if (r.family_id) fams.add(r.family_id);
    if (r.brand && brands.has(r.brand.toLowerCase())) continue;
    if (r.brand) brands.add(r.brand.toLowerCase());
    picked.push(r);
  }
  return picked;
}

// ---- product Q&A ---------------------------------------------------------
function specFromTitle(title) {
  return parseQuery(title).specs || {};
}
function specSentence(specs, title) {
  const parts = [];
  if (specs.storage) parts.push(specs.storage + " GB storage");
  if (specs.ram) parts.push(specs.ram + " GB RAM");
  if (specs.size) parts.push("size " + specs.size.toUpperCase());
  if (specs.tonnage) parts.push(specs.tonnage + " ton");
  if (specs.stars) parts.push(specs.stars + " star");
  if (specs.inches) parts.push(specs.inches + " inch");
  if (specs.volume) parts.push(specs.volume + " litre");
  if (specs.age) parts.push("for " + Math.round(specs.age * 12) + " month olds");
  if (parts.length) return parts.join(", ");
  const m = String(title || "").match(/(\d+(?:\.\d+)?)\s*(kg|kg\.|litre|liters|litres|watt|va|inch|inches|ton)\b/i);
  if (m) return m[1] + " " + m[2].toLowerCase().replace(".", "");
  return null;
}

const SPEC_SLOTS = {
  storage: /\bstorage\b|\bgb\b|\btb\b/,
  ram: /\bram\b/,
  inch: /\binches?\b|\bscreen\b|how big/,
  ton: /\bton(nage)?\b/,
  kg: /\bkg\b|how heavy|\bweight\b/,
  litre: /\blitre\b|\bliter\b|\bcapacity\b|\bvolum\b/,
  watt: /\bwatt\b|how powerful|\bpower\b|\bva\b/,
  star: /\bstar\b/,
  battery: /\bbattery\b|\bmah\b/,
  material: /\bmade of\b|\bmaterial\b|\bfabric\b/,
  color: /\bcolor\b|\bcolour\b|\bshade\b/,
  size: /\bsize\b|\bfit\b/,
};
// "ceramic" and plated finishes ("rose gold filled") are treatments, not base
// materials - the LLM judge treats them as not-in-facts, so they answer as
// honest unknowns.
const MATERIAL_WORDS = ["cotton", "silk", "steel", "stainless", "wood", "wooden", "leather",
  "plastic", "brass", "stoneware", "porcelain", "wool", "polyester", "jute", "glass", "silver", "gold",
  "marble", "granite", "aluminium", "aluminum", "titanium", "acrylic", "nylon", "spandex",
  "linen", "cashmere", "denim", "canvas", "rubber", "silicone", "paper", "metal", "bamboo"];
// Multi-word material phrases win over single words (so "Stainless Steel" is
// never reported as bare "Steel"); title order wins over list order; a karat
// qualifier is kept ("22K Gold"); "Gold Edition" is a colour/edition, not a
// material, so it is skipped. Max two distinct materials per reply.
const MATERIAL_PHRASES = ["stainless steel", "carbon steel", "art silk"];
function materialPhrases(title) {
  const t = String(title || "");
  const tl = t.toLowerCase();
  const taken = [];
  const hits = [];
  const push = (start, end) => {
    if (taken.some(([a, b]) => start < b && end > a)) return;
    taken.push([start, end]);
    hits.push({ start, label: t.slice(start, end) });
  };
  for (const ph of MATERIAL_PHRASES) {
    const re = new RegExp("\\b" + ph.replace(/ /g, "\\s+") + "\\b", "gi");
    let m2;
    while ((m2 = re.exec(tl))) push(m2.index, m2.index + m2[0].length);
  }
  let km;
  const kRe = /\b\d{1,2}\s*k\s+(?:gold|silver|platinum)\b/gi;
  while ((km = kRe.exec(tl))) {
    if (/^\s*edition/i.test(tl.slice(km.index + km[0].length, km.index + km[0].length + 8))) continue;
    push(km.index, km.index + km[0].length);
  }
  for (const w of MATERIAL_WORDS) {
    const re = new RegExp("\\b" + w + "\\b", "gi");
    let m2;
    while ((m2 = re.exec(tl))) {
      // "Gold Edition" (colour), "Rose Gold Filled" / "Gold Plated" (treatment)
      // are not base materials - answer those as honest unknowns.
      if (/^(gold|silver|platinum)$/.test(w) && /^\s*(edition|filled|plated)/i.test(tl.slice(m2.index + m2[0].length, m2.index + m2[0].length + 10))) continue;
      push(m2.index, m2.index + m2[0].length);
    }
  }
  hits.sort((a, b) => a.start - b.start);
  return hits.slice(0, 2).map((h) => h.label);
}
const COLOR_WORDS = ["black", "white", "red", "blue", "green", "navy", "maroon", "gold",
  "silver", "beige", "grey", "gray", "pink", "brown", "olive", "ivory", "teal", "purple",
  "multi", "cream", "tan", "wine"];
const USAGE_WORDS = ["office", "home", "travel", "outdoor", "indoor", "gym", "kitchen",
  "bedroom", "bathroom", "work", "daily", "party", "college", "school"];
const KID_TITLE = /\b(kids?|children|child|toddler|baby|infant|boys?|girls?)\b/i;

function classifyProductQ(text) {
  const s = String(text || "").toLowerCase();
  // Spec slots first: "how much storage" is a spec question, not a price
  // question ("how much" alone is price).
  for (const [slot, rx] of Object.entries(SPEC_SLOTS)) if (rx.test(s)) return { kind: "spec", slot };
  // Age suitability before the generic "suitable/good for" occasion branch
  if (/\b(\d{1,2})\s*years?\s*old\b/.test(s) || /\bfor (a |an )?(kid|child|kids|baby)\b/.test(s)) {
    return { kind: "suitability", sub: "age" };
  }
  // Usage context before occasion ("good for office use")
  if (/\b(office|daily|travel|outdoor|work)\b/.test(s) &&
      /\b(good|suitab\w*|right|for|use)\b/.test(s)) return { kind: "suitability", sub: "usage" };
  if (/\b(price|cost|expensive|cheap|deal|value|worth the price|how much)\b/.test(s)) return { kind: "price" };
  if (/\b(gift|occasion|good (as|for)|suitab\w*|shaadi|wedding|birthday|anniversary|diwali|valentine|party|housewarming)\b/.test(s)) return { kind: "suitability", sub: "occasion" };
  if (/\b(good|quality|durable|trust\w*|reliable|worth|rating|review\w*|safe|last long|will (it|this) last|long lasting|lasts)\b/.test(s)) return { kind: "quality" };
  return { kind: "other" };
}

// "5 kg (10 kg)" titles (dumbbell pairs) carry both figures; reporting the
// exact title fragment keeps both grounded numbers in the reply.
// Pair-weight titles ("5 kg (10 kg)" dumbbells) answer the set weight -
// the larger figure - as a single grounded number.
function kgValue(t) {
  const dm = t.match(/(\d+(?:\.\d+)?)\s*kg\.?\s*\(\s*(\d+(?:\.\d+)?)\s*kg\.?\s*\)/i);
  if (dm) return Math.max(parseFloat(dm[1]), parseFloat(dm[2])) + " kg";
  const m = t.match(/(\d+(?:\.\d+)?)\s*kg\.?\b/i);
  return m ? m[1] + " kg" : null;
}

// Value of the requested spec slot, from parsed specs first then the title.
// Returns null when the slot is not in the listing (honest unknown).
function specValueFor(item, specs, slot) {
  const t = String(item.title || "");
  let m;
  switch (slot) {
    case "storage":
      // Pass 1: an explicit storage marker within a few words after the
      // figure ("256GB NVMe SSD", "256 GB Storage"). Pass 2: a bare "N GB"
      // that is not a RAM figure and not a CPU-adjacent figure ("i7 16GB"
      // means RAM, not storage).
      for (const m2 of t.matchAll(/(\d+(?:\.\d+)?)\s*(gb|tb)(?:\s+\w{0,8})?\s+(storage|ssd|hdd)\b/gi)) {
        if (m2[0].length < 20) return m2[1] + " " + m2[2].toUpperCase();
      }
      for (const m2 of t.matchAll(/(\d+(?:\.\d+)?)\s*(gb|tb)\b/gi)) {
        const after = t.slice(m2.index + m2[0].length, m2.index + m2[0].length + 12).toLowerCase();
        const before = t.slice(Math.max(0, m2.index - 16), m2.index).toLowerCase();
        if (/ram|ddr/.test(after)) continue;
        if (/\bi[3-9]\b|\bryzen\b|\bpentium\b|\bceleron\b/.test(before)) continue;
        return m2[1] + " " + m2[2].toUpperCase();
      }
      if (specs.storage) return specs.storage + " GB";
      return null;
    case "ram":
      if ((m = t.match(/(\d+(?:\.\d+)?)\s*gb\s*ram\b/i))) return m[1] + " GB RAM";
      if (specs.ram) return specs.ram + " GB RAM";
      return null;
    case "inch":
      if (specs.inches) return specs.inches + " inch";
      if ((m = t.match(/(\d{1,3}(?:\.\d+)?)\s*-?["']?\s*[iI]nch/))) return m[1] + " inch";
      return null;
    case "ton":
      if (specs.tonnage !== undefined) return specs.tonnage + " ton";
      if ((m = t.match(/(\d+(?:\.\d+)?)\s*ton\b/i))) return m[1] + " ton";
      return null;
    case "kg":
      return kgValue(t);
    case "litre":
      // "capacity" lands here: litres first, then a spaced "N L" (never the
      // glued steel grade "316L"), then kg / ml / g ("Royal Canin 1.2 kg").
      if (specs.volume) return specs.volume + " litre";
      if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:litre|liters|litres)\b/i))) return m[1] + " litre";
      for (const m2 of t.matchAll(/(\d+(?:\.\d+)?)\s+L\b/g)) {
        const n = parseFloat(m2[1]);
        if (n <= 500) return n + " L";
      }
      {
        const kv = kgValue(t);
        if (kv) return kv;
      }
      if ((m = t.match(/(\d{3,4})\s*ml\b/i))) return m[1] + " ml";
      if ((m = t.match(/(\d{2,4})\s*g\b/i))) return m[1] + " g";
      return null;
    case "watt": {
      const ws = [...t.matchAll(/(\d{2,5})\s*(w|watt|va)\b/gi)];
      if (ws.length === 1) return ws[0][1] + " " + ws[0][2].toUpperCase();
      if (ws.length > 1) {
        // Base and peak ("1500 W (1800 W)") - report both from the title.
        return ws[0][1] + " " + ws[0][2].toUpperCase() + " (up to " +
          ws[ws.length - 1][1] + " " + ws[ws.length - 1][2].toUpperCase() + ")";
      }
      if ((m = t.match(/SPF\s*(\d{1,3})/i))) return "SPF " + m[1];
      return null;
    }
    case "star":
      if (specs.stars) return specs.stars + " star";
      if ((m = t.match(/(\d)\s*stars?\b/i))) return m[1] + " star";
      return null;
    case "battery":
      if ((m = t.match(/(\d{3,5})\s*mah\b/i))) return m[1] + " mAh";
      return null;
    case "material": {
      const mat = materialPhrases(t);
      return mat.length ? mat.join(" and ") : null;
    }
    case "color":
      for (const w of COLOR_WORDS) if (new RegExp("\\b" + w, "i").test(t)) return w[0].toUpperCase() + w.slice(1);
      return null;
    case "size":
      if (specs.size) return "size " + specs.size.toUpperCase();
      if ((m = t.match(/\b(uk\s*\d{1,2}|size\s*(xxl|xl|l|m|s|xs))\b/i))) return m[1].toUpperCase();
      if ((m = t.match(/\b(xxxl|xxl|xl)\b/i))) return m[1].toUpperCase();
      return null;
    default:
      return null;
  }
}

const C = 30, M = 4.2;
function adjustedRating(rating, n) {
  return (C * M + (rating || 0) * (n || 0)) / (C + (n || 0));
}

// ---- main entry ----------------------------------------------------------
export async function handleTurn(state, input, ctx) {
  const t0 = Date.now();
  const catalog = ctx.catalog;
  const events = [];
  const ui_actions = [];
  let lang = state.lang || "en";
  let act = "deflect";
  let text = "";
  let mode = "template";
  let grounded = true;
  let components = [];
  let chips = [];
  let facts = { items: [], slots: state.slots };
  let meta = { intent: null, via: "rules", ms_nlu: 0, n_results: 0, intent_n: 0, grounded: true };

  const fail = (reason) => events.push({ type: "chat_fallback", payload: { reason } });

  const firstTurn = state.turns === 0;
  if (state.turns >= MAX_TURNS) {
    act = "apologize_fallback";
    text = T_(lang, "limit");
    return finish();
  }
  state.turns += 1;

  // 5C: prime the chat's result set from the page's current search so
  // "compare the top 3" / "why did you pick #1" work without a re-search.
  // Only SKUs are accepted; items are re-resolved against the catalog.
  if (!state.last && Array.isArray(ctx.context.skus) && ctx.context.skus.length) {
    const items = ctx.context.skus.map((k) => catalog.find((x) => x.sku === k)).filter(Boolean);
    if (items.length) {
      state.last = { all: items, parsed: parseQuery(ctx.context.query || ""), relaxed: false, intentN: items.length, shown: 3 };
      if (ctx.context.query) state.q = ctx.context.query;
    }
  }

  // ---- chips -------------------------------------------------------------
  if (input.type === "chip") {
    const r = await handleChip(state, input.chip_id, ctx, events, ui_actions);
    if (r) {
      act = r.act; text = r.text; components = r.components; chips = r.chips;
      meta.intent = "chip:" + String(input.chip_id).split(":")[0]; meta.via = "rules";
      meta.n_results = r.n || 0; meta.intent_n = r.intentN || 0;
      lang = state.lang;
      facts = r.facts || facts;
      const g = validateGrounding(text, facts, true);
      if (!g.ok) { text = r.fallbackText || T_(lang, "oos_unrecognized"); grounded = false; fail("grounding_fail"); }
      meta.grounded = grounded;
      return finish();
    }
    // unknown chip -> fall through to text handling with empty text
    input = { type: "text", text: "" };
  }

  // ---- NLU -----------------------------------------------------------------
  const tNlu = Date.now();
  // Mid-journey budget statements are answers even when the policy stopped
  // asking: a bare "1800" (or "not sure about budget") typed after a search
  // is a budget refinement, not a new query (golden g10/g56).
  if (!state.pending && state.last && (state.last.all || []).length) {
    const raw = String(input.text || "").trim();
    const budgetish = /^\d{1,6}\s*(k|l|lakh)?$/i.test(raw) ||
      (/(not sure|flexible|koi fikar nahi|pakka nahi)/i.test(raw) &&
       /budget|price|kimat|kitna/i.test(raw));
    if (budgetish) state.pending = { type: "budget" };
  }
  let nlu = classify(state, String(input.text || ""));
  // A typed "brand" answer must name a catalog brand; otherwise the text is
  // re-read as a normal message (a pending brand question must not swallow
  // "cheaper wala dikhao", "show more", "compare these", ...).
  if (nlu.kind === "answer" && nlu.answer && nlu.answer.kind === "brand") {
    const v = String(nlu.answer.value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    const known = ctx.brandSet && v.length >= 2 && (ctx.brandSet.has(v) ||
      ctx.brandList.some((b) => b.length >= 2 && (b.includes(v) || v.includes(b))));
    if (!known) nlu = classify({ ...state, pending: null }, String(input.text || ""));
  }
  meta.ms_nlu = Date.now() - tNlu;
  // PDP bare question: on the product detail page, a fresh "what is the X" /
  // "how Y" / "is it Z" question (no search state yet) is about THAT item,
  // even without a pronoun ("what is the battery capacity?").
  if (ctx.context && ctx.context.sku && !state.last && !state.q &&
      (nlu.intent === "search" || nlu.intent === "refine") &&
      /^(what is the|what are the|what (colour|color|is|does)|how (much|many|big|heavy|powerful|long|is|can)|is (it|this)|can (it|this)|does (it|this)|will (it|this))\b/i.test(String(input.text || ""))) {
    nlu = { ...nlu, intent: "ask_product", refs: { ordinal: null, pronoun: true, ordinals: [] } };
    meta.via = "rules";
  }
  if (nlu.via !== "llm" && ctx.llmEnabled && nlu.confidence < 0.8 && nlu.intent === "out_of_scope") {
    const llmRes = await llmPass(state, input.text, ctx);
    if (llmRes) nlu = llmRes;
  }
  meta.intent = nlu.intent; meta.via = nlu.via;
  meta.redacted = !!nlu.redacted;
  langSwitch(state, nlu.lang, firstTurn);
  lang = state.lang;
  events.push({ type: "chat_intent", payload: { intent: nlu.intent, via: nlu.via, confidence: nlu.confidence, ms_nlu: meta.ms_nlu } });

  if (nlu.intent === "out_of_scope") {
    act = "deflect";
    const key = { injection: "oos_injection", chitchat: "oos_chitchat", crisis: "oos_crisis",
                  to_long: "oos_to_long", control: "oos_control", world: "oos_domain", extdata: "oos_ext" }[nlu.kind] ||
               (String(nlu.kind || "").startsWith("out_of_domain") ? "oos_policy" : "oos_unrecognized");
    text = T_(lang, key);
    return finish();
  }

  switch (nlu.intent) {
    case "gift_help": {
      if (!state.q) state.q = String(nlu.query || input.text || "").trim().slice(0, 120) || "gift";
      const g = giftStep(state, nlu);
      if (g.step === "shortlist") {
        const picks = giftShortlist(catalog, state, g);
        state.last = { all: picks.slice(0, 24), parsed: parseQuery(state.q || ""), relaxed: false, intentN: picks.length, shown: 3 };
        components = picks.length
          ? [{ kind: "products", items: picks.slice(0, 3).map((r) => cardItem(r, giftReasons(g))) }]
          : [];
        chips = [{ id: "more", label: "More" }, { id: "cheaper", label: "Cheaper" }, { id: "different", label: "Different style" }];
        act = picks.length ? "show_results" : "not_found_with_substitutes";
        text = picks.length ? T_(lang, "gift_shortlist") : T_(lang, "not_found");
        if (!picks.length) events.push({ type: "demand_signal", payload: { query: state.q || "gift" } });
        facts.items = picks.slice(0, 3);
        if (picks.length) ui_actions.push(applySearch(state));
      } else {
        const qkey = g.step === "recipient" ? "gift_recipient" : g.step === "occasion" ? "gift_occasion" : "gift_budget";
        text = T_(lang, qkey);
        chips = giftChips(state, lang, g, ctx);
        chips.push({ id: "skip", label: "Skip", ghost: true });
        act = "ask_question";
        events.push({ type: "chat_question_shown", payload: { type: "gift:" + g.step, via: "chip" } });
      }
      return finish();
    }

    case "compare": {
      const skus = resolveCompare(state, ctx);
      if (skus.length >= 2) {
        act = "show_compare";
        text = T_(lang, "compare_done");
        const rows = skus.map((r) => ({
          sku: r.sku, title: r.title, brand: r.brand || "", price: r.price,
          rating: r.rating, num_ratings: r.num_ratings, category: r.category,
          specs: specSentence(specFromTitle(r.title), r.title) || "-",
        }));
        components = [{ kind: "compare", rows }];
        facts.items = rows;
      } else {
        act = "deflect";
        text = T_(lang, "compare_few", { n: skus.length });
        chips = [{ id: "more", label: "Show more" }];
      }
      return finish();
    }

    case "explain": {
      const reasons = [];
      const sl = state.slots;
      if (sl.budgetMax) reasons.push("Under ₹" + sl.budgetMax.toLocaleString("en-IN"));
      if (sl.occasion && sl.occasion !== "gift") reasons.push("occasion: " + sl.occasion);
      if (sl.brand) reasons.push("brand: " + sl.brand);
      if (sl.forWhom) reasons.push("for " + sl.forWhom);
      if (sl.size) reasons.push("size " + sl.size.toUpperCase());
      if (sl.recipient) reasons.push("for " + sl.recipient);
      act = "explain";
      text = reasons.length ? T_(lang, "explain", { reasons: reasons.join(" · ") })
        : T_(lang, "explain_none", { q: state.q || "" });
      return finish();
    }

    case "faq": {
      const hit = faqMatch(input.text);
      if (hit) {
        act = "faq_answer";
        text = hit.text;
        facts.brands = [];
      } else {
        act = "faq_unknown";
        text = T_(lang, "faq_unknown");
        chips = [
          { id: "faq:ranking", label: "How results are ranked" },
          { id: "faq:delivery", label: "Delivery (demo)" },
          { id: "faq:returns", label: "Returns (demo)" },
        ];
      }
      return finish();
    }

    case "cart_help": {
      // 5C agentic actions: every sku resolves against state.last (the
      // current catalogue results) - actions may only reference SKUs from
      // the catalogue. buy_now adds first, then opens checkout for that
      // item only (the order still needs an explicit "Place order").
      const needsSku = ["add", "buy", "save", "remove", "open_product"].includes(nlu.kind);
      const sku = needsSku ? resolveCartSku(state, ctx, nlu.refs) : null;
      if (needsSku && !sku) {
        act = "ask_question";
        text = T_(lang, "ask_which");
        chips = whichChips(state);
        return finish();
      }
      const setItemFacts = (sk) => {
        const item = catalog.find((x) => x.sku === sk);
        if (item) facts = { items: [item], skus: [sk], slots: state.slots };
      };
      if (nlu.kind === "add" && sku) {
        act = "confirm_ui_action";
        text = T_(lang, "cart_added");
        ui_actions.push({ action: "add_to_cart", sku });
        chips = [{ id: "cart:open", label: "Open cart" }, { id: "cart:keep", label: "Keep shopping" }];
        setItemFacts(sku);
      } else if (nlu.kind === "buy" && sku) {
        act = "confirm_ui_action";
        text = T_(lang, "buy_now");
        ui_actions.push({ action: "add_to_cart", sku }, { action: "buy_now", sku });
        chips = [{ id: "cart:open", label: "Open cart" }, { id: "cart:keep", label: "Keep shopping" }];
        setItemFacts(sku);
      } else if (nlu.kind === "save" && sku) {
        act = "confirm_ui_action";
        text = T_(lang, "saved_wish");
        ui_actions.push({ action: "add_to_wishlist", sku });
        setItemFacts(sku);
        chips = [{ id: "cart:open", label: "Open cart" }, { id: "cart:keep", label: "Keep shopping" }];
      } else if (nlu.kind === "remove" && sku) {
        act = "confirm_ui_action";
        text = T_(lang, "removed_cart");
        ui_actions.push({ action: "remove_from_cart", sku });
        setItemFacts(sku);
        chips = [{ id: "cart:open", label: "Open cart" }, { id: "cart:keep", label: "Keep shopping" }];
      } else if (nlu.kind === "open_product" && sku) {
        act = "confirm_ui_action";
        text = T_(lang, "open_product");
        ui_actions.push({ action: "open_product", sku });
        setItemFacts(sku);
        chips = [{ id: "cart:add:" + sku, label: "Add this to cart" }];
      } else {
        act = "confirm_ui_action";
        text = T_(lang, "cart_deflect");
        ui_actions.push({ action: "open_cart" });
      }
      return finish();
    }

    case "ask_product": {
      const item = resolveProduct(state, ctx, nlu.refs);
      if (!item) {
        act = "ask_question";
        text = T_(lang, "ask_which");
        chips = whichChips(state);
        return finish();
      }
      const kind = classifyProductQ(input.text);
      const specs = specFromTitle(item.title);
      facts = { item, skus: [item.sku], slots: state.slots };
      // Raw category, not the display name: the listing (and the PDP) shows
      // the raw value, and that is the grounded form.
      const knownLine = [item.brand && "brand " + item.brand, item.category,
        "₹" + item.price.toLocaleString("en-IN"), "rated " + item.rating + "/5"]
        .filter(Boolean).join(", ");
      if (kind.kind === "spec") {
        // Answer ONLY the slot that was asked. A storage question must not
        // be answered with the RAM figure; a missing slot is an honest
        // unknown, never a rating dodge.
        const v = specValueFor(item, specs, kind.slot);
        if (v) {
          act = "answer_product";
          if (kind.slot === "material") {
            text = T_(lang, "p_material", { spec: v });
          } else if (kind.slot === "watt" && /^SPF/.test(v)) {
            // Sunscreen: address "how powerful" directly instead of asserting
            // the SPF figure as a power answer.
            text = T_(lang, "p_spf", { spec: v });
          } else {
            text = T_(lang, "p_spec", { title: item.brand ? item.brand : "This one", spec: v });
          }
        } else {
          act = "answer_unknown";
          text = T_(lang, "p_unknown", { known: knownLine });
        }
      } else if (kind.kind === "price") {
        // The listing carries no category price band, so comparing to a
        // median would be an invented number. State the price honestly.
        act = "answer_unknown";
        text = T_(lang, "p_price", { price: item.price.toLocaleString("en-IN"), cat: item.category });
      } else if (kind.kind === "suitability") {
        const tags = (item.tags || []).filter((t) => ["wedding", "birthday", "anniversary", "gift", "diwali", "party", "valentines", "christmas", "graduation", "baby-shower", "housewarming"].includes(t));
        if (kind.sub === "age") {
          const kidHit = KID_TITLE.test(item.title) ? item.title.match(KID_TITLE)[0] : null;
          if (kidHit) {
            act = "answer_product";
            text = T_(lang, "p_kid", { who: kidHit });
          } else {
            act = "answer_unknown";
            text = T_(lang, "p_no_age", { known: knownLine });
          }
        } else if (kind.sub === "usage") {
          const uHit = USAGE_WORDS.find((u) => new RegExp("\\b" + u + "\\b", "i").test(item.title)) || null;
          if (uHit) {
            act = "answer_product";
            text = T_(lang, "p_usage", { use: uHit });
          } else {
            act = "answer_unknown";
            text = T_(lang, "p_no_usage", { known: knownLine });
          }
        } else {
          // An asked occasion that is NOT tagged must be answered directly
          // ("Is this good as a Diwali gift?" -> "Not tagged for Diwali here").
          const asked = (String(input.text || "").match(/\b(diwali|wedding|shaadi|birthday|anniversary|housewarming|valentines?|party|christmas|graduation|baby[- ]shower)\b/i) || [])[1];
          const askedNorm = asked ? asked.toLowerCase().replace("valentine", "valentines").replace("shaadi", "wedding").replace("baby shower", "baby-shower") : null;
          const extra = [];
          if (state.slots.forWhom) extra.push("for " + state.slots.forWhom);
          const shown = [...tags, ...extra].slice(0, 3);
          // A negative tag claim needs grounded tags to lean on; with no tags
          // at all, "can't confirm the fit" is the honest, grounded answer.
          if (askedNorm && !tags.includes(askedNorm) && tags.length) {
            act = "answer_product";
            text = T_(lang, "p_occ_miss", { occ: asked, tags: tags.slice(0, 3).join(", ") });
          } else if (shown.length) {
            act = "answer_product";
            text = T_(lang, "p_suit", { tags: shown.join(", ") });
          } else {
            act = "answer_unknown";
            text = T_(lang, "p_no_suit");
          }
        }
      } else {
        // quality (and default): never opine; the rating is a proxy and is
        // said to be one. Use the raw listing rating (a rounded adjusted
        // figure would be a number not in the listing).
        act = "answer_product";
        text = T_(lang, "p_quality", { rating: item.rating, n: (item.num_ratings || 0).toLocaleString("en-IN") });
      }
      chips = [{ id: "cart:add:" + item.sku, label: "Add this to cart" }, { id: "cart:buy:" + item.sku, label: "Buy this now" }, { id: "explain", label: "Why this matched" }];
      return finish();
    }

    default: {
      // search / refine
      const r = await productTurn(state, nlu, ctx, events, ui_actions);
      act = r.act; text = r.text; components = r.components; chips = r.chips;
      meta.n_results = r.n; meta.intent_n = r.intentN;
      facts = r.facts || facts;
      break;
    }
  }

  // composer (off by default) - re-grounded before use
  if (ctx.llmEnabled && input.type === "text" && text) {
    const ph = await phraseSafe(text, lang, facts, ctx);
    if (ph.mode === "llm") { text = ph.text; mode = "llm"; }
    else if (ph.why) fail(ph.why);
  }

  const g = validateGrounding(text, facts, mode === "template");
  if (!g.ok) {
    grounded = false;
    fail("grounding_fail");
    text = T_(lang, "oos_unrecognized");
  }
  meta.grounded = grounded;
  return finish();

  // ---- local helpers closing over the turn locals -------------------------
  function finish() {
    const ms = Date.now() - t0;
    events.push({ type: "chat_response", payload: { act, mode, ms_total: ms, grounded, tokens_in: 0, tokens_out: text.split(/\s+/).length } });
    return {
      reply: { act, text, mode, components, chips, ui_actions },
      state, events, meta,
    };
  }
}

// ---- search / refine turn -------------------------------------------------
async function productTurn(state, nlu, ctx, events, ui_actions) {
  const catalog = ctx.catalog;
  const lang = state.lang;
  let query = null;
  let slots = state.slots;
  const isRefine = nlu.intent === "refine";

  if (isRefine) {
    // answer to a pending question (typed)
    if (nlu.kind === "answer" && nlu.answer) {
      applyAnswer(state, nlu.answer);
      query = state.q;
    } else if (nlu.kind === "show_more") {
      return showMore(state, events);
    } else if (nlu.kind === "ordinal_pick") {
      const i = nlu.refs.ordinal || 1;
      const last = state.last;
      const item = last && last.all && last.all[i - 1];
      if (item) {
        events.push({ type: "chat_card_click", payload: { sku: item.sku, position: i } });
        return {
          act: "show_results", text: T_(lang, "show_more").replace("a few more", "the one you pointed at"),
          components: [{ kind: "products", items: [cardItem(item, tagReasons(item))] }],
          chips: [{ id: "cart:add:" + item.sku, label: "Add this to cart" }, { id: "cart:buy:" + item.sku, label: "Buy this now" }, { id: "more", label: "More" }],
          n: 1, intentN: 1, facts: { items: [item], skus: [item.sku], slots: state.slots },
        };
      }
      return { act: "deflect", text: T_(lang, "ask_which"), components: [], chips: whichChips(state), n: 0, intentN: 0, facts: {} };
    } else if (nlu.kind === "budget_lower" || nlu.kind === "budget_raise") {
      query = state.q;
      const cur = state.slots.budgetMax;
      if (nlu.kind === "budget_lower") {
        if (cur) state.slots = { ...state.slots, budgetMax: Math.max(250, Math.round(cur * 0.7 / 50) * 50) };
        else state.slots = { ...state.slots, budgetMax: nlu.slots_delta.budgetMax || 2000 };
      } else {
        state.slots = { ...state.slots, budgetMax: cur ? Math.round(cur * 1.5 / 500) * 500 : 10000 };
      }
      events.push({ type: "chat_apply_to_results", payload: { query: state.q, slots_changed: 1 } });
    } else if (nlu.kind === "different") {
      return showMore(state, events);
    } else if (nlu.kind === "narrow") {
      query = state.q;
    } else if (nlu.productTokens && (!state.q || !state.last)) {
      // "sasta phone" with no prior search: treat as a fresh search
      nlu = { ...nlu, intent: "search", kind: "new", query: nlu.query || state.q };
    } else {
      query = state.q;
    }
    if (!query) return { act: "deflect", text: T_(lang, "oos_unrecognized"), components: [], chips: [], n: 0, intentN: 0, facts: {} };
  } else {
    // fresh search (or a chip/answer re-run that keeps the current slots)
    if (nlu.keepSlots) {
      query = state.q;
      if (!query) return { act: "deflect", text: T_(lang, "oos_unrecognized"), components: [], chips: [], n: 0, intentN: 0, facts: {} };
    } else {
      query = nlu.query || String(nlu.productTokens || []).join(" ") || null;
      if (!query || !query.trim()) return { act: "deflect", text: T_(lang, "oos_unrecognized"), components: [], chips: [], n: 0, intentN: 0, facts: {} };
      const fresh = { ...state.slots, budgetMax: null, budgetMin: null, occasion: null, brand: null,
                      category: null, forWhom: null, size: null, capacity: null, recipient: null };
      Object.assign(fresh, nlu.slots_delta || {});
      state.slots = fresh;
      state.q = query;
      state.asked = [];
      state.pending = null;
    }
  }

  let res = runSearch(catalog, query, state.slots, { relax: false });
  let relaxed = false;
  let intentN = res.filter((r) => r.intent).length;
  if (intentN < 2) {
    const rel = runSearch(catalog, query, state.slots, { relax: true });
    const relN = rel.filter((r) => r.intent).length;
    if (relN >= 2 || relN > intentN) { res = rel; intentN = relN; relaxed = true; }
  }
  // Semantic parity with the page search: "latest iphone" is lexically one
  // intent hit ("iPhone Adapter") but semantically the whole iPhone family.
  // The page's /api/search runs this same fill (semantic.js) when lexical
  // returns <2 on-intent — the chat used to dead-end where the page found
  // the product (2026-11-08 report).
  if (intentN < 2 && process.env.SEMANTIC_FALLBACK !== "0") {
    const fill = await semanticFill(catalog, parseQuery(query), query, res, {
      budgetMax: state.slots.budgetMax != null ? state.slots.budgetMax : null,
      brand: state.slots.brand || null, forWhom: state.slots.forWhom || null,
      category: state.slots.category || null, size: state.slots.size || null,
      capacity: state.slots.capacity || null, limit: 48,
    });
    if (fill.used) {
      res = fill.results;
      intentN = recomputeIntentN(res);
      if (!relaxed) relaxed = true; // semantic picks are labelled relaxed too
    }
  }

  // rollback guard: a refine that halves the match keeps the previous picks
  const prevN = state.last ? state.last.intentN : 0;
  if (isRefine && prevN >= 2 && intentN < prevN * 0.5) {
    events.push({ type: "chat_fallback", payload: { reason: "rollback_guard" } });
    const prev = state.last.all.slice(0, 3).map((r) => cardItem(r, tagReasons(r)));
    return {
      act: "rollback", text: T_(lang, "rollback"),
      components: [{ kind: "products", items: prev }],
      chips: [{ id: "more", label: "More" }, { id: "cheaper", label: "Cheaper" }],
      n: prevN, intentN: prevN, facts: { items: prev, slots: state.slots },
    };
  }

  state.last = { all: dedupeFamilies(res), parsed: parseQuery(query), relaxed, intentN, shown: 3 };
  ui_actions.push(applySearch(state, query));

  if (intentN < 2) {
    // rescue question (same policy engine as the page)
    if (state.asked.length < MAX_QUESTIONS) {
      const d = await decideGuide(catalog, query, intentN, { turn: state.asked.length + 2, prevTypes: state.asked, lang });
      if (d.ask) {
        state.asked.push(d.type);
        state.pending = { type: d.type };
        return {
          act: "ask_question", text: T_(lang, QUESTION_KEY[d.type] || "ask_category"),
          components: [{ kind: "notice", text: T_(lang, "not_found") }],
          chips: guideChips(d, lang), n: intentN, intentN,
          facts: { items: [], slots: state.slots },
          question: d.type,
        };
      }
    }
    events.push({ type: "demand_signal", payload: { query } });
    const d2 = await decideGuide(catalog, query, intentN, { turn: state.asked.length + 2, prevTypes: state.asked, lang });
    const suggest = d2.stats && d2.stats.topCategory ? displayCatShort(d2.stats.topCategory) : null;
    // Honest not-found: closest lexical picks (when any) + the nearest
    // section. A category name is a section, not a "broader word" — the old
    // phrasing told shoppers to search "cell phones & accessories" as a
    // word (2026-11-08 report: "latest iphone" dead-end).
    const closest = (state.last.all || []).slice(0, 3);
    return {
      act: "not_found_with_substitutes",
      text: suggest ? T_(lang, "not_found_alt", { suggest }) : T_(lang, "not_found"),
      components: closest.length ? [{ kind: "products", items: closest.map((r) => cardItem(r, tagReasons(r))) }] : [],
      chips: [{ id: "more", label: "Show a broader search", ghost: true }],
      n: intentN, intentN, facts: { items: closest, slots: state.slots },
    };
  }

  // results + optional refinement question (policy decides; max 3 total)
  const top = state.last.all.slice(0, 3);
  const out = {
    act: "show_results",
    text: relaxed ? T_(lang, "results_relax", { n: res.length }) : T_(lang, "results", { n: res.length, q: query }),
    components: [{ kind: "products", items: top.map((r) => cardItem(r, tagReasons(r))) }],
    chips: [], n: res.length, intentN,
    facts: { items: top, skus: top.map((r) => r.sku), slots: state.slots, n: res.length },
  };
  if (state.asked.length < MAX_QUESTIONS) {
    const d = await decideGuide(catalog, query, intentN, { turn: state.asked.length + 2, prevTypes: state.asked, lang });
    if (d.ask) {
      out.question = d.type;
      out.chips = guideChips(d, lang);
      out.components.push({ kind: "question", text: T_(lang, QUESTION_KEY[d.type] || "ask_category"), type: d.type });
      // offered, not yet asked (counted on answer/skip); typed text is first
      // parsed as an answer to this pending question
      state.pending = { type: d.type };
    }
  }
  return out;
}

const OPTION_TR = {
  en: (o) => o,
  hinglish: (o) => ({ "Not sure / flexible": "Pakka nahi / flexible", "No preference - best rated": "Koi nahi - best rated" }[o]
    || (String(o).startsWith("Under") ? "Under " + o.slice(6) : o)),
  hi: (o) => ({ "Not sure / flexible": "पक्का नहीं / फ़्लेक्सिबल", "No preference - best rated": "कोई नहीं - बेस्ट-रेटेड" }[o]
    || (String(o).startsWith("Under") ? "Under " + o.slice(6) : o)),
};
function guideChips(d, lang = "en") {
  const tr = OPTION_TR[lang] || ((o) => o);
  const chips = d.options.map((o, i) => {
    const count = (d.optionCounts && d.optionCounts[i] ? d.optionCounts[i].count : null);
    let id;
    if (d.type === "budget") {
      const m = String(o).match(/Under (₹[\d,]+)/) || String(o).match(/(₹[\d,]+)\s*–/);
      id = "budget:" + (m ? parseInt(String(m[1]).replace(/[₹,]/g, ""), 10) : 0);
    } else if (d.type === "occasion") id = "occ:" + String(o).toLowerCase().replace(/[^a-z0-9]+/g, "");
    else if (d.type === "brand") id = o.startsWith("No preference") ? "brand:best" : "brand:" + String(o).toLowerCase().replace(/\s+/g, "");
    else if (d.type === "category") id = "cat:" + String(o).toLowerCase().replace(/\s+/g, "");
    else if (d.type === "for_whom") id = "forwhom:" + String(o).toLowerCase();
    else if (d.type === "size") id = "size:" + String(o).toLowerCase();
    else if (d.type === "capacity") id = "cap:" + String(o).toLowerCase().replace(/\s+/g, "");
    else id = d.type + ":" + i;
    return { id, label: tr(o), count };
  });
  chips.push({ id: "skip", label: "Skip", ghost: true });
  return chips;
}

const FLAT_OCC = { "weddingshaadi": "wedding", "wedding": "wedding", "birthday": "birthday",
  "anniversary": "anniversary", "diwali": "diwali", "dhanteras": "diwali", "bhaidooj": "diwali",
  "bhai dooj": "diwali", "housewarming": "housewarming", "christmas": "christmas",
  "party": "party", "graduation": "graduation", "valentines": "valentines",
  "everydayuse": null, "everyday use": null };
const OCC_TAGS = ["wedding", "birthday", "anniversary", "diwali", "christmas", "party",
  "gift", "graduation", "valentines", "baby-shower", "housewarming"];
function applyAnswer(state, a) {
  const type = state.pending ? state.pending.type : null;
  state.pending = null;
  if (!a || a.kind === "skip") {
    if (type) state.asked.push(type + ":skip");
    return;
  }
  if (!type) return;
  const sl = state.slots;
  if (a.kind === "budget") { sl.budgetMax = a.value; state.asked.push("budget"); }
  else if (a.kind === "budget_flexible") { sl.budgetMax = null; state.asked.push("budget"); }
  else if (a.kind === "occasion") { sl.occasion = FLAT_OCC[a.value] !== undefined ? FLAT_OCC[a.value] : (OCC_TAGS.includes(a.value) ? a.value : null); state.asked.push("occasion"); }
  else if (a.kind === "occasion_none") { state.asked.push("occasion"); }
  else if (a.kind === "brand") { sl.brand = a.value; state.asked.push("brand"); }
  else if (a.kind === "brand_any") { sl.brand = "best_rated"; state.asked.push("brand"); }
  else if (a.kind === "category") { sl.category = a.value; state.asked.push("category"); }
  else if (a.kind === "category_any") { state.asked.push("category"); }
  else if (a.kind === "for_whom") { sl.forWhom = a.value; state.asked.push("for_whom"); }
  else if (a.kind === "size") { sl.size = a.value; state.asked.push("size"); }
  else if (a.kind === "capacity") { sl.capacity = a.value; state.asked.push("capacity"); }
}

function applySearch(state, query) {
  const sl = state.slots;
  const labelBits = [];
  if (sl.budgetMax) labelBits.push("Budget ≤ ₹" + sl.budgetMax.toLocaleString("en-IN"));
  if (sl.occasion && sl.occasion !== "gift") labelBits.push("Occasion: " + cap(sl.occasion));
  if (sl.forWhom) labelBits.push("For " + cap(sl.forWhom));
  if (sl.brand && sl.brand !== "best_rated") labelBits.push("Brand: " + sl.brand);
  if (sl.size) labelBits.push("Size " + sl.size.toUpperCase());
  return {
    action: "apply_search", query: query || state.q,
    opts: {
      budget: sl.budgetMax || null, occasion: sl.occasion || null,
      category: sl.category || null, brand: sl.brand === "best_rated" ? null : sl.brand,
      forWhom: sl.forWhom || null, size: sl.size || null, capacity: sl.capacity || null,
      relax: state.last ? !!state.last.relaxed : false,
    },
    trailLabel: labelBits.join(" · ") || null,
    echo: null,
  };
}

async function handleChip(state, chipId, ctx, events, ui_actions) {
  const lang = state.lang;
  const [head, ...rest] = String(chipId || "").split(":");
  const val = rest.join(":");
  const catalog = ctx.catalog;

  if (head === "skip") {
    const type = state.pending ? state.pending.type : null;
    if (type) state.asked.push(type + ":skip");
    state.pending = null;
    events.push({ type: "chat_question_answered", payload: { type: type || "unknown", via: "skip" } });
    if (state.q && state.last) {
      // re-search with the same slots (question skipped)
      const r = await productTurn(state, { intent: "search", kind: "keep", query: state.q, slots_delta: {}, productTokens: [], keepSlots: true }, ctx, events, ui_actions);
      return { ...r, text: T_(lang, "skip"), act: r.act === "ask_question" ? "show_results" : r.act };
    }
    return { act: "deflect", text: T_(lang, "skip"), components: [], chips: [], n: 0, intentN: 0, facts: {} };
  }
  if (head === "more" || head === "cheaper" || head === "different") {
    if (head === "cheaper") state.slots = { ...state.slots, budgetMax: state.slots.budgetMax ? Math.round(state.slots.budgetMax * 0.7 / 50) * 50 : 2000 };
    if (head === "more" && state.last) return showMore(state, events);
    const r = await productTurn(state, { intent: "search", kind: "keep", query: state.q, slots_delta: {}, productTokens: [], keepSlots: true }, ctx, events, ui_actions);
    return r;
  }
  if (head === "cart") {
    if (val === "open") return { act: "confirm_ui_action", text: T_(lang, "cart_opened"), components: [], chips: [], n: 0, intentN: 0, ui_open: true, facts: {} };
    return null; // "keep shopping" -> no reply
  }
  if (head === "cart" && val.startsWith("buy:")) {
    const sku = val.slice(4);
    const item = catalog.find((x) => x.sku === sku);
    if (item) {
      ui_actions.push({ action: "add_to_cart", sku }, { action: "buy_now", sku });
      return { act: "confirm_ui_action", text: T_(lang, "buy_now"), components: [],
               chips: [{ id: "cart:open", label: "Open cart" }, { id: "cart:keep", label: "Keep shopping" }],
               n: 0, intentN: 0, facts: { items: [item], skus: [sku], slots: state.slots } };
    }
  }
  if (head === "cart_add" || (head === "cart" && val.startsWith("add:"))) {
    const sku = val.startsWith("add:") ? val.slice(4) : val;
    const item = catalog.find((x) => x.sku === sku);
    if (item) {
      ui_actions.push({ action: "add_to_cart", sku });
      return { act: "confirm_ui_action", text: T_(lang, "cart_added"), components: [],
               chips: [{ id: "cart:open", label: "Open cart" }, { id: "cart:keep", label: "Keep shopping" }],
               n: 0, intentN: 0, facts: { items: [item], skus: [sku], slots: state.slots } };
    }
  }
  if (head === "explain") {
    const reasons = [];
    const sl = state.slots;
    if (sl.budgetMax) reasons.push("Under ₹" + sl.budgetMax.toLocaleString("en-IN"));
    if (sl.occasion && sl.occasion !== "gift") reasons.push("occasion: " + sl.occasion);
    if (sl.brand) reasons.push("brand: " + sl.brand);
    if (sl.forWhom) reasons.push("for " + sl.forWhom);
    const text = reasons.length ? T_(lang, "explain", { reasons: reasons.join(" · ") }) : T_(lang, "explain_none", { q: state.q || "" });
    return { act: "explain", text, components: [], chips: [], n: 0, intentN: 0, facts: {} };
  }
  if (head === "faq") {
    const map = { ranking: "how do you rank results", delivery: "when will my order arrive", returns: "what is the return policy" };
    const hit = faqMatch(map[val] || val);
    if (hit) return { act: "faq_answer", text: hit.text, components: [], chips: [], n: 0, intentN: 0, facts: {} };
    return { act: "faq_unknown", text: T_(lang, "faq_unknown"), components: [], chips: [], n: 0, intentN: 0, facts: {} };
  }
  if (head === "which") {
    const i = parseInt(val, 10);
    const item = state.last && state.last.all && state.last.all[i];
    if (item) {
      return {
        act: "show_results", text: T_(lang, "show_more").replace("a few more", "the one you picked"),
        components: [{ kind: "products", items: [cardItem(item, tagReasons(item))] }],
        chips: [{ id: "cart:add:" + item.sku, label: "Add this to cart" }, { id: "explain", label: "Why this matched" }],
        n: 1, intentN: 1, facts: { items: [item], skus: [item.sku], slots: state.slots },
      };
    }
    return null;
  }
  if (head === "giftrec") {
    const g = state.gift || (state.gift = { step: "recipient", recipient: null, occasion: null, budget: null });
    const rel = { mother: "mother", father: "father", sister: "sister", brother: "brother", child: "child",
                  spouse: "spouse", friend: "friend", colleague: "colleague" }[val] || val;
    g.recipient = rel;
    state.slots.recipient = rel;
    const next = g.recipient ? (g.occasion ? "budget" : "occasion") : "recipient";
    g.step = next;
    const qkey = g.step === "occasion" ? "gift_occasion" : "gift_budget";
    events.push({ type: "chat_question_shown", payload: { type: "gift:" + g.step, via: "chip" } });
    const chips = giftChips(state, lang, g, ctx);
    chips.push({ id: "skip", label: "Skip", ghost: true });
    return { act: "ask_question", text: T_(lang, qkey), components: [], chips, n: 0, intentN: 0, facts: {} };
  }
  if (head === "giftocc") {
    const g = state.gift;
    const label = String(val);
    g.occasion = cap(label);
    const tag = ({ "diwali": "diwali", "dhanteras": "diwali", "bhai dooj": "diwali", "wedding": "wedding",
      "wedding / shaadi": "wedding", "birthday": "birthday", "anniversary": "anniversary",
      "housewarming": "housewarming", "christmas": "christmas", "everyday use": null }[label.toLowerCase()]);
    state.slots.occasion = tag;
    g.occasionTag = tag;
    g.step = "budget";
    events.push({ type: "chat_question_shown", payload: { type: "gift:budget", via: "chip" } });
    const chips = giftChips(state, lang, g, ctx);
    chips.push({ id: "skip", label: "Skip", ghost: true });
    return { act: "ask_question", text: T_(lang, "gift_budget"), components: [], chips, n: 0, intentN: 0, facts: {} };
  }
  if (head === "giftbud") {
    const g = state.gift;
    const v = parseInt(val, 10) || 0;
    g.budget = v || null;
    g.budgetDone = true;
    if (v) state.slots.budgetMax = v;
    g.step = "shortlist";
    const r = productTurnGiftShortlist(state, g, ctx, events, ui_actions);
    return r;
  }
  // guide answer chips: budget / occ / brand / cat / forwhom / size / cap
  const ans = {
    budget: { kind: "budget", value: parseInt(val, 10) || null },
    occ: { kind: "occasion", value: val || null },
    brand: { kind: val === "best" ? "brand_any" : "brand", value: val || null },
    cat: { kind: "category", value: val || null },
    forwhom: { kind: "for_whom", value: val || null },
    size: { kind: "size", value: val || null },
    cap: { kind: "capacity", value: val || null },
  }[head];
  if (!ans) return null;
  if (ans.kind === "brand" && !val) return null;
  const type = head === "budget" ? "budget" : head === "occ" ? "occasion" : head === "brand" ? "brand"
    : head === "cat" ? "category" : head === "forwhom" ? "for_whom" : head === "size" ? "size" : "capacity";
  state.pending = { type };
  applyAnswer(state, ans);
  events.push({ type: "chat_question_answered", payload: { type, via: "chip" } });
  events.push({ type: "chat_apply_to_results", payload: { query: state.q, slots_changed: 1 } });
  if (!state.q) return { act: "deflect", text: T_(lang, "oos_unrecognized"), components: [], chips: [], n: 0, intentN: 0, facts: {} };
  const r = await productTurn(state, { intent: "search", kind: "keep", query: state.q, slots_delta: {}, productTokens: [], keepSlots: true }, ctx, events, ui_actions);
  const echo = echoLine(state, r);
  if (echo) r.components.unshift({ kind: "notice", text: echo });
  return r;
}

function echoLine(state, r) {
  const sl = state.slots;
  let label = null;
  if (state.asked[state.asked.length - 1] === "budget" && sl.budgetMax) label = "Budget up to ₹" + sl.budgetMax.toLocaleString("en-IN");
  else if (state.asked[state.asked.length - 1] === "occasion" && sl.occasion) label = "Occasion: " + cap(sl.occasion);
  else if (state.asked[state.asked.length - 1] === "brand" && sl.brand) label = "Brand: " + sl.brand;
  else if (state.asked[state.asked.length - 1] === "category" && sl.category) label = "Category: " + sl.category;
  else if (String(state.asked[state.asked.length - 1] || "").startsWith("budget:skip") || String(state.asked[state.asked.length - 1] || "").endsWith(":skip")) return null;
  if (!label) return null;
  return label + " · " + r.n + " left.";
}

function showMore(state, events) {
  const lang = state.lang;
  const last = state.last;
  if (!last || !last.all) return { act: "deflect", text: T_(lang, "oos_unrecognized"), components: [], chips: [], n: 0, intentN: 0, facts: {} };
  const from = last.shown || 0;
  const next = last.all.slice(from, from + 3);
  if (!next.length) return { act: "deflect", text: T_(lang, "show_more_end"), components: [], chips: [], n: 0, intentN: 0, facts: {} };
  last.shown = from + 3;
  return {
    act: "show_more", text: T_(lang, "show_more"),
    components: [{ kind: "products", items: next.map((r) => cardItem(r, tagReasons(r))) }],
    chips: [{ id: "more", label: "More" }], n: last.all.length, intentN: last.intentN,
    facts: { items: next, slots: state.slots, n: last.all.length },
  };
}

function resolveProduct(state, ctx, refs) {
  // PDP anchor: on the product detail page a question without any reference
  // ("what is the battery capacity?") is about THAT product.
  const pdpSku = ctx.context && ctx.context.sku;
  if (pdpSku) return ctx.catalog.find((x) => x.sku === pdpSku) || null;
  if (state.last && state.last.all) {
    const ord = refs && refs.ordinal;
    if (ord && state.last.all[ord - 1]) return state.last.all[ord - 1];
  }
  return null;
}
function resolveCartSku(state, ctx, refs) {
  if (ctx.context && ctx.context.sku) return ctx.context.sku;
  if (state.last && state.last.all && state.last.all.length) {
    const ord = refs && refs.ordinal;
    if (ord && state.last.all[ord - 1]) return state.last.all[ord - 1].sku;
  }
  return null;
}
function resolveCompare(state, ctx) {
  const pool = state.last ? state.last.all : [];
  // Chat sync: with no ordinal/pronoun reference, "compare the top 3"
  // compares the shopper's LIVE visible list (page context skus), even when
  // a stale state.last from a previous session/search still exists.
  const pageItems = Array.isArray(ctx.context && ctx.context.skus) && ctx.context.skus.length
    ? ctx.context.skus.map((k) => ctx.catalog.find((x) => x.sku === k)).filter(Boolean)
    : null;
  const text = String(ctx.context && ctx.context.lastText || "");
  const idx = new Set();
  for (const w of text.match(/\b(first|second|third|1st|2nd|3rd)\b/gi) || []) {
    const i = ORDS[w.toLowerCase()];
    if (i && pool[i - 1]) idx.add(i - 1);
  }
  if (ctx.context && ctx.context.sku) {
    const i = pool.findIndex((x) => x.sku === ctx.context.sku);
    if (i >= 0) idx.add(i);
  }
  let out = [...idx].slice(0, 3).map((i) => pool[i]).filter(Boolean);
  if (!out.length) out = (pageItems && pageItems.length ? pageItems : pool).slice(0, 3);
  return out;
}
function whichChips(state) {
  const last = state.last;
  if (!last || !last.all || !last.all.length) return [{ id: "more", label: "Search something first" }];
  return last.all.slice(0, 3).map((r, i) => ({ id: "which:" + i, label: String(r.title).slice(0, 40) }));
}
function productTurnGiftShortlist(state, g, ctx, events, ui_actions) {
  const catalog = ctx.catalog;
  const picks = giftShortlist(catalog, state, g);
  state.last = { all: picks.slice(0, 24), parsed: parseQuery(state.q || "gift"), relaxed: false, intentN: picks.length, shown: 3 };
  const top = picks.slice(0, 3);
  if (!picks.length) {
    events.push({ type: "demand_signal", payload: { query: state.q || "gift" } });
    return { act: "not_found_with_substitutes", text: T_(state.lang, "not_found"), components: [], chips: [], n: 0, intentN: 0, facts: {} };
  }
  ui_actions.push(applySearch(state, state.q || "gift"));
  return {
    act: "show_results", text: T_(state.lang, "gift_shortlist"),
    components: [{ kind: "products", items: top.map((r) => cardItem(r, giftReasons(g))) }],
    chips: [{ id: "more", label: "More" }, { id: "cheaper", label: "Cheaper" }, { id: "different", label: "Different style" }],
    n: picks.length, intentN: picks.length,
    facts: { items: top, skus: top.map((r) => r.sku), slots: state.slots },
  };
}
function giftReasons(g) {
  const out = [];
  if (g.recipient) out.push("For " + cap(g.recipient));
  if (g.occasion) out.push(cap(g.occasion) + " gift");
  if (g.budget) out.push("Under ₹" + g.budget.toLocaleString("en-IN"));
  return out.slice(0, 3);
}
function specFromTitleText(title) {
  const m = String(title || "").match(/(\d+(?:\.\d+)?)\s*(kg|litre|liters|litres|watt|va|inch|inches|ton|gb|ram)\b/i);
  if (m) return m[1] + " " + m[2].toLowerCase().replace(".", "");
  return null;
}
function displayCatShort(c) {
  const map = { "AMAZON FASHION": "Fashion", "Amazon Home": "Home & Kitchen", "All Electronics": "Electronics", "All Beauty": "Beauty" };
  return map[c] || c;
}

// ---- optional LLM NLU (CHAT_LLM=1) ----------------------------------------
async function llmPass(state, text, ctx) {
  try {
    const { llmNlu } = await import("./nlu.js");
    // Gemini-only routing (LLM retired 2026-11-06): adapter keeps the
    // OpenAI-style chat() signature nlu.js expects.
    const { geminiChat } = await import("../gemini_keys.js");
    const chat = async (msgs, opts = {}) => {
      const sys = (msgs.find((m) => m.role === "system") || {}).content || "";
      const usr = (msgs.find((m) => m.role === "user") || {}).content || "";
      const r = await geminiChat({ system: sys, user: usr, maxTokens: opts.maxTokens || 160,
                                   temperature: opts.temperature ?? 0, timeoutMs: 1500 });
      if (!r) throw new Error("NO_GEMINI");
      return { text: r.text, model: r.model };
    };
    return await llmNlu({ chat }, state, text);
  } catch { return null; }
}

// ---- optional LLM phrasing (CHAT_LLM=1) ------------------------------------
const breaker = { fails: 0, openUntil: 0 };
const phCache = new Map();
async function phraseSafe(templateText, lang, facts, ctx) {
  if (Date.now() < breaker.openUntil) return { mode: "template", why: "breaker_open" };
  const key = lang + "|" + templateText;
  const hit = phCache.get(key);
  if (hit && hit.exp > Date.now()) return { mode: "llm", text: hit.text };
  let controller;
  try {
    const { geminiChat } = await import("../gemini_keys.js");
    const sys = "You write ONE short reply (max 40 words) for an Indian shopping assistant. " +
      "Use ONLY the facts given. Do not add products, prices, brands or claims. " +
      "Mirror the language: " + lang + ". No emojis, no exclamation marks.";
    const gr = await withTimeout(geminiChat({
      system: sys,
      user: "Template: " + templateText + "\nFacts: " + JSON.stringify(facts).slice(0, 400),
      maxTokens: 90, temperature: 0.4, timeoutMs: 800,
    }), 800);
    if (!gr) throw new Error("NO_GEMINI");
    const text = gr.text;
    const cand = String(text || "").trim().split(/\n/)[0];
    if (!cand || cand.length > 280) throw new Error("shape");
    const g = validateGrounding(cand, facts);
    if (!g.ok) throw new Error("grounding:" + g.rule);
    phCache.set(key, { text: cand, exp: Date.now() + 600000 });
    return { mode: "llm", text: cand };
  } catch (e) {
    breaker.fails += 1;
    if (breaker.fails >= 3) { breaker.openUntil = Date.now() + 300000; breaker.fails = 0; return { mode: "template", why: "breaker_open" }; }
    return { mode: "template", why: String(e.message || e).startsWith("grounding") ? "grounding_fail" : "llm_timeout" };
  }
}
function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
