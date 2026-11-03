"""Merge llm_labeled slice parquets into data/out/llm_labeled.parquet."""
from pathlib import Path
import pandas as pd

BASE = Path(__file__).resolve().parent.parent
OUT = BASE / "data" / "out" / "llm_labeled.parquet"
frames = sorted((BASE / "data" / "out").glob("llm_labeled.slice*.parquet"))
if not frames:
    print("no slices found")
    raise SystemExit(1)
d = pd.concat([pd.read_parquet(f) for f in frames], ignore_index=True)
d = d.drop_duplicates(subset=["doc_id"])
d.to_parquet(OUT, index=False)
print(f"merged {len(frames)} slices -> {len(d)} unique labels -> {OUT}")
