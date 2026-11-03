-- Stage 4: COMPLAINT GATE - lexicon of search/purchase pain.
-- complaint = lexicon hit AND (rating<=3 OR reddit). Plus 10% random control
-- of non-flagged rows (mirrors photo_case control_rate=0.1) for recall checks.
CREATE OR REPLACE TABLE lexicon_hits AS
SELECT source, doc_id, rating5, app,
  regexp_matches(LOWER(text),
    '(no results|no matching|nothing (shows|to show|came|appeared)|empty results|zero results|search (doesn.t|does not|don.t|do not).{0,20}(work|find|show|return)|can.t find|cannot find|could not find|unable to find|keeps (saying|showing) no|wrong (item|product|result|size|one)|irrelevant|not relevant|unrelated|different (item|product|from what)|not what (i|i.) (wanted|searched|ordered|was looking)|search result.{0,15}(bad|poor|awful|terrible|wrong|useless)|garbage (results|search)|useless search|search is (bad|poor|terrible|awful|useless|broken|worst|horrible))')
  AND (rating5 <= 4 OR rating5 IS NULL) AS hit_zero,
  regexp_matches(LOWER(text),
    '((too|really|so|very|extremely) (expensive|pricey|costly)|overpric|unreasonable (price|pricing|cost)|price (hike|increased|is (too|so|really)|higher than)|budget|afford|can.t afford|cheaper option|not worth (the price|it|the money)|waste of (money|cash|rupees)|pricey|prices? (are |was |is )(high|too high|inflated)|double charged|extra charge)')
  AND (rating5 <= 4 OR rating5 IS NULL) AS hit_budget,
  regexp_matches(LOWER(text),
    '((gift|gifts|present|occasion|wedding|birthday|anniversary|party|festival|diwali|valentine|shaadi|bachelor|engag) (for|to|season|shopping|idea)|(looking|search|find|find)ing? (for )?(a |an |some )?(gift|present|something nice).{0,40}(for|occasion|wedding|birthday|party|anniversary)|search.{0,20}(gift|occasion|wedding|birthday|party|anniversary)|can.t (find|search).{0,25}(gift|occasion|wedding|birthday|party|anniversary))')
  AND (rating5 <= 4 OR rating5 IS NULL) AS hit_occasion,
  regexp_matches(LOWER(text),
    '(fake|counterfeit|scam|fraud|mislead|not (as |exactly )?(described|shown|in the (photo|picture|image|listing)|original|genuine|authentic)|quality (is|was|so) (bad|poor|terrible|awful|low|mediocre)|quality (issue|complaint|concern)|different from (the (photo|picture|description|listing)|what (i|i.) (was )?(shown|expected|ordered))|photo (is |was )?(mislead|different)|fake (review|rating)|reviews? (are |was |is )(fake|useless|lying)|can.t trust|no trust|bait and switch)')
  AND (rating5 <= 3 OR rating5 IS NULL) AS hit_trust
FROM reviews_norm;

CREATE OR REPLACE TABLE complaints AS
SELECT *,
  (hit_zero OR hit_budget OR hit_occasion OR hit_trust) AS complaint_flag,
  CASE
    WHEN hit_zero THEN 'zero_or_wrong'
    WHEN hit_budget THEN 'budget_mismatch'
    WHEN hit_occasion THEN 'occasion_blindness'
    ELSE 'trust_gap'
  END AS kw_type
FROM lexicon_hits;

CREATE OR REPLACE TABLE complaints_kept AS
SELECT source, doc_id, rating5, app, hit_zero, hit_budget, hit_occasion, hit_trust, complaint_flag, kw_type
FROM complaints WHERE complaint_flag = 1
UNION ALL
SELECT source, doc_id, rating5, app, hit_zero, hit_budget, hit_occasion, hit_trust, complaint_flag, kw_type
FROM (
  SELECT *, ROW_NUMBER() OVER (ORDER BY HASH(doc_id || source)) AS crn FROM complaints WHERE complaint_flag = 0
) WHERE crn <= (SELECT COUNT(*) FILTER (WHERE complaint_flag = 0) * 0.10 FROM complaints);

CREATE OR REPLACE TABLE s4_gate AS
SELECT 'flagged' AS stage, COUNT(*) AS n FROM complaints WHERE complaint_flag = 1
UNION ALL SELECT 'with_control_kept', COUNT(*) FROM complaints_kept;
