"use client";
import { useEffect, useRef, useState } from "react";
import { I } from "./kit/Icon";
import { track, setPersona } from "../lib/track";
import { t } from "../lib/i18n";

// Section 3 (2026-11-08, update-prompt): full-screen first-visit
// onboarding - feels like a real e-commerce signup, < 45 s, no account /
// email / OTP. Replaces the centered persona modal. Behaviour kept:
// BUDGET_STYLE_MAX / SPEND_BIAS / SPEND_BRAND_AFFINITY (page.jsx),
// askcart_onboarded flag, askcart_persona shape (recommendScore, guide,
// analytics all read it) + new `interests: []`, askcart_profile_v1 =
// {name, answers, custom, personaId, createdAt}. The name NEVER leaves
// the browser (not in the persona, not in any event).
//
// Steps: name -> context -> interests (multi <= 3) -> spendStyle -> ageBand.
// Steps 1-4 have an inline "Something else…" (custom.<key>); custom
// context / spendStyle maps by keyword rules when possible, otherwise
// "Custom". Custom interests stay as an extra chip and seed Home.

const INTERESTS = ["Fashion", "Electronics", "Home and kitchen", "Beauty", "Toys and baby", "Sports", "Watches and jewellery"];
export { INTERESTS };

const STEPS = [
  { key: "name", icon: "user", tk: "obName", tks: "obNameSub" },
  { key: "context", icon: "bag", tk: "obCtx", tks: "obCtxSub",
    opts: ["Myself", "Family and kids", "Gifting", "Home and appliances", "A mix of all"],
    optT: ["obMyself", "obFamily", "obGifting", "obHome", "obMix"],
    grid: true,
    optIcons: { Myself: "user", "Family and kids": "heart", Gifting: "gift", "Home and appliances": "home", "A mix of all": "layers" } },
  { key: "interests", icon: "sparkle", tk: "obInterests", tks: "obInterestsSub",
    opts: INTERESTS,
    optT: ["obIntFashion", "obIntElectronics", "obIntHome", "obIntBeauty", "obIntToys", "obIntSports", "obIntWatches"],
    multi: true, max: 3,
    optIcons: { Fashion: "eye", Electronics: "smartphone", "Home and kitchen": "home", Beauty: "star",
                "Toys and baby": "party", Sports: "send", "Watches and jewellery": "clock" } },
  { key: "spendStyle", icon: "wallet", tk: "obSpend", tks: "obSpendSub",
    opts: ["Best price — I compare a lot", "Good quality at a fair price", "Brand matters most", "Premium, if it's worth it"],
    optT: ["obPrice", "obQuality", "obBrandMost", "obPremium"],
    optIcons: { "Best price — I compare a lot": "wallet", "Good quality at a fair price": "badge-check",
                "Brand matters most": "shield-check", "Premium, if it's worth it": "star" } },
  { key: "ageBand", icon: "cake", tk: "obAge", tks: "obAgeSub",
    opts: ["Under 25", "25 to 40", "40+"],
    optT: ["obU25", "ob2540", "ob40"],
    optIcons: { "Under 25": "sparkle", "25 to 40": "user", "40+": "heart" } },
];

export const BUDGET_STYLE_MAX = {
  "Best price — I compare a lot": 2000,
  "Good quality at a fair price": 5000,
  "Brand matters most": 8000,
  "Premium, if it's worth it": null,
};
export const SPEND_BIAS = {
  "Best price — I compare a lot": 0.8,
  "Good quality at a fair price": 1.0,
  "Brand matters most": 1.1,
  "Premium, if it's worth it": 1.25,
};
export const SPEND_BRAND_AFFINITY = {
  "Best price — I compare a lot": 0.3,
  "Good quality at a fair price": 0.5,
  "Brand matters most": 1.0,
  "Premium, if it's worth it": 0.9,
};

// Section 4: deterministic persona id = spend-style base + context suffix.
const PERSONA_BASE = {
  "Best price — I compare a lot": "Value Seeker",
  "Good quality at a fair price": "Smart Buyer",
  "Brand matters most": "Brand Loyalist",
  "Premium, if it's worth it": "Premium Buyer",
};
export function personaIdOf(answers) {
  const a = answers || {};
  if (!a.spendStyle && !a.context) return null;
  const base = PERSONA_BASE[a.spendStyle] || "Smart Buyer";
  return a.context && a.context !== "Custom" ? base + " · " + a.context : base;
}

function mapCustomContext(s) {
  if (/gift|present|birthday|wedding|anniversary|shaadi|diwali|party/i.test(s)) return "Gifting";
  if (/family|kids?|child|home|appliance|ghar|parivaar/i.test(s)) return "Family and kids";
  if (/myself|self\b|\bme\b/i.test(s)) return "Myself";
  return null;
}
function mapCustomSpend(s) {
  if (/price|budget|cheap|compare|sasta|sasta/i.test(s)) return "Best price — I compare a lot";
  if (/brand/i.test(s)) return "Brand matters most";
  if (/premium|worth|luxur/i.test(s)) return "Premium, if it's worth it";
  if (/quality|fair|value/i.test(s)) return "Good quality at a fair price";
  return null;
}

export function Onboarding({ onDone, lang, setLang, onTryAssistant, forced }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({ interests: [] });
  const [custom, setCustom] = useState({});
  const [name, setName] = useState("");
  const nameRef = useRef(""); // finish() can run from a stale closure (setTimeout auto-advance)
  const [sel, setSel] = useState(null); // selected option (single steps)
  const [done, setDone] = useState(false);
  const [profile, setProfile] = useState(null);
  const [personaDone, setPersonaDone] = useState(null);
  const [mobile, setMobile] = useState(false);
  const [elseOpen, setElseOpen] = useState(false);
  const [elseVal, setElseVal] = useState("");
  const [stepT0, setStepT0] = useState(Date.now());
  const [t0] = useState(() => Date.now());
  const startedRef = useRef(false);
  const s = STEPS[step];

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    track("onboarding_start", { forced: !!forced });
  }, [forced]);
  useEffect(() => { setStepT0(Date.now()); }, [step]);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const f = () => setMobile(mq.matches);
    f();
    mq.addEventListener ? mq.addEventListener("change", f) : mq.addListener(f);
    return () => mq.removeEventListener ? mq.removeEventListener("change", f) : mq.removeListener(f);
  }, []);

  function recordStep(key, skipped) {
    if (skipped) track("onboarding_skipped", { step: key });
    else track("onboarding_step", { step: key, ms: Date.now() - stepT0 });
  }

  function advance(nextAnswers) {
    if (step + 1 < STEPS.length) setStep(step + 1);
    else finish(nextAnswers);
  }

  function pick(opt) {
    if (sel) return; // mid-advance
    setSel(opt);
    recordStep(s.key);
    setTimeout(() => {
      const next = { ...answers, [s.key]: opt };
      setAnswers(next); setSel(null);
      advance(next);
    }, 220);
  }

  function toggleInterest(opt) {
    recordStep(s.key, false);
    const cur = answers.interests || [];
    if (cur.includes(opt)) { setAnswers({ ...answers, interests: cur.filter((x) => x !== opt) }); return; }
    if (cur.length >= 3) return; // cap; the row stays selectable-looking but inert
    setAnswers({ ...answers, interests: [...cur, opt] });
  }

  function addCustom() {
    const v = elseVal.trim().slice(0, 40);
    if (!v) return;
    recordStep(s.key);
    setElseOpen(false); setElseVal("");
    const nextCustom = { ...custom, [s.key]: v };
    setCustom(nextCustom);
    if (s.key === "interests") {
      const next = { ...answers, interests: [...(answers.interests || []), v] };
      setAnswers(next);
      return; // multi step: no auto-advance
    }
    const mapped = s.key === "context" ? mapCustomContext(v) : s.key === "spendStyle" ? mapCustomSpend(v) : null;
    const val = mapped || "Custom";
    const next = { ...answers, [s.key]: val };
    setAnswers(next); setSel(v);
    setTimeout(() => { setSel(null); advance(next); }, 220);
  }

  function skipStep() {
    recordStep(s.key, true);
    const next = { ...answers, [s.key]: s.multi ? (answers.interests || []) : null };
    setAnswers(next);
    advance(next);
  }

  function back() { if (step > 0) setStep(step - 1); }

  function buildProfile(nextAnswers, customNow, nameNow) {
    const personaId = personaIdOf(nextAnswers);
    return {
      name: (nameNow || "").slice(0, 40),
      answers: {
        context: nextAnswers.context || null,
        interests: nextAnswers.interests || [],
        spendStyle: nextAnswers.spendStyle || null,
        ageBand: nextAnswers.ageBand || null,
      },
      custom: customNow || {},
      personaId,
      createdAt: Date.now(),
    };
  }

  function finish(nextAnswers, customNow) {
    const prof = buildProfile(nextAnswers, customNow, nameRef.current);
    try { localStorage.setItem("askcart_profile_v1", JSON.stringify(prof)); } catch {}
    const persona = {
      context: prof.answers.context,
      ageBand: prof.answers.ageBand,
      spendStyle: prof.answers.spendStyle,
      interests: prof.answers.interests,
      userType: null,
      forWhom: prof.answers.context,
      budgetStyle: prof.answers.spendStyle,
      shopStyle: prof.answers.spendStyle,
      personaId: prof.personaId,
    };
    setPersona(persona);
    track("onboarding_complete", {
      context: persona.context, ageBand: persona.ageBand,
      spendStyle: persona.spendStyle, interests: persona.interests,
      forWhom: persona.forWhom, budgetStyle: persona.budgetStyle, shopStyle: persona.shopStyle,
      personaId: prof.personaId,
      custom: Object.keys(customNow || {}),
      ms: Date.now() - t0,
    });
    setProfile(prof);
    setPersonaDone(persona);
    setDone(true);
  }

  function skipSetup() {
    recordStep("setup", true);
    finish(answers, custom);
  }

  // ---- completion screen ----
  if (done) {
    const n = (profile.name || "").trim();
    return (
      <div className="ob3" role="dialog" aria-modal="true" aria-label={t(lang, "obTitle")}>
        <div className="ob3-done-wrap">
          <svg className="ob3-check" width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
            <circle cx="36" cy="36" r="32" fill="none" stroke="var(--success)" strokeWidth="4" className="ob3-check-ring" />
            <path d="M22 37 l10 10 l18 -20" fill="none" stroke="var(--success)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" className="ob3-check-mark" />
          </svg>
          <h2 className="ob3-done-h">{t(lang, "obAllSet", { name: n ? ", " + n : "" })}</h2>
          {profile.personaId && (
            <span className="ob3-persona" title={t(lang, "obPersonaChip")}>
              <I name="sparkle" size={13} /> {profile.personaId}
            </span>
          )}
          <div className="ob3-done-btns">
            <button className="ob3-primary ob3-lg" onClick={() => onDone({ profile, persona: personaDone })}>{t(lang, "obStartShopping")}</button>
            <button className="ob3-ghost ob3-lg" onClick={() => { onTryAssistant && onTryAssistant(); onDone({ profile, persona: personaDone }); }}>{t(lang, "obTryAssistant")}</button>
          </div>
        </div>
      </div>
    );
  }

  const needsCta = s.key === "name" || s.multi;
  return (
    <div className="ob3" role="dialog" aria-modal="true" aria-label={t(lang, "obTitle")}>
      <div className={"ob3-shell" + (mobile ? " ob3-mob" : "")}>
        {!mobile && (
          <div className="ob3-brand" aria-hidden="true">
            <div className="ob3-logo"><span className="ob3-mark">A</span> Ask<span>Cart</span></div>
            <h2 className="ob3-headline">{t(lang, "obHeadline")}</h2>
            <p className="ob3-sub">{t(lang, "obSub")}</p>
            <ul className="ob3-trust">
              <li><I name="shield-check" size={16} /> {t(lang, "trust1")}</li>
              <li><I name="globe" size={16} /> {t(lang, "trust2")}</li>
              <li><I name="check-circle" size={16} /> {t(lang, "trust3")}</li>
            </ul>
            <div className="ob3-tiles">
              <span className="ob3-tile ob3-tile-fashion"><I name="eye" size={22} /> Fashion</span>
              <span className="ob3-tile ob3-tile-electronics"><I name="smartphone" size={22} /> Electronics</span>
              <span className="ob3-tile ob3-tile-home"><I name="home" size={22} /> Home</span>
            </div>
          </div>
        )}
        <div className="ob3-form">
          <div className="ob3-formtop">
            {mobile && <span className="ob3-mobmark">A</span>}
            <span className="ob3-seg" role="group" aria-label="Language">
              {[["en", "EN"], ["hi", "\u0939\u093f\u0902"], ["hinglish", "Hing"]].map(([id, lbl]) => (
                <button key={id} className={lang === id ? "on" : ""} onClick={() => setLang && setLang(id)}>{lbl}</button>
              ))}
            </span>
            <span className="ob3-spacer" />
            <span className="ob3-progress" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label={t(lang, "obStep", { n: step + 1, m: STEPS.length })}>
              {STEPS.map((st, i) => <i key={st.key} className={i <= step ? "on" : ""} />)}
            </span>
            <button className="ob3-back" onClick={back} disabled={step === 0}><I name="arrow-left" size={14} /> {t(lang, "obBack")}</button>
            <button className="ob3-skipsetup" onClick={skipSetup}>{t(lang, "obSkipSetup")}</button>
          </div>
          <div className="ob3-step" key={step}>
            <div className="ob3-icon" aria-hidden="true"><I name={s.icon} size={26} /></div>
            <h3 className="ob3-q">{t(lang, s.tk)}</h3>
            {s.tks && <p className="ob3-qsub">{t(lang, s.tks)}</p>}
            {s.key === "name" ? (
              <div className="ob3-name">
                <input className="ob3-input" value={name} maxLength={40} autoFocus
                       placeholder={t(lang, "obNamePh")} aria-label={t(lang, "obName")}
                       onChange={(e) => { setName(e.target.value); nameRef.current = e.target.value; }}
                       onKeyDown={(e) => e.key === "Enter" && (recordStep("name"), advance(answers))} />
                <div className="ob3-name-cta">
                  <button className="ob3-primary" onClick={() => { recordStep("name"); advance(answers); }}>{t(lang, "obContinue")}</button>
                  <button className="ob3-linkbtn" onClick={() => { recordStep("name", true); advance(answers); }}>{t(lang, "obGuest")}</button>
                </div>
              </div>
            ) : (
              <div className="ob3-opts" role={s.multi ? "group" : "radiogroup"}>
                {s.opts.map((o, i) => {
                  const isSel = s.multi ? (answers.interests || []).includes(o) : sel === o;
                  const span2 = s.grid && o === "A mix of all";
                  const capReached = s.multi && !isSel && (answers.interests || []).length >= 3;
                  return (
                    <button key={o} role={s.multi ? "checkbox" : "radio"}
                            aria-checked={isSel}
                            className={"ob3-card" + (isSel ? " sel" : "") + (span2 ? " span2" : "") + (capReached ? " capped" : "")}
                            onClick={() => (s.multi ? toggleInterest(o) : pick(o))}>
                      <span className="ob3-card-ic" aria-hidden="true"><I name={s.optIcons[o] || "check"} size={22} /></span>
                      <span className="ob3-card-t">{t(lang, s.optT[i])}</span>
                      {isSel && <I name="check" size={16} className="ob3-card-chk" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            )}
            {s.key !== "name" && (
              <div className="ob3-else">
                {!elseOpen ? (
                  <button className="ob3-linkbtn" onClick={() => setElseOpen(true)}>+ {t(lang, "obElse")}</button>
                ) : (
                  <span className="ob3-else-row">
                    <input className="ob3-input ob3-input-sm" value={elseVal} maxLength={40} autoFocus
                           aria-label={t(lang, "obElse")}
                           onChange={(e) => setElseVal(e.target.value)}
                           onKeyDown={(e) => e.key === "Enter" && addCustom()} />
                    <button className="ob3-primary ob3-sm" onClick={addCustom}>{t(lang, "obAdd")}</button>
                  </span>
                )}
              </div>
            )}
            {s.multi && (
              <div className="ob3-name-cta">
                <button className="ob3-primary" onClick={() => { recordStep("interests"); advance(answers); }}>{t(lang, "obContinue")}</button>
                <span className="ob3-meta">{(answers.interests || []).length}/3</span>
              </div>
            )}
          </div>
          <div className="ob3-bottom">
            <button className="ob3-linkbtn" onClick={skipStep}>{t(lang, "obSkipStep")}</button>
            {needsCta && !mobile ? null : null}
          </div>
          {mobile && needsCta && (
            <div className="ob3-mobcta">
              {s.key === "name"
                ? <button className="ob3-primary ob3-lg" onClick={() => { recordStep("name"); advance(answers); }}>{t(lang, "obContinue")}</button>
                : <button className="ob3-primary ob3-lg" onClick={() => { recordStep("interests"); advance(answers); }}>{t(lang, "obContinue")}</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
