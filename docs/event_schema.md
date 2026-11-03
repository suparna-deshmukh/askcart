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
| `search_results` | every /api/search response | `query`, `n_results` (raw count), `intent_n` (on-intent count), `ms`, `turn`, `relax`, `null` (true when `intent_n < 2` — the study's failed-search definition), `journey_id` |
| `zero_result` | a search returned <2 on-intent results | `query`, `turn`, `intent_n` |
| `search_error` | search request failed | `query`, `turn`, `error` |
| `guide_question_shown` | follow-up question shown | `query`, `question_type` (budget/occasion/category/brand), `turn`, `options_count`, `mode` (llm/policy/fallback), `refine` (true = optional refinement, not rescue), `reason` (policy rationale) |
| `guide_option_selected` | chip tapped | `query`, `question_type`, `option`, `turn`, `ttfc_ms` (time-to-first-click) |
| `guide_no_question` | policy exhausted (no question left) | `query`, `turn`, `reason` |
| `filter_applied` | mid-search filter changed (sort / brand / price band / rating / category / clear) | `query`, `turn`, `filter_type` (sort/brand/price_band/rating/category/clear), `value`, `n_before`, `n_after` (visible count before/after), `journey_id` |
| `resolved` | search reached ≥2 results | `query`, `turns`, `n_results`, `journey_id` |
| `unresolved` | 3 follow-ups exhausted, still <2 | `query`, `turns` |
| `journey_end` | journey closed (resolution, exhaustion, order, or new search) | `query`, `journey_id`, `turns`, `resolved`, `n_views`, `added_to_cart`, `ordered`, `ms` |
| `product_view` | a product card rendered in a journey | `sku`, `title`, `category`, `brand`, `price`, `rating`, `position`, `query`, `turn`, `source` (results/preview) |
| `add_to_cart` | Add-to-cart tapped | `sku`, `price`, `category`, `brand`, `cart_size`, `from` (results/preview/recommended), `query`, `journey_id` |
| `recommendation_click` | shopper acts on a "Recommended for you" top pick (add or buy-now) | `sku`, `query`, `brand`, `journey_id` |
| `cart_view` | cart drawer opened | `item_count`, `total` |
| `remove_from_cart` | qty − or delete | `sku`, `cart_size`, `price` |
| `buy_now` | Buy-now tapped (single-item express) | `sku`, `price`, `category`, `brand` |
| `checkout_start` | checkout entered (cart or buy-now) | `item_count`, `total`, `source` (cart/buy_now) |
| `order_complete` | prototype order placed | `order_id`, `item_count`, `total`, `source`, `items[]` |

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
