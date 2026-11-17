# AskCart V2 PRD — Addendum (merge version)

Six sections, in the order they should be inserted into the PRD. (This title
block and source line are not part of the PRD — strip when merging.)
Source: askcart repo (`PROJECT.md`, `docs/interviews/`, `docs/event_schema.md`,
`docs/llm_routing.md`, `docs/semantic_fallback.md`, `docs/followup_algorithm.md`,
`docs/chat_spec.md`, `eval/` artifacts) and the deployed app's code; consistent
with the PRD dated 11/09/2026.

## 1. User research findings

### Methods
- **Corpus mining.** 94,643 real reviews from 5 sources (Play Store, App
  Store, Reddit, Amazon product reviews, Trustpilot) cleaned through a
  6-stage DuckDB pipeline; 6,041 search-UX complaints, each LLM-labelled
  under a 6-class root-cause taxonomy. Seasonality from Google Suggest IN +
  Wikipedia pageviews (Diwali: 37% of interest in October).
- **Interviews.** 25-minute semi-structured, screen-share, real searches: a
  scripted "shaadi gift under ₹2,000" task, an open real-need task, and
  dead-end/trust probes; every friction moment coded against the same
  taxonomy.

> **Disclosure:** P1–P12 are simulated, corpus-grounded interviews — personas
> derived from the ~93K-review pipeline, quotes from real mined reviews with
> doc_ids cited. Real sessions must supersede them before any external claim.

### Participants (n=12)
Ages 21–45 · 11 Indian cities · regular online shoppers (3+ orders/month).

| | |
|---|---|
| P1 · 24F · engineering student · Chennai | P7 · 27M · software engineer · Hyderabad |
| P2 · 31M · sales manager · Pune | P8 · 33F · banker · Mumbai |
| P3 · 28F · designer · Bengaluru | P9 · 45M · business owner · Ahmedabad |
| P4 · 35F · homemaker · Lucknow | P10 · 21F · final-year student · Jaipur |
| P5 · 22M · college senior · Delhi | P11 · 38M · IT manager · Bengaluru |
| P6 · 40F · teacher · Indore | P12 · 29F · chartered accountant · Kolkata |

### Findings
- **12/12**: budget is the first thing a follow-up should ask or capture;
  3/12 need a *range*, not just a cap (P12).
- **12/12** use occasion language that plain search ignores; the occasion has
  sub-structure — sangeet vs reception (P12), personal vs corporate (P9).
- **9/12** give up immediately on zero results; **4/12** would instantly
  answer "drop which filter? — budget / feature / brand" (P11).
- **10/12** say trust (ratings, reviews, seller history) decides the click;
  all 12: a guided search should fix *finding* first, then *trust*.
- **4/12** typed Hinglish budget words ("under panch saut") that token search
  mangles (P10).
- P9 adds **bulk/B2B gifting** (400 Diwali employee kits under ₹1,000 each) —
  quantity and per-item budget are never asked.

### Drop-off points (journey map)

| Drop-off | Mentioned by | MVP status |
|---|---|---|
| D1 — budget not captured | 12/12 | Solved — budget follow-up + price-aware re-search |
| D2 — occasion ignored | 12/12 | Solved — occasion tags + follow-up |
| D3 — zero-result dead end | 9/12 | Solved (primary feature) — rescue loop, ≤3 questions |
| D4 — trust/quality before click | 10/12 | Phase 2 (real rating + count only) |
| D5 — results flood / ranking | 3/12 | Phase 2 (ranking model) |

### Supporting evidence
Root-cause shares (n=6,041): trust_gap 54.4% · not_search_related 30.2% ·
budget_mismatch 9.4% · zero_or_wrong 3.5% · other 1.8% ·
occasion_blindness 0.7%.

| Who | Quote (abridged) | Code |
|---|---|---|
| P1 | "My brain is thinking wedding, it's thinking 'gift'." (shaadi gift under 2k) | RC2 |
| P10 | "'Earrings under panch saut' — search treats it as junk characters. Zero results, I switch apps." | RC3 |
| P12 | "My budget is a range, not a cap. '1500 to 2500'. The app only understands 'under'." | RC3, RC1 |
| P11 | "The app asked for size, not for WHO. 'Gift for dad, wears L usually' would have saved me." | RC2, RC4 |
| P8 | A gift arrived "without wrapping in an ordinary bag" (real review: `tp_wwwyogamatterscom_5952`) — "the app sold a GIFT as a parcel." | RC2, RC4 |
| P9 | "It shows me 3 results: two candles, one pen." ("diwali gift ideas for employees under 1000") | RC3, RC2 |

Product-side validation of the D1–D3 fixes: n=150 study — failed searches
27.3% → 8.0%; 78.7% of journeys resolved within 2 turns.

## 2. Competitive analysis

⚠️ = verify against the live product before external publication (feature
availability is from product knowledge as of Nov 2026).

| Competitor | What it does | Strengths | Gaps vs AskCart |
|---|---|---|---|
| Amazon India + Rufus ⚠️ | Keyword search + AI chat assistant for discovery/comparison | Largest catalogue, logistics, price, review depth | Keyword-first ranking; chat is an overlay that doesn't restructure search; no single interaction capturing budget + occasion + recipient; trust (the biggest pain) unaddressed |
| Flipkart ⚠️ | Keyword search + AI-enhanced discovery (2025–26) | Local trust, festival commerce, EMI, regional-language effort | Conversational queries still under-resolved; occasion treated as noise; no dead-end recovery loop |
| Myntra / Ajio | Fashion search with occasion-driven categories, gifting, size charts | Occasion/recipient intent partially encoded in taxonomy (fashion only) | Vertical only; editorial tags, not conversational understanding; no budget-driven loop; no Hinglish depth |
| Google Shopping + Gemini ⚠️ | Cross-store price comparison; Gemini shopping research (US-first) | Cross-store price power, LLM reasoning | Not built for Indian conversational commerce (no INR phrasing, Hinglish, occasion-as-spec); no cart depth |
| ChatGPT shopping ⚠️ | "Shopping research" + checkout experiments | Best-in-class conversational understanding, trusted assistant | No Indian catalogue/INR/occasion depth; hallucination risk on prices; no local trust layer |
| India-first AI shopping apps (e.g., Aisle) ⚠️ | Conversational assistants, some vernacular | India-first positioning | Thin catalogue/pricing data; no published question policy; chat-only, no measured rescue loop |

### Differentiators (each data-grounded)
- **Pain-mined question policy** — every question type maps to a measured
  root cause with its share (above), not feature intuition.
- **One-question discipline** — ≤1 question/turn, ≤3/journey, always
  skippable, options from the live candidate set (p25/p50/p75 bands),
  rollback guard. Versus chatbot monologues or filter walls.
- **Deterministic-first AI** — policy decides, LLM phrases; zero-LLM
  operable, kill switches, visible x/60-day budget.
- **Indian conversational depth** — Hinglish numerals, INR spec
  disambiguation (1.5 ton / 7kg / 1100va ≠ budget), occasion as spec,
  recipient-driven, festival seasonality.
- **Dead-end conversion** — zero results become a category-rescue question
  with nearest offers; never a bare "no results".
- **Reproducible and honest** — frozen panels, Wilson CIs, canary gates,
  second-rater agreement; grounding guard (0 ungrounded price/brand) and
  honest unknowns. No incumbent publishes this for search AI.

### Implications
- Don't compete on catalogue size or price — that is the marketplaces' moat.
  Compete on resolution (failed → resolved) and trust signals in the result
  list.
- The "shopping chatbot" arms race is a losing frame; the defensible frame is
  the question policy plus its measurement.
- Watch: Rufus/Flipkart adding slot-level budget capture; Myntra/Ajio own
  occasion in fashion — AskCart's occasion story must stay cross-category
  (shaadi kits, Diwali employee gifting, kids' birthdays).

## 3. Prioritization framework

**Why not MoSCoW/RICE:** MoSCoW institutionalises opinion; RICE assumes
estimating reach from live traffic we don't have. AskCart ranks on what it
actually has: measured pain, severity, feasibility, evidence maturity.

| Dimension (weight) | 1 | 3 | 5 | Source |
|---|---|---|---|---|
| Demand (30%) | ≤2/12 participants, <1% of complaints | 3–6/12 or 1–5% of complaints | 9+/12 and/or >5% of complaints | Interview cross-findings; root-cause shares |
| Severity (30%) | Mild friction | Recoverable friction | Hard abandonment (journey ends) | Drop-off type: D3=5, D1/D2=4, D4/D5=3 |
| Feasibility (20%) | New subsystem | Extends an existing component | Lexicon/policy change only | `app/lib/` reuse map |
| Evidence maturity (20%) | Simulated/corpus only | Sim + LLM eval, single judge | Real-user or double-annotated | `eval/` artifacts |

Score = 0.30·D + 0.30·S + 0.20·F + 0.20·E (max 5.0).
**Bands: P0 ≥3.8 and severity ≥4 · P1 ≥3.2 · P2 2.4–3.2 · <2.4 explicit
defer** with a named revisit trigger. Ties break by severity, then demand.

**Gates (non-score):** must not break the invariants (policy decides /
zero-LLM operability / no-op guarantees / grounding guard); any external
claim needs a reproducible `eval/` artifact; any trust feature must surface
real citable doc_ids, never a generated "review summary".

**Worked application (V1):** D3 4.1, D1 4.2, D2 3.9 → P0 (the three MVP
features); D4 3.2, D5 2.5 → deferred to phase 2.

**Next-increment candidate pool** — committed anchors from the PRD
"Success measures": failed-search ≤8%, ≥75% resolved ≤2 turns, ≥95% usable,
≥92% assistant intent, ≥95% safe handling.

| Candidate | D | S | F | E | Score | Band |
|---|---|---|---|---|---|---|
| Top-complaint trust chip on result cards (RC1 surfacing) | 5 | 5 | 3 | 2 | 3.9 | P0 |
| Budget ranges ("1500 to 2500") | 3 | 4 | 5 | 3 | 3.6 | P1 |
| Real payments / checkout completion | 5 | 4 | 2 | 2 | 3.2 | P1 |
| Occasion sub-structure (sangeet/reception, personal/corporate) | 3 | 4 | 4 | 2 | 3.2 | P1 |
| Persistent analytics store (shared storage) | 2 | 3 | 4 | 5 | 3.0 | P1 (infra) |
| ML re-rank (fixes browse-mode ranking gap seen in held-out eval) | 4 | 3 | 2 | 3 | 2.9 | P2 |

Also scored P2: bulk/B2B gifting intent (2.5), vernacular depth beyond the
lexicon (2.5).

## 4. System-level technical architecture

```
BROWSER — Next.js 15, React 18
  search tab (18 example searches, 3-tap onboarding, language + pincode strip,
  question strip, filters, results, PDP) · chat panel · 6-tab analytics
  dashboard · cart/checkout/wishlist · persona + pincode + language in
  localStorage
      │ REST (same origin)                        │ fire-and-forget events
API routes (Next.js serverless on Vercel)
  /api/search (lexical + semantic fallback + rollback) · /api/guide
  (question policy + plan cache) · /api/chat (guard → NLU → dialog →
  grounding) · /api/ai-refine · /api/ai-status · /api/catalog-preview ·
  /api/analytics/{event, summary, catalog, evidence}
Core libs
  search/guide/plan/facets (deterministic policy, INR + Hinglish parsing) ·
  persona (recommendScore) · semantic (local ONNX) · gemini_keys (3-key
  chain + ledger) · chat/ (8-intent NLU, dialog manager, grounding) ·
  analyticsStore (singleton, ring buffer, isolated sim store)
Integrations
  Gemini API (only LLM) · Xenova/multilingual-e5-small int8 ONNX (local
  inference) · DuckDB (offline mining only)
Storage (no external DB)
  public/catalog.json (54,304 SKUs) · data/catalog_emb.{i8, scales, meta}
  (13.2 MB, sha256 integrity) · .analytics-state.json (+ .sim) ·
  .gemini_usage.json
```

**Components**
- **Frontend** — search tab (hero with 18 example searches, skippable
  3-tap onboarding, EN/हिंदी/Hinglish language switch, 6-digit pincode →
  coarse region, question strip, filter bar, results layout, PDP with
  variants, Bayesian-adjusted rating and similar items), chat panel sharing
  the page session, 6-tab analytics dashboard (incl. Backend (Admin): AI key
  ledger, `ai_call` log), simulated checkout, wishlist, orders (≤20,
  Demo-labelled).
- **Search/guide engine (deterministic)** — Hinglish/INR query parser
  (spec words ≠ budgets), intent ranking, 7 question types with
  per-category flows, data-driven options (quantiles of the live candidate
  set), ≤4 follow-ups per journey, rollback guard.
- **LLM layer** — chain: 10-min plan cache → unambiguous-policy short-
  circuit → session budget (8) → Gemini 3-key chain (20 RPD/key, local
  ledger, 429/403 rotation) → deterministic policy. One plan call per
  journey owns the whole question ladder; options must return
  byte-identical or the template is used.
- **Semantic layer** — fires only when lexical yields <2 on-intent: E5-small
  384-d int8 ONNX, brute-force cosine (~15–40 ms, no vector DB), hard
  constraints, dev-calibrated thresholds, SKU-order sha256 integrity gate,
  kill switch, no-op guarantee (byte-identical where lexical resolved).
- **Assistant** — rules-first NLU (8 intents), deterministic dialog manager,
  grounding guard (0 ungrounded SKU/price/brand); safety: 20 req/min/IP,
  30-turn cap, injection/crisis/PII guards, tamper → 400.
- **Analytics** — schema-agnostic store (any new event renders
  automatically), 500-event ring buffer, atomic persistence, sanitised
  counters, isolated sim store.

**Key flows**
1. **Search + guide:** query → parse slots → lexical → (semantic if
   intent_n<2) → rank top-48 → question strip (plan cache or Gemini plan) →
   chip → re-search → rollback guard → next ladder question or journey end.
2. **Chat:** input guard → HMAC-signed state → NLU → dialog manager →
   template/LLM-phrased reply → grounding guard → reply + `apply_search`
   ui-action updates the page grid.
3. **Analytics:** `track.js` → event store → 2.5 s summary poll →
   dashboard; the Validation tab re-reads `eval/results/*` at request time
   (nothing preset).

**Storage & state**

| Data | Where | Note |
|---|---|---|
| Catalogue (54,304 SKUs) | `public/catalog.json` | real brands/MRPs, variant-expanded; not a live supplier feed |
| Semantic index (13.2 MB) | `app/data/`, bundled for Vercel | rebuilt by script; integrity hash checked per call |
| Persona + pincode + language | `localStorage` | pincode → coarse region only in analytics |
| Cart / wishlist / orders (≤20) | `localStorage` | no accounts |
| Analytics | in-memory singleton → JSON file | resets on restart; no history; not multi-instance-safe (see trade-offs) |
| LLM usage ledger | `.gemini_usage.json` | conservative local counts (no per-key usage API) |

**Integrations** — Gemini API only (3 free-tier keys, visible x/60-day
budget) · local ONNX inference (no embedding API, no vector DB) · Vercel
serverless · DuckDB offline only · no payments/CRM/warehouse today.

**Non-functional guarantees (testable)**

| Guarantee | Mechanism | Verification |
|---|---|---|
| 100% functional with zero LLM | deterministic fallback on every AI path | "no keys" boot test; n=150 study ran deterministic |
| No-op where new layer is silent | semantic only when intent_n<2; byte-identical otherwise | zero-tolerance test (293/293) |
| No ungrounded AI output | grounding guard + byte-identical option check | 60 golden + 30 red-team convos: 0 failures |
| Stale ML index never served | SKU-order sha256 per call | `index_mismatch` refusal test |
| LLM budget cap + visibility | local ledger, session budget 8, key rotation | `/api/ai-status`; exhaustion events |
| Latency | — | p50 54 ms / p95 131 ms baseline; guided p95 737 ms |
| Event-store integrity | sanitiser (non-negative, child ≤ parent) | heavy-session invariant tests |
| Safety + accessibility | rate limits, turn cap, injection/crisis/PII guards; keyboard/focus/contrast (US 11 AC 5) | red-team 37/37; UI tour + contrast check |
| Vercel multi-instance honesty | no deployment-wide guarantees for in-memory state; shared storage where needed (US 11 AC 6) | dashboard disclosures |

## 5. Experimentation plan

**Principles** — pre-registered frozen panels (committed to git before any
arm runs) · every number regenerated from artifacts, never hand-typed ·
Wilson 95% CIs; a win requires the CI lower bound above the threshold,
otherwise the result is labelled *directional* · dev-set and held-out
results always side by side, never blended · guardrails are co-primary.

**Experiment ladder**

| Level | What | Status |
|---|---|---|
| L0 — offline eval | LLM-judged panels through the real route handlers; canaries as ship-block | built, green |
| L1 — simulated cohorts | 3,000-query simulation + persona sims, isolated store | built; 0 errors, 100% resolved |
| L2 — in-product A/B | session-split on the deployed Vercel URL (the in-app Guided/Plain "Mode" toggle is a review tool, not a valid experiment) | gated on measured traffic; stable session split needs shared storage (US 11 AC 6) |
| L3 — real users | recruited interviews superseding P1–P12 | required before any external research claim |

**Hypotheses** (n = per arm; two-proportion test, α .05, power .80)

| ID | Hypothesis | Primary metric | Method | n/arm | Decision |
|---|---|---|---|---|---|
| H1 | Guided loop reduces failed searches vs keyword-only | null rate (27.3% baseline) | L2 A/B | 440 searches (~120–150 users) | ship: CI lower bound > baseline · kill: ≥ baseline |
| H2 | Budget-first ordering on gift queries raises 2-turn resolution | % resolved ≤2 turns (78.7%) | L0, then L2 | L0: 100 gift queries (directional) · L2: 958 | L0 must be directional before L2 |
| H3 | The "why we ask" line lifts chip tap-through | taps / questions shown | L2 A/B | 604 | ship: CI lower bound > 0 · skip rate ≤ +1 pt |
| H4 | LLM phrasing = template conversion, better perceived effort | parity ±2 pts + SE micro-study | L2 + n=40/arm | ~4,200 (parity) | keep LLM phrasing if within parity and ≥0.5-pt ease lift |
| H5 | Semantic fallback lifts success@3 on failed-lexical queries | success@3 (52% baseline) | L0 A/B/C re-run at power + 40-item human spot-check | 384 | ship: CI lower bound > 0 + no-op 100% + dead-end false-resolve ≤10% |
| H6 | Top-complaint chip lifts card CTR (RC1 = 54.4% of complaints) | card CTR | L0 double-annotated proxy → L2 A/B | L0: 200 (directional) · L2: 2,134 impressions | ship: CI lower bound > 0 · every surfaced complaint carries doc_id provenance |
| H7 | Range-budget capture fixes range-typed queries | null rate on the range-typed subset (3/12 personas) | L0 60 queries → L2 subset | 121 | ship: subset CI lower bound > 0 · no global regression |

Baselines for not-yet-measured metrics (H3 tap-through, H6 CTR) are
placeholders; replace with measured baselines in week 1 and recompute n from
the formula above.

**Timeline (12 weeks, 3 waves)** — week 0 = first sustained real traffic.
Weeks 1–4: H1 A/B, H5 offline, 8 real interviews (L3). Weeks 5–7: H2, H7,
H3. Weeks 8–12: H6, H4. Decision gates at the end of weeks 4, 7 and 12.
Offline waves (H2/H5/H6/H7 at L0) start immediately — no traffic needed.

**Decision rules**
- **Ship:** primary-metric CI lower bound above threshold + all guardrails
  green + canaries 100% + grounding guard 0 failures.
- **Iterate:** point estimate in the right direction with an overlapping CI →
  one pre-registered n×2 extension or one mechanism fix, then re-decide. No
  second extension.
- **Kill:** at/below baseline after full n, or any hard guardrail breach;
  written to STATUS.md with the artifact link.
- **Guardrails:** TTFC / median journey time ≤ +15% · skip rate ≤ +1 pt ·
  rollback <5% of journeys · search p95 <800 ms · PRD "Success measures"
  floors stay green (intent ≥92%, safe ≥95%, ≤40 words, ≥95% usable).

## 6. Explicit trade-offs

Key decisions, the alternatives considered, and why. Complements the PRD's
disclosures (known limits of the evidence); this section is about choices
and their costs.

| # | Decision | Alternative(s) | Rationale | Cost · revisit trigger |
|---|---|---|---|---|
| T1 | Deterministic policy decides; LLM only phrases (options must return byte-identical) | LLM-driven question selection; pure templates | Auditable and zero-LLM-operable; LLM-phrased vs template runs are outcome-identical (8.0% / 78.7%) — phrasing is a UX win, not a behaviour change | Less adaptive sequencing · revisit with a paid LLM tier: allow reordering (not inventing) question types |
| T2 | One-question-at-a-time loop (≤4 follow-ups, always skippable) | Chatbot free conversation; filter wall; multi-question forms | Cheapest, highest-converting recovery per the product thesis; chat risks ungrounded monologues, filter walls push work to the shopper | Feels slower to power users · revisit if skip-rate trend shows question fatigue |
| T3 | In-memory analytics + JSON persistence, no database | Postgres/Neon; warehouse; third-party product analytics | Zero-infra, schema-agnostic (new events "just appear"); the limit is documented in the PRD (US 11 AC 6) | Resets on restart; no history; not multi-instance-safe · revisit when A/B (H1) needs stable session assignment |
| T4 | Synthetic-variant-expanded catalogue (54,304 from ~36k base; real brands/MRPs) | Live supplier feed; raw listings only | Realistic variant reality that drives spec questions; no supplier dependency | SKU count inflated; prices modelled · revisit at first real traffic |
| T5 | Simulated, corpus-grounded interviews + simulated eval cohorts (disclosed) | Recruit real users first | Recruiter access lagged the build; the 94,643-review corpus grounds the personas; mechanics run on the live stack | Weakest link in the evidence chain · revisit: real L3 interviews, mandatory before external claims |
| T6 | Local ONNX + brute-force cosine (int8), no vector DB | Pinecone/Qdrant/pgvector; embedding APIs | 54k×384 brute force is 15–40 ms — infra for no latency win; int8 cuts memory 4× (parity ≥9/10) | Doesn't scale past ~1M SKUs · revisit at >250k SKUs or deeper multilingual |
| T7 | Gemini free tier, 3 keys (~60 calls/day) | Paid tier; other providers | Cost control; degrades gracefully (session budget 8, plan cache, visible x/60 pill) | ~15 chip-answered journeys/day before degradation · revisit: real traffic → paid tier |
| T8 | Prototype checkout (no payments/address/fulfilment) | Real payment gateway in V1 | The thesis is about finding, not transacting; a complete simulated loop still measures the funnel end-to-end | "order_complete" is not a real conversion · revisit: first commerce-realism item post-V1 |
| T9 | Public analytics dashboard (visible to every visitor) | Admin-only dashboard | Transparency is the evidence strategy — claimed numbers + artifacts in-product, recomputed live; the PRD mandates the disclosures (sharing, retention, no full pincode — US 9 AC 5) | Aggregated behaviour visible to anyone · revisit: real users → admin-only with consent-compliant events |
| T10 | Pincode → coarse region only (delivery estimate, festival rail, analytics) | Full pincode for street-level ETAs | A public prototype with a shared dashboard should not collect precise location; the PRD bakes in the rule | Regional estimates only · revisit with real fulfilment |

**Pattern:** every AI capability is (i) owned by a deterministic decision
maker, (ii) kill-switchable, and (iii) measured on a frozen panel before it
is claimed. The costs are conservatism and prototype-scale infra (T3, T7,
T9) — the first to flip when real traffic arrives.
