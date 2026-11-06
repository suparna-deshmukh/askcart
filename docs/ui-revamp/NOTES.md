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
