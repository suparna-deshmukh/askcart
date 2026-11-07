"use client";
// 5A/L1: extended pill launcher — spark + "Ask AskCart" + "Search, compare,
// buy" extending left of a 64px FAB. One-time pulse ring, then a gentle
// 20 s shimmer (reduced-motion respected). Collapses to a bare FAB while the
// panel is open (desktop); hidden on mobile (the tab bar carries Ask).
import { useEffect, useState } from "react";
import { I } from "../kit/Icon";
import { t } from "../../lib/i18n";

export function ChatLauncher({ onOpen, nudge, onNudgeDismiss, unread, chatOpen, label, lang }) {
  const [nudgeSeen, setNudgeSeen] = useState(() => {
    try { return sessionStorage.getItem("askcart_chat_nudge") === "1"; } catch { return true; }
  });
  const [pulsed, setPulsed] = useState(() => {
    try { return sessionStorage.getItem("askcart_fab_pulsed") === "1"; } catch { return true; }
  });
  const [shimmer, setShimmer] = useState(false);
  const [mobile, setMobile] = useState(false);
  const showNudge = nudge && !nudgeSeen;
  const reduced = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    if (!reduced) {
      const iv = setInterval(() => { setShimmer(true); setTimeout(() => setShimmer(false), 3000); }, 20000);
      return () => clearInterval(iv);
    }
  }, [reduced]);
  useEffect(() => {
    if (pulsed) return;
    const t2 = setTimeout(() => {
      setPulsed(true);
      try { sessionStorage.setItem("askcart_fab_pulsed", "1"); } catch {}
    }, 1300);
    return () => clearTimeout(t2);
  }, [pulsed]);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const f = () => setMobile(mq.matches);
    f();
    mq.addEventListener ? mq.addEventListener("change", f) : mq.addListener(f);
    return () => mq.removeEventListener ? mq.removeEventListener("change", f) : mq.removeListener(f);
  }, []);
  function dismiss() {
    try { sessionStorage.setItem("askcart_chat_nudge", "1"); } catch {}
    setNudgeSeen(true);
    onNudgeDismiss && onNudgeDismiss();
  }
  if (chatOpen && mobile) return null; // sheet covers the screen
  const collapsed = chatOpen; // desktop: FAB only while the panel is open
  return (
    <>
      {showNudge && !collapsed && (
        <div className="cht-nudge" role="status">
          <span>{t(lang, "chtNudge")}</span>
          <button onClick={dismiss} aria-label="Dismiss"><I name="x" size={14} /></button>
        </div>
      )}
      {!collapsed && !reduced && (
        <span className={"cht-pill" + (shimmer ? " shimmer" : "")} aria-hidden="true">
          <span className="cht-pill-t">{label || t(lang, "chtPill")}</span>
          <span className="cht-pill-s">{t(lang, "chtPillSub")}</span>
        </span>
      )}
      <button
        className={"cht-fab" + (pulsed ? "" : " pulse")}
        onClick={() => { if (showNudge) { try { sessionStorage.setItem("askcart_chat_nudge", "1"); } catch {} setNudgeSeen(true); } onOpen(); }}
        aria-label={t(lang, "chtFabOpen")}
      >
        <I name="sparkle" size={24} />
        {unread > 0 && !collapsed && <span className="cht-unread" aria-label={t(lang, "chtUnread")}>{unread > 9 ? "9+" : unread}</span>}
      </button>
    </>
  );
}
