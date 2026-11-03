"""AskCart D2 - Reddit RSS search collector (reused from photo_case engine=rss).
Per (subreddit, query): /search.rss?q=...&limit=100. Resume via part files.
Privacy: author usernames stripped, [deleted] entries skipped.
"""
import hashlib
import html as html_mod
import re
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sources import REDDIT_TABLE, UA

BASE = Path(__file__).resolve().parent.parent
PARTS_DIR = BASE / "data" / "parts" / "reddit"
LOG = BASE / "logs" / "collect_reddit.log"
AT = {"a": "http://www.w3.org/2005/Atom"}
COLUMNS = ["source", "doc_id", "date", "rating", "text", "helpful", "app", "country", "sort_mode", "url"]
_USER = re.compile(r"(?<![\w/])u/[A-Za-z0-9_]{2,}")


def log(msg):
    line = f"{datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')} {msg}"
    print(line, flush=True)
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG, "a") as f:
        f.write(line + "\n")


def clean(h):
    t = _USER.sub("[user]", h or "")
    t = re.sub(r"<br\s*/?>", "\n", t)
    t = re.sub(r"</p>", "\n", t)
    t = re.sub(r"<[^>]+>", " ", t)
    t = html_mod.unescape(t)
    return re.sub(r"[ \t]+", " ", t).strip()


def part_path(sub, q):
    h = hashlib.sha256(q.encode()).hexdigest()[:10]
    return PARTS_DIR / f"{sub}__{h}.parquet"


def fetch_pair(sub, query):
    p = part_path(sub, query)
    seen = set()
    if p.exists():
        try:
            seen = set(pd.read_parquet(p)["doc_id"].astype(str))
        except Exception:
            pass
    url = f"https://www.reddit.com/search.rss?q={requests.utils.quote(query + ' sub:' + sub)}&limit=100"
    rows = []
    r = None
    for attempt in range(5):
        try:
            r = requests.get(url, headers={"User-Agent": UA}, timeout=30)
        except Exception as e:
            r = None
            log(f"reddit {sub} '{query}': {type(e).__name__}")
        if r is not None and r.status_code == 200 and len(r.content) > 100:
            break
        status = r.status_code if r is not None else "ERR"
        size = len(r.content) if r is not None else 0
        wait = 15 * (attempt + 1)
        log(f"reddit {sub} '{query}': HTTP {status} ({size}b) -> backoff {wait}s")
        time.sleep(wait)
    if r is None or r.status_code != 200 or len(r.content) <= 100:
        return 0
    try:
        root = ET.fromstring(r.content)
    except ET.ParseError as e:
        log(f"reddit {sub} '{query}': parse error {e}")
        return 0
    for e in root.findall("a:entry", AT):
        le = e.find("a:link", AT)
        link = le.get("href", "") if le is not None else ""
        if not link:
            continue
        title = clean(e.findtext("a:title", "", AT))
        content = clean(e.findtext("a:content", "", AT))
        if title in ("[deleted]", "[removed]") or not (title or content):
            continue
        text = (title + "\n" + content).strip()
        date = (e.findtext("a:updated", "", AT) or "")[:10]
        doc_id = hashlib.sha1(link.encode()).hexdigest()[:24]
        if doc_id in seen:
            continue
        rows.append({"source": "reddit", "doc_id": doc_id, "date": date, "rating": None,
                     "text": text, "helpful": None, "app": sub, "country": None,
                     "sort_mode": None, "url": link})
    log(f"reddit {sub} '{query}': {r.status_code} entries={len(rows)}")
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
    for sub, queries in REDDIT_TABLE:
        for q in queries:
            if limit is not None and total >= limit:
                break
            n = fetch_pair(sub, q)
            total += n
            time.sleep(6)
    # merge all parts
    files = list(PARTS_DIR.glob("*.parquet"))
    df = pd.concat([pd.read_parquet(f) for f in files], ignore_index=True).drop_duplicates("doc_id")
    out = BASE / "data" / "raw" / "reddit_raw.parquet"
    df.to_parquet(out, index=False)
    log(f"reddit merged: {len(df)} rows -> {out}")
    return len(df)


if __name__ == "__main__":
    lim = int(sys.argv[1]) if len(sys.argv) > 1 else None
    n = run(lim)
    print("REDDIT_DONE", n)
