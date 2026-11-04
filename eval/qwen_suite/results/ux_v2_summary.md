# Qwen suite - UX panel v2 (current-build question moments)

Generated: 2026-11-04 22:36 UTC by `report_ux_v2.py` (all numbers from the verdict artifacts).
Panel: 300 moments (seed 20261105, sha 5e60d43bb88d58ad) sampled from 2575 question moments the current policy asks across 3000 persona journeys (1840 journeys asked at least one). Committed before judging; v1 frozen panel untouched.

## Result

- **PASS (appropriate, verdict A): 70.1% [ 60.4–78.3 ]** · mix: A=68 M=25 B=4 other=0
- no_question (policy no longer asks at the sampled step after a product change): 203 - excluded from the denominator (pre-agreed protocol).

| lang x question type | n | PASS |
|---|---|---|
| hinglish / for_whom | 23 | 56.5% [ 36.8–74.4 ] |
| en / for_whom | 18 | 72.2% [ 49.1–87.5 ] |
| hi / for_whom | 17 | 64.7% [ 41.3–82.7 ] |
| hinglish / size | 7 | 14.3% [ 2.6–51.3 ] |
| hinglish / budget | 7 | 100.0% [ 64.6–100.0 ] |
| hi / budget | 7 | 100.0% [ 64.6–100.0 ] |
| en / occasion | 6 | 100.0% [ 61.0–100.0 ] |
| en / budget | 5 | 100.0% [ 56.6–100.0 ] |
| en / size | 3 | 100.0% [ 43.8–100.0 ] |
| hinglish / occasion | 2 | 100.0% [ 34.2–100.0 ] |
| en / brand | 1 | 0.0% [ 0.0–79.3 ] |
| hinglish / brand | 1 | 0.0% [ 0.0–79.3 ] |

## Non-A moments (29)

- `qs_uv2_0012` [M] (en/for_whom) Q='something nice for the anniversary' ask='Quick one - who's it for?' n_before=12 - for-whom fits but occasion is better
- `qs_uv2_0033` [M] (en/brand) Q='bedsheet' ask='Any brand preference? Or I'll pick the best-rated ' n_before=12 - brand fits but size is better
- `qs_uv2_0057` [M] (en/for_whom) Q='event gift under 1500' ask='Quick one - who's it for?' n_before=12 - for-whom fits gifts but budget already set
- `qs_uv2_0074` [M] (en/for_whom) Q='spectacles' ask='Got it - what budget should I keep in mind?' n_before=12 - budget fits but category is better
- `qs_uv2_0079` [M] (en/for_whom) Q='spectacles' ask='Got it - what budget should I keep in mind?' n_before=12 - budget fits but category is better
- `qs_uv2_0101` [M] (en/for_whom) Q='anniversary gift under 15000' ask='Quick one - who's it for?' n_before=12 - for-whom fits but budget already set
- `qs_uv2_0107` [M] (hinglish/for_whom) Q='anniversary ke liye gift 20000 se kam' ask='Chhota sa sawaal - kiske liye hai?' n_before=12 - for-whom fits but budget already set
- `qs_uv2_0108` [B] (hinglish/size) Q='didi ki shaadi ke liye kuch' ask='Samajh gaye — budget kitna rakhun?' n_before=12 - Query implies occasion, not budget
- `qs_uv2_0113` [M] (hinglish/size) Q='didi ki shaadi ke liye kuch' ask='Samajh gaye — budget kitna rakhun?' n_before=12 - occasion fits better than budget
- `qs_uv2_0115` [M] (hinglish/for_whom) Q='kuch acha anniversary ke liye' ask='Chhota sa sawaal - kiske liye hai?' n_before=12 - for-whom fits but occasion is better
- `qs_uv2_0116` [M] (hinglish/for_whom) Q='anniversary ke liye gift 20000 se kam' ask='Chhota sa sawaal - kiske liye hai?' n_before=12 - for-whom fits but budget already set
- `qs_uv2_0117` [M] (hinglish/for_whom) Q='kuch acha anniversary ke liye' ask='Chhota sa sawaal - kiske liye hai?' n_before=12 - for-whom fits but occasion is better
- `qs_uv2_0121` [M] (hinglish/for_whom) Q='gift ke liye gift 2000 se kam' ask='Chhota sa sawaal - kiske liye hai?' n_before=12 - for-whom fits gifts but budget already set
- `qs_uv2_0132` [M] (hinglish/for_whom) Q='gift ke liye gift 2000 se kam' ask='Chhota sa sawaal - kiske liye hai?' n_before=12 - for-whom fits gifts but budget already set
- `qs_uv2_0142` [B] (hinglish/brand) Q='bedsheet ghar wale ke liye' ask='Koi brand preference? Nahi toh best-rated dikhata ' n_before=12 - Brand preference irrelevant for generic query
- `qs_uv2_0158` [M] (hinglish/size) Q='didi ki shaadi ke liye kuch' ask='Samajh gaye — budget kitna rakhun?' n_before=12 - occasion fits better than budget
- `qs_uv2_0161` [M] (hinglish/size) Q='didi ki shaadi ke liye kuch' ask='Samajh gaye — budget kitna rakhun?' n_before=12 - occasion fits better than budget
- `qs_uv2_0164` [M] (hinglish/for_whom) Q='bangle' ask='Chhota sa sawaal - kiske liye hai?' n_before=12 - for-whom fits bangles but weak
- `qs_uv2_0169` [M] (hinglish/size) Q='didi ki shaadi ke liye kuch' ask='Samajh gaye — budget kitna rakhun?' n_before=12 - occasion fits better than budget
- `qs_uv2_0178` [M] (hinglish/for_whom) Q='birthday ke liye gift 2500 se kam' ask='Chhota sa sawaal - kiske liye hai?' n_before=12 - for-whom redundant with unisex option
- `qs_uv2_0179` [B] (hinglish/size) Q='didi ki shaadi ke liye kuch' ask='Samajh gaye — budget kitna rakhun?' n_before=12 - occasion fits better than budget
- `qs_uv2_0189` [M] (hinglish/for_whom) Q='birthday ke liye gift 2000 se kam' ask='Chhota sa sawaal - kiske liye hai?' n_before=12 - for-whom fits gift query well
- `qs_uv2_0203` [M] (hinglish/for_whom) Q='anniversary ke liye gift 15000 se kam' ask='Chhota sa sawaal - kiske liye hai?' n_before=12 - for-whom redundant with unisex option
- `qs_uv2_0215` [M] (hi/for_whom) Q='वर्सरी का उपहार 20000 से कम' ask='छोटा सा सवाल — किसके लिए है?' n_before=12 - for-whom redundant with budget anchor
- `qs_uv2_0230` [M] (hi/for_whom) Q='उपहार का उपहार 2000 से कम' ask='छोटा सा सवाल — किसके लिए है?' n_before=12 - for-whom fits gifts but budget already set

Qwen usage (v2): 793 calls, ~285,955 est tokens. Single-LLM-judge caveat applies (same judge/prompt as v1).
