"""Re-stage the Vercel deploy artifacts from the final pipeline outputs."""
import shutil
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
SRC, DST = BASE / "data", BASE / "extractor" / "deploy" / "data"
(DST / "out").mkdir(parents=True, exist_ok=True)
for name in ["funnel.json", "root_causes.json", "bayesian.csv", "by_source.csv",
             "trends_insights.json", "cluster_check.json"]:
    f = SRC / "out" / name
    if f.exists():
        shutil.copy(f, DST / "out" / name)
        print("staged", name)
f = SRC / "pipeline_counts.json"
if f.exists():
    shutil.copy(f, DST / "pipeline_counts.json")
    print("staged pipeline_counts.json")
