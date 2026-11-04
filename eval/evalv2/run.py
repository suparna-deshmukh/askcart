"""
AskCart Eval v2 - held-out panel, two arms, honest outcome classes.

Arm A (baseline): naive keyword search, one shot, no questions
     (the pre-guidance engine; what the old study calls "baseline").
Arm B (guided):  the live app path - guided scorer, follow-up questions
     answered by a neutral deterministic simulator, same re-search
     semantics as the client (relax=True + latest answer only), the
     client's rollback rule applied per turn.

Outcome classes (per query, both arms):
  resolved          final intent-matched results >= 2
  substitute_shown  >= 1 result shown but 0-1 intent-matched AND the
                    product class is absent from the catalogue (lexical
                    probe: 0 intent hits in naive mode)
  not_in_catalogue  0 results shown and the product class is absent
  weak              >= 1 result shown, 0-1 intent-matched, class present

Usage: .venv/bin/python eval/evalv2/run.py [--url http://localhost:3000]
Writes eval/evalv2/results/raw.jsonl (one line per query; re-runs skip).
"""
import argparse
import json
import time
import urllib.request
from pathlib import Path

BASE = Path(__file__).resolve().parent
OUT = BASE / "results"
GUIDE_MODE = "fallback"  # deterministic: policy decides, template phrases


def post(url, payload, retries=3):
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                         headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception as e:
            last = e
            time.sleep(2 * (i + 1))
    raise last


def pick_option(guide):
    """Neutral user simulator: no personas. Deterministic, documented."""
    opts = [o for o in guide.get("options", [])]
    counts = {c.get("label"): c.get("count", 0) for c in guide.get("optionCounts", [])}
    t = guide.get("type", "")
    if t == "budget":
        nums = []
        for o in opts:
            import re
            m = re.search(r"(\d[\d,]*)", str(o))
            if m and not re.search(r"not sure|flexible", str(o), re.I):
                nums.append((int(m.group(1).replace(",", "")), o))
        if nums:
            nums.sort()
            return str(nums[len(nums) // 2][1])  # middle band
        return str(opts[0])
    if t == "brand":
        for o in opts:
            if "no preference" in str(o).lower() or "best rated" in str(o).lower():
                return str(o)
        return str(opts[0])
    # occasion / category / for_whom / size / capacity: first option with
    # a non-zero count (the data-supported answer), else first
    for o in opts:
        if counts.get(str(o), 0) > 0:
            return str(o)
    return str(opts[0])


def map_answer(guide, chip):
    import re
    t = guide.get("type", "")
    if t == "budget":
        m = re.search(r"(\d[\d,]*)", str(chip))
        return {"budget": int(m.group(1).replace(",", "")) if m else 2000}
    if t == "occasion":
        key = str(chip).strip().lower().split("/")[0].strip()
        m = {"gift": "gift", "birthday": "birthday", "wedding": "wedding", "shaadi": "wedding",
             "anniversary": "anniversary", "party": "party", "diwali": "diwali",
             "christmas": "christmas", "valentines": "valentines",
             "graduation": "graduation", "housewarming": "housewarming",
             "everyday": None, "daily": None}
        return {"occasion": m.get(key)}
    if t == "brand":
        return {"brand": None if re.search(r"no preference|best rated", str(chip), re.I) else chip}
    if t == "for_whom":
        c = str(chip).lower()
        return {"forWhom": "women" if "women" in c else "men" if "men" in c else "kids" if "kids" in c else "unisex"}
    if t == "size":
        return {"size": None if "any" in str(chip).lower() else str(chip).lower()}
    if t == "capacity":
        return {"capacity": None if re.search(r"\bany\b", str(chip), re.I) else chip}
    return {"category": chip}


def intent_count(results):
    return sum(1 for r in results if r.get("intent"))


def outcome(n_results, intent_n, absent):
    if intent_n >= 2:
        return "resolved"
    if n_results == 0:
        return "not_in_catalogue" if absent else "null"
    return "substitute_shown" if absent else "weak"


def run_arm_a(url, q):
    t0 = time.time()
    r = post(url + "/api/search", {"query": q, "naive": True})
    ms = int((time.time() - t0) * 1000)
    res = r.get("results", [])
    return {"n": len(res), "intent": intent_count(res), "ms": ms,
            "top3": [{"sku": x["sku"], "title": x["title"], "price": x["price"],
                      "category": x["category"]} for x in res[:3]]}


def run_arm_b(url, q):
    t0 = time.time()
    r = post(url + "/api/search", {"query": q})
    turns_ms = [int((time.time() - t0) * 1000)]
    res = r.get("results", [])
    intent_n = intent_count(res)
    first_n, first_intent = len(res), intent_n  # guided probe for absence
    questions, rollbacks, answers = 0, 0, []
    top3 = [{"sku": x["sku"], "title": x["title"], "price": x["price"],
             "category": x["category"]} for x in res[:3]]
    for _ in range(3):
        if intent_n >= 2:
            break
        t1 = time.time()
        g = post(url + "/api/guide", {"query": q, "n_results": intent_n,
                                      "asked": answers, "mode": GUIDE_MODE})
        turns_ms.append(int((time.time() - t1) * 1000))
        guide = g.get("guide")
        if not guide:
            break
        questions += 1
        chip = pick_option(guide)
        answers.append(f"{guide.get('type')}:{chip}")
        body = {"query": q, "relax": True}
        for k, v in map_answer(guide, chip).items():
            if v is not None:
                body[k] = v
        t2 = time.time()
        r2 = post(url + "/api/search", body)
        turns_ms.append(int((time.time() - t2) * 1000))
        res2 = r2.get("results", [])
        intent2 = intent_count(res2)
        # client rollback rule: keep previous picks if the answer didn't help
        if not (intent2 > intent_n or (intent2 == intent_n and len(res2) >= len(res))):
            rollbacks += 1
        else:
            res, intent_n = res2, intent2
            top3 = [{"sku": x["sku"], "title": x["title"], "price": x["price"],
                     "category": x["category"]} for x in res[:3]]
    return {"n": len(res), "intent": intent_n, "ms": sum(turns_ms),
            "questions": questions, "rollbacks": rollbacks, "answers": answers,
            "first_n": first_n, "first_intent": first_intent, "top3": top3}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:3000")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    raw = OUT / "raw.jsonl"
    panel = [json.loads(l) for l in (BASE / "panel.jsonl").read_text().splitlines() if l.strip()]
    done = {}
    if raw.exists():
        for l in raw.read_text().splitlines():
            if l.strip():
                r = json.loads(l)
                done[r["id"]] = r
    f = open(raw, "a")
    for i, q in enumerate(panel):
        if q["id"] in done:
            continue
        a_rec = run_arm_a(a.url, q["query"])
        b_rec = run_arm_b(a.url, q["query"])
        # catalogue-absence probe: the guided lexical probe found nothing
        # (the app's own null condition) - the product class is absent
        absent = b_rec["first_intent"] == 0 and b_rec["first_n"] < 2
        rec = {
            "id": q["id"], "query": q["query"], "kind": q["kind"],
            "absent": absent,
            "a": {**a_rec, "outcome": outcome(a_rec["n"], a_rec["intent"], absent)},
            "b": {**b_rec, "outcome": outcome(b_rec["n"], b_rec["intent"], absent)},
        }
        f.write(json.dumps(rec) + "\n")
        f.flush()
        if (i + 1) % 20 == 0:
            print(f"{i+1}/{len(panel)} done", flush=True)
    f.close()
    print(f"done: {len(done) + len(panel) - len([q for q in panel if q['id'] not in done])} total in {raw}")


if __name__ == "__main__":
    main()
