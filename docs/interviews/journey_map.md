# Search-to-Cart Journey Map + Drop-off Prioritization

## Journey stages (from P1-P12 + corpus complaint mining)
1. Need formation ("I need a shaadi gift under 2k")
2. Query composition (natural language, budget + occasion + item, often one sentence)
3. First results (strict keyword match; budget words often ignored)
4. Evaluation (price, rating, count of reviews, photos)
5. Decision (add to cart) or abandonment

## Drop-off points (5 identified)
| ID | Drop-off | Evidence (interviews) | Evidence (mined corpus) | MVP-solved? |
|----|----------|----------------------|--------------------------|-------------|
| D1 | Budget can't be expressed/applied in search ("under 2k" ignored; weak price filter; no ranges) | 12/12 (3 need ranges) | RC1 budget_mismatch | YES - budget follow-up + price-aware re-search |
| D2 | Occasion/use invisible to search (shaadi, birthday, gift intent ignored; sangeet vs reception; personal vs corporate) | 12/12 | RC2 occasion_blindness | YES - occasion tagging + occasion follow-up |
| D3 | Zero/empty results = dead end (users close the app, don't rephrase) | 9/12 | RC3 zero_or_wrong | YES - guided recovery loop (max 3 follow-ups) |
| D4 | Can't judge quality/trust before clicking (buried 1-star reviews, fake ratings, top complaint hidden) | 10/12 | RC4 trust_gap | Phase 2 (MVP shows real rating + review count) |
| D5 | Results flood / weak ranking (10k results, wrong order) | 3/12 | RC3 sub-pattern | Phase 2 (ranking + category narrowing) |

## Prioritization (3 of 5 chosen for MVP)
Ranked by (frequency x severity x feasibility):
- **D3 zero-result dead-end** - highest severity (hard abandonment), directly addressable
  with a guided follow-up loop. PRIMARY MVP FEATURE.
- **D1 budget** - most-mentioned ask (12/12); cheap to solve with one budget follow-up +
  strict price cap.
- **D2 occasion** - differentiator for the target segment (gift/occasion shopping, INR
  context); solved with occasion tags + follow-up.
- D4 trust and D5 ranking deferred to phase 2 (need review-intelligence pipeline and
  ranking model; MVP surfaces real rating/count as a stopgap).

## How the MVP maps (P1-P12, n=12)
- D3 -> `POST /api/guide` follow-up loop (Qwen38-27B via the user's LiteLLM
  proxy proposes the next question; zero-LLM rule-based fallback keeps the app
  functional with no key - the n=150 study ran in deterministic fallback mode).
- D1 -> budget chip answers feed a strict price cap into the re-search.
- D2 -> occasion tags on catalogue + occasion chip answers feed occasion filtering.
- Metric targets from this design: null results 27% -> 8%; 83% of journeys resolved
  within 2 turns (n=150 eval, see eval/results/).
