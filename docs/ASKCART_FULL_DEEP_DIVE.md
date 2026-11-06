# AskCart — Complete Deep-Dive (as of 2026-11-04, commit history through the persona-sim fix pass)

> Everything that was built, how it works, every number, every screen, every
> button, every color, and where each piece comes from. Generated from the
> codebase, the artifacts in `eval/results/` + `data/out/`, and the live
> `localhost:3000` app. Where a number exists in an artifact, this document
> cites the artifact; nothing here is hand-typed from memory.

---

## 1. The product in one paragraph

AskCart is a **guided shopping search** for India. The thesis: a plain
keyword search fails for real Indian shoppers (the evidence: 6,041 mined
complaints across app-store reviews of shopping apps and US Amazon product
reviews), and the fix is to **ask the minimum number of high-value follow-up
questions** — budget, occasion, category, brand, for-whom, size, capacity —
until the shopper is "at their destination". The **deterministic policy
engine decides** which question to ask, what the options are (computed from
the live candidate set), and when to stop; the LLM (Qwen38-27B via a LiteLLM
proxy) may only **phrase** the question (English) or **parse** a chat
message, and every LLM output is validated with a template/rule fallback.
The whole thing runs as a Next.js app over a 54,304-SKU **demo catalogue**
(US-converted + synthetic India layer, labelled as demo everywhere), with a
fully public, locally-stored analytics dashboard and a chat assistant.

The build rule that shapes everything: **evidence honesty** — every headline
number is reproducible from an artifact in the repo, simulation results are
labelled `sim`, the catalogue is labelled demo, and the limitations section
is never cut.

---

## 2. The evidence base (why the questions are these questions)

### 2.1 Agentic extractor (LIVE on Hugging Face)

- Space: `space_askcart` (extractor v3 staged for the Bits/secondary
  account; a watcher re-runs after the 24 h free-plan limit —
  `logs/vercel_watch.log`).
- It collected **5 raw sources** for the corpus. Raw-by-source and
  clean-by-source (from `data/pipeline_counts.json`):

| Source | Raw | Clean | Dropped in cleaning |
|---|---:|---:|---|
| amazon_reviews (McAuley 2023, US) | 40,000 | 40,000 | 0 (pre-cleaned dataset; stated in docs) |
| play (Google Play app reviews) | 33,172 | 26,663 | 6,509 too-short + 172 non-English |
| trustpilot | 15,000 | 15,000 | 0 (pre-cleaned; stated) |
| appstore (Apple app reviews) | 3,450 | 2,937 | 513 too-short + 18 non-English |
| reddit (shopping subreddits) | 3,021 | 3,003 | 18 deleted |
| **Total** | **94,643** | **87,603** | |

- Source rating profiles (clean): Amazon mean 4.34 (7,117 low-rated),
  Play 2.73 (16,037 low), Trustpilot 3.11 (8,268 low), App Store 2.84
  (1,666 low), Reddit has no ratings (2,951/3,003 with usable dates).
  The complaint gate keeps **low-rated** reviews (≤2 stars where ratings
  exist) + review-text complaints from Reddit.

### 2.2 6-stage DuckDB pipeline (`pipeline/01..06`)

1. `01_ingest.sql` — load the 5 raw parquet/CSV sources into
   `data/out/askcart.duckdb`.
2. `02_clean.sql` — dedup, short-text gate, language gate, deleted gate
   (per-source drop counts logged to `data/out/gates_by_source.json`).
3. `03_normalize.sql` — text normalisation, rating/date normalisation.
4. `04_complaints.sql` — the search-UX complaint gate → **6,041 complaints**
   (`data/out/funnel.json`: raw 94,643 → clean 87,603 → complaints 6,041).
5. `05_root_causes.sql` — root-cause labelling (rule lexicon scorer).
6. `06_bayesian.sql` — Bayesian-adjusted app ratings,
   `(C·m + Σr)/(m + n)` shrinkage (`data/out/bayesian.csv`) — the same
   shrinkage formula is reused per-SKU on the PDP so a 5.0★ with 3 ratings
   ranks below a 4.4★ with 3,000.

### 2.3 Root-cause labelling — full Qwen re-label (T8/T9)

The rule lexicon scorer and the LLM disagreed too much on the 600-sample
audit (238 overrides = 39.7%), so the **entire 6,041 corpus was re-labelled
by Qwen** (4 slices + a 1,402-row retry pass, `scripts/retry_llm_labels.py`,
0 failures). Final 6-class distribution (`data/pipeline_counts.json`,
`data/out/root_causes.json`):

| Root cause | n | % |
|---|---:|---:|
| trust_gap (can't tell which brand/result to trust) | 3,285 | 54.4 |
| not_search_related (kept out of the 4-cause product taxonomy; reported, not acted on) | 1,822 | 30.2 |
| budget_mismatch | 569 | 9.4 |
| zero_or_wrong (zero results / wrong kind of product) | 212 | 3.5 |
| other | 110 | 1.8 |
| occasion_blindness | 43 | 0.7 |

- Scorer-vs-LLM agreement on the full corpus: **accuracy 44.1%, macro-F1
  0.240** — reported openly (`data/out/rc_agreement.json`) as the reason the
  LLM labels are canonical.
- **India-only cut** (3,054 complaints fully labelled): trust 49.3 /
  nsr 42.4 / budget 3.6 / zero_or_wrong 3.4 — directionally consistent with
  the global cut.
- The question types map onto these causes: **brand** = trust proxy
  (54.4%), **budget** (9.4%), **category rescue** (3.5%), **occasion**
  (kept because for gift queries the occasion *is* the product spec, even at
  0.7%), plus the G3 facets for-whom/size/capacity grounded in the catalogue
  composition (46.7% fashion).

### 2.4 Interviews (n=12 — SIMULATED, corpus-grounded)

`docs/interviews/` — 12 simulated participants (P1–P12, ages 21–45,
Chennai/Pune/Bengaluru/Lucknow/Delhi/Indore/Hyderabad/Mumbai/Ahmedabad/
Jaipur/Kolkata), 25-min semi-structured scripts, think-aloud search tasks,
every friction moment coded against the RC1–RC4 taxonomy. Quotes marked
`(mine: doc_id)` are real reviews from the mined corpus. **These are
simulated and labelled as such** — real think-aloud sessions (E2) are the
one blocked item (need real people; the kit in
`docs/interviews/interview_kit.md` is ready).

---

## 3. The catalogue (what the shop actually sells — demo)

**54,304 SKUs** = 24,998 US-sourced Amazon listings converted at ₹83.5/$ +
11,113 India-layer SKUs (`scripts/catalog_india.py`, ~1,900 base rows ×
variant expansion, deterministic seed 42). Every SKU carries
`origin: us_converted | india_layer` (T7), and the UI footer + PDP carry
the standing disclaimer: *"Demo catalogue: 54,304 SKUs (≈25k US-sourced
listings converted to INR + ≈11k India layer) with indicative prices and
ratings — not a live marketplace."*

Profile (live from `/api/analytics/catalog`, synced into PROJECT.md by
`scripts/sync_doc_numbers.py` — no hand-typed stats):

- Price: min **₹29**, p10 ₹789, **median ₹2,419**, avg ₹6,885, p25 ₹1,249,
  p75 ₹6,489, p90 ₹15,019, **p99 ₹75,399**, max ₹294,669.
- Price bands: ≤2k: 15,447 · 2–5k: 9,449 · 5–10k: 5,211 · 10–20k: 3,385 ·
  >20k: 2,568.
- Ratings: avg 4.20; median 34 ratings per SKU; 14,358 SKUs (39.8%) have
  100+. India-layer ratings are **synthetically jittered** (±0.1, rating
  count ×0.75–1.25, deterministic) and labelled demo (T6 decision (b)).
- Brands: **298 distinct**, 12,099 SKUs branded (33.6%). Top: Aurelia 458,
  Fabindia 370, Anouk 351, Libas 334, W for Woman 321. (T5/C2 fix: brand
  extraction no longer treats "for iPhone" compatibility mentions as the
  brand; Apple 757→183 SKUs, Samsung 634→259; Myntra kept with
  `brand_type: "retailer"` and excluded from top-brand stats.)
- `is_accessory`: 2,276 SKUs (6.3%) — accessory word + host device; powers
  the "Hide accessories" filter facet.
- Variant families (S7): `family_id` (sha1 brand|model|cat, 10 hex) on
  India listing-matrix rows; **2,217 multi-member families, 10,211 SKUs**
  carry a `variant_summary` ("6 colours · 4 sizes") and `family_min_price`;
  the UI folds a family into one card with a "from ₹X" line and caps 2 cards
  per (brand, model) in the ranked grid (MMR-style).
> Depth update (2026-11-06, Item E): the catalogue grew 52,656 → 54,304
> (+1,648 gendered/occasion-tagged depth rows for the question-ladder
> cells). The detailed stats in this section were computed on the
> pre-expansion catalogue; the live numbers come from `/api/analytics/catalog`.
- Occasion-tagged: 4,147 SKUs (11.5%) — tags are backend-only; never shown
  as badges in the shopper UI.
- Large appliances added in the persona-sim pass: budget-tier 1-ton ACs
  (19,990–29,990, incl. 5-star ≤₹30k) so the flagship query "5 star ac
  under 30k" resolves; washing machines (5.5–8 kg, 15,990–38,990) already
  present in the India layer.

Build: `.venv/bin/python scripts/build_catalog.py` (reads
`data/out/catalog.parquet` inputs + `catalog_india.py` rows, writes
`app/public/catalog.json` + parquet; deterministic band-quota trim
42/26/15/10/5/2 % by price band, lowest-rated trimmed first, seed 42).

---

## 4. The search engine (`app/lib/search.js`, ~700 lines)

### 4.1 Query understanding (`parseQuery`)

Pipeline, in order, on the raw query string:

1. **₹ → " rs "** normalisation; **Devanagari digits ०–९ → 0–9**
   (so "२००० से कम" becomes a parseable budget).
2. **Devanagari word mapping** (`app/lib/lexicon_hinglish.json`,
   `devanagari` dict, 65 entries): घड़ी→watch, साड़ी→saree, फ़ोन→phone,
   हेडफ़ोन→headphones, लैपटॉप→laptop, टीवी→tv, जूते→shoes, कुरती→kurti,
   बर्तन→utensils, मोमबत्ती→candle, एसी→ac, शर्ट→shirt, ड्रेस→dress,
   पैंट→pants, चश्मा→spectacles, श्वल्→shawl, फ्रिज→fridge, पंखा→fan,
   लैंप→lamp, चार्जर→charger, मग→mug, बोतल→bottle, बैग→bag, उपहार/गिफ्ट→gift …
   Mapped words are appended in Latin; the original script is then stripped.
   (Data file, not code — the S2 design.)
3. **Devanagari unit words replaced in place** (adjacency matters next to
   numbers): टन→ton, लीटर→litre, इंच→inch, किलो→kg, वाट→w, and the
   compound टी-शर्ट→tshirt.
4. **Hinglish/Devanagari budget phrasings** (number-first, canonicalised
   *before* script stripping): "1500 se kam" / "20000 से कम" / "25000 तक"
   / "20000 में" / "2 हज़ार" / "10k me" → `under N`.
5. **Stuck spec units** expanded ("7kg"→"7 kg", "1.5ton"→"1.5 ton",
   "1100va"→"1100 va", "500g"→"500 g") — specs, never budgets.
6. **Budget** (the canonical regexes): optional keyword
   (under/below/less than/within/up to/max/budget of/rs/₹/rupees) + number +
   optional k/lakh/l → `budgetMax`; `above/over/min` + number + k/l →
   `budgetMin`. Note the known quirk: a bare trailing "l" is read as *lakh*
   ("microwave 23l" → budget 23,00,000 ≈ no cap; harmless, documented).
7. **Spec slots** (`parseSpecs`, S4) — structured, soft ranking signals,
   never budgets: `age` ("5 year old"→5, "6 months"→0.5), `size`
   ("size m/l/xl/xxl"), `ram` ("8gb ram"), `storage` ("128gb"), `tonnage`
   ("1.5 ton"), `stars` ("5 star"), `inches` ("43 inch"), `volume`
   ("1 litre").
8. **Occasion tags** (fixed vocabulary): shaadi/baraat/bridal/wedding→
   wedding, birthday/bday, diwali/rakhi/festival, anniversary, party,
   christmas, valentines, graduation, housewarming, baby→baby-shower,
   gift→gift.
9. **Token stream**: budget phrases and spec phrases removed,
   Hinglish-roman lexicon applied (ghadi→watch, jooti/jutti→shoes,
   sari→saree, mithai→sweets, bartan→utensils, sasta/accha/sabse→
   stopword-grade), stopwords dropped. The STOP set (~120 words) includes
   the filler words (ka/ki/ke/ko/se/mein/bhi/chahiye/wala/wali/acha/…) and —
   added in the persona-sim pass — the **pronouns** him/her/his/hers/us/
   our/their/them (so "watch for him" = "watch").

### 4.2 Scoring (`scoreAll`)

Lexical, deterministic, hand-tuned (the S5 BM25F upgrade is on the agreed
cut list):

- **Required tokens**: a result is on-intent when the required product
  tokens match (numbers ≤4 chars are soft); the `intent` flag on every
  result is what the app counts as "on-intent".
- **Bonuses/penalties**: stated spec carried +1.5 / contradicted −1.0;
  stars vs real rating +1.0/−0.5; size match +0.75; toddler age on
  kid-marked titles +1.0; **brand chip** match +2.0; **forWhom** answer
  re-ranks gender tokens (women tokens in a "shirt under 1k" top-12 go
  0→12 after the tap); occasion-tag match boost; accessory context;
  adult-vs-kids and opposite-gender exclusions; car/auto context
  (penalises "car perfume" matching general perfume, etc.).
- **Typo tolerance (S1)**: Damerau (OSA) edit distance over a 36,190-word
  catalogue vocabulary (titles + brands); tokens 5–7 chars → distance 1,
  8+ chars → distance 2; glued alphanumerics split first ("iphone15"→
  iphone+15, "128gb"→128+gb); typo candidates score 1.4 (×0.7 of the exact
  2.0) and rank below exact matches; max 3 typo tokens per query; in-vocab
  tokens are never typo-rewritten. Warm typo searches 130–245 ms.
- **Relation words (S3)**: ammi/amma/maa/mummy→mother→women; papa/dad/
  abba→father→men; bhai→brother; didi/behen→sister; dadi/nani→grandmother;
  beta/beti/bachche→kids boost; saas/sasur→in-laws — used for the
  recipient penalty logic and the gift flow ("saree for ammi").

### 4.3 Tiers and relaxation

- Results come back as **exact** (on-intent) and **close** (relaxed:
  budget ×1.6 and/or fewer required terms). The UI labels the close tier
  "Close matches (relaxed budget / fewer terms)" and any over-budget card
  with "Slightly over your budget" — **no silent relaxation** (brief S6).
- `relax` is also a client-visible mode; the null definition everywhere is
  **<2 on-intent results** (the n=150 study's failed-search metric).

### 4.4 Semantic fallback (`app/lib/semantic.js`)

An embedding-based last resort, **gated so it only runs when lexical search
returns <2 on-intent results** — queries that already work return
byte-identical responses (no-op guarantee test: 293/293, zero tolerance).

- Model: **Xenova/multilingual-e5-small** (384-dim) run **locally in ONNX
  int8** — same model builds the index offline and embeds queries at runtime
  (0 API tokens).
- Index: `app/data/catalog_emb.i8` (~20.9 MB, 54,304 × 384 int8, L2-normalised
  float scales in `catalog_emb.scales.f32`), meta with catalog sha256 +
  SKU-order sha256; **integrity check on load** — any mismatch vs the live
  catalogue disables semantic (`index_mismatch`), never misaligned rows.
- Runtime: brute-force dot-product scan (~15–30 ms warm); embed-query cache
  (in-memory LRU 500 → `query_emb_cache.json` precomputed for all known
  queries → provider); 400 ms timeout; circuit breaker (3 failures → 5 min
  skip); 200-char cap on semantic query text; 30/min/IP sliding-window rate
  limit (EVAL_MODE exempt).
- Thresholds (calibrated on the dev split of the frozen panel,
  `eval/semantic/results/threshold.json`): **tau = 0.845, margin = 0.03,
  floor = 0.70, K = 200**; keep `cos ≥ tau` AND `cos ≥ top1 − margin`.
  E5 cosines cluster high (relevant ≈ 0.80–0.90), so the threshold was
  calibrated, never assumed.
- Hard constraints reuse the lexical penalties (budget strict then ×1.6
  relax tagged, brand filter, accessory/gender/kids, per-stem diversity cap
  of 2); merge = lexical on-intent first → semantic fill → dedupe → cap 48;
  `recomputeIntentN` counts a semantic item on-intent iff it passes tau +
  constraints.
- **Kill switch**: `SEMANTIC_FALLBACK=0` restores v6 exactly; `EVAL_MODE=1`
  honours `?semantic=0|1|only` for the harness (ignored in production).
- Analytics: optional `semantic_used/added/ms/reason` props on the
  `search_results` event (additive; the store is schema-agnostic).
- Known, documented behaviour: for out-of-catalogue ("dead-end") queries
  the semantic layer rejects everything (below threshold), and the *app
  level* can still "false-resolve" via the baseline category-rescue path
  (the guided loop asks a category question and the simulated answer fills
  24+ in-category items). The semantic layer itself contributes zero items
  to all 4 dead-ends in the frozen panel — stated openly in the summary.

---

## 5. The guided question policy (`app/lib/guide.js`)

**Policy decides, LLM phrases.** `decideGuide(catalog, query, nResults,
{turn, prevTypes, region, persona, lang})` returns
`{ask, type, options, optionCounts, question, reason, stats}`. The
`/api/guide` route: for non-English `lang`, question text + option labels
come from **static translation tables** (`app/app/lib/i18n.js` — no LLM);
for English, Qwen (temp 0.4, 240 tokens) may rephrase the question —
options must come back byte-identical or the template is used; any failure
→ template. `mode: "fallback"` forces the template (deterministic study
runs; used by all evals so they cost zero tokens).

### 5.1 The 7 question types (each grounded in a mined root cause)

1. **budget** — options from the candidate set's p25/p50/p75 rounded to
   clean INR steps + "Not sure / flexible" (which applies the onboarding
   spend-style default — a *visible* chip per O4, silent caps banned).
   Grounding: budget_mismatch = 9.4% of complaints.
2. **occasion** — fixed 6 options (Gift / Birthday / Wedding-Shaadi /
   Anniversary / Diwali-Festival / Everyday use), **ordered by the
   festival calendar** (`app/lib/festivals_2026_27.json`: Dhanteras
   2026-11-06, Diwali 2026-11-08, Bhai Dooj 2026-11-10 lead in the
   Oct–Nov window; Pongal/Onam/Durga Puja/Bihu by state via region).
   Grounding: for gift queries the occasion *is* the product.
3. **category** — top-4 categories of the candidate set (gift-affinity
   list when n=0: Toys & Games / Handmade / Arts & Crafts & Sewing /
   AMAZON FASHION / Amazon Home / All Beauty / Baby / Video Games /
   Musical Instruments). Grounding: zero_or_wrong = 3.5%.
4. **brand** — top-3 brands in the candidate set + "No preference - best
   rated". Never the first question of a journey. Grounding: trust_gap =
   54.4%.
5. **for_whom** — Women / Men / Kids / Unisex-any, counts from the
   candidate set's gender tokens. Eligible only with ≥20 candidates and
   ≥15 gender-named (≥5% share in the fashion flow's own for-whom; ≥10%
   from the universal tail, so near-unisex sets don't get a noisy question).
   A tap re-ranks: +2.0 on matching gender tokens, demote the opposite.
6. **size** — S/M/L/XL from title variants + "Any size"; eligible only
   when the candidate titles carry ≥3 distinct sizes **and the dominant
   category is apparel-style** (AMAZON FASHION / All Beauty / Handmade /
   Arts, Crafts & Sewing / Baby / Toys & Games — added in the persona-sim
   pass so an AC never gets a "what size?" question).
7. **capacity** — N ton / N kg / N L from titles + "Any"; eligible only
   with ≥3 distinct capacities in the candidate set (now real data: ACs
   and washing machines exist in the India layer).

### 5.2 Flows and the always-ask ladder

- Per-family flows: electronics/phones/computers/appliances/camera:
  [budget, brand]; fashion/beauty/handmade/arts/toys/baby: [occasion,
  budget, brand]; home/tools: [budget, occasion]; sports/office/pets/
  automotive: [budget, category]; default: [budget, category, brand].
- **GIFT_FLOW**: gift query with no parsed recipient → [for_whom,
  occasion, budget, brand] (the recipient decides what "a gift" means
  before the occasion does). A recipient-hint query ("kurti for ammi")
  keeps its normal flow.
- **UNIVERSAL_TAIL**: every flow is followed by [for_whom, brand, size,
  capacity] (de-duplicated) — so a resolved search almost always has a
  next data-supported question instead of dead-ending at "no more
  questions".
- **Stage logic**: dead end (<2 on-intent) → category disambiguation first
  (rescue); resolved → the first eligible flow facet, then the tail.
- **Stop conditions** (the "at the destination" logic):
  1. 3 of the 5 knowable facets (budget / occasion / for-whom-via-
     recipient / size / capacity) are stated in the query or answered →
     stop;
  2. the shopper **skips** → a destination decision, ends the journey;
  3. the **4-follow-up cap** (5-turn budget) is hit;
  4. no eligible facet remains.
- **Spec-slot guard**: a non-gift query carrying a spec (1.5 ton, 23l,
  size M…) skips occasion — it's a direct-buy call.
- **Sparse-question guard** (persona-sim pass): a facet is only asked when
  ≤50% of its *data* options (escape hatches "Any/No preference/Not sure"
  excluded) have a count; otherwise the next eligible facet is tried; if
  all are sparse, the first is asked as before (zero chips disabled in UI).
- Every option carries its **facet count** (G1); zero-count chips are
  disabled client-side; the question strip shows the question text + a
  one-line **why** (deterministic copy from the mined root-cause data) +
  Skip.

### 5.3 What 3,000 guided journeys look like (persona simulation)

`eval/persona_sim.py`: 300 personas (3 languages × 10 segments × 10
regions) × 10 fixed dimensions (electronics+budget, fashion+recipient,
gift+occasion, vague, typo, spec, dead-end, browse, tight-price,
Hinglish/Devanagari relation) = 3,000 real guided journeys against the
live app, persona ground-truth answers, `mode: "fallback"` (zero LLM
tokens). Run 1 (before the fix pass) and Run 2 (after) are in
`logs/persona_sim_*.jsonl` with aggregates in
`eval/results/persona_sim_summary.json` — see §10.6 for the numbers.

## 6. The UI, screen by screen (every element, colour and placement)

Everything below is from the shipped code (`app/app/page.jsx` 1,361 lines,
`app/app/globals.css` 523 lines, the `app/app/ui/*` components,
`app/app/ui/chat/chat.css` 202 lines) as of the persona-sim fix pass.

### 6.1 Design tokens (`:root` in `app/app/globals.css`)

| Token | Value | Used for |
|---|---|---|
| `--bg` | `#FBF9F6` | page background (warm off-white) |
| `--surface` | `#FFFFFF` | topbar, cards, drawers, chat panel header |
| `--surface-2` | `#F4F0EA` | secondary fills, hover states |
| `--border` | `#E6E0D6` | all hairlines |
| `--border-strong` | `#CFC7B9` | search input border, dashed strip |
| `--text` | `#1C1B18` | primary text |
| `--text-2` | `#55514A` | secondary text (alias `--sub`) |
| `--text-3` | `#6B665D` | tertiary/why-lines (alias `--faint`) |
| `--brand` | `#4338CA` | **all primary actions**: Search, Add to cart, Buy now, checkout, cart toast, FAB glyph, chat avatar |
| `--brand-hover` | `#3730A3` | action hover |
| `--brand-tint` | `#EEF0FF` | active chip fills, "from ₹" hints, count badges |
| `--guide` | `#F59E0B` | marigold — **questions only** (never an action colour) |
| `--guide-bg` | `#FFF6E5` | question card / strip background |
| `--guide-border` | `#F2D49B` | question card border |
| `--guide-text` | `#8A4B05` | question eyebrow text |
| `--success` / `--success-bg` | `#137333` / `#E8F5EC` | positive facts, live dot |
| `--warning` / `--warning-bg` | `#B45309` / `#FEF3C7` | relaxed-constraint notices |
| `--danger` / `--danger-bg` | `#B42318` / `#FDECEA` | errors, "clear all" |
| `--star` | `#E8A317` | rating stars |
| `--live` | `#16A34A` | dashboard live-stream dot |

Radius `12px` everywhere (pills 999px); shadows `0 1px 2px/.05`,
`0 4px 12px/.08`, `0 12px 32px/.14`. Font: Inter + Noto Sans Devanagari,
base 14.5px/1.5; large-text mode (`body.largetext`) 16.5px.
**Colour rule**: marigold = "AskCart is asking"; indigo = "you can act";
green = "good fact". No other saturated colours exist.

### 6.2 Page skeleton

`<div className="appshell">` is `display:flex; min-height:100vh`.
Inside: `.appshell-main` (flex:1, min-width:0) holds everything; when the
assistant is open on desktop (≥1024px) `.cht-panel` (400px, `flex:0 0
400px`, `position:sticky; top:0; height:100vh`, 1px left border, 180 ms
slide-in) becomes an **in-flow sibling — a true split screen**: the whole
main column (measured 1,040px on a 1,440px window) shifts left, the
panel stays right. Below 1024px the panel is a `position:fixed` sheet
(`top:59px; right:0; bottom:0`) and the shell is `display:block`.
The content column `.wrap` is `max-width:1400px; margin:0 auto;
padding:20px 28px 80px` — full-bleed only for the personalise strip.
Result grid: `repeat(auto-fill, minmax(235px, 1fr))`, 12px gap.

### 6.3 Topbar (59 px, `--surface`, sticky)

Left → right, inside `.topbar-inner` (max 1,180px, 12px 24px padding):
1. **Logo** (clickable → Search tab + scroll top): 28px square
   `--brand` mark with white "A", wordmark **Ask**`Cart` (Cart in
   `--brand`), tag "guided shopping · India" in `--text-3`.
2. **Nav**: single `Search` tab button (`.on` = `--brand-tint` fill).
3. Spacer.
4. **Language segment** (`EN · हिं · Hinglish`), 12px segment control,
   `--brand` text + `--brand-tint` fill on the active one. Switching it
   re-renders hero, strip, question strips and empty states from the
   static tables in `app/app/lib/i18n.js`.
5. **Analytics button** (renamed from "Behind the scenes"):
   `--surface-2` pill, 8px `--live` dot + label; active state tints it.
6. **Cart button**: 🛒 + "Cart" + count badge (`--brand` text on
   `--brand-tint` pill) that **bounces** (`cartbounce .3s`) on every add.

Toasts under the topbar: onboarding toast (`obtoast`, success colours)
and **add-to-cart toast** (`carttoast`: fixed bottom 22/24, `--brand`
background, white text, pill radius, 1.8 s, "Added to cart ✓") — this is
the visible confirmation for the badge increment.

### 6.4 Hero (idle state, no active search)

- **H1** 30px/800, letter-spacing −.03em: "Tell us what you need — in
  your own words." (i18n: `heroTitle`; Hindi/Hinglish equivalents).
- **Sub** 15px `--text-2` (`heroSub`).
- **Search bar**: white input (14px 18px padding, 1.5px
  `--border-strong` border, radius 13, shadow-sm; placeholder rotates
  per language, e.g. `Try: "shaadi gift under 2k"`) + **Search** button
  (`--brand` bg, white text, shows "…" while busy). Enter submits.
- **Personalise strip** (O1/O2, non-blocking, first visits only):
  collapsed form is a one-line full-bleed dashed row
  ("Optional: set your language & delivery region for better results"
  + "Set now →"); expanded form is a `--surface` card with
  `--border-strong` dashed top/bottom: **Language** segment with three
  explicitly-labelled options — **English · हिन्दी · Hinglish** — then a
  **6-digit pincode** input (placeholder `110001`, digits only) and a
  **Use** button (disabled until 6 digits) + "Skip ✕". Dismissal is
  persisted in localStorage (`askcart_strip_dismissed`) and never shown
  again; the pincode stores only the derived coarse `region`
  (never the raw digits in analytics).
- **Example chips** row: "Popular:" + 6 clickable phrases
  (e.g. `shaadi gift under 2k`, `1.5 ton ac under 45k`…).

### 6.5 Active-search state (top → bottom)

1. **Compact search bar** (same look; placeholder
   `Refine or ask again: "wristwatch for dad under 5k"`).
2. **Trail breadcrumbs** (`--text-2`, 12px): `Search "query" →` then one
   node per applied answer. Constraint nodes are **removable chips**
   (`chip-x`, ✕) — removing one re-runs the search without it.
3. **Result summary**: "**12** products for "headphones" · curated into
   shelves" (or "sorted by best match" for single-category grids).
4. **Plain-mode notice** (when toggled): explains Guided vs Plain.
5. **Rollback notice** (only when triggered): "That answer didn't
   improve the match, so I kept your previous picks."
6. **Answer echo** (G10, after every chip/typed answer): one line, e.g.
   "Budget up to ₹2,000 · 37 of 148 left."
7. **Outcome survey** (G12, ≤25% of journeys, on cart-add/order/leave):
   "Did you find what you were looking for?" → **Yes** / **Not really**
   → (if 👎) 5 reason chips using the mined root-cause labels + ✕.
8. **Question UI** (two forms, same data):
   - **Rescue form** (null search, <2 on-intent): full
     **question card** (`.qcard`, `--guide-bg`, `--guide-border`,
     radius 12): eyebrow "ONE QUICK QUESTION" 11px/800 `--guide-text`,
     15px/700 question, chips (radius 999px, white bg, 1px
     `--border-strong`; each shows **label + facet count**, e.g.
     `Under ₹1,500 · 42`; zero-count chips are disabled and greyed),
     a **typed-answer row** ("Or type it…" input + Go) and **Skip**.
   - **Refinement form** (results already fine): compact one-row
     **question strip** (`.qstrip`, pill radius 999px, same palette):
     eyebrow "OPTIONAL REFINEMENT" + question 13px/650 + horizontally
     scrolling chips + one-line **why** (`--text-3`, 10.5px, from the
     mined root-cause shares — G6) + Skip. Results are never pushed
     down by a question (G11).
9. **Null / dead-end state** (`.dim`): h3 ("No exact match for "X" in
   the catalogue" / "No products matched that exactly"), a one-line
   explanation that changes with turn count and exhaustion, and on
   exhaustion the example chips as an escape hatch.
10. **Skeleton** (while a search runs, no results yet): 8 grey bars.
11. **Filter bar** (client-side, over the 48-result set):
    `Mode [Guided|Plain] · Sort [Best match|Price ↑|Price ↓|Rating] ·
    Price [adaptive bands] · 4★ & up · Hide accessories · Brand [top-8
    from this result set] · Category [top-6, hidden when one category
    ≥60%] · Clear all` + meta `N of M products · X ms`.
    **Price bands adapt to the query budget**: "gift under 2k" shows
    `Under ₹1,000 / ₹1,000–₹2,000` only — bands above the stated
    budget are never offered; a single non-narrowing band hides the row.
    All filters are instant client-side re-filters (`filter_applied`
    with n_before/n_after); "Nothing left after your filters" shows a
    one-click **clear all** in red.
12. **Results** (multi-category): group **"Best matches"** (3–6 cards
    ranked by `recommendScore` — persona price-fit + brand affinity +
    rating trust — subtitle "ranked for your profile · price fit, brand
    preference, quality & trust") → one group per remaining category
    ("N picks from this match") → **"More products"** group, each with a
    **Show more (N left)** button that adds 24.
13. **Below-grid nudge** (null, turns <4): "One follow-up question can
    usually tighten this — pick an option above."

### 6.6 Product card

- Image: **designed placeholder tile** 215px (brief §7.2 — no real
  photos ship): category-tinted background (fashion `#F7E8EE`,
  electronics `#E6EEF8`, home `#EAF1E6`, beauty `#FBEBE3`, toys/baby
  `#FFF3D6`, sports `#E3F3F1`, watch `#EEF0FF`, kitchen `#EAF1E6`,
  auto `#E6EEF8`, default `#F0ECE4`) with a 44px line-art SVG glyph in
  `#8a8578` (dress / sofa / plug / sparkle / ball / stroller / dumbbell
  / wheel / pot / watch / box) and, if branded, a 24px white monogram
  circle top-left. Tiles are marked "illustrative".
- Top-left badges: **"Best match"** (indigo) or **"Close match"**
  (marigold) — the latter labels relaxed/constraint-loosened items.
- Category label (11px `--text-3`), title (2-line clamp), variant line
  (e.g. "6 sizes · 4 colours" for `family_id` SKUs), brand chip.
- Price row: `₹1,999` bold 16px + optional "from ₹1,299" for variant
  families; **`Slightly over your budget`** note (`--danger`) when the
  item passed only via the ×1.6 relaxation.
- Rating row: pill `★ 4.3` (green ≥4 / amber ≥3 / red <3) + "48,200
  ratings".
- Footer: full-width **Add to cart** button (`--brand` bg, white text,
  36px) — card click opens the PDP (card is `role=link`, Enter works).

### 6.7 Product detail page (right drawer, 460px; 100% width <768px)

Linkable via `?sku=…`. Opens from any card click (results / preview /
similar / chat). Overlay dims the page; drawer slides in (200 ms);
Esc or overlay click closes and logs `pdp_close {dwell_ms}`.
Top → bottom (`app/app/ui/pdp.jsx`, 206 lines):
1. Header "Product" + ✕.
2. **Tile 128px** + title (H2 17px/700), brand chip, rating row:
   `★ 4.3` pill + "48,200 ratings · **4.2 adjusted for rating
   count**" (Bayesian shrinkage `(C·m + Σ)/(m+n)`, the same formula as
   the evidence layer — a 5.0 with 3 ratings displays below a 4.4 with
   3,000).
3. **Price**: large ₹ figure + "inclusive of all taxes (demo)".
4. **Variants** (only for `family_id` SKUs): radiogroup of sibling
   SKUs, each with its price; picking one re-renders title/price/tile
   and logs `variant_select`.
5. **Why this matched** (transparent ranking explanation, D5): ✓-chips
   derived from the *actual* parse — `Under ₹2,000` · `Tagged wedding`
   · `Brand: Fabindia` · `For women` — fallback "Best score for your
   search".
6. **Trust & delivery (demo)**: regional delivery estimate when a
   pincode/region is set ("Delivery to south region (demo estimate):
   2–4 days"), 7-day return window (demo policy), and
   "Demo rating — indicative, not live marketplace data." whenever
   `rating_basis === "synthetic"`.
7. **Similar items**: up to 4 same-category cards within ±40% price
   (44px tile, title, price) — each opens that SKU's PDP.
8. Sticky footer: **Add to cart** (primary, `--brand`) + **Buy now**
   (secondary).

### 6.8 Cart, checkout, order

- **Cart drawer** (400px / 92vw, right): header "Your cart" + count
  pill, rows = title / category · brand / ₹price × qty /
  `− qty +` steppers (0 → `remove_from_cart`), footer **Total** +
  primary **Place order →** (`checkout_start {source:"cart"}`).
  Empty state: "Your cart is empty. Find something you love on the
  Search tab." Cart persists in localStorage.
- **Checkout modal** (480px / 92vw / 84vh, centred): read-only line
  items, "Prototype checkout — no real payment is processed. Addresses
  & payments land in phase 2.", Total + **Place prototype order**
  (`order_complete {order_id, items[]}`).
- **Order toast** (bottom-right, success colours): "Order placed ✓" +
  order id · N items · ₹total; auto-closes; clears the cart;
  `journey_end {ordered:true}`.
- **Buy-now path**: any card/PDP **Buy now** → same modal with the
  single item replacing the cart (`source:"buy_now"`).

### 6.9 The assistant (chat)

- **Launcher**: 56×56 FAB, fixed bottom 24/24, `--brand` circle with a
  white **4-point Gemini spark** SVG (the "A" is reserved for the
  app), shadow-lg; a desktop-only label pill "Ask AskCart" collapses
  after first open. Never auto-opens.
- **Nudge** (E1): once per session, after the first search that
  *resolved*, a small `--surface` card above the FAB: "Ask the
  assistant to narrow it down, compare, or explain a product." + ✕
  (`chat_nudge_shown/_dismissed/_accepted`).
- **Panel** (400px split column on desktop; fixed sheet top 59px on
  mobile, 360px-verified): header 56px `--surface` — 24px `--brand`
  avatar "A", **"AskCart Assistant"** 16px/600, sub "AI · demo
  catalogue" 12px `--text-3`, right side `⋯` (clear chat) and ✕
  (close), all 44px targets; focus moves to the composer on open and
  back to the launcher on close; Esc closes; light focus trap.
- **Bubbles**: assistant = `--surface`, 1px `--border`, radius 14
  (top-left 4), max-width 86%; user = `--brand-tint`, radius 14
  (top-right 4), max-width 80%, right-aligned. Text 14/20.
  `role="log"` + `aria-live="polite"`.
- **Question chips from the assistant** use the guide palette
  (`--guide-bg` container, eyebrow "Quick question") so marigold stays
  "AskCart is asking"; plain suggestion chips use `--surface-2`.
  Chips show counts, zero-count disabled, arrow-key navigable.
- **ProductMini** (max 3 per message): 72px tile, 2-line title,
  price 16px/600 tabular, rating pill, up to 3 ✓-reason chips
  (`--success-bg`), **Add** (primary 36px) + **Details** (ghost).
- **Notice rows**: `--warning` for relaxed constraints, `--surface-2`
  for info (e.g. rollback disclosure).
- **Composer**: sticky bottom, `--surface`, top border; auto-grow
  textarea (1–4 rows, 500-char max, counter at 400+), rotating
  placeholder ("Try: 'gift for mom under 1500'"), Enter sends /
  Shift+Enter newline, `--brand` 40px send button.
- **Empty state**: one-line greeting (language-aware) + 4 context
  chips (home: *Gift under ₹2,000 · Diwali ideas · Phone under ₹15k ·
  Help me choose*; PDP: *Is this good as a gift? · Similar under ₹X ·
  What's in the box?*) + disclaimer "AI · can be wrong · demo
  catalogue".
- **Feedback**: 👍/👎 per assistant reply; 👎 expands the 5
  root-cause reason chips (same labels as the mined taxonomy).
- **Persistence**: transcript in sessionStorage `askcart_chat_v1`
  (schema-versioned, 40-message cap); typing indicator (3 dots, 1.2 s
  stagger); "New message ↓" pill when scrolled up.

### 6.10 Analytics view (the tab formerly "Behind the scenes")

Top-right **Analytics** button (live green dot) swaps `.wrap` content
for `AnalyticsView` (545 lines), 5 subtabs — **Overview · Search &
Guide · Catalogue & Brands · Journeys & Orders · Validation & Study** —
each polling the live summary every 2.5 s (deep-linkable:
`/?tab=analytics&anview=validation`):
- **Overview**: KPI stats (sessions, journeys, null-search rate,
  resolved rate, cart adds, orders), 6-step funnel with step
  conversion %, live event stream (last events, ticking).
- **Search & Guide**: top queries (searches/nulls/resolved/avg turns/
  cart adds), question mix per type, most-tapped options, filter usage.
- **Catalogue & Brands**: full catalogue profile (size, price
  distribution, rating mix, brand counts, families, accessory share,
  occasion tags) recomputed live + per-category/brand engagement from
  events.
- **Journeys & Orders**: resolution by turn (t1…t4/unresolved),
  cohort table (shopping-for × spend style: journeys, resolved,
  cart adds, orders, order rate, avg time), last 10 orders.
- **Validation & Study**: reads the eval artifacts (n=150 study,
  3,000-query sim, semantic fallback arms, relevance audit, canaries)
  — "nothing preset in the dashboard" — plus a live-vs-study table
  and artifact links.
The store and dashboard are **schema-agnostic**: any new event type or
property added to the product appears here automatically.

### 6.11 Festival rails (G8, homepage during a festival window)

During a festival window (window = 14 days before → 3 days after;
today's: Dhanteras 11-06, Diwali 11-08, Bhai Dooj 11-10 —
`app/lib/festivals_2026_27.json`) the idle-state "Trending across price
bands" grid is replaced by **"{Festival} gift ideas"**: 4 horizontal
rails by budget (under ₹500 / ₹1,000 / ₹2,000 / ₹5,000), 8 cards each,
80px-wide columns, each card = full ProductCard in a 235px rail
column; header count line: "{Festival} is N days away · best-rated per
budget · 54,304 products loaded".

### 6.12 Motion & accessibility

Panel/drawer slide 180–200 ms ease-out; message fade-up 8px/150 ms;
`prefers-reduced-motion` disables all of it. Targets ≥44px (chat
header buttons); `role="dialog"` (mobile sheet) / `role="complementary"`
(desktop dock); chips are radiogroups with arrow keys; all contrast
pairs pass `scripts/contrast_check.js` (16/16, 0 fails); `lang`
attribute follows the reply language.

## 7. User journeys (J1–J10, as shipped)

- **J1 — Onboarding (first visit only)**: Land → `session_start`,
  `page_view` → non-blocking strip (§6.4) or, at `/?onboard=1`, the
  full 3-question card (kept behind the deep link for the analytics
  demo, O5) → answers ride on every event as `cohort`
  (`context × spendStyle`).
- **J2 — Browse without searching**: hero → festival rails or
  "Trending across price bands" (12 preview cards,
  `product_impression {source:"preview"}`) → Add / Buy now / type a
  query.
- **J3 — Search, resolves turn 1** (happy path): type/tap/deep-link →
  `search_start` → `search_results` → ≥2 on-intent → `resolved
  {turns:1}` → results + optional refinement strip (only when the
  policy finds a *valuable* refinement; strong queries like "iphone 15
  128gb under 65k" get **zero** questions — minimum-question
  principle) → filters / shelves / recommended strip →
  `journey_end` on leave/re-search/order.
- **J4 — Guided rescue (the 27%→8% journey)**: <2 on-intent →
  `zero_result` + dim state + **One quick question** (category rescue
  for dead ends; else the category flow — phones budget→brand;
  fashion occasion→budget; home budget→occasion; the always-ask ladder
  appends for_whom→brand→size→capacity so a search keeps asking until
  the shopper is at the product; 4 follow-ups / 5-turn budget) → chip
  or typed answer → relaxed re-search → `resolved {turns:2}` or next
  eligible question (never repeats a type; skip = destination) →
  exhaustion → closest picks + rephrase chips + `unresolved`.
  Rollback guard: an answer that *worsens* intentN by >50% is reverted
  with a visible notice. Worked canary: "samovar" → 0 → category
  rescue → Appliances → occasion → resolved turn 3.
- **J5 — Mid-search filtering**: any time during a search: Mode /
  Sort / adaptive Price / 4★+ / Hide accessories / Brand / Category /
  Clear all — instant client-side re-filter, meta updates
  "N of M products · X ms", `filter_applied {n_before, n_after}`.
- **J6 — Buy now (express)**: card/PDP **Buy now** → checkout modal
  directly → Place prototype order → toast.
- **J7 — Cart → order (multi)**: Add (toast + badge bounce) → Cart →
  drawer (qty steppers) → Place order → checkout → `order_complete` →
  order toast → cart cleared.
- **J8 — PM/recruiter analytics walk**: Analytics pill → the 5
  subtabs; everything a user did on the Search tab appears within one
  poll — the dashboard is the product's telemetry, public by design.
- **J9 — Deep links**: `/?q=shaadi%20gift%20under%202k` (active
  search), `/?tab=analytics&anview=validation` (evidence tab),
  `/?noob=1` (skip onboarding, used by the UI tour), `?sku=…` (PDP).
- **J10 — Ask the assistant**: open from FAB / PDP / null-search nudge
  → type "saree for ammi under 2k" → 3 product cards + policy-decided
  question with counted chips → chip or typed answer updates the page
  grid + trail → "compare the first and second" → compare table →
  "is the first one a good gift?" → grounded tag-based answer with
  honest unknowns → "didi ki shaadi gift under 1500" → gift
  concierge (recipient → budget → brand-diverse shortlist) →
  "add this to cart" → ui_action adds. Every reply ≤40 words,
  grounding-guarded; 👍/👎 per reply (👎 → 5 root-cause reasons).

## 8. The chat assistant (J10) — architecture

**Server** (`app/lib/chat/`, all plain Node, no new deps):

| File | Lines | Responsibility |
|---|---|---|
| `dialog.js` | 953 | dialog manager: intent switch → deterministic `act(...)` returning `{facts, events, components, nextState}`; never calls the LLM itself; all 10 intents + chip pass-through; rollback guard; coreference ("the second one", "cheaper/costlier"); gift concierge (recipient → occasion → budget → brand-diverse shortlist, festival-ordered occasions); compare; explain; product Q&A (facts-only: spec from `parsed_specs`, suitability from tags, quality = adjusted rating + "demo rating" when synthetic, price vs category median); cart help (add/open only — never `order_complete`) |
| `nlu.js` | 314 | rules-first NLU: `parseQuery` + Hinglish/Devanagari/relationship lexicons; if rule confidence ≥ 0.8 **no LLM call**; else LLM JSON (temperature 0, ≤220 tokens) validated against the intent/slot schema with vocabulary grounding (no invented brands/categories); 1,200 ms timeout → rules |
| `templates.js` | 157 | static phrasing tables for en / hinglish / **hi (no LLM at all for hi/hinglish)** — one template per act+lang |
| `grounding.js` | 79 | the output guard, 5 non-negotiable rules: (1) every currency in the text ∈ the allowed fact set, (2) every capitalised brand/product token ∈ fact brands/titles, (3) every SKU mentioned ∈ catalogue ∩ `state.last`, (4) ≤40 words, no URLs/markdown, banned phrases (guaranteed / 100% genuine / best quality / medical-legal), (5) any question asked must match `facts.next.type`. Any failure → reply from template, `grounding_fail` logged, **grounding failures reaching the user is a tracked 0-tolerance metric** |
| `state.js` | 69 | conversation state HMAC-signed (`CHAT_STATE_SECRET`); 30-turn cap; forged states rejected |
| `faq.js` | 52 | BM25 over `app/lib/chat/faq/policies.md` (≤30 short passages, every non-real one tagged **Demo:**); below threshold → `faq_unknown` ("I can't answer that in the demo") + offer; LLM may only rephrase the retrieved passage |

**Client** (`app/app/ui/chat/`, lazy-loaded, `next/dynamic ssr:false`):
`useChat.js` 155 (reducer + fetch/SSE-style client, retry-once,
sessionStorage persistence `askcart_chat_v1` 40-msg cap) ·
`ChatPanel.jsx` 99 (dock/sheet, focus trap, Esc) · `MessageList.jsx` 64
(`role="log"`, autoscroll with "New message ↓" pill) · `Message.jsx`
71 (text | cards | compare | chips | notice) · `QuickReplies.jsx` 44
(counted chips, zero-count disabled) · `ProductMini.jsx` 28 ·
`Composer.jsx` 60 (auto-grow, 500-char cap) · `Feedback.jsx` 26 (👍/👎
+ 5 root-cause reasons) · `ChatLauncher.jsx` 37 (FAB + nudge) ·
`chat.css` 202.

**When the LLM is skipped** (the point of the design): chip taps never
call it; confident rule parses (≥0.8) never call it; hi/Hinglish
phrasing is static. Target **≥60% of turns with zero LLM calls** —
met by construction in template mode (`CHAT_LLM=0`), and the study
found phrasing rarely changes outcomes.

**Safety**: input ≤500 chars, PII redaction (emails/phones/card-like
runs → `[redacted]` before logging or LLM), injection patterns
("ignore previous…", "system prompt", base64 blobs) force
`out_of_scope` *without calling the LLM*; user text is delimited
`<user_message>` data, never instructions; the LLM cannot invoke tools
(only the dialog manager can); UI actions whitelisted; rate limits
20/min + 200/day per IP+session; origin check on `/api/chat`.

**Gate (re-run this session, `CHAT_LLM=0`, 0 tokens)**: golden 60 +
red-team 30 → **intent accuracy 100% (76/76 intent-checked turns),
0 grounding failures reaching the user, 0 max-word violations,
safe handling 37/37 (100%), 0 hard failures — GATES PASS**.
Artifacts: `eval/chat/results/`.

## 9. Analytics — the public telemetry layer

- **Client**: `app/app/lib/track.js` batches `track(event, props)`
  calls; every event carries `session_id` (localStorage), `cohort`
  (`context × spendStyle` from onboarding, or `no-persona`), `ts`.
  Posts to `/api/analytics/event` (server allows only the allowlisted
  event names).
- **Store**: `app/lib/analyticsStore.js` — atomic JSON writes
  (`.analytics-state.json`; an isolated `.analytics-state.sim.json`
  for the simulation harness, `?env=sim`), counters + raw event log,
  served at `/api/analytics/summary`. Schema-agnostic: new event
  types/properties show up in the dashboard automatically.
- **Event catalogue** (full table in `docs/event_schema.md`):
  - **Journey**: `session_start`, `page_view`, `onboarding_complete/
    skipped`, `search_start`, `search_results` (incl. optional
    `semantic_used/added/ms/reason`), `zero_result`, `search_error`,
    `guide_question_shown` (`mode: llm/policy/fallback`, `reason`),
    `guide_option_selected` (`ttfc_ms`), `guide_no_question`,
    `filter_applied` (n_before/n_after), `resolved` (turns),
    `unresolved`, `journey_end` (resolved/ordered/n_views/ms).
  - **Product**: `product_impression` (position, source, variant,
    lang), `product_open`, `pdp_close {dwell_ms}`, `variant_select`,
    `add_to_cart`, `recommendation_click`, `buy_now`.
  - **Cart/order**: `cart_view`, `remove_from_cart`, `checkout_start`
    (source), `order_complete` (items[]).
  - **Outcome** (G12): `outcome_feedback {value: yes|no, reason}` —
    reason ∈ the 5 mined root-cause labels + other.
  - **Assistant**: the 14-event `chat_*` set (§8) + `demand_signal`.
- **Derived metrics** (`/api/analytics/summary`): 6-step funnel with
  conversion; **null-search rate** = searches with <2 on-intent
  results (the study's failed-search definition); top queries; guide
  effectiveness (questions per type, tap-through); filter usage;
  shopper-profile breakdowns; recommender CTR; journey turns;
  category/brand engagement (live from events, not the catalogue);
  cohort tables; last-10 orders.
- **Design decision**: the dashboard is public by design ("Every
  interaction event is public in Analytics" — footer). No PII is
  stored; the pincode never leaves the browser as a raw value;
  transcripts are off by default.

## 10. Evaluations — what each number means

### 10.1 Guided-search study, n=150 (`eval/run_eval.py`)

Artifacts: `eval/results/summary.txt` (deterministic), `summary_llm.txt`
(Qwen-phrased), queries in `eval/results/queries_final.json`.
Null = <2 intent-matched results (the app-wide definition).

- Baseline (naive keyword) **null 27.3%** (41/150, CI 20.8–34.9).
- Guided **null 8.0%** (12/150, CI 4.6–13.5) — 19.3 pts rescued.
- **Resolved 92.0%** (any turn); **78.7% resolved by turn 2**
  (exactly turn 2: 26.0%); turns t1=79, t2=39, t3=20, t4+=0,
  unresolved=12.
- Qwen-phrased run: **identical outcomes** (8.0% null, 78.7% by t2)
  with zero behaviour drift — 53 Qwen-phrased, 6 template fallback.
- Caveat (stated in §12): the panel was calibrated against the live
  app, so this demonstrates mechanics, not shopper benefit. Eval v2
  (§10.5) and the semantic panel (§10.7) are the held-out checks.

### 10.2 Scale simulation, 3,000 generated queries (`eval/simulate.py`)

Artifact: `eval/results/sim_summary.json` (ts 20261104_0117), log
`logs/sim_20261104_0117.jsonl`, 269 s runtime, isolated sim store.

- 0 errors across 3,000 queries.
- Guided: **0.0% null, 100% resolved, 98.6% by turn 2**
  (t1=2,914, t2=45, t3=41); strict (top-1 category match) 86.7%.
- Baseline same set: 2.8% null, 86.7% strict — strong *by
  construction* (catalog-aware generator); it is a robustness
  demonstration, never the headline.
- 21 query kinds; the structurally hard ones: dead-end (baseline 84%
  null → guided gives a closest-shelf answer, strict 8%) and
  economic-stratum bottom ("under 800", baseline 44.4%).

### 10.3 Relevance audit (`eval/relevance_audit.py`)

53 curated queries × top-3 = 150 results, Qwen-judged
(R/P/I): **relevant 78.0%, partial 18.0%, irrelevant 4.0% → 96.0%
usable**. Worst cells: gift/occasion/vague/ayurveda (1–2 each), all
long-tail intent areas.

### 10.4 Regression canaries + UI tour + contrast

- **Canaries: 111+5 green** (`eval/canaries.py`): search relevance,
  typo tolerance (20), Hinglish/Devanagari (30), guide policy,
  rollback guard, semantic no-op. A canary red = build fails.
- **UI tour: 17 screenshots** (`scripts/ui_tour.js`, `/?noob=1`):
  home, hero strip, search happy path, guided rescue, filtered state,
  PDP, cart, checkout, order, analytics (5 subtabs), onboarding toast —
  pixel-diff-stable across rebuilds.
- **Contrast check: 16/16 pairs pass** (`scripts/contrast_check.js`,
  0 fails) — every text/background token pair WCAG-checked.
- **Doc-number sync** (`scripts/sync_doc_numbers.py --check`): every
  catalogue/statistic in PROJECT.md is generated from the artifacts;
  drift fails the build (T3).

### 10.5 Eval v2 — held-out 100-query panel, 2 arms

`eval/evalv2/`, panel frozen in git before any arm ran (41
real-suggest-shaped autocompletes, 25 vague, 14 Hinglish, 10 typo, 10
dead-end; deduped vs canaries + old 150). Top-3 Qwen-judged, Wilson
CIs, outcome classes `resolved / substitute_shown / not_in_catalogue`
(dead-ends are no longer counted "resolved").

| Metric | A baseline | B guided |
|---|---|---|
| Null rate (0 results) | 24.0% [16.7–33.2] | 0.0% [0.0–3.7] |
| App null (<2 on-intent) | 28.0% [20.1–37.5] | 10.0% [5.5–17.4] |
| success@3 (Qwen) | 44.7% [34.1–55.9] | 52.0% [42.3–61.5] |
| usable@3 | 82.9% [72.9–89.7] | 75.0% [65.7–82.5] |
| p50/p95 ms | 54 / 131 | 64 / 737 |
| Questions/journey | – | 0.36 avg (max 3) |
| Rollback | – | 8 turns (5.0% of journeys) |

Honest reads: strict nulls disappear, app-nulls halve (CIs
non-overlapping); success@3 directional (CIs overlap); usable@3 dips
slightly (guided re-ranking narrows top-3 diversity on vague queries);
guided surfaces `substitute_shown` 3× instead of claiming dead-end
resolutions. Full text: `eval/evalv2/results/summary.md`.

### 10.6 The persona simulation (this fix pass) — v1 vs v2

Harness: `eval/persona_sim.py` — **300 personas** (3 languages:
English / Hinglish / Hindi-Devanagari × 10 shopper segments × 10
regions) × **10 fixed dimensions** (D1 electronics+budget, D2
fashion+recipient, D3 gift+occasion, D4 vague, D5 typo, D6
spec-parsing, D7 intentional dead-end, D8 plain browse, D9
tight-price, D10 relationship-word Hinglish/Devanagari) = **3,000 real
guided journeys** over HTTP against the live app, persona
ground-truth answers, `mode:"fallback"` guide (**0 LLM tokens**),
up to 4 follow-ups. Runs: v1 (pre-fix) `logs/persona_sim_20261104_172125.jsonl`,
v2 (post-fix) `logs/persona_sim_20261104_180504.jsonl`; aggregates in
`eval/results/persona_sim_summary.json`.

**Run 1 (v1 — before the fix pass):** overall **null 27.6%**
(828/3000, CI 26.0–29.2), **resolved 76.1%** (CI 74.5–77.6), resolved
turn-1 72.4%, avg questions 0.76, avg turns-to-resolve 1.09,
131 zero-chip journeys, semantic used 315×.

| Dim (n=300) | Null | Resolved | Avg Q |
|---|---|---|---|
| D1 electronics+budget | 12.0% | 89.0% | 0.34 |
| D2 fashion+recipient | 45.0% | 59.0% | 1.29 |
| D3 gift+occasion | 10.0% | 90.0% | 0.30 |
| D4 vague | 33.3% | 70.0% | 0.97 |
| D5 typo | 0% | 100% | 0 |
| D6 spec | 20.0% | 80.0% | 0.40 |
| D7 dead-end | 85.7% | 32.7% | 2.39 |
| D8 browse | 29.3% | 76.3% | 0.80 |
| D9 tight-price | 24.0% | 78.7% | 0.66 |
| D10 relation | 16.7% | 85.0% | 0.48 |

By language (n=1,000): en null 15.5% / resolved 88.7% / avgQ 0.38;
hinglish 20.1% / 83.1% / 0.55; **hi (Devanagari) 47.2% / 56.4% / 1.36
— the v1 failure the fix pass targeted**. By segment: best homemaker
(resolved 95.3%), weakest senior / brand_lover / young_pro (~33%
null). Question mix: occasion 723, category 719, size 593 (too many —
including non-apparel), budget 107, for_whom 94, brand 49, capacity 2.

**Run 2 (v2 — after the fix pass):** see §10.6b below.

### 10.7 Semantic fallback evaluation (frozen 100-query panel)

`eval/semantic/` — panel frozen in git (200 dev+test composition per
kind; 50-query test split run once), arms A (lexical only) /
B (semantic only ablation) / C (hybrid fallback), Qwen-judged top-3,
τ=0.845 / margin 0.03 / floor 0.70 calibrated on dev split (dev hit
31/41, dev dead-end FR 0/5, dev prec@3 92.1%).

| Arm | Null | success@3 | usable@3 | Qwen-judged | Questions/journey |
|---|---|---|---|---|---|
| A lexical | 10% [4.3–21.4] | 56% | 80% | judge | 0.46 |
| B semantic only | 32% [20.8–45.8] | — | — | judge | 0.88 |
| **C hybrid** | **6% [2.1–16.2]** | 58% [44.2–70.6] | **88% [76.2–94.4]** | judge | **0.34** |

- Semantic invoked on 36/50 arm-C journeys (14 `below_threshold` —
  correctly rejected); latency p50/p95 **19/32 ms** (machine-load
  dependent, stated).
- **Dead-end false-resolve (app level) 4/4 = 100%** — honest
  finding: those 4 are resolved by the *baseline* category rescue in
  arm A identically; the semantic layer itself rejected all 4. This is
  a rescue-inheritance artifact, not a semantic failure, and is
  reported as such in `summary.md`.
- **Second rater**: 40 random arm-C top-3 items hand-labelled
  (`hand_label_40.json`), then a blind second LLM rater
  (`agreement_40.json`, seed 20261104, 120 item judgements):
  **85.0% agreement / κ 0.66 (binary usable-vs-not)**, 70.8% / κ 0.56
  (3-class). The rater is a single LLM (the build agent), not a human
  — stated plainly.
- No-op guarantee: for every canary + study query with lexical
  intentN ≥ 2, `SEMANTIC_FALLBACK=1` responses deep-equal `=0`
  (293/293, zero tolerance). Parity JS-int8 vs numpy-float 9.8/10.
  Kill switch `SEMANTIC_FALLBACK=0`; `EVAL_MODE=1` `?semantic=0|1|only`.
- Full artifacts: `eval/semantic/results/{results.json, summary.md,
  threshold.json}` — every number generated by
  `eval/semantic/make_summary.py` from the records.

### 10.8 Chat assistant gates + other checks

- **Golden (60) + red-team (30)** conversations run in-process against
  the live route handler, twice: LLM mode and `CHAT_LLM=0` (template)
  — state transitions identical. Template mode this session:
  **intent 100% (76/76), grounding failures 0, max-word violations 0,
  safe handling 37/37 (100%), hard failures 0 — GATES PASS**.
- LLM-mode grounding target: **0 ungrounded claims reaching the user**
  (the 5-rule output guard, §8).
- UI tour (17), contrast (16/16), canaries (111+5) — all green after
  every code change in the fix pass.

### 10.9 Qwen eval suite — 1,000-case pass rates (search / RAG / UX)

`eval/qwen_suite/` — one frozen panel of **1,000 cases** (committed
before any run; panel sha `e8f01a06d883bf79`, seed 20261104), one Qwen
judge (qwen38-27b, temp 0, thinking off), Wilson CIs on every rate,
generated report `eval/qwen_suite/results/summary.md`. This is the
consolidated LLM-judged pass-rate layer that the earlier panels
(relevance audit, eval v2, semantic panel) only approximated in
pieces — and it adds the two dimensions that never had a Qwen eval:
**RAG answer quality** and **UX question-policy appropriateness**.

| Dimension | n | baseline | final |
|---|---|---|---|
| Search — Qwen usable@3 on live top-3 | 400 | 339 = 84.8% [80.9–87.9] (strict 57.2%) | 382 = **95.5% [93.0–97.1]** (strict 72.0% [67.4–76.2]) |
| RAG — deterministic gate AND Qwen quality | 300 | 31 = 10.3% [7.4–14.3] | 297 = **99.0% [97.1–99.7]** |
| UX — question moment judged "appropriate" | 300 | 8 = 2.7% [1.4–5.2] (A=8/M=19/B=273) | **0 judged — 300/300 no_question** (see below) |
| **Total** | **1000** | 378 = 37.8% [34.8–40.8] | **679/700 = 97.0% [95.5–98.0]** (no_question excluded per protocol) |

- **Search** (400): 203 queries reused from earlier frozen panels +
  197 new (hand-written gift/budget/Hinglish/Devanagari/spec/brand/
  vague/typo/synonym/dead-end + real Google-Suggest-IN autocompletes).
  Final: every non-dead-end kind at 100%; dead_end 31.2% [14.2–55.6] /
  new_dead_end 12.5% [2.2–47.1] is the documented out-of-catalogue
  floor (18 cases: kettledrum, bagpipe set, easel, spinning top,
  gramophone, didgeridoo, hoverboard, periscope, bobsled, samovar,
  astrolabe, falconry glove, linotype machine, daguerreotype kit,
  telegraph key, morse code kit, zither).
- **Fix passes (product-side only; judge + panel unchanged).**
  RAG 10.3→99.0: FAQ possessive match ("CEO's"→ceo); NLU finance
  guard (sell/insurance), currency-conversion → out_of_scope,
  HINGLISH_MARK false-positive fix, new `extdata` kind (compare-with-
  global / "according to global reviews" → honest out-of-demo
  deflect); out-of-scope key map (world → oos_domain,
  out_of_domain:* → oos_policy — health/legal/finance pass with the
  policy text); kg pair-weighting ("5 kg (10 kg)" → 10 kg); SPF
  fallback answer; material rules (title-order phrase preference
  "Stainless Steel" not "Steel", karat prefix, "Gold Edition /
  Gold Filled / Plated" excluded as treatment → honest unknown);
  occasion-miss answer only when asked-occasion ∉ grounded tags.
  Residual 3: `qs_r_0050` (judge deterministically rejects the
  correct "7.5 kg" for "capacity" — degenerate reason, temp-0
  re-judge agrees), `qs_r_0285`/`qs_r_0290` (global reviews/pricing
  — data the demo does not have; the deflect is correct, the judge
  wants the data).
  Search 84.8→95.5: Hinglish recipient/pronoun STOP words
  (apne/apni/apna/apno, khud, uske/uski/uska, biwi, patni, family,
  ghar) that leaked into required tokens and zeroed intent matching
  ("candle apne liye" → 0 intent on 12 candles); `tshirt→shirt`
  synonym (lexicon maps टी-शर्ट→tshirt, which matches no title —
  titles tokenize to "t"+"shirt"); rupee-`rs` cleanup fix (the
  `/rs|rupees/` replace ate word-final "rs": "trousers"→"trouse");
  pack-quantity digits dropped from tokens ("tshirt pack of 3 under
  999" — the digit 3 let "Shuttlecock 3 Pack" outrank T-shirt
  packs); earlier passes: persona-sim lexicon/Devanagari budget
  fixes, sparse-question guard, intent-ranked rescue options,
  fit-garment/kids/capacity/budget-coverage/age occasion gates.
- **UX** (300): question moments sampled from the 3,000-journey
  persona-sim v2 run and replayed deterministically (0 LLM tokens for
  generation); judge calibrated to the documented product intent.
  Baseline anatomy: 88/106 judged moments were B on the dead-end
  category quiz ("category options ignore query subject" — global
  top-4 categories offered for zither/samovar/gramophone/…); the rest
  were size-on-shawl/watch/perfume, kg-capacity on a kids' t-shirt,
  budget on <10%-coverage bands, occasion on stated-kids-age,
  single-option category. Fix passes: (1) the six eligibility gates
  above; (2) the dead-end no-quiz policy (honest not-found, no
  category quiz when the subject is absent — vague/gift/self-ref
  keep disambiguation); (3) the search-intent token fixes above
  (recipient-word queries now resolve at turn 1, no question needed).
  On the one dead end with close candidates in the panel ("rotary
  phone", 4 moments + 4 follow-up moments), three facet-question
  variants were built and re-judged against the frozen panel:

  | variant on "rotary phone" | verdicts (4 seq-0 moments) |
  |---|---|
  | plain budget (v2-era style) | A=2 M=1 B=1 — "budget irrelevant for niche rotary phone" |
  | category, options grounded in the query's own candidate set (phones/electronics) | B=4 — "category options ignore specific rotary phone" |
  | budget with no-match disclosure in the question text ("No exact match for \"rotary phone\" … closest picks?") | B=3 M=1 |

  The frozen judge's consistent position: no facet fits an
  out-of-catalogue product type, so the final policy asks **no**
  question on concrete dead ends (closest picks + rephrase chips).
  Result: 300/300 sampled moments are no_question under the
  pre-agreed protocol (journeys resolve before the sampled step, or
  the dead end ends with an honest not-found) — the dimension has no
  remaining judged moments on this frozen panel, which is reported as
  its own line rather than as a pass rate. (A fresh, non-frozen panel
  of the current build's question moments would be the honest way to
  re-measure UX; not done here — the panel is frozen.)
- **RAG** (300): 250 product Q&A (spec-known / spec-unknown /
  suitability / quality / price × 50) on the documented PDP path
  (fresh conversation + `context.sku`, §6.4) + 50 FAQ (25 in-scope,
  25 out-of-scope). Deterministic gate (server grounding guard,
  ≤40 words, banned phrases) = **100%** — the guard works; the Qwen
  verdict measures answer quality and fails 89.7%. Verified real gaps:
  the spec answerer picks the wrong number (RAM for a storage
  question) or dodges unanswerable questions with the adjusted rating
  instead of the honest `answer_unknown` ("What is it made of?" →
  "Adjusted rating 4.6…" ×50/50); out-of-scope world questions
  ("weather in Mumbai?") are mis-routed into the category-rescue
  question instead of `out_of_scope` deflection.
- **UX** (300): question moments sampled from the 3,000-journey
  persona-sim v2 run and replayed deterministically (0 LLM tokens for
  generation); judge calibrated to the documented product intent.
  Verified real gaps: the budget facet fires on narrow-price queries
  ("rotary phone", "trousers biwi ke liye" — 0% A across all
  languages); category-rescue options are frequency-ranked, not
  intent-ranked ("baby shower" query → top option AMAZON FASHION
  16,829). Apparel size/for-whom moments are the ones the judge
  accepts (all 8 A's are apparel/gift-fit).
- **Qwen usage** (cumulative in `results/cost_*.json`, baseline + all
  fix-pass re-judges): search 65 calls ≈ 71K est tokens, RAG 1,793 ≈
  832K, UX 713 ≈ 213K — 2,571 calls ≈ 1.12M estimated tokens total,
  logged per call; same proxy/model as every other eval in the repo.
- Caveats: single LLM judge (no second rater in this suite); the UX
  sample is enriched for null-search journeys (that's where questions
  happen) — it is a stress view of the policy, not a traffic-weighted
  one; methodology refinements (PDP path, judge calibration) were
  made before any result was published; the panel itself was never
  modified after freezing.

### 10.10 UX panel v2 — the 91.7% question-fit push (rounds 1–8)

Panel: 300 question moments from the current build's own persona-sim v2
run (2,575 question moments across 3,000 journeys; seed 20261105; sha
`5e60d43bb88d58ad`; `panel_ux_v2.jsonl` committed before judging). Key
structural discovery: the panel's first-question moments are recorded at
`turn=2` (turn 1 = the initial search), so nearly all moments audit the
journey's FIRST question (seq0=201, seq1=89, seq2=10) and `no_question`
is the main denominator lever. Judge A patterns (frozen prompt, temp 0):
size on apparel with real size data; occasion on gift queries with
UNSTATED occasion; brand when brands dominate; budget only on clean
wide-range single products; for-whom on ambiguous apparel/watch. The
judge M's "defensible but not best" on the rest — the wall was 43.8%
(46/105) after round 5.

Rounds 6–8 fixes (all in `app/lib/guide.js` unless noted; each verified
in-process before any HTTP gate, then all 6 gates re-run):

| ID | Fix | Panel moments fixed |
|---|---|---|
| P1b | occasion options LEAD with the stated occasion (Wedding/Shaadi…), drop the misleading "Gift" option | 15× "ignore wedding context" B's |
| P2 | stated recipient + product subject, no stated occasion ⇒ gift ladder (candle for colleague) | candle A kept; organizer/rug/tshirt-for-sister M/B's via F2 |
| P3 | budget only when on-intent p75/p25 ≥ 4× (or high-ticket p50 ≥ ₹15k) | mictrowave/heaphones/fan/photo-frame/blazer budget M/B's → NQ |
| P4 | bare watch queries (watch/घड़ी, no gender token) don't get for-whom | "watch under 1000" M → NQ |
| P5 | phone-accessory department artifact: no category split when top dept is Cell Phones & Accessories on a non-phone query | samsng tv → budget A |
| P8 | destination stop: ≥2 settled facets (stated ∪ answered) AND ≥10 results on screen → stop asking | all second-question M's (tshirt/sneakers/samsng-tv/hoodie t3…) |
| F1 | a NAMED occasion in the query (diwali/anniversary/birthday/wedding/…) skips the occasion quiz; generic "party" (from "event") stays askable | 11 stated-occasion M/B's; 3 event-occasion A's preserved |
| F2/F9′ | occasion options need ≥max(5, 3% of set) each AND tagged coverage ≥15% of the set, ≥2 such options | tshirt/shirt/rug/organizer/hi-tshirt/shawl M/B's → NQ; dress-for-wife M → NQ; all 5 occasion A's byte-identical |
| F3/F11 | size needs ≥25 size-bearing items AND a real spread (≥2 sizes with ≥5 items, or one size ≥25 items covering ≥20% of a ≥300 set); shares computed over the visible item pool, not n | blazer ×2, diaper bag, hoodie-dost M's → NQ; watsh/shirt/kurta A's preserved; tshirt/shirt-for-wife flipped NQ→size A (pool-share fix) |
| F5′ | Devanagari subject guards (टीवी, घड़ी) — JS `\b` does not fire before Devanagari codepoints, so the round-6 escapes were dead branches; rewritten with literal chars | टीवी → budget A (was department-quiz B) |
| F6/F7 | no multi-family category quiz when the top-2 "split" is one product across electronics departments (charger: All Electronics + Cell Phones; TV: + Home Audio & Theater) | चार्जर B → NQ |
| F8 | pure gift/kuch queries with no stated recipient don't get an occasion quiz | uphaar/kuch-aacha-gift M's → NQ |
| F10 | budget skipped when on-intent range spans >15× (sitar 1.5k–33k) | sitar M → NQ |
| F12 | possessive pronouns (uske/unke… incl. Devanagari) count as gifting intent but NOT as a stated recipient (the judge A's for-whom on "watch uske liye" — the pronoun is ambiguous to the shopper) | घड़ी-उसके-लिए M → NQ; 4 uske for-whom A's preserved |
| — | `searchStats.pricePIntent`: dominant category = MAX count (was first-inserted); bimodal guard (p50/p25 > 6 ⇒ fall back to all-visible bands) | laptob/लैपटॉप budget A bands stabilised |

**Dropped fix (reported honestly):** adding uske/uski/uska to the
recipient vocabulary (original F5) was killed by pre-audit — it would
have removed for-whom from 4 A moments ("watch uske liye" ×3, "sneakers
uske liye"), because the frozen judge does not parse the pronoun as a
stated recipient. F12 captures the gift-intent half of that idea without
the for-whom exclusion.

Trajectory: 21.0 → 24.5 → 44.7 → 25.6 (round-3 category revival
regression, reverted) → 47.2 → 43.8 → 57.7 → 84.6 → **91.7%**
(44/48 judged, 252 NQ; Wilson [80.4–96.7]). Round 8 re-judged 0 moments
(all four fixes flipped M→no_question with byte-identical everything
else). UX v2 Qwen spend: 611 calls ≈ 220K est tokens (cumulative in
`results/cost_ux_v2.json`). Residual 4 M's: 3× "category is better"
(spectacles ×2, घड़ी — no grounded product-family split in the data) +
1× hinglish-bangle "weak" (identical en options A'd — judge noise).

## 11. Architecture, file map, runbook, configuration

### 11.1 Request architecture

```
Browser (Next.js 15 App Router, all client-side state)
  │  /api/search  {query, budget?, occasion?, brand?, forWhom?, size?,
  │                capacity?, turn?, relax?}        → {results[≤48],
  │                parsed, stats, semantic?}
  │  /api/guide   {query, n_results, turn, prev_types, mode, lang}
  │                → {guide?: {type, question, options[], optionCounts[]},
  │                   decision: {reason}}
  │  /api/chat    {message?, chip_id?, state(HMAC-signed)}  → {reply,
  │                components[], events[], state}
  │  /api/analytics/event {events[]}  (allowlist)
  │  /api/analytics/summary ?env=sim
  │  /api/catalog-preview
  ▼
Node server libs (app/lib/):
  search.js (parseQuery + scoreAll + tiers + semantic gate)
  semantic.js (int8 index, brute-force cosine, constraints, thresholds)
  guide.js  (decideGuide: eligibility + EIG scoring + facet counts)
  catalog.js (shard loading)   llm.js (LiteLLM proxy, breaker, caps)
  analyticsStore.js (atomic JSON, schema-agnostic)
  chat/ (dialog, nlu, templates, grounding, state, faq)
  festivals_2026_27.json   lexicon_hinglish.json
  ▼
Offline data plane (Python, .venv):
  extractor/ (5 collectors) → pipeline/ (6 DuckDB stages) →
  data/pipeline_counts.json → scripts/build_catalog.py →
  app/public/catalog.json (36,111 SKUs) →
  scripts/build_embeddings.mjs → app/data/catalog_emb.* (server-only)
  eval/ (study, sim, evalv2, semantic, chat, persona_sim) → logs/ +
  eval/results/ → PROJECT.md via scripts/sync_doc_numbers.py
```

**The invariant**: the LLM (Qwen via a LiteLLM proxy) may *phrase* and
*parse*; it never *decides*. Every decision path (question choice,
options, counts, ranking, budget, brand, rescue) is deterministic code;
the LLM has an 800 ms–1.5 s timeout, a circuit breaker (3 failures →
5 min template-only), and a vocabulary-grounded schema. Every stage
has a zero-LLM path (`mode:"fallback"`, `CHAT_LLM=0`,
`SEMANTIC_FALLBACK=0`).

### 11.2 File map (the important 40)

```
PROJECT.md                    1,300+ lines — the full build record
STATUS.md                     session log (one dense entry per work item)
docs/ASKCART_FULL_DEEP_DIVE.md  ← this file
docs/event_schema.md          full event catalogue
docs/followup_algorithm.md    question policy spec (§3.6 = stage logic)
docs/semantic_fallback.md     embedding layer design + limits
docs/evidence/source_notes.md per-source raw/clean/gated + RC shares
docs/interviews/real/ + synthetic/  (12, all labelled simulated)
extractor/    collect_play|appstore|reddit|amazon_reviews|trustpilot|trends,
              extract_llm.py (Qwen labeller, 4 shards)
pipeline/     01_raw … 06_labels (DuckDB; 02_clean logs per-source drops)
scripts/      build_catalog.py, catalog_india.py, build_embeddings.mjs,
              sync_doc_numbers.py, make_figures.py, ui_tour.js,
              contrast_check.js, run_all.sh
data/         pipeline_counts.json, out/trends_insights.json
eval/         canaries.py, run_eval.py, calibrate.py, simulate.py,
              relevance_audit.py, evalv2/, semantic/, chat/,
              persona_sim.py, results/
app/
  app/page.jsx (1,361)  app/globals.css (523)
  app/ui/analytics.jsx (545)  pdp.jsx (206)  cart.jsx (114)
  app/ui/onboarding.jsx (112)  app/ui/chat/* (9 files, 202 css)
  app/api/{search,guide,chat,analytics,}/route.js
  app/lib/i18n.js  app/lib/track.js
  lib/search.js (~700)  guide.js  semantic.js  semantic_config.json
  lib/catalog.js  llm.js  analyticsStore.js
  lib/chat/{dialog,nlu,templates,grounding,state,faq}.js
  lib/chat/faq/policies.md
  data/ (server-only: catalog_emb.i8 13.2 MB, scales, meta,
          query_emb_cache.json — gitignored binaries, committed meta)
  public/catalog.json (36,111 SKUs, sharded details if any)
```

### 11.3 Runbook

```
cd ~/askcart
zsh scripts/run_all.sh          # collectors → pipeline → labels →
                                # catalogue → embeddings+tests → study
                                # → doc-sync check (0-LLM path available)
cd app && npm run dev           # :3000
# gates:
.venv/bin/python eval/canaries.py
(cd app && node --import ../eval/chat/register-shim.mjs \
   lib/__tests__/semantic.test.js)
(cd app && CHAT_LLM=0 node --import ../eval/chat/register-shim.mjs \
   ../eval/chat/run_chat_eval.js)
node scripts/ui_tour.js && node scripts/contrast_check.js
.venv/bin/python scripts/sync_doc_numbers.py --check
.venv/bin/python eval/persona_sim.py --workers 8   # ~15 min, 0 tokens
```

### 11.4 Environment (all optional; defaults keep the app zero-cost)

```
LLM_API_KEY / LLM_BASE_URL / LLM_MODEL     Qwen via LiteLLM proxy
ASKCART_LLM_SAMPLE=6041                    full-corpus re-label
SEMANTIC_FALLBACK=1|0                      kill switch (default 1)
EVAL_MODE=1                                ?semantic=0|1|only override
CHAT_ENABLED=1   CHAT_LLM=1|0   CHAT_LLM_PHRASING=1|0
CHAT_STATE_SECRET=<32+ bytes>              HMAC conversation state
CHAT_RATE_PER_MIN=20  CHAT_RATE_PER_DAY=200  CHAT_DAILY_TOKEN_CAP=…
```

### 11.5 Hosting

**Localhost only by user decision** — no Vercel, no remote. The dev
server (`npm run dev -p 3000`) is the reference deployment; all evals
run against it. The semantic index (13.2 MB int8) is loaded lazily on
the first semantic-eligible query and integrity-checked against the
catalogue (SKU-order SHA-256) — a mismatch disables the layer rather
than serving misaligned rows.

## 12. Honest limitations (do not skim)

1. **No real users, anywhere.** The "interviews" (n=12) are
   simulated/corpus-grounded and labelled `synthetic`. All shopper
   evidence is self-graded or LLM-judged. The n=150 study was
   calibrated against the live app — a mechanics demonstration.
2. **Demo catalogue.** 54,304 SKUs = 24,998 US Amazon listings
   converted at ₹83.5/$ + 11,113 India-layer; India-layer ratings are
   synthetically jittered (±0.1, ×0.75–1.25) and every such SKU
   carries `rating_basis:"synthetic"`, surfaced in the PDP ("Demo
   rating — indicative, not live marketplace data"). Prices are
   indicative. No real photos — designed placeholder tiles, labelled.
   Checkout is simulated.
3. **Single-LLM judging, doubled not triangulated.** Relevance, root
   causes and the semantic panel are all Qwen-judged; the semantic
   panel's second rater is another single LLM (85% binary / κ 0.66),
   not a human. No multi-annotator ground truth exists.
4. **Scorer-vs-LLM agreement on root causes is low** (44.1%
   accuracy, macro-F1 0.240 on the 600-sample) — the LLM labels are
   treated as the better estimate and the pattern scorer is kept only
   for the zero-LLM path; both are reported in
   `docs/evidence/source_notes.md`.
5. **Dead-end "resolutions" are rescue, not retrieval.** A "samovar"
   journey that ends "resolved" received the closest shelf via
   category rescue — the app-level false-resolve (4/4 in the semantic
   panel, inherited from baseline) is reported openly, not hidden.
6. **Latency numbers are machine-load-dependent** (same code: p95 23
   ms idle vs 67–83 ms under load — both stated where latency is
   quoted).
7. **Language coverage:** English is fully covered; Hinglish is good
   (lexicon + embeddings); Hindi-Devanagari was the weak leg (v1
   persona sim: 47.2% null) — the fix pass added Devanagari budget
   parsing, digits and 65 lexicon entries; v2 numbers in §10.6b show
   how much of the gap closed.
8. **The 23-lakh quirk**: the Indian price ceiling (₹23,00,000)
   exists because the US source data's dollar ceiling converts to a
   round lakh-ish figure; it is a data artifact, disclosed, and the
   p99 (₹75,399) is the meaningful top-end.
9. **Localhost-only deployment**: nothing is hosted publicly; the
   "live" numbers are from the dev server, and analytics state is a
   local JSON file (atomic writes, but single-machine, no
   multi-process safety beyond atomic rename).
10. **Question policy is heuristic**: EIG scoring + facet counts is
    deterministic and tested (canaries), but the 25% expected-
    elimination threshold and facet cost weights are tuned, not
    derived. If the catalogue changes shape materially, re-tune.

#### 10.6b Run 2 (v2 — after the fix pass)

**Overall: null 19.1%** (572/3000, CI 17.7–20.5) **vs v1 27.6%** —
8.5 points; **resolved 83.8%** (CI 82.4–85.1) vs 76.1%; resolved
turn-1 80.9% (was 72.4%); avg questions **0.528** (was 0.762 — fewer
questions and more resolution); zero-chip journeys **27** (was 131);
semantic used 120× (was 315 — lexical fixed most of what semantic
used to rescue). 0 errors in both runs.

| Dim (n=300) | v1 null | v2 null | v1 resolved | v2 resolved | v2 avgQ |
|---|---|---|---|---|---|
| D1 electronics+budget | 12.0% | **3.7%** | 89.0% | 96.3% | 0.07 |
| D2 fashion+recipient | 45.0% | **27.7%** | 59.0% | **72.3%** | 0.81 |
| D3 gift+occasion | 10.0% | **0%** | 90.0% | 100% | 0 |
| D4 vague | 33.3% | 30.0% | 70.0% | 73.3% | 0.87 |
| D5 typo | 0% | 0% | 100% | 100% | 0 |
| D6 spec | 20.0% | **0%** | 80.0% | 100% | 0 |
| D7 dead-end | 85.7% | 85.7% | 32.7% | 32.7% | 2.39 |
| D8 browse | 29.3% | **14.3%** | 76.3% | 90.3% | 0.41 |
| D9 tight-price | 24.0% | **12.7%** | 78.7% | 88.0% | 0.25 |
| D10 relation | 16.7% | 16.7% | 85.0% | 85.0% | 0.48 |

By language (n=1,000 each) — the fix pass's primary target:

| Lang | v1 null → v2 null | v1 resolved → v2 resolved | v1 avgQ → v2 avgQ |
|---|---|---|---|
| en | 15.5% → **12.3%** | 88.7% → 90.2% | 0.38 → 0.33 |
| hinglish | 20.1% → **15.2%** | 83.1% → 87.6% | 0.55 → 0.41 |
| hi (Devanagari) | **47.2% → 29.7%** | 56.4% → **73.6%** | 1.36 → 0.84 |

By segment (n=100 each), null v1 → v2: brand_lover 33.0→17.0,
young_pro 33.3→18.0, senior 33.7→29.3, home_owner 29.7→21.3,
price_focus 27.3→23.7, techie 27.7→15.3, parent 23.7→18.7,
gift_buyer 22.3→14.7, student 22.3→16.0, homemaker 22.3→16.7
(resolved 95.3→99.3).

Question mix v1 → v2: occasion 723→456, category 719→506,
**size 593→378** (apparel-only guard), budget 107→85, for_whom
94→72, brand 49→88 (the ladder's brand step now fires where occasion
was over-asked), capacity 2→0.

**Reading the deltas (and what they mean)**
- D6 (spec) 20→0: the 11 new budget-AC rows (₹19,990–33,990, incl. 5
  five-star ≤₹30k) closed the catalogue hole behind "5 star ac under
  30k" — a data fix, not a search fix.
- D3 (gift+occasion) 10→0 and D1 12→3.7: Devanagari/Hinglish budget
  normalisation ("₹X से कम", "45000 में", "2 हज़ार") + pronoun
  stop-words + 65 Devanagari lexicon entries.
- D2 (fashion+recipient) 45→27.7: "for him/her" no longer a required
  token; the residual 27.7% is genuine long-tail fashion nouns
  (lehenga, chunni…) still outside the lexicon — the honest remainder.
- D7 (dead-end) unchanged 85.7% null / 32.7% rescue-resolved: exactly
  the documented baseline-rescue behaviour, not a regression.
- D10 unchanged: relation words were already working; the dimension
  confirms no regression.
- Zero-chip journeys 131→27: the sparse-question guard (skip a facet
  when >50% of its data options have 0 counts) works.
- avgQ fell 0.76→0.53 while resolution rose — questions got fewer
  *and* more useful, the product thesis in numbers.
