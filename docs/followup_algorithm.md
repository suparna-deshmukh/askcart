# AskCart Follow-Up Question Algorithm

> The follow-up is the product. This document explains **why** AskCart asks
> what it asks, **when**, **in what order**, and how every choice is grounded
> in data (mined review corpus, user interviews, live catalogue statistics).

## 1. Problem statement

A plain keyword search fails in three distinct ways, and each failure mode has
a different cheapest fix:

| Failure | What the user experiences | Cheapest fix |
|---|---|---|
| **Relevance** — query matches nothing / the wrong thing | 0 results, or results for the wrong product class | Disambiguate the *category* |
| **Budget** — results exist but are priced wrong for the user | "I got results, none I can afford" | One *budget* question |
| **Context** — the product exists but for the wrong occasion | "This is for a shaadi, not a birthday" | One *occasion* question |
| **Trust** — many options, no idea which to believe | "Which of these is actually good?" | One *brand / best-rated* question |

## 2. Grounding: where the questions come from

### 2.1 Mined review corpus (the numbers)

The 6-stage DuckDB pipeline (`pipeline/run_pipeline.py`) processed
**94,643 raw reviews** (Play Store 33,172 · App Store 3,450 · Reddit 3,021 ·
Amazon 40,000 · Trustpilot 15,000) → 87,603 clean → 6,041 shopping complaints,
classified by a 6-class taxonomy. v7: all 6,041 complaints are
Qwen-labelled (full corpus, 4 shards + 1,402-row retry pass); the pattern
scorer is the zero-LLM fallback (scorer-vs-LLM agreement: accuracy 44.1%,
macro-F1 0.240 — `data/out/rc_agreement.json`). The root causes:

| Root cause | Share of complaints | Question that fixes it |
|---|---|---|
| trust_gap (can't tell good from bad) | 54.4% | brand / best-rated (asked last — it refines, it doesn't rescue) |
| not_search_related (passed the gate, not about search) | 30.2% | — (reported honestly, not forced into a search cause; no question) |
| budget_mismatch (price out of range) | 9.4% | budget |
| zero_or_wrong (nothing / wrong thing) | 3.5% | category disambiguation |
| other (shopping-relevant, no other class) | 1.8% | — |
| occasion_blindness (wrong occasion) | 0.7% | occasion |

**Why budget beats brand in order**: trust_gap is the *largest* root cause,
but it only matters *after* the candidate set is small enough to be browsed.
Asking brand first on a 36,000-SKU search is low-value information; asking
budget first collapses the candidate set where it is widest (electronics:
p25–p75 spans an order of magnitude). Budget is therefore the earliest
question; brand is a refinement.

### 2.2 User interviews (n=12)

`docs/interviews/journey_map.md` mapped the search→cart journey and found five
drop-offs. The follow-up algorithm directly solves three of them:

- **D1 (budget, 5/12 mentioned)** — "I never want to open 40 results to find
  the one I can afford" → budget question, options set from live price
  quantiles of the candidate set.
- **D2 (occasion, 4/12)** — "for shaadi" is what actually decides the product
  → occasion question, triggered by gift intent even when search "works".
- **D3 (zero-result dead end, 6/12)** — the moment of abandonment → rescue
  mode with a category choice, never a bare "no results".

D4 (trust signals on cards) and D5 (ranking transparency) are UI phase-2
items, not questions.

## 3. The decision policy (deterministic, auditable)

Implementation: `app/lib/guide.js` → `decideGuide(catalog, query, nResults,
{turn, prevTypes})`. The policy **decides**; the LLM only **phrases**
(see §6). Same decision, same options, every time — the Qwen layer can fail
without changing behaviour (it falls back to the template).

### 3.1 Inputs

1. **Parsed query** — budget (e.g. "under 2k" → ₹2,000), occasion tag
   (shaadi → wedding), product tokens. Parsing is in `app/lib/search.js`.
2. **nResults** — how many results the previous search returned
   (rescue mode if < 2).
3. **Candidate-set statistics** — `searchStats()` aggregates the matched set
   (or the catalogue when the match is empty): top-4 categories, top-4
   brands, price p25/p50/p75. Options are *always* computed from this data,
   never hardcoded.
4. **Conversation state** — current turn and question types already asked
   (a type is never repeated; brand is never the first question of a journey).

### 3.2 Per-product-type flows

Each product family has its own question order, because the dominant
ambiguity differs:

| Product family | Flow (first → last) | Why |
|---|---|---|
| Phones / Electronics / Computers / Appliances / Camera | budget → brand | price variance is an order of magnitude; brand is the trust proxy buyers already use |
| Fashion / Beauty / Handmade / Arts & Crafts / Toys / Baby | occasion → budget → (brand) | the occasion *is* the product (a shaadi dress ≠ a party dress); price matters second |
| Home / Tools | budget → occasion | functional purchase; occasion only matters when gifting |
| Sports / Office / Pets / Automotive | budget → category | use-case (category) ambiguity dominates |
| Anything else / multi-category | budget → category → brand | default ladder, biggest lever first |

### 3.3 Eligibility rules (what is a *minimum-valuable* question)

A question type is eligible only if:

- it hasn't been asked yet in this journey;
- `budget`: the query has **no** explicit budget (asking a budget when the
  user already said "under 2k" is noise);
- `occasion`: the query has **no** specific occasion ("gift" counts as
  generic and is refined, e.g. "gift for 5 year old" → occasion);
- `category` (non-rescue): only if the top category holds **< 55%** of the
  candidate set (if results are already one category, category is noise);
- `brand`: only from turn 2, and only when the candidate set actually
  contains ≥ 2 brands.

### 3.4 Rescue vs refinement

- **Rescue mode (nResults < 2)**: a dead-end search must convert. Category
  disambiguation is always eligible and ordered first, with
  gift-adjacent category options for gift queries ("Toys & Games / Handmade /
  Arts & Crafts & Sewing / AMAZON FASHION").
- **Refinement mode (nResults ≥ 2)**: the first eligible type in the
  category's flow — at most **one** question per turn, up to **three**
  questions per journey total (4-turn budget, the same budget the n=150
  study measures). If nothing is eligible, the policy returns "ask nothing"
  and the journey resolves as-is (minimum-question principle).

  The live UI honours this: if a chip answer still leaves <2 results, the
  next eligible question type is shown on the next turn (rescue keeps
  asking until the shopper is at the product or no question type remains).
  "2-turn resolution" is therefore a measured property of the system
  (78.7%), not a hard cap on the user's help.

### 3.5 Option generation (data-driven)

- **Budget** — from candidate-set price quantiles, rounded to clean INR
  steps: `Under ₹{p25}`, `₹{p25}–₹{p50}`, `₹{p50}–₹{p75}` (merged when
  equal), plus "Not sure / flexible". So a headphones query offers
  ₹1k/₹2k/₹3.5k bands; a laptop query offers ₹1.25k/₹3.5k/₹37k bands.
- **Occasion** — Gift / Birthday / Wedding-Shaadi / Anniversary /
  Diwali-Festival / Everyday use (fixed vocabulary: it maps 1:1 to catalogue
  occasion tags).
- **Category** — top-4 categories of the candidate set (or gift-adjacent
  list on a dead-end gift query).
- **Brand** — top-3 brands in the candidate set + "No preference — best
  rated".

## 4. Why this maximizes conversion

1. **Every question removes a known failure mode.** Each question type maps
   to a measured complaint root cause (§2.1) or a measured interview
   drop-off (§2.2). No question is asked for style.
2. **Minimum questions.** Eligibility rules forbid redundant questions
   (already-stated constraints, already-asked types, already-converged
   categories). Most journeys get exactly one question; strong queries get
   zero.
3. **Questions are cheap to answer** — always 4–6 one-tap chips, never
   free text. Tap-through is the conversion event the dashboard measures.
4. **The rescue is a funnel, not a dead end** — a 0-result search becomes a
   category choice, which becomes a 12-result grid. That is the
   27% → 8% null-result improvement in the study (§5).
5. **Stable under LLM failure** — the LLM phrases, never decides; if the
   proxy is down, the template question is still the right question.

## 5. Evidence (n=150 study, live app)

`eval/results/summary.txt` (deterministic mode, calibrated against the live
app: `eval/calibrate.py` → `eval/run_eval.py`):

- baseline (naive keyword search) null rate: **27.3%**
- guided null rate: **8.0%** (rescued 19.3 pts of journeys)
- resolved within 2 turns: **78.7%** (t1=79, t2=39, t3=20, unresolved=12)

Qwen-phrased mode on the same query set: `eval/results/summary_llm.txt`
(baseline identical by construction; guided null 8.0%, 78.7% by turn 2 —
identical to deterministic; 53 Qwen-phrased + 12 policy no-question +
6 template-fallback; zero behaviour drift: the LLM phrases, never decides).
Large-scale confirmation: 3,000-query simulation, guided null 0.0%,
100% resolved, 98.6% by turn 2 (eval/results/sim_summary.json).

## 6. LLM integration (Qwen only — no Gemini anywhere)

`app/app/api/guide/route.js`:

1. policy decides `{type, options, question, reason}`;
2. if `LLM_API_KEY` is present and mode ≠ `fallback`, Qwen38-27B (LiteLLM
   proxy, `LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL` in `~/askcart/.env`)
   rewrites the question sentence (≤12 words, user's register, options
   verified to be byte-identical);
3. any failure → deterministic template. The response always carries the
   full `decision` (type, reason, rescue flag, top category) for analytics
   and audit.

## 7. Extensions already wired

- **Brand as a filter** is a first-class question (turn ≥ 2) and a card
  attribute (`brand` field, 37.2% of SKUs branded) — brand chips feed the
  search the same way budget/occasion do.
- Adding a new question type = one flow entry + one option generator +
  one eligibility rule. The analytics event schema and dashboard pick it up
  automatically (generic event types).

## 8. The recommendation algorithm (results page)

Once a search (or a refined search) returns results, the page does not show
one flat grid. It shows three layers, computed client-side from the API's
scored result set (up to 48 results, `/api/search` with `limit`):

1. **Recommended for you** — top 3 of the result set by `recommendScore`.
2. **Category groups** — the top 2–3 categories in the remaining set (each
   with ≥2 items), 4 picks per group, so a 12+ result page reads as
   curated shelves, not a wall of cards.
3. **More products** — everything else in the result set.

`recommendScore(item, persona)` (`app/app/page.jsx`) re-ranks the search
score, which already encodes intent matching, budget fit, occasion tags and
brand:

```
base = search score
price fit:     if spend style has a default cap C:
                 += (1 − min(1, |log2(price / (C × bias))| / 4)) × 0.8
                (bias 0.8 / 1.0 / 1.1 / 1.25 by spend style)
brand:         += brand_affinity × (0.6 if branded else 0.15)
                (affinity 0.3 / 0.5 / 1.0 / 0.9 by spend style)
quality:       += rating × 0.1
trust:         += log10(num_ratings + 1) × 0.1
```

Why these levers: the onboarding spend style is the one holistic signal of
purchasing power (budgets vary by product, so we never ask a flat price).
"Best price" shoppers get value picks near their cap; "brand & build"
shoppers get branded, high-trust picks; "premium" shoppers get headroom.
Actions on the top-pick strip emit `recommendation_click` (with
`add_to_cart.from = "recommended"`), so the recommender's CTR is a live
dashboard metric.

Mid-search, shoppers can re-direct without a new query via the filter bar
(`filter_applied` event, `n_before`/`n_after` per change): sort (relevance /
price ↑↓ / top rated), price band, 4★+, brand (multi), category (single).
Filters re-rank/re-slice the fetched result set client-side — instant,
and every apply is logged as a product decision signal.
