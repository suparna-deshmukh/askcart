"""
Canary query suite: the highest-value queries of every type (India
occasions, specs, brands, strata, Hinglish, dead ends). Runs each against
the live app and prints the top-3 so a human/reviewer can eyeball relevance
after any search or catalog change.
Usage: .venv/bin/python eval/canaries.py [--url http://localhost:3000]
"""
import argparse, json, urllib.request

CANARIES = [
    ("saree under 3k", "regional"),
    ("1.5 ton ac under 50k", "spec_appliance"),
    ("diwali lights", "festival"),
    ("gold bangle", "jewellery"),
    ("cricket bat", "sports"),
    ("microwave 23l", "spec_appliance"),
    ("hawkins pressure cooker", "brand_india"),
    ("inverter 1100va", "spec_appliance"),
    ("mangalsutra under 5k", "jewellery"),
    ("kurti for ammi", "hinglish"),
    ("bridal lehenga", "wedding"),
    ("air fryer under 7k", "kitchen"),
    ("laptop under 60k", "electronics"),
    ("pashmina shawl under 3k", "regional"),
    ("under 500", "stratum"),
    ("perfume for men under 1500", "gift"),
    ("holi colors", "festival"),
    ("navratri saree", "festival"),
    ("7kg washing machine under 30k", "spec_appliance"),
    ("water purifier under 12k", "appliance"),
    ("dosa maker", "kitchen"),
    ("yoga mat", "category"),
    ("rakhi gift for sister", "festival_gift"),
    ("dumbbell 10kg", "spec_sports"),
    ("55 inch tv under 50k", "spec_electronics"),
    ("under 15k phone", "budget_phone"),
    ("shaadi gift under 2k", "gift"),
    ("baby bottle", "category_india"),
    ("office chair", "category"),
    ("jbl speaker", "brand"),
    ("budget headphones under 3000", "budget"),
    ("sasta phone under 10k", "hinglish_phone"),
    ("car perfume", "context"),
    ("samovar", "dead_end"),
    # R10 families
    ("bp monitor for papa", "health"),
    ("wheelchair under 20k", "health"),
    ("sweater for papa under 2k", "winter"),
    ("puffer jacket for women under 5k", "winter"),
    ("nokia 105 phone", "feature_phone"),
    ("trolley bag under 5k", "travel"),
    ("diamond ring under 30k", "engagement"),
    ("mojari for men", "ethnic_shoes"),
    ("steel lunch box under 1k", "tiffin"),
    ("dabur honey under 400", "ayurveda"),
]

def post(url, payload):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:3000")
    a = ap.parse_args()
    fails = 0
    for q, kind in CANARIES:
        d = post(a.url + "/api/search", {"query": q})
        res = d["results"]
        tag = "OK " if res else "EMPTY"
        if not res and kind != "dead_end":
            fails += 1
        print(f"[{tag}] ({kind}) {q!r}")
        for i, r in enumerate(res[:3], 1):
            print(f"    {i}. [Rs{r['price']:>7}] {r['title'][:74]} | {r['category']}")
    print(f"\ndone: {len(CANARIES)} canaries, {fails} unexpected empties")

if __name__ == "__main__":
    main()
