"use client";
// Compact product card for chat messages (72px tile, 2-line title, reasons).
import { Tile } from "../kit/Tile";

export function ProductMini({ item, onAdd, onOpen, pos }) {
  const reasons = (item.reasons || []).slice(0, 3);
  return (
    <div className="cht-prod">
      <Tile item={item} size={72} className="cht-prod-tile" />
      <div className="cht-prod-main">
        <div className="cht-prod-title">{item.title}</div>
        <div>
          <span className="cht-prod-price">₹{item.price.toLocaleString("en-IN")}</span>{" "}
          <span className="cht-prod-meta">★ {item.rating} ({item.num_ratings})</span>
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
