"""
Qwen suite - UX verdict refresh (token saver, 0 LLM tokens).
Replays each unique journey deterministically over HTTP (fallback mode,
persona ground-truth answers). Keeps old verdicts ONLY where the replayed
moment is identical to the recorded one (turn, question, options+counts,
n_before, answers-so-far, journey outcome). Everything else is dropped so
judge_ux.py re-judges it (or records no_question, 0 tokens, per the
pre-agreed protocol).
"""
import importlib.util, json, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASE = HERE.parent.parent
sys.path.insert(0, str(BASE / "extractor"))

spec = importlib.util.spec_from_file_location("ps", BASE / "eval/persona_sim.py")
ps = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ps)

from judge_ux import replay  # noqa: E402  (same deterministic replay the judge uses)

OUT = HERE / "results" / "verdicts_ux.jsonl"

def main():
    url = "http://localhost:3000"
    if "--url" in sys.argv:
        url = sys.argv[sys.argv.index("--url") + 1]
    panel = [json.loads(l) for l in open(HERE / "panel.jsonl") if l.strip()]
    cases = [p for p in panel if p["dim"] == "ux"]
    old = {}
    for l in OUT.open():
        if l.strip():
            d = json.loads(l)
            old[d["id"]] = d

    personas = {p["pid"]: p for p in ps.build_personas()}
    by_journey = {}
    for c in cases:
        by_journey.setdefault((c["pid"], c["query"]), []).append(c)

    def replay_one(jkey):
        pid, q = jkey
        p = personas[pid]
        matches = [(d, q2) for d, q2 in ps.queries_for(p) if q2 == q]
        assert matches, f"query not found for persona {pid}: {q}"
        dim, qq = matches[0]
        return jkey, *replay(url, p, dim, qq)

    moments = {}
    with ThreadPoolExecutor(6) as ex:
        for jkey, cap, outcome in ex.map(replay_one, by_journey):
            for c in by_journey[jkey]:
                m = cap[c["seq"]] if c["seq"] < len(cap) else None
                moments[c["id"]] = (m, outcome)

    def cur_sig(m):
        opts = sorted(zip(m["options"], m["option_counts"]))
        return (m["turn"], m["question"][:120], m["n_before"], opts,
                json.dumps(m["answers_so_far"], sort_keys=True))

    def old_sig(o):
        opts = sorted(tuple(x) for x in o.get("options", []))
        return (o.get("turn"), o.get("question"), o.get("n_before"), opts, o.get("answers_sig"))

    keep, changed, noq = [], 0, 0
    for c in cases:
        m, outcome = moments[c["id"]]
        o = old.get(c["id"])
        if o and o.get("no_question"):
            if m is None:
                keep.append(o)
            else:
                changed += 1  # policy asks again -> re-judge
            continue
        if m is None:
            noq += 1  # judge will record no_question (0 tokens)
            continue
        if not o:
            changed += 1
            continue
        a, b = old_sig(o), cur_sig(m)
        same_moment = a[:4] == b[:4]  # answers_sig only in new-format records
        same_outcome = o.get("journey_resolved") == outcome.get("resolved", outcome.get("resolved_t1", False))
        if same_moment and same_outcome:
            keep.append(o)
        else:
            changed += 1
    with OUT.open("w") as f:
        for o in keep:
            f.write(json.dumps(o, ensure_ascii=False) + "\n")
    print(f"ux refresh: keep(unchanged)={len(keep)} re-judge(changed)={changed} no_question(will be 0-token)={noq}")

if __name__ == "__main__":
    main()
