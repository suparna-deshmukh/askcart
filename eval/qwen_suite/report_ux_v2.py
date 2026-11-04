"""Qwen suite - UX panel v2 report (generated, no hand-typed numbers).
Usage: .venv/bin/python eval/qwen_suite/report_ux_v2.py
"""
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "results" / "ux_v2_summary.md"


def wilson(k, n, z=1.96):
    if n == 0:
        return [0.0, 0.0]
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * (p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5 / d
    return [round(100 * (c - h), 1), round(100 * (c + h), 1)]


def rate(k, n):
    if not n:
        return "–"
    lo, hi = wilson(k, n)
    return f"{100 * k / n:.1f}% [ {lo}–{hi} ]"


def main():
    meta = json.loads((HERE / "panel_ux_v2_meta.json").read_text())
    recs = [json.loads(l) for l in open(HERE / "results" / "verdicts_ux_v2.jsonl") if l.strip()]
    by_id = {r["id"]: r for r in recs}
    panel = [json.loads(l) for l in open(HERE / "panel_ux_v2.jsonl") if l.strip()]
    judged = [by_id[c["id"]] for c in panel if c["id"] in by_id and not by_id[c["id"]].get("no_question")]
    nq = [by_id[c["id"]] for c in panel if c["id"] in by_id and by_id[c["id"]].get("no_question")]
    k = sum(1 for r in judged if r.get("pass"))
    mix = Counter(r.get("verdict") for r in judged)
    cost = json.loads((HERE / "results" / "cost_ux_v2.json").read_text()) if (HERE / "results" / "cost_ux_v2.json").exists() else {"calls": 0, "est_tokens": 0}

    lines = []
    w = lines.append
    w("# Qwen suite - UX panel v2 (current-build question moments)")
    w("")
    w(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} by `report_ux_v2.py` (all numbers from the verdict artifacts).")
    w(f"Panel: {meta['n']} moments (seed {meta['seed']}, sha {meta['panel_sha256']}) sampled from {meta['total_moments_available']} question moments the current policy asks across {meta['total_journeys']} persona journeys ({meta['n_ask_journeys']} journeys asked at least one). Committed before judging; v1 frozen panel untouched.")
    w("")
    w(f"## Result")
    w("")
    w(f"- **PASS (appropriate, verdict A): {rate(k, len(judged))}** · mix: A={mix.get('A',0)} M={mix.get('M',0)} B={mix.get('B',0)} other={sum(v for kk, v in mix.items() if kk not in ('A','M','B'))}")
    w(f"- no_question (policy no longer asks at the sampled step after a product change): {len(nq)} - excluded from the denominator (pre-agreed protocol).")
    w("")
    w("| lang x question type | n | PASS |")
    w("|---|---|---|")
    by = defaultdict(lambda: [0, 0])
    for r in judged:
        by[(r.get("lang"), r.get("qtype"))][0] += 1 if r.get("pass") else 0
        by[(r.get("lang"), r.get("qtype"))][1] += 1
    for kk, (k1, n1) in sorted(by.items(), key=lambda x: -x[1][1])[:20]:
        w(f"| {kk[0]} / {kk[1]} | {n1} | {rate(k1, n1)} |")
    w("")
    fails = [r for r in judged if not r.get("pass")]
    if fails:
        w(f"## Non-A moments ({len(fails)})")
        w("")
        for r in fails[:25]:
            w(f"- `{r['id']}` [{r.get('verdict')}] ({r.get('lang')}/{r.get('qtype')}) Q='{r.get('query','')[:40]}' ask='{str(r.get('question'))[:50]}' n_before={r.get('n_before')} - {str(r.get('reason'))[:70]}")
        w("")
    w(f"Qwen usage (v2): {cost['calls']} calls, ~{cost['est_tokens']:,} est tokens. Single-LLM-judge caveat applies (same judge/prompt as v1).")
    w("")
    OUT.write_text("\n".join(lines))
    print(f"wrote {OUT.name}: {k}/{len(judged)} A, {len(nq)} NQ")


if __name__ == "__main__":
    main()
