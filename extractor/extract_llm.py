"""
AskCart D6 - LLM-verified root-cause labels.
Reads the stage-4 complaint subset from the pipeline DB, stratified-samples
(complaint_flag=1, all kw types), batch-labels with Qwen (LiteLLM proxy), and writes
data/out/llm_labeled.parquet (doc_id, root_cause, label_source='llm') which
stage 5 merges as an override. Zero-LLM mode: writes an empty file.
Usage: .venv/bin/python extractor/extract_llm.py [--sample N] [--batch N]
"""
import argparse
import sys
from pathlib import Path

import duckdb
import pandas as pd

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE / "extractor"))
from llm_client import is_available, chat_json

DB = BASE / "data/out/askcart.duckdb"
OUT = BASE / "data/out/llm_labeled.parquet"

TAXONOMY = """
RC codes (exactly one per review):
- ZERO_WRONG: query/search returned zero, empty or wrong/irrelevant results
- BUDGET: results did not match the stated/implicit budget; price filters too weak
- OCCASION: could not express or match occasion/use (gift, wedding, birthday, party, festival)
- TRUST: quality/trust/reviews/returns/delivery problems undermining purchase confidence
-NOT_SEARCH_RELATED: real app complaint but about something that is not
  search/UX-for-finding-products (crashes, login/account, app design, data
  usage, unrelated feature requests)
- OTHER: shopping-relevant but fits none of the above
"""

PROMPT = (
    "You are labeling e-commerce app review complaints for a search-UX study. "
    "For each numbered review, output its root-cause code.\n" + TAXONOMY +
    "Reply ONLY with JSON: {\"labels\": [{\"id\": 1, \"rc\": \"BUDGET\"}, ...]}\n"
    "Reviews:\n"
)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=600)
    ap.add_argument("--batch", type=int, default=20)
    ap.add_argument("--slice", default=None, help="i/n: shard the sample for parallel runs")
    a = ap.parse_args()
    if not is_available():
        pd.DataFrame(columns=["doc_id", "root_cause", "label_source"]).to_parquet(OUT, index=False)
        print("LLM unavailable -> wrote empty llm_labeled.parquet")
        return
    con = duckdb.connect(str(DB), read_only=True)
    df = con.execute("""
        SELECT c.doc_id, rn.text AS text, c.kw_type
        FROM complaints_kept c
        JOIN reviews_norm rn ON rn.source = c.source AND rn.doc_id = c.doc_id
        WHERE c.complaint_flag = 1
        ORDER BY HASH(c.doc_id)
    """).df()
    # stratified sample across kw types
    parts = []
    per = max(1, a.sample // max(1, df["kw_type"].nunique()))
    for _, g in df.groupby("kw_type"):
        parts.append(g.sample(n=min(per, len(g)), random_state=42))
    sample = pd.concat(parts, ignore_index=True)
    print(f"stratified sample: {len(sample)} of {len(df)} flagged", flush=True)
    if a.slice:
        i, n = (int(x) for x in a.slice.split("/"))
        sample = sample.iloc[i::n].reset_index(drop=True)
        print(f"slice {a.slice}: {len(sample)} rows", flush=True)

    rc_map = {"ZERO_WRONG": "zero_or_wrong", "BUDGET": "budget_mismatch",
              "OCCASION": "occasion_blindness", "TRUST": "trust_gap",
              "NOT_SEARCH_RELATED": "not_search_related", "OTHER": "other"}
    rows = []
    model_used = None
    for start in range(0, len(sample), a.batch):
        chunk = sample.iloc[start:start + a.batch]
        listing = "\n".join(f"{i+1}. [{r.kw_type}] {str(r.text)[:400]}" for i, r in enumerate(chunk.itertuples()))
        try:
            obj, model_used = chat_json([{"role": "user", "content": PROMPT + listing}],
                                        max_tokens=2000, max_retries=5, thinking=False)
        except Exception as e:
            print(f"batch {start // a.batch + 1} failed: {type(e).__name__} {str(e)[:120]}", flush=True)
            continue
        for lab in obj.get("labels", []):
            idx = lab.get("id")
            if isinstance(idx, int) and 1 <= idx <= len(chunk):
                rc = rc_map.get(str(lab.get("rc", "")).upper())
                if rc:
                    rows.append({"doc_id": chunk.iloc[idx - 1]["doc_id"],
                                 "root_cause": rc, "label_source": "llm"})
        print(f"batch {start//a.batch + 1}: {len(obj.get('labels', []))} labels", flush=True)
    out = pd.DataFrame(rows, columns=["doc_id", "root_cause", "label_source"])
    suffix = f".slice{a.slice.replace('/', '_')}" if a.slice else ""
    target = OUT.with_name(OUT.stem + suffix + ".parquet") if a.slice else OUT
    out.to_parquet(target, index=False)
    print(f"llm_labeled: {len(out)} rows (model {model_used}) -> {target}", flush=True)


if __name__ == "__main__":
    main()
