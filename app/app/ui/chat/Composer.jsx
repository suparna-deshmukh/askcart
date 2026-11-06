"use client";
// Auto-grow textarea (1-4 rows), Enter sends / Shift+Enter newline,
// maxlength 500 with a counter from 400, rotating placeholder.
import { useEffect, useRef, useState } from "react";
import { t } from "../../lib/i18n";

const PH_KEYS = ["chtPh1", "chtPh2", "chtPh3", "chtPh4"];

export function Composer({ busy, onSend, disabled, lang }) {
  const [val, setVal] = useState("");
  const [ph, setPh] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const id = setInterval(() => setPh((p) => (p + 1) % PH_KEYS.length), 7000);
    return () => clearInterval(id);
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
          placeholder={t(lang, PH_KEYS[ph])}
          aria-label={t(lang, "chtAriaMsg")}
          value={val}
          onInput={onInput}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
        />
        <button className="cht-send" onClick={send} disabled={busy || !val.trim()} aria-label={t(lang, "chtSend")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 12l16-8-6 8 6 8-16-8z" fill="currentColor" />
          </svg>
        </button>
      </div>
      {val.length >= 400 && <div className="cht-count">{val.length}/500</div>}
    </div>
  );
}
