"""
Level-2 reviewer pass: sample queries of every type, run them through the
live app, and have Qwen judge the relevance of each top-3 result
(relevant / partial / irrelevant). Writes logs/relevance_audit_<ts>.jsonl
and a summary. Uses the same Qwen proxy config (no Gemini anywhere).
Usage: .venv/bin/python eval/relevance_audit.py [--url http://localhost:3000]
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.request
from collections import Counter
from datetime import datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
LOGS = BASE / "logs"

def env(name):
    v = os.environ.get(name)
    if v:
        return v.strip()
    try:
        for line in (BASE / ".env").read_text().splitlines():
            t = line.strip()
            if t and not t.startswith("#") and "=" in t:
                k, _, rest = t.partition("=")
                if k == name and rest.strip():
                    return rest.strip()
    except FileNotFoundError:
        pass
    return None

BASE_URL = (env("LLM_BASE_URL") or "").rstrip("/")
KEY = env("LLM_API_KEY")
MODEL = env("LLM_MODEL") or "qwen38-27b"

QUERIES = [
    # flagship / gift
    ("shaadi gift under 2k", "gift"),
    ("gift for 5 year old", "gift"),
    ("birthday gift under 1000", "gift"),
    ("anniversary gift for wife", "gift"),
    # budget
    ("budget headphones under 3000", "budget"),
    ("phone under 15k for college", "budget"),
    ("laptop for coding under 50k", "budget"),
    ("under 500", "vague_budget"),
    # occasion
    ("diwali decorations", "occasion"),
    ("wedding dress", "occasion"),
    ("christmas gifts", "occasion"),
    ("housewarming gift", "occasion"),
    # brand
    ("samsung phone", "brand"),
    ("apple watch", "brand"),
    ("jbl speaker", "brand"),
    ("nike shoes", "brand"),
    # category-specific
    ("air fryer", "category"),
    ("yoga mat", "category"),
    ("baby bottle", "category"),
    ("dog bed", "category"),
    ("guitar", "category"),
    ("blender", "category"),
    ("office chair", "category"),
    ("tripod", "category"),
    # vague
    ("something nice for mom", "vague"),
    ("surprise gift", "vague"),
    ("useful gadget", "vague"),
    # hinglish
    ("saste me headphones", "hinglish"),
    ("acha phone 15k tak", "hinglish"),
    # india catalogue (v4: occasion x stratum x spec x brand x jewellery)
    ("banarasi saree under 5k", "india_regional"),
    ("saree under 3k", "india_regional"),
    ("1.5 ton ac under 50k", "india_appliance"),
    ("inverter 1100va", "india_appliance"),
    ("7kg washing machine under 30k", "india_appliance"),
    ("dosa maker", "india_kitchen"),
    ("hawkins pressure cooker under 2k", "india_kitchen"),
    ("diwali lights", "india_festival"),
    ("mangalsutra under 5k", "india_jewellery"),
    ("gold bangle", "india_jewellery"),
    ("cricket bat", "india_sports"),
    ("bridal lehenga under 15k", "india_wedding"),
    ("kurti for ammi", "india_hinglish"),
    ("sasta phone under 10k", "india_hinglish"),
    # india catalogue v5 (R10 families)
    ("bp monitor for papa", "india_health"),
    ("sweater for papa under 2k", "india_winter"),
    ("nokia 105 phone", "india_feature_phone"),
    ("trolley bag under 5k", "india_travel"),
    ("diamond ring under 30k", "india_engagement"),
    ("mojari for men", "india_ethnic_shoes"),
    ("steel lunch box under 1k", "india_tiffin"),
    ("dabur honey under 400", "india_ayurveda"),
    # dead ends (should NOT resolve; judged as expected-fail)
    ("samovar", "dead_end"),
    ("gramophone", "dead_end"),
]

def post(url, payload, timeout=60):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)

def llm_judge(query, results):
    lines = "\n".join(f"{i+1}. [₹{r['price']}] {r['title'][:110]} (category: {r['category']})"
                      for i, r in enumerate(results[:3]))
    prompt = ('You are auditing an Indian e-commerce search. Query: "%s"\n'
              'Results:\n%s\n'
              'For EACH result number, classify: "relevant" (a shopper for this '
              'query would be happy), "partial" (loosely related / accessory / wrong '
              'price class), or "irrelevant". Answer JSON only: '
              '{"1": "...", "2": "...", "3": "..."}' % (query, lines))
    budget = 300
    last = None
    for attempt in range(4):
        body = json.dumps({"model": MODEL, "temperature": 0, "max_tokens": budget,
                           "messages": [{"role": "user", "content": prompt}]}).encode()
        req = urllib.request.Request(BASE_URL + "/chat/completions", data=body,
                                     headers={"Authorization": f"Bearer {KEY}",
                                              "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                d = json.load(r)
            choice = d["choices"][0]
            content = choice.get("message", {}).get("content")
            if content is None:
                if choice.get("finish_reason") == "length":
                    budget = int(budget * 3)
                    continue
                last = "empty completion"
                continue
            t = content.replace("```json", "").replace("```", "").strip()
            t = t[t.index("{"): t.rindex("}") + 1]
            v = json.loads(t)
            return v
        except Exception as e:
            last = e
        time.sleep(2)
    raise RuntimeError(f"llm judge failed: {last}")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:3000")
    a = ap.parse_args()
    LOGS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M")
    logp = LOGS / f"relevance_audit_{stamp}.jsonl"
    verdicts = Counter()
    by_kind = Counter()
    total_judged = 0
    with open(logp, "w") as f:
        for q, kind in QUERIES:
            r = post(a.url + "/api/search", {"query": q})
            res = r["results"][:3]
            rec = {"query": q, "kind": kind, "n_results": len(r["results"]),
                   "top": [{"sku": x["sku"], "title": x["title"][:100], "price": x["price"],
                            "category": x["category"]} for x in res], "verdicts": {}}
            if kind == "dead_end":
                rec["expected"] = "no_results_or_weak"
                f.write(json.dumps(rec) + "\n")
                continue
            try:
                v = llm_judge(q, res)
            except Exception as e:
                v = {"error": str(e)[:150]}
            rec["verdicts"] = v
            for i, x in enumerate(res):
                verdict = str(v.get(str(i + 1), "unknown")).lower()
                verdicts[verdict] += 1
                by_kind[(kind, verdict)] += 1
                total_judged += 1
            f.write(json.dumps(rec) + "\n")
            f.flush()
            time.sleep(0.5)
    rel = verdicts.get("relevant", 0)
    summary = {
        "ts": stamp, "queries": len(QUERIES), "results_judged": total_judged,
        "verdicts": dict(verdicts),
        "relevant_pct": round(100 * rel / total_judged, 1) if total_judged else None,
        "by_kind": {f"{k[0]}/{k[1]}": v for k, v in sorted(by_kind.items())},
        "log": str(logp),
    }
    out = BASE / "eval/results/relevance_summary.json"
    out.write_text(json.dumps(summary, indent=1))
    print(json.dumps(summary, indent=1))

if __name__ == "__main__":
    main()
