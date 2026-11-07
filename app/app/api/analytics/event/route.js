import { NextResponse } from "next/server";
import { record } from "../../../../lib/analyticsStore";

// B2: hardening for a PUBLIC write endpoint that feeds the dashboard
// recruiters look at. Allowlist of event types (add new product events
// here), 4 KB body cap, 120 events/min per IP, malformed session ids
// dropped, HTML stripped from string values. Known types keep their
// schema-agnostic extra properties.

const ALLOWED = new Set([
  "session_start", "page_view",
  "onboarding_step", "onboarding_complete", "onboarding_skipped",
  "onboarding_strip_dismissed", "region_set", "language_change",
  "search_start", "search_results", "zero_result", "search_error",
  "guide_question_shown", "guide_option_selected", "guide_no_question",
  "guide_skipped", "guide_typed_answer",
  "filter_applied", "constraint_removed", "resolved", "unresolved",
  "journey_end",
  "product_impression", "product_view", "product_open", "pdp_close",
  "variant_select",
  "add_to_cart", "recommendation_click", "cart_view", "remove_from_cart",
  "buy_now", "checkout_start", "order_complete",
  "outcome_feedback", "demand_signal", "show_more",
  "suggest_select", "language_change",
  "nav_category_click", "occasion_tile_click", "budget_tile_click", "brand_tile_click",
  "search_suggest_select", "wishlist_add", "wishlist_remove",
  "view_density_change", "filter_sheet_open", "back_to_top", "quick_view_open", "pdp_ask",
  "checkout_step_view", "checkout_step_complete", "order_confirm_view", "reorder_click",
  "save_for_later", "move_all_to_cart", "buy_now_click", "demo_order_shortcut",
  "onboarding_start", "search_to_ask_switch",
  "chat_prompt_shown", "chat_prompt_click", "chat_prompt_dismiss",
  "chat_peek_shown", "chat_seeded_action", "chat_action_executed",
  "chat_open", "chat_close", "chat_nudge_shown", "chat_nudge_dismissed",
  "chat_nudge_accepted", "chat_user_message", "chat_intent",
  "chat_tool_call", "chat_response", "chat_fallback",
  "chat_question_shown", "chat_question_answered", "chat_card_click",
  "chat_add_to_cart", "chat_apply_to_results", "chat_feedback",
  "chat_error", "ui_error",
  "ai_call", "ai_key_exhausted",
]);

const MAX_BODY = 4096;
// A single tester can legitimately emit >120 events/min (onboarding + a
// full purchase pass); 300 keeps real sessions clean while still capping
// abuse. The allowlist + 4 KB body cap are the real guards.
const RATE_PER_MIN = 300;

// per-IP sliding window (in-memory; fine for prototype scale)
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  if (arr.length >= RATE_PER_MIN) { hits.set(ip, arr); return true; }
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return false;
}

function cleanStr(v) {
  if (typeof v !== "string") return v;
  return v.replace(/<[^>]*>/g, "").slice(0, 500);
}
function sanitize(payload) {
  if (payload && typeof payload === "object") {
    for (const [k, v] of Object.entries(payload)) {
      if (typeof v === "string") payload[k] = cleanStr(v);
      else if (v && typeof v === "object" && !Array.isArray(v)) {
        for (const [k2, v2] of Object.entries(v)) if (typeof v2 === "string") v[k2] = cleanStr(v2);
      }
    }
  }
  return payload;
}

export async function POST(req) {
  const raw = await req.text().catch(() => "");
  if (raw.length > MAX_BODY) return NextResponse.json({ ok: false, error: "body too large" }, { status: 413 });
  let body = null;
  try { body = JSON.parse(raw || "{}"); } catch { body = null; }
  if (!body || typeof body !== "object") return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });

  const ip = String(req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "local").split(",")[0].trim();
  if (rateLimited(ip)) return NextResponse.json({ ok: false, error: "rate limited" }, { status: 429 });

  const type = String(body.type || "").slice(0, 40);
  if (!ALLOWED.has(type)) return NextResponse.json({ ok: false, error: "unknown event type" }, { status: 400 });
  const payload = body.payload && typeof body.payload === "object" ? sanitize(body.payload) : {};
  const sid = payload.session_id;
  if (sid !== undefined && !/^s_[a-z0-9]{6,40}$/i.test(String(sid))) {
    return NextResponse.json({ ok: false, error: "bad session id" }, { status: 400 });
  }
  const env = body.env === "sim" ? "sim" : null;
  record(type, payload, env);
  return NextResponse.json({ ok: true });
}
