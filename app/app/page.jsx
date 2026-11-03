"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { track, getPersona, cohortOf } from "./lib/track";
import { Onboarding, BUDGET_STYLE_MAX, SPEND_BIAS, SPEND_BRAND_AFFINITY } from "./ui/onboarding";
import { CartDrawer, CheckoutModal, OrderToast } from "./ui/cart";
import { AnalyticsView } from "./ui/analytics";

const EXAMPLES = [
  "shaadi gift under 2k",
  "budget headphones under 3000",
  "diwali decorations",
  "gift for 5 year old",
  "phone under 15k for college",
  "wristwatch for dad under 5k",
];

const SORTS = [
  { id: "relevance", label: "Relevance" },
  { id: "price_asc", label: "Price ↑" },
  { id: "price_desc", label: "Price ↓" },
  { id: "rating", label: "Top rated" },
];
const PRICE_BANDS = [
  { id: "<1k", label: "under ₹1k", min: 0, max: 1000 },
  { id: "1-3k", label: "₹1k–3k", min: 1000, max: 3000 },
  { id: "3-10k", label: "₹3k–10k", min: 3000, max: 10000 },
  { id: "10k+", label: "₹10k & up", min: 10000, max: Infinity },
];
const DEFAULT_FILTERS = { sort: "relevance", brands: [], band: null, rating4: false, category: null };

// Display-only category labels. Raw category strings stay backend-only
// (search, filters, analytics all use them); shoppers see clean names.
const DISPLAY_CATEGORY = {
  "AMAZON FASHION": "Fashion",
  "Amazon Home": "Home & Kitchen",
  "All Electronics": "Electronics",
  "All Beauty": "Beauty",
};
function displayCat(c) { return DISPLAY_CATEGORY[c] || c; }

function lsCart() {
  try { return JSON.parse(localStorage.getItem("askcart_cart") || "{}"); } catch { return {}; }
}

function applyFilters(items, f) {
  let out = items;
  if (f.brands.length) out = out.filter((r) => r.brand && f.brands.includes(r.brand));
  if (f.band) {
    const b = PRICE_BANDS.find((x) => x.id === f.band);
    out = out.filter((r) => r.price >= b.min && r.price < b.max);
  }
  if (f.rating4) out = out.filter((r) => (r.rating || 0) >= 4);
  if (f.category) out = out.filter((r) => r.category === f.category);
  out = [...out];
  if (f.sort === "price_asc") out.sort((a, b) => a.price - b.price);
  else if (f.sort === "price_desc") out.sort((a, b) => b.price - a.price);
  else if (f.sort === "rating") out.sort((a, b) => (b.rating - a.rating) || (b.num_ratings - a.num_ratings));
  // "relevance" keeps the API's scored order
  return out;
}

// Documented in docs/followup_algorithm.md — persona-aware re-rank on top of
// the search score: price fit vs spend style, brand affinity, quality, trust.
function recommendScore(r, persona) {
  let base = r.score || 3;
  const style = persona && persona.spendStyle;
  const cap = style ? BUDGET_STYLE_MAX[style] : null;
  const bias = style ? (SPEND_BIAS[style] ?? 1) : 1;
  const affinity = style ? (SPEND_BRAND_AFFINITY[style] ?? 0.5) : 0.5;
  if (cap) {
    const distance = Math.abs(Math.log2((r.price || 1) / (cap * bias))) / 4;
    base += (1 - Math.min(1, distance)) * 0.8;
  }
  base += affinity * (r.brand ? 0.6 : 0.15);
  base += (r.rating || 0) * 0.1;
  base += Math.log10((r.num_ratings || 0) + 1) * 0.1;
  return base;
}

function ProductCard({ r, onAdd, onBuy, rec }) {
  return (
    <div className="card">
      <div className="cat">{displayCat(r.category)}</div>
      {rec ? <span className="rec">Top pick</span> : null}
      <div className="t">{r.title}</div>
      {r.brand ? <span className="brandb">{r.brand}</span> : null}
      <div className="prow"><span className="p">₹{r.price.toLocaleString("en-IN")}</span></div>
      <div className="r"><span className="star">★</span> {r.rating} · {r.num_ratings.toLocaleString("en-IN")} ratings</div>
      <div className="cardbtns">
        <button className="add" onClick={() => onAdd(r)}>Add to cart</button>
        <button className="buy" onClick={() => onBuy(r)}>Buy now</button>
      </div>
    </div>
  );
}

function AskCartHome() {
  const [input, setInput] = useState("");
  const params = useSearchParams();
  const [tab, setTab] = useState(() => (params.get("tab") === "analytics" ? "analytics" : "search"));
  const [anview, setAnview] = useState(() => {
    const v = params.get("anview");
    return v && ["overview", "search", "catalog", "journeys", "validation"].includes(v) ? v : "overview";
  });
  const [onboarded, setOnboarded] = useState(() => {
    try {
      if (new URLSearchParams(window.location.search).get("noob") === "1") return true;
      return localStorage.getItem("askcart_onboarded") === "1";
    } catch { return true; }
  });
  const [persona, setPersonaState] = useState(null);
  const [s, setS] = useState(null); // active search state (see below)
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [cart, setCart] = useState(() => (typeof window === "undefined" ? {} : lsCart()));
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [order, setOrder] = useState(null);
  const [isNewSession, setIsNewSession] = useState(() => {
    try { return !localStorage.getItem("askcart_session"); } catch { return true; }
  });
  const journeyRef = useRef(null); // {id, query, views:Set, added, ordered, ended, t0, prevTypes}
  const guideShownAtRef = useRef(0);

  useEffect(() => {
    fetch("/api/catalog-preview").then(r => r.json()).then(j => {
      if (Array.isArray(j.items)) setPreview(j);
    }).catch(() => {});
  }, []);

  const didAutoSearch = useRef(false);
  useEffect(() => {
    if (didAutoSearch.current) return; // StrictMode dev double-mount guard
    didAutoSearch.current = true;
    if (isNewSession) track("session_start", { new: true });
    const q = params.get("q");
    if (q && tab === "search") startSearch(q, "deep_link");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try { localStorage.setItem("askcart_cart", JSON.stringify(cart)); } catch {}
  }, [cart]);

  function ensureJourney(query) {
    if (journeyRef.current && !journeyRef.current.ended && journeyRef.current.query === query) return journeyRef.current;
    return { id: "j_" + Math.random().toString(36).slice(2, 9), query, views: new Set(), added: false, ordered: false, ended: false, t0: Date.now(), prevTypes: [] };
  }
  function endJourney(j, { resolved: ok, turns: t, ordered = false }) {
    if (j.ended) return;
    j.ended = true;
    track("journey_end", {
      query: j.query, journey_id: j.id, turns: t, resolved: ok,
      n_views: j.views.size, added_to_cart: j.added, ordered,
      ms: Date.now() - j.t0,
    });
  }

  function switchTab(next) {
    setTab(next);
    try { window.history.replaceState(null, "", "/?tab=" + next); } catch {}
    track("page_view", { screen: next });
  }
  function switchAnview(next) {
    setAnview(next);
    try { window.history.replaceState(null, "", "/?tab=analytics&anview=" + next); } catch {}
    track("page_view", { screen: "analytics", subtab: next });
  }

  async function doSearch(query, { relax = false, category = null, occasion = null, budget = null, turn = 1, limit = 48 } = {}) {
    try {
      const t0 = Date.now();
      const r = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, relax, category, occasion, budget, limit }),
      });
      const j = await r.json();
      if (!Array.isArray(j.results)) {
        track("search_error", { error: j.error || ("HTTP " + r.status), query, turn });
        return { results: [], error: j.error || ("HTTP " + r.status) };
      }
      const jn = journeyRef.current;
      // Null = <2 intent-matched results (the study's definition of a
      // failed search). A search that returns many loosely-related items
      // but nothing on-intent is a null for the shopper.
      const intentN = j.results.filter((r) => r.intent).length;
      track("search_results", {
        query, n_results: j.results.length, intent_n: intentN, ms: Date.now() - t0,
        turn, relax, null: intentN < 2, journey_id: jn ? jn.id : null,
      });
      if (intentN < 2) track("zero_result", { query, turn, intent_n: intentN });
      return j;
    } catch (e) {
      track("search_error", { error: String(e).slice(0, 120), query, turn });
      return { results: [], error: String(e).slice(0, 120) };
    }
  }

  async function askGuide(query, nResults, turn) {
    const jn = journeyRef.current;
    const prevTypes = jn ? jn.prevTypes || [] : [];
    const r = await fetch("/api/guide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, n_results: nResults, turn, prev_types: prevTypes, journey_id: jn ? jn.id : null }),
    });
    return r.json();
  }

  function markResultsShown(query, results, turn, source) {
    const jn = journeyRef.current;
    if (!jn) return;
    results.forEach((r, i) => {
      if (!jn.views.has(r.sku)) {
        jn.views.add(r.sku);
        track("product_view", {
          sku: r.sku, title: r.title, category: r.category, brand: r.brand || "",
          price: r.price, rating: r.rating, position: i + 1,
          query, turn, source, journey_id: jn.id,
        });
      }
    });
  }

  async function startSearch(query, source = "input") {
    if (!query.trim() || busy) return;
    if (journeyRef.current && !journeyRef.current.ended) {
      endJourney(journeyRef.current, { resolved: !!s && s.ok === true, turns: s ? s.turn : 1 });
    }
    setBusy(true);
    setS({ query, turn: 1, ok: null, results: [], filters: { ...DEFAULT_FILTERS }, guide: null, trail: [query], exhausted: false, error: null });
    setInput("");
    journeyRef.current = ensureJourney(query);
    track("search_start", { query, source, journey_id: journeyRef.current.id });
    const t0 = Date.now();
    let res = await doSearch(query, { turn: 1 });
    if (res.error) {
      setS((st) => st && { ...st, error: res.error });
      setBusy(false);
      endJourney(journeyRef.current, { resolved: false, turns: 1 });
      return;
    }
    // Resolution = ≥2 intent-matched results (same definition the n=150
    // study and the simulation use). Loose/relax results alone do not count.
    const ok = res.results.filter((r) => r.intent).length >= 2;
    markResultsShown(query, res.results, 1, "results");
    setS({ query, turn: 1, ok, ms: Date.now() - t0, results: res.results, filters: { ...DEFAULT_FILTERS }, guide: null, trail: [query], exhausted: false, error: null });
    if (ok) {
      track("resolved", { query, turns: 1, n_results: res.results.filter((r) => r.intent).length, journey_id: journeyRef.current.id });
      // Optional refinement: the policy decides if one more question adds
      // value (e.g. budget for an open-ended "headphones" query).
      // n_results = intent-hit count (same semantics as the study).
      const g = await askGuide(query, res.results.filter((r) => r.intent).length, 2);
      if (g.guide) {
        journeyRef.current.prevTypes = [...(journeyRef.current.prevTypes || []), g.guide.type];
        guideShownAtRef.current = Date.now();
        track("guide_question_shown", {
          query, question_type: g.guide.type, turn: 2, options_count: g.guide.options.length,
          mode: g.mode, refine: true, reason: g.decision && g.decision.reason,
          journey_id: journeyRef.current.id,
        });
        setS((st) => st && { ...st, guide: { ...g.guide, mode: g.mode, refine: true } });
      } else {
        endJourney(journeyRef.current, { resolved: true, turns: 1 });
      }
      setBusy(false); return;
    }
    for (let turn = 2; turn <= 4; turn++) {
      const g = await askGuide(query, res.results.filter((r) => r.intent).length, turn);
      const guide = g.guide;
      if (!guide) {
        track("guide_no_question", { query, turn, reason: (g.decision && g.decision.reason) || "" });
        track("unresolved", { query, turns: turn - 1 });
        setS((st) => st && { ...st, exhausted: true });
        endJourney(journeyRef.current, { resolved: false, turns: turn - 1 });
        setBusy(false);
        return;
      }
      journeyRef.current.prevTypes = [...(journeyRef.current.prevTypes || []), guide.type];
      guideShownAtRef.current = Date.now();
      track("guide_question_shown", {
        query, question_type: guide.type, turn, options_count: guide.options.length,
        mode: g.mode, reason: g.decision && g.decision.reason, journey_id: journeyRef.current.id,
      });
      // s.turn stays at the last displayed search (1) - the search after
      // this chip answer is turn 2, same numbering as the n=150 study.
      setS((st) => st && { ...st, guide: { ...guide, mode: g.mode, refine: false } });
      break; // user picks a chip
    }
    setBusy(false);
  }

  async function pickChip(chip, guide) {
    if (!s || busy) return;
    setBusy(true);
    const turnNow = s.turn + 1;
    track("guide_option_selected", {
      query: s.query, question_type: guide.type, option: chip, turn: turnNow,
      ttfc_ms: Date.now() - guideShownAtRef.current, journey_id: journeyRef.current ? journeyRef.current.id : null,
    });
    const t0 = Date.now();
    let opts = {};
    if (guide.type === "budget") {
      const nums = (String(chip).match(/[\d,]+/g) || []).map((x) => parseInt(x.replace(/,/g, ""), 10)).filter((n) => n > 0);
      if (/not sure|flexible/i.test(chip)) {
        const p = getPersona();
        const def = p ? BUDGET_STYLE_MAX[p.budgetStyle || p.spendStyle] : null;
        if (def) opts = { budget: def };
      } else if (nums.length) {
        opts = { budget: Math.max(...nums) }; // cap at the band's top
      }
    } else if (guide.type === "occasion") {
      const key = String(chip).toLowerCase().split("/")[0].trim();
      const map = { gift: "gift", birthday: "birthday", wedding: "wedding", shaadi: "wedding",
                    anniversary: "anniversary", party: "party", diwali: "diwali",
                    christmas: "christmas", valentines: "valentines",
                    graduation: "graduation", housewarming: "housewarming",
                    everyday: null, daily: null };
      opts = { occasion: map[key] !== undefined ? map[key] : null };
    } else if (guide.type === "brand") {
      opts = { brand: /no preference|best rated/i.test(chip) ? "best_rated" : chip };
    } else {
      opts = { category: chip };
    }
    let res = await doSearch(s.query, { relax: true, turn: turnNow, ...opts });
    if (res.error) {
      setS((st) => st && { ...st, error: res.error });
      setBusy(false);
      return;
    }
    if (res.results.filter((r) => r.intent).length < 2 && opts.category) {
      // the picked category was a dead end - retry without it, other
      // constraints (budget/occasion) still applied
      res = await doSearch(s.query, { relax: true, turn: turnNow, category: null,
                                      budget: opts.budget ?? null, occasion: opts.occasion ?? null });
    }
    // Never move the shopper away from a good result set: if their answer
    // made things worse, keep the previous picks and say so.
    const newIntent = res.results.filter((r) => r.intent).length;
    const oldIntent = s.results.filter((r) => r.intent).length;
    const keepNew = newIntent > oldIntent || (newIntent === oldIntent && res.results.length >= s.results.length);
    const finalResults = keepNew ? res.results : s.results;
    const ok = finalResults.filter((r) => r.intent).length >= 2;
    const wasOk = s.ok === true;
    markResultsShown(s.query, finalResults, turnNow, "results");
    setS({ ...s, turn: turnNow, ok, ms: Date.now() - t0, results: finalResults,
           filters: { ...DEFAULT_FILTERS }, guide: null, trail: [...s.trail, chip], error: null });
    if (ok) {
      track("resolved", { query: s.query, turns: turnNow, n_results: finalResults.filter((r) => r.intent).length, journey_id: journeyRef.current.id });
      endJourney(journeyRef.current, { resolved: true, turns: turnNow, ordered: journeyRef.current.ordered });
      setBusy(false);
      return;
    }
    // Keep guiding: if the results are still thin, the policy may have
    // another question type left (up to 3 follow-ups / 4 turns per journey,
    // the same turn budget the n=150 study measures). We only stop when
    // the shopper is at their destination or no question is left.
    if (turnNow < 4) {
      const g = await askGuide(s.query, finalResults.filter((r) => r.intent).length, turnNow + 1);
      if (g.guide) {
        journeyRef.current.prevTypes = [...(journeyRef.current.prevTypes || []), g.guide.type];
        guideShownAtRef.current = Date.now();
        track("guide_question_shown", {
          query: s.query, question_type: g.guide.type, turn: turnNow + 1,
          options_count: g.guide.options.length, mode: g.mode,
          reason: g.decision && g.decision.reason, journey_id: journeyRef.current.id,
        });
        setS((st) => st && { ...st, guide: { ...g.guide, mode: g.mode, refine: false } });
        setBusy(false);
        return;
      }
      track("guide_no_question", { query: s.query, turn: turnNow + 1, reason: (g.decision && g.decision.reason) || "" });
    }
    const resolvedNow = ok || wasOk;
    if (!resolvedNow) track("unresolved", { query: s.query, turns: turnNow });
    setS((st) => st && { ...st, exhausted: true });
    endJourney(journeyRef.current, { resolved: resolvedNow, turns: turnNow, ordered: journeyRef.current.ordered });
    setBusy(false);
  }

  function setFilter(type, value) {
    if (!s || busy) return;
    const jn = journeyRef.current;
    const nBefore = applyFilters(s.results, s.filters).length;
    let nf;
    if (type === "sort") nf = { ...s.filters, sort: value };
    else if (type === "brand") nf = { ...s.filters, brands: s.filters.brands.includes(value)
      ? s.filters.brands.filter((x) => x !== value) : [...s.filters.brands, value] };
    else if (type === "price_band") nf = { ...s.filters, band: s.filters.band === value ? null : value };
    else if (type === "rating") nf = { ...s.filters, rating4: !s.filters.rating4 };
    else if (type === "category") nf = { ...s.filters, category: s.filters.category === value ? null : value };
    else if (type === "clear") nf = { ...DEFAULT_FILTERS };
    const nAfter = applyFilters(s.results, nf).length;
    setS({ ...s, filters: nf });
    track("filter_applied", {
      query: s.query, turn: s.turn, filter_type: type, value: String(value),
      n_before: nBefore, n_after: nAfter, journey_id: jn ? jn.id : null,
    });
  }

  function addToCart(item, from) {
    const jn = journeyRef.current;
    if (jn) jn.added = true;
    const nextSize = Object.keys(cart).length + (cart[item.sku] ? 0 : 1);
    track("add_to_cart", {
      sku: item.sku, price: item.price, category: item.category, brand: item.brand || "",
      cart_size: nextSize, from, journey_id: jn ? jn.id : null,
      query: jn ? jn.query : null,
    });
    if (from === "recommended" && jn) {
      track("recommendation_click", { sku: item.sku, query: jn.query, brand: item.brand || "", journey_id: jn.id });
    }
    setCart((c) => ({ ...c, [item.sku]: { item, qty: (c[item.sku] ? c[item.sku].qty : 0) + 1 } }));
  }
  function buyNow(item) {
    const jn = journeyRef.current;
    if (jn) jn.added = true;
    if (jn && item._from === "recommended") {
      track("recommendation_click", { sku: item.sku, query: jn.query, brand: item.brand || "", journey_id: jn.id });
    }
    track("buy_now", { sku: item.sku, price: item.price, category: item.category, brand: item.brand || "" });
    setCart({ [item.sku]: { item, qty: 1 } });
    track("checkout_start", { item_count: 1, total: item.price, source: "buy_now" });
    setCheckoutOpen(true);
  }
  function placeOrder(total) {
    const items = Object.entries(cart);
    const jn = journeyRef.current;
    if (jn) {
      jn.ordered = true;
      if (!jn.ended) endJourney(jn, { resolved: true, turns: s ? s.turn : 1, ordered: true });
    }
    const id = "ord_" + Math.random().toString(36).slice(2, 8);
    setOrder({ id, count: items.length, total });
    setCheckoutOpen(false);
    setCart({});
    setCartOpen(false);
  }

  function onOnboarded(p) {
    setOnboarded(true);
    setPersonaState(p);
    try { localStorage.setItem("askcart_onboarded", "1"); } catch {}
  }

  const cartCount = Object.values(cart).reduce((a, e) => a + e.qty, 0);

  // ---- derived search layout -------------------------------------------
  const layout = useMemo(() => {
    if (!s || !s.results.length) return null;
    const filtered = applyFilters(s.results, s.filters);
    if (!filtered.length) return { filtered, rec: [], groups: [], more: [] };
    const rec = [...filtered].sort((a, b) => recommendScore(b, persona) - recommendScore(a, persona)).slice(0, 3);
    const recSet = new Set(rec.map((r) => r.sku));
    const rest = filtered.filter((r) => !recSet.has(r.sku));
    const catCount = new Map();
    for (const r of rest) catCount.set(r.category, (catCount.get(r.category) || 0) + 1);
    const topCats = [...catCount.entries()].sort((a, b) => b[1] - a[1])
      .filter(([, c]) => c >= 2).slice(0, 3).map(([k]) => k);
    const groups = topCats.map((cat) => ({ cat, items: rest.filter((r) => r.category === cat).slice(0, 4) }));
    const groupedSet = new Set(groups.flatMap((g) => g.items.map((r) => r.sku)));
    const more = rest.filter((r) => !groupedSet.has(r.sku));
    return { filtered, rec, groups, more };
  }, [s, persona]);

  const brandOpts = useMemo(() => {
    if (!s || !s.results.length) return [];
    const m = new Map();
    for (const r of s.results) if (r.brand) m.set(r.brand, (m.get(r.brand) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([b]) => b);
  }, [s]);
  const catOpts = useMemo(() => {
    if (!s || !s.results.length) return [];
    const m = new Map();
    for (const r of s.results) m.set(r.category, (m.get(r.category) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c);
  }, [s]);
  const f = s ? s.filters : DEFAULT_FILTERS;
  const activeFilterCount = (f.brands.length ? 1 : 0) + (f.band ? 1 : 0) + (f.rating4 ? 1 : 0) + (f.category ? 1 : 0) + (f.sort !== "relevance" ? 1 : 0);

  const cardProps = (from) => ({
    onAdd: (r) => addToCart(r, from),
    onBuy: (r) => buyNow({ ...r, _from: from }),
  });

  return (
    <>
      <div className="topbar">
        <div className="topbar-inner">
          <div className="logo" onClick={() => { setTab("search"); window.scrollTo({ top: 0 }); }}>
            <div className="logo-mark">A</div>
            <div className="logo-word">Ask<span>Cart</span></div>
            <span className="logo-tag">guided shopping · India</span>
          </div>
          <nav className="topnav">
            <button className={tab === "search" ? "on" : ""} onClick={() => switchTab("search")}>Search</button>
          </nav>
          <span className="topbar-spacer" />
          <button className={"anbtn" + (tab === "analytics" ? " on" : "")} onClick={() => switchTab("analytics")}>
            <span className="anbtn-dot" /> Analytics
          </button>
          <button className={"cartbtn" + (cartOpen ? " on" : "")} onClick={() => { setCartOpen(true); track("cart_view", { item_count: cartCount, total: Object.values(cart).reduce((a, e) => a + e.item.price * e.qty, 0) }); }}>
            <span className="carticon">🛒</span> Cart
            {cartCount > 0 && <span className="cartcount">{cartCount}</span>}
          </button>
        </div>
      </div>
      <div className="wrap">
        {tab === "search" ? (
          !onboarded ? <Onboarding onDone={onOnboarded} /> : (
            <>
              {!s && (
                <div className="hero">
                  <h1>Find it in <em>two questions</em>.</h1>
                  <div className="sub">Guided e-commerce search over a 36,000-product Indian catalogue. Ask in plain language — when we can't nail it, we ask one quick question: budget, occasion, category, or brand.</div>
                  <div className="searchbar">
                    <input value={input} onChange={(e) => setInput(e.target.value)}
                           onKeyDown={(e) => e.key === "Enter" && startSearch(input, "input")}
                           placeholder='Try: "shaadi gift under 2k"' />
                    <button onClick={() => startSearch(input, "input")} disabled={busy}>{busy ? "…" : "Search"}</button>
                  </div>
                  <div className="ex">
                    <span className="exl">Popular:</span>
                    {EXAMPLES.map((e) => <span key={e} onClick={() => startSearch(e, "example")}>{e}</span>)}
                  </div>
                </div>
              )}
              {s && (
                <div className="hero" style={{ paddingBottom: 0 }}>
                  <div className="searchbar">
                    <input value={input} onChange={(e) => setInput(e.target.value)}
                           onKeyDown={(e) => e.key === "Enter" && startSearch(input, "input")}
                           placeholder='Refine or ask again: "wristwatch for dad under 5k"' />
                    <button onClick={() => startSearch(input, "input")} disabled={busy}>{busy ? "…" : "Search"}</button>
                  </div>
                </div>
              )}

              {s && (
                <div className="trail">
                  <span className="step"><b>Search</b>&nbsp; {s.query}</span>
                  {s.trail.slice(1).map((t, i) => (
                    <span key={i} style={{ display: "contents" }}>
                      <span className="arrow">→</span>
                      <span className="step">{t}</span>
                    </span>
                  ))}
                </div>
              )}
              {s && s.rollback && (
                <div className="meta" style={{ marginTop: -8, marginBottom: 10 }}>
                  That answer didn't improve the match, so I kept your previous picks.
                </div>
              )}

              {s && s.guide && (
                <div className="qcard">
                  <div className="qe">{s.guide.refine ? "Optional refinement" : "One quick question"}</div>
                  <div className="q">{s.guide.question}{s.guide.refine ? " — the results below are ready to shop" : ""}</div>
                  <div className="chips">
                    {s.guide.options.map((c) => <button key={c} onClick={() => pickChip(c, s.guide)} disabled={busy}>{c}</button>)}
                  </div>
                </div>
              )}

              {s && s.error && (
                <div className="nullmsg">Search hiccup — {s.error}. Try again.</div>
              )}

              {s && !s.error && !s.guide && s.ok === false && (
                <div className="dim" style={{ marginTop: 16 }}>
                  <h3>{s.results.length === 0 ? "No products matched that exactly" : `No exact match for “${s.query}” in the catalogue`}</h3>
                  <div style={{ fontSize: 13.5, color: "var(--sub)", marginBottom: 12 }}>
                    {s.results.length === 0
                      ? (s.exhausted
                        ? "We ran out of follow-up questions — try one of these instead, or rephrase."
                        : "Picking an option above usually fixes this.")
                      : (s.exhausted
                        ? "We asked all three quick questions, so these are the closest picks from your last answer — browse them, or rephrase for a sharper search."
                        : "These are close, not exact — the question above should get you there.")}
                  </div>
                  {s.results.length === 0 && s.exhausted && (
                    <div className="ex">
                      {EXAMPLES.map((e) => <span key={e} onClick={() => startSearch(e, "example")}>{e}</span>)}
                    </div>
                  )}
                </div>
              )}

              {s && s.results.length > 0 && layout && (
                <>
                  <div className="filters">
                    <div className="frow">
                      <span className="flabel">Sort</span>
                      {SORTS.map((x) => (
                        <button key={x.id} className={f.sort === x.id ? "fchip on" : "fchip"} onClick={() => setFilter("sort", x.id)}>{x.label}</button>
                      ))}
                      <span className="fsep" />
                      <span className="flabel">Price</span>
                      {PRICE_BANDS.map((b) => (
                        <button key={b.id} className={f.band === b.id ? "fchip on" : "fchip"} onClick={() => setFilter("price_band", b.id)}>{b.label}</button>
                      ))}
                      <button className={f.rating4 ? "fchip on" : "fchip"} onClick={() => setFilter("rating", "4★+")}>4★ & up</button>
                      {brandOpts.length > 0 && (<><span className="fsep" /><span className="flabel">Brand</span>
                        {brandOpts.map((b) => (
                          <button key={b} className={f.brands.includes(b) ? "fchip on" : "fchip"} onClick={() => setFilter("brand", b)}>{b}</button>
                        ))}
                      </>)}
                      {catOpts.length > 0 && (<><span className="fsep" /><span className="flabel">Category</span>
                        {catOpts.map((c) => (
                          <button key={c} className={f.category === c ? "fchip on" : "fchip"} onClick={() => setFilter("category", c)}>{displayCat(c)}</button>
                        ))}
                      </>)}
                      {activeFilterCount > 0 && (
                        <button className="fchip clear" onClick={() => setFilter("clear", "clear")}>Clear all</button>
                      )}
                      <span className="filter-meta">{layout.filtered.length} of {s.results.length} products{s.ms ? ` · ${s.ms} ms` : ""}</span>
                    </div>
                  </div>

                  {layout.filtered.length === 0 ? (
                    <div className="dim" style={{ marginTop: 4 }}>
                      <h3>Nothing left after your filters</h3>
                      <div style={{ fontSize: 13.5, color: "var(--sub)" }}>
                        Loosen a filter, or <button className="fchip clear" style={{ border: "none", background: "none", color: "var(--red)", cursor: "pointer", fontWeight: 700 }} onClick={() => setFilter("clear", "clear")}>clear all</button> to see every result again.
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="group">
                        <div className="gh">
                          <h3>Recommended for you</h3>
                          <span className="gc">ranked by your profile · price fit, brand preference, quality & trust</span>
                        </div>
                        <div className="grid">
                          {layout.rec.map((r) => <ProductCard key={r.sku} r={r} rec {...cardProps("recommended")} />)}
                        </div>
                      </div>
                      {layout.groups.map((g) => (
                        <div className="group" key={g.cat}>
                          <div className="gh">
                            <h3>{displayCat(g.cat)}</h3>
                            <span className="gc">{g.items.length} picks from this match</span>
                          </div>
                          <div className="grid">
                            {g.items.map((r) => <ProductCard key={r.sku} r={r} {...cardProps("results")} />)}
                          </div>
                        </div>
                      ))}
                      {layout.more.length > 0 && (
                        <div className="group">
                          <div className="gh">
                            <h3>More products</h3>
                            <span className="gc">{layout.more.length} more in this result set</span>
                          </div>
                          <div className="grid">
                            {layout.more.slice(0, 24).map((r) => <ProductCard key={r.sku} r={r} {...cardProps("results")} />)}
                          </div>
                        </div>
                      )}
                      {s.ok === false && s.turn < 4 && (
                        <div className="meta">One follow-up question can usually tighten this — pick an option above.</div>
                      )}
                    </>
                  )}
                </>
              )}

              {!s && preview && (
                <div>
                  <div className="sec-head">
                    <h2>Trending across price bands</h2>
                    <span className="count">{preview.catalogSize.toLocaleString("en-IN")} products loaded · best-rated per band</span>
                  </div>
                  <div className="grid">
                    {preview.items.map((r) => <ProductCard key={r.sku} r={r} {...cardProps("preview")} />)}
                  </div>
                </div>
              )}
            </>
          )
        ) : (
          <AnalyticsView anview={anview} setAnview={switchAnview} />
        )}
      </div>
      <footer>
        <div className="foot-inner">
          <div className="foot-brand">Ask<span>Cart</span> · guided shopping search</div>
          <div className="foot-col">36,045-SKU Indian catalogue (real listings, INR pricing) · Qwen-guided follow-up questions · 6-stage DuckDB review pipeline with Bayesian ratings</div>
          <div className="foot-col">Study: null results 27.3% → 8.0% · 78.7% resolved within 2 turns (n=150) · 3,000-query simulation: 0.0% null, 98.6% by turn 2 · the guide keeps asking (max 3 quick questions) until you're at the product</div>
          <div className="foot-note">Prototype MVP — checkout is simulated, no payments processed. Every interaction event is public in Analytics. Internal search tags are backend-only and never shown to shoppers.</div>
        </div>
      </footer>
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} cart={cart} setCart={setCart}
                  onCheckout={(total) => { setCartOpen(false); setCheckoutOpen(true); }} />
      <CheckoutModal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} cart={cart} onPlaced={placeOrder} />
      <OrderToast order={order} onClose={() => setOrder(null)} />
    </>
  );
}

export default function Home() {
  return <AskCartHome />;
}
