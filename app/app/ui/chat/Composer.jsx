"use client";
// Auto-grow textarea (1-4 rows), Enter sends / Shift+Enter newline,
// maxlength 500 with a counter from 400, rotating placeholder.
import { useEffect, useRef, useState } from "react";

const PLACEHOLDERS = [
  "Try: “gift for mom under 1500”",
  "Try: “1.5 ton ac under 45k”",
  "Try: “saree for ammi under 2k”",
  "Ask about a product: “is the first one a good gift?”",
];

export function Composer({ busy, onSend, disabled }) {
  const [val, setVal] = useState("");
  const [ph, setPh] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const t = setInterval(() => setPh((p) => (p + 1) % PLACEHOLDERS.length), 7000);
    return () => clearInterval(t);
  }, []);
  function onInput(e) {
    const el = e.target;
    setVal(el.value);
    el.style.height = "auto";
    el.style.height = Math.min(88, el.scrollHeight) + "px";
  }
  function send() {
    const t = val.trim();
    if (!t || busy) return;
    onSend(t);
    setVal("");
    if (ref.current) { ref.current.style.height = "auto"; ref.current.value = ""; }
  }
  return (
    <div className="cht-composer">
      <div className="cht-composer-row">
        <textarea
          ref={ref}
          className="cht-input"
          rows={1}
          maxLength={500}
          disabled={disabled}
          placeholder={PLACEHOLDERS[ph]}
          aria-label="Message the assistant"
          value={val}
          onInput={onInput}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
        />
        <button className="cht-send" onClick={send} disabled={busy || !val.trim()} aria-label="Send">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 12l16-8-6 8 6 8-16-8z" fill="currentColor" />
          </svg>
        </button>
      </div>
      {val.length >= 400 && <div className="cht-count">{val.length}/500</div>}
    </div>
  );
}
