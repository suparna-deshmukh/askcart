"use client";
export function Price({ value, size = "md", from, mrp, overbudget, className = "" }) {
  const n = Number(value || 0).toLocaleString("en-IN");
  return (
    <span className={`kit-price ${size} ${className}`}>
      <span>₹{n}</span>
      {mrp != null && Number(mrp) > Number(value) && <span className="mrp">₹{Number(mrp).toLocaleString("en-IN")}</span>}
      {from != null && <span className="from">from ₹{Number(from).toLocaleString("en-IN")}</span>}
      {overbudget && <span className="kit-badge info" style={{ color: "var(--warning)", background: "var(--warning-bg)" }}>Slightly over your budget</span>}
    </span>
  );
}
