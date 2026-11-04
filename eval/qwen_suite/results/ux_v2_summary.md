# Qwen suite - UX panel v2 (current-build question moments)

Generated: 2026-11-04 20:43 UTC by `report_ux_v2.py` (all numbers from the verdict artifacts).
Panel: 300 moments (seed 20261105, sha 5e60d43bb88d58ad) sampled from 2575 question moments the current policy asks across 3000 persona journeys (1840 journeys asked at least one). Committed before judging; v1 frozen panel untouched.

## Result

- **PASS (appropriate, verdict A): 91.7% [ 80.4–96.7 ]** · mix: A=44 M=4 B=0 other=0
- no_question (policy no longer asks at the sampled step after a product change): 252 - excluded from the denominator (pre-agreed protocol).

| lang x question type | n | PASS |
|---|---|---|
| hi / for_whom | 9 | 88.9% [ 56.5–98.0 ] |
| hinglish / budget | 7 | 100.0% [ 64.6–100.0 ] |
| hi / budget | 7 | 100.0% [ 64.6–100.0 ] |
| en / occasion | 6 | 100.0% [ 61.0–100.0 ] |
| hinglish / for_whom | 6 | 83.3% [ 43.6–97.0 ] |
| en / budget | 5 | 100.0% [ 56.6–100.0 ] |
| en / size | 3 | 100.0% [ 43.8–100.0 ] |
| en / for_whom | 2 | 0.0% [ 0.0–65.8 ] |
| hinglish / occasion | 2 | 100.0% [ 34.2–100.0 ] |
| hinglish / size | 1 | 100.0% [ 20.7–100.0 ] |

## Non-A moments (4)

- `qs_uv2_0074` [M] (en/for_whom) Q='spectacles' ask='Got it - what budget should I keep in mind?' n_before=12 - budget fits but category is better
- `qs_uv2_0079` [M] (en/for_whom) Q='spectacles' ask='Got it - what budget should I keep in mind?' n_before=12 - budget fits but category is better
- `qs_uv2_0164` [M] (hinglish/for_whom) Q='bangle' ask='Chhota sa sawaal - kiske liye hai?' n_before=12 - for-whom fits bangles but weak
- `qs_uv2_0297` [M] (hi/for_whom) Q='घड़ी' ask='समझ गए — budget कितना रखें?' n_before=12 - Budget fits but category is better

Qwen usage (v2): 611 calls, ~220,170 est tokens. Single-LLM-judge caveat applies (same judge/prompt as v1).
