"""T9 retry pass: label the doc_ids still missing LLM labels (full coverage,
cheap calls: 200-char truncation, batch 20, thinking disabled).
Reuses extract_llm's deterministic sample. Skips doc_ids already labeled in
any llm_labeled*.parquet. Writes data/out/llm_labeled.retry_slice{i}.parquet.
Usage: .venv/bin/python scripts/retry_llm_labels.py --slice i/4
"""
import argparse, sys
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
PROMPT = ("You are labeling e-commerce app review complaints for a search-UX study. "
    "For each numbered review, output its root-cause code.\n" + TAXONOMY +
    "Reply ONLY with JSON: {\"labels\": [{\"id\": 1, \"rc\": \"BUDGET\"}, ...]}\n"
    "Reviews:\n")
RC_MAP = {"ZERO_WRONG": "zero_or_wrong", "BUDGET": "budget_mismatch",
          "OCCASION": "occasion_blindness", "TRUST": "trust_gap",
          "NOT_SEARCH_RELATED": "not_search_related", "OTHER": "other"}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=6041)
    ap.add_argument("--batch", type=int, default=20)
    ap.add_argument("--slice", default=None)
    a = ap.parse_args()
    con = duckdb.connect(str(DB), read_only=True)
    df = con.execute("""
        SELECT c.doc_id, rn.text AS text, c.kw_type
        FROM complaints_kept c
        JOIN reviews_norm rn ON rn.source = c.source AND rn.doc_id = c.doc_id
        WHERE c.complaint_flag = 1
        ORDER BY HASH(c.doc_id)
    """).df()
    parts = []
    per = max(1, a.sample // max(1, df["kw_type"].nunique()))
    for _, g in df.groupby("kw_type"):
        parts.append(g.sample(n=min(per, len(g)), random_state=42))
    sample = pd.concat(parts, ignore_index=True)
    if a.slice:
        i, n = (int(x) for x in a.slice.split("/"))
        sample = sample.iloc[i::n].reset_index(drop=True)
    # skip everything already labeled (any prior pass)
    labeled = set()
    for f in (BASE / "data" / "out").glob("llm_labeled*.parquet"):
        try:
            labeled |= set(pd.read_parquet(f)["doc_id"])
        except Exception:
            pass
    todo = sample[~sample["doc_id"].isin(labeled)].reset_index(drop=True)
    print(f"todo: {len(todo)} of {len(sample)} (already labeled: {len(labeled)})", flush=True)
    rows = []
    ok = fail = 0
    for start in range(0, len(todo), a.batch):
        chunk = todo.iloc[start:start + a.batch]
        listing = "\n".join(f"{i+1}. [{r.kw_type}] {str(r.text)[:200]}" for i, r in enumerate(chunk.itertuples()))
        try:
            obj, _ = chat_json([{"role": "user", "content": PROMPT + listing}],
                               max_tokens=1200, max_retries=2, thinking=False)
            ok += 1
        except Exception as e:
            fail += 1
            print(f"batch {start} failed: {str(e)[:80]}", flush=True)
            continue
        for lab in obj.get("labels", []):
            idx = lab.get("id")
            if isinstance(idx, int) and 1 <= idx <= len(chunk):
                rc = RC_MAP.get(str(lab.get("rc", "")).upper())
                if rc:
                    rows.append({"doc_id": chunk.iloc[idx - 1]["doc_id"],
                                 "root_cause": rc, "label_source": "llm"})
        if (start // a.batch) % 10 == 0:
            print(f"batch {start}: {len(rows)} rows so far (ok {ok} fail {fail})", flush=True)
    suffix = f".slice{a.slice.replace('/', '_')}" if a.slice else ""
    target = OUT.with_name(OUT.stem + f".retry{suffix}.parquet")
    pd.DataFrame(rows, columns=["doc_id", "root_cause", "label_source"]).to_parquet(target, index=False)
    print(f"retry labeled: {len(rows)} rows (ok {ok} fail {fail}) -> {target}", flush=True)

if __name__ == "__main__":
    main()
