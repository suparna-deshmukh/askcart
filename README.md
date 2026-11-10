# AskCart - Guided E-Commerce Search MVP

Prototype MVP (Next.js 15, Vercel-ready, **Gemini**,
DuckDB SQL pipeline) that guides shoppers out of empty search results with ONE
short follow-up question (budget / occasion / category) and re-searches with the
captured intent.

Claimed study results (achieved, reproducible - see `docs/evidence/claim_provenance.md`):
- Agentic extractor over **6 sources** (Play Store, App Store, Reddit, Amazon
  product reviews, Trustpilot, + Google Suggest / Wikipedia pageviews demand
  signals); 6-stage SQL pipeline + Bayesian ratings: **~95K reviews cut to 4
  root causes** (corpus totals in `data/pipeline_counts.json`)
- **12 online-shopper interviews** ("shaadi gift under 2k" cohort);
  search-to-cart journey map; **3 of 5 drop-off points** prioritized and solved
- Deployable on Vercel, **54,304-SKU catalogue** (24,998 real Amazon products
  converted to INR + 11,047 India listing-matrix SKUs - real brands, real
  2026 INR MRPs, every occasion and economic stratum); guided budget/occasion
  follow-up: **null results 27.3% -> 8.0%, 78.7% of journeys resolved
  within 2 turns (n=150)**; 3,000-query simulation: 100% resolved, 0.0%
  null, 98.6% by turn 2, 0 errors

## System design

```
                 ┌─────────────────────────── browser (client-only libs) ───────────────────────────┐
                 │  page.jsx (single-page app) · i18n 3-lang (437 keys) · track.js (events)        │
                 │  question card (live-count chips, client recount) · chat panel · checkout       │
                 └───────┬──────────────────────────────────────────────────────────────────────────┘
                         │ fetch (JSON)
                 ┌───────▼─────────────────────────── Next.js 15 API routes ────────────────────────┐
 /api/search ───►│ rule-based scorer (search.js) + gated ONNX semantic fallback (semantic.js,      │
                 │   multilingual-e5-small int8, 54K-vector index) - only for dead-end queries     │
 /api/guide ────►│ decideGuide (guide.js): intent-scoped option view, tiered question ladder,      │
                 │   exit guard (guard.js: every option re-counted vs the visible set)             │
 /api/ai-refine ►│ Gemini phrasing of the policy question (guide_ai.js) - 24h plan/refine caches   │
 /api/chat ─────►│ grounded chat: every product claim validated against the live catalogue         │
 /api/analytics ►│ event ingest + KPI rollups (analyticsStore.js: JSONL event ledger +          │
                 │   aggregated KPI state, retention-safe, no PII)                               │
 /api/ai-status ►│ Gemini key-pool status + guard counters (masked keys only)                     │
                 └───────┬──────────────────────────────────────────────────────────────────────────┘
                         │
                 gemini_keys.js: 4-key pool · 20 RPD/key · Pacific-day rollover · model chain
                 (zero LLM calls on the rule-based path - Gemini only phrases / validates)
```

- **Split**: `app/lib/` = server + shared logic (search, semantic, guide, guard, persona,
  gemini routing, analytics store); `app/app/lib/` = client-only (i18n, tracking).
- **Catalogue**: 54,304-SKU `public/catalog.json` served as a static file; search runs
  server-side, the client only ever receives result pages (≤48 items).
- **AI**: Gemini only. Deterministic policy decides the question; Gemini phrases it
  (never the options) and its output re-validates against the visible candidate set.
- **AI-refine set summary** is built from the intent-scoped view of the visible results,
  so the model only sees the world the shopper sees.
- **Events**: 89-event allowlist (`event_registry.js` + `docs/event_schema.md`), no PII;
  CI coverage check fails on any unregistered event.
- **Persistence**: local JSONL/state files on disk; Vercel needs the KV adapter
  (checklist in `docs/ui-revamp/NOTES.md`).
- **Offline pipeline** (`extractor/`): 6-source agentic collector → DuckDB 6-stage SQL
  pipeline → Bayesian ratings → LLM root-cause labelling (Gemini; zero-LLM greedy
  fallback) → the 24,998-product Amazon layer of the catalogue.
- **CI gates**: `eval/canaries.py` (111+6 core + guided-grounding section),
  `scripts/guide_audit.mjs` (200 deterministic journeys), contrast, i18n parity,
  semantic test, UI tour, chat eval (grounding 0, GATES PASS), analytics coverage.
## Layout
```
extractor/           agentic extractor (agent loop + 6 source collectors + LLM labeling)
  sources.py         locked source table (apps, categories, queries, targets)
  agent.py           LLM-planned fetch loop (Gemini; greedy zero-LLM fallback), audit log
  collect_play.py    Google Play reviews (google-play-scraper, multi-app, resume)
  collect_appstore.py  App Store (iTunes RSS live path)
  collect_appstore_dataset.py  App Store review datasets (fallback)
  collect_reddit.py  Reddit RSS search collector (backoff + resume)
  collect_amazon_reviews.py  Amazon product reviews (McAuley 2023, HF, range-sampled)
  collect_trustpilot.py  Trustpilot brand reviews (HF mirror of trustpilot.com)
  collect_trends.py  Google Suggest + Wikipedia pageviews demand/seasonality
  llm_client.py      Gemini client (retries; daily cap)
  extract_llm.py     LLM-verified root-cause labels on a stratified complaint sample
  deploy/            Vercel deployment package (evidence API + probe)
pipeline/            6-stage DuckDB pipeline (01 ingest -> 06 bayesian) + runner
eval/                n=150 study: candidate calibration + final eval harness
app/                 Next.js 15 MVP (catalogue, search, guided follow-up,
                     filters, recommender, live product-analytics dashboard,
                     AI assistant - app/lib/chat + app/app/ui/chat)
eval/chat/           assistant eval: 60 golden + 30 red-team conversations,
                     in-process harness against the real route handler
scripts/             build_catalog (36k), make_figures, run_all, deploy staging
docs/interviews/     interview kit, P1-P12 records, journey map + drop-off matrix
docs/evidence/       claim -> artifact provenance, source notes, figures
data/                raw / out artefacts (git-ignored)
logs/                collector + agent audit logs
```

## Run it
```bash
# one-shot reproduction (data -> pipeline -> labels -> catalog -> study -> figures)
zsh scripts/run_all.sh          # needs app dev server on :3000 (step 6)

# or step by step:
.venv/bin/python extractor/agent.py         # agentic loop (LLM-planned; --auto = greedy)
.venv/bin/python pipeline/run_pipeline.py   # 6-stage pipeline
.venv/bin/python extractor/extract_llm.py   # Gemini-verified labels (empty if no key)
.venv/bin/python pipeline/run_pipeline.py   # merge labels
.venv/bin/python scripts/build_catalog.py   # 54,304 SKUs (US base + India layer + expansion matrix)
cd app && npm run dev                      # http://localhost:3000
.venv/bin/python eval/run_eval.py              # deterministic guide (reproducible study)
.venv/bin/python eval/run_eval.py --llm        # LLM guide (stability check)
.venv/bin/python eval/relevance_audit.py       # LLM-judged relevance audit (top-3)
.venv/bin/python eval/simulate.py --total 3000 # large-scale query simulation
.venv/bin/python eval/canaries.py              # 44 eyeball canaries (post-change regression)
cd app && node --import ../eval/chat/register-shim.mjs \
  ../eval/chat/run_chat_eval.js                 # assistant gates (golden + red-team)
.venv/bin/python scripts/make_figures.py        # docs/evidence/figures/*.png
```

## Key design decisions
- **Baseline vs guided**: the baseline is a legacy keyword search (word-level
  prefix match on product tokens only; ignores budget language and occasion
  words) - the failure mode we study. The guided re-search applies the budget
  cap, occasion tags and category narrowing from the follow-up answers.
- **LLM**: Gemini (OpenAI-compatible endpoint).
  It (a) plans the extractor's fetch batches (audit-logged), (b) verifies
  root-cause labels, and (c) generates the guided follow-up in the app.
  Every stage has a deterministic zero-LLM path, so the whole project runs
  with no model access at all.
- **Catalogue**: 54,304 SKUs = 24,998 real Amazon products
  (milistu/AMAZON-Products-2023, Hugging Face) - band-aware stratified sample
  (depth in the <=2k/2-5k/5-10k gift-budget bands), USD->INR at 83.5
  (documented), real ratings, 2 fake "flagship clone" listings removed
  (data-quality) - plus an India layer (scripts/catalog_india.py):
  838 hand-written anchor rows + 2,271 listing-matrix family rows (R9/R10:
  brand x model x colour/size/capacity grids - the shape of real
  Myntra/Flipkart listings) expanding to ~11.1k variants, band-quota +
  deduped to 11,047 SKUs covering
  every occasion
  (shaadi/diwali/rakhi/holi/eid/navratri/christmas/baby-shower/housewarming),
  every stratum (Rs 49 essentials to Rs 2L+ gold & sofas), and real Indian
  brands (Hawkins, Fabindia, Titan, Luminous, Kent, CaratLane, SG, Decathlon,
  boAt, Wild Stone, Omron, Dr. Morepen, Samsonite, Bata, Dabur, Patanjali -
  299 brand names total). v3 supplement: 237 curated real
  models (brands/models/INR MRPs as listed on Amazon.in & Flipkart)
  force-included in the 15 flagship classes because the US pool is
  accessory-skewed (scripts/catalog_supplement.py).
- **Search (v6)**: word-level prefix matching over a cached word index;
  budget/occasion/category/brand parsing from natural language incl. Hinglish
  and INR spec units (7kg, 1.5 ton, 1100va, 23l); spec numbers are never
  confused with budgets; brand-leading titles and confirmed-intent modifiers
  rank higher; budget-only queries ("under 500") get a browse mode instead of
  a null page. v6 also: audience words (men/women/ladies) stop-words,
  feature-phone brand synonyms (Nokia/itel/Karbonn beat smartphones for
  "under 15k phone"), adult-recipient vs kids-title penalties, gender
  recipient penalties, sasta/saste stop-words, browse-mode gift preference.
  Full algorithm: docs/followup_algorithm.md; regression canaries:
  eval/canaries.py (44 queries).
- **Corpus sources**: app reviews (Play/App Store/Reddit) answer "how do the
  shopping apps fail at search?"; product reviews (Amazon) and platform
  reviews (Trustpilot) answer "what do buyers complain about after purchase?";
  Google Suggest + Wikipedia pageviews answer "what do people actually type,
  and when do they want to buy?". See docs/evidence/source_notes.md.

- **Assistant (J10)**: deterministic dialog manager + templates-first
  chat (8 intents: search/refine/gift help/product Q&A/compare/explain/
  FAQ/cart). The LLM is off by default (`CHAT_LLM=0`); when on it only
  phrases or labels low-confidence NLU. Signed conversation state
  (HMAC, tamper -> 400), grounding guard (0 ungrounded SKU/price/brand),
  rate limit, 30-turn cap. Q&A answers only from catalogue fields -
  honest "I don't have that detail" otherwise. Spec + gates:
  `docs/chat_spec.md`.

## Live links
- Agentic extractor (HF Space, static, browser-computed):
  https://pm-ai-18-askcart-extractor.static.hf.space/
- MVP (production, suparna2 Vercel account): https://askcart-nine.vercel.app

## Deploy
- Agentic extractor: **deployed on Hugging Face** -
  https://pm-ai-18-askcart-extractor.static.hf.space/ (space_askcart/).
- Extractor/evidence API (Vercel, secondary): `extractor/deploy/` ->
  `vercel --prod` (staged artifacts in `extractor/deploy/data/`; re-stage with
  `.venv/bin/python scripts/stage_deploy.py` after the final pipeline).
- MVP: `app/` is Vercel-ready (Next 15) and deployed on the `suparna2`
  Vercel account (project `askcart`, root directory `app`; git push to `main`
  auto-deploys to https://askcart-nine.vercel.app; project protection
  mirrors insightextractor: all_except_custom_domains). Env vars set on the
  project: `GEMINI_API_KEYS` pool (+ legacy `GEMINI_API_KEY`), `GEMINI_MODEL`,
  `GEMINI_RPD`, `AI_MAX_PER_SESSION`; without keys the guide falls back to the
  deterministic rule-based follow-ups.
