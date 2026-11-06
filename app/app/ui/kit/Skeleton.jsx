"use client";
export function Skeleton({ kind = "text", width, height, style = {}, className = "" }) {
  const d = {
    card: { width: "100%", height: 250, className: "kit-skel kit-skel-card" },
    row: { width: "100%", height: 56, className: "kit-skel" },
    text: { width: width || "100%", height: 14, className: "kit-skel" },
    tile: { width: width || 120, height: height || 120, className: "kit-skel" },
  }[kind] || { width: width || "100%", height: height || 14, className: "kit-skel" };
  return <div className={d.className + " " + className} style={{ ...d, ...style }} aria-hidden="true" />;
}
