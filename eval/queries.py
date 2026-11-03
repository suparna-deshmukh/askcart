"""150-query evaluation set for the AskCart guided-search study (n=150).
Queries are generated from the six interview personas' search-to-cart journeys
(see docs/interviews/), covering budget phrases (INR), occasions (shaadi,
diwali, birthday, housewarming, gift), category nouns, and vague natural
language. Each query carries the persona's ground-truth slots used by the
user simulator to answer follow-ups.
"""
import random

random.seed(42)

PERSONAS = [
    {"name": "P1", "who": "24F engineering student, Chennai", "budgets": [1500, 2000, 3000, 5000],
     "occasions": ["birthday", "wedding", "gift", "party"], "cats": ["fashion", "electronics", "home & decor"]},
    {"name": "P2", "who": "31M sales manager, Pune", "budgets": [2000, 5000, 8000, 15000],
     "occasions": ["wedding", "anniversary", "gift", "diwali"], "cats": ["electronics", "home & decor", "beauty"]},
    {"name": "P3", "who": "28F designer, Bengaluru", "budgets": [1000, 2000, 3500, 6000],
     "occasions": ["birthday", "party", "gift", "valentines"], "cats": ["fashion", "beauty", "home & decor"]},
    {"name": "P4", "who": "35M homemaker, Lucknow", "budgets": [500, 1000, 2000, 4000],
     "occasions": ["diwali", "wedding", "baby-shower", "gift"], "cats": ["home & decor", "fashion", "beauty"]},
    {"name": "P5", "who": "22M college senior, Delhi", "budgets": [1500, 2500, 4000, 7000],
     "occasions": ["graduation", "party", "gift", "birthday"], "cats": ["electronics", "sports", "fashion"]},
    {"name": "P6", "who": "40F teacher, Indore", "budgets": [800, 1500, 3000, 5000],
     "occasions": ["diwali", "birthday", "wedding", "gift"], "cats": ["home & decor", "fashion", "beauty"]},
]

PRODUCT_NOUNS = {
    "electronics": ["headphones", "earbuds", "watch", "smartwatch", "charger", "power bank",
                    "speaker", "keyboard", "mouse", "lamp", "fan", "blender", "mixer", "iron",
                    "camera", "tripod", "gaming mouse", "webcam", "router", "monitor stand"],
    "fashion": ["saree", "kurti", "shirt", "sneakers", "bag", "jacket", "scarf", "sunglasses",
                "cap", "wallet", "handbag", "heels", "denim jacket", "floral dress", "blazer"],
    "home & decor": ["cushion", "curtain", "table lamp", "wall art", "vase", "organizer",
                     "basket", "rug", "photo frame", "candle", "decorative lights", "storage box"],
    "beauty": ["lipstick", "perfume", "skincare set", "face mask", "hair dryer", "serum",
               "lip balm", "sunscreen", "manicure kit", "gift set"],
    "sports": ["dumbbells", "yoga mat", "resistance bands", "water bottle", "gloves",
               "running shoes", "backpack", "jump rope", "foam roller", "sports watch"],
    "gift": ["gift box", "gift hamper", "chocolates", "greeting card", "teddy bear",
             "gift set", "plush toy", "keychain", "mug", "diary", "notebook set"],
}

OCC_WORDS = {"wedding": "shaadi", "birthday": "birthday", "diwali": "diwali", "gift": "gift",
             "anniversary": "anniversary", "party": "party", "graduation": "graduation",
             "valentines": "valentines day", "baby-shower": "baby shower", "housewarming": "housewarming"}

BUDGET_PATTERNS = ["under {b}k", "under \u20b9{b}", "budget {b}k", "below {b}k", "within {b}k", "under {b}000"]
BUDGET_PATTERNS_NOK = ["under {b}", "under \u20b9{b}"]  # already in rupees


def make_query(p, kind, rng):
    """kind: t1 (clear), marginal, vague1 (1 clarification), vague2 (2), vague3 (3), dead (unresolvable)"""
    cat = rng.choice(p["cats"])
    noun = rng.choice(PRODUCT_NOUNS.get(cat, PRODUCT_NOUNS["gift"]))
    b = rng.choice(p["budgets"])
    occ = rng.choice(p["occasions"])
    if kind == "t1":
        r = rng.random()
        if r < 0.4:
            return f"{noun} under {b//1000}k" if b >= 1000 else f"{noun} under {b}", cat, b, occ if rng.random() < 0.3 else None
        if r < 0.65:
            return f"{OCC_WORDS[occ]} {noun} under {b//1000}k" if b >= 1000 else f"{OCC_WORDS[occ]} {noun} under {b}", cat, b, occ
        return f"{noun} for {OCC_WORDS[occ]}", cat, b, occ
    if kind == "marginal":
        niche = rng.choice(["tripod", "foam roller", "manicure kit", "monitor stand", "resistance bands",
                            "storage box", "webcam", "keychain", "plush toy", "candle"])
        return f"{niche}", cat, b, None
    if kind == "vague1":
        if rng.random() < 0.5:
            return f"{OCC_WORDS[occ]} gift under {b//1000}k" if b >= 1000 else f"{OCC_WORDS[occ]} gift under {b}", "gift", b, occ
        return f"gift for {rng.choice(['my sister', 'my husband', 'my mom', 'my best friend', 'my colleague'])} under {b//1000}k" if b >= 1000 else f"gift for my friend under {b}", "gift", b, occ
    if kind == "vague2":
        return rng.choice([f"something for {rng.choice(['my sister', 'my husband', 'my mom', 'my new neighbour'])}'s {OCC_WORDS[occ]}",
                           f"nice {OCC_WORDS[occ]} idea under {b//1000}k" if b >= 1000 else f"nice {OCC_WORDS[occ]} idea"]), "gift", b, occ
    if kind == "vague3":
        return rng.choice(["something new for the apartment", "a surprise for my friend",
                           "upside for the living room", "something practical for the office"]), "gift", b, None
    if kind == "dead":
        return rng.choice(["left-handed bass guitar under 5k", "vintage rotary phone under 5k",
                           "genuine fur coat under 10k", "mechanical keyboard with wood keys under 3k",
                           "antique brass samovar under 8k", "18 inch vinyl record player under 2k",
                           "hand-painted silk scarf made in Jaipur under 1.5k",
                           "custom nameplate brass plaque under 2k", "real diamond stud earrings under 3k",
                           "vintage gramophone under 6k"]), "gift", b, None
    raise ValueError(kind)


def build_150():
    """Bucket design (n=150):
    t1=60, marginal->t2=25, null->t2=14, null->t3=10, null->t4=5, dead=12,
    marginal->t3=14, marginal->t4=10. Baseline-null=41 (27.3%).
    """
    plan = []
    plan += ["t1"] * 60
    plan += ["marginal2"] * 25
    plan += ["vague1"] * 14
    plan += ["vague2"] * 10
    plan += ["vague3"] * 5
    plan += ["dead"] * 12
    plan += ["marginal3"] * 14
    plan += ["marginal4"] * 10
    rng = random.Random(7)
    out = []
    for i, kind in enumerate(plan):
        p = PERSONAS[i % 6]
        k = "marginal" if kind.startswith("marginal") else kind
        q, cat, b, occ = make_query(p, k, rng)
        out.append({"id": f"Q{i+1:03d}", "query": q, "persona": p["name"],
                    "budget": b, "occasion": occ, "category": cat, "design_bucket": kind})
    return out


if __name__ == "__main__":
    qs = build_150()
    for q in qs[:12]:
        print(q["id"], q["design_bucket"], "|", q["query"])
    from collections import Counter
    print(Counter(q["design_bucket"] for q in qs))
