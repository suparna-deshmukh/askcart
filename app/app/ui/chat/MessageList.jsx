"use client";
// role="log" message stream with smart autoscroll: follows the bottom unless
// the user has scrolled up, in which case a "New message" pill appears.
import { useEffect, useRef, useState } from "react";
import { Message } from "./Message";
import { I } from "../kit/Icon";
import { t } from "../../lib/i18n";

export function MessageList({ lang, messages, busy, onChip, onAdd, onOpen, onFeedback, feedbackDone, onRetry, onSendText, context, onWish, wished }) {
  const ref = useRef(null);
  const nearBottom = useRef(true);
  const [pill, setPill] = useState(false);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    nearBottom.current = near;
    if (near) setPill(false);
  }
  useEffect(() => {
    const el = ref.current;
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight;
    else if (messages.length && messages[messages.length - 1].role !== "user") setPill(true);
  }, [messages]);

  const lastAsst = [...messages].reverse().find((m) => m.role === "assistant" && m.kind !== "thinking");
  return (
    <div className="cht-body" ref={ref} onScroll={onScroll} role="log" aria-live="polite" aria-label={t(lang, "chtAriaMsgs")}>
      {messages.length === 0 && (
        <EmptyState lang={lang} onSuggest={(send) => onSendText && onSendText(send)} context={context} />
      )}
      {messages.map((m) => (
        <Message lang={lang} key={m.id} m={m} latest={m.id === lastAsst?.id} busy={busy}
                 onChip={onChip} onAdd={onAdd} onOpen={onOpen}
                 onFeedback={onFeedback} feedbackDone={feedbackDone} onRetry={onRetry}
                 onWish={onWish} wished={wished} />
      ))}
      {pill && (
        <button className="cht-newpill" onClick={() => { const el = ref.current; if (el) { el.scrollTop = el.scrollHeight; nearBottom.current = true; } setPill(false); }}>
          {t(lang, "chtNewMsg")} ↓
        </button>
      )}
    </div>
  );
}

// Display labels are translated; the sent text stays canonical English so
// intent parsing and the eval gates see identical input regardless of UI language.
const HERO_CARDS = [
  { icon: "gift", tk: "chtCardGift", send: "Gift under ₹2000" },
  { icon: "party", tk: "chtCardDiwali", send: "Diwali decorations" },
  { icon: "smartphone", tk: "chtCardPhone", send: "Phone under ₹15k" },
  { icon: "clock", tk: "chtCardWatch", send: "Wristwatch for dad under 5k" },
];
const PDP_CARDS = [
  { icon: "gift", tk: "askGift", send: "Is this a good gift?" },
  { icon: "star", tk: "chtQRating", send: "How is the rating?" },
  { icon: "wallet", tk: "chtQPrice", send: "Is the price fair?" },
  { icon: "chat", tk: "chtQCompare", send: "Compare with similar items" },
];

function EmptyState({ lang, onSuggest, context }) {
  const isPdp = !!(context && context.sku);
  const cards = isPdp ? PDP_CARDS : HERO_CARDS;
  return (
    <div className="cht-empty">
      <div className="cht-empty-spark" aria-hidden="true"><I name="sparkle" size={30} /></div>
      <div className="cht-empty-greet">
        {t(lang, "chtGreet")}
      </div>
      <div className="cht-empty-cards">
        {cards.map((c) => (
          <button key={c.tk} className="cht-empty-card" onClick={() => onSuggest && onSuggest(c.send)}>
            <I name={c.icon} size={17} aria-hidden="true" />
            <span>{t(lang, c.tk)}</span>
          </button>
        ))}
      </div>
      <div className="cht-empty-disc">{t(lang, "chtDisc")}</div>
    </div>
  );
}
