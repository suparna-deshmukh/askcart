"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { track, getPersona, cohortOf, getSessionId } from "./lib/track";
import { t } from "./lib/i18n";
import { Onboarding, BUDGET_STYLE_MAX, SPEND_BIAS, SPEND_BRAND_AFFINITY } from "./ui/onboarding";
import { CartDrawer, CheckoutModal, OrderToast } from "./ui/cart";
import { AnalyticsView } from "./ui/analytics";
import { OrdersView } from "./ui/orders";
import { ProductDetail, Tile } from "./ui/pdp";
import { ChatLauncher } from "./ui/chat/ChatLauncher";
import { ChatPanel } from "./ui/chat/ChatPanel";
import { SAMPLE_QUERIES } from "./lib/sample_queries";

// Hero "popular" chips - single source of truth in lib/sample_queries.js
// (verified against the live search API; precomputed in the semantic
// query-emb cache; clicks tracked with source:"example" -> Analytics).
const EXAMPLES = SAMPLE_QUERIES;

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
const DEFAULT_FILTERS = { sort: "relevance", brands: [], band: null, rating4: false, category: null, noAccessories: false };

// O2: coarse region from pincode (demo use only: festival ordering +
// delivery estimate). Coarse by design — analytics never see the pincode.
function pinRegion(pin) {
  const p = parseInt(String(pin).slice(0, 2), 10);
  if (isNaN(p)) return null;
  if (p <= 29) return "north";
  if (p <= 38) return "east";
  if (p <= 53) return p >= 39 ? "west" : "south";
  if (p <= 68) return "south";
  if (p <= 70) return "west";
  if (p <= 74) return "east";
  if (p <= 80) return "ne";
  if (p <= 84) return "east";
  return "central";
}

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

const fmtK = (n) => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n);
// Price bands adapt to the query's stated budget: "gift under 2000" never
// offers a band above ₹2,000, and a band that can't narrow the set (the
// query already bounds it) is hidden entirely.
function priceBandsFor(budget) {
  if (!budget) return PRICE_BANDS;
  const out = [];
  for (const b of PRICE_BANDS) {
    if (b.min >= budget) break;
    const max = Math.min(b.max === Infinity ? budget : b.max, budget);
    if (max <= b.min) break;
    out.push({ ...b, max, label: b.min === 0 ? `under ₹${fmtK(max)}` : `₹${fmtK(b.min)}–${fmtK(max)}` });
  }
  if (out.length === 1 && out[0].min === 0 && out[0].max >= budget) return [];
  return out;
}

function applyFilters(items, f, bands) {
  let out = items;
  if (f.brands.length) out = out.filter((r) => r.brand && f.brands.includes(r.brand));
  if (f.band) {
    const b = (bands || PRICE_BANDS).find((x) => x.id === f.band);
    out = out.filter((r) => r.price >= b.min && r.price < b.max);
  }
  if (f.rating4) out = out.filter((r) => (r.rating || 0) >= 4);
  // C3: accessory filter facet (cases/bands/chargers for host devices)
  if (f.noAccessories) out = out.filter((r) => !r.is_accessory);
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

// S7: fold variant families into one card and cap 2 cards per (brand, model)
// in the ranked grid, so near-duplicate listings can't fill the top of the page.
const VARIANT_PAREN = /\s*\([^()]+\)$/;
function groupGrid(items) {
  const out = [];
  const famSeen = new Set();
  const modelCount = new Map();
  for (const r of items) {
    const key = (r.brand || "") + "·" + String(r.title).replace(VARIANT_PAREN, "").toLowerCase();
    if (r.family_id) {
      if (famSeen.has(r.family_id)) continue; // one card per variant family
    }
    const n = modelCount.get(key) || 0;
    if (n >= 2) continue;                     // MMR: 2 cards per (brand, model)
    modelCount.set(key, n + 1);
    if (r.family_id) famSeen.add(r.family_id);
    out.push(r);
  }
  return out;
}

// 9.7 card v2: designed placeholder image, whole card opens the PDP,
// single Add button (Buy now moved to the PDP), Best match badge.
function ProductCard({ r, onAdd, onOpen, best, close, overBudget }) {
  const isFam = !!r.family_id;
  const title = isFam ? String(r.title).replace(VARIANT_PAREN, "") : r.title;
  const from = isFam && r.family_min_price != null && r.family_min_price < r.price;
  return (
    <div className="card" role="link" tabIndex={0} onClick={() => onOpen(r)}
         onKeyDown={(e) => e.key === "Enter" && onOpen(r)}>
      <div className="imwell">
        {best && <span className="badge-best">Best match</span>}
        {close && <span className="badge-close">Close match</span>}
        <Tile item={r} size={215} />
      </div>
      <div className="cat">{displayCat(r.category)}</div>
      <div className="t">{title}</div>
      {isFam && r.variant_summary && <div className="vline">{r.variant_summary}</div>}
      {r.brand ? <span className="brandb">{r.brand}</span> : null}
      <div className="prow"><span className="p">₹{r.price.toLocaleString("en-IN")}</span>
        {from && <span className="onwards">from ₹{r.family_min_price.toLocaleString("en-IN")}</span>}</div>
      <div className="rline">
        <span className={"rpill " + (r.rating >= 4 ? "good" : r.rating >= 3 ? "mid" : "low")}>★ {r.rating}</span>
        <span className="rc">{r.num_ratings.toLocaleString("en-IN")} ratings</span>
      </div>
      {overBudget && <div className="overbud">Slightly over your budget</div>}
      <button className="card-add" onClick={(e) => { e.stopPropagation(); onAdd(r); }}>Add to cart</button>
    </div>
  );
}

// G6: "why are we asking?" — deterministic copy tied to the mined root
// causes (no LLM). The numbers in the copy are the corpus shares.
const WHY_COPY = {
  budget: "Prices in this search span a wide range — a budget keeps you from scrolling past things you can't afford. (2nd most common reason searches fail.)",
  occasion: "The same product can be for a shaadi, a birthday or everyday use — the occasion changes what counts as a good match. (Top reason gift searches miss.)",
  category: "Your search matched several different product types — picking one avoids unrelated results. (3rd most common reason searches fail.)",
  brand: "Within these results a few brands hold most of the ratings — brand is the fastest way to trust a pick. (The #1 reason shoppers distrust results.)",
  any: "No single filter dominated these results, so this is an open question — type a brand, a use or a detail and the results re-rank on it.",
};

function QuestionCard({ guide, lang, busy, onChip, onTyped, onSkip, progress = 1 }) {
  const [whyOpen, setWhyOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const inputRef = useRef(null);
  const counts = Object.fromEntries((guide.optionCounts || []).map((c) => [c.label, c.count]));
  // Every question (strip or card) carries options PLUS a typed escape:
  // the last chip ("Something else") focuses the input, so the shopper
  // can always answer in their own words.
  const refine = !!guide.refine;
  const submitTyped = () => { if (typed.trim()) { onTyped(typed); setTyped(""); } };
  const focusTyped = () => { try { inputRef.current && inputRef.current.focus(); } catch {} };
  if (refine) {
    // G11: resolved searches get a compact strip, never a card pushing
    // results down. Chips wrap (never cut off) and the typed row sits at
    // the end as the "Next - type it yourself" option.
    return (
      <div className="qstrip" role="group" aria-label={t(lang, "qOptional")}>
        <span className="qstrip-lbl">{t(lang, "qOptional")}</span>
        <span className="qstrip-prog" title={"Question " + progress + " of 4"}>{progress}/4</span>
        <span className="qstrip-q">{guide.question}</span>
        <div className="qstrip-chips">
          {guide.options.map((c) => (
            <button key={c} className="qchip" onClick={() => onChip(c)} disabled={busy || counts[c] === 0}>
              {c}{counts[c] != null && <span className="ccnt">{counts[c]}</span>}
            </button>
          ))}
          {guide.options.length > 0 && (
            <button className="qchip qchip-more" onClick={focusTyped}>{t(lang, "somethingElse")}</button>
          )}
        </div>
        <div className="qstrip-typed">
          <input ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)}
                 onKeyDown={(e) => e.key === "Enter" && submitTyped()}
                 placeholder={t(lang, "orType")} aria-label="Type your answer" maxLength={80} />
          <button onClick={submitTyped} disabled={busy || !typed.trim()}>{t(lang, "send")}</button>
        </div>
        {guide.reason && <span className="qstrip-why" title={guide.reason}>{guide.reason}</span>}
        <button className="qstrip-skip" onClick={onSkip}>{t(lang, "skipQuestion")}</button>
      </div>
    );
  }
  return (
    <div className="qcard">
      <div className="qe">
        <span>{t(lang, "qEyebrow")}</span>
        <span className="qprog" title={"Question " + progress + " of 4"}>{progress}/4</span>
        <button className="qcard-why" onClick={() => setWhyOpen(!whyOpen)} aria-expanded={whyOpen}>ⓘ {t(lang, "whyAsk")}</button>
        <button className="qcard-skip" onClick={onSkip}>{t(lang, "skipQuestion")}</button>
      </div>
      {whyOpen && <div className="qcard-whybox">{WHY_COPY[guide.type] || WHY_COPY.budget}</div>}
      <div className="q">{guide.question}</div>
      <div className="chips" role="radiogroup" aria-label={guide.question}>
        {guide.options.map((c) => (
          <button key={c} role="radio" aria-checked="false"
                  onClick={() => onChip(c)} disabled={busy || counts[c] === 0}>
            {c}{counts[c] != null && <span className="ccnt">{counts[c]}</span>}
          </button>
        ))}
        {guide.options.length > 0 && (
          <button className="qchip qchip-more" onClick={focusTyped}>{t(lang, "somethingElse")}</button>
        )}
      </div>
      <div className="qcard-typed">
        <input ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)}
               onKeyDown={(e) => e.key === "Enter" && submitTyped()}
               placeholder={t(lang, "orType")} aria-label="Type your answer" maxLength={80} />
        <button onClick={submitTyped} disabled={busy || !typed.trim()}>{t(lang, "send")}</button>
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
  // SSR-safe: server and first client render must agree; localStorage state is
  // synced after mount (prevents hydration mismatches on the hero strip).
  const [onboarded, setOnboarded] = useState(true);
  const [persona, setPersonaState] = useState(null);
  // O1/O2: language + pincode strip (non-blocking), persona v3 learning later.
  const [lang, setLangState] = useState("en");
  const [pin, setPin] = useState("");
  const [region, setRegion] = useState(null);
  const [stripDismissed, setStripDismissed] = useState(true);
  useEffect(() => {
    try {
      const noob = new URLSearchParams(window.location.search).get("noob") === "1";
      if (!noob && localStorage.getItem("askcart_onboarded") !== "1") {
        setOnboarded(false);
        // 2026-11-06: first visit -> centered 3-question persona modal
        setPersonaModal(true);
      }
      const l = localStorage.getItem("askcart_lang");
      if (["en", "hi", "hinglish"].includes(l)) setLangState(l);
      const rv = JSON.parse(localStorage.getItem("askcart_region") || "null");
      if (rv && rv.region) setRegion(rv.region);
      setStripDismissed(localStorage.getItem("askcart_strip_dismissed") === "1");
    } catch {}
    // LLM routing status for the top-bar pill (no LLM call made).
    fetch("/api/ai-status").then((r) => r.json()).then((j) => {
      if (j && j.ok) {
        setAiStatus(j);
        aiBudgetRef.current = Math.max(1, Number(j.aiMaxPerSession) || 8);
      }
    }).catch(() => {});
  }, []);
  const [stripOpen, setStripOpen] = useState(false);
  const [personaModal, setPersonaModal] = useState(false);
  const [obToast, setObToast] = useState(null);
  const [cartToast, setCartToast] = useState(null);
  // LLM routing status (top-bar pill + key-rotation toasts).
  const [aiStatus, setAiStatus] = useState(null); // {qwen, gemini, aiMaxPerSession}
  const [aiToast, setAiToast] = useState(null);
  const lastAiViaRef = useRef(null);   // "qwen" | "gemini"
  const lastAiKeyRef = useRef(null);
  const aiBudgetRef = useRef(8);       // AI decisions per session (cost cap)
  const aiBudgetNotedRef = useRef(false);
  useEffect(() => { try { document.documentElement.lang = lang === "hi" ? "hi" : lang === "hinglish" ? "hi-Latn" : "en"; } catch {} }, [lang]);
  function setLang(l) {
    setLangState(l);
    try { localStorage.setItem("askcart_lang", l); } catch {}
    track("language_change", { lang: l });
  }
  function dismissStrip() {
    setStripDismissed(true);
    setStripOpen(false);
    try { localStorage.setItem("askcart_strip_dismissed", "1"); } catch {}
    track("onboarding_strip_dismissed", {});
  }
  function saveRegion() {
    if (pin.length !== 6) return;
    const r = { pincode: pin, region: pinRegion(pin) };
    try { localStorage.setItem("askcart_region", JSON.stringify(r)); } catch {}
    setRegion(r.region);
    setStripDismissed(true);
    setStripOpen(false);
    track("region_set", { region: r.region });
  }
  const [s, setS] = useState(null); // active search state (see below)
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  // SSR-safe: server and first client render must agree. The old
  // typeof-window initializer hydrated a previous session's cart on the
  // client only -> "Hydration failed" mismatch on the cart badge. Cart
  // hydrates after mount instead.
  const [cart, setCart] = useState({});
  const [cartHydrated, setCartHydrated] = useState(false);
  useEffect(() => {
    const c = lsCart();
    if (c && Object.keys(c).length) setCart(c);
    setCartHydrated(true);
  }, []);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [order, setOrder] = useState(null);
  // 7.1: product detail drawer (linkable via ?sku=)
  const [pdp, setPdp] = useState(null);
  const [moreN, setMoreN] = useState(24); // 7.3: "Show more" page size
  // P3-lite: Plain = the legacy keyword baseline (naive mode: no budget/
  // occasion understanding, no questions) kept only as a reviewer A/B
  // behind ?mode=plain. Guided is the default and the only mode the UI
  // offers - a guided-search product must not make the shopper pick the
  // mode (product requirement 2026-11-05).
  const [plainMode, setPlainMode] = useState(() => params.get("mode") === "plain");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatNudge, setChatNudge] = useState(false);
  // Chat-shared session: a search the assistant applies re-runs the SAME
  // guided engine with the assistant's slots; the page never asks its own
  // question on top (the chat is the question UI). Trail chips stay removable.
  async function chatApplySearch(query, opts = {}, meta = {}) {
    if (!query || !query.trim() || busy) return;
    if (journeyRef.current && !journeyRef.current.ended) {
      endJourney(journeyRef.current, { resolved: !!s && s.ok === true, turns: s ? s.turn : 1 });
    }
    setBusy(true);
    const t0 = Date.now();
    const res = await doSearch(query, { ...opts, turn: 1, limit: 48 });
    setBusy(false);
    if (res.error) { setS((st) => st && { ...st, error: res.error }); return; }
    const ok = res.results.filter((r) => r.intent).length >= 2;
    journeyRef.current = ensureJourney(query);
    markResultsShown(query, res.results, 1, "chat");
    track("chat_apply_to_results", { query, slots_changed: Object.keys(opts).filter((k) => opts[k] != null).length, journey_id: journeyRef.current.id });
    const trail = [query];
    if (meta.trailLabel) trail.push({ label: meta.trailLabel, opts: { budget: opts.budget || null, occasion: opts.occasion || null, category: opts.category || null, brand: opts.brand || null, forWhom: opts.forWhom || null, size: opts.size || null, capacity: opts.capacity || null } });
    setS({ query, turn: 1, ok, ms: Date.now() - t0, results: res.results,
           total: res.total_matches ?? res.results.length, parsed: res.parsed,
           filters: { ...DEFAULT_FILTERS }, guide: null, trail, exhausted: !ok, error: null,
           echo: meta.echo || null });
    setMoreN(24);
    if (ok) endJourney(journeyRef.current, { resolved: true, turns: 1 });
  }
  // Chat add-to-cart: resolve the full catalogue item by sku.
  function chatAddToCart(sku) {
    const pool = [...(s ? s.results : []), ...(pdp ? [pdp] : []), ...(preview ? preview.items : [])];
    const item = pool.find((x) => x.sku === sku);
    if (item) addToCart(item, "chat");
  }
  function chatOpenPdp(sku) {
    const pool = [...(s ? s.results : []), ...(preview ? preview.items : [])];
    openPdpSku(sku, pool, "chat");
  }
  const chatContext = {
    sku: pdp ? pdp.sku : null,
    query: s ? s.query : null,
    region,
    source: pdp ? "pdp" : (chatNudge ? "null_escalation" : "hero"),
  };

  function switchPlainMode(on) {
    if (on === plainMode) return;
    setPlainMode(on);
    // modeOverride: the state update hasn't landed in this render's closure
    if (s && s.query) startSearch(s.query, "mode_toggle", on);
  }
  // G12: outcome micro-survey (1 tap + root-cause chips, same labels as
  // the mined taxonomy). Triggers: add_to_cart / order (always), leaving a
  // no-action journey with the tab hidden (25% sample, per-journey hash).
  const [survey, setSurvey] = useState(null); // {j, trigger, stage}
  const SURVEY_REASONS = [
    ["wrong_product", "Wrong kind of product"],
    ["too_expensive", "Too expensive"],
    ["no_trust", "Didn't trust these results"],
    ["wrong_occasion", "Not right for the occasion"],
    ["other", "Something else"],
  ];
  const surveySample = (j) => [...j.id].reduce((a, c) => a + c.charCodeAt(0), 0) % 4 === 0;
  function offerSurvey(j, trigger) {
    if (!j || j._surveyed || survey) return;
    j._surveyed = true;
    setSurvey({ j, trigger, stage: "ask" });
  }
  function answerSurvey(value, reason) {
    if (!survey) return;
    track("outcome_feedback", {
      query: survey.j.query, journey_id: survey.j.id, value,
      reason: reason || null, trigger: survey.trigger,
    });
    setSurvey(null);
  }
  useEffect(() => {
    const onVis = () => {
      const j = journeyRef.current;
      if (document.visibilityState === "hidden") {
        if (j && !j.ended && !j.added && !j.ordered && surveySample(j)) j._surveyOnReturn = true;
      } else if (j && j._surveyOnReturn) {
        j._surveyOnReturn = false;
        offerSurvey(j, "exit_no_action");
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [survey]);
  const [isNewSession, setIsNewSession] = useState(() => {
    try { return !localStorage.getItem("askcart_session"); } catch { return true; }
  });
  const journeyRef = useRef(null); // {id, query, views:Set, added, ordered, ended, t0, prevTypes}
  const guideShownAtRef = useRef(0);

  useEffect(() => {
    fetch("/api/catalog-preview?festival=1").then(r => r.json()).then(j => {
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
    // 7.1: ?sku= deep link opens the PDP directly.
    const sku = params.get("sku");
    if (sku) {
      fetch(`/api/catalog-preview?sku=${encodeURIComponent(sku)}`).then((r) => r.json())
        .then((j) => { if (j.item) setPdp({ ...j.item, family: j.family || null, _from: "deep_link", _position: 0 }); })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!cartHydrated) return; // never clobber localStorage before the mount-time load
    try { localStorage.setItem("askcart_cart", JSON.stringify(cart)); } catch {}
  }, [cart, cartHydrated]);

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
  function resetToHero() {
    if (journeyRef.current && !journeyRef.current.ended) endJourney(journeyRef.current, { resolved: false, turns: s ? s.turn : 1 });
    setS(null);
    setInput("");
    try { window.history.replaceState(null, "", "/"); } catch {}
    track("hero_return", {});
  }

  function aiPillText() {
    const g = aiStatus && aiStatus.gemini;
    if (lastAiViaRef.current === "gemini") {
      const k = lastAiKeyRef.current;
      return "AI · Gemini" + (k == null ? "" : " key " + (k + 1) + "/" + (g ? g.keys.length : 1));
    }
    if (lastAiViaRef.current === "qwen") return "AI · Qwen 38B";
    const q = aiStatus && aiStatus.qwen;
    if (q && q.available) return "AI · Qwen 38B · ready";
    if (g && !g.allExhausted) return "AI · Gemini · ready";
    return "AI · Rules (offline)";
  }
  function aiPillTitle() {
    const g = aiStatus && aiStatus.gemini;
    const q = aiStatus && aiStatus.qwen;
    const bits = ["Qwen (" + ((q && q.model) || "qwen38-27b") + "): " + (q && q.available ? "available" : "offline")];
    if (g) {
      bits.push("Gemini keys (cap " + g.rpd + "/day): " +
        g.keys.map((k) => "key" + (k.idx + 1) + " " + k.used + "/" + k.rpd + (k.exhausted ? " (" + k.reason + ")" : "")).join(", "));
    }
    bits.push("session AI budget: " + Math.max(0, aiBudgetRef.current) + " left");
    return bits.join(" · ");
  }

  function switchTab(next) {
    if (next === tab) return;
    pushNav();
    setTab(next);
    try { window.history.replaceState(null, "", "/?tab=" + next); } catch {}
    track("page_view", { screen: next });
  }
  function switchAnview(next) {
    if (next === anview) return;
    pushNav();
    setAnview(next);
    try { window.history.replaceState(null, "", "/?tab=analytics&anview=" + next); } catch {}
    track("page_view", { screen: "analytics", subtab: next });
  }
  // In-app back navigation: a stack of surface snapshots (tab + which
  // drawers/screens are open). Back pops the previous snapshot; the logo
  // resets to home. Closes (X buttons) do not push - closing IS going back.
  const [navStack, setNavStack] = useState([]);
  function pushNav(extra) {
    setNavStack((st) => [...st, { tab, cartOpen, checkoutOpen, order, pdp: pdp ? { ...pdp } : null, ...(extra || {}) }].slice(-10));
  }
  function goBack() {
    if (!navStack.length) return;
    const prev = navStack[navStack.length - 1];
    setNavStack(navStack.slice(0, -1));
    setTab(prev.tab);
    setCartOpen(prev.cartOpen);
    setCheckoutOpen(prev.checkoutOpen);
    setOrder(prev.order);
    setPdp(prev.pdp);
    if ("search" in prev) setS(prev.search);
    try { window.history.replaceState(null, "", prev.tab && prev.tab !== "search" ? "/?tab=" + prev.tab : "/"); } catch {}
    track("nav_back", { to: prev.tab, stack: navStack.length - 1 });
  }

  async function doSearch(query, { relax = false, category = null, occasion = null, budget = null, brand = null, turn = 1, limit = 48, forWhom = null, size = null, capacity = null, naive = false } = {}) {
    try {
      const t0 = Date.now();
      const r = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, relax, category, occasion, budget, brand, limit, forWhom, size, capacity, naive }),
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
      const sm = j.semantic || {};
      track("search_results", {
        query, n_results: j.results.length, intent_n: intentN, ms: Date.now() - t0,
        turn, relax, null: intentN < 2, journey_id: jn ? jn.id : null,
        semantic_used: !!sm.used,
        semantic_added: sm.added != null ? sm.added : null,
        semantic_ms: sm.ms != null ? sm.ms : null,
        semantic_reason: sm.reason || null,
      });
      if (intentN < 2) track("zero_result", { query, turn, intent_n: intentN });
      return j;
    } catch (e) {
      track("search_error", { error: String(e).slice(0, 120), query, turn });
      return { results: [], error: String(e).slice(0, 120) };
    }
  }

  function aiSwitchToast(from, to) {
    setAiToast("Gemini key " + (from + 1) + " daily limit hit - switched to " +
      (to == null ? "the built-in rules" : "key " + (to + 1)) + ". Guidance continues.");
    setTimeout(() => setAiToast(null), 6000);
  }
  function aiNotice(decision) {
    if (!decision) return;
    if (decision.gemini) setAiStatus((st) => (st ? { ...st, gemini: decision.gemini } : st));
    if (decision.planner) {
      lastAiViaRef.current = decision.planner === "gemini" ? "gemini" : "qwen";
      if (decision.planner === "gemini") lastAiKeyRef.current = (decision.plannerAi && decision.plannerAi.keyIdx) ?? null;
      if (decision.plannerAi && decision.plannerAi.rotatedFrom != null) aiSwitchToast(decision.plannerAi.rotatedFrom, decision.plannerAi.keyIdx);
    }
    if (aiBudgetRef.current === 0 && !aiBudgetNotedRef.current) {
      aiBudgetNotedRef.current = true;
      setAiToast("Quick mode: to keep responses fast, the remaining questions in this session come from the built-in rules.");
      setTimeout(() => setAiToast(null), 6000);
    }
  }
  function aiRefineNotice(j) {
    if (!j) return;
    const ai = j.ai || {};
    if (ai.gemini) setAiStatus((st) => (st ? { ...st, gemini: ai.gemini } : st));
    if (j.via === "gemini") { lastAiViaRef.current = "gemini"; lastAiKeyRef.current = ai.keyIdx ?? null; }
    else if (j.via === "qwen") lastAiViaRef.current = "qwen";
    if (ai.rotatedFrom != null) aiSwitchToast(ai.rotatedFrom, ai.keyIdx);
    if (aiBudgetRef.current === 0 && !aiBudgetNotedRef.current) {
      aiBudgetNotedRef.current = true;
      setAiToast("Quick mode: to keep responses fast, the remaining questions in this session come from the built-in rules.");
      setTimeout(() => setAiToast(null), 6000);
    }
  }
  async function askGuide(query, nResults, turn, slotsOverride) {
    const jn = journeyRef.current;
    const prevTypes = jn ? jn.prevTypes || [] : [];
    // Cumulative chip answers (from the trail) so the policy builds its
    // next question on the NARROWED set, not the original query's set.
    // slotsOverride = the post-answer slots (the closure's `s` is still the
    // pre-answer render - using it here asked the next question on the
    // OLD set, which is why the chain stopped after a chip answer).
    const slots = slotsOverride || {};
    if (!slotsOverride && s) for (const t of s.trail.slice(1)) if (t && typeof t === "object" && t.opts) Object.assign(slots, t.opts);
    const useAI = aiBudgetRef.current > 0;
    if (useAI) aiBudgetRef.current -= 1;
    const r = await fetch("/api/guide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, n_results: nResults, turn, prev_types: prevTypes,
                             journey_id: jn ? jn.id : null, region, persona, lang, slots,
                             planner: useAI, session_id: getSessionId() }),
    });
    const j = await r.json().catch(() => ({}));
    aiNotice(j.decision);
    return j;
  }

  function markResultsShown(query, results, turn, source) {
    const jn = journeyRef.current;
    if (!jn) return;
    results.forEach((r, i) => {
      if (!jn.views.has(r.sku)) {
        jn.views.add(r.sku);
        track("product_impression", {
          sku: r.sku, title: r.title, category: r.category, brand: r.brand || "",
          price: r.price, rating: r.rating, position: i + 1,
          variant: r.variant || null, lang,
          query, turn, source, journey_id: jn.id,
        });
      }
    });
  }

  async function startSearch(query, source = "input", modeOverride = undefined) {
    if (!query.trim() || busy) return;
    const naive = modeOverride !== undefined ? modeOverride : plainMode;
    if (journeyRef.current && !journeyRef.current.ended) {
      endJourney(journeyRef.current, { resolved: !!s && s.ok === true, turns: s ? s.turn : 1 });
    }
    setBusy(true);
    pushNav({ search: null });
    setS({ query, turn: 1, ok: null, results: [], total: null, filters: { ...DEFAULT_FILTERS }, guide: null, trail: [query], exhausted: false, error: null });
    setInput("");
    journeyRef.current = ensureJourney(query);
    track("search_start", { query, source, journey_id: journeyRef.current.id });
    const t0 = Date.now();
    let res = await doSearch(query, { turn: 1, naive });
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
    setS({ query, turn: 1, ok, ms: Date.now() - t0, results: res.results, total: res.total_matches ?? res.results.length, parsed: res.parsed, filters: { ...DEFAULT_FILTERS }, guide: null, trail: [query], exhausted: false, error: null });
    setMoreN(24);
    if (ok) {
      track("resolved", { query, turns: 1, n_results: res.results.filter((r) => r.intent).length, journey_id: journeyRef.current.id });
      if (naive) { endJourney(journeyRef.current, { resolved: true, turns: 1 }); setBusy(false); return; }
      // Optional refinement: the policy decides if one more question adds
      // value (e.g. budget for an open-ended "headphones" query).
      // n_results = intent-hit count (same semantics as the study).
      const g = await askGuide(query, res.results.filter((r) => r.intent).length, 2);
      if (g.guide) {
        pushPrevType(g.guide);
        guideShownAtRef.current = Date.now();
        track("guide_question_shown", {
          query, question_type: g.guide.type, turn: 2, options_count: g.guide.options.length,
          mode: g.mode, refine: true, reason: g.decision && g.decision.reason,
          planner: (g.decision && g.decision.planner) || null,
          journey_id: journeyRef.current.id,
        });
        setS((st) => st && { ...st, guide: { ...g.guide, mode: g.mode, refine: true } });
      } else {
        endJourney(journeyRef.current, { resolved: true, turns: 1 });
      }
      setBusy(false); return;
    }
    if (naive) {
      // Baseline has no rescue: an empty page is the honest result.
      track("unresolved", { query, turns: 1, journey_id: journeyRef.current.id });
      setS((st) => st && { ...st, exhausted: true });
      endJourney(journeyRef.current, { resolved: false, turns: 1 });
      setBusy(false); return;
    }
    // E1 null-search escalation: offer the assistant once per session.
    if (!plainMode) {
      let nudged = false;
      try { nudged = sessionStorage.getItem("askcart_chat_nudged") === "1"; } catch {}
      if (!nudged) {
        setChatNudge(true);
        track("chat_nudge_shown", { trigger: "null_search", query });
      }
    }
    for (let turn = 2; turn <= 5; turn++) {
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
      pushPrevType(guide);
      guideShownAtRef.current = Date.now();
      track("guide_question_shown", {
        query, question_type: guide.type, turn, options_count: guide.options.length,
        mode: g.mode, reason: g.decision && g.decision.reason, planner: (g.decision && g.decision.planner) || null, journey_id: journeyRef.current.id,
      });
      // s.turn stays at the last displayed search (1) - the search after
      // this chip answer is turn 2, same numbering as the n=150 study.
      setS((st) => st && { ...st, guide: { ...guide, mode: g.mode, refine: false } });
      break; // user picks a chip
    }
    setBusy(false);
  }

  // Cumulative facet answers from the trail (newest step wins) so every
  // refinement search keeps ALL earlier answers, not just the latest one.
  function trailOpts() {
    const merged = {};
    if (s) for (const t of s.trail.slice(1)) if (t && typeof t === "object" && t.opts) Object.assign(merged, t.opts);
    return merged;
  }

  // The "any" (open refinement) question may recur with a different
  // option source; record WHICH source was used so the policy never
  // repeats the same open question (guide.js Tier 7 cycling).
  function pushPrevType(guide) {
    const jn = journeyRef.current;
    if (!jn) return;
    jn.prevTypes = [...(jn.prevTypes || []), guide.type === "any" && guide.subType ? "any:" + guide.subType : guide.type];
  }

  // Item 6 (Gemini ai-refine): after EVERY answer, /api/ai-refine returns
  // validated, actionable output - filters to merge into the re-search and
  // the next question (type + prompt + grounded options with counts).
  // The server validates every value against the live narrowed set, so
  // Gemini can never invent a brand/category/price/keyword; when it is
  // down or empty the page behaves exactly as v6 (deterministic policy).
  async function askAIRefine({ query, queryExt, slots, answer, answerType, prevTypes }) {
    if (aiBudgetRef.current <= 0) return null; // quick mode: deterministic chain continues
    aiBudgetRef.current -= 1;
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 5500);
    try {
      const r = await fetch("/api/ai-refine", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, query_ext: queryExt || "", slots, answer, answer_type: answerType, prev_types: prevTypes || [], lang, session_id: getSessionId() }),
        signal: ctrl.signal,
      });
      if (!r.ok) return null;
      const j = await r.json();
      if (!j || !j.ok) return null;
      aiRefineNotice(j);
      return { filters: j.filters || {}, question: j.question || null, via: j.via || null, ms: j.ms || null, ai: j.ai || {} };
    } catch {
      return null;
    } finally {
      clearTimeout(to);
    }
  }
  function aiFilterOpts(f) {
    const o = {};
    if (f.brand) o.brand = f.brand;
    if (f.category) o.category = f.category;
    if (f.for_whom) o.forWhom = f.for_whom;
    if (f.size) o.size = f.size;
    if (f.occasion) o.occasion = f.occasion;
    if (f.budget_max) o.budget = f.budget_max;
    return o;
  }
  // AI-applied filters become REMOVABLE trail chips - no silent caps (O4).
  function aiTrailSteps(aiOpts, keyword) {
    const steps = [];
    if (aiOpts.brand) steps.push({ label: "Brand: " + aiOpts.brand, opts: { brand: aiOpts.brand }, ai: true });
    if (aiOpts.category) steps.push({ label: aiOpts.category, opts: { category: aiOpts.category }, ai: true });
    if (aiOpts.forWhom) steps.push({ label: "For: " + aiOpts.forWhom, opts: { forWhom: aiOpts.forWhom }, ai: true });
    if (aiOpts.size) steps.push({ label: "Size " + String(aiOpts.size).toUpperCase(), opts: { size: aiOpts.size }, ai: true });
    if (aiOpts.occasion) steps.push({ label: "Occasion: " + aiOpts.occasion, opts: { occasion: aiOpts.occasion }, ai: true });
    if (aiOpts.budget) steps.push({ label: "Budget \u2264 \u20b9" + Number(aiOpts.budget).toLocaleString("en-IN"), opts: { budget: aiOpts.budget }, ai: true });
    if (keyword) steps.push({ label: keyword, opts: null });
    return steps;
  }
  function aiRefineEvent(ai, aiOpts, turnNow) {
    if (!ai || (!Object.keys(aiOpts).length && !(ai.filters && ai.filters.keyword) && !ai.question)) return;
    track("ai_refine", {
      query: s.query, filters: Object.keys(aiOpts), keyword: (ai.filters && ai.filters.keyword) || null,
      question: ai.question ? ai.question.type : null, via: ai.via || null, ms: ai.ms || null,
      turn: turnNow, journey_id: journeyRef.current ? journeyRef.current.id : null,
    });
  }
  function aiGuideWrap(ai) {
    if (!ai || !ai.question) return null;
    return {
      guide: {
        type: ai.question.type,
        question: ai.question.prompt,
        options: ai.question.options.map((o) => o.label),
        optionCounts: ai.question.options.map((o) => ({ label: o.label, count: o.count || 0 })),
        reason: "ai_refine",
      },
      mode: "ai",
      decision: { type: ai.question.type, reason: "ai_refine", planner: ai.via || null },
    };
  }

  // G10: one-line echo of what changed, shown above the results. Totals
  // are full pre-cap match counts, so "N of M left" counts the whole
  // matching set, not the 48-item display cap.
  function echoFor(chip, totalNow, totalPrev) {
    return `${chip} · ${totalNow} of ${totalPrev} left`;
  }
  async function applyAnswer(chip, guide) {
    if (!s || busy) return;
    setBusy(true);
    const turnNow = s.turn + 1;
    track("guide_option_selected", {
      query: s.query, question_type: guide.type, option: chip, turn: turnNow,
      ttfc_ms: Date.now() - guideShownAtRef.current, journey_id: journeyRef.current ? journeyRef.current.id : null,
    });
    const t0 = Date.now();
    let opts = {};
    let extraQ = "";
    let trailLabel = chip; // O4: a default cap must show as a real chip, never silently
    if (guide.type === "budget") {
      const nums = (String(chip).match(/[\d,]+/g) || []).map((x) => parseInt(x.replace(/,/g, ""), 10)).filter((n) => n > 0);
      if (/not sure|flexible/i.test(chip)) {
        const p = getPersona();
        const def = p ? BUDGET_STYLE_MAX[p.budgetStyle || p.spendStyle] : null;
        if (def) {
          opts = { budget: def };
          trailLabel = `Budget ≤ ₹${def.toLocaleString("en-IN")} (your default)`;
        }
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
    } else if (guide.type === "for_whom") {
      // G3: for-whom facet -> recipient-style re-rank (women/men/kids)
      opts = { forWhom: /women/i.test(chip) ? "women" : /men/i.test(chip) ? "men" : /kids/i.test(chip) ? "kids" : "unisex" };
    } else if (guide.type === "size") {
      opts = { size: /any/i.test(chip) ? null : String(chip).toLowerCase() };
    } else if (guide.type === "capacity") {
      opts = { capacity: /any/i.test(chip) ? null : chip };
    } else {
      // Open-ended question ("any"/"ai" with set-drawn options): resolve
      // the chip to a real facet when the data says so (brand, price
      // band, category); otherwise refine the query text with the answer
      // (usage/tag words re-rank on their tags).
      const lowC = String(chip).toLowerCase();
      const b = s.results.find((r) => r.brand && lowC.includes(r.brand.toLowerCase()));
      const c = s.results.find((r) => r.category && lowC.includes(String(r.category).toLowerCase()));
      const nums = (String(chip).match(/[\d,]+/g) || []).map((x) => parseInt(x.replace(/,/g, ""), 10)).filter((n) => n > 0);
      if (b) opts = { brand: b.brand };
      else if (/\u20b9/.test(chip) && nums.length) opts = { budget: Math.max(...nums) };
      else if (c) opts = { category: c.category };
      else extraQ = chip;
    }
    // Item 6: the AI refine (Gemini, Qwen fallback) runs IN FLIGHT while
    // the deterministic re-search executes; the page waits at most ~4.5s
    // for it, so a down provider never stalls the grid (v6 latency).
    const aiPromise = !plainMode
      ? askAIRefine({ query: s.query, queryExt: extraQ, slots: { ...trailOpts(), ...(s.parsed && s.parsed.budgetMax ? { budget: s.parsed.budgetMax } : {}), ...(s.parsed && s.parsed.occasion ? { occasion: s.parsed.occasion } : {}) },
                      answer: { label: trailLabel, opts }, answerType: guide.type,
                      prevTypes: journeyRef.current ? journeyRef.current.prevTypes || [] : [] })
      : Promise.resolve(null);
    const optsClean = Object.fromEntries(Object.entries(opts).filter(([, v]) => v != null));
    let res = await doSearch(s.query + (extraQ ? " " + extraQ : ""), { relax: true, turn: turnNow, ...trailOpts(), ...optsClean });
    const ai = await Promise.race([aiPromise, new Promise((r) => setTimeout(() => r(null), 5500))]);
    const aiOpts = ai ? aiFilterOpts(ai.filters) : {};
    const aiKw = ai && ai.filters && ai.filters.keyword && !(extraQ || "").toLowerCase().includes(ai.filters.keyword.toLowerCase()) ? ai.filters.keyword : null;
    const aiSteps = ai ? aiTrailSteps(aiOpts, aiKw) : [];
    aiRefineEvent(ai, aiOpts, turnNow);
    if (Object.keys(aiOpts).length || aiKw) {
      // AI added a facet the rule resolution missed -> one merged
      // re-search so the grid shows the AI-filtered products.
      const res2 = await doSearch(s.query + (extraQ ? " " + extraQ : "") + (aiKw ? " " + aiKw : ""),
                                   { relax: true, turn: turnNow, ...trailOpts(), ...aiOpts, ...optsClean });
      if (!res2.error) res = res2;
    }
    if (res.error) {
      setS((st) => st && { ...st, error: res.error });
      setBusy(false);
      return;
    }
    const appliedOpts = { ...opts };
    const newSlots = { ...trailOpts(), ...appliedOpts, ...aiOpts };
    if (res.results.filter((r) => r.intent).length < 2 && opts.category) {
      // the picked category was a dead end - retry without it, other
      // constraints (budget/occasion) still applied
      res = await doSearch(s.query, { relax: true, turn: turnNow, ...trailOpts(), category: null,
                                      budget: opts.budget ?? null, occasion: opts.occasion ?? null });
      delete appliedOpts.category;
    }
    // An explicit chip answer is the shopper's instruction: the filter is
    // applied even when the on-intent count drops - that IS the filter
    // working ("budget headphones under 3000" + Apple must not silently
    // fall back to the mixed list). An empty facet leaves the honest
    // zero-results state, which re-asks the rescue question.
    const finalResults = res.results;
    const ok = finalResults.filter((r) => r.intent).length >= 2;
    const wasOk = s.ok === true;
    markResultsShown(s.query, finalResults, turnNow, "results");
    setS({ ...s, turn: turnNow, ok, ms: Date.now() - t0, results: finalResults,
           total: res.total_matches ?? finalResults.length, parsed: res.parsed,
           filters: { ...DEFAULT_FILTERS }, guide: null,
           trail: [...s.trail, { label: trailLabel, opts: appliedOpts }, ...aiSteps],
           echo: echoFor(trailLabel, res.total_matches ?? finalResults.length, s.total ?? s.results.length), error: null });
    if (ok) {
      track("resolved", { query: s.query, turns: turnNow, n_results: finalResults.filter((r) => r.intent).length, journey_id: journeyRef.current.id });
      // Keep guiding: a resolved result is a start, not the destination.
      // Ask the next ladder question until the query is fully specified,
      // the 4-follow-up cap is hit, or the shopper skips.
      if (!plainMode && turnNow < 5) {
        const g2 = aiGuideWrap(ai) || (await askGuide(s.query, finalResults.filter((r) => r.intent).length, turnNow + 1, newSlots));
        if (g2.guide) {
          pushPrevType(g2.guide);
          guideShownAtRef.current = Date.now();
          track("guide_question_shown", {
            query: s.query, question_type: g2.guide.type, turn: turnNow + 1,
            options_count: g2.guide.options.length, mode: g2.mode, refine: true,
            reason: g2.decision && g2.decision.reason, planner: (g2.decision && g2.decision.planner) || null, journey_id: journeyRef.current.id,
          });
          setS((st) => st && { ...st, guide: { ...g2.guide, mode: g2.mode, refine: true } });
          setBusy(false);
          return;
        }
      }
      endJourney(journeyRef.current, { resolved: true, turns: turnNow, ordered: journeyRef.current.ordered });
      setBusy(false);
      return;
    }
    // Keep guiding: if the results are still thin, the policy may have
    // another question type left (up to 4 follow-ups / 5 turns per journey).
    // We only stop when the shopper is at their destination (3 known facets),
    // the shopper skips, or no eligible facet is left.
    if (turnNow < 5) {
      const g = aiGuideWrap(ai) || (await askGuide(s.query, finalResults.filter((r) => r.intent).length, turnNow + 1, newSlots));
      if (g.guide) {
        pushPrevType(g.guide);
        guideShownAtRef.current = Date.now();
        track("guide_question_shown", {
          query: s.query, question_type: g.guide.type, turn: turnNow + 1,
          options_count: g.guide.options.length, mode: g.mode,
          reason: g.decision && g.decision.reason, planner: (g.decision && g.decision.planner) || null, journey_id: journeyRef.current.id,
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

  // G4: typed answers. Resolved to a chip when possible; otherwise the text
  // is appended to the query as a normal refinement (parsed by the engine).
  async function answerTyped(text, guide) {
    if (!s || busy) return;
    const txt = String(text || "").trim();
    if (!txt) return;
    const low = txt.toLowerCase();
    let chip = null;
    if (guide.type === "budget") {
      if (/not sure|flexible|pakka nahi|pata nahi/i.test(low)) chip = "Not sure / flexible";
      else {
        const k = low.match(/(\d+(?:[.,]\d+)?)\s*(k|thousand|lakh|hazaar)/);
        let num = null;
        if (k) {
          const mult = k[2] === "lakh" ? 100000 : k[2] === "hazaar" ? 100 : 1000;
          num = Math.round(parseFloat(k[1].replace(",", "")) * mult);
        } else {
          const nums = low.match(/\d+(?:[.,]\d+)?/g) || [];
          if (nums.length) num = Math.round(parseFloat(nums[nums.length - 1].replace(",", "")));
        }
        if (num && num > 0) chip = `Under ₹${num.toLocaleString("en-IN")}`;
      }
    } else if (guide.type === "occasion") {
      const map = { gift: "Gift", present: "Gift", birthday: "Birthday", janmdin: "Birthday",
                    wedding: "Wedding / Shaadi", shaadi: "Wedding / Shaadi",
                    anniversary: "Anniversary", diwali: "Diwali / Festival",
                    festival: "Diwali / Festival", party: "Party",
                    christmas: "Christmas", housewarming: "Housewarming" };
      for (const [w, c] of Object.entries(map)) if (low.includes(w)) { chip = c; break; }
      if (!chip && low.includes("everyday")) chip = "Everyday use";
    } else if (guide.type === "brand") {
      if (/no preference|best rated|koi fark/i.test(low)) chip = "No preference - best rated";
      else chip = (s.results.find((r) => r.brand && low.includes(r.brand.toLowerCase())) || {}).brand || null;
    } else {
      chip = (s.results.find((r) => low.includes(r.category.toLowerCase())) || {}).category || null;
    }
    track("guide_typed_answer", {
      query: s.query, question_type: guide.type, text: txt.slice(0, 80),
      resolved_to_chip: !!chip, turn: s.turn + 1,
    });
    if (chip) { await applyAnswer(chip, guide); return; }
    // Unresolvable text -> normal refinement search with the text appended.
    setBusy(true);
    const turnNow = s.turn + 1;
    const t0 = Date.now();
    const aiPromise = !plainMode
      ? askAIRefine({ query: s.query, queryExt: txt, slots: { ...trailOpts(), ...(s.parsed && s.parsed.budgetMax ? { budget: s.parsed.budgetMax } : {}), ...(s.parsed && s.parsed.occasion ? { occasion: s.parsed.occasion } : {}) },
                      answer: { label: txt, opts: null }, answerType: guide.type,
                      prevTypes: journeyRef.current ? journeyRef.current.prevTypes || [] : [] })
      : Promise.resolve(null);
    let res = await doSearch(s.query + " " + txt, { relax: true, turn: turnNow, ...trailOpts() });
    const ai = await Promise.race([aiPromise, new Promise((r) => setTimeout(() => r(null), 5500))]);
    const aiOpts = ai ? aiFilterOpts(ai.filters) : {};
    const aiKw = ai && ai.filters && ai.filters.keyword && !txt.toLowerCase().includes(ai.filters.keyword.toLowerCase()) ? ai.filters.keyword : null;
    const aiSteps = ai ? aiTrailSteps(aiOpts, aiKw) : [];
    aiRefineEvent(ai, aiOpts, turnNow);
    if (Object.keys(aiOpts).length || aiKw) {
      const res2 = await doSearch(s.query + " " + txt + (aiKw ? " " + aiKw : ""),
                                   { relax: true, turn: turnNow, ...trailOpts(), ...aiOpts });
      if (!res2.error) res = res2;
    }
    setBusy(false);
    if (res.error) { setS((st) => st && { ...st, error: res.error }); return; }
    const intentN = res.results.filter((r) => r.intent).length;
    const ok = intentN >= 2;
    markResultsShown(s.query, res.results, turnNow, "results");
    setS({ ...s, turn: turnNow, ok, ms: Date.now() - t0, results: res.results,
           total: res.total_matches ?? res.results.length, parsed: res.parsed,
           filters: { ...DEFAULT_FILTERS }, guide: null, trail: [...s.trail, { label: txt, opts: null }, ...aiSteps],
           echo: `${txt} · ${res.total_matches ?? res.results.length} of ${s.total ?? s.results.length} left`, error: null });
    if (ok) {
      track("resolved", { query: s.query, turns: turnNow, n_results: intentN, journey_id: journeyRef.current.id });
      // Same keep-guiding rule as chip answers: the typed text narrows
      // the set, so the next question is built on the narrowed set.
      if (!plainMode && turnNow < 5) {
        const g2 = aiGuideWrap(ai) || (await askGuide(s.query + " " + txt, intentN, turnNow + 1, { ...trailOpts(), ...aiOpts }));
        if (g2.guide) {
          pushPrevType(g2.guide);
          guideShownAtRef.current = Date.now();
          track("guide_question_shown", {
            query: s.query, question_type: g2.guide.type, turn: turnNow + 1,
            options_count: g2.guide.options.length, mode: g2.mode, refine: true,
            reason: g2.decision && g2.decision.reason, planner: (g2.decision && g2.decision.planner) || null, journey_id: journeyRef.current.id,
          });
          setS((st) => st && { ...st, guide: { ...g2.guide, mode: g2.mode, refine: true } });
          setBusy(false);
          return;
        }
      }
      endJourney(journeyRef.current, { resolved: true, turns: turnNow, ordered: journeyRef.current.ordered });
      setBusy(false);
      return;
    }
    if (turnNow < 5) {
      const g = aiGuideWrap(ai) || (await askGuide(s.query + " " + txt, intentN, turnNow + 1, { ...trailOpts(), ...aiOpts }));
      if (g.guide) {
        pushPrevType(g.guide);
        guideShownAtRef.current = Date.now();
        track("guide_question_shown", {
          query: s.query, question_type: g.guide.type, turn: turnNow + 1,
          options_count: g.guide.options.length, mode: g.mode,
          reason: g.decision && g.decision.reason, planner: (g.decision && g.decision.planner) || null, journey_id: journeyRef.current.id,
        });
        setS((st) => st && { ...st, guide: { ...g.guide, mode: g.mode, refine: false } });
        setBusy(false);
        return;
      }
      track("guide_no_question", { query: s.query, turn: turnNow + 1, reason: (g.decision && g.decision.reason) || "" });
    }
    track("unresolved", { query: s.query, turns: turnNow });
    setS((st) => st && { ...st, exhausted: true });
    endJourney(journeyRef.current, { resolved: false, turns: turnNow, ordered: journeyRef.current.ordered });
    setBusy(false);
  }

  // G5/G5': every question has an exit, but skipping one question does
  // NOT leave the loop - the next eligible question is asked on the same
  // (narrowed) set. Skipped types stay ineligible for this journey; after
  // 3 skips the journey ends (no interrogation).
  async function skipGuide() {
    if (!s || !s.guide || busy) return;
    const g = s.guide;
    setBusy(true);
    track("guide_skipped", {
      query: s.query, question_type: g.type, turn: s.turn, mode: g.mode || "policy",
    });
    const jn = journeyRef.current;
    pushPrevType({ type: g.type, subType: g.subType });
    setS((st) => st && { ...st, guide: null });
    const skips = jn ? (jn.skips = (jn.skips || 0) + 1) : 1;
    const intentN = s.results.filter((r) => r.intent).length;
    if (!plainMode && s.turn < 5 && skips < 3) {
      const g2 = await askGuide(s.query, intentN, s.turn + 1);
      if (g2.guide) {
        pushPrevType(g2.guide);
        guideShownAtRef.current = Date.now();
        track("guide_question_shown", {
          query: s.query, question_type: g2.guide.type, turn: s.turn + 1,
          options_count: g2.guide.options.length, mode: g2.mode, refine: true, after_skip: true,
          reason: g2.decision && g2.decision.reason, planner: (g2.decision && g2.decision.planner) || null,
          journey_id: jn ? jn.id : null,
        });
        setS((st) => st && { ...st, guide: { ...g2.guide, mode: g2.mode, refine: true } });
        setBusy(false);
        return;
      }
      track("guide_no_question", { query: s.query, turn: s.turn + 1, reason: (g2.decision && g2.decision.reason) || "" });
    }
    if (jn && !jn.ended) endJourney(jn, { resolved: s.ok !== false, turns: s.turn });
    setBusy(false);
  }

  // 7.3: remove a trail constraint chip -> re-run the search with the
  // remaining steps (later steps win on conflicting keys).
  async function removeTrailStep(i) {
    if (!s || busy) return;
    const step = s.trail[i];
    if (!step || typeof step === "string" || !step.opts) return;
    track("constraint_removed", { query: s.query, removed: step.label, turn: s.turn });
    const remaining = s.trail.filter((_, j) => j !== i && j > 0).map((t) => (typeof t === "object" ? t.opts : null)).filter(Boolean);
    const merged = {};
    for (const o of remaining) Object.assign(merged, o);
    setBusy(true);
    const t0 = Date.now();
    const res = await doSearch(s.query, { relax: true, turn: remaining.length + 1, ...merged });
    setBusy(false);
    if (res.error) { setS((st) => st && { ...st, error: res.error }); return; }
    const ok = res.results.filter((r) => r.intent).length >= 2;
    markResultsShown(s.query, res.results, remaining.length + 1, "results");
    setS((st) => st && { ...st, ok, ms: Date.now() - t0, results: res.results,
                         total: res.total_matches ?? res.results.length, parsed: res.parsed,
                         trail: st.trail.filter((_, j) => j !== i), echo: null,
                         guide: null, exhausted: false });
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
    else if (type === "accessories") nf = { ...s.filters, noAccessories: !s.filters.noAccessories };
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
    // Visible confirmation: the count bump alone is too quiet.
    setCartToast(lang === "hi" ? "कार्ट में जोड़ा गया ✓" : lang === "hinglish" ? "Cart mein add ho gaya ✓" : "Added to cart ✓");
    offerSurvey(jn, "add_to_cart");
  }
  useEffect(() => {
    if (!cartToast) return;
    const t2 = setTimeout(() => setCartToast(null), 1800);
    return () => clearTimeout(t2);
  }, [cartToast]);
  function buyNow(item) {
    pushNav();
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
  const [orders, setOrders] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem("askcart_orders_v1") || "null");
      if (Array.isArray(v) && v.length) return v;
    } catch {}
    // Two clearly-labelled demo orders so the section has content on a fresh visit.
    return [
      { id: "ord_demo_a1b2", at: Date.now() - 6 * 86400000, demo: true, total: 2448, items: [
        { title: "boAt Airdopes 141 TWS Earbuds", brand: "boAt", qty: 1, price: 1299 },
        { title: "Fabindia Cotton Kurti (Maroon M)", brand: "Fabindia", qty: 1, price: 1149 } ] },
      { id: "ord_demo_c3d4", at: Date.now() - 15 * 86400000, demo: true, total: 54989, items: [
        { title: "Sony PlayStation 5 Console (Disc Edition)", brand: "Sony", qty: 1, price: 54989 } ] },
    ];
  });
  function placeOrder(total) {
    pushNav();
    const items = Object.entries(cart);
    const jn = journeyRef.current;
    // Previous orders: persist this (simulated) order for the user.
    const rec = {
      id: "ord_" + Math.random().toString(36).slice(2, 8),
      at: Date.now(), demo: false, total,
      items: items.map(([sku, e]) => ({ sku, title: e.item.title, brand: e.item.brand || "", qty: e.qty, price: e.item.price })),
    };
    try { setOrders((os) => { const next = [rec, ...os].slice(0, 20); localStorage.setItem("askcart_orders_v1", JSON.stringify(next)); return next; }); } catch {}
    if (jn) {
      jn.ordered = true;
      offerSurvey(jn, "order_complete");
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
    setPersonaModal(false);
    setPersonaState(p);
    try { localStorage.setItem("askcart_onboarded", "1"); } catch {}
    // 2026-11-06: show the payoff of the answers, and wire them to behaviour.
    if (p) {
      if (p.context === "Gifting") setObToast("Because you chose Gifting, we'll ask about the occasion first.");
      else if (p.ageBand === "Under 25") setObToast("Noted - budget options will be one step lower for you.");
      else if (p.ageBand === "40+") { setObToast("Larger text mode is on for you."); try { document.body.classList.add("largetext"); } catch {} }
      else if (p.spendStyle) setObToast("Got it - we'll rank results around that bar.");
      setTimeout(() => setObToast(null), 6000);
    }
  }

  const cartCount = Object.values(cart).reduce((a, e) => a + e.qty, 0);

  // ---- derived search layout -------------------------------------------
  const priceBands = useMemo(
    () => priceBandsFor(s && s.parsed && s.parsed.budgetMax ? s.parsed.budgetMax : null), [s]);
  const layout = useMemo(() => {
    if (!s || !s.results.length) return null;
    const filtered = applyFilters(s.results, s.filters, priceBands);
    if (!filtered.length) return { filtered, single: false, grid: [], best: new Set(), rec: [], groups: [], more: [] };
    // 7.3: clear queries (top category >= 60%) get ONE ranked grid;
    // ambiguous queries get curated category shelves.
    const catCount = new Map();
    for (const r of filtered) catCount.set(r.category, (catCount.get(r.category) || 0) + 1);
    const topEntry = [...catCount.entries()].sort((a, b) => b[1] - a[1])[0] || [null, 0];
    if (topEntry[1] / filtered.length >= 0.6) {
      const grid = groupGrid(filtered); // API order = relevance; S7: family-folded
      return { filtered, single: true, grid, best: new Set(grid.slice(0, 3).map((r) => r.sku)),
               rec: [], groups: [], more: [] };
    }
    const rec = [...filtered].sort((a, b) => recommendScore(b, persona) - recommendScore(a, persona)).slice(0, 3);
    const recSet = new Set(rec.map((r) => r.sku));
    const rest = filtered.filter((r) => !recSet.has(r.sku));
    const topCats = [...catCount.entries()].sort((a, b) => b[1] - a[1])
      .filter(([k, c]) => c >= 2 && k !== topEntry[0]).slice(0, 3).map(([k]) => k);
    const groups = topCats.map((cat) => ({ cat, items: rest.filter((r) => r.category === cat).slice(0, 4) }));
    const groupedSet = new Set(groups.flatMap((g) => g.items.map((r) => r.sku)));
    const more = rest.filter((r) => !groupedSet.has(r.sku));
    return { filtered, single: false, grid: [], best: new Set(rec.map((r) => r.sku)), rec, groups, more };
  }, [s, persona]);

  // 7.1: similar items = same category, within ±40% price, best rated.
  function similarFor(item, pool) {
    return (pool || []).filter((x) => x.sku !== item.sku && x.category === item.category &&
      Math.abs(x.price - item.price) <= Math.max(100, item.price * 0.4))
      .sort((a, b) => (b.rating - a.rating) || (b.num_ratings - a.num_ratings))
      .slice(0, 4);
  }
  function openPdp(r, from, position) {
    pushNav();
    setPdp({ ...r, _from: from, _position: position });
    try { window.history.replaceState(null, "", `/?sku=${r.sku}`); } catch {}
  }
  function openPdpSku(sku, pool, from) {
    const r = (pool || []).find((x) => x.sku === sku);
    if (r) openPdp(r, from, 0);
  }

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
  const activeFilterCount = (f.brands.length ? 1 : 0) + (f.band ? 1 : 0) + (f.rating4 ? 1 : 0) + (f.noAccessories ? 1 : 0) + (f.category ? 1 : 0) + (f.sort !== "relevance" ? 1 : 0);

  const cardProps = (from) => ({
    onAdd: (r) => addToCart(r, from),
    onOpen: (r) => openPdp(r, from, 0),
  });
  // S6: relaxed (slightly-over-budget) results are labelled, never silent.
  const overBudget = (r) => !!(s && s.parsed && s.parsed.budgetMax &&
    r.price > s.parsed.budgetMax && r.price <= s.parsed.budgetMax * 1.6);
  function closePdp() {
    setPdp(null);
    try { window.history.replaceState(null, "", "/"); } catch {}
  }

  return (
    <div className={"appshell" + (chatOpen ? " chat-open" : "")}>
      <div className="appshell-main">
      <div className="topbar">
        <div className="topbar-inner">
          <button className="backbtn" onClick={goBack} disabled={!navStack.length} aria-label="Back" title="Back">←</button>
          <div className="logo" onClick={() => { setNavStack([]); setTab("search"); window.scrollTo({ top: 0 }); }}>
            <div className="logo-mark">A</div>
            <div className="logo-word">Ask<span>Cart</span></div>
            <span className="logo-tag">guided shopping · India</span>
          </div>
          <nav className="topnav">
            <button className={tab === "search" ? "on" : ""} onClick={() => switchTab("search")}>Search</button>
            <button className={tab === "orders" ? "on" : ""} onClick={() => switchTab("orders")}>Orders</button>
          </nav>
          <span className="aipill" title={aiPillTitle()}>{aiPillText()}</span>
          <span className="topbar-spacer" />
          <span className="langseg" role="group" aria-label="Language">
            {[["en", "EN"], ["hi", "हिं"], ["hinglish", "Hinglish"]].map(([l, lb]) => (
              <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>{lb}</button>
            ))}
          </span>
          <button className={"anbtn" + (tab === "analytics" ? " on" : "")} onClick={() => switchTab("analytics")}>
            <span className="anbtn-dot" /> Analytics
          </button>
          <button className={"cartbtn" + (cartOpen ? " on" : "")} onClick={() => { if (!cartOpen) pushNav(); setCartOpen(true); track("cart_view", { item_count: cartCount, total: Object.values(cart).reduce((a, e) => a + e.item.price * e.qty, 0) }); }}>
            <span className="carticon">🛒</span><span className="cartlabel">Cart</span>
            {cartCount > 0 && <span className="cartcount" key={cartCount}>{cartCount}</span>}
          </button>
        </div>
      </div>
      {obToast && <div className="obtoast" role="status">{obToast}</div>}
      {aiToast && <div className="obtoast aitoast" role="status">{aiToast}</div>}
      {cartToast && <div className="carttoast" role="status">{cartToast}</div>}
      <div className="wrap">
        {tab === "search" ? (
          params.get("onboard") === "1" && !onboarded ? <Onboarding onDone={onOnboarded} /> : (
            <>
              {!s && (
                <div className="hero">
                  <h1>{t(lang, "heroTitle")}</h1>
                  <div className="sub">{t(lang, "heroSub")}</div>
                  <div className="searchbar">
                    <input value={input} onChange={(e) => setInput(e.target.value)}
                           onKeyDown={(e) => e.key === "Enter" && startSearch(input, "input")}
                           placeholder={t(lang, "searchPlaceholder")} />
                    <button onClick={() => startSearch(input, "input")} disabled={busy}>{busy ? "…" : "Search"}</button>
                  </div>
                  {!stripDismissed && (
                    <div className="strip">
                      {stripOpen ? (
                        <div className="strip-card">
                          <div className="strip-row">
                            <span className="strip-lbl">{t(lang, "stripLang")}</span>
                            <button className={lang === "en" ? "seg on" : "seg"} onClick={() => setLang("en")}>English</button>
                            <button className={lang === "hi" ? "seg on" : "seg"} onClick={() => setLang("hi")}>हिन्दी</button>
                            <button className={lang === "hinglish" ? "seg on" : "seg"} onClick={() => setLang("hinglish")}>Hinglish</button>
                            <span className="strip-sep" />
                            <span className="strip-lbl">{t(lang, "stripPin")}</span>
                            <input className="pin-in" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                   placeholder="110001" inputMode="numeric" aria-label="Delivery pincode" />
                            <button className="strip-use" onClick={saveRegion} disabled={pin.length !== 6}>{t(lang, "use")}</button>
                          </div>
                          <div className="strip-hint">{t(lang, "pinHint")}</div>
                          <button className="strip-skip" onClick={() => dismissStrip()}>{t(lang, "skip")} ✕</button>
                        </div>
                      ) : (
                        <span className="strip-line" onClick={() => setStripOpen(true)} role="button" tabIndex={0}
                              onKeyDown={(e) => e.key === "Enter" && setStripOpen(true)}>
                          {t(lang, "strip")} <b>{t(lang, "setNow")} →</b>
                        </span>
                      )}
                    </div>
                  )}
                  <div className="ex">
                    <span className="exl">{t(lang, "popular")}:</span>
                    {EXAMPLES.map((e) => <span key={e} onClick={() => startSearch(e, "example")}>{e}</span>)}
                  </div>
                </div>
              )}
              {personaModal && !s && (
                <div className="pm-overlay" role="dialog" aria-modal="true" aria-label="Set up your shopping profile">
                  <Onboarding onDone={onOnboarded} />
                </div>
              )}
              {s && (
                <div className="hero" style={{ paddingBottom: 0 }}>
                  <div className="searchbar">
                    <input value={input}
                           onChange={(e) => { setInput(e.target.value); if (s && e.target.value === "") resetToHero(); }}
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
                      {typeof t === "object" && t.opts ? (
                        <button className="chip-x" onClick={() => removeTrailStep(i + 1)} title="Remove this constraint">
                          {t.label} <span className="xx">✕</span>
                        </button>
                      ) : (
                        <span className="step">{typeof t === "object" ? t.label : t}</span>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {s && s.results.length > 0 && (
                <div className="resultsum">
                  <b>{s.results.length}</b> products for “{s.query}” · {layout && layout.single ? "sorted by best match" : "curated into shelves"}
                </div>
              )}
              {s && plainMode && (
                <div className="meta" role="status">Plain mode — baseline keyword search: no budget or occasion understanding, no follow-up questions. <button className="fchip" onClick={() => switchPlainMode(false)}>Switch to Guided</button></div>
              )}
              {s && s.rollback && (
                <div className="meta" style={{ marginTop: -8, marginBottom: 10 }}>
                  That answer didn't improve the match, so I kept your previous picks.
                </div>
              )}
              {s && s.echo && (
                <div className="meta echo" role="status">{s.echo}</div>
              )}
              {survey && (
                <div className="survey" role="group" aria-label="quick feedback">
                  {survey.stage === "ask" ? (
                    <span className="survey-q">Did you find what you were looking for?</span>
                  ) : (
                    <span className="survey-q">What held you back?</span>
                  )}
                  {survey.stage === "ask" ? (
                    <>
                      <button className="fchip" onClick={() => answerSurvey("yes")}>Yes</button>
                      <button className="fchip" onClick={() => setSurvey({ ...survey, stage: "reasons" })}>Not really</button>
                    </>
                  ) : (
                    SURVEY_REASONS.map(([id, label]) => (
                      <button key={id} className="fchip" onClick={() => answerSurvey("no", id)}>{label}</button>
                    ))
                  )}
                  <button className="survey-x" aria-label="dismiss survey" onClick={() => setSurvey(null)}>✕</button>
                </div>
              )}

              {s && s.guide && (
                <QuestionCard guide={s.guide} lang={lang} busy={busy}
                              onChip={(c) => applyAnswer(c, s.guide)}
                              onTyped={(txt) => answerTyped(txt, s.guide)}
                              onSkip={skipGuide} progress={Math.min(4, s.turn)} />
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
                        : "No exact match in the catalogue — try one of these, or rephrase with the exact product word.")
                      : (s.exhausted
                        ? "These are the closest picks in the catalogue — browse them, or rephrase for a sharper search."
                        : "These are close, not exact — a rephrase with the exact product word usually fixes it.")}
                  </div>
                  {s.results.length === 0 && (
                    <div className="ex">
                      {EXAMPLES.map((e) => <span key={e} onClick={() => startSearch(e, "example")}>{e}</span>)}
                    </div>
                  )}
                </div>
              )}

              {s && busy && s.results.length === 0 && (
                <div className="skel" aria-label="Loading results">
                  {[...Array(8)].map((_, i) => <div key={i} className="sk" />)}
                </div>
              )}

              {s && !busy && s.results.length > 0 && layout && (
                <>
                  <div className="filters">
                    <div className="frow">
                      <span className="flabel">Sort</span>
                      {SORTS.map((x) => (
                        <button key={x.id} className={f.sort === x.id ? "fchip on" : "fchip"} onClick={() => setFilter("sort", x.id)}>{x.label}</button>
                      ))}
                      {priceBands.length > 0 && (<><span className="fsep" /><span className="flabel">Price</span>
                        {priceBands.map((b) => (
                          <button key={b.id} className={f.band === b.id ? "fchip on" : "fchip"} onClick={() => setFilter("price_band", b.id)}>{b.label}</button>
                        ))}
                      </>)}
                      <button className={f.rating4 ? "fchip on" : "fchip"} onClick={() => setFilter("rating", "4★+")}>4★ & up</button>
                      <button className={f.noAccessories ? "fchip on" : "fchip"} onClick={() => setFilter("accessories", "hide")}>Hide accessories</button>
                      {brandOpts.length > 0 && (<><span className="fsep" /><span className="flabel">Brand</span>
                        {brandOpts.map((b) => (
                          <button key={b} className={f.brands.includes(b) ? "fchip on" : "fchip"} onClick={() => setFilter("brand", b)}>{b}</button>
                        ))}
                      </>)}
                      {catOpts.length > 0 && !layout.single && (<><span className="fsep" /><span className="flabel">Category</span>
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
                      {layout.single ? (
                        <>
                          <div className="grid">
                            {layout.grid.slice(0, moreN).map((r) => (
                              <ProductCard key={r.sku} r={r} best={layout.best.has(r.sku)}
                                           overBudget={overBudget(r)} {...cardProps("results")} />
                            ))}
                          </div>
                          {layout.grid.length > moreN && (
                            <div style={{ textAlign: "center", marginTop: 14 }}>
                              <button className="fchip" style={{ padding: "9px 22px" }}
                                      onClick={() => { setMoreN((n) => n + 24); track("show_more", { query: s.query, n: moreN + 24 }); }}>
                                Show more ({layout.grid.length - moreN} left)
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="group">
                            <div className="gh">
                              <h3>Best matches</h3>
                              <span className="gc">{persona ? "ranked for your profile · price fit, brand preference, quality & trust" : "highest-scoring picks for this search"}</span>
                            </div>
                            <div className="grid">
                              {layout.rec.map((r) => <ProductCard key={r.sku} r={r} best overBudget={overBudget(r)} {...cardProps("recommended")} />)}
                            </div>
                          </div>
                          {layout.groups.map((g) => (
                            <div className="group" key={g.cat}>
                              <div className="gh">
                                <h3>{displayCat(g.cat)}</h3>
                                <span className="gc">{g.items.length} picks from this match</span>
                              </div>
                              <div className="grid">
                                {g.items.map((r) => <ProductCard key={r.sku} r={r} overBudget={overBudget(r)} {...cardProps("results")} />)}
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
                                {layout.more.slice(0, moreN).map((r) => <ProductCard key={r.sku} r={r} overBudget={overBudget(r)} {...cardProps("results")} />)}
                              </div>
                              {layout.more.length > moreN && (
                                <div style={{ textAlign: "center", marginTop: 14 }}>
                                  <button className="fchip" style={{ padding: "9px 22px" }}
                                          onClick={() => { setMoreN((n) => n + 24); track("show_more", { query: s.query, n: moreN + 24 }); }}>
                                    Show more ({layout.more.length - moreN} left)
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                      {s.ok === false && s.turn < 4 && (
                        <div className="meta">One follow-up question can usually tighten this — pick an option above.</div>
                      )}
                    </>
                  )}
                </>
              )}

              {!s && preview && (
                preview.rails ? (
                  // G8: festival window -> time-aware budget rails replace
                  // the static trending grid (occasion-awareness before
                  // the first search).
                  <div>
                    <div className="sec-head">
                      <h2>{preview.rails.festival} gift ideas</h2>
                      <span className="count">
                        {preview.rails.festival} is {preview.rails.days === 0 ? "today" :
                          preview.rails.days < 0 ? `${Math.abs(preview.rails.days)} days ago` :
                          `${preview.rails.days} day${preview.rails.days === 1 ? "" : "s"} away`} · best-rated per budget · {preview.catalogSize.toLocaleString("en-IN")} products loaded
                      </span>
                    </div>
                    {preview.rails.bands.map((b) => (
                      <div className="rail" key={b.label}>
                        <div className="rail-head">
                          <h3>{b.label}</h3>
                          <span className="gc">{b.items.length} picks · festive goods & gifts</span>
                        </div>
                        <div className="rail-row">
                          {b.items.map((r) => (
                            <ProductCard key={r.sku} r={r} onAdd={(x) => addToCart(x, "preview")}
                                         onOpen={(x) => openPdpSku(x.sku, preview.rails.bands.flatMap((z) => z.items), "preview")} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div>
                    <div className="sec-head">
                      <h2>Trending across price bands</h2>
                      <span className="count">{preview.catalogSize.toLocaleString("en-IN")} products loaded · best-rated per band</span>
                    </div>
                    <div className="grid">
                      {preview.items.map((r) => (
                        <ProductCard key={r.sku} r={r} onAdd={(x) => addToCart(x, "preview")}
                                     onOpen={(x) => openPdpSku(x.sku, preview.items, "preview")} />
                      ))}
                    </div>
                  </div>
                )
              )}
            </>
          )
        ) : tab === "orders" ? (
          <OrdersView orders={orders} />
        ) : (
          <AnalyticsView anview={anview} setAnview={switchAnview} />
        )}
      </div>
      <footer>
        <div className="foot-inner">
          <div className="foot-brand">Ask<span>Cart</span> · guided shopping search</div>
          <div className="foot-col">Demo catalogue: 52,656 SKUs (≈25k US-sourced listings converted to INR + ≈28k India layer) with indicative prices and ratings — not a live marketplace. Checkout is simulated: no payments, addresses or real delivery.</div>
          <div className="foot-note">Every interaction event is public in Analytics · AI answers only from catalogue fields · method & evidence: PROJECT.md</div>
        </div>
      </footer>
      {tab === "search" && (
        <ChatLauncher
          nudge={chatNudge}
          onOpen={() => {
            if (chatNudge) {
              track("chat_nudge_accepted", { trigger: "null_search" });
              try { sessionStorage.setItem("askcart_chat_nudged", "1"); } catch {}
              setChatNudge(false);
            }
            setChatOpen(true);
          }}
          onNudgeDismiss={() => {
            track("chat_nudge_dismissed", { trigger: "null_search" });
            setChatNudge(false);
          }}
        />
      )}
      </div>
      <ChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        context={chatContext}
        onApplySearch={(q, opts, meta) => chatApplySearch(q, opts, meta)}
        onAddToCart={(sku) => chatAddToCart(sku)}
        onOpenPdp={(sku) => { setChatOpen(false); chatOpenPdp(sku); }}
        onOpenCart={() => { setCartOpen(true); track("cart_view", { item_count: cartCount, source: "chat" }); }}
        itemPool={[...(s ? s.results : []), ...(pdp ? [pdp] : []), ...(preview ? preview.items : [])]}
      />
      <ProductDetail item={pdp} onClose={closePdp}
                     onAdd={(r) => addToCart(r, "pdp")}
                     onBuy={(r) => buyNow({ ...r, _from: "pdp" })}
                     similar={pdp ? similarFor(pdp, s ? s.results : (preview ? preview.items : [])) : []}
                     parsed={s ? s.parsed : null}
                     region={region}
                     onOpenSku={(x) => openPdpSku(x.sku, s ? s.results : (preview ? preview.items : []), "pdp")} />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} cart={cart} setCart={setCart}
                  onCheckout={(total) => { pushNav(); setCartOpen(false); setCheckoutOpen(true); }} />
      <CheckoutModal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} cart={cart} onPlaced={placeOrder} />
      <OrderToast order={order} onClose={() => setOrder(null)} />
    </div>
  );
}

export default function Home() {
  return <AskCartHome />;
}
