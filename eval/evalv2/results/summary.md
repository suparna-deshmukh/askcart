# Eval v2 — held-out panel, two arms

Panel: **100 queries, frozen in git before any arm was run** (real Google-Suggest-shaped 41, vague 25, Hinglish 14, typo 10, dead-end 10). Deduped against the 44 canaries and the old 150-query dev set.

Arms: **A baseline** = `naive` keyword search, one shot, no questions (the pre-guidance engine). **B guided** = live app path (guided scorer + ≤3 follow-up questions answered by a neutral deterministic simulator, client re-search + rollback semantics).
Relevance of each arm's top-3 judged by LLM (single LLM judge, thinking off; R/P/I per item; 0 unknowns).

| Metric | A baseline (naive) | B guided |
|---|---|---|
| Null rate (0 results) | 24.0% [16.7-33.2] | 0.0% [0.0-3.7] |
| App null (final < 2 intent-matched) | 28.0% [20.1-37.5] | 10.0% [5.5-17.4] |
| success@3 (≥1 relevant in top-3, LLM) | 44.7% [34.1-55.9] | 52.0% [42.3-61.5] |
| usable@3 (≥1 relevant or partial) | 82.9% [72.9-89.7] | 75.0% [65.7-82.5] |
| p50 / p95 latency ms | 54 / 131 | 64 / 737 |
| Questions / journey (avg) | – | 0.36 (max 3) |
| Rollback events (answer made it worse) | – | 8 turns across 5.0% of journeys |

Outcome classes (app-intent definition; LLM-judged below):

| Outcome | A | B |
|---|---|---|
| resolved | 72 | 90 |
| null | 23 | 0 |
| weak | 4 | 7 |
| substitute_shown | 0 | 3 |
| not_in_catalogue | 1 | 0 |

## Per-kind (LLM success@3 / usable@3)

| kind | n | A success@3 | B success@3 | A usable@3 | B usable@3 |
|---|---|---|---|---|---|
| real_suggest | 41 | 28.0% [14.3-47.6] | 53.7% [38.7-67.9] | 88.0% [70.0-95.8] | 80.5% [66.0-89.8] |
| vague | 25 | 70.8% [50.8-85.1] | 48.0% [30.0-66.5] | 95.8% [79.8-99.3] | 84.0% [65.3-93.6] |
| hinglish | 14 | 20.0% [5.7-51.0] | 64.3% [38.8-83.7] | 80.0% [49.0-94.3] | 71.4% [45.4-88.3] |
| typo | 10 | 62.5% [30.6-86.3] | 60.0% [31.3-83.2] | 62.5% [30.6-86.3] | 60.0% [31.3-83.2] |
| dead_end | 10 | 33.3% [12.1-64.6] | 30.0% [10.8-60.3] | 55.6% [26.7-81.1] | 50.0% [23.7-76.3] |

Products absent from the catalogue per the guided lexical probe: 3 (something for my room, office ke liye kuch, kettledrum).

## Failure examples (guided arm, all top-3 irrelevant per LLM)

- `gift under 2000` (real_suggest): Superhero Capes and Mask for Kids Superhero Costumes for Boy / SUNBVE Kids Girls Cute Fashion Soft Cotton Dress Socks Gift / Loritta 4 Pairs Womens Boot Socks Winter Warm Crochet Knitte
- `gift under 2000 for men` (real_suggest): Superhero Capes and Mask for Kids Superhero Costumes for Boy / SUNBVE Kids Girls Cute Fashion Soft Cotton Dress Socks Gift / Loritta 4 Pairs Womens Boot Socks Winter Warm Crochet Knitte
- `gift under 2000 for women` (real_suggest): Superhero Capes and Mask for Kids Superhero Costumes for Boy / SUNBVE Kids Girls Cute Fashion Soft Cotton Dress Socks Gift / Loritta 4 Pairs Womens Boot Socks Winter Warm Crochet Knitte
- `gift under 20000` (real_suggest): Superhero Capes and Mask for Kids Superhero Costumes for Boy / SUNBVE Kids Girls Cute Fashion Soft Cotton Dress Socks Gift / Loritta 4 Pairs Womens Boot Socks Winter Warm Crochet Knitte
- `gift under 2000 for marriage` (real_suggest): Cute Little Turtle Home Iwatch Bands, Smartwatch Bands Compa / Blue Rhinestone Bow Brooch Ladies Large Bow Badge Vintage Fa / Cute Cat Frog Rabbit Animal Pins, Personality Animation Enam
- `gift under 2000 for sister` (real_suggest): Superhero Capes and Mask for Kids Superhero Costumes for Boy / SUNBVE Kids Girls Cute Fashion Soft Cotton Dress Socks Gift / Loritta 4 Pairs Womens Boot Socks Winter Warm Crochet Knitte
- `gift under 2000 for wedding` (real_suggest): Sister Gifts from Sister Birthday Gift Ideas Sister Gifts fo / Funny Retro Vinyl Record Coasters for Drinks with Vinyl Reco / STREADVE Personalized Custom Pens with Name Engraved Logo Te
- `shaadi gift` (real_suggest): La Belleza red Rhinestones Luxury Hand-Made Bodice Beaded Ap / Urban Villa Tablecloth Cuisine Stripes Table Cloth Tabletop  / Anouk Bridal Lehenga Choli (Maroon)
- `something for my room` (vague): Bella Amici 925 Sterling Silver Necklaces For Women 1.3mm Ro / New Women's Cross-Body Casual Nylon Mobile Phone Cases Armba / LA LEELA Men's Regular Vacation Dashiki Sarong Long Pareo Be
- `new home stuff` (vague): Great Stuff LLC Polarized Square Sunglasses for Men and Wome / 2023 Advent Calendar Christmas Countdown Calendar for Kids 2 / Bookmarks for Women Funny Reader Gifts for Book Lovers Readi

## Interpretation & limitations (honest read)

- The old n=150 study (27.3% → 8.0% null) remains the *dev-set* result: its panel was calibrated against the live app, so it demonstrates mechanics, not shopper benefit. Eval v2 is the held-out check; both are reported, never blended.
- Relevance is judged by a **single LLM judge** (LLM, thinking off) with no human spot-check in this pass; there is no multi-annotator ground truth.
- `real_suggest` queries are Google-Suggest *autocompletes*, not logged shopper queries, and they are gift-heavy (a bias that favours this app's occasion strength).
- There are **no real users** on this deployment; the guided arm's answers come from a neutral deterministic simulator (middle budget band / first count-backed option).
- The catalogue is a demo catalogue (US-converted + synthetic India layer); absolute relevance numbers are indicative.
- The guided probe marks a product class "absent" only when it finds <2 intent matches lexically; a judgeable substitute may still be the right honest answer for some of those (e.g. a digital saxophone for "saxophone").
