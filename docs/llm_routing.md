# LLM routing — which model does what, when (2026-11-06)

The user's Gemini free tier allows **~20 requests/day per key** and the user
supplies **up to 3 keys**. This page maps every AI decision in the app to a
provider, in cost order, with the exact degradation path when limits hit.
Nothing here changes the user journey: the same questions, options and
filters are produced by the deterministic policy when no LLM is available —
with the LLM the sequencing is slightly better; without it, the same loop
keeps asking.

## The chain (every AI decision uses exactly this) - Gemini-only since 2026-11-06

LLM (Gemini API) was REMOVED per user work order; Gemini is the only
LLM provider. Every AI decision runs:

```
AI decision needed (question-type pick OR post-answer refine OR phrasing)
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
└─ 4. GEMINI 3-KEY CHAIN (20 RPD per key)
     │   one attempt per key (2.5 s each), keys tried in order,
     │   bounded to ~7.5 s worst case (client windows abort earlier and
     │   the deterministic answer is already valid).
     └─ DETERMINISTIC POLICY - per-category question order + data-driven
           options. Same journey, slightly less intelligent sequencing.
```

## Calls per journey (the budget math)

**Item B (2026-11-06): one plan call owns the whole question sequence.**

- **Journey start:** the `/api/guide` request triggers **one plan call**
  (`app/lib/plan.js`). Gemini returns the entire follow-up ladder - up to 7
  question types in ask-order, each with a <=12-word phrasing - in a single
  call. It is cached 10 min keyed on `query|parsed-slots|persona`, so every
  later turn in the same journey reads the cache (**0 calls**).
- **No separate phrasing call:** the plan already phrased each question
  (server-validated: <=12 words, no prices/URLs). `decision.planPhrase`
  tells the guide route to skip its old per-question phrasing call
  (`mode: "plan"`).
- **Per follow-up answer:** one **refine** call, but now **filters-only**
  (the journey plan owns the question sequence, so refine no longer
  generates a question; `maxTokens` drops 512 -> 160). Every proposed
  filter value is still validated against the live narrowed set.

Net: a chip-only 3-question journey = **1 plan + 3 filters-only refine = 4
calls** (was planner+phrasing per turn + refine per answer = ~5-8). A
journey answered entirely from cached state after the plan = 1 call total.
With 3 keys × 20 RPD = 60 calls/day across all users, that is ~15
chip-journeys - after that every decision comes from the deterministic
policy (journey unchanged, sequencing less adaptive). The session budget (8)
and the 10-min plan cache extend the reach. The top-bar pill shows the
running **x/60 today** total across all keys + all users, each key's x/20 on
hover, so the budget is visible, not a surprise.

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
| Question TYPE (planner) | Gemini keys → policy | one type from the grounded list | rejected if not in the data-validated candidate set |
| Post-answer filters + next question (refine) | Gemini keys → policy | JSON {filters, question} | every value re-checked against the LIVE narrowed set; ungrounded values dropped |
| Question phrasing (English) | Gemini keys (1.5 s, 1 attempt/key) | reworded question line | options must stay byte-identical or the template is kept |
| Chat NLU / composer (chatbot) | Gemini keys (CHAT_LLM=0 → templates) | JSON / ≤40-word reply | output guard, zero-tolerance grounding |
| Semantic embeddings | local ONNX (Xenova/multilingual-e5-small) | 384-dim int8 | 0 API calls |

The LLM **never** picks products, prices, SKUs, option values or constraint
values - the policy and the catalogue do. The LLM only chooses WHICH
validated question to ask next and how to map an answer onto validated
facets.

## What the user sees (top bar, always)

- Pill `AI · LLM 38B` / `AI · Gemini key 2/3` / `AI · LLM 38B · ready` /
  `AI · Rules (offline)` - the engine that last answered (or the ready
  state before the first AI call). Hover: per-key usage `key1 3/20 · key2
  20/20 (rpd) · key3 0/20` + remaining session budget.
- Toast on key rotation (once per rotation): "Gemini key 1 daily limit hit
  - switched to key 2. Guidance continues."
- Toast on session budget exhaustion: "Quick mode: ... built-in rules."
- Source: `GET /api/ai-status` (local state only, no LLM call) + the
  `gemini`/`plannerAi` block returned by `/api/guide` and `/api/ai-refine`.

## Analytics

- `ai_call` {kind: plan|refine, via: gemini|rules, key_idx, cached, ms,
  session_id, turn} — every AI decision, server-recorded. `kind:"plan"` is
  the one-call journey planner (fires once per journey; `cached:true` marks
  the cache reads that cost zero LLM calls). `kind:"refine"` carries
  `question: bool` (false = filters-only mode).
- `ai_key_exhausted` {key_idx, reason: rpd|quota_or_auth|invalid_key, kind}.
- Both feed the Analytics → Backend (Admin) sub-tab: engine mix per user,
  key-switch counts, AI vs rule question share.

## Degradation matrix (journey never breaks)

| Gemini keys | Result |
|---|---|
| key 1 up | key 1 answers (pill: Gemini key 1/3) |
| key 1 429 / quota | key 2 answers + toast (pill: Gemini key 2/3) |
| key 2 also 429 | key 3 answers + toast (pill: Gemini key 3/3) |
| all 3 exhausted (or day cap reached) | deterministic policy (pill: Rules (offline)) - same loop, data-driven options, per-category order |
| no keys configured | deterministic policy immediately; pill explains it in the tooltip |

## Config

```
GEMINI_API_KEYS=            # up to 3 keys, comma-separated (legacy GEMINI_API_KEY = key 1)
GEMINI_MODEL=gemini-3.8-flash
GEMINI_RPD=20               # local ledger cap per key per day
AI_MAX_PER_SESSION=8        # AI decisions per client session before quick mode
# LLM_BASE_URL / LLM_API_KEY / LLM_MODEL - retired 2026-11-06 (LLM removed);
# the Gemini API is no longer called by the app.
```
