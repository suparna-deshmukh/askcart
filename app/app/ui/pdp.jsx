"use client";
// Phase 5 (brief §8): full-page product detail — replaces the 460px drawer.
// Behaviour contract kept verbatim: product_open / pdp_close (dwell_ms) /
// variant_select tracking, Esc = back, /?sku= deep links, pushNav snapshot,
// Bayesian adjustedRating, "why this matched" reasons, family-variant fetch.
// Presentation per brief: breadcrumb, 1.15/1 grid, fluid gallery with variant
// thumbs + arrows + keyboard, sticky buy box (brand link, rating row w/
// Bayesian tooltip, price, size/colour variants, delivery pincode check, CTA
// row, why-matched), anchored section tabs, highlights/specs/ratings/ask/
// similar rails, mobile sticky buy bar.
import { useEffect, useMemo, useRef, useState } from "react";
import { track } from "../lib/track";
import { t } from "../lib/i18n";
import { displayCat } from "../lib/categories";
import { Tile } from "./kit/Tile";
import { Button, IconButton } from "./kit/Button";
import { Rating } from "./kit/Rating";
import { Tooltip } from "./kit/Tooltip";
import { Overlay } from "./kit/Overlay";
import { Rail } from "./kit/Rail";
import { QtyStepper } from "./kit/QtyStepper";
import { I } from "./kit/Icon";
import { ProductCard, VARIANT_PAREN } from "./cards";

// Bayesian shrinkage (same math as the app-level pipeline): a 5.0 with 3
// ratings ranks below a 4.4 with 3,000. C = 30 pseudo-ratings at the
// catalogue mean.
export function adjustedRating(rating, numRatings, m = 4.2, C = 30) {
  return (C * m + (rating || 0) * (numRatings || 0)) / (C + (numRatings || 0));
}

const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

const COLOR_HEX = {
  black: "#1c1b18", white: "#f2efe9", ivory: "#f3ede1", cream: "#efe6d2",
  red: "#b3372f", maroon: "#722f37", wine: "#5e2233", rose: "#c4707f", pink: "#d98ba3",
  blue: "#3f5f8f", navy: "#232f4b", indigo: "#3f4b8f", teal: "#2f6f6a", sky: "#7fa8c9",
  green: "#3f6f4a", olive: "#6b6f3f", mint: "#8fc4a9", yellow: "#d9a621", gold: "#b08d3e",
  silver: "#b9bdc4", grey: "#8a8d92", gray: "#8a8d92", charcoal: "#3a3d42",
  brown: "#6f4a2f", beige: "#d8c6a5", orange: "#d0703a", purple: "#6f4a7f",
};
const NUM_SIZE = /^\d{1,3}(?:\.\d)?\s*(?:cm|mm|in|inch|oz|ml|l|kg|g)?$/i;
function parseColor(word) {
  const w = String(word || "").trim().toLowerCase().split(/\s+/)[0];
  return COLOR_HEX[w] || null;
}
// Deterministic variant parse: "Maroon, M" -> {color:"Maroon", size:"M"};
// "Red" -> colour only; "12mm" -> size only; "40W Speaker" -> colour+size none.
function parseVariant(label) {
  const raw = String(label || "").trim();
  if (!raw) return { raw: "", color: null, colorHex: null, size: null };
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  let color = null, size = null;
  if (parts.length >= 2) {
    size = parts[parts.length - 1];
    color = parts.slice(0, -1).join(", ");
  } else if (NUM_SIZE.test(raw)) {
    size = raw;
  } else {
    const m = raw.match(/^(.*?)[\s-]+((\d{1,3}(?:\.\d)?\s*(?:cm|mm|in|inch|oz|ml|l|kg|g)?)|(XS|S|M|L|XL|XXL|2XL|3XL))$/i);
    if (m && m[1]) { color = m[1].trim(); size = m[2].trim(); }
    else { color = raw; }
  }
  return { raw, color: color || null, colorHex: color ? parseColor(color) : null, size: size || null };
}

// S7: family siblings (listing-matrix variants) fetched once per SKU.
function useFamily(item) {
  const [family, setFamily] = useState((item && item.family) || null);
  useEffect(() => {
    if (!item) return;
    setFamily(item.family || null);
    if (!item.family && item.family_id) {
      fetch(`/api/catalog-preview?sku=${encodeURIComponent(item.sku)}`)
        .then((r) => r.json())
        .then((j) => { if (j.family) setFamily(j.family); })
        .catch(() => {});
    }
  }, [item && item.sku]); // eslint-disable-line react-hooks/exhaustive-deps
  return family;
}

const RAIL_CARD_W = { width: 235 };

export function PdpView({ lang, item, onBack, onAdd, onBuy, onGoCart, similar, moreFromBrand,
                            recent, parsed, region, onPincode, onSearchBrand, onSearchCat, onHome,
                            onAsk, cardProps, onWish, wished, cart, onInc, onDec }) {
  const [t0] = useState(() => Date.now());
  const [sel, setSel] = useState(item);
  const family = useFamily(item);
  const [pin, setPin] = useState(() => {
    try { const rv = JSON.parse(localStorage.getItem("askcart_region") || "null"); return rv && rv.pincode ? String(rv.pincode) : ""; } catch { return ""; }
  });
  const [pinChecked, setPinChecked] = useState(!!region);
  const [activeTab, setActiveTab] = useState("highlights");

  const varList = useMemo(() => {
    if (!family || !family.length || !item) return [item];
    return [item, ...family.filter((f) => f.sku !== item.sku)];
  }, [family, item]);
  const selValid = sel && (sel.sku === item.sku || varList.some((v) => v.sku === sel.sku));
  const cur = selValid ? sel : item;
  const varIdx = Math.max(0, varList.findIndex((v) => v.sku === cur.sku));
  const liveRef = useRef({});
  liveRef.current = { varList, varIdx, cur, onBack };
  // cart qty for the SELECTED variant (the page key may be the original SKU,
  // which is stale once the shopper switches variants).
  const cartQty = (cart && cart[cur.sku]) ? cart[cur.sku].qty : 0;

  function chooseVar(v, via) {
    if (!v || v.sku === cur.sku) return;
    track("variant_select", { sku: v.sku, from: cur.sku, variant: v.variant || "", via: via || "chip" });
    setSel(v);
  }
  function moveVar(d) {
    const st = liveRef.current;
    if (st.varList.length < 2) return;
    const next = st.varList[(st.varIdx + d + st.varList.length) % st.varList.length];
    chooseVar(next, "gallery");
  }

  useEffect(() => {
    if (!item) return;
    setSel(item);
    setPinChecked(!!region);
    window.scrollTo(0, 0);
    track("product_open", { sku: item.sku, from: item._from || "results", position: item._position || 0 });
    const onKey = (e) => {
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Escape") {
        // one layer per Esc: a chat panel or kit overlay on top closes first
        if (document.querySelector(".cht-panel") || document.querySelector(".kit-overlay")) return;
        liveRef.current.onBack();
      }
      if (e.key === "ArrowLeft") moveVar(-1);
      if (e.key === "ArrowRight") moveVar(1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      track("pdp_close", { sku: item.sku, dwell_ms: Date.now() - t0 });
    };
  }, [item && item.sku]); // eslint-disable-line react-hooks/exhaustive-deps

  const adj = adjustedRating(cur.rating, cur.num_ratings);
  const reasons = [];
  if (parsed && parsed.budgetMax && cur.price <= parsed.budgetMax) reasons.push(`${t(lang, "under")} ${inr(parsed.budgetMax)}`);
  if (parsed && parsed.occasion && (cur.tags || []).includes(parsed.occasion)) reasons.push(`${t(lang, "tagged")} ${parsed.occasion}`);
  if (parsed && parsed.brand && cur.brand === parsed.brand) reasons.push(`${t(lang, "brand")}: ${parsed.brand}`);
  if (parsed && (parsed.gender === "women" || parsed.gender === "men")) reasons.push(parsed.gender === "women" ? t(lang, "forWomen") : t(lang, "forMen"));
  const showWhy = !!parsed && reasons.length > 0;
  if (showWhy && !reasons.length) reasons.push(t(lang, "bestScore"));

  // Highlights: derived strictly from catalogue fields (never invented specs).
  const highlights = [];
  if (cur.category) highlights.push(t(lang, "hlCat").replace("{c}", displayCat(cur.category)));
  if (cur.variant_summary) highlights.push(t(lang, "hlVariants").replace("{v}", cur.variant_summary));
  if (cur.brand) highlights.push(t(lang, "hlBrand").replace("{b}", cur.brand));
  if (cur.price != null) highlights.push(t(lang, "hlPrice").replace("{p}", inr(cur.price)));
  if ((cur.tags || []).length) highlights.push(t(lang, "hlTags").replace("{tg}", cur.tags.slice(0, 3).join(", ")));
  if (cur.num_ratings) highlights.push(t(lang, "hlRatings").replace("{r}", cur.rating).replace("{n}", Number(cur.num_ratings).toLocaleString("en-IN")));

  const specs = [
    [t(lang, "specBrand"), cur.brand],
    [t(lang, "specCategory"), cur.category ? displayCat(cur.category) : null],
    [t(lang, "specPrice"), cur.price != null ? inr(cur.price) : null],
    [t(lang, "specRating"), cur.rating != null ? `${cur.rating} ★ (${t(lang, "adjustedShort")})` : null],
    [t(lang, "specRatings"), cur.num_ratings ? Number(cur.num_ratings).toLocaleString("en-IN") : null],
    [t(lang, "specVariant"), cur.variant || null],
    [t(lang, "specVariants"), varList.length > 1 ? `${varList.length} in this catalogue` : null],
    [t(lang, "specSku"), cur.sku],
  ].filter(([, v]) => v != null && v !== "");

  const TABS = [
    ["highlights", t(lang, "pdpHighlights")],
    ["specs", t(lang, "pdpSpecs")],
    ["ratings", t(lang, "pdpRatings")],
    ["ask", t(lang, "pdpAsk")],
    ["similar", t(lang, "similarItems")],
  ];
  const goTab = (id) => {
    const el = document.getElementById("pdpv-" + id);
    if (el) el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };
  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) setActiveTab(en.target.id.replace("pdpv-", ""));
    }, { rootMargin: "-20% 0px -65% 0px" });
    for (const [id] of TABS) { const el = document.getElementById("pdpv-" + id); if (el) obs.observe(el); }
    return () => obs.disconnect();
  }, [lang, item && item.sku]);

  function checkPin() {
    if (pin.length !== 6) return;
    setPinChecked(true);
    onPincode(pin);
  }
  const delivText = pinChecked && region
    ? t(lang, "pdpDelivRegion").replace("{region}", region)
    : t(lang, "pdpDelivNoPin");

  const railProps = (list, from) => list.map((x) => (
    <div key={x.sku} style={RAIL_CARD_W}>
      <ProductCard r={x} {...cardProps(from, x)} />
    </div>
  ));
  const recentList = (recent || []).filter((r) => r.sku !== cur.sku).slice(0, 8);

  return (
    <div className="wrap pdpv" id="pdp-view">
      <nav className="pdpv-crumb" aria-label="Breadcrumb">
        <button onClick={onHome}>{t(lang, "crumbHome")}</button>
        <span aria-hidden="true">›</span>
        <button onClick={() => onSearchCat(displayCat(cur.category))}>{displayCat(cur.category)}</button>
        {cur.brand ? (
          <>
            <span aria-hidden="true">›</span>
            <button onClick={() => onSearchBrand(cur.brand)}>{cur.brand}</button>
          </>
        ) : null}
      </nav>

      <div className="pdpv-grid">
        <div className="pdpv-gallery">
          <div className="pdpv-main">
            <Tile item={cur} size="fluid" aspect="1 / 1" />
            {varList.length > 1 && (
              <>
                <button className="pdpv-nav pdpv-nav-l" aria-label="Previous variant" onClick={() => moveVar(-1)}><I name="chevron-left" size={18} /></button>
                <button className="pdpv-nav pdpv-nav-r" aria-label="Next variant" onClick={() => moveVar(1)}><I name="chevron-right" size={18} /></button>
              </>
            )}
          </div>
          {varList.length > 1 && (
            <div className="pdpv-thumbs" role="tablist" aria-label={t(lang, "pdpVariants")}>
              {varList.map((v, i) => (
                <button key={v.sku} role="tab" aria-selected={v.sku === cur.sku}
                        className={"pdpv-thumb" + (v.sku === cur.sku ? " on" : "")}
                        title={v.variant || v.title}
                        onClick={() => chooseVar(v, "thumb")}>
                  <Tile item={v} size={56} showInfo={false} />
                  <span className="pdpv-thumb-l">{parseVariant(v.variant).size || parseVariant(v.variant).color || (v.variant || v.sku)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="pdpv-buy">
          {cur.brand ? <button className="pdpv-brand" onClick={() => onSearchBrand(cur.brand)}>{cur.brand}</button> : null}
          <h1 className="pdpv-h1">
            {String(cur.title).replace(VARIANT_PAREN, "")}
            {cur.variant ? <span className="pdpv-h1-v"> · {cur.variant}</span> : null}
          </h1>
          <div className="pdpv-ratingrow">
            <Rating rating={cur.rating} count={cur.num_ratings} compact />
            <Tooltip tip={t(lang, "pdpAdjustedTip")}>
              <span className="pdpv-adjinfo" role="button" tabIndex={0}><I name="info" size={13} /> {t(lang, "pdpAdjustedShort")}</span>
            </Tooltip>
            {cur.rating_basis === "synthetic" && <span className="pdpv-demolabel">{t(lang, "pdpDemoRating")}</span>}
          </div>
          <div className="pdpv-price">
            <span className="pdpv-p">{inr(cur.price)}</span>
            {cur.mrp && cur.mrp > cur.price ? <s className="pdpv-mrp">{inr(cur.mrp)}</s> : null}
          </div>
          <div className="pdpv-taxnote">{t(lang, "pdpTax")}</div>

          {varList.length > 1 && (
            <div className="pdpv-sec-v" role="radiogroup" aria-label={t(lang, "pdpVariants")}>
              <div className="pdpv-varlabel">{t(lang, "pdpVariants")} <span className="pdpv-varcur">· {cur.variant || cur.sku}</span></div>
              <div className="pdpv-vars">
                {varList.map((v) => {
                  const pv = parseVariant(v.variant);
                  const on = v.sku === cur.sku;
                  const delta = v.price != null && cur.price != null && v.price > cur.price ? v.price - cur.price : 0;
                  const base = {
                    role: "radio", "aria-checked": on,
                    className: "pdpv-var" + (on ? " on" : ""),
                    onClick: () => chooseVar(v, "chip"),
                  };
                  if (pv.size) return (
                    <button key={v.sku} {...base} title={v.variant || v.sku}>
                      {pv.size}
                      {delta > 0 && <span className="pdpv-delta">+{inr(delta).slice(1)}</span>}
                    </button>
                  );
                  if (pv.colorHex) return (
                    <button key={v.sku} {...base} title={pv.color}>
                      <span className="pdpv-swatch" style={{ background: pv.colorHex }} aria-hidden="true" />
                      <span className="pdpv-swatch-l">{pv.color}</span>
                      {delta > 0 && <span className="pdpv-delta">+₹{delta.toLocaleString("en-IN")}</span>}
                    </button>
                  );
                  return (
                    <button key={v.sku} {...base} title={v.variant || v.sku}>
                      {pv.raw}
                      {delta > 0 && <span className="pdpv-delta">+₹{delta.toLocaleString("en-IN")}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="pdpv-deliv">
            <div className="pdpv-deliv-pin">
              <I name="map-pin" size={15} />
              <input className="pdpv-pin" inputMode="numeric" maxLength={6} value={pin}
                     placeholder={t(lang, "pdpPinPh")} aria-label={t(lang, "pdpPinPh")}
                     onChange={(e) => { setPin(e.target.value.replace(/[^\d]/g, "").slice(0, 6)); setPinChecked(false); }} />
              <Button size="sm" variant="secondary" onClick={checkPin} disabled={pin.length !== 6}>{t(lang, "pdpCheck")}</Button>
            </div>
            <div className="pdpv-deliv-row" aria-live="polite">
              <I name="truck" size={15} /> <span>{delivText}</span>
            </div>
            <div className="pdpv-deliv-row">
              <I name="rotate-ccw" size={15} /> <span>{t(lang, "pdpReturns")}</span>
            </div>
            {cur.rating_basis === "synthetic" && (
              <div className="pdpv-deliv-row"><I name="shield-check" size={15} /> <span>{t(lang, "pdpIndicative")}</span></div>
            )}
          </div>

          <div className="pdpv-ctarow">
            {cartQty > 0 ? (
              <>
                <Button size="lg" className="pdpv-gocart" onClick={onGoCart}>{t(lang, "goToCart")}</Button>
                <div className="pdpv-qty"><QtyStepper qty={cartQty} onDec={onDec} onInc={onInc} /></div>
              </>
            ) : (
              <Button size="lg" className="pdpv-add pdp-add" iconLeft={<I name="bag" size={16} />} onClick={() => onAdd(cur)}>{t(lang, "addToCart")}</Button>
            )}
            <Button size="lg" variant="ink" className="pdpv-buy pdp-buy" onClick={() => onBuy(cur)}>{t(lang, "buyNow")}</Button>
            <button className={"pdpv-heart" + (wished ? " on" : "")} aria-pressed={wished}
                    aria-label={wished ? t(lang, "wishRemove") : t(lang, "wishAdd")}
                    title={wished ? t(lang, "wishRemove") : t(lang, "wishAdd")}
                    onClick={() => onWish(cur)}>
              <I name="heart" size={20} filled={wished} />
            </button>
          </div>

          {showWhy && (
            <div className="pdpv-sec-v">
              <div className="pdpv-varlabel">{t(lang, "pdpWhyMatched")}</div>
              <div className="pdpv-why">{reasons.map((r) => <span key={r} className="pdpv-whychip"><I name="check" size={12} /> {r}</span>)}</div>
            </div>
          )}
        </div>
      </div>

      <div className="pdpv-tabs" role="tablist" aria-label="Product sections">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={activeTab === id}
                  className={"pdpv-tab" + (activeTab === id ? " on" : "")}
                  onClick={() => goTab(id)}>{label}</button>
        ))}
      </div>

      <section className="pdpv-sec" id="pdpv-highlights">
        <h3>{t(lang, "pdpHighlights")}</h3>
        <div className="pdpv-highlights">
          {highlights.map((h) => <div key={h} className="pdpv-hl"><I name="check" size={14} /> <span>{h}</span></div>)}
        </div>
      </section>

      <section className="pdpv-sec" id="pdpv-specs">
        <h3>{t(lang, "pdpSpecs")}</h3>
        {specs.length > 0 && (
          <table className="pdpv-specs">
            <tbody>{specs.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody>
          </table>
        )}
      </section>

      <section className="pdpv-sec" id="pdpv-ratings">
        <h3>{t(lang, "pdpRatings")}</h3>
        <div className="pdpv-ratings">
          <div className="pdpv-ratings-score">{cur.rating}</div>
          <div>
            <Rating rating={cur.rating} count={cur.num_ratings} />
            <div className="pdpv-ratings-sub">{t(lang, "pdpBasedOn").replace("{n}", Number(cur.num_ratings || 0).toLocaleString("en-IN"))}</div>
            <div className="pdpv-ratings-adj">{t(lang, "pdpAdjustedLine").replace("{a}", adj.toFixed(1))}</div>
            {cur.rating_basis === "synthetic" && <div className="pdpv-demolabel">{t(lang, "pdpDemoRating")}</div>}
          </div>
        </div>
      </section>

      <section className="pdpv-sec" id="pdpv-ask">
        <h3>{t(lang, "pdpAsk")} <span className="pdpv-spark" aria-hidden="true"><I name="sparkle" size={14} /></span></h3>
        <div className="pdpv-ask">
          <button className="pdpv-askchip" onClick={() => onAsk(t(lang, "askGift"))}>{t(lang, "askGift")}</button>
          <button className="pdpv-askchip" onClick={() => onAsk(t(lang, "askRating"))}>{t(lang, "askRating")}</button>
          <button className="pdpv-askchip" onClick={() => onAsk(t(lang, "askPrice"))}>{t(lang, "askPrice")}</button>
          <button className="pdpv-askchip" onClick={() => onAsk(t(lang, "chtQCompare"))}>{t(lang, "chtQCompare")}</button>
        </div>
      </section>

      <section className="pdpv-sec" id="pdpv-similar">
        {similar && similar.length > 0 && (
          <Rail title={t(lang, "similarItems")} label={t(lang, "similarItems")}>{railProps(similar, "pdp_similar")}</Rail>
        )}
        {moreFromBrand && moreFromBrand.length > 0 && cur.brand && (
          <Rail title={t(lang, "moreFromBrand").replace("{brand}", cur.brand)} label={"More from " + cur.brand}>
            {railProps(moreFromBrand, "pdp_brand")}
          </Rail>
        )}
        {recentList.length > 0 && (
          <Rail title={t(lang, "recentlyViewed")} label={t(lang, "recentlyViewed")}>{railProps(recentList, "pdp_recent")}</Rail>
        )}
      </section>

      <div className="pdpv-stickybuy">
        <div className="pdpv-sb-price">{inr(cur.price)}</div>
        <Button size="lg" className="pdpv-sb-add" onClick={() => onAdd(cur)}>{t(lang, "addToCart")}</Button>
        <Button size="lg" variant="ink" className="pdpv-sb-buy" onClick={() => onBuy(cur)}>{t(lang, "buyNow")}</Button>
      </div>
    </div>
  );
}

// Quick view: 720px modal from the card hover bar (desktop only).
export function QuickView({ lang, item, onClose, onFull, onAdd, onBuy, onWish, wished, cart, onInc, onDec }) {
  const [sel, setSel] = useState(item);
  const family = useFamily(item);
  const varList = useMemo(() => {
    if (!family || !family.length || !item) return [item];
    return [item, ...family.filter((f) => f.sku !== item.sku)];
  }, [family, item]);
  const cur = varList.some((v) => v.sku === sel.sku) ? sel : item;
  const cartQty = (cart && cart[cur.sku]) ? cart[cur.sku].qty : 0;
  return (
    <Overlay variant="modal" label={cur.title} onClose={onClose} width={720}>
      <div className="qv">
        <button className="qv-x" onClick={onClose} aria-label="Close quick view"><I name="x" size={16} /></button>
        <div className="qv-grid">
          <div className="qv-tile"><Tile item={cur} size="fluid" showInfo={false} /></div>
          <div className="qv-info">
            {cur.brand ? <span className="brandb">{cur.brand}</span> : null}
            <h3 className="qv-title">{String(cur.title).replace(VARIANT_PAREN, "")}</h3>
            <Rating rating={cur.rating} count={cur.num_ratings} compact />
            <div className="qv-price">{inr(cur.price)}</div>
            <div className="pdpv-taxnote">{t(lang, "pdpTax")}</div>
            {varList.length > 1 && (
              <div className="pdpv-vars" role="radiogroup" aria-label={t(lang, "pdpVariants")}>
                {varList.map((v) => {
                  const pv = parseVariant(v.variant);
                  const on = v.sku === cur.sku;
                  return (
                    <button key={v.sku} role="radio" aria-checked={on}
                            className={"pdpv-var" + (on ? " on" : "")}
                            title={v.variant || v.sku}
                            onClick={() => { track("variant_select", { sku: v.sku, from: cur.sku, variant: v.variant || "", via: "quickview" }); setSel(v); }}>
                      {pv.size || pv.color || pv.raw}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="qv-cta">
              {cartQty > 0
                ? <div className="pdpv-qty"><QtyStepper qty={cartQty} onDec={onDec} onInc={onInc} /></div>
                : <Button iconLeft={<I name="bag" size={16} />} onClick={() => onAdd(cur)}>{t(lang, "addToCart")}</Button>}
              {onBuy && <Button variant="ink" onClick={() => onBuy(cur)}>{t(lang, "buyNow")}</Button>}
              <Button variant="secondary" onClick={onFull}>{t(lang, "viewDetails")}</Button>
              <IconButton name="heart" label={wished ? t(lang, "wishRemove") : t(lang, "wishAdd")}
                          className={"qv-heart" + (wished ? " on" : "")}
                          onClick={() => onWish(cur)} />
            </div>
          </div>
        </div>
      </div>
    </Overlay>
  );
}
