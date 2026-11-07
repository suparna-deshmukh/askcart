"use client";
// Mobile bottom tab bar (<=767px only via CSS). L1: raised centre Ask
// (spark, 56px brand circle breaking the bar's top edge). Wishlist lives in
// the header + NavDrawer.
import { I } from "../kit/Icon";
import { t } from "../../lib/i18n";

const LEFT = [
  ["home", "home", "navHome", "Home"],
  ["categories", "grid", null, "Categories"],
];
const RIGHT = [
  ["orders", "package", "navOrders", "Orders"],
  ["cart", "bag", "navCart", "Cart"],
];

export function TabBar({ tab, onHome, onCategories, onAsk, chatOff, onTab, cartCount, wishCount, lang }) {
  const active = (id) => (id === "home" ? tab === "search" : tab === id);
  const count = (id) => (id === "cart" ? cartCount : 0);
  const side = (list) => list.map(([id, icon, i18n, label]) => (
    <button key={id} className={active(id) ? "on" : ""}
            onClick={() => { if (id === "home") onHome(); else if (id === "categories") onCategories(); else onTab(id); }}
            aria-label={label}>
      <I name={icon} size={22} />
      {count(id) > 0 && <span className="tb-badge">{count(id) > 99 ? "99+" : count(id)}</span>}
      <span>{i18n ? t(lang, i18n) : label}</span>
    </button>
  ));
  return (
    <nav className="tabbar" aria-label="Primary">
      {side(LEFT)}
      {chatOff ? (
        <span className="tb-ask tb-ask-off" aria-hidden="true" />
      ) : (
        <button className="tb-ask" onClick={() => onAsk && onAsk()} aria-label={t(lang, "navAsk")}>
          <span className="tb-ask-circle" aria-hidden="true"><I name="sparkle" size={22} /></span>
          <span>{t(lang, "navAsk")}</span>
        </button>
      )}
      {side(RIGHT)}
    </nav>
  );
}
