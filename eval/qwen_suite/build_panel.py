"""
Qwen eval suite - frozen 1,000-case panel builder (commit before running).

Dimensions:
  search (400): Qwen R/P/I judgement of current engine top-3.
    100 reused from eval/evalv2/panel.jsonl (frozen 100-query panel),
     50 reused from eval/semantic/panel.jsonl (test split),
     53 reused from eval/relevance_audit.py QUERIES,
    ~197 new: hand-written (gift/budget/hinglish/hi-Devanagari/spec/
             brand/vague/typo/synonym/dead-end/suggest-shaped) +
             trends-suggest harvest. Dead-ends are verified ABSENT from the
             catalogue at build time; synonyms are verified their lead word
             is not in any title.
  rag (300): 250 product Q&A (spec-known / spec-unknown / suitability /
             quality / price, 50 each) over a seeded SKU sample + 50 FAQ
             (25 in-scope mapped to policies.md passages, 25 out-of-scope).
  ux (300): question moments sampled (seeded) from the 3,000-journey
             persona-sim v2 run, stratified by lang x dim x question type.
             judge_ux.py replays the journeys deterministically (0 LLM).

Usage: .venv/bin/python eval/qwen_suite/build_panel.py
"""
import hashlib
import json
import random
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent.parent
CATALOG = json.load(open(BASE / "app/public/catalog.json"))
SEED = 20261104
OUT = Path(__file__).resolve().parent / "panel.jsonl"

def norm(q):
    return re.sub(r"\s+", " ", str(q).strip().lower())

# ---------- search: reused frozen panels ----------
def load_reused():
    rows = []
    for l in open(BASE / "eval/evalv2/panel.jsonl"):
        if l.strip():
            d = json.loads(l)
            rows.append((d["query"], "reused_evalv2", d.get("kind", "?")))
    for l in open(BASE / "eval/semantic/panel.jsonl"):
        if l.strip():
            d = json.loads(l)
            if d.get("split") == "test":
                rows.append((d["query"], "reused_semantic", d.get("kind", "?")))
    import importlib.util
    spec = importlib.util.spec_from_file_location("ra", BASE / "eval/relevance_audit.py")
    ra = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ra)
    for q, k in ra.QUERIES:
        rows.append((q, "reused_audit", k))
    return rows

# ---------- search: new hand-written queries ----------
NEW_GIFT = [
 "gift for new job colleague under 1500", "shaadi gift for sister under 2000",
 "birthday gift for 8 year old boy under 1000", "diwali gift box under 500",
 "anniversary gift for husband under 3000", "graduation gift under 1500",
 "housewarming gift for parents under 2500", "gift for teacher under 800",
 "eid gift under 1000", "birthday gift for mom under 2000",
 "christmas gift for niece under 1200", "engagement gift for cousin under 4000"]
NEW_BUDGET = [
 "laptop under 40k for office", "phone under 12k with good camera",
 "headphones under 800 for calls", "watch under 3000 for daily use",
 "sneakers under 2000", "couch under 15000", "water bottle under 300",
 "bedsheet set under 1000", "perfume for men under 1500", "earbuds under 1000",
 "mouse under 500", "tv 43 inch under 25000", "fridge single door under 15000",
 "washing machine 5 kg under 15000"]
NEW_HINGLISH = [
 "sasta accha headphone 1000 ke andar", "ammi ke liye saree 2000 tak",
 "papa ke liye gift under 1500", "didi ki shaadi gift 1000",
 "chhoti behen ke liye gift 500", "office ke liye kurta under 800",
 "shaadi me pehnen ke liye jooti 2000", "bachche ke liye khilona 1000",
 "raat ke liye kapde winter 1500", "ghar ke liye decoration diwali 1000",
 "phone case 500 ka acha", "mummy ke liye winter kapde 2500",
 "bhai ke liye gift birthday 800", "saree 1500 ke andar cotton",
 "ac 1.5 ton 40000 se kam", "laptop 35000 me acha"]
NEW_HI = [
 "दिवाली के लिए गिफ्ट 500 से कम", "अम्मी के लिए साड़ी 2000 तक",
 "बहन की शादी का गिफ्ट", "पप्पा के लिए घड़ी 3000 में",
 "बच्चे के लिए खिलौना 1000 से कम", "हेडफ़ोन 1000 से कम",
 "कुरती 500 में", "पंखा 1500 तक", "बिछौना 800 से कम",
 "मम्मी के लिए जूते 1200", "दोस्त के लिए गिफ्ट 1500 तक",
 "साड़ी 2000 में", "घर के लिए दिये 300", "फ़ोन 12000 से कम"]
NEW_SPEC = [
 "128gb phone under 15k", "8gb ram laptop under 50k", "43 inch tv 4k",
 "5 star 1.5 ton ac under 40k", "7 kg top load washing machine under 18k",
 "1 litre mixer grinder under 3000", "size l blazer under 2500",
 "size xl kurta for men", "500ml water bottle steel", "600w mixer",
 "1.5 ton split ac under 35k", "256gb tablet under 15k"]
NEW_BRAND = [
 "casio watch under 5000", "jbl speaker under 3000", "nike shoes under 4000",
 "philips mixer under 3000", "hp laptop under 50k", "lg fridge under 25000",
 "samsung tv 43 under 30k", "nike tshirt under 1500",
 "casio calculator under 1000", "boat earbuds under 1500"]
NEW_VAGUE = [
 "something for my room", "kuch acha ghar ke liye", "office supplies kuch",
 "something cute for desk", "winter wala kuch under 2000",
 "kuch naya phone ke liye", "doston ke ghar jaane ke liye gift",
 "something for my husband's birthday", "chhota sa gift 500",
 "room decoration kuch sasta"]
NEW_TYPO = [
 "samsun tv 43", "iphnoe 15 under 60k", "jbl speakr", "nkie shoes",
 "sony hearphone", "casio wacth", "hp lapttop", "philix mixer",
 "lg refrigeator", "mictrowave oven", "watsh casio", "fabindya kurti"]
SYNONYM_CANDS = [
 "couch under 15000", "couch under 20000", "cellphone under 12000",
 "cellphone under 20000", "cell phone under 8000", "cell phone under 15000",
 "ear pods under 1000", "ear pods jbl", "airpods under 5000",
 "airpods for iphone", "jumper under 2000", "pullover for men under 1500",
 "sweatshirt under 1000", "hooded sweater", "power bank 20000mah",
 "phone charger 25w", "laptop bag for 15 inch", "mouse pad for gaming",
 "desk lamp led", "wall clock silent", "steel bottle 1 litre", "ac remote universal"]
NEW_DEAD = [
 "telescope", "violin bow", "typewriter", "quill pen", "slide rule",
 "astrolabe", "candlestick telephone", "gramophone record player",
 "oil lamp", "falconry glove", "linotype machine", "daguerreotype kit",
 "telegraph key", "morse code kit", "periscope", "hoverboard", "zither"]
NEW_SUGGEST = [
 "gift under 2000 for men", "gift under 2000 for women", "gift under 500 for kids",
 "gift under 1000 for teacher", "shaadi gift under 1500", "shaadi gift for brother",
 "diwali gifts under 500", "diwali gifts for kids", "birthday gifts for 10 year old",
 "birthday gift for boyfriend", "wedding gifts for couple", "engagement gifts for girl",
 "festival gifts under 1000", "headphones under 1000 for calls", "headphones under 500",
 "earbuds under 800", "earbuds under 1500 boat", "smartwatch under 2000",
 "smartwatch for women under 3000", "fitness band under 1000", "phone under 10000 for parents",
 "phone under 20000 5g", "laptop under 30000 for students", "laptop under 50000 i5",
 "gaming laptop under 60000", "tablet under 15000 for kids", "ipad under 25000",
 "monitor 24 inch under 8000", "gaming monitor under 12000", "keyboard mechanical under 4000",
 "laptop bag under 1500", "phone case for samsung under 500", "phone cover 300",
 "screen guard for iphone under 200", "watch for men under 2000", "watch for women under 1500",
 "digital watch under 1000", "smart watch under 2500", "wrist watch for kids",
 "sneakers under 1500 for men", "running shoes under 2000", "casual shoes for men under 1500",
 "loafers for men under 1200", "slipper for women under 500", "sandal for men under 700",
 "kurti for women under 800", "kurti cotton under 600", "saree under 1500 cotton",
 "saree for wedding under 3000", "lehenga under 5000", "salwar suit under 1500",
 "palazzo set under 1200", "tunic for women under 800", "blouse piece under 300",
 "shirt for men under 700", "tshirt pack of 3 under 999", "joggers under 800",
 "hoodie for men under 1200", "perfume for men under 800", "perfume for women under 1000",
 "bath soap under 200", "body lotion under 500", "mug for office under 300",
 "water bottle 1 litre under 400", "lunch box under 500", "thermos flask under 800",
 "diwali decoration for home under 500", "diya set under 300", "toran for home",
 "rangoli powder under 200", "gift box with toys under 1000", "gift hamper under 1500",
 "gift set for men under 1200", "gift set for women under 1000"]

def lead_word(q):
    toks = re.sub(r"[^a-z\u0900-\u097F ]", "", q.lower()).split()
    return toks[0] if toks else ""

def build_search():
    rows, seen = [], set()
    titles_blob = " ".join(t["title"].lower() for t in CATALOG)
    def add(q, kind):
        n = norm(q)
        if not n or n in seen:
            return False
        if kind == "new_dead_end":
            lw = lead_word(q)
            if lw and lw in titles_blob:
                return False
        if kind == "synonym":
            lw = lead_word(q)
            if lw and lw in titles_blob:
                return False
        seen.add(n)
        rows.append({"query": q, "kind": kind, "source": "new" if kind not in ("reused_evalv2", "reused_semantic", "reused_audit") else kind})
        return True
    for q, src, kind in load_reused():
        rows.append({"query": q, "kind": kind, "source": src})
        seen.add(norm(q))
    for lst, kind in [(NEW_GIFT, "new_gift"), (NEW_BUDGET, "new_budget"), (NEW_HINGLISH, "new_hinglish"),
                      (NEW_HI, "new_hi"), (NEW_SPEC, "new_spec"), (NEW_BRAND, "new_brand"),
                      (NEW_VAGUE, "new_vague"), (NEW_TYPO, "typo"), (NEW_DEAD, "new_dead_end"),
                      (NEW_SUGGEST, "suggest_shape")]:
        for q in lst:
            add(q, kind)
    syn_kept = 0
    for q in SYNONYM_CANDS:
        if syn_kept >= 12:
            break
        if add(q, "synonym"):
            syn_kept += 1
    t = json.load(open(BASE / "data/out/trends_insights.json"))
    cands = []
    for seed, lst in t["suggest"].items():
        cands.append(seed)
        cands.extend(lst)
    bad = re.compile(r"(co uk| near me | buy online| amazon| flipkart| website|\.in\b| ideas$| companies| shops$| stores$)", re.I)
    keep = re.compile(r"(under|for |gift|\d|saree|phone|watch|shoe|shirt|kurti| ac| tv|laptop|headphone|diwali|wedding|birthday|candle|mug|lamp| fan|mixer|sofa|clock|bottle|bangle|perfume)", re.I)
    for q in cands:
        if len(rows) >= 400:
            break
        q = str(q).strip()
        if not (4 <= len(q) <= 55):
            continue
        if not re.match(r"^[\w\s\u0900-\u097F&.'-]+$", q):
            continue
        if bad.search(q) or not keep.search(q) or norm(q) in seen:
            continue
        rows.append({"query": q, "kind": "real_suggest", "source": "trends_suggest"})
        seen.add(norm(q))
    assert len(rows) >= 400, f"only {len(rows)} search rows"
    return rows[:400]

# ---------- rag: product Q&A + FAQ ----------
SPEC_RE = re.compile(r"\b(\d+\s*(gb|tb)\b|\d+(\.\d+)?\s*(ton|litre|l|inch|kg|w|ml|mah)\b|\d\s*star\b|[smlx] size\b|size\s+[smlx]\b)", re.I)
FASHION_RE = re.compile(r"AMAZON FASHION|fashion|clothing|shoes|footwear|saree|kurti|dress|tshirt|shirt|jeans|jacket|hoodie", re.I)

QA_SPEC_KNOWN = [
 (r"\d+\s*(gb|tb)\b", "How much storage does it have?"),
 (r"\d+(\.\d+)?\s*ton\b", "What is the tonnage of this?"),
 (r"\d+\s*star\b", "How many stars is this rated?"),
 (r"\d+\s*inch\b", "How many inches is this?"),
 (r"\d+(\.\d+)?\s*(kg|litre|l)\b", "What is the capacity of this?"),
 (r"\d+\s*(w|ml)\b", "How powerful is this?"),
]
QA_SPEC_UNKNOWN = ["What is it made of?", "Does it come in red?",
                   "What is the battery life?", "What colour options are there?"]
QA_SUITABILITY = ["Is this good as a Diwali gift?", "Is this suitable for a 6 year old?",
                  "Is this good for office use?"]
QA_QUALITY = ["Is it good quality?", "Will this last long?"]
QA_PRICE = "Is this expensive for its category?"

def sku_facts(it):
    return {k: it.get(k) for k in ("sku", "title", "brand", "category", "price", "rating", "num_ratings", "tags", "origin")}

def build_rag():
    rng = random.Random(SEED)
    spec = [t for t in CATALOG if SPEC_RE.search(t["title"]) and len(t["title"]) < 110]
    fash = [t for t in CATALOG if FASHION_RE.search(t["category"] + " " + t["title"]) and len(t["title"]) < 110 and not SPEC_RE.search(t["title"])]
    other = [t for t in CATALOG if not SPEC_RE.search(t["title"]) and not FASHION_RE.search(t["category"] + " " + t["title"]) and len(t["title"]) < 110 and t["price"] > 100]
    pool = rng.sample(spec, min(80, len(spec))) + rng.sample(fash, min(80, len(fash))) + rng.sample(other, min(90, len(other)))
    rng.shuffle(pool)
    rows, used = [], set()
    for t in pool:
        if len([r for r in rows if r["kind"] == "qa_spec_known"]) >= 50:
            break
        m = next((q for pat, q in QA_SPEC_KNOWN if re.search(pat, t["title"], re.I)), None)
        if not m or t["sku"] in used:
            continue
        used.add(t["sku"])
        rows.append({"kind": "qa_spec_known", "sku": t["sku"], "question": m, "expect_answerable": True, "facts": sku_facts(t)})
    def take(kind, n, mk):
        for t in pool:
            if len([r for r in rows if r["kind"] == kind]) >= n:
                return
            if t["sku"] in used:
                continue
            q = mk(t)
            if not q:
                continue
            used.add(t["sku"])
            rows.append({"kind": kind, "sku": t["sku"], "question": q, "facts": sku_facts(t)})
    def mk_unknown(t):
        tl = t["title"].lower()
        return next((q for q in QA_SPEC_UNKNOWN if not any(w in tl for w in re.findall(r"[a-z]{4,}", q.lower()))), None)
    take("qa_spec_unknown", 50, mk_unknown)
    take("qa_suitability", 50, lambda t: QA_SUITABILITY[len([r for r in rows if r["kind"] == "qa_suitability"]) % 3])
    take("qa_quality", 50, lambda t: QA_QUALITY[len([r for r in rows if r["kind"] == "qa_quality"]) % 2])
    take("qa_price", 50, lambda t: QA_PRICE)
    for r in rows:
        if r["kind"] == "qa_spec_unknown":
            r["expect_answerable"] = False
        elif "expect_answerable" not in r:
            r["expect_answerable"] = True
    faq_known = [
        "How long does delivery take?", "What is the return policy?",
        "Which payment methods do you accept?", "How do I track my order?",
        "Is this a real store or a demo?", "Do you have a privacy policy?",
        "How do you rank search results?", "Why do you ask me questions while searching?",
        "Why are some prices shown as indicative?", "Do you provide warranty on products?",
        "How does checkout work here?", "Where do the products come from?",
        "Can I get gift wrapping?", "How are ratings calculated on this site?",
        "Do you deliver to my area?", "What happens after I place an order?",
        "Is my address shared anywhere?", "Can I change my order after placing it?",
        "Do you offer exchange for products?", "How can I contact support?",
        "What is the exchange window for clothes?", "Do prices include tax?",
        "Can I buy in bulk?", "Is there a loyalty program?",
        "How do I know a product is in stock?"]
    for q in faq_known[:25]:
        rows.append({"kind": "faq_known", "sku": None, "question": q, "expect_answerable": True})
    faq_ooo = [
        "What is the weather in Mumbai tomorrow?", "Who will win the India-Australia series?",
        "Help me solve 2x + 5 = 11", "What should I eat for dinner?",
        "Is bitcoin a good investment right now?", "Write a poem about monsoons",
        "What is the capital of France?", "Recommend a movie for tonight",
        "How do I fix a leaking tap at home?", "What is the best phone according to global reviews?",
        "Tell me a joke", "How do I become a doctor?", "What time is it in New York?",
        "Is it legal to buy gold online in India?", "Compare this brand with Apple's global pricing",
        "What are the side effects of this product on health?", "Who is the prime minister of India?",
        "Convert 500 rupees to dollars", "What is the population of Tokyo?",
        "Suggest a restaurant in Bangalore", "How do I file my income tax return?",
        "Is the moon made of cheese?", "Explain quantum computing simply",
        "What is your CEO's name?", "Do you sell insurance?",
        "Predict the cricket score for tomorrow"]
    for q in faq_ooo[:25]:
        rows.append({"kind": "faq_ooo", "sku": None, "question": q, "expect_answerable": False})
    return rows

# ---------- ux: question moments from persona sim v2 ----------
def build_ux():
    recs = [json.loads(l) for l in open(BASE / "logs/persona_sim_20261104_180504.jsonl") if l.strip()]
    moments = defaultdict(list)
    for r in recs:
        for i, q in enumerate(r.get("questions", [])):
            key = (r["lang"], r["dim"], q["type"])
            moments[key].append({"pid": r["pid"], "lang": r["lang"], "segment": r["segment"],
                                 "region": r["region"], "dim": r["dim"], "query": r["query"],
                                 "qtype": q["type"], "qturn": q["turn"], "seq": i,
                                 "resolved": r["resolved"], "null": r["null"]})
    rng = random.Random(SEED)
    total = sum(len(v) for v in moments.values())
    picked = []
    for key in sorted(moments):
        rows = moments[key]
        k = max(1, round(300 * len(rows) / total))
        picked.extend(rng.sample(rows, min(k, len(rows))))
    rng.shuffle(picked)
    return picked[:300]

def main():
    search, rag, ux = build_search(), build_rag(), build_ux()
    panel, ids = [], set()
    def add(rows, dim, prefix):
        for i, r in enumerate(rows):
            cid = f"{prefix}_{i+1:04d}"
            assert cid not in ids
            ids.add(cid)
            c = dict(r)
            c["id"], c["dim"] = cid, dim
            panel.append(c)
    add(search, "search", "qs_s")
    add(rag, "rag", "qs_r")
    add(ux, "ux", "qs_u")
    assert len(panel) == 1000, len(panel)
    OUT.write_text("\n".join(json.dumps(p, ensure_ascii=False) for p in panel) + "\n")
    meta = {"seed": SEED, "n": len(panel), "counts": dict(Counter(p["dim"] for p in panel)),
            "search_kinds": dict(Counter(p.get("kind") for p in panel if p["dim"] == "search")),
            "rag_kinds": dict(Counter(p["kind"] for p in panel if p["dim"] == "rag")),
            "ux_strata": dict(Counter(f'{p["lang"]}/{p["dim"]}/{p["qtype"]}' for p in panel if p["dim"] == "ux")),
            "catalog_sha256": hashlib.sha256(open(BASE / "app/public/catalog.json", "rb").read()).hexdigest()[:16],
            "panel_sha256": hashlib.sha256(OUT.read_bytes()).hexdigest()[:16]}
    (OUT.parent / "panel_meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False))
    print(json.dumps(meta, indent=2, ensure_ascii=False))
    print(f"wrote {OUT} ({len(panel)} cases)")

if __name__ == "__main__":
    main()
