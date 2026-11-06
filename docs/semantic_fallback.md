# Semantic Fallback Layer (ML)

Embedding-based rescue for failed lexical searches, **inside the existing
`/api/search` call**. Additive only: any query that lexical already
resolves (≥2 on-intent results) returns a byte-identical response to v6
(no-op guarantee, zero-tolerance test in `app/lib/__tests__/semantic.test.js`).

## When it runs

```
query -> parseQuery -> lexical search (v6, unchanged)
                 intentN >= 2  -> return as v6          (semantic NOT invoked)
                 intentN < 2   -> semantic fallback (below)
```

- Kill switch: `SEMANTIC_FALLBACK=0` restores v6 exactly.
- Never runs for pure budget-browse queries ("under 500" — browse mode is
  the designed answer) or naive-baseline requests (`?naive`/`naive: true`,
  the studied legacy engine).
- `EVAL_MODE=1` honours `?semantic=0|1|only` (eval harness only; ignored
  in production). `only` = pure ablation: embeddings alone; when semantic is
  below threshold the result set is **empty** (no lexical fallback).

## Model & index

- **Provider: `local_onnx`** — `Xenova/multilingual-e5-small` (384-dim,
  int8 ONNX) via `@huggingface/transformers`. The SAME model + tokenizer
  builds the index offline and embeds queries at runtime (never mixed).
- Prefixes (E5 instruction format): docs `passage: `, queries `query: `
  (config, not code).
- Index (server-side only, `app/data/`, **never under `public/`**):
  - `catalog_emb.i8` — 52,656 × 384 int8 (~20.2 MB)
  - `catalog_emb.scales.f32` — per-row quantisation scales (~144 KB)
  - `catalog_emb.meta.json` — model, dim, n, catalogue sha256,
    **SKU-order sha256** (row i ↔ catalog[i])
- **Integrity gate**: `loadIndex(catalog)` recomputes the SKU-order hash
  per call; any mismatch (catalogue rebuilt without a re-embed) disables
  semantic with `reason: index_mismatch` — it never serves misaligned rows.
- Brute-force cosine over the int8 matrix (V8 dot product, ~15–40 ms);
  no vector DB, no new infra.
- Query path: in-memory LRU (500) → `query_emb_cache.json` (precomputed
  for all known queries: canaries, eval panels, hero examples) → ONNX
  inference (5 ms warm) with a 400 ms timeout. Circuit breaker: 3
  consecutive failures → 5 min template-lexical only. Any failure skips
  semantic (search is never broken by the fallback).
- `app/next.config.js` bundles `./data/**` into `/api/search`
  (`outputFileTracingIncludes`) for serverless deploys.

## Constraints & thresholds (deterministic)

Semantic candidates (top-K=200 by cosine, floor 0.70) pass hard
constraints reusing the lexical engine's exported helpers
(`BUDGET_RELAX=1.6`, `autoContextDelta`, `audienceDelta`,
`accessoryDelta` from `app/lib/search.js`):

1. budget: strict `price ≤ cap`; if <2 remain, retry at ×1.6 and label
   those items `relaxed: true` (same label as lexical relax)
2. brand: exact brand match only (when a brand is given)
3. recipient/gender/kids exclusions, car/auto context, accessory hints
4. diversity: ≤2 items per normalised title stem (variant families)
5. score = cosine + 0.01 × rating (cosine dominates)

Threshold: keep `cos ≥ tau` **and** `cos ≥ top1 − margin`.
`tau`/`margin` are calibrated **on the dev split only**
(`eval/semantic/calibrate.mjs`; `eval/semantic/results/threshold.json`)
under the constraints dead-end false-resolve ≤ 10% and Qwen
precision@3 ≥ 80%.

**On-intent definition (semantic-aware)**: a semantic item is on-intent
iff it passes τ and all hard constraints — it carries `intent: true` in
the merged response. The app's original (lexical-scorer) definition is
reported alongside in the eval (`eval/semantic/results/results.json`).

## Results (2026-11-04, test split n=50)

See `eval/semantic/results/summary.md` (generated from artifacts).
Headline: tau=0.845 / margin=0.03 calibrated on the dev split; hybrid
fallback vs lexical-only — null 8% [3.2-18.8] -> 6% [2.1-16.2]
(directional, CIs overlap), Qwen success@3 52% -> 58%, questions/journey
0.46 -> 0.34, semantic p95 23 ms idle (67-83 ms under machine
load; index warm); the 4/4 dead-end app-level
"false-resolve" is inherited from the baseline category-rescue path
(identical in the lexical arm) and the semantic layer itself rejected all
4 out-of-catalogue queries (below threshold).

## Merge & guide interaction

Merged order: lexical on-intent → semantic fill → lexical leftovers
(capped at the requested limit, 48 for the page). The page's guide policy
runs unchanged on the merged stats: when semantic produces ≥2 on-intent
items, no rescue question is asked (fewer questions — the intended
effect); when it returns nothing (below τ or dead-end), the journey
proceeds exactly as v6 (category rescue, `demand_signal`).
Dead-end queries ("samovar") must still hit rescue — asserted in the eval.

## Rebuild / run

```bash
cd app
# rebuild the index (after any catalogue rebuild; ~3-10 min CPU):
node ../scripts/build_embeddings.mjs
# unit gates (index integrity, parity >=9/10, constraints, no-op):
node --import ../eval/chat/register-shim.mjs lib/__tests__/semantic.test.js
# calibrate tau (dev split only; Qwen judge):
node --import ../eval/chat/register-shim.mjs ../eval/semantic/calibrate.mjs
# test split arms A/B/C + CIs + summary.md (Qwen judge):
node --import ../eval/chat/register-shim.mjs ../eval/semantic/run.mjs
```

## Failure modes

| Condition | Behaviour |
|---|---|
| index missing / stale (hash mismatch) | semantic skipped, `reason: index_missing` / `index_mismatch`; v6 results |
| model load / inference error or >400 ms | `reason: embed_unavailable`; breaker opens after 3 fails (5 min) |
| no meaningful query text (pure budget) | `reason: no_semantic_text` (browse mode) |
| nothing passes τ/margin | `reason: below_threshold`; v6 rescue path |
| `SEMANTIC_FALLBACK=0` | v6 exactly (kill switch, tested) |
| semantic-eligible calls > 30/min/IP (EVAL_MODE exempt) | `reason: rate_limited`; v6 results |
| query text > 200 chars | truncated to 200 before embedding |

## Honest limitations

- Relevance is judged by a **single LLM judge** (Qwen, thinking off); there
  is no multi-annotator human ground truth. A 40-query second-rater check
  (120 item judgements, labelled blind to Qwen; the second rater is the
  **build agent - an LLM, not a human**, stated plainly) agrees with Qwen
  on the binary "usable in top-3" question **85%** of the time
  (Cohen's kappa 0.66) and 70.8% on the 3-class scale (kappa 0.56); the
  gap sits mostly in the partial/irrelevant boundary, where Qwen is the
  more lenient rater. Artifacts: `eval/semantic/results/hand_label_40.json`
  + `agreement_40.json`, section generated into `summary.md`. Arm B
  (semantic-only) top-3 is not judged in the standard pass (ablation arm).
- The panel's `real_suggest` queries are Google-Suggest autocompletes
  (real-query-shaped), not logged shopper queries; there are no real users.
- The catalogue is a demo catalogue (US-converted + synthetic India
  layer), so absolute relevance numbers are indicative.
- Semantic matching can return plausible-but-wrong neighbours for
  out-of-catalogue products; τ/margin trade recall against this, tuned on
  the dev split only.
- English/Hinglish coverage depends on the embedding model; romanised
  Hinglish is only partially handled.
