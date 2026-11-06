"use client";
// Mobile bottom tab bar (≤767px only via CSS).
import { I } from "../kit/Icon";
import { t } from "../../lib/i18n";

const ITEMS = [
  ["home", "home", "navHome", "Home"],
  ["categories", "grid", null, "Categories"],
  ["wishlist", "heart", "navWishlist", "Wishlist"],
  ["orders", "package", "navOrders", "Orders"],
  ["cart", "bag", "navCart", "Cart"],
];

export function TabBar({ tab, onHome, onCategories, onTab, cartCount, wishCount, lang }) {
  return (
    <nav className="tabbar" aria-label="Primary">
      {ITEMS.map(([id, icon, i18n, label]) => {
        const active = id === "cart" ? tab === "search" && false : tab === id || (id === "home" && tab === "search");
        const count = id === "cart" ? cartCount : id === "wishlist" ? wishCount : 0;
        return (
          <button key={id} className={active ? "on" : ""}
                  onClick={() => { if (id === "home") onHome(); else if (id === "categories") onCategories(); else onTab(id); }}
                  aria-label={label}>
            <I name={icon} size={22} />
            {count > 0 && <span className="tb-badge">{count > 99 ? "99+" : count}</span>}
            <span>{i18n ? t(lang, i18n) : label}</span>
          </button>
        );
      })}
    </nav>
  );
}
