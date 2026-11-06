"use client";
export function Rating({ rating, count, compact = false }) {
  const cls = rating >= 4 ? "good" : rating >= 3 ? "mid" : "low";
  const cnt = count == null ? "" : compact
    ? (count >= 1000 ? (count / 1000).toFixed(1).replace(/\.0$/, "") + "k" : count.toLocaleString("en-IN"))
    : Number(count).toLocaleString("en-IN") + " ratings";
  return (
    <span className="kit-rating">
      <span className={`pill ${cls}`}>★ {Number(rating).toFixed(1)}</span>
      {cnt && <span className="cnt">{cnt}</span>}
    </span>
  );
}
