"""
AskCart D3b - App Store reviews from published datasets (fallback path).
Apple's customer-reviews RSS endpoint returned empty feeds for all probed app ids
(verified 2026-11-03, control test with Google Photos id 962194608 also empty),
so the agent falls back to public App Store review datasets:
  1. reapxdev/app-store-reviews-scraper (23,048 reviews; we keep shopping/
     grocery/travel-shopping apps only)
  2. Alpaca69B/reviews_appstore_amazon_absa (Amazon app reviews, 494 rows)
  3. live RSS rows already fetched by collect_appstore.py (Walmart/us 50)
Unified schema matches reviews_raw. reviewerName stripped (privacy).
"""
import hashlib
from pathlib import Path

import pandas as pd

BASE = Path(__file__).resolve().parent.parent
RAW = BASE / "data/raw"
OUT = RAW / "appstore_raw.parquet"
COLUMNS = ["source", "doc_id", "date", "rating", "text", "helpful", "app", "country", "sort_mode", "url"]

SHOPPING_APPS = {
    "noon Shopping, Food, Grocery": "noon",
    "TikTok - Videos, Shop & LIVE": "TikTok Shop",
    "TikTok - Videos, Shop und LIVE": "TikTok Shop",
    "TikTok: Vídeos, Músicas & LIVE": "TikTok Shop",
    "TikTok - Videos, Music & LIVE": "TikTok Shop",
    "talabat: Food, grocery & more": "talabat",
    "Careem: rides, food, grocery": "Careem",
    "Amazon Shopping": "Amazon",
    "Temu: Shop Like a Billionaire": "Temu",
    "SHEIN - Shopping Online": "SHEIN",
    "Walmart: Shopping & Savings": "Walmart",
    "Instacart: Groceries & Food": "Instacart",
    "DoorDash: Food, Grocery, More": "DoorDash",
    "Uber Eats: Food & Groceries": "Uber Eats",
    "Grubhub: Food Delivery": "Grubhub",
    "Booking.com: Hotel Angebote": "Booking.com",
    "Skyscanner Flüge Hotels Reisen": "Skyscanner",
    "trivago: Hotels vergleichen": "trivago",
    "idealo Flug Angebote": "idealo",
}


def main():
    frames = []
    df = pd.read_parquet(RAW / "appstore_hf1.parquet")
    sel = df[df["appName"].isin(SHOPPING_APPS)]
    rows = []
    for r in sel.itertuples():
        text = " ".join(str(x) for x in [r.reviewTitle, r.reviewBody] if x and str(x) != "nan" and str(x).strip())
        if not text.strip():
            continue
        rid = str(r.reviewId)
        rows.append({"source": "appstore", "doc_id": f"hf-{rid}", "date": str(r.reviewedAt)[:10],
                     "rating": int(r.rating), "text": text, "helpful": int(r.helpfulVoteCount or 0),
                     "app": SHOPPING_APPS[r.appName], "country": r.country,
                     "sort_mode": "dataset", "url": str(r.reviewUrl) if r.reviewUrl else ""})
    frames.append(pd.DataFrame(rows, columns=COLUMNS))
    print("scraper dataset (shopping apps):", len(rows))

    absa_rows = []
    import glob
    for f in sorted(glob.glob(str(RAW / "amazon_appstore_*.parquet"))):
        d = pd.read_parquet(f)
        for r in d.itertuples():
            text = " ".join(str(x) for x in [r.title, r.content] if x and str(x) != "nan" and str(x).strip())
            if not text.strip():
                continue
            rid = hashlib.sha1(f"{f}:{r.Index}".encode()).hexdigest()[:20]
            absa_rows.append({"source": "appstore", "doc_id": f"absa-{rid}", "date": "",
                              "rating": None, "text": text, "helpful": None,
                              "app": "Amazon", "country": "us", "sort_mode": "dataset", "url": ""})
    frames.append(pd.DataFrame(absa_rows, columns=COLUMNS))
    print("amazon absa:", len(absa_rows))

    live = pd.read_parquet(OUT) if OUT.exists() else pd.DataFrame(columns=COLUMNS)
    if len(live):
        frames.append(live)
        print("live rss rows kept:", len(live))

    out = pd.concat(frames, ignore_index=True).drop_duplicates("doc_id")
    out.to_parquet(OUT, index=False)
    print("appstore_raw total:", len(out), "->", OUT)
    print(out.groupby("app").size().to_string())


if __name__ == "__main__":
    main()
