"""AskCart D3 - App Store customer review RSS collector (reused from photo_case,
multi-app). Resolves trackId per country via itunes search, then
/customerreviews RSS pages (50/page). No author names stored.
"""
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sources import APPSTORE_TABLE, UA

BASE = Path(__file__).resolve().parent.parent
PARTS_DIR = BASE / "data" / "parts" / "appstore"
LOG = BASE / "logs" / "collect_appstore.log"
H = {"User-Agent": UA}
COLUMNS = ["source", "doc_id", "date", "rating", "text", "helpful", "app", "country", "sort_mode", "url"]


def log(msg):
    line = f"{datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')} {msg}"
    print(line, flush=True)
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG, "a") as f:
        f.write(line + "\n")


def resolve_id(term, country):
    r = requests.get("https://itunes.apple.com/search",
                     params={"term": term, "entity": "software", "country": country},
                     headers=H, timeout=20)
    if r.status_code != 200:
        return None
    results = r.json().get("results", [])
    for item in results:
        if item.get("trackName", "").strip().lower() == term.lower():
            return int(item["trackId"])
    first_word = term.split()[0].lower()
    for item in results:
        name = item.get("trackName", "").strip().lower()
        if name.startswith(first_word) and "seller" not in name and "panel" not in name:
            log(f"appstore prefix match: {term} -> {item.get('trackName')!r}")
            return int(item["trackId"])
    return None


def fetch_app(term, label, country, max_pages):
    p = PARTS_DIR / f"{label}__{country}.parquet"
    seen = set()
    if p.exists():
        try:
            seen = set(pd.read_parquet(p)["doc_id"].astype(str))
        except Exception:
            pass
    app_id = resolve_id(term, country)
    if not app_id:
        log(f"appstore {label}/{country}: id not resolved")
        return 0
    rows = []
    for page in range(1, max_pages + 1):
        url = (f"https://itunes.apple.com/{country}/rss/customerreviews/"
               f"page={page}/id={app_id}/sortby=mostrecent/json")
        try:
            r = requests.get(url, headers=H, timeout=30)
            if r.status_code != 200:
                log(f"appstore {label}/{country} p{page}: HTTP {r.status_code}")
                break
            data = r.json()
            entries = data["feed"].get("entry", [])
            entries = [e for e in entries if "im:rating" in e]
            if not entries:
                break
            for e in entries:
                txt = e.get("content", {}).get("label", "")
                if not txt or txt in ("[deleted]", "[removed]"):
                    continue
                rid = str(e.get("id", {}).get("attributes", {}).get("im:id", e.get("id", {}).get("label", "")))
                if rid in seen:
                    continue
                d = e.get("updated", {}).get("label", "")[:10]
                rows.append({"source": "appstore", "doc_id": f"{app_id}-{rid}", "date": d,
                             "rating": int(e["im:rating"]["label"]), "text": txt,
                             "helpful": None, "app": label, "country": country,
                             "sort_mode": "mostrecent",
                             "url": f"https://apps.apple.com/{country}/app/id{app_id}"})
            log(f"appstore {label}/{country} p{page}: +{len(entries)}")
        except Exception as ex:
            log(f"appstore {label}/{country} p{page}: {type(ex).__name__} {str(ex)[:120]}")
            break
        time.sleep(1)
    if rows:
        df = pd.DataFrame(rows, columns=COLUMNS)
        if p.exists():
            try:
                df = pd.concat([pd.read_parquet(p), df], ignore_index=True).drop_duplicates("doc_id")
            except Exception:
                pass
        df.to_parquet(p, index=False)
    return len(rows)


def run(limit=None):
    PARTS_DIR.mkdir(parents=True, exist_ok=True)
    total = 0
    for term, label, combos in APPSTORE_TABLE:
        for country, pages in combos:
            if limit is not None and total >= limit:
                break
            n = fetch_app(term, label, country, pages)
            total += n
    files = list(PARTS_DIR.glob("*.parquet"))
    if not files:
        log("appstore: no part files, skipping merge")
        return 0
    df = pd.concat([pd.read_parquet(f) for f in files], ignore_index=True).drop_duplicates("doc_id")
    out = BASE / "data" / "raw" / "appstore_raw.parquet"
    df.to_parquet(out, index=False)
    log(f"appstore merged: {len(df)} rows -> {out}")
    return len(df)


if __name__ == "__main__":
    lim = int(sys.argv[1]) if len(sys.argv) > 1 else None
    print("APPSTORE_DONE", run(lim))
