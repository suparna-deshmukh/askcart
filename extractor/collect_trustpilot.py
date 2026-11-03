"""
AskCart collector D9 - platform/brand reviews from Trustpilot.
Source: Kerassy/trustpilot-reviews-123k (huggingface.co, 123k rows) - the live
trustpilot.com API is behind an AWS WAF challenge, so the HF mirror is used
(documented). Adds a 5th review voice: marketplace/brand reputation reviews
(trust, delivery, returns, discovery) that sit outside any single app store.
Resume: CSV cached at data/raw/trustpilot/trustpilot_reviews_2005.csv.
Output: data/raw/trustpilot_raw.parquet (unified schema, search-UX-relevant rows).
Usage: .venv/bin/python extractor/collect_trustpilot.py [--max-rows 15000]
"""
import argparse
import csv
import os
import re
import subprocess
import sys
import time
from pathlib import Path

import pandas as pd

BASE = Path(__file__).resolve().parent.parent
RAW = BASE / "data" / "raw" / "trustpilot"
CSV = RAW / "trustpilot_reviews_2005.csv"
OUT = BASE / "data" / "raw" / "trustpilot_raw.parquet"
URL = "https://huggingface.co/datasets/Kerassy/trustpilot-reviews-123k"
CSV_URL = "https://huggingface.co/datasets/Kerassy/trustpilot-reviews-123k/resolve/main/trustpilot_reviews_2005.csv"
UA = "askcart-research/0.3"

RELEVANT = re.compile(
    r"\b(search|find|found|recommend|recommendation|suggestion|price|cheap|expensive|"
    r"cost|worth|quality|wrong|faulty|defective|deliver(y|ed)|return|refund|stock|"
    r"size|fit|customer ?service|support|disappoint|broke|broken|authentic|genuine|"
    r"fake|counterfeit|review|rating|stock|availability|hard to)\b", re.I)


def fetch():
    if CSV.exists() and CSV.stat().st_size > 1_000_000:
        return True
    RAW.mkdir(parents=True, exist_ok=True)
    tmp = CSV.with_suffix(".part")
    for attempt in range(3):
        subprocess.run(["curl", "-sL", "--max-time", "600", "-C", "-",
                        "-H", f"User-Agent: {UA}", CSV_URL, "-o", str(tmp)],
                       capture_output=True)
        if tmp.exists() and tmp.stat().st_size > 1_000_000:
            os.replace(tmp, CSV)
            return True
        time.sleep(5 * (attempt + 1))
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-rows", type=int, default=15000)
    a = ap.parse_args()
    if not fetch():
        print("trustpilot CSV download failed")
        sys.exit(1)
    rows, n_seen, n_rel = [], 0, 0
    with open(CSV, newline="", encoding="utf-8", errors="replace") as f:
        rd = csv.DictReader(f)
        for i, r in enumerate(rd):
            n_seen += 1
            title = (r.get("title") or "").strip()
            review = (r.get("review") or "").strip()
            text = f"{title} | {review}".strip(" |")
            if len(text) < 30:
                continue
            if not RELEVANT.search(text):
                continue
            n_rel += 1
            try:
                stars = int(float(r.get("stars", 0)))
            except Exception:
                stars = None
            company = (r.get("company") or "unknown").strip()
            rows.append({
                "source": "trustpilot",
                "doc_id": f"tp_{re.sub(r'[^a-z0-9]', '', company.lower())[:40]}_{i}",
                "date": None,
                "rating": stars if stars and 1 <= stars <= 5 else None,
                "text": text[:2000],
                "helpful": None,
                "app": company,
                "country": None,
                "sort_mode": "dataset",
                "url": URL,
            })
    d = pd.DataFrame(rows).drop_duplicates(subset=["doc_id"])
    if len(d) > a.max_rows:
        d = d.sample(n=a.max_rows, random_state=42)
    d = d.sort_values("doc_id").reset_index(drop=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    d.to_parquet(OUT, index=False)
    print(f"trustpilot: {n_rel} relevant of {n_seen} seen -> kept {len(d)} -> {OUT}")


if __name__ == "__main__":
    main()
