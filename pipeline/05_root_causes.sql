-- Stage 5: ROOT CAUSE ASSIGNMENT - 4-cause taxonomy, weighted pattern scoring.
-- Optional LLM-verified labels override SQL scoring where present.
CREATE OR REPLACE TABLE rc_scores AS
SELECT ck.*,
  3.0*(hit_zero::INT) +
  2.5*(hit_budget::INT) +
  1.5*(hit_occasion::INT) +
  1.0*(hit_trust::INT) AS score_any,
  hit_zero::INT AS s_zero_wrong,
  hit_budget::INT AS s_budget,
  hit_occasion::INT AS s_occasion,
  hit_trust::INT AS s_trust
FROM complaints_kept ck
WHERE complaint_flag = 1;

CREATE OR REPLACE TABLE root_causes AS
SELECT *,
  CASE
    WHEN s_zero_wrong = 1 AND s_budget = 1 THEN CASE WHEN s_occasion = 1 THEN 'occasion_blindness' ELSE 'zero_or_wrong' END
    WHEN s_zero_wrong = 1 THEN 'zero_or_wrong'
    WHEN s_budget = 1 AND s_occasion = 1 THEN 'occasion_blindness'
    WHEN s_budget = 1 THEN 'budget_mismatch'
    WHEN s_occasion = 1 THEN 'occasion_blindness'
    WHEN s_trust = 1 THEN 'trust_gap'
    ELSE 'other'
  END AS rc_sql
FROM rc_scores;

CREATE OR REPLACE TABLE rc_final AS
SELECT COALESCE(l.doc_id, r.doc_id) AS doc_id,
       COALESCE(l.root_cause, r.rc_sql) AS root_cause,
       COALESCE(l.label_source, 'sql') AS label_source,
       r.rating5, r.app
FROM root_causes r
LEFT JOIN read_parquet('data/out/llm_labeled.parquet', filename=false) l ON l.doc_id = r.doc_id;

CREATE OR REPLACE TABLE rc_summary AS
SELECT root_cause,
       COUNT(*) AS n,
       ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM rc_final), 1) AS pct,
       ROUND(AVG(CASE WHEN rating5 <= 3 THEN 1.0 ELSE NULL END), 3) AS low_rating_share,
       COUNT(DISTINCT app) AS n_apps
FROM rc_final GROUP BY root_cause ORDER BY n DESC;

CREATE OR REPLACE TABLE s5_rc AS
SELECT 'labeled' AS stage, COUNT(*) AS n FROM rc_final
UNION ALL SELECT 'llm_overridden', COUNT(*) FROM rc_final WHERE label_source = 'llm';
