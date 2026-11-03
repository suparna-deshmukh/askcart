"""
AskCart figures for the showcase (docs/evidence/figures/).
Reads only pipeline/eval artifacts - re-run after any pipeline or eval pass:
  .venv/bin/python scripts/make_figures.py
"""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

BASE = Path(__file__).resolve().parent.parent
OUT = BASE / "docs" / "evidence" / "figures"
OUT.mkdir(parents=True, exist_ok=True)
plt.rcParams.update({"figure.dpi": 140, "font.size": 9,
                     "axes.spines.top": False, "axes.spines.right": False})

C = {"trust_gap": "#d6604d", "budget_mismatch": "#e0a53c",
     "zero_or_wrong": "#5b8bd9", "occasion_blindness": "#6aa84f",
     "not_search_related": "#8a8f98", "other": "#b9a888"}


def fig_funnel():
    counts = json.loads((BASE / "data" / "pipeline_counts.json").read_text())
    stages = [counts["raw_total"], counts["clean"], counts["complaints_flagged"],
              counts["root_cause_labeled"]]
    labels = ["raw reviews (5 sources)", "cleaned", "complaints", "root-caused"]
    fig, ax = plt.subplots(figsize=(6.4, 3.0))
    for i, (v, l) in enumerate(zip(stages, labels)):
        ax.barh([3 - i], [v], left=[0], color=["#8895a7", "#6f8296", "#4d6480", "#2f4560"][i])
        ax.text(v + stages[0] * 0.01, 3 - i, f"{v:,}", va="center")
        ax.text(-stages[0] * 0.01, 3 - i, l, va="center", ha="right")
    ax.set_xlim(0, max(stages) * 1.15)
    ax.set_ylim(-0.6, 3.6)
    ax.set_yticks([])
    ax.set_title("Review pipeline funnel")
    fig.tight_layout()
    fig.savefig(OUT / "funnel.png")
    plt.close(fig)


def fig_root_causes():
    rc = json.loads((BASE / "data" / "out" / "root_causes.json").read_text())
    fig, ax = plt.subplots(figsize=(6.4, 3.2))
    names = [r["root_cause"] for r in rc]
    vals = [r["n"] for r in rc]
    ax.bar(names, vals, color=[C[n] for n in names])
    for n, v in zip(names, vals):
        r = next(x for x in rc if x["root_cause"] == n)
        ax.text(n, v + max(vals) * 0.01, f"{v:,}\n{r['pct']}%", ha="center")
    ax.set_ylim(0, max(vals) * 1.18)
    ax.set_title("Complaints by root cause (Qwen full-corpus labels, 6-class)")
    fig.tight_layout()
    fig.savefig(OUT / "root_causes.png")
    plt.close(fig)


def fig_bayesian():
    import csv
    rows = list(csv.DictReader(open(BASE / "data" / "out" / "bayesian.csv")))
    rows = [r for r in rows if r.get("n") and int(float(r["n"])) >= 100][:12]
    rows.sort(key=lambda r: float(r["bayesian_rating"]))
    fig, ax = plt.subplots(figsize=(6.4, 3.4))
    ax.barh([r["app"] for r in rows], [float(r["bayesian_rating"]) for r in rows],
            color="#5b8bd9")
    for i, r in enumerate(rows):
        ax.text(float(r["bayesian_rating"]) + 0.03, i, f'{r["bayesian_rating"]} (n={int(float(r["n"]))})',
                va="center", fontsize=7.5)
    ax.set_xlim(0, 5.6)
    ax.set_xlabel("Bayesian rating (shrinkage m=100)")
    ax.set_title("App trust ratings, shrinkage-penalized")
    fig.tight_layout()
    fig.savefig(OUT / "bayesian_ratings.png")
    plt.close(fig)


def fig_turns():
    p = BASE / "eval" / "results" / "summary.txt"
    if not p.exists():
        return
    s = json.loads(p.read_text())
    td = s["turn_distribution"]
    labels = [f"turn {k.lstrip('t')} ({td[k]})" for k in ["t1", "t2", "t3"] if td.get(k)]
    labels += [f"unresolved ({td['unresolved']})"]
    vals = [td["t1"], td["t2"], td["t3"], td["unresolved"]]
    fig, ax = plt.subplots(figsize=(6.4, 3.0))
    ax.bar(labels, vals, color=["#6aa84f", "#8bc34a", "#e0a53c", "#d6604d"])
    for i, v in enumerate(vals):
        ax.text(i, v + 1, str(v), ha="center")
    ax.set_ylim(0, max(vals) * 1.2)
    ax.set_title(f"n={s['n']} guided study: baseline null {s['baseline_null_pct']}% -> "
                 f"guided null {s['guided_null_pct']}% | {s['resolved_by_turn2_pct']}% by turn 2")
    fig.tight_layout()
    fig.savefig(OUT / "study_turns.png")
    plt.close(fig)


def fig_trends():
    p = BASE / "data" / "out" / "trends_insights.json"
    if not p.exists():
        return
    d = json.loads(p.read_text())
    peaks = d.get("seasonal_peaks", {})
    fig, ax = plt.subplots(figsize=(6.4, 3.2))
    items = list(peaks.items())
    ax.bar([k.replace("_", " ") for k, _ in items], [v["peak_share_pct"] for _, v in items],
           color="#5b8bd9")
    for i, (k, v) in enumerate(items):
        ax.text(i, v["peak_share_pct"] + 0.5, f"{v['peak_share_pct']}%", ha="center")
        ax.text(i, -4, k.replace("_", " "), ha="center", fontsize=7, rotation=18)
    ax.set_ylim(0, 60)
    ax.set_ylabel("% of monthly views at peak")
    ax.set_title("Occasion seasonality (Wikipedia pageviews, monthly 2024-09..2026-01)")
    fig.tight_layout()
    fig.savefig(OUT / "trends_seasonality.png")
    plt.close(fig)


def fig_catalog():
    import json as j
    cat = j.loads((BASE / "app" / "public" / "catalog.json").read_text())
    bands = {"<=2k": 0, "2-5k": 0, "5-10k": 0, "10-20k": 0, ">20k": 0}
    for x in cat:
        v = x["price"]
        b = "<=2k" if v <= 2000 else "2-5k" if v <= 5000 else "5-10k" if v <= 10000 \
            else "10-20k" if v <= 20000 else ">20k"
        bands[b] += 1
    fig, ax = plt.subplots(figsize=(6.4, 3.0))
    ax.bar(list(bands), list(bands.values()), color="#8895a7")
    for i, (k, v) in enumerate(bands.items()):
        ax.text(i, v + 100, f"{v:,}", ha="center")
    ax.set_ylim(0, max(bands.values()) * 1.2)
    ax.set_title(f"Catalogue price bands ({len(cat):,} SKUs, INR)")
    fig.tight_layout()
    fig.savefig(OUT / "catalog_bands.png")
    plt.close(fig)


if __name__ == "__main__":
    fig_funnel(); fig_root_causes(); fig_bayesian()
    fig_turns(); fig_trends(); fig_catalog()
    print("figures ->", OUT)
    for f in sorted(OUT.glob("*.png")):
        print(" ", f.name, f.stat().st_size // 1024, "KB")
