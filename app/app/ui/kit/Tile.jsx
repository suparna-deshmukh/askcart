"use client";
// Tile v2: designed studio packshot. image_url when present, else layered
// generated art: category gradient + top-left light + 6% pattern + duotone
// glyph at ~52% + floor shadow + brand monogram pill + info tooltip.
// Fixed size/aspect => zero CLS.
import { Glyph, glyphFor } from "./Glyphs";
import { Tooltip } from "./Tooltip";
import { I } from "./Icon";

const THEMES = {
  fashion: { c: "fashion", pattern: "lines" },
  home: { c: "home", pattern: "dots" },
  electronics: { c: "electronics", pattern: "grid" },
  beauty: { c: "beauty", pattern: "rings" },
  toys: { c: "toys", pattern: "stars" },
  baby: { c: "toys", pattern: "stars" },
  sports: { c: "sports", pattern: "chevrons" },
  auto: { c: "auto", pattern: "grid" },
  kitchen: { c: "kitchen", pattern: "dots" },
  watch: { c: "watch", pattern: "lines" },
  default: { c: "default", pattern: "dots" },
};

export function catTheme(category, title) {
  const t = String(category || "").toLowerCase();
  if (/fashion|clothing|jewel|saree|kurti|lehenga|ethnic|shoes|footwear|bag|handbag|dress/.test(t)) return THEMES.fashion;
  if (/watch|wristwatch/.test(t)) return THEMES.watch;
  if (/home|furniture|lighting|bedding|decor/.test(t)) return THEMES.home;
  if (/kitchen|appliance|cookware|utensil|tiffin|mixer|grinder/.test(t)) return THEMES.kitchen;
  if (/electronic|phone|computer|camera|audio|game|gadget|headphone|laptop|tablet|charger|tv|appliance/.test(t)) return THEMES.electronics;
  if (/beauty|personal care|perfume|cosmetic|skincare|grooming/.test(t)) return THEMES.beauty;
  if (/toys|games/.test(t)) return THEMES.toys;
  if (/baby|maternity|diaper/.test(t)) return THEMES.baby;
  if (/sport|outdoor|fitness|yoga|gym/.test(t)) return THEMES.sports;
  if (/automotive|car/.test(t)) return THEMES.auto;
  return THEMES.default;
}

function Pattern({ kind, ink }) {
  const s = {
    lines: <path d="M0 24L24 0M-6 24L18 0M6 30L30 6" stroke={ink} strokeWidth="1.5" />,
    dots: <>{[...Array(16)].map((_, i) => <circle key={i} cx={(i % 4) * 8 + 4} cy={Math.floor(i / 4) * 8 + 4} r="1.2" fill={ink} />)}</>,
    grid: <path d="M0 12h24M0 6h24M0 18h24M6 0v24M12 0v24M18 0v24" stroke={ink} strokeWidth="0.8" />,
    rings: <>{[...Array(6)].map((_, i) => <circle key={i} cx="12" cy="12" r={2 + i * 2.4} fill="none" stroke={ink} strokeWidth="0.9" />)}</>,
    stars: <>{[[6, 6], [18, 8], [10, 16], [20, 18], [4, 20]].map(([x, y], i) => <path key={i} d={`M${x} ${y - 2}l.7 1.4 1.5.2-1.1 1.1.3 1.5-1.4-.7-1.4.7.3-1.5-1.1-1.1 1.5-.2Z`} fill={ink} />)}</>,
    chevrons: <path d="M0 16l6-6 6 6M12 16l6-6 6 6" stroke={ink} strokeWidth="1.4" fill="none" />,
  }[kind];
  return (
    <svg className="tile2-pattern" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid slice"
         style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: .07 }} aria-hidden="true">
      <g>{s}</g>
    </svg>
  );
}

export function Tile({ item, size = 120, className = "", imageUrl, showInfo = true, aspect }) {
  const th = catTheme(item && item.category, item && item.title);
  const brand = ((item && item.brand) || "").trim();
  const url = imageUrl || (item && item.image_url);
  const fluid = size === "fluid";
  return (
    <div className={"tile2" + (fluid ? " tile2-fluid" : "") + " " + className}
         style={fluid
                  ? { width: "100%", aspectRatio: aspect || "4 / 3", borderRadius: 12,
                      background: url ? "var(--surface)" : `linear-gradient(160deg, var(--cat-${th.c}-1), var(--cat-${th.c}-2))` }
                  : { width: size, height: size, borderRadius: 10, flex: "none",
                      background: url ? "var(--surface)" : `linear-gradient(160deg, var(--cat-${th.c}-1), var(--cat-${th.c}-2))` }}
         aria-hidden="true">
      {url ? <img src={url} alt="" loading="lazy" decoding="async"
                  onError={(e) => { e.target.style.display = "none"; }} /> : (
        <>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(60% 60% at 25% 20%, rgba(255,255,255,.7), transparent 70%)" }} />
          <Pattern kind={th.pattern} ink={`var(--cat-${th.c}-ink)`} />
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ position: "absolute", bottom: "10%", left: "50%", transform: "translateX(-50%)", width: "44%", height: 9, borderRadius: "50%", background: "rgba(28,27,24,.12)", filter: "blur(6px)" }} />
            <span className="tile2-glyph" style={{ color: `var(--cat-${th.c}-ink)` }}>
              <Glyph kind={glyphFor(item && item.category, item && item.title)} size={fluid ? 44 : Math.max(20, Math.round(size * 0.52))} />
            </span>
          </div>
          {brand && <span className="tile2-mono">{brand[0].toUpperCase()}</span>}
          {showInfo && (
            <span className="tile2-info">
              <Tooltip tip="Illustrative image">
                <I name="info" size={14} strokeWidth={2} />
              </Tooltip>
            </span>
          )}
        </>
      )}
    </div>
  );
}
