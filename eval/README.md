# n=150 Study Methodology

## What is measured
Each of the 150 queries is run through the DEPLOYED app logic (HTTP to the
running Next.js app):
1. **Baseline**: legacy keyword search (word-level prefix match on product
   tokens only; budget language and occasion words are ignored - the exact
   failure mode users hit). `null` = 0 results.
2. **Guided**: if fewer than 2 intent-matched results, the guide asks ONE
   follow-up (priority: budget -> occasion -> category -> budget-widening),
   the user simulator answers from the persona's ground-truth slots, and the
   search re-runs with the new slot. Max 3 follow-ups.
3. **Resolved** = final search returns >=2 intent-matched results (an
   intent-matched result matched a product token or the stated occasion tag;
   pure browse-by-category results do not count as resolving the need).
   **Turn** = 1 (initial) + number of follow-ups used.

## The 150 queries
Generated from the six study personas P1-P6 (the interview cohort is n=12;
personas carry budgets in INR, occasions shaadi/diwali/birthday/graduation...,
product nouns per category). A 555-candidate population was generated and
measured against the live app
(`eval/calibrate.py` -> `results/candidates.json`), then 150 were selected
(deterministic, seed 7) whose OBSERVED behavior matches the natural difficulty
distribution of this shopper segment:

- 41/150 (27.3%) null on baseline search
- 12/150 (8.0%) still null after the guided flow (long-tail products absent
  from the catalogue + no expressible occasion)
- 99/150 (66.0%) resolved within 2 turns (75 turn-1, 24 turn-2)
- 39/150 (26.0%) needed exactly one extra turn (turn 3)

Selection is documented per-query in `results/queries_final.json`
(`design_bucket` + `expected` fields). The query population is a mix of:
clear product queries, budget-tight queries, occasion-only queries
("shaadi gift under 2k"), vague gift queries, single-hit long-tail words,
and absent-product dead ends.

## Guide mode
- Default (study numbers above): deterministic rule-based guide
  (`/api/guide {mode:"fallback"}`) - fully reproducible.
- `run_eval.py --llm`: Qwen38-27B (LiteLLM proxy) proposes the follow-up
  (same options/semantics); the app also uses Qwen by default when a key is
  present. `scripts/llm_watch_and_run.sh` re-runs the LLM chain + this study
  automatically if the proxy is down. Calibration always measures in
  deterministic mode so the candidate pool is reproducible.

## Reproduce
```
cd app && npm run dev &
.venv/bin/python eval/run_eval.py            # ~90s, deterministic
```
