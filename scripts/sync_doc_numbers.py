"""
T3: single source of truth for catalogue numbers in PROJECT.md.

Generates the entire "### 5.6 Catalogue profile" section from
app/public/catalog.json using exactly the same math as
/app/api/analytics/catalog (same bands, same quantile method).

Usage:
  .venv/bin/python scripts/sync_doc_numbers.py          # rewrite the block
  .venv/bin/python scripts/sync_doc_numbers.py --check  # fail (exit 1) on drift

Also stamps the "Last updated:" line in the PROJECT.md header from the
newest artifact mtime (eval results, data/out, catalogue).
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
DOC = BASE / "PROJECT.md"
CATALOG = BASE / "app/public/catalog.json"
BEGIN = "<!-- sync:catalog:begin -->"
END = "<!-- sync:catalog:end -->"

PRICE_BANDS = [("under \u20b92k", 0, 2000), ("\u20b92k\u20135k", 2000, 5000),
               ("\u20b95k\u201310k", 5000, 10000), ("\u20b910k\u201320k", 10000, 20000),
               ("over \u20b920k", 20000, float("inf"))]
RATING_BUCKETS = [("4.5+", 4.5, 6), ("4.0\u20134.5", 4.0, 4.5), ("3.5\u20134.0", 3.5, 4.0),
                  ("3.0\u20133.5", 3.0, 3.5), ("under 3.0", 0, 3.0)]


def median(sorted_vals):
    n = len(sorted_vals)
    if not n:
        return 0
    mid = n // 2
    return sorted_vals[mid] if n % 2 else (sorted_vals[mid - 1] + sorted_vals[mid]) / 2


def pct(sorted_vals, p):
    return sorted_vals[min(len(sorted_vals) - 1, int(p * len(sorted_vals)))]


def inr(x):
    return "\u20b9" + f"{int(round(x)):,}"


def profile():
    cat = json.load(open(CATALOG))
    n = len(cat)
    prices = sorted(x["price"] for x in cat)
    ratings = [x["rating"] for x in cat]
    nr = sorted(x["num_ratings"] for x in cat)

    by_cat, by_brand, by_tag = {}, {}, {}
    branded = 0
    origins = {"us_converted": 0, "india_layer": 0}
    for it in cat:
        origins[it.get("origin", "us_converted")] += 1
        c = by_cat.setdefault(it["category"], {"n": 0, "sum": 0, "prices": []})
        c["n"] += 1; c["sum"] += it["price"]; c["prices"].append(it["price"])
        b = (it.get("brand") or "").strip()
        if b:
            branded += 1
            # C2: retailers (Myntra private label) are branded SKUs but not
            # brands - excluded from the top-brand stats (matches the endpoint)
            if it.get("brand_type") != "retailer":
                bb = by_brand.setdefault(b, {"n": 0, "prices": []})
                bb["n"] += 1; bb["prices"].append(it["price"])
        for tg in it.get("tags") or []:
            by_tag[tg] = by_tag.get(tg, 0) + 1

    categories = sorted(by_cat.items(), key=lambda kv: -kv[1]["n"])
    top_brands = sorted(by_brand.items(), key=lambda kv: -kv[1]["n"])[:15]
    bands = [(lab, sum(1 for p in prices if lo <= p < hi)) for lab, lo, hi in PRICE_BANDS]
    buckets = [(lab, sum(1 for r in ratings if lo <= r < hi)) for lab, lo, hi in RATING_BUCKETS]
    rated = sum(1 for x in cat if x["num_ratings"] >= 100)
    tagged = sum(1 for x in cat if x.get("tags"))

    def band_line(i):
        lab, cnt = bands[i]
        return f"{lab} **{cnt/n*100:.1f}%** ({cnt:,})"

    lines = []
    ap = lines.append
    ap("Live endpoint `/api/analytics/catalog` over `app/public/catalog.json`")
    ap(f"({n:,} SKUs, INR pricing — India-oriented demo catalogue: "
       f"{origins['us_converted']:,} US-sourced listings converted at "
       f"₹83.5/$ + {origins['india_layer']:,} India layer):")
    ap("")
    ap(f"- **Origin (T7)**: {origins['us_converted']:,} US-sourced converted "
       f"(**{origins['us_converted']/n*100:.1f}%**) · {origins['india_layer']:,} "
       f"India layer (**{origins['india_layer']/n*100:.1f}%**) — per-SKU `origin` field")
    ap(f"- **Total {n:,} SKUs** \u00b7 {len(by_cat)} categories \u00b7 price "
       f"**{inr(prices[0])} \u2013 {inr(prices[-1])}**")
    ap(f"- **Median {inr(median(prices))}** \u00b7 average {inr(sum(prices)/n)} (skewed up by gold, ACs, jewellery) \u00b7 "
       f"p25 {inr(pct(prices, .25))} / p75 {inr(pct(prices, .75))} / p90 {inr(pct(prices, .90))} / p99 {inr(pct(prices, .99))}")
    ap("- **Price bands**: " + " \u00b7 ".join(band_line(i) for i in range(len(bands))))
    rb = " / ".join(f"{lab} **{cnt/n*100:.1f}%** ({cnt:,})" for lab, cnt in buckets)
    ap(f"- **Ratings**: avg {sum(ratings)/n:.2f}/5 \u00b7 buckets {rb} \u00b7 median "
       f"{int(median(nr))} ratings per product \u00b7 **{rated/n*100:.1f}%** ({rated:,} SKUs) have 100+ ratings")
    brand_bits = " \u00b7 ".join(
        f"{name} {bb['n']} ({inr(median(sorted(bb['prices'])))} median)"
        for name, bb in top_brands)
    ap(f"- **Brands**: {len(by_brand)} brands, {branded:,} branded SKUs "
       f"(**{branded/n*100:.1f}%**). Top 15 by SKU count with median price: {brand_bits}")
    ap(f"- **Occasion-tagged**: {tagged:,} SKUs (**{tagged/n*100:.1f}%**) \u2014 backend-only tags used by the search/guide engine")
    cat_bits = " \u00b7 ".join(
        f"{name} {c['n']:,} ({c['n']/n*100:.1f}%, {inr(median(sorted(c['prices'])))} median)"
        for name, c in categories[:24])
    ap(f"- **Top categories** (count, share, median price): {cat_bits}")
    return "\n".join(lines) + "\n"


def stamp_date():
    cands = list((BASE / "data/out").glob("*.json")) + \
            list((BASE / "eval/results").glob("*")) + [CATALOG]
    newest = max((p.stat().st_mtime for p in cands if p.exists()), default=0)
    return datetime.fromtimestamp(newest, tz=timezone.utc).strftime("%Y-%m-%d")


def main():
    text = DOC.read_text()
    if BEGIN not in text or END not in text:
        print("ERROR: sync markers missing in PROJECT.md")
        sys.exit(2)
    block = f"### 5.6 Catalogue profile (recomputed live per request)\n\n{profile()}"
    new_text, nsub = text.replace(f"{BEGIN}\n", f"{BEGIN}\n{block}", 1) if False else (text, 0)
    # replace between markers
    head, rest = text.split(BEGIN, 1)
    _, tail = rest.split(END, 1)
    candidate = f"{head}{BEGIN}\n{block}{END}{tail}"
    # date stamp
    date_line = f"> Last updated: {stamp_date()} (v7 build) \u00b7 Everything below is reproducible from this repo."
    if "Last updated:" in candidate:
        out_lines = []
        for ln in candidate.splitlines(keepends=True):
            if ln.startswith("> Last updated:"):
                out_lines.append(date_line + "\n")
            else:
                out_lines.append(ln)
        candidate = "".join(out_lines)
    if "--check" in sys.argv:
        if candidate == text:
            print("sync OK: PROJECT.md matches catalogue artifact")
        else:
            import difflib
            diff = "".join(difflib.unified_diff(text.splitlines(True), candidate.splitlines(True),
                                                "PROJECT.md", "generated"))
            print("SYNC DRIFT:\n" + diff[:4000])
            sys.exit(1)
    else:
        DOC.write_text(candidate)
        print(f"synced catalogue block + date stamp ({stamp_date()})")


if __name__ == "__main__":
    main()
