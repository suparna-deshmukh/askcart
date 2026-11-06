"use client";
import { useEffect, useState } from "react";
import { Overlay } from "./kit/Overlay";
import { I } from "./kit/Icon";
import { track, setPersona } from "../lib/track";
import { t } from "../lib/i18n";

// O5: the 3-question persona now lives behind /?onboard=1 (it is not on the
// first-visit path — O1). Double-barrelled options were split; every answer
// has a visible payoff (toast on completion) and wired behaviour:
//  - spendStyle -> recommendScore() ordering + "flexible budget" default
//  - context=Gifting -> occasion-first question ordering (guide.js)
//  - userType=Student -> budget options one step lower (guide.js)
//  - Senior -> larger text mode; all answers -> cohort segmentation
// Phase 7 (brief §12): Overlay modal (desktop) / bottom sheet (mobile),
// 3-segment progress bar, Back, card options with per-option icons,
// select -> 220ms auto-advance. Tracking + payload unchanged.
const STEPS = [
  { key: "context", icon: "bag",
    tk: "obCtx", tks: "obCtxSub",
    label: "What are you mostly shopping for?",
    sub: "One tap — we calibrate the follow-up questions around it. You can always mix it later.",
    opts: ["Myself", "Family & kids", "Gifting", "Home & appliances", "A mix of all"],
    optT: ["obMyself", "obFamily", "obGifting", "obHome", "obMix"],
    grid: true,
    optIcons: { "Myself": "user", "Family & kids": "heart", "Gifting": "gift", "Home & appliances": "home", "A mix of all": "layers" } },
  { key: "ageBand", icon: "cake",
    tk: "obAge", tks: "obAgeSub",
    label: "How old are you?",
    sub: "Helps us match styles, sizes and question order. Never shown to anyone.",
    opts: ["Under 25", "25\u201340", "40+"],
    optT: ["obU25", "ob2540", "ob40"],
    grid: false,
    optIcons: { "Under 25": "sparkle", "25\u201340": "user", "40+": "heart" } },
  { key: "spendStyle", icon: "wallet",
    tk: "obSpend", tks: "obSpendSub",
    label: "How do you usually decide what's worth buying?",
    sub: "Your budget changes with the product — this tells us your default bar, not a cap.",
    opts: ["Best price — I compare a lot", "Good quality at a fair price",
           "Brand matters most", "Premium, if it's worth it"],
    optT: ["obPrice", "obQuality", "obBrandMost", "obPremium"],
    grid: false,
    optIcons: { "Best price — I compare a lot": "wallet", "Good quality at a fair price": "badge-check",
                "Brand matters most": "shield-check", "Premium, if it's worth it": "star" } },
];

// spendStyle -> default budget cap used when the shopper picks
// "Not sure / flexible" on a budget follow-up (null = no cap).
// O3: these caps are ONLY applied when the shopper explicitly taps
// "Not sure / flexible" on a budget question, and the applied default is
// echoed as a removable trail chip (O4). They are never silent.
export const BUDGET_STYLE_MAX = {
  "Best price — I compare a lot": 2000,
  "Good quality at a fair price": 5000,
  "Brand matters most": 8000,
  "Premium, if it's worth it": null,
};
// spendStyle -> expected price multiplier around the cap (recommender).
export const SPEND_BIAS = {
  "Best price — I compare a lot": 0.8,
  "Good quality at a fair price": 1.0,
  "Brand matters most": 1.1,
  "Premium, if it's worth it": 1.25,
};
// spendStyle -> weight given to branded products in the recommender.
export const SPEND_BRAND_AFFINITY = {
  "Best price — I compare a lot": 0.3,
  "Good quality at a fair price": 0.5,
  "Brand matters most": 1.0,
  "Premium, if it's worth it": 0.9,
};

export function Onboarding({ onDone, lang }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [sel, setSel] = useState(null);
  const [t0] = useState(() => Date.now());
  const [mobile, setMobile] = useState(false);
  const s = STEPS[step];

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const f = () => setMobile(mq.matches);
    f();
    mq.addEventListener ? mq.addEventListener("change", f) : mq.addListener(f);
    return () => mq.removeEventListener ? mq.removeEventListener("change", f) : mq.removeListener(f);
  }, []);

  function pick(opt) {
    if (sel) return; // mid-advance
    setSel(opt);
    setTimeout(() => {
      const next = { ...answers, [s.key]: opt };
      setSel(null);
      if (step + 1 < STEPS.length) { setAnswers(next); setStep(step + 1); }
      else finish(next);
    }, 220);
  }

  function finish(next) {
    const persona = {
      context: next.context || null,
      ageBand: next.ageBand || null,
      spendStyle: next.spendStyle || null,
      userType: null, // replaced by ageBand (2026-11-06 first-visit flow)
      // back-compat keys (old cohort format is shopping-for × style)
      forWhom: next.context || null,
      budgetStyle: next.spendStyle || null,
      shopStyle: next.spendStyle || null,
    };
    setPersona(persona);
    track("onboarding_complete", {
      context: persona.context, ageBand: persona.ageBand,
      spendStyle: persona.spendStyle, forWhom: persona.forWhom,
      budgetStyle: persona.budgetStyle, shopStyle: persona.shopStyle,
      ms: Date.now() - t0,
    });
    onDone(persona);
  }

  function skip() {
    track("onboarding_skipped", { step });
    onDone(null);
  }

  function back() {
    if (step > 0) setStep(step - 1); // answers kept
  }

  return (
    <Overlay variant={mobile ? "sheet" : "modal"} label={t(lang, "obTitle")} onClose={skip} width={560}>
      <div className="ob2">
        <div className="ob2-top">
          <button className="ob2-back" onClick={back} disabled={step === 0}>
            <I name="arrow-left" size={14} /> {t(lang, "obBack")}
          </button>
          <span className="ob2-count">{t(lang, "obCount", { n: step + 1, m: STEPS.length })}</span>
          <button className="ob2-skip" onClick={skip}>{t(lang, "skip")}</button>
        </div>
        <div className="ob2-progress" aria-hidden="true"><span style={{ width: ((step + 1) / STEPS.length * 100) + "%" }} /></div>
        <div className="ob2-icon" aria-hidden="true"><I name={s.icon} size={24} /></div>
        <h2 className="ob2-q">{t(lang, s.tk)}</h2>
        {s.sub && <p className="ob2-sub">{t(lang, s.tks)}</p>}
        <div className={"ob-opts ob2-opts" + (s.grid ? " ob2-grid" : " ob2-rows")}>
          {s.opts.map((o, i) => {
            const span2 = s.grid && o === "A mix of all";
            return (
              <button key={o} className={"ob2-card" + (sel === o ? " sel" : "") + (span2 ? " span2" : "")}
                      aria-pressed={sel === o} onClick={() => pick(o)}>
                <span className="ob2-card-ic" aria-hidden="true"><I name={s.optIcons[o] || "check"} size={20} /></span>
                <span className="ob2-card-t">{t(lang, s.optT[i])}</span>
                {sel === o && <I name="check" size={16} className="ob2-card-chk" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </div>
    </Overlay>
  );
}
