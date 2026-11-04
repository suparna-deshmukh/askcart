// 7.1 Product detail drawer + 7.2 designed placeholder tiles.
// Tiles are category-tinted (brief §8.1 map) with an inline SVG glyph and a
// brand monogram — never a generic grey box, marked "illustrative".
"use client";
import { useEffect, useState } from "react";
import { track } from "../lib/track";

const CATEGORY_STYLE = {
  default: { tint: "#F0ECE4", glyph: "box" },
  fashion: { tint: "#F7E8EE", glyph: "dress" },
  home: { tint: "#EAF1E6", glyph: "sofa" },
  electronics: { tint: "#E6EEF8", glyph: "plug" },
  beauty: { tint: "#FBEBE3", glyph: "sparkle" },
  toys: { tint: "#FFF3D6", glyph: "ball" },
  baby: { tint: "#FFF3D6", glyph: "stroller" },
  sports: { tint: "#E3F3F1", glyph: "dumbbell" },
  auto: { tint: "#E6EEF8", glyph: "wheel" },
  kitchen: { tint: "#EAF1E6", glyph: "pot" },
  watch: { tint: "#EEF0FF", glyph: "watch" },
};
function catStyle(category) {
  const c = String(category || "").toLowerCase();
  if (/fashion|clothing|jewel|saree|kurti|lehenga|ethnic|shoes|footwear|bag|handbag/.test(c)) return CATEGORY_STYLE.fashion;
  if (/watch|wristwatch/.test(c)) return CATEGORY_STYLE.watch;
  if (/home|kitchen|tools|furniture|lighting|bedding|decor/.test(c)) return CATEGORY_STYLE.home;
  if (/kitchen|appliance|cookware|utensil|tiffin/.test(c)) return CATEGORY_STYLE.kitchen;
  if (/electronic|phone|computer|camera|audio|game|gadget|headphone|laptop|tablet|charger/.test(c)) return CATEGORY_STYLE.electronics;
  if (/beauty|personal care|perfume|cosmetic|skincare|grooming/.test(c)) return CATEGORY_STYLE.beauty;
  if (/toys|games|games/.test(c)) return CATEGORY_STYLE.toys;
  if (/baby|maternity|diaper/.test(c)) return CATEGORY_STYLE.baby;
  if (/sport|outdoor|fitness|yoga|gym/.test(c)) return CATEGORY_STYLE.sports;
  if (/automotive|car /.test(c)) return CATEGORY_STYLE.auto;
  return CATEGORY_STYLE.default;
}

function Glyph({ kind, color }) {
  const p = { fill: "none", stroke: color, strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (kind) {
    case "dress": return <svg viewBox="0 0 24 24" width="44" height="44"><path {...p} d="M9 3l1.5 4L8 12l-2 8h12l-2-8-2.5-5L15 3M9 3h6" /></svg>;
    case "sofa": return <svg viewBox="0 0 24 24" width="44" height="44"><path {...p} d="M4 12V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M3 12a2 2 0 0 1 2 2v3h14v-3a2 2 0 0 1 4 0v5H2v-5a2 2 0 0 1 1-2Z" /></svg>;
    case "plug": return <svg viewBox="0 0 24 24" width="44" height="44"><path {...p} d="M9 3v5M15 3v5M7 8h10v4a5 5 0 0 1-10 0V8ZM12 17v4" /></svg>;
    case "sparkle": return <svg viewBox="0 0 24 24" width="44" height="44"><path {...p} d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM18 15l.9 2.6L21 18.5l-2.1.9L18 22l-.9-2.6-2.1-.9 2.1-.9L18 15Z" /></svg>;
    case "ball": return <svg viewBox="0 0 24 24" width="44" height="44"><circle cx="12" cy="12" r="8" {...p} /><path {...p} d="M12 4c3 2.5 3 13.5 0 16M4.5 9.5c4.5 2 10.5 2 15 0M4.5 14.5c4.5-2 10.5-2 15 0" /></svg>;
    case "stroller": return <svg viewBox="0 0 24 24" width="44" height="44"><path {...p} d="M3 4h2l3 9h10a4 4 0 0 0 4-4M9 13l-1.5 5M17 13l2 5M8 21a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM18 21a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" /></svg>;
    case "dumbbell": return <svg viewBox="0 0 24 24" width="44" height="44"><path {...p} d="M8 8v8M5 9.5v5M16 8v8M19 9.5v5M8 12h8M3 12h2M19 12h2" /></svg>;
    case "wheel": return <svg viewBox="0 0 24 24" width="44" height="44"><circle cx="12" cy="12" r="8" {...p} /><circle cx="12" cy="12" r="2.5" {...p} /><path {...p} d="M12 4v5.5M12 14.5V20M4 12h5.5M14.5 12H20" /></svg>;
    case "pot": return <svg viewBox="0 0 24 24" width="44" height="44"><path {...p} d="M5 10h14v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-6ZM3 10h18M9 7c0-1.5 1-2 1-3M13 7c0-1.5 1-2 1-3" /></svg>;
    case "watch": return <svg viewBox="0 0 24 24" width="44" height="44"><rect x="7" y="7" width="10" height="10" rx="3" {...p} /><path {...p} d="M9 7l.5-4h5L15 7M9 17l.5 4h5l.5-4M12 10v2.5l1.5 1" /></svg>;
    default: return <svg viewBox="0 0 24 24" width="44" height="44"><path {...p} d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3ZM4 7.5l8 4.5 8-4.5M12 12v9" /></svg>;
  }
}

// Deterministic glyph colour (text-2 per brief) — derived from the tint so
// the tile stays calm, no saturated accents.
export function Tile({ item, size = 120, className = "" }) {
  const st = catStyle(item ? item.category : undefined);
  const brand = (item && item.brand || "").trim();
  return (
    <div className={"tile " + className} style={{ width: size, height: size, background: st.tint, position: "relative", borderRadius: 10, overflow: "hidden", flex: "none" }} aria-hidden="true">
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Glyph kind={st.glyph} color="#8a8578" />
      </div>
      {brand && (
        <div style={{
          position: "absolute", top: 8, left: 8, width: 24, height: 24, borderRadius: "50%",
          background: "rgba(255,255,255,.85)", border: "1px solid #d8d2c6",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 800, color: "#55514A",
        }}>{brand[0].toUpperCase()}</div>
      )}
      <span style={{ position: "absolute", bottom: 5, right: 7, fontSize: 8.5, fontWeight: 600, color: "#8a8578", letterSpacing: ".04em" }}>illustrative</span>
    </div>
  );
}

// Bayesian shrinkage (same math as the app-level pipeline): a 5.0 with 3
// ratings ranks below a 4.4 with 3,000. C = 30 pseudo-ratings at the
// catalogue mean.
export function adjustedRating(rating, numRatings, m = 4.2, C = 30) {
  return (C * m + (rating || 0) * (numRatings || 0)) / (C + (numRatings || 0));
}

function inr(n) { return "₹" + Number(n || 0).toLocaleString("en-IN"); }

export function ProductDetail({ item, onClose, onAdd, onBuy, similar, parsed, region, onOpenSku }) {
  const [t0] = useState(() => Date.now());
  const [open, setOpen] = useState(true);
  // S7: selected variant (defaults to the opened SKU); family siblings are
  // fetched once when the opened SKU belongs to a listing-matrix family.
  const [sel, setSel] = useState(item);
  const [family, setFamily] = useState((item && item.family) || null);
  useEffect(() => {
    if (!item) return;
    setSel(item);
    setFamily(item.family || null);
    if (!item.family && item.family_id) {
      fetch(`/api/catalog-preview?sku=${encodeURIComponent(item.sku)}`)
        .then((r) => r.json())
        .then((j) => { if (j.family) setFamily(j.family); })
        .catch(() => {});
    }
    const from = (item._from || "results");
    const pos = item._position || 0;
    track("product_open", { sku: item.sku, from, position: pos });
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      track("pdp_close", { sku: item.sku, dwell_ms: Date.now() - t0 });
    };
  }, [item && item.sku]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open || !item) return null;

  const adj = adjustedRating(sel.rating, sel.num_ratings);
  const reasons = [];
  if (parsed && parsed.budgetMax && sel.price <= parsed.budgetMax) reasons.push(`Under ${inr(parsed.budgetMax)}`);
  if (parsed && parsed.occasion && (sel.tags || []).includes(parsed.occasion)) reasons.push(`Tagged ${parsed.occasion}`);
  if (parsed && parsed.brand && sel.brand === parsed.brand) reasons.push(`Brand: ${parsed.brand}`);
  if (parsed && (parsed.gender === "women" || parsed.gender === "men")) reasons.push(parsed.gender === "women" ? "For women" : "For men");
  if (!reasons.length) reasons.push("Best score for your search");

  const delivery = region
    ? `Delivery to ${region} region (demo estimate): 2–4 days`
    : "Delivery estimate (demo): 2–4 days — set a pincode for a regional estimate";

  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-label="Product details">
      <div className="drawer pdp" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h3>Product</h3>
          <button className="x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="pdp-body">
          <div className="pdp-top">
            <Tile item={sel} size={128} />
            <div className="pdp-id">
              <h2 className="pdp-title">{sel.title}</h2>
              {sel.brand ? <span className="brandb">{sel.brand}</span> : null}
              <div className="pdp-rate">
                <span className={"rpill " + (sel.rating >= 4 ? "good" : sel.rating >= 3 ? "mid" : "low")}>★ {sel.rating}</span>
                <span className="pdp-rc">{(sel.num_ratings || 0).toLocaleString("en-IN")} ratings · {adj.toFixed(1)} adjusted for rating count</span>
              </div>
            </div>
          </div>
          <div className="pdp-price">
            <span className="pdp-p">{inr(sel.price)}</span>
            <span className="pdp-tax">inclusive of all taxes (demo)</span>
          </div>
          {family && family.length > 0 && (
            <div className="pdp-sec">
              <div className="pdp-sec-t">Variants ({family.length + 1} in this catalogue)</div>
              <div className="pdp-vars" role="radiogroup" aria-label="Variants">
                {family.map((v) => (
                  <button key={v.sku} role="radio" aria-checked={sel.sku === v.sku}
                          className={"pdp-var" + (sel.sku === v.sku ? " on" : "")}
                          onClick={() => {
                            track("variant_select", { sku: v.sku, from: sel.sku, variant: v.variant || "" });
                            setSel(v);
                          }}>
                    {v.variant || v.sku}<span className="pdp-var-p">{inr(v.price)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="pdp-sec">
            <div className="pdp-sec-t">Why this matched</div>
            <div className="pdp-why">
              {reasons.map((r) => <span key={r} className="whychip">✓ {r}</span>)}
            </div>
          </div>
          <div className="pdp-sec">
            <div className="pdp-sec-t">Trust & delivery (demo)</div>
            <div className="pdp-note">
              <div>{delivery}.</div>
              <div>7-day return window (demo policy).</div>
              {sel.rating_basis === "synthetic" && <div>Demo rating — indicative, not live marketplace data.</div>}
            </div>
          </div>
          {similar && similar.length > 0 && (
            <div className="pdp-sec">
              <div className="pdp-sec-t">Similar items</div>
              <div className="pdp-sim">
                {similar.slice(0, 4).map((x) => (
                  <button key={x.sku} className="pdp-sim-c" onClick={() => onOpenSku && onOpenSku(x)}>
                    <Tile item={x} size={44} />
                    <span className="pdp-sim-t">{x.title}</span>
                    <span className="pdp-sim-p">{inr(x.price)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="pdp-actions">
          <button className="pdp-add" onClick={() => onAdd(sel)}>Add to cart</button>
          <button className="pdp-buy" onClick={() => onBuy(sel)}>Buy now</button>
        </div>
      </div>
    </div>
  );
}
