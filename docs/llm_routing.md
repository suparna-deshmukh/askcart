# LLM routing — which model does what, when (2026-11-06)

The user's Gemini free tier allows **~20 requests/day per key** and the user
supplies **up to 3 keys**. This page maps every AI decision in the app to a
provider, in cost order, with the exact degradation path when limits hit.
Nothing here changes the user journey: the same questions, options and
filters are produced by the deterministic policy when no LLM is available —
with the LLM the sequencing is slightly better; without it, the same loop
keeps asking.

## The chain (every AI decision uses exactly this)

```
AI decision needed (question-type pick  OR  post-answer refine)
│
├─ 1. STATE CACHE HIT (10-min TTL, key = query|slots|prev|types|answer)
│      -> 0 LLM calls. Repeats of the same state are free.
│
├─ 2. UNAMBIGUOUS (eligible grounded types < 2, or set n <= 12)
│      -> 0 LLM calls. The policy answer is the only answer.
│
├─ 3. SESSION AI BUDGET EXHAUSTED (AI_MAX_PER_SESSION, default 8)
│      -> 0 LLM calls. One toast: "Quick mode ... built-in rules".
│      The deterministic chain continues asking on the narrowed set.
│
└─ 4. PROVIDER CHAIN
     ├─ Qwen38-27B (LiteLLM proxy)   PRIMARY - warm 0.6-1.1 s, no daily cap
     │     seen. 1-2 attempts, 3.0 s cap, thinking off, temp 0.
     ├─ Gemini 3-key chain            SECONDARY - only when Qwen fails or
     │     returns unparseable JSON. One attempt per key (2.5 s each), keys
     │     tried in order, bounded to ~7.5 s worst case.
     └─ DETERMINISTIC POLICY          LAST RESORT - per-category question
           order + data-driven options. Same journey, slightly less
           intelligent sequencing.
```

## Why Qwen first (cost math)

One guided journey = 1 planner call per question + 1 refine call per answer
(≤ 4-5 questions). Gemini-primary would burn 60-120 calls on a single
heavy day across all users = all 3 keys exhausted by ~2-3 journeys.
Qwen-primary costs zero Gemini RPD on the common path; the Gemini chain is
pure insurance, and it is also what the user sees in the pill when it is
the one answering.

## Gemini key chain rules (`app/lib/gemini_keys.js`)

- Keys: `GEMINI_API_KEYS=k1,k2,k3` (`.env`); legacy `GEMINI_API_KEY` = key 1.
- **Local usage ledger** (`app/.gemini_usage.json`, per key per day): every
  attempt increments the key's count up-front. A key at `GEMINI_RPD`
  (default 20) is skipped without being called. Google exposes **no
  per-key usage endpoint for plain API keys** (the Cloud Quotas API needs
  project IAM credentials, not a key) - the ledger is our planner, and it is
  conservative (it over-counts rather than under-counts).
- **429 / 403** → key marked `exhaustedDay = today` (persisted), chain moves
  to the next key immediately, `ai_key_exhausted` event recorded, UI toast:
  "Gemini key N daily limit hit - switched to key M. Guidance continues."
- **400 "API key not valid"** → key marked `invalid_key` for the day.
- **404 (model not served) / 5xx / timeout** → the *model* cools down
  (5 min / 1 min), not the key; the next key may try the next model
  (sticky known-good model first, then GEMINI_MODEL, gemini-3-flash-preview,
  gemini-3.5-flash).
- All keys exhausted → `geminiGenerate` returns null → deterministic policy.
- Model name is sticky per process; a working model is remembered.

## What the LLM decides (and what it never decides)

| Decision | Provider | Output | Validation |
|---|---|---|---|
| Question TYPE (planner) | Qwen → Gemini keys → policy | one type from the grounded list | rejected if not in the data-validated candidate set |
| Post-answer filters + next question (refine) | Qwen → Gemini keys → policy | JSON {filters, question} | every value re-checked against the LIVE narrowed set; ungrounded values dropped |
| Question phrasing (English) | Qwen only (1.5 s, 1 attempt) | reworded question line | options must stay byte-identical or the template is kept |
| Chat NLU / composer (chatbot) | Qwen (CHAT_LLM=0 → templates) | JSON / ≤40-word reply | output guard, zero-tolerance grounding |
| Semantic embeddings | local ONNX (Xenova/multilingual-e5-small) | 384-dim int8 | 0 API calls |

The LLM **never** picks products, prices, SKUs, option values or constraint
values - the policy and the catalogue do. The LLM only chooses WHICH
validated question to ask next and how to map an answer onto validated
facets.

## What the user sees (top bar, always)

- Pill `AI · Qwen 38B` / `AI · Gemini key 2/3` / `AI · Qwen 38B · ready` /
  `AI · Rules (offline)` - the engine that last answered (or the ready
  state before the first AI call). Hover: per-key usage `key1 3/20 · key2
  20/20 (rpd) · key3 0/20` + remaining session budget.
- Toast on key rotation (once per rotation): "Gemini key 1 daily limit hit
  - switched to key 2. Guidance continues."
- Toast on session budget exhaustion: "Quick mode: ... built-in rules."
- Source: `GET /api/ai-status` (local state only, no LLM call) + the
  `gemini`/`plannerAi` block returned by `/api/guide` and `/api/ai-refine`.

## Analytics

- `ai_call` {kind: planner|refine, via: qwen|gemini|rules|cache, key_idx, ms,
  session_id, turn} — every AI decision, server-recorded.
- `ai_key_exhausted` {key_idx, reason: rpd|quota_or_auth|invalid_key, kind}.
- Both feed the Analytics → Backend (Admin) sub-tab: engine mix per user,
  key-switch counts, AI vs rule question share.

## Degradation matrix (journey never breaks)

| Qwen | Gemini keys | Result |
|---|---|---|
| up | up | best sequencing (pill: Qwen 38B) |
| down | key 1 up | Gemini key 1 answers (pill: Gemini key 1/3) |
| down | key 1 429 | key 2 answers + toast (pill: Gemini key 2/3) |
| down | all 3 exhausted | deterministic policy (pill: Rules (offline)) - same loop, data-driven options, per-category order |
| up | any | Qwen answers; Gemini untouched (0 RPD spent) |

## Config

```
GEMINI_API_KEYS=            # up to 3 keys, comma-separated (legacy GEMINI_API_KEY = key 1)
GEMINI_MODEL=gemini-3.8-flash
GEMINI_RPD=20               # local ledger cap per key per day
AI_MAX_PER_SESSION=8        # AI decisions per client session before quick mode
LLM_BASE_URL / LLM_API_KEY / LLM_MODEL   # Qwen via LiteLLM proxy (primary)
```
