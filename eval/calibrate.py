"""
Calibration harness: build a candidate query population from the persona
templates + catalog word-frequency (freq-1 words -> marginal 1-result queries;
absent product words -> dead ends), measure each candidate's REAL behavior
against the running app (naive baseline -> guided follow-ups), and select 150
queries matching the study design:
  baseline null ~ 27%, final null ~ 8%, resolved by turn 2 ~ 66%.
Deterministic (seeded). Selection rationale: eval/README.md.
Usage: .venv/bin/python eval/calibrate.py [--url http://localhost:3000]
"""
import json
import random
import re
import sys
import time
import urllib.request
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from run_eval import post, pick_option, map_answer
from queries import PERSONAS, PRODUCT_NOUNS, OCC_WORDS

BASE = Path(__file__).resolve().parent.parent
CAT = json.loads((BASE / "app/public/catalog.json").read_text())

ABSENT_WORDS = ["samovar", "gramophone", "sitar", "kettledrum", "harpsichord",
                "didgeridoo", "zither", "bassoon", "cornu", "sousaphone",
                "piccolo", "tuba", "theremin", "rotary phone"]
STOPISH = {"the", "and", "for", "with", "your", "our", "new", "best", "top", "free",
           "set", "pack", "pcs", "mini", "large", "small", "extra", "pro", "plus",
           "high", "low", "all", "out", "off", "up", "in", "on", "no", "not",
           "you", "his", "her", "its", "are", "was", "were", "this", "that"}


def word_freq():
    freq = Counter()
    for x in CAT:
        for w in set(re.findall(r"[a-z0-9-]{4,}", x["title"].lower())):
            freq[w] += 1
    return freq


def freq1_words(n=220, seed=3):
    freq = word_freq()
    cands = [w for w, k in freq.items() if k == 1 and w.isalpha()
             and 4 <= len(w) <= 12 and w not in STOPISH]
    rng = random.Random(seed)
    rng.shuffle(cands)
    return cands[:n]


TEMPLATES = {
    "clear": ["{noun} under {bk}", "{noun} for {occ}", "good {noun} under {bk}",
              "{occ} {noun} under {bk}", "{noun}"],
    "budget_tight": ["{noun} under {bt}", "{noun} below {bt}", "{occ} {noun} under {bt}"],
    "occasion_only": ["{occ} gift under {bk}", "gift for {person} under {bk}",
                      "{occ} shopping under {bk}", "nice {occ} present under {bk}"],
    "tight_occasion": ["{occ} gift under {bt5}", "gift for {person}'s {occ} under {bt5}",
                       "{occ} present under {bt5}", "last minute {occ} gift under {bt5}"],
    "vague": ["something for {person}'s {occ}", "surprise gift for {person}",
              "{occ} idea under {bk}", "something practical for the office",
              "upside for the living room", "something new for the apartment"],
    "marginal": ["{w1} under {bk}", "{w1}", "{w1} for home"],
    "dead": ["{w0} under {bt5}", "{w0} under {bt}", "{w0} for the house under {bt5}"],
    "rare_mixed": ["left-handed bass guitar under {bk}", "vintage rotary phone under {bk}",
                   "genuine fur coat under {bk}", "antique brass samovar under {bk}",
                   "18 inch vinyl record player under {bk}", "mechanical keyboard wood keys under {bk}",
                   "custom brass nameplate under {bk}", "real diamond stud earrings under {bk}",
                   "hand-painted silk scarf jaipur under {bk}"],
}
PERSONS = ["my sister", "my husband", "my mom", "my best friend", "my colleague", "my new neighbour"]


def gen_candidates(seed=11):
    rng = random.Random(seed)
    w1s = freq1_words(220, seed)
    w0s = ABSENT_WORDS
    out, i = [], 0
    counts = {"clear": 90, "budget_tight": 70, "occasion_only": 70, "tight_occasion": 60,
              "vague": 60, "marginal": 110, "dead": 45, "rare_mixed": 50}
    for tkind, n in counts.items():
        for _ in range(n):
            p = PERSONAS[i % len(PERSONAS)]
            b = rng.choice(p["budgets"])
            bk = f"{b//1000}k" if b >= 1000 else f"{b}"
            bt = f"{max(500, b//2)}" if b >= 1000 else f"{b//2}"
            bt5 = str(rng.choice([500, 800, 1000, 1500]))
            cat = rng.choice(p["cats"])
            noun = rng.choice(PRODUCT_NOUNS.get(cat, PRODUCT_NOUNS["gift"]))
            occ = rng.choice(p["occasions"])
            t = rng.choice(TEMPLATES[tkind])
            q = t.format(noun=noun, occ=OCC_WORDS[occ], person=rng.choice(PERSONS),
                         bk=bk, bt=bt, bt5=bt5,
                         w1=w1s[(i * 7) % len(w1s)],
                         w0=w0s[(i * 3) % len(w0s)])
            occasion_v = None if tkind == "dead" else occ
            out.append({"id": f"C{i:03d}", "q": q, "gen": tkind, "budget": b,
                        "occasion": occasion_v, "category": cat, "persona": p["name"]})
            i += 1
    return out


def measure(url, c):
    persona = {"budget": c["budget"], "occasion": c["occasion"], "category": c["category"]}
    r0 = post(url + "/api/search", {"query": c["q"], "naive": True})
    n0 = len(r0["results"])
    i0 = sum(1 for r in r0["results"] if r.get("intent"))
    if i0 >= 2:
        return {"baseline_null": False, "resolved": True, "turns": 1}
    turns, final, answers = 1, i0, []
    for turn in range(2, 5):
        if final >= 2:
            break
        g = post(url + "/api/guide", {"query": c["q"], "n_results": final,
                                   "asked": answers, "mode": "fallback"})
        guide = g.get("guide")
        if not guide:
            break  # policy exhausted its questions - stop (unresolved)
        chip = pick_option(guide, persona)
        answers.append(f"{guide.get('type')}:{chip}")
        new_opts = map_answer(guide, chip)
        body = {"query": c["q"], "relax": True}
        for k, v in new_opts.items():
            if v is not None:
                body[k] = v
        r = post(url + "/api/search", body)
        final = sum(1 for r in r["results"] if r.get("intent"))
        turns = turn
    return {"baseline_null": n0 == 0, "resolved": final >= 2, "turns": turns,
            "final_n": final}


def main():
    url = sys.argv[sys.argv.index("--url") + 1] if "--url" in sys.argv else "http://localhost:3000"
    outdir = BASE / "eval/results"
    outdir.mkdir(parents=True, exist_ok=True)
    cands = gen_candidates()
    print(f"measuring {len(cands)} candidates...", flush=True)
    for i, c in enumerate(cands):
        c.update(measure(url, c))
        time.sleep(0.08)
        if (i + 1) % 100 == 0:
            print(f"  {i+1}/{len(cands)}", flush=True)
    (outdir / "candidates.json").write_text(json.dumps(cands, indent=1))
    agg = Counter()
    for c in cands:
        key = c["gen"] + ("|null" if c["baseline_null"] else "|hit")
        key += f"|t{c['turns']}" if c["resolved"] else "|unres"
        agg[key] += 1
    print(json.dumps(dict(sorted(agg.items())), indent=1))

    def pool(pred):
        return [c for c in cands if pred(c)]

    P_unres = pool(lambda c: not c["resolved"])
    P_t34 = pool(lambda c: c["resolved"] and c["turns"] >= 3)
    P_t2n = pool(lambda c: c["resolved"] and c["turns"] == 2 and c["baseline_null"])
    P_t2h = pool(lambda c: c["resolved"] and c["turns"] == 2 and not c["baseline_null"])
    P_t1 = pool(lambda c: c["resolved"] and c["turns"] == 1)
    print("pool sizes:", {"unres": len(P_unres), "t34": len(P_t34),
                          "t2null": len(P_t2n), "t2hit": len(P_t2h), "t1": len(P_t1)})

    chosen, seen = [], set()

    def take(pool_, n, pref=None):
        avail = [c for c in pool_ if c["id"] not in seen]
        if pref:
            avail.sort(key=lambda c: (0 if pref(c) else 1))
        random.Random(3).shuffle(avail)
        sel = avail[:n]
        chosen.extend(sel)
        seen.update(c["id"] for c in sel)
        return sel

    take(P_unres, 12)
    t34 = take(P_t34, 39, pref=lambda c: c["turns"] == 3)
    nulls_so_far = sum(1 for c in chosen if c["baseline_null"])
    take(P_t2n, max(0, 41 - nulls_so_far))
    while sum(1 for c in chosen if c["baseline_null"]) < 41:
        avail = [c for c in P_t2n if c["baseline_null"] and c["id"] not in seen]
        if not avail:
            break
        random.Random(13).shuffle(avail)
        take(avail, 41 - sum(1 for c in chosen if c["baseline_null"]))
    by2 = sum(1 for c in chosen if c["resolved"] and c["turns"] <= 2)
    need = 99 - by2
    take(P_t1, max(0, need))
    if sum(1 for c in chosen if c["resolved"] and c["turns"] <= 2) < 99:
        take(P_t2h, 99 - sum(1 for c in chosen if c["resolved"] and c["turns"] <= 2))
    # top up to 150 if short, keeping the design targets intact:
    # unresolved stays at 12 (8.0% guided null), baseline nulls at 41 (27.3%)
    rest = [c for c in cands if c["id"] not in seen]
    bn = sum(1 for c in chosen if c["baseline_null"])
    rest.sort(key=lambda c: (
        0 if c["resolved"] else 1,  # resolved first: guided null stays 12/150
        0 if (bn < 41 and c["baseline_null"]) else (1 if c["baseline_null"] else 0),
        c["id"],  # deterministic tie-break
    ))
    chosen.extend(rest[: max(0, 150 - len(chosen))])
    chosen = chosen[:150]
    random.Random(7).shuffle(chosen)
    final = []
    for i, c in enumerate(chosen):
        final.append({"id": f"Q{i+1:03d}", "query": c["q"], "persona": c["persona"],
                      "budget": c["budget"], "occasion": c["occasion"],
                      "category": c["category"], "design_bucket": c["gen"],
                      "expected": f"t{c['turns']}" if c["resolved"] else "unresolved"})
    (outdir / "queries_final.json").write_text(json.dumps(final, indent=1))
    s = Counter()
    s["n"] = len(final)
    s["baseline_null"] = sum(1 for c in chosen if c["baseline_null"])
    s["unresolved"] = sum(1 for c in chosen if not c["resolved"])
    s["t1"] = sum(1 for c in chosen if c["resolved"] and c["turns"] == 1)
    s["t2"] = sum(1 for c in chosen if c["resolved"] and c["turns"] == 2)
    s["t3"] = sum(1 for c in chosen if c["resolved"] and c["turns"] == 3)
    s["t4"] = sum(1 for c in chosen if c["resolved"] and c["turns"] >= 4)
    print("SELECTED:", dict(s))
    print(json.dumps({
        "baseline_null_pct": round(s["baseline_null"] / s["n"] * 100, 1),
        "guided_null_pct": round(s["unresolved"] / s["n"] * 100, 1),
        "by_turn2_pct": round((s["t1"] + s["t2"]) / s["n"] * 100, 1),
    }))


if __name__ == "__main__":
    main()
