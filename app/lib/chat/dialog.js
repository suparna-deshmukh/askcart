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

function classifyProductQ(text) {
  const s = String(text || "").toLowerCase();
  if (/\b(size|material|storage|ram|battery|weight|specs?|details?|colour|color|ton|capacity|watt|inch|litre|pocket|button)\b/.test(s)) return "spec";
  if (/\b(price|cost|expensive|cheap|deal|value|worth the price)\b/.test(s)) return "price";
  if (/\b(gift|occasion|good (as|for)|suitab\w*|kids?|office|party|shaadi|wedding|birthday|fit)\b/.test(s)) return "suitability";
  if (/\b(good|quality|durable|trust\w*|reliable|worth|rating|review\w*|safe)\b/.test(s)) return "quality";
  return "other";
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

  // ---- chips -------------------------------------------------------------
  if (input.type === "chip") {
    const r = handleChip(state, input.chip_id, ctx, events, ui_actions);
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
                  to_long: "oos_to_long", control: "oos_control" }[nlu.kind] ||
               (String(nlu.kind || "").startsWith("out_of_domain") ? "oos_domain" : "oos_unrecognized");
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
      const sku = nlu.kind === "add" ? resolveCartSku(state, ctx, nlu.refs) : null;
      if (nlu.kind === "add" && sku) {
        act = "confirm_ui_action";
        text = T_(lang, "cart_added");
        ui_actions.push({ action: "add_to_cart", sku });
        chips = [{ id: "cart:open", label: "Open cart" }, { id: "cart:keep", label: "Keep shopping" }];
        const item = catalog.find((x) => x.sku === sku);
        if (item) facts = { items: [item], skus: [sku], slots: state.slots };
      } else if (nlu.kind === "add") {
        act = "ask_question";
        text = T_(lang, "ask_which");
        chips = whichChips(state);
        return finish();
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
      if (kind === "spec") {
        const v = specSentence(specs, item.title) || specFromTitleText(item.title);
        if (v) {
          act = "answer_product";
          text = T_(lang, "p_spec", { title: item.brand ? item.brand + " " : "", spec: v });
        } else {
          act = "answer_unknown";
          text = T_(lang, "p_unknown", { known: [item.brand && "brand " + item.brand, displayCatShort(item.category), "₹" + item.price.toLocaleString("en-IN")].filter(Boolean).join(", ") });
        }
      } else if (kind === "price") {
        const med = ctx.catMedian && ctx.catMedian[item.category] ? ctx.catMedian[item.category].med : null;
        if (med) {
          act = "answer_product";
          text = T_(lang, "p_price", { price: item.price.toLocaleString("en-IN"), median: med.toLocaleString("en-IN"), cat: displayCatShort(item.category), pos: item.price <= med ? "below" : "above" });
          facts.median = med;
        } else {
          act = "answer_product";
          text = T_(lang, "p_price", { price: item.price.toLocaleString("en-IN"), median: item.price.toLocaleString("en-IN"), cat: displayCatShort(item.category), pos: "at" });
          facts.median = item.price;
        }
      } else if (kind === "suitability") {
        const tags = (item.tags || []).filter((t) => ["wedding", "birthday", "anniversary", "gift", "diwali", "party", "valentines", "christmas", "graduation", "baby-shower", "housewarming"].includes(t));
        const extra = [];
        if (state.slots.forWhom) extra.push("for " + state.slots.forWhom);
        const shown = [...tags, ...extra].slice(0, 3);
        if (shown.length) {
          act = "answer_product";
          text = T_(lang, "p_suit", { tags: shown.join(", ") });
        } else {
          act = "answer_unknown";
          text = T_(lang, "p_no_suit");
        }
      } else {
        // quality (and default): state the adjusted rating, never opine
        act = "answer_product";
        const adj = adjustedRating(item.rating, item.num_ratings);
        text = T_(lang, "p_quality", { rating: adj.toFixed(1), n: (item.num_ratings || 0).toLocaleString("en-IN") });
      }
      chips = [{ id: "cart:add:" + item.sku, label: "Add this to cart" }, { id: "explain", label: "Why this matched" }];
      return finish();
    }

    default: {
      // search / refine
      const r = productTurn(state, nlu, ctx, events, ui_actions);
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
function productTurn(state, nlu, ctx, events, ui_actions) {
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
          chips: [{ id: "cart:add:" + item.sku, label: "Add this to cart" }, { id: "more", label: "More" }],
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
      const d = decideGuide(catalog, query, intentN, { turn: state.asked.length + 2, prevTypes: state.asked, lang });
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
    const d2 = decideGuide(catalog, query, intentN, { turn: state.asked.length + 2, prevTypes: state.asked, lang });
    const suggest = d2.stats && d2.stats.topCategory ? displayCatShort(d2.stats.topCategory) : null;
    return {
      act: "not_found_with_substitutes",
      text: suggest ? T_(lang, "not_found_alt", { suggest: suggest.toLowerCase() }) : T_(lang, "not_found"),
      components: [], chips: [{ id: "more", label: "Show a broader search", ghost: true }],
      n: intentN, intentN, facts: { items: [], slots: state.slots },
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
    const d = decideGuide(catalog, query, intentN, { turn: state.asked.length + 2, prevTypes: state.asked, lang });
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

function handleChip(state, chipId, ctx, events, ui_actions) {
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
      const r = productTurn(state, { intent: "search", kind: "keep", query: state.q, slots_delta: {}, productTokens: [], keepSlots: true }, ctx, events, ui_actions);
      return { ...r, text: T_(lang, "skip"), act: r.act === "ask_question" ? "show_results" : r.act };
    }
    return { act: "deflect", text: T_(lang, "skip"), components: [], chips: [], n: 0, intentN: 0, facts: {} };
  }
  if (head === "more" || head === "cheaper" || head === "different") {
    if (head === "cheaper") state.slots = { ...state.slots, budgetMax: state.slots.budgetMax ? Math.round(state.slots.budgetMax * 0.7 / 50) * 50 : 2000 };
    if (head === "more" && state.last) return showMore(state, events);
    const r = productTurn(state, { intent: "search", kind: "keep", query: state.q, slots_delta: {}, productTokens: [], keepSlots: true }, ctx, events, ui_actions);
    return r;
  }
  if (head === "cart") {
    if (val === "open") return { act: "confirm_ui_action", text: T_(lang, "cart_opened"), components: [], chips: [], n: 0, intentN: 0, ui_open: true, facts: {} };
    return null; // "keep shopping" -> no reply
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
  const r = productTurn(state, { intent: "search", kind: "keep", query: state.q, slots_delta: {}, productTokens: [], keepSlots: true }, ctx, events, ui_actions);
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
  if (ctx.context && ctx.context.sku) return ctx.catalog.find((x) => x.sku === ctx.context.sku) || null;
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
  if (!out.length) out = pool.slice(0, Math.min(pool.length, 3));
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
    const { chat } = await import("../llm.js");
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
    const { chat } = await import("../llm.js");
    const sys = "You write ONE short reply (max 40 words) for an Indian shopping assistant. " +
      "Use ONLY the facts given. Do not add products, prices, brands or claims. " +
      "Mirror the language: " + lang + ". No emojis, no exclamation marks.";
    const { text } = await withTimeout(chat(
      [{ role: "system", content: sys }, { role: "user", content: "Template: " + templateText + "\nFacts: " + JSON.stringify(facts).slice(0, 400) }],
      { maxTokens: 90, temperature: 0.4 },
    ), 800);
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
