"use client";
// 1-tap thumbs on each assistant reply; 👎 expands the 5 root-cause reasons
// (same labels as the mined taxonomy + the page micro-survey).
import { useState } from "react";

const REASONS = ["wrong_product", "too_expensive", "no_trust", "wrong_occasion", "other"];
const LABELS = { wrong_product: "Wrong kind of product", too_expensive: "Too expensive", no_trust: "Didn't trust these results", wrong_occasion: "Not right for the occasion", other: "Something else" };

export function Feedback({ m, latest, disabled, onFeedback }) {
  const [reasons, setReasons] = useState(false);
  if (!latest || disabled || m.act === "deflect") return null;
  return (
    <div className="cht-fb-row">
      <button className="cht-fb" aria-label="Helpful" onClick={() => onFeedback(m, "up")}>👍</button>
      <button className="cht-fb" aria-label="Not helpful" onClick={() => { if (!reasons) setReasons(true); else onFeedback(m, "down", null); }}>👎</button>
      {reasons && (
        <div className="cht-fb-reasons">
          {REASONS.map((r) => (
            <button key={r} className="cht-chip" style={{ padding: "4px 9px", fontSize: 12 }}
                    onClick={() => onFeedback(m, "down", r)}>{LABELS[r]}</button>
          ))}
        </div>
      )}
    </div>
  );
}
