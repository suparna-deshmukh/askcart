"use client";
// One primitive for modal / side drawer / bottom sheet: focus trap, scroll
// lock, Esc, backdrop click, focus return. z-index per the spec ladder.
import { useEffect, useRef } from "react";

export function Overlay({ variant = "modal", label, onClose, children, width }) {
  const ref = useRef(null);
  const prevFocus = useRef(null);
  useEffect(() => {
    prevFocus.current = document.activeElement;
    const el = ref.current;
    if (el) {
      const f = el.querySelector("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
      (f || el).focus({ preventScroll: true });
    }
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose && onClose(); }
      if (e.key === "Tab" && el) {
        const items = [...el.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter((x) => !x.disabled && x.offsetParent !== null);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    const sw = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = sw;
      if (prevFocus.current && prevFocus.current.focus) prevFocus.current.focus({ preventScroll: true });
    };
  }, [onClose]);
  const inner =
    variant === "modal" ? <div className="kit-modal" ref={ref} role="dialog" aria-modal="true" aria-label={label} style={width ? { width: `min(${width}px, 100%)` } : undefined}>{children}</div>
    : variant === "sheet" ? <div className="kit-sheet" ref={ref} role="dialog" aria-modal="true" aria-label={label}><span className="handle" aria-hidden="true" />{children}</div>
    : <div className={`kit-drawer${variant === "left" ? " left" : ""}`} ref={ref} role="dialog" aria-modal="true" aria-label={label} style={width ? { width: `min(${width}px, 100vw)` } : undefined}>{children}</div>;
  return (
    <div className={`kit-overlay ${variant === "modal" ? "modal" : variant === "sheet" ? "sheet-bottom" : "drawer-" + (variant === "left" ? "left" : "right")}`} onClick={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}>
      {inner}
    </div>
  );
}
