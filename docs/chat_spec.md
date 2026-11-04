# AskCart Assistant (J10) — Design Spec

> Mode A: deterministic dialog manager + templates-first. The LLM is **off
> by default** (`CHAT_LLM=0`) and, when enabled, only phrases or labels
> low-confidence NLU — it never chooses products, prices, brands, or
> questions. Every reply is re-validated before it reaches the user.

## 1. Architecture

```
client (app/app/ui/chat/*)            server
  ChatLauncher (FAB + nudge)      POST /api/chat
  ChatPanel  (dock/sheet)     <->  route.js  -> inputGuard (nlu.js)
  MessageList / Message             -> verifyState (state.js, HMAC)
  QuickReplies (radiogroup)         -> classify (nlu.js, rules-first)
  ProductMini / Composer            -> handleTurn (dialog.js)
  useChat (fetch + sessionStorage)  -> act() facts -> templates.js
                                       -> validateGrounding (grounding.js)
                                       -> reply + signed state + events
```

- One shared session with the page: chat answers emit `apply_search`
  ui_actions that update the results grid and trail chips; the trail chips
  remain removable and re-search normally. Chat reads page context
  (`sku` on PDP, last query text) for references like "the second one".
- **Zero-LLM default.** With `CHAT_LLM=0` every turn is a pure function of
  (state, input, catalogue) — the golden eval proves identical behaviour
  across runs and the mode.
- LLM paths (only when `CHAT_LLM=1`): NLU fallback when rule confidence
  < 0.8 on an unrecognized message; optional phrasing on typed-text turns
  (chips never). 800 ms timeout, circuit breaker (3 fails → 5 min
  template-only), 10-min cache, daily token cap via the shared LLM client.

## 2. Intents (8 + chip)

| Intent | Trigger (rules, in priority order) | Reply act(s) |
|---|---|---|
| `out_of_scope` | injection patterns, >500 chars, control chars, crisis words, health/legal/finance domain, chitchat, unrecognized | `deflect` |
| `cart_help` | "add this to cart", "open cart", "checkout", "where do I pay" | `confirm_ui_action` / `ask_question` (which one) |
| `compare` | "compare", "vs", "difference between" (ordinals from message or last-3 default) | `show_compare` |
| `explain` | "why did you pick this…" | `explain` (reason chips from actual slots) |
| `faq` | delivery/returns/payment/tracking/demo/privacy/ranking/warranty words; CEO/founder/headquarters → retrieval miss | `faq_answer` / `faq_unknown` |
| `ask_product` | question word + reference (ordinal, "this/yeh", PDP sku) — incl. Hinglish "yeh acche hain kya", "pehla wala kya hai" | `answer_product` / `answer_unknown` |
| `gift_help` | gift word or relation (ammi/papa/didi…) with no product token, or a real occasion | gift flow steps (below) |
| `refine` | "cheaper/sasta", "costlier/mehnga", "show more", "different/without", typed answer to a pending question | `show_results` / `show_more` / `rollback` |
| `search` | any product token, or pure budget browse ("under 500") | `show_results` / `ask_question` (rescue) / `not_found_with_substitutes` |

**Pending-question discipline.** When a question is offered, the next typed
message is first parsed as its answer. A typed *brand* answer must name a
catalogue brand (validated against the brand set); otherwise the message is
re-read as a normal message — a pending question never swallows "cheaper
wala dikhao", "show more", "compare these", or a bare budget number
(numbers are always budget answers).

**Minimum-question principle** (same as the page): max 3 questions per
journey, no repeats, brand never first, rollback guard keeps the previous
results when a refine halves `intentN`.

## 3. Gift flow (J5/H3)

States: `recipient → occasion → budget → shortlist`; any slot already known
(from the query, e.g. "didi ki shaadi gift under 1500" pre-fills
recipient=sister, occasion=wedding, budget=1500) is skipped. Relation words
use the S3 lexicon. Occasion options come from the festival calendar
(`app/lib/festivals_2026_27.json`), ordered by upcoming date — in early Nov
2026 Diwali/Dhanteras/Bhai Dooj lead. The shortlist is a deterministic tag
curation (occasion/gift tag × gender × budget, Bayesian-adjusted rating
sort, brand-diverse, family-deduped) — no LLM curation.

## 4. Product Q&A — grounded and honest

- SKU resolution: explicit sku (PDP context) > ordinal in last results >
  pronoun > ask "which one?" with 3 chips.
- Question classes: `spec` (answered only from title-parsed specs),
  `price` (vs category median from live catalogue stats), `suitability`
  ("tagged as wedding, party" — tags only, no opinion), `quality`
  (Bayesian-adjusted rating + count, never an opinion; "demo rating"
  disclosed).
- Missing data → `answer_unknown` that states what *is* known and offers
  next steps. The catalogue has titles/prices/ratings/tags/specs — no
  descriptions or reviews — so "I don't have that detail" is the designed
  answer, never a fabrication.

## 5. Safety

- **Input guard** (`nlu.js`): ≤ 500 chars, control-char strip, injection
  patterns forced to `out_of_scope` before any LLM call, crisis → kind
  deflect pointing to a trusted person / local services, email/phone/card
  digit runs redacted to `[redacted]` before logging or LLM (flagged in
  `meta.redacted`).
- **State forgery**: the whole conversation state is HMAC-signed
  (`app/lib/chat/state.js`, secret in `CHAT_STATE_SECRET`, dev fallback in
  `app/.chat-secret-dev` — gitignored). Tamper → HTTP 400.
- **Rate limit**: 20 req/min/IP on `/api/chat` (bypassed only in-process
  eval via `CHAT_EVAL=1`); 30-turn hard cap per conversation.
- **Abuse**: repeated out-of-scope → deflect only; no emotional-crisis
  chat beyond the safe single line.
- **Privacy**: transcripts live only in `sessionStorage` (cap 40 messages),
  never in the analytics store; no PII stored; pincode/region handled by
  the page strip, not the chat.

## 6. Output guard (`grounding.js`)

Every reply passes `validateGrounding(text, facts, trusted)`:
1. word count ≤ 40; 2. no URLs/markdown; 3. banned phrases
   (`guaranteed`, `100%`, `best quality`, `will definitely`, `genuine`,
   `authentic`, `free shipping/delivery`, medical/legal/finance terms);
4. template (trusted) text: 1–3; 5. LLM text additionally: every currency
   amount ∈ facts (item prices, slot values, medians), every
   capitalised brand token ∈ facts/allowlist, every SKU ∈ catalogue ∩
   last results; 6. a question in the text must match the pending
   question type. Fail → template fallback + `chat_fallback{grounding_fail}`
   event. **Target: 0 ungrounded replies reaching the user.**

## 7. Entry points

| # | Where | Behaviour |
|---|---|---|
| E1 | Escalation nudge | once per session, after a null search (<2 on-intent): "Ask the assistant?" — accepted → opens chat with context; dismissed → localStorage, never again |
| E2 | Hero FAB | 56px "Ask AskCart" launcher, always visible |
| E5 | PDP | FAB + empty-state suggestions switch to PDP context ("Is this good as a gift?", "Similar under ₹X") |

Nudge is shown at most once per browser session.

## 8. Evaluation gates (CI-blocked)

`eval/chat/run_chat_eval.js` runs the **real route handler in-process**
(loader shims for `next/server`; no mocks) with `CHAT_LLM=0`:

- `eval/chat/golden.jsonl` — 60 conversations: all 8 intents ×
  EN/Hinglish/Hindi, coreference ("the first one", "cheaper", "pehla
  wala kya hai"), gift flow (chip + typed answers), PDP Q&A with honest
  unknowns, compare, FAQ known/unknown, relax/rollback, typed answers to
  pending questions, new-search slot reset.
- `eval/chat/redteam.jsonl` — 30 conversations: prompt injection, fake
  system messages, exfiltration attempts, price manipulation, PII dumps,
  abuse, medical/legal/crisis, giant inputs, emoji floods, state tampering,
  out-of-domain.

| Gate | Threshold | Last run |
|---|---|---|
| Intent accuracy (golden) | ≥ 92 % | 100 % (76/76) |
| Grounding failures reaching user | 0 | 0 |
| Max 40 words per reply | 100 % | 100 % |
| Safe handling (red-team) | ≥ 95 % | 100 % (37/37) |

Artifacts: `eval/chat/results/chat_eval.json`. Run:
`cd app && node --import ../eval/chat/register-shim.mjs ../eval/chat/run_chat_eval.js`

## 9. Config

```
CHAT_LLM=0|1              LLM phrasing + low-confidence NLU fallback (default 0)
CHAT_STATE_SECRET=<hex>   HMAC secret for signed state (dev fallback committed as .chat-secret-dev, gitignored)
CHAT_EVAL=1               in-process eval: skips the rate limit
```

## 10. Limitations (honest)

- Q&A is limited to catalogue fields (title, price, rating, tags, parsed
  specs) — no descriptions, reviews, or real delivery/return policy; every
  policy passage in the FAQ is `Demo:`-tagged.
- Language coverage: EN + Hinglish + basic Hindi (Devanagari detection);
  Hinglish rules are lexicon-based, not full translation.
- The LLM judge is not in the loop for this eval (it runs at
  `CHAT_LLM=0`); LLM-mode phrasing is a cosmetic layer over the same
  deterministic transitions and is validated by the same grounding guard.
- Single local store, localhost; no real A/B traffic.
