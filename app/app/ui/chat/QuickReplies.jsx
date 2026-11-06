"use client";
// Assistant question chips: radiogroup, arrow-key navigable, zero-count
// options disabled (G1: never offer a dead-end chip).
import { useRef } from "react";
import { t } from "../../lib/i18n";

export function QuickReplies({ lang, chips, disabled, onChip }) {
  const refs = useRef([]);
  if (!chips || !chips.length) return null;
  function onKey(e) {
    const i = refs.current.findIndex((r) => r && r === document.activeElement);
    const n = refs.current.length;
    if (i < 0) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); const nx = refs.current[(i + 1) % n]; if (nx) nx.focus(); }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); const pv = refs.current[(i - 1 + n) % n]; if (pv) pv.focus(); }
    if (e.key === "Enter" && document.activeElement && document.activeElement.dataset.chipid) {
      e.preventDefault();
      onChip(document.activeElement.dataset.chipid, document.activeElement.dataset.chiplabel || document.activeElement.dataset.chipid);
    }
  }
  return (
    <div className="cht-chips" role="radiogroup" aria-label={t(lang, "chtQuickOpts")} onKeyDown={onKey}>
      {chips.map((c, i) => {
        const isZero = c.count === 0;
        return (
          <button
            key={c.id + i}
            ref={(el) => { refs.current[i] = el; }}
            role="radio"
            aria-checked="false"
            className={"cht-chip" + (c.ghost ? " ghost" : "")}
            disabled={disabled || isZero}
            data-chipid={c.id}
            data-chiplabel={c.label}
            onClick={() => onChip(c.id, c.label)}
            title={isZero ? t(lang, "chtNoMatch") : undefined}
          >
            {c.label}
            {c.count != null && <span className="cht-chip-count">{c.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
