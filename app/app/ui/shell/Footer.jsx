"use client";
// Dark footer band (replaces the light 3-line footer).
import { I } from "../kit/Icon";

export function Footer({ catalogSize, onQuery, onInsights }) {
  return (
    <footer className="foot2">
      <div className="foot2-in">
        <div className="foot2-grid">
          <div className="foot2-brandcol">
            <div className="foot2-logo"><span className="foot2-mark">A</span>AskCart</div>
            <p>Guided shopping search for India. Describe it your way; we ask one smart question.</p>
          </div>
          <div className="foot2-col">
            <div className="foot2-h">Shop</div>
            {["Fashion", "Electronics", "Home & Kitchen", "Beauty", "Watches", "Toys"].map((c) => (
              <button key={c} onClick={() => onQuery(c, "footer")}>{c}</button>
            ))}
          </div>
          <div className="foot2-col">
            <div className="foot2-h">Occasions</div>
            {["Gifts", "Shaadi", "Diwali", "Birthday", "Anniversary"].map((o) => (
              <button key={o} onClick={() => onQuery(o.toLowerCase() + " gift under 2k", "footer")}>{o}</button>
            ))}
          </div>
          <div className="foot2-col">
            <div className="foot2-h">About</div>
            <button onClick={() => onQuery("gift under 2k", "footer")}>How guided search works</button>
            <a href="https://github.com" onClick={(e) => e.preventDefault()} title="See PROJECT.md in the repo">Method and evidence</a>
            <button onClick={() => onInsights()}>Insights</button>
          </div>
        </div>
        <div className="foot2-trust">
          <span><I name="chat" size={16} /> Asks only what it needs</span>
          <span><I name="globe" size={16} /> Hindi · Hinglish · English</span>
          <span><I name="badge-check" size={16} /> Honest demo prices and ratings</span>
          <span><I name="lock" size={16} /> Simulated checkout, nothing charged</span>
        </div>
        <div className="foot2-legal">
          Demo catalogue: {Number(catalogSize || 0).toLocaleString("en-IN")} SKUs (≈25k US-sourced listings converted to INR + ≈29k India layer) with indicative prices and ratings — not a live marketplace. Checkout is simulated: no payments, addresses or real delivery. · Every interaction event is public in Analytics · © 2026
        </div>
      </div>
    </footer>
  );
}
