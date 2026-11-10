// guide_audit.mjs (section 9 CI gate) — same shape as
// check-analytics-coverage.mjs: deterministic, self-contained, fails CI
// with the offending (query, answer, question) tuples on any violation.
//
// 1) Replays 200 deterministic journeys (query -> 2-3 real chip/typed
//    answers) and asserts at every question moment: zero ungrounded
//    options (exit guard), zero count mismatches (exact recount via the
//    guard's own recountOption), zero re-asks, zero enabled zero-count
//    chip questions, zero world-guard violations. The exit guard itself
//    catching a policy re-emit (typed-only fallback) is ALSO a violation
//    (the safety net did its job; the policy bug is real).
//    Visible-set growth from the relax switch (strict T1 -> relax
//    re-search) is pre-existing search behaviour, reported informationally
//    only — the UI contract is that the ECHO/meter never show an
//    increasing "left" count (echoFor/meter render it plainly, verified
//    in the canaries + UI check).
// 2) Runs the 10-anchor recommendation-rail audit over every rail surface
//    (picked-for-you/interest, similar/same-category, more-from-brand,
//    cart complete-your-purchase, home budget band, recently-viewed
//    history) with the runtime rail guard: every kept item carries a
//    NAMED relation, below-min rails are hidden (never padded), the
//    brand-less anchor gets no more-from-brand rail.
//
// Zero LLM calls. Run: node scripts/guide_audit.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
process.chdir(path.join(ROOT, "app")); // loadCatalog reads public/catalog.json from cwd
const { loadCatalog } = await import("../app/lib/catalog.js");
const { search, parseQuery } = await import("../app/lib/search.js");
const { decideGuide, buildIntentView, hasGiftIntent } = await import("../app/lib/guide.js");
const { validateGuideQuestion, validateRecommendationRail, itemRelation, guardState, optionKind, recountOption, itemMatchesOption, isEscape } = await import("../app/lib/guard.js");
const { CAT_SYNONYMS } = await import("../app/lib/guide.js");

const catalog = loadCatalog();
const proj = (rs) => rs.map(r => ({ sku: r.sku, title: r.title, price: r.price, brand: r.brand, category: r.category, tags: r.tags, intent: r.intent }));
const ivOf = (v) => { const it = v.filter(x => x.intent); return buildIntentView(it.length >= 3 ? it : v); };
const WEARABLE_Q = /\b(watch|smartwatch|watches|bangle|bangles|earring|earrings|bracelet|necklace|chain|ring|rings|sandal|sandals|slipper|slippers|shoe|shoes|sneaker|sneakers|flipflop|flip-flop|cap|caps|tie|belt|wallet|hoodie|hoodies|sweater|sweaters|coat|coats|jacket|jackets?|blazer|blazers|jeans|jeans?|trouser|trousers|pants|short|shorts|skirt|skirts|top|tops|kurti|kurtas?|kurta|dhoti|dhotis|lungi|salwar|salwars|saree|sari|sarees|shirt|shirts|tshirt|t-shirts?|t-?shirts?|blouse|blouses|dress|dresses|frock|frocks|nighty|nightys|pyjama|pyjamas|uniform|uniforms|gown|lehenga)\b/i;
const DEVANAGARI_WEARABLE = /(?<![ऀ-ॿ])(घड़ी|घडियां|कमीज़|कुर्ता|कुर्ती|शर्ट|साड़ी|सारी|ब्लाज़र|ब्लेज़र|टॉप|स्वेटर|जीन्स|जींस|टाई|बेल्ट|जूता|जूते|चप्पल|ड्रेस|नाइट|कपड़े|कपड़ा|पायजामा|लेहंगा|अनारकली)(?![ऀ-ॿ])/;
const isWearable = (q) => WEARABLE_Q.test(q) || DEVANAGARI_WEARABLE.test(q);
const dispCat = (c) => ({ "AMAZON FASHION": "Fashion", "All Electronics": "Electronics", "Amazon Home": "Home & Kitchen", Appliances: "Appliances" }[c] || c);

// ---- deterministic 200-journey set (same derivation as the flow miner) ----
const hand = [
  "wireless headphones", "non stick cookware set", "sneakers for men", "bluetooth speaker",
  "gas stove", "standing desk", "headphons", "laptap", "waching machine", "televsion", "mouice", "sneakerz",
  "gift under 2k", "diwali gift for mom", "wedding gift set", "birthday gift for boyfriend",
  "corporate gift under 1000", "rakhi gift",
  "कपड़ा", "फोन", "कुर्ती", "गर्ल फ्रॉक", "वॉच", "सलवार सूट",
  "saste me phone", "2000 me smart watch", "kurti for women", "sari ke saath jute", "under 10k laptop", "sasta tv 43 inch",
  "headphones under 3000", "smart watch under 8000", "laptop under 50k", "washing machine under 30k",
  "saree under 2000", "tv under 40000",
  "iphone 15 256gb", "lg 7kg washing machine", "bo at rockerz", "dell latitude 5420",
  "iphone 13 128gb", "oneplus nord ce3",
  "cotton kurti", "men t-shirt", "women sneakers", "cotton saree", "denim jacket", "sports watch",
  "washing machine", "microwave oven", "air cooler", "mixer grinder", "geyser", "inverter ac 1 ton",
  "xyzqwerty 12345", "quantum flux capacitor", "asdfghjkl", "zzzz 99999", "plumbus flux", "interdimensional cable",
];
const SHAPES = ["product", "product", "product", "product", "product", "product",
                "typo", "typo", "typo", "typo", "typo", "typo",
                "gift", "gift", "gift", "gift", "gift", "gift",
                "hi", "hi", "hi", "hi", "hi", "hi",
                "hinglish", "hinglish", "hinglish", "hinglish", "hinglish", "hinglish",
                "budget", "budget", "budget", "budget", "budget", "budget",
                "model", "model", "model", "model", "model", "model",
                "wearable", "wearable", "wearable", "wearable", "wearable", "wearable",
                "appliance", "appliance", "appliance", "appliance", "appliance", "appliance",
                "dead-end", "dead-end", "dead-end", "dead-end", "dead-end", "dead-end"];
const TYPED = { product: "black", typo: "premium", gift: "for mom", hi: "ke liye", hinglish: "sasta",
                budget: "under 2000", model: "new", wearable: "cotton", appliance: "5 star", "dead-end": "something else" };

const catItems = new Map();
for (const it of catalog) { const c = it.category; if (!catItems.has(c)) catItems.set(c, []); if (catItems.get(c).length < 80) catItems.get(c).push(it); }
const topCats = [...catItems.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 40);
const ext = [];
const seen = new Set(hand);
outer:
for (const [c, items] of topCats) {
  for (const it of items) {
    if (ext.length >= 240) break outer;
    const t = String(it.title || "").trim();
    if (!t || seen.has(t) || t.length < 6) continue;
    seen.add(t);
    ext.push(t);
  }
}
// ---- journey sets ---------------------------------------------------------
// Set A (frozen 200, original CI set): 60 hand x {subflow0, typed} = 120
// + 80 catalog x tree0 = 200.
// Set B (new 200, 2026-11-10): failure-state biased - priced/model/spec
// queries, fresh dead-ends and Devanagari, and ESCAPE-FIRST journeys: the
// escape chip ("No preference / Any ... / Not sure / Unisex") does not
// narrow the world, so the chain runs long and dries out - exactly the
// turns the top-value filter fallback (guide.js) must keep alive with
// real options. 60 hand x {esc, typed} = 120 + 80 catalog (disjoint
// slice) x esc = 200.
const SET = (process.argv[2] || "a").toLowerCase() === "b" ? "b" : "a";
const handB = [
  ["shadi gift under 2000", "gift"], ["bhai ke liye gift", "gift"], ["gift for colleague", "gift"],
  ["anniversary gift for wife", "gift"], ["birthday gift for 10 year old", "gift"], ["rakhi gift under 500", "gift"],
  ["corporate gift hamper", "gift"], ["uphaar ke liye kuch", "gift"], ["gift for dad under 3000", "gift"],
  ["wedding gift for couple", "gift"], ["kuch gift dena hai", "gift"], ["shaadi me lena hai", "gift"],
  ["smart watch under 1500", "priced"], ["saree under 1000", "priced"], ["kurti under 800", "priced"],
  ["shoes under 1200", "priced"], ["perfume under 1000", "priced"], ["backpack under 2000", "priced"],
  ["sandal under 800", "priced"], ["watch under 2500", "priced"], ["t-shirt under 400", "priced"],
  ["bedsheet under 900", "priced"], ["cookware set under 3000", "priced"], ["phone case under 500", "priced"],
  ["water purifier", "product"], ["induction stove", "product"], ["gaming keyboard", "product"],
  ["wall clock", "product"], ["kitchen scale", "product"], ["school bag", "product"],
  ["yoga mat", "product"], ["desk lamp", "product"],
  ["samsung galaxy m34", "model"], ["bo at rockerz 451", "model"], ["hp pavilion 15", "model"],
  ["oneplus 12r", "model"], ["lg 8kg washing machine", "spec"], ["23 inch tv", "spec"],
  ["5 star ac 1.5 ton", "spec"], ["geyser 3 liter", "spec"], ["microwave 20 liter", "spec"],
  ["air fryer 4 liter", "spec"],
  ["सब्जी की टोकरी", "hi"], ["दुपट्टा", "hi"], ["ब्लाज़र", "hi"], ["पapai ke liye gift", "hi"],
  ["चाची के लिए उपहार", "hi"], ["बेटी का जन्मदिन गिफ्ट", "hi"], ["घर के लिए दीया", "hi"],
  ["साले की शादी", "hi"],
  ["headphne", "typo"], ["laptopt", "typo"], ["smartwath", "typo"],
  ["bluetooh speaker", "typo"], ["kurti for ladkai", "typo"],
  ["vintage vinyl record player", "deadend"], ["electric scooter", "deadend"], ["drone camera", "deadend"],
  ["smart door lock", "deadend"], ["portable generator", "deadend"],
];
const TYPEDB = { gift: "under 1500", priced: "white", product: "black", model: "new",
                 spec: "5 star", hi: "ke liye", typo: "premium", deadend: "something else" };
const journeys = [];
if (SET === "a") {
  hand.forEach((q, i) => journeys.push({ query: q, shape: SHAPES[i], plan: "subflow0" }));
  hand.forEach((q, i) => journeys.push({ query: q, shape: SHAPES[i], plan: "typed", typed: TYPED[SHAPES[i]] }));
  for (const q of ext.slice(0, 80)) journeys.push({ query: q, shape: "catalog", plan: "tree0" });
} else {
  for (const [q, shape] of handB) journeys.push({ query: q, shape, plan: "esc" });
  for (const [q, shape] of handB) journeys.push({ query: q, shape, plan: "typed", typed: TYPEDB[shape] });
  for (const q of ext.slice(80, 160)) journeys.push({ query: q, shape: "catalog", plan: "esc" });
}

// ---- chip -> search opts + guide slots (client parity, page.jsx applyAnswer)
function chipOpts(chip, gtype, results) {
  const sopts = {}; const slots = {}; let extraQ = "";
  if (gtype === "budget") {
    const nums = (String(chip).match(/[\d,]+/g) || []).map(x => parseInt(x.replace(/,/g, ""), 10)).filter(n => n > 0);
    if (/not sure|flexible/i.test(chip)) { sopts.budgetMax = 15000; slots.budget = 15000; }
    else if (nums.length) { sopts.budgetMax = Math.max(...nums); slots.budget = Math.max(...nums); }
  } else if (gtype === "occasion") {
    const key = String(chip).toLowerCase().split("/")[0].trim();
    const map = { gift: "gift", birthday: "birthday", wedding: "wedding", shaadi: "wedding", anniversary: "anniversary", party: "party", diwali: "diwali", christmas: "christmas", valentines: "valentines", graduation: "graduation", housewarming: "housewarming", everyday: null, daily: null };
    if (key in map && map[key] != null) { sopts.occasion = map[key]; slots.occasion = map[key]; }
  } else if (gtype === "brand") { sopts.brand = /no preference|best rated/i.test(chip) ? "best_rated" : chip; slots.brand = sopts.brand; }
  else if (gtype === "for_whom") { sopts.forWhom = /women/i.test(chip) ? "women" : /men/i.test(chip) ? "men" : /kids/i.test(chip) ? "kids" : "unisex"; slots.forWhom = sopts.forWhom; }
  else if (gtype === "size") { if (!/any/i.test(chip)) { sopts.size = String(chip).toLowerCase(); slots.size = sopts.size; } }
  else if (gtype === "capacity") { if (!/any/i.test(chip)) { sopts.capacity = chip; slots.capacity = chip; } }
  else if (gtype === "category") {
    if (!/^any category$/i.test(chip)) {
      const c = results.find(r => r.category && (String(chip).toLowerCase().includes(String(r.category).toLowerCase()) || dispCat(r.category).toLowerCase() === String(chip).toLowerCase()));
      if (c) { sopts.category = c.category; slots.category = c.category; }
      else extraQ = chip;
    }
  } else {
    const lowC = String(chip).toLowerCase();
    const b = results.find(r => r.brand && lowC.includes(r.brand.toLowerCase()));
    const c = results.find(r => r.category && lowC.includes(String(r.category).toLowerCase()));
    const nums = (String(chip).match(/[\d,]+/g) || []).map(x => parseInt(x.replace(/,/g, ""), 10)).filter(n => n > 0);
    if (b) { sopts.brand = b.brand; slots.brand = b.brand; }
    else if (/₹/.test(chip) && nums.length) { sopts.budgetMax = Math.max(...nums); slots.budget = Math.max(...nums); }
    else if (c) { sopts.category = c.category; slots.category = c.category; }
    else extraQ = chip;
  }
  return { sopts, slots, extraQ };
}

const searchCache = new Map();
const doSearch = (q, o = {}) => {
  const key = q + "¦" + JSON.stringify(o);
  if (!searchCache.has(key)) searchCache.set(key, search(catalog, q, { limit: 48, ...o }));
  return searchCache.get(key);
};
const ask = (q, vis, turn, prevTypes, slots) =>
  decideGuide(catalog, q, vis.filter(v => v.intent).length, { turn, prevTypes, slots, visible: vis });

function worldLeakKind(q, vis, d) {
  if (isWearable(q)) return null;
  // 2026-11-10: mirror the policy exemption (guide.js worldGuard) — a
  // fashion world on a gift / occasion-stated query is on-target (apparel
  // is a top gift category: "shadi gift" = kurtis), not a leak.
  const parsed = parseQuery(q);
  if (hasGiftIntent(q) || !!(parsed.occasion && parsed.occasion !== "gift")) return null;
  const catView = buildIntentView(vis);
  const cats = catView.categories.slice(0, 2).map(c => c.name);
  if (!cats.includes("AMAZON FASHION")) return null;
  // 2026-11-10: mirror the policy's on-target family-match exemption too —
  // a dominant family (>=50%) that family-matches the query subject via
  // CAT_SYNONYMS is on-target (a fashion presence in top-2 is catalog
  // noise, e.g. 1 blanket filed in AMAZON FASHION under an Amazon Home
  // world). Same normalized containment in either direction as guide.js.
  const dom = catView.categories[0];
  if (dom && vis.length && dom.count / vis.length >= 0.5) {
    const synCats = new Set();
    for (const tk of parsed.tokens || []) { const sy = CAT_SYNONYMS[tk]; if (sy) sy.forEach(c => synCats.add(c)); }
    const norm = (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const n = norm(dom.name);
    for (const sc of synCats) {
      const sn = norm(sc);
      if (sn === n || sn.includes(n) || n.includes(sn)) return null;
    }
  }
  const kinds = (d.optionCounts || []).map(o => optionKind(d, o.label));
  return kinds.includes("brand") || kinds.includes("tag") ? "fashion brand/tag leak" : null;
}

// ---- journey replay ----
let moments = 0, badJ = 0, narrowGrowths = 0;
const violations = [];
const fail = (j, m) => { violations.push(m); badJ++; };
const qdescOf = (d) => d.ask ? `${d.type}${d.subType ? ":" + d.subType : ""} [${(d.optionCounts || []).map(o => o.label + ":" + o.count).join(", ").slice(0, 120)}]` : "none";

function checkDecision(j, tag, d, vis, slots, prevTypes, q) {
  if (!d.ask) return;
  if (/\[guard:/.test(d.reason || "")) {
    fail(j, `${tag} policy re-emitted a guarded question -> typed-only fallback [${(d.reason || "").match(/\[guard:\w+\]/)?.[0] || "?"}] ${qdescOf(d)}`);
    return;
  }
  const g = validateGuideQuestion(d, ivOf(vis), vis, slots, prevTypes);
  if (!g.ok) { fail(j, `${tag} guard:${g.reason} ${qdescOf(d)}`); return; }
  for (const o of (d.optionCounts || [])) {
    const rc = recountOption(optionKind(d, o.label), o.label, vis);
    if (rc !== (o.count || 0)) fail(j, `${tag} recount ${o.label} server=${o.count} client=${rc}`);
  }
  const optsArr = d.optionCounts || [];
  if (optsArr.length && optsArr.every(o => o.count === 0)) fail(j, `${tag} all-zero chip question ${qdescOf(d)}`);
  const wl = worldLeakKind(q, vis, d);
  if (wl) fail(j, `${tag} world-guard ${wl} ${qdescOf(d)}`);
}

async function step(cur, a, turn, q, j) {
  const gtype = cur.d.type;
  const chip = a.kind === "chip" ? a.label : a.text;
  const { sopts, slots: aslots, extraQ } = chipOpts(chip, gtype, cur.vis);
  let rs = doSearch(q + (extraQ ? " " + extraQ : ""), { relax: true, ...sopts });
  let vis = proj(rs);
  // 2026-11-10 client parity (page.jsx applyAnswer): a data-grounded chip
  // NARROWS the visible world with the chip's own count predicate — the
  // catalog-wide re-search world is only kept for typed/escape answers.
  // ("Pigeon 9" on a 150-product card must stay a 9-item world, not the
  // 109-item catalogue re-search.)
  const oc = (cur.d.optionCounts || []).find((o) => o.label === chip);
  const kind = oc ? (oc.kind || optionKind(cur.d, oc.orig || oc.label)) : null;
  const canon = oc ? (oc.orig || oc.label) : null;
  const dataChip = !!oc && !(cur.d.stats && cur.d.stats.rescue) && oc.count > 0 && !isEscape(canon) &&
    ["brand", "category", "tag", "band", "for_whom", "size", "capacity", "occasion"].includes(kind);
  let slots = { ...cur.slots, ...aslots };
  if (dataChip) {
    const matched = cur.vis.filter((v) => itemMatchesOption(kind, canon, v));
    const rank = new Map(rs.map((r, i) => [r.sku, i]));
    const visIdx = new Map(cur.vis.map((v, i) => [v.sku, i]));
    vis = matched.slice().sort((x, y) =>
      (rank.has(x.sku) ? rank.get(x.sku) : 1e9 + visIdx.get(x.sku)) -
      (rank.has(y.sku) ? rank.get(y.sku) : 1e9 + visIdx.get(y.sku)));
  } else if (vis.filter(v => v.intent).length < 2 && sopts.category) {
    const o2 = Object.fromEntries(Object.entries(sopts).filter(([k]) => k !== "category"));
    rs = doSearch(q, { relax: true, ...o2 }); vis = proj(rs);
    slots = Object.fromEntries(Object.entries(slots).filter(([k]) => k !== "category"));
  }
  const prevN = cur.vis.length;
  const prevTypes = [...cur.prevTypes, cur.d.type === "any" && cur.d.subType ? "any:" + cur.d.subType : cur.d.type];
  const d = await ask(q, vis, turn + 1, prevTypes, slots);
  moments++;
  checkDecision(j, `(${JSON.stringify(q)}, ans=${JSON.stringify(chip)}, Q${turn + 1})`, d, vis, slots, prevTypes, q);
  if (prevN != null && vis.length > prevN) narrowGrowths++;
  return { vis, slots, prevTypes, d };
}

for (const j of journeys) {
  const q = j.query;
  const rs = doSearch(q, {});
  const vis = proj(rs);
  const d = await ask(q, vis, 1, [], {});
  moments++;
  checkDecision(j, `(${JSON.stringify(q)}, ans=-, Q1)`, d, vis, {}, [], q);
  const live = (d.ask ? (d.optionCounts || []) : []).filter(o => o.count > 0);
  const cur = { vis, slots: {}, prevTypes: [], d };
  if (!d.ask || !live.length) continue;
  if (j.plan === "subflow0") {
    const l1 = await step(cur, { kind: "chip", label: live[0].label }, 1, q, j);
    const l2 = (l1.d.ask ? (l1.d.optionCounts || []) : []).filter(o => o.count > 0);
    if (l1.d.ask && l2.length) await step(l1, { kind: "chip", label: l2[0].label }, 2, q, j);
  } else if (j.plan === "typed") {
    const l1 = await step(cur, { kind: "typed", text: j.typed }, 1, q, j);
    const l2 = (l1.d.ask ? (l1.d.optionCounts || []) : []).filter(o => o.count > 0);
    if (l1.d.ask && l2.length) await step(l1, { kind: "chip", label: l2[0].label }, 2, q, j);
  } else if (j.plan === "esc") {
    // Escape-first (set B): the escape chip keeps the whole world, so the
    // ladder runs dry and the top-value filter fallback must answer with
    // options. Up to 3 answered questions.
    let l = cur;
    for (let depth = 1; depth <= 3 && l.d.ask; depth++) {
      const opts = l.d.optionCounts || [];
      const pick = opts.find(o => isEscape(o.label) && (o.count || 0) > 0)
        || opts.find(o => (o.count || 0) > 0);
      if (!pick) break;
      l = await step(l, { kind: "chip", label: pick.label }, depth, q, j);
    }
  } else { // tree0: first leaf, 3 levels
    let l = await step(cur, { kind: "chip", label: live[0].label }, 1, q, j);
    for (let depth = 2; depth <= 3 && l.d.ask; depth++) {
      const ll = (l.d.optionCounts || []).filter(o => o.count > 0);
      if (!ll.length) break;
      l = await step(l, { kind: "chip", label: ll[0].label }, depth - 1, q, j);
    }
  }
}

// ---- 10-anchor rail audit (every rail surface) -----------------------------
const byCat = new Map();
for (const it of catalog) { const c = it.category; if (!byCat.has(c)) byCat.set(c, []); if (byCat.get(c).length < 30) byCat.get(c).push(it); }
const anchorOf = (cat, wantBrand) => {
  const items = byCat.get(cat) || [];
  return (items.find(i => !!i.brand === wantBrand) || items[0]) || null;
};
const RAILS = [
  { surface: "picked_for_you", min: 3, mode: "interest", cat: "All Electronics", branded: false },
  { surface: "similar", min: 4, mode: "item", cat: "Appliances", branded: false },
  { surface: "similar", min: 4, mode: "item", cat: "AMAZON FASHION", branded: false },
  { surface: "similar", min: 4, mode: "item", cat: "Amazon Home", branded: false },
  { surface: "similar", min: 4, mode: "item", cat: "All Beauty", branded: false },
  { surface: "similar", min: 4, mode: "item", cat: "Toys & Games", branded: false },
  { surface: "more_from_brand", min: 2, mode: "item", cat: "All Electronics", branded: true },
  { surface: "more_from_brand_brandless", min: 2, mode: "item", cat: "Appliances", branded: false },
  { surface: "cart_complete", min: 2, mode: "item", cat: "Appliances", branded: false },
  { surface: "recently_viewed", min: 3, mode: "history", cat: "All Electronics", branded: false },
];
let railFails = 0;
for (const r of RAILS) {
  const anchor = anchorOf(r.cat, r.branded);
  if (!anchor) { railFails++; violations.push(`(rail ${r.surface}) no anchor found for ${r.cat}`); continue; }
  const pool = (byCat.get(r.cat) || []).filter(x => x.sku !== anchor.sku).slice(0, 12);
  const items = pool.map(x => ({ sku: x.sku, title: x.title, price: x.price, brand: x.brand, category: x.category, tags: x.tags }));
  const g = validateRecommendationRail(items, { item: anchor, query: String(anchor.title || "").slice(0, 40) }, { surface: r.surface, min: r.min, mode: r.mode });
  if (r.mode === "item") {
    for (const it of g.items) {
      const rel = itemRelation(it, { item: anchor, query: String(anchor.title || "").slice(0, 40) });
      if (!rel) { railFails++; violations.push(`(rail ${r.surface} anchor=${anchor.sku}) kept item without named relation: ${it.sku} ${String(it.title).slice(0, 40)}`); }
    }
  }
  if (g.items.length > 0 && g.items.length < r.min && !g.hidden) { railFails++; violations.push(`(rail ${r.surface}) below min ${r.min} but not hidden (${g.items.length})`); }
  if (r.surface === "more_from_brand_brandless" && anchor.brand) { railFails++; violations.push("(rail more_from_brand_brandless) anchor unexpectedly branded"); }
}
// client-side brandless rule exists (page.jsx never builds the rail for a
// brand-less anchor — moreFromBrandFor returns [] up front)
const pageSrc = fs.readFileSync(path.join(ROOT, "app/app/page.jsx"), "utf8");
if (!/moreFromBrandFor[\s\S]{0,300}?\bbankless\b|!cur\.brand\s*\?|\bbrand\s*\|\|\s*""\s*\?/.test(pageSrc) && !/function moreFromBrandFor[\s\S]{0,400}?\breturn \[\]/.test(pageSrc)) {
  railFails++; violations.push("(rail more_from_brand) page.jsx brand gate not detected (manual review)");
}

const gstate = guardState();
const total = violations.length + railFails;
if (total > 0) {
  console.error("GUIDE AUDIT FAIL — " + violations.length + " journey violations" + (railFails ? ` + ${railFails} rail violations` : ""));
  for (const v of violations) console.error("  " + v);
  process.exit(1);
}
console.log(`journeys: ${journeys.length}/${journeys.length} green (set ${SET}), moments: ${moments}, guard fallbacks this run: ${gstate.fallbacks}, relax-expansions (informational): ${narrowGrowths}`);
console.log(`GUIDE AUDIT OK: set ${SET} - ${journeys.length} journeys, 10-anchor rail audit, 0 ungrounded / re-ask / zero-count / world-guard violations`);
