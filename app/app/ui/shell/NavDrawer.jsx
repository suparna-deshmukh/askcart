"use client";
// Mobile hamburger drawer (≤767px): greeting+language · search ·
// accordions (categories / occasions / budget) · shortcuts · prototype tools.
import { useState } from "react";
import { Overlay } from "../kit/Overlay";
import { I } from "../kit/Icon";
import { displayCat } from "../../lib/categories";

const OCCS = [["Gifts", "gift under 2k"], ["Shaadi", "shaadi gift under 2k"], ["Diwali", "diwali decorations"], ["Birthday", "birthday gift under 1k"], ["Anniversary", "anniversary gift"]];
const BUDGETS = [["Under ₹500", "gift under 500"], ["Under ₹1,000", "under 1000"], ["Under ₹2,000", "gift under 2k"], ["Under ₹5,000", "gift under 5k"]];

function Acc({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="nd-acc">
      <button className="nd-acc-h" onClick={() => setOpen(!open)} aria-expanded={open}>
        {title} <I name={open ? "chevron-up" : "chevron-down"} size={16} />
      </button>
      {open && <div className="nd-acc-b">{children}</div>}
    </div>
  );
}

export function NavDrawer({ open, onClose, lang, setLang, facets, onQuery, onTab, onMenuSearch }) {
  if (!open) return null;
  const cats = (facets?.categories || []).slice(0, 12);
  return (
    <Overlay variant="left" label="Menu" onClose={onClose} width={360}>
      <div className="nd">
        <div className="nd-head">
          <div className="nd-hello">Hello, <b>guest</b></div>
          <button className="iconbtn sm" aria-label="Close menu" onClick={onClose}><I name="x" size={20} /></button>
        </div>
        <div className="nd-lang">
          {[["en", "English"], ["hi", "हिंदी"], ["hinglish", "Hinglish"]].map(([l, lb]) => (
            <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>{lb}</button>
          ))}
        </div>
        <button className="nd-search" onClick={() => { onClose(); onMenuSearch(); }}>
          <I name="search" size={17} /> Search products…
        </button>
        <Acc title="Categories" defaultOpen>
          {cats.map((c) => (
            <button key={c.name} onClick={() => { onQuery(c.name, "nav"); onClose(); }}>
              {displayCat(c.name)} <span className="nd-count">{c.count.toLocaleString("en-IN")}</span>
            </button>
          ))}
        </Acc>
        <Acc title="Occasions">
          {OCCS.map(([l, q]) => <button key={l} onClick={() => { onQuery(q, "nav"); onClose(); }}>{l}</button>)}
        </Acc>
        <Acc title="Budget">
          {BUDGETS.map(([l, q]) => <button key={l} onClick={() => { onQuery(q, "nav"); onClose(); }}>{l}</button>)}
        </Acc>
        <div className="nd-links">
          <button onClick={() => { onTab("orders"); onClose(); }}><I name="package" size={17} /> Orders</button>
          <button onClick={() => { onTab("wishlist"); onClose(); }}><I name="heart" size={17} /> Wishlist</button>
          <button onClick={() => { onClose(); window.location.href = "/?onboard=1"; }}><I name="user" size={17} /> Restart onboarding</button>
          <div className="nd-tools">Prototype tools</div>
          <button onClick={() => { onTab("analytics"); onClose(); }}><I name="bar-chart" size={17} /> Analytics / Insights</button>
        </div>
      </div>
    </Overlay>
  );
}
