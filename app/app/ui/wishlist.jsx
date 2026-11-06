"use client";
// Wishlist (new, ?tab=wishlist): localStorage askcart_wishlist_v1 (SKU array,
// cap 100). Front-end only. Phase 6 adds move-to-cart refinements.
import { useEffect, useState } from "react";
import { Tile } from "./kit/Tile";
import { Price } from "./kit/Price";
import { Rating } from "./kit/Rating";
import { Button } from "./kit/Button";
import { I } from "./kit/Icon";
import { displayCat } from "../lib/categories";
import { track } from "../lib/track";

export function WishlistView({ skus, onRemove, onAdd, onSearch }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let stop = false;
    Promise.all(skus.map(async (sku) => {
      try {
        const r = await fetch("/api/catalog-preview?sku=" + encodeURIComponent(sku));
        const j = await r.json();
        return j.item || j.item || null;
      } catch { return null; }
    })).then((rows) => { if (!stop) setItems(rows.filter(Boolean)); });
    return () => { stop = true; };
  }, [skus.join(",")]);
  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "4px 0 16px" }}>Wishlist <span style={{ color: "var(--text-3)", fontWeight: 500 }}>({skus.length})</span></h1>
      {!items ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
          {[...Array(4)].map((_, i) => <div key={i} className="kit-skel kit-skel-card" style={{ height: 230 }} />)}
        </div>
      ) : items.length === 0 ? (
        <div className="dim" style={{ textAlign: "center", padding: "48px 24px" }}>
          <I name="heart" size={40} style={{ color: "var(--text-3)" }} />
          <h3 style={{ margin: "12px 0 6px" }}>Nothing saved yet</h3>
          <p style={{ color: "var(--text-2)", marginBottom: 16 }}>Tap the heart on any product to save it here.</p>
          <Button variant="secondary" onClick={() => onSearch("gift under 2k")}>Start shopping</Button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {items.map((it) => (
            <div key={it.sku} className="card" style={{ position: "relative", cursor: "pointer" }}
                 role="link" tabIndex={0} onClick={() => onSearch(it.title)}>
              <button className="wl-heart" aria-label="Remove from wishlist" aria-pressed
                      onClick={(e) => { e.stopPropagation(); onRemove(it); }}>
                <I name="heart" size={16} filled />
              </button>
              <div className="imwell"><Tile item={it} size={176} /></div>
              <div className="cat">{displayCat(it.category)}</div>
              <div className="t">{it.title}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginTop: 4 }}>
                <Price value={it.price} size="md" />
                <Rating rating={it.rating} count={it.num_ratings} compact />
              </div>
              <button className="card-add" style={{ marginTop: 10 }} onClick={(e) => { e.stopPropagation(); onAdd(it); }}>
                Move to cart
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
