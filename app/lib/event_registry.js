// AskCart event registry (2026-11-08, update-prompt section 2).
//
// Single source of truth for "which event types exist". The Analytics
// Overview renders an Event types table from this registry joined with
// the live counts map, so EVERY schema event is visible somewhere in
// Analytics (brief: "every event type in docs/event_schema.md must be
// counted or displayed"). scripts/check-analytics-coverage.mjs fails CI
// if an event in the schema has no registry row.
//
// family drives the feed chip colour (search/cart/guide/chat/ai/system)
// and is the single classification point (analytics.jsx falls back to it).

export const EVENT_FAMILIES = {
  search: "brand",
  cart: "success",
  guide: "guide",
  chat: "brand",
  ai: "guide",
  error: "danger",
  system: "neutral",
};

export const EVENTS = {
  // session / shell
  session_start: { label: "Session start", family: "system" },
  page_view: { label: "Page view", family: "system" },
  language_change: { label: "Language change", family: "system" },
  region_set: { label: "Pincode / region set", family: "system" },
  ui_error: { label: "UI error", family: "error" },
  onboarding_strip_dismissed: { label: "Onboarding strip dismissed", family: "system" },
  // onboarding
  onboarding_start: { label: "Onboarding started", family: "guide" },
  onboarding_step: { label: "Onboarding step", family: "guide" },
  onboarding_complete: { label: "Onboarding complete", family: "guide" },
  onboarding_skipped: { label: "Onboarding skipped", family: "guide" },
  // search
  search_start: { label: "Search submitted", family: "search" },
  search_results: { label: "Search results shown", family: "search" },
  zero_result: { label: "Null search (<2 on-intent)", family: "search" },
  search_error: { label: "Search error", family: "error" },
  search_suggest_select: { label: "Suggestion selected", family: "search" },
  suggest_select: { label: "Suggestion selected (legacy)", family: "search" },
  search_to_ask_switch: { label: "Search switched to Ask", family: "chat" },
  resolved: { label: "Journey resolved", family: "search" },
  unresolved: { label: "Journey unresolved", family: "search" },
  journey_end: { label: "Journey ended", family: "search" },
  show_more: { label: "Show more", family: "search" },
  demand_signal: { label: "Demand signal (dead-end)", family: "search" },
  // guide loop
  guide_question_shown: { label: "Guide question shown", family: "guide" },
  guide_option_selected: { label: "Guide option picked", family: "guide" },
  guide_typed_answer: { label: "Guide typed answer", family: "guide" },
  guide_skipped: { label: "Guide skipped", family: "guide" },
  guide_no_question: { label: "No question left", family: "guide" },
  filter_applied: { label: "Filter applied", family: "guide" },
  filter_sheet_open: { label: "Filter sheet opened", family: "guide" },
  constraint_removed: { label: "Constraint removed", family: "guide" },
  view_density_change: { label: "View density changed", family: "system" },
  quick_view_open: { label: "Quick view opened", family: "search" },
  // products / PDP
  product_impression: { label: "Product impression (legacy)", family: "search" },
  product_view: { label: "Product viewed", family: "search" },
  product_open: { label: "Product opened (PDP)", family: "search" },
  pdp_close: { label: "PDP closed (dwell)", family: "search" },
  variant_select: { label: "Variant selected", family: "guide" },
  pdp_ask: { label: "Ask from PDP", family: "chat" },
  // cart / checkout / orders
  add_to_cart: { label: "Added to cart", family: "cart" },
  remove_from_cart: { label: "Removed from cart", family: "cart" },
  cart_view: { label: "Cart opened", family: "cart" },
  move_all_to_cart: { label: "Move all to cart", family: "cart" },
  buy_now: { label: "Buy now (legacy)", family: "cart" },
  buy_now_click: { label: "Buy now", family: "cart" },
  recommendation_click: { label: "Recommendation clicked", family: "cart" },
  checkout_start: { label: "Checkout started", family: "cart" },
  checkout_step_view: { label: "Checkout step viewed", family: "cart" },
  checkout_step_complete: { label: "Checkout step completed", family: "cart" },
  demo_order_shortcut: { label: "Demo order shortcut", family: "cart" },
  order_complete: { label: "Order placed", family: "cart" },
  order_confirm_view: { label: "Confirmation viewed", family: "cart" },
  reorder_click: { label: "Buy again", family: "cart" },
  outcome_feedback: { label: "Outcome micro-survey", family: "system" },
  back_to_top: { label: "Back to top", family: "system" },
  // home / nav / wishlist
  nav_category_click: { label: "Category nav clicked", family: "search" },
  occasion_tile_click: { label: "Occasion tile clicked", family: "search" },
  budget_tile_click: { label: "Budget tile clicked", family: "search" },
  brand_tile_click: { label: "Brand wordmark clicked", family: "search" },
  wishlist_add: { label: "Wishlisted", family: "cart" },
  wishlist_remove: { label: "Wishlist removed", family: "cart" },
  save_for_later: { label: "Saved for later", family: "cart" },
  // assistant (chat)
  chat_open: { label: "Chat opened", family: "chat" },
  chat_close: { label: "Chat closed", family: "chat" },
  chat_nudge_shown: { label: "Chat nudge shown", family: "chat" },
  chat_nudge_dismissed: { label: "Chat nudge dismissed", family: "chat" },
  chat_nudge_accepted: { label: "Chat nudge accepted", family: "chat" },
  chat_user_message: { label: "Chat user message", family: "chat" },
  chat_intent: { label: "Chat intent resolved", family: "chat" },
  chat_tool_call: { label: "Chat tool call", family: "chat" },
  chat_response: { label: "Chat reply", family: "chat" },
  chat_fallback: { label: "Chat fallback", family: "error" },
  chat_question_shown: { label: "Chat question shown", family: "guide" },
  chat_question_answered: { label: "Chat question answered", family: "guide" },
  chat_card_click: { label: "Chat card tapped", family: "chat" },
  chat_add_to_cart: { label: "Chat add to cart", family: "cart" },
  chat_apply_to_results: { label: "Chat applied to results", family: "guide" },
  chat_feedback: { label: "Chat feedback", family: "chat" },
  chat_error: { label: "Chat error", family: "error" },
  chat_prompt_shown: { label: "Proactive prompt shown", family: "chat" },
  chat_prompt_click: { label: "Proactive prompt clicked", family: "chat" },
  chat_prompt_dismiss: { label: "Proactive prompt dismissed", family: "chat" },
  chat_peek_shown: { label: "Reply peek bubble shown", family: "chat" },
  chat_seeded_action: { label: "Seeded chat action", family: "chat" },
  chat_action_executed: { label: "Agentic action executed", family: "cart" },
  // AI routing
  ai_call: { label: "AI call (plan/refine/phrasing)", family: "ai" },
  ai_key_exhausted: { label: "Gemini key rotated", family: "ai" },
};

export function eventFamily(type) {
  return (EVENTS[type] && EVENTS[type].family) || "system";
}
export function eventLabel(type) {
  return (EVENTS[type] && EVENTS[type].label) || type;
}
export function eventNames() {
  return Object.keys(EVENTS);
}
