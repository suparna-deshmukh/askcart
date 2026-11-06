"use client";
export function Chip({ variant = "default", size = "md", count, onRemove, className = "", children, ...rest }) {
  const v = { default: "", selected: "selected", guide: "guide", removable: "removable", "ghost-dashed": "ghost-dashed" }[variant] || "";
  const s = size === "lg" ? "lg" : "";
  return (
    <button type="button" className={`kit-chip ${v} ${s} ${className}`} {...rest}>
      {children}
      {count != null && <span className="kcnt">{count}</span>}
      {onRemove && <span className="xx" aria-hidden="true">✕</span>}
    </button>
  );
}
