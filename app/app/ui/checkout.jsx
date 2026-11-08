"use client";
// Phase 6 (brief §10): stepped simulated checkout + confirmation page.
// No real payment inputs are collected: UPI/Card are simulated choices only.
// Address persists device-local (askcart_address_v1); orders extend
// askcart_orders_v1 with optional address/eta/status fields (old orders render).
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./kit/Button";
import { Input, Select } from "./kit/Input";
import { Chip } from "./kit/Chip";
import { Tile } from "./kit/Tile";
import { I } from "./kit/Icon";
import { displayCat } from "../lib/categories";
import { track } from "../lib/track";
import { t } from "../lib/i18n";

const STATES = ["Andhra Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
  "Maharashtra", "Punjab", "Rajasthan", "Tamil Nadu", "Telangana", "Uttar Pradesh",
  "Uttarakhand", "West Bengal", "Other"];

const fmtDay = (d) => {
  try { return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }); } catch { return ""; }
};
function etaRange(now = Date.now()) {
  return { from: fmtDay(new Date(now + 2 * 86400000)), to: fmtDay(new Date(now + 4 * 86400000)) };
}

const EMPTY_ADDR = { name: "", mobile: "", pin: "", street: "", landmark: "", city: "", state: "", type: "home" };

export function CheckoutView({ lang, cart, buyNow = null, pin, region, profileName = "", onBack, onEditCart, onPlaced }) {
  const L = (k) => t(lang, k);
  // S6: Buy Now checks out exactly one item; the cart list is not the order.
  const items = buyNow ? [{ ...buyNow, qty: 1 }] : Object.entries(cart).map(([sku, e]) => ({ sku, ...e.item, qty: e.qty }));
  const total = items.reduce((a, it) => a + it.price * it.qty, 0);
  const count = items.reduce((a, it) => a + it.qty, 0);

  // S7: name auto-fills from the local profile (askcart_profile_v1); every
  // field is optional and nothing blocks progress — format hints are soft.
  const [addr, setAddr] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem("askcart_address_v1") || "null");
      if (v && typeof v === "object") {
        const merged = { ...EMPTY_ADDR, ...v };
        if (!merged.name && profileName) merged.name = profileName;
        return merged;
      }
    } catch {}
    return { ...EMPTY_ADDR, pin: pin || "", name: profileName || "" };
  });
  const [step, setStep] = useState(1);
  const [done, setDone] = useState({ 1: false, 2: false });
  const [payment, setPayment] = useState("cod");
  const [placing, setPlacing] = useState(false);
  const [sumOpen, setSumOpen] = useState(false);
  const seenView = useRef({});
  const steps = ["coAddress", "coPayment", "coReview"];

  useEffect(() => {
    if (!seenView.current[step]) {
      seenView.current[step] = true;
      track("checkout_step_view", { step, step_name: steps[step - 1], item_count: count, total });
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const setF = (k, v) => { setAddr((a) => ({ ...a, [k]: v })); };

  function completeStep(n) {
    setDone((d) => ({ ...d, [n]: true }));
    setStep(n + 1);
    track("checkout_step_complete", { step: n, step_name: steps[n - 1] });
  }
  function saveAddress() {
    try { localStorage.setItem("askcart_address_v1", JSON.stringify(addr)); } catch {}
    completeStep(1);
  }
  function place() {
    if (placing) return;
    setPlacing(true);
    const eta = etaRange();
    setTimeout(() => {
      onPlaced({
        addr: { ...addr, region },
        eta: { ...eta, fromTs: Date.now() + 2 * 86400000, toTs: Date.now() + 4 * 86400000 },
        payment,
        items, total, count,
      });
    }, 900);
  }
  // S7: persistent shortcut on every step — places the order with whatever is filled.
  function placeNow() {
    if (placing) return;
    track("demo_order_shortcut", { from_step: step, payment });
    place();
  }

  const addrLine = addr.city ? `${addr.city}${addr.state ? ", " + addr.state : ""}` : "";
  const addrParts = [addr.name, addr.mobile && `+91 ${addr.mobile}`, [addr.street, addr.landmark].filter(Boolean).join(", "), addrLine].filter(Boolean);
  const addrSummary = addrParts.length ? addrParts.join(" · ") : L("notProvided");
  const payLabel = { upi: "coPaymentUpi", card: "coPaymentCard", cod: "coPaymentCod" }[payment];

  return (
    <div className="wrap co">
      <button className="co-back" onClick={onBack}><I name="arrow-left" size={16} /> {buyNow ? L("back") : L("coBackToCart")}</button>

      <div className="co-stepper" aria-label="Checkout steps">
        {steps.map((k, i) => {
          const n = i + 1;
          const state = done[n] ? "done" : n === step ? "cur" : "todo";
          return (
            <div key={k} className={"co-step " + state}>
              <span className="co-step-n">{done[n] ? <I name="check" size={14} /> : n}</span>
              <span className="co-step-l">{L(k)}</span>
              {n < steps.length && <span className="co-step-line" aria-hidden="true" />}
            </div>
          );
        })}
      </div>

      <div className="co-grid">
        <div className="co-main">
          {step === 1 && (
            <section className="co-card" aria-label={L("coAddress")}>
              <h2>{L("coAddress")}</h2>
              <p className="co-optional">{L("coOptional")}</p>
              <div className="co-addrtypes">
                <Chip variant={addr.type === "home" ? "selected" : "default"} onClick={() => setF("type", "home")}>{L("coHome")}</Chip>
                <Chip variant={addr.type === "work" ? "selected" : "default"} onClick={() => setF("type", "work")}>{L("coWork")}</Chip>
              </div>
              <div className="co-fields">
                <Input label={L("coFullName") + " (opt.)"} data-field="name" value={addr.name}
                       autoComplete="name" onChange={(e) => setF("name", e.target.value)} />
                <div className="co-mobile">
                  <Input label={L("coMobile") + " (opt.)"} data-field="mobile" value={addr.mobile} placeholder="98765 43210"
                         inputMode="numeric" autoComplete="tel-national"
                         onChange={(e) => setF("mobile", e.target.value.replace(/[^\d]/g, "").slice(0, 10))}
                         prefix="+91" hint="10 digits" />
                </div>
                <div className="co-pinline">
                  <Input label={L("coPin") + " (opt.)"} data-field="pin" value={addr.pin} placeholder="110001" inputMode="numeric"
                         autoComplete="postal-code" hint="6 digits"
                         onChange={(e) => setF("pin", e.target.value.replace(/[^\d]/g, "").slice(0, 6))} />
                  <div className="co-pinregion">{addr.pin && addr.pin.length === 6 && region ? L("pdpDelivRegion").replace("{region}", region) : (L("pdpDelivNoPin"))}</div>
                </div>
                <Input label={L("coStreet") + " (opt.)"} data-field="street" value={addr.street} autoComplete="address-line1"
                       onChange={(e) => setF("street", e.target.value)} />
                <Input label={L("coLandmark") + " (opt.)"} value={addr.landmark} autoComplete="address-line2"
                       onChange={(e) => setF("landmark", e.target.value)} />
                <div className="co-2col">
                  <Input label={L("coCity") + " (opt.)"} data-field="city" value={addr.city} autoComplete="address-level2"
                         onChange={(e) => setF("city", e.target.value)} />
                  <Select label={L("coState") + " (opt.)"} data-field="state" value={addr.state}
                          onChange={(e) => setF("state", e.target.value)}
                          options={["", ...STATES]} placeholder={L("coStatePh")} />
                </div>
              </div>
              <div className="co-cardfoot">
                <Button size="lg" data-step="address" onClick={saveAddress}>{L("deliverHere")}</Button>
                <button className="co-shortcut" onClick={placeNow}>{L("placeDemoNow")}</button>
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="co-card" aria-label={L("coPayment")}>
              <h2>{L("coPayment")}</h2>
              {(["cod", "upi", "card"]).map((m) => (
                <label key={m} className={"co-radio" + (payment === m ? " on" : "")} onClick={() => setPayment(m)}>
                  <span className="co-radio-ic"><I name={m === "upi" ? "smartphone" : m === "card" ? "credit-card" : "wallet"} size={18} /></span>
                  <span className="co-radio-t"><b>{L({ upi: "coPaymentUpi", card: "coPaymentCard", cod: "coPaymentCod" }[m])}</b></span>
                  <span className="co-radio-mark">{payment === m && <I name="check-circle" size={18} />}</span>
                </label>
              ))}
              <div className="co-simnote"><I name="info" size={14} /> {L("simNote")}</div>
              <div className="co-cardfoot">
                <Button variant="ghost" onClick={() => setStep(1)}>{L("coEdit")}</Button>
                <Button size="lg" data-step="payment" onClick={() => completeStep(2)}>{L("coContinue")}</Button>
                <button className="co-shortcut" onClick={placeNow}>{L("placeDemoNow")}</button>
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="co-card" aria-label={L("coReview")}>
              <h2>{L("coReview")}</h2>
              <div className="co-review">
                <div className="co-rv">
                  <div className="co-rv-h"><span>{L("coAddress")}</span><button onClick={() => setStep(1)}>{L("coEdit")}</button></div>
                  <div className="co-rv-b">{addrSummary}</div>
                </div>
                <div className="co-rv">
                  <div className="co-rv-h"><span>{L("coDelivery")}</span></div>
                  <div className="co-rv-b">{L("coStandard")} · {etaRange().from} – {etaRange().to} · {L("freeDemo")}</div>
                </div>
                <div className="co-rv">
                  <div className="co-rv-h"><span>{L("coPayment")}</span><button onClick={() => setStep(2)}>{L("coEdit")}</button></div>
                  <div className="co-rv-b">{L(payLabel)}</div>
                </div>
                <div className="co-rv">
                  <div className="co-rv-h"><span>{L("coReviewItems")} ({count})</span></div>
                  <div className="co-rv-items">
                    {items.map((it) => (
                      <div key={it.sku} className="co-rv-it">
                        <Tile item={it} size={40} />
                        <span className="co-rv-t">{it.title}</span>
                        <span className="co-rv-q">×{it.qty}</span>
                        <span className="co-rv-p">₹{(it.price * it.qty).toLocaleString("en-IN")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="co-cardfoot">
                <Button size="lg" data-step="place" loading={placing} onClick={place}>{placing ? L("coPlacing") : L("placeOrder")}</Button>
                <button className="co-shortcut" onClick={placeNow}>{L("placeDemoNow")}</button>
              </div>
            </section>
          )}
        </div>

        <aside className="co-sum" aria-label={L("coOrderSummary")}>
          <button className="co-sum-toggle" onClick={() => setSumOpen(!sumOpen)}>
            {L("coOrderSummary")} · ₹{total.toLocaleString("en-IN")} <I name={sumOpen ? "chevron-up" : "chevron-down"} size={14} />
          </button>
          <div className={"co-sum-body" + (sumOpen ? " open" : "")}>
            {items.map((it) => (
              <div key={it.sku} className="co-sum-it">
                <Tile item={it} size={48} />
                <span className="co-sum-t">{it.title} <em>×{it.qty}</em></span>
                <span className="co-sum-p">₹{(it.price * it.qty).toLocaleString("en-IN")}</span>
              </div>
            ))}
            <div className="co-sum-rows">
              <div><span>{L("subtotal")}</span><span>₹{total.toLocaleString("en-IN")}</span></div>
              <div><span>{L("delivery")}</span><span className="co-free">{L("freeDemo")}</span></div>
              <div><span>{L("cartTaxes")}</span><span>{L("cartTaxesIncl")}</span></div>
            </div>
            <div className="co-sum-total"><span>{L("total")}</span><b>₹{total.toLocaleString("en-IN")}</b></div>
            {!buyNow && <button className="co-sum-edit" onClick={onEditCart}>{L("coEditCart")}</button>}
            <div className="co-simlock"><I name="shield-check" size={14} /> {L("cartSimNote")}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}

const CONFETTI = Array.from({ length: 24 }, (_, i) => ({
  left: (i * 41) % 100,
  delay: (i % 8) * 0.06,
  dur: 0.9 + ((i * 7) % 5) * 0.12,
  color: ["var(--brand)", "var(--guide)", "var(--success)", "var(--brand-100)"][i % 4],
  rot: ((i * 47) % 360),
}));

export function ConfirmationView({ lang, order, onTrack, onContinue, onAsk }) {
  const L = (k) => t(lang, k);
  useEffect(() => {
    if (order) track("order_confirm_view", { order_id: order.id, item_count: order.count, total: order.total });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!order) return null;
  const eta = order.eta || etaRange();
  const shipTo = order.addr ? `${order.addr.city || ""}${order.addr.state ? ", " + order.addr.state : ""}` : "";
  const shipToLine = shipTo || L("notProvided");
  return (
    <div className="wrap cf">
      <div className="cf-confetti" aria-hidden="true">
        {CONFETTI.map((c, i) => <span key={i} style={{ left: c.left + "%", background: c.color, animationDelay: c.delay + "s", animationDuration: c.dur + "s", transform: "rotate(" + c.rot + "deg)" }} />)}
      </div>
      <div className="cf-check" aria-hidden="true">
        <svg viewBox="0 0 64 64" width="64" height="64">
          <circle className="cf-circ" cx="32" cy="32" r="29" fill="none" strokeWidth="3" stroke="var(--success)" />
          <path className="cf-tick" d="M20 33 L28.5 41.5 L45 23" fill="none" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" stroke="var(--success)" />
        </svg>
      </div>
      <h1 className="cf-title">{L("orderPlaced")}</h1>
      <p className="cf-sub">{order.id} · {L("confirmSub")}</p>

      <div className="cf-tracker" aria-label={L("confirmTracker")}>
        {["confirmT1", "confirmT2", "confirmT3", "confirmT4"].map((k, i) => (
          <div key={k} className={"cf-t" + (i === 0 ? " done" : "")}>
            <span className="cf-t-dot">{i === 0 ? <I name="check" size={12} /> : <I name={i === 1 ? "package" : i === 2 ? "truck" : "map-pin"} size={12} />}</span>
            <span className="cf-t-l">{L(k)}</span>
          </div>
        ))}
        <span className="cf-tracker-note">{L("confirmSimulated")}</span>
      </div>

      <div className="cf-cards">
        <div className="cf-card">
          <div className="cf-card-h"><I name="truck" size={15} /> {L("confirmEta")}</div>
          <div className="cf-card-b">{eta.from} – {eta.to}</div>
          <div className="cf-card-c"><I name="map-pin" size={13} /> {shipToLine}</div>
        </div>
        <div className="cf-card">
          <div className="cf-card-h">{L("coReviewItems")} ({order.count})</div>
          {(order.items || []).map((it, i) => (
            <div key={i} className="cf-it">
              <Tile item={it} size={56} />
              <span className="cf-it-t">{it.title}</span>
              <span className="cf-it-p">₹{(it.price * it.qty).toLocaleString("en-IN")}</span>
            </div>
          ))}
          <div className="cf-total"><span>{L("total")}</span><b>₹{Number(order.total).toLocaleString("en-IN")}</b></div>
        </div>
      </div>

      <div className="cf-cta">
        <Button size="lg" onClick={onTrack}>{L("trackOrder")}</Button>
        <Button size="lg" variant="secondary" onClick={onContinue}>{L("continueShopping")}</Button>
      </div>
      {onAsk && (
        <div className="cf-ask"><button className="cf-askchip" onClick={onAsk}><I name="sparkle" size={13} /> {L("askDelivery")}</button></div>
      )}
    </div>
  );
}
