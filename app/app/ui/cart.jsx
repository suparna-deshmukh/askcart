"use client";
import { track } from "../lib/track";

const DISPLAY_CATEGORY = {
  "AMAZON FASHION": "Fashion",
  "Amazon Home": "Home & Kitchen",
  "All Electronics": "Electronics",
  "All Beauty": "Beauty",
};
function displayCat(c) { return DISPLAY_CATEGORY[c] || c; }

export function CartDrawer({ open, onClose, cart, setCart, onCheckout }) {
  if (!open) return null;
  const items = Object.entries(cart); // sku -> {item, qty}
  const total = items.reduce((a, [, e]) => a + e.item.price * e.qty, 0);
  function setQty(sku, d) {
    const e = cart[sku];
    if (!e) return;
    const q = e.qty + d;
    const next = { ...cart };
    if (q <= 0) {
      delete next[sku];
      track("remove_from_cart", { sku, cart_size: Object.keys(next).length, price: e.item.price });
    } else {
      next[sku] = { ...e, qty: q };
    }
    setCart(next);
  }
  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h3>Your cart {items.length > 0 && <span className="drawer-count">{items.reduce((a, [, e]) => a + e.qty, 0)}</span>}</h3>
          <button className="x" onClick={onClose}>×</button>
        </div>
        {items.length === 0 ? (
          <div className="cart-empty">Your cart is empty.<br />Find something you love on the Search tab.</div>
        ) : (
          <>
            <div className="cart-rows">
              {items.map(([sku, e]) => (
                <div className="cart-row" key={sku}>
                  <div className="cr-t">{e.item.title}</div>
                  <div className="cr-c">{displayCat(e.item.category)}{e.item.brand ? ` · ${e.item.brand}` : ""}</div>
                  <div className="cr-p">₹{e.item.price.toLocaleString("en-IN")} × {e.qty}</div>
                  <div className="qty">
                    <button onClick={() => setQty(sku, -1)}>−</button>
                    <span>{e.qty}</span>
                    <button onClick={() => setQty(sku, 1)}>+</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="drawer-foot">
              <div className="total"><span>Total</span><b>₹{total.toLocaleString("en-IN")}</b></div>
              <button className="primary" onClick={() => { track("checkout_start", { item_count: items.length, total }); onCheckout(total); }}>
                Place order →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function CheckoutModal({ open, onClose, cart, onPlaced }) {
  if (!open) return null;
  const items = Object.entries(cart);
  const total = items.reduce((a, [, e]) => a + e.item.price * e.qty, 0);
  return (
    <div className="overlay mid" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h3>Checkout</h3>
          <button className="x" onClick={onClose}>×</button>
        </div>
        <div className="cart-rows">
          {items.map(([sku, e]) => (
            <div className="cart-row" key={sku}>
              <div className="cr-t">{e.item.title}</div>
              <div className="cr-p">₹{(e.item.price * e.qty).toLocaleString("en-IN")}</div>
            </div>
          ))}
        </div>
        <div className="modal-note">Prototype checkout — no real payment is processed. Addresses & payments land in phase 2.</div>
        <div className="drawer-foot">
          <div className="total"><span>Total</span><b>₹{total.toLocaleString("en-IN")}</b></div>
          <button className="primary" onClick={() => {
            track("order_complete", {
              order_id: "ord_" + Math.random().toString(36).slice(2, 8),
              item_count: items.length, total, source: "cart",
              items: items.map(([sku, e]) => ({ sku, price: e.item.price * e.qty })),
            });
            onPlaced(total);
          }}>
            Place prototype order
          </button>
        </div>
      </div>
    </div>
  );
}

export function OrderToast({ order, onClose }) {
  if (!order) return null;
  return (
    <div className="toast">
      <div className="toast-t">Order placed ✓</div>
      <div className="toast-c">{order.id} · {order.count} item{order.count > 1 ? "s" : ""} · ₹{order.total.toLocaleString("en-IN")}</div>
      <button className="x" onClick={onClose}>×</button>
    </div>
  );
}
