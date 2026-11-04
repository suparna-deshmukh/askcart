"""
Qwen suite - UX v2 replay: mirrors the ACTUAL UI journey (page.jsx).

The UI does not stop at a resolved t1: "keep guiding - a resolved result
is a start, not the destination." After EVERY displayed search (turn T < 5)
the policy may offer one more question (turn T+1); each chip answer re-
searches (relax:true) and the next display offers the next ladder question.
Max 4 follow-ups per journey. This module captures every question the
current policy actually asks.

Faithful to app/app/page.jsx:
  - askGuide sends {query, n_results, turn, prev_types, region, persona, lang}
  - applyAnswer chip mapping:
      budget   -> max number in the label; "Not sure / flexible" -> persona default
      occasion -> static map (everyday/daily -> null)
      brand    -> "best_rated" for No preference / Best rated
      for_whom -> women/men/kids by regex, else unisex
      size     -> "Any" -> null, else lowercase
      capacity -> "Any" -> null, else chip
  - category answer that leaves <2 on-intent -> retry without the category
  - rollback guard: keep previous results if the answer did not improve
Deterministic: persona ground-truth answers, mode:fallback, 0 LLM tokens.
First search has no relax; every post-answer search uses relax:true.

Returns (captured, outcome):
  captured: [{turn, type, question, options, option_counts, n_before,
              answers_so_far}, ...]   (list index = seq)
  outcome:  {"resolved": bool, "resolved_t1": bool, "n_final": n, "turns": t}
"""
import importlib.util
import re
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent.parent
spec = importlib.util.spec_from_file_location("ps", BASE / "eval/persona_sim.py")
ps = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ps)

OCC_MAP = {"gift": "gift", "birthday": "birthday", "wedding": "wedding",
           "shaadi": "wedding", "anniversary": "anniversary", "party": "party",
           "diwali": "diwali", "christmas": "christmas", "valentines": "valentines",
           "graduation": "graduation", "housewarming": "housewarming",
           "everyday": None, "daily": None}


def ui_answer(guide, chip, p):
    """Mirror of page.jsx applyAnswer() chip -> search opts."""
    t = guide.get("type", "")
    c = str(chip)
    if t == "budget":
        nums = [int(x.replace(",", "")) for x in re.findall(r"[\d,]+", c)
                if int(x.replace(",", "")) > 0]
        if re.search(r"not sure|flexible", c, re.I):
            return {"budget": p.get("budget") or 2000}
        return {"budget": max(nums)} if nums else {}
    if t == "occasion":
        key = c.lower().split("/")[0].strip()
        return {"occasion": OCC_MAP.get(key)}
    if t == "brand":
        return {"brand": "best_rated" if re.search(r"no preference|best rated", c, re.I) else c}
    if t == "for_whom":
        return {"forWhom": "women" if re.search(r"women", c, re.I)
                else "men" if re.search(r"men", c, re.I)
                else "kids" if re.search(r"kids", c, re.I)
                else "unisex"}
    if t == "size":
        return {"size": None if re.search(r"any", c, re.I) else c.lower()}
    if t == "capacity":
        return {"capacity": None if re.search(r"any", c, re.I) else c}
    return {"category": c}


def replay(url, p, dim, q):
    r0, _ = ps.post(url + "/api/search", {"query": q})
    results = r0["results"]
    n = ps.intent_count(results)
    captured, prev, answers = [], [], {}
    turn = 1
    t1 = n >= 2
    while turn < 5:
        g, _ = ps.post(url + "/api/guide",
                       {"query": q, "n_results": n, "turn": turn + 1,
                        "prev_types": prev, "mode": "fallback", "lang": p["lang"],
                        "region": p["region"], "persona": p["segment"]})
        guide = g.get("guide")
        if not guide:
            break  # policy is done (no eligible facet / destination / dead end)
        opts = [str(o) for o in guide.get("options", [])]
        oc = guide.get("optionCounts", []) or []
        counts = {str(o.get("label", "")): o.get("count", 0) for o in oc}
        captured.append({"turn": turn + 1, "type": guide.get("type"),
                         "question": guide.get("question", ""),
                         "options": opts,
                         "option_counts": [counts.get(o, -1) for o in opts],
                         "n_before": n, "answers_so_far": dict(answers)})
        chip = ps.pick_option(guide, p)
        ans = ui_answer(guide, chip, p)
        answers.update({k: v for k, v in ans.items() if v is not None})
        prev.append(guide.get("type"))
        turn += 1  # the search after this chip answer
        res, _ = ps.post(url + "/api/search", {"query": q, "relax": True, **ans})
        new = res["results"]
        # category answer that was a dead end -> retry without it (page.jsx)
        if ps.intent_count(new) < 2 and ans.get("category"):
            res, _ = ps.post(url + "/api/search",
                             {"query": q, "relax": True,
                              "budget": ans.get("budget"),
                              "occasion": ans.get("occasion")})
            new = res["results"]
        # rollback guard (page.jsx applyAnswer)
        newIntent, oldIntent = ps.intent_count(new), n
        keep_new = (newIntent > oldIntent
                    or (newIntent == oldIntent and len(new) >= len(results)))
        results = new if keep_new else results
        n = ps.intent_count(results)
        # NOTE: even if n >= 2 (resolved) we do NOT stop - the UI keeps
        # guiding with the next ladder question on the next display.
    return captured, {"resolved": n >= 2, "resolved_t1": t1, "n_final": n, "turns": turn}
