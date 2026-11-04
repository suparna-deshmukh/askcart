# Qwen eval suite — 1,000-case pass-rate report

Generated: 2026-11-04 13:49 UTC by `report.py` (all numbers computed from the verdict artifacts below).

- Judge: `0e850d8e2c236dde` catalogue snapshot, panel sha `e8f01a06d883bf79`, seed 20261104
- Judge model: Qwen (qwen38-27b) via the LiteLLM proxy, temperature 0, thinking off; single LLM judge (no second rater in this suite).
- Pass definitions (frozen with the panel):
  - **search** (400): Qwen R/P/I on the live top-3; PASS = usable@3 (≥1 relevant/partial); STRICT = top-1 relevant.
  - **rag** (300): assistant reply to a product Q&A / FAQ question; PASS = deterministic gate (≤40 words, server grounding guard, no banned phrases) **and** Qwen judges the reply grounded + answering + honest + tone-ok.
  - **ux** (300): a real question moment replayed from the 3,000-journey persona sim; PASS = Qwen verdict A (appropriate at that point; M = marginal, B = bad).

## Search — 400/400 judged
- **PASS (usable@3): 84.8% [ 80.9–87.9 ]** · STRICT (top-1 relevant): 57.2% [ 52.4–62.0 ]
- By kind:

| kind | n | PASS usable@3 |
|---|---|---|
| real_suggest | 80 | 91.2% [ 83.0–95.7 ] |
| suggest_shape | 71 | 87.3% [ 77.6–93.2 ] |
| vague | 36 | 88.9% [ 74.7–95.6 ] |
| typo | 27 | 92.6% [ 76.6–97.9 ] |
| hinglish | 24 | 95.8% [ 79.8–99.3 ] |
| dead_end | 16 | 31.2% [ 14.2–55.6 ] |
| new_hinglish | 16 | 50.0% [ 28.0–72.0 ] |
| new_budget | 14 | 78.6% [ 52.4–92.4 ] |
| new_hi | 14 | 78.6% [ 52.4–92.4 ] |
| new_gift | 12 | 100.0% [ 75.7–100.0 ] |
| new_spec | 12 | 91.7% [ 64.6–98.5 ] |
| new_brand | 10 | 100.0% [ 72.2–100.0 ] |
| new_vague | 9 | 77.8% [ 45.3–93.7 ] |
| category | 8 | 100.0% [ 67.6–100.0 ] |
| new_dead_end | 8 | 12.5% [ 2.2–47.1 ] |
| synonym | 5 | 80.0% [ 37.6–96.4 ] |
| gift | 4 | 75.0% [ 30.1–95.4 ] |
| occasion | 4 | 75.0% [ 30.1–95.4 ] |
| brand | 4 | 100.0% [ 51.0–100.0 ] |
| budget | 3 | 100.0% [ 43.8–100.0 ] |
| india_appliance | 3 | 100.0% [ 43.8–100.0 ] |
| india_regional | 2 | 100.0% [ 34.2–100.0 ] |
| india_kitchen | 2 | 100.0% [ 34.2–100.0 ] |
| india_jewellery | 2 | 100.0% [ 34.2–100.0 ] |
| india_hinglish | 2 | 100.0% [ 34.2–100.0 ] |
| vague_budget | 1 | 100.0% [ 20.7–100.0 ] |
| india_festival | 1 | 100.0% [ 20.7–100.0 ] |
| india_sports | 1 | 100.0% [ 20.7–100.0 ] |
| india_wedding | 1 | 100.0% [ 20.7–100.0 ] |
| india_health | 1 | 100.0% [ 20.7–100.0 ] |
| india_winter | 1 | 100.0% [ 20.7–100.0 ] |
| india_feature_phone | 1 | 100.0% [ 20.7–100.0 ] |
| india_travel | 1 | 100.0% [ 20.7–100.0 ] |
| india_engagement | 1 | 100.0% [ 20.7–100.0 ] |
| india_ethnic_shoes | 1 | 100.0% [ 20.7–100.0 ] |
| india_tiffin | 1 | 100.0% [ 20.7–100.0 ] |
| india_ayurveda | 1 | 100.0% [ 20.7–100.0 ] |

## RAG (chat Q&A + FAQ) — 300/300 judged
- **PASS (deterministic gate AND Qwen): 10.3% [ 7.4–14.3 ]** · deterministic gate alone: 100.0% [ 98.7–100.0 ] · Qwen quality alone: 10.3% [ 7.4–14.3 ]

| kind | n | PASS |
|---|---|---|
| qa_spec_known | 50 | 8.0% [ 3.2–18.8 ] |
| qa_spec_unknown | 50 | 0.0% [ 0.0–7.1 ] |
| qa_suitability | 50 | 38.0% [ 25.9–51.8 ] |
| qa_quality | 50 | 0.0% [ 0.0–7.1 ] |
| qa_price | 50 | 0.0% [ 0.0–7.1 ] |
| faq_known | 25 | 32.0% [ 17.2–51.6 ] |
| faq_ooo | 25 | 0.0% [ 0.0–13.3 ] |

Sample failures (first 8):
- `qs_r_0001` [qa_spec_known] Q='How much storage does it have?' act=answer_product words=5 det=True qwen=FAIL — answered RAM instead of storage
- `qs_r_0002` [qa_spec_known] Q='How many inches is this?' act=answer_product words=14 det=True qwen=FAIL — ignored size question answered rating
- `qs_r_0004` [qa_spec_known] Q='How powerful is this?' act=answer_product words=14 det=True qwen=FAIL — ignored power question, cited ratings
- `qs_r_0005` [qa_spec_known] Q='How powerful is this?' act=answer_product words=14 det=True qwen=FAIL — ignored power question answered ratings
- `qs_r_0007` [qa_spec_known] Q='How many inches is this?' act=answer_product words=14 det=True qwen=FAIL — ignored question, provided irrelevant rating
- `qs_r_0008` [qa_spec_known] Q='How powerful is this?' act=answer_product words=14 det=True qwen=FAIL — ignored question, provided irrelevant rating data
- `qs_r_0009` [qa_spec_known] Q='What is the capacity of this?' act=answer_product words=3 det=True qwen=FAIL — invented capacity not in facts
- `qs_r_0010` [qa_spec_known] Q='How much storage does it have?' act=answer_product words=5 det=True qwen=FAIL — 16GB is RAM not storage

## UX (question policy) — 300/300 judged
- **PASS (appropriate): 2.7% [ 1.4–5.2 ]** · verdict mix: A=8 M=19 B=273 other=0

| lang × question type | n | PASS |
|---|---|---|
| hi / category | 52 | 0.0% [ 0.0–6.9 ] |
| hi / occasion | 51 | 2.0% [ 0.3–10.3 ] |
| hi / size | 47 | 4.3% [ 1.2–14.2 ] |
| hinglish / category | 21 | 0.0% [ 0.0–15.5 ] |
| en / category | 21 | 0.0% [ 0.0–15.5 ] |
| en / occasion | 17 | 0.0% [ 0.0–18.4 ] |
| hinglish / occasion | 16 | 0.0% [ 0.0–19.4 ] |
| en / size | 13 | 7.7% [ 1.4–33.3 ] |
| hinglish / size | 13 | 7.7% [ 1.4–33.3 ] |
| hinglish / budget | 9 | 0.0% [ 0.0–29.9 ] |
| hinglish / brand | 8 | 0.0% [ 0.0–32.4 ] |
| hinglish / for_whom | 7 | 28.6% [ 8.2–64.1 ] |
| en / brand | 6 | 0.0% [ 0.0–39.0 ] |
| hi / brand | 5 | 0.0% [ -0.0–43.4 ] |
| hi / for_whom | 4 | 25.0% [ 4.6–69.9 ] |
| en / budget | 4 | 0.0% [ 0.0–49.0 ] |
| hi / budget | 3 | 0.0% [ 0.0–56.2 ] |
| en / for_whom | 3 | 0.0% [ 0.0–56.2 ] |

## Overall

| Dimension | n judged | PASS | rate |
|---|---|---|---|
| search (usable@3) | 400 | 339 | 84.8% [ 80.9–87.9 ] |
| rag (gate + Qwen) | 300 | 31 | 10.3% [ 7.4–14.3 ] |
| ux (appropriate) | 300 | 8 | 2.7% [ 1.4–5.2 ] |
| **total** | **1000** | **378** | **37.8% [ 34.8–40.8 ]** |

## Qwen usage (this suite)

| dim | calls | est tokens |
|---|---|---|
| search | 44 | ~44,211 |
| rag | 550 | ~185,403 |
| ux | 600 | ~171,579 |

(est tokens = (prompt+response chars)/4, logged per call; the proxy is the same Qwen used by all other evals.)

## Methodology notes (frozen with the run)
- Search panel: 400 frozen queries = 203 reused from earlier frozen panels (evalv2 100, semantic test 50, relevance-audit 53) + 197 new (hand-written + real Google-Suggest-IN autocompletes). Judged fresh with one prompt family; dead-ends verified absent from the catalogue at build time.
- RAG protocol: product Q&A evaluated on the documented PDP path (fresh conversation, `context.sku` set, spec §6.4) so a pending search question cannot hijack the turn; FAQ is single-turn, context-free. Deterministic gate = server-side grounding guard + ≤40 words + banned phrases (100% pass: the guard works); the Qwen verdict measures answer quality (right fact, honest unknowns, tone).
- UX protocol: 300 question moments sampled from the 3,000-journey persona-sim v2 run, replayed deterministically over HTTP (0 LLM tokens for generation); judge prompt calibrated once against the documented product intent (asking a narrowing question is the intended behaviour; judge the fit of the question type).
- Both methodology fixes (PDP path, judge calibration) were made before any result was published; the panel itself was never modified.
- Main gaps found: (1) RAG spec answerer picks the wrong number (RAM for storage) or dodges unanswerable questions with the rating instead of an honest unknown; (2) out-of-scope world questions mis-routed to the category-rescue question instead of `out_of_scope`; (3) budget facet asked for narrow-price queries; (4) category-rescue options are frequency-ranked, not intent-ranked.

## Interpretation rules
- A dimension is 'healthy' at PASS ≥ 85% with the CI stated; 70–85% = worklist; < 70% = fix before scale.
- Search PASS on `new_dead_end` is expected to be low (out-of-catalogue products); report it, don't hide it.
- UX verdict M is a tuning signal, not a bug; B is a bug candidate — collect examples.
- Single-LLM judge caveat: these are Qwen's judgements, not human ground truth (same caveat as every other LLM-judged number in this repo).
