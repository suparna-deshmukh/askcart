"use client";
// 1-tap thumbs on each assistant reply; 👎 expands the 5 root-cause reasons
// (same labels as the mined taxonomy + the page micro-survey).
import { useState } from "react";
import { t } from "../../lib/i18n";

const REASONS = ["wrong_product", "too_expensive", "no_trust", "wrong_occasion", "other"];
const LABELS = { wrong_product: "chtRWrong", too_expensive: "chtRExp", no_trust: "chtRTrust", wrong_occasion: "chtROcc", other: "chtROther" };

export function Feedback({ lang, m, latest, disabled, onFeedback }) {
  const [reasons, setReasons] = useState(false);
  if (!latest || disabled || m.act === "deflect") return null;
  return (
    <div className="cht-fb-row">
      <button className="cht-fb" aria-label={t(lang, "chtHelpful")} onClick={() => onFeedback(m, "up")}>👍</button>
      <button className="cht-fb" aria-label={t(lang, "chtNotHelpful")} onClick={() => { if (!reasons) setReasons(true); else onFeedback(m, "down", null); }}>👎</button>
      {reasons && (
        <div className="cht-fb-reasons">
          {REASONS.map((r) => (
            <button key={r} className="cht-chip" style={{ padding: "4px 9px", fontSize: 12 }}
                    onClick={() => onFeedback(m, "down", r)}>{t(lang, LABELS[r])}</button>
          ))}
        </div>
      )}
    </div>
  );
}
