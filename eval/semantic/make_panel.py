#!/usr/bin/env python3
"""Build the semantic-fallback eval panel (100 queries, 50 dev / 50 test).

Composition (work-order cut line: 100-query panel):
  real_suggest 40 - Google Suggest IN autocompletes from trends_insights.json
  vague        15 - written without looking at the catalogue
  hinglish     15 - roman Hindi product/relationship phrases
  typo         10 - deliberate misspellings
  synonym      10 - words not in catalogue titles
  dead_end     10 - products genuinely absent (verified: no title contains
                   the key word)

Split: dev (tau calibration) / test (reported once), balanced across kinds.
Committed BEFORE any arm runs; do not edit after seeing results.
"""
import json, re, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

# ---- dedupe corpus: canaries + 150 study + eval v2 panel --------------------
used = set()
try:
    sys.path.insert(0, os.path.join(REPO, "eval"))
    import canaries
    for q, _ in canaries.CANARIES:
        used.add(q.strip().lower())
    for q, _ in canaries.G3_CHECKS:
        used.add(q.strip().lower())
except Exception:
    pass
for f in ("eval/results/queries_final.json",):
    for row in json.load(open(os.path.join(REPO, f))):
        used.add(row["query"].strip().lower())
for line in open(os.path.join(REPO, "eval/evalv2/panel.jsonl")):
    line = line.strip()
    if line:
        used.add(json.loads(line)["query"].strip().lower())

# ---- real_suggest from trends_insights.json ---------------------------------
ins = json.load(open(os.path.join(REPO, "data/out/trends_insights.json")))
cands = []
for seed, suggs in ins.get("suggest", {}).items():
    cands.append(seed)
    cands.extend(suggs)
SHOP = re.compile(
    r"(gift|under|for|kurti|saree|phone|watch|earphone|headphone|ac |ac under|"
    r"fridge|washing|laptop|tv|shoes|jooti|diwali|shaadi|wedding|birthday|lights|"
    r"sofa|couch|gifts? |kuch|sasta|ke liye|liye|bangle|ring|phone|laptop)", re.I)
real = []
seen = set()
for c in cands:
    c = c.strip()
    k = c.lower()
    if k in seen or len(c) < 4 or k in used:
        continue
    if not SHOP.search(c):
        continue
    if not re.search(r"[a-z]", c):
        continue
    seen.add(k)
    real.append(c)
real = real[:40]

vague = [
    "something for my room", "kuch gift dena hai", "office ke liye kuch",
    "something for father birthday", "gift for new home", "party things for friends",
    "kitchen organizer stuff", "something cute for girlfriend birthday",
    "room decoration ideas", "travel stuff", "baby shower items",
    "office desk stuff", "wedding return gifts", "housewarming gift ideas",
    "something to keep the room cool in summer",
    "things for a new apartment", "gift for a colleague retirement",
    "essentials for a camping trip", "gift for a teacher appreciation day",
]
hinglish = [
    "ammi ke liye saree", "sasta headphone", "bhai ke liye gift",
    "accha phone 15k", "didi ki shaadi ke liye kuch", "papa ke liye wallet",
    "sari for shaadi", "mithai ki thali", "chappal for office",
    "accha watch 5k", "mummy ke liye gift diwali", "beta ke liye toy",
    "sas ke liye bangle", "bachelor party gift", "koi acha gift 2k",
    "mummy ke liye dupatta", "bhaiya ke liye watch", "nani ke liye shawl",
    "cousin ki birthday gift", "chacha ke liye gift",
]
typo = [
    "samsng tv", "heaphones", "sareee", "ipone 15", "mictrowave",
    "laptop hp paviln", "watsh for men", "kurtti", "gld bangle", "dewal light",
]
synonym = [
    "couch for living room", "cellphone under 10k", "slacks for office",
    "tshirt for bhai", "blazer for wedding guest", "ear buds under 1k",
    "gadget for tech lover", "footwear for men", "mobile under 5k",
    "shoe for wedding guest",
]
dead_candidates = [
    # verified absent: no catalogue title contains the key word
    ("samovar", "samovar"), ("conga drum", "conga"), ("didgeridoo", "didgeridoo"),
    ("theremin", "theremin"), ("hoverboard", "hoverboard"), ("dinghy", "dinghy"),
    ("periscope", "periscope"), ("ice skate", "ice skate"),
    ("bobsled", "bobsled"), ("slinky", "slinky"),
    ("sphygmomanometer", "sphygmomanometer"),
]
cat = json.load(open(os.path.join(REPO, "app/public/catalog.json")))
titles = [c["title"].lower() for c in cat]
dead = []
for q, key in dead_candidates:
    if any(key in t for t in titles):
        print(f"  (skipping {q!r}: key {key!r} present in a title)")
        continue
    dead.append(q)
    if len(dead) == 10:
        break
if len(dead) < 10:
    raise SystemExit(f"only {len(dead)} verified-absent dead ends; add more candidates")

panel = (
    [("q", "real_suggest") for q in real]
    + [("v", "vague") for q in vague]
    + [("h", "hinglish") for q in hinglish]
    + [("t", "typo") for q in typo]
    + [("y", "synonym") for q in synonym]
    + [("d", "dead_end") for q in dead]
)
assert len(panel) >= 100, len(panel)
# interleave so dev/test each carry a balanced mix of kinds
half = {}
out = []
for pref, kind in panel:
    q = dict(kind=kind)
    out.append((pref, kind))
import itertools
rows = []
counts = {}
for i, (pref, kind) in enumerate(out):
    q = None
    for src, k in (("real", real), ("vague", vague), ("hinglish", hinglish),
                   ("typo", typo), ("synonym", synonym), ("dead", dead)):
        pass
# simpler: build per-kind lists, round-robin into dev/test
def split_balanced(items_by_kind):
    dev, test = [], []
    for kind, qs in items_by_kind:
        for j, q in enumerate(qs):
            (test if j % 2 == 0 else dev).append({"query": q, "kind": kind})
    return dev, test

dev, test = split_balanced([
    ("real_suggest", real), ("vague", vague), ("hinglish", hinglish),
    ("typo", typo), ("synonym", synonym), ("dead_end", dead),
])
rows = dev + test
# final dedupe + ids
seen2 = set()
n = 0
final = []
for r in rows:
    k = r["query"].strip().lower()
    if k in used or k in seen2:
        print("  (dropping duplicate:", r["query"], ")")
        continue
    seen2.add(k)
    n += 1
    final.append({"id": f"s{n:03d}", "query": r["query"].strip(), "kind": r["kind"],
                  "split": "dev" if r in dev else "test"})
# recount by kind/split
from collections import Counter
c = Counter((r["kind"], r["split"]) for r in final)
print("panel by kind/split:")
for (kind, split), n in sorted(c.items()):
    print(f"  {kind:12s} {split:4s} {n}")
print("total:", len(final), "| dev:", sum(1 for r in final if r['split']=='dev'),
      "| test:", sum(1 for r in final if r['split']=='test'))
assert len(final) >= 95, len(final)
out_path = os.path.join(os.path.dirname(__file__), "panel.jsonl")
with open(out_path, "w") as f:
    for r in final:
        f.write(json.dumps(r, ensure_ascii=False) + "\n")
print("wrote", out_path)
print("dead ends (verified absent):", dead)
