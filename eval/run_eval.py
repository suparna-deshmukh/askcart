"""
AskCart evaluation harness (n=150).
Runs each query through the DEPLOYED app logic (HTTP):
  1. baseline strict search  ->  null? (0 results)
  2. if <2 results: guided follow-up loop (max 3), user simulator answers
     from the persona's ground-truth slots.
Metrics: baseline null %, guided null %, resolved % (final >=2),
resolved-by-turn-2 %, per-turn distribution, guide mode (gemini/fallback).
Usage: .venv/bin/python eval/run_eval.py [--url http://localhost:3000]
"""
import argparse
import json
import re
import sys
import time
import urllib.request
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from queries import build_150

BASE = Path(__file__).resolve().parent.parent
OUT = BASE / "eval" / "results"
GUIDE_MODE = "fallback"


def post(url, payload, retries=3):
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                         headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception as e:
            last = e
            time.sleep(2 * (i + 1))
    raise last


OCC_MAP = {
    "gift": "gift", "gifts": "gift", "present": "gift",
    "birthday": "birthday", "bday": "birthday",
    "wedding": "wedding", "shaadi": "wedding", "bridal": "wedding", "baraat": "wedding",
    "anniversary": "anniversary", "party": "party", "diwali": "diwali",
    "christmas": "christmas", "valentines": "valentines", "graduation": "graduation",
    "housewarming": "housewarming", "baby": "baby-shower",
    "everyday": None, "daily": None, "everyday use": None, "daily use": None,
}


def pick_option(guide, persona):
    opts = guide.get("options", [])
    gtype = guide.get("type", "category")
    if gtype == "budget":
        def val(o):
            m = re.search(r"(\d[\d,]*)", str(o))
            return int(m.group(1).replace(",", "")) if m else 0
        target = persona["budget"] or 2000
        best = min(opts, key=lambda o: abs(val(o) - target))
        return str(best)
    if gtype == "occasion":
        pref = persona["occasion"]
        if pref:
            for o in opts:
                key = str(o).strip().lower().split("/")[0]
                if OCC_MAP.get(key) == pref or str(o).lower().startswith(pref):
                    return str(o)
        else:
            for o in opts:
                if str(o).strip().lower() in ("everyday use", "daily use", "no occasion", "everyday"):
                    return str(o)
        for o in opts:
            if OCC_MAP.get(str(o).strip().lower().split("/")[0]) is not None:
                return str(o)
        return str(opts[0])
    # category
    cat = (persona["category"] or "").lower()
    for o in opts:
        if cat and (cat in str(o).lower() or str(o).lower() in cat):
            return str(o)
    for o in opts:
        if cat and cat.split()[0] in str(o).lower():
            return str(o)
    return str(opts[0])


def map_answer(guide, chip):
    """mirror of app pickChip: chip -> search opts"""
    if guide.get("type") == "budget":
        n = re.search(r"(\d[\d,]*)", str(chip))
        return {"budget": int(n.group(1).replace(",", "")) if n else 2000}
    if guide.get("type") == "occasion":
        key = str(chip).strip().lower().split("/")[0]
        m = {"gift": "gift", "birthday": "birthday", "wedding": "wedding", "shaadi": "wedding",
             "anniversary": "anniversary", "party": "party", "diwali": "diwali",
             "christmas": "christmas", "valentines": "valentines", "graduation": "graduation",
             "housewarming": "housewarming", "everyday": None, "daily": None}
        return {"occasion": m.get(key)}
    if guide.get("type") == "brand":
        return {"brand": None if "no preference" in str(chip).lower() or "best rated" in str(chip).lower() else chip}
    return {"category": chip}


def intent_count(results):
    return sum(1 for r in results if r.get("intent"))


def run_one(url, q):
    rec = {"id": q["id"], "query": q["query"], "persona": q["persona"],
           "design_bucket": q["design_bucket"]}
    r0 = post(url + "/api/search", {"query": q["query"], "naive": True})
    rec["baseline_n"] = len(r0["results"])
    rec["baseline_null"] = rec["baseline_n"] == 0
    if intent_count(r0["results"]) >= 2:
        rec.update(resolved=True, turns=1, final_n=rec["baseline_n"], guide_mode=None,
                   answers=[])
        return rec
    turns, final, answers, modes = 1, intent_count(r0["results"]), [], None
    for turn in range(2, 5):
        if final >= 2:
            break
        g = post(url + "/api/guide", {"query": q["query"], "n_results": final,
                                      "asked": answers,
                                      **({"mode": GUIDE_MODE} if GUIDE_MODE else {})})
        guide = g.get("guide")
        modes = g["mode"]
        if not guide:
            break  # policy exhausted its questions - stop (counted as unresolved)
        chip = pick_option(guide, q)
        answers.append(f"{guide.get('type')}:{chip}")
        # app semantics: each follow-up sends only the latest answer (relax=True)
        new_opts = map_answer(guide, chip)
        body = {"query": q["query"], "relax": True}
        for k, v in new_opts.items():
            if v is not None:
                body[k] = v
        r = post(url + "/api/search", body)
        final = intent_count(r["results"])
        turns = turn
        if final >= 2:
            break
    rec.update(resolved=final >= 2, turns=turns, final_n=final,
               guide_mode=modes, answers=answers)
    return rec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:3000")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--llm", action="store_true", dest="llm",
                    help="use the Qwen LLM guide (default: deterministic fallback)")
    ap.add_argument("--gemini", action="store_true", dest="llm",
                    help=argparse.SUPPRESS)  # deprecated alias
    a = ap.parse_args()
    global GUIDE_MODE
    GUIDE_MODE = None if a.llm else "fallback"
    OUT.mkdir(parents=True, exist_ok=True)
    final_path = BASE / "eval/results/queries_final.json"
    if final_path.exists():
        queries = json.loads(final_path.read_text())
        print(f"using calibrated query set: {final_path} (n={len(queries)})")
    else:
        queries = build_150()
    if a.limit:
        queries = queries[:a.limit]
    recs = []
    for i, q in enumerate(queries):
        recs.append(run_one(a.url, q))
        time.sleep(0.15)
        if (i + 1) % 25 == 0:
            print(f"{i+1}/{len(queries)} done", flush=True)

    n = len(recs)
    base_null = sum(1 for r in recs if r["baseline_null"])
    guided_null = sum(1 for r in recs if not r["resolved"])
    resolved = sum(1 for r in recs if r["resolved"])
    by_t1 = sum(1 for r in recs if r["resolved"] and r["turns"] == 1)
    by_t2 = sum(1 for r in recs if r["resolved"] and r["turns"] == 2)
    by_t3 = sum(1 for r in recs if r["resolved"] and r["turns"] == 3)
    by_t4 = sum(1 for r in recs if r["resolved"] and r["turns"] >= 4)
    modes = Counter(r["guide_mode"] for r in recs if r["guide_mode"])
    summary = {
        "n": n,
        "baseline_null_pct": round(base_null / n * 100, 1),
        "guided_null_pct": round(guided_null / n * 100, 1),
        "resolved_pct": round(resolved / n * 100, 1),
        "resolved_by_turn2_pct": round((by_t1 + by_t2) / n * 100, 1),
        "resolved_exactly_turn2_pct": round(by_t2 / n * 100, 1),
        "turn_distribution": {"t1": by_t1, "t2": by_t2, "t3": by_t3, "t4+": by_t4,
                              "unresolved": guided_null},
        "guide_mode": dict(modes),
    }
    suffix = "" if GUIDE_MODE == "fallback" else "_llm"
    (OUT / f"results{suffix}.json").write_text(json.dumps({"summary": summary, "records": recs}, indent=1))
    (OUT / f"summary{suffix}.txt").write_text(json.dumps(summary, indent=1))
    print(json.dumps(summary, indent=1))
    # bucket audit
    buckets = Counter()
    for r in recs:
        key = r["design_bucket"]
        buckets[(key, "resolved_t" + str(r["turns"]) if r["resolved"] else "unresolved")] += 1
    print("bucket audit:")
    for k, v in sorted(buckets.items()):
        print("  ", k, v)


if __name__ == "__main__":
    main()
