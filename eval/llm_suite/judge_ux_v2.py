"""
LLM suite - UX dimension (300 cases). Question-moment appropriateness.
Each case references a journey from the persona-sim v2 run (pid x dim);
this script deterministically REPLAYS the journey over HTTP (persona
ground-truth answers, mode:"fallback", 0 LLM tokens), captures every
question the policy asked (text, options, facet counts, results-before,
answers so far), then LLM judges each sampled moment:

  A = appropriate: given the query, the answers already given, the
      results-on-screen and the options with counts, this is a useful,
      non-redundant question at this point
  M = marginal: defensible but not the best next question
  B = bad: redundant, off-target, or the options don't help

PASS = A. Resume-safe.

Usage: .venv/bin/python eval/llm_suite/judge_ux.py [--url http://localhost:3000]
"""
import importlib.util
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BASE / "extractor"))
from llm_client import chat, is_available  # noqa: E402

spec = importlib.util.spec_from_file_location("ps", BASE / "eval/persona_sim.py")
ps = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ps)

HERE = Path(__file__).resolve().parent
OUT = HERE / "results" / "verdicts_ux_v2.jsonl"
COST = HERE / "results" / "cost_ux_v2.json"

PROMPT = """You audit the guided-question policy of an Indian e-commerce search app.
Product intent (documented): the app asks at most a few quick chip questions to narrow a search before the shopper buys; asking one narrowing question is the intended behaviour, so judge the FIT of the specific question for this query, not whether a question was asked at all.
Fit guide: size / for-whom fit apparel & wearable queries; budget fits when the price range is wide or the query is price-anchored; occasion fits gifts/events; category fits when several product families match; brand fits when a few brands dominate the candidates. Questions that ignore the query's subject (e.g. size for a hoverboard, occasion for a dead-end appliance) are bad.
Shopper persona: {segment} ({lang})
Search query: {query}
Answers already given: {answers}
Results on screen before the question: {n_before} on-intent products
QUESTION ASKED NOW: {question}
OPTIONS (label: matching-product count): {options}
Verdict:
A = appropriate: question type fits the query and the options genuinely narrow the search
M = marginal: defensible but not the best next question (redundant, or options weak)
B = bad: question type does not fit the query, or options do not help
Reply with exactly one line: <letter> <5-word reason>
Example: A budget narrows a wide price range well"""

from replay_v2 import replay  # UI-faithful, deterministic, 0 LLM tokens


def main():
    if not is_available():
        sys.exit("LLM unavailable")
    url = "http://localhost:3000"
    if "--url" in sys.argv:
        url = sys.argv[sys.argv.index("--url") + 1]
    panel = [json.loads(l) for l in open(HERE / "panel_ux_v2.jsonl") if l.strip()]
    cases = [p for p in panel if p["dim"] == "ux"]
    done = {}
    if OUT.exists():
        for l in OUT.open():
            if l.strip():
                d = json.loads(l)
                done[d["id"]] = d
    todo = [c for c in cases if c["id"] not in done]
    print(f"ux: {len(cases)} cases, {done and len(done)} done, {len(todo)} todo")
    personas = {p["pid"]: p for p in ps.build_personas()}
    # group cases by journey
    by_journey = {}
    for c in todo:
        by_journey.setdefault((c["pid"], c.get("sim_dim", c["dim"]), c["query"]), []).append(c)
    print(f"{len(by_journey)} unique journeys to replay")
    cost = {"calls": 0, "est_tokens": 0}
    if COST.exists():
        cost = json.load(open(COST))
    moments = {}
    with OUT.open("a") as fo:
        def replay_one(jkey):
            pid, simdim, _ = jkey
            p = personas[pid]
            qwant = by_journey[jkey][0]["query"]
            matches = [(d, q) for d, q in ps.queries_for(p) if d == simdim and q == qwant]
            assert matches, f"query not found for persona {pid} dim {simdim}: {qwant}"
            dim, q = matches[0]
            cap, outcome = replay(url, p, dim, q)
            return jkey, cap, outcome
        with ThreadPoolExecutor(6) as ex:
            for jkey, cap, outcome in ex.map(replay_one, by_journey):
                for c in by_journey[jkey]:
                    m = cap[c["seq"]] if c["seq"] < len(cap) else None
                    moments[c["id"]] = (m, outcome)
        # judge (serial-ish, 6-wide via futures on the chat calls)
        def judge(c):
            m, outcome = moments[c["id"]]
            if not m:
                # Agreed protocol: the replayed policy no longer asks at this
                # step under the current build (journey resolved earlier, or
                # question budget exhausted) - there is no question to judge.
                # No LLM call; report.py excludes these from the denominator.
                return {"id": c["id"], "lang": c["lang"], "dim": c["dim"], "qtype": c["qtype"],
                        "segment": c["segment"], "query": c["query"], "no_question": True, "pass": None}
            prompt = PROMPT.format(segment=c["segment"], lang=c["lang"], query=m and c["query"],
                                   answers=json.dumps(m["answers_so_far"]) or "(none)",
                                   n_before=m["n_before"], question=m["question"],
                                   options=", ".join(f"{o}:{n}" for o, n in zip(m["options"], m["option_counts"])))
            t, _ = chat([{"role": "user", "content": prompt}], temperature=0, max_tokens=80, thinking=False)
            cost["calls"] += 1
            cost["est_tokens"] += (len(prompt) + len(t)) // 4
            COST.write_text(json.dumps(cost))
            mm = re.match(r"\s*([AMB])\b[.:]?\s*(.*)", t)
            verdict = mm.group(1) if mm else "?"
            reason = (mm.group(2) or "").strip()[:60] if mm else t.strip()[:60]
            return {"id": c["id"], "lang": c["lang"], "dim": c["dim"], "qtype": c["qtype"],
                    "segment": c["segment"], "query": c["query"], "turn": m["turn"],
                    "question": m["question"][:120], "n_before": m["n_before"],
                    "options": list(zip(m["options"], m["option_counts"])),
                    "answers_sig": json.dumps(m["answers_so_far"], sort_keys=True),
                    "verdict": verdict, "reason": reason, "pass": verdict == "A",
                    "journey_resolved": outcome.get("resolved", outcome.get("resolved_t1", False))}
        with ThreadPoolExecutor(6) as ex:
            for done_i, rec in enumerate(ex.map(judge, todo), 1):
                fo.write(json.dumps(rec, ensure_ascii=False) + "\n")
                if done_i % 50 == 0:
                    fo.flush()
                    print(f"{done_i}/{len(todo)}", {k: cost[k] for k in ("calls", "est_tokens")}, flush=True)
    print("ux done")

if __name__ == "__main__":
    main()
