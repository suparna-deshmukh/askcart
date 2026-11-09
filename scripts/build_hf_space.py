"""
Build the Hugging Face static space bundle (space_askcart/) from pipeline
artifacts - same hosting pattern as the photo_case static space.
Usage: .venv/bin/python scripts/build_hf_space.py
"""
import csv
import json
from pathlib import Path

import pandas as pd

BASE = Path(__file__).resolve().parent.parent
OUT = BASE / "space_askcart"
OUT.mkdir(exist_ok=True)


def load_json(name, d):
    p = d / name
    return json.loads(p.read_text()) if p.exists() else None


counts = load_json("pipeline_counts.json", BASE / "data")
funnel = load_json("funnel.json", BASE / "data" / "out")
rc = load_json("root_causes.json", BASE / "data" / "out")
trends = load_json("trends_insights.json", BASE / "data" / "out")
bay = pd.read_csv(BASE / "data" / "out" / "bayesian.csv")
bay = bay.sort_values("n", ascending=False).head(20)
bay_out = bay.to_dict("records")
for r in bay_out:
    for k in ("n", "n_total"):
        if r.get(k) is not None and pd.notna(r.get(k)):
            r[k] = int(float(r[k]))
    for k in ("n_comp", "mean_raw", "global_mean", "m", "bayesian_rating",
              "complaint_rate", "wilson_lb"):
        if r.get(k) is not None and pd.notna(r.get(k)):
            r[k] = round(float(r[k]), 3)

quotes = list(csv.DictReader(open(BASE / "docs" / "evidence" / "review_quotes.csv")))
for q in quotes:
    q["rating5"] = int(float(q["rating5"])) if q.get("rating5") else None

agent = [json.loads(l) for l in open(BASE / "logs" / "agent_decisions.jsonl") if l.strip()]
llm_cycles = [a for a in agent if a.get("mode") == "llm-agent"]

cat = json.loads((BASE / "app" / "public" / "catalog.json").read_text())
bands = {"<=2k": 0, "2-5k": 0, "5-10k": 0, "10-20k": 0, ">20k": 0}
for x in cat:
    v = x["price"]
    b = "<=2k" if v <= 2000 else "2-5k" if v <= 5000 else "5-10k" if v <= 10000 \
        else "10-20k" if v <= 20000 else ">20k"
    bands[b] += 1

summ_fb = load_json("summary.txt", BASE / "eval" / "results")
summ_llm = load_json("summary_llm.txt", BASE / "eval" / "results")

from datetime import datetime, timezone
data = {
    "title": "AskCart - Agentic E-Commerce Search Extractor",
    "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    "llm": "gemini-3-flash-preview (owner's Gemini API; no other model used)",
    "funnel": funnel,
    "counts": {k: v for k, v in counts.items() if not isinstance(v, list)},
    "by_source": list(csv.DictReader(open(BASE / "data" / "out" / "by_source.csv"))),
    "root_causes": rc,
    "quotes": quotes,
    "bayesian": bay_out,
    "trends": trends,
    "agent": {
        "total_cycles": len(agent),
        "llm_cycles": len(llm_cycles),
        "model": "gemini-3-flash-preview",
        "tool_catalog": ["fetch_play", "fetch_appstore", "fetch_reddit",
                          "fetch_amazon_reviews", "fetch_trustpilot",
                          "fetch_trends", "finish"],
        "decisions": agent[-24:],
    },
    "study": {"deterministic": summ_fb, "llm": summ_llm},
    "catalog": {"skus": len(cat), "bands": bands,
                "occasion_tagged": sum(1 for x in cat if x["tags"]),
                "source": "milistu/AMAZON-Products-2023 (HF), USD->INR x83.5"},
    "vercel_probe_url": None,  # filled once the Vercel function deploys
}
(OUT / "data.json").write_text(json.dumps(data, ensure_ascii=False))

import shutil
figs = ["funnel.png", "root_causes.png", "bayesian_ratings.png",
        "study_turns.png", "trends_seasonality.png", "catalog_bands.png"]
for f in figs:
    shutil.copy(BASE / "docs" / "evidence" / "figures" / f, OUT / "figures" / f)

print("data.json:", (OUT / "data.json").stat().st_size // 1024, "KB")
print("quotes:", len(quotes), "| agent decisions:", len(agent),
      "| llm cycles:", len(llm_cycles), "| bayesian rows:", len(bay_out))
