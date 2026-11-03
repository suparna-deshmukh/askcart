"""Run the 6-stage DuckDB pipeline and export artifacts.
Usage: .venv/bin/python pipeline/run_pipeline.py
Outputs: data/out/askcart.duckdb, data/out/{funnel,root_causes}.json,
         data/out/bayesian.csv, data/pipeline_counts.json,
         data/out/cluster_check.json (TF-IDF/kmeans silhouette, 4 clusters)
"""
import json
import sys
from pathlib import Path

import duckdb
import pandas as pd

BASE = Path(__file__).resolve().parent.parent
DB = BASE / "data/out/askcart.duckdb"
OUT = BASE / "data/out"
LLM_PQ = OUT / "llm_labeled.parquet"


RAW_ORDER = ["play_raw", "appstore_raw", "reddit_raw",
             "amazon_reviews_raw", "trustpilot_raw"]


def raw_union_sql():
    raw_dir = BASE / "data" / "raw"
    names = [f"{n}_raw.parquet" for n in RAW_ORDER if (raw_dir / f"{n}_raw.parquet").exists()]
    listed = {Path(n).stem for n in names}
    names += [p.name for p in sorted(raw_dir.glob("*_raw.parquet")) if p.stem not in listed]
    cols = "source, doc_id, date, rating, text, helpful, app, country, sort_mode, url"
    return "\nUNION ALL\n".join(
        f"SELECT {cols} FROM 'data/raw/{n}'" for n in names)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(DB))
    # ensure llm table exists even if LLM step was skipped
    if not LLM_PQ.exists():
        pd.DataFrame({"doc_id": [], "root_cause": [], "label_source": []},
                     ).to_parquet(LLM_PQ, index=False)
    counts = {}
    for i, stage in enumerate(["01_ingest", "02_clean", "03_normalize",
                               "04_complaints", "05_root_causes", "06_bayesian"], start=1):
        sql = (BASE / "pipeline" / f"{stage}.sql").read_text()
        if stage == "01_ingest":
            sql = sql.replace("{{RAW_UNION}}", raw_union_sql())
        con.execute(sql)
        print(f"stage {i} {stage}: OK")
    funnel = con.execute("SELECT k, v FROM s6_funnel").df()
    for _, r in funnel.iterrows():
        counts[r["k"]] = int(r["v"])
    rc = con.execute("""
        SELECT root_cause, n, pct, low_rating_share, n_apps FROM rc_summary""").df()
    counts["rc_breakdown"] = rc.to_dict("records")
    top_quotes = con.execute("""
        SELECT f.root_cause, rn.doc_id, rn.text, rn.app, rn.rating5
        FROM rc_final f
        JOIN complaints_kept ck ON ck.doc_id = f.doc_id
        JOIN reviews_norm rn ON rn.source = ck.source AND rn.doc_id = ck.doc_id
        QUALIFY ROW_NUMBER() OVER (PARTITION BY f.root_cause ORDER BY LENGTH(rn.text) DESC) <= 4
    """).df()
    counts["sample_quotes"] = top_quotes.to_dict("records")
    bayes = con.execute("SELECT * FROM bayesian_ratings").df()
    bayes.to_csv(OUT / "bayesian.csv", index=False)
    con.execute("COPY (SELECT source, COUNT(*) AS n FROM reviews_norm GROUP BY source ORDER BY n DESC) TO 'data/out/by_source.csv' (HEADER, DELIMITER ',')")
    s2 = con.execute("SELECT stage, n FROM s2_clean").df()
    counts["clean_stage"] = s2.to_dict("records")
    counts["raw_by_source"] = con.execute(
        "SELECT source, COUNT(*) AS n FROM reviews_raw GROUP BY 1 ORDER BY 2 DESC").df().to_dict("records")
    counts["clean_by_source"] = con.execute(
        "SELECT source, COUNT(*) AS n FROM reviews_clean GROUP BY 1 ORDER BY 2 DESC").df().to_dict("records")
    gates = con.execute("SELECT * FROM s2_gates_by_source ORDER BY dedup_in DESC").df()
    counts["clean_gates_by_source"] = gates.to_dict("records")
    gates.to_json(OUT / "gates_by_source.json", orient="records", indent=1)
    s3 = con.execute("SELECT * FROM s3_norm").df()
    counts["by_source"] = s3.to_dict("records")
    funnel.to_json(OUT / "funnel.json", orient="records", indent=1)
    rc.to_json(OUT / "root_causes.json", orient="records", indent=1)
    (BASE / "data/pipeline_counts.json").write_text(json.dumps(counts, indent=1, default=str))
    (BASE / "docs" / "evidence").mkdir(parents=True, exist_ok=True)
    top_quotes[["root_cause", "doc_id", "app", "rating5", "text"]].rename(
        columns={"doc_id": "source_doc_id"}).to_csv(
        BASE / "docs" / "evidence" / "review_quotes.csv", index=False)
    print(json.dumps({k: v for k, v in counts.items() if not isinstance(v, list)}, indent=1))

    # cluster validity check: TF-IDF + kmeans silhouette (complaint subset), k=2..6
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.cluster import KMeans
        from sklearn.metrics import silhouette_score
        texts = con.execute("""
            SELECT rn.text FROM reviews_norm rn
            JOIN complaints ck ON ck.source = rn.source AND ck.doc_id = rn.doc_id
            WHERE ck.complaint_flag = 1
        """).df()["text"].tolist()
        vec = TfidfVectorizer(max_features=4000, stop_words="english", min_df=20)
        X = vec.fit_transform(texts)
        sil = {}
        for k in range(2, 7):
            km = KMeans(n_clusters=k, random_state=42, n_init=4).fit(X)
            sil[k] = round(float(silhouette_score(X, km.labels_, sample_size=8000, random_state=42)), 4)
        (OUT / "cluster_check.json").write_text(json.dumps(sil, indent=1))
        print("silhouette by k:", sil, "-> best k =", max(sil, key=sil.get))
    except Exception as e:
        print("cluster check skipped:", type(e).__name__, str(e)[:120])
    con.close()


if __name__ == "__main__":
    main()
