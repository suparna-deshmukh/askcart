"use client";
// Phase 6 (brief §11.1): orders v2 — filter pills, order cards with status
// badges, client-side simulated status progression (Confirmed -> Packed 20s
// -> Shipped 60s), Buy again / View item, mini tracker. Seeded demo orders
// (no sku) keep the Demo tag and show no reorder actions.
import { useEffect, useState } from "react";
import { Tile } from "./kit/Tile";
import { Badge } from "./kit/Badge";
import { Button } from "./kit/Button";
import { I } from "./kit/Icon";
import { useToast } from "./kit/Toaster";
import { track } from "../lib/track";
import { t } from "../lib/i18n";

function fmtDate(ts) {
  try { return new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); } catch { return ""; }
}

// Simulated progression for real (simulated-checkout) orders.
function orderStatus(o, now) {
  if (o.demo) return "delivered";
  if (!o.at) return "shipped";
  const el = (now - o.at) / 1000;
  if (el < 20) return "confirmed";
  if (el < 60) return "packed";
  return "shipped";
}
const STEPS = { confirmed: 1, packed: 2, shipped: 3, delivered: 4 };

export function OrdersView({ lang, orders, onBuyAgain, onView, onHome }) {
  const L = (k) => t(lang, k);
  const [filter, setFilter] = useState("all");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!orders.some((o) => !o.demo && o.at)) return;
    const iv = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(iv);
  }, [orders]);

  const rows = (orders || []).map((o) => ({ ...o, _status: orderStatus(o, now) }));
  const inProgress = rows.filter((o) => o._status !== "delivered").length;
  const delivered = rows.length - inProgress;
  const shown = filter === "all" ? rows : rows.filter((o) => filter === "inprogress" ? o._status !== "delivered" : o._status === "delivered");
  const pills = [["all", L("ordersAll"), rows.length], ["inprogress", L("ordersInProgress"), inProgress], ["delivered", L("ordersDelivered"), delivered]];

  if (!rows.length) {
    return (
      <div className="wrap">
        <div className="orders2-empty">
          <span className="o2e-ic" aria-hidden="true"><I name="package" size={44} /></span>
          <h3 className="o2e-h">{L("ordersEmpty")}</h3>
          <p>{L("ordersEmptySub")}</p>
          <Button variant="secondary" onClick={onHome}>{L("continueShopping")}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap orders2">
      <div className="o2-head">
        <h1>{L("ordersTitle")}</h1>
        <span className="o2-sub">{L("ordersSub")}</span>
      </div>
      <div className="o2-pills" role="tablist" aria-label={L("ordersTitle")}>
        {pills.map(([id, label, n]) => (
          <button key={id} role="tab" aria-selected={filter === id}
                  className={"o2-pill" + (filter === id ? " on" : "")} onClick={() => setFilter(id)}>
            {label} <em>{n}</em>
          </button>
        ))}
      </div>
      <div className="o2-list">
        {shown.map((o) => {
          const st = o._status;
          const stStep = STEPS[st];
          const shipTo = o.address ? `${o.address.city || ""}${o.address.state ? ", " + o.address.state : ""}` : "";
          return (
            <div className="o2-card" key={o.id}>
              <div className="o2-top">
                <div className="o2-meta">
                  <div><span className="o2-l">{L("orderPlacedAt")}</span><span className="o2-v">{fmtDate(o.at)}</span></div>
                  <div><span className="o2-l">{L("total")}</span><span className="o2-v">₹{Number(o.total).toLocaleString("en-IN")}</span></div>
                  {shipTo && <div><span className="o2-l">{L("shipTo")}</span><span className="o2-v">{shipTo}</span></div>}
                  <div><span className="o2-l">{L("orderNo")}</span><span className="o2-v mono">{o.id}</span></div>
                </div>
                <div className="o2-badges">
                  {o.demo && <Badge variant="info">Demo</Badge>}
                  <Badge variant={st === "delivered" ? "success" : "close"}>
                    {st === "delivered" ? L("statusDelivered") : st === "confirmed" ? L("statusConfirmed") : st === "packed" ? L("statusPacked") : L("statusShipped")}
                  </Badge>
                </div>
              </div>
              <div className="o2-items">
                {(o.items || []).map((it, i) => (
                  <div className="o2-item" key={i}>
                    {it.sku && it.category ? <Tile item={it} size={56} showInfo={false} /> : <span className="o2-noimg" aria-hidden="true"><I name="package" size={20} /></span>}
                    <span className="o2-it-t">
                      {it.sku && onView ? (
                        <button className="o2-viewlink" onClick={() => onView(it.sku)}>{it.title}</button>
                      ) : it.title}
                      {it.brand ? <em> · {it.brand}</em> : null}
                    </span>
                    <span className="o2-it-q">×{it.qty}</span>
                    <span className="o2-it-p">₹{(it.price * it.qty).toLocaleString("en-IN")}</span>
                    {it.sku && onBuyAgain && (
                      <Button size="sm" variant="secondary" onClick={() => { track("reorder_click", { sku: it.sku, order_id: o.id }); onBuyAgain(it, o); }}>
                        {L("buyAgain")}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <div className="o2-track">
                {["confirmT1", "confirmT2", "confirmT3", "confirmT4"].map((k, i) => (
                  <span key={k} className={"o2-t" + (i + 1 <= stStep ? " done" : "")}>
                    <i aria-hidden="true" />{L(k)}
                  </span>
                ))}
                <span className="o2-sim">{L("confirmSimulated")}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
