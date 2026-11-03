"""
AskCart collector D7 - product-level Amazon reviews (with full text).
Source: McAuley-Lab/Amazon-Reviews-2023 (huggingface.co), per-category
raw/review_categories/*.jsonl. The full files are 0.3-1GB each, so each
category is sampled via an HTTP Range prefix (default 12MB, ~18k reviews) -
documented deterministic sampling of real product reviews.
Complements the *app* review sources (Play Store / App Store / Reddit) with
*product* reviews: what buyers actually complain about after purchase
(quality/trust, wrong item, price expectations).
Resume: cached under data/raw/amazon_reviews/.
Output: data/raw/amazon_reviews_raw.parquet (unified schema).
Usage: .venv/bin/python extractor/collect_amazon_reviews.py [--max-rows 40000]
"""
import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import pandas as pd

BASE = Path(__file__).resolve().parent.parent
RAW = BASE / "data" / "raw" / "amazon_reviews"
OUT = BASE / "data" / "raw" / "amazon_reviews_raw.parquet"
DS = "https://huggingface.co/datasets/McAuley-Lab/Amazon-Reviews-2023/resolve/main/"
CATEGORIES = ["All_Beauty", "Amazon_Fashion", "Handmade_Products", "Gift_Cards",
              "Health_and_Personal_Care", "Toys_and_Games",
              "Clothing_Shoes_and_Jewelry", "Home_and_Kitchen"]
URL = "https://huggingface.co/datasets/McAuley-Lab/Amazon-Reviews-2023"
UA = "askcart-research/0.3"
BYTES_PER_CAT = 12 * 1000 * 1000  # 12MB prefix per category


def fetch_prefix(cat, nbytes):
    f = RAW / f"{cat}.jsonl"
    if f.exists() and f.stat().st_size > 100_000:
        return f
    RAW.mkdir(parents=True, exist_ok=True)
    tmp = f.with_suffix(".part")
    for attempt in range(3):
        subprocess.run(["curl", "-sL", "--max-time", "600",
                        "-r", f"0-{nbytes - 1}",
                        "-H", f"User-Agent: {UA}",
                        DS + f"raw/review_categories/{cat}.jsonl",
                        "-o", str(tmp)], capture_output=True)
        if tmp.exists() and tmp.stat().st_size > 100_000:
            os.replace(tmp, f)
            return f
        time.sleep(4 * (attempt + 1))
    return None


def _int(v):
    try:
        return int(float(str(v).strip()))
    except Exception:
        return None


def parse_jsonl(f, cat):
    rows = []
    with open(f, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue  # truncated tail line from the range cut
            text = f"{d.get('title') or ''} | {d.get('text') or ''}".strip(" |")
            if len(text) < 40:
                continue
            rating = _int(d.get("rating"))
            ts = _int(d.get("timestamp"))
            hv = _int(d.get("helpful_vote"))
            rows.append({
                "source": "amazon_reviews",
                "doc_id": f"amz23_{cat.lower()}_{d.get('parent_asin', 'x')}_{abs(hash(d.get('user_id', ''))) % 10**8}",
                "date": pd.to_datetime(ts, unit="ms", utc=True).strftime("%Y-%m-%d") if ts else None,
                "rating": rating if rating and 1 <= rating <= 5 else None,
                "text": text[:2000],
                "helpful": hv,
                "app": f"Amazon/{cat}",
                "country": "US",
                "sort_mode": "dataset",
                "url": URL,
            })
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-rows", type=int, default=40000)
    ap.add_argument("--bytes-per-cat", type=int, default=BYTES_PER_CAT)
    a = ap.parse_args()
    all_rows = []
    for cat in CATEGORIES:
        f = fetch_prefix(cat, a.bytes_per_cat)
        if not f:
            print(f"{cat}: range download failed, skipped")
            continue
        rows = parse_jsonl(f, cat)
        all_rows.extend(rows)
        print(f"{cat}: {len(rows)} reviews (from {f.stat().st_size // 1024} KB prefix)", flush=True)
    if not all_rows:
        print("no data collected")
        sys.exit(1)
    d = pd.DataFrame(all_rows).drop_duplicates(subset=["doc_id"])
    if len(d) > a.max_rows:
        d = d.sample(n=a.max_rows, random_state=42)
    d = d.sort_values("doc_id").reset_index(drop=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    d.to_parquet(OUT, index=False)
    print(f"amazon_reviews_raw: {len(d)} rows -> {OUT}")


if __name__ == "__main__":
    main()
