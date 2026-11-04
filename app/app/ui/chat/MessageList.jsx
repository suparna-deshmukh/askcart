"use client";
// role="log" message stream with smart autoscroll: follows the bottom unless
// the user has scrolled up, in which case a "New message" pill appears.
import { useEffect, useRef, useState } from "react";
import { Message } from "./Message";

export function MessageList({ messages, busy, onChip, onAdd, onOpen, onFeedback, feedbackDone, onRetry, onSendText, context }) {
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
                 onFeedback={onFeedback} feedbackDone={feedbackDone} onRetry={onRetry} />
      ))}
      {pill && (
        <button className="cht-newpill" onClick={() => { const el = ref.current; if (el) { el.scrollTop = el.scrollHeight; nearBottom.current = true; } setPill(false); }}>
          New message ↓
        </button>
      )}
    </div>
  );
}

function EmptyState({ onSuggest, context }) {
  const isPdp = !!(context && context.sku);
  const hero = ["Gift under ₹2000", "Diwali decorations", "Phone under ₹15k", "Wristwatch for dad under 5k"];
  const pdp = ["Is this a good gift?", "How is the rating?", "Is the price fair?"];
  const sugs = isPdp ? pdp : hero;
  return (
    <div className="cht-empty">
      <div className="cht-empty-greet">
        Hi, I'm the AskCart assistant. I can search, compare, and explain products - answers come only from the demo catalogue.
      </div>
      <div className="cht-empty-sug">Try one of these:</div>
      <div className="cht-chips">
        {sugs.map((s) => (
          <button key={s} className="cht-chip" onClick={() => onSuggest && onSuggest(s)}>{s}</button>
        ))}
      </div>
      <div className="cht-empty-disc">AI assistant · demo catalogue · can be wrong</div>
    </div>
  );
}
