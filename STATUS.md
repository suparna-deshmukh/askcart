# AskCart - Build Status (2026-11-15, v6 - 36,045-SKU catalogue, search v6, production UI)

## Point 1 - Agentic extractor: DONE (LIVE on Hugging Face)
- HF Space (same pattern as the photo project):
  https://pm-ai-18-askcart-extractor.static.hf.space/
  (overview / root causes / agent audit / trends / bayesian / live probe)
- Rebuilt on the photo_case architecture, retargeted to e-commerce, v3 scope:
  - 5 review sources: Play (33,172 live) / App Store (3,450 live RSS -
    endpoint is back up) / Reddit (3,021 live) / Amazon product reviews
    (40,000, HF range-sampled) / Trustpilot (15,000, HF mirror)
  - 2 insight tools: Google Suggest (IN) + Wikipedia pageviews seasonality
    -> data/out/trends_insights.json
  - 6-stage DuckDB pipeline (auto-discovers raw sources):
    94,643 raw -> 87,603 clean -> 6,041 complaints -> 4 root causes
    (trust 42.2 / budget 31.4 / zero-wrong 19.3 / occasion 7.1)
  - LLM: Qwen38-27B via LiteLLM proxy (Gemini removed everywhere):
    agent fetch planning (audited, logs/agent_decisions.jsonl),
    root-cause label verification (stratified 600, parallel shards),
    app guided follow-ups
- Vercel: package v3 staged (evidence API + /trends + /sources), blocked on
  free-plan daily limit; watcher retries (logs/vercel_watch.log).

## Point 2 - Platform prototype + datasets: DONE (expanded)
- Corpus: 94,643 reviews (5 sources) + demand/seasonality signals
- Catalogue: 36,045 SKUs = 24,998 US base (band-aware, gift-budget depth,
  USD->INR x83.5, 2 fake flagship-clone listings removed; v3 supplement:
  +237 curated real models in 15 flagship classes; scripts/catalog_supplement.py)
  + 11,047 India layer (scripts/catalog_india.py: 838 hand-written anchors +
  2,271 listing-matrix family rows incl. R10 families - winter wear, home
  health (Omron/Dr. Morepen/BPL/ACCU-CHEK), feature phones (Nokia/itel/
  Karbonn), luggage & travel (Samsonite/American Tourister/baggit),
  engagement & diamond, ethnic footwear (Bata/Relaxo/Sportax), tiffin &
  food storage, ayurveda (Dabur/Patanjali); every occasion, every stratum
  Rs 49-2L, 299 real brand names; 3 brand-collision tokens dropped after a
  collision audit vs the US pool: safari/lava/casino; stanley KEPT -
  genuine thermos brand)
  - median Rs 2,419 (p25 1,249 / p75 6,489 / p90 15,019 / p99 75,399);
    bands <=2k 42.9% / 2-5k 26.2% / 5-10k 14.4% / 10-20k 9.4% / >20k 7.1%;
    37.2% branded (13,406 SKUs); 11.5% occasion-tagged
- Interviews: 12 personas (P1-P12, docs/interviews/; corpus-grounded
  simulations - supersede with real sessions before submission)
- 5 drop-offs mapped; 3 solved (D1 budget, D2 occasion, D3 zero-result)
- Search v6 + relevance audit: 96.0% usable (relevant+partial,
  117/27/6 of 150 results), Qwen-judged, 53 queries x top-3 (+8 R10 kinds:
  health/winter/featurephone/travel/engagement/ethnic_shoes/tiffin/ayurveda)
  (eval/results/relevance_summary.json); sim (3,000 queries incl.
  India-segment kinds: festival/wedding/regional/appliance/kitchen/stratum/
  hinglish2/spec/gift_rel/health/winter/featurephone/travel/engagement/
  ethnic_shoes/tiffin/ayurveda, Qwen guide): guided null 0.0%, 100%
  resolved, 98.6% by turn 2, 0 errors
  (eval/results/sim_summary.json); 44-query canary suite
  (eval/canaries.py) all green. Reviewer pass: docs/evidence/reviewer_pass.md
  - search v6 fixes (on top of v5, all canary-verified): audience words
    men/women/ladies stop-words (gender now travels via recipient logic);
    "bag" context logic (mod vs product); feature-phone brand synonyms
    (Nokia/itel/Karbonn; flat base 2.0 when no class word so "under 15k
    phone" returns smartphones, not feature phones); adult-recipient vs
    kids-title penalty (-1.5); male/female recipient gender penalties
    (-1.0); sasta/saste stop-words; wheels/casters accessory hints;
    browse-mode gift preference (raw "gift" word prefers gift-tagged items)
  - v5 fixes remain: budget
    numbers no longer leak into product tokens ("under 3000" no longer
    matches Voltage Stabilizer 3000 VA); spec units normalised even when a
    budget word is present ("7kg washing machine under 30k" -> LG 7 kg);
    "baby" is a product token (only "baby shower" is the occasion -
    "baby bottle" returns baby bottles); "1 lakh" budget bug fixed (was Rs 1);
    first-word brand bonus (genuine brand+model listings rank above
    keyword-stuffed ones); car/auto context penalty; modifier-title bonus
    ("office chair"); budget-only queries ("under 500") get browse mode

## Point 3a - Production UI revamp: DONE (this session)
- Full design system (app/app/globals.css): sticky topbar, hero, question
  cards, filter bar, product cards, onboarding card, analytics panels,
  footer - consumer e-commerce look, no college-project tells
- Guided question renders as a compact card ON TOP of results (rescue) or
  as "Optional refinement" (turn-1 success) - results always visible below
- Search-trail breadcrumb (query -> answered options)
- Mid-search refinement filter bar: sort (relevance/price/rating), price
  band, 4-star+, brand multi-select, category single-select, clear-all -
  every apply emits filter_applied {n_before, n_after}
- Results layout: "Recommended for you" top-3 strip (persona-aware
  recommendScore: price fit vs spend style, brand affinity, quality, trust)
  -> 2-3 category shelves -> More products grid (up to 48 results,
  /api/search limit param)
- Onboarding v2 persona (3 questions, no "average price" ask): user type /
  spend style (default cap 2k/5k/8k/none + bias + brand affinity) /
  shopping context; back-compat cohort keys kept
- Rescue loop continues in the UI: a failed chip answer triggers the next
  eligible question (up to 3 follow-ups / 4 turns per journey, the study's
  turn budget) - "2-turn resolution" (78.7%) is a measured property, not a
  hard cap; the guide only stops at the product or when no question type
  remains
- UI resolution + null metrics now use the study's exact definition
  (≥2 intent-matched results = resolved; <2 = a "null"), so the live
  dashboard's failed-search rate is directly comparable to the study's
  8.0% (a search returning many loosely-related items but nothing
  on-intent counts as a null). Fixed a double-count where a 0-result
  search incremented the null counter from both search_results and
  zero_result.
- Analytics: 5th subtab "Validation & Study" reads the eval artifacts live
  (/api/analytics/evidence: study, LLM stability, 3k sim, relevance audit,
  canary count, catalogue profile, live-vs-study table, artifact paths);
  PM metrics added to Overview (journeys, avg journey time, AOV,
  cart→checkout %, guide rescue/refine + answer rate + avg answer time,
  sessions, live activity per minute); cart-rate column on top queries;
  avg-time column on cohorts
- Analytics button moved top-right (green live pill next to the cart)
- Tags are backend-only: no tag badges anywhere in the shopper UI
  (search API still carries tags for harness/PM tooling)
- Analytics dashboard: filter-usage table, shopper-profile (onboarding)
  breakdowns, recommendation-click stat, catalogue panel rebuilt around
  MEDIAN (p25-p75-p90; mean shown second with skew note), brands table
  (top-15 with median price), category detail table with medians
- Category display labels (Fashion / Home & Kitchen / Electronics / Beauty)
  are presentation-only; raw categories stay backend-only
- UI tour (scripts/ui_tour.js) re-run: 12 screenshots in
  docs/evidence/screenshots/

## Point 3 - MVP prototype: DONE (deployable on the 2nd Vercel account)
- Next.js 15 app: plain-language search over 36,045 SKUs; guided follow-up
  (Qwen by default when a key is present; deterministic fallback otherwise)
- n=150 study (deterministic guide, reproducible):
  null 27.3% -> 8.0% | 78.7% resolved within 2 turns (t1=79, t2=39, t3=20,
  unres=12) - matches the claimed 27/8, exceeds the claimed 66
- Deploy on the second account (Bits email - the only missing credential):
  `cd app && vercel`, set LLM_API_KEY + LLM_BASE_URL env vars

## Pending / user-side
- [ ] Vercel extractor function deploy (secondary) - watcher auto-runs after
      the 24h free-plan limit resets (logs/vercel_watch.log); v3 staged. Once
      it's up, set space_askcart/data.json -> vercel_probe_url and re-push the
      space so the live-probe tab also covers play/reddit.
- [ ] MVP deploy on the Bits account (needs your login - the only missing
      credential): cd app && vercel, set LLM_API_KEY + LLM_BASE_URL
- [x] LLM labels: 238 Qwen-verified overrides merged (600 stratified sample,
      3 parallel shards)
- [x] Qwen-mode stability study: null 27.3% -> 8.0%, 78.7% by turn 2
      (identical turn distribution to deterministic - policy decides,
      Qwen phrases; 53 llm / 12 policy / 6 fallback)
- [x] final figures, review_quotes.csv, deploy re-stage

## Reproduce everything
zsh scripts/run_all.sh

---

# v7 improvement brief — work log (started 2026-11-04)

Rules per brief §0: one item at a time, canaries after each change, no
claim inflation, acceptance tests per item, commits `T3:`-style per item.

## P0 (truth fixes)
- **T1 DONE** — PROJECT.md §5.5 now has raw-vs-clean by-source tables
  (raw: Play 33,172 / AppStore 3,450 / Reddit 3,021 / Amazon 40,000 /
  Trustpilot 15,000; clean: 26,663 / 2,937 / 3,003 / 40,000 / 15,000).
  `docs/evidence/source_notes.md` got the per-source provenance table.
  HF Space copy: data.json is regenerated by scripts/build_hf_space.py —
  PENDING rebuild+redeploy after the v7 re-label lands (its study block
  was stale: 66% 2-turn, 25k SKUs — pre-v6 numbers; build script being
  updated to read current artifacts).
- **T2 DONE** — `pipeline/02_clean.sql` now exports per-source per-gate
  drop counts (`data/out/gates_by_source.json`, in
  pipeline_counts.json). Honest read: Amazon/Trustpilot are curated HF
  corpora (pre-cleaned at source) so zero drops is expected; Play loses
  6,509 (length gate) +172 (latin gate); AppStore 513+18; Reddit 18
  ([deleted]). Documented in source_notes.md.
- **T3 DONE** — `scripts/sync_doc_numbers.py` generates PROJECT.md §5.6
  from app/public/catalog.json (same math as /api/analytics/catalog),
  stamps the header date from artifact mtimes, `--check` mode fails the
  build on drift; wired into scripts/run_all.sh step 7.
- **T4 DONE** — header date now artifact-derived (was a stale 2026-11-15).
- **T5** — footnoted in docs for now; real fix is C2 (brand extraction
  + retailer list), scheduled P2. Apple/Samsung median prices are
  accessories-driven; Myntra is a retailer. Recruiter-facing stats
  exclude brand medians until C2 lands.
- **T6 DONE** — persistent footer demo-data disclosure (ratings/prices
  indicative, not live marketplace data); study stats moved out of the
  footer into Behind the scenes. PDP carries the same disclosure.
- **T7 IN PROGRESS** — `origin` field (C1: us_converted | india_layer)
  lands with the P2 catalogue pass; docs rewording to "India-oriented
  demo catalogue (36k SKUs: 25k US-sourced converted + 11k India layer)"
  applies then.
- **T8 IN FLIGHT** — scorer-vs-LLM agreement: the 600-sample LLM labels
  were dropping LLM "OTHER" answers silently (rc_map bug — fixed).
  Full-corpus 6,041-review Qwen re-label with 6-class taxonomy running
  (4 shards, logs/llm_full_0..3.log). First run failed 100% of batches:
  qwen38-27b is a thinking model that spent the whole token budget on
  reasoning (25k thinking tokens, zero content). Fix: send
  `extra_body: {chat_template_kwargs: {enable_thinking: false}}` (new
  `thinking=False` option in llm_client) — batch calls now ~5 s. A small
  share of batches (~10%) still exhausts tokens and is skipped; a
  targeted retry pass over the missing doc_ids runs after the merge.
  Agreement stats (accuracy, macro-F1, confusion matrix) + LLM-only
  shares + India-only cut (Play IN + Reddit IN) will be written to
  data/out/root_causes.json once the merge lands.
- **T9 IN FLIGHT** — `pipeline/05_root_causes.sql`: no-hit complaints now
  score `other` (not forced trust_gap); LLM `OTHER`/`NOT_SEARCH_RELATED`
  labels now kept. Root-cause shares will change; docs update on merge.

## P1 (onboarding + guide + shopper screens) — DONE
- **O1 DONE** — hero-first search; onboarding no longer blocks the hero.
- **O2 DONE** — one-line dismissible strip (pincode + language,
  localStorage, never re-shown after dismiss); pincode → coarse
  `region` only (raw pincode never sent to analytics); language
  switches question text/option labels/hero copy via static
  `app/app/lib/i18n.js` tables (no LLM); festival calendar
  `app/lib/festivals_2026_27.json` (Diwali 2026-11-08 leads).
- **O4 DONE** — "Not sure / flexible" now applies the persona default
  cap as a *visible, removable* trail chip (`Budget ≤ ₹X (your default)`)
  and the echo line names it. Silent caps banned.
- **O5 DONE** — 3-question onboarding behind `/?onboard=1`;
  double-barrelled options fixed; answers wired to real behaviour
  (Student → budget step-down, Gifting → occasion-first, Senior →
  large-text mode); post-answer toast states what changed.
- **B2 DONE** — `/api/events` hardened: event allowlist (incl. all
  `chat_*` names for the upcoming assistant), 4 KB body cap, 120 req/min
  per IP, session-id format check, HTML strip.
- **G1/G4/G5/G6/G10/G11 DONE** — facet counts on every option (zero-count
  chips disabled), typed answers, Skip exit, why-we-ask micro-disclosure,
  answer echo, compact one-row refinement strip (results never pushed
  down).
- **7.3 DONE** — single ranked grid when top category ≥ 60% (shelves only
  for ambiguous/rescue), "Recommended for you" → "Best matches", result
  summary line with removable trail chips + `constraint_removed`, 8
  skeleton cards, Show-more pagination.
- **7.1/7.2 DONE** — PDP side drawer (`app/app/ui/pdp.jsx`, linkable
  `?sku=` via `/api/catalog-preview`): why-this-matched chips, Bayesian
  adjusted rating with "adjusted for number of ratings" note, variant
  selector from family, demo-labelled delivery, similar items,
  Add/Buy. Placeholder `Tile` components (category tint + glyph + brand
  monogram, "illustrative" label) — no generic grey boxes.
- **9.7 DONE** — card v2: whole card → PDP, single Add button, Best
  match badge, over-budget label, tabular prices.
- **§8 tokens DONE** — v7 token set in globals.css (`:root`), marigold
  reserved for the guide, Analytics nav → "Behind the scenes" ghost with
  `--live` dot.
- **Contrast gate DONE** — `scripts/contrast_check.js` now reads the real
  `:root` tokens (no hand-typed hex); one FAIL found and fixed:
  `--success` darkened `#15803D` → `#137333` (4.47 → 5.30:1 on
  `--success-bg`). 16/16 pairs pass.

## P2 (search engine + catalogue) — queue
S1 DONE (see below) → S2 hinglish lexicon → S3 relation words → S4 spec
slots →
S7 family_id grouping → C2 brand extraction → C3 is_accessory →
C1 origin field → G3 for-whom/size + capacity → G8 seasonal rails →
G12 outcome micro-survey.

- **S1 DONE** — typo tolerance in the guided scorer: Damerau (OSA)
  distance over a catalogue vocabulary built from titles+brands
  (36,190 unique words); tokens 5-7 chars → distance 1, 8+ → distance 2;
  glued alphanumerics split ("iphone15" → iphone+15, "128gb" → 128+gb);
  typo candidates score 1.4 (x0.7 of the exact base 2.0), at most 3 typo
  tokens per query; in-vocabulary tokens are never typo-rewritten (exact
  semantics preserved). 20 typo canaries added → 64/64 green. One-time
  index build includes the vocab; warm typo searches 130-245 ms.

## P3/P4 blocked items (need real humans / external accounts)
- E2 real think-aloud interviews — need real people; prep script written
  when the eval harness is ready.
- B1 managed analytics store — needs an Upstash/Neon account + keys;
  adapter interface will be built, local store stays canonical until keys
  are provided.
