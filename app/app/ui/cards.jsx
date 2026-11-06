"use client";
// Product card (9.7 card v2) — shared by results, home rails, and chat.
// Extracted verbatim from page.jsx so the home sections can reuse it.
import { Tile } from "./pdp";
import { displayCat } from "../lib/categories";

const VARIANT_PAREN = /\s*\([^()]+\)$/;
export { VARIANT_PAREN };

// 9.7 card v2: designed placeholder image, whole card opens the PDP,
// single Add button (Buy now moved to the PDP), Best match badge.
export function ProductCard({ r, onAdd, onOpen, best, close, overBudget }) {
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
