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
