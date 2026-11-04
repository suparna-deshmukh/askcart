"use client";
// Floating assistant launcher (56px FAB) + one-time-per-session nudge.
// Never auto-opens (brief Don'ts); the nudge appears once per session after
// the first search that resolved, and can be dismissed permanently (session).
import { useState } from "react";

export function ChatLauncher({ onOpen, nudge, onNudgeOpen, onNudgeDismiss, label }) {
  const [nudgeSeen, setNudgeSeen] = useState(() => {
    try { return sessionStorage.getItem("askcart_chat_nudge") === "1"; } catch { return true; }
  });
  const showNudge = nudge && !nudgeSeen;
  function dismiss() {
    try { sessionStorage.setItem("askcart_chat_nudge", "1"); } catch {}
    setNudgeSeen(true);
    onNudgeDismiss && onNudgeDismiss();
  }
  return (
    <>
      {showNudge && (
        <div className="cht-nudge" role="status">
          <span>Ask the assistant to narrow it down, compare, or explain a product.</span>
          <button onClick={dismiss} aria-label="Dismiss">✕</button>
        </div>
      )}
      {label && <span className="cht-fab-label" aria-hidden="true">{label}</span>}
      <button
        className="cht-fab"
        onClick={() => { if (showNudge) { try { sessionStorage.setItem("askcart_chat_nudge", "1"); } catch {} setNudgeSeen(true); } onNudgeOpen && onNudgeOpen(); onOpen(); }}
        aria-label="Open AskCart assistant"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 1.75 14.6 9.4 22.25 12 14.6 14.6 12 22.25 9.4 14.6 1.75 12 9.4 9.4 Z" fill="currentColor" />
        </svg>
      </button>
    </>
  );
}
