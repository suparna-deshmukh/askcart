"use client";
// Assistant panel: desktop dock (400px right) / mobile bottom sheet.
// role: complementary (desktop) / dialog (mobile sheet); focus moves to the
// composer on open and back to the launcher on close; Esc closes.
import { useEffect, useRef, useState } from "react";
import { useChat } from "./useChat";
import { I } from "../kit/Icon";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";
import { track } from "../../lib/track";
import { t } from "../../lib/i18n";
import "./chat.css";

export function ChatPanel({ open, onClose, context, onApplySearch, onAddToCart, onOpenPdp, onOpenCart, itemPool, onPromptConsumed, aiLive, onWish, wished, lang, persona, profileName }) {
  const chat = useChat({ context, onApplySearch, onAddToCart, onOpenPdp, onOpenCart, itemPool });
  const [mobile, setMobile] = useState(false);
  const composerRef = useRef(null);
  const panelRef = useRef(null);
  const [feedbackDone, setFeedbackDone] = useState({});
  const consumedPrompt = useRef(null);

  // Phase 5: PDP "Ask AskCart" chips pre-send a prompt (one-shot, nonce-keyed).
  useEffect(() => {
    const p = context && context.prompt;
    if (!p || p.nonce === consumedPrompt.current) return;
    consumedPrompt.current = p.nonce;
    const id = setTimeout(() => {
      chat.sendText(p.text);
      onPromptConsumed && onPromptConsumed();
    }, 250);
    return () => clearTimeout(id);
  }, [context && context.prompt && context.prompt.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const f = () => setMobile(mq.matches);
    f();
    mq.addEventListener ? mq.addEventListener("change", f) : mq.addListener(f);
    return () => mq.removeEventListener ? mq.removeEventListener("change", f) : mq.removeListener(f);
  }, []);

  // focus management
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const el = panelRef.current && panelRef.current.querySelector(".cht-input");
      if (el) el.focus();
    }, 120);
    return () => clearTimeout(t);
  }, [open]);

  // Esc closes the panel even when focus has not reached the composer yet
  // (the 120 ms focus race left Esc inert on body). While a kit Overlay is
  // open (cart drawer, quick view, checkout sheets) its own Esc handler
  // wins; we defer to it.
  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (e.key !== "Escape") return;
      if (document.querySelector(".kit-overlay")) return;
      onClose();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);

  function onKey(e) {
    if (e.key === "Escape") onClose();
    if (e.key === "Tab" && panelRef.current) {
      // light focus trap
      const focusables = panelRef.current.querySelectorAll("button, textarea, [href], input, [tabindex]:not([tabindex='-1'])");
      const list = [...focusables].filter((f) => !f.disabled && f.offsetParent !== null);
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  if (!open) return null;
  const role = mobile ? "dialog" : "complementary";
  const ariaLabel = t(lang, "chtAria");

  function handleFeedback(m, value, reason) {
    track("chat_feedback", { value, reason: reason || null });
    setFeedbackDone((f) => ({ ...f, [m.id]: true }));
  }
  function handleAdd(item, pos) {
    track("chat_add_to_cart", { sku: item.sku, position: pos || 0 });
    onAddToCart(item.sku);
  }
  function handleOpen(item, pos) {
    track("chat_card_click", { sku: item.sku, position: pos || 0 });
    onOpenPdp(item.sku);
  }

  return (
    <div
      className="cht-panel"
      ref={panelRef}
      role={role}
      aria-label={ariaLabel}
      aria-modal={mobile ? "true" : undefined}
      onKeyDown={onKey}
    >
      <span className="cht-handle" aria-hidden="true" />
      <div className="cht-header">
        <div className="cht-avatar" aria-hidden="true"><I name="sparkle" size={16} /></div>
        <div className="cht-head-txt">
          <span className="cht-head-title">{t(lang, "chtTitle")}</span>
          <span className="cht-head-sub">
            <span className={"cht-dot" + (aiLive ? " live" : " rules")} aria-hidden="true" />
            {aiLive ? t(lang, "chtSubAi") : t(lang, "chtSubRules")}
          </span>
        </div>
        <button className="cht-head-btn" onClick={() => { chat.clear(); }} title={t(lang, "chtClear")} aria-label={t(lang, "chtClear")}><I name="more-horizontal" size={18} /></button>
        <button className="cht-head-btn" onClick={onClose} aria-label={t(lang, "chtClose")}><I name="x" size={18} /></button>
      </div>
      <MessageList
        lang={lang}
        messages={chat.messages}
        busy={chat.busy}
        context={context}
        persona={persona}
        profileName={profileName}
        onChip={(id, label) => chat.sendChip(id, label)}
        onAdd={handleAdd}
        onOpen={handleOpen}
        onFeedback={handleFeedback}
        feedbackDone={feedbackDone}
        onSendText={(t) => chat.sendText(t)}
        onWish={onWish}
        wished={wished}
      />
      <Composer lang={lang} busy={chat.busy} onSend={(v) => chat.sendText(v)} disabled={false} />
    </div>
  );
}
