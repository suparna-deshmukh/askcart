"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { track, getPersona, cohortOf, getSessionId } from "./lib/track";
import { t } from "./lib/i18n";
import { Onboarding, BUDGET_STYLE_MAX, SPEND_BIAS, SPEND_BRAND_AFFINITY } from "./ui/onboarding";
import { CartDrawer } from "./ui/cart";
import { CheckoutView, ConfirmationView } from "./ui/checkout";
import { AnalyticsView } from "./ui/analytics";
import { OrdersView } from "./ui/orders";
import { PdpView, QuickView } from "./ui/pdp";
import { Tile } from "./ui/kit/Tile";
import { ChatLauncher } from "./ui/chat/ChatLauncher";
import { ChatPanel } from "./ui/chat/ChatPanel";
import { SAMPLE_QUERIES } from "./lib/sample_queries";
import { INTEREST_MATCH, INTEREST_QUERIES, customInterestTokens, interestScore, interestQueries, starterPrompts } from "../lib/persona";
import { KitPage } from "./ui/kit/KitPage";
import { Header } from "./ui/shell/Header";
import { Announcement } from "./ui/shell/Announcement";
import { NavDrawer } from "./ui/shell/NavDrawer";
import { TabBar } from "./ui/shell/TabBar";
import { Footer } from "./ui/shell/Footer";
import { ToasterProvider, useToast } from "./ui/kit/Toaster";
import { useChat } from "./ui/chat/useChat";
import { looksConversational } from "../lib/ask";
import { WishlistView } from "./ui/wishlist";
import { ProductCard, VARIANT_PAREN } from "./ui/cards";
import { HeroDemo, HomeSections, useTypewriter } from "./ui/home";
import { FilterSidebar, FilterBar } from "./ui/filters";
import { I } from "./ui/kit/Icon";
import { Button } from "./ui/kit/Button";

// Hero "popular" chips - single source of truth in lib/sample_queries.js
// (verified against the live search API; precomputed in the semantic
// query-emb cache; clicks tracked with source:"example" -> Analytics).
const EXAMPLES = SAMPLE_QUERIES;

// L3: "Ask the assistant" row under the result summary (all rule-based).
const ASK_ROW_CHIPS = [
  { id: "narrow", t: "askNarrow" },
  { id: "compare", t: "askCompare" },
  { id: "persona", t: "askPersona" },
  { id: "explain", t: "askExplain" },
];
function askRowSeed(id, persona, s) {
  if (id === "narrow") return "Narrow this down for me";
  if (id === "compare") return "Compare the top 3";
  if (id === "explain") return "Why did you pick the first one?";
  const ctx = (persona && persona.context) || "";
  if (ctx === "Gifting") return "gift under 5000";
  if (ctx === "Family and kids") return "gift for kids under 3000";
  if (ctx === "Home and appliances") return "home appliance under 5000";
  return "gift under 2000";
}
// L7: "Continue your chat" topic from the last assistant message.
function lastChatTopic(messages) {
  const m = [...(messages || [])].reverse().find((x) => x.role === "assistant" && x.kind === "text");
  if (!m) return null;
  const q = (m.components || []).find((c) => c.kind === "question");
  if (q && q.text) return String(q.text).slice(0, 44);
  const p = (m.components || []).find((c) => c.kind === "products");
  if (p && p.items && p.items[0] && p.items[0].title) return String(p.items[0].title).slice(0, 44);
  return null;
}

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
const DEFAULT_FILTERS = { sort: "relevance", brands: [], band: null, rating4: false, category: null, noAccessories: false, priceMin: null, priceMax: null };

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
  // Phase 4: explicit min/max (additive; defaults null = off)
  if (f.priceMin != null) out = out.filter((r) => r.price >= f.priceMin);
  if (f.priceMax != null) out = out.filter((r) => r.price <= f.priceMax);
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
function recommendScore(r, persona, interestCtx) {
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
  if (interestCtx) base += interestScore(r, interestCtx.interests, interestCtx.tokens).score * 0.9;
  return base;
}

// S7: fold variant families into one card and cap 2 cards per (brand, model)
// in the ranked grid, so near-duplicate listings can't fill the top of the page.
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

// Gemini 4-point spark mark (the AI that plans the questions). Pure
// decorative, guide-palette coloured via currentColor.
function GeminiSpark({ size = 14 }) {
  return (
    <svg className="gemini-spark" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2c.6 5.7 4.7 9.8 10.4 10.4C16.7 13 12.6 17.1 12 22.8 11.4 17.1 7.3 13 .9 12.4 6.6 11.8 10.7 7.7 12 2z" fill="currentColor" />
    </svg>
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

function QuestionCard({ guide, lang, busy, onChip, onTyped, onSkip, progress = 1, prevCount = null, countAfter = null }) {
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
  const answered = Math.max(0, progress - 1);
  const meter = (countAfter != null && prevCount != null)
    ? (<><b>{prevCount}</b> <span className="qmeter-arr">→</span> <b className="qmeter-now">{countAfter}</b> {t(lang, "productsWord")}</>)
    : (countAfter != null ? <>{countAfter} {t(lang, "productsWord")}</> : null);
  if (refine) {
    // G11: resolved searches get a compact strip, never a card pushing
    // results down. 2026-11-06 redesign: the strip mirrors the card's
    // head row (spark + eyebrow + skip) so "marigold + spark = AskCart is
    // asking" reads the same in both states; chips wrap (never cut off)
    // and the typed row sits at the end as the "Next - type it yourself"
    // option. Phase 4: narrowing meter inline, kit Button send.
    return (
      <div className="qstrip2" role="group" aria-label={t(lang, "qOptional")}>
        <div className="qstrip2-head">
          <span className="qstrip2-spark"><I name="sparkle" size={13} /></span>
          <span className="qstrip2-eyebrow">{t(lang, "qOptional")}</span>
          <span className="qstrip2-q">{guide.question}</span>
          {meter && <span className="qmeter" aria-live="polite">{meter}</span>}
          <span className="qstrip2-prog">Question {progress}{answered > 0 ? ` · ${answered} ${t(lang, "answered")}` : ""}</span>
          <button className="qstrip2-skip" onClick={onSkip}>{t(lang, "skipQuestion")}</button>
        </div>
        <div className="qstrip2-chips">
          {guide.options.map((c) => (
            <button key={c} className={"qchip2" + (counts[c] === 0 ? " zero" : "")} onClick={() => onChip(c)} disabled={busy || counts[c] === 0}>
              {c}{counts[c] != null && <span className="ccnt">{counts[c]}</span>}
            </button>
          ))}
          {guide.options.length > 0 && (
            <button className="qchip2 qchip2-more" onClick={focusTyped}>{t(lang, "somethingElse")}</button>
          )}
        </div>
        <div className="qstrip2-typed">
          <input ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)}
                 onKeyDown={(e) => e.key === "Enter" && submitTyped()}
                 placeholder={t(lang, "orType")} aria-label="Type your answer" maxLength={80} />
          <Button variant="guide" onClick={submitTyped} disabled={busy || !typed.trim()}>{t(lang, "send")}</Button>
        </div>
        {guide.reason && <span className="qstrip2-why" title={guide.reason}>{guide.reason}</span>}
      </div>
    );
  }
  return (
    <div className="qcard2">
      <div className="qcard2-head">
        <span className="qcard2-spark"><I name="sparkle" size={15} /></span>
        <span className="qcard2-eyebrow">{t(lang, "qEyebrow")}</span>
        <span className="qcard2-dots" aria-hidden="true">
          {[...Array(progress)].map((_, n) => (
            <i key={n} className={n < answered ? "on" : "cur"} />
          ))}
        </span>
        <span className="qcard2-progtxt">Question {progress}{answered > 0 ? ` · ${answered} ${t(lang, "answered")}` : ""}</span>
        <button className="qcard2-why" onClick={() => setWhyOpen(!whyOpen)} aria-expanded={whyOpen}>{t(lang, "whyAsk")}</button>
        <button className="qcard2-skip" onClick={onSkip}>{t(lang, "skipQuestion")}</button>
      </div>
      {whyOpen && <div className="qcard2-whybox">{WHY_COPY[guide.type] || WHY_COPY.budget}</div>}
      <div className="qcard2-q">{guide.question}</div>
      {meter && <div className="qmeter qmeter-card" aria-live="polite">{meter}</div>}
      <div className="qcard2-chips" role="radiogroup" aria-label={guide.question}>
        {guide.options.map((c) => (
          <button key={c} role="radio" aria-checked="false"
                  className={"qchip2" + (counts[c] === 0 ? " zero" : "")}
                  onClick={() => onChip(c)} disabled={busy || counts[c] === 0}>
            {c}{counts[c] != null && <span className="ccnt">{counts[c]}</span>}
          </button>
        ))}
        {guide.options.length > 0 && (
          <button className="qchip2 qchip2-more" onClick={focusTyped}>{t(lang, "somethingElse")}</button>
        )}
      </div>
      <div className="qcard2-typed">
        <input ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)}
               onKeyDown={(e) => e.key === "Enter" && submitTyped()}
               placeholder={t(lang, "orType")} aria-label="Type your answer" maxLength={80} />
        <Button variant="guide" onClick={submitTyped} disabled={busy || !typed.trim()}>{t(lang, "send")}</Button>
      </div>
    </div>
  );
}

function AskCartHome() {
  const toast = useToast();
  const [input, setInput] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const [tnavCollapsed, setTnavCollapsed] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [facets, setFacets] = useState(null);
  const [wish, setWish] = useState([]);
  const [wishHydrated, setWishHydrated] = useState(false);
  const [recent, setRecent] = useState([]);
  const [expando, setExpando] = useState(false);
  const [searchFocus, setSearchFocus] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [density, setDensity] = useState("cozy");
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > window.innerHeight * 2);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const params = useSearchParams();
  if (params.get("kit") === "1") return <KitPage />;
  // shell: scroll shadow + tier-2 hide on scroll down
  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 8);
      if (Math.abs(y - lastY) > 24) { setTnavCollapsed(y > lastY && y > 160); lastY = y; }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  // shell: catalogue facets (categories/brands) for nav + mega — one fetch
  useEffect(() => {
    fetch("/api/analytics/catalog").then((r) => r.json()).then(setFacets).catch(() => {});
  }, []);
  // shell: wishlist (localStorage, cap 100)
  useEffect(() => {
    try { const w = JSON.parse(localStorage.getItem("askcart_wishlist_v1") || "[]"); if (Array.isArray(w)) setWish(w.slice(0, 100)); } catch {}
    setWishHydrated(true);
  }, []);
  // Phase 3: recently viewed (localStorage askcart_recent_v1, cap 12)
  useEffect(() => {
    try { const rv = JSON.parse(localStorage.getItem("askcart_recent_v1") || "[]"); if (Array.isArray(rv)) setRecent(rv.slice(0, 12)); } catch {}
  }, []);
  function touchRecent(item) {
    const slim = { sku: item.sku, title: item.title, brand: item.brand, category: item.category,
                   price: item.price, rating: item.rating, num_ratings: item.num_ratings,
                   family_id: item.family_id, family_min_price: item.family_min_price, variant_summary: item.variant_summary };
    setRecent((rv) => {
      const next = [slim, ...(rv || []).filter((x) => x.sku !== slim.sku)].slice(0, 12);
      try { localStorage.setItem("askcart_recent_v1", JSON.stringify(next)); } catch {}
      return next;
    });
  }
  function toggleWish(item, silent) {
    setWish((w) => {
      const has = w.includes(item.sku);
      const next = has ? w.filter((x) => x !== item.sku) : [item.sku, ...w].slice(0, 100);
      try { localStorage.setItem("askcart_wishlist_v1", JSON.stringify(next)); } catch {}
      track(has ? "wishlist_remove" : "wishlist_add", { sku: item.sku, wishlist_size: next.length });
      if (silent) return next;
      if (!has) toast({ type: "success", text: "Saved to wishlist", sub: item.title, ms: 3500 });
      else toast({ type: "info", text: "Removed from wishlist", sub: item.title, action: "Undo", onAction: () => toggleWish(item), ms: 5000 });
      return next;
    });
  }
  const wishCount = wish.length;
  const [tab, setTab] = useState(() => { const v = params.get("tab"); return ["analytics", "orders", "wishlist"].includes(v) ? v : "search"; });
  const [anview, setAnview] = useState(() => {
    const v = params.get("anview");
    return v && ["overview", "search", "catalog", "journeys", "validation"].includes(v) ? v : "overview";
  });
  // SSR-safe: server and first client render must agree; localStorage state is
  // synced after mount (prevents hydration mismatches on the hero strip).
  const [onboarded, setOnboarded] = useState(true);
  const [persona, setPersonaState] = useState(null);
  // Section 3 (2026-11-08): boot splash until localStorage is synced (no
  // home flash on first visit) + full-screen onboarding gate.
  const [boot, setBoot] = useState(true);
  const [onboardNeeded, setOnboardNeeded] = useState(false);
  const [profile, setProfileState] = useState(null); // askcart_profile_v1 (name never leaves the browser)
  // Section 4: interest context for the recommendation boost — standard
  // interests plus tokens from any free-text custom interest (rule-based).
  const interestCtx = useMemo(() => {
    const list = (persona && Array.isArray(persona.interests)) ? persona.interests : [];
    const interests = list.filter((x) => INTEREST_MATCH[x]);
    const tokens = [...new Set(list.filter((x) => !INTEREST_MATCH[x]).flatMap((x) => customInterestTokens(x)))];
    return { interests, tokens };
  }, [persona]);
  // O1/O2: language + pincode strip (non-blocking), persona v3 learning later.
  const [lang, setLangState] = useState("en");
  const [pin, setPin] = useState("");
  const [region, setRegion] = useState(null);
  const [stripDismissed, setStripDismissed] = useState(true);
  useEffect(() => {
    try {
      const noob = new URLSearchParams(window.location.search).get("noob") === "1";
      const forced = new URLSearchParams(window.location.search).get("onboard") === "1";
      // Section 3: first visit (no askcart_onboarded) or /?onboard=1 forces
      // the full-screen onboarding; ?noob=1 bypasses it.
      if (!noob && (localStorage.getItem("askcart_onboarded") !== "1" || forced)) {
        setOnboarded(false);
        setOnboardNeeded(true);
      }
      const l = localStorage.getItem("askcart_lang");
      if (["en", "hi", "hinglish"].includes(l)) setLangState(l);
      const rv = JSON.parse(localStorage.getItem("askcart_region") || "null");
      if (rv && rv.region) setRegion(rv.region);
      setStripDismissed(localStorage.getItem("askcart_strip_dismissed") === "1");
      try { setProfileState(JSON.parse(localStorage.getItem("askcart_profile_v1") || "null")); } catch {}
      try { setPersonaState(JSON.parse(localStorage.getItem("askcart_persona") || "null")); } catch {}
      setBoot(false);
    } catch { setBoot(false); }
    // LLM routing status for the top-bar pill (no LLM call made - the
    // ledger read is free, so poll every 30 s to keep the totals fresh).
    const refreshAiStatus = () =>
      fetch("/api/ai-status").then((r) => r.json()).then((j) => {
        if (j && j.ok) {
          setAiStatus(j);
          aiBudgetRef.current = Math.max(1, Number(j.aiMaxPerSession) || 8);
        }
      }).catch(() => {});
    refreshAiStatus();
    const iv = setInterval(refreshAiStatus, 30000);
    return () => clearInterval(iv);
  }, []);
  const [stripOpen, setStripOpen] = useState(false);
  // LLM routing status (top-bar pill + key-rotation toasts).
  const [aiStatus, setAiStatus] = useState(null); // {gemini, aiMaxPerSession}
  const lastAiViaRef = useRef(null);   // "gemini" | null
  const lastAiKeyRef = useRef(null);
  // Item B: true while the shown question came from the one-call journey
  // plan - then ai-refine returns FILTERS ONLY and the plan (via /api/guide,
  // cached server-side, zero extra LLM calls) owns the next question.
  const planPhraseRef = useRef(false);
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
  // Phase 5: PDP delivery check reuses the same coarse mapping (pincode never
  // leaves the browser; analytics see only the region).
  function savePincode(pincode) {
    if (!/^\d{6}$/.test(pincode)) return;
    const r = { pincode, region: pinRegion(pincode) };
    try { localStorage.setItem("askcart_region", JSON.stringify(r)); } catch {}
    setRegion(r.region);
    track("region_set", { region: r.region });
  }
  const [s, setS] = useState(null); // active search state (see below)
  const heroPh = useTypewriter(EXAMPLES, searchFocus || !!s);
  const exRot = useMemo(() => {
    const r = new Date().getDate() % EXAMPLES.length;
    const rotated = EXAMPLES.slice(r).concat(EXAMPLES.slice(0, r));
    const iq = interestQueries(interestCtx.interests, interestCtx.tokens).slice(0, 2);
    return [...iq, ...rotated.filter((q) => !iq.includes(q))].slice(0, 6);
  }, [interestCtx]);
  // Section 4: "Picked for you" rail — top items in the chosen interests,
  // ranked by recommendScore with the interest boost. Two search calls,
  // fired once per (persona, home, no active search).
  // L2: persona-based example-ask chips (rule-based starterPrompts sends).
  const heroAskChips = useMemo(() => {
    const cap = persona && BUDGET_STYLE_MAX[persona.spendStyle];
    const sp = starterPrompts(persona, cap == null ? 5000 : cap);
    if (!sp) return [];
    return sp.slice(0, 3).map((q, i) => ({ id: "hc" + i, label: t(lang, q.label, { x: q.vars && q.vars.x ? (q.vars.x === "Electronics" ? t(lang, "obIntElectronics") : q.vars.x) : "", cap: q.vars && q.vars.cap ? q.vars.cap : "" }), seed: q.send }));
  }, [persona, lang]);
  const [picked, setPicked] = useState(null);
  const skipCountRef = useRef(0);
  const filterCountRef = useRef(0);
  const pdpSeenRef = useRef(new Set());
  useEffect(() => {
    if (boot || tab !== "search" || s || !interestCtx.interests.length) return;
    const std = interestCtx.interests.slice(0, 2);
    let alive = true;
    Promise.all(std.map((it) =>
      fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: INTEREST_QUERIES[it], limit: 24 }) })
        .then((r) => r.json()).catch(() => null)
    )).then((resps) => {
      if (!alive) return;
      const seen = new Set();
      const items = resps.filter(Boolean).flatMap((j) => (j && Array.isArray(j.results) ? j.results : []))
        .filter((r) => { if (!r || !r.sku || seen.has(r.sku)) return false; seen.add(r.sku); return true; });
      if (!items.length) return;
      items.sort((a, b) => recommendScore(b, persona, interestCtx) - recommendScore(a, persona, interestCtx));
      setPicked({ items: items.slice(0, 10), interests: std });
    });
    return () => { alive = false; };
  }, [boot, tab, s, interestCtx, persona]);
  const h1txt = t(lang, "heroTitle");
  const heroH1 = lang === "en" ? (() => {
    const i = h1txt.indexOf("own words");
    if (i < 0) return h1txt;
    return (<>{h1txt.slice(0, i)}<em className="hero2-em">own words<svg className="hero2-squiggle" viewBox="0 0 120 8" preserveAspectRatio="none" aria-hidden="true"><path d="M2 5.5C22 1.5 44 1.5 60 4.5 78 7.5 100 6 118 3" fill="none" stroke="var(--guide)" strokeWidth="3" strokeLinecap="round" /></svg></em>{h1txt.slice(i + 9)}</>);
  })() : h1txt;
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
  const [buyNowItem, setBuyNowItem] = useState(null); // S6: Buy Now orders check out ONE item without touching the cart
  const [order, setOrder] = useState(null);
  // 7.1: product detail drawer (linkable via ?sku=)
  const [pdp, setPdp] = useState(null);
  const scrollRef = useRef(0); // Phase 5: origin search scroll position, restored on PDP close
  const [quick, setQuick] = useState(null); // Phase 5: quick view modal item
  const [moreN, setMoreN] = useState(24); // 7.3: "Show more" page size
  // P3-lite: Plain = the legacy keyword baseline (naive mode: no budget/
  // occasion understanding, no questions) kept only as a reviewer A/B
  // behind ?mode=plain. Guided is the default and the only mode the UI
  // offers - a guided-search product must not make the shopper pick the
  // mode (product requirement 2026-11-05).
  const [plainMode, setPlainMode] = useState(() => params.get("mode") === "plain");
  // Reviewer A/B baseline: ?chat=off hides every assistant surface.
  const chatOff = params.get("chat") === "off";
  // L4: hero Search|Ask toggle (remembers the last choice).
  const [searchMode, setSearchModeState] = useState(() => {
    try { return localStorage.getItem("askcart_searchmode") === "ask" ? "ask" : "search"; } catch { return "search"; }
  });
  function setSearchMode(m) {
    setSearchModeState(m);
    try { localStorage.setItem("askcart_searchmode", m); } catch {}
    if (m === "ask") track("search_to_ask_switch", { how: "toggle" });
  }
  const [chatOpen, setChatOpenState] = useState(false);
  const [chatNudge, setChatNudge] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [peek, setPeek] = useState(null); // L7 reply peek bubble
  const peekTimer = useRef(null);
  const [chatAskSku, setChatAskSku] = useState(null);
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
           filters: { ...DEFAULT_FILTERS }, guide: null, trail, exhausted: !ok, error: null, counts: [res.results.length],
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
  // 5C: chat actions resolve SKUs from the same pool the page uses, then call
  // the identical page handlers (no duplicate logic).
  function chatPool() {
    return [...(s ? s.results : []), ...(pdp ? [pdp] : []), ...(preview ? preview.items : [])];
  }
  function buyNowSku(sku) {
    const item = chatPool().find((x) => x.sku === sku);
    if (item) buyNow(item, "chat");
  }
  function removeFromCartSku(sku) {
    const entry = cart[sku];
    if (!entry) return;
    const item = entry.item;
    setCart((c) => { const n = { ...c }; delete n[sku]; return n; });
    toast({ type: "info", text: t(lang, "removedFromCart"), action: t(lang, "undo"), onAction: () => addToCart(item, "undo") });
  }
  function wishSku(sku) {
    const item = chatPool().find((x) => x.sku === sku);
    if (item) toggleWish(item);
  }
  function actionUndo(action, sku) {
    if (action === "add_to_cart") removeFromCartSku(sku);
    else if (action === "remove_from_cart") buyNowSkuReadd(sku);
    else if (action === "add_to_wishlist") wishSku(sku);
  }
  function buyNowSkuReadd(sku) {
    const item = chatPool().find((x) => x.sku === sku);
    if (item) addToCart(item, "undo");
  }
  // Phase 5: one-shot prompt from the PDP "Ask AskCart" section — ChatPanel
  // consumes it (sends the message) and the page clears it.
  const [chatPrompt, setChatPrompt] = useState(null);
  function askFromPdp(prompt) {
    setChatPrompt({ text: prompt, nonce: Date.now() });
    setChatOpen(true);
    track("pdp_ask", { source: "pdp_prompt_chip" });
  }
  const chatContext = {
    sku: pdp ? pdp.sku : (chatAskSku || null),
    query: s ? s.query : null,
    region,
    source: pdp ? "pdp" : (chatNudge ? "null_escalation" : "hero"),
    prompt: chatPrompt,
    skus: s && s.results ? s.results.slice(0, 3).map((r) => r.sku) : null,
  };
  // 5C: chat state lifted to the page so replies land (and badge the pill)
  // even when the panel is closed; the page never locks while a reply runs.
  const chat = useChat({
    open: chatOpen,
    context: chatContext,
    onApplySearch: chatApplySearch,
    onAddToCart: (sku) => chatAddToCart(sku),
    onOpenPdp: chatOpenPdp,
    onOpenCart: () => { setCartOpen(true); track("cart_view", { item_count: cartCount, source: "chat" }); },
    onBuyNow: buyNowSku,
    onRemoveFromCart: removeFromCartSku,
    onWishSku: wishSku,
    onClosedReply: (asst) => {
      setChatUnread((n) => n + 1);
      const first = String(asst.text || "").split(/\n/)[0].slice(0, 90);
      setPeek({ text: first, key: asst.id });
      track("chat_peek_shown", {});
      clearTimeout(peekTimer.current);
      peekTimer.current = setTimeout(() => setPeek(null), 5000);
    },
    onActionExecuted: (a) => {
      const labels = {
        apply_search: "askActSearch", add_to_cart: "askActAdd", buy_now: "askActBuy",
        open_product: "askActOpen", open_cart: "askActCart", remove_from_cart: "askActRemove",
        add_to_wishlist: "askActWish",
      };
      chat.pushLocal({
        id: "act_" + Date.now().toString(36) + "_" + a.action,
        role: "system", kind: "action",
        text: t(lang, labels[a.action] || "askActSearch"),
        action: a.action, sku: a.sku || null,
      });
    },
  });
  const chatContTopic = useMemo(() => lastChatTopic(chat.messages), [chat.messages]);
  function setChatOpen(v) {
    setChatOpenState(v);
    if (v) { setChatUnread(0); setPeek(null); }
  }
  function openChat(source, seed = null) {
    if (chatOff) return;
    if (seed) {
      setChatPrompt({ text: seed, nonce: Date.now() });
      track("chat_seeded_action", { source, surface: source });
    }
    chat.open(source);
    setChatOpen(true);
  }

  // ---- L6: proactive peek prompts (rule-based, capped, polite) ----
  const [prompt, setPrompt] = useState(null);
  const promptStats = useRef({ last: 0, shown: 0, dismissed: 0, suppressed: {} });
  function typingActive() {
    let a = null;
    try { a = document.activeElement; } catch {}
    return searchFocus || !!(a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA"));
  }
  function maybePrompt(trigger, text, action) {
    const st = promptStats.current;
    if (chatOff || chatOpen || !onboarded || checkoutOpen || boot || prompt) return;
    if (st.suppressed[trigger] || st.dismissed >= 2 || st.shown >= 3) return;
    if (Date.now() - st.last < 90000 || typingActive()) return;
    st.last = Date.now(); st.shown += 1;
    setPrompt({ trigger, text, action });
    track("chat_prompt_shown", { trigger });
  }
  function promptClick() {
    const p = prompt;
    if (!p) return;
    setPrompt(null);
    track("chat_prompt_click", { trigger: p.trigger });
    p.action();
  }
  function promptDismiss() {
    const p = prompt;
    if (!p) return;
    setPrompt(null);
    const st = promptStats.current;
    st.suppressed[p.trigger] = true;
    st.dismissed += 1;
    track("chat_prompt_dismiss", { trigger: p.trigger });
  }
  useEffect(() => {
    if (chatOff || tab !== "search" || s || !onboarded || chatOpen) return;
    const tm = setTimeout(() => maybePrompt("home_idle", t(lang, "askHomeIdle"), () => openChat("prompt_idle", null)), 8000);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOff, tab, s, onboarded, chatOpen]);
  useEffect(() => {
    if (s && s.ok === false) {
      maybePrompt("weak_search", t(lang, "askWeak"), () => openChat("prompt_weak", s.query));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s && s.ok === false, s && s.query]);
  // L6: PDP dwell 20 s - one gentle prompt, seeded with the first PDP ask chip.
  useEffect(() => {
    if (chatOff || !pdp || chatOpen || checkoutOpen || !onboarded || boot) return;
    const tm = setTimeout(() => maybePrompt("pdp_dwell", t(lang, "askPdpDwell"), () => openChat("prompt_pdp_dwell", t(lang, "askGift"))), 20000);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOff, pdp, chatOpen, checkoutOpen, onboarded]);
  useEffect(() => {
    if (!prompt) return;
    const h = (e) => { if (e.key === "Escape") promptDismiss(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  });

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
    if (pdp && prev.search) requestAnimationFrame(() => window.scrollTo(0, scrollRef.current || 0));
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
    toast({ type: "info", ms: 6000,
      text: "Gemini key " + (from + 1) + " daily limit hit - switched to " +
        (to == null ? "the built-in rules" : "key " + (to + 1)) + ". Guidance continues." });
  }
  function aiNotice(decision) {
    if (!decision) return;
    if (decision.gemini) setAiStatus((st) => (st ? { ...st, gemini: decision.gemini } : st));
    if (decision.planner) {
      lastAiViaRef.current = "gemini";
      lastAiKeyRef.current = (decision.plannerAi && decision.plannerAi.keyIdx) ?? null;
      if (decision.plannerAi && decision.plannerAi.rotatedFrom != null) aiSwitchToast(decision.plannerAi.rotatedFrom, decision.plannerAi.keyIdx);
    }
    if (aiBudgetRef.current === 0 && !aiBudgetNotedRef.current) {
      aiBudgetNotedRef.current = true;
      toast({ type: "info", ms: 6000,
        text: "Quick mode: to keep responses fast, the remaining questions in this session come from the built-in rules." });
    }
  }
  function aiRefineNotice(j) {
    if (!j) return;
    const ai = j.ai || {};
    if (ai.gemini) setAiStatus((st) => (st ? { ...st, gemini: ai.gemini } : st));
    if (j.via === "gemini") { lastAiViaRef.current = "gemini"; lastAiKeyRef.current = ai.keyIdx ?? null; }
    if (ai.rotatedFrom != null) aiSwitchToast(ai.rotatedFrom, ai.keyIdx);
    if (aiBudgetRef.current === 0 && !aiBudgetNotedRef.current) {
      aiBudgetNotedRef.current = true;
      toast({ type: "info", ms: 6000,
        text: "Quick mode: to keep responses fast, the remaining questions in this session come from the built-in rules." });
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
    // Item B: a cached plan read made NO LLM call - give the budget unit
    // back so the session budget tracks real Gemini calls, not turns.
    if (useAI && j.decision && j.decision.plannerAi && j.decision.plannerAi.cached) {
      aiBudgetRef.current += 1;
    }
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

  function noteRecentQuery(q) {
    const t = String(q || "").trim();
    if (!t) return;
    try {
      const cur = JSON.parse(localStorage.getItem("askcart_recent_q_v1") || "[]");
      const next = [t, ...(Array.isArray(cur) ? cur : []).filter((x) => x !== t)].slice(0, 5);
      localStorage.setItem("askcart_recent_q_v1", JSON.stringify(next));
    } catch {}
  }
  async function startSearch(query, source = "input", modeOverride = undefined) {
    noteRecentQuery(query);
    if (!query.trim() || busy) return;
    const naive = modeOverride !== undefined ? modeOverride : plainMode;
    if (journeyRef.current && !journeyRef.current.ended) {
      endJourney(journeyRef.current, { resolved: !!s && s.ok === true, turns: s ? s.turn : 1 });
    }
    setBusy(true);
    pushNav({ search: null });
    setS({ query, turn: 1, ok: null, results: [], total: null, filters: { ...DEFAULT_FILTERS }, guide: null, trail: [query], exhausted: false, error: null });
    setInput("");
    planPhraseRef.current = false;
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
    setS({ query, turn: 1, ok, ms: Date.now() - t0, results: res.results, total: res.total_matches ?? res.results.length, parsed: res.parsed, filters: { ...DEFAULT_FILTERS }, guide: null, trail: [query], exhausted: false, error: null, counts: [res.results.length] });
    setMoreN(24);
    if (ok) {
      track("resolved", { query, turns: 1, n_results: res.results.filter((r) => r.intent).length, journey_id: journeyRef.current.id });
      if (naive) { endJourney(journeyRef.current, { resolved: true, turns: 1 }); setBusy(false); return; }
      // Optional refinement: the policy decides if one more question adds
      // value (e.g. budget for an open-ended "headphones" query).
      // n_results = intent-hit count (same semantics as the study).
      const g = await askGuide(query, res.results.filter((r) => r.intent).length, 2);
      if (g.guide) {
        planPhraseRef.current = !!(g.decision && g.decision.planPhrase);
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

  // Item 6 (Gemini ai-refine): /api/ai-refine returns validated,
  // actionable output - filters to merge into the re-search and the next
  // question (type + prompt + grounded options with counts). The server
  // validates every value against the live narrowed set, so Gemini can
  // never invent a brand/category/price/keyword; when it is down or
  // empty the page behaves exactly as v6 (deterministic policy).
  // 2026-11-08 (rules-first, Gemini budget 20/key/day): the refine call
  // fires only where the deterministic chain has a gap - a chip that
  // resolved to a structured slot while the journey plan owns the
  // question sequence is fully rule-covered and costs ZERO Gemini calls.
  // Free-text answers and unplanned journeys still get the AI pass.
  async function askAIRefine({ query, queryExt, slots, answer, answerType, prevTypes, question = true }) {
    if (aiBudgetRef.current <= 0) return null; // quick mode: deterministic chain continues
    aiBudgetRef.current -= 1;
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 5500);
    try {
      const r = await fetch("/api/ai-refine", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, query_ext: queryExt || "", slots, answer, answer_type: answerType, prev_types: prevTypes || [], question, lang, session_id: getSessionId() }),
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
    } else if (guide.type === "category") {
      // "Any category" is the safe option: apply nothing, keep the whole
      // narrowed set (the chain continues on the same set).
      if (/^any category$/i.test(chip)) {
        opts = {};
      } else {
        const c = s.results.find((r) => r.category &&
          (String(chip).toLowerCase().includes(String(r.category).toLowerCase()) ||
           displayCat(r.category).toLowerCase() === String(chip).toLowerCase()));
        if (c) opts = { category: c.category };
        else extraQ = chip;
      }
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
    // Item 6: the AI refine (Gemini) runs IN FLIGHT while the
    // deterministic re-search executes; the page waits at most ~4.5s for
    // it, so a down provider never stalls the grid (v6 latency).
    // Rules-first gate: plan active + chip resolved to a structured slot
    // (brand/category/budget/occasion/forWhom/size/capacity) -> the
    // deterministic chain already applies everything, skip the call.
    const ruleCovered = planPhraseRef.current && Object.keys(opts).length > 0;
    const aiPromise = !plainMode && !ruleCovered
      ? askAIRefine({ query: s.query, queryExt: extraQ, slots: { ...trailOpts(), ...(s.parsed && s.parsed.budgetMax ? { budget: s.parsed.budgetMax } : {}), ...(s.parsed && s.parsed.occasion ? { occasion: s.parsed.occasion } : {}) },
                      answer: { label: trailLabel, opts }, answerType: guide.type,
                      prevTypes: journeyRef.current ? journeyRef.current.prevTypes || [] : [],
                      question: !planPhraseRef.current })
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
           echo: echoFor(trailLabel, res.total_matches ?? finalResults.length, s.total ?? s.results.length), error: null, counts: [...(s.counts || []), finalResults.length] });
    if (ok) {
      track("resolved", { query: s.query, turns: turnNow, n_results: finalResults.filter((r) => r.intent).length, journey_id: journeyRef.current.id });
      // Keep guiding: a resolved result is a start, not the destination.
      // Ask the next ladder question until 1 item remains (or 0), the
      // ladder runs dry, or the shopper skips (2026-11-06: no turn cap).
      if (!plainMode) {
        const g2 = (planPhraseRef.current ? null : aiGuideWrap(ai)) || (await askGuide(s.query, finalResults.filter((r) => r.intent).length, turnNow + 1, newSlots));
        if (g2.guide) {
          planPhraseRef.current = !!(g2.decision && g2.decision.planPhrase);
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
    // Keep guiding: the policy keeps offering grounded questions on the
    // narrowed set until 1 item remains (or 0), the ladder runs dry, or
    // the shopper skips (2026-11-06: no turn cap).
    if (!plainMode) {
      const g = (planPhraseRef.current ? null : aiGuideWrap(ai)) || (await askGuide(s.query, finalResults.filter((r) => r.intent).length, turnNow + 1, newSlots));
      if (g.guide) {
        planPhraseRef.current = !!(g.decision && g.decision.planPhrase);
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
                      prevTypes: journeyRef.current ? journeyRef.current.prevTypes || [] : [],
                      question: !planPhraseRef.current })
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
           echo: `${txt} · ${res.total_matches ?? res.results.length} of ${s.total ?? s.results.length} left`, error: null, counts: [...(s.counts || []), res.results.length] });
    if (ok) {
      track("resolved", { query: s.query, turns: turnNow, n_results: intentN, journey_id: journeyRef.current.id });
      // Same keep-guiding rule as chip answers: the typed text narrows
      // the set, so the next question is built on the narrowed set.
      if (!plainMode) {
        const g2 = (planPhraseRef.current ? null : aiGuideWrap(ai)) || (await askGuide(s.query + " " + txt, intentN, turnNow + 1, { ...trailOpts(), ...aiOpts }));
        if (g2.guide) {
          planPhraseRef.current = !!(g2.decision && g2.decision.planPhrase);
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
    if (!plainMode) {
      const g = (planPhraseRef.current ? null : aiGuideWrap(ai)) || (await askGuide(s.query + " " + txt, intentN, turnNow + 1, { ...trailOpts(), ...aiOpts }));
      if (g.guide) {
        planPhraseRef.current = !!(g.decision && g.decision.planPhrase);
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
    skipCountRef.current += 1;
    if (skipCountRef.current >= 2) {
      maybePrompt("skips_2", t(lang, "askPickForMe"), () => openChat("prompt_skips", s.query));
    }
    const intentN = s.results.filter((r) => r.intent).length;
    if (!plainMode && skips < 3) {
      const g2 = await askGuide(s.query, intentN, s.turn + 1);
      if (g2.guide) {
        planPhraseRef.current = !!(g2.decision && g2.decision.planPhrase);
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
    filterCountRef.current += 1;
    if (filterCountRef.current >= 3 && s) {
      maybePrompt("filters_3", t(lang, "askFilters3"), () => openChat("prompt_filters", s.query));
    }
    if (!s || busy) return;
    const jn = journeyRef.current;
    const nBefore = applyFilters(s.results, s.filters).length;
    let nf;
    if (type === "sort") nf = { ...s.filters, sort: value };
    else if (type === "brand") nf = { ...s.filters, brands: s.filters.brands.includes(value)
      ? s.filters.brands.filter((x) => x !== value) : [...s.filters.brands, value] };
    else if (type === "price_band") nf = { ...s.filters, band: s.filters.band === value ? null : value };
    else if (type === "price_min") nf = { ...s.filters, priceMin: s.filters.priceMin === value ? null : value };
    else if (type === "price_max") nf = { ...s.filters, priceMax: s.filters.priceMax === value ? null : value };
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
    // Visible confirmation: tile + name + price + View cart action + Undo (Toaster).
    toast({ type: "success", ms: 6000, tile: <Tile item={item} size={36} showInfo={false} />,
      text: "Added to cart", sub: item.title + " · ₹" + item.price.toLocaleString("en-IN"),
      action: "View cart",
      onAction: () => { setCartOpen(true); track("cart_view", { item_count: Object.keys(cart).length + 1, source: "toast" }); } });
    offerSurvey(jn, "add_to_cart");
  }
  function incCart(item) {
    const jn = journeyRef.current;
    if (jn) jn.added = true;
    track("add_to_cart", {
      sku: item.sku, price: item.price, category: item.category, brand: item.brand || "",
      cart_size: Object.keys(cart).length + (cart[item.sku] ? 0 : 1), from: "card_step",
      journey_id: jn ? jn.id : null, query: jn ? jn.query : null,
    });
    setCart((c) => ({ ...c, [item.sku]: { item, qty: (c[item.sku] ? c[item.sku].qty : 0) + 1 } }));
  }
  function decCart(item) {
    setCart((c) => {
      const e = c[item.sku];
      if (!e) return c;
      if (e.qty <= 1) {
        const n = { ...c }; delete n[item.sku];
        track("remove_from_cart", { sku: item.sku, cart_size: Object.keys(n).length, price: item.price });
        return n;
      }
      track("remove_from_cart", { sku: item.sku, cart_size: Object.keys(c).length, price: item.price, qty: e.qty - 1 });
      return { ...c, [item.sku]: { ...e, qty: e.qty - 1 } };
    });
  }
  function buyNow(item, source) {
    pushNav();
    const jn = journeyRef.current;
    if (jn) jn.added = true;
    if (jn && item._from === "recommended") {
      track("recommendation_click", { sku: item.sku, query: jn.query, brand: item.brand || "", journey_id: jn.id });
    }
    track("buy_now", { sku: item.sku, price: item.price, category: item.category, brand: item.brand || "" });
    track("buy_now_click", { sku: item.sku, source: source || "pdp" });
    // S6: check out ONLY this item (qty 1); the existing cart is left untouched.
    setBuyNowItem({ ...item, qty: 1 });
    track("checkout_start", { item_count: 1, total: item.price, source: "buy_now" });
    if (pdp) setPdp(null); // full-page checkout renders in the tab slot; PDP would win the branch
    openCheckout("buy_now");
  }
  // Orders hydrate after mount (SSR-safe, same pattern as cart): the seed list
  // and any persisted orders are read client-side so server/client agree.
  const [orders, setOrders] = useState(null);
  const [ordersHydrated, setOrdersHydrated] = useState(false);
  useEffect(() => {
    let os = null;
    try {
      const v = JSON.parse(localStorage.getItem("askcart_orders_v1") || "null");
      if (Array.isArray(v) && v.length) os = v;
    } catch {}
    if (!os) {
      os = [
        { id: "ord_demo_a1b2", at: Date.now() - 6 * 86400000, demo: true, total: 2448, items: [
          { title: "boAt Airdopes 141 TWS Earbuds", brand: "boAt", qty: 1, price: 1299 },
          { title: "Fabindia Cotton Kurti (Maroon M)", brand: "Fabindia", qty: 1, price: 1149 } ] },
        { id: "ord_demo_c3d4", at: Date.now() - 15 * 86400000, demo: true, total: 54989, items: [
          { title: "Sony PlayStation 5 Console (Disc Edition)", brand: "Sony", qty: 1, price: 54989 } ] },
      ];
    }
    setOrders(os);
    setOrdersHydrated(true);
  }, []);
  function openCheckout(source) {
    // Note: no cart-empty guard here — buyNow sets the cart in the same tick,
    // so a closure read would be stale. Callers guarantee a non-empty cart.
    pushNav();
    setCartOpen(false);
    setCheckoutOpen(true);
    try { window.history.replaceState(null, "", "/?tab=checkout"); } catch {}
    track("page_view", { screen: "checkout", source: source || "cart" });
  }
  function closeCheckout() {
    setBuyNowItem(null);
    if (navStack.length) goBack();
    else {
      setCheckoutOpen(false);
      try { window.history.replaceState(null, "", "/"); } catch {}
    }
  }
  function saveForLater(item) {
    const e = cart[item.sku];
    if (!e) return;
    setCart((c) => { const n = { ...c }; delete n[item.sku]; return n; });
    toggleWish(item, true);
    track("save_for_later", { sku: item.sku, from: "cart" });
  }
  function restoreFromLater(item) {
    toggleWish(item, true);
    setCart((c) => (c[item.sku] ? c : { ...c, [item.sku]: { item, qty: 1 } }));
  }
  function openPdpFetch(sku) {
    pushNav();
    fetch("/api/catalog-preview?sku=" + encodeURIComponent(sku)).then((r) => r.json())
      .then((j) => { if (j.item) { touchRecent(j.item); setPdp({ ...j.item, family: j.family || null, _from: "orders", _position: 0 }); try { window.history.replaceState(null, "", `/?sku=${sku}`); } catch {} } })
      .catch(() => {});
  }
  // Phase 6: order placement from the stepped checkout. ctx = { addr, eta, payment, items, total, count }
  function placeOrder(ctx) {
    const jn = journeyRef.current;
    const isBuyNow = !!buyNowItem;
    const rec = {
      id: "ord_" + Math.random().toString(36).slice(2, 8),
      at: Date.now(), demo: false, total: ctx.total,
      items: ctx.items.map((it) => ({ sku: it.sku, title: it.title, brand: it.brand || "", category: it.category || "", variant: it.variant || "", price: it.price, qty: it.qty })),
      address: ctx.addr ? { city: ctx.addr.city || "", state: ctx.addr.state || "" } : null,
      eta: { from: ctx.eta.from, to: ctx.eta.to },
    };
    try { setOrders((os) => { const next = [rec, ...(os || [])].slice(0, 20); localStorage.setItem("askcart_orders_v1", JSON.stringify(next)); return next; }); } catch {}
    if (jn) {
      jn.ordered = true;
      offerSurvey(jn, "order_complete");
      if (!jn.ended) endJourney(jn, { resolved: true, turns: s ? s.turn : 1, ordered: true });
    }
    track("order_complete", {
      order_id: rec.id, item_count: ctx.count, total: ctx.total, source: "checkout",
      region: region || null,
      items: ctx.items.map((it) => ({ sku: it.sku, price: it.price * it.qty })),
    });
    setOrder({ id: rec.id, at: rec.at, count: ctx.count, total: ctx.total, items: ctx.items, addr: rec.address, eta: rec.eta, payment: ctx.payment });
    setCheckoutOpen(false);
    setBuyNowItem(null);
    if (!isBuyNow) setCart({}); // Buy Now never touches the existing cart
    setCartOpen(false);
    setTab("confirmation");
    try { window.history.replaceState(null, "", "/?tab=confirmation&order=" + rec.id); } catch {}
  }

  function onOnboarded(res) {
    const p = res && res.persona ? res.persona : null;
    const prof = res && res.profile ? res.profile : null;
    setOnboarded(true);
    setOnboardNeeded(false);
    setPersonaState(p);
    setProfileState(prof);
    try { localStorage.setItem("askcart_onboarded", "1"); } catch {}
    // 2026-11-06: show the payoff of the answers, and wire them to behaviour.
    if (p) {
      const payoff =
        p.context === "Gifting" ? t(lang, "obPayGift")
        : p.ageBand === "Under 25" ? t(lang, "obPayAge")
        : p.ageBand === "40+" ? t(lang, "obPay40")
        : p.spendStyle ? t(lang, "obPaySpend") : null;
      if (p.ageBand === "40+") { try { document.body.classList.add("largetext"); } catch {} }
      if (payoff) toast({ type: "info", text: payoff, ms: 6000 });
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
    const rec = [...filtered].sort((a, b) => recommendScore(b, persona, interestCtx) - recommendScore(a, persona, interestCtx)).slice(0, 3);
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
      .slice(0, 12);
  }
  function moreFromBrandFor(item, pool) {
    if (!item || !item.brand) return [];
    return (pool || []).filter((x) => x.sku !== item.sku && x.brand === item.brand && x.category !== item.category)
      .sort((a, b) => (b.rating - a.rating) || (b.num_ratings - a.num_ratings))
      .slice(0, 12);
  }
  function openPdp(r, from, position) {
    pushNav();
    touchRecent(r);
    filterCountRef.current = 0; // a product click resets the filter-fiddling counter
    pdpSeenRef.current.add(r.sku);
    if (pdpSeenRef.current.size >= 3 && cartCount === 0) {
      maybePrompt("pdp_3", t(lang, "askCompare3"), () => openChat("prompt_compare3", "Compare the top 3"));
    }
    scrollRef.current = window.scrollY;
    setPdp({ ...r, _from: from, _position: position });
    try { window.history.replaceState(null, "", `/?sku=${r.sku}`); } catch {}
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }
  function openPdpSku(sku, pool, from) {
    const r = (pool || []).find((x) => x.sku === sku);
    if (r) openPdp(r, from, 0);
  }
  // L6: cart has items but no checkout for 30 s (re-arms on cart change).
  useEffect(() => {
    if (chatOff || cartCount === 0 || checkoutOpen || !onboarded || chatOpen) return;
    const tm = setTimeout(() => maybePrompt("cart_30s", t(lang, "askCartHelp"), () => openChat("prompt_cart", "Anything I should add or swap?")), 30000);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartCount, checkoutOpen, chatOpen, chatOff]);

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
  // Phase 4: sidebar facet counts (live, from the current result set)
  const brandCounts = useMemo(() => {
    if (!s || !s.results.length) return [];
    const m = new Map();
    for (const r of s.results) if (r.brand) m.set(r.brand, (m.get(r.brand) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [s]);
  const catCounts = useMemo(() => {
    if (!s || !s.results.length) return [];
    const m = new Map();
    for (const r of s.results) m.set(r.category, (m.get(r.category) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [s]);
  const f = s ? s.filters : DEFAULT_FILTERS;
  const activeFilterCount = (f.brands.length ? 1 : 0) + (f.band ? 1 : 0) + (f.rating4 ? 1 : 0) + (f.noAccessories ? 1 : 0) + (f.category ? 1 : 0) + (f.sort !== "relevance" ? 1 : 0);

  const cardProps = (from, r) => ({
    onAdd: (x) => addToCart(x, from),
    onBuy: (x) => buyNow(x, from === "rail" ? "rail" : "card"),
    onOpen: (x) => openPdp(x, from, 0),
    onAsk: chatOff ? null : (x) => { setChatAskSku(x.sku); openChat("card", null); },
    onWish: (x) => toggleWish(x),
    wished: r ? wish.includes(r.sku) : false,
    cartQty: r && cart[r.sku] ? cart[r.sku].qty : 0,
    onDec: (x) => decCart(x),
    onInc: (x) => incCart(x),
    onQuick: (x) => { setQuick(x); track("quick_view_open", { sku: x.sku, from }); },
  });
  // S6: relaxed (slightly-over-budget) results are labelled, never silent.
  const overBudget = (r) => !!(s && s.parsed && s.parsed.budgetMax &&
    r.price > s.parsed.budgetMax && r.price <= s.parsed.budgetMax * 1.6);
  function closePdp() {
    setPdp(null);
    try { window.history.replaceState(null, "", "/"); } catch {}
    requestAnimationFrame(() => window.scrollTo(0, scrollRef.current || 0));
  }

  if (boot) return <div className="splash"><span className="splash-mark">A</span></div>;
  if (onboardNeeded) return (
    <Onboarding onDone={onOnboarded} lang={lang} setLang={setLang}
                onTryAssistant={() => { setTab("search"); openChat("onboarding", heroAskChips[0] ? heroAskChips[0].seed : null); }}
                forced={typeof window !== "undefined" && new URLSearchParams(window.location.search).get("onboard") === "1"} />
  );
  return (
    <div className={"appshell" + (chatOpen ? " chat-open" : "") + (pdp ? " pdp-open" : "")}>
      <div className="appshell-main">
      <Announcement festival={preview && preview.rails ? preview.rails.festival : null}
                    days={preview && preview.rails ? preview.rails.days : null} lang={lang} />
      <Header
        lang={lang} setLang={setLang}
        canBack={navStack.length > 0} onBack={goBack}
        onLogo={() => { setNavStack([]); if (s) resetToHero(); else if (tab !== "search") setTab("search"); window.scrollTo({ top: 0 }); }}
        tab={tab} onTab={(t) => switchTab(t)} onInsights={() => switchTab("analytics")}
        input={input} setInput={setInput}
        onSearch={() => startSearch(input, "header")}
        onSearchCleared={() => { if (s) resetToHero(); }}
        cartCount={cartCount} wishCount={wishCount}
        onCart={() => { if (!cartOpen) pushNav(); setCartOpen(true); track("cart_view", { item_count: cartCount, total: Object.values(cart).reduce((a, e) => a + e.item.price * e.qty, 0) }); }}
        aiStatus={aiStatus} facets={facets} onQuery={(q, src) => startSearch(q, src)}
        scrolled={scrolled} tnavCollapsed={tnavCollapsed && tab !== "analytics"}
        onMenu={() => setNavOpen(true)}
        onAsk={chatOff ? null : (x, how) => openChat("header", how ? x : null)}
      />
      {pdp ? (
        <PdpView lang={lang} item={pdp}
                 onBack={closePdp}
                 onAdd={(r) => addToCart(r, "pdp")}
                 onBuy={(r) => buyNow({ ...r, _from: "pdp" }, "pdp")}
                 chatOff={chatOff}
                 onGoCart={() => { setCartOpen(true); track("cart_view", { item_count: cartCount, source: "pdp" }); }}
                 similar={similarFor(pdp, s ? s.results : (preview ? preview.items : []))}
                 moreFromBrand={moreFromBrandFor(pdp, s ? s.results : (preview ? preview.items : []))}
                 recent={recent}
                 parsed={s ? s.parsed : null}
                 region={region}
                 onPincode={savePincode}
                 onSearchBrand={(b) => startSearch(b, "pdp_crumb")}
                 onSearchCat={(c) => startSearch(c, "pdp_crumb")}
                 onHome={() => { setNavStack([]); setTab("search"); window.scrollTo({ top: 0 }); }}
                 onAsk={askFromPdp}
                 cardProps={cardProps}
                 onWish={(r) => toggleWish(r)}
                 wished={wish.includes(pdp.sku)}
                 cart={cart}
                 onInc={(r) => incCart(r)} onDec={(r) => decCart(r)} />
      ) : checkoutOpen && (cartCount > 0 || buyNowItem) ? (
        <CheckoutView lang={lang} cart={cart} buyNow={buyNowItem} pin={pin} region={region}
                      profileName={profile ? (profile.name || "") : ""}
                      onBack={closeCheckout} onEditCart={() => setCartOpen(true)} onPlaced={placeOrder} />
      ) : tab === "confirmation" && order ? (
        <ConfirmationView lang={lang} order={order} chatOff={chatOff}
                          onTrack={() => switchTab("orders")}
                          onAsk={chatOff ? null : () => openChat("confirmation", "Ask about delivery or returns (demo)")}
                          onContinue={() => { setTab("search"); setS(null); try { window.history.replaceState(null, "", "/"); } catch {} }} />
      ) : tab === "wishlist" && wishHydrated ? (
        <WishlistView lang={lang} skus={wish}
                      onRemove={(it) => toggleWish(it)}
                      onAdd={(it) => addToCart(it, "wishlist")}
                      onBuy={(it) => buyNow(it, "wishlist")}
                      onSearch={(q) => startSearch(q, "wishlist")} />
      ) : tab === "orders" && ordersHydrated ? (
        <OrdersView lang={lang} orders={orders}
                    onBuyAgain={(it) => addToCart({ ...it, rating: it.rating || 0, num_ratings: it.num_ratings || 0, tags: [] }, "reorder")}
                    onView={(sku) => openPdpFetch(sku)}
                    onHome={() => { setTab("search"); setS(null); try { window.history.replaceState(null, "", "/"); } catch {} }} />
      ) : tab === "analytics" ? (
        <AnalyticsView anview={anview} setAnview={switchAnview} />
      ) : (
      <div className="wrap">

        {tab === "search" ? (
          (
            <>
              {!s && (
                <div className="hero2">
                  <div className="hero2-left">
                    <div className="hero2-eyebrow"><I name="sparkle" size={13} /> {t(lang, "heroEyebrow")}</div>
                    <h1 className="hero2-h1">{heroH1}</h1>
                    <div className="hero2-sub">{t(lang, "heroSub")}</div>
                    {!chatOff && (
                      <div className="hero2-mode" role="group" aria-label={t(lang, "heroModeLbl")}>
                        <button className={searchMode === "search" ? "seg on" : "seg"} onClick={() => setSearchMode("search")}>{t(lang, "heroSearchLbl")}</button>
                        <button className={searchMode === "ask" ? "seg on" : "seg"} onClick={() => setSearchMode("ask")}>{t(lang, "heroAskLbl")}</button>
                      </div>
                    )}
                    <div className="hero2-card">
                      <I name={searchMode === "ask" ? "sparkle" : "search"} size={18} className="hero2-ic" />
                      <input value={input}
                             onChange={(e) => setInput(e.target.value)}
                             onKeyDown={(e) => {
                               if (e.key !== "Enter") return;
                               if (e.shiftKey && input.trim() && !chatOff) {
                                 e.preventDefault();
                                 track("search_to_ask_switch", { how: "shift-enter" });
                                 openChat("hero_ask", input.trim());
                               } else if (e.key === "Enter" && searchMode === "ask" && !chatOff && input.trim()) {
                                 track("search_to_ask_switch", { how: "toggle" });
                                 openChat("hero_ask", input.trim());
                               } else {
                                 startSearch(input, "input");
                               }
                             }}
                             onFocus={() => setSearchFocus(true)} onBlur={() => setSearchFocus(false)}
                             placeholder={searchMode === "ask" ? '"' + t(lang, "askPlaceholder") + '"' : ('"' + heroPh + '"')}
                             aria-label={searchMode === "ask" ? t(lang, "shAskAria") : "Search"} />
                      <button className="hero2-mic" aria-label="Voice search (coming soon)" title="Voice search — coming soon"><I name="mic" size={16} /></button>
                      <Button size="lg" className="hero2-go" onClick={() => startSearch(input, "input")} disabled={busy}>{busy ? "…" : t(lang, "heroSearchLbl")}</Button>
                      {!chatOff && (
                        <Button size="lg" variant="secondary" className="hero2-askgo"
                                onClick={() => openChat("hero_ask", input.trim() || null)}>
                          <I name="sparkle" size={15} /> {t(lang, "heroAskBtn")}
                        </Button>
                      )}
                    </div>
                    {looksConversational(input) && !chatOff && searchMode === "search" && (
                      <div className="hero2-askhint" role="status">
                        <I name="sparkle" size={12} /> {t(lang, "askAskRow", { q: input.trim().slice(0, 40) })}
                        <span className="hero2-hintkeys">↵ {t(lang, "heroSearchLbl")} · ⇧↵ {t(lang, "heroAskLbl")}</span>
                      </div>
                    )}
                    {!chatOff && (
                      <div className="hero2-askstrip" role="region" aria-label={t(lang, "askStripLbl")}>
                        <span className="hero2-askline"><I name="sparkle" size={13} /> {t(lang, "askValueLine")}</span>
                      </div>
                    )}
                    <div className="hero2-try">
                      <span className="exl">{t(lang, "popular")}:</span>
                      {(expando ? EXAMPLES : exRot).map((e) => (
                        <span key={e} className="exchip" role="button" tabIndex={0}
                              onClick={() => startSearch(e, "example")}
                              onKeyDown={(ev) => ev.key === "Enter" && startSearch(e, "example")}>{e}</span>
                      ))}
                      <button className="hero2-more" onClick={() => setExpando(!expando)} aria-expanded={expando}>
                        {expando ? t(lang, "showFewer") : t(lang, "moreIdeas")} <I name="chevron-down" size={13} className={expando ? "up" : ""} />
                      </button>
                    </div>
                    <div className="hero2-trust">
                      <span><I name="sparkle" size={15} /> {t(lang, "trust1")}</span>
                      <span><I name="globe" size={15} /> {t(lang, "trust2")}</span>
                      <span><I name="shield-check" size={15} /> {t(lang, "trust3")}</span>
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
                  </div>
                  <div className="hero2-right"><HeroDemo /></div>
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
                <div className="briefbar" role="region" aria-label={t(lang, "yourBrief")}>
                  <span className="brief-search"><I name="search" size={13} /> {s.query}</span>
                  {s.trail.slice(1).map((t, i) => (
                    typeof t === "object" && t.opts ? (
                      <button key={i} className="brief-chip" onClick={() => removeTrailStep(i + 1)} title="Remove this constraint">
                        {t.label} <span className="xx"><I name="x" size={12} /></span>
                      </button>
                    ) : (
                      <span key={i} className="brief-step"><span className="brief-arrow">→</span> {typeof t === "object" ? t.label : t}</span>
                    )
                  ))}
                  <button className="brief-reset" onClick={resetToHero}>{t(lang, "startOver")}</button>
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
                              onSkip={skipGuide} progress={s.turn}
                              prevCount={s.counts && s.counts.length >= 2 ? s.counts[s.counts.length - 2] : null}
                              countAfter={s.counts ? s.counts[s.counts.length - 1] : null} />
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
                  {/* Phase 4 (brief §7.5): sticky sidebar on desktop,
                      Sort/Filter bottom bar + sheets on mobile. */}
                  <div className="res-layout">
                    <FilterSidebar lang={lang} f={f} setFilter={setFilter} priceBands={priceBands}
                                   brandList={brandCounts} catList={catCounts} single={layout.single}
                                   onPriceMin={(v) => setFilter("price_min", v)} onPriceMax={(v) => setFilter("price_max", v)}
                                   activeCount={activeFilterCount} clearAll={() => setFilter("clear", "clear")}
                                   nAfter={layout.filtered.length} />
                    <div className="res-main">
                      <div className="res-toolbar">
                        <span className="filter-meta">{layout.filtered.length} of {s.results.length} {t(lang, "productsWord")}{s.ms ? ` · ${s.ms} ms` : ""}</span>
                        <button className="res-density" aria-label="Toggle grid density" title="Toggle grid density"
                                onClick={() => { const d = density === "cozy" ? "compact" : "cozy"; setDensity(d); track("view_density_change", { density: d }); }}>
                          <I name="grid" size={15} /> {density === "cozy" ? t(lang, "densityCozy") : t(lang, "densityCompact")}
                        </button>
                      </div>
                      {layout.filtered.length === 0 ? (
                        <div className="emptypanel">
                          <svg className="emptypanel-art" viewBox="0 0 96 72" aria-hidden="true">
                            <path d="M14 18h68l-7 44a8 8 0 0 1-8 7H29a8 8 0 0 1-8-7Z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
                            <path d="M32 18c0-12 8-18 16-18s16 6 16 18" fill="none" stroke="currentColor" strokeWidth="2.5" />
                            <path d="M36 34l24 18M60 34L36 52" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                          </svg>
                          <h3>{t(lang, "nothingLeft")}</h3>
                          <div className="emptypanel-sub">{t(lang, "nothingLeftSub")}</div>
                          <Button onClick={() => setFilter("clear", "clear")}>{t(lang, "clearAll")}</Button>
                        </div>
                      ) : (
                        <>
                          {!chatOff && (
                            <div className="askrow" role="region" aria-label={t(lang, "askRowLabel")}>
                              <span className="askrow-l"><I name="sparkle" size={14} /> {t(lang, "askRowLead")}</span>
                              {ASK_ROW_CHIPS.map((c) => (
                                <button key={c.id} className="askrow-chip"
                                        onClick={() => openChat("results", askRowSeed(c.id, persona, s))}>
                                  {t(lang, c.t, { p: persona && persona.context ? persona.context : "" })}
                                </button>
                              ))}
                            </div>
                          )}
                          {s.results.length === 1 && s.turn > 1 && (
                            <div className="pickcard" role="region" aria-label={t(lang, "yourPick")}>
                              <div className="pickcard-head">
                                <I name="check-circle" size={18} />
                                <span className="pickcard-title">{t(lang, "yourPick")}</span>
                                {s.counts && s.counts[0] > 1 && (
                                  <span className="pickcard-from">{t(lang, "seeOther").replace("{n}", s.counts[0])}</span>
                                )}
                              </div>
                              <div className="pickcard-body">
                                <Tile item={layout.filtered[0]} size={112} showInfo={false} />
                                <div className="pickcard-info">
                                  {layout.filtered[0].brand ? <span className="brandb">{layout.filtered[0].brand}</span> : null}
                                  <div className="pickcard-t">{layout.filtered[0].title}</div>
                                  <div className="prow">
                                    <span className="p">₹{layout.filtered[0].price.toLocaleString("en-IN")}</span>
                                    <span className={"rpill " + (layout.filtered[0].rating >= 4 ? "good" : layout.filtered[0].rating >= 3 ? "mid" : "low")}>★ {layout.filtered[0].rating}</span>
                                    <span className="rc">{(layout.filtered[0].num_ratings || 0).toLocaleString("en-IN")} {t(lang, "ratingsWord")}</span>
                                  </div>
                                  <div className="pickcard-actions">
                                    <Button onClick={() => addToCart(layout.filtered[0], "pick")}>{t(lang, "addToCart")}</Button>
                                    <Button variant="ink" onClick={() => buyNow(layout.filtered[0], "pick")}>{t(lang, "buyNow")}</Button>
                                    <Button variant="secondary" onClick={() => openPdp(layout.filtered[0], "pick", 0)}>{t(lang, "viewDetails")}</Button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                          {layout.single ? (
                            <>
                              <div className={"grid" + (density === "compact" ? " grid-compact" : "")}>
                                {layout.grid.slice(0, moreN).map((r) => (
                                  <ProductCard key={r.sku} r={r} best={layout.best.has(r.sku)}
                                               overBudget={overBudget(r)} {...cardProps("results", r)} />
                                ))}
                              </div>
                              {layout.grid.length > moreN && (
                                <div className="res-more">
                                  <button className="fchip" style={{ padding: "9px 22px" }}
                                          onClick={() => { setMoreN((n) => n + 24); track("show_more", { query: s.query, n: moreN + 24 }); }}>
                                    {t(lang, "showMore")} ({layout.grid.length - moreN} {t(lang, "left")})
                                  </button>
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              <div className="group">
                                <div className="gh">
                                  <h3>{t(lang, "bestMatches")}</h3>
                                  <span className="gc">{persona ? "ranked for your profile · price fit, brand preference, quality & trust" : "highest-scoring picks for this search"}</span>
                                </div>
                                <div className={"grid" + (density === "compact" ? " grid-compact" : "")}>
                                  {layout.rec.map((r) => <ProductCard key={r.sku} r={r} best overBudget={overBudget(r)} {...cardProps("recommended", r)} />)}
                                </div>
                              </div>
                              {layout.groups.map((g) => (
                                <div className="group" key={g.cat}>
                                  <div className="gh">
                                    <h3>{displayCat(g.cat)}</h3>
                                    <span className="gc">{g.items.length} {t(lang, "picksWord")} {t(lang, "fromMatch")}</span>
                                  </div>
                                  <div className={"grid" + (density === "compact" ? " grid-compact" : "")}>
                                    {g.items.map((r) => <ProductCard key={r.sku} r={r} overBudget={overBudget(r)} {...cardProps("results", r)} />)}
                                  </div>
                                </div>
                              ))}
                              {layout.more.length > 0 && (
                                <div className="group">
                                  <div className="gh">
                                    <h3>{t(lang, "moreProducts")}</h3>
                                    <span className="gc">{layout.more.length} {t(lang, "moreWord")} {t(lang, "inResultSet")}</span>
                                  </div>
                                  <div className={"grid" + (density === "compact" ? " grid-compact" : "")}>
                                    {layout.more.slice(0, moreN).map((r) => <ProductCard key={r.sku} r={r} overBudget={overBudget(r)} {...cardProps("results", r)} />)}
                                  </div>
                                  {layout.more.length > moreN && (
                                    <div className="res-more">
                                      <button className="fchip" style={{ padding: "9px 22px" }}
                                              onClick={() => { setMoreN((n) => n + 24); track("show_more", { query: s.query, n: moreN + 24 }); }}>
                                        {t(lang, "showMore")} ({layout.more.length - moreN} {t(lang, "left")})
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <FilterBar lang={lang} f={f} setFilter={setFilter} priceBands={priceBands}
                             brandList={brandCounts} catList={catCounts} single={layout.single}
                             onPriceMin={(v) => setFilter("price_min", v)} onPriceMax={(v) => setFilter("price_max", v)}
                             activeCount={activeFilterCount} nAfter={layout.filtered.length}
                             sortLabel={SORTS.find((x) => x.id === f.sort) ? SORTS.find((x) => x.id === f.sort).label : "Relevance"} />
                      {s.ok === false && s.turn < 4 && (
                        <div className="meta">One follow-up question can usually tighten this — pick an option above.</div>
                      )}
                </>
              )}

              {showTop && s && (
                <button className="bttop" aria-label={t(lang, "backToTop")} title={t(lang, "backToTop")}
                        onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); track("back_to_top", {}); }}>
                  <I name="arrow-up" size={20} />
                </button>
              )}

              {!s && (
                <HomeSections lang={lang} preview={preview} facets={facets} recent={recent}
                              onQuery={(q, src) => startSearch(q, src)}
                              onAdd={(x) => addToCart(x, "preview")}
                              onOpenSku={(sku, pool) => openPdpSku(sku, pool, "preview")}
                              profileName={profile && profile.name ? profile.name : ""}
                              interestCtx={interestCtx}
                              picked={picked} />
              )}
            </>
          )
        ) : null}
      </div>
      )}
      <TabBar tab={tab}
              onHome={() => { setNavStack([]); setTab("search"); window.scrollTo({ top: 0 }); }}
              onCategories={() => setNavOpen(true)}
              onAsk={chatOff ? null : () => openChat("tabbar", null)}
              chatOff={chatOff}
              onTab={(t) => switchTab(t)}
              cartCount={cartCount} wishCount={wishCount} lang={lang} />
      <Footer catalogSize={preview ? preview.catalogSize : 54304}
              onQuery={(q, src) => startSearch(q, src)}
              onInsights={() => switchTab("analytics")} lang={lang} />
      <NavDrawer open={navOpen} onClose={() => setNavOpen(false)}
                 lang={lang} setLang={setLang} facets={facets}
                 onQuery={(q, src) => startSearch(q, src)}
                 onTab={(t) => switchTab(t)}
                 onInsights={() => switchTab("analytics")}
                 onMenuSearch={() => { /* mobile search overlay lives in Header */ }} />
      {tab === "search" && !chatOff && (
        <>
          {prompt && !peek && (
            <div className="peek" role="status">
              <I name="sparkle" size={13} aria-hidden="true" />
              <span className="peek-t">{prompt.text}</span>
              <button className="peek-btn" onClick={promptClick}>{t(lang, "askMe")}</button>
              <button className="peek-x" aria-label={t(lang, "dismiss")} onClick={promptDismiss}><I name="x" size={12} /></button>
            </div>
          )}
          {peek && !chatOpen && (
            <button className="peek peek-reply" role="status" onClick={() => openChat("peek", null)}>
              <I name="sparkle" size={13} aria-hidden="true" />
              <span className="peek-t">{peek.text}</span>
            </button>
          )}
        </>
      )}
      {tab === "search" && !chatOff && (
        <ChatLauncher
          nudge={chatNudge && !prompt}
          lang={lang}
          unread={chatUnread}
          chatOpen={chatOpen}
          onOpen={() => {
            if (chatNudge) {
              track("chat_nudge_accepted", { trigger: "null_search" });
              try { sessionStorage.setItem("askcart_chat_nudged", "1"); } catch {}
              setChatNudge(false);
            }
            openChat("fab");
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
        chat={chat}
        onActionUndo={actionUndo}
        onOpenCart={() => { setCartOpen(true); track("cart_view", { item_count: cartCount, source: "chat" }); }}
        persona={persona}
        profileName={profile && profile.name ? profile.name : ""}
        context={chatContext}
        onApplySearch={(q, opts, meta) => chatApplySearch(q, opts, meta)}
        onAddToCart={(sku) => chatAddToCart(sku)}
        onOpenPdp={(sku) => { setChatOpen(false); chatOpenPdp(sku); }}
        onOpenCart={() => { setCartOpen(true); track("cart_view", { item_count: cartCount, source: "chat" }); }}
        onPromptConsumed={() => setChatPrompt(null)}
        itemPool={[...(s ? s.results : []), ...(pdp ? [pdp] : []), ...(preview ? preview.items : [])]}
        aiLive={!!(aiStatus && aiStatus.gemini && !aiStatus.gemini.allExhausted)}
        onWish={(it) => toggleWish(it)}
        wished={wish}
        lang={lang}
      />
      {quick && (
        <QuickView lang={lang} item={quick}
                   onClose={() => setQuick(null)}
                   onFull={() => { const q = quick; setQuick(null); openPdp(q, "quickview", 0); }}
                   onAdd={(r) => addToCart(r, "quickview")}
                   onBuy={(r) => buyNow(r, "card")}
                   onWish={(r) => toggleWish(r)}
                   wished={wish.includes(quick.sku)}
                   cart={cart}
                   onInc={(r) => incCart(r)} onDec={(r) => decCart(r)} />
      )}
      <CartDrawer lang={lang} open={cartOpen} onClose={() => setCartOpen(false)} cart={cart} setCart={setCart}
                  chatOff={chatOff}
                  onAskHelp={chatOff ? null : () => { setCartOpen(false); openChat("cart", "Anything I should add or swap?"); }}
                  onCheckout={() => openCheckout("cart")}
                  onWishSave={saveForLater} onWishUndo={restoreFromLater}
                  onAdd={(it, from) => addToCart(it, from)}
                  onSearch={(q) => startSearch(q, "cart_empty")}
                  onHome={() => { setTab("search"); setS(null); try { window.history.replaceState(null, "", "/"); } catch {} }}
                  similarPool={s ? s.results : (preview ? preview.items : [])} />
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <ToasterProvider>
        <AskCartHome />
      </ToasterProvider>
    </Suspense>
  );
}
