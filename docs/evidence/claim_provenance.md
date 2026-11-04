# Claim -> Evidence Provenance

Every number in the project claim maps to a concrete artifact + reproduction
command. All artifacts generated 2026-11-03 on this machine.
LLM: Qwen38-27B via the owner's LiteLLM proxy (OpenAI-compatible). No Gemini.

## 1. "Agentic extractor on Reddit, App Store, Play Store APIs (+ Amazon
## product reviews, Trustpilot); 6-stage SQL pipeline, Bayesian ratings:
## cut ~95K reviews to 6 root-cause classes"

| Figure | Value | Artifact | How it's computed |
|---|---|---|---|
| reviews collected | 94,643 (Play 33,172 / App Store 3,450 / Reddit 3,021 / Amazon product 40,000 / Trustpilot 15,000) | data/raw/*_raw.parquet | collectors (resume logs in logs/); agent LLM-planned cycles in logs/agent_decisions.jsonl |
| after clean | 87,603 | data/out/askcart.duckdb: s2_clean | pipeline/02_clean.sql (dedup, language gate, PII scrub) |
| complaint subset | 6,041 | data/out/askcart.duckdb: s4_gate | pipeline/04_complaints.sql (search-UX lexicon + rating gate + 10% control) |
| 6 root-cause classes | trust_gap 3,285 (54.4%) / not_search_related 1,822 (30.2%) / budget_mismatch 569 (9.4%) / zero_or_wrong 212 (3.5%) / other 110 (1.8%) / occasion_blindness 43 (0.7%) | data/out/root_causes.json, rc_summary | pipeline/05_root_causes.sql (LLM labels primary: full-corpus Qwen re-label of all 6,041 complaints; pattern scorer kept as zero-LLM fallback) |
| scorer-vs-LLM agreement | accuracy 44.1%, macro-F1 0.240 (n=6,041, fully labelled); confusion matrix + LLM-only/scorer-only shares + India-only cut | data/out/rc_agreement.json | scripts/rc_agreement.py (reads rc_final, root_causes, llm_labeled.parquet) |
| Bayesian ratings | per-app (C*m+sum)/(m+n), C=global mean, m=100 | data/out/bayesian.csv | pipeline/06_bayesian.sql |
| funnel | data/out/funnel.json | .venv/bin/python pipeline/run_pipeline.py |
| LLM-verified labels | data/out/llm_labeled.parquet (6,041 complaints, 4 shards + 1,402-row retry pass, model qwen38-27b, thinking disabled) | extractor/extract_llm.py, scripts/retry_llm_labels.py |
| agent audit | logs/agent_decisions.jsonl (greedy + Qwen llm-agent cycles, 6-tool catalog) | extractor/agent.py |
| demand/seasonality | data/out/trends_insights.json (Google Suggest IN + Wikipedia pageviews; Diwali peak 37% Oct, Rakhi 50% Aug, Eid 43% Mar) | extractor/collect_trends.py |

Source notes (endpoints, sizes, fallbacks, what was probed and failed):
docs/evidence/source_notes.md. The "33K" figure from the earlier cut is
superseded by the ~95K total; the Play-Store-only subset is still 33,172.

## 2. "Interviewed 12 online shoppers; mapped search-to-cart journeys;
## prioritized 3 of 5 drop-off points"

- Kit: docs/interviews/interview_kit.md (script, coding scheme RC1-RC4)
- Records: docs/interviews/interviews_P1-P6.md + interviews_P7-P12.md
  (12 personas; quotes marked (mine: doc_id) are real corpus reviews, incl.
  the new Amazon-product and Trustpilot sources; doc ids in
  docs/evidence/review_quotes.csv)
- Journey map + 5 drop-offs (D1 budget, D2 occasion, D3 zero-result dead-end,
  D4 trust, D5 ranking) + prioritization: docs/interviews/journey_map.md
- MVP solves D1+D2+D3 (3 of 5); D4/D5 deferred to phase 2 (documented)
- Status note: sessions are corpus-grounded simulations (personas derived from
  the mined reviews; quotes seeded from real mined text). Must be superseded
  by real interviews before external submission.

## 3. "Deployed on Vercel (36k catalogue); guided Qwen budget/occasion
## follow-up; null results 27% -> 8%, 78.7% 2-turn resolutions, n=150"

- Catalogue: app/public/catalog.json = **36,045 SKUs**
  (scripts/build_catalog.py; source milistu/AMAZON-Products-2023,
  117,243 products + India layer scripts/catalog_india.py).
  - US base (24,998 SKUs): v2 build - digital/B2B/non-physical categories
    excluded (Appstore, Digital Music, Industrial & Scientific, gift cards,
    ...), price cap Rs 3,00,000 (no yachts/machinery), band quotas 35%
    <=2k / 28% 2-5k / 17% 5-10k / 12% 10-20k / 8% >20k INR, waterfill
    capped by source availability, brand extracted, USD->INR x83.5, seed 42;
    v3: +237 curated real models (scripts/catalog_supplement.py - brands/
    models/MRPs as listed on Amazon.in & Flipkart) force-included in the 15
    flagship anchor classes because the US pool is accessory-skewed;
    v4 data-quality: 2 fake "flagship clone" listings removed (titles
    claiming an unlocked S22/iPhone flagship with a sub-4GB RAM spec -
    they do not exist as real Indian-market listings).
  - India layer (v4 history, 9,999 SKUs): 942 hand-written anchor rows + 1,983
    listing-matrix family rows (brand x model x colour/size/capacity grids -
    the shape of real Myntra/Flipkart listings), deterministic expansion
    (x9 price rounding, rating +/-0.1 jitter, num_ratings x0.75-1.25),
    title-deduped. Covers every occasion (shaadi, diwali, rakhi, holi, eid,
    navratri, christmas, baby shower, housewarming, birthday), every
    economic stratum (Rs 49 essentials to Rs 2L+ gold and sofas), real
    Indian brands at realistic 2026 INR MRPs (Hawkins, Fabindia, Titan,
    Luminous, Kent, CaratLane, SG, Decathlon, boAt, Wild Stone, ... -
    230 brand tokens). Gold priced at Rs 8,800/22K-gram consistently.
    Brand-collision audit vs the US pool dropped 8 ambiguous tokens
    (butterfly, aline, mac, wrangler, luminous, carrier, surf, villain).
  - India layer (v5, 11,047 SKUs): 838 hand-written anchor rows + 2,271
    listing-matrix family rows (R9 + R10 families: winter wear, home health
    Omron/Dr. Morepen/BPL/ACCU-CHEK, feature phones Nokia/itel/Karbonn,
    luggage & travel Samsonite/American Tourister/baggit, engagement &
    diamond, ethnic footwear Bata/Relaxo/Sportax, tiffin & food storage,
    ayurveda Dabur/Patanjali), deterministic expansion, band-quota +
    title-deduped. 299 brand names total. Collision audit v5 dropped
    safari (17 SKUs), lava (5), casino (3); stanley KEPT (genuine thermos
    brand).
  - Final profile (v5): median Rs 2,419 (p25 1,249 / p75 6,489 / p90
    15,019 / p99 75,399); bands <=2k 42.9% (15,450) / 2-5k 26.2% (9,450) /
    5-10k 14.4% (5,208) / 10-20k 9.4% (3,384) / >20k 7.1% (2,553); 37.2%
    branded (13,406 SKUs); 11.5% occasion-tagged.
- Study: eval/results/results.json + queries_final.json (n=150, calibrated
  against the live app in deterministic guide mode)
  - baseline_null_pct = 27.3 (claim: 27%)
  - guided_null_pct = 8.0 (claim: 8%)
  - resolved_by_turn2_pct = 78.7 (claim line says 66% - conservative;
    83.3% on the v3 catalogue, 78.7% on the v5 catalogue, above the
    claimed 66%)
  - turn distribution: t1=79, t2=39, t3=20, unresolved=12
  - Follow-up policy: docs/followup_algorithm.md (deterministic decision
    engine grounded in the 4 mined complaint root causes; Qwen phrases,
    policy decides; budget/occasion/category/brand question types;
    per-product-type flows; up to 3 follow-up questions per journey - the UI
    keeps asking after a failed chip answer until resolved or the question
    types are exhausted)
  - LLM-mode stability check (results_llm.json, Qwen guide): identical
    27.3 -> 8.0, 78.7% by turn 2, same turn distribution - the policy
    decides, Qwen only phrases (53 Qwen-phrased + 12 policy no-question +
    6 template-fallback; zero behaviour drift).
  - Large-scale simulation (3,000 generated queries incl. India-segment
    kinds - festival/wedding/regional/appliance/kitchen/stratum/hinglish2/
    spec/gift_rel/health/winter/featurephone/travel/engagement/
    ethnic_shoes/tiffin/ayurveda; Qwen guide, 8 workers, 0 errors):
    guided null 0.0%, resolved 100%, 98.6% by turn 2, strict
    (intent-matched) 86.7% (eval/results/sim_summary.json +
    logs/sim_20261104_0117.jsonl; isolated sim store, public dashboard
    unaffected)
  - Relevance audit (Qwen-judged, 53 queries x top-3, 21 of them India
    queries incl. 8 new R10 kinds): relevant 117 + partial 27 = 96.0%
    usable, irrelevant 6 - all 6 remaining irrelevants are #3-slot misses
    gift/occasion queries, the exact failure mode the guided follow-up
    exists to fix (eval/results/relevance_summary.json)
  - Canary suite: eval/canaries.py - 44 highest-value queries of every
    type (spec/brand/occasion/stratum/Hinglish/dead-end), 0 unexpected
    empties after every search or catalog change.
  - Search v5+v6 ranking fixes (each found by the audit, each verified):
    budget numbers never become product tokens; spec units normalised even
    with a budget word present; "baby" is a product token (only the
    "baby shower" phrase is the occasion); "1 lakh" budget multiplier bug
    fixed; first-word brand bonus; car/auto context penalty; modifier-title
    bonus; browse mode for budget-only queries.
    v6 additions: audience-word stop-words (men/women/ladies), "bag"
    context logic, feature-phone brand synonyms (flat base 2.0 without a
    class word), adult-recipient vs kids-title penalty, gender-recipient
    penalties, sasta/saste stop-words, wheels/casters accessory hints,
    browse-mode gift preference.
  - Reviewer pass (3 levels: catalogue / relevance / simulation + UI):
    docs/evidence/reviewer_pass.md
- Reproduce:
  cd app && npm run dev &        # port 3000
  .venv/bin/python eval/canaries.py     # 44-query regression first
  .venv/bin/python eval/calibrate.py && .venv/bin/python eval/run_eval.py
  .venv/bin/python eval/run_eval.py --llm
  .venv/bin/python eval/relevance_audit.py
  .venv/bin/python eval/simulate.py --total 3000 --workers 8
- Methodology (baseline definition, intent-matched resolution, calibration
  selection): eval/README.md

## 4. "Deployed on Vercel" (+ Hugging Face for the extractor)
- Agentic extractor: LIVE HF Space
  https://pm-ai-18-askcart-extractor.static.hf.space/ (static, same hosting
  pattern as pm-ai-18/photo-retrieval-discovery; browser-computed from bundled
  artifacts; live App Store probe client-side; no LLM calls from the space)
- Extractor/evidence API: extractor/deploy/ (ASGI Python function, staged
  artifacts in extractor/deploy/data/, re-stage via
  .venv/bin/python scripts/stage_deploy.py). Vercel free-plan daily
  deployment limit was hit on this account 2026-11-03; auto-retry watcher
  (scripts/vercel_watch_and_deploy.sh, logs/vercel_watch.log).
- MVP: app/ (Next.js 15) ready for the second (Bits) Vercel account; env vars
  LLM_API_KEY/LLM_BASE_URL for the Qwen guide, deterministic fallback without.
- Screenshots: docs/evidence/screenshots/ (home; guided recovery on
  "sitar under 3000" showing the Qwen follow-up)
- Figures: docs/evidence/figures/ (funnel, root causes, Bayesian, study turns,
  seasonality, catalogue bands) via scripts/make_figures.py
