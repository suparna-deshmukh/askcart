"use client";
// Product card (9.7 card v2) — shared by results, home rails, and chat.
// Extracted verbatim from page.jsx so the home sections can reuse it.
import { Tile } from "./kit/Tile";
import { displayCat } from "../lib/categories";
import { I } from "./kit/Icon";
import { QtyStepper } from "./kit/QtyStepper";

const VARIANT_PAREN = /\s*\([^()]+\)$/;
export { VARIANT_PAREN };

// 9.7 card v2: designed placeholder image, whole card opens the PDP,
// single Add button (Buy now moved to the PDP), Best match badge.
export function ProductCard({ r, onAdd, onBuy, onOpen, best, close, overBudget, onWish, wished = false, cartQty = 0, onDec, onInc, onQuick, onAsk }) {
  const isFam = !!r.family_id;
  const title = isFam ? String(r.title).replace(VARIANT_PAREN, "") : r.title;
  const from = isFam && r.family_min_price != null && r.family_min_price < r.price;
  return (
    <div className="card" role="link" tabIndex={0} onClick={() => onOpen(r)}
         onKeyDown={(e) => e.key === "Enter" && onOpen(r)}>
      <div className="imwell">
        {best && <span className="badge-best">Best match</span>}
        {close && <span className="badge-close">Close match</span>}
        <Tile item={r} size="fluid" />
        {onWish && (
          <button className={"card-heart" + (wished ? " on" : "")} aria-pressed={wished}
                  aria-label={wished ? "Remove from wishlist" : "Save to wishlist"}
                  title={wished ? "Remove from wishlist" : "Save to wishlist"}
                  onClick={(e) => { e.stopPropagation(); onWish(r); }}>
            <I name="heart" size={18} filled={wished} />
          </button>
        )}
        <span className="card-ratingchip">
          <span className={"rpill " + (r.rating >= 4 ? "good" : r.rating >= 3 ? "mid" : "low")}>★ {r.rating}</span>
          <span className="rc">{r.num_ratings >= 1000 ? (r.num_ratings / 1000).toFixed(1) + "k" : r.num_ratings.toLocaleString("en-IN")}</span>
        </span>
        {onAsk && (
          <button className="card-ask" aria-label="Ask about this product" title="Ask about this product"
                  onClick={(e) => { e.stopPropagation(); onAsk(r); }}>
            <I name="sparkle" size={13} />
          </button>
        )}
        {onQuick && (
          <button className="card-quick" onClick={(e) => { e.stopPropagation(); onQuick(r); }}
                  aria-label="Quick view">
            <I name="eye" size={14} /> Quick view
          </button>
        )}
      </div>
      {r.brand ? <span className="brandb">{r.brand}</span> : null}
      <div className="t">{title}</div>
      <div className="cat">{displayCat(r.category)}</div>
      {isFam && r.variant_summary && <div className="vline">{r.variant_summary}</div>}
      <div className="prow"><span className="p">₹{r.price.toLocaleString("en-IN")}</span>
        {from && <span className="onwards">from ₹{r.family_min_price.toLocaleString("en-IN")}</span>}</div>
      {overBudget && <div className="overbud">Slightly over your budget</div>}
      {cartQty > 0 ? (
        <div className="card-step" onClick={(e) => e.stopPropagation()}>
          <QtyStepper qty={cartQty} onDec={() => onDec && onDec(r)} onInc={() => onInc && onInc(r)} />
        </div>
      ) : (
        <div className="card-actions" onClick={(e) => e.stopPropagation()}>
          <button className="card-add" onClick={(e) => { e.stopPropagation(); onAdd(r); }}>Add to cart</button>
          {onBuy && <button className="card-buy" onClick={(e) => { e.stopPropagation(); onBuy(r); }}>Buy now</button>}
        </div>
      )}
    </div>
  );
}
