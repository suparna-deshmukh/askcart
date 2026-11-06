"""
AskCart catalogue v5 - expansion layer (2026-11-06, "expand by a huge margin").

Design: a SEPARATE, untrimmed frame (never re-trims the India layer, so no
existing SKU can be dropped - the frozen eval panels and golden sets keep
their SKUs). Same row contract as catalog_india.py:
  (brand, model, category, base_price, spread, rating, num_ratings, variants)
variant i price = base + spread * i/(n-1) rounded x9; rating jitter +/-0.1
(family-consistent, seed 42 style md5); num_ratings jitter x0.75-1.25.

Focus: (a) listing-matrix depth in the weak/under-represented categories
(toys, baby, musical instruments, luggage, video games, car electronics,
home audio, collectibles), (b) more brand x model x variant breadth in
fashion (the 46.7% category) with REAL variant dimensions (colour x size)
so size/for-whom/brand questions have data to answer with, (c) appliance
capacity grids (AC tonnage, washing-machine kg, fridge litres) so the
appliance spec questions have options.

Brand pools: real Indian-market brands not already in the base/India
layers plus a small number of house-label names (consistent with the demo
layer's existing house labels - the catalogue is labelled demo in the UI).
Every brand used here is registered in EXPAND_BRANDS so brand_of()
resolves the leading token deterministically. Title collisions with any
existing SKU are skipped (deterministic), so rebuilds stay stable.
"""
import hashlib

import pandas as pd

from catalog_india import _title, _x9, _h

# ---- brand recognizers (key = leading token(s) lowercase) ----
EXPAND_BRANDS = {
    # women ethnic / western
    "zariin": "Zariin", "pepe jeans": "Pepe Jeans", "vero moda": "Vero Moda",
    "only biologicals": "Only Biologicals", "high road": "High Road",
    "roxy": "Roxy", "jini": "Jini", "azzam": "Azzam", "fabindia": "FabIndia",
    "aurelia x": "Aurelia X", "nivaaya": "Nivaaya", "khaadi": "Khaadi",
    "urban tree": "Urban Tree", "mehra house": "Mehra House",
    "lakshmi weaves": "Lakshmi Weaves", "sona silks": "Sona Silks",
    "bella moda": "Bella Moda", "style kade": "Style Kade",
    # men western / ethnic
    "roadies": "Roadies", "urban veda": "Urban Veda", "veda weaves": "Veda Weaves",
    # footwear
    "paragon": "Paragon", "sparx": "Sparx", "camps": "Camp's", "camp": "Camp",
    # bags / luggage / watches / jewellery
    "samsonite": "Samsonite",
    "bering": "Bering", "zeno": "Zeno", "tanishq": "Tanishq", "melorra": "Melorra",
    # home / furniture / decor
    "sujata": "Sujata", "bilcare": "Bilcare", "deyu": "Deyu",
    "home kite": "Home Kite",
    # baby / kids
    "mamypongo": "MamyPoko", "mampoko": "MamyPoko", "huggies": "Huggies",
    "pampers": "Pampers", "cute twins": "Cute Twins",
    "bella baby": "Bella Baby", "chhota chotu": "Chhota Chotu",
    # kitchen
    "vikram": "Vikram", "balaji": "Balaji", "kans": "Kans",
    "steelcraft": "Steelcraft",
    # electronics / computers
    "lenovo": "Lenovo", "asus": "Asus", "acer": "Acer", "micromax": "Micromax",
    "intex": "Intex", "zebronics": "Zebronics", "iball": "iBall",
    "tcl": "TCL",
    # toys
    "barbie": "Barbie", "milton bradley": "Milton Bradley",
    # sports
    "cint": "Cint", "baton": "Baton",
    # music
    "fender": "Fender", "gibson": "Gibson", "yamaha": "Yamaha",
    "roland": "Roland", "korg": "Korg",
    # beauty / health
    "sunsilk": "Sunsilk", "clinic plus": "Clinic Plus",
    "omron": "Omron", "bpl": "BPL", "morepen": "Dr. Morepen",
    # festival / food gifting
    "roshanara": "Roshanara", "haldiram's": "Haldiram's", "haldirams": "Haldiram's",
    "bikanerwala": "Bikanerwala", "khandwala": "Khandwala", "mtr": "MTR", "mdh": "MDH",
    # office
    "avery": "Avery", "dennis": "Dennis",
    # pet
    "pedigree": "Pedigree", "9lives": "9Lives", "kippy": "Kippy",
    # video games
    "playstation": "PlayStation", "xbox": "Xbox", "nintendo": "Nintendo",
    "steelseries": "SteelSeries",
    # automotive
    "mrf": "MRF", "ceat": "CEAT", "jk tyre": "JK Tyre",
    "sonax": "Sonax",
    # home audio
    "sanwa": "Sanwa",
    # collectibles
    "mega blocs": "Mega Bloks", "american carrom": "American Carrom",
}

# ---- variant pools ----
COLORS8 = ["Maroon", "Royal Blue", "Green", "Pink", "Gold", "Purple", "Teal", "Red"]
COLORS6 = ["Maroon", "Blue", "Green", "Pink", "Gold", "Red"]
COLORS5 = ["Blue", "Green", "Red", "Pink", "Beige"]
COLORS4 = ["Black", "White", "Blue", "Beige"]
COLORS3 = ["Black", "White", "Navy"]
SIZES5 = ["S", "M", "L", "XL", "XXL"]
SIZES4 = ["S", "M", "L", "XL"]
SIZES3 = ["M", "L", "XL"]
SIZES_MEN = ["S/M", "L/XL", "XXL"]
SHOE_SIZES = ["UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11"]
SHOE_SIZES_F = ["UK 3", "UK 4", "UK 5", "UK 6", "UK 7"]

def _cart(*pools):
    out = [""]
    for pool in pools:
        out = [f"{a} {b}".strip() for a in out for b in pool]
    return out

ROWS = []

def _fam(brand, model, cat, lo, hi, rating, nrat, variants):
    ROWS.append((brand, model, cat, lo, hi - lo, rating, nrat, variants))

# ================= WOMEN ETHNIC (AMAZON FASHION) =================
WOMEN_BRANDS = ["Zariin", "FabIndia", "Vero Moda", "High Road", "Azzam",
                "Only Biologicals", "Roxy", "Jini", "Pepe Jeans", "Aurelia X",
                "Nivaaya", "Khaadi", "Urban Tree", "Mehra House",
                "Lakshmi Weaves", "Sona Silks"]
for b in WOMEN_BRANDS:
    _fam(b, "Floral Kurti", "AMAZON FASHION", 499, 1499, 4.2, 11800, _cart(COLORS6, SIZES5))
    _fam(b, "Angrakha Dress", "AMAZON FASHION", 999, 2999, 4.3, 7400, _cart(COLORS4, SIZES5))
    _fam(b, "Kurti Set with Trousers", "AMAZON FASHION", 899, 2499, 4.2, 9600, _cart(COLORS5, SIZES5))
    _fam(b, "Ethnic Co-ord Set", "AMAZON FASHION", 1099, 3499, 4.3, 6200, _cart(COLORS4, SIZES5))
    _fam(b, "Chikankari Kurti", "AMAZON FASHION", 999, 2599, 4.3, 8800, _cart(COLORS4, SIZES5))
    _fam(b, "Anarkali Dress", "AMAZON FASHION", 1299, 3999, 4.3, 5800, _cart(COLORS4, SIZES5))
    _fam(b, "Linen Kurti", "AMAZON FASHION", 699, 1999, 4.2, 9400, _cart(COLORS5, SIZES5))
    _fam(b, "Georgette Kurti", "AMAZON FASHION", 799, 2299, 4.2, 8200, _cart(COLORS4, SIZES5))
    _fam(b, "Mirror Work Kurti", "AMAZON FASHION", 1199, 3499, 4.3, 5600, _cart(COLORS4, SIZES5))
    _fam(b, "Ethnic Top and Trouser Set", "AMAZON FASHION", 1099, 3699, 4.3, 6400, _cart(COLORS5, SIZES5))
    _fam(b, "Cotton Saree with Blouse", "AMAZON FASHION", 999, 3499, 4.2, 9200, COLORS6)
    _fam(b, "Georgette Saree", "AMAZON FASHION", 1099, 3999, 4.3, 7800, COLORS8)
    _fam(b, "Bandhani Saree", "AMAZON FASHION", 1199, 4299, 4.3, 6400, COLORS6)
    _fam(b, "Pochampally Saree", "AMAZON FASHION", 1499, 5999, 4.4, 4200, COLORS6)
    _fam(b, "Printed Anarkali", "AMAZON FASHION", 1199, 3799, 4.3, 5400, _cart(COLORS5, SIZES5))
    _fam(b, "Ethnic Top and Legging Set", "AMAZON FASHION", 799, 2499, 4.2, 10800, _cart(COLORS5, SIZES4))
    _fam(b, "Georgette Anarkali", "AMAZON FASHION", 1399, 4299, 4.3, 4800, _cart(COLORS4, SIZES5))
    _fam(b, "Kurti with Leggings", "AMAZON FASHION", 899, 2599, 4.2, 9800, _cart(COLORS5, SIZES4))

# ================= WOMEN WESTERN (AMAZON FASHION) =================
WOMEN_W = ["Roxy", "Jini", "Pepe Jeans", "Only Biologicals", "Vero Moda",
           "Zariin", "High Road", "Nivaaya", "Aurelia X", "Urban Tree",
           "Bella Moda", "Style Kade", "Mehra House", "Khaadi", "Azzam", "Roxy"]
for b in WOMEN_W:
    _fam(b, "Top and Bottom Set", "AMAZON FASHION", 899, 2999, 4.2, 12600, COLORS6)
    _fam(b, "Co-ord Pant Set", "AMAZON FASHION", 999, 3299, 4.2, 10800, COLORS5)
    _fam(b, "Maxi Dress with Dupatta", "AMAZON FASHION", 999, 3499, 4.2, 7600, COLORS5)
    _fam(b, "Skirt Set for Women", "AMAZON FASHION", 799, 2499, 4.2, 9400, _cart(COLORS4, SIZES5))
    _fam(b, "Blazer for Women", "AMAZON FASHION", 1499, 4999, 4.3, 5200, _cart(COLORS3, SIZES5))
    _fam(b, "Saree Blouse", "AMAZON FASHION", 499, 1999, 4.2, 14800, _cart(COLORS6, SIZES5))
    _fam(b, "Pants for Women", "AMAZON FASHION", 799, 2599, 4.2, 11200, _cart(COLORS4, SIZES5))
    _fam(b, "Ruffle Blouse for Women", "AMAZON FASHION", 699, 2199, 4.2, 8600, _cart(COLORS5, SIZES5))
    _fam(b, "Crop Top and Legging Set", "AMAZON FASHION", 599, 1999, 4.2, 13400, _cart(COLORS4, SIZES5))
    _fam(b, "A-Line Dress for Women", "AMAZON FASHION", 899, 3299, 4.2, 9200, COLORS5)
    _fam(b, "Shirt Dress for Women", "AMAZON FASHION", 999, 3499, 4.2, 7200, _cart(COLORS3, SIZES4))
    _fam(b, "Jumpsuit for Women", "AMAZON FASHION", 1099, 3999, 4.2, 6400, _cart(COLORS3, SIZES4))
    _fam(b, "Pleated Skirt for Women", "AMAZON FASHION", 799, 2799, 4.2, 8400, _cart(COLORS4, SIZES3))
    _fam(b, "Cotton Top for Women", "AMAZON FASHION", 599, 1999, 4.2, 13600, _cart(COLORS5, SIZES4))

# ================= MEN ETHNIC (AMAZON FASHION) =================
MEN_E = ["Zariin", "FabIndia", "Azzam", "High Road", "Nivaaya", "Khaadi",
         "Mehra House", "Sona Silks", "Urban Veda", "Veda Weaves",
         "Lakshmi Weaves", "Pepe Jeans"]
for b in MEN_E:
    _fam(b, "Slim Fit Kurta for Men", "AMAZON FASHION", 599, 2199, 4.2, 10400, _cart(COLORS5, SIZES_MEN))
    _fam(b, "Rayon Kurta for Men", "AMAZON FASHION", 699, 2499, 4.2, 9200, _cart(COLORS4, SIZES_MEN))
    _fam(b, "Chikankari Kurta for Men", "AMAZON FASHION", 999, 3299, 4.3, 6800, _cart(COLORS3, SIZES_MEN))
    _fam(b, "Casual Kurta for Men", "AMAZON FASHION", 549, 1899, 4.2, 11600, _cart(COLORS4, SIZES_MEN))
    _fam(b, "Linen Kurta for Men", "AMAZON FASHION", 799, 2999, 4.2, 8400, _cart(COLORS4, SIZES_MEN))
    _fam(b, "Sherwani for Men", "AMAZON FASHION", 4999, 21999, 4.5, 1600, COLORS3)
    _fam(b, "Bandhgala for Men", "AMAZON FASHION", 3999, 15999, 4.5, 2100, COLORS3)
    _fam(b, "Kurta Set with Nehru Jacket", "AMAZON FASHION", 2999, 9999, 4.4, 3400, _cart(COLORS3, SIZES_MEN))

# ================= MEN WESTERN (AMAZON FASHION) =================
MEN_W = ["Pepe Jeans", "Roadies", "Vero Moda", "High Road", "Only Biologicals",
         "Zariin", "Urban Tree", "Style Kade", "Bella Moda", "Aurelia X",
         "Nivaaya", "Sparx", "Camp's", "Paragon", "Jini", "Azzam"]
for b in MEN_W:
    _fam(b, "Slim Fit Shirt for Men", "AMAZON FASHION", 699, 2499, 4.2, 13400, _cart(COLORS3, SIZES5))
    _fam(b, "Checkered Shirt for Men", "AMAZON FASHION", 799, 2799, 4.2, 11200, _cart(COLORS3, SIZES5))
    _fam(b, "Denim Jacket for Men", "AMAZON FASHION", 1499, 4999, 4.2, 6400, _cart(COLORS4, SIZES5))
    _fam(b, "Track Pants for Men", "AMAZON FASHION", 599, 1999, 4.2, 12800, _cart(COLORS4, SIZES5))
    _fam(b, "Sports Jersey for Men", "AMAZON FASHION", 499, 1599, 4.2, 14600, _cart(COLORS4, SIZES5))
    _fam(b, "Formal Shirt and Pant Set", "AMAZON FASHION", 1999, 5999, 4.3, 4800, _cart(COLORS3, SIZES5))
    _fam(b, "Cotton T-Shirt for Men 2 Pack", "AMAZON FASHION", 599, 1699, 4.2, 16400, _cart(COLORS4, SIZES5))
    _fam(b, "Casual Shirt for Men", "AMAZON FASHION", 649, 2299, 4.2, 12600, _cart(COLORS3, SIZES5))
    _fam(b, "Flannel Shirt for Men", "AMAZON FASHION", 899, 3299, 4.2, 9800, _cart(COLORS3, SIZES5))
    _fam(b, "Jeans for Men", "AMAZON FASHION", 999, 3999, 4.2, 15800, _cart(["Light Blue", "Dark Blue", "Black"], ["30", "32", "34", "36"]))
    _fam(b, "Slim Fit Jeans for Men", "AMAZON FASHION", 1199, 4299, 4.2, 13400, _cart(["Light Blue", "Dark Blue", "Black"], ["30", "32", "34"]))
    _fam(b, "Chino Pants for Men", "AMAZON FASHION", 899, 3299, 4.2, 11800, _cart(["Beige", "Khaki", "Navy"], SIZES4))
    _fam(b, "Hoodie for Men", "AMAZON FASHION", 999, 3999, 4.2, 12600, _cart(COLORS3, SIZES4))
    _fam(b, "Joggers for Men", "AMAZON FASHION", 699, 2599, 4.2, 14400, _cart(COLORS3, SIZES4))

# ================= FOOTWEAR =================
SHOE_BRANDS_M = ["Paragon", "Sparx", "Camp's", "Pepe Jeans", "Roadies",
                 "Camp", "Urban Tree", "Bella Moda"]
for b in SHOE_BRANDS_M:
    _fam(b, "Sports Sneakers for Men", "AMAZON FASHION", 1299, 4999, 4.2, 9800, _cart(["Black", "White", "Grey", "Navy"], SHOE_SIZES))
    _fam(b, "Formal Shoes for Men", "AMAZON FASHION", 1599, 5999, 4.2, 7200, _cart(["Black", "Brown"], ["UK 6", "UK 7", "UK 8", "UK 9", "UK 10"]))
    _fam(b, "Casual Sneakers for Men", "AMAZON FASHION", 999, 3999, 4.2, 11400, _cart(["Black", "White", "Grey"], ["UK 7", "UK 8", "UK 9", "UK 10"]))
    _fam(b, "Sports Sandals for Men", "AMAZON FASHION", 699, 2499, 4.2, 13800, _cart(["Black", "Blue"], ["UK 6", "UK 7", "UK 8", "UK 9", "UK 10"]))
    _fam(b, "Running Shoes for Men", "AMAZON FASHION", 1799, 6999, 4.3, 5600, _cart(["Black", "White", "Red"], SHOE_SIZES))
    _fam(b, "Loafers for Men", "AMAZON FASHION", 1299, 4999, 4.2, 8400, _cart(["Black", "Brown"], ["UK 6", "UK 7", "UK 8", "UK 9"]))
    _fam(b, "Walking Shoes for Men", "AMAZON FASHION", 1499, 5999, 4.2, 7400, _cart(["Black", "Grey"], SHOE_SIZES))
    _fam(b, "Flip Flops for Men", "AMAZON FASHION", 499, 1999, 4.2, 15800, _cart(["Black", "Brown"], ["UK 6", "UK 7", "UK 8", "UK 9"]))
SHOE_BRANDS_F = ["Paragon", "Sparx", "Camp's", "Roxy", "High Road",
                 "Aurelia X", "Nivaaya", "Bella Moda"]
for b in SHOE_BRANDS_F:
    _fam(b, "Flats for Women", "AMAZON FASHION", 899, 3499, 4.2, 8400, _cart(["Black", "White", "Pink", "Beige"], SHOE_SIZES_F))
    _fam(b, "Block Heels for Women", "AMAZON FASHION", 1099, 4499, 4.2, 6800, _cart(["Black", "Nude", "Red"], SHOE_SIZES_F[:4]))
    _fam(b, "Sports Sandals for Women", "AMAZON FASHION", 599, 2299, 4.2, 12200, _cart(["Black", "White"], SHOE_SIZES_F))
    _fam(b, "Loafers for Women", "AMAZON FASHION", 999, 3699, 4.2, 7600, _cart(["Black", "Brown"], SHOE_SIZES_F[:4]))
    _fam(b, "Canvas Shoes for Women", "AMAZON FASHION", 799, 2799, 4.2, 10600, _cart(["White", "Black"], SHOE_SIZES_F))
    _fam(b, "Ethnic Juttis for Women", "AMAZON FASHION", 799, 3299, 4.2, 9400, _cart(["Maroon", "Blue", "Gold", "Green"], SHOE_SIZES_F[:4]))

# ================= BAGS / LUGGAGE / WATCHES / JEWELLERY =================
BAG_BRANDS = ["Samsonite", "Roxy", "Zariin", "Pepe Jeans", "Urban Tree"]
for b in BAG_BRANDS:
    _fam(b, "Handbag for Women", "AMAZON FASHION", 799, 3999, 4.2, 9800, COLORS5)
    _fam(b, "Laptop Bag for Men", "AMAZON FASHION", 699, 2999, 4.2, 11600, COLORS3)
    _fam(b, "Backpack for Men", "AMAZON FASHION", 899, 3999, 4.2, 10400, COLORS4)
    _fam(b, "Wallet for Men", "AMAZON FASHION", 499, 2499, 4.2, 12800, ["Black", "Brown", "Navy"])
    _fam(b, "Sling Bag for Men", "AMAZON FASHION", 599, 2799, 4.2, 8800, COLORS4)
    _fam(b, "Messenger Bag", "AMAZON FASHION", 999, 4999, 4.2, 7400, ["Black", "Brown", "Olive"])
LUG_BRANDS = ["Samsonite", "Pepe Jeans", "Roadies"]
for b in LUG_BRANDS:
    _fam(b, "Cabin Trolley 20 inch", "Luggage & Travel", 2999, 8999, 4.3, 8600, ["Black", "Grey", "Blue", "Pink"])
    _fam(b, "Check-in Trolley 25 inch", "Luggage & Travel", 3999, 12999, 4.3, 6400, ["Black", "Grey", "Blue"])
    _fam(b, "Travel Backpack 40 L", "Luggage & Travel", 1499, 4999, 4.2, 9400, ["Black", "Blue", "Grey"])
    _fam(b, "Duffel Bag 30 L", "Luggage & Travel", 999, 3999, 4.2, 7800, ["Black", "Olive", "Blue"])
WATCH_BRANDS = ["Bering", "Zeno"]
for b in WATCH_BRANDS:
    _fam(b, "Analog Wristwatch for Men", "AMAZON FASHION", 1499, 6999, 4.3, 7400, ["Black Strap", "Steel Strap", "Brown Strap", "Navy Strap"])
    _fam(b, "Analog Wristwatch for Women", "AMAZON FASHION", 1299, 5999, 4.3, 8200, ["Gold Strap", "Silver Strap", "Pink Strap", "Black Strap"])
    _fam(b, "Digital Wristwatch for Kids", "AMAZON FASHION", 799, 2999, 4.2, 9800, ["Blue", "Red", "Black"])
JEWEL_BRANDS = ["Tanishq", "Melorra", "Sona Silks"]
for b in JEWEL_BRANDS:
    _fam(b, "Glass Bangle Set 6 pcs", "AMAZON FASHION", 399, 1999, 4.2, 12400, ["Red", "Green", "Gold", "Blue"])
    _fam(b, "Kundan Necklace Set", "AMAZON FASHION", 999, 4999, 4.3, 5400, ["Gold", "Silver", "Rose Gold"])
    _fam(b, "Temple Jewellery Set", "AMAZON FASHION", 1999, 9999, 4.4, 2800, ["Gold", "Antique Gold"])

# ================= BABY & KIDS =================
BABY_BRANDS = ["MamyPoko", "Huggies", "Pampers", "Cute Twins",
               "Bella Baby", "Chhota Chotu", "MamyPoko"]
for b in BABY_BRANDS:
    _fam(b, "Baby Romper Pack of 3", "Baby", 799, 2499, 4.3, 9400, ["0-3 Months", "3-6 Months", "6-12 Months", "1-2 Years"])
    _fam(b, "Kids T-Shirt", "Baby", 349, 1199, 4.2, 12800, _cart(COLORS4, ["2-3 Y", "4-5 Y", "6-7 Y", "8-9 Y"]))
    _fam(b, "Kids Nightwear Set", "Baby", 499, 1699, 4.2, 10600, _cart(COLORS3, ["2-3 Y", "4-5 Y", "6-7 Y"]))
    _fam(b, "School Bag for Kids", "Baby", 699, 2999, 4.3, 11800, ["Blue", "Red", "Black"])
    _fam(b, "Baby Shoes", "Baby", 499, 1799, 4.2, 8600, ["UK 9", "UK 10", "UK 11", "UK 12"])
    _fam(b, "Kids School Shoes", "Baby", 899, 3499, 4.2, 9200, _cart(["Black", "White"], ["UK 3", "UK 4", "UK 5", "UK 6"]))
    _fam(b, "Diapers M Pack", "Baby", 899, 3499, 4.4, 18400, ["24 pcs", "40 pcs", "56 pcs", "64 pcs"])
    _fam(b, "Kids Kurta for Boys", "Baby", 499, 1999, 4.2, 8400, _cart(COLORS4, ["2-3 Y", "4-5 Y", "6-7 Y"]))

# ================= HOME & LIVING (Amazon Home) =================
HOME_BRANDS = ["Sujata", "Bilcare", "Deyu", "Home Kite"]
for b in HOME_BRANDS:
    _fam(b, "Double Bedsheet with 2 Pillow Covers", "Amazon Home", 799, 3999, 4.2, 10800, ["Queen", "King", "Super King"])
    _fam(b, "Duvet Cover Set", "Amazon Home", 999, 4999, 4.2, 7800, ["Queen", "King", "Super King"])
    _fam(b, "Cushion Cover Pack of 2", "Amazon Home", 399, 1699, 4.2, 12600, COLORS5)
    _fam(b, "Storage Cabinet with Drawers", "Amazon Home", 2999, 12999, 4.2, 4600, ["2 Drawer", "3 Drawer", "4 Drawer"])
    _fam(b, "Steel Almirah 2 Door", "Amazon Home", 9999, 29999, 4.2, 3400, ["2 Door", "2 Door + Mirror", "3 Door"])
    _fam(b, "Wardrobe 3 Door", "Amazon Home", 14999, 49999, 4.3, 1800, ["3 Door", "4 Door"])
    _fam(b, "LED Table Lamp", "Amazon Home", 499, 2999, 4.2, 8800, ["Warm White", "Cool White", "RGB", "Touch"])
    _fam(b, "LED Fairy Light String 10 m", "Amazon Home", 299, 1499, 4.2, 13400, ["Warm White", "Cool White", "Multi Color"])
    _fam(b, "Mattress Queen Size", "Amazon Home", 4999, 19999, 4.2, 5400, ["Orthopedic", "Memory Foam", "Spring"])
HOME2_BRANDS = ["Bilcare", "Sujata", "Deyu", "Home Kite"]
for b in HOME2_BRANDS:
    _fam(b, "Mop with Bucket", "Amazon Home", 599, 2499, 4.2, 14600, ["Microfiber", "String", "Spin"])
    _fam(b, "Storage Bin with Lid 20 L", "Amazon Home", 399, 1699, 4.2, 12200, ["Blue", "Grey", "Transparent"])
    _fam(b, "Chopping Board", "Amazon Home", 249, 1299, 4.3, 15800, ["Bamboo", "Plastic", "Steel"])
    _fam(b, "Steel Dinner Set 24 pcs", "Amazon Home", 1499, 5999, 4.3, 8400, ["24 pcs", "32 pcs", "48 pcs"])
    _fam(b, "Glass Tumbler Set 12 pcs", "Amazon Home", 499, 2499, 4.3, 9600, ["Clear", "Smoked"])
    _fam(b, "Curtain for Living Room", "Amazon Home", 799, 3999, 4.2, 7400, ["Beige", "Grey", "Maroon", "Blue"])
    _fam(b, "Wall Clock Silent", "Amazon Home", 599, 2999, 4.2, 8800, ["Square Black", "Round White", "Square Brown", "Round Gold"])
    _fam(b, "Photo Frame 8 inch", "Amazon Home", 399, 1999, 4.2, 9400, ["Black", "Gold", "Silver"])
    _fam(b, "Sofa Cover 3 Seater", "Amazon Home", 999, 4999, 4.2, 6400, ["Grey", "Beige", "Maroon"])

# ================= KITCHEN (Appliances) =================
KITCHEN_BRANDS = ["Vikram", "Balaji", "Kans", "Bilcare", "Steelcraft"]
for b in KITCHEN_BRANDS:
    _fam(b, "Biryani Handi Clay 8 L", "Appliances", 1499, 3999, 4.3, 5400, ["6 L", "8 L", "10 L"])
    _fam(b, "Dosa Tawa Nonstick 26 cm", "Appliances", 699, 2499, 4.3, 11800, ["24 cm", "26 cm", "28 cm"])
    _fam(b, "Idli Stand 8 Idli", "Appliances", 899, 2999, 4.3, 8400, ["6 Idli", "8 Idli", "12 Idli"])
    _fam(b, "Chafing Dish Set", "Appliances", 1299, 4999, 4.2, 3800, ["1 pc", "2 pcs", "3 pcs"])
    _fam(b, "Mixer Grinder 750 W with 3 Jars", "Appliances", 2999, 6999, 4.3, 7600, ["750 W", "800 W"])
    _fam(b, "Juicer Mixer 600 W", "Appliances", 2499, 5999, 4.2, 6800, ["600 W", "700 W"])
    _fam(b, "Steel Bottle with Cap", "Appliances", 249, 1299, 4.3, 24600, ["750 ml", "1 L", "1.5 L"])
    _fam(b, "Water Bottle 1 L", "Appliances", 199, 999, 4.3, 19800, ["750 ml", "1 L", "1.5 L"])

# ================= BIG APPLIANCES (Appliances) =================
AC_BRANDS = ["Voltas", "Daikin", "Blue Star", "LG", "Samsung"]
for b in AC_BRANDS:
    _fam(b, "5 Star Inverter Split AC 1.5 Ton", "Appliances", 32999, 59999, 4.4, 8400, ["1 Ton", "1.5 Ton", "2 Ton"])
    _fam(b, "4 Star Split AC 1 Ton", "Appliances", 27999, 44999, 4.3, 6200, ["1 Ton", "1.5 Ton"])
FRI_WASH = ["LG", "Samsung", "Whirlpool", "Haier"]
for b in FRI_WASH:
    _fam(b, "Direct Cool Fridge 263 L", "Appliances", 21999, 39999, 4.4, 5400, ["226 L", "263 L", "307 L"])
    _fam(b, "Top Load Washing Machine", "Appliances", 14999, 32999, 4.4, 7800, ["6 kg", "7 kg", "8 kg"])
    _fam(b, "Front Load Washing Machine", "Appliances", 24999, 54999, 4.4, 4600, ["6.5 kg", "7 kg", "8 kg", "9 kg"])
    _fam(b, "Instant Water Heater 15 L", "Appliances", 6999, 16999, 4.3, 5800, ["10 L", "15 L", "25 L"])

# ================= ELECTRONICS (All Electronics / Computers) =================
ELEC_BRANDS = ["boAt", "JBL", "Sony", "Sanwa", "Zebronics", "iBall", "Micromax"]
for b in ELEC_BRANDS:
    _fam(b, "Bluetooth Speaker", "All Electronics", 999, 6999, 4.2, 12600, ["10 W", "20 W", "40 W"])
    _fam(b, "Wireless Earbuds", "All Electronics", 999, 7999, 4.2, 18400, ["White", "Black", "Blue"])
    _fam(b, "Smartwatch", "All Electronics", 1499, 12999, 4.2, 15400, ["Black", "Brown", "Gold"])
    _fam(b, "Power Bank 20000 mAh", "All Electronics", 1499, 5999, 4.3, 14200, ["10000 mAh", "20000 mAh", "25000 mAh"])
    _fam(b, "Soundbar 5.1", "Home Audio & Theater", 7999, 29999, 4.3, 4200, ["5.1", "2.1", "7.1.4"])
    _fam(b, "Portable Speaker 20 W", "Home Audio & Theater", 2999, 12999, 4.2, 6800, ["10 W", "20 W", "30 W"])
    _fam(b, "Studio Headphones", "Home Audio & Theater", 2999, 19999, 4.3, 3800, ["Black", "White"])
    _fam(b, "Turntable with Speakers", "Home Audio & Theater", 14999, 39999, 4.4, 1600, ["33 RPM", "33/45 RPM"])
COMP_BRANDS = ["Lenovo", "Asus", "Acer", "HP", "Dell"]
for b in COMP_BRANDS:
    _fam(b, "Laptop 15.6 inch (8 GB, 512 GB SSD)", "Computers", 39999, 89999, 4.3, 4600, ["8 GB + 256 GB", "8 GB + 512 GB", "16 GB + 512 GB"])
    _fam(b, "27 inch Full HD Monitor", "Computers", 9999, 29999, 4.3, 5400, ["24 inch", "27 inch"])
    _fam(b, "Wireless Keyboard and Mouse Combo", "Computers", 1299, 5999, 4.3, 12800, ["Black", "White"])
    _fam(b, "Gaming Mouse", "Computers", 999, 7999, 4.3, 9400, ["Black", "White", "Red"])
    _fam(b, "128 GB Pen Drive", "Computers", 499, 2499, 4.3, 16800, ["64 GB", "128 GB", "256 GB"])
    _fam(b, "Dual Band Router", "Computers", 2999, 12999, 4.3, 8400, ["300 Mbps", "600 Mbps", "1200 Mbps"])
TAB_BRANDS = ["Samsung", "Xiaomi", "Realme", "OnePlus"]
for b in TAB_BRANDS:
    _fam(b, "Tablet 10.4 inch", "Computers", 12999, 39999, 4.3, 6400, ["4 GB + 64 GB", "6 GB + 128 GB", "8 GB + 256 GB"])
TV_BRANDS = ["Sony", "LG", "Samsung", "TCL"]
for b in TV_BRANDS:
    _fam(b, "Full HD Smart TV", "All Electronics", 14999, 49999, 4.3, 9800, ["32 inch", "43 inch", "55 inch"])

# ================= TOYS (Toys & Games) =================
TOY_BRANDS = ["Barbie", "Milton Bradley", "LEGO", "Mattel",
              "Hasbro", "Funskool", "Shumee"]
for b in TOY_BRANDS:
    _fam(b, "RC Car with Remote", "Toys & Games", 999, 4999, 4.2, 8800, ["1:16", "1:14", "1:10", "1:8"])
    _fam(b, "Building Blocks Set", "Toys & Games", 799, 6999, 4.3, 10400, ["200 pcs", "500 pcs", "1000 pcs"])
    _fam(b, "Board Game for Family", "Toys & Games", 699, 3499, 4.3, 9400, ["4 Players", "6 Players", "8 Players"])
    _fam(b, "Plush Teddy Bear 12 inch", "Toys & Games", 499, 2999, 4.3, 13400, ["6 inch", "12 inch", "18 inch", "24 inch"])
    _fam(b, "1000 Piece Puzzle", "Toys & Games", 599, 2999, 4.3, 7400, ["500 pcs", "1000 pcs", "1500 pcs"])
    _fam(b, "Baby Rattle Set", "Toys & Games", 399, 1699, 4.3, 11800, ["4 pcs", "6 pcs", "8 pcs"])
    _fam(b, "Toy Drone with Camera", "Toys & Games", 2999, 14999, 4.2, 4800, ["Basic", "Camera", "Foldable"])
    _fam(b, "Toy Gift Box for Kids", "Toys & Games", 499, 2999, 4.3, 9800, ["2-4 Y", "5-8 Y", "8-12 Y"])

# ================= SPORTS & FITNESS (Sports & Outdoors) =================
SPORT_BRANDS = ["SG", "Kookaburra", "Cint", "Baton", "Slazern", "Decathlon",
                "Sparx", "Camp's"]
for b in SPORT_BRANDS:
    _fam(b, "Cricket Bat", "Sports & Outdoors", 1499, 14999, 4.3, 7800, ["English Willow", "Kashmir Willow", "Grade 1"])
    _fam(b, "Batting Pads and Gloves Set", "Sports & Outdoors", 999, 5999, 4.2, 6400, ["Standard", "Pro", "Youth"])
    _fam(b, "Cricket Stumps 3 Piece", "Sports & Outdoors", 799, 4999, 4.2, 4600, ["Standard", "Pro"])
    _fam(b, "Cricket Ball", "Sports & Outdoors", 499, 2999, 4.2, 8400, ["Standard", "Quality", "Pro"])
    _fam(b, "Badminton Racket", "Sports & Outdoors", 899, 8999, 4.2, 9400, ["Standard", "Pro", "Tour"])
    _fam(b, "Yoga Mat 8 mm", "Sports & Outdoors", 499, 2999, 4.3, 14800, ["4 mm", "6 mm", "8 mm", "10 mm"])
FIT_BRANDS = ["Cint", "Decathlon", "Nautilus"]
for b in FIT_BRANDS:
    _fam(b, "Adjustable Dumbbells Set", "Sports & Outdoors", 4999, 29999, 4.3, 5400, ["10 kg", "20 kg", "40 kg"])
    _fam(b, "Resistance Bands Set", "Sports & Outdoors", 399, 1999, 4.3, 13400, ["3 Bands", "5 Bands", "7 Bands"])
    _fam(b, "Kettlebell", "Sports & Outdoors", 999, 6999, 4.3, 6800, ["8 kg", "12 kg", "16 kg", "24 kg"])
    _fam(b, "Skipping Rope", "Sports & Outdoors", 249, 1299, 4.2, 11600, ["Standard", "Weighted"])

# ================= MUSICAL (Musical Instruments) =================
MUSIC_BRANDS = ["Fender", "Gibson", "Yamaha", "Roland", "Korg", "Kaytone",
                "Yogen", "Cello"]
for b in MUSIC_BRANDS:
    _fam(b, "Acoustic Guitar", "Musical Instruments", 2999, 39999, 4.3, 5800, ["38 inch", "40 inch", "41 inch"])
    _fam(b, "Electric Guitar with Amp", "Musical Instruments", 14999, 99999, 4.4, 2400, ["Right Handed", "Left Handed"])
    _fam(b, "Electronic Keyboard 61 Keys", "Musical Instruments", 7999, 29999, 4.3, 4600, ["49 Keys", "61 Keys", "76 Keys"])
    _fam(b, "Tabla with Ghaat", "Musical Instruments", 4999, 29999, 4.4, 3400, ["7 inch", "8 inch", "9 inch"])
    _fam(b, "Harmonium 3 Octave", "Musical Instruments", 5999, 24999, 4.3, 4800, ["2.5 Octave", "3 Octave"])
    _fam(b, "Ukulele with Bag", "Musical Instruments", 1999, 9999, 4.3, 5400, ["23 inch", "26 inch"])

# ================= BEAUTY (All Beauty) =================
BEAUTY_BRANDS = ["Sunsilk", "Clinic Plus", "Lakme",
                 "Garnier", "Patanjali", "Biotique"]
for b in BEAUTY_BRANDS:
    _fam(b, "Hair Color Dark Brown", "All Beauty", 249, 999, 4.3, 14800, ["Dark Brown", "Black", "Brown"])
    _fam(b, "Mehendi Cones 50 g", "All Beauty", 199, 799, 4.3, 12400, ["50 g", "100 g"])
    _fam(b, "Kajal Pen", "All Beauty", 99, 499, 4.3, 18400, ["Black", "Dark Brown"])
    _fam(b, "Perfume for Men 100 ml", "All Beauty", 599, 3999, 4.2, 9400, ["50 ml", "100 ml"])
    _fam(b, "Perfume for Women 50 ml", "All Beauty", 599, 4999, 4.2, 10400, ["50 ml", "100 ml"])
    _fam(b, "Body Lotion 200 ml", "All Beauty", 299, 1499, 4.3, 16400, ["100 ml", "200 ml", "400 ml"])

# ================= HEALTH (Health & Personal Care) =================
HEALTH_BRANDS = ["Omron", "BPL", "Dr. Morepen", "Himalaya"]
for b in HEALTH_BRANDS:
    _fam(b, "Digital Blood Pressure Monitor", "Health & Personal Care", 1499, 5999, 4.4, 8400, ["Upper Arm", "Wrist"])
    _fam(b, "Digital Thermometer", "Health & Personal Care", 399, 1999, 4.3, 11800, ["Oral", "Forehead"])
    _fam(b, "Body Weighing Scale", "Health & Personal Care", 799, 3999, 4.3, 9400, ["180 kg", "150 kg", "Smart"])
    _fam(b, "Massage Oil 200 ml", "Health & Personal Care", 299, 1499, 4.3, 14400, ["100 ml", "200 ml"])
    _fam(b, "Steam Inhaler", "Health & Personal Care", 899, 3999, 4.3, 8400, ["Plug", "Battery"])

# ================= FESTIVAL & GIFT (Amazon Home / AMAZON FASHION) =================
FEST_BRANDS = ["Roshanara", "Haldiram's", "Bikanerwala", "Khandwala", "MTR", "MDH"]
for b in FEST_BRANDS:
    _fam(b, "Kaju Katli", "Amazon Home", 599, 3499, 4.4, 9400, ["250 g", "500 g", "1 kg"])
    _fam(b, "Mithai Mixture Box", "Amazon Home", 499, 2999, 4.3, 11400, ["250 g", "500 g", "1 kg"])
    _fam(b, "Dry Fruits Gift Box", "Amazon Home", 999, 6999, 4.4, 7400, ["500 g", "1 kg", "2 kg"])
    _fam(b, "Incense Sticks 100 count", "Amazon Home", 99, 499, 4.3, 16400, ["Sandal", "Mogra", "Basil"])
    _fam(b, "Rangoli Colors 6 Colours", "Amazon Home", 299, 1299, 4.3, 8400, ["6 Colours", "8 Colours"])
    _fam(b, "Clay Diya Set 12 pcs", "Amazon Home", 249, 1299, 4.3, 12400, ["6 pcs", "12 pcs", "24 pcs"])
    _fam(b, "Brass Diya Set 6 pcs", "Amazon Home", 499, 2999, 4.4, 6400, ["4 pcs", "6 pcs", "8 pcs"])
FEST_FASHION = ["Zariin", "FabIndia", "Tanishq", "Sona Silks", "Mehra House"]
for b in FEST_FASHION:
    _fam(b, "Rakhi Set 3 pcs", "AMAZON FASHION", 299, 1999, 4.3, 9400, ["3 pcs", "5 pcs", "8 pcs"])
    _fam(b, "Stole and Dupatta Set", "AMAZON FASHION", 599, 2999, 4.2, 10400, COLORS6)
    _fam(b, "Saree Blouse with Dupatta", "AMAZON FASHION", 799, 3999, 4.2, 8600, COLORS6)

# ================= PET (Pet Supplies) =================
PET_BRANDS = ["Pedigree", "9Lives", "Kippy", "Whiskas", "Royal Canin", "Purina"]
for b in PET_BRANDS:
    _fam(b, "Dog Dry Food", "Pet Supplies", 599, 4999, 4.3, 8400, ["1 kg", "3 kg", "10 kg"])
    _fam(b, "Cat Wet Food Pack", "Pet Supplies", 299, 1999, 4.3, 9400, ["85 g x 12", "85 g x 24"])
    _fam(b, "Pet Bowl Set", "Pet Supplies", 399, 1999, 4.2, 7400, ["Bowl", "Bowl + Plate"])
    _fam(b, "Dog Bed", "Pet Supplies", 799, 4999, 4.3, 6400, ["Small", "Medium", "Large"])
    _fam(b, "Cat Scratcher", "Pet Supplies", 499, 2999, 4.2, 5400, ["Single", "Double"])
    _fam(b, "Dog Leash and Collar Set", "Pet Supplies", 399, 2499, 4.2, 8400, ["Small", "Medium", "Large"])

# ================= OFFICE (Office Products) =================
OFF_BRANDS = ["Avery", "Dennis", "Camlin", "Pilot", "Parker", "Staedtler"]
for b in OFF_BRANDS:
    _fam(b, "A4 Notebook 200 Pages", "Office Products", 199, 1299, 4.3, 14800, ["200 Pages", "400 Pages"])
    _fam(b, "Gel Pen Pack of 5", "Office Products", 149, 799, 4.3, 16800, ["Black", "Blue", "Multicolour"])
    _fam(b, "File Box A4", "Office Products", 299, 1999, 4.2, 9400, ["A4", "A5", "Lever Arch"])
    _fam(b, "Stapler with 1000 Staples", "Office Products", 249, 1499, 4.2, 10400, ["Standard", "Heavy Duty"])
    _fam(b, "Desk Organiser", "Office Products", 399, 2499, 4.2, 8400, ["Wooden", "Plastic"])

# ================= VIDEO GAMES (Video Games) =================
_fam("Sony", "PlayStation 5 Console", "Video Games", 49999, 54999, 4.5, 12400, ["Disc Edition", "Digital Edition"])
_fam("Sony", "DualSense Wireless Controller", "Video Games", 4999, 7999, 4.4, 9400, ["White", "Black", "Red"])
_fam("Microsoft", "Xbox Wireless Controller", "Video Games", 4999, 7999, 4.4, 8400, ["White", "Black", "Robotico"])
_fam("Nintendo", "Switch Console", "Video Games", 29999, 44999, 4.5, 9800, ["Standard", "OLED"])
VG_BRANDS = ["SteelSeries", "Sony", "Microsoft"]
for b in VG_BRANDS:
    _fam(b, "Handheld Gaming Console", "Video Games", 8999, 24999, 4.3, 4400, ["Basic", "Pro"])
    _fam(b, "Gaming Mousepad", "Video Games", 399, 2499, 4.3, 10400, ["M", "L", "XL"])
    _fam(b, "Gaming Headset", "Video Games", 1999, 14999, 4.3, 7400, ["USB", "3.5 mm", "Wireless"])

# ================= AUTOMOTIVE (Automotive) =================
AUTO_BRANDS = ["MRF", "CEAT", "Apollo", "JK Tyre", "Sonax", "Bosch"]
for b in AUTO_BRANDS:
    _fam(b, "Car Tyre", "Automotive", 2999, 14999, 4.3, 6400, ["165/80 R14", "185/65 R15", "195/65 R15"])
    _fam(b, "Car Seat Cover Universal", "Automotive", 999, 6999, 4.2, 8400, ["Fabric", "Leatherette", "Full Set"])
    _fam(b, "Dash Camera 1080p", "Automotive", 2999, 14999, 4.2, 5400, ["Front", "Front + Rear"])
    _fam(b, "Car Mat 6 Piece Set", "Automotive", 799, 4999, 4.2, 7400, ["Fabric", "Rubber"])
    _fam(b, "Jump Starter 2000A", "Automotive", 4999, 19999, 4.3, 3400, ["1000A", "2000A"])
    _fam(b, "Car Sun Visor", "Automotive", 299, 1999, 4.2, 6400, ["Standard", "Magnetic"])

# ================= COLLECTIBLES (Collectibles & Fine Art) =================
COLL_BRANDS = ["Mega Bloks", "American Carrom", "Brio"]
for b in COLL_BRANDS:
    _fam(b, "Die Cast Model Car", "Collectibles & Fine Art", 499, 4999, 4.3, 5400, ["1:32", "1:24", "1:18"])
    _fam(b, "Carrom Board", "Collectibles & Fine Art", 999, 5999, 4.3, 8400, ["15x15 inch", "17x17 inch", "19x19 inch"])
    _fam(b, "Coin Collection Set", "Collectibles & Fine Art", 999, 9999, 4.3, 2400, ["25 Coins", "50 Coins"])
    _fam(b, "Blue Pottery Vase", "Collectibles & Fine Art", 799, 6999, 4.4, 3400, ["8 inch", "10 inch", "12 inch"])


# ================= DEPTH: question-ladder cells (Item E, 2026-11-06) =================
# Design goal (user work order 2026-11-06): a 6-7 answer journey must still
# leave >=1 product. The for_whom facet matches gender tokens in the title
# (guide.js FOR_WHOM_WORDS), and the audit of the 52,656-SKU catalogue
# showed the gendered cells of the flagship fashion families were thin
# (saree Women: 22 items, 4 brands; t-shirt Women: 3 brands; jeans Women:
# 2 brands; kids watch: 1 brand). These rows carry the gender token in the
# model name so each (family x gender x size) cell has >=3 brands x
# >=2 price points x >=4 colours, and the occasion-tag words (wedding /
# gift) where the occasion question needs live options. Brands are all
# already registered in EXPAND_BRANDS (no new global brand recognizers).
KIDS_AGE = ["2-3Y", "4-5Y", "6-7Y", "8-9Y", "10-11Y"]
KIDS_AGE4 = ["2-3Y", "4-5Y", "6-7Y", "8-9Y"]

# --- women ethnic: the largest gap (no gender token in the titles) ---
WOMEN_E2 = ["Zariin", "FabIndia", "Azzam", "Khaadi", "High Road",
            "Nivaaya", "Lakshmi Weaves", "Sona Silks"]
for b in WOMEN_E2:
    _fam(b, "Cotton Saree for Women", "AMAZON FASHION", 799, 2499, 4.2, 11800, COLORS6)
    _fam(b, "Georgette Saree for Women", "AMAZON FASHION", 1199, 3999, 4.3, 8400, COLORS6)
    _fam(b, "Wedding Saree for Women", "AMAZON FASHION", 1999, 6999, 4.4, 5200, COLORS4)
    _fam(b, "Kurti for Women", "AMAZON FASHION", 599, 1999, 4.2, 13400, _cart(COLORS4, SIZES4))
    _fam(b, "Wedding Kurta Set for Women", "AMAZON FASHION", 1499, 4999, 4.3, 4800, _cart(COLORS3, SIZES4))
    _fam(b, "Dress for Women", "AMAZON FASHION", 899, 2999, 4.2, 8600, _cart(COLORS4, SIZES4))
    _fam(b, "Gift Saree with Blouse", "AMAZON FASHION", 999, 3499, 4.3, 7600, COLORS5)

# --- women western: brand + size depth (t-shirt/jeans women cells) ---
WOMEN_W2 = ["Roxy", "Jini", "Vero Moda", "Aurelia X", "Bella Moda",
            "Style Kade", "Urban Tree", "Nivaaya"]
for b in WOMEN_W2:
    _fam(b, "T-Shirt for Women", "AMAZON FASHION", 399, 1299, 4.1, 15600, _cart(COLORS5, SIZES4))
    _fam(b, "Pant for Women", "AMAZON FASHION", 699, 2299, 4.2, 11400, _cart(COLORS4, SIZES4))
    _fam(b, "Jeans for Women", "AMAZON FASHION", 999, 3299, 4.2, 9800, _cart(COLORS3, ["26", "28", "30", "32"]))
    _fam(b, "Palazzo for Women", "AMAZON FASHION", 499, 1599, 4.1, 12400, _cart(COLORS5, SIZES4))

# --- kids: brand x age-band depth (the "gift for 5 year old" journeys) ---
KIDS_F = ["Cute Twins", "Chhota Chotu", "Bella Baby", "Pepe Jeans", "Roxy", "Jini"]
for b in KIDS_F:
    _fam(b, "T-Shirt for Kids", "AMAZON FASHION", 299, 899, 4.2, 12800, _cart(COLORS5, KIDS_AGE))
    _fam(b, "Shirt for Kids", "AMAZON FASHION", 399, 1099, 4.1, 9400, _cart(COLORS4, KIDS_AGE))
    _fam(b, "Jeans for Kids", "AMAZON FASHION", 599, 1799, 4.2, 8600, _cart(COLORS3, KIDS_AGE))
    _fam(b, "Dress for Kids", "AMAZON FASHION", 499, 1699, 4.2, 10400, _cart(COLORS5, KIDS_AGE4))
    _fam(b, "T-Shirt and Pant Set for Kids", "AMAZON FASHION", 799, 2299, 4.2, 6400, _cart(COLORS3, KIDS_AGE))

# --- kids watches: brand depth (was 1 brand) ---
for b in ["Zeno", "Cute Twins"]:
    _fam(b, "Digital Watch for Kids", "AMAZON FASHION", 699, 2499, 4.1, 8800, ["Blue", "Red", "Black", "Pink"])
    _fam(b, "Smart Watch for Kids", "AMAZON FASHION", 1499, 4999, 4.2, 4200, ["Blue", "Black", "Pink"])


def _brand_of_title(title):
    # longest leading-token match against the registered display names
    import re as _re
    toks = _re.findall(r"[A-Za-z0-9][A-Za-z0-9\-'.]*", title)
    for n in (3, 2, 1):
        if len(toks) >= n:
            cand = " ".join(toks[:n]).lower()
            for key, disp in EXPAND_BRANDS.items():
                if key.split()[0] and cand.startswith(key) and len(key.split()) == n:
                    return disp
    for key, disp in EXPAND_BRANDS.items():
        if key in ("9lives",):
            continue
        if title.lower().startswith(key + " "):
            return disp
    return None


def expand_rows():
    rows = []
    for i, (brand, model, cat, base, spread, rating, nrat, variants) in enumerate(ROWS):
        n = len(variants)
        fam = hashlib.sha1(f"{brand}|{model}|{cat}".encode()).hexdigest()[:10]
        for j, v in enumerate(variants):
            if n == 1:
                variant, price = None, base
            else:
                variant, price = v, base + spread * j / (n - 1)
            h = _h(f"EXPAND-{i}-{j}")
            rj = ((h % 21) - 10) / 100.0
            r = round(min(4.9, max(3.5, rating + rj)), 2)
            mult = 0.75 + 0.5 * (((h >> 8) % 101) / 100.0)
            nr = max(1, int(nrat * mult))
            rows.append({
                "title": _title(brand, model, variant),
                "main_category": cat,
                "price_inr": _x9(price),
                "average_rating": r,
                "rating_number": nr,
                "family_id": fam if n > 1 else None,
                "variant": variant,
            })
    return rows


def expand_frame(known_titles=(), verbose=True):
    """Build the expansion frame. known_titles: titles already in the catalog
    (US pool + India layer + previous catalog) - collisions are skipped so
    rebuilds stay deterministic and no duplicate titles exist.
    Carries an expand_brand column: build_catalog assigns these brands
    directly (instead of global brand-recognizer registration, which would
    re-parse existing titles and shift their stable SKUs)."""
    all_rows = expand_rows()
    known = set(known_titles)
    rows = [r for r in all_rows if r["title"] not in known]
    skipped = len(all_rows) - len(rows)
    if verbose:
        print(f"expand layer: {len(ROWS)} base rows -> {len(all_rows)} expanded "
              f"({skipped} title collisions skipped)")
    brands = []
    for r in rows:
        brands.append(_brand_of_title(r["title"]))
    df = pd.DataFrame(rows)
    df = df.assign(expand_brand=brands)
    if df.empty:
        return pd.DataFrame(columns=["parent_asin", "title", "main_category", "price_inr",
                                     "average_rating", "rating_number", "family_id",
                                     "variant", "expand_brand"])
    before = len(df)
    df = (df.sort_values(["average_rating", "title"], ascending=[False, True], kind="mergesort")
              .drop_duplicates("title", keep="first"))
    if verbose and len(df) < before:
        print(f"  expand dedup: {before} -> {len(df)}")
    df = df.sort_values(["main_category", "title"], kind="mergesort").reset_index(drop=True)
    df.insert(0, "parent_asin", [f"EXP-{i + 1:05d}" for i in range(len(df))])
    df = df[["parent_asin", "title", "main_category", "price_inr",
             "average_rating", "rating_number", "family_id", "variant",
             "expand_brand"]]
    if verbose:
        med = int(df["price_inr"].median())
        print(f"expand frame kept: {len(df)} SKUs, median Rs {med}")
    return df
