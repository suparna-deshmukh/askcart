"use client";

// Previous orders (2026-11-06, user work order). Prototype scale: orders are
// persisted per browser (localStorage askcart_orders_v1), created by the
// simulated checkout, plus two clearly-labelled demo orders so the section
// has content on a fresh visit. No backend user accounts exist in the demo.
function fmtDate(ts) {
  try {
    return new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch { return ""; }
}

export function OrdersView({ orders }) {
  if (!orders || orders.length === 0) {
    return (
      <div className="orders-empty">
        <h2>Previous orders</h2>
        <p className="dim">No orders yet - checkout is simulated in this prototype. Place your first (demo) order from the Search tab.</p>
      </div>
    );
  }
  return (
    <div className="orders-wrap">
      <div className="orders-head">
        <h2>Previous orders</h2>
        <span className="orders-note">Simulated checkout - no real payment, address or delivery</span>
      </div>
      <div className="orders-list">
        {orders.map((o) => (
          <div className="order-card" key={o.id}>
            <div className="order-top">
              <span className="order-id">{o.id}</span>
              {o.demo && <span className="order-demo">Demo</span>}
              <span className="order-date">{fmtDate(o.at)}</span>
              <span className="order-status">Simulated delivery</span>
            </div>
            <div className="order-items">
              {(o.items || []).map((it, i) => (
                <div className="order-item" key={i}>
                  <span className="oi-t">{it.title}{it.brand ? ` · ${it.brand}` : ""}</span>
                  <span className="oi-p">₹{(it.price * it.qty).toLocaleString("en-IN")}{it.qty > 1 ? ` (×${it.qty})` : ""}</span>
                </div>
              ))}
            </div>
            <div className="order-total"><span>Total</span><b>₹{Number(o.total).toLocaleString("en-IN")}</b></div>
          </div>
        ))}
      </div>
    </div>
  );
}
