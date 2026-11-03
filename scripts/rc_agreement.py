"""T8/E1: scorer-vs-LLM agreement + LLM-only shares + India-only cut.
Reads the pipeline DB (rc_final, root_causes, complaints_kept, reviews_norm)
and writes data/out/rc_agreement.json.
Usage: .venv/bin/python scripts/rc_agreement.py
"""
import json
from pathlib import Path
import duckdb
import pandas as pd

BASE = Path(__file__).resolve().parent.parent
DB = BASE / "data/out/askcart.duckdb"
OUT = BASE / "data/out"

CLASSES = ["zero_or_wrong", "budget_mismatch", "occasion_blindness",
           "trust_gap", "other", "not_search_related"]


def f1_scores(y_true, y_pred, classes):
    per = {}
    for c in classes:
        tp = int(((y_true == c) & (y_pred == c)).sum())
        fp = int(((y_true != c) & (y_pred == c)).sum())
        fn = int(((y_true == c) & (y_pred != c)).sum())
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        per[c] = {"precision": round(prec, 3), "recall": round(rec, 3),
                  "f1": round(2 * prec * rec / (prec + rec) if prec + rec else 0.0, 3)}
    return per


def main():
    con = duckdb.connect(str(DB), read_only=True)
    d = con.execute("""
        SELECT f.doc_id, f.root_cause AS final, f.label_source,
               r.rc_sql, l.root_cause AS llm, rn.source, rn.country
        FROM rc_final f
        JOIN root_causes r ON r.doc_id = f.doc_id
        LEFT JOIN read_parquet('data/out/llm_labeled.parquet', filename=false) l
               ON l.doc_id = f.doc_id
        JOIN complaints_kept ck ON ck.doc_id = f.doc_id
        JOIN reviews_norm rn ON rn.source = ck.source AND rn.doc_id = ck.doc_id
    """).df()
    labeled = d[d["llm"].notna()].copy()

    n = len(labeled)
    acc = float((labeled["rc_sql"] == labeled["llm"]).mean())
    per_class = f1_scores(labeled["llm"], labeled["rc_sql"], CLASSES)
    macro_f1 = round(sum(v["f1"] for v in per_class.values()) / len(CLASSES), 3)

    ct = pd.crosstab(labeled["llm"], labeled["rc_sql"]).reindex(
        index=CLASSES, columns=CLASSES, fill_value=0)

    def dist(df):
        vc = df.value_counts()
        return {c: {"n": int(vc.get(c, 0)),
                    "pct": round(100.0 * int(vc.get(c, 0)) / len(df), 1)}
                for c in CLASSES}

    india = labeled[((labeled["source"] == "play") & (labeled["country"] == "in"))
                    | (labeled["source"] == "reddit")]
    all_india = d[((d["source"] == "play") & (d["country"] == "in"))
                  | (d["source"] == "reddit")]
    per_source = {}
    for src, g in d.groupby("source"):
        per_source[str(src)] = {"n_complaints": len(g), "final": dist(g["final"])}

    out = {
        "n_labeled": n,
        "agreement": {
            "accuracy": round(acc, 3),
            "macro_f1": macro_f1,
            "per_class_scoring_as_prediction_of_llm": per_class,
            "confusion": {
                "rows": "llm", "cols": "scorer", "classes": CLASSES,
                "matrix": ct.values.tolist(),
            },
        },
        "llm_only_all_labeled": dist(labeled["llm"]),
        "scorer_only_all_labeled": dist(labeled["rc_sql"]),
        "final_all_complaints_6041": dist(d["final"]),
        "india_only_cut": {
            "n": len(india),
            "n_all_india_complaints": len(all_india),
            "definition": "source=play & country=in, or source=reddit (India subreddits)",
            "final": dist(india["final"]),
            "final_all_india_complaints": dist(all_india["final"]),
            "llm": dist(india["llm"]),
        },
        "per_source": per_source,
    }
    (OUT / "rc_agreement.json").write_text(json.dumps(out, indent=1))
    print(json.dumps(out, indent=1)[:2000])


if __name__ == "__main__":
    main()
