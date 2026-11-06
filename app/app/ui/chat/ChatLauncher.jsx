"use client";
// Floating assistant launcher (60px gradient FAB, brief §13) + one-time-per-
// session nudge. Never auto-opens; the nudge appears once per session after
// the first search that resolved, and can be dismissed (session).
import { useEffect, useState } from "react";
import { I } from "../kit/Icon";
import { t } from "../../lib/i18n";

export function ChatLauncher({ onOpen, nudge, onNudgeOpen, onNudgeDismiss, label, lang }) {
  const [nudgeSeen, setNudgeSeen] = useState(() => {
    try { return sessionStorage.getItem("askcart_chat_nudge") === "1"; } catch { return true; }
  });
  const [pulsed, setPulsed] = useState(() => {
    try { return sessionStorage.getItem("askcart_fab_pulsed") === "1"; } catch { return true; }
  });
  const showNudge = nudge && !nudgeSeen;
  useEffect(() => {
    if (!pulsed) return;
    const t = setTimeout(() => {
      setPulsed(true);
      try { sessionStorage.setItem("askcart_fab_pulsed", "1"); } catch {}
    }, 1300);
    return () => clearTimeout(t);
  }, [pulsed]);
  function dismiss() {
    try { sessionStorage.setItem("askcart_chat_nudge", "1"); } catch {}
    setNudgeSeen(true);
    onNudgeDismiss && onNudgeDismiss();
  }
  return (
    <>
      {showNudge && (
        <div className="cht-nudge" role="status">
          <span>{t(lang, "chtNudge")}</span>
          <button onClick={dismiss} aria-label="Dismiss"><I name="x" size={14} /></button>
        </div>
      )}
      {label && (
        <span className="cht-fab-label" aria-hidden="true"><I name="sparkle" size={12} /> {label}</span>
      )}
      <button
        className={"cht-fab" + (pulsed ? "" : " pulse")}
        onClick={() => { if (showNudge) { try { sessionStorage.setItem("askcart_chat_nudge", "1"); } catch {} setNudgeSeen(true); } onNudgeOpen && onNudgeOpen(); onOpen(); }}
        aria-label={t(lang, "chtFabOpen")}
      >
        <I name="sparkle" size={24} />
      </button>
    </>
  );
}
