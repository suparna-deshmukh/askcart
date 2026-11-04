"""
Build the ~35,000-SKU AskCart prototype catalog.

Two layers (both deterministic, seed 42):
  1. US base - 25,000 SKUs from real Amazon product data
     (milistu/AMAZON-Products-2023, 117,243 products; huggingface.co).

Design (documented, deterministic, seed 42):
- Source is Amazon US; products are real and many are imported/sold in India.
  Per the product brief, foreign products sold in India are allowed; listings
  that are not physical consumer goods (digital music, appstore, gift cards,
  software, B2B industrial/scientific, collectible coins, GPS hardware) are
  excluded.
- Prices converted USD->INR at 83.5 (documented prototype rate, floored to
  nearest 10 minus 1 => "x9" pricing). Outlier cap: <= Rs 3,00,000
  (no yachts/machinery/real-estate-style listings).
- Price profile is weighted to Indian consumer gifting reality:
    35% <=2k, 28% 2-5k, 17% 5-10k, 12% 10-20k, 8% >20k  (median ~ Rs 2.5k).
- Category allocation boosts gift/occasion-adjacent categories; each
  (category, band) cell is capped by actual source availability and the
  remainder is redistributed waterfill-style.
- Brand extracted from a known-brand list (global brands sold in India).
- Anchor depth guarantee: 237 curated real models (brands/models/MRPs as
  listed on Amazon.in & Flipkart) are force-included in the 15 flagship
  classes, because the US pool is accessory-skewed (genuine smartphones,
  TVs and laptops are rare in it). See scripts/catalog_supplement.py.
  2. India "everything" layer - ~10,000 SKUs for the Indian consumer's
     full purchase universe: every occasion (shaadi, diwali, rakhi, holi,
     eid, navratri, christmas, baby shower, housewarming, birthday), every
     economic stratum (Rs 99 essentials to Rs 2L gold/sofas), real Indian
     brands (Hawkins, Fabindia, Titan, Luminous, Kent, Manyavar, CaratLane,
     ...) at realistic 2026 INR MRPs. Hand-written anchor rows plus
     listing-matrix families (brand x model x colour/size/capacity grids,
     the shape of real Myntra/Flipkart listings). See
     scripts/catalog_india.py.
Output: app/public/catalog.json (~35,000 items), data/out/catalog.parquet
"""
import json
import re
from pathlib import Path

import pandas as pd

BASE = Path(__file__).resolve().parent.parent
SRC = [BASE / "data/raw/catalog_src/m_0.parquet", BASE / "data/raw/catalog_src/m_1.parquet",
       BASE / "data/raw/catalog_src/m_2.parquet", BASE / "data/raw/catalog_src/m_3.parquet"]
OUT_JSON = BASE / "app/public/catalog.json"
OUT_PQ = BASE / "data/out/catalog.parquet"
USD_TO_INR = 83.5
TARGET = 25000
PRICE_CAP_INR = 300000

# S7: variant-string classification for listing-matrix families.
# size  = a size token (S/M/L/XL, UK n, jean size) or a capacity/weight unit
# colour = a colour word, or the non-size part of a "Colour Size" string
# other = packs ("12 colors"), materials ("Glass"), neutrals ("Standard")
SIZE_TOKEN_RE = re.compile(r"^(UK\s?\d+|\d{1,3}(?:\s?in)?|XXS|XS|S|M|L|XL|XXL|M/L|L/XL)$", re.I)
CAPACITY_RE = re.compile(r"^\d+(?:\.\d+)?\s?(ml|l|kg|g|gm|oz|lb|grams?)$", re.I)
PACK_RE = re.compile(r"^\d+\s?(?:colors?|pcs?|packs?|pack|sets?|pairs?)$", re.I)
NEUTRAL_VARIANTS = {"standard", "default", "regular", "one size", "multicolor", "multi", "assorted",
                    "glass", "plastic", "metal", "wooden", "leather", "silicone", "stainless steel"}


def split_variant(v):
    """Split one variant string -> (colour_part, size_part); either may be None.
    (None, None) means pack/neutral -> counted as a plain variant."""
    v = v.strip()
    if not v:
        return (None, None)
    if v.lower() in NEUTRAL_VARIANTS:
        return (None, None)
    if SIZE_TOKEN_RE.match(v) or CAPACITY_RE.match(v):
        return (None, v)
    if PACK_RE.match(v):
        return (None, None)
    m = re.match(r"^(.*?)\s+(\S+)$", v)
    if m and (SIZE_TOKEN_RE.match(m.group(2)) or CAPACITY_RE.match(m.group(2))):
        return (m.group(1) or None, m.group(2))
    return (v, None)


def family_summary(members):
    """'6 colours · 4 sizes' style label, or None when nothing worth showing."""
    colours, sizes, others = set(), set(), set()
    for x in members:
        v = (x.get("variant") or "").strip()
        if not v:
            continue
        c, s = split_variant(v)
        if c:
            colours.add(c)
        if s:
            sizes.add(s)
        if not c and not s:
            others.add(v)
    parts = []
    if colours:
        parts.append(f"{len(colours)} colour" + ("" if len(colours) == 1 else "s"))
    if sizes:
        parts.append(f"{len(sizes)} size" + ("" if len(sizes) == 1 else "s"))
    if not parts and (others or len(members) > 1):
        parts.append(f"{len(members)} variants")
    return " · ".join(parts) if parts else None

EXCLUDE_CATS = {
    "Industrial & Scientific", "Digital Music", "Appstore for Android",
    "GPS & Navigation", "Collectible Coins", "Portable Audio & Accessories",
    "Grocery", "Software", "Entertainment", "Gift Cards", "Amazon Devices",
}

# category -> allocation weight (gift/occasion-adjacent boosted), scaled to TARGET
WEIGHTS = {
    "AMAZON FASHION": 7000, "Amazon Home": 4200, "All Electronics": 1800,
    "Cell Phones & Accessories": 1600, "Sports & Outdoors": 1100,
    "Health & Personal Care": 900, "Office Products": 700, "Computers": 800,
    "Tools & Home Improvement": 800, "Toys & Games": 500, "Baby": 150,
    "Handmade": 550, "Arts, Crafts & Sewing": 450, "Pet Supplies": 350,
    "Automotive": 400, "Camera & Photo": 300, "Musical Instruments": 200,
    "Appliances": 150, "Video Games": 120, "Home Audio & Theater": 120,
    "Collectibles & Fine Art": 100, "All Beauty": 150, "Car Electronics": 60,
    "Sports Collectibles": 40,
}

BANDS = [(2000, 0.35), (5000, 0.28), (10000, 0.17), (20000, 0.12), (PRICE_CAP_INR, 0.08)]

BRANDS = {
    "apple": "Apple", "iphone": "Apple", "ipad": "Apple", "airpods": "Apple", "macbook": "Apple",
    "samsung": "Samsung", "galaxy": "Samsung",
    "sony": "Sony", "walkman": "Sony",
    "jbl": "JBL", "bose": "Bose", "soundcore": "Soundcore", "tozo": "Tozo",
    "lg": "LG", "philips": "Philips", "panasonic": "Panasonic", "midea": "Midea",
    "dyson": "Dyson", "dreame": "Dreame", "shark": "SharkNinja",
    "hp": "HP", "dell": "Dell", "lenovo": "Lenovo", "asus": "ASUS", "acer": "Acer",
    "logitech": "Logitech", "logi": "Logitech", "anker": "Anker", "baseus": "Baseus",
    "nokia": "Nokia", "xiaomi": "Xiaomi", "redmi": "Redmi", "oneplus": "OnePlus", "motorola": "Motorola",
    "nike": "Nike", "adidas": "Adidas", "puma": "Puma", "crocs": "Crocs",
    "new balance": "New Balance", "under armour": "Under Armour", "reebok": "Reebok",
    "levi's": "Levi's", "levis": "Levi's", "ray-ban": "Ray-Ban", "rayban": "Ray-Ban",
    "casio": "Casio", "seiko": "Seiko", "citizen": "Citizen", "timex": "Timex",
    "zara": "Zara", "gucci": "Gucci", "coach": "Coach", "michael kors": "Michael Kors",
    "whirlpool": "Whirlpool", "haier": "Haier", "preet": "Preet",
    "boAt": "boAt", "boat": "boAt", "portronics": "Portronics",
    "starbucks": "Starbucks", "nestle": "Nestle", "oreo": "Oreo",
    "lego": "LEGO", "hasbro": "Hasbro", "barbie": "Barbie", "nerf": "NERF",
    "canon": "Canon", "nikon": "Nikon", "go pro": "GoPro", "gopro": "GoPro",
    "playstation": "PlayStation", "xbox": "Xbox", "nintendo": "Nintendo",
    "polaroid": "Polaroid", "yamaha": "Yamaha", "fender": "Fender",
    "trex": None,  # placeholder to keep dict non-empty guard
}
BRANDS = {k: v for k, v in BRANDS.items() if v}
from catalog_supplement import EXTRA_BRANDS, inject_supplement
from catalog_india import ADD_BRANDS, india_frame
BRANDS.update(EXTRA_BRANDS)
BRANDS.update(ADD_BRANDS)
BRANDS = {k: v for k, v in BRANDS.items() if v}
_BRAND_RE = re.compile(r"\b(" + "|".join(re.escape(b) for b in sorted(BRANDS, key=len, reverse=True)) + r")\b", re.I)
# C2: brand extraction rules.
# - Leading position (first 1-3 tokens) wins: "Apple AirPods Pro" -> Apple.
# - A brand token mid-title is a *compatibility* mention when one of the
#   previous 3 tokens says for/compatible/fits/suitable/replacement
#   ("Bands Compatible with Apple Watch" is not an Apple product).
# - Retailers (marketplaces selling private-label lines) are kept as the
#   listing's brand token but flagged brand_type="retailer" and excluded
#   from brand statistics (T5).
_BRAND_KEYS = {k.lower(): v for k, v in BRANDS.items()}
RETAILERS = {"myntra"}
COMPAT_WORDS = {"compatible", "for", "fits", "fit", "suitable", "replacement", "replacment"}
# Device-model tokens that map to their parent brand. They name the host
# device, not the seller, so on accessory rows they must not become the
# brand ("iPhone 15 Case" is not an Apple product listing).
DEVICE_KEYS = {"iphone", "ipad", "airpods", "macbook", "galaxy"}
# C3: accessory = an accessory-class word next to a host-device word
# ("iPhone 15 Case", "Watch Band", "Phone Holder"). A bag/tumbler alone
# is a product, not an accessory.
ACCESSORY_RE = re.compile(
    r"\b(case|cover|back\s?cover|face\s?cover|strap|band|bands|cable|charger|holder|stand|"
    r"mount|protector|screen\s?guard|screen\s?protector|tempered\s+glass|sticker|decal|skin|"
    r"sleeve|pouch|dock|adapter|extender|remote|grip|refill|toner|ink|blade|charms|charms|loop)\b", re.I)
HOST_RE = re.compile(
    r"\b(iPhone|iPad|MacBook|AirPods|Apple\s?Watch|Galaxy|Pixel|smartphone|phone|smart\s?watch|"
    r"watch|Kindle|laptop|laptop|TV|camera|DSLR|PS5|Xbox|Switch|earbuds|headphone|headset|"
    r"router|monitor|projector|printer|console|gaming)\b", re.I)



def _compat_context(title, start):
    pre = re.findall(r"[A-Za-z0-9][A-Za-z0-9\-'.]*", title[max(0, start - 40):start])[-3:]
    for w in pre:
        wl = w.lower()
        if wl in COMPAT_WORDS or wl.startswith("compat") or wl.startswith("replac"):
            return True
    return False


def brand_of(title):
    """-> (brand_display, brand_type) with leading position preferred."""
    t = (title or "").strip()
    if not t:
        return "", None
    toks = re.findall(r"[A-Za-z0-9][A-Za-z0-9\-'.]*", t)
    for n in (1, 2, 3):
        if len(toks) >= n:
            cand = " ".join(toks[:n]).lower()
            if cand in _BRAND_KEYS and not (toks[0].lower() in DEVICE_KEYS and is_accessory_of(t)):
                name = _BRAND_KEYS[cand]
                return name, ("retailer" if name.lower() in RETAILERS else None)
    for m in _BRAND_RE.finditer(t):
        if _compat_context(t, m.start()):
            continue
        key = m.group(1).lower()
        if key in DEVICE_KEYS and is_accessory_of(t):
            continue
        name = BRANDS[key]
        return name, ("retailer" if name.lower() in RETAILERS else None)
    return "", None


def is_accessory_of(title):
    t = title or ""
    return bool(ACCESSORY_RE.search(t) and HOST_RE.search(t))

# Flagship product classes that MUST have genuine products in the catalogue
# (weighted sampling over the top-rated Amazon pool otherwise over-indexes on
# accessories: cases, chargers, stickers). Anchors are forced in by
# swap-in/swap-out so the total stays exactly TARGET.
ANCHOR_CLASSES = [
    ("smartphone", r"(iPhone 1\d|Galaxy (S|A|Z)\d{2}|Pixel \d|smartphone|Redmi Note|OnePlus \d|Mi 1\d|Motorola Edge|Nokia G)"),
    ("laptop", r"(laptop( computer)?|chromebook|ultrabook|2-in-1|2 in 1)"),
    ("tv", r"(smart ?tv|television|qled|oled|4k tv|android tv)"),
    ("headphones", r"(headphones|headset|over-?ear)"),
    ("earbuds", r"(earbuds|true wireless|in-ear)"),
    ("camera", r"(digital camera|dslr|mirrorless|action camera|video camera)"),
    ("air fryer", r"air fryer"),
    ("blender", r"blender"),
    ("yoga mat", r"yoga mat"),
    ("dog bed", r"dog bed"),
    ("guitar", r"guitar"),
    ("dress", r"(women'?s (a line|maxi|mini|bodycon|party|summer) dress|dress for women)"),
    ("sneakers", r"(sneakers|running shoes|sneaker)"),
    ("watch", r"(smartwatch|smart watch|wristwatch|digital watch)"),
    ("perfume", r"(perfume|fragrance)"),
]
ACCESSORY_RE = re.compile(
    r"\b(case|cases|charger|charging|cable|cables|cord|cover|holder|holders|stand|"
    r"stand|strap|straps|band|bands|screen|guard|protector|sticker|stickers|mount|"
    r"adapter|adapters|skin|skins|folio|wallet|pouch|sleeve|dock|docks|cradle|"
    r"battery|batteries|lens|lens cap|tripod|film|folio|frame|ring light)\b", re.I)
ANCHOR_EXCLUDE = {
    "smartphone": r"(case|charger|holder|mount|strap|band|screen|skin|cover|grip|ring|holder)",
    "laptop": r"(charger|cable|cord|case|bag|stand|sticker|cover|adapter|docking|mat\b)",
    "tv": r"(antenna|cable|stand|mount|bracket|soundbar|remote|table|cover|protector)",
    "headphones": r"(amplifier|converter|adapter|cleaner|bag|case|cover|clip|stand|cable)",
    "earbuds": r"(case|charger|cleaner|stand|holder|adapter|tip|tips|cable)",
    "camera": r"(lens|strap|tripod|bag|case|filter|cleaner|cover|hood)",
    "air fryer": r"(liner|liners|basket|tray|oil|spray|cover|glove)",
    "blender": r"(blade|jar|pitcher|lid|gasket|seal|cleaner)",
    "yoga mat": r"(bag|tote|carrier|cover|block|strap|towel)",
    "dog bed": r"(cover|liner|remover|furniture|clothing|apparel)",
    "guitar": r"(strap|pick|picks|stand|case|bag|tuner|capo|string|strings|clip)",
    "dress": r"(hanger|spray|cover|clip|iron)",
    "sneakers": r"(insole|laces|cleaner|spray|brush|cover|guard|shoe cover)",
    "watch": r"(strap|band|case|charger|holder|screen|protective|holder)",
    "perfume": r"(bottle|glass|stopper|stopper)",
}

OCCASION_RULES = [
    ("birthday", r"birthday"),
    ("wedding", r"wedding|bridal|bachelorette|shaadi|baraat|sangeet|mandap"),
    ("anniversary", r"anniversary"),
    ("party", r"party|decoration|balloon"),
    ("valentines", r"valentine"),
    ("christmas", r"christmas|xmas|santa|noel"),
    ("diwali", r"diwali|festival of lights|rakhi"),
    ("baby-shower", r"baby shower|newborn|maternity"),
    ("graduation", r"graduation|graduate"),
    ("housewarming", r"housewarming|new home"),
    ("gift", r"gift|gifting|gift box|present(?!er)|valentine"),
]


def occasion_tags(cat, title):
    t = (title or "").lower()
    tags = []
    for tag, pat in OCCASION_RULES:
        if re.search(pat, t, re.I):
            tags.append(tag)
    if not tags and cat in ("Handmade", "Arts, Crafts & Sewing"):
        tags.append("gift")
    return tags
def load():
    frames = []
    for f in SRC:
        d = pd.read_parquet(f, columns=["parent_asin", "title", "main_category", "price",
                                        "average_rating", "rating_number"])
        frames.append(d)
    df = pd.concat(frames, ignore_index=True)
    df = df.drop_duplicates("parent_asin")
    df["price_usd"] = pd.to_numeric(df["price"], errors="coerce")
    df = df[df["price_usd"].notna() & (df["price_usd"] > 0)]
    df = df.dropna(subset=["title"])
    df = df[df["title"].str.len() > 8]
    df["price_inr"] = ((df["price_usd"] * USD_TO_INR) // 10 * 10 - 1).astype(int)
    df = df[(df["price_inr"] >= 29) & (df["price_inr"] <= PRICE_CAP_INR)]
    df = df[df["main_category"].notna() & ~df["main_category"].isin(EXCLUDE_CATS)]
    return df


def band_id(price):
    prev = 29
    for i, (cap, _) in enumerate(BANDS):
        if price <= cap:
            return i
        prev = cap + 1
    return len(BANDS) - 1


def inject_anchors(sel, df, target):
    # Force genuine flagship products into the catalogue (swap-in/swap-out).
    anchor_ids = {}
    for name, pat in ANCHOR_CLASSES:
        m = df["title"].str.contains(pat, regex=True, case=False)
        m &= ~df["title"].str.contains(ACCESSORY_RE)
        if name in ANCHOR_EXCLUDE:
            m &= ~df["title"].str.contains(ANCHOR_EXCLUDE[name], regex=True, case=False)
        pool = df[m]
        # 24 top-rated + 36 price-band-diverse (so a 43" TV at Rs 20k and a
        # 55" at Rs 45k both make the catalogue, not just the best-reviewed)
        top = pool.sort_values("rating_number", ascending=False, kind="stable").head(24)
        divers, seen = [], set(top["parent_asin"])
        for b in range(len(BANDS)):
            bp = pool[pool["band"] == b].sort_values("rating_number", ascending=False, kind="stable")
            for row in bp.head(12).itertuples():
                if row.parent_asin not in seen:
                    seen.add(row.parent_asin)
                    divers.append(row.parent_asin)
        anchor_ids[name] = list(top["parent_asin"]) + divers[:36]
    want, seen_anchor = [], set()
    for name, ids in anchor_ids.items():
        for i in ids:
            if i not in set(sel["parent_asin"]) and i not in seen_anchor:
                seen_anchor.add(i)
                want.append((name, i))
    if not want:
        return sel
    sel_idx = {i: k for k, i in enumerate(sel["parent_asin"])}
    pool_map = {i: row for i, row in zip(df["parent_asin"], df.to_dict("records"))}
    # swap out: drop non-anchor selections, least-rated first, same category+band preferred
    drop_order = sorted(
        range(len(sel)),
        key=lambda k: (
            str(sel.iloc[k]["main_category"]) != str(pool_map[want[0][1]]["main_category"]),
            -float(sel.iloc[k]["rating_number"] or 0),
        ),
    )
    keep_mask = [True] * len(sel)
    added = []
    for (name, i) in want:
        row = pool_map[i]
        # find a swap-out candidate not yet dropped, same category+band first
        swap = None
        for k in drop_order:
            if not keep_mask[k]:
                continue
            cur = sel.iloc[k]
            if str(cur["main_category"]) == str(row["main_category"]) and int(cur["band"]) == int(row["band"]):
                swap = k
                break
        if swap is None:
            for k in drop_order:
                if keep_mask[k]:
                    swap = k
                    break
        if swap is None:
            break
        keep_mask[swap] = False
        added.append(row)
    out = pd.concat([sel.iloc[[k for k in range(len(sel)) if keep_mask[k]]],
                     pd.DataFrame(added)], ignore_index=True)
    out = out.drop_duplicates("parent_asin")
    if len(out) < target:
        used = set(out["parent_asin"])
        rest = df[~df["parent_asin"].isin(used)]
        take = min(target - len(out), len(rest))
        if take:
            out = pd.concat([out, rest.sample(n=take, random_state=42)], ignore_index=True)
    print(f"anchors: {len(want)} swap-ins across {len(anchor_ids)} classes")
    return out


def main():
    df = load()
    df["band"] = df["price_inr"].map(band_id)
    # desired (cat, band) cells: category weight x band share, then waterfill
    wtot = sum(WEIGHTS.values())
    want_cat = {c: int(TARGET * w / wtot) for c, w in WEIGHTS.items()}
    cell_want, cell_pool = {}, {}
    for i, (cap, share) in enumerate(BANDS):
        for c, wc in want_cat.items():
            sub = df[(df["band"] == i) & (df["main_category"] == c)]
            cell_want[(c, i)] = int(wc * share)
            cell_pool[(c, i)] = len(sub)
    # cap cells at pool availability, then waterfill the band's remaining
    # quota into cells that still have headroom (proportional to weight)
    for i, (cap, share) in enumerate(BANDS):
        band_quota = int(TARGET * share)
        cats = list(WEIGHTS)
        eff = {c: min(cell_want[(c, i)], cell_pool[(c, i)]) for c in cats}
        for _ in range(60):
            deficit = band_quota - sum(eff.values())
            if deficit <= 0:
                break
            donors = [c for c in cats if eff[c] < cell_pool[(c, i)]]
            if not donors:
                break
            dw = sum(WEIGHTS[c] for c in donors)
            moved = 0
            for c in donors:
                space = cell_pool[(c, i)] - eff[c]
                give = min(space, int(deficit * WEIGHTS[c] / dw))
                eff[c] += give
                moved += give
            if moved == 0:
                c = max(donors, key=lambda c: cell_pool[(c, i)] - eff[c])
                eff[c] += 1
        for c in cats:
            cell_want[(c, i)] = eff[c]
    # sample each cell deterministically
    sel_parts = []
    used = set()
    for (c, i), want in cell_want.items():
        sub = df[(df["band"] == i) & (df["main_category"] == c)]
        take = min(want, len(sub))
        if take:
            part = sub.sample(n=take, random_state=42)
            sel_parts.append(part)
            used.update(part["parent_asin"])
    sel = pd.concat(sel_parts, ignore_index=True)
    # backfill any residual gap from the whole pool (stratified-ish: weighted random)
    if len(sel) < TARGET:
        rest = df[~df["parent_asin"].isin(used)]
        take = min(TARGET - len(sel), len(rest))
        if take:
            sel = pd.concat([sel, rest.sample(n=take, random_state=42)], ignore_index=True)
    sel = sel.drop_duplicates("parent_asin")
    sel = inject_anchors(sel, df, TARGET)
    sel = inject_supplement(sel, df, TARGET, band_id)
    india = india_frame(band_id)
    sel = pd.concat([sel, india], ignore_index=True).drop_duplicates("parent_asin")
    # Data-quality: drop "fake flagship clone" phone listings - titles that
    # claim an unlocked S22/iPhone flagship with a sub-4GB RAM spec
    # ("S22 Ultra 2+16GB") do not exist as real Indian-market listings.
    fake_clone = sel.title.str.contains(
        r"unlocked\s+smartphone.*\b[0-3]\+\d+\s*gb", case=False, na=False)
    if fake_clone.any():
        print("dropped fake-clone listings:", int(fake_clone.sum()))
        sel = sel[~fake_clone]
    print("selected (US pool + India layer):", len(sel))

    items = []
    for i, r in enumerate(sel.itertuples()):
        brand_name, brand_type = brand_of(str(r.title))
        item = {
            "sku": f"AC-{i+1:05d}",
            "title": str(r.title).strip()[:200],
            "category": str(r.main_category).strip(),
            "brand": brand_name,
            "price": int(r.price_inr),
            "rating": round(float(r.average_rating), 2) if pd.notna(r.average_rating) else 0.0,
            "num_ratings": int(r.rating_number) if pd.notna(r.rating_number) else 0,
            "tags": occasion_tags(str(r.main_category), str(r.title)),
        }
        # C1: origin of the SKU (T7: ~25k US-sourced converted + ~11k India layer)
        item["origin"] = "india_layer" if str(getattr(r, "parent_asin", "")).startswith("IND-") else "us_converted"
        # C2: brand_type present only for retailers (e.g. Myntra private label)
        if brand_type:
            item["brand_type"] = brand_type
        # C3: accessory listings (cases/bands/chargers for a host device)
        if is_accessory_of(item["title"]):
            item["is_accessory"] = True
        # S7: India listing-matrix rows carry family_id/variant (NaN for US rows)
        if pd.notna(getattr(r, "family_id", None)):
            item["family_id"] = r.family_id
        if pd.notna(getattr(r, "variant", None)):
            item["variant"] = r.variant
        items.append(item)
    # S7: per-family summary (colour/size counts + min price) over the FINAL
    # members, so the UI can render one card per variant family.
    fam_members = {}
    for x in items:
        if x.get("family_id"):
            fam_members.setdefault(x["family_id"], []).append(x)
    for fam, members in fam_members.items():
        if len(members) < 2:
            continue
        summary = family_summary(members)
        if not summary:
            continue
        mn = min(x["price"] for x in members)
        for x in members:
            x["variant_summary"] = summary
            x["family_min_price"] = mn
    n_fam = sum(1 for x in items if x.get("variant_summary"))
    print(f"variant families: {len(fam_members)} (with summary: {sum(1 for m in fam_members.values() if len(m) > 1)}, "
          f"SKUs with summary: {n_fam})")
    print("final:", len(items))
    # Stable SKU assignment: SKU identity must never shift when rows are
    # added (eval panels freeze SKU facts; ?sku= links and analytics must
    # survive rebuilds). Items present in the previous catalog.json keep
    # their SKU and relative order; new items append at the end in
    # deterministic order. Without this, the india_frame band-quota trim
    # re-sorts and renumbers thousands of SKUs on every catalogue change.
    from collections import Counter
    skey = lambda x: (x["title"], x.get("brand"), x["price"], x["category"])
    if OUT_JSON.exists():
        prev_items = json.loads(OUT_JSON.read_text())
        new_counts = Counter(skey(x) for x in items)
        leftover = Counter(new_counts)
        kept = []
        for old in prev_items:
            k = skey(old)
            if leftover.get(k, 0) > 0:
                leftover[k] -= 1
                kept.append(old)
        fresh = []
        for x in items:
            if leftover.get(skey(x), 0) > 0:
                leftover[skey(x)] -= 1
                fresh.append(x)
        fresh.sort(key=lambda x: (x["category"], x["title"], x.get("brand") or ""))
        max_n = max((int(x["sku"].split("-")[1]) for x in kept if x["sku"].startswith("AC-")), default=0)
        for i, x in enumerate(fresh, 1):
            x["sku"] = "AC-%05d" % (max_n + i)
        items = kept + fresh
        print("stable sku: kept %d (ids preserved), appended %d new" % (len(kept), len(fresh)))
    else:
        for i, x in enumerate(items, 1):
            x["sku"] = "AC-%05d" % i
    print(pd.Series([x["category"] for x in items]).value_counts().to_string()[:700])
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_PQ.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(items, ensure_ascii=False))
    pd.DataFrame(items).to_parquet(OUT_PQ, index=False)
    print("wrote", OUT_JSON, OUT_PQ)
    prices = sorted(x["price"] for x in items)
    n = len(prices)
    print("price p10/p50/p90/p99:", prices[n//10], prices[n//2], prices[9*n//10], prices[99*n//100])
    print("bands:", {lab: sum(1 for x in items if lo <= x["price"] <= hi)
                     for lab, (lo, hi) in zip(["<=2k", "2-5k", "5-10k", "10-20k", ">20k"],
                                              [(0, 2000), (2000, 5000), (5000, 10000), (10000, 20000), (20000, 10**9)])})
    print("branded:", sum(1 for x in items if x["brand"]), f"({sum(1 for x in items if x['brand'])/n:.1%})")
    tagged = sum(1 for x in items if x["tags"])
    print(f"occasion-tagged: {tagged} ({tagged/n:.1%})")


if __name__ == "__main__":
    main()
