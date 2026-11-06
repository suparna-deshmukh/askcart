"use client";
// Compact product card for chat messages (72px tile, 2-line title, price,
// rating chip, up to 3 reason chips, Add + Details, wishlist heart).
import { Tile } from "../kit/Tile";
import { I } from "../kit/Icon";

export function ProductMini({ item, onAdd, onOpen, onWish, wished, pos }) {
  const reasons = (item.reasons || []).slice(0, 3);
  return (
    <div className="cht-prod">
      <Tile item={item} size={72} className="cht-prod-tile" />
      <div className="cht-prod-main">
        <div className="cht-prod-title">{item.title}</div>
        <div className="cht-prod-price-row">
          <span className="cht-prod-price">₹{item.price.toLocaleString("en-IN")}</span>
          <span className="cht-prod-rating">★ {item.rating}<em> ({item.num_ratings})</em></span>
          {onWish && (
            <button className="cht-prod-wish" aria-label={wished ? "Remove from wishlist" : "Save to wishlist"}
                    aria-pressed={wished} onClick={() => onWish(item)}>
              <I name="heart" size={15} filled={wished} />
            </button>
          )}
        </div>
        {reasons.length > 0 && (
          <div className="cht-prod-reasons">
            {reasons.map((r, i) => <span key={i} className="cht-reason">✓ {r}</span>)}
          </div>
        )}
        <div className="cht-prod-btns">
          <button className="cht-btn cht-btn-primary" onClick={() => onAdd(item, pos)}>Add</button>
          <button className="cht-btn cht-btn-ghost" onClick={() => onOpen(item, pos)}>Details</button>
        </div>
      </div>
    </div>
  );
}
