"use client";
// Client state for the AskCart assistant. Plain-JSON /api/chat (no SSE in
// Mode A); transcript persisted in sessionStorage (schema v1, cap 40).
import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "../../lib/track";

const LS_KEY = "askcart_chat_v1";
const MAX_MSGS = 40;
const MAX_LEN = 500;

function loadStore() {
  try {
    const v = JSON.parse(sessionStorage.getItem(LS_KEY) || "null");
    if (v && v.v === 1 && Array.isArray(v.messages)) return v;
  } catch {}
  return null;
}

let seq = 0;
function mid() { return "m_" + Date.now().toString(36) + (seq++).toString(36); }

export function useChat(ctx) {
  const storeRef = useRef(null);
  if (storeRef.current === null) storeRef.current = loadStore() || { state: null, messages: [] };
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(storeRef.current.messages);
  const [busy, setBusy] = useState(false);
  const openedAt = useRef(0);
  const outcome = useRef("none");
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const persist = useCallback((state, messages) => {
    storeRef.current = { state, messages: messages.slice(-MAX_MSGS) };
    try { sessionStorage.setItem(LS_KEY, JSON.stringify({ v: 1, ...storeRef.current })); } catch {}
  }, []);

  const push = useCallback((m) => {
    setMessages((ms) => {
      const next = [...ms, m].slice(-MAX_MSGS);
      persist(storeRef.current.state, next);
      return next;
    });
  }, [persist]);

  const clear = useCallback(() => {
    setMessages([]);
    persist(null, []);
  }, [persist]);

  const open = useCallback((source) => {
    if (openedAt.current === 0) openedAt.current = Date.now();
    setIsOpen(true);
    track("chat_open", { source: source || "hero", has_context: !!(ctxRef.current.context && (ctxRef.current.context.sku || ctxRef.current.context.query)) });
  }, []);
  const close = useCallback(() => {
    setIsOpen(false);
    const userTurns = storeRef.current.messages.filter((m) => m.role === "user").length;
    track("chat_close", { turns: userTurns, ms_open: openedAt.current ? Date.now() - openedAt.current : 0, outcome: outcome.current });
    openedAt.current = 0;
    outcome.current = "none";
  }, []);

  // 5C: every server action executes through the SAME page handlers the
  // buttons use (ctx callbacks) - no duplicate logic.
  const applyUiActions = useCallback((actions, reply) => {
    for (const a of actions || []) {
      const c = ctxRef.current;
      let done = false;
      if (a.action === "apply_search" && c.onApplySearch) {
        outcome.current = "results_applied";
        c.onApplySearch(a.query, a.opts || {}, { echo: a.echo || null, trailLabel: a.trailLabel || null });
        done = true;
      } else if (a.action === "add_to_cart" && c.onAddToCart) {
        outcome.current = "cart";
        c.onAddToCart(a.sku, reply);
        done = true;
      } else if (a.action === "buy_now" && c.onBuyNow) {
        outcome.current = "buy_now";
        c.onBuyNow(a.sku);
        done = true;
      } else if (a.action === "open_product" && c.onOpenPdp) {
        c.onOpenPdp(a.sku);
        done = true;
      } else if (a.action === "open_cart" && c.onOpenCart) {
        c.onOpenCart();
        done = true;
      } else if (a.action === "remove_from_cart" && c.onRemoveFromCart) {
        c.onRemoveFromCart(a.sku);
        done = true;
      } else if (a.action === "add_to_wishlist" && c.onWishSku) {
        c.onWishSku(a.sku);
        done = true;
      }
      if (done) {
        track("chat_action_executed", { type: a.action, sku: a.sku || null });
        c.onActionExecuted && c.onActionExecuted(a);
      }
    }
  }, []);

  const fireEvents = useCallback((events) => {
    for (const e of events || []) {
      if (e && e.type) track(e.type, e.payload || {});
    }
  }, []);

  const doSend = useCallback(async (input, retried) => {
    const c = ctxRef.current;
    setBusy(true);
    const thinkingId = mid();
    const thinking = { id: thinkingId, role: "assistant", kind: "thinking" };
    push(thinking);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: storeRef.current.state || undefined,
          input,
          context: {
            sku: c.context && c.context.sku ? c.context.sku : null,
            source: c.context && c.context.source ? c.context.source : "hero",
            lastText: input.text || null,
            region: c.context && c.context.region ? c.context.region : null,
            query: c.context && c.context.query ? c.context.query : null,
            skus: Array.isArray(c.context && c.context.skus) ? c.context.skus.slice(0, 3) : null,
          },
        }),
      });
      const j = await r.json().catch(() => ({}));
      setMessages((ms) => {
        const next = ms.filter((m) => m.id !== thinkingId);
        persist(storeRef.current.state, next);
        return next;
      });
      if (!r.ok || !j.ok) {
        if (!retried && (r.status === 0 || r.status >= 500)) return doSend(input, true);
        push({ id: mid(), role: "system", kind: "error", text: "Couldn't reach AskCart. Retry", error: true });
        return;
      }
      persist(j.state, storeRef.current.messages);
      const asst = {
        id: mid(), role: "assistant", kind: "text",
        text: j.reply.text, act: j.reply.act, mode: j.reply.mode,
        components: j.reply.components || [], chips: j.reply.chips || [],
        ts: Date.now(),
      };
      push(asst);
      fireEvents(j.events);
      applyUiActions(j.reply.ui_actions, asst);
      if (!ctxRef.current.open && c.onClosedReply) c.onClosedReply(asst);
    } catch {
      setMessages((ms) => ms.filter((m) => m.id !== thinkingId));
      if (!retried) return doSend(input, true);
      push({ id: mid(), role: "system", kind: "error", text: "Couldn't reach AskCart. Retry", error: true });
    } finally {
      setBusy(false);
    }
  }, [push, persist, fireEvents, applyUiActions]);

  // 5C: messages queue while a reply is in flight; the composer is only
  // disabled for an empty input, and the page is never locked.
  const queueRef = useRef([]);
  const processingRef = useRef(false);

  const pump = useCallback(() => {
    if (processingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;
    processingRef.current = true;
    setBusy(true);
    doSend(next.input, false).finally(() => {
      setBusy(false);
      processingRef.current = false;
      if (queueRef.current.length) pump();
    });
  }, [doSend]);

  const enqueue = useCallback((input) => {
    queueRef.current.push({ input });
    pump();
  }, [pump]);

  const pushLocal = useCallback((m) => {
    // Client-only transcript entry (action chips): rendered in-thread but
    // never persisted (Undo handlers live in the page).
    setMessages((ms) => [...ms, m].slice(-MAX_MSGS));
  }, []);

  const sendText = useCallback((text) => {
    const t = String(text || "").trim().slice(0, MAX_LEN);
    if (!t) return;
    push({ id: mid(), role: "user", kind: "text", text: t, ts: Date.now() });
    track("chat_user_message", { len: t.length, lang: /[\u0900-\u097F]/.test(t) ? "hi" : /\b(ka|ki|ke|ko|hai|kya|mujhe|liye|wala)\b/i.test(t) ? "hinglish" : "en", type: "text", redacted: false });
    enqueue({ type: "text", text: t });
  }, [push, enqueue]);

  const sendChip = useCallback((chipId, label) => {
    push({ id: mid(), role: "user", kind: "chip", text: label || chipId, ts: Date.now() });
    track("chat_user_message", { len: (label || chipId).length, lang: "en", type: "chip", redacted: false });
    enqueue({ type: "chip", chip_id: chipId });
  }, [push, enqueue]);

  return {
    open, close, setOpen: setIsOpen,
    messages, busy, clear, sendText, sendChip, pushLocal,
  };
}
