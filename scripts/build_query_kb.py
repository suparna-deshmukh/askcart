#!/usr/bin/env python3
"""Item B (2026-11-06): mine the query knowledge base for the one-call
journey planner (app/lib/plan.js).

Sources (all in-repo, no LLM calls):
  - app/app/lib/sample_queries.js   (hero example chips)
  - eval/canaries.py                (111 canary queries)
  - eval/evalv2/panel.jsonl         (frozen eval v2 panel)
  - eval/semantic/panel.jsonl       (frozen semantic panel)
  - eval/results/queries_final.json (original n=150 study panel)
  - app/.analytics-state.json       (live search traffic, query field)

For each unique query we tag the FACETS the query already states
(budget / occasion / for_whom / size / spec / brand) using static word
lists that mirror guide.js/search.js semantics. The KB feeds the plan
prompt as few-shot examples: "query -> already stated: budget, for_whom"
so the model learns to never plan a question the query already answers.

Output: app/data/query_kb.json  {"count": N, "entries": [{q, facets}]}
Deterministic (sorted); re-run any time the sources change.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app"

BUDGET_WORDS = ["under", "kam", "budjet", "budget", "tak", "sasta", "cheap", "₹"]
OCCASION_WORDS = ["gift", "gifts", "present", "gifting", "diwali", "shaadi", "wedding",
                  "birthday", "anniversary", "party", "housewarming", "christmas",
                  "valentine", "graduation", "shower"]
FOR_WOM_WORDS = ["ammi", "amma", "mum", "mummy", "mom", "maa", "mama", "papa", "dad",
                 "abba", "father", "mother", "brother", "bhai", "bhaiya", "sister",
                 "behen", "bhen", "didi", "wife", "husband", "son", "daughter",
                 "beti", "beta", "cousin", "friend", "dost", "kid", "kids", "child",
                 "boy", "girl", "women", "men", "him", "her", "family", "parivar"]
SIZE_WORDS = ["size"]
SPEC_WORDS = ["ton", "star", "inch", "litre", "liter", "kg", "watt", "gb"]
BUDGET_NUM = re.compile(r"\b\d{2,6}\s*(?:k\b|\b)")


def tokens(q):
    return re.findall(r"[a-z0-9₹.]+", q.lower())


def facets_for(q, brands):
    toks = tokens(q)
    facets = set()
    for t in toks:
        t2 = t.strip(".")
        if t2 in BUDGET_WORDS:
            facets.add("budget")
        elif t2 in OCCASION_WORDS:
            facets.add("occasion")
        elif t2 in FOR_WOM_WORDS:
            facets.add("for_whom")
        elif t2 in SIZE_WORDS:
            facets.add("size")
        elif t2 in SPEC_WORDS:
            facets.add("spec")
        elif t2 in brands:
            facets.add("brand")
    if BUDGET_NUM.search(q):
        facets.add("budget")
    return sorted(facets)


def collect():
    qs = []
    # sample queries (JS export)
    try:
        m = re.search(r"export const SAMPLE_QUERIES = \[(.*?)\]",
                      (APP / "app" / "lib" / "sample_queries.js").read_text(), re.S)
        if m:
            qs += re.findall(r'"([^"]+)"', m.group(1))
    except FileNotFoundError:
        pass
    # canaries: tuples ("query", "kind")
    try:
        can = (ROOT / "eval" / "canaries.py").read_text()
        body = can[can.index("CANARIES = ["):]
        body = body[:body.index("]") if "]" in body else len(body)]
        qs += re.findall(r'"([^"]+)"', body)
    except (FileNotFoundError, ValueError):
        pass
    # jsonl panels
    for f in [APP.parent / "eval" / "evalv2" / "panel.jsonl",
              APP.parent / "eval" / "semantic" / "panel.jsonl"]:
        try:
            for line in f.read_text().splitlines():
                if line.strip():
                    try:
                        e = json.loads(line)
                        if e.get("query"):
                            qs.append(e["query"])
                    except json.JSONDecodeError:
                        pass
        except FileNotFoundError:
            pass
    # old study panel
    try:
        data = json.loads((ROOT / "eval" / "results" / "queries_final.json").read_text())
        items = data if isinstance(data, list) else data.get("queries", [])
        for e in items:
            if isinstance(e, str):
                qs.append(e)
            elif isinstance(e, dict) and e.get("query"):
                qs.append(e["query"])
    except (FileNotFoundError, json.JSONDecodeError, AttributeError):
        pass
    # live analytics traffic
    try:
        st = json.loads((APP / ".analytics-state.json").read_text())
        evs = st.get("events") or st.get("eventStream") or []
        if isinstance(evs, dict):
            evs = [v for v in evs.values() if isinstance(v, list)]
            evs = [e for sub in evs for e in sub]
        for e in evs:
            if isinstance(e, dict) and e.get("query") and e.get("type") in ("search", "search_start", "search_results"):
                qs.append(e["query"])
    except (FileNotFoundError, json.JSONDecodeError, TypeError, AttributeError):
        pass
    return qs


def main():
    cat = json.loads((APP / "public" / "catalog.json").read_text())
    brands = {str(i.get("brand")).lower() for i in cat if i.get("brand")}
    seen, entries = set(), []
    for q in collect():
        qn = q.strip()
        if not qn or len(qn) < 3:
            continue
        key = qn.lower()
        if key in seen:
            continue
        seen.add(key)
        facets = facets_for(qn, brands)
        if facets:
            entries.append({"q": qn, "facets": facets})
    entries.sort(key=lambda e: e["q"].lower())
    entries = entries[:300]
    out = {"count": len(entries), "entries": entries}
    out_path = APP / "data" / "query_kb.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False))
    from collections import Counter
    c = Counter()
    for e in entries:
        for f in e["facets"]:
            c[f] += 1
    print(f"query_kb: {len(entries)} entries -> {out_path}")
    print("facet coverage:", dict(c.most_common()))


if __name__ == "__main__":
    main()
