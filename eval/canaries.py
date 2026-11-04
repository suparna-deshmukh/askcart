"""
Canary query suite: the highest-value queries of every type (India
occasions, specs, brands, strata, Hinglish, dead ends). Runs each against
the live app and prints the top-3 so a human/reviewer can eyeball relevance
after any search or catalog change.
Usage: .venv/bin/python eval/canaries.py [--url http://localhost:3000]
"""
import argparse, json, re, urllib.request

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
    # S1 typo canaries (Damerau-1/2 + glued alphanumeric)
    ("samsng phone", "typo"),
    ("heaphones under 3000", "typo"),
    ("saaree under 3k", "typo"),
    ("laptop under 60k", "typo"),
    ("iphone15 128gb", "typo"),
    ("microwve 23l", "typo"),
    ("dumbell 10kg", "typo"),
    ("bedsht queen under 2k", "typo"),
    ("chappel for men", "typo"),
    ("sweatre for papa under 2k", "typo"),
    ("diamand ring under 30k", "typo"),
    ("water purifer under 12k", "typo"),
    ("air fryr under 7k", "typo"),
    ("perum for men under 1500", "typo"),
    ("gold bngle under 3k", "typo"),
    ("tifin box under 1k", "typo"),
    ("headphons under 3000", "typo"),
    ("tshrit for men under 2k", "typo"),
    ("lehenag bridal", "typo"),
    ("refregirator under 40k", "typo"),
    # S2 Hinglish / Devanagari lexicon canaries
    ("ghadi under 1500", "hinglish_s2"),
    ("ghadi for papa", "hinglish_s2"),
    ("ghadi under 500", "hinglish_s2"),
    ("jooti for men under 1k", "hinglish_s2"),
    ("juti for women", "hinglish_s2"),
    ("jutti for women under 800", "hinglish_s2"),
    ("jooti for college under 800", "hinglish_s2"),
    ("chappal under 500", "hinglish_s2"),
    ("mithai box for diwali", "hinglish_s2"),
    ("mithai gift under 500", "hinglish_s2"),
    ("bartan set under 2k", "hinglish_s2"),
    ("steel bartan under 3k", "hinglish_s2"),
    ("chaddar for winter under 1k", "hinglish_s2"),
    ("white chaddar queen", "hinglish_s2"),
    ("rasoi ke liye kuch under 1k", "hinglish_s2"),
    ("sari under 2k", "hinglish_s2"),
    ("sari for shaadi", "hinglish_s2"),
    ("kurta for men under 1k", "hinglish_s2"),
    ("lehenga for sangeet under 10k", "hinglish_s2"),
    ("tiffin for office under 1k", "hinglish_s2"),
    ("sasta phone under 15k", "hinglish_s2"),
    ("sabse accha phone under 20k", "hinglish_s2"),
    ("accha laptop under 50k", "hinglish_s2"),
    ("ammi ke liye saree", "hinglish_s2"),
    ("watch ghadi under 2k", "hinglish_s2"),
    ("घड़ी under 1500", "hinglish_s2"),
    ("साड़ी for shaadi under 3k", "hinglish_s2"),
    ("फ़ोन under 15k", "hinglish_s2"),
    ("जूती for men", "hinglish_s2"),
    ("कुर्ता for men under 1k", "hinglish_s2"),
    # S3 relation-word recipient canaries
    ("saree for maa under 3k", "relation"),
    ("saree for mummy under 3k", "relation"),
    ("shirt for abba under 1k", "relation"),
    ("watch for bhai under 3k", "relation"),
    ("saree for behen under 3k", "relation"),
    ("sweater for saas under 2k", "relation"),
    ("gift for dost under 1k", "relation"),
    ("kurta for beta under 500", "relation"),
    # S4 spec-slot canaries (soft boosts, never budgets)
    ("2 ton ac under 70k", "spec_s4"),
    ("43 inch tv under 40k", "spec_s4"),
    ("5 star ac under 60k", "spec_s4"),
    ("128gb phone under 15k", "spec_s4"),
    ("8gb ram laptop under 50k", "spec_s4"),
    ("5 year old girl dress under 500", "spec_s4"),
    ("6 months baby shoes", "spec_s4"),
    ("size m kurta", "spec_s4"),
    ("1 litre water bottle", "spec_s4"),
]

def post(url, payload):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)

# G3 guided-facet checks (assertions, not eyeball): the guide must only ask
# a facet question when the candidate set can visibly act on the answer.
G3_CHECKS = [
    ("guide_for_whom", "shirt under 1k", {}, "for_whom"),
    ("guide_no_gender_data", "kurti", {}, "not_for_whom"),
    ("guide_recipient_hint", "kurti for ammi", {}, "not_for_whom"),
    ("facet_size_l", "cotton kurti", {"size": "l"}, "L"),
    ("facet_for_whom_women", "shirt under 1k", {"forWhom": "women"}, "women"),
]

def check_g3(url):
    fails = 0
    for kind, q, opts, expect in G3_CHECKS:
        if kind.startswith("guide"):
            d = post(url + "/api/guide", {"query": q, "n_results": 48, "turn": 1, "prev_types": []})
            g = d.get("guide") or {}
            t = g.get("type")
            if expect == "for_whom":
                named = sum(o.get("count", 0) for o in (g.get("optionCounts") or [])[:3])
                ok = t == "for_whom" and named >= 15
            else:
                ok = t != "for_whom"
        else:
            d = post(url + "/api/search", {"query": q, **opts})
            tops = d["results"][:3] if kind == "facet_size_l" else d["results"][:12]
            pat = r"\bL\b" if kind == "facet_size_l" else r"\b(women|womens|ladies|female)\b"
            ok = sum(1 for r in tops if re.search(pat, r["title"], re.I)) >= (2 if kind == "facet_size_l" else 5)
        if not ok:
            fails += 1
        print(f"[{'OK ' if ok else 'FAIL'}] (g3:{kind}) {q!r} {opts or ''}")
    return fails

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
    fails += check_g3(a.url)
    print(f"\ndone: {len(CANARIES)} canaries + {len(G3_CHECKS)} g3 checks, {fails} failures")

if __name__ == "__main__":
    main()
