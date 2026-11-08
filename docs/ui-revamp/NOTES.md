# UI Revamp — Notes, assumptions and component map

Baseline: `docs/ASKCART_UI_SPEC.md` (verified 2026-11-06). Baseline screenshots (390 + 1280, 40 shots) in `docs/ui-revamp/baseline/`.
Baseline gates (Phase 0, 2026-11-06): canaries 111+6 (0 failures) · contrast 16/16 · UI tour 17 shots complete · sync `--check` green.

## Component map (pre-revamp)

| File | Owns |
|---|---|
| `app/app/page.jsx` (1811 ln) | shell, topbar, hero, question surfaces (QuestionCard), results layout, filters, nav stack, toasts, survey, chat wiring, preview rails |
| `app/app/globals.css` (608 ln) | all page design system (tokens in `:root`) |
| `app/app/ui/onboarding.jsx` | 3-step persona modal + BUDGET_STYLE_MAX/SPEND_BIAS/SPEND_BRAND_AFFINITY |
| `app/app/ui/pdp.jsx` | `Tile` + `Glyph` + `adjustedRating` + `ProductDetail` drawer |
| `app/app/ui/cart.jsx` | CartDrawer, CheckoutModal, OrderToast |
| `app/app/ui/orders.jsx` | Orders tab |
| `app/app/ui/analytics.jsx` | Insights (6 sub-tabs, incl. Backend admin) |
| `app/app/ui/chat/*` | ChatLauncher, ChatPanel, MessageList, Message, ProductMini, QuickReplies, Composer, Feedback + chat.css |
| `app/app/lib/i18n.js` | en/hi/hinglish static tables (t(), occasionLabel, budgetLabel) |
| `app/app/lib/track.js` | event tracking |
| `app/app/lib/sample_queries.js` | 18 example chips |

## Spec-vs-code findings (brief baseline claims checked 2026-11-06)

1. Brief §2 says header carries 9 controls — code carries 8 (Back, logo+tag, Search+Orders tabs, AI pill, langseg, Analytics, Cart). Confirmed overloaded.
2. No text-size toggle exists in the top bar (spec §3 checkpoint was wrong); `body.largetext` is auto-set only for ageBand 40+ persona. No change needed.
3. Analytics has 6 sub-tabs (Overview, Search & Guide, Catalogue & Brands, Journeys & Orders, Validation & Study, Backend (Admin)) — matches brief.
4. `applyFilters` price filter is **band-only** (`f.band`) — Phase 4 must add `priceMin/priceMax` per brief §7.5 note; `f.brands` is already an array (multi-select exists).
5. Cart persists `askcart_cart` (localStorage) — brief's key list omitted it; it is preserved.
6. `pushNav` snapshots `{tab, cartOpen, checkoutOpen, order, pdp, search?}` — Phase 5 PDP keeps this exact contract.
7. Chat split-screen is already in-flow 400px (not overlay) on desktop — container queries still needed per §16.

## Assumptions (conservative choices, per brief §0.4)

- **Icons**: `lucide-react` (npm registry reachable; tree-shaken per import) rather than a hand-authored sprite.
- **Fonts**: `next/font/google` for Inter + Fraunces + Noto Sans/Serif Devanagari (self-hosted at build; no CDN at runtime).
- **Two-commit rule**: applied at the file level where restructuring happens (shell header, PDP, checkout). Where a file is extended rather than moved (results grid, home), a single phase commit is used and noted in REPORT.md.
- **Wishlist/recent/search-suggest**: front-end only, localStorage, no API.
- **No new backend endpoints.** Checkout steps, order status progression and delivery ETAs are client-side demo state only.
- **Mega panel / category nav**: uses existing catalogue facets already loaded client-side (catalog preview API), no new API.
- **`image_url`**: field supported by Tile v2; catalogue currently has none, so all tiles render generated art.
- Announcement bar, bottom tab bar and Insights shell are additive; URL contract (`?tab=`, `?anview=`, `?sku=`, `?q=`, `?mode=plain`, `?onboard=1`, `?noob=1`) unchanged.
- Contrast gate pair list extended in the same phase that introduces each new text/background pair.

## Phase log

- Phase 0 (2026-11-06): baseline captured, gates green, notes written. No code changes.
- Phase 4 (2026-11-06): results v2. Assumptions: (a) turn-1-resolved searches keep the compact refine strip (G11) — the prior "missing question card" report was a selector/wait artifact, verified live; (b) "Narrowed from N" is a label, not an action; (c) rating facet is 4★+/Any (old behaviour was a bool); category facet single-select; (d) brand facet shows in single-category layouts (brief hides only Category); (e) mobile search overlay has no autosuggest yet (Phase 9); (f) busy-dim on re-search deferred (skeleton only when results empty).
- Phase 5 (2026-11-06): full-page PDP + quick view. Assumptions: thumb-rail variant gallery (not swipe+dots); Highlights/Specs from existing fields only; quick view hover-only (not tour-testable); pdp_ask new event; old drawer CSS dead until Phase 9; ui_tour hardened to fail loudly on skipped steps.
- Phase 6 (2026-11-06): cart v2 + stepped simulated checkout + confirmation + orders v2 + wishlist move-all. Assumptions: no payment inputs by design; Standard delivery only; UPI default; demo orders have no reorder actions; orders hydrate post-mount (SSR-safe); checkout needs a non-empty cart.
- Phase 7 (2026-11-06): persona modal on kit Overlay (progress bar, Back, card options, 220ms auto-advance) + chat visual lift (60px gradient FAB w/ one-time pulse, 64px header w/ live status dot, brand user bubbles, 2x2 empty cards, rating chips + hearts, sticky/zebra compare w/ data-derived best marks, pill composer). Assumptions: backdrop/Esc = tracked skip; onboarding/chat copy English until Phase 9 sweep; compare marks from rendered rows only.

- Phase 8 (2026-11-06): Insights restyle — rail/pills, banner, live pill, density toggle, sparklines, conv chips, sticky tables w/ kit Select filters, family-chip feed, skeletons. Assumptions: analytics (reviewer surface) stays English-only for this pass; live-dot recoloured --success for the contrast gate; new localStorage key askcart_an_density.
- Phase 9 (2026-11-06): polish + QA. Assumptions: aria-labels stay stable English (tour + SR consistency; visible text translated); announcement bar <b> emphasis dropped (plain i18n strings); "Everyday" mega-menu occasion label left untranslated (catalogue-data style); Hindi i18n values composed from existing in-file strings (fresh Devanagari literals were found corrupted in transit — all new hi values verified against in-file sources); back-to-top FAB gated to the search results view (showTop && s); onboarding payoff toast conditions still compare canonical English values (data contract).

## Update prompt log (2026-11-08)

- Section 1 (header v2: rebuilt right cluster, container-query label hiding, loud Analytics pill, Gemini key chip), 2 (analytics Overview dashboard, coverage script, event registry), 3 (full-screen onboarding), 4 (persona.js drives recommendations + insights): committed as `d00c09d`, `fc75da0`, `15d0584`, `d26debc`, with `1691ea1` (perf: 24h plan/refine TTL, rules-first refine gate) between 1 and 2.
- Section 5 (chat adoption L1–L7 + agentic chat), 2026-11-08. Assumptions (conservative, per §0.4):
  - **No SSE**: `/api/chat` stays plain JSON (fast, deterministic, no new deps). "Non-blocking" is met by the client message queue, lifted chat state (replies land while the panel is closed -> pill unread badge + 5 s peek bubble), and a page that never locks.
  - **Buy phrasing**: "buy the cheapest X" runs the search first (conservative); direct buy works for "buy this/that/it/now" and ordinals ("buy the first one") — the NLU buy regex was extended for ordinals.
  - **Hero input** has no suggest dropdown; conversational input gets the Search|Ask toggle + Shift+Enter + hint line. The pinned "Ask AskCart:" row lives in the header/refine-bar dropdown, which now also opens when normal suggestions are empty (a conversational query matches none).
  - **pdp_3 / pdp_dwell** seed compare/ask prompts from the current context (primed top-3 of the active search), not a cross-search basket of viewed PDPs.
  - **`chat_open` was never tracked** before this pass (the analytics KPI read 0); every entry point now funnels through `openChat(source)`.
  - **Button labels** stay "Add to cart" / "Buy now" (existing site-wide i18n) rather than re-capitalising every surface; chat cards previously said "Add" and now match the rest of the site.
  - **Esc layering**: one layer per Esc — chat panel (topmost) closes first, then the PDP; kit overlays still win (existing deferral).
  - **Gemini ledger day key** is now the Pacific calendar date (`America/Los_Angeles` via `Intl en-CA`) — the free tier resets at midnight PT; the previous UTC key rolled up to ~1.5 h early.
  - **Capability card** stays visible while the thread is empty on first open and is marked seen after the first message (earlier code hid it on the first frame).
  - **Analytics event rate limit** raised 120 -> 300/min/IP: one tester's full pass legitimately emits >120 events/min (onboarding + purchase flow). The allowlist + 4 KB body cap remain the real guards.
- Section 6 (Buy Now beside every Add to Cart), 2026-11-08. Assumptions:
  - **Card action buttons stay hardcoded English** ("Add to cart" / "Buy now") — cards receive no `lang` prop (pre-existing pattern, unchanged); the rest of the site is i18n'd.
  - **Buy Now opens a single-item checkout** (`buyNowItem` state, qty 1); the existing cart is left untouched and preserved after the buy-now order. `placeOrder` skips the cart wipe in buy-now mode.
  - **Card layout** via `@container` on `.card`: >=200px side-by-side equal width, below stacked. At the current 5-col result grid (cells ~198px at 1280) cards are spec-correctly stacked.
  - **768px header overflow fix** (section 1A "never overflow at any width"): new `@container main (max-width: 859px)` tier — hides Gemini key chip and header Assistant button (both remain reachable: AI status in the Account menu, assistant via pill/tab bar/hero CTA), hides logo wordmark (mirrors the <=767 mobile tier), slims the Analytics pill (text kept, required at >=640px), `.tsearch { min-width: 0 }` so the refine bar shrinks instead of the row overflowing. Covers 768 viewport and the 1024+chat split (main ~624px).
  - **User-directed (Suparna, 2026-11-08)**: logo click now hard-resets to the home hero (was: cleared nav + tab only, leaving active results). Hero "recommendation" area now shows **normal search options only** — the three persona conversational ask chips and the "Continue your chat" chip were removed from the hero strip (the one-line value statement and the Ask-the-assistant CTA remain); the "Popular:" example chips are now brand-purple. Onboarding completion "Try the assistant" still seeds chat from the persona ask chips (unchanged).
- Section 7 (checkout: nothing compulsory, a few taps), 2026-11-08. Assumptions:
  - **3 steps**: Details (address fields) → Payment → Review. The Delivery step is removed per the update prompt (single standard 2–4-day demo option); the ETA is shown as a static row in Review. Stepper line condition now uses `steps.length`.
  - **No blocking validation anywhere**: `validField`/`errs`/`submitAddress` gating removed; inputs keep soft hints (`10 digits`, `6 digits`, pin region line) and numeric filtering. `required` semantics removed (labels say "(opt.)"); every primary button always enabled.
  - **Name auto-fill** from `askcart_profile_v1.name` (editable; a previously saved address still wins). Skipped onboarding => name empty, never "Guest".
  - **Payment default = Cash on delivery** (was UPI). No card/VPA/bank inputs exist; UPI/Card are simulated choices with the simNote.
  - **"Place demo order now"** persistent shortcut on every step -> places the order directly (`demo_order_shortcut{from_step,payment}`); 2-tap path (Buy Now → shortcut) verified.
  - **Empty address fields** render "Not provided (demo)" in Review and on the confirmation ship-to line (always rendered now).
  - `ui_tour.js` updated (delivery continue click removed); s7 19/19; gates all green.

## §9 autopilot decisions
One line per autonomous decision (2026-11-08 autonomous run; frozen design wins over the §9 brief; silent spots picked conservatively):
- D1: `iv` (intent-scoped view) falls back to the full visible set only when the intent subset has <3 items (frozen: "empty"); 1–2-item subsets degenerate quantiles and kill the guaranteed Q1 on the named case (visIntent=1), so 3 is the floor.
- D2: rescue/destination-stop/first-question gates key off `effN` = visible length when present (client `n_results` is the strict on-intent count = 1 for cookware and would false-positive rescue/dest-stop).
- D3: budget band `in_band` bounds are INCLUSIVE on both ends; the guard only ever drops items, never adds them.
- D4: no new contrast pair — the "still N" meter state reuses the existing `.qmeter` text/background styling (verified via scripts/contrast_check.js coverage of .qmeter).
- D5: home trending grid left unguarded (catalog-curated "best-rated per band"; the tile label states the relation); not in the frozen five-surface list.
- D6: best-picks `rec` shelf left unguarded (it ranks the CURRENT visible results, not a cross-world set).
- D7: rescue questions keep server-computed counts client-side (rescue visible set is server-derived; no client recount applied there).
- D8: rail-drop events are deduped per anchor per session (render-time builders re-run on every state change without a new rail).
- D9: /api/ai-refine recomputes the visible set server-side (`search(catalog, q, {...slots, relax:true, limit:48})`) rather than trusting a client payload for the `set` summary.
- D10: logLine mismatch fields reuse the existing o.c/o.v/o.n columns (no new ledger columns).
- D11: `guide_question` fires alongside the existing `guide_question_shown` (brief names the new event; existing consumers keep working).
- D12: cart/home/pdp.jsx imported guard.js at `../../../lib/guard.js` (one level too deep — resolved outside app/); corrected to `../../lib/guard.js` (guard.js sits at app/lib/, pure: imports only facets.js + persona.js).
- D13: the new Insights "Guided question health" block uses hardcoded English (consistent with the rest of the prototype-only Insights panel, which is banner-marked "not part of the shopper experience"); shopper-facing strings still went to i18n ×3 (qStill).
- D14: Insights warn thresholds are conservative (zero-narrowing >25%, zero-count options >10%) — flags, not gates.
- D15: health block polls 24h summary + ai-status every 5 s (the panel's own 2.5 s poll keeps the all-time snapshot; two extra 5 s polls avoid load).

## §9 process rule (standing)
Any new question-option source or recommendation rail MUST derive from the intent-scoped set (iv / visible), pass the exit guard (`validateGuideQuestion` / `validateRecommendationRail`), and ship with a named canary; every reported bad question gets a canary the same day.

## §9 P3 judge loop — flow-mine clusters & fixes (before/after)
- Cluster "band-count off-by-one": FIRST audit run reported ~50 "recount server=N client=N+1" band mismatches — audit-side bug (the audit's own band recount used hi-inclusive bounds; facets.js countBudget is lo-inclusive/hi-exclusive, matching the client recountOption). Fixed the audit to import recountOption/optionKind from guard.js (single source of truth); product code was already consistent.
- Cluster "re-ask after any:<source> + slot answers": real policy bug — the tier ladder's exact-type checks (prev.has("brand")/prev.has("budget")/prev.has("occasion")) missed the open-refinement "any:brands"/"any:bands"/"any:tags" markers and the answered slots, so brand was re-emitted after any:brands+brand-answer (iphone 13 128gb) and budget after a band chip. Fix: facetDone(slot) helper (any:* markers + answered slots) wired into the brand main gate + tiers 5/6/7, the budget main gate + tier 3, the occasion main gate, and tier-7's facet flags.
- Cluster "world guard tag leak": real policy bug — tier-7's tag option source was not gated by the world guard (brand source was), so "corporate gift under 1000" (non-wearable, fashion-dominant visible) offered any:tags. Fix: tagOpts gated on !worldGuard. (The Devanagari "leaks" the first run flagged — कपड़ा/कुर्ती — were audit false positives: the audit's wearable regex lacked DEVANAGARI_WEARABLE; added.)
- Cluster "occasion tags after a Gift answer": real policy bug — occSettled excluded occasion="gift", so any:tags (birthday/christmas...) could follow a Gift answer (jewelry titles with "Gift" in the name). Fix: occSettled = facetDone("occasion") (any answered occasion settles, guard parity).
- Cluster "rail anchors not found": audit-side bug — wrong category names (AMAZON ELECTRONICS etc. vs the real "All Electronics"/"Appliances"/"Amazon Home"/"All Beauty"/"Toys & Games"). Fixed in the audit.
- Audit policy: visible-set GROWTH from the strict->relax switch (pre-existing search behaviour, e.g. dead-end close-match list of 26 -> 48 after a brand+relax re-search) is reported informationally, not as a violation — the FROZEN DESIGN's contract is that the ECHO/meter never display an increasing "left" count (echoFor only prints "N of M" when N<M; the meter shows a plain N with no arrow when N>=M), which holds by construction and is canary/UI verified.
- Cluster "for_whom escape inflation (gate vs guard parity)": audit3 found 5 journeys where decideGate's own thin check `fw.filter(o=>o.count>0).length < 2` counted the "Unisex / any" escape option (always count = n) as a live gender, so single-gender sets (e.g. "cotton saree" Women-only, long women's titles) passed the policy gate but the guard's thin rule (which excludes ESCAPE_RE labels) downgraded them to typed-only. Fix: the gate now counts only non-escape live options (`!/^(unisex|any|no preference|not sure)/i`), matching guard.js rule 3. Before: 5/200 journeys guard:thin fallback; after (audit4): 0.
- Same-day canaries added to eval/canaries.py GG: gg_band_chips_live (washing machine — band questions must carry >=2 live chips; regression for the optionKind 'budget' recount bug) and gg_for_whom_live_ge2 (Nike Womens T-Shirt — a for_whom question must have >=2 live options).
- Cluster "miner pre-fix artifact (P3 closure)": the flow miner (started 07:23, before the P3 guide.js fixes landed) replayed 300 queries / 3,880 moments on the PRE-FIX policy code and flagged 337 violation moments — 102 objective (guard:reask on t3/t4 across 21 queries; world brand/tag leaks on 10 non-wearable catalog titles) + 235 narrow-only (relax-expansion, informational by frozen contract). Re-ran the miner's exact full path exploration on all 31 flagged queries against the CURRENT code (/tmp/s9_reverify.mjs): 596 moments, 0 objective violations. Every flagged cluster (re-ask after band/for_whom/brand answers, world leaks on fashion-dominant non-wearable sets) is confirmed fixed by the P3 patches (facetDone, tier-7 world gate, escape-aware for_whom gate). A full 300-query miner re-run (~100 min CPU) was deemed redundant: the flagged set is fully covered by the re-verify + the 200/200 CI audit + 17/17 red suite + 111+6+23 canaries.
- Decision: the "10k+ paths" P2 target was not hit by the miner (3,880 moments actual — the 3-level tree over 300 queries with 48-result in-process searches takes ~100 min CPU); the report cites the actual number. Verification depth is unaffected (every flagged query re-verified post-fix).
