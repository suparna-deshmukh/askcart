"use client";
// Phase 6 (brief §9): cart drawer v2 — kit Overlay right drawer, Tile 72 rows,
// QtyStepper (minus at 1 removes with Undo toast), Save for later (-> wishlist
// with Undo), "Complete your purchase" similar rail, honest summary footer.
import { useMemo } from "react";
import { Overlay } from "./kit/Overlay";
import { Button, IconButton } from "./kit/Button";
import { Tile } from "./kit/Tile";
import { QtyStepper } from "./kit/QtyStepper";
import { Chip } from "./kit/Chip";
import { I } from "./kit/Icon";
import { useToast } from "./kit/Toaster";
import { displayCat } from "../lib/categories";
import { track } from "../lib/track";
import { validateRecommendationRail } from "../../lib/guard.js";
import { t } from "../lib/i18n";

const EXAMPLES = ["gift under 2k", "diwali decorations", "headphones under 3k", "cotton kurti"];
const CART_RAIL_NOTED = new Set(); // §9: one drop event per anchor per session

// §9: "Complete your purchase" items must pass the same-category relation
// to the anchor; below the minimum the rail is hidden, never padded.
function similarTwo(first, pool, inCart) {
  if (!first || !pool || !pool.length) return [];
  const base = pool
    .filter((x) => x.sku !== first.sku && !inCart[x.sku] && x.category === first.category &&
      Math.abs(x.price - first.price) <= Math.max(100, first.price * 0.4))
    .sort((a, b) => (b.rating - a.rating) || (b.num_ratings - a.num_ratings))
    .slice(0, 2);
  const g = validateRecommendationRail(base, { item: first }, { surface: "cart_complete", mode: "item", min: 2, max: 2 });
  if (g.dropped && !CART_RAIL_NOTED.has("cart:" + first.sku)) {
    CART_RAIL_NOTED.add("cart:" + first.sku);
    track("rail_item_dropped", { surface: "cart_complete", reason: "ungrounded" });
  }
  return g.hidden ? [] : g.items;
}

export function CartDrawer({ lang, open, onClose, cart, setCart, onCheckout, onWishSave, onWishUndo, onAdd, onSearch, onHome, similarPool, onAskHelp }) {
  const toast = useToast();
  const L = (k) => t(lang, k);
  const items = Object.entries(cart).map(([sku, e]) => ({ sku, ...e.item, qty: e.qty }));
  const count = items.reduce((a, it) => a + it.qty, 0);
  const total = items.reduce((a, it) => a + it.price * it.qty, 0);
  const suggest = useMemo(() => similarTwo(items[0], similarPool, cart), [cart, similarPool, items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  function restore(item, e) {
    setCart((c) => (c[item.sku] ? c : { ...c, [item.sku]: { item: e, qty: 1 } }));
  }
  function dec(sku, e) {
    if (e.qty <= 1) {
      setCart((c) => { const n = { ...c }; delete n[sku]; return n; });
      track("remove_from_cart", { sku, cart_size: Object.keys(cart).length - 1, price: e.price, via: "stepper" });
      toast({ type: "info", text: L("cartRemoved"), sub: e.title, action: L("undo"), onAction: () => restore(e, e), ms: 5000 });
      return;
    }
    setCart((c) => ({ ...c, [sku]: { ...e, qty: e.qty - 1 } }));
    track("remove_from_cart", { sku, cart_size: Object.keys(cart).length, price: e.price, qty: e.qty - 1 });
  }
  function inc(sku, e) {
    setCart((c) => ({ ...c, [sku]: { ...e, qty: e.qty + 1 } }));
    track("add_to_cart", { sku, price: e.price, from: "cart_step" });
  }
  function remove(e) {
    setCart((c) => { const n = { ...c }; delete n[e.sku]; return n; });
    track("remove_from_cart", { sku: e.sku, cart_size: Object.keys(cart).length - 1, price: e.price, via: "remove" });
    toast({ type: "info", text: L("cartRemoved"), sub: e.title, action: L("undo"), onAction: () => restore(e, e), ms: 5000 });
  }
  function saveLater(e) {
    onWishSave(e);
    toast({ type: "info", text: L("cartSavedLater"), sub: e.title, action: L("undo"), onAction: () => onWishUndo(e), ms: 6000 });
  }

  return (
    <Overlay variant="drawer" label={L("navCart")} onClose={onClose} width={440}>
      <div className="cv2">
        <div className="cv2-head">
          <h3>{L("navCart")} {count > 0 && <span className="cv2-count">{count}</span>}</h3>
          <IconButton name="x" size={40} label={L("close")} className="cv2-x" onClick={onClose} />
        </div>
        {items.length > 0 && onAskHelp && (
          <button className="cv2-askchip" onClick={onAskHelp}><I name="sparkle" size={13} /> {L("askCartHelp")}</button>
        )}

        {items.length === 0 ? (
          <div className="cv2-empty">
            <span className="cv2-empty-ic" aria-hidden="true"><I name="bag" size={40} /></span>
            <h3 className="cv2-empty-h">{L("emptyCart")}</h3>
            <p>{L("cartEmptySub")}</p>
            <div className="cv2-empty-chips">
              {EXAMPLES.map((q) => <Chip key={q} onClick={() => { onClose(); onSearch(q); }}>{q}</Chip>)}
            </div>
            <Button variant="secondary" onClick={() => { onClose(); onHome(); }}>{L("continueShopping")}</Button>
          </div>
        ) : (
          <>
            <div className="cv2-rows">
              {items.map((it) => (
                <div className="cv2-row" key={it.sku}>
                  <Tile item={it} size={72} showInfo={false} />
                  <div className="cv2-info">
                    <div className="cv2-brand">{it.brand || displayCat(it.category)}</div>
                    <div className="cv2-title">{it.title}</div>
                    {it.variant && <div className="cv2-var">{it.variant}{it.variant_summary ? " · " + it.variant_summary : ""}</div>}
                    <div className="cv2-row2">
                      <QtyStepper qty={it.qty} onDec={() => dec(it.sku, it)} onInc={() => inc(it.sku, it)} min={0} />
                      <span className="cv2-actions">
                        <button onClick={() => saveLater(it)}>{L("saveForLater")}</button>
                        <button onClick={() => remove(it)}>{L("remove")}</button>
                      </span>
                    </div>
                  </div>
                  <div className="cv2-line">₹{(it.price * it.qty).toLocaleString("en-IN")}</div>
                </div>
              ))}
            </div>

            {suggest.length > 0 && (
              <div className="cv2-suggest">
                <div className="cv2-suggest-h">{L("cartCompletePurchase")}</div>
                <div className="cv2-suggest-rows">
                  {suggest.map((it) => (
                    <div key={it.sku} className="cv2-srow">
                      <Tile item={it} size={52} showInfo={false} />
                      <span className="cv2-st">{it.title}</span>
                      <span className="cv2-sp">₹{it.price.toLocaleString("en-IN")}</span>
                      <Button size="sm" variant="secondary" onClick={() => onAdd(it, "cart_suggest")}>{L("addToCartShort")}</Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="cv2-foot">
              <div className="cv2-sumrows">
                <div><span>{L("subtotal")}</span><span>₹{total.toLocaleString("en-IN")}</span></div>
                <div><span>{L("delivery")}</span><span>{L("freeDemo")}</span></div>
                <div><span>{L("cartTaxes")}</span><span>{L("cartTaxesIncl")}</span></div>
              </div>
              <div className="cv2-total"><span>{L("total")}</span><b>₹{total.toLocaleString("en-IN")}</b></div>
              <Button size="lg" className="cv2-checkout" onClick={() => onCheckout(total)}>
                {L("checkout")} · ₹{total.toLocaleString("en-IN")}
              </Button>
              <button className="cv2-continue" onClick={onClose}>{L("continueShopping")}</button>
              <div className="cv2-simlock"><I name="shield-check" size={14} /> {L("cartSimNote")}</div>
            </div>
          </>
        )}
      </div>
    </Overlay>
  );
}
