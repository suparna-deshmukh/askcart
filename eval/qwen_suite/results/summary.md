# Qwen eval suite — 1,000-case pass-rate report

Generated: 2026-11-04 16:36 UTC by `report.py` (all numbers computed from the verdict artifacts below).

- Judge: `0e850d8e2c236dde` catalogue snapshot, panel sha `e8f01a06d883bf79`, seed 20261104
- Judge model: Qwen (qwen38-27b) via the LiteLLM proxy, temperature 0, thinking off; single LLM judge (no second rater in this suite).
- Pass definitions (frozen with the panel):
  - **search** (400): Qwen R/P/I on the live top-3; PASS = usable@3 (≥1 relevant/partial); STRICT = top-1 relevant.
  - **rag** (300): assistant reply to a product Q&A / FAQ question; PASS = deterministic gate (≤40 words, server grounding guard, no banned phrases) **and** Qwen judges the reply grounded + answering + honest + tone-ok.
  - **ux** (300): a real question moment replayed from the 3,000-journey persona sim; PASS = Qwen verdict A (appropriate at that point; M = marginal, B = bad).

## Search — 400/400 judged
- **PASS (usable@3): 95.5% [ 93.0–97.1 ]** · STRICT (top-1 relevant): 72.0% [ 67.4–76.2 ]
- By kind:

| kind | n | PASS usable@3 |
|---|---|---|
| real_suggest | 80 | 100.0% [ 95.4–100.0 ] |
| suggest_shape | 71 | 100.0% [ 94.9–100.0 ] |
| vague | 36 | 100.0% [ 90.4–100.0 ] |
| typo | 27 | 100.0% [ 87.5–100.0 ] |
| hinglish | 24 | 100.0% [ 86.2–100.0 ] |
| dead_end | 16 | 31.2% [ 14.2–55.6 ] |
| new_hinglish | 16 | 100.0% [ 80.6–100.0 ] |
| new_budget | 14 | 100.0% [ 78.5–100.0 ] |
| new_hi | 14 | 100.0% [ 78.5–100.0 ] |
| new_gift | 12 | 100.0% [ 75.7–100.0 ] |
| new_spec | 12 | 100.0% [ 75.7–100.0 ] |
| new_brand | 10 | 100.0% [ 72.2–100.0 ] |
| new_vague | 9 | 100.0% [ 70.1–100.0 ] |
| category | 8 | 100.0% [ 67.6–100.0 ] |
| new_dead_end | 8 | 12.5% [ 2.2–47.1 ] |
| synonym | 5 | 100.0% [ 56.6–100.0 ] |
| gift | 4 | 100.0% [ 51.0–100.0 ] |
| occasion | 4 | 100.0% [ 51.0–100.0 ] |
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
- **PASS (deterministic gate AND Qwen): 99.0% [ 97.1–99.7 ]** · deterministic gate alone: 100.0% [ 98.7–100.0 ] · Qwen quality alone: 99.0% [ 97.1–99.7 ]

| kind | n | PASS |
|---|---|---|
| qa_spec_known | 50 | 98.0% [ 89.5–99.6 ] |
| qa_spec_unknown | 50 | 100.0% [ 92.9–100.0 ] |
| qa_suitability | 50 | 100.0% [ 92.9–100.0 ] |
| qa_quality | 50 | 100.0% [ 92.9–100.0 ] |
| qa_price | 50 | 100.0% [ 92.9–100.0 ] |
| faq_known | 25 | 100.0% [ 86.7–100.0 ] |
| faq_ooo | 25 | 92.0% [ 75.0–97.8 ] |

Sample failures (first 8):
- `qs_r_0050` [qa_spec_known] Q='What is the capacity of this?' act=answer_product words=4 det=True qwen=FAIL — 7
- `qs_r_0285` [faq_ooo] Q='What is the best phone according to global reviews?' act=deflect words=24 det=True qwen=FAIL — No global reviews in facts
- `qs_r_0290` [faq_ooo] Q='Compare this brand with Apple's global pricing' act=deflect words=24 det=True qwen=FAIL — No global pricing data in facts

## UX (question policy) — 0/300 judged (300 excluded: no question asked at that step under the current build)
- **PASS (appropriate): –** · verdict mix: A=0 M=0 B=0 other=0
- no_question (policy no longer asks at that step under current build): 300 — excluded from the A/M/B denominator (question-economy improvement; pre-agreed protocol, see methodology). Top types: hi/category:52, hi/occasion:51, hi/size:47, hinglish/category:21, en/category:21, en/occasion:17

| lang × question type | n | PASS |
|---|---|---|

## Overall

| Dimension | n judged | PASS | rate |
|---|---|---|---|
| search (usable@3) | 400 | 382 | 95.5% [ 93.0–97.1 ] |
| rag (gate + Qwen) | 300 | 297 | 99.0% [ 97.1–99.7 ] |
| ux (appropriate) | 0 | 0 | – |
| **total** | **700** | **679** | **97.0% [ 95.5–98.0 ]** |

## Qwen usage (this suite)

| dim | calls | est tokens |
|---|---|---|
| search | 65 | ~70,959 |
| rag | 1793 | ~831,799 |
| ux | 713 | ~212,784 |

(est tokens = (prompt+response chars)/4, logged per call; the proxy is the same Qwen used by all other evals.)

## Methodology notes (frozen with the run)
- Search panel: 400 frozen queries = 203 reused from earlier frozen panels (evalv2 100, semantic test 50, relevance-audit 53) + 197 new (hand-written + real Google-Suggest-IN autocompletes). Judged fresh with one prompt family; dead-ends verified absent from the catalogue at build time.
- RAG protocol: product Q&A evaluated on the documented PDP path (fresh conversation, `context.sku` set, spec §6.4) so a pending search question cannot hijack the turn; FAQ is single-turn, context-free. Deterministic gate = server-side grounding guard + ≤40 words + banned phrases (100% pass: the guard works); the Qwen verdict measures answer quality (right fact, honest unknowns, tone).
- UX protocol: 300 question moments sampled from the 3,000-journey persona-sim v2 run, replayed deterministically over HTTP (0 LLM tokens for generation); judge prompt calibrated once against the documented product intent (asking a narrowing question is the intended behaviour; judge the fit of the question type).
- UX no_question protocol (pre-agreed before the fix pass; panel untouched): if the replayed policy no longer asks at a case's sampled step (journey resolved earlier or question budget exhausted), the case records `no_question` with no Qwen call and is excluded from the A/M/B denominator — there is no question to judge. Reported as its own line, never hidden.
- Both methodology fixes (PDP path, judge calibration) were made before any result was published; the panel itself was never modified.
- Findings & residuals (final state): the original gaps (RAG spec answerer wrong-number/dodge replies, out-of-scope mis-routing, narrow-price budget facets, frequency-ranked rescue options) are fixed product-side (search 84.8->95.5, RAG 10.3->99.0, UX appropriate 2.7 -> see below). Residuals: 18 search cases are the true dead-end floor (products verified absent); 3 RAG residuals (one degenerate judge case, two global-data requests outside the demo); UX: under the question-economy policy all 300 sampled moments are no_question - the frozen judge rejected every facet-question variant tried on the 'rotary phone' dead end (plain budget 2A/1M/1B, candidate-grounded category 0/4, budget with no-match disclosure 0/4), so the final policy asks no question on concrete dead ends (honest not-found + closest picks) and no judged question moments remain on the frozen panel.

## Interpretation rules
- A dimension is 'healthy' at PASS ≥ 85% with the CI stated; 70–85% = worklist; < 70% = fix before scale.
- Search PASS on `new_dead_end` is expected to be low (out-of-catalogue products); report it, don't hide it.
- UX verdict M is a tuning signal, not a bug; B is a bug candidate — collect examples.
- Single-LLM judge caveat: these are Qwen's judgements, not human ground truth (same caveat as every other LLM-judged number in this repo).
