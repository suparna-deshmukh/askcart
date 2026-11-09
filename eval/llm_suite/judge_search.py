"""
LLM suite - SEARCH dimension (400 cases).
For each frozen query: POST /api/search, take the top-3 results (response
order = what the shopper sees), LLM judges each R/P/I (one call per batch
of 20 queries). PASS (usable@3) = at least one R or P in top-3;
STRICT = top-1 is R. Resume-safe: skips ids already in verdicts file.

Usage: .venv/bin/python eval/llm_suite/judge_search.py [--url http://localhost:3000]
"""
import json
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BASE / "extractor"))
from llm_client import chat, is_available  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE / "results" / "verdicts_search.jsonl"
COST = HERE / "results" / "cost_search.json"
BATCH = 20

PROMPT = """You judge search-result relevance for an Indian e-commerce demo catalogue.
For EACH numbered query, look at its top-3 results (title | price) and answer exactly three letters:
R = relevant: this is the kind of product the shopper asked for
P = partial: related but not the product asked for (accessory, similar-but-different product, brand-only match, only a few words match)
I = irrelevant: unrelated to the query
Rules: for budget-only or "gift for X" queries, any plausible gift-able product within the stated budget is R. "saree" -> a saree is R, a kurti is P. A digital saxophone for "saxophone" is R. A dead-end product genuinely absent from the catalogue that returns only loosely related items should get I I I (or P for plausibly-related).
Reply with ONLY one line per query, no JSON, in the given order, using the given id verbatim. Do NOT repeat the query or the results.
Format per line: <qid> <letter1> <letter2> <letter3>
Example: qs_s_0001 R P I"""

def post_search(url, q):
    req = urllib.request.Request(url + "/api/search",
        data=json.dumps({"query": q}).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)

def top3(results):
    return [{"title": re.sub(r"\s+", " ", r.get("title", ""))[:90],
             "price": r.get("price"), "brand": r.get("brand", "")} for r in results[:3]]

def main():
    if not is_available():
        sys.exit("LLM unavailable")
    url = "http://localhost:3000"
    if "--url" in sys.argv:
        url = sys.argv[sys.argv.index("--url") + 1]
    panel = [json.loads(l) for l in open(HERE / "panel.jsonl") if l.strip()]
    cases = [p for p in panel if p["dim"] == "search"]
    done = {}
    if OUT.exists():
        for l in OUT.open():
            if l.strip():
                d = json.loads(l)
                done[d["id"]] = d
    todo = [c for c in cases if c["id"] not in done]
    print(f"search: {len(cases)} cases, {len(done)} done, {len(todo)} todo")
    cost = {"calls": 0, "est_tokens": 0}
    if COST.exists():
        cost = json.load(open(COST))
    with OUT.open("a") as fo:
        for bi in range(0, len(todo), BATCH):
            batch = todo[bi:bi + BATCH]
            with ThreadPoolExecutor(8) as ex:
                tops = list(ex.map(lambda c: post_search(url, c["query"]), batch))
            items = []
            for c, r in zip(batch, tops):
                t3 = top3(r.get("results", []))
                items.append((c, t3, len(r.get("results", []))))
            blocks = []
            for c, t3, n in items:
                res = " | ".join(f"{x['title']} | Rs.{x['price']}" for x in t3)
                blocks.append(f"{c['id']} q='{c['query']}'  top3: {res if t3 else '(no results)'}")
            prompt = PROMPT + "\n\n" + "\n".join(blocks)
            text, _ = chat([{"role": "user", "content": prompt}], temperature=0, max_tokens=900, thinking=False)
            cost["calls"] += 1
            cost["est_tokens"] += (len(prompt) + len(text)) // 4
            COST.write_text(json.dumps(cost))
            def verdicts_for(qid, n_letters):
                for l in text.splitlines():
                    l = l.strip()
                    m = re.search(re.escape(qid) + r"\s+((?:[RPI]\s*){1,3})" , l)
                    if m:
                        letters = re.findall(r"[RPI]", m.group(1))
                        return (letters + ["I"] * n_letters)[: n_letters]
                return None
            missing = []
            for c, t3, n in items:
                v = verdicts_for(c["id"], len(t3))
                if v is None:
                    missing.append((c, t3, n))
                    continue
                rec = {"id": c["id"], "query": c["query"], "kind": c["kind"], "n_results": n,
                       "top3": t3, "v": v,
                       "pass_usable": any(x in ("R", "P") for x in v),
                       "pass_strict": bool(v) and v[0] == "R", "source": "fresh"}
                fo.write(json.dumps(rec, ensure_ascii=False) + "\n")
            fo.flush()
            for c, t3, n in missing:
                res = " | ".join(f"{x['title']} | Rs.{x['price']}" for x in t3)
                p2 = PROMPT + f"\n\n{c['id']} q='{c['query']}'  top3: {res if t3 else '(no results)'}"
                t2, _ = chat([{"role": "user", "content": p2}], temperature=0, max_tokens=120, thinking=False)
                cost["calls"] += 1
                cost["est_tokens"] += (len(p2) + len(t2)) // 4
                COST.write_text(json.dumps(cost))
                m = re.search(r"((?:[RPI]\s*){1,3})", t2)
                letters = re.findall(r"[RPI]", m.group(1)) if m else []
                v = (letters + ["I"] * len(t3))[: len(t3)] if t3 else []
                rec = {"id": c["id"], "query": c["query"], "kind": c["kind"], "n_results": n,
                       "top3": t3, "v": v,
                       "pass_usable": any(x in ("R", "P") for x in v),
                       "pass_strict": bool(v) and v[0] == "R", "source": "retry_single"}
                fo.write(json.dumps(rec, ensure_ascii=False) + "\n")
            fo.flush()
            print(f"batch {bi//BATCH + 1}: {len(items)} judged, {len(missing)} retried single", flush=True)
    print(f"search done: {len(done) + len(todo)} cases")

if __name__ == "__main__":
    main()
