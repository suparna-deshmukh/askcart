# AskCart — Complete UI Specification

Granular, token-level documentation of every surface, control, size, colour and state in the AskCart prototype (Next.js, `app/`).
Every value below is taken from the shipped CSS/JSX (`app/globals.css`, `app/page.jsx`, `app/ui/*`), verified 2026-11-06.
Where a property has no explicit CSS rule, it says *inherits*.

**Runtime facts**

- Dev server: `http://localhost:3000` (no remote deploy; local commits only).
- Catalogue: **54,304 SKUs** (`app/public/catalog.json`); demo catalogue, prices/ratings indicative.
- AI: Gemini-only routing over 3 API keys (20 calls/key/day = 60/day); rule-based policy fallback when keys are exhausted. The AI pill in the top bar shows total usage across all keys/users.
- Modes: **Guided is the only mode the UI offers**. `?mode=plain` is a reviewer-only A/B baseline.
- Three languages: `en`, `hi` (Devanagari), `hinglish` — static tables, no LLM.

---

## 1. Design tokens

All colours/typography live in `:root` in `app/globals.css`. No component may introduce new colours (brief rule; chat CSS included).

### 1.1 Colour tokens

| Token | Value | Use |
|---|---|---|
| `--bg` | `#FBF9F6` | Page background (warm off-white) |
| `--surface` | `#FFFFFF` | Cards, inputs, topbar chips, assistant bubbles |
| `--surface-2` | `#F4F0EA` | Fills: AI pill, count badges, table headers, disabled states |
| `--border` | `#E6E0D6` | Default 1px borders (cards, rows, footer) |
| `--border-strong` | `#CFC7B9` | Interactive borders (chips, inputs) — 1.5px |
| `--text` | `#1C1B18` | Primary text |
| `--text-2` | `#55514A` | Secondary text |
| `--text-3` | `#6B665D` | Tertiary text, hints, meta |
| `--brand` | `#4338CA` | Primary action (indigo): search button, Add to cart, active nav, primary chat button |
| `--brand-hover` | `#3730A3` | Hover of any brand surface |
| `--brand-tint` | `#EEF0FF` | Brand-tinted fills: user chat bubble, trail answer chips, active variant chip, "on" filter chip bg (with brand text), onboarding segment |
| `--on-brand` | `#FFFFFF` | Text on brand |
| `--guide` | `#F59E0B` | Marigold = "AskCart is asking". Left border + Send button on both question surfaces |
| `--guide-bg` | `#FFF6E5` | Question card/strip background |
| `--guide-border` | `#F2D49B` | Question card/strip border, typed-input border |
| `--guide-text` | `#8A4B05` | Eyebrows, question line, progress pill on both question surfaces |
| `--success` / `--success-bg` | `#137333` / `#E8F5EC` | Green = positive facts only: rating pill ≥4, "why this matched" chips, live bars |
| `--warning` / `--warning-bg` | `#B45309` / `#FEF3C7` | "Slightly over your budget", rating pill 3–3.9, chat error bubble |
| `--danger` / `--danger-bg` | `#B42318` / `#FDECEA` | Null/error text, "Clear all" |
| `--star` | `#E8A317` | Star glyph in rating lines |
| `--live` | `#16A34A` | Live dot (Analytics livebar, Analytics button dot) |

**Legacy aliases** (kept so older class names work; do not use in new code): `--ink`=`--text`, `--sub`=`--text-2`, `--faint`=`--text-3`, `--accent`=`--brand`, `--accent-soft`=`--brand-tint`, `--accent-border`=`--border-strong`, `--accent-deep`=`--brand-hover`, `--green`/`--green-soft`=`--success`/`--success-bg`, `--amber`=`--warning`, `--red`=`--danger`.

### 1.2 Radius, shadows, typography

| Token | Value |
|---|---|
| `--radius` | `12px` (cards, dim panels, stats) |
| `--shadow-sm` | `0 1px 2px rgba(16,24,40,.05)` |
| `--shadow-md` | `0 4px 12px rgba(16,24,40,.08)` |
| `--shadow-lg` | `0 12px 32px rgba(16,24,40,.14)` |

- Font stack: `Inter, "Noto Sans Devanagari", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`; body `14.5px / 1.5`. `body.largetext` (auto-set for persona age band 40+): `16.5px`.
- Focus: `outline: 2px solid var(--brand); outline-offset: 2px` on all focusable elements.
- `prefers-reduced-motion: reduce` kills all animations/transitions (global rule + chat-specific rule).

### 1.3 Type scale (as used)

| Element | Size / weight |
|---|---|
| Hero h1 | 30px / 800, letter-spacing −.03em (`em` in brand) |
| Hero sub | 15px, `--text-2`, max-width 640px |
| Section heads (`.sec-head h2`) | 17px / 750 |
| Orders h2 / persona question | 20px (h2 800 ls −.02em; question 750 ls −.01em) |
| Search input text | 15.5px |
| Question line (card) / (strip) | 17px / 700 · 14.5px / 700 |
| Product card title | 13.5px / 600, 2-line clamp, min-height 38px |
| Card price | 17px / 800 ls −.01em |
| PDP title / price | 16.5px / 700 · 24px / 800 |
| Stat value / stat key | 22px / 800 · 11px uppercase 750 |
| Body rows / tables | 12.5–13px; tables 13px, headers 10.5px uppercase 800 |

---

## 2. Layout shell

```
.appshell  (flex, min-height 100vh)  [class added: "chat-open"]
├── .appshell-main  (flex 1 1 auto, min-width 0, column)
│   ├── .topbar (sticky)
│   ├── toasts (fixed, outside flow)
│   ├── .wrap  (max-width 1400px, margin 0 auto, padding 20px 28px 80px)
│   │    └── active tab content (search | orders | analytics)
│   ├── footer
│   └── ChatLauncher (fixed FAB) — search tab only
└── ChatPanel  (400px sticky column, in-flow → content shifts left)
```

- **Split-screen chat (desktop ≥1024px):** `.appshell` is a flex row; the open chat panel is an in-flow 400px column (`flex: 0 0 400px; position: sticky; top: 0; height: 100vh`), so the main content shrinks left rather than being covered. Opening chat hides the FAB (`.appshell.chat-open .cht-fab { display:none }`).
- **≤1023px:** `.appshell` becomes block; chat becomes an overlay (fixed right, full height below the 59px topbar).
- **≤640px:** chat is a bottom sheet (`height: min(75dvh, 640px)`, radius 16px 16px 0 0, shadow up).
- **Z-index ladder:** topbar 50 · chat FAB/nudge/label 80 · chat panel 90 · drawer/modal overlays 100 · onboarding/persona toast 120 · cart toast 130 · order toast 200.
- **Sticky topbar:** `position: sticky; top: 0; z-index: 50; background: rgba(255,255,255,.92); backdrop-filter: saturate(180%) blur(12px); border-bottom: 1px solid var(--border)`. Inner: `padding: 8px 20px; gap: 14px`.

---

## 3. Top bar (left → right)

All in `.topbar-inner` (full-width, not boxed — the bar uses the entire top of the screen).

1. **Back button** `.backbtn` — 44×44px, radius 10px, 1px `--border`, white bg, glyph `←` 18px. Disabled (empty stack): opacity .35, no pointer. Hover (enabled): `--surface-2` bg. `aria-label`/`title` = "Back". Pops the in-app nav stack (see §14.1).
2. **Logo** `.logo` (clickable; resets to home: clears nav stack, `tab=search`, scroll to top)
   - `.logo-mark` 34×34px, radius 9px, gradient `135deg, var(--brand) → #4f46e5`, letter "A" 17px/800 white, `--shadow-sm`.
   - `.logo-word` "AskCart" 19px/800 ls −.02em; "Cart" in `--brand`.
   - `.logo-tag` pill: "guided shopping · India", 10.5px/600, bg `#f2f4f7`, 1px `--border`, radius 999px, padding 2px 8px.
3. **Nav tabs** `.topnav` — buttons `Search`, `Orders`. 13.5px/650, padding 8px 14px, radius 9px, gap 4px. Default `--text-2`; hover → `--text` + `#f2f4f7`; active (`.on`) → `--brand` text + `--brand-tint` bg.
4. **AI pill** `.aipill` — 11px/650, tabular nums, `--surface-2` bg, 1px `--border`, radius 999px, padding 4px 11px, `cursor: default`. <640px: 10px, padding 3px 8px.
   - Text (from `aiPillText()`): `AI · Gemini` · `AI · Gemini key 2/3` (after a call served by that key) · `AI · Rules (offline)` (all keys exhausted), each suffixed ` · x/60 today` (total calls across all 3 keys and all users; 60 = 3 keys × 20 RPD).
   - `title` (hover) lists: TOTAL x/60 today (all users); per-key `key1 a/20, key2 b/20, key3 c/20` with exhaustion reason; `session AI budget: N left`.
   - Data: `GET /api/ai-status` polled every 30 s (ledger read — no LLM call, does not count against the 20/day).
5. **Spacer** `.topbar-spacer` — `flex: 1`.
6. **Language segment** `.langseg` — pill container (`--surface-2` bg, 1px `--border`, radius 999px, padding 2px). Three buttons: `EN`, `हिं`, `Hinglish` — 11.5px/700, min-height 26px, padding 4px 10px; active (`.on`) = white bg + `--brand` text + `--shadow-sm`. `role="group"`, label "Language". Persisted in `localStorage.askcart_lang`; sets `<html lang>` (`en` / `hi` / `hi-Latn`).
7. **Analytics button** `.anbtn` — pill: 7px dot (`.anbtn-dot`, `--live` green; `--brand` when active) + "Analytics". 13.5px/650, `--surface` bg, 1.5px `--border-strong`, radius 999px, padding 9px 18px. Hover: border/text → `--text-2`. Active (`.on`): `--brand-tint` bg + brand border/text. Switches to the Analytics tab (full screen width).
8. **Cart button** `.cartbtn` — pill: `🛒` + "Cart". 13.5px/700, white bg, 1.5px `--border-strong`, radius 999px, padding 9px 18px. Hover: border `--text`.
   - **Count badge** `.cartcount` — absolute, top −7px right −7px; min 20×20px, `--brand` bg, white 11px/800, 2px white border, radius 999px. Appears when count > 0; replays a `cartbounce` (scale 1→1.35→1, 300 ms) on every change (the "something is happening" feedback the badge itself is wired to give).
---

## 4. Hero state (no active search)

Rendered when no search state exists (`!s`).

- **h1** (`.hero h1`): 30px/800, ls −.03em. EN: *"Tell us what you need — in your own words."* (the "own words" is the `<em>` in brand colour). HI: *"अपनी ज़रूरत अपनी भाषा में बताइए।"* HINGLISH: *"Jo chahiye, apne words mein bataiye."*
- **Sub** (`.hero .sub`): 15px `--text-2`, max-width 640, margin-top 6. EN: *"Try English, Hindi or Hinglish. We ask one quick question only if we need it."*
- **Search bar** `.searchbar` — flex, gap 10px, margin-top 18px, full width of `.wrap`.
  - Input: flex 1, padding 14px 18px, 15.5px, 1.5px `--border-strong`, radius 13px, white, `--shadow-sm`. Focus: border `--brand` + 3px ring `rgba(29,78,216,.12)`. Placeholder EN: `Try: "shaadi gift under 2k"` (language-specific versions exist). Enter submits.
  - Submit button: padding 14px 28px, 15px/700, `--brand` bg white text, radius 13px, no border. Hover: `--brand-hover`. Disabled (busy): opacity .55, label "…".
- **Onboarding strip** (O1 — non-blocking, only when not dismissed, and only on first-ever hero): full-bleed inside `.wrap` (`.strip` uses `margin: 10px -28px 0` so it spans the content edge-to-edge).
  - Collapsed `.strip-line`: one line, 12.5px/600 `--text-2`, white bg, 1px dashed `--border-strong` top+bottom, padding 9px 28px, cursor pointer. EN text: *"Optional: set your pincode & language for better results"* + bold brand *"Set →"*. Hover: border+text → brand.
  - Expanded `.strip-card` (white, solid top/bottom borders, padding 12px 28px):
    - Row 1: label "Language" (`.strip-lbl` 11.5px/800 uppercase `--text-3`) + three `.seg` buttons **English / हिन्दी / Hinglish** (12px/700, min-height 34px, 1.5px `--border-strong`, radius 999px; `.on` = brand fill white text) + 1px vertical separator (22px tall) + label "Delivery pincode (optional)" + `.pin-in` input (width 104px, 13.5px, letter-spacing .12em, digits-only, max 6, placeholder "110001", radius 10px, focus → brand border + ring) + **Use** button (`.strip-use` 12.5px/750, 8px 16px, radius 10px, brand; disabled opacity .4 until 6 digits).
    - Hint (`.strip-hint` 11.5px `--text-3`, margin-top 8): *"6 digits — used for regional festivals & demo delivery estimate only"*.
    - Skip (`.strip-skip`, 12px/600 `--text-3`, top margin 10): EN *"Skip for now ✕"* — dismisses permanently (`localStorage.askcart_strip_dismissed=1`), never shown again; saved via Use also dismisses.
  - **No pincode ever leaves the browser** — analytics receive only the coarse `region` (`pinRegion()` maps the 2-digit prefix to north/east/west/south/ne/central).
- **Example chips** `.ex` (row below the search bar): label "Popular:" (`.exl` 12.5px/600 `--faint`) + 18 chip `<span>`s (12.5px, white, 1px `--border-strong`, radius 999px, padding 6px 12px; hover → brand border/text + brand-tint bg). Clicking one starts a search (tracked `source:"example"`). The 18 chips (single source: `app/lib/sample_queries.js`):
  1. `shaadi gift under 2k` 2. `budget headphones under 3000` 3. `diwali decorations` 4. `gift for 5 year old` 5. `phone under 15k for college` 6. `wristwatch for dad under 5k` 7. `diwali gift under 1k` 8. `saree under 2k` 9. `saree for ammi` 10. `kurta for bhai` 11. `1.5 ton ac under 45k` 12. `43 inch tv under 35k` 13. `laptop under 50k for college` 14. `500w mixer grinder` 15. `7 kg washing machine under 25k` 16. `sasta smartwatch` 17. `ammi ke liye gift` 18. `something for my room`
- **No-search preview below the hero** (loaded once): either a **festival rail set** (when a festival window is active, e.g. Diwali): `sec-head` "⟨Festival⟩ gift ideas" + count line "… is N days away · best-rated per budget · 54,304 products loaded", then per budget band a `.rail` with head (band label + "N picks · festive goods & gifts") and a `.rail-row` horizontal scroller (235px columns, same ProductCard) — **or** the static **"Trending across price bands"** grid (best-rated per band).

---

## 5. First-visit persona modal (3 questions, centered)

Shown on first visit (no `localStorage.askcart_onboarded`, no `?noob=1`) as a centered dialog; also available on demand at `/?onboard=1`.

- **Overlay** `.pm-overlay`: fixed inset 0, `rgba(16,24,40,.45)`, centered, fade 150 ms. `role="dialog" aria-modal="true"`.
- **Card** `.ob`: max-width 560px, white, 1px `--border`, radius 18px, `--shadow-lg` (plus 0 16px 48px rgba(28,27,24,.28) via the overlay), padding 30px 32px 26px.
- **Head row** (`.ob-head`, space-between): step label `.ob-step` 11.5px/800 uppercase `--brand`: "Set up your shopping profile · 1/3" (→ 2/3, 3/3); right: "Skip for now" (`.ob-skip` 13px/600 `--text-2`, underline on hover) → tracks `onboarding_skipped`, closes with defaults.
- **Question** `.ob-q`: 20px/750 ls −.01em. **Sub** `.ob-sub`: 13px `--text-2`, margin-top 5px.
- **Options** `.ob-opts`: stacked full-width buttons, gap 9px, margin-top 20px. Each: 14.5px/600, left-aligned, padding 13px 16px, radius 11px, bg `#fafbfc`, 1.5px `--border-strong`. Hover: brand border + brand-tint bg + brand-deep text. One tap = answer + advance (no Confirm button).
- **Progress dots** `.ob-dots`: 3 dots 26×4px radius 999, `--border`; current+done = `--brand`.

The three steps (exact copy):

| # | Key | Question | Sub | Options |
|---|---|---|---|---|
| 1 | `context` | What are you mostly shopping for? | One tap — we calibrate the follow-up questions around it. You can always mix it later. | Myself · Family & kids · Gifting · Home & appliances · A mix of all |
| 2 | `ageBand` | How old are you? | Helps us match styles, sizes and question order. Never shown to anyone. | Under 25 · 25–40 · 40+ |
| 3 | `spendStyle` | How do you usually decide what's worth buying? | Your budget changes with the product — this tells us your default bar, not a cap. | Best price — I compare a lot · Good quality at a fair price · Brand matters most · Premium, if it's worth it |

**Payoffs (wired, not decorative)** — on finish a toast (`.obtoast`, bottom-center, 6 s) states the effect:
- `context = Gifting` → "Because you chose Gifting, we'll ask about the occasion first." (occasion-first question order in the guide)
- `ageBand = Under 25` → "Noted - budget options will be one step lower for you."
- `ageBand = 40+` → "Larger text mode is on for you." (sets `body.largetext`, 16.5px)
- `spendStyle` (anything) → "Got it - we'll rank results around that bar." (recommendScore: price fit vs cap/bias + brand affinity; "Not sure / flexible" defaults: ₹2,000 / ₹5,000 / ₹8,000 / no cap — applied only when the shopper taps "Not sure / flexible" and always echoed as a removable trail chip)
- Completion tracked as `onboarding_complete` with all answers + ms.

---

## 6. Question surfaces (the guided-search core)

Exactly **one** question at a time, rendered **above the results grid** on every search that needs it. Two shapes, one design language (marigold + Gemini spark = "AskCart is asking"):

- **Full card (`.qcard`)** — first/weak search (`guide.refine: false`) or after a typed answer.
- **Compact strip (`.qstrip`)** — when the search already resolves and the question can only sharpen it (`refine: true`), so results are never pushed far down.

Shared anatomy (top → bottom):

1. **Head row** (flex, wrap, gap 10px):
   - **Gemini spark** — 4-point star SVG (`GeminiSpark`, currentColor, 14px in card / 12px in strip).
   - **Eyebrow** — 11px/800 uppercase ls .06–.08em `--guide-text`: card "Quick question" / strip "Optional refinement" (localized).
   - **Progress pill** `.qprog`/`.qstrip-prog` — 10.5px/800, white bg, 1px `--guide-border`, radius 999px, padding 2px 8px: `Question N` — card adds ` · M answered` once M>0. (No fixed "of 4" cap: the server decides when to stop — at 1 product, or when questions are exhausted.)
   - Card only: **"ⓘ Why we ask"** (`.qcard-why` 11.5px/700 dotted-underline, toggles `.qcard-whybox`: white bg, dashed guide border, radius 10px, 12.5px copy from `WHY_COPY[type]` — deterministic root-cause copy, e.g. brand: *"Within these results a few brands hold most of the ratings — brand is the fastest way to trust a pick. (The #1 reason shoppers distrust results.)"*).
   - **Skip** — `.qcard-skip`/`.qstrip-skip`, 11.5px/600 `--text-2`, margin-left auto, min-height 32px. **Skipping does NOT leave the loop**: the server picks the next most valuable question (max 3 skips per journey, then the loop ends gracefully).
2. **Question line** — card 17px/700 `--text` (margin-top 10px) / strip 14.5px/700 `--guide-text`.
3. **Option chips** — card: `role="radiogroup"`; button 14px/600, padding 10px 18px, **min-height 44px**, radius 999px, white, 1.5px `--border-strong`; hover → guide border + `#fffaf0` bg. Strip: `.qchip` 13px/600, padding 8px 14px, min-height 42px, same palette.
   - Each chip shows a **live count badge** (`.ccnt` 10.5–11.5px, `--surface-2` bg, radius 999px) = how many current results match that option. **Zero-count chips are disabled** (opacity .45/.5) — never a dead-end option.
   - Last chip: **"Something else…"** (`.qchip-more`, dashed border, `--text-3`) → focuses the typed row.
   - Chips wrap freely (flex-wrap) — nothing is ever clipped.
4. **Typed row** (always present — every question has options *and* a type answer):
   - Card `.qcard-typed`: input flex 1, 14px, padding 11px 14px, **min-height 44px**, 1.5px `--guide-border`, radius 12px, white; focus → guide border + 3px ring `rgba(245,158,11,.15)`. Send button: 13.5px/700, `--guide` bg white text, min-height 44px, radius 12px; disabled (opacity .5) when empty/busy.
   - Strip `.qstrip-typed`: same, slightly tighter (13.5px input, min-height 42px, radius 10px).
   - Placeholder (localized): `Or type it: e.g. under 1800, Titan, for my sister`. `maxLength=80`. Enter submits.
5. Strip only: optional reason line (`.qstrip-why` 11px `--text-3`) under the chips when the guide supplies one.

**Card container**: `--guide-bg`, 1px `--guide-border` + **4px left border `--guide`**, radius 14px, padding 14px 18px 16px, margin 14px 0 16px, `--shadow-sm`, fade-up 150 ms. **Strip container**: same palette, radius 12px, padding 10px 14px 12px, margin-bottom 14px.

**Question flow logic (deterministic policy, AI phrasing):**
- Triggered every search; the guide policy (`app/lib/guide.js`) decides the *type* sequence from the parsed slots + current result set; Gemini (one cached planning call per journey, `app/lib/plan.js`) may phrase and may plan ≤7 question types in a single call (10-min server cache keyed `query|slots|persona`); when no Gemini budget/keys remain, the rule chain asks the same question types with static phrasing. The policy decides, the LLM phrases — validated, ≤12 words, template fallback.
- Each answer: re-search with the merged constraint → **trail chip added** (removable) → next question computed on the narrowed set → repeat until ≤1 product (then "your pick" stop), questions exhausted, or 3 skips.
- **No question is asked whose answer is already in the query** (e.g. "gift for 5 year old" never asks "who is it for: men/women/kids" — the recipient slot is pre-filled); budget is never asked again once stated (no price-band question after a stated budget).
- **Rollback guard**: if an answer doesn't improve the match, a note appears: *"That answer didn't improve the match, so I kept your previous picks."*
---

## 7. Results state (after any search)

Top → bottom, inside `.wrap`:

1. **Refine search bar** — the hero's h1/sub/strip are replaced by a search bar alone (same `.searchbar` styling, `paddingBottom: 0`). Placeholder: `Refine or ask again: "wristwatch for dad under 5k"`. Clearing the input returns to the hero.
2. **Trail** (`.trail`, 12px `--text-2`, margin-bottom 14px, wraps):
   - First step: white pill `.step` (1px `--border`, radius 999px, 3px 10px) — **Search** bold + the query.
   - Then `→` arrows (`--text-3`) and one pill per answer/constraint.
   - AI-applied filter steps are **removable** `chip-x` buttons: `--brand-tint` bg, 1px `--border-strong`, brand text 700, radius 999px, padding 3px 6px 3px 10px, with an 18px circular ✕ inside (`.xx` 11px/800). Hover: brand border. Removing one re-runs the search without that constraint (no silent caps — O4).
3. **Result summary** (`.resultsum`, 12.5px/600 `--text-2`, margin-bottom 10px): `**N** products for "query" · sorted by best match` (single grid) or `· curated into shelves` (multi-category).
4. **Plain-mode banner** (only via `?mode=plain`): `.meta` 12px `--text-3` — "Plain mode — baseline keyword search: no budget or occasion understanding, no follow-up questions." + `Switch to Guided` (fchip).
5. **Rollback note** (when fired) and **echo line** (`.meta.echo` — restates the applied constraint).
6. **Outcome micro-survey strip** (G12, once per qualifying journey — add-to-cart/order always; 25% sample of no-action journeys on tab-hide): `.survey` — `--surface-2` bg, 1px `--border`, radius 12px, padding 10px 12px, 13px. Stage 1: *"Did you find what you were looking for?"* + chips **Yes** / **Not really**. Stage 2: *"What held you back?"* + 5 chips: *Wrong kind of product · Too expensive · Didn't trust these results · Not right for the occasion · Something else*. Dismiss ✕ at right.
7. **Question surface** (§6) when `s.guide` exists — always above the grid.
8. **Error state** (`.nullmsg`, 14px/600 `--danger`): "Search hiccup — {error}. Try again."
9. **Null / dead-end state** (no guide, `ok: false`, results empty or non-exact): `.dim` panel — h3 "No products matched that exactly" / "No exact match for "query" in the catalogue"; 13.5px body with 4 variants (exhausted × empty/non-empty, e.g. *"These are close, not exact — a rephrase with the exact product word usually fixes it."*); when fully empty, the 18 example chips repeat here.
10. **Skeleton** (while a re-search runs with empty grid): 8 `.sk` cards (same grid, 250px tall, shimmer sweep 1.2 s).
11. **Filter bar** (§7.1) → **Grid / shelves** (§7.2) → **"Show more"** → footer note for weak searches: *"One follow-up question can usually tighten this — pick an option above."* (when `ok:false` and turn < 4).

### 7.1 Filter bar (always visible with results — every query type)

`.filters`: white card, 1px `--border`, radius 12px, `--shadow-sm`, padding 12px 16px, margin-bottom 16px. One wrapping row `.frow` (gap 7px):

| Group | Control | Detail |
|---|---|---|
| Sort | label "Sort" (`.flabel` 11px/800 uppercase `--text-3`, min-width 58px) + 4 fchips | **Relevance** (default) · **Price ↑** · **Price ↓** · **Top rated** |
| Price | 1px vertical `.fsep` + label "Price" + adaptive fchips | `priceBandsFor(budget)`: default bands *under ₹1k · ₹1k–3k · ₹3k–10k · ₹10k & up*; **when the query states a budget, bands at/above it are removed** ("gift under 2000" shows no band above ₹2k — the user's explicit requirement); if only one non-narrowing band remains, the whole Price group is hidden |
| (always) | **4★ & up** fchip, **Hide accessories** fchip | rating ≥4; excludes `is_accessory` SKUs |
| Brand | sep + label "Brand" + up to 8 fchips | brands present in the current result set, by frequency |
| Category | sep + label "Category" + up to 6 fchips | hidden in single-category layouts |
| (when active) | **Clear all** (`.fchip.clear` — `--danger` text, transparent) | resets all six facets |
| (right) | `.filter-meta` (12px `--text-3`, margin-left auto) | `N of M products · X ms` |

**fchip** (all filter chips): 12.5px/600, padding 5px 12px, radius 999px, white, 1.5px `--border-strong`, text `#475467`; hover → brand border/text; `.on` → brand bg white text. Filters are client-side (`applyFilters`), instant, tracked (`filter_applies`), and independent of the question loop.

### 7.2 Result layout

- **Decision:** if the top category is ≥60% of the filtered set → **single ranked grid** (API relevance order). Otherwise → **curated shelves**: "Best matches" (3, ranked by `recommendScore` — persona price-fit + brand affinity + quality + trust; head count line: "ranked for your profile · price fit, brand preference, quality & trust" or "highest-scoring picks for this search") → up to 3 category shelves ("N picks from this match", 4 each) → "More products" shelf.
- **The card world (S7 + count parity, 2026-11-14):** every fetched result list is family-folded **once, at storage time** (`cardWorld` in `app/page.jsx`: one card per variant family, max 2 cards per brand+model). That folded list is what the page stores as the result set — the "N products" badge, the follow-up **option counts** (sent to `/api/guide` as the visible world; server counts and the client card recount both run over it), the narrowing meter (A → B) and both layouts render this ONE set 1:1 (the layout never re-folds; `groupGrid` is idempotent). Consequence: the number next to any option chip always equals the number of cards the shopper can count in the list below the question, and clicking a chip lands on exactly that many cards (meter "N → k", echo "chip · k of N left").
- **Grid** `.grid`: `repeat(auto-fill, minmax(235px, 1fr))`, gap 12px. The FULL card world renders — no initial cap, no "Show more" (the pre-2026-11-14 "initial 24 + Show more (N left)" pagination hid the rest of the list the counts describe, so a by-eye count of the visible slice never matched the chip numbers).
- **Empty-after-filters**: `.dim` panel "Nothing left after your filters" + inline "clear all" (red, bold).

### 7.3 Product card (`.card`)

- Container: white, 1px `--border`, radius 12px, padding 10px, column, gap 6px, `--shadow-sm`; **whole card clickable** (opens PDP; `role="link" tabIndex=0`, Enter works); hover: `translateY(-2px)`, `--shadow-md`, border `#cdd5e1`.
- **Image well** (`.imwell`, centered, margin-bottom 8px): **Tile 215×215** — designed placeholder (never a photo): category-tinted bg (fashion `#F7E8EE`, home `#EAF1E6`, electronics `#E6EEF8`, beauty `#FBEBE3`, toys/baby `#FFF3D6`, sports `#E3F3F1`, auto `#E6EEF8`, kitchen `#EAF1E6`, watch `#EEF0FF`, default `#F0ECE4`), 44px stroke glyph (dress/sofa/plug/sparkle/ball/stroller/dumbbell/wheel/pot/watch/box), **brand monogram** (24px white circle, 1px `#d8d2c6`, 12px/800 `--text-2`) top-left 8px, and the 8.5px "illustrative" watermark bottom-right.
- **Badges** (absolute top 8px left 8px): `Best match` (`.badge-best`, 10px/800 uppercase, brand text, white bg, brand border, `--shadow-sm` — on the top-3 of a single grid / the rec shelf) or `Close match` (`.badge-close`, 10px/700 `--text-2`, `--surface-2` bg) — semantic items surfaced by the fallback layer.
- **Category** `.cat`: 10.5px/700 uppercase ls .07em `--text-3` (display names: Fashion / Home & Kitchen / Electronics / Beauty).
- **Title** `.t`: 13.5px/600, 1.4, 2-line clamp, min-height 38px (variant families strip the `(Maroon M)`-style parenthetical).
- **Variant line** `.vline` (families only): 11px/600 `--text-3`, e.g. "6 sizes · 4 colours".
- **Brand chip** `.brandb`: 10.5px/700 uppercase, `--brand-tint` bg, 1px `--border-strong`, radius 6px, padding 1.5px 7px.
- **Price row**: `₹12,345` 17px/800 (en-IN grouping) + family "from ₹X" (`.onwards` 11px/600 `--text-3`).
- **Rating row**: rating pill `.rpill` (11.5px/700, radius 999px, padding 1.5px 8px) — ≥4 `.good` (`--success-bg`/`--success`), ≥3 `.mid` (`--warning-bg`/`--warning`), else `.low` (`--surface-2`/`--text-2`) — `★ 4.3`; then count "1,204 ratings" (`.rc` 11.5px `--text-3`).
- **Over-budget label** `.overbud` (11px/600 `--warning`): "Slightly over your budget" — shown when price is in (budget, budget×1.6]; the relaxation is always labelled, never silent.
- **Add button** `.card-add`: full width, margin-top auto (pinned to card bottom), 13px/700, padding 9.5px 10px, radius 10px, **brand bg white** (hover `--brand-hover`). Click adds to cart (stopPropagation — does not open PDP) and fires the bottom-right **cart toast** (§12) + badge bounce.
- **Skeleton card**: 250px placeholder with the same borders + shimmer.

---

## 8. Product detail drawer (PDP)

Opens on any card/product tap. `role="dialog"`, Esc closes, backdrop click closes.

- **Overlay**: fixed inset, `rgba(16,24,40,.45)`, z 100, right-aligned drawer (`.drawer.pdp` **460px**, max-width 92vw; 100% width ≤640px). Drawer slides in from +30px, 200 ms.
- **Head** (`.drawer-head`, padding 18px 20px 12px, border-bottom): "Product" 16.5px/750 + ✕ (20px, `--text-3`, hover `#f2f4f7`).
- **Body** (`.pdp-body`, scrollable, padding 4px 20px 12px):
  1. **Top row**: Tile **128×128** + title 16.5px/700 (1.35) + brand chip + rating row: `.rpill` (12px/700 version) `★ 4.3` + `1,204 ratings · 4.1 adjusted for rating count` (`.pdp-rc` 11.5px `--text-3`; Bayesian shrinkage, C=30, m=4.2).
  2. **Price**: 24px/800 tabular + "inclusive of all taxes (demo)" 11.5px `--text-3`.
  3. **Variants** (family SKUs only): section label "Variants (N in this catalogue)" (`.pdp-sec-t` 11px/800 uppercase `--text-3`); radiogroup of `.pdp-var` chips (12px/600, padding 5px 10px, radius 8px, 1px `--border-strong`; `.on` = brand-tint + brand border; each shows its price in `--text-3`). Selecting re-renders the PDP with the sibling (tracked `variant_select`).
  4. **Why this matched**: green chips (`.whychip`, 12px/600, `--success` on `--success-bg`, 1px `#cde8d5`) with ✓ prefix — e.g. "✓ Under ₹2,000", "✓ Tagged wedding", "✓ Brand: Titan", "✓ For women", or "✓ Best score for your search".
  5. **Trust & delivery (demo)**: `.pdp-note` (`--surface-2` bg, radius 10px, 12.5px/1.7): region-aware line (pincode set → "Delivery to {region} region (demo estimate): 2–4 days", else "Delivery estimate (demo): 2–4 days — set a pincode for a regional estimate") + "7-day return window (demo policy)." + "Demo rating — indicative, not live marketplace data." when `rating_basis === "synthetic"`.
  6. **Similar items** (up to 4, same category, ±40% price, best-rated): rows `.pdp-sim-c` (Tile 44 + 12px title clamp + 12.5px/750 price; hover brand border) — clicking swaps the PDP to that SKU.
- **Sticky footer actions** (`.pdp-actions`, border-top, white, padding 14px 20px): **Add to cart** (`.pdp-add`, flex 1.4, 14px/750, padding 12px, radius 11px, brand) + **Buy now** (`.pdp-buy`, flex 1, same size, `--text` ink bg white; hover opacity .9 → opens checkout directly).
- Linkable: `/?sku=SKU` reopens the PDP; `product_open` / `pdp_close` (dwell) tracked.

---

## 9. Cart, checkout, orders

### 9.1 Cart drawer
- `.overlay` (backdrop, z 100) + `.drawer` **400px** (max 92vw), full height, slide-in from +30px.
- Head: "Your cart" 16.5px/750 + count badge (`.drawer-count` 12px/700 brand, `--brand-tint` bg, radius 999px) + ✕.
- Rows (`.cart-row`, grid `1fr auto`, padding 13px 0, border-bottom): title 13.5px/600 · "Category · Brand" 12px `--text-2` · "₹price × qty" 13.5px/700 · **qty stepper** (`.qty`: 26×26px buttons radius 8px 1.5px `--border-strong`, − / qty / +; − at 1 removes the row, tracked `remove_from_cart`).
- Empty state (centered, 40px top padding): "Your cart is empty. Find something you love on the Search tab."
- Foot: Total row (label 14px `--text-2`; value 19px/800) + **Place order →** (`.primary`: full width, 13px padding, 15px/750 white on brand, radius 11px; hover `--brand-hover`).

### 9.2 Checkout modal
- Centered (`.overlay.mid`), `.modal` 480px (max 92vw, max-height 84vh, radius 16px). Head "Checkout" + ✕; read-only item rows (title + line price); note 12px `--text-3`: "Prototype checkout — no real payment is processed. Addresses & payments land in phase 2."; foot: Total + **Place prototype order** (`.primary`).
- On place: order saved to `localStorage.askcart_orders_v1` (max 20), cart cleared, **order toast** fires, journey marked resolved+ordered.

### 9.3 Order toast (`.toast`)
- Fixed bottom-center, z 200, `--text` ink bg white text, radius 12px, padding 13px 20px, gap 14px: "Order placed ✓" (14px/750) + "ord_x7k2m1 · 3 items · ₹12,345" (12.5px `#d0d5dd`) + ✕.

### 9.4 Orders tab (`/?tab=orders`, max-width 860px)
- Head: "Previous orders" 20px/800 + note "Simulated checkout - no real payment, address or delivery" (12px `--text-3`).
- Order cards (`.order-card`: white, radius 12px, padding 14px 16px): top row — order id (12.5px/750 tabular) + **Demo** tag (10.5px uppercase, `--surface-2` bg, `--border-strong` border) when seeded + date (en-IN, e.g. "5 Nov 2026") + right-aligned "Simulated delivery" (`#065f46`, 600); item rows (13px: title ellipsized + "₹line (×qty)"); total row (border-top, "Total" 13px `--text-2` + value 14px/700).
- Empty state: "Previous orders" + "No orders yet - checkout is simulated in this prototype. Place your first (demo) order from the Search tab."
---

## 10. Analytics tab (`/?tab=analytics`)

Full-screen-width (same `.wrap` 1400px as every other sub-tab — the layout is uniform across all six).

- **Livebar** (`.livebar`): `--success-bg` bg, 1px `#a7f3d0`, radius 10px, padding 9px 14px, 12.5px/600 `#065f46`; 8px `--live` dot pulsing (1.6 s). Text: "Live · refreshes every 2.5 s · shared across every user of this deployment".
- **Sub-tab pills** (`.an-tabs`, gap 8px, wraps): 13px/650, padding 8px 16px, radius 999px, 1.5px `--border-strong`, white; `.on` = brand fill. The six tabs: **Overview · Search & Guide · Catalogue & Brands · Journeys & Orders · Validation & Study · Backend (Admin)**.
- Data: `GET /api/analytics/summary` every **2.5 s**, `/api/analytics/catalog` every 15 s (recomputed live from the catalogue), `/api/analytics/evidence` every 15 s (eval artifacts re-read live).

**Shared primitives:** `.dim` panel (white, radius 12px, padding 16px 18px, h3 = 12px/800 uppercase `--text-2`); `.statgrid` (auto-fill minmax 165px, gap 11px) of `.stat` cards (key 11px uppercase 750, value 22px/800 — red when `warn` —, note 11.5px); `.bar-row` (190px label / 9px gradient bar `--brand→#6366f1` / right-aligned tabular count + share); `.tbl` (13px; th 10.5px uppercase; row borders `#f2f4f7`); `.feed` (event feed, max-height 430px, monospace 11px event names in brand-deep); `.tagchip` (green pills).

### 10.1 Overview
- 15 stat cards: **Searches · Failed-search rate** (warn >15%, note "<2 on-intent results / search (study's null defn)") · Search success · Products viewed · Cart adds (% of views) · Orders (prototype, ₹ total value) · Onboarding completed (done/skipped) · Buy-now clicks (split vs cart checkouts) · Filter applies · Recommendation clicks · Journeys (multi-search sessions) · Avg journey time · Avg order value · Cart → checkout (% of cart views) · Guide questions (rescue vs refine split) · Avg answer time (time to tap a chip).
- **Activity · events per minute (live)** — `.act-chart` 116px-tall columns (72%-wide bars ≤36px, `#6366f1→--brand` gradient, 6px radius tops), per-minute count above, minute label below.
- **Conversion funnel · every step of the journey** — 6 bar rows: Searches → On-intent results (≥2) → Viewed products → Added to cart → Started checkout → Orders placed, each with "· N% of prev".
- **Shopper profiles · what onboarding tells us (persona v2)** — 3 bar columns (User type / How they judge value / Shopping for).
- **Live event stream** — last ~50 interactions: monospace event type + composed payload text + "just now/30s/5m/2h/3d ago".

### 10.2 Search & Guide
Panels: **Top queries · what people search, and how it goes** (table) · **Follow-up questions · what the guide asks, and what gets tapped** (table: question type × asked/answer rate) · **Guided step effectiveness · rescue vs refine** (stat cards incl. "Answered — N — x% of questions") · **Filter usage · mid-search refinement (brand / price / rating / category / sort)** (table) · **Journey resolution by turns** (t1/t2/t3+/unresolved stat cards).

### 10.3 Catalogue & Brands
- 7 stat cards: **Products (SKUs)** ("live from catalogue") · Price · median (p25–p75, p90 note) · Price · average (note "skewed up by gold, ACs & jewellery") · Branded SKUs (% + count) · Avg rating /5 (median ratings/product) · Products with 100+ ratings · Occasion-tagged.
- **Category distribution** (top 12 bars w/ share) · **Category detail · top 12 by SKU count** (table: SKUs/Share/Median/Range) · **Brands in catalogue · top 15** (table) · **Price bands (INR)** (bars) · **Rating buckets** (bars) · **Occasion & intent tags** (tag cloud "name × count share%") · **Category engagement** (views+carts bars) · **Brand engagement**.

### 10.4 Journeys & Orders
Stat cards (Journeys resolved turn 1 / 2 / 3+ / **Unresolved** warn>5) · **Persona cohorts · who converts (from onboarding)** (table) · **Recent orders (prototype)** (table).

### 10.5 Validation & Study
Panels, all re-read from artifacts (never hand-typed): **Guided search study · n=150 journeys, calibrated against the live app** (null 27.3%→8.0% headline with Wilson CIs) · **LLM-mode stability** (phrasing-only; zero behaviour drift) · **Scale simulation · 3,000 generated queries** (robustness, not headline) · **Relevance audit · LLM-judged** (queries × top-3) · **Regression canaries** (111+6 green) · **Catalogue profile (recomputed live)** · **Live vs study** (table: this deployment vs measured study) · **Outcome micro-survey (live)**.

### 10.6 Backend (Admin) — per-user analytics
- 6 stat cards: **Users (sessions)** ("per deployment, all-time") · Users with searches · **AI decisions** (split "LLM X · Gemini Y · rules Z" — legacy LLM column kept for the ledger) · **Gemini key switches** (warn when >0, note "429/quota rotations") · Orders (AOV note) · Cart rate (cart adds per search).
- **Filter row** (`.an-filters`, 12.5px): **Persona** (All + every persona seen), **Min searches** (Any/≥1/≥3/≥5), **Active** (All time / Last hour / Last 24h) + "showing X of Y users".
- **Table** (11 columns, one row per session/browser): User (sid, first 12 chars…) · Persona · Active (ago) · Searches · Questions · Answer rate · Carts · Orders · Value (₹) · **AI mix (Q/G/R)** (+ key switches in parens) · Funnel ("N% to cart").
- Foot note: admin reads the same shared store as the shopper dashboards; per-session rollups survive the 500-event feed window; simulated traffic is tagged `env=sim` in a separate store.

---

## 11. AskCart Assistant (chat)

### 11.1 Launcher & nudge (search tab only)
- **FAB** `.cht-fab`: 56×56 circle, fixed **right 24px bottom 24px**, z 80, `--brand` bg, 26px white 4-point spark SVG, shadow `0 8px 24px rgba(28,27,24,.18)`; hover: `--brand-hover` + −1px lift. (Mobile ≤640px: right 16px bottom 16px.) Hidden while the panel is open (≥1024px). `aria-label="Open AskCart assistant"`.
- **Label pill** `.cht-fab-label` (desktop, when the launcher passes a label): fixed right 88px bottom 36px, white, 1px `--border-strong`, radius 10px, 13px/600, `--shadow-md` — e.g. "Ask AskCart".
- **Nudge** `.cht-nudge` (once per session, after the first resolved search, when no null-search escalation happened): fixed right 24px bottom 88px, white card, radius 12px, `--shadow-md`, 12.5px/16px, max-width 230px: *"Ask the assistant to narrow it down, compare, or explain a product."* + ✕ (dismissal stored per session). Accepting opens the chat (tracked `chat_nudge_accepted`). **Never auto-opens, never nags.**

### 11.2 Panel (split screen)
- Desktop ≥1024px: in-flow 400px column, `position: sticky; top: 0; height: 100vh`, `--bg` bg, 1px `--border` left border, slide-in from +24px 180 ms. **The page content shifts left** (flex), nothing is covered. `role="complementary"`.
- ≤1023px: fixed, top 59px (below topbar), right 0, full remaining height. ≤640px: bottom sheet (75dvh max 640px, 16px top radius, sheet-up animation 180 ms), `role="dialog" aria-modal`.
- **Header** `.cht-header`: 56px tall, `--surface`, border-bottom; left: avatar (24px brand circle, white "A" 13px/800) + "AskCart Assistant" 16px/600 + sub "AI · demo catalogue" 12px `--text-3`; right (margin-left auto): **⋯ Clear chat** (44×44, 18px glyph, hover `--surface-2`) and **✕ Close** (44×44). Focus moves to the composer on open; Esc closes; Tab is trapped inside the panel.
- **Message body** `.cht-body`: `role="log" aria-live="polite"`, padding 14px 14px 8px, autoscrolls unless the user scrolled up (within 80px of bottom = "near"); a sticky **"New message ↓"** pill (`.cht-newpill`, brand, radius 999px, 12px, `--shadow-md`) appears when a new assistant message arrives while scrolled up.

### 11.3 Message anatomy
- **Assistant text** `.cht-msg`: `--surface` bg, 1px `--border`, radius 14/14/14/**4** (bottom-left cut), 14px/20, max-width 86%, fade-up 8px/150 ms, pre-wrap.
- **User text** `.cht-msg-user`: right-aligned (margin-left auto), max-width 80%, **`--brand-tint` bg**, transparent border, radius 14/14/**4**/14 (top-right cut).
- **Error/system** `.cht-msg-err`: `--warning-bg` bg, `--guide-border` border, `--warning` text: "Couldn't reach AskCart. **Retry**" (retry re-sends the same turn once).
- **Thinking**: 3-dot indicator (6px dots `--text-3`, 1.2 s staggered bounce) inside an assistant bubble.
- **Question box** `.cht-qbox` (assistant questions): `--guide-bg`, 1px `--guide-border`, radius 12px, padding 10px 12px, max-width 92%; eyebrow "Quick question" (11px/700 uppercase `--guide-text`) + question 13.5px + **QuickReplies chips** below.
- **Quick reply chips** `.cht-chip`: radius 999px, white, 1px `--border-strong`, 13px, padding 7px 12px, gap 6px; count suffix (11.5px `--text-3` tabular); hover → brand-tint + brand border; **disabled (opacity .45) when count = 0** (title "No matches for this option"); ghost variant = dashed border ("Something else"). `role="radiogroup"`, **arrow-key navigable** (←↑→↓, Enter selects). Chip tap = optimistic user-bubble echo, then the request with `chip_id`.
- **Product mini card** `.cht-prod` (max 3 per message): white, 1px `--border`, radius 12px, padding 9px, gap 10px — **Tile 72×72** + column: title 13px/18 2-line clamp; price 15px/600 tabular + "★ 4.3 (1,204)" 11.5px `--text-3`; up to 3 reason chips (`.cht-reason` 11px, `--success` on `--success-bg`, radius 6px, "✓ " prefix); button row: **Add** (`.cht-btn-primary`, brand, min-height 36px, radius 9px) + **Details** (`.cht-btn-ghost`, 1px `--border-strong`). Positions tracked (`chat_card_click`, `chat_add_to_cart`).
- **Compare table** `.cht-compare`: bordered radius-12 table, 12px; header row `--surface-2` 600; columns Item / Price / Rating / Specs; numeric cells tabular.
- **Notice** `.cht-notice`: `--warning-bg`/`--warning` (relaxed-constraint disclosure) or `.info` (`--surface-2`/`--text-2`) — 12.5px, radius 8px, max-width 92%.
- **Feedback row** (latest assistant message only, when not busy): 👍 / 👎 (12px, `--text-3`, hover `--surface-2`). 👎 first tap expands **5 reason chips** (same root-cause labels as the page survey: Wrong kind of product · Too expensive · Didn't trust these results · Not right for the occasion · Something else); second tap or a reason records `chat_feedback {value, reason}`. Hidden for `deflect` acts and after use.

### 11.4 Composer
- `.cht-composer`: `--surface`, border-top, padding 10px 12px 12px, sticky at panel bottom.
- Textarea `.cht-input`: flex 1, auto-grow 1→4 rows (max-height 88px), 14px/20, padding 10px 12px, radius 12px, 1px `--border-strong`; focus: 2px brand outline (inset). `maxLength=500`.
- **Send** `.cht-send`: 40×40, radius 12px, brand bg, 18px white play/send glyph; disabled (opacity .5) when empty/busy. Enter sends, Shift+Enter newline.
- Counter `.cht-count` (11px `--text-3`, right) appears at ≥400 chars: "412/500".
- Placeholder rotates every 7 s through: `Try: "gift for mom under 1500"` / `Try: "1.5 ton ac under 45k"` / `Try: "saree for ammi under 2k"` / `Ask about a product: "is the first one a good gift?"`.

### 11.5 Empty state (first open)
Greeting (14px/20): "Hi, I'm the AskCart assistant. I can search, compare, and explain products - answers come only from the demo catalogue." + "Try one of these:" (12px `--text-3`) + 4 context chips: hero — *Gift under ₹2000 · Diwali decorations · Phone under ₹15k · Wristwatch for dad under 5k*; on a PDP — *Is this a good gift? · How is the rating? · Is the price fair?*; disclaimer line (11px): "AI assistant · demo catalogue · can be wrong".

### 11.6 Behaviour
- Transcript in `sessionStorage` (`askcart_chat_v1`), capped at 40 messages; SSE stream with abort on close/new send; retry once on network error with the same turn; chat can **edit the results grid** (`chat_apply_to_results` with `slots_changed`), add to cart, open PDPs, open the cart; the shared `SearchSession` keeps one `pendingQuestion` (card vs chat never double-ask).
- NLU: rules-first parser + Gemini JSON with validation; output guard (≤40 words, catalogue-grounded only); template fallback on timeout/breaker — **0 ungrounded claims** is a CI gate.

---

## 12. Toasts (all fixed, bottom, non-modal)

| Toast | Class | Position / style | When |
|---|---|---|---|
| Onboarding payoff | `.obtoast` | bottom-center (bottom 22px), z 120, `--text` ink bg, white 13px/600, radius 999px, padding 11px 20px, max-width 90vw, 6 s | After persona answers (see §5) |
| AI routing notice | `.obtoast.aitoast` | same + 3px left border `--border-strong` | Key-rotation / limit events: the pill updates and a toast states that the daily limit was hit and routing moved to the next key (or to rules) |
| Cart add | `.carttoast` | bottom-**right** 24px, z 130, **brand** bg white 13px/650, radius 999px, padding 10px 18px, `cartpop` (scale .96→1, 180 ms) | Every add-to-cart from any surface (grid card, PDP, chat, preview) — item name + price, so the user always sees that something happened (plus the badge bounce) |
| Order placed | `.toast` | bottom-center, z 200, ink bg, see §9.3 | After checkout |

---

## 13. Footer

`footer`: white, 1px `--border` top, margin-top 60px. `.foot-inner`: max-width 1180px, padding 26px 24px, wraps, gap 18px/40px.
- `.foot-brand`: "AskCart" (Cart in brand) " · guided shopping search" 13.5px/750.
- `.foot-col` (12.5px `--text-2`, line-height 1.7): "Demo catalogue: 54,304 SKUs (≈25k US-sourced listings converted to INR + ≈29k India layer) with indicative prices and ratings — not a live marketplace. Checkout is simulated: no payments, addresses or real delivery."
- `.foot-note` (11.5px `--text-3`, full basis): "Every interaction event is public in Analytics · AI answers only from catalogue fields · method & evidence: PROJECT.md".

---

## 14. Interaction model

### 14.1 In-app back navigation (no browser-history dependency)
- `pushNav()` snapshots `{tab, cartOpen, checkoutOpen, order, pdp, search?}` (max 10) whenever: a tab switches, a drawer/PDP opens, the cart opens (from the top bar), checkout opens, the search state changes to a new one.
- The **← back button** (top bar) pops the snapshot: restores tab + open surfaces + (for search snapshots) the full previous search state — so "search → answer → back" re-opens the earlier question + its option list (the "remove it and go back" requirement).
- Closing X's **do not push** (closing IS going back). Logo click = hard reset to home (stack cleared, scroll top). URL mirrors state via `history.replaceState` (`/?tab=orders`, `/?tab=analytics&anview=backend`, `/?sku=SKU`, `/?q=…`, `/?onboard=1`).

### 14.2 Question-loop rules (the guided contract)
1. **Guided is default and the only offered mode** — no mode picker for shoppers.
2. **Every search gets at least one follow-up question** on top of the results (card for thin/first searches, strip for resolved ones) — including spec queries, Hinglish, typos.
3. **Options on every question** (3–4 live-counted, mutually exclusive, recipient-aware — "gift for 5 year old" → kids-only options) **plus** a "Something else…" + typed row.
4. **No re-asking what the query already said** (budget, recipient, size, brand slots pre-filled).
5. **Each answer narrows the set and triggers the next question on that narrowed set** (server-side policy + one cached Gemini plan per journey; ≤12-word validated phrasing; deterministic fallback). Loop continues until **exactly 1 product** ("your pick" stop), questions exhausted, or 3 skips.
6. **Skip keeps the loop going** (server picks the next question); **trail chips are removable** at any time and re-run the search.
7. Silent caps are banned: any applied default (e.g. "Not sure / flexible" budget) shows as a removable trail chip.

### 14.3 Keyboard
Enter (search box / typed answer row / composer) = submit; Shift+Enter = newline (composer); Esc = close PDP/chat/none (top-level); ←→↑↓ = chip radiogroups (page + chat); Tab = focus trap inside the chat panel; all focusable targets ≥44px (page) / 44px header targets (chat).

### 14.4 i18n label tables (static, `app/lib/i18n.js` — scope: question text, option labels, hero copy)

| Key | EN | HI | HINGLISH |
|---|---|---|---|
| heroTitle | Tell us what you need — in your own words. | अपनी ज़रूरत अपनी भाषा में बताइए। | Jo chahiye, apne words mein bataiye. |
| heroSub | Try English, Hindi or Hinglish. We ask one quick question only if we need it. | हिंदी, Hinglish या English में search करें। ज़रूरत पड़ी तो हम एक ही सवाल पूछते हैं। | Hindi, Hinglish ya English — kaise bhi search kijiye. Zarurat padhi toh bas ek quick question. |
| searchPlaceholder | Try: "shaadi gift under 2k" | जैसे: "शादी के लिए 2000 तक का गिफ्ट" | Jaise: "shaadi gift 2000 tak" |
| refinePlaceholder | Refine or ask again: "wristwatch for dad under 5k" | जैसे: "पापा के लिए 5000 तक की घड़ी" | Jaise: "papa ke liye 5000 tak ki ghadi" |
| popular | Popular: | लोकप्रिय: | Popular: |
| strip | Optional: set your pincode & language for better results | वैकल्पिक: बेहतर results के लिए pincode & भाषा सेट करें | Optional: better results ke liye pincode & language set kijiye |
| setNow / use | Set / Use | सेट करें / उपयोग करें | Set kijiye / Use kijiye |
| stripLang / stripPin | Language / Delivery pincode (optional) | भाषा / डिलीवरी पिनकोड (वैकल्पिक) | Language / Delivery pincode (optional) |
| pinHint | 6 digits — used for regional festivals & demo delivery estimate only | 6 अंक — सिर्फ regional festivals और demo delivery estimate के लिए | 6 digits — sirf regional festivals aur demo delivery estimate ke liye |
| skip | Skip for now | अभी छोड़ें | Abhi nahi |
| qEyebrow | Quick question | एक जल्दी सवाल | Ek quick sawaal |
| qOptional | Optional refinement | इच्छा हो तो refine करें | Chahiye toh refine kijiye |
| qReady | — the results below are ready to shop | — नीचे results तैयार हैं | — neeche results ready hain |
| whyAsk | Why we ask | क्यों पूछ रहे हैं | Kyu pooch rahe hain |
| skipQuestion | Skip | छोड़ें | Skip |
| orType | Or type it: e.g. under 1800, Titan, for my sister | या type करें: जैसे 1800 तक, Titan, बहन के लिए | Ya type kijiye: jaise 1800 tak, Titan, behn ke liye |
| somethingElse | Something else… | कुछ और… | Kuch aur… |
| send | Send | भेजें | Bhejiye |
| notSure | Not sure / flexible | पक्का नहीं / जो अच्छा लगे | Pakka nahi / jo achha lage |
| noPref | No preference - best rated | कोई फ़र्क नहीं — ज़्यादा rated दिखाइए | Koi farket nahi — best rated dikhao |
| qBudget | Got it - what budget should I keep in mind? | समझ गए — budget कितना रखें? | Samajh gaye — budget kitna rakhun? |
| qOccasion | Quick one: what's the occasion? | छोटा सा सवाल: मौक़ा क्या है? | Chhota sa sawaal: kaisa mauka hai? |
| qCategory | I can point you better - which of these are you after? | बेहतर सुझाव दे सकता हूँ — इनमें से क्या चाहिए? | Achha point kar sakta hoon — inme se kya chahiye? |
| qBrand | Any brand preference? Or I'll pick the best-rated ones. | कोई brand preference है? नहीं तो सबसे rated दिखाऊँगा। | Koi brand preference? Nahi toh best-rated dikhata hoon. |
| qForWhom | Quick one - who's it for? | छोटा सा सवाल — किसके लिए है? | Chhota sa sawaal - kiske liye hai? |
| qSize / qCapacity | Any size you need? (or I'll show all) / What size / capacity do you need? | कोई size चाहिए? (नहीं तो सभी दिखाऊँगा) / क्या size / capacity चाहिए? | Koi size chahiye? (nahi toh sab dikhata hoon) / Kaunsi size / capacity chahiye? |
| occasions | Gift / Birthday / Wedding – Shaadi / Anniversary / Festival / Everyday use | उपहार / जन्मदिन / शादी / ब्याह वर्ष / त्योहार / रोज़ाना का काम | Gift / Birthday / Shaadi / Anniversary / Tyohaar / Everyday use |
| budget label | Under ₹1,500 | ₹1,500 से कम | ₹1,500 tak |

`<html lang>` follows: `en` → `en`, `hi` → `hi`, `hinglish` → `hi-Latn`.

---

## 15. Accessibility & motion

- All interactive targets ≥44px where the surface is touch-first (question chips, header buttons, back button); focus-visible ring 2px brand everywhere.
- Question chips: `role="radiogroup"` / `role="radio"`; chat chips arrow-key navigable; chat panel focus-trapped with focus return to the launcher on close; messages in `role="log" aria-live="polite"`; toast/echo lines `role="status"`; persona modal `role="dialog" aria-modal`.
- `prefers-reduced-motion`: all animations/transitions disabled (global + chat).
- Contrast: text colours chosen per the brief §8.1 gate (guide-text #8A4B05 on #FFF6E5, brand #4338CA on white/tint, etc.); contrast is a standing CI check (16/16 pairs).
- Cart hydrates after mount (SSR-safe) — no hydration mismatch on the cart badge.

## 16. File map (UI-relevant)

| Area | Files |
|---|---|
| Design system + all page CSS | `app/app/globals.css` |
| Page shell, hero, results, question surfaces, topbar, toasts, nav | `app/app/page.jsx` |
| Persona modal + payoff toasts | `app/app/ui/onboarding.jsx` |
| PDP drawer + Tile/Glyph | `app/app/ui/pdp.jsx` |
| Cart drawer / checkout modal / order toast | `app/app/ui/cart.jsx` |
| Orders tab | `app/app/ui/orders.jsx` |
| Analytics (6 sub-tabs) | `app/app/ui/analytics.jsx` |
| Chat (FAB, panel, messages, chips, composer, feedback) | `app/app/ui/chat/*.jsx` + `app/app/ui/chat/chat.css` |
| i18n tables | `app/app/lib/i18n.js` |
| Example chips | `app/app/lib/sample_queries.js` |
| Question policy / plan / NLU | `app/lib/guide.js`, `app/lib/plan.js`, `app/lib/gemini.js`, `app/lib/ai-refine.js` |
| Event tracking | `app/app/lib/track.js` (schema: `docs/event_schema.md`) |
