# AskCart Event Schema

One event type per user action, stable properties, session + journey
correlation. The store (`app/lib/analyticsStore.js`) and dashboard
(`app/app/ui/analytics.jsx`) are schema-agnostic: **any new event type or
property added to the product is captured, persisted and rendered
automatically** (the dashboard iterates live counters and the event stream,
nothing is hardcoded).

All events carry (added client-side, `app/app/lib/track.js`):
- `session_id` — per-browser session (localStorage)
- `cohort` — `forWhom|shopStyle` from onboarding, or `no-persona`
- `ts` — client timestamp

## Events

| Event | Emitted when | Key properties |
|---|---|---|
| `session_start` | first page load of a browser session | `new` |
| `page_view` | tab / subtab switch | `screen` (search/analytics), `subtab` |
| `onboarding_step` | (reserved) step interaction | `step`, `answer`, `ms` |
| `onboarding_complete` | 3-question persona v2 done | `userType`, `spendStyle`, `context` (+ back-compat `forWhom`, `budgetStyle`, `shopStyle`), `ms` |
| `onboarding_skipped` | skip tapped | `step` |
| `search_start` | user submits a query | `query`, `source` (input/example/deep_link), `journey_id` |
| `search_results` | every /api/search response | `query`, `n_results` (raw count), `intent_n` (on-intent count), `ms`, `turn`, `relax`, `null` (true when `intent_n < 2` — the study's failed-search definition), `journey_id`, `semantic_used`, `semantic_added`, `semantic_ms`, `semantic_reason` (optional — present when the embedding fallback is active; see `docs/semantic_fallback.md`) |
| `zero_result` | a search returned <2 on-intent results | `query`, `turn`, `intent_n` |
| `search_error` | search request failed | `query`, `turn`, `error` |
| `guide_question_shown` | follow-up question shown | `query`, `question_type` (budget/occasion/category/brand), `turn`, `options_count`, `mode` (llm/policy/fallback), `refine` (true = optional refinement, not rescue), `reason` (policy rationale) |
| `guide_option_selected` | chip tapped | `query`, `question_type`, `option`, `turn`, `ttfc_ms` (time-to-first-click) |
| `guide_no_question` | policy exhausted (no question left) | `query`, `turn`, `reason` |
| `filter_applied` | mid-search filter changed (sort / brand / price band / rating / category / clear) | `query`, `turn`, `filter_type` (sort/brand/price_band/rating/category/clear), `value`, `n_before`, `n_after` (visible count before/after), `journey_id` |
| `resolved` | search reached ≥2 results | `query`, `turns`, `n_results`, `journey_id` |
| `unresolved` | 3 follow-ups exhausted, still <2 | `query`, `turns` |
| `journey_end` | journey closed (resolution, exhaustion, order, or new search) | `query`, `journey_id`, `turns`, `resolved`, `n_views`, `added_to_cart`, `ordered`, `ms` |
| `product_impression` | a product card rendered in a journey (legacy name `product_view` still accepted) | `sku`, `title`, `category`, `brand`, `price`, `rating`, `position`, `variant`, `lang`, `query`, `turn`, `source` (results/preview) |
| `add_to_cart` | Add-to-cart tapped | `sku`, `price`, `category`, `brand`, `cart_size`, `from` (results/preview/recommended), `query`, `journey_id` |
| `recommendation_click` | shopper acts on a "Recommended for you" top pick (add or buy-now) | `sku`, `query`, `brand`, `journey_id` |
| `cart_view` | cart drawer opened | `item_count`, `total` |
| `remove_from_cart` | qty − or delete | `sku`, `cart_size`, `price` |
| `buy_now` | Buy-now tapped (single-item express) | `sku`, `price`, `category`, `brand` |
| `checkout_start` | checkout entered (cart or buy-now) | `item_count`, `total`, `source` (cart/buy_now) |
| `order_complete` | prototype order placed | `order_id`, `item_count`, `total`, `source`, `items[]` |

### LLM routing (2026-11-06)

| Event | Emitted when | Key properties |
|---|---|---|
| `ai_call` | every AI decision (server-recorded on /api/guide and /api/ai-refine) | `kind` (plan/refine — `plan` is the one-call journey planner, fires once per journey; `cached:true` marks zero-LLM cache reads), `via` (gemini/rules), `key_idx` (Gemini key 0-based, null when not Gemini), `cached` (plan cache hit), `question` (refine: bool, false = filters-only), `ms`, `turn`, `session_id` |
| `ai_key_exhausted` | a Gemini key hit its daily cap / quota / invalid-key and the chain rotated | `key_idx`, `reason` (rpd/quota_or_auth/invalid_key), `kind` (planner/refine) |

Per-session rollups (searches, questions, answers, carts, orders, orderValue,
AI-engine mix, chat usage) feed the Analytics → **Backend (Admin)** sub-tab;
the Gemini key ledger itself (used/20 per key, exhaustion reason) is local
state shown in the top-bar pill, not an event. See `docs/llm_routing.md`.

### Home & wishlist (UI revamp Phase 2-3, 2026-11-06)

| Event | Emitted when | Key properties |
|---|---|---|
| `wishlist_add` | heart tapped on card / PDP (Phase 2) | `sku`, `wishlist_size` |
| `wishlist_remove` | removed from wishlist (Phase 2) | `sku`, `wishlist_size` |
| `nav_category_click` | home category tile tapped | `category`, `source` (home) |
| `occasion_tile_click` | home occasion card tapped | `occasion` (id), `query` |
| `budget_tile_click` | home budget pill tapped | `budget`, `query` |
| `brand_tile_click` | home brand wordmark tapped | `brand`, `source` (home) |

Phase 3/4 will add: `search_suggest_select`, `quick_view_open`, `view_density_change`,
`filter_sheet_open`, `checkout_step_view`, `checkout_step_complete`,
`order_confirm_view`, `reorder_click`, `back_to_top` (brief §18).

## Assistant (J10) events

Emitted by `app/app/ui/chat/useChat.js` (client) and
`app/lib/chat/dialog.js` (server, inside the `/api/chat` response
`events` array; relayed by the client). All are allowlisted in
`app/app/api/analytics/event/route.js`.

| Event | Emitted when | Key properties |
|---|---|---|
| `chat_open` | panel opened | `source` (hero/nudge/pdp), `has_context` |
| `chat_close` | panel closed | `turns`, `ms_open`, `outcome` (cart/results_applied/none) |
| `chat_nudge_shown` / `chat_nudge_dismissed` / `chat_nudge_accepted` | E1 escalation nudge lifecycle (once per session) | `trigger` (null_search), `query` |
| `chat_user_message` | shopper sends a message | `len`, `lang` (en/hi/hinglish), `type` (text/chip), `redacted` |
| `chat_intent` | every turn | `intent` (8 intents or `chip:*`), `via` (rules/llm), `confidence`, `ms_nlu` |
| `chat_response` | every reply | `act`, `mode` (template/llm), `ms_total`, `grounded`, `tokens_out` |
| `chat_fallback` | degradation | `reason` (grounding_fail/llm_timeout/breaker_open/rollback_guard) |
| `chat_question_shown` | assistant asks (guided or gift) | `type` (budget/occasion/brand/category/for_whom/size/capacity/gift:*), `via` |
| `chat_question_answered` | chip or typed answer | `type`, `via` (chip/typed/skip) |
| `chat_card_click` | "Details"/which-one tap in chat | `sku`, `position` |
| `chat_add_to_cart` | Add tapped on a chat card | `sku`, `position` |
| `chat_apply_to_results` | chat answer changed the page grid | `query`, `slots_changed`, `journey_id` |
| `chat_feedback` | per-reply thumbs | `value` (up/down), `reason` (wrong_product/too_expensive/no_trust/wrong_occasion/other) |
| `chat_error` | request failure | `code` |

The `demand_signal` event (shared with the page) is emitted when a chat
search dead-ends with no question left.

## Derived metrics (computed in `/api/analytics/summary`)

- **Funnel**: searches → searches with results → products viewed → cart adds → checkouts → orders, with step-to-step conversion %.
- **Failed-search (null) rate** = searches with <2 on-intent results / searches — the same "null" the n=150 study and the 3,000-query simulation report (a pile of loosely-related items with nothing on-intent counts as a null). **Search success** = 1 − null rate.
- **Top queries**: searches, nulls, resolved, avg turns, views, cart adds, orders per query.
- **Guide effectiveness**: questions asked per type + most-tapped options (tap-through = conversion of the guided step).
- **Filter usage**: applies per filter type + value (which refinements shoppers actually use mid-search).
- **Shopper profiles**: onboarding answer breakdowns (user type / spend style / context) — the persona cohorts that power the recommender.
- **Recommendation clicks**: actions taken on the persona-ranked "Recommended for you" strip (recommender CTR).
- **Journey turns**: resolved t1 / t2 / t3 / t4 / unresolved.
- **Category & brand engagement**: views + cart adds per category/brand (live from events, not the catalogue).
- **Cohorts**: journeys, resolved, cart adds, orders, order rate per onboarding cohort.
- **Orders**: last 10 with items, total, cohort, source, time.

## Simulation store

The large-scale simulation harness (`eval/simulate.py`) posts events with
`env: "sim"` into an isolated store (`.analytics-state.sim.json`, exposed at
`/api/analytics/summary?env=sim`) so synthetic volume never pollutes the
shared public dashboard; logs land in `logs/sim_*.jsonl`.

## Shell & onboarding (auxiliary events)

| Event | Emitted when | Key properties |
|---|---|---|
| `language_change` | shopper switches EN / हिं / Hinglish | `lang` |
| `region_set` | pincode captured in the strip (coarse region only — the pincode itself never leaves the browser) | `region` (coarse) |
| `onboarding_strip_dismissed` | first-visit strip collapsed | — |
| `onboarding_start` | full-screen first-visit onboarding shown (update-prompt §3) | `forced` (bool, `/?onboard=1`) |
| `onboarding_step` | step answered or skipped | `step` (name/context/interests/spendStyle/ageBand), `ms` |
| `show_more` | "Show more" expanded on a shelf / suggestion list | `surface` |
| `demand_signal` | a search (page or chat) dead-ends with no question left | `query` |
| `ui_error` | client error boundary fired | `message` (sanitised) |
| `outcome_feedback` | post-order micro-survey answered | `value` (yes/no), `reason`, `journey_id` |

## PDP & results UI (revamp Phases 4-5)

| Event | Emitted when | Key properties |
|---|---|---|
| `product_view` | PDP opened (B4 rename of the impression on open) | `sku`, `title`, `category`, `brand`, `price`, `query`, `turn` |
| `product_open` | PDP deep-link or card open | `sku`, `source` (card/deeplink/similar/recent) |
| `pdp_close` | PDP closed (dwell reported) | `sku`, `dwell_ms` |
| `variant_select` | size / colour variant picked on the PDP | `sku`, `variant`, `price` |
| `pdp_ask` | "Ask AskCart about this product" opened the chat with the SKU | `sku`, `prompt` |
| `quick_view_open` | quick-view overlay opened from a card | `sku`, `position` |
| `view_density_change` | grid density toggled | `density` |
| `filter_sheet_open` | mobile filter / sort sheet opened | `sheet` (filter/sort) |
| `constraint_removed` | a removable trail chip removed | `query`, `label`, `turn` |
| `guide_typed_answer` | typed (non-chip) guide answer | `query`, `question_type`, `text` (redacted to 80 chars), `resolved_to_chip`, `turn` |
| `guide_skipped` | "Skip this question" tapped (max 3 keeps the loop) | `query`, `question_type`, `turn` |
| `search_suggest_select` | autosuggest row picked | `query`, `source` (input/hero) |
| `suggest_select` | legacy suggest selection (pre-rename alias) | `query` |
| `back_to_top` | back-to-top FAB tapped | — |

## Cart, checkout & orders (revamp Phases 6 + update-prompt §7)

| Event | Emitted when | Key properties |
|---|---|---|
| `save_for_later` | cart item moved to wishlist | `sku`, `wishlist_size` |
| `move_all_to_cart` | wishlist "Move all to cart" | `count` |
| `buy_now_click` | Buy Now tapped anywhere (cards, rails, PDP, chat, pick) — replaces legacy `buy_now` for new surfaces | `sku`, `source` (card/pdp/chat/pick/rail) |
| `checkout_step_view` | checkout accordion step opened | `step` (details/payment/review), `source` (cart/buy_now) |
| `checkout_step_complete` | checkout step primary button tapped | `step` |
| `demo_order_shortcut` | "Place demo order now" quick link used | `from_step` |
| `order_confirm_view` | confirmation page rendered | `order_id` |
| `reorder_click` | "Buy again" on an order row | `order_id`, `sku` |

## Assistant adoption & agentic chat (update-prompt §5)

All rule-based / template-driven surfaces make **zero LLM calls** before the
shopper sends a message. Message text and the shopper's name are never sent;
`source`/`trigger`/`surface` enums are closed sets.

| Event | Emitted when | Key properties |
|---|---|---|
| `search_to_ask_switch` | conversational search input routed to the assistant (L4) | `how` (row/shift_enter/toggle) |
| `chat_prompt_shown` | proactive peek-bubble prompt shown (L6) | `trigger` (home_idle/weak_search/skips/filter_fiddly/pdp_compare/pdp_dwell/cart_stall) |
| `chat_prompt_click` | prompt button tapped | `trigger` |
| `chat_prompt_dismiss` | prompt ✕ tapped | `trigger` |
| `chat_peek_shown` | 5 s reply-peek bubble shown while the panel is closed (L7) | — |
| `chat_seeded_action` | a zero-typing chip auto-sent a seeded message (L3) | `surface` (results/pdp/cart/confirmation/hero/card) |
| `chat_action_executed` | an agentic `actions[]` entry executed via `performAction()` | `type` (search/apply_filters/open_product/add_to_cart/buy_now/remove_from_cart/add_to_wishlist/open_cart/compare), `ok` |
| `chat_open` | panel opened (all entry points) | `source` (pill/header/hero/results/pdp/cart/onboarding/nudge/suggest/ask_tab), `has_context` |

| `chat_tool_call` | server-side note of a chat NLU tool execution, relayed with the reply | `intent`, `ms` |

## Range windows (update-prompt §2)

`/api/analytics/summary?range=1h|24h|all` returns time-windowed aggregates
from a slim append-only JSONL event log (`.analytics-events.jsonl`, one
compact line per event, rotated to 7 days past 1.5 MB). `range=live`
(default) keeps the all-time snapshot contract. KPI deltas compare the
window against the previous equal window. The log stores session id,
persona id, interests and coarse region only — never name, address, phone
or pincode.
