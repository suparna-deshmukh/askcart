# AskCart V2 PRD — Author-ready Sections

Date: 14 Nov 2026 · Author: Codex (from `/Users/apple/askcart` repo + the exported
Notion "AskCart V2 PRD", dated 11/09/2026, status "Deployed on Vercel")
Status: draft for Suparna — sections 1–5 below are the PRD sections that were missing
(competitive analysis, prioritization framework, experimentation plan, system-level
technical architecture, explicit trade-offs). Reconciled 14 Nov 2026 against the
exported V2 PRD; §7 lists what still needs input.

**Naming note.** The Notion page titled "AskCart V2 PRD" is version 2 of the
*document*; it describes the deployed **V1 prototype** (its §10 says "V1 target",
its §11 says "real payment, address collection and fulfilment are outside V1").
So in this file, "next increment" / "post-V1" = the product release that comes
after the deployed prototype.

**Source basis.** Everything in sections 2–5 is grounded in the repo and the
exported V2 PRD: `PROJECT.md` (v7 dossier, 2026-11-08), `docs/ASKCART_PRD.md`
(V1 PRD),
`docs/interviews/` (P1–P12), `docs/event_schema.md`, `docs/llm_routing.md`,
`docs/semantic_fallback.md`, `docs/followup_algorithm.md`, `docs/chat_spec.md`,
`eval/` artifacts, and the live code in `app/`. Section 1 (competitors) is written
from general product knowledge **as of Nov 2026** — no live competitor product
verification was possible in this pass; items marked ⚠️ should be verified
before external publication.

**Assumptions used throughout** (flag to me if any is wrong):
- V2 = the next build on this prototype stack (guided search + assistant), not a
  new product; the V1 PRD's "phase 2" list (trust layer, ML re-rank, real
  payments) is the candidate requirement pool.
- Deployment is live on Vercel (public, no sign-in — PRD §1); Gemini remains
  the only LLM provider; single Node app + local ONNX model; no external
  databases yet. The PRD itself cautions about cross-instance state on Vercel
  (US 11 AC 6).
- Real organic traffic volume on the deployed URL is unknown; the repo's eval
  notes (pre-11/09) said there were no real users on the deployment, so
  real-user A/B is gated on *measured* traffic, not on build work.
- Team assumption for the timeline: 1 full-stack + 1 PM/designer (the user),
  LLM budget limited to the Gemini free tier unless stated otherwise.

---

## 1. Competitive Analysis

### 1.1 Landscape

AskCart competes in the "conversational product discovery" layer of e-commerce
search. Three groups matter: (a) the generalist Indian marketplaces that own
the catalogue and the cart, (b) cross-store / LLM-first discovery products, and
(c) vertical and adjacent assistants.

| Competitor | What it does (as of Nov 2026) | Key strengths | Key weaknesses vs AskCart |
|---|---|---|---|
| Amazon India + Rufus ⚠️ | Keyword search + AI chat assistant ("Rufus") for discovery, comparison, review summaries; launched US 2024, expanding IN | Largest Indian catalogue; logistics/trust infrastructure; price competitiveness; review depth; vernacular app support | Discovery is still keyword-ranking-first; chat is an *overlay* that doesn't restructure the search result; no slot-level capture of "budget + occasion + recipient" in one interaction; trust problem (review authenticity, RC1 = 54.4% of mined complaints) is the *object* of the pain, not the fix |
| Flipkart + AI search features ⚠️ | Keyword search with AI-enhanced discovery/assistant features rolling out in-app (2025–26); strong festival commerce | Local brand trust; Big Billion Days; EMI/low-ticket price tier; regional-language effort; "Assured" trust badge | Keyword-centric ranking; conversational queries ("shaadi gift under 2k") still under-resolved; occasion semantics treated as noise, not spec; no published follow-up-question policy or dead-end recovery loop |
| Myntra / Ajio (fashion verticals) | Fashion search with occasion-driven editorial categories (partywear, festive), gifting flows, size charts | Fashion-specific occasion/recipient intent partially *encoded in taxonomy*; strong styling content; size/fit tooling | Vertical only (fashion); occasion is editorial tagging, not conversational understanding; no budget-driven guided loop; fit solved with static size charts instead of a question ("Gift for dad, wears L" — P11); no Hinglish query handling depth |
| Google Shopping + Gemini shopping ⚠️ | Cross-store price comparison, price tracking; "Gemini shopping research" (US-first, 2025) — AI research summaries over Google Shopping data | Cross-store price power; zero-friction from search intent; strong LLM reasoning; Shopping Graph data | Not built for Indian conversational commerce: no INR budget phrasing ("under 2k"), no Hinglish, occasion is not a first-class spec; no cart/checkout depth; trust signals on the SERP are weak (the exact RC1 gap); India availability/depth of the assistant is limited ⚠️ |
| ChatGPT shopping (OpenAI) ⚠️ | "Shopping research" in ChatGPT (US, mid-2025), product research + affiliate links; Instant Checkout experiments with Shopify/Etsy | Best-in-class conversational understanding; trusted assistant UX; research-style comparison summaries | No Indian catalogue depth or INR/occasion semantics; hallucination risk on prices/SKUs (AskCart's grounding guard exists precisely for this); no local trust layer (delivery, COD, UPI, seller history); monetization via affiliate ≠ shopping completion |
| India-first AI shopping apps (e.g., Aisle and similar) ⚠️ | Conversational AI shopping assistants positioned for Indian shoppers, some with vernacular | India-first conversational positioning; vernacular ambition | Thin catalogue/pricing data; no published structured question policy or measured rescue loop; affiliate-driven discovery; trust unproven at scale; most are chat-only (no one-question discipline, no zero-LLM fallback) |
| Voice assistants (Alexa for Shopping, Google Assistant) | Hands-free reorder + simple "find X" from connected stores | Reorder convenience; hands-free; hardware reach | No budget/occasion/recipient reasoning; no dead-end recovery; weak discovery beyond top listings; conversation depth limited |
| Merchant-side AI (Shopify Sidekick/Magic, Klarna Koko, store chatbots) ⚠️ | AI assistants inside merchant stores / at checkout (cross-store where Klarna) | Merchant data access (inventory, policies); checkout proximity | Single-merchant context only — cannot answer cross-product, cross-occasion discovery; policy answers depend on merchant data quality; not a discovery product |

⚠️ = feature name/availability should be re-verified on the competitor's live
product before this section is published externally (verification was not
possible in this writing pass).

### 1.2 What none of them do (AskCart's differentiation, each claim data-grounded)

1. **Pain-mined, not intuition-mined, question policy.** Every follow-up
   question type maps to a *measured* root cause from 94,643 real reviews →
   6,041 LLM-labelled search-UX complaints (trust_gap 54.4%, budget_mismatch
   9.4%, zero_or_wrong 3.5%, occasion_blindness 0.7%; taxonomy in
   `PROJECT.md` §1). No incumbent publishes that its question/assistant policy
   was derived from a labelled complaint corpus; they ship assistants from
   feature intuition.
2. **One-question discipline (minimum-question principle).** At most one
   question per turn, ≤3–4 per journey, always skippable, options generated
   from the *live candidate set* (p25/p50/p75 price bands, top-4 categories,
   top-3 brands), and a rollback guard that never pushes the shopper away from
   a good result set. Competitors offer either chatbot monologues (open-ended,
   ungrounded risk) or filter walls (10+ facets the shopper must compose
   themselves). AskCart's thesis — the cheapest, highest-converting recovery
   for a failed conversational query is *one short, well-timed question* — is
   directly measurable and measured: 27.3% → 8.0% failed searches (n=150),
   28% → 10% on the held-out panel.
3. **Deterministic-first AI, zero-LLM operability.** The policy decides
   (what to ask, which options); the LLM only phrases (and must return options
   byte-identical or the template is used). The whole product runs with zero
   LLM availability, with kill switches, a plan cache, and a visible
   x/60-day budget pill. Incumbent AI features are LLM-first with no published
   degradation path.
4. **Indian conversational-commerce depth.** Hinglish budget words ("under
   panch saut" — P10), INR spec words that must *not* be read as budgets
   (7kg, 1.5 ton, 1100va, 23l), occasion as product spec (sangeet vs reception
   — P12; corporate vs personal — P9), recipient-driven search ("for ammi"),
   festival seasonality (Diwali = 37% of interest in October, from mined
   trend data). Generalist assistants treat these as noise.
5. **Dead-end conversion.** Zero results become a category-rescue question with
   nearest-category offers — never a bare "no results" page. 9/12 participants
   described *giving up immediately* on zero results; this is the highest
   severity drop-off (D3) and the MVP's primary feature.
6. **Trust as a first-class roadmap item.** RC1 trust_gap is 54.4% of all
   complaints — larger than all other causes combined minus noise — and the
   participants (P4/P11/P12) explicitly hunt 1-star reviews and seller history.
   No search UI in the set surfaces the *top quality complaint on the result
   card*. This is AskCart's biggest open white space (next-increment candidate).
7. **Reproducible measurement.** Frozen eval panels committed to git before
   arms run, Wilson 95% CIs on every rate, held-out panels, 44+ query canary
   regression gates, a 1,000-case LLM suite, second-rater agreement (κ 0.66),
   and a no-op guarantee (byte-identical responses where the new layer is
   silent). No competitor publishes this kind of evidence for its search AI.
8. **Honesty guardrails.** Grounding guard (0 ungrounded SKU/price/brand in
   chat), honest "I don't have that detail" unknowns, explicit `relaxed`
   budget labels, `substitute_shown` instead of silent mis-resolves. This is
   a differentiator for trust — the market's #1 pain.

### 1.3 Competitive implications for V2

- **Do not compete on catalogue size or price.** That is Amazon/Flipkart's
  moat. Compete on *resolution* (failed searches → resolved journeys) and
  *trust signals in the result list*.
- **The chatbot arms race is a losing frame.** Every incumbent will ship "a
  shopping chatbot." AskCart's defensible frame is the *policy* (what to ask,
  when, with which options) and its measurement — not chat UX.
- **Watch list:** Rufus/Flipkart adding slot-level budget capture would
  compress D1's differentiation; Myntra/Ajio own occasion in fashion already —
  AskCart's occasion story must be cross-category (shaadi kits, Diwali
  employee gifting, kids' birthdays) to stay distinct.
- **Positioning line (candidate):** "The only shopping search that asks one
  question instead of guessing — built from 6,000+ labelled shopper complaints."

---

## 2. Prioritization Framework

### 2.1 Why not plain MoSCoW or RICE

- **MoSCoW** has no measurable inputs — it institutionalises opinion.
- **RICE** (Reach × Impact × Confidence ÷ Effort) assumes we can estimate
  reach and confidence for a prototype with *no live traffic* — we can't.
  Our "reach" data is not users; it's a labelled complaint corpus, interview
  frequencies, and eval baselines.

So AskCart uses a variant tuned to what we actually have: **Measured Pain ×
Severity × Feasibility × Evidence Maturity** ("MPFE"). It was the framework
used to pick V1's scope (D1–D5 in the journey map); the same rubric ranks V2
candidates.

### 2.2 The rubric (score 1–5 per dimension, weighted)

| Dimension | Weight | 1 | 3 | 5 | Evidence source |
|---|---|---|---|---|---|
| **Measured demand** | 30% | Mentioned by ≤2/12 participants, <1% of complaints | 3–6/12 participants or 1–5% of complaints | 9+/12 participants and/or >5% of labelled complaints | `docs/interviews/` cross-findings; `data/out/root_causes.json` shares |
| **Severity** | 30% | Mild friction (shopper copes) | Recoverable friction (extra turns, mild drop-off) | Hard abandonment (journey ends, app closes) | Journey map drop-off type (D1–D5): D3 = 5, D1/D2 = 4, D4/D5 = 3 |
| **Feasibility** | 20% | New subsystem (new infra/model/data pipeline) | Extends existing component (search/guide/chat/analytics) | Config/lexicon/policy change only | `app/lib/` reuse map; Vercel + no-new-infra constraint |
| **Evidence maturity** | 20% | Only simulated/corpus evidence | Sim + LLM-eval evidence, single judge | Real-user or double-annotated evidence | `eval/` artifacts; disclosure status in `PROJECT.md` §12 |

`Score = 0.30·Demand + 0.30·Severity + 0.20·Feasibility + 0.20·Evidence`,
max 5.0.

**Decision rules**
- **P0 (build in V2):** score ≥ 3.8 **and** Severity ≥ 4 **and** no
  architecture-invariant violation (see §2.3 gates).
- **P1 (build in V2 if P0 list is <3 items):** score ≥ 3.2.
- **P2 (backlog, re-score each wave):** 2.4–3.19.
- **Defer explicitly (document why):** < 2.4 — deferred items get a named
  revisit trigger (e.g., "re-score when real-user data exists").
- Tie-break order: Severity → Measured demand → Feasibility. (We would rather
  fix a severe, well-measured problem cheaply than a large, badly-measured
  one.)

### 2.3 Gates a requirement must pass (non-score)

1. **Invariant gate:** must not break (a) "policy decides, LLM phrases",
   (b) zero-LLM operability, (c) the no-op/byte-identical guarantees, or
   (d) the grounding guard. Violations need an explicit architecture review
   note in the PRD.
2. **Claim gate:** anything that produces an *external claim* (a number a
   reviewer sees) must have a reproducible artifact in `eval/` and a
   `docs/claim_provenance.md` entry.
3. **Trust gate:** any trust-related feature (RC1) must surface *real,
   citable* complaint content (doc_ids) — never a model-generated "review
   summary".

### 2.4 Worked application

**V1 (how it was used):** D3 zero-result dead-end (demand 3, severity 5,
feasibility 5, evidence 3 → 4.1 → P0, primary feature); D1 budget (demand 5
[12/12], severity 4, feasibility 5, evidence 3 → 4.2 → P0); D2 occasion
(demand 5, severity 4, feasibility 4, evidence 3 → 3.9 → P0); D4 trust
(severity 4 but feasibility 2 + evidence 2 → 3.2 → **deferred, phase 2** —
named revisit: "review-intelligence pipeline"); D5 ranking (severity 3,
feasibility 2 → 2.5 → **deferred** — revisit: "ML re-rank model + labels").

**Next-increment (post-V1) candidate pool — illustrative scores.** Committed
anchors (PRD §10): failed-search ≤ 8% (baseline 27.3%), ≥75% of journeys
resolved ≤2 turns, ≥95% usable in the relevance audit (current: 96%),
assistant intent ≥92%, red-team safe handling ≥95%, 44 canaries green. Items
already shipped in the deployed PRD (pincode + coarse region, EN/हिंदी/Hinglish
language switch, interest-context recommendations, Bayesian rating adjustment,
festival gift rail) are *not* candidates. Re-score when the next-increment
scope is defined:

| Next-increment candidate | Demand | Sev | Feas | Ev | Score | Band |
|---|---|---|---|---|---|---|
| Top-complaint trust chip on result cards (RC1 surfacing) | 5 | 5 | 3 | 2 | 3.9 | P0 |
| Real payments / checkout completion | 5 | 4 | 2 | 2 | 3.2 | P1 |
| ML re-rank (fixes D5, browse-mode ranking gap seen in eval v2) | 4 | 3 | 2 | 3 | 2.9 | P2 |
| Budget ranges ("1500 to 2500", 3/12 personas) | 3 | 4 | 5 | 3 | 3.6 | P1 |
| Occasion sub-structure (sangeet/reception, personal/corporate — P9/P12) | 3 | 4 | 4 | 2 | 3.2 | P1 |
| Vernacular depth (beyond lexicon Hinglish: full Hindi/Tamil etc.) | 3 | 3 | 2 | 2 | 2.5 | P2 |
| Bulk/B2B gifting intent (P9) | 2 | 4 | 3 | 1 | 2.5 | P2 |
| Persistent analytics store (real DB) | 2 | 3 | 4 | 5 | 3.0 | P1 (infra) |

---

## 3. Experimentation Plan

### 3.0 Principles (inherited from the eval stack — do not relax)

1. **Pre-registration:** the query panel / hypothesis / primary metric is
   committed to git *before* any arm runs (pattern: `eval/evalv2`,
   `eval/semantic/panel.jsonl`, `eval/llm_suite`).
2. **Frozen inputs, generated outputs:** panels are immutable; every reported
   number is regenerated from artifacts by a script (`make_summary.py`
   pattern), never hand-typed.
3. **Wilson 95% CIs on every rate.** A "win" requires the primary metric's CI
   lower bound > baseline (or, for equivalence tests, the CI inside the
   equivalence margins). Directional results are labelled *directional*
   (precedent: semantic fallback at n=50).
4. **No blending:** dev-set (n=150) and held-out (eval v2, semantic, LLM
   suite) results are always reported side by side, never averaged.
5. **Guardrails are co-primary:** no ship decision on the primary metric
   alone (list in §3.5).

### 3.1 Experiment ladder (maturity order)

| Level | What | When | Current status |
|---|---|---|---|
| **L0 — offline eval** | LLM-judged panels through the real route handlers (search, guide, chat), deterministic or LLM arms | Every code change (canaries 44/111 as ship-block) | Built; green |
| **L1 — simulated cohorts** | 3,000-query simulation + persona sims through the live stack, isolated store | Before any real-user launch | Built; 0 errors, 100% resolved |
| **L2 — in-product A/B** | Real A/B on the deployed Vercel URL, split at session start (the in-app Guided/Plain "Mode" toggle is a *review* tool, not a valid experiment — same user sees both arms, within-subject contamination) | When measured traffic justifies n (§3.3); stable session assignment needs shared storage per PRD US 11 AC 6 | **Gated on measured traffic — the gap** |
| **L3 — real users** | Recruited interviews replacing the simulated P1–P12 before any external research claim; usability studies on new flows | Before external claims / each V2 wave | **Required — currently simulated (disclosed)** |

### 3.2 Hypotheses

| ID | Hypothesis | Primary metric | Method / level | Sample size (per arm) | Timeline | Decision criteria |
|---|---|---|---|---|---|---|
| **H1** | The guided follow-up loop reduces failed searches vs keyword-only baseline on *real* shopper queries | Failed-search (null) rate: <2 on-intent results / search | L2 A/B (guided vs plain, session-split) on a real query log | **440 searches/arm** (baseline 27.3%, MDE 8 pts, α .05, power .80) ≈ 120–150 users/arm at ~3 searches/user | Wave 1 (wk 1–4 after traffic) | Ship: null-rate CI lower bound > baseline. Kill: ≥ baseline. Iterate: CI overlaps but point estimate < baseline → extend n ×2 once |
| **H2** | Budget-first question ordering (vs occasion-first) on gift queries raises 2-turn resolution | % journeys resolved ≤2 turns (baseline 78.7%) | L0 first (frozen gift-query panel through `/api/guide`, both orderings), then L2 | L0: 100 gift queries/arm (directional). L2: **958 journeys/arm** for +5 pts | L0 wk 1–2; L2 Wave 2 | L0 gates L2 (must be directional same sign). Ship L2: CI lower bound > 78.7% |
| **H3** | The one-line "why we ask" explanation lifts chip tap-through | Tap-through = option taps / questions shown | L2 A/B (with vs without why-line) | **604 questions/arm** (40% → 48% assumed baseline→lift) | Wave 2 | Ship: CI lower bound > 0 on the difference. Guardrail: skip rate must not rise >1 pt |
| **H4** | LLM-phrased questions (vs templates) achieve equal conversion with better perceived effort | (a) conversion parity (equivalence, margin ±2 pts); (b) single-item SE on question effort | L0 already showed zero behaviour drift (identical 8.0%/78.7%); L2 for parity + 40-person SUS-SE micro-study | Parity: **~4,200 questions/arm** (MDE 3 pts @ 40%); SE: n=40/arm | Wave 3 | Parity: 90% CI within ±2 pts → keep LLM phrasing where budget allows; else templates default. SE: ≥0.5-pt perceived-ease lift supports keeping it |
| **H5** | Semantic fallback raises success@3 on *failed lexical* queries without hurting resolved ones | LLM success@3 on the failed-lexical subset; no-op guarantee on resolved | L0 A/B/C re-run at power (current n=50 is directional) + 40-item human hand-label spot-check (previously cut) | **384 queries/arm** (52% → 62% MDE) for the subset; resolved subset: 293 no-op re-verification | Wave 1 (offline, no traffic needed) | Ship: subset CI lower bound > 0 AND no-op 100% AND false-resolve ≤10% on dead-ends. Kill: any no-op break |
| **H6** | Surfacing the top quality complaint on mid-trust result cards lifts card CTR (RC1, 54.4% of complaints) | Card CTR; secondary: cart-add rate, "trust" feedback reason share | L0: 200 mid-trust products, with/without complaint chip (LLM-judged "would this change my click" as proxy, double-annotated). L2: A/B | L0 directional (n=200/arm). L2: **2,134 impressions/arm** (30% → 34% assumed) — large; consider 4-pt MDE only with enough traffic, else 10-wk window | Wave 3 (largest V2 feature) | Ship L2: CTR CI lower bound > 0. Guardrail: return-intent proxies (PDP dwell, chat "is this legit?" volume) must not worsen; all surfaced complaints must carry doc_id provenance |
| **H7** | Range budget capture ("1500 to 2500") resolves range-typed queries that caps mis-handle | Null rate on the range-typed subset (3/12 personas; subset identified in query log) | L0: 60 range-typed queries through both parsers. L2: subset A/B | L0: 60/arm (directional). L2: **121 journeys/arm** (30% → 15% assumed) | Wave 2 (cheap, lexicon-level) | Ship: subset null CI lower bound > 0; global null rate must not regress |

### 3.3 Sample-size method

Two-proportion test, α = 0.05 (two-sided), power = 0.80:
`n = [z_{α/2}·√(2·p̄·(1−p̄)) + z_β·√(p₁(1−p₁)+p₂(1−p₂))]² / (p₁−p₂)²`.
Numbers above are computed from the cited baselines (study: 27.3%; eval v2:
28% app-null, 44.7% success@3; held-out: 52% success@3; 78.7% 2-turn
resolution). Assumed baselines for not-yet-measured metrics (H3 tap-through,
H6 CTR) are placeholders — **replace with measured baselines in Week 1 of
Wave 1 and re-compute n**; the table is the method, the numbers are the
first estimate.

### 3.4 Timeline (12 weeks, 3 waves — week 0 = first sustained real traffic on the deployed URL)

```
Week:  1──2──3──4──5──6──7──8──9──10──11──12
Wave 1 [H1 A/B setup+run] [H5 offline re-run]  [L3: 8 real interviews]
Wave 2            [H2 L0] [H7 L0+L2] [H3 L2 run]
Wave 3                 [H6 L0]    [H6 L2]   [H4 parity run + SE study]
Decision gates: end wk 4 (H1, H5), end wk 7 (H2/H3/H7), end wk 12 (H4/H6, V2.1 scope)
```

Offline work (H2/H5/H6-L0, H7-L0) starts immediately — no traffic needed.
Real-user interviews (L3) must complete **before any external research claim**
is made in the V2 PRD (replaces/supersedes the simulated P1–P12, per the
interview kit's own status note).

### 3.5 Decision criteria & guardrails

**Ship (all must hold):** primary-metric CI lower bound > threshold (per
hypothesis); all guardrails within limits; canaries 100% green; no-op
guarantee intact (where applicable); grounding guard 0 failures (chat
changes); no new PII in events.

**Iterate (one extension, pre-registered):** point estimate in the right
direction, CI overlapping → one pre-registered n ×2 extension or one
mechanism fix, then re-decide. No second extension.

**Kill:** primary metric at/below baseline after full n, or any hard
guardrail breach (see below). Kill decisions are written into
`STATUS.md` with the artifact link.

**Guardrails (all experiments):**
- Time-to-first-click (TTFC) and median journey time: no >15% regression.
- Skip rate: no >1 pt rise (questions must stay welcome).
- Rollback events: <5% of journeys (current: 5.0% in eval v2 — do not exceed).
- Unresolved journeys: no rise in the "questions exhausted" class.
- Latency: search p95 < 800 ms (current guided p95 737 ms).
- LLM budget: session budget (8) and key chain (60/day) unchanged unless the
  hypothesis is about LLM spend itself.
- PRD §10 floors: assistant intent ≥92%, red-team safe handling ≥95%, replies
  ≤40 words, relevance audit ≥95% usable — any experiment touching chat or
  ranking must keep these green.
- Judge protocol: single LLM judge (temp 0, thinking off) + 20% sample
  second-rating; if agreement κ < 0.6, human spot-check before any claim.

---

## 4. System-Level Technical Architecture

### 4.1 Component diagram

```
                          ┌────────────────────────── OFFLINE (reproducible) ─────────────────────────┐
                          │  extractor/ (agent.py + 6 collectors)                                     │
                          │  Play/App Store/Reddit/Amazon/Trustpilot + trends  ──►  94,643 reviews    │
                          │  pipeline/ (6-stage DuckDB)  ──►  6,041 labelled complaints               │
                          │  outputs: root_causes.json, bayesian.csv, trends_insights.json            │
                          │  └─ feeds: question policy (guide.js), UI "why we ask" copy, HF Space      │
                          └────────────────────────────────────────────────────────────────────────────┘
                                              │ (design inputs, not runtime)
                                              ▼
┌────────────────────────────── BROWSER ──────────────────────────────┐
│ page.jsx (search tab)  ·  ui/chat/ (assistant)  ·  ui/analytics.jsx │
│ cart/checkout  ·  onboarding (persona)  ·  track.js (client events) │
│ persona + cart persisted in localStorage                            │
└──────────────┬──────────────────────────────┬───────────────────────┘
               │ REST (same origin)           │ fire-and-forget POST /api/analytics/event
┌──────────────▼──────────────────────────────▼───────────────────────┐
│ Next.js 15.5 (App Router, React 18.3) API routes                    │
│  /api/search        lexical engine + semantic fallback + rollback   │
│  /api/guide         deterministic question policy + plan cache      │
│  /api/chat          guard → NLU → dialog mgr → grounding guard      │
│  /api/ai-refine     post-answer filter refine (filters-only)        │
│  /api/ai-status     free LLM-ledger read (x/60 pill)                │
│  /api/catalog-preview · /api/analytics/{event,summary,catalog,ev-…} │
├─────────────────────────────────────────────────────────────────────┤
│ Core libs (app/lib/)                                                │
│  search.js (lexical, Hinglish lexicon, budget/spec/occasion parse)  │
│  guide.js (policy: 7 question types, per-category flows, eligibility)│
│  plan.js (one Gemini plan call = whole question ladder, 10-min cache)│
│  persona.js (recommendScore)  ·  semantic.js (ONNX E5 int8)         │
│  gemini_keys.js (3-key chain, daily ledger, breakers)  ·  guard.js  │
│  chat/ (8-intent NLU, deterministic dialog manager, grounding)      │
│  analyticsStore.js (globalThis singleton, ring buffer, sanitiser)   │
├─────────────────────────────────────────────────────────────────────┤
│ Integrations: Gemini API (only LLM) · Xenova/multilingual-e5-small  │
│ 384-d int8 ONNX via @huggingface/transformers (local inference)     │
├─────────────────────────────────────────────────────────────────────┤
│ Storage (no external DB today)                                      │
│  public/catalog.json (54,304 SKUs) · data/catalog_emb.{i8,scales,meta}│
│  data/query_emb_cache.json · data/query_kb.json · lexicon_hinglish.json│
│  .analytics-state.json (+ .sim.json isolated) · .gemini_usage.json  │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Component inventory

**Frontend (Next.js 15 App Router, React 18.3, no CSS framework)**
- Search tab: hero with 18 example searches (PRD US 5 AC 1), onboarding card
  (3-tap persona, skippable), language + pincode strip (EN/हिंदी/Hinglish
  switch; 6-digit pincode → coarse region only), question strip (rescue/
  refine), filter bar (sort/price-band/4★+/brand/category/clear), results
  layout (Best matches → category shelves → More products, ≤48), product
  cards (text-only, image-ready), trail breadcrumb, rollback notice.
- Chat panel (`ui/chat/`): desktop dock / mobile sheet; shared session with
  the page (chat answers push `apply_search` ui_actions; chat reads PDP
  context); entry points: hero FAB, PDP, once-per-session null-search nudge.
- Analytics dashboard: 6 subtabs (Overview · Search & Guide · Catalogue &
  Brands · Journeys & Orders · Validation & Study · Backend (Admin) — AI key
  ledger, `ai_call` log, engine mix), 2.5 s summary polling / 15 s catalogue +
  evidence (PRD US 9 AC 6), schema-agnostic (renders whatever the event store
  contains).
- Product details (PDP): variants in place, "Why this matched" chips from
  real slots, Bayesian-adjusted rating `(4.2×30 + Σratings) / (30 + count)`
  (PRD US 6 AC 3; demo ratings disclosed), ≤4 similar items (same category,
  ±40% price, by rating), demo 2–4 day regional delivery estimate from the
  pincode region (or a pincode prompt) + demo 7-day return label.
- Cart drawer, simulated checkout modal (no payment/address/fulfilment —
  PRD US 7 AC 4), order toast, wishlist, orders tab (≤20, Demo-labelled).
- Home/discovery: catalogue preview by price band, festival-window seasonal
  gift rail by budget (`festivals_2026_27.json`, PRD US 5 AC 2), explore by
  category/occasion/budget/brand.
- `track.js`: every interaction emits an event (schema in
  `docs/event_schema.md`); session_id + cohort attached client-side.

**API surface** — routes listed in §4.1. Contract highlights:
- `/api/search` returns ranked results + per-item `intent` flag +
  `relaxed` label + full guide `decision` object (type, reason, rescue flag,
  top category) so the UI can render the question strip and the audit trail
  from one payload.
- `/api/guide` returns `{type, options, question, reason, stats}`; options
  are always data-derived (quantiles of the *live* candidate set).
- `/api/chat` returns reply + `events[]` + `ui_actions[]`; every response
  carries `grounded: true|false` (false ⇒ template fallback, never served).

**Core search/guide engine** (`search.js`, `guide.js`, `plan.js`, `facets.js`)
- Query parser: budget words (INR, Hinglish numerals), spec units that are
  *not* budgets (7kg, 1.5 ton, 1100va, 23l), occasion, recipient, brand,
  size/capacity slots; `lexicon_hinglish.json` drives language.
- Ranking: intent scoring, first-word brand bonus, accessory penalties,
  `recommendScore(item, persona)` for the persona strip (formula in PRD
  US 4: search score + price fit + brand affinity + rating terms +
  `interestScore × 0.9` when interest context exists).
- Guide policy: 7 question types (budget, occasion, category, brand,
  for_whom, size, capacity), per-product-type flows + universal tail,
  eligibility rules (no repeats, brand never first, spec-slot guard,
  minimum-question principle), ≤4 follow-ups/journey, data-driven options,
  rollback guard. Full spec: `docs/followup_algorithm.md`.

**LLM layer** (`llm.js`, `gemini_keys.js`, `plan.js`) — see
`docs/llm_routing.md`. Decision chain: state cache (10-min TTL) →
unambiguous-policy short-circuit → session budget (8) → Gemini 3-key chain
(20 RPD/key, local ledger, 429/403 key rotation, model cool-downs) →
deterministic policy. One plan call per journey owns the whole question
ladder (≤7 types, each ≤12 words, server-validated); refine calls are
filters-only. Gemini is the *only* provider (work order 2026-11-06).

**ML layer** (`semantic.js`, `data/`) — see `docs/semantic_fallback.md`.
Runs *inside* `/api/search`, only when lexical returns intent_n < 2:
Xenova/multilingual-e5-small (384-d, int8 ONNX), brute-force cosine over
54,304×384 int8 matrix (~15–40 ms, no vector DB), query LRU (500) +
precomputed cache, 400 ms timeout, circuit breaker (3 fails → 5-min
disable), hard constraints reused from the lexical engine (strict budget,
brand, audience, diversity), threshold `tau` + `margin` calibrated on the
dev split only, SKU-order sha256 integrity gate (stale index ⇒ refused),
kill switch `SEMANTIC_FALLBACK=0`, **no-op guarantee** (byte-identical
response for lexically-resolved queries; zero-tolerance test).

**Chat/assistant** (`lib/chat/`) — see `docs/chat_spec.md`. HMAC-signed
dialog state; rules-first NLU (8 intents + chips), LLM only for
low-confidence labelling/phrasing; deterministic dialog manager;
grounding guard (banned phrases, currency/SKU/brand checks, template
fallback); safety: 20 req/min/IP, 30-turn cap, injection/crisis/PII
guards, tamper → 400. Data-limited by design: answers only from catalogue
fields, `Demo:`-tagged policy passages, honest `answer_unknown`.

**Analytics** (`analyticsStore.js`, `api/analytics/*`) — globalThis
singleton (survives HMR), 500-event ring buffer, per-type/per-query/
cohort rollups, atomic persistence (temp+rename, 500 ms debounce),
defensive sanitiser (non-negative counters, child ≤ parent), schema-
agnostic (any new event renders automatically), isolated `.sim` store for
simulations.

### 4.3 Key data flows

**Search + guided journey (the core loop):**
```
query ─► parseQuery (slots: budget/spec/occasion/recipient/brand/size)
      ─► lexical search ─► intent_n ≥ 2 ─► return (byte-identical path)
      └► intent_n < 2 ─► semantic fallback (ONNX) ─► merged candidate set
      ─► rank ─► top-48 + decision object
chip tap ─► /api/guide (plan cache hit? else Gemini plan call)
        ─► re-search with captured slot ─► rollback guard
        ─► next ladder question inline (≤4 follow-ups) or journey_end
```

**Chat:** `POST /api/chat` → input guard (len/PII/injection/crisis) →
HMAC state verify → NLU (rules; LLM low-confidence only) → dialog manager
→ reply (template / LLM-phrased) → grounding guard → `{reply, events,
ui_actions}` → client applies grid updates / renders chips.

**Analytics:** client `track.js` → `POST /api/analytics/event`
(fire-and-forget, any event accepted) → store → `GET /api/analytics/summary`
(2.5 s poll) → dashboard; `GET /api/analytics/evidence` reads `eval/results/*`
at request time (nothing preset in the Validation tab).

**Offline mining (design input, not runtime):** agent-planned collection →
6-stage DuckDB (ingest → clean → complaints gate → complaints → root causes
→ Bayesian) → `data/out/*` → feeds the policy design, "why we ask" copy, and
the HF Space evidence dashboard (static, browser-computed, no server LLM).

### 4.4 Storage & state (what lives where, and why)

| Data | Where | Why / V2 note |
|---|---|---|
| Catalogue (54,304 SKUs) | `public/catalog.json` (server reads `app/data/`) | Static JSON, serverless-friendly; variant-expanded (real brands/MRPs); V2: consider moving behind `/api` + compression — it's currently the largest payload |
| Semantic index | `app/data/catalog_emb.i8` + `.scales.f32` + `.meta.json` (13.2 MB, gitignored, `outputFileTracingIncludes` bundles it for Vercel) | No vector DB; integrity hash per call; rebuild via `build_embeddings.mjs` (~3–10 min, 0 API tokens) |
| Query embeddings cache | `data/query_emb_cache.json` + in-memory LRU | Known queries (canaries, panels, hero chips) embed for free |
| Persona + pincode + language | `localStorage` (client) | No accounts; pincode stored in the browser, but **only a coarse region ever reaches analytics** (PRD US 4 AC 4, US 9 AC 5, edge cases); needs a session store if login lands |
| Cart / wishlist / orders (≤20) | `localStorage` | Same as above |
| Analytics | In-memory globalThis singleton → `.analytics-state.json` (atomic, debounced) | **Prototype-grade: resets on restart, no history, no multi-instance safety** (Vercel scale-to-zero). The single most likely V2 infra change — see trade-off T3 |
| Sim analytics | `.analytics-state.sim.json` | Isolated so 3,000-query sims never pollute the public dashboard |
| LLM usage ledger | `.gemini_usage.json` | Google exposes no per-key usage endpoint for plain API keys; local conservative ledger; V2: replace with a real spend source if moving to paid tier |
| Eval artifacts | `eval/*/results/*` (committed) | Source of truth for every PRD number; `claim_provenance.md` maps claims → artifacts |

### 4.5 Integrations

- **Gemini API** — only LLM provider. 3-key chain, 20 RPD/key (free tier),
  models pinned via `GEMINI_MODEL` with sticky known-good fallback
  (gemini-3-flash-preview). Cost control: plan cache, session budget,
  visible x/60 pill. *(V2 decision point: paid tier or stay free-tier-
  bounded — see T9.)*
- **ONNX runtime (local)** — `@huggingface/transformers` 4.3.2 +
  onnxruntime-node; model + tokenizer identical between index build and
  runtime (never mixed); prefixes per E5 instruction format.
- **Vercel** — serverless deployment of `app/`; `next.config` traces
  `./data/**` into the bundle. Implication: in-memory state is per-instance
  (relevant to T3).
- **Hugging Face Space** (extractor evidence dashboard) — static site,
  browser-computed from bundled artifacts; no runtime dependency on it.
- **DuckDB** — offline pipeline only; not a runtime dependency.
- **No** payments provider, CRM, warehouse, or vector DB today. Real
  payments in V2 would add a gateway integration (Razorpay for IN context ⚠️
  verify) — flagged as new infra in the prioritization table.

### 4.6 Non-functional guarantees (testable, not aspirational)

| Guarantee | Mechanism | Verification |
|---|---|---|
| 100% functional with zero LLM | deterministic policy + template fallback on every AI path | "no keys configured" boot test; n=150 study ran deterministic |
| No-op where new layer is silent | semantic layer only fires on intent_n < 2; byte-identical otherwise | zero-tolerance test, 293/293 (358-query panel) |
| No ungrounded AI output | grounding guard on every chat reply; options must return byte-identical | 60 golden + 30 red-team convos: 0 grounding failures |
| Stale ML index never served | SKU-order sha256 per call | `index_mismatch` refusal test |
| LLM budget visibility + hard cap | local ledger, session budget 8, key rotation | `/api/ai-status` ledger read; exhaustion events |
| Latency | p50 54 ms / p95 131 ms baseline; p95 737 ms guided (eval v2); semantic p95 23–83 ms | `eval/evalv2`, `eval/semantic` results |
| Event-store integrity | sanitiser (non-negative, child ≤ parent), 500-key caps | heavy-session invariant tests |
| Safety (chat) | rate limit 20/min/IP, 30-turn cap, injection/crisis/PII guards, tamper → 400 | red-team eval: 37/37 safe handling |
| Accessibility | keyboard use, readable text, visible focus, contrast on desktop + mobile (PRD US 11 AC 5) | UI tour + contrast check in the regression gate |
| Vercel multi-instance honesty | no deployment-wide guarantees claimed for in-memory counters/ledgers; shared storage required where those are needed (PRD US 11 AC 6) | dashboard disclosures: what is shared, how long it lasts, pincode excluded |

---

## 5. Explicit Trade-offs

Key architecture/product decisions, the alternatives considered, and why.
This section complements (does not repeat) the PRD's "Honest limitations"
section — that one lists *known limits of the evidence*; this one lists
*decisions and their costs*.

| # | Decision | Alternative(s) considered | Rationale | Cost / revisit trigger |
|---|---|---|---|---|
| T1 | **Deterministic policy decides; LLM only phrases** (options must come back byte-identical) | (a) LLM-driven question selection, (b) pure templates, (c) agentic LLM shopping loop | (a) gives adaptive sequencing but introduces behaviour drift, cost, and availability dependence; (b) is safe but less natural; measured result: LLM-phrased vs template runs are *identical* on outcomes (8.0% / 78.7%) → phrasing is a UX win, not a behaviour change. Policy-decides makes the system auditable and zero-LLM-operable | Slightly less "smart" sequencing than an LLM could find (the plan cache + per-category flows mitigate). Revisit: if a paid LLM tier is adopted and drift stays zero, allow LLM to *reorder* (not invent) question types |
| T2 | **One-question-at-a-time guided loop** (≤4 follow-ups, always skippable) | (a) chatbot free conversation, (b) filter wall, (c) multi-question forms | Thesis: the cheapest highest-converting recovery for a failed conversational query is one short well-timed question; chat risks ungrounded monologues, filter walls push cognitive load to the shopper, forms feel like work. 9/12 participants abandon on dead ends — a single question is the lowest-friction rescue | Multi-turn journeys feel slower to power users (mitigated: ladder continues only while an eligible facet remains; skip ends it). Revisit: if real-user data shows "too many questions" fatigue (skip-rate trend), cut the universal tail |
| T3 | **In-memory analytics, JSON persistence, no database** | (a) Postgres/Neon, (b) a warehouse (e.g., Metabase-backed), (c) third-party product analytics | Prototype speed + zero-infra; the store is schema-agnostic so new events "just appear"; 500-event ring + atomic writes are enough for a shared prototype dashboard. The PRD documents the limit itself (US 11 AC 6: don't assume in-memory state is shared/durable on Vercel; use shared storage for deployment-wide guarantees) | **Resets on server restart; no historical retention; unsafe under multi-instance serverless scale-out** — the biggest latent infra debt. Revisit: when A/B experiments (H1) need session-level stable assignment or any historical claim is made — add shared storage then |
| T4 | **Synthetic-variant-expanded catalogue** (54,304 SKUs from ~36k base listings; real brands, real INR MRPs, realistic distributions) | (a) live supplier feed, (b) raw real listings only | (a) needs supplier relationships and legal; (b) under-represents variant reality (sizes/colours) that drives spec questions. The expansion is disclosed in the PRD | SKU count is inflated by variant expansion; price distributions are modelled, not live. Revisit: on first real traffic — swap in a real (even partial) feed and re-run the eval panels |
| T5 | **Simulated, corpus-grounded interviews + simulated eval cohorts** (disclosed) | (a) recruit real users first, (b) skip qualitative work | Recruiter access lagged the build; the corpus (94,643 real reviews, doc_id-cited quotes) grounds the personas and keeps findings falsifiable; mechanics (search/guide/tracking) run on the *live* stack, only the population is synthetic | Weakest link in the evidence chain — the interview kit itself says real sessions must supersede P1–P12 before any external claim. Revisit: **mandatory before V2 launch claims** (L3 in the experiment plan) |
| T6 | **Local ONNX + brute-force cosine (int8), no vector DB** | (a) Pinecone/Qdrant/pgvector, (b) API embeddings | At 54k×384, brute force is 15–40 ms — a vector DB adds infra for no latency win; int8 cuts memory 4× (parity ≥9/10 self-check); kill switch + no-op guarantee make the layer safe to remove | Doesn't scale past ~1M SKUs or sub-ms requirements; model is a small multilingual model (ceiling on long-tail Hinglish). Revisit: catalogue >250k or multi-language depth — then pgvector/embedding API |
| T7 | **LLM-as-judge as primary eval, single judge** | (a) human label panels at scale, (b) multi-model judge ensembles | Human labelling at panel scale (1,000+ cases × several arms) was not feasible in the time budget; mitigations: frozen panels, temp-0 single judge, Wilson CIs, 20% second-rating (κ 0.66 usable, 0.56 on 3-class), honest "directional not significant" labelling at low n | Judge bias (the planned 40-result hand label was cut); CIs assume i.i.d. queries. Revisit: any claim going to an external audience gets the human spot-check first |
| T8 | **Two "null" definitions coexist deliberately** (per-search intent_n<2 vs per-journey resolved) | (a) one unified definition | Per-search null is comparable across dashboard/study/sim (same number everywhere); per-journey resolution is the shopper-experience metric. Unifying would force a metric to misreport one of the two | Reader confusion (mitigated: Validation tab shows both side by side, "Live vs study"). Revisit: none planned — keep documented forever |
| T9 | **Gemini free tier, 3 keys, 20 RPD/key (~60 calls/day total)** | (a) paid Gemini tier, (b) other providers | Cost control + the product's zero-LLM operability means the cap degrades gracefully (session budget 8, plan cache, visible x/60 pill, deterministic policy takes over) | ~15 chip-answered journeys/day across *all* users before degradation; the pill makes this visible rather than surprising. Revisit: **V2 launch with real traffic → paid tier or the cap becomes a product-limiting factor** |
| T10 | **Text-only product cards (no images)** | (a) real product imagery | Prototype speed + honesty (no hotlinked/mismatched images); card layout is image-ready | Lower CTR ceiling; images are a top-3 trust signal for real shoppers (P10: "reviews with photos… the only reason I trust"). Revisit: with a real catalogue feed, images come free |
| T11 | **Prototype checkout (no payments/address/fulfilment)** | (a) real Razorpay/Stripe flow in V1 | Scope: the product thesis is about *finding*, not transacting; a fake-but-complete checkout loop lets the funnel be measured end-to-end | Orders are prototype records; "order_complete" is not a real conversion. Revisit: V2 P1 (see §2.4) — payments are the first commerce-realism item |
| T12 | **Tags/categories are backend-only; no tag badges in the shopper UI** | (a) surface tags as badges | Engine purity: internal taxonomy strings are noisy; display labels are presentation-only; the v6 "Recommended for you" naming was itself removed in v7 as a false personalisation claim | Shoppers can't see *why* occasion/recipient matching happened except via the question trail and "Why this matched" chips. Revisit: explainability UX test in L3 interviews |
| T13 | **Shared public analytics dashboard (visible to every visitor)** | (a) private/admin-only dashboard | Transparency is the product's evidence strategy — reviewers/evaluators see claimed numbers + artifacts in-product, recomputed live, nothing preset. The PRD mandates the disclosure: sharing + retention limits stated, full pincode never in events (US 9 AC 5) | Anyone can watch other users' aggregated behaviour; coarse by design (no PII in events) but not private. Revisit: real traffic + real users → move to admin-only with consent-compliant events |
| T14 | **Semantic fallback additive + conservative thresholds (tau/margin from dev split; false-resolve ≤10%)** | (a) semantic-first hybrid ranking, (b) looser thresholds for recall | Ablation B (semantic-only) is far weaker (32% null) → fallback-only is the correct shape; loose thresholds would false-resolve dead ends (the exact D3 failure we exist to fix) | Misses some salvageable queries (threshold rejects: all 4 measured dead-ends were correctly rejected, at the cost of a small recall cap); results are directional at n=50. Revisit: after H5 powered re-run + human spot-check |
| T15 | **Honesty-first assistant: data-limited answers, `Demo:` tags, explicit unknowns** | (a) let the LLM answer from general knowledge | The catalogue has no descriptions/reviews/policies; a confident wrong answer on a trust-first product (RC1 = 54.4% of complaints) is worse than "I don't have that detail". Grounding guard enforces it (0 ungrounded outputs in eval) | The assistant feels thinner than ChatGPT on "is this brand legit?" — that thinness is the *roadmap*: top-complaint surfacing (H6) is the planned fix, with real citable data |
| T16 | **Pincode → coarse region only** (delivery estimate, festival ordering, analytics) | (a) full pincode for street-level ETAs | Privacy: a public prototype with a shared dashboard should not collect precise location; the PRD bakes in the rule (US 4 AC 4; edge cases: exactly 6 digits, broad region only) | Delivery estimates are regional, not street-level; the pincode prompt adds a step. Revisit: with real fulfilment (the post-V1 payments item) |
| T17 | **Bayesian-adjusted rating in the PDP** (prior mean 4.2, weight 30; demo data disclosed) | (a) raw rating + count | Small-sample products (many 1–2-rating items) would otherwise top "Top rated" sorts with noise; the same shrinkage idea already runs in the offline pipeline (Bayesian ratings per app) | A genuinely excellent new product with 3 ratings shows a softened number. Revisit: with real review volume, make the prior weight adaptive |
| T18 | **Language coverage via lexicon rules + UI language switch (EN/HI/Hinglish), not full translation** | (a) full i18n of product copy, (b) LLM query translation | `lexicon_hinglish.json` + the UI string switch (`i18n.js`) covers the three languages the QA checklist exercises, cheaply; LLM translation of queries risks changing intent (the "under panch saut" class) | Coverage ceiling: deeper Hindi/Tamil/Bengali and long-tail Hinglish remain weak (QA scope is EN/HI/Hinglish). Revisit: mine real multilingual query logs for gaps |

### 5.1 Trade-off summary for reviewers

The pattern behind T1–T18: **every AI capability is (i) gated by a
deterministic owner, (ii) kill-switchable, and (iii) measured on a frozen
panel before it is claimed.** The costs are conservatism (smaller effects,
"directional" labelling) and prototype-scale infra (T3, T9, T13) — the two
V2 items most likely to flip first are T9 (paid LLM) and T3 (real store),
both gated on real traffic.

---

## 6. User Research Findings

> Sources: `docs/interviews/` (kit, journey map, P1–P12 records),
> `data/out/root_causes.json`, `docs/evidence/review_quotes.csv`,
> `eval/results/summary.txt`.

### 6.1 Methods

Three evidence sources, all coded against one shared root-cause taxonomy so
qualitative and corpus evidence map onto the same categories:

1. **Corpus mining (quantitative).** An agentic extractor collected **94,643
   real reviews** from 5 sources (Play Store 33,172 · App Store 3,450 ·
   Reddit 3,021 · Amazon product reviews 40,000 · Trustpilot 15,000). A
   6-stage DuckDB pipeline cleaned them to 87,603, gated **6,041 search-UX
   complaints**, and every complaint was LLM-labelled (full-corpus two-pass
   re-label) under a 6-class taxonomy. Honest caveat: the pattern scorer's
   agreement with the LLM is accuracy 44.1% / macro-F1 0.240, so LLM labels
   are primary and the scorer is kept only as the zero-LLM fallback.
2. **Demand/seasonality signals.** Google Suggest (IN) + Wikipedia
   pageviews: Diwali peak = 37% of interest in October, Rakhi 50% in
   August, Eid 43% in March (`trends_insights.json`).
3. **Semi-structured interviews (qualitative).** 25 minutes, screen-share,
   real searches on a shopping app. Six-part script: last-3-purchases
   walk-through; scripted task "find a shaadi gift under ₹2,000"; open
   real-need task (think-aloud); probe — what do you do when results are
   empty or wrong, when do you give up; probe — how do you judge a result
   without opening it (price, rating, reviews, photos); close — if the app
   could ask ONE question, what should it ask?

**Disclosure (must appear in the PRD):** P1–P12 were conducted as
*simulated, corpus-grounded* interviews — personas derived from the ~93K
review pipeline, quotes seeded from real mined reviews with doc_ids cited
inline — built ahead of recruiter access. They must be replaced/superseded
by real sessions before any external claim submission.

### 6.2 Participants (n=12)

Ages 21–45; 11 Indian cities; regular online shoppers (3+ orders/month).

| ID | Participant | City | ID | Participant | City |
|---|---|---|---|---|---|
| P1 | 24F, engineering student | Chennai | P7 | 27M, software engineer | Hyderabad |
| P2 | 31M, sales manager | Pune | P8 | 33F, banker | Mumbai |
| P3 | 28F, designer | Bengaluru | P9 | 45M, business owner | Ahmedabad |
| P4 | 35F, homemaker | Lucknow | P10 | 21F, final-year student | Jaipur |
| P5 | 22M, college senior | Delhi | P11 | 38M, IT manager | Bengaluru |
| P6 | 40F, teacher | Indore | P12 | 29F, chartered accountant | Kolkata |

### 6.3 Findings (cross-cutting, with frequency)

- **12/12** said budget is the first thing a follow-up should ask or
  capture; **3/12** need a *range* ("1500 to 2500"), not just a cap (P12).
- **12/12** use occasion language ("for shaadi", "birthday gift") that
  plain search ignores; the occasion has *sub-structure* — sangeet vs
  reception (P12), personal vs corporate (P9) — that a one-shot tag can't
  capture.
- **9/12** gave up immediately on zero results (no rephrasing, no filters);
  **4/12** would answer a "drop which filter? — budget / feature / brand"
  question instantly (P11).
- **10/12** said trust (ratings, reviews, seller history) decides the
  click; all 12 agreed a guided search should fix *finding* first, then
  *trust*. They actively hunt 1-star reviews ("I only trust the 1-star
  reviews, which the app buries" — P4/P12).
- **4/12** typed or planned Hinglish budget words ("under panch saut",
  "do hazaar") that token search mangles (P10).
- P9 adds a new variant under occasion: **bulk/business intent** (400
  Diwali employee kits under ₹1,000 each) — quantity, per-item budget and
  packaging are never asked.
- Product-level (P7/P8/P9/P11): the search page never surfaces the top
  quality complaint — a trust gap search could partially fix by showing it.
- **Five drop-off points** (D1 budget not captured · D2 occasion ignored ·
  D3 zero-result dead end · D4 trust/quality · D5 results flood/ranking),
  ranked by frequency × severity × feasibility: D3 (highest severity — hard
  abandonment), D1 (most-mentioned, cheap to fix) and D2 (differentiator
  for the gifting segment) were solved in the MVP; D4 and D5 were deferred
  (need review-intelligence pipeline / ranking model).

### 6.4 Supporting evidence

Verbatim quotes, friction-coded (RC1 budget · RC2 occasion · RC3
zero/wrong · RC4 trust); "(mine: doc_id)" marks a real mined review cited
by the participant.

| Who | Quote (abridged) | Code |
|---|---|---|
| P1 | "For shaadi I search 'shaadi gift under 2k' and it just shows random gifts. My brain is thinking wedding, it's thinking 'gift'." | RC2 |
| P1 | "If the app told me that before I paid, I'd have picked a different seller." (real review: `tp_popsacom_81395`) | RC4, RC1 |
| P8 | A gift arrived "without wrapping in an ordinary bag" (real review: `tp_wwwyogamatterscom_5952`) — "the app sold a GIFT as a parcel" | RC2, RC4 |
| P9 | "I literally search 'diwali gift ideas for employees under 1000'… It shows me 3 results: two candles, one pen." | RC3, RC2 |
| P10 | "I type 'earrings under panch saut' sometimes — Hinglish… Search treats it as junk characters. Zero results, I switch to the app where my cousin shops." | RC3 |
| P11 | "The app asked for size, not for WHO. 'Gift for dad, wears L usually' would have saved me." | RC2, RC4 |
| P11 | Reads 1-star reviews first: "Description is misleading — it says 415 but it doesn't get there" (real review: `amz23_all_beauty_B08L9HDTPV_4270821`) | RC4 |
| P12 | "My budget is a RANGE, not a cap. '1500 to 2500'. The app only understands 'under'. Half my budget searches return empty because I type a range." | RC3, RC1 |
| P12 | "Sangeet gift and reception gift are NOT the same search." | RC2 |

Quantitative backing: root-cause shares (trust_gap 54.4% · not_search_related
30.2% · budget_mismatch 9.4% · zero_or_wrong 3.5% · other 1.8% ·
occasion_blindness 0.7% of 6,041 complaints); the 5-stage journey map
(`journey_map.md`); and the product-side validation of the D1–D3 fixes —
n=150 study: failed searches 27.3% → 8.0%, 78.7% of journeys resolved
within 2 turns (`eval/results/summary.txt`).

---

## 7. Open items (reconciled 14 Nov 2026 against the exported V2 PRD)

1. **Resolved:** the Notion "AskCart V2 PRD" (exported as
   `AskCart V2 PRD 412e5f5a1a628184b4d8ec0f49e0ee19.md`, dated 11/09/2026,
   status "Deployed on Vercel") is now the alignment source for this file —
   every section above was re-checked against it. It is document v2 of the
   deployed V1 prototype; it does not yet define a *product* V2 scope, so the
   next-increment scope (payments? trust layer? ML re-rank?) still needs to
   be written. §2.4's candidate table is the starting point.
2. **Real-user research.** Everything labelled "user research" in this repo is
   the disclosed simulated/corpus-grounded work. If the V2 PRD is expected to
   cite *real* participants, that data does not exist yet — L3 interviews in
   the experiment plan are the fix, and no real-participant section can be
   authored until they run.
3. **Business context:** the PRD now pins the success targets (§10) and
   deployment status, but traffic source/volume on the live URL, team
   capacity beyond the single-builder assumption, and LLM budget approval
   (paid tier vs the free tier's 60 calls/day) remain unstated. Flag any
   assumption at the top of this file that is wrong.
4. **Competitor verification.** Section 1 facts are from product knowledge as
   of Nov 2026; the ⚠️-marked items (Rufus IN availability, Flipkart AI
   feature names, Gemini shopping IN depth, Aisle's current state, Razorpay
   as the payment rail) should be verified live before external publication.
