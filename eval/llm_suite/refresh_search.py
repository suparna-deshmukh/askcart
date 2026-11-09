"""
LLM suite - search verdict refresh (token saver, 0 LLM tokens).
Re-fetches top-3 for every frozen query; keeps old verdicts ONLY where the
top-3 is byte-identical to what the frozen judge saw (same input -> same
verdict, judge prompt frozen with the panel). Changed/missing top-3 ids are
dropped from the verdicts file so judge_search.py re-judges them.
"""
import json, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "results" / "verdicts_search.jsonl"

def main():
    url = "http://localhost:3000"
    if "--url" in sys.argv:
        url = sys.argv[sys.argv.index("--url") + 1]
    panel = [json.loads(l) for l in open(HERE / "panel.jsonl") if l.strip()]
    cases = [p for p in panel if p["dim"] == "search"]
    old = {}
    for l in OUT.open():
        if l.strip():
            d = json.loads(l)
            old[d["id"]] = d

    def sig(r):
        t3 = r["results"][:3]
        return [{"title": " ".join(t.get("title", "").split())[:90], "price": t.get("price"), "brand": t.get("brand", "")} for t in t3]

    def fetch(q):
        req = urllib.request.Request(url + "/api/search",
            data=json.dumps({"query": q}).encode(), headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)

    keep, changed, missing = [], [], []
    with ThreadPoolExecutor(8) as ex:
        res = list(ex.map(lambda c: (c["id"], fetch(c["query"])), cases))
    for cid, r in res:
        s = sig(r)
        o = old.get(cid)
        if o and o.get("top3") == s:
            keep.append(o)
        else:
            if o:
                changed.append(cid)
            else:
                missing.append(cid)
    with OUT.open("w") as f:
        for o in keep:
            f.write(json.dumps(o, ensure_ascii=False) + "\n")
    print(f"search refresh: keep(unchanged)={len(keep)} re-judge(changed top3)={len(changed)} new(missing)={len(missing)}")
    if changed[:10]:
        print("sample changed:", changed[:10])

if __name__ == "__main__":
    main()
