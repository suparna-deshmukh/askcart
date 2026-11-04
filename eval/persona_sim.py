"""
AskCart persona simulation: 300 personas x 10 query dimensions = 3,000 journeys.

Personas = 3 languages (en / hinglish / hi-Devanagari) x 10 segments x 10 regions.
Dimensions (every user, every dimension):
  D1 elec_budget   electronics + stated budget
  D2 fashion_recep fashion + recipient (relation words)
  D3 gift_occasion gift + occasion
  D4 vague         vague intent
  D5 typo           deliberate misspellings
  D6 spec           structured spec slots (tonnage/storage/size)
  D7 dead_end       verified absent from catalogue
  D8 browse         bare noun, no budget
  D9 tight_price    narrow low budget
  D10 relation      Hinglish/Devanagari relationship + gift

Each query runs the real guided journey against the live app (HTTP,
mode=fallback guide => zero LLM tokens), answers come from the persona's
ground-truth preferences, max 4 follow-ups (5 turns) like the client.

Outputs: logs/persona_sim_<ts>.jsonl (one line per journey) +
eval/results/persona_sim_summary.json (aggregates by dim/lang/segment).
Usage: .venv/bin/python eval/persona_sim.py [--url http://localhost:3000] [--workers 8]
"""
import argparse, json, re, time, urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent

SEGMENTS = {
    "student":        dict(budget=2000,  occasion="birthday",     brand=None,
        nouns=["headphones", "phone case", "earbuds", "sneakers", "mouse", "water bottle"],
        fashion=["tshirt", "sneakers", "tshirt", "hoodie"], cheap=["pen", "bangle", "tshirt", "water bottle", "candle"], tiny=500),
    "young_pro":      dict(budget=15000, occasion="anniversary",  brand=None,
        nouns=["laptop", "phone", "watch", "blazer", "charger", "perfume"],
        fashion=["blazer", "dress", "shirt", "trousers"], cheap=["watch", "perfume", "wallet", "watch", "charger"], tiny=1000),
    "parent":         dict(budget=5000,  occasion="baby",         brand=None,
        nouns=["baby shoes", "bottle", "night light", "kids dress", "diaper bag", "teether"],
        fashion=["kids dress", "kurta", "kids dress", "tshirt"], cheap=["bottle", "baby shoes", "teether", "bottle", "candle"], tiny=500),
    "homemaker":      dict(budget=3000,  occasion="diwali",       brand=None,
        nouns=["cookware", "bedsheet", "utensils", "candle", "rice cooker", "organizer"],
        fashion=["kurti", "saree", "kurta", "saree"], cheap=["candle", "utensils", "candle", "bedsheet", "candle"], tiny=500),
    "senior":         dict(budget=2500,  occasion="birthday",     brand=None,
        nouns=["shawl", "spectacles", "slipper", "watch", "spectacles", "shawl"],
        fashion=["shawl", "kurta", "saree", "kurta"], cheap=["shawl", "slipper", "bangle", "candle", "pen"], tiny=500),
    "gift_buyer":     dict(budget=2000,  occasion="gift",         brand=None,
        nouns=["candle", "mug", "perfume", "photo frame", "gift box", "candle"],
        fashion=["mug", "candle", "perfume", "gift box"], cheap=["candle", "mug", "candle", "pen", "bangle"], tiny=500),
    "price_focus":    dict(budget=1500,  occasion=None,           brand=None,
        nouns=["bangle", "pen", "tshirt", "soap", "candle", "water bottle"],
        fashion=["tshirt", "bangle", "tshirt", "candle"], cheap=["pen", "bangle", "soap", "candle", "tshirt"], tiny=200),
    "brand_lover":    dict(budget=20000, occasion="anniversary",  brand=None,
        nouns=["laptop", "phone", "tv", "watch", "headphones", "laptop"],
        fashion=["watch", "perfume", "shirt", "blazer"], cheap=["watch", "charger", "wallet", "pen", "watch"], tiny=1000),
    "techie":         dict(budget=25000, occasion=None,           brand=None,
        nouns=["phone", "laptop", "earbuds", "smartwatch", "speaker", "phone case"],
        fashion=["tshirt", "sneakers", "tshirt", "watch"], cheap=["charger", "phone case", "earbuds", "pen", "candle"], tiny=500),
    "home_owner":     dict(budget=8000,  occasion="housewarming", brand=None,
        nouns=["fan", "air fryer", "blender", "rug", "lamp", "fan"],
        fashion=["bedsheet", "organizer", "rug", "candle"], cheap=["candle", "lamp", "candle", "organizer", "candle"], tiny=500),
}
BRANDS = ["samsung", "apple", "jbl", "sony", "nike", "casio", "hp", "lg", "philips"]
REGIONS = ["north", "northwest", "south", "east", "west", "central", "northeast", "coastal", "metro", "tier23"]
FW_PREFS = ["women", "men", "kids", "unisex"]
SIZE_PREFS = ["m", "l", "xl"]
CAP_PREFS = ["1 ton", "1.5 ton", "7 kg"]
RECIPIENTS = {  # segment -> (en, hinglish, hi)
    "student":      ("a friend", "dost ke liye", "दोस्त के लिए"),
    "young_pro":    ("my wife", "biwi ke liye", "पति के लिए"),
    "parent":       ("a 5 year old", "5 saal ke bachche ke liye", "5 साल के बच्चे के लिए"),
    "homemaker":    ("my mother", "ammi ke liye", "अम्मी के लिए"),
    "senior":       ("family", "ghar wale ke liye", "घरवाले के लिए"),
    "gift_buyer":   ("a colleague", "colleague ke liye", "कॉलेग के लिए"),
    "price_focus":  ("myself", "apne liye", "अपने लिए"),
    "brand_lover":  ("him", "uske liye", "उसके लिए"),
    "techie":       ("him", "uske liye", "उसके लिए"),
    "home_owner":   ("family", "ghar wale ke liye", "घरवाले के लिए"),
}
DEAD_ENDS = ["samovar", "gramophone", "sitar", "kettledrum", "rotary phone", "theremin",
             "cornu", "sousaphone", "didgeridoo", "periscope", "bobsled", "hoverboard", "zither", "bassoon"]
TYPO = ["samsng tv", "heaphones", "mictrowave", "watsh for men", "sareee", "ipone 15", "laptob", "jootis 500"]
SPEC_EN = ["1.5 ton ac under 45k", "128gb phone under 20k", "size m kurta", "5 star ac under 30k", "7 kg washing machine"]
OCC_EN = {"birthday": "birthday", "anniversary": "anniversary", "diwali": "diwali", "gift": "gift",
          "baby": "baby shower", "housewarming": "housewarming", None: "event"}
OCC_HI = {"birthday": "जन्मदिन", "anniversary": "वर्सरी", "diwali": "दिवाली", "gift": "उपहार",
          "baby": "बेबी शावर", "housewarming": "हाउसवार्मिंग", None: "इवेंट"}
FASHION_HI = {"tshirt": "टी-शर्ट", "sneakers": "जूते", "hoodie": "हूडी", "blazer": "ब्लेज़र",
              "dress": "ड्रेस", "shirt": "शर्ट", "trousers": "पैंट", "kurta": "कुर्ता", "kurti": "कुरती",
              "saree": "साड़ी", "shawl": "श्वल्", "watch": "घड़ी", "perfume": "परफ्यूम",
              "bedsheet": "बिछौना", "organizer": "ऑर्गेनाइज़र", "rug": "करपात्र", "candle": "मोमबत्ती"}
NOUN_HI = {"headphones": "हेडफ़ोन", "phone case": "फ़ोन केस", "earbuds": "इयरबड्स", "sneakers": "जूते",
           "mouse": "माउस", "water bottle": "पानी की बोतल", "laptop": "लैपटॉप", "phone": "फ़ोन",
           "watch": "घड़ी", "blazer": "ब्लेज़र", "charger": "चार्जर", "perfume": "परफ्यूम",
           "baby shoes": "बेबी जूते", "bottle": "बोतल", "night light": "नाइट लाइट",
           "kids dress": "बच्चे का ड्रेस", "diaper bag": "डायपर बैग", "teether": "टीदर",
           "cookware": "कुचन सामान", "bedsheet": "बिछौना", "utensils": "बर्तन", "candle": "डिब्बा",
           "rice cooker": "राइस कुकर", "organizer": "ऑर्गेनाइज़र", "shawl": "श्वल्", "spectacles": "चश्मा",
           "slipper": "स्लिपर", "mug": "मग", "photo frame": "फोटो फ्रेम", "gift box": "गिफ्ट बॉक्स",
           "soap": "साबुन", "tv": "टीवी", "speaker": "स्पीकर", "smartwatch": "स्मार्टवॉच",
           "pen": "पेन", "fan": "पंखा", "air fryer": "एयर फ्रायर", "blender": "ब्लेंडर",
           "lamp": "लैंप", "hoodie": "हूडी", "tshirt": "टी-शर्ट", "bangle": "चूड़ी"}

def hi_noun(w):
    return NOUN_HI.get(w, w)

def build_personas():
    pids = []
    for li, lang in enumerate(["en", "hinglish", "hi"]):
        for si, seg in enumerate(sorted(SEGMENTS)):
            for ri, region in enumerate(REGIONS):
                pids.append(dict(pid=li * 100 + si * 10 + ri, lang=lang, segment=seg, region=region))
    for p in pids:
        p["budget"] = SEGMENTS[p["segment"]]["budget"]
        p["occasion"] = SEGMENTS[p["segment"]]["occasion"]
        p["brand"] = BRANDS[p["pid"] % len(BRANDS)] if p["segment"] == "brand_lover" else None
        p["for_whom"] = FW_PREFS[p["pid"] % 4]
        p["size"] = SIZE_PREFS[p["pid"] % 3]
        p["cap"] = CAP_PREFS[p["pid"] % 3]
    return pids

def queries_for(p):
    seg = SEGMENTS[p["segment"]]
    i = p["pid"]
    noun, fashion, cheap = seg["nouns"][i % 6], seg["fashion"][i % 4], seg["cheap"][i % 5]
    b, occ = p["budget"], p["occasion"] or "event"
    en, hing, hi = RECIPIENTS[p["segment"]]
    occ_en = OCC_EN[p["occasion"]]
    occ_hi = OCC_HI[p["occasion"]]
    spec_en = SPEC_EN[i % len(SPEC_EN)]
    if p["lang"] == "en":
        return [
            ("D1_elec_budget", f"{noun} under {b}"),
            ("D2_fashion_recep", f"{fashion} for {en}"),
            ("D3_gift_occasion", f"{occ_en} gift under {b}"),
            ("D4_vague", f"something nice for the {occ_en}"),
            ("D5_typo", TYPO[i % len(TYPO)]),
            ("D6_spec", spec_en),
            ("D7_dead_end", DEAD_ENDS[i % len(DEAD_ENDS)]),
            ("D8_browse", noun),
            ("D9_tight_price", f"{cheap} under {seg['tiny']}"),
            ("D10_relation", f"{fashion} for {'my sister' if i % 2 == 0 else 'my father'}"),
        ]
    if p["lang"] == "hinglish":
        return [
            ("D1_elec_budget", f"{noun} {b} se kam chahiye"),
            ("D2_fashion_recep", f"{fashion} {hing}"),
            ("D3_gift_occasion", f"{occ_en} ke liye gift {b} se kam"),
            ("D4_vague", f"kuch acha {occ_en} ke liye"),
            ("D5_typo", TYPO[i % len(TYPO)]),
            ("D6_spec", spec_en.replace("under", "me")),
            ("D7_dead_end", DEAD_ENDS[i % len(DEAD_ENDS)]),
            ("D8_browse", noun),
            ("D9_tight_price", f"{cheap} {seg['tiny']} se kam"),
            ("D10_relation", "didi ki shaadi ke liye kuch" if i % 2 == 0 else "bhai ke liye gift 2k"),
        ]
    # hi (Devanagari)
    return [
        ("D1_elec_budget", f"{hi_noun(noun)} {b} से कम"),
        ("D2_fashion_recep", f"{FASHION_HI.get(fashion, fashion)} {hi}"),
        ("D3_gift_occasion", f"{occ_hi} का उपहार {b} से कम"),
        ("D4_vague", f"कुछ अच्छा {occ_hi} के लिए"),
        ("D5_typo", TYPO[i % len(TYPO)]),
        ("D6_spec", spec_en),
        ("D7_dead_end", DEAD_ENDS[i % len(DEAD_ENDS)]),
        ("D8_browse", hi_noun(noun)),
        ("D9_tight_price", f"{NOUN_HI.get(cheap, cheap)} {seg['tiny']} से कम"),
        ("D10_relation", "बहन की शादी के लिए कुछ" if i % 2 == 0 else "भाई के लिए गिफ्ट 2k"),
    ]

def post(url, payload, retries=3):
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                         headers={"Content-Type": "application/json"})
            t0 = time.monotonic()
            with urllib.request.urlopen(req, timeout=120) as r:
                data = json.load(r)
            return data, time.monotonic() - t0
        except Exception as e:
            last = e
            time.sleep(2 * (i + 1))
    raise last

def intent_count(results):
    return sum(1 for r in results if r.get("intent"))

OCC_MATCH = {"gift": "gift", "birthday": "birthday", "wedding": "wedding", "shaadi": "wedding",
             "anniversary": "anniversary", "party": "party", "diwali": "diwali",
             "christmas": "christmas", "valentines": "valentines", "graduation": "graduation",
             "housewarming": "housewarming", "baby-shower": "baby", "baby": "baby"}

def pick_option(guide, p):
    opts = [str(o) for o in guide.get("options", [])]
    t = guide.get("type", "")
    if t == "budget":
        def val(o):
            m = re.search(r"(\d[\d,]*)", o)
            return int(m.group(1).replace(",", "")) if m else 0
        return str(min(opts, key=lambda o: abs(val(o) - (p["budget"] or 2000))))
    if t == "occasion":
        pref = p["occasion"]
        if pref:
            for o in opts:
                k = o.strip().lower().split("/")[0]
                if OCC_MATCH.get(k) == pref or o.lower().startswith(pref):
                    return o
        for o in opts:
            if o.strip().lower() in ("everyday use", "daily use", "everyday"):
                return o
        return opts[0]
    if t == "brand":
        if p["brand"]:
            for o in opts:
                if o.lower() == p["brand"]:
                    return o
        for o in opts:
            if "no preference" in o.lower() or "best rated" in o.lower():
                return o
        return opts[0]
    if t == "for_whom":
        for o in opts:
            m = {"women": "women", "men": "men", "kids": "kids", "unisex": "unisex"}
            if m.get(p["for_whom"]) in o.lower():
                return o
        return opts[0]
    if t == "size":
        for o in opts:
            if o.strip().lower() == p["size"]:
                return o
        return opts[0]
    if t == "capacity":
        for o in opts:
            if o.strip().lower() == p["cap"].lower():
                return o
        return opts[0]
    # category
    return opts[0]

def map_answer(guide, chip):
    t = guide.get("type", "")
    if t == "budget":
        n = re.search(r"(\d[\d,]*)", str(chip))
        return {"budget": int(n.group(1).replace(",", "")) if n else 2000}
    if t == "occasion":
        key = str(chip).strip().lower().split("/")[0]
        m = {"gift": "gift", "birthday": "birthday", "wedding": "wedding", "shaadi": "wedding",
             "anniversary": "anniversary", "party": "party", "diwali": "diwali",
             "christmas": "christmas", "valentines": "valentines", "graduation": "graduation",
             "housewarming": "housewarming"}
        return {"occasion": m.get(key)}
    if t == "brand":
        return {"brand": None if ("no preference" in str(chip).lower() or "best rated" in str(chip).lower()) else chip}
    if t == "for_whom":
        return {"forWhom": {"women": "women", "men": "men", "kids": "kids"}.get(str(chip).strip().lower(), None)}
    if t == "size":
        return {"size": str(chip).strip().lower()}
    if t == "capacity":
        return {"capacity": str(chip).strip()}
    return {"category": chip}

def run_one(url, p, dim, q):
    rec = {"pid": p["pid"], "lang": p["lang"], "segment": p["segment"], "region": p["region"],
           "dim": dim, "query": q, "turns": 1, "intentN": 0, "null": True, "resolved": False,
           "final_turn": None, "questions": [], "zero_chips": 0, "sem_used": False,
           "stop_reason": None, "ms_search": 0.0, "ms_guide": 0.0}
    try:
        r0, ms = post(url + "/api/search", {"query": q})
        rec["ms_search"] += ms
        rec["sem_used"] = bool((r0.get("semantic") or {}).get("used"))
        n = intent_count(r0["results"])
        rec["intentN"] = n
        rec["null"] = n < 2
        if n >= 2:
            rec.update(resolved=True, final_turn=1, stop_reason="resolved_t1")
            return rec
        prev, turn = [], 1
        while turn < 5:
            g, mgs = post(url + "/api/guide", {
                "query": q, "n_results": n, "turn": turn + 1, "prev_types": prev,
                "mode": "fallback", "lang": p["lang"]})
            rec["ms_guide"] += mgs
            guide = g.get("guide")
            if not guide:
                rec["stop_reason"] = (g.get("decision") or {}).get("reason", "no_question")
                break
            oc = guide.get("optionCounts") or []
            rec["zero_chips"] += sum(1 for c in oc
                                     if c.get("count", 0) == 0 and not str(c.get("label", "")).startswith(("No preference", "Not sure", "Any")))
            rec["questions"].append({"type": guide["type"], "turn": turn + 1})
            prev.append(guide["type"])
            chip = pick_option(guide, p)
            opts = map_answer(guide, chip)
            r, ms = post(url + "/api/search", {"query": q, **opts})
            rec["ms_search"] += ms
            rec["sem_used"] = rec["sem_used"] or bool((r.get("semantic") or {}).get("used"))
            n = intent_count(r["results"])
            rec["intentN"] = n
            turn += 1
            if n >= 2:
                rec.update(resolved=True, final_turn=turn, stop_reason="resolved")
                return rec
        rec["stop_reason"] = rec.get("stop_reason") or ("exhausted" if turn >= 5 else "no_question")
        if intent_count(r["results"]) >= 2:
            rec.update(resolved=True, final_turn=turn)
        return rec
    except Exception as e:
        rec["error"] = str(e)[:200]
        return rec

def wilson(k, n, z=1.96):
    if n == 0:
        return [0, 0]
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * (p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5 / d
    return [round(100 * (c - h), 1), round(100 * (c + h), 1)]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:3000")
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()
    personas = build_personas()
    jobs = [(p, dim, q) for p in personas for dim, q in queries_for(p)]
    print(f"{len(jobs)} journeys, {len(personas)} personas, {args.workers} workers -> {args.url}")
    LOGS = BASE / "logs"
    LOGS.mkdir(exist_ok=True)
    ts = time.strftime("%Y%m%d_%H%M%S")
    out = LOGS / f"persona_sim_{ts}.jsonl"
    recs = []
    done = 0
    with out.open("w") as f:
        with ThreadPoolExecutor(args.workers) as ex:
            futs = [ex.submit(run_one, args.url, p, d, q) for p, d, q in jobs]
            for fut in futs:
                r = fut.result()
                recs.append(r)
                f.write(json.dumps(r) + "\n")
                done += 1
                if done % 300 == 0:
                    print(f"  {done}/{len(jobs)}")
    ok = [r for r in recs if "error" not in r]
    agg = lambda xs: {
        "n": len(xs),
        "null": [sum(1 for r in xs if r["null"]), len(xs)],
        "resolved": [sum(1 for r in xs if r["resolved"]), len(xs)],
        "resolved_t1": [sum(1 for r in xs if r.get("final_turn") == 1), len(xs)],
        "avg_questions": round(sum(len(r["questions"]) for r in xs) / len(xs), 3) if xs else 0,
        "avg_turns_to_resolve": round(sum(r["final_turn"] for r in xs if r["resolved"]) / max(1, sum(1 for r in xs if r["resolved"])), 2),
        "zero_chip_journeys": [sum(1 for r in xs if r["zero_chips"] > 0), len(xs)],
        "sem_used": [sum(1 for r in xs if r["sem_used"]), len(xs)],
        "p95_search_ms": sorted(r["ms_search"] * 1000 for r in xs)[int(0.95 * (len(xs) - 1))] if xs else 0,
        "p95_guide_ms": sorted(r["ms_guide"] * 1000 for r in xs)[int(0.95 * (len(xs) - 1))] if xs else 0,
    }
    def with_ci(a):
        a["null_ci"] = wilson(a["null"][0], a["null"][1])
        a["resolved_ci"] = wilson(a["resolved"][0], a["resolved"][1])
        return a
    by_dim = {d: with_ci(agg([r for r in ok if r["dim"] == d])) for d in sorted({r["dim"] for r in ok})}
    by_lang = {l: with_ci(agg([r for r in ok if r["lang"] == l])) for l in ["en", "hinglish", "hi"]}
    by_seg = {s: with_ci(agg([r for r in ok if r["segment"] == s])) for s in sorted(SEGMENTS)}
    qmix = Counter(t for r in ok for t in (q["type"] for q in r["questions"]))
    summary = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "n_journeys": len(ok), "errors": len(recs) - len(ok),
        "overall": with_ci(agg(ok)),
        "by_dim": by_dim, "by_lang": by_lang, "by_segment": by_seg,
        "question_type_mix": dict(qmix.most_common()),
        "stop_reasons": dict(Counter(r["stop_reason"] for r in ok).most_common()),
    }
    OUT = BASE / "eval" / "results"
    OUT.mkdir(exist_ok=True)
    (OUT / "persona_sim_summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    print(json.dumps(summary, indent=1, ensure_ascii=False)[:4000])
    print("wrote", out, "and eval/results/persona_sim_summary.json")

if __name__ == "__main__":
    main()
