"""
AskCart agentic extractor (v2, reuses photo_case collector architecture).
Agent loop: LLM receives current tally vs targets and a tool catalog, returns
the next batch of fetch actions (JSON); tools execute locally with resume via
part files. Decisions are audited to logs/agent_decisions.jsonl.
LLM: Gemini (see llm_client.py).
Zero-LLM fallback: --auto runs the locked source table greedily (deterministic).
Usage: .venv/bin/python extractor/agent.py [--auto] [--limit N]
"""
import argparse
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE))
sys.path.insert(0, str(BASE / "extractor"))

import collect_play
import collect_appstore
import collect_reddit
import collect_amazon_reviews
import collect_trustpilot
import collect_trends
from sources import (PLAY_TABLE, APPSTORE_TABLE, REDDIT_TABLE,
                      AMZ_REVIEWS_TABLE, TRUSTPILOT_TABLE)
from llm_client import is_available, chat_json

LOG = BASE / "logs" / "agent.log"
DECISIONS = BASE / "logs" / "agent_decisions.jsonl"
TARGETS = {"play": 24000, "appstore": 5000, "reddit": 3000,
            "amazon_reviews": 40000, "trustpilot": 15000}
TOOL_CATALOG = """
- {"tool":"fetch_play","app":<pkg>,"country":<cc>,"lang":"en","count":<n>,"sort":"newest"|"relevant"}
- {"tool":"fetch_appstore","app":<app label>,"country":<cc>,"pages":<n>}
- {"tool":"fetch_reddit","sub":<subreddit>,"query":"<free-form search query>"}
- {"tool":"fetch_amazon_reviews","category":"<one of: ALL_BEAUTY_CATS>"}  # product-level reviews, 12MB prefix each
- {"tool":"fetch_trustpilot"}  # brand/marketplace reputation reviews
- {"tool":"fetch_trends"}      # demand/seasonality insight (no corpus rows)
- {"tool":"finish","reason":"..."}
"""


def log(msg):
    line = f"{datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')} {msg}"
    print(line, flush=True)
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG, "a") as f:
        f.write(line + "\n")


def audit(decision):
    DECISIONS.parent.mkdir(parents=True, exist_ok=True)
    with open(DECISIONS, "a") as f:
        f.write(json.dumps({"ts": datetime.now(timezone.utc).isoformat(), **decision}) + "\n")


def tally():
    t = {"play": 0, "appstore": 0, "reddit": 0, "amazon_reviews": 0, "trustpilot": 0}
    for src in t:
        p = BASE / "data" / "raw" / f"{src}_raw.parquet"
        if p.exists():
            t[src] = int(pd.read_parquet(p, columns=["doc_id"]).shape[0])
    return t


def execute(action):
    kind = action.get("tool")
    if kind == "fetch_play":
        pkg, cc, lang, sort = action["app"], action["country"], action.get("lang", "en"), action.get("sort", "newest")
        label = next((l for p, l, _ in PLAY_TABLE if p == pkg), pkg)
        count = int(action.get("count", 500))
        n = collect_play.fetch_combo(pkg, label, cc, lang, count, "newest" if sort == "newest" else "relevant")
        return f"fetch_play {label}/{cc}/{sort} +{n}"
    if kind == "fetch_appstore":
        label = action["app"]
        term = next((t for t, l, _ in APPSTORE_TABLE if l == label), label)
        n = collect_appstore.fetch_app(term, label, action["country"], int(action.get("pages", 5)))
        return f"fetch_appstore {label}/{action['country']} +{n}"
    if kind == "fetch_reddit":
        n = collect_reddit.fetch_pair(action["sub"], action["query"])
        return f"fetch_reddit {action['sub']} +{n}"
    if kind == "fetch_amazon_reviews":
        cat = action.get("category")
        if cat not in AMZ_REVIEWS_TABLE:
            return f"fetch_amazon_reviews: unknown category {cat}"
        f = collect_amazon_reviews.fetch_prefix(cat, collect_amazon_reviews.BYTES_PER_CAT)
        n = len(collect_amazon_reviews.parse_jsonl(f, cat)) if f else 0
        return f"fetch_amazon_reviews {cat} +{n}"
    if kind == "fetch_trustpilot":
        rc = subprocess.run([sys.executable, str(Path(__file__).parent / "collect_trustpilot.py"),
                             "--max-rows", str(TARGETS["trustpilot"])],
                            capture_output=True, text=True)
        return f"fetch_trustpilot: {rc.stdout.strip().splitlines()[-1] if rc.stdout else rc.stderr[:120]}"
    if kind == "fetch_trends":
        rc = subprocess.run([sys.executable, str(Path(__file__).parent / "collect_trends.py")],
                            capture_output=True, text=True)
        return f"fetch_trends: {rc.stdout.strip().splitlines()[0] if rc.stdout else rc.stderr[:120]}"
    return f"unknown tool {kind}"


def greedy_plan(t):
    """Deterministic fallback: walk the locked tables until targets met."""
    actions = []
    for pkg, label, combos in PLAY_TABLE:
        if t["play"] >= TARGETS["play"]:
            break
        for cc, lang, newest_n, rel_n in combos:
            if t["play"] >= TARGETS["play"]:
                break
            for sort, n in (("newest", newest_n), ("relevant", rel_n)):
                actions.append({"tool": "fetch_play", "app": pkg, "country": cc,
                                "lang": lang, "count": n, "sort": sort})
                t["play"] += n
    for term, label, combos in APPSTORE_TABLE:
        if t["appstore"] >= TARGETS["appstore"]:
            break
        for cc, pages in combos:
            actions.append({"tool": "fetch_appstore", "app": label, "country": cc, "pages": pages})
            t["appstore"] += pages * 50
    for sub, queries in REDDIT_TABLE:
        if t["reddit"] >= TARGETS["reddit"]:
            break
        for q in queries:
            actions.append({"tool": "fetch_reddit", "sub": sub, "query": q})
            t["reddit"] += 100
    return actions


def llm_plan(t):
    done = all(t[k] >= TARGETS[k] for k in TARGETS)
    sysp = (
        "You are an evidence-collection agent for an e-commerce search UX study. "
        "You fetch user reviews/complaints about online shopping apps from Play Store, "
        "App Store and Reddit to build a review corpus. Prefer sources that are under target "
        "and apps that serve price-sensitive and occasion-driven shoppers (India, MENA, US). "
        "Respond ONLY with a JSON object: {\"reason\": \"...\", \"actions\": [ ...tool calls... ]}. "
        "Use at most 8 actions. When all targets are met, return actions: [{\"tool\":\"finish\",\"reason\":\"...\"}]."
    )
    user = (
        f"Current corpus tally: {t} (targets: {TARGETS}). "
        f"Source catalog: play apps {[ (l, c[0]) for _, l, c in [(p, l, c) for p, l, c in PLAY_TABLE] ]}; "
        f"appstore apps {[l for _, l, _ in APPSTORE_TABLE]}; reddit subs {[s for s, _ in REDDIT_TABLE]}. "
        + TOOL_CATALOG + (" All targets met - finish." if done else " Plan the next fetch batch.")
    )
    obj, model = chat_json([{"role": "system", "content": sysp},
                            {"role": "user", "content": user}])
    return obj.get("reason", ""), obj.get("actions", []), model


def run(auto=False, limit=None):
    t0 = time.time()
    mode = "greedy-auto" if (auto or not is_available()) else "llm-agent"
    if not auto and is_available():
        log(f"agent mode=llm (available)")
    else:
        log(f"agent mode=greedy (auto={auto}, llm_available={is_available()})")
    actions = greedy_plan(tally()) if mode == "greedy-auto" else None
    if mode == "greedy-auto" and limit:
        actions = actions[:limit]
    for i, act in enumerate(actions if mode == "greedy-auto" else []):
        log(f"[{i}] {act}")
        audit({"cycle": i, "mode": mode, "action": act})
        res = execute(act)
        log(f"    -> {res}")
    if mode == "llm-agent":
        cycle = 0
        while True:
            t = tally()
            done = all(t[k] >= TARGETS[k] for k in TARGETS)
            reason, actions, model = llm_plan(t)
            audit({"cycle": cycle, "mode": mode, "model": model, "tally": t,
                   "reason": reason, "actions": actions})
            if done or not actions or any(a.get("tool") == "finish" for a in actions):
                log(f"cycle {cycle}: done ({reason or 'finish action'})")
                break
            if limit and cycle >= limit:
                log(f"limit {limit} cycles reached")
                break
            for a in actions[:8]:
                res = execute(a)
                log(f"  -> {res}")
            cycle += 1
            if cycle >= 12:
                log("max 12 cycles")
                break
    t = tally()
    log(f"agent finished: tally={t} in {time.time()-t0:.0f}s")
    return t


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--auto", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    a = ap.parse_args()
    t = run(auto=a.auto, limit=a.limit)
    print("AGENT_DONE", t)
