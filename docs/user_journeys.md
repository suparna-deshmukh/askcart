# AskCart User Journeys — complete map

Every journey, button flow and UI state in the prototype. Events in
parentheses are emitted to the public analytics store.

## J0 — New visitor onboarding
1. Landing: header (logo, Search/Analytics tabs, cart), onboarding card
   `session_start`, `page_view`.
2. 3 steps, one tap each: **Who** (Myself/Partner/Kids/Family/Friends) →
   **Budget style** (under ₹2k / ₹2–5k / ₹5k+ / mix) → **Shop style**
   (occasions & gifting / everyday / both). `onboarding_complete`
   (or `onboarding_skipped`).
3. Persona persists (localStorage) → cohort on every future event;
   "flexible" budget answers default to the persona's style.
4. Home shows the catalogue preview grid (12 products) with Add-to-cart /
   Buy now. `product_view` per card.

## J1 — Direct search, resolves on turn 1 (happy path)
1. Type / pick an example / deep link `?q=…` → `search_start`.
2. Results grid (≤12 cards: title, category, brand badge, occasion badges,
   ₹ price, ★ rating + rating count, Add to cart, Buy now) + meta line
   ("N results in X ms"). `search_results`, `product_view` ×n.
3. If the policy sees value in one refinement (e.g. budget for "headphones")
   an **optional** chip row appears under the grid — `guide_question_shown
   (refine=true)`. User may ignore it; the journey is already resolved.
4. `resolved (turns=1)`, `journey_end`.

## J2 — Search with a guided rescue (0–1 results)
1–2. Same as J1; grid empty, "No products matched that exactly."
   `search_results (null=true)`, `zero_result`.
3. AskCart asks **one** policy question (category rescue first for dead
   ends; otherwise the category's flow order — budget / occasion / brand):
   4–6 one-tap chips. `guide_question_shown (refine=false)`.
4. Tap a chip → `guide_option_selected (ttfc_ms)` → relaxed re-search with
   the chosen constraint → `search_results (turn=2)`.
5. ≥2 results → `resolved (turns=2)`, `journey_end`. Otherwise up to 2 more
   follow-ups (max 3 questions); final failure → `unresolved`,
   "One follow-up question can usually fix this" hint disappears.

## J3 — Cart journey (multi-item)
1. Add-to-cart on any card → `add_to_cart`, cart badge increments.
2. Open cart → `cart_view`; drawer: line items, qty +/−, remove
   (`remove_from_cart`), total.
3. "Place order →" → `checkout_start (source=cart)` → checkout modal
   (items, total, prototype note) → "Place prototype order" →
   `order_complete` → success toast, cart cleared. `journey_end
   (ordered=true)`.

## J4 — Buy-now journey (express, single item)
1. "Buy now" on any card → `buy_now`, cart replaced by that item, checkout
   modal opens directly → `checkout_start (source=buy_now)` →
   `order_complete` → toast.

## J5 — Analytics (visible to every user)
Tabs: **Overview** (KPIs, funnel, live event stream) · **Search & Guide**
(top queries, guide tap-through, turn distribution) · **Catalogue & Brands**
(live catalogue dimensions + live engagement + brand engagement) ·
**Journeys & Orders** (turn outcomes, persona cohorts, recent orders).
2.5 s polling; every panel recomputes from live events — any new event
type or product change shows up without code changes to the dashboard.

## J6 — Simulation / QA journeys (off the public dashboard)
`eval/simulate.py` drives 2,000+ generated queries (persona × product ×
budget × occasion × brand × vague grids) through the live app with the
Qwen guide, writing `logs/sim_*.jsonl` + the isolated sim store.
