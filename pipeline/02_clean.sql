-- Stage 2: CLEAN - dedup, drop empties/deleted, language gate, PII scrub.
CREATE OR REPLACE TABLE reviews_dedup AS
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY source, doc_id ORDER BY date) AS rn
  FROM reviews_raw
) WHERE rn = 1;

CREATE OR REPLACE TABLE reviews_clean AS
SELECT
  source, doc_id,
  COALESCE(NULLIF(date,''), NULL) AS date,
  rating,
  regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      regexp_replace(trim(text), '[\r\n]+', ' '),
      '\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}\b', '[email]'),
      '\+?\d[\d\-\s]{7,}\d', '[phone]'),
      '(?i)(^|[^a-z/])u/[a-z0-9_]{2,}', '[user]'),
      ' +', ' ') AS text,
  helpful, app, country, sort_mode, url
FROM reviews_dedup
WHERE LENGTH(COALESCE(text,'')) >= 15
  AND LOWER(text) NOT LIKE '%[deleted]%'
  AND LOWER(text) NOT LIKE '%[removed]%'
  AND (LENGTH(regexp_replace(text, '[^a-zA-Z ]', '')) * 1.0 / GREATEST(LENGTH(text),1)) > 0.5;

CREATE OR REPLACE TABLE s2_clean AS
SELECT 'raw' AS stage, COUNT(*) AS n FROM reviews_raw
UNION ALL SELECT 'after_dedup', COUNT(*) FROM reviews_dedup
UNION ALL SELECT 'after_clean', COUNT(*) FROM reviews_clean;

-- Per-source, per-gate drop accounting (T2): conditions are non-exclusive,
-- so per-gate flags can sum to more than the net drop; net = raw - clean.
CREATE OR REPLACE TABLE s2_gates_by_source AS
SELECT source,
       COUNT(*) AS dedup_in,
       SUM(CASE WHEN LENGTH(COALESCE(text,'')) < 15 THEN 1 ELSE 0 END) AS drop_short,
       SUM(CASE WHEN LOWER(text) LIKE '%[deleted]%' OR LOWER(text) LIKE '%[removed]%' THEN 1 ELSE 0 END) AS drop_deleted,
       SUM(CASE WHEN (LENGTH(regexp_replace(text, '[^a-zA-Z ]', '')) * 1.0 / GREATEST(LENGTH(text),1)) <= 0.5 THEN 1 ELSE 0 END) AS drop_lang,
       (SELECT COUNT(*) FROM reviews_raw r2 WHERE r2.source = reviews_dedup.source) AS raw_in
FROM reviews_dedup
GROUP BY source
ORDER BY dedup_in DESC;
