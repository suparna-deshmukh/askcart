# AskCart - Guided E-Commerce Search MVP

Prototype MVP (Next.js 15, Vercel-ready, **Qwen38-27B** via a LiteLLM proxy,
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
- Deployable on Vercel, **36,045-SKU catalogue** (24,998 real Amazon products
  converted to INR + 11,047 India listing-matrix SKUs - real brands, real
  2026 INR MRPs, every occasion and economic stratum); guided budget/occasion
  follow-up: **null results 27.3% -> 8.0%, 78.7% of journeys resolved
  within 2 turns (n=150)**; 3,000-query simulation: 100% resolved, 0.0%
  null, 98.6% by turn 2, 0 errors

## Layout
```
extractor/           agentic extractor (agent loop + 6 source collectors + LLM labeling)
  sources.py         locked source table (apps, categories, queries, targets)
  agent.py           LLM-planned fetch loop (Qwen; greedy zero-LLM fallback), audit log
  collect_play.py    Google Play reviews (google-play-scraper, multi-app, resume)
  collect_appstore.py  App Store (iTunes RSS live path)
  collect_appstore_dataset.py  App Store review datasets (fallback)
  collect_reddit.py  Reddit RSS search collector (backoff + resume)
  collect_amazon_reviews.py  Amazon product reviews (McAuley 2023, HF, range-sampled)
  collect_trustpilot.py  Trustpilot brand reviews (HF mirror of trustpilot.com)
  collect_trends.py  Google Suggest + Wikipedia pageviews demand/seasonality
  llm_client.py      Qwen client (LiteLLM proxy; retries; daily cap)
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
.venv/bin/python extractor/agent.py         # agentic loop (Qwen-planned; --auto = greedy)
.venv/bin/python pipeline/run_pipeline.py   # 6-stage pipeline
.venv/bin/python extractor/extract_llm.py   # Qwen-verified labels (empty if no LLM)
.venv/bin/python pipeline/run_pipeline.py   # merge labels
.venv/bin/python scripts/build_catalog.py   # 36,045 SKUs (US base + India layer)
cd app && npm run dev                      # http://localhost:3000
.venv/bin/python eval/run_eval.py              # deterministic guide (reproducible study)
.venv/bin/python eval/run_eval.py --llm        # Qwen guide (stability check)
.venv/bin/python eval/relevance_audit.py       # Qwen-judged relevance audit (top-3)
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
- **LLM**: Qwen38-27B through the owner's LiteLLM proxy (OpenAI-compatible).
  It (a) plans the extractor's fetch batches (audit-logged), (b) verifies
  root-cause labels, and (c) generates the guided follow-up in the app.
  Every stage has a deterministic zero-LLM path, so the whole project runs
  with no model access at all.
- **Catalogue**: 36,045 SKUs = 24,998 real Amazon products
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
- MVP: http://localhost:3000 (this machine) -> second (Bits) Vercel account.

## Deploy
- Agentic extractor: **deployed on Hugging Face** -
  https://pm-ai-18-askcart-extractor.static.hf.space/ (space_askcart/).
- Extractor/evidence API (Vercel, secondary): `extractor/deploy/` ->
  `vercel --prod` (staged artifacts in `extractor/deploy/data/`; re-stage with
  `.venv/bin/python scripts/stage_deploy.py` after the final pipeline).
- MVP: `app/` is Vercel-ready (Next 15). Set `LLM_API_KEY` + `LLM_BASE_URL`
  (+ optional `LLM_MODEL`) as env vars on the target Vercel account; without
  them the guide falls back to the deterministic rule-based follow-ups.
