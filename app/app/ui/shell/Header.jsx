"use client";
// Two-tier sticky header (replaces the 8-control prototype bar).
// Tier 1: back (conditional) · logo · search · [lang, wishlist, orders, cart, account]
// Tier 2 (desktop): category nav. Mobile (≤767): menu · logo · search · bag + tab bar.
import { useEffect, useMemo, useRef, useState } from "react";
import { I } from "../kit/Icon";
import { IconButton } from "../kit/Button";
import { displayCat } from "../../lib/categories";
import { track } from "../../lib/track";
import { SAMPLE_QUERIES } from "../../lib/sample_queries";
import { MegaMenu } from "./MegaMenu";

function useOutside(close) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); };
    document.addEventListener("mousedown", onDoc);
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [close]);
  return ref;
}

export function Header({
  lang, setLang, canBack, onBack, onLogo, tab, onTab, onInsights,
  input, setInput, onSearch, onSearchCleared,
  cartCount, wishCount, onCart, aiStatus, facets, onQuery, scrolled, tnavCollapsed, onMenu,
}) {
  const [mega, setMega] = useState(false);
  const [acct, setAcct] = useState(false);
  // Phase 4 (brief §7.1): client-side autosuggest. Never calls the LLM —
  // recent searches (localStorage), sample queries, categories, brands,
  // and a "…under ₹N" completion when the input ends in a number.
  const [sugOpen, setSugOpen] = useState(false);
  const [sugIdx, setSugIdx] = useState(-1);
  const [recQ, setRecQ] = useState([]);
  useEffect(() => {
    try { const r = JSON.parse(localStorage.getItem("askcart_recent_q_v1") || "[]"); if (Array.isArray(r)) setRecQ(r.slice(0, 5)); } catch {}
  }, []);
  const removeRec = (txt) => {
    setRecQ((r) => {
      const next = r.filter((x) => x !== txt);
      try { localStorage.setItem("askcart_recent_q_v1", JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const sugList = useMemo(() => {
    const q = input.trim().toLowerCase();
    const out = [];
    if (q === "") {
      recQ.forEach((r) => out.push({ sec: "Recent", text: r, kind: "recent" }));
      return out;
    }
    SAMPLE_QUERIES.filter((s) => s.toLowerCase().includes(q)).slice(0, 3)
      .forEach((s) => out.push({ sec: "Try", text: s, kind: "try" }));
    (facets && facets.categories ? facets.categories : []).slice(0, 30)
      .filter((c) => displayCat(c.name).toLowerCase().includes(q))
      .slice(0, 3).forEach((c) => out.push({ sec: "Categories", text: displayCat(c.name), kind: "cat" }));
    ((facets && facets.brands && facets.brands.top) ? facets.brands.top : []).slice(0, 30)
      .filter((b) => b.name.toLowerCase().includes(q))
      .slice(0, 3).forEach((b) => out.push({ sec: "Brands", text: b.name, kind: "brand" }));
    const m = q.match(/^(.{2,}?)\s+(\d{1,3})\s*(k)?$/);
    if (m) {
      const n = Number(m[2]) * (m[3] ? 1000 : 1);
      const txt = m[1] + " under " + "\u20b9" + n.toLocaleString("en-IN");
      if (!out.some((o) => o.text.toLowerCase() === txt.toLowerCase())) out.push({ sec: "Budget", text: txt, kind: "budget" });
    }
    return out;
  }, [input, facets, recQ]);
  const pickSug = (s) => {
    track("search_suggest_select", { text: s.text, section: s.sec });
    setSugOpen(false); setSugIdx(-1);
    onQuery(s.text, "suggest");
  };
  const [langPop, setLangPop] = useState(false);
  const [mSearch, setMSearch] = useState(false);
  const g = aiStatus && aiStatus.gemini;
  const used = g && g.keys.length ? g.keys.reduce((a, k) => a + (k.used || 0), 0) : null;
  const cap = g && g.keys.length ? g.keys.length * g.rpd : null;

  const megaRef = useOutside(() => setMega(false));
  // home "See all" -> open mega panel (Phase 3)
  useEffect(() => {
    const h = () => setMega(true);
    window.addEventListener("askcart:open-mega", h);
    return () => window.removeEventListener("askcart:open-mega", h);
  }, []);
  const acctRef = useOutside(() => setAcct(false));
  const langRef = useOutside(() => setLangPop(false));
  const catLinks = (facets?.categories || []).slice(0, 6).map((c) => displayCat(c.name));

  return (
    <header className={"topbar2" + (scrolled ? " scrolled" : "")}>
      <div className="tbar">
        <div className="tbar-in">
          {canBack && (
            <button className="backbtn2" onClick={onBack} aria-label="Back" title="Back"><I name="arrow-left" size={20} /></button>
          )}
          <button className="logo2" onClick={onLogo} aria-label="AskCart home">
            <span className="logo2-mark">A<I name="sparkle" size={9} className="logo2-spark" /></span>
            <span className="logo2-word">Ask<span>Cart</span></span>
          </button>
          {/* Desktop + tablet search */}
          <div className="tsearch">
            <I name="search" size={18} className="tsearch-ic" />
            <input value={input} aria-label="Search"
                   onChange={(e) => { setInput(e.target.value); if (e.target.value === "") onSearchCleared(); setSugOpen(true); setSugIdx(-1); }}
                   onFocus={() => setSugOpen(true)}
                   onBlur={() => setTimeout(() => setSugOpen(false), 150)}
                   onKeyDown={(e) => {
                     if (e.key === "ArrowDown") { e.preventDefault(); setSugIdx((i) => Math.min(i + 1, sugList.length - 1)); }
                     else if (e.key === "ArrowUp") { e.preventDefault(); setSugIdx((i) => Math.max(i - 1, -1)); }
                     else if (e.key === "Escape") { setSugOpen(false); setSugIdx(-1); }
                     else if (e.key === "Enter") { if (sugIdx >= 0 && sugList[sugIdx]) pickSug(sugList[sugIdx]); else onSearch(); }
                   }}
                   placeholder={tab === "search" ? 'Try: "wristwatch for dad under 5k"' : "Search 54,304 products…"} />
            <button className="tsearch-mic" aria-label="Voice search (coming soon)" title="Voice search — coming soon"><I name="mic" size={17} /></button>
            {sugOpen && sugList.length > 0 && (
              <div className="suggest" role="listbox" aria-label="Search suggestions">
                {sugList.map((s, i) => (
                  <div key={s.sec + s.text} className="suggest-sec">
                    {i === 0 || sugList[i - 1].sec !== s.sec ? <div className="suggest-seclbl">{s.sec}</div> : null}
                    <button className={"suggest-row" + (i === sugIdx ? " hot" : "")} role="option" aria-selected={i === sugIdx}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickSug(s)}>
                      <I name={s.kind === "recent" ? "clock" : "search"} size={14} className="suggest-ic" />
                      <span>{s.text}</span>
                      {s.kind === "recent" && (
                        <span className="sx" role="button" tabIndex={0} title="Remove from recent"
                              onClick={(e) => { e.stopPropagation(); removeRec(s.text); }}>
                          <I name="x" size={13} />
                        </span>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Mobile-only search opener */}
          <button className="iconbtn m-search" aria-label="Search" onClick={() => setMSearch(true)}><I name="search" size={22} /></button>
          <button className="iconbtn m-menu" aria-label="Menu" onClick={onMenu}><I name="menu" size={22} /></button>
          <div className="tbar-right">
            <div className="tlang" ref={langRef}>
              <button className="iconbtn" aria-label="Language" aria-expanded={langPop} onClick={() => setLangPop(!langPop)}>
                <I name="globe" size={20} />
              </button>
              {langPop && (
                <div className="pop langpop" role="radiogroup" aria-label="Language">
                  {[["en", "English"], ["hi", "हिंदी"], ["hinglish", "Hinglish"]].map(([l, lb]) => (
                    <button key={l} role="radio" aria-checked={lang === l} className={lang === l ? "on" : ""}
                            onClick={() => { setLang(l); setLangPop(false); }}>
                      {lb}{lang === l && <I name="check" size={15} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="tbar-labels"><span>Wishlist</span><span>Orders</span><span>Cart</span><span>Account</span></span>
            <IconButton name="heart" label="Wishlist" badge={wishCount} onClick={() => onTab("wishlist")} />
            <IconButton name="package" label="Orders" onClick={() => onTab("orders")} />
            <IconButton name="bag" label="Cart" badge={cartCount} onClick={onCart} className="cart-bounce-host" />
            <div className="tacct" ref={acctRef}>
              <button className="iconbtn" aria-label="Account" aria-expanded={acct} onClick={() => setAcct(!acct)}>
                <I name="user" size={20} />
              </button>
              {acct && (
                <div className="pop acctpop">
                  <div className="acct-hello">Hello, guest</div>
                  <button onClick={() => { onTab("orders"); setAcct(false); }}><I name="package" size={16} /> Orders</button>
                  <button onClick={() => { onTab("wishlist"); setAcct(false); }}><I name="heart" size={16} /> Wishlist</button>
                  <button onClick={() => { setLang(lang === "en" ? "hi" : "en"); setAcct(false); }}><I name="globe" size={16} /> Language</button>
                  <button onClick={() => { setAcct(false); window.location.href = "/?onboard=1"; }}><I name="user" size={16} /> Restart onboarding</button>
                  <div className="acct-sep" />
                  <div className="acct-tools">Prototype tools</div>
                  <button onClick={() => { onInsights(); setAcct(false); }}><I name="bar-chart" size={16} /> Analytics / Insights</button>
                  <div className="acct-ai">
                    <div className="acct-ai-t"><I name="sparkle" size={13} /> AI status</div>
                    <div>{g ? `TOTAL ${used}/${cap} calls today (all users)` : "No Gemini keys configured"}</div>
                    {g?.keys?.map((k) => <div key={k.idx} className="ai-k">key{k.idx + 1} {k.used}/{k.rpd}{k.exhausted ? ` (${k.reason})` : ""}</div>)}
                    <div>session budget: {Math.max(0, aiStatus?.aiMaxPerSession || 0)} left</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Tier 2: category nav (desktop, hidden on analytics tab) */}
        {tab !== "analytics" && (
          <div className={"tnav" + (tnavCollapsed ? " collapsed" : "")}>
            <div className="tnav-in">
              <div className="tnav-mega" ref={megaRef}>
                <button className={mega ? "on" : ""} aria-expanded={mega} onClick={() => setMega(!mega)}>
                  Shop by category <I name="chevron-down" size={14} />
                </button>
                {mega && <MegaMenu facets={facets} onQuery={onQuery} onClose={() => setMega(false)} />}
              </div>
              {catLinks.map((c) => (
                <button key={c} onClick={() => onQuery(c, "nav")}>{c}</button>
              ))}
              <button onClick={() => onQuery("gift under 2k", "nav")}>Gifts</button>
              <button onClick={() => onQuery("diwali decorations", "nav")}>Occasions</button>
              <button onClick={() => onQuery("under 1000", "nav")}>Under ₹1,000</button>
            </div>
          </div>
        )}
      </div>
      {/* Mobile search overlay */}
      {mSearch && (
        <div className="msearch-ov" role="dialog" aria-label="Search">
          <I name="search" size={18} className="tsearch-ic" />
          <input autoFocus value={input} aria-label="Search" placeholder='Try: "saree for ammi under 2k"'
                 onChange={(e) => { setInput(e.target.value); if (e.target.value === "") onSearchCleared(); }}
                 onKeyDown={(e) => { if (e.key === "Enter") { setMSearch(false); onSearch(); } if (e.key === "Escape") setMSearch(false); }} />
          <button onClick={() => { setMSearch(false); onSearch(); }}>Search</button>
          <button className="ms-cancel" onClick={() => setMSearch(false)}>Cancel</button>
        </div>
      )}
    </header>
  );
}
