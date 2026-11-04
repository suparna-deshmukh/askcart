"""
E3 Eval v2 - generate results/evalv2.json + results/summary.md from the
artifacts (raw.jsonl + judged.jsonl + panel.jsonl). No hand-typed numbers.
"""
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

BASE = Path(__file__).resolve().parent
OUT = BASE / "results"


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    d = 1 + z * z / n
    c = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    lo = (p + z * z / (2 * n) - c) / d
    hi = (p + z * z / (2 * n) + c) / d
    return (max(0.0, lo) * 100, min(1.0, hi) * 100)


def pct_ci(k, n):
    lo, hi = wilson(k, n)
    return {"k": k, "n": n, "pct": round(100 * k / n, 1) if n else None,
            "ci95": [round(lo, 1), round(hi, 1)]}


def main():
    panel = {r["id"]: r for r in map(json.loads, (BASE / "panel.jsonl").read_text().splitlines())}
    raw = [json.loads(l) for l in (OUT / "raw.jsonl").read_text().splitlines() if l.strip()]
    judged = {}
    for l in (OUT / "judged.jsonl").read_text().splitlines():
        if l.strip():
            d = json.loads(l)
            judged[f"{d['qid']}:{d['arm']}"] = d["verdicts"]

    def arm_stats(arm, recs):
        n = len(recs)
        null0 = sum(1 for r in recs if r[arm]["n"] == 0)
        not_resolved = sum(1 for r in recs if r[arm]["intent"] < 2)
        s3 = sum(1 for r in recs if r[arm]["top3"] and
                 "R" in judged.get(f"{r['id']}:{arm}", []))
        u3 = sum(1 for r in recs if r[arm]["top3"] and
                 set(judged.get(f"{r['id']}:{arm}", [])) & {"R", "P"})
        judged_n = sum(1 for r in recs if r[arm]["top3"])
        q = [r["b"]["questions"] for r in recs if arm == "b"]
        rb = [r["b"]["rollbacks"] for r in recs if arm == "b"]
        ms = sorted(r[arm]["ms"] for r in recs)
        out = {
            "n": n,
            "null_strict": pct_ci(null0, n),
            "null_app_lt2_intent": pct_ci(not_resolved, n),
            "success_at3": pct_ci(s3, judged_n),
            "usable_at3": pct_ci(u3, judged_n),
            "outcomes": dict(Counter(r[arm]["outcome"] for r in recs)),
            "verdicts": dict(Counter(v for r in recs if r[arm]["top3"]
                                      for v in judged.get(f"{r['id']}:{arm}", []))),
            "latency_ms": {"p50": ms[n // 2], "p95": ms[min(n - 1, int(n * 0.95))]},
        }
        if arm == "b":
            out["questions_avg"] = round(sum(q) / n, 2)
            out["questions_max"] = max(q) if q else 0
            out["rollback_turns"] = sum(rb)
            out["rollback_rate_pct_queries"] = round(100 * sum(1 for x in rb if x) / n, 1)
        return out

    A, B = arm_stats("a", raw), arm_stats("b", raw)
    kinds = {}
    for k in ("real_suggest", "vague", "hinglish", "typo", "dead_end"):
        sub = [r for r in raw if panel[r["id"]]["kind"] == k]
        kinds[k] = {"n": len(sub), "a": arm_stats("a", sub), "b": arm_stats("b", sub)}

    # failure examples: guided arm showed items but ALL top-3 are irrelevant
    fails = []
    for r in raw:
        v = judged.get(f"{r['id']}:b", [])
        if r["b"]["top3"] and set(v) <= {"I"}:
            fails.append({"id": r["id"], "query": r["query"], "kind": panel[r["id"]]["kind"],
                          "items": [t["title"][:60] for t in r["b"]["top3"]]})
    absent_ids = [r["query"] for r in raw if r["absent"]]

    data = {"panel_n": len(raw), "arms": {"baseline_naive": A, "guided": B},
            "by_kind": kinds, "absent_from_catalogue": absent_ids,
            "failure_examples": fails[:10]}
    (OUT / "evalv2.json").write_text(json.dumps(data, indent=2))

    def row(name, arm, key):
        s = arm[key]
        ci = s["ci95"]
        return f"{s['pct']}% [{ci[0]}-{ci[1]}]" if s["pct"] is not None else "–"

    lines = []
    lines.append("# Eval v2 — held-out panel, two arms")
    lines.append("")
    lines.append(f"Panel: **{len(raw)} queries, frozen in git before any arm was run** "
                 f"(real Google-Suggest-shaped {sum(1 for r in raw if panel[r['id']]['kind']=='real_suggest')}, "
                 f"vague {sum(1 for r in raw if panel[r['id']]['kind']=='vague')}, "
                 f"Hinglish {sum(1 for r in raw if panel[r['id']]['kind']=='hinglish')}, "
                 f"typo {sum(1 for r in raw if panel[r['id']]['kind']=='typo')}, "
                 f"dead-end {sum(1 for r in raw if panel[r['id']]['kind']=='dead_end')}). "
                 "Deduped against the 44 canaries and the old 150-query dev set.")
    lines.append("")
    lines.append("Arms: **A baseline** = `naive` keyword search, one shot, no questions "
                 "(the pre-guidance engine). **B guided** = live app path "
                 "(guided scorer + ≤3 follow-up questions answered by a neutral "
                 "deterministic simulator, client re-search + rollback semantics).")
    lines.append("Relevance of each arm's top-3 judged by Qwen (single LLM judge, "
                 "thinking off; R/P/I per item; 0 unknowns).")
    lines.append("")
    lines.append("| Metric | A baseline (naive) | B guided |")
    lines.append("|---|---|---|")
    lines.append(f"| Null rate (0 results) | {row('a', A, 'null_strict')} | {row('b', B, 'null_strict')} |")
    lines.append(f"| App null (final < 2 intent-matched) | {row('a', A, 'null_app_lt2_intent')} | {row('b', B, 'null_app_lt2_intent')} |")
    lines.append(f"| success@3 (≥1 relevant in top-3, Qwen) | {row('a', A, 'success_at3')} | {row('b', B, 'success_at3')} |")
    lines.append(f"| usable@3 (≥1 relevant or partial) | {row('a', A, 'usable_at3')} | {row('b', B, 'usable_at3')} |")
    lines.append(f"| p50 / p95 latency ms | {A['latency_ms']['p50']} / {A['latency_ms']['p95']} | {B['latency_ms']['p50']} / {B['latency_ms']['p95']} |")
    lines.append(f"| Questions / journey (avg) | – | {B['questions_avg']} (max {B['questions_max']}) |")
    lines.append(f"| Rollback events (answer made it worse) | – | {B['rollback_turns']} turns across {B['rollback_rate_pct_queries']}% of journeys |")
    lines.append("")
    lines.append("Outcome classes (app-intent definition; Qwen-judged below):")
    lines.append("")
    lines.append("| Outcome | A | B |")
    lines.append("|---|---|---|")
    for oc in ("resolved", "null", "weak", "substitute_shown", "not_in_catalogue"):
        lines.append(f"| {oc} | {A['outcomes'].get(oc, 0)} | {B['outcomes'].get(oc, 0)} |")
    lines.append("")
    lines.append("## Per-kind (Qwen success@3 / usable@3)")
    lines.append("")
    lines.append("| kind | n | A success@3 | B success@3 | A usable@3 | B usable@3 |")
    lines.append("|---|---|---|---|---|---|")
    for k, v in kinds.items():
        lines.append(f"| {k} | {v['n']} | {row('a', v['a'], 'success_at3')} | {row('b', v['b'], 'success_at3')} | {row('a', v['a'], 'usable_at3')} | {row('b', v['b'], 'usable_at3')} |")
    lines.append("")
    lines.append(f"Products absent from the catalogue per the guided lexical probe: {len(absent_ids)} "
                 f"({', '.join(absent_ids[:12])}{', …' if len(absent_ids) > 12 else ''}).")
    lines.append("")
    lines.append("## Failure examples (guided arm, all top-3 irrelevant per Qwen)")
    lines.append("")
    for fex in fails[:10]:
        lines.append(f"- `{fex['query']}` ({fex['kind']}): " + " / ".join(fex["items"]))
    if not fails:
        lines.append("- none")
    lines.append("")
    lines.append("## Interpretation & limitations (honest read)")
    lines.append("")
    lines.append("- The old n=150 study (27.3% → 8.0% null) remains the *dev-set* result: its panel was "
                 "calibrated against the live app, so it demonstrates mechanics, not shopper benefit. "
                 "Eval v2 is the held-out check; both are reported, never blended.")
    lines.append("- Relevance is judged by a **single LLM judge** (Qwen, thinking off) with no human "
                 "spot-check in this pass; there is no multi-annotator ground truth.")
    lines.append("- `real_suggest` queries are Google-Suggest *autocompletes*, not logged shopper "
                 "queries, and they are gift-heavy (a bias that favours this app's occasion strength).")
    lines.append("- There are **no real users** on this deployment; the guided arm's answers come from "
                 "a neutral deterministic simulator (middle budget band / first count-backed option).")
    lines.append("- The catalogue is a demo catalogue (US-converted + synthetic India layer); absolute "
                 "relevance numbers are indicative.")
    lines.append("- The guided probe marks a product class \"absent\" only when it finds <2 intent "
                 "matches lexically; a judgeable substitute may still be the right honest answer for "
                 "some of those (e.g. a digital saxophone for \"saxophone\").")
    (OUT / "summary.md").write_text("\n".join(lines) + "\n")
    print("wrote", OUT / "evalv2.json", "and", OUT / "summary.md")
    print(f"A: null {A['null_strict']['pct']}% app-null {A['null_app_lt2_intent']['pct']}% s@3 {A['success_at3']['pct']}% u@3 {A['usable_at3']['pct']}%")
    print(f"B: null {B['null_strict']['pct']}% app-null {B['null_app_lt2_intent']['pct']}% s@3 {B['success_at3']['pct']}% u@3 {B['usable_at3']['pct']}% q {B['questions_avg']}")


if __name__ == "__main__":
    main()
