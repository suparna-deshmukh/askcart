"use client";
// Category mega panel: 3 columns (categories / occasions / brands) + promo.
import { I } from "../kit/Icon";
import { displayCat } from "../../lib/categories";
import { catTheme } from "../kit/Tile";
import { t } from "../../lib/i18n";

const OCCASIONS = [
  ["Gifts", "gift under 2k", "shNavGifts"], ["Shaadi", "shaadi gift under 2k", "shShaadi"], ["Diwali", "diwali decorations", "shDiwali"],
  ["Birthday", "birthday gift under 1k", "shBirthday"], ["Anniversary", "anniversary gift", "shAnniv"], ["Everyday", "everyday essentials", null],
];

export function MegaMenu({ facets, onQuery, onClose, lang }) {
  const cats = (facets?.categories || []).slice(0, 12);
  const brands = (facets?.brands?.top || []).slice(0, 8);
  return (
    <div className="mega" role="menu" aria-label={t(lang, "navCategories")}>
      <div className="mega-in">
        <div className="mega-col">
          <div className="mega-t">{t(lang, "shCatSec")}</div>
          {cats.map((c) => {
            const th = catTheme(c.name);
            return (
              <button key={c.name} role="menuitem" className="mega-item"
                      onClick={() => { onQuery(c.name, "nav"); onClose(); }}>
                <span className="mega-glyph" style={{ background: `linear-gradient(160deg, var(--cat-${th.c}-1), var(--cat-${th.c}-2))`, color: `var(--cat-${th.c}-ink)` }}>
                  <I name={th.c === "fashion" ? "layers" : th.c === "electronics" ? "smartphone" : th.c === "watch" ? "clock" : th.c === "beauty" ? "sparkle" : th.c === "kitchen" ? "package" : "grid"} size={15} />
                </span>
                <span className="mega-name">{displayCat(c.name)}</span>
                <span className="mega-count">{c.count.toLocaleString("en-IN")}</span>
              </button>
            );
          })}
        </div>
        <div className="mega-col">
          <div className="mega-t">Shop by occasion</div>
          {OCCASIONS.map(([label, q, key]) => (
            <button key={label} role="menuitem" className="mega-item" onClick={() => { onQuery(q, "nav"); onClose(); }}>
              <span className="mega-name">{key ? t(lang, key) : label}</span>
            </button>
          ))}
        </div>
        <div className="mega-col">
          <div className="mega-t">{t(lang, "shMegaBrands")}</div>
          <div className="mega-brands">
            {brands.map((b) => (
              <button key={b.name} role="menuitem" className="mega-brand" onClick={() => { onQuery(b.name, "nav"); onClose(); }}>
                <span className="mb-mono">{b.name[0].toUpperCase()}</span>{b.name}
              </button>
            ))}
          </div>
          <button className="mega-promo" onClick={() => { onQuery("", "nav_promo"); onClose(); window.dispatchEvent(new CustomEvent("askcart:focus-search")); }}>
            <I name="sparkle" size={16} />
            <span>{t(lang, "shMegaPromo")}</span>
            <span className="mega-promo-sub">{t(lang, "shMegaPromoSub")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
