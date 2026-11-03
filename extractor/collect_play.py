"""AskCart D4 - Google Play review collector (reused from photo_case, multi-app,
via google_play_scraper). Per (app, country, sort) count table; resume via parts.
Privacy: userName/userImage dropped immediately.
"""
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sources import PLAY_TABLE
from google_play_scraper import reviews as gp_reviews
from google_play_scraper import Sort

BASE = Path(__file__).resolve().parent.parent
PARTS_DIR = BASE / "data" / "parts" / "play"
LOG = BASE / "logs" / "collect_play.log"
COLUMNS = ["source", "doc_id", "date", "rating", "text", "helpful", "app", "country", "sort_mode", "url"]


def log(msg):
    line = f"{datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')} {msg}"
    print(line, flush=True)
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG, "a") as f:
        f.write(line + "\n")


def part_path(pkg, country, sort_name):
    return PARTS_DIR / f"{pkg}__{country}_{sort_name}.parquet"


def convert(rec, label, country, sort_name):
    at = rec.get("at")
    if isinstance(at, datetime):
        date_iso = at.replace(tzinfo=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    else:
        try:
            date_iso = datetime.fromtimestamp(int(at), tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
        except Exception:
            date_iso = ""
    return {"source": "play", "doc_id": str(rec.get("reviewId", "")), "date": date_iso,
            "rating": int(rec.get("score", 0) or 0), "text": rec.get("content") or "",
            "helpful": int(rec.get("thumbsUpCount", 0) or 0), "app": label,
            "country": country, "sort_mode": sort_name,
            "url": f"https://play.google.com/store/apps/details?id={rec.get('appID','')}"}


def fetch_combo(pkg, label, country, lang, count, sort_name):
    sort = Sort.NEWEST if sort_name == "newest" else Sort.MOST_RELEVANT
    p = part_path(pkg, country, sort_name)
    have = pd.read_parquet(p) if p.exists() else None
    seen = set(have["doc_id"].astype(str)) if have is not None else set()
    have_n = 0 if have is None else int(have["doc_id"].nunique())
    if have_n >= count:
        return 0
    remaining = count - have_n
    got, errors = 0, 0
    last_id = None
    fresh = []
    while remaining > 0:
        try:
            res, last_id = gp_reviews(pkg, lang=lang, country=country, count=min(200, remaining),
                                       sort=sort, continuation_token=last_id)
        except Exception as ex:
            errors += 1
            log(f"play {label}/{country}/{sort_name}: {type(ex).__name__} {str(ex)[:120]}")
            if errors >= 5:
                break
            time.sleep(3)
            continue
        for r in res:
            if r.get("reviewId") in seen:
                continue
            seen.add(r["reviewId"])
            fresh.append(convert(r, label, country, sort_name))
            got += 1
        remaining -= len(res)
        if not res:
            break
        time.sleep(1.0)
    if fresh:
        df_new = pd.DataFrame(fresh, columns=COLUMNS)
        merged = df_new if have is None else pd.concat([have, df_new], ignore_index=True)
        merged.drop_duplicates("doc_id").to_parquet(p, index=False)
    return got


def run(limit=None):
    PARTS_DIR.mkdir(parents=True, exist_ok=True)
    total = 0
    for pkg, label, combos in PLAY_TABLE:
        for country, lang, newest_n, rel_n in combos:
            for sort_name, count in (("newest", newest_n), ("relevant", rel_n)):
                if limit is not None and total >= limit:
                    break
                n = fetch_combo(pkg, label, country, lang, count, sort_name)
                total += n
                log(f"play {label}/{country}/{sort_name}: +{n}")
    files = list(PARTS_DIR.glob("*.parquet"))
    df = pd.concat([pd.read_parquet(f) for f in files], ignore_index=True)
    df = df.drop_duplicates("doc_id")
    out = BASE / "data" / "raw" / "play_raw.parquet"
    df.to_parquet(out, index=False)
    log(f"play merged: {len(df)} rows -> {out}")
    return len(df)


if __name__ == "__main__":
    lim = int(sys.argv[1]) if len(sys.argv) > 1 else None
    print("PLAY_DONE", run(lim))
