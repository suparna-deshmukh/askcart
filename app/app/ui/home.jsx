"use client";
// Home (brief §6): hero guided-demo composition + shop sections.
// Behaviour: every tile/chip runs the normal guided search entry point
// (no new API). All strings via i18n (en/hi/hinglish).
import { useEffect, useState } from "react";
import { t } from "../lib/i18n";
import { displayCat } from "../lib/categories";
import { track } from "../lib/track";
import { I } from "./kit/Icon";
import { Glyph, glyphFor } from "./kit/Glyphs";
import { Tile, catTheme } from "./kit/Tile";
import { Badge } from "./kit/Badge";
import { ProductCard } from "./cards";

// Typewriter placeholder (brief §6.1). SSR-safe: server + first paint show
// the first full query; the type/erase loop starts after mount. Paused
// while the input is focused or a search is active. Static under
// prefers-reduced-motion.
export function useTypewriter(texts, paused) {
  const [txt, setTxt] = useState(texts[0]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTxt(texts[0]);
      return;
    }
    let alive = true, ti = 0, ci = 0, dir = 1, timer = null;
    const tick = () => {
      if (!alive) return;
      if (paused) { timer = setTimeout(tick, 400); return; }
      const full = texts[ti % texts.length];
      if (dir === 1) {
        if (ci < full.length) { ci++; setTxt(full.slice(0, ci)); timer = setTimeout(tick, 42); }
        else timer = setTimeout(() => { dir = -1; tick(); }, 2200);
      } else {
        if (ci > 0) { ci--; setTxt(full.slice(0, ci)); timer = setTimeout(tick, 18); }
        else { ti++; ci = 0; dir = 1; timer = setTimeout(tick, 450); }
      }
    };
    timer = setTimeout(tick, 700);
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [paused, texts]);
  return txt;
}

// Decorative "guided demo" composition (brief §6.1 right column).
// Pure CSS/SVG loop (10s), static final frame under reduced-motion.
const DEMO_TILES = [
  { category: "toys", title: "Building blocks", brand: "Playa", price: 999 },
  { category: "beauty", title: "Glow face kit", brand: "Melo", price: 749 },
  { category: "watch", title: "Kids watch", brand: "Tini", price: 1299 },
];
export function HeroDemo() {
  return (
    <div className="demo" aria-hidden="true">
      <div className="demo-bubble">gift for 5 year old under 1500</div>
      <div className="demo-qcard">
        <div className="demo-qhead"><span className="demo-spark"><I name="sparkle" size={13} /></span> Quick question</div>
        <div className="demo-qtext">What does she enjoy?</div>
        <div className="demo-chips">
          <span className="demo-chip">Building toys <b>(18)</b></span>
          <span className="demo-chip demo-chip-2">Art and craft <b>(12)</b></span>
          <span className="demo-chip demo-chip-3">Books <b>(9)</b></span>
        </div>
      </div>
      <div className="demo-results">
        <div className="demo-ticker"><span className="tick-a">312</span> <span className="tick-arrow">→</span> <span className="tick-b">48 products</span></div>
        <div className="demo-tiles">
          {DEMO_TILES.map((it) => (
            <div className="demo-tile" key={it.title}>
              <Tile item={it} size={64} showInfo={false} />
              <Badge variant="best">Best match</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const OCCASIONS = [
  { id: "gifts", name: "Gifts", cat: "toys", q: "gift under 2k", subKey: "occGiftsSub" },
  { id: "shaadi", name: "Shaadi", cat: "saree", q: "shaadi gift under 2k", subKey: "occShaadiSub" },
  { id: "diwali", name: "Diwali", cat: "watch", q: "diwali gift under 1k", subKey: "occDiwaliSub", festival: true },
  { id: "birthday", name: "Birthday", cat: "beauty", q: "birthday gift under 2k", subKey: "occBirthdaySub" },
  { id: "anniversary", name: "Anniversary", cat: "home", q: "anniversary gift under 2k", subKey: "occAnnivSub" },
];
const FESTIVAL_ALIAS = { diwali: "diwali", wedding: "shaadi", christmas: "gifts" };
const BUDGETS = [
  { label: "Under ₹500", q: "gift under 500" },
  { label: "Under ₹1,000", q: "gift under 1000" },
  { label: "Under ₹2,000", q: "gift under 2000" },
  { label: "Under ₹5,000", q: "gift under 5000" },
  { label: "₹10,000+", q: "premium gift" },
];
const HOW_STEPS = [
  { tKey: "step1", sKey: "step1Sub" },
  { tKey: "step2", sKey: "step2Sub" },
  { tKey: "step3", sKey: "step3Sub" },
];
const TRUST_BULLETS = ["trustB1", "trustB2", "trustB3", "trustB4"];

function CatTile({ c, onClick }) {
  const th = catTheme(c.name, c.name);
  return (
    <button className="homecat" onClick={onClick} aria-label={`${displayCat(c.name)} (${c.count.toLocaleString("en-IN")} products)`}>
      <span className="homecat-tile"
            style={{ background: `linear-gradient(160deg, var(--cat-${th.c}-1), var(--cat-${th.c}-2))`, color: `var(--cat-${th.c}-ink)` }}>
        <Glyph kind={glyphFor(c.name, c.name)} size={34} />
      </span>
      <span className="homecat-lbl">{displayCat(c.name)}</span>
      <span className="homecat-n">{c.count.toLocaleString("en-IN")}</span>
    </button>
  );
}

export function HomeSections({ lang, preview, facets, recent, onQuery, onAdd, onOpenSku }) {
  const cats = (facets && facets.categories ? facets.categories : []).slice(0, 8);
  const brands = (facets && facets.brands && facets.brands.top ? facets.brands.top : []).slice(0, 12);
  const rail = preview && preview.rails;
  const festId = rail ? FESTIVAL_ALIAS[String(rail.festival).toLowerCase()] : null;
  const occs = OCCASIONS
    .map((o) => ({ ...o, days: o.id === festId ? rail.days : null }))
    .sort((a, b) => (b.days != null ? 1 : 0) - (a.days != null ? 1 : 0));

  const goCat = (c) => { track("nav_category_click", { category: c.name, source: "home" }); onQuery(displayCat(c.name), "nav"); };
  const goOcc = (o) => { track("occasion_tile_click", { occasion: o.id, query: o.q }); onQuery(o.q, "occasion"); };
  const goBud = (b) => { track("budget_tile_click", { budget: b.label, query: b.q }); onQuery(b.q, "budget"); };
  const goBrand = (b) => { track("brand_tile_click", { brand: b.name, source: "home" }); onQuery(b.name, "brand"); };

  return (
    <>
      {cats.length > 0 && (
        <div>
          <div className="sec-head">
            <h2>{t(lang, "shopByCategory")}</h2>
            <button className="sec-seeall" onClick={() => { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("askcart:open-mega")); }}>{t(lang, "seeAll")}</button>
          </div>
          <div className="homecats">
            {cats.map((c) => <CatTile key={c.name} c={c} onClick={() => goCat(c)} />)}
          </div>
        </div>
      )}

      <div>
        <div className="sec-head"><h2>{t(lang, "shopByOccasion")}</h2></div>
        <div className="homeocc">
          {occs.map((o) => {
            const th = catTheme(o.cat, o.cat);
            return (
              <button key={o.id} className={"homeocc-card" + (o.days != null ? " live" : "")}
                      onClick={() => goOcc(o)}
                      aria-label={o.name + " — " + t(lang, o.subKey)}>
                <span className="homeocc-art"
                      style={{ background: `linear-gradient(160deg, var(--cat-${th.c}-1), var(--cat-${th.c}-2))`, color: `var(--cat-${th.c}-ink)` }}>
                  <Glyph kind={glyphFor(o.cat, o.cat)} size={54} />
                </span>
                {o.days != null && (
                  <span className="homeocc-days">{o.days === 0 ? t(lang, "daysToday") : t(lang, "daysAway").replace("{n}", o.days)}</span>
                )}
                <span className="homeocc-t">{o.name}</span>
                <span className="homeocc-sub">{t(lang, o.subKey)}</span>
                <span className="homeocc-arrow"><I name="arrow-right" size={15} /></span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="sec-head"><h2>{t(lang, "shopByBudget")}</h2></div>
        <div className="homebud">
          {BUDGETS.map((b) => (
            <button key={b.label} className="homebud-pill" onClick={() => goBud(b)}>{b.label}</button>
          ))}
        </div>
      </div>

      {preview && (
        preview.rails ? (
          // G8: festival window -> time-aware budget rails replace
          // the static trending grid (occasion-awareness before
          // the first search).
          <div>
            <div className="sec-head">
              <h2>{preview.rails.festival} gift ideas</h2>
              <span className="count">
                {preview.rails.festival} is {preview.rails.days === 0 ? t(lang, "daysToday") :
                  preview.rails.days < 0 ? `${Math.abs(preview.rails.days)} days ago` :
                  t(lang, "daysAway").replace("{n}", preview.rails.days)} · best-rated per budget · {preview.catalogSize.toLocaleString("en-IN")} products loaded
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
                    <ProductCard key={r.sku} r={r} onAdd={(x) => onAdd(x)}
                                 onOpen={(x) => onOpenSku(x.sku, preview.rails.bands.flatMap((z) => z.items))} />
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
                <ProductCard key={r.sku} r={r} onAdd={(x) => onAdd(x)}
                             onOpen={(x) => onOpenSku(x.sku, preview.items)} />
              ))}
            </div>
          </div>
        )
      )}

      <div className="howband">
        <div className="howband-in">
          <h2>{t(lang, "howItWorks")}</h2>
          <div className="howband-steps">
            {HOW_STEPS.map((st, i) => (
              <div className="howband-step" key={st.tKey}>
                <span className="howband-num">{i + 1}</span>
                <span className="howband-t">{t(lang, st.tKey)}</span>
                <span className="howband-s">{t(lang, st.sKey)}</span>
              </div>
            ))}
          </div>
          <div className="howband-trust">
            {TRUST_BULLETS.map((k) => (
              <span key={k}><I name="check-circle" size={15} /> {t(lang, k)}</span>
            ))}
          </div>
          <button className="howband-cta" onClick={() => {
            const el = document.querySelector(".tsearch input");
            if (el) el.focus(); else { const h = document.querySelector(".hero2-card input"); if (h) h.focus(); }
          }}>
            {t(lang, "tryGuided")} <I name="arrow-right" size={15} />
          </button>
        </div>
      </div>

      {brands.length > 0 && (
        <div>
          <div className="sec-head"><h2>{t(lang, "brandHeading")}</h2></div>
          <div className="brandwall">
            {brands.map((b) => (
              <button key={b.name} className="brandwall-chip" onClick={() => goBrand(b)}>
                <span className="brandwall-mono">{b.name[0].toUpperCase()}</span>
                <span className="brandwall-name">{b.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {recent && recent.length > 0 && (
        <div>
          <div className="sec-head"><h2>{t(lang, "recentlyViewed")}</h2></div>
          <div className="rail-row">
            {recent.map((r) => (
              <ProductCard key={r.sku} r={r} onAdd={(x) => onAdd(x)}
                           onOpen={(x) => onOpenSku(x.sku, recent)} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
