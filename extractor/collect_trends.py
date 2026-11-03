"""
AskCart insight tool D8 - demand & seasonality signals.
Two reliable public APIs (no key):
  1. Google Suggest autocomplete (hl=en-IN, gl=in) for gift/budget query seeds -
     what real Indian shoppers actually type (live demand proxy).
  2. Wikimedia pageviews (monthly) for occasion articles - seasonal interest
     curves that corroborate the occasion_blindness root cause.
Also attempts the official Google Trends explore endpoint once (often 429 from
datacenter IPs); recorded honestly in the output.
Output: data/out/trends_insights.json
Usage: .venv/bin/python extractor/collect_trends.py
"""
import json
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
OUT = BASE / "data" / "out" / "trends_insights.json"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 askcart-research/0.3"

SUGGEST_SEEDS = [
    "gift under 2000", "shaadi gift", "diwali gift ideas", "birthday gift for",
    "wedding gift under", "anniversary gift", "housewarming gift",
    "gifts for mother", "gift for newlyweds", "cheap gifts online india",
]
PAGEVIEW_ARTICLES = ["Diwali", "Christmas_in_India", "Wedding", "Birthday",
                     "Raksha_Bandhan", "Eid_al-Fitr"]


def get_json(url, timeout=20, ua=UA):
    req = urllib.request.Request(url, headers={"User-Agent": ua})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def suggest(seed):
    url = ("https://suggestqueries.google.com/complete/search?client=firefox"
           f"&hl=en-IN&gl=in&q={urllib.parse.quote(seed)}")
    try:
        data = get_json(url, timeout=15, ua="Mozilla/5.0")
        return data[1][:10] if isinstance(data, list) else []
    except Exception as e:
        return [f"error: {type(e).__name__}"]


def pageviews(article, start="2024090100", end="2026020100"):
    url = (f"https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/"
           f"en.wikipedia/all-access/user/{article}/monthly/{start}/{end}")
    try:
        d = get_json(url, timeout=20, ua="askcart-research/0.3")
        items = d.get("items", [])
        return [{"month": it["timestamp"][:6], "views": it["views"]} for it in items]
    except Exception as e:
        return [{"error": f"{type(e).__name__} {str(e)[:80]}"}]


def try_official_trends():
    req_body = json.dumps({"comparisonItem": [{"keyword": "diwali gifts", "geo": "IN",
                                               "time": "today 3-m"}], "category": 0, "property": ""})
    url = ("https://trends.google.com/trends/api/explore?hl=en-IN&tz=330"
           "&req=" + urllib.parse.quote(req_body))
    try:
        d = get_json(url, timeout=25)
        widgets = d.get("widgets", [])
        if widgets:
            return {"status": "ok", "widgets": [w.get("id") for w in widgets]}
        return {"status": "empty"}
    except Exception as e:
        return {"status": f"unavailable: {type(e).__name__} {str(e)[:80]}"}


def main():
    suggest_out = {}
    for s in SUGGEST_SEEDS:
        suggest_out[s] = suggest(s)
        time.sleep(0.4)
    seasonality, peaks = {}, {}
    for art in PAGEVIEW_ARTICLES:
        series = pageviews(art)
        seasonality[art] = series
        good = [x for x in series if "views" in x]
        if good:
            top = max(good, key=lambda x: x["views"])
            total = sum(x["views"] for x in good) or 1
            peaks[art] = {"peak_month": top["month"], "peak_views": top["views"],
                          "peak_share_pct": round(top["views"] * 100 / total, 1)}
        time.sleep(0.3)
    out = {
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "note": ("Demand proxies: Google Suggest autocomplete (IN) shows real "
                 "budget+gift query phrasing; Wikipedia monthly pageviews show "
                 "occasion seasonality (Diwali/Wedding/Birthday peaks). Official "
                 "Google Trends endpoint status recorded in trends_official."),
        "suggest": suggest_out,
        "seasonality": seasonality,
        "seasonal_peaks": peaks,
        "trends_official": try_official_trends(),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1))
    print(f"trends insights -> {OUT}")
    print(json.dumps(peaks, indent=1))


if __name__ == "__main__":
    main()
