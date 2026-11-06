"use client";
// role="log" message stream with smart autoscroll: follows the bottom unless
// the user has scrolled up, in which case a "New message" pill appears.
import { useEffect, useRef, useState } from "react";
import { Message } from "./Message";
import { I } from "../kit/Icon";

export function MessageList({ messages, busy, onChip, onAdd, onOpen, onFeedback, feedbackDone, onRetry, onSendText, context, onWish, wished }) {
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
    <div className="cht-body" ref={ref} onScroll={onScroll} role="log" aria-live="polite" aria-label="Chat messages">
      {messages.length === 0 && (
        <EmptyState onSuggest={(t) => onSendText && onSendText(t)} context={context} />
      )}
      {messages.map((m) => (
        <Message key={m.id} m={m} latest={m.id === lastAsst?.id} busy={busy}
                 onChip={onChip} onAdd={onAdd} onOpen={onOpen}
                 onFeedback={onFeedback} feedbackDone={feedbackDone} onRetry={onRetry}
                 onWish={onWish} wished={wished} />
      ))}
      {pill && (
        <button className="cht-newpill" onClick={() => { const el = ref.current; if (el) { el.scrollTop = el.scrollHeight; nearBottom.current = true; } setPill(false); }}>
          New message ↓
        </button>
      )}
    </div>
  );
}

const HERO_CARDS = [
  { icon: "gift", text: "Gift under ₹2000" },
  { icon: "party", text: "Diwali decorations" },
  { icon: "smartphone", text: "Phone under ₹15k" },
  { icon: "clock", text: "Wristwatch for dad under 5k" },
];
const PDP_CARDS = [
  { icon: "gift", text: "Is this a good gift?" },
  { icon: "star", text: "How is the rating?" },
  { icon: "wallet", text: "Is the price fair?" },
  { icon: "chat", text: "Compare with similar items" },
];

function EmptyState({ onSuggest, context }) {
  const isPdp = !!(context && context.sku);
  const cards = isPdp ? PDP_CARDS : HERO_CARDS;
  return (
    <div className="cht-empty">
      <div className="cht-empty-spark" aria-hidden="true"><I name="sparkle" size={30} /></div>
      <div className="cht-empty-greet">
        Hi, I'm the AskCart assistant. I can search, compare, and explain products - answers come only from the demo catalogue.
      </div>
      <div className="cht-empty-cards">
        {cards.map((c) => (
          <button key={c.text} className="cht-empty-card" onClick={() => onSuggest && onSuggest(c.text)}>
            <I name={c.icon} size={17} aria-hidden="true" />
            <span>{c.text}</span>
          </button>
        ))}
      </div>
      <div className="cht-empty-disc">AI assistant · demo catalogue · can be wrong</div>
    </div>
  );
}
