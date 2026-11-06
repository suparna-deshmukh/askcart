"use client";
// Phase 4 (brief §7.5-7.6): desktop sidebar facets + mobile bottom bar with
// sort/filter bottom sheets. Reuses the page's setFilter semantics 1:1 —
// same filter types, same payload, live counts, zero-count rows disabled.
import { useMemo, useState } from "react";
import { t } from "../lib/i18n";
import { displayCat } from "../lib/categories";
import { track } from "../lib/track";
import { I } from "./kit/Icon";
import { Button } from "./kit/Button";
import { Overlay } from "./kit/Overlay";

function PriceMinMax({ f, onPriceMin, onPriceMax, priceBands, setFilter, lang }) {
  const [min, setMin] = useState(f.priceMin != null ? String(f.priceMin) : "");
  const [max, setMax] = useState(f.priceMax != null ? String(f.priceMax) : "");
  const commit = () => {
    const mn = min ? Number(min.replace(/[^\d]/g, "")) : null;
    const mx = max ? Number(max.replace(/[^\d]/g, "")) : null;
    if (mn != null && mn !== (f.priceMin ?? null)) onPriceMin(mn);
    if (mx != null && mx !== (f.priceMax ?? null)) onPriceMax(mx);
  };
  return (
    <>
      <div className="fside-minmax">
        <input className="fside-in" inputMode="numeric" placeholder="Min ₹" value={min} aria-label="Minimum price"
               onChange={(e) => setMin(e.target.value.replace(/[^\d]/g, "").slice(0, 7))}
               onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
        <span className="fside-dash">–</span>
        <input className="fside-in" inputMode="numeric" placeholder="Max ₹" value={max} aria-label="Maximum price"
               onChange={(e) => setMax(e.target.value.replace(/[^\d]/g, "").slice(0, 7))}
               onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
      </div>
      {priceBands.length > 0 && (
        <div className="fside-chips">
          {priceBands.map((b) => (
            <button key={b.id} className={f.band === b.id ? "fchip on" : "fchip"}
                    onClick={() => setFilter("price_band", b.id)}>{b.label}</button>
          ))}
        </div>
      )}
    </>
  );
}

export function FilterContent({ lang, f, setFilter, priceBands, brandList, catList, onPriceMin, onPriceMax, single }) {
  const [brandQ, setBrandQ] = useState("");
  const [showAllBrands, setShowAllBrands] = useState(false);
  const [open, setOpen] = useState({ price: true, rating: true, brand: true, category: !single, accessories: false });
  const brands = useMemo(() => {
    let l = brandList;
    if (brandQ) l = l.filter(([n]) => n.toLowerCase().includes(brandQ.toLowerCase()));
    return l;
  }, [brandList, brandQ]);
  const collapsed = brands.length > 8 && !showAllBrands ? brands.slice(0, 8) : brands;
  const grp = (id, title, body) => (
    <div className={"fside-grp" + (open[id] ? "" : " closed")}>
      <button className="fside-grp-h" aria-expanded={open[id]} onClick={() => setOpen({ ...open, [id]: !open[id] })}>
        <span>{title}</span><I name="chevron-down" size={15} className={open[id] ? "rot" : ""} />
      </button>
      <div className="fside-grp-b">{body}</div>
    </div>
  );
  return (
    <div className="fcontent">
      {grp("price", t(lang, "price"), (
        <PriceMinMax f={f} onPriceMin={onPriceMin} onPriceMax={onPriceMax} priceBands={priceBands} setFilter={setFilter} lang={lang} />
      ))}
      {grp("rating", t(lang, "rating"), (
        <div className="fside-radios" role="radiogroup" aria-label={t(lang, "rating")}>
          <label className={f.rating4 ? "on" : ""}>
            <input type="radio" name={"rr" + lang} checked={f.rating4} onChange={() => setFilter("rating", "4★+")} />
            <span>4★ {t(lang, "andUp")}</span>
          </label>
          <label className={!f.rating4 ? "on" : ""}>
            <input type="radio" name={"rr" + lang} checked={!f.rating4} onChange={() => f.rating4 && setFilter("rating", "4★+")} />
            <span>{t(lang, "anyRating")}</span>
          </label>
        </div>
      ))}
      {brandList.length > 0 && grp("brand", t(lang, "brand"), (
        <>
          {brandList.length > 8 && (
            <input className="fside-in fside-brandq" placeholder={t(lang, "searchBrand")} value={brandQ}
                   onChange={(e) => setBrandQ(e.target.value)} aria-label={t(lang, "searchBrand")} />
          )}
          <div className="fside-checks">
            {collapsed.map(([n, c]) => (
              <label key={n} className={c === 0 ? "zero" : f.brands.includes(n) ? "on" : ""}>
                <input type="checkbox" checked={f.brands.includes(n)} disabled={c === 0}
                       onChange={() => setFilter("brand", n)} />
                <span>{n}</span><span className="cnt">{c}</span>
              </label>
            ))}
          </div>
          {brands.length > 8 && (
            <button className="fside-more" onClick={() => setShowAllBrands(!showAllBrands)}>
              {showAllBrands ? t(lang, "showLess") : t(lang, "showMoreBrands").replace("{n}", brands.length - 8)}
            </button>
          )}
        </>
      ))}
      {!single && catList.length > 0 && grp("category", t(lang, "category"), (
        <div className="fside-checks">
          {catList.map(([c, n]) => (
            <label key={c} className={n === 0 ? "zero" : f.category === c ? "on" : ""}>
              <input type="checkbox" checked={f.category === c} disabled={n === 0}
                     onChange={() => setFilter("category", c)} />
              <span>{displayCat(c)}</span><span className="cnt">{n}</span>
            </label>
          ))}
        </div>
      ))}
      {grp("accessories", t(lang, "accessories"), (
        <label className="fside-toggle">
          <input type="checkbox" checked={f.noAccessories} onChange={() => setFilter("accessories", "hide")} />
          <span className="fside-sw" aria-hidden="true" /><span>{t(lang, "hideAccessories")}</span>
        </label>
      ))}
    </div>
  );
}

export function FilterSidebar(props) {
  const { lang, activeCount, clearAll, nAfter } = props;
  return (
    <aside className="fside" aria-label={t(lang, "filters")}>
      <div className="fside-top">
        <h3>{t(lang, "filters")}</h3>
        {activeCount > 0 && (
          <button className="fside-clear" onClick={clearAll}>{t(lang, "clearAll")}</button>
        )}
      </div>
      <FilterContent {...props} />
      <div className="fside-foot">{nAfter} {t(lang, "productsWord")}</div>
    </aside>
  );
}

// Mobile: sticky bottom bar (Sort | Filter n) + bottom sheets (brief §7.5).
export function FilterBar({ lang, f, setFilter, priceBands, brandList, catList, onPriceMin, onPriceMax, single, activeCount, nAfter, sortLabel }) {
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const open = (which) => { track("filter_sheet_open", { sheet: which }); which === "sort" ? setSortOpen(true) : setFilterOpen(true); };
  return (
    <>
      <div className="fbar">
        <button className="fbar-btn" onClick={() => open("sort")}>
          <I name="sliders" size={17} /> <span>{t(lang, "sortBy")}: {sortLabel}</span>
        </button>
        <button className="fbar-btn" onClick={() => open("filter")}>
          <I name="filter" size={17} /> <span>{t(lang, "filters")}{activeCount ? ` (${activeCount})` : ""}</span>
        </button>
      </div>
      {sortOpen && (
        <Overlay variant="sheet" label={t(lang, "sortBy")} onClose={() => setSortOpen(false)}>
          <div className="sheet-in">
            <div className="sheet-h">{t(lang, "sortBy")}</div>
            <div className="fside-radios" role="radiogroup">
              {["relevance", "price_asc", "price_desc", "rating"].map((id) => (
                <label key={id} className={f.sort === id ? "on" : ""}>
                  <input type="radio" name="fbsort" checked={f.sort === id}
                         onChange={() => { setFilter("sort", id); setSortOpen(false); }} />
                  <span>{t(lang, "sort_" + id)}</span>
                </label>
              ))}
            </div>
            <Button size="lg" className="sheet-apply" onClick={() => setSortOpen(false)}>
              {t(lang, "showProducts").replace("{n}", nAfter)}
            </Button>
          </div>
        </Overlay>
      )}
      {filterOpen && (
        <Overlay variant="sheet" label={t(lang, "filters")} onClose={() => setFilterOpen(false)}>
          <div className="sheet-in">
            <div className="sheet-h">{t(lang, "filters")}</div>
            <FilterContent lang={lang} f={f} setFilter={setFilter} priceBands={priceBands}
                           brandList={brandList} catList={catList} onPriceMin={onPriceMin} onPriceMax={onPriceMax} single={single} />
            <div className="sheet-foot">
              {activeCount > 0 && <button className="fside-clear" onClick={() => setFilter("clear", "clear")}>{t(lang, "clearAll")}</button>}
              <Button size="lg" className="sheet-apply" onClick={() => setFilterOpen(false)}>
                {t(lang, "showProducts").replace("{n}", nAfter)}
              </Button>
            </div>
          </div>
        </Overlay>
      )}
    </>
  );
}
