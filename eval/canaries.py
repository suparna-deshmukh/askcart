"""
Canary query suite: the highest-value queries of every type (India
occasions, specs, brands, strata, Hinglish, dead ends). Runs each against
the live app and prints the top-3 so a human/reviewer can eyeball relevance
after any search or catalog change.
Usage: .venv/bin/python eval/canaries.py [--url http://localhost:3000]
"""
import argparse, json, os, re, urllib.request

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
    # Fashion ladder is size-first when titles carry S/M/L (Qwen UX panel v2:
    # "size is better" on watch/smartwatch; size moments 83% A). Saree titles
    # carry no S/M/L, so for-whom stays first there.
    ("guide_for_whom", "bangle", {}, "for_whom"),
    ("guide_size_first", "shirt under 1k", {}, "size"),
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
            elif expect == "size":
                ok = t == "size"
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

# S9 guided-grounding checks (section 9): the named case (cookware +
# birthday) must never offer fashion brands; every option count must equal
# an exact recount over the visible set; answer sequences must be
# monotonic; fabricated bad questions must fall back to typed-only.
GG_FORBIDDEN = ["Zariin", "Pepe Jeans", "Azzam", "High Road"]
APP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app")

def visible_of(url, query, **extra):
    d = post(url + "/api/search", {"query": query, "limit": 48, **extra})
    return [{"sku": r.get("sku"), "title": r.get("title"), "price": r.get("price"),
             "brand": r.get("brand"), "category": r.get("category"),
             "tags": r.get("tags") or [], "intent": bool(r.get("intent"))}
            for r in d["results"]]

def chip_opts_from_guide(g, chip, vis, query):
    """Client-parity chip -> search opts (page.jsx applyAnswer)."""
    t = g.get("type"); st = g.get("subType") or ""
    if t == "budget" or (t == "any" and st == "bands"):
        nums = [int(x.replace(",", "")) for x in re.findall(r"[\d,]+", str(chip)) if int(x.replace(",", "")) > 0]
        if not nums: return {}, ""
        return {"budget": max(nums)}, ""
    if t == "brand" or (t == "any" and st == "brands"):
        return ({"brand": "best_rated"} if re.search(r"no preference|best rated", chip, re.I) else {"brand": chip}), ""
    if t == "occasion":
        key = str(chip).lower().split("/")[0].strip()
        m = {"gift": "gift", "birthday": "birthday", "wedding": "wedding", "shaadi": "wedding",
             "anniversary": "anniversary", "party": "party", "diwali": "diwali", "christmas": "christmas",
             "valentines": "valentines", "graduation": "graduation", "housewarming": "housewarming",
             "everyday": None, "daily": None}
        return ({"occasion": m[key]} if key in m and m[key] else {}), ""
    if t == "any":
        for r in vis:
            if r.get("brand") and r["brand"].lower() in str(chip).lower():
                return {"brand": r["brand"]}, ""
        nums = [int(x.replace(",", "")) for x in re.findall(r"[\d,]+", str(chip)) if int(x.replace(",", "")) > 0]
        if "\u20b9" in chip and nums:
            return {"budget": max(nums)}, ""
        return {}, chip  # typed refinement
    if t == "category":
        if re.match(r"^any category$", chip, re.I): return {}, ""
        for r in vis:
            if r.get("category") and (r["category"].lower() in str(chip).lower() or str(chip).lower() in r["category"].lower()):
                return {"category": r["category"]}, ""
        return {}, chip
    return {}, chip

def check_gg(url):
    fails = 0
    n_gg = 0
    def ck(name, ok, extra=""):
        nonlocal fails, n_gg
        n_gg += 1
        if not ok: fails += 1
        print(f"[{'OK ' if ok else 'FAIL'}] (gg:{name}) {extra}")

    # named case: T1 brand Q1 with visible
    vis1 = visible_of(url, "non stick cookware set")
    n_intent = sum(1 for v in vis1 if v["intent"])
    d1 = post(url + "/api/guide", {"query": "non stick cookware set", "n_results": n_intent,
                                   "turn": 1, "prev_types": [], "slots": {}, "mode": "fallback", "visible": vis1})
    g1 = d1.get("guide") or {}
    opts1 = g1.get("optionCounts") or []
    ck("named_q1_brand", g1.get("type") == "brand" or (g1.get("type") == "any" and g1.get("subType") == "brands"), f"type={g1.get('type')} sub={g1.get('subType')}")
    ck("named_q1_no_fashion", not any(f in o.get("label", "") for f in GG_FORBIDDEN for o in opts1),
       ",".join(o["label"] for o in opts1))

    # named case: typed "birthday" -> Q2
    vis2 = visible_of(url, "non stick cookware set birthday", relax=True)
    d2 = post(url + "/api/guide", {"query": "non stick cookware set", "n_results": sum(1 for v in vis2 if v["intent"]),
                                   "turn": 2, "prev_types": ["brand"], "slots": {}, "mode": "fallback", "visible": vis2})
    g2 = d2.get("guide") or {}
    opts2 = g2.get("optionCounts") or []
    ck("named_q2_asks", g2.get("ask", bool(g2)), f"type={g2.get('type')} sub={g2.get('subType')}")
    ck("named_q2_no_fashion", not any(f in o.get("label", "") for f in GG_FORBIDDEN for o in opts2),
       ",".join(o["label"] for o in opts2))
    # counts == recount over the visible set (exact)
    def recount(kind, label, vis):
        n = len(vis)
        if re.match(r"^(No preference|Not sure|Any|Unisex)", label, re.I): return n
        if kind == "brand": return sum(1 for r in vis if r.get("brand") == label)
        if kind == "band":
            nums = [int(x.replace(",", "")) for x in re.findall(r"[\d,]+", str(label)) if int(x.replace(",", "")) > 0]
            if re.match(r"under", str(label), re.I) and nums: return sum(1 for r in vis if (r.get("price") or 0) < nums[0])
            if len(nums) >= 2: return sum(1 for r in vis if nums[0] <= (r.get("price") or 0) < nums[1])
            return n
        if kind == "category": return sum(1 for r in vis if r.get("category") == label)
        if kind == "tag": return sum(1 for r in vis if label in (r.get("tags") or []))
        return None
    kind2 = {"brands": "brand", "tags": "tag", "bands": "band"}.get(g2.get("subType") or "", g2.get("type") or "free")
    bad_counts = [o for o in opts2 if (rc := recount(kind2, o["label"], vis2)) is not None and rc != o.get("count", 0)]
    ck("named_q2_counts_exact", not bad_counts, str(bad_counts))

    # fabricated bad questions -> typed-only fallback + counter (in-process)
    def node_unit(unit):
        import subprocess
        r = subprocess.run(["node", os.path.join(os.path.dirname(APP_DIR), "eval", "s9_guard_units.mjs"), unit],
                           cwd=APP_DIR, capture_output=True, text=True, timeout=120)
        line = (r.stdout or "").strip().splitlines()
        try:
            return json.loads(line[-1]) if line else {"ok": False, "reason": "no-output:" + r.stderr[-200:]}
        except Exception:
            return {"ok": False, "reason": "bad-json"}
    u = node_unit("bad_fashion_brands"); ck("guard_fallback_unit", u.get("ok") is True and u.get("reason") == "guard:ungrounded", str(u))
    u = node_unit("count_mismatch");      ck("guard_count_unit", u.get("ok") is True and u.get("reason") == "guard:count_mismatch", str(u))
    u = node_unit("reask");               ck("guard_reask_unit", u.get("ok") is True and u.get("reason") == "guard:reask", str(u))
    u = node_unit("thin");                ck("guard_thin_unit", u.get("ok") is True and u.get("reason") == "guard:thin", str(u))
    u = node_unit("rail_drop_hide");      ck("rail_guard_unit", u.get("ok") is True, str(u))
    u = node_unit("rail_relation");       ck("rail_relation_unit", u.get("ok") is True, str(u))

    # world guard: non-wearable query, fashion-dominant visible set
    vw = visible_of(url, "wedding gift set")
    dw = post(url + "/api/guide", {"query": "wedding gift set", "n_results": sum(1 for v in vw if v["intent"]),
                                   "turn": 1, "prev_types": [], "slots": {}, "mode": "fallback", "visible": vw})
    gw = dw.get("guide") or {}
    optw = gw.get("optionCounts") or []
    kinds = [{"brands": "brand", "tags": "tag", "bands": "band"}.get(gw.get("subType") or "", gw.get("type") or "")]
    ck("world_guard_no_brand_tag", gw.get("type") != "brand" and gw.get("subType") not in ("brands", "tags")
       and not any(k in ("brand", "tag") for k in kinds), f"type={gw.get('type')} sub={gw.get('subType')}")

    # legacy path (no visible) unchanged: brand question for headphones
    dL = post(url + "/api/guide", {"query": "headphones under 3000", "n_results": 48, "turn": 1, "prev_types": [], "mode": "fallback"})
    ck("legacy_no_visible", (dL.get("guide") or {}).get("type") == "brand", "type=" + str((dL.get("guide") or {}).get("type")))

    # monotonicity: chip answers never grow the visible set
    def mono(url, q, chip_pick):
        v0 = visible_of(url, q)
        d0 = post(url + "/api/guide", {"query": q, "n_results": sum(1 for v in v0 if v["intent"]),
                                       "turn": 1, "prev_types": [], "slots": {}, "mode": "fallback", "visible": v0})
        g0 = d0.get("guide") or {}
        if not g0.get("optionCounts"): return None
        chip = chip_pick(g0)
        if not chip: return None
        opts, extra = chip_opts_from_guide(g0, chip, v0, q)
        v1 = visible_of(url, q + (" " + extra if extra else ""), relax=True, **opts)
        return len(v0), len(v1)
    m1 = mono(url, "non stick cookware set", lambda g: next((o["label"] for o in g["optionCounts"] if o.get("count", 0) > 0 and re.search(r"no preference", o["label"], re.I)), None))
    ck("mono_named", m1 is None or m1[1] <= m1[0], str(m1))
    m2 = mono(url, "headphones under 3000", lambda g: next((o["label"] for o in g["optionCounts"] if o.get("count", 0) > 0 and not re.search(r"no preference", o["label"], re.I)), None))
    ck("mono_headphones", m2 is None or m2[1] <= m2[0], str(m2))
    ck("echo_pair_nonincreasing", (m1 is None or m1[1] <= m1[0]) and (m2 is None or m2[1] <= m2[0]),
       "N of M never increases: " + str([m1, m2]))

    # ai-status guard row + 24h guideHealth
    with urllib.request.urlopen(url + "/api/ai-status", timeout=30) as r:
        st = json.load(r)
    ck("ai_status_guard_row", isinstance(st.get("guard", {}).get("fallbacks"), int) and isinstance(st.get("guard", {}).get("railDrops"), int), str(st.get("guard")))
    with urllib.request.urlopen(url + "/api/analytics/summary?range=24h", timeout=30) as r:
        sm = json.load(r)
    gh = (sm.get("current") or {}).get("guideHealth") or {}
    ck("guide_health_24h", all(k in gh for k in ("asked", "zeroCountPct", "zeroNarrowPct", "mismatches", "railDrops")), str(gh))

    # three new events wired (registry + allowlist + schema)
    root = os.path.dirname(APP_DIR)
    reg = open(os.path.join(root, "app/lib/event_registry.js"), encoding="utf8").read()
    allow = open(os.path.join(root, "app/app/api/analytics/event/route.js"), encoding="utf8").read()
    schema = open(os.path.join(root, "docs/event_schema.md"), encoding="utf8").read()
    ck("events_wired", all(re.search(r"\b" + e + r"\b", reg) and
                           ("'" + e + "'" in allow or '"' + e + '"' in allow) and
                           ("`" + e + "`" in schema)
                           for e in ("guide_question", "guide_option_mismatch", "rail_item_dropped")))

    # hi + hinglish parity of the named case
    for lg, name in (("hi", "gg_hi_named"), ("hinglish", "gg_hinglish_named")):
        dd = post(url + "/api/guide", {"query": "non stick cookware set", "n_results": sum(1 for v in vis2 if v["intent"]),
                                       "turn": 2, "prev_types": ["brand"], "slots": {}, "mode": "fallback",
                                       "visible": vis2, "lang": lg})
        gg = dd.get("guide") or {}
        oo = gg.get("optionCounts") or gg.get("options") or []
        labels = [o.get("label") if isinstance(o, dict) else o for o in oo]
        ck(name, not any(any(f in str(l) for f in GG_FORBIDDEN) for l in labels), ",".join(str(l) for l in labels)[:120])
    # same-day canaries for P3 clusters: band questions must have live chips
    # (regression: optionKind 'budget' bug zeroed every band recount -> guard:count_mismatch),
    # and a for_whom question must have >=2 live options (thin-gender regression).
    def live_count(g):
        return sum(1 for o in (g.get("optionCounts") or []) if o.get("count", 0) > 0)
    vb = visible_of(url, "washing machine")
    db = post(url + "/api/guide", {"query": "washing machine", "n_results": sum(1 for v in vb if v["intent"]),
                                   "turn": 1, "prev_types": [], "slots": {}, "mode": "fallback", "visible": vb})
    gb = db.get("guide") or {}
    is_band_b = gb.get("type") == "budget" or (gb.get("type") == "any" and gb.get("subType") == "bands")
    ck("gg_band_chips_live", (not is_band_b) or live_count(gb) >= 2,
       "type=" + str(gb.get("type")) + " live=" + str(live_count(gb)) if is_band_b else "not-a-band")
    vf = visible_of(url, "Nike Womens T-Shirt")
    df = post(url + "/api/guide", {"query": "Nike Womens T-Shirt", "n_results": sum(1 for v in vf if v["intent"]),
                                   "turn": 1, "prev_types": [], "slots": {}, "mode": "fallback", "visible": vf})
    gf = df.get("guide") or {}
    ck("gg_for_whom_live_ge2", gf.get("type") != "for_whom" or live_count(gf) >= 2,
       "type=" + str(gf.get("type")) + " live=" + str(live_count(gf)))

    print(f"  gg checks: {n_gg}")
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
    gg_fails = check_gg(a.url)
    fails += gg_fails
    print(f"\ndone: {len(CANARIES)} canaries + {len(G3_CHECKS)} g3 checks + guided-grounding section, {fails} failures")

if __name__ == "__main__":
    main()
