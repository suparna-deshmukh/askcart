"""
AskCart large-scale query simulation (thousands of queries, LLM guide).

Generates a stratified query grid (category x product noun x budget x
occasion x recipient x brand x vague x dead-end x light Hinglish), runs each
query through the LIVE app exactly like the n=150 study, with the LLM guide
(mode unset -> LLM phrasing), answers from persona ground truth, and records:
  - one JSONL line per query (full trace) -> logs/sim_<ts>.jsonl
  - every interaction event -> /api/analytics/event with env="sim"
    (isolated simulation store; public dashboard stays clean)
  - summary -> eval/results/sim_summary.json

Usage: .venv/bin/python eval/simulate.py [--url http://localhost:3000]
                                          [--total 2400] [--workers 8]
Deterministic grid (seed 7); runtime ~15-30 min for 2,400 queries.
"""
import argparse
import json
import random
import re
import sys
import time
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from run_eval import post, pick_option, map_answer

BASE = Path(__file__).resolve().parent.parent
CAT = json.loads((BASE / "app/public/catalog.json").read_text())
LOGS = BASE / "logs"

PRODUCT_NOUNS = {
    "AMAZON FASHION": ["dress", "saree", "kurta", "sneakers", "wallet", "watches", "handbag", "shoes"],
    "Amazon Home": ["candle", "lamp", "decor", "organizer", "bedding", "cookware", "plant pot", "rug"],
    "All Electronics": ["speaker", "tv stand", "earphones", "power bank", "tablet stand", "charger"],
    "Cell Phones & Accessories": ["phone case", "headphones", "charger", "screen guard", "earbuds", "holder"],
    "Computers": ["laptop", "keyboard", "mouse", "webcam", "ssd", "monitor stand"],
    "Sports & Outdoors": ["dumbbells", "yoga mat", "water bottle", "cycling gloves", "skateboard"],
    "Health & Personal Care": ["facial kit", "shampoo", "massage gun", "vitamins", "electric comb"],
    "Office Products": ["notebook", "desk lamp", "file organizer", "stapler", "planner"],
    "Toys & Games": ["laptop toy", "building blocks", "rc car", "puzzle", "stuffed toy"],
    "Baby": ["bottle", "diaper bag", "baby shoes", "night light", "teether"],
    "Handmade": ["sculpture", "crochet", "candle", "jewellery", "wooden decor"],
    "Arts, Crafts & Sewing": ["paint set", "sewing kit", "knitting yarn", "scissors"],
    "Pet Supplies": ["dog toy", "cat bed", "leash", "pet brush", "bird cage"],
    "Automotive": ["seat cover", "dash cam", "car perfume", "phone mount"],
    "Camera & Photo": ["tripod", "camera strap", "lens cap", "memory card", "light"],
    "Musical Instruments": ["guitar", "drum set", "flute", "harmonium", "djembe"],
    "Appliances": ["blender", "air fryer", "iron", "rice cooker", "fan"],
    "Video Games": ["console", "gamepad", "headset"],
    "Home Audio & Theater": ["soundbar", "earphones", "speaker"],
    "Collectibles & Fine Art": ["figurine", "art print", "coin set", "model"],
    "All Beauty": ["perfume", "lipstick", "hair dryer", "skincare"],
    "Car Electronics": ["dash cam", "car charger", "seat cover"],
    "Sports Collectibles": ["jersey", "trophy", "poster"],
}
BUDGETS = [None, "under 2k", "under 5k", "under 10k", "under 15k", "under 3000", "under 25000"]
OCCASIONS = [None, "gift", "birthday", "shaadi", "diwali", "anniversary", "housewarming"]
RECIPIENTS = [None, "for my mom", "for my dad", "for a 5 year old", "for my wife", "for him", "for her", "for my friend"]
BRANDS = ["samsung", "apple", "jbl", "sony", "nike", "casio", "hp", "lg", "philips", "crocs"]
VAGUE = ["something nice", "a surprise", "something useful", "a treat", "something special"]
DEAD_ENDS = ["samovar", "gramophone", "sitar", "kettledrum", "harpsichord", "zither", "bassoon",
             "didgeridoo", "cornu", "sousaphone", "rotary phone", "theremin", "outran"]
HINGLISH = [
    "saste me {noun}", "{noun} 2k me achha koi", "acha {noun} 15k tak",
    "koi achha {noun} do budget 5k", "{noun} chahiye under 3k",
]


def build_grid(total, seed=7):
    rng = random.Random(seed)
    cats = sorted({x["category"] for x in CAT})
    cat_nouns = {c: PRODUCT_NOUNS.get(c, ["item", "kit", "set"]) for c in cats}
    out, seen = [], set()

    def add(q, **meta):
        key = q.lower().strip()
        if key in seen or len(key) < 4:
            return
        seen.add(key)
        out.append({"q": q, **meta})

    # 1) structured grid: cat x noun x budget x occasion (bulk of the grid)
    cat_budget_occ = []
    for c in cats:
        for noun in cat_nouns[c]:
            for b in BUDGETS:
                for o in OCCASIONS[:3]:
                    cat_budget_occ.append((c, noun, b, o))
    rng.shuffle(cat_budget_occ)
    for c, noun, b, o in cat_budget_occ:
        q = noun + (f" {b}" if b else "") + (f" for {o}" if o else "")
        add(q, category=c, budget=bool(b), occasion=bool(o), kind="structured")

    # 2) recipient / gift phrasing
    for c in cats:
        for noun in rng.sample(cat_nouns[c], k=min(3, len(cat_nouns[c]))):
            for r in RECIPIENTS:
                add(f"{noun} {r or ''}".strip(), category=c, kind="recipient", budget=False, occasion=False)

    # 3) brand queries
    for b in BRANDS:
        for noun in ["phone", "headphones", "watch", "laptop", "shoes", "speaker", "charger", "bottle"]:
            for budget in [None, "under 10k", "under 25k"]:
                add(f"{b} {noun} {budget or ''}".strip(), category=None, kind="brand", budget=bool(budget), occasion=False)

    # 4) vague queries
    for c in cats:
        for v in VAGUE:
            add(f"{v} in {c.split(' ')[0].lower()} {random.choice(['under 2k', 'under 5k', ''])}".strip(),
                category=c, kind="vague", budget=True, occasion=False)
    rng.shuffle(VAGUE)

    # 5) Hinglish
    for c in rng.sample(cats, k=12):
        for h in HINGLISH:
            for noun in rng.sample(cat_nouns[c], k=2):
                add(h.format(noun=noun), category=c, kind="hinglish", budget=True, occasion=False)

    # 6) dead ends
    for d in DEAD_ENDS:
        for b in [None, "under 5k"]:
            add(f"{d} {b or ''}".strip(), category=None, kind="dead_end", budget=bool(b), occasion=False)

    # 7) India-segment query types (occasion x stratum x spec x Hinglish)
    FESTIVAL = [
        "diwali lights for home", "diwali gift under 1k", "diwali decoration under 2k",
        "diwali gift hamper", "holi colors safe for kids", "holi dress under 1k",
        "rakhi gift for sister", "rakhi under 500", "navratri saree under 3k",
        "navratri chaniya choli", "eid kurti for women", "eid gift for kids",
        "christmas decoration under 2k", "festival gift under 500",
    ]
    WEDDING = [
        "bridal lehenga under 15k", "bridal lehenga", "groom sherwani under 10k",
        "sherwani for shaadi", "sangeet dress for women", "sangeet outfit for men",
        "mangalsutra under 5k", "gold mangalsutra", "jhumka earrings under 2k",
        "kundan set for shaadi", "barat kurta for groom", "shaadi gift under 2k",
        "wedding gift for couple", "shaadi decoration under 3k",
    ]
    REGIONAL = [
        "banarasi saree under 5k", "banarasi silk saree", "kanchipuram saree",
        "mysore silk saree", "chettinad saree", "pashmina shawl under 3k",
        "kurti for ammi", "kurti for papa", "dupatta under 500",
        "churidar suit under 2k", "panjabi for men", "kurta pajama set under 1.5k",
    ]
    APPLIANCE = [
        "1.5 ton ac under 45k", "1.5 ton ac under 50k", "1 ton ac under 40k",
        "7 kg washing machine under 30k", "7 kg washing machine",
        "washing machine under 25k", "ro water purifier under 12k",
        "water purifier for home", "microwave 23l under 15k",
        "convection microwave under 18k", "inverter 1100va under 20k",
        "inverter with battery", "geyser 25l under 12k", "instant geyser under 5k",
        "induction cooktop under 3k", "dosa maker", "chimney under 10k",
    ]
    KITCHEN = [
        "hawkins pressure cooker under 2k", "pressure cooker 5l", "kadai 28cm",
        "steel tumbler under 300", "steel glass set", "mixer grinder 750w under 5k",
        "juicer machine under 5k", "electric kettle under 1.5k", "chutney maker",
        "rice cooker under 3k", "air fryer under 7k", "air fryer 5l",
        "nonstick cookware set under 5k", "kitchen storage under 500",
    ]
    STRATUM = [
        "under 100", "under 200", "under 500", "under 1000",
        "cheap phone under 10k", "cheap gift under 500", "cheap sneakers under 2k",
        "premium gift under 1 lakh", "luxury perfume under 15k", "gold under 1 lakh",
        "budget laptop under 50k", "best value smartphone under 15k",
    ]
    HINGLISH2 = [
        "sasta phone under 10k", "ammi ke liye kurta", "papa ke liye gift",
        "shadi ke liye gift under 2k", "diwali ke liye decoration",
        "koi achha saree 3k tak", "sasta yoga mat", "acha perfume 1500 tak",
        "mujhe ek achha mixer chahiye under 4k", "sasta phone case",
    ]
    SPEC = [
        "55 inch tv under 50k", "43 inch tv under 30k", "65 inch tv under 1 lakh",
        "128 gb phone under 20k", "256 gb phone under 15k", "16gb ram laptop",
        "1tb ssd under 10k", "24 inch monitor under 10k", "20000mah power bank",
        "65w fast charger", "1100va inverter", "300ml perfume for men",
    ]
    GIFTREL = [
        "rakhi gift for sister under 1k", "birthday gift for girlfriend under 2k",
        "birthday gift for mom under 3k", "gift for boss under 2k",
        "anniversary gift for wife under 5k", "baby shower gift under 2k",
        "housewarming gift under 3k", "gift for best friend under 1k",
        "graduation gift for son under 3k", "gift for dad under 2k",
    ]
    HEALTH = [
        "bp monitor for papa", "blood pressure monitor under 3k",
        "glucometer under 2k", "nebulizer for home under 3k",
        "walker for elderly under 5k", "wheelchair under 20k",
        "hospital bed under 25k", "knee support under 1k",
        "orthopedic pillow", "pulse oximeter under 2k",
        "walking stick for elderly", "commode chair under 5k",
    ]
    WINTER = [
        "sweater for papa under 2k", "winter jacket for men under 5k",
        "woolen sweater for mom", "kids winter jacket under 2k",
        "thermal innerwear for men", "puffer jacket for women under 5k",
        "woolen coat under 8k", "sweater under 1k",
        "woolen cap under 500", "sweater for grandfather",
    ]
    FEATUREPHONE = [
        "nokia 105 phone", "feature phone under 1500",
        "sasta phone under 1000", "phone for ammi under 2k",
        "nokia phone 1000 me", "basic phone under 1200",
        "dual sim phone under 1500",
    ]
    TRAVEL = [
        "trolley bag under 5k", "samsonite trolley 20 inch",
        "luggage for travel under 8k", "backpack for college under 2k",
        "travel adapter under 1k", "neck pillow for travel under 1k",
        "28 inch trolley under 9k",
    ]
    ENGAGEMENT = [
        "diamond ring under 30k", "engagement ring for girlfriend",
        "lab grown diamond ring", "bridal set under 20k",
        "pearl necklace set under 5k", "moongta set under 25k",
    ]
    ETHNIC_SHOES = [
        "mojari for men", "jutti for shaadi", "harpa for men under 800",
        "kolhapuri chappal", "ethnic sandals for women under 2k",
        "school shoes for kids under 1k",
    ]
    TIFIN = [
        "steel lunch box under 1k", "tiffin carrier for office",
        "water bottle 1 litre under 1k", "masala box 6 under 500",
        "lunch box for tiffin",
    ]
    AYURVEDA = [
        "dabur honey under 400", "chyawanprash 1kg",
        "ashwagandha capsules under 600", "henna cone for shaadi",
        "face pack under 200",
    ]
    for q in FESTIVAL:
        add(q, kind="festival", category=None, budget="under" in q, occasion=True)
    for q in WEDDING:
        add(q, kind="wedding", category=None, budget="under" in q, occasion=True)
    for q in REGIONAL:
        add(q, kind="regional", category=None, budget="under" in q, occasion=False)
    for q in APPLIANCE:
        add(q, kind="appliance", category="Appliances", budget="under" in q, occasion=False)
    for q in KITCHEN:
        add(q, kind="kitchen", category="Appliances", budget="under" in q, occasion=False)
    for q in STRATUM:
        add(q, kind="stratum", category=None, budget=True, occasion="gift" in q)
    for q in HINGLISH2:
        add(q, kind="hinglish2", category=None, budget=True, occasion="shadi" in q or "diwali" in q)
    for q in SPEC:
        add(q, kind="spec", category=None, budget="under" in q, occasion=False)
    for q in GIFTREL:
        add(q, kind="gift_rel", category=None, budget=True, occasion=True)
    for q in HEALTH:
        add(q, kind="health", category="Health & Personal Care", budget="under" in q, occasion=False)
    for q in WINTER:
        add(q, kind="winter", category="AMAZON FASHION", budget="under" in q, occasion=False)
    for q in FEATUREPHONE:
        add(q, kind="featurephone", category="Cell Phones & Accessories", budget=True, occasion=False)
    for q in TRAVEL:
        add(q, kind="travel", category="Luggage & Travel", budget="under" in q, occasion=False)
    for q in ENGAGEMENT:
        add(q, kind="engagement", category="AMAZON FASHION", budget="under" in q, occasion=True)
    for q in ETHNIC_SHOES:
        add(q, kind="ethnic_shoes", category="AMAZON FASHION", budget="under" in q, occasion="shaadi" in q)
    for q in TIFIN:
        add(q, kind="tiffin", category="Amazon Home", budget="under" in q, occasion=False)
    for q in AYURVEDA:
        add(q, kind="ayurveda", category=None, budget="under" in q, occasion="shaadi" in q)

    rng.shuffle(out)
    return out[:total]


STOP = set("the a an for with and of in on to under below less than within up about around please find me get want need looking look search buy shop something anything good nice best top cheap price rupees rs under2k my yourself".split())
OCC_WORDS = set("shaadi wedding bridal sangeet baraat birthday bday anniversary party diwali christmas xmas valentines baby graduation housewarming gift rakhi festival".split())

def product_tokens(q):
    return [t for t in re.findall(r"[a-z0-9]{4,}", q.lower())
            if t not in STOP and t not in OCC_WORDS and not t.isdigit()]

def strong_count(results, q):
    toks = product_tokens(q)
    if not toks:
        return 0
    n = 0
    for r in results:
        text = (str(r.get("title", "")) + " " + str(r.get("category", ""))).lower()
        if any(t in text for t in toks):
            n += 1
    return n

def run_one(url, item, env_sim=True):
    persona = {"budget": 2000, "occasion": "gift", "category": item.get("category") or ""}
    rec = {"q": item["q"], "kind": item["kind"], "t0": time.time()}
    r0 = post(url + "/api/search", {"query": item["q"], "naive": True})
    n0 = len(r0["results"])
    i0 = sum(1 for r in r0["results"] if r.get("intent"))
    rec["baseline_null"] = n0 == 0
    rec["baseline_strong"] = strong_count(r0["results"], item["q"]) >= 2
    if env_sim:
        post(url + "/api/analytics/event", {"type": "search_results", "env": "sim",
             "payload": {"query": item["q"], "n_results": n0, "turn": 1, "naive": True, "null": n0 == 0}})
    if i0 >= 2:
        rec.update(resolved=True, strict=strong_count(r0["results"], item["q"]) >= 2,
                   turns=1, final_n=i0, guide_mode=None, answers=[])
        return rec
    turns, final, answers, modes = 1, i0, [], None
    for turn in range(2, 5):
        if final >= 2:
            break
        g = post(url + "/api/guide", {"query": item["q"], "n_results": final, "asked": answers, "turn": turn})
        guide = g.get("guide")
        modes = g["mode"]
        if not guide:
            break
        if env_sim:
            post(url + "/api/analytics/event", {"type": "guide_question_shown", "env": "sim",
                 "payload": {"query": item["q"], "question_type": guide.get("type"), "turn": turn, "mode": g["mode"]}})
        chip = pick_option(guide, persona)
        answers.append(f"{guide.get('type')}:{chip}")
        if env_sim:
            post(url + "/api/analytics/event", {"type": "guide_option_selected", "env": "sim",
                 "payload": {"query": item["q"], "question_type": guide.get("type"), "option": chip, "turn": turn}})
        new_opts = map_answer(guide, chip)
        body = {"query": item["q"], "relax": True}
        for k, v in new_opts.items():
            if v is not None:
                body[k] = v
        r = post(url + "/api/search", body)
        final = sum(1 for r in r["results"] if r.get("intent"))
        final_results = r["results"]
        turns = turn
    strict = strong_count(final_results, item["q"]) >= 2
    rec.update(resolved=final >= 2, strict=strict, turns=turns, final_n=final,
               guide_mode=modes, answers=answers, ms=int((time.time() - rec["t0"]) * 1000))
    return rec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:3000")
    ap.add_argument("--total", type=int, default=2400)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--no-sim-events", action="store_true")
    a = ap.parse_args()

    grid = build_grid(a.total)
    print(f"grid: {len(grid)} unique queries")
    LOGS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M")
    logpath = LOGS / f"sim_{stamp}.jsonl"
    out_path = BASE / "eval/results/sim_summary.json"
    t0 = time.time()

    recs = []
    with open(logpath, "w") as flog:
        with ThreadPoolExecutor(max_workers=a.workers) as ex:
            futs = {ex.submit(run_one, a.url, item, not a.no_sim_events): item for item in grid}
            done = 0
            for fut in futs:
                try:
                    rec = fut.result()
                except Exception as e:
                    rec = {"q": futs[fut]["q"], "kind": futs[fut]["kind"], "error": str(e)[:200]}
                recs.append(rec)
                flog.write(json.dumps(rec) + "\n")
                flog.flush()
                done += 1
                if done % 200 == 0:
                    el = time.time() - t0
                    print(f"{done}/{len(grid)} done ({el/60:.1f} min, {done/el:.1f}/s)", flush=True)

    n = len(recs)
    ok = [r for r in recs if "error" not in r]
    errs = [r for r in recs if "error" in r]
    base_null = sum(1 for r in ok if r["baseline_null"])
    base_strict = sum(1 for r in ok if r.get("baseline_strong"))
    unresolved = sum(1 for r in ok if not r["resolved"])
    not_strict = sum(1 for r in ok if not r.get("strict"))
    by_t = Counter(r["turns"] for r in ok if r["resolved"])
    by_kind = {}
    kinds = sorted({r["kind"] for r in ok})
    for k in kinds:
        kk = [r for r in ok if r["kind"] == k]
        by_kind[k] = {
            "n": len(kk),
            "baseline_null_pct": round(100 * sum(1 for r in kk if r["baseline_null"]) / len(kk), 1),
            "resolved_pct": round(100 * sum(1 for r in kk if r["resolved"]) / len(kk), 1),
            "strict_resolved_pct": round(100 * sum(1 for r in kk if r.get("strict")) / len(kk), 1),
            "by_turn2_pct": round(100 * sum(1 for r in kk if r["resolved"] and r["turns"] <= 2) / len(kk), 1),
        }
    modes = Counter(r["guide_mode"] for r in ok if r.get("guide_mode"))
    failures = [r for r in ok if not r["resolved"] and r["kind"] != "dead_end"][:25]
    summary = {
        "ts": stamp, "n": n, "errors": len(errs),
        "baseline_null_pct": round(100 * base_null / n, 1),
        "baseline_strict_pct": round(100 * base_strict / n, 1),
        "guided_null_pct": round(100 * unresolved / n, 1),
        "resolved_pct": round(100 * (n - unresolved) / n, 1),
        "strict_resolved_pct": round(100 * (n - not_strict) / n, 1),
        "by_turn": {"t1": by_t.get(1, 0), "t2": by_t.get(2, 0), "t3": by_t.get(3, 0), "t4+": by_t.get(4, 0)},
        "by_turn2_pct": round(100 * (by_t.get(1, 0) + by_t.get(2, 0)) / n, 1),
        "guide_modes": dict(modes),
        "by_kind": by_kind,
        "sample_failures_non_dead": [
            {"q": r["q"], "kind": r["kind"], "answers": r["answers"]} for r in failures
        ],
        "runtime_s": int(time.time() - t0),
        "log": str(logpath),
    }
    out_path.write_text(json.dumps(summary, indent=1))
    print(json.dumps({k: v for k, v in summary.items() if k != "sample_failures_non_dead"}, indent=1))
    print("failures:", len(failures), "sampled -> eval/results/sim_summary.json")


if __name__ == "__main__":
    main()
