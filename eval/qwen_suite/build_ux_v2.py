"""
Qwen suite - UX panel v2 builder (fresh panel of the CURRENT build).

Panel v1 (300 moments, frozen, sha e8f01a06d883bf79) was sampled from the
persona-sim v2 build. Under the current policy those journeys either
resolve at turn 1 or end as an honest not-found, so v1 has 0 judged
moments (300/300 no_question). v2 samples question moments from the
current build's own behaviour: replay all 3,000 persona journeys over
HTTP (deterministic, persona ground-truth answers, mode:fallback,
0 LLM tokens), capture every question the current policy asks, and take
a seeded stratified sample (lang x question type) of up to 300 moments.

COMMIT THE PANEL BEFORE JUDGING (same rule as v1). v1 stays untouched.

Usage: .venv/bin/python eval/qwen_suite/build_ux_v2.py [--url http://localhost:3000]
"""
import hashlib
import importlib.util
import json
import random
import sys
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASE = HERE.parent.parent
sys.path.insert(0, str(BASE / "extractor"))

spec = importlib.util.spec_from_file_location("ps", BASE / "eval/persona_sim.py")
ps = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ps)
from replay_v2 import replay  # noqa: E402  (UI-faithful, deterministic, 0 LLM tokens)

SEED = 20261105
N_TARGET = 300
OUT = HERE / "panel_ux_v2.jsonl"
META = HERE / "panel_ux_v2_meta.json"


def main():
    url = "http://localhost:3000"
    if "--url" in sys.argv:
        url = sys.argv[sys.argv.index("--url") + 1]
    personas = sorted((p for p in ps.build_personas()), key=lambda x: x["pid"])
    journeys = []
    for p in personas:
        for dim, q in ps.queries_for(p):
            journeys.append((p, dim, q))
    print(f"{len(journeys)} journeys to replay")

    moments = []
    n_ask_journeys = 0

    def replay_one(j):
        p, dim, q = j
        cap, outcome = replay(url, p, dim, q)
        return p, dim, q, cap, outcome

    with ThreadPoolExecutor(6) as ex:
        for i, (p, dim, q, cap, outcome) in enumerate(ex.map(replay_one, journeys), 1):
            if cap:
                n_ask_journeys += 1
            for seq, m in enumerate(cap):
                moments.append({
                    "pid": p["pid"], "lang": p["lang"], "segment": p["segment"],
                    "region": p["region"], "dim": "ux", "sim_dim": dim,
                    "query": q, "seq": seq,
                    "qturn": m["turn"], "qtype": m["type"],
                    "resolved": bool(outcome.get("resolved") or outcome.get("resolved_t1")),
                    "null": not (outcome.get("resolved") or outcome.get("resolved_t1")),
                })
            if i % 500 == 0:
                print(f"{i}/{len(journeys)} (moments so far: {len(moments)})", flush=True)

    print(f"total moments: {len(moments)} across {n_ask_journeys} journeys that asked")
    by_strata = Counter((m["lang"], m["qtype"]) for m in moments)
    print("strata (lang/qtype):", dict(by_strata.most_common()))

    rng = random.Random(SEED)
    if len(moments) <= N_TARGET:
        picked = moments
    else:
        strata = defaultdict(list)
        for m in moments:
            strata[(m["lang"], m["qtype"])].append(m)
        for v in strata.values():
            rng.shuffle(v)
        # proportional quotas, min 1 per non-empty stratum, capped by size
        quotas = {}
        for k, v in strata.items():
            quotas[k] = max(1, round(N_TARGET * len(v) / len(moments)))
        picked = []
        for k, v in strata.items():
            picked.extend(v[:min(quotas[k], len(v))])
        if len(picked) > N_TARGET:
            # give back the excess from the largest strata
            excess = len(picked) - N_TARGET
            for k in sorted(strata, key=lambda k: -len(strata[k])):
                if excess <= 0:
                    break
                room = min(quotas[k] - 1, len(strata[k]) - 1, excess)
                quotas[k] -= room
                excess -= room
            picked = []
            for k, v in strata.items():
                picked.extend(v[:min(quotas[k], len(v))])
    picked = sorted(picked, key=lambda m: (m["pid"], m["query"], m["seq"]))
    for i, m in enumerate(picked, 1):
        m["id"] = f"qs_uv2_{i:04d}"

    body = "\n".join(json.dumps(m, ensure_ascii=False) for m in picked) + "\n"
    OUT.write_text(body)
    meta = {
        "seed": SEED,
        "n": len(picked),
        "total_moments_available": len(moments),
        "n_ask_journeys": n_ask_journeys,
        "total_journeys": len(journeys),
        "strata": {f"{k[0]}/{k[1]}": v for k, v in sorted(by_strata.items())},
        "built_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "panel_sha256": hashlib.sha256(body.encode()).hexdigest()[:16],
        "note": ("v2 = moments of the CURRENT build (replayed deterministic, "
                 "0 LLM tokens). v1 (frozen, 300/300 no_question) untouched."),
    }
    META.write_text(json.dumps(meta, indent=2))
    print(f"wrote {len(picked)} cases -> {OUT.name}; sha {meta['panel_sha256']}")


if __name__ == "__main__":
    main()
