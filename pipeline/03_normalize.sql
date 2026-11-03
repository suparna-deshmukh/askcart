-- Stage 3: NORMALIZE - rating sanity, helpful defaults, date sanity,
-- source-weight for downstream aggregation (reddit has no rating).
CREATE OR REPLACE TABLE reviews_norm AS
SELECT *,
  CASE WHEN rating BETWEEN 1 AND 5 THEN rating ELSE NULL END AS rating5,
  COALESCE(helpful, 0) AS helpful_n,
  CASE WHEN date >= '2015-01-01' AND date <= '2026-12-31' THEN 1 ELSE 0 END AS date_ok,
  CASE source WHEN 'play' THEN 1.0 WHEN 'appstore' THEN 1.0 ELSE 0.8 END AS source_w
FROM reviews_clean;

CREATE OR REPLACE TABLE s3_norm AS
SELECT source,
       COUNT(*) AS n,
       AVG(rating5) AS mean_raw_rating,
       STDDEV_SAMP(rating5) AS sd_raw_rating,
       COUNT(*) FILTER (WHERE rating5 IS NULL) AS n_no_rating,
       COUNT(*) FILTER (WHERE rating5 <= 3) AS n_low,
       COUNT(*) FILTER (WHERE date_ok = 1) AS n_date_ok
FROM reviews_norm GROUP BY source ORDER BY n DESC;
