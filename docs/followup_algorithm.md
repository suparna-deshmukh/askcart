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

Two cross-cutting rules override/extend the table:

- **Gift flow** — a gift query with *no parsed recipient* runs
  `for_whom → occasion → budget → brand` regardless of category. The
  recipient decides what "a gift" even means (a gift for ammi is a women's
  line; for beta, a kids' line), so it is asked before the occasion. A gift
  query whose recipient is already known (via the relation lexicon, e.g.
  "kurti for ammi") keeps its normal category flow.
- **Universal tail** — every category flow is followed by
  `for_whom → brand → size → capacity`, de-duplicated. So a resolved search
  never dead-ends at "no more questions" while a decisive, data-supported
  facet is still unasked ("headphones" → budget → brand → size;
  "shaadi gift under 2k" → for_whom after the occasion is known). Each tail
  facet is still gated by its eligibility guard below.

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
  contains ≥ 2 brands;
- `occasion`: skipped for non-gift queries that carry a **spec slot**
  ("1.5 ton ac under 45k") — a spec-driven query is a direct-buy call, and
  "which occasion?" is noise on it;
- `for_whom`: needs ≥ 20 candidates and ≥ 15 with a named gender line in
  the title. In the *category flow's own* for-whom (fashion) the named share
  may be as low as 5%; from the *universal tail* it must be ≥ 10%, so a
  near-unisex set (phones) does not get a noisy for-whom question;
- `size`: only if the candidate titles carry ≥ 3 distinct size tokens
  (S/M/L/XL…) and the query did not already state a size;
- `capacity`: only if the candidate titles carry ≥ 3 distinct capacities
  (tonnage / kg / litres) and the query did not already state one.

### 3.4 Rescue vs refinement

- **Rescue mode (nResults < 2)**: a dead-end search must convert. Category
  disambiguation is always eligible and ordered first, with
  gift-adjacent category options for gift queries ("Toys & Games / Handmade /
  Arts & Crafts & Sewing / AMAZON FASHION").
- **Refinement mode (nResults ≥ 2)**: the first eligible type in the
  category's flow, then the universal tail — at most **one** question per
  turn, up to **four** follow-up questions per journey (5-turn budget).
  If nothing is eligible, the policy returns "ask nothing" and the journey
  resolves as-is (minimum-question principle).

  Every search gets a follow-up while the ladder has an eligible facet —
  a resolved result is a *start*, not a destination. After a chip answer
  resolves the search, the UI asks the next ladder question inline (a
  compact strip above the filter bar, never pushing results below the
  fold). The journey stops when any of:

  1. **At the destination** — 3 of the 5 knowable facets
     (budget, occasion, for-whom via recipient hint, size, capacity) are
     stated in the query or already answered;
  2. **The shopper skips** — skipping is a destination decision and ends
     the journey (logged `guide_skipped`);
  3. **The 4-follow-up cap** is hit;
  4. **No eligible facet** remains (data-thin candidate set).

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

### 3.6 Stage logic — what is asked, in what order, and why

The sequence is a function of four things: **stage**, **call type**,
**product type**, and **user context**.

**Stage (where the journey is):**

| Stage | Behaviour | Reasoning |
|---|---|---|
| Dead end (< 2 on-intent results) | category disambiguation first (rescue) | the query is ambiguous or absent from the catalogue; fixing *what* beats refining *which* |
| First answer turn | category-flow head (budget for electronics, occasion for fashion…) | biggest ambiguity of that product family first; budget first when price variance is an order of magnitude, occasion first when the occasion *is* the product |
| Refinement turns | rest of the category flow, then universal tail (for_whom → brand → size → capacity) | each facet removes a measurable slice of the candidate set; brand comes last in the journey because it is a trust proxy, not a requirement (trust_gap mined from reviews) |
| After a resolved answer | next ladder question inline, until the stop conditions in §3.4 | "resolved" means *a* match was found, not *the* match; the shopper is usually one facet away from the actual product |

**Call type:** a spec-slot query ("1.5 ton ac under 45k", "128gb phone
under 20k") is a direct-buy call — occasion and for-whom are skipped, and
the ladder goes straight to brand/size. A relationship-hint query
("saree for ammi") already knows its recipient, so for-whom is skipped. A
vague query ("kuch gift dena hai") runs the gift flow from the top.

**Product type:** the per-family flows in §3.2 (budget-led for electronics
and appliances, occasion-led for fashion, category-led for
use-case-ambiguous families).

**User context:** a Gifting persona (set via `/?onboard=1`) runs the gift
ordering even on non-"gift" queries in fashion/home; a region set in the
personalise strip reorders occasion options by the local festival
calendar (Pongal/Onam/Durga Puja/Bihu by state, Diwali/Dhanteras/Bhai Dooj
in the Oct–Nov window); the chosen language switches all question text and
option labels via static translation tables (no LLM).

**Why this order converts:** every facet is asked only when (a) it is
unknown, (b) the candidate set is actually split on it (facet counts are
computed from the top-N candidates and zero-count options are disabled),
and (c) answering it would eliminate a meaningful fraction of the set.
The question card shows *why* (one-line reason grounded in the mined
root-cause data) and the results page shows the facet counts, so the
shopper can see that answering is worth it.

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

**Guaranteed first question (2026-11-05, "always-ask" requirement):** the
product thesis is that *every resolved search is guided from the first
result* — a search that shows results without a question contradicts the
minimum-question principle's own premise (the questions are there to
remove the mined failure modes). Two rules implement it:

- **P8 (destination stop) applies only after the shopper has answered at
  least one question.** A query that states two facets up front ("shadi
  gift under 2000" = occasion + budget) still gets its first question;
  the stop then fires once a facet is answered (3 settled, or 2 settled
  + ≥1 answered + ≥10 results on screen).
- **`firstQuestionFallback()` ladder** — used ONLY when the A-grade
  eligibility gates above find nothing to ask on the journey's first
  question (prev empty, ≥2 on-intent results). The data still decides
  the ORDER; the floors relax, they do not disappear (all floors mirror
  a measured judge verdict, see the stop-conditions block):
  1. *for_whom* — wearable/gift subject, no stated recipient/self,
     ≥2 named gender lines with ≥3 items each (a 1-line set like
     "saree" Women:8/Men:0/Kids:0 is a one-chip quiz → skipped);
  2. *occasion* — gift/vague, no stated occasion, no stated price
     (a priced gift is already scoped), F2/F9′ floors
     (≥2 options with ≥max(5, 3% of set) items, ≥15% coverage);
  3. *category (subject-free)* — gift/vague query with no product token
     ("बहन की शादी के लिए कुछ", "kuch gift dena hai"): the product
     FAMILY is the unknown; requires a genuinely multi-family set
     (nothing over 50%, second family ≥15%) and no stated price;
  4. *budget* — the main path's budget gates ported verbatim (P3
     ≥4× spread or high-ticket, F10 ≤15×, ≥10% band coverage, never on
     a wearable/gift/spec-anchored/model-anchored set) — a budget
     question is never re-asked after a stated cap;
  5. *size* — ≥2 sizes with ≥max(5, 3% of set) items, apparel-ish
     dominant family, size not already stated;
  6. *brand* — brand-led set only (top brand ≥8%, top-3 ≥25% of the
     set, and the counts actually separate: top − third ≥3 and top
     ≥1.25× third — "identical counts" is a B-grade option list).
  No department-"category" tier (Fashion/Electronics/Cell-Phones
  splits on a single-product subject are not shopper choices — F6/F7;
  all four such moments were B'd). If no tier passes, the honest stop
  stands: a resolved search with no grounded facet asks nothing
  (never a quiz on "cornu", "ipone 15", "soap").

Lexical support for the ladder: `shaadi/shadi/शादी` → wedding occasion
(vocab); Devanagari recipient vocabulary (बहन/भाई/मां/बाप/दीदी/चाची/…);
Devanagari wearables (घड़ी/कमीज़/कुर्ता/साड़ी/ब्लाज़र/टॉप/…) with
lookaround boundaries so `लैपटॉप` is not `टॉप` (the first draft's
substring match turned laptops wearable and cost a judged moment).

**Measured under always-ask (same frozen panel + judge):** 70.1%
[60.4–78.3] A on 97 judged moments, 203 no_question — vs 91.7% A on 48
judged under the question-economy policy. The A-rate drop is the honest
cost of the requirement: every extra question is now exposed to the
judge's "best next question" rubric, and a single LLM judge M's
Hinglish questions whose English twins it A's (documented in
PROJECT.md §5.10). Dead ends ("samovar") still get the honest
not-found, never a quiz.

**Stop conditions (rounds 6–8, UX panel v2, 91.7% A):**

- **Two-facet destination (P8).** When ≥2 of the knowable facets
  (budget / occasion / for_whom / size / capacity) are settled — stated
  in the query or already answered — and ≥10 results are on screen, the
  journey is at its destination: no further question. A third question
  on a resolved, well-specified journey was the top source of
  "redundant" verdicts.
- **Question only on an A-grade data fit** (every eligibility floor
  exists because the frozen judge measured the alternative):
  - *Budget* only when the on-intent price range is genuinely wide
    (p75/p25 ≥ 4×: headphones 1–4k, laptops 25–75k, TVs 20k–1L) or the
    set is high-ticket (p50 ≥ ₹15k); never when the range spans >15×
    (sitar 1.5k–33k — specify type first) or is narrow-mid (microwave
    10–14k, fan, photo frame). On-intent quantiles come from the visible
    top-300, with a bimodal guard falling back to all-visible bands.
  - *Occasion* only on gift/event intent, never when the query names a
    SPECIFIC occasion (diwali/anniversary/birthday/wedding… — "party"
    from "event" is generic and stays askable), and only when ≥2 option
    chips each carry ≥max(5, 3% of the candidate set) AND the tagged
    options cover ≥15% of the set — otherwise the answer cannot narrow
    anything. Pure "gift/kuch" queries without a stated recipient get no
    occasion quiz (no grounded answer in a 2,700-item mega set).
  - *Size* only on fit garments with ≥25 size-bearing candidate items
    and a real spread (≥2 sizes with ≥5 items each, or one size with ≥25
    items covering ≥20% of a ≥300-item set); size shares are computed
    over the visible item pool, not the full result count.
  - *For-whom* never when the query states the recipient (or a
    self-reference); possessive pronouns (uske/unke…) count as gifting
    intent but NOT as a stated recipient — the shopper themselves is
    ambiguous about "uske liye".
  - *Category* in resolved mode only for genuine product-family splits;
    one product filed across electronics departments (charger: All
    Electronics + Cell Phones & Accessories; TV: + Home Audio &
    Theater) is not a shopper choice. Dead-end (rescue) category
  disambiguation is unchanged.

### 3.7 Guaranteed first question (product requirement, 2026-11-05)

The product premise: **every search asks at least one follow-up
question, no matter how good the first match is**, and guided mode is
the only default (the in-page Guided/Plain toggle was removed; plain
survives as a reviewer A/B behind `?mode=plain`).

First-question ladder (turn 1, on-intent results on screen):
1. The A-grade tiers of §3.6 (for-whom → occasion → subject-free
   category → budget → size → brand), all data-floored.
2. **Tier 6 - brand when the budget is ALREADY stated** (priced product
   queries like "budget headphones under 3000", where every A-grade
   tier required `budgetMax === null`). Brand counts are computed over
   **on-intent items that respect the stated budget** - NOT
   `stats.brands`, which spans all scored hits: "5 star ac under 30k"
   matches 2,005 loose hits (token "star"/"ac" contamination) whose top
   brands are Adidas 33 / Nike 31 / Apple 29, while only 5 true-AC
   intent items exist (Voltas/Blue Star/LG/Midea). An all-hits brand
   question would offer the wrong brand world; the AC query now falls
   through to tier 7.
3. **Tier 7 - typed-only "Anything else that would help me narrow it
   down?"** (no chips) - the absolute last resort (e.g. single-brand
   set "boAt headphones under 3000"). The typed answer runs the normal
   refinement search. This guarantees `ask: true` for every resolved
   first turn; dead-ends (ok=false) still go to the category rescue.

Best-match timing (decision, 2026-11-05): **results are shown
immediately** after the search; the question renders as the compact
strip ABOVE the filter bar (G11 placement) and never hides the grid.
Hiding results behind a question would add time-to-value against the
minimum-question principle; the strip + trail chips keep the guided
ladder legible.

Question latency: the LLM phrasing call (policy decides type/options;
LLM only rephrases) runs a **single attempt with a 1500 ms timeout**
(`attempts: 1` in the llm client); on timeout/ failure the
deterministic template is used and the mode is reported honestly in
analytics (`llm` vs `fallback`). Before the fix a slow LLM cost up to
~32 s (45 s default timeout + 4-attempt backoff) before the template
landed.

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
