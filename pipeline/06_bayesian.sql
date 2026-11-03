-- Stage 6: BAYESIAN RATINGS - per-app Bayesian average (shrinkage to global
-- mean, m = 100 min reviews) + complaint rates + Wilson lower bound.
CREATE OR REPLACE TABLE bayesian_ratings AS
WITH g AS (SELECT AVG(rating5) AS C FROM reviews_norm WHERE rating5 IS NOT NULL),
a AS (
  SELECT app,
         COUNT(*) FILTER (WHERE rating5 IS NOT NULL) AS n,
         SUM(rating5) AS s,
         AVG(rating5) AS mean_raw
  FROM reviews_norm WHERE rating5 IS NOT NULL GROUP BY app
),
c AS (
  SELECT rn.app,
         COUNT(*) AS n_total,
         SUM(CASE WHEN EXISTS (
             SELECT 1 FROM complaints ck
             WHERE ck.complaint_flag = 1 AND ck.source = rn.source AND ck.doc_id = rn.doc_id
         ) THEN 1 ELSE 0 END) AS n_comp
  FROM reviews_norm rn GROUP BY rn.app
)
SELECT a.app, a.n, a.mean_raw,
       g.C AS global_mean,
       100 AS m,
       ROUND((g.C * 100 + a.s) / (100 + a.n), 3) AS bayesian_rating,
       c.n_comp, c.n_total,
       ROUND(c.n_comp * 1.0 / c.n_total, 4) AS complaint_rate,
       ROUND(((c.n_comp*1.0/c.n_total + 1.9208/c.n_total)
              - 1.96*SQRT((c.n_comp*1.0/c.n_total*(1-c.n_comp*1.0/c.n_total) + 0.9604/c.n_total)/c.n_total))
             / (1 + 3.8416/c.n_total), 4) AS wilson_lb
FROM a JOIN g CROSS JOIN c ON a.app = c.app
ORDER BY bayesian_rating ASC;

CREATE OR REPLACE TABLE s6_funnel AS
SELECT 'raw_total' AS k, SUM(n) AS v FROM s1_ingest
UNION ALL SELECT 'clean', n FROM s2_clean WHERE stage = 'after_clean'
UNION ALL SELECT 'complaints_flagged', n FROM s4_gate WHERE stage = 'flagged'
UNION ALL SELECT 'root_cause_labeled', n FROM s5_rc WHERE stage = 'labeled'
UNION ALL SELECT 'rc_zero_or_wrong', n FROM rc_summary WHERE root_cause = 'zero_or_wrong'
UNION ALL SELECT 'rc_budget_mismatch', n FROM rc_summary WHERE root_cause = 'budget_mismatch'
UNION ALL SELECT 'rc_occasion_blindness', n FROM rc_summary WHERE root_cause = 'occasion_blindness'
UNION ALL SELECT 'rc_trust_gap', n FROM rc_summary WHERE root_cause = 'trust_gap';
