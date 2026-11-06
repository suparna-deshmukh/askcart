"use client";
// Dark footer band (replaces the light 3-line footer).
import { I } from "../kit/Icon";
import { t } from "../../lib/i18n";

export function Footer({ catalogSize, onQuery, onInsights, lang }) {
  return (
    <footer className="foot2">
      <div className="foot2-in">
        <div className="foot2-grid">
          <div className="foot2-brandcol">
            <div className="foot2-logo"><span className="foot2-mark">A</span>AskCart</div>
            <p>{t(lang, "footBlurb")}</p>
          </div>
          <div className="foot2-col">
            <div className="foot2-h">{t(lang, "footShop")}</div>
            {["Fashion", "Electronics", "Home & Kitchen", "Beauty", "Watches", "Toys"].map((c) => (
              <button key={c} onClick={() => onQuery(c, "footer")}>{c}</button>
            ))}
          </div>
          <div className="foot2-col">
            <div className="foot2-h">{t(lang, "shNavOcc")}</div>
            {[["Gifts", "shNavGifts"], ["Shaadi", "shShaadi"], ["Diwali", "shDiwali"], ["Birthday", "shBirthday"], ["Anniversary", "shAnniv"]].map(([o, k]) => (
              <button key={o} onClick={() => onQuery(o.toLowerCase() + " gift under 2k", "footer")}>{t(lang, k)}</button>
            ))}
          </div>
          <div className="foot2-col">
            <div className="foot2-h">{t(lang, "footAbout")}</div>
            <button onClick={() => onQuery("gift under 2k", "footer")}>{t(lang, "howItWorks")}</button>
            <a href="https://github.com" onClick={(e) => e.preventDefault()} title="See PROJECT.md in the repo">{t(lang, "footMethod")}</a>
            <button onClick={() => onInsights()}>{t(lang, "footInsights")}</button>
          </div>
        </div>
        <div className="foot2-trust">
          <span><I name="chat" size={16} /> {t(lang, "trust1")}</span>
          <span><I name="globe" size={16} /> {t(lang, "trust2")}</span>
          <span><I name="badge-check" size={16} /> {t(lang, "trust3")}</span>
          <span><I name="lock" size={16} /> {t(lang, "trust4")}</span>
        </div>
        <div className="foot2-legal">
          {t(lang, "footLegal", { n: Number(catalogSize || 0).toLocaleString("en-IN") })}
        </div>
      </div>
    </footer>
  );
}
