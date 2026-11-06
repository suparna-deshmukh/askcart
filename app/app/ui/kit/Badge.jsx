"use client";
export function Badge({ variant = "info", icon, children, className = "" }) {
  const v = { best: "best", close: "close", toprated: "toprated", info: "info", success: "success" }[variant] || "info";
  return <span className={`kit-badge ${v} ${className}`}>{icon}{children}</span>;
}
