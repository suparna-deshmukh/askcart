"use client";
import { useState } from "react";
import { track, setPersona } from "../lib/track";

// O5: the 3-question persona now lives behind /?onboard=1 (it is not on the
// first-visit path — O1). Double-barrelled options were split; every answer
// has a visible payoff (toast on completion) and wired behaviour:
//  - spendStyle -> recommendScore() ordering + "flexible budget" default
//  - context=Gifting -> occasion-first question ordering (guide.js)
//  - userType=Student -> budget options one step lower (guide.js)
//  - Senior -> larger text mode; all answers -> cohort segmentation
const STEPS = [
  { key: "userType",
    label: "Which describes you best?",
    sub: "We use this to calibrate questions and recommendations — never to show ads.",
    opts: ["Student", "Working professional", "Homemaker",
           "Senior (60+)", "Buying for my family"] },
  { key: "spendStyle",
    label: "How do you usually decide what's worth buying?",
    sub: "Your budget changes with the product — this tells us your default bar, not a cap.",
    opts: ["Best price — I compare a lot", "Good quality at a fair price",
           "Brand matters most", "Premium, if it's worth it"] },
  { key: "context",
    label: "What are you mostly shopping for?",
    sub: "One tap — you can always mix it later.",
    opts: ["Myself", "Family & kids", "Gifting", "Home & appliances", "A mix of all"] },
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

export function Onboarding({ onDone }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [t0] = useState(() => Date.now());
  const s = STEPS[step];

  function pick(opt) {
    const next = { ...answers, [s.key]: opt };
    if (step + 1 < STEPS.length) {
      setAnswers(next);
      setStep(step + 1);
    } else {
      finish(next);
    }
  }

  function finish(next) {
    const persona = {
      userType: next.userType || null,
      spendStyle: next.spendStyle || null,
      context: next.context || null,
      // back-compat keys (old cohort format is shopping-for × style)
      forWhom: next.context || null,
      budgetStyle: next.spendStyle || null,
      shopStyle: next.spendStyle || null,
    };
    setPersona(persona);
    track("onboarding_complete", {
      userType: persona.userType, spendStyle: persona.spendStyle,
      context: persona.context, forWhom: persona.forWhom,
      budgetStyle: persona.budgetStyle, shopStyle: persona.shopStyle,
      ms: Date.now() - t0,
    });
    onDone(persona);
  }

  function skip() {
    track("onboarding_skipped", { step });
    onDone(null);
  }

  return (
    <div className="ob-wrap">
      <div className="ob">
        <div className="ob-head">
          <span className="ob-step">Set up your shopping profile · {step + 1}/{STEPS.length}</span>
          <button className="ob-skip" onClick={skip}>Skip for now</button>
        </div>
        <div className="ob-q">{s.label}</div>
        {s.sub && <div className="ob-sub">{s.sub}</div>}
        <div className="ob-opts">
          {s.opts.map((o) => <button key={o} onClick={() => pick(o)}>{o}</button>)}
        </div>
        <div className="ob-dots">{STEPS.map((_, i) => <span key={i} className={i <= step ? "on" : ""} />)}</div>
      </div>
    </div>
  );
}
