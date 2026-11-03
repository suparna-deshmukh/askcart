"""
AskCart catalogue v4 - "everything" Indian-market layer.

Design: the 25,000-SKU US Amazon base (real data) covers imported products;
this layer adds ~20,000 SKUs for the Indian consumer's full purchase
universe - every occasion (shaadi, diwali, rakhi, holi, eid, baby shower,
housewarming, birthday, corporate), every economic stratum (Rs 100 essentials
to Rs 1.5L premium), real Indian brands and models at realistic INR MRPs as
listed on Amazon.in / Flipkart.

Each base row: (brand, model, category, base_price, spread, rating, num_ratings, variants)
  - price of variant i = base + spread * i/(n-1), rounded to x9
  - rating jitter +/-0.1, num_ratings jitter (deterministic, seed 42)
Band mix target for this layer: 42% <=2k / 26% 2-5k / 15% 5-10k / 10%
10-20k / 5% 20-50k / 2% >50k (deterministic trim to exact target).
"""
import hashlib
import random
import pandas as pd

SEED = 42

# (brand, model, category, base_price, spread, rating, num_ratings, variants)
R1 = [
# ================= KITCHEN & COOKING (Appliances) =================
 ("Hawkins", "CT 21 Classic Pressure Cooker 5 L", "Appliances", 1299, 400, 4.5, 25000, ["Silver", "Black", "Grey"]),
 ("Hawkins", "CT 21 Pressure Cooker 3 L", "Appliances", 1099, 300, 4.4, 12000, ["Silver", "Black"]),
 ("Hawkins", "Cast Iron Tadka Pan 8 inch", "Appliances", 899, 300, 4.6, 18000, ["8 inch", "10 inch"]),
 ("Hawkins", "Nonstick Kadai 28 cm", "Appliances", 1499, 500, 4.4, 9000, ["28 cm", "30 cm"]),
 ("Prestige", "Apollo Pressure Cooker 5 L", "Appliances", 1099, 400, 4.5, 21000, ["Silver", "Grey"]),
 ("Prestige", "Whistling Pressure Cooker 3 L", "Appliances", 949, 300, 4.4, 8500, ["Silver", "Black"]),
 ("Prestige", "Nonstick Cookware Set 5 pcs", "Appliances", 2499, 1500, 4.3, 7800, ["5 pcs", "7 pcs", "9 pcs"]),
 ("Prestige", "Induction Cooktop 1800 W", "Appliances", 2999, 1300, 4.4, 14000, ["1500 W", "1800 W"]),
 ("Prestige", "Electric Kettle 1.7 L", "Appliances", 1099, 700, 4.4, 16000, ["1 L", "1.7 L"]),
 ("Prestige", "Dosa Maker 30 cm", "Appliances", 1299, 600, 4.3, 6800, ["30 cm", "35 cm"]),
 ("Prestige", "Chutney Maker 1.5 L", "Appliances", 1299, 500, 4.4, 11000, ["1.2 L", "1.5 L"]),
 ("Prestige", "Juicer Mixer 750 W", "Appliances", 3999, 1000, 4.3, 5400, ["600 W", "750 W"]),
 ("Prestige", "Rice Cooker 1.8 L", "Appliances", 1799, 900, 4.3, 4200, ["1.2 L", "1.8 L"]),
 ("Pigeon", "Nonstick Kadai 28 cm", "Appliances", 799, 400, 4.3, 22000, ["26 cm", "28 cm", "30 cm"]),
 ("Pigeon", "Pressure Cooker 5 L", "Appliances", 1199, 400, 4.4, 15000, ["3 L", "5 L"]),
 ("Pigeon", "Mixer Grinder 500 W", "Appliances", 1999, 900, 4.3, 11200, ["500 W", "750 W"]),
 ("Pigeon", "Induction Cooktop 1500 W", "Appliances", 2499, 800, 4.3, 9800, ["1500 W", "1800 W"]),
 ("Pigeon", "Electric Kettle 1.5 L", "Appliances", 799, 600, 4.3, 13000, ["1 L", "1.5 L"]),
 ("Pigeon", "Toaster 2 Slice", "Appliances", 1299, 500, 4.2, 7400, ["2 Slice", "4 Slice"]),
 ("Pigeon", "Air Fryer 4 L", "Appliances", 4999, 3500, 4.3, 8600, ["4 L", "5.5 L"]),
 ("Pigeon", "Idli Maker 6 Idli", "Appliances", 999, 500, 4.3, 5200, ["4 Idli", "6 Idli"]),
 ("Pigeon", "Steel Tumbler 1 L", "Appliances", 299, 150, 4.4, 32000, ["500 ml", "750 ml", "1 L"]),
 ("Cello", "Cookmaster Pressure Cooker 5 L", "Appliances", 1499, 500, 4.3, 9600, ["3 L", "5 L"]),
 ("Cello", "Nonstick Tawa 26 cm", "Appliances", 699, 350, 4.3, 14000, ["24 cm", "26 cm", "28 cm"]),
 ("Cello", "Microwave 28 L Convection", "Appliances", 9999, 4000, 4.4, 6800, ["23 L", "28 L"]),
 ("Cello", "OTG Oven 21 L", "Appliances", 5999, 2500, 4.3, 4300, ["21 L", "30 L"]),
 ("Cello", "Induction Cooktop 1750 W", "Appliances", 1999, 900, 4.3, 8100, ["1500 W", "1750 W"]),
 ("Butterfly", "Compact Mixer Grinder 300 W", "Appliances", 1499, 700, 4.2, 15600, ["300 W", "500 W"]),
 ("Butterfly", "Nonstick Cookware Set 5 pcs", "Appliances", 1999, 1200, 4.2, 6900, ["5 pcs", "7 pcs"]),
 ("Butterfly", "Pressure Cooker 5 L", "Appliances", 1299, 400, 4.2, 5800, ["3 L", "5 L"]),
 ("T-fal", "Nonstick Kadai Set 2 pcs", "Appliances", 2999, 1500, 4.4, 5600, ["Kadai 28 cm", "Kadai + Tawa", "Cookware 5 pcs"]),
 ("T-fal", "Pressure Cooker 5 L", "Appliances", 2499, 900, 4.5, 3800, ["3 L", "5 L"]),
 ("Morphy Richards", "Nonstick Cookware Set 7 pcs", "Appliances", 4499, 2500, 4.4, 4100, ["5 pcs", "7 pcs", "9 pcs"]),
 ("Morphy Richards", "Induction Cooktop 2000 W", "Appliances", 4499, 1500, 4.4, 3600, ["1800 W", "2000 W"]),
 ("Morphy Richards", "Mixer Grinder 750 W", "Appliances", 4999, 2000, 4.4, 2800, ["750 W", "800 W"]),
 ("Hattal", "Mixer Grinder 750 W", "Appliances", 3999, 1500, 4.2, 4900, ["750 W", "800 W"]),
 ("Hattal", "Chutney Maker 1.2 L", "Appliances", 1399, 600, 4.2, 6200, ["1.2 L", "1.5 L"]),
 ("Hattal", "Electric Kettle 1.7 L", "Appliances", 1499, 700, 4.3, 3900, ["1 L", "1.7 L"]),
 ("Bajaj", "RO 2420 OTG Oven 24 L", "Appliances", 7499, 3000, 4.4, 9800, ["24 L", "30 L"]),
 ("Bajaj", "RO 1400 OTG Oven 14 L", "Appliances", 5499, 2000, 4.3, 7200, ["14 L", "21 L"]),
 ("Bajaj", "ReX Mixer Grinder 500 W", "Appliances", 2499, 1000, 4.2, 9300, ["500 W", "600 W"]),
 ("Bajaj", "Microwave 23 L Solo", "Appliances", 8999, 4000, 4.3, 5600, ["23 L", "28 L"]),
 ("Bajaj", "Air Fryer 5 L", "Appliances", 5999, 2500, 4.3, 4700, ["4 L", "5 L", "6 L"]),
 ("Bajaj", "Electric Kettle 1.5 L", "Appliances", 1099, 500, 4.2, 8800, ["1 L", "1.5 L"]),
 ("Philips", "Mixer Grinder HL7756 500 W", "Appliances", 2799, 500, 4.4, 8400, ["500 W", "550 W"]),
 ("Philips", "Juicer HR2221 550 W", "Appliances", 3299, 900, 4.4, 4600, ["550 W", "700 W"]),
 ("Philips", "Electric Kettle HD9300 1.7 L", "Appliances", 2499, 800, 4.5, 6100, ["1.7 L", "2.4 L"]),
 ("Philips", "Dish Dryer 5 Tray", "Appliances", 1499, 600, 4.3, 7900, ["5 Tray", "8 Tray"]),
 ("LG", "Microwave 23 L Solo", "Appliances", 13990, 5000, 4.5, 4200, ["23 L", "28 L", "32 L"]),
 ("Samsung", "Microwave 23 L Solo", "Appliances", 14990, 6000, 4.5, 3900, ["23 L", "28 L", "32 L"]),
 ("IFB", "Microwave 28 L Convection", "Appliances", 18990, 6000, 4.5, 2800, ["28 L", "32 L"]),
 ("Amazon Basics", "Nonstick Cookware Set 5 pcs", "Appliances", 2499, 1500, 4.3, 11000, ["5 pcs", "7 pcs", "10 pcs"]),
 ("Amazon Basics", "Microwave 20 L Solo", "Appliances", 8499, 4500, 4.3, 6400, ["20 L", "28 L"]),
 ("Steelbelle", "Steel Bottle 1 L", "Appliances", 299, 150, 4.3, 28000, ["500 ml", "750 ml", "1 L"]),
 ("Steelbelle", "Steel Tumbler with Cap 500 ml", "Appliances", 249, 120, 4.3, 19000, ["300 ml", "500 ml"]),
 ("Kent", "Steel Water Bottle 1 L", "Appliances", 399, 200, 4.2, 9800, ["750 ml", "1 L", "1.5 L"]),
 ("Livpure", "Steel Water Bottle 1 L", "Appliances", 349, 180, 4.2, 7600, ["750 ml", "1 L"]),
 ("Cello", "Steel Water Bottle 1 L", "Appliances", 329, 160, 4.2, 6400, ["750 ml", "1 L"]),
 ("Havells", "Induction Cooktop 1800 W", "Appliances", 3299, 1200, 4.3, 7800, ["1800 W", "2000 W"]),
 ("Havells", "Mixer Grinder 500 W", "Appliances", 2699, 1000, 4.3, 7800, ["500 W", "600 W"]),
 ("Morphy Richards", "Air Fryer 4.2 L", "Appliances", 7999, 4000, 4.4, 2900, ["4.2 L", "6 L"]),
 ("Cuckoo", "Air Fryer 5 L", "Appliances", 8490, 3000, 4.4, 1400, ["5 L", "6.5 L"]),
 ("Miyako", "Air Fryer 5 L", "Appliances", 5999, 3000, 4.3, 4300, ["4 L", "5 L"]),
 ("Prestige", "Pressure Cooker Lid Gasket 5 L", "Appliances", 149, 80, 4.2, 15000, ["3 L", "5 L", "7 L"]),
 ("Pigeon", "Steel Utensils Set 18 pcs", "Appliances", 999, 500, 4.2, 8900, ["12 pcs", "18 pcs", "24 pcs"]),
 ("Cello", "Steel Water Bottle 2 L", "Appliances", 399, 150, 4.2, 3100, ["1 L", "2 L"]),
 ("Hawkins", "Pressure Cooker 7 L", "Appliances", 1699, 500, 4.4, 4300, ["7 L", "10 L"]),
 ("Pigeon", "Steel Pressure Cooker 5 L", "Appliances", 1399, 400, 4.3, 7700, ["3 L", "5 L"]),
 ("Butterfly", "Steel Cookware Set 5 pcs", "Appliances", 1799, 800, 4.1, 5200, ["5 pcs", "7 pcs"]),
 ("Hettich", "OTG Oven 23 L", "Appliances", 6999, 3000, 4.3, 2600, ["23 L", "32 L"]),
 ("Philips", "Dosa Pan 28 cm", "Appliances", 1299, 600, 4.3, 3400, ["26 cm", "28 cm"]),
 ("T-fal", "Induction Cooktop 1900 W", "Appliances", 5999, 2000, 4.5, 1800, ["1900 W", "2200 W"]),
 ("Morphy Richards", "Ghee Boiler 2 L", "Appliances", 4999, 1500, 4.2, 1200, ["2 L", "3 L"]),
 ("Bajaj", "Rice Cooker 1.8 L", "Appliances", 1999, 900, 4.2, 3800, ["1.2 L", "1.8 L"]),
 ("Cello", "Steel Water Jug Set 4 pcs", "Appliances", 899, 400, 4.2, 4600, ["2 pcs", "4 pcs"]),
 ("Pigeon", "Glass Tumbler Set 6 pcs", "Appliances", 799, 350, 4.3, 12000, ["4 pcs", "6 pcs", "8 pcs"]),
 ("Hawkins", "Steel Water Bottle 1 L", "Appliances", 449, 200, 4.3, 5600, ["750 ml", "1 L"]),
 ("Cello", "Mixer Grinder 500 W", "Appliances", 2299, 1000, 4.2, 6800, ["500 W", "600 W"]),
 ("Prestige", "Steel Water Bottle 1 L", "Appliances", 349, 150, 4.2, 9900, ["750 ml", "1 L"]),
 ("Bajaj", "Chutney Maker 1 L", "Appliances", 1199, 500, 4.2, 5900, ["1 L", "1.5 L"]),
 ("Pigeon", "Steel Thali Set 5 pcs", "Appliances", 699, 350, 4.2, 8400, ["3 pcs", "5 pcs"]),
 ("Amazon Basics", "Steel Water Bottle 1 L", "Appliances", 329, 150, 4.2, 15000, ["500 ml", "750 ml", "1 L"]),
 ("Hawkins", "Nonstick Tawa 26 cm", "Appliances", 1099, 450, 4.4, 7200, ["24 cm", "26 cm"]),
 ("Prestige", "Steel Cookware Set 7 pcs", "Appliances", 2299, 1200, 4.2, 4400, ["5 pcs", "7 pcs"]),
]

R2 = [
# ================= HOME APPLIANCES (Appliances) =================
 ("Voltas", "1.5 Ton 3 Star Split AC", "Appliances", 38990, 11000, 4.4, 6800, ["1.0 Ton 3 Star", "1.5 Ton 3 Star", "1.5 Ton 5 Star"]),
 ("Daikin", "1.5 Ton 5 Star Split AC", "Appliances", 54990, 15000, 4.5, 4200, ["1.0 Ton 5 Star", "1.5 Ton 5 Star", "2 Ton 5 Star"]),
 ("LG", "1.5 Ton Dual Inverter Split AC", "Appliances", 44990, 14000, 4.5, 5100, ["1.0 Ton 3 Star", "1.5 Ton 3 Star", "1.5 Ton 5 Star"]),
 ("Samsung", "1.5 Ton WindFree Split AC", "Appliances", 46990, 15000, 4.5, 4700, ["1.0 Ton 3 Star", "1.5 Ton 3 Star", "1.5 Ton 5 Star"]),
 ("Blue Star", "1.5 Ton 5 Star Split AC", "Appliances", 42990, 12000, 4.5, 3800, ["1.0 Ton 3 Star", "1.5 Ton 3 Star"]),
 ("Haier", "1.5 Ton 5 Star Split AC", "Appliances", 39990, 12000, 4.4, 4400, ["1.0 Ton 3 Star", "1.5 Ton 3 Star", "1.5 Ton 5 Star"]),
 ("Carrier", "1.5 Ton 5 Star Split AC", "Appliances", 43990, 13000, 4.5, 3600, ["1.0 Ton 3 Star", "1.5 Ton 5 Star"]),
 ("Panasonic", "1.5 Ton 5 Star Split AC", "Appliances", 41990, 12000, 4.4, 2900, ["1.0 Ton 3 Star", "1.5 Ton 3 Star"]),
 ("Hitachi", "1.5 Ton 5 Star Split AC", "Appliances", 48990, 14000, 4.5, 2400, ["1.0 Ton 5 Star", "1.5 Ton 5 Star"]),
 ("Midea", "1.5 Ton 3 Star Split AC", "Appliances", 36990, 10000, 4.3, 3900, ["1.0 Ton 3 Star", "1.5 Ton 3 Star"]),
 ("Crompton", "1.5 Ton 3 Star Split AC", "Appliances", 37990, 10000, 4.3, 2800, ["1.0 Ton 3 Star", "1.5 Ton 3 Star"]),
 ("Voltas", "1.5 Ton 3 Star Window AC", "Appliances", 32990, 9000, 4.3, 3100, ["1.0 Ton 3 Star", "1.5 Ton 3 Star"]),
 ("Samsung", "234 L Double Door Refrigerator", "Appliances", 24990, 12000, 4.4, 5600, ["185 L Single Door", "234 L Double Door", "263 L Double Door"]),
 ("LG", "245 L Double Door Refrigerator", "Appliances", 25990, 13000, 4.5, 5200, ["188 L Single Door", "245 L Double Door", "277 L Double Door"]),
 ("Haier", "240 L Double Door Refrigerator", "Appliances", 23990, 11000, 4.4, 4800, ["190 L Single Door", "240 L Double Door", "275 L 3 Door"]),
 ("Whirlpool", "265 L Double Door Refrigerator", "Appliances", 27990, 12000, 4.4, 4300, ["220 L Double Door", "265 L Double Door"]),
 ("Godrej", "220 L Double Door Refrigerator", "Appliances", 19990, 8000, 4.4, 3900, ["175 L Single Door", "220 L Double Door"]),
 ("Hoselton", "190 L Single Door Refrigerator", "Appliances", 12990, 5000, 4.3, 3400, ["150 L Single Door", "190 L Single Door"]),
 ("Hisense", "240 L Double Door Refrigerator", "Appliances", 26990, 10000, 4.3, 2100, ["240 L Double Door", "270 L Double Door"]),
 ("LG", "7 kg Front Load Washing Machine", "Appliances", 24990, 12000, 4.5, 4800, ["6.5 kg Front Load", "7 kg Front Load", "8 kg Front Load"]),
 ("Samsung", "7 kg Front Load Washing Machine", "Appliances", 22990, 11000, 4.4, 4400, ["6.5 kg Front Load", "7 kg Front Load", "8 kg Front Load"]),
 ("IFB", "7 kg Front Load Washing Machine", "Appliances", 23990, 11000, 4.5, 3900, ["6.5 kg Front Load", "7 kg Front Load"]),
 ("Bosch", "6.5 kg Front Load Washing Machine", "Appliances", 25990, 10000, 4.5, 3200, ["6.5 kg Front Load", "8 kg Front Load"]),
 ("Whirlpool", "6.5 kg Front Load Washing Machine", "Appliances", 21990, 9000, 4.4, 3600, ["6.5 kg Front Load", "8 kg Front Load"]),
 ("Haier", "7 kg Front Load Washing Machine", "Appliances", 22990, 10000, 4.4, 3100, ["7 kg Front Load", "8 kg Front Load"]),
 ("Samsung", "8 kg Top Load Washing Machine", "Appliances", 18990, 7000, 4.4, 4200, ["6.5 kg Top Load", "7 kg Top Load", "8 kg Top Load"]),
 ("LG", "8 kg Top Load Washing Machine", "Appliances", 19990, 7000, 4.4, 3800, ["7 kg Top Load", "8 kg Top Load"]),
 ("Aquafine", "25 L Geyser", "Appliances", 4299, 2500, 4.3, 8900, ["15 L", "25 L"]),
 ("Cello", "25 L Geyser", "Appliances", 3999, 2200, 4.2, 7600, ["15 L", "25 L"]),
 ("Bajaj", "15 L Geyser", "Appliances", 2499, 1500, 4.2, 6800, ["10 L", "15 L"]),
 ("Havells", "25 L Geyser", "Appliances", 4499, 2500, 4.3, 5400, ["15 L", "25 L"]),
 ("Racold", "25 L Geyser", "Appliances", 4999, 2800, 4.3, 4700, ["15 L", "25 L"]),
 ("V-Guard", "25 L Geyser", "Appliances", 4599, 2600, 4.3, 4300, ["15 L", "25 L"]),
 ("AO Smith", "25 L Geyser", "Appliances", 7999, 4000, 4.5, 2900, ["15 L", "25 L"]),
 ("Amazon Basics", "15 L Geyser", "Appliances", 2299, 1200, 4.2, 3800, ["10 L", "15 L"]),
 ("Kent", "Grand Water Purifier RO+UV 12 L", "Appliances", 10999, 4000, 4.3, 12000, ["8 L", "12 L"]),
 ("Livpure", "Z9 RO+UV Water Purifier 10 L", "Appliances", 13999, 5000, 4.4, 8600, ["10 L", "14 L"]),
 ("Aquaguard", "Copper+ RO Water Purifier 12 L", "Appliances", 10499, 4000, 4.3, 11000, ["8 L", "12 L"]),
 ("Pureit", "Copper RO+UV Water Purifier 10 L", "Appliances", 8999, 3500, 4.3, 9400, ["8 L", "10 L"]),
 ("HUL Pureit", "RO+UV Water Purifier 8 L", "Appliances", 9499, 3500, 4.3, 7800, ["6 L", "8 L"]),
 ("Kent", "Ultra Water Purifier RO+UV 12 L", "Appliances", 12499, 5000, 4.4, 6200, ["12 L", "16 L"]),
 ("Livpure", "G9+ RO+UV Water Purifier 10 L", "Appliances", 14999, 5500, 4.4, 5600, ["10 L", "14 L"]),
 ("Faber", "60 cm Chimney 700 m3", "Appliances", 12990, 5000, 4.3, 2400, ["60 cm 700 m3", "90 cm 1000 m3"]),
 ("Hettich", "60 cm Chimney 750 m3", "Appliances", 9999, 4000, 4.2, 1900, ["60 cm 750 m3", "90 cm 950 m3"]),
 ("Elica", "60 cm Chimney 750 m3", "Appliances", 15990, 6000, 4.4, 1400, ["60 cm 750 m3", "90 cm 1000 m3"]),
 ("Cello", "60 cm Chimney 650 m3", "Appliances", 7999, 3000, 4.2, 1600, ["60 cm 650 m3", "90 cm 800 m3"]),
 ("Bajaj", "60 cm Chimney 700 m3", "Appliances", 6999, 2500, 4.2, 1300, ["60 cm 700 m3"]),
 ("Crompton", "1200 mm Ceiling Fan", "Appliances", 1999, 1100, 4.3, 22000, ["1200 mm 300 W", "1200 mm 330 W", "1200 mm 350 W"]),
 ("Usha", "1200 mm Ceiling Fan", "Appliances", 1799, 900, 4.3, 18000, ["1200 mm 300 W", "1200 mm 330 W"]),
 ("Havells", "1200 mm Ceiling Fan", "Appliances", 2299, 1200, 4.3, 15000, ["1200 mm 320 W", "1200 mm 350 W"]),
 ("Orient", "1200 mm Ceiling Fan", "Appliances", 1699, 800, 4.2, 13000, ["1200 mm 300 W", "1200 mm 330 W"]),
 ("Atomberg", "Renesa Pro BLDC Ceiling Fan", "Appliances", 4999, 2500, 4.5, 9800, ["Renesa 1200 mm", "Renesa Pro 1200 mm", "Renesa Pro Max 1200 mm"]),
 ("Haier", "1200 mm Ceiling Fan", "Appliances", 1899, 900, 4.3, 9200, ["1200 mm 300 W", "1200 mm 330 W"]),
 ("Bajaj", "1200 mm Ceiling Fan", "Appliances", 1599, 800, 4.2, 11000, ["1200 mm 300 W", "1200 mm 320 W"]),
 ("V-Guard", "1200 mm Ceiling Fan", "Appliances", 2099, 1000, 4.3, 8600, ["1200 mm 320 W", "1200 mm 350 W"]),
 ("Philips", "SteamGen Iron 2400 W", "Appliances", 3499, 1800, 4.4, 6800, ["Dry 1000 W", "Steam 2200 W", "SteamGen 2400 W"]),
 ("Pigeon", "Dry Iron 1000 W", "Appliances", 999, 500, 4.2, 14000, ["1000 W", "1200 W"]),
 ("Bajaj", "Dry Iron 1000 W", "Appliances", 1099, 550, 4.2, 12000, ["1000 W", "1300 W"]),
 ("Crompton", "Steam Iron 2000 W", "Appliances", 1299, 700, 4.3, 9800, ["1500 W", "2000 W"]),
 ("Morphy Richards", "Steam Iron 2200 W", "Appliances", 2999, 1500, 4.3, 4300, ["2000 W", "2200 W"]),
 ("Philips", "PowerPro Vacuum Cleaner 250 W", "Appliances", 6999, 3500, 4.4, 3200, ["250 W", "500 W"]),
 ("Amazon Basics", "Stick Vacuum Cleaner 200 W", "Appliances", 4999, 2500, 4.3, 2800, ["200 W", "300 W"]),
 ("Pigeon", "Steam Mop", "Appliances", 2999, 1500, 4.2, 5600, ["1 L", "2 L"]),
 ("Reckitt", "Liquid Mosquito Repellent Refill 45 ml", "Appliances", 349, 120, 4.4, 45000, ["20 ml", "45 ml", "2 x 45 ml"]),
 ("Reckitt", "Electronic Mosquito Repellent Mat", "Appliances", 299, 110, 4.3, 32000, ["30 mats", "45 mats"]),
 ("Hindware", "Ceramic Kitchen Sink 55 cm", "Appliances", 8999, 4500, 4.4, 1800, ["55 cm", "60 cm"]),
 ("Hindware", "Steel Kitchen Sink 60 cm", "Appliances", 6999, 3500, 4.3, 1500, ["55 cm", "60 cm"]),
]

R3 = [
# ================= ETHNIC FASHION (AMAZON FASHION) =================
 ("Global Desi", "Chiffon Saree", "AMAZON FASHION", 799, 900, 4.2, 18000, ["Blue", "Red", "Maroon", "Yellow", "Green", "Pink"]),
 ("Global Desi", "Georgette Saree with Blouse Piece", "AMAZON FASHION", 1299, 1200, 4.3, 9800, ["Black", "Wine", "Navy", "Teal"]),
 ("Global Desi", "Art Silk Saree", "AMAZON FASHION", 1499, 1500, 4.2, 7600, ["Maroon", "Gold", "Emerald", "Royal Blue"]),
 ("Global Desi", "Cotton Saree", "AMAZON FASHION", 599, 700, 4.2, 15000, ["White", "Pink", "Turquoise", "Orange"]),
 ("Global Desi", "Banarasi Silk Saree", "AMAZON FASHION", 4999, 11000, 4.4, 2400, ["Red", "Maroon", "Gold", "Green", "Blue"]),
 ("Global Desi", "Kanchipuram Silk Saree", "AMAZON FASHION", 5999, 14000, 4.4, 1800, ["Maroon", "Peacock Green", "Golden Yellow", "Royal Blue"]),
 ("W for Woman", "Chiffon Saree", "AMAZON FASHION", 999, 1100, 4.3, 12000, ["Lavender", "Coral", "Teal", "Magenta"]),
 ("W for Woman", "Georgette Saree Party Wear", "AMAZON FASHION", 1599, 1800, 4.3, 6800, ["Black", "Wine Red", "Navy", "Emerald"]),
 ("W for Woman", "Cotton Saree Daily Wear", "AMAZON FASHION", 699, 800, 4.2, 14000, ["White", "Pink", "Green", "Yellow"]),
 ("W for Woman", "Satin Saree with Embroidery", "AMAZON FASHION", 2499, 2500, 4.3, 3900, ["Red", "Maroon", "Navy"]),
 ("Anouk", "Chiffon Saree for Women", "AMAZON FASHION", 899, 900, 4.2, 8900, ["Blue", "Red", "Green", "Pink"]),
 ("Anouk", "Georgette Saree Party Wear", "AMAZON FASHION", 1499, 1600, 4.3, 5600, ["Black", "Wine", "Teal"]),
 ("Anouk", "Art Silk Saree with Blouse", "AMAZON FASHION", 1799, 1800, 4.2, 4400, ["Maroon", "Emerald", "Royal Blue"]),
 ("Anouk", "Cotton Saree for Daily Wear", "AMAZON FASHION", 599, 650, 4.2, 11000, ["White", "Pink", "Turquoise"]),
 ("Anouk", "Banarasi Art Silk Saree", "AMAZON FASHION", 3999, 8000, 4.3, 1600, ["Red", "Maroon", "Green"]),
 ("Alinea", "Chiffon Saree for Women", "AMAZON FASHION", 999, 1000, 4.2, 9600, ["Pink", "Blue", "Green", "Yellow"]),
 ("Alinea", "Georgette Saree Wedding Party", "AMAZON FASHION", 1699, 1800, 4.3, 5200, ["Wine", "Navy", "Emerald", "Black"]),
 ("Alinea", "Art Silk Saree", "AMAZON FASHION", 1999, 2200, 4.2, 3800, ["Red", "Maroon", "Teal"]),
 ("Alinea", "Mysore Silk Cotton Saree", "AMAZON FASHION", 2999, 6000, 4.4, 1400, ["White", "Pink", "Green"]),
 ("Libas", "Georgette Saree with Blouse", "AMAZON FASHION", 1599, 1700, 4.3, 6400, ["Black", "Wine Red", "Navy Blue"]),
 ("Libas", "Art Silk Saree Wedding", "AMAZON FASHION", 2199, 2500, 4.3, 3400, ["Red", "Maroon", "Emerald"]),
 ("Libas", "Cotton Saree Daily Wear", "AMAZON FASHION", 699, 750, 4.2, 8800, ["White", "Pink", "Blue"]),
 ("Meera", "Chiffon Saree", "AMAZON FASHION", 899, 1000, 4.2, 7800, ["Coral", "Teal", "Magenta", "Lilac"]),
 ("Meera", "Art Silk Saree Party", "AMAZON FASHION", 1799, 2100, 4.2, 4100, ["Maroon", "Emerald", "Royal Blue"]),
 ("Meera", "Cotton Saree for Women", "AMAZON FASHION", 599, 700, 4.1, 9400, ["White", "Pink", "Turquoise"]),
 ("Saree Story", "Chiffon Saree", "AMAZON FASHION", 799, 900, 4.1, 6800, ["Blue", "Red", "Green", "Pink"]),
 ("Saree Story", "Art Silk Saree", "AMAZON FASHION", 1499, 1900, 4.2, 3900, ["Maroon", "Emerald", "Navy"]),
 ("Saree Story", "Cotton Saree", "AMAZON FASHION", 499, 550, 4.1, 8200, ["White", "Pink", "Yellow"]),
 ("Fabindia", "Handloom Cotton Saree", "AMAZON FASHION", 2999, 4000, 4.5, 1900, ["Natural", "Indigo", "Marigold", "Chai"]),
 ("Fabindia", "Chanderi Cotton Silk Saree", "AMAZON FASHION", 4499, 5500, 4.5, 900, ["Olive", "Rust", "Indigo"]),
 ("Fabindia", "Bhagalpur Silk Saree", "AMAZON FASHION", 6999, 8000, 4.6, 400, ["Red", "Green", "Blue"]),
 ("Rina Banerjee", "Georgette Saree", "AMAZON FASHION", 1299, 1400, 4.2, 5600, ["Wine", "Navy", "Black"]),
 ("Rina Banerjee", "Art Silk Saree", "AMAZON FASHION", 1899, 2300, 4.2, 3200, ["Maroon", "Emerald", "Teal"]),
 ("Rina Banerjee", "Cotton Saree", "AMAZON FASHION", 799, 800, 4.2, 6900, ["White", "Pink", "Blue"]),
 ("Biba", "Chiffon Saree for Women", "AMAZON FASHION", 1099, 1100, 4.2, 7400, ["Coral", "Teal", "Lilac"]),
 ("Biba", "Art Silk Saree Party Wear", "AMAZON FASHION", 1999, 2400, 4.3, 3800, ["Red", "Maroon", "Navy"]),
 ("Biba", "Cotton Saree", "AMAZON FASHION", 799, 800, 4.2, 9100, ["White", "Pink", "Green"]),
 ("Manyavar", "Mysore Silk Saree", "AMAZON FASHION", 7999, 9000, 4.5, 800, ["Red", "Maroon", "Green", "Gold"]),
 ("Manyavar", "Kanjivaram Silk Saree", "AMAZON FASHION", 12999, 15000, 4.6, 300, ["Maroon", "Peacock", "Golden"]),
 ("Manyavar", "Banarasi Silk Saree", "AMAZON FASHION", 8999, 10000, 4.5, 500, ["Red", "Maroon", "Emerald"]),
 ("Aurelia", "Chiffon Saree for Women", "AMAZON FASHION", 899, 1000, 4.2, 8600, ["Pink", "Blue", "Green", "Coral"]),
 ("Aurelia", "Art Silk Saree", "AMAZON FASHION", 1699, 2000, 4.2, 4400, ["Maroon", "Emerald", "Navy"]),
 ("Aurelia", "Cotton Saree Daily Wear", "AMAZON FASHION", 599, 700, 4.1, 10000, ["White", "Pink", "Turquoise"]),
 ("Myntra", "Chiffon Saree", "AMAZON FASHION", 699, 800, 4.1, 16000, ["Blue", "Red", "Green", "Pink"]),
 ("Myntra", "Georgette Saree", "AMAZON FASHION", 1199, 1300, 4.2, 9800, ["Black", "Wine", "Teal"]),
 ("Myntra", "Art Silk Saree", "AMAZON FASHION", 1599, 2000, 4.2, 6400, ["Maroon", "Emerald", "Navy"]),
 ("Myntra", "Cotton Saree", "AMAZON FASHION", 499, 600, 4.1, 18000, ["White", "Pink", "Yellow"]),
 ("Global Desi", "Anarkali Lehenga for Women", "AMAZON FASHION", 2999, 5000, 4.3, 3800, ["Red", "Maroon", "Navy", "Emerald"]),
 ("W for Woman", "Anarkali Lehenga Party Wear", "AMAZON FASHION", 2499, 4500, 4.3, 4200, ["Black", "Wine Red", "Teal"]),
 ("Myntra", "A-Line Lehenga for Women", "AMAZON FASHION", 1999, 3500, 4.2, 6800, ["Red", "Maroon", "Navy"]),
 ("Alinea", "Anarkali Lehenga", "AMAZON FASHION", 2799, 4800, 4.3, 3400, ["Red", "Maroon", "Emerald"]),
 ("Rina Banerjee", "Chanderi Lehenga", "AMAZON FASHION", 3999, 7000, 4.4, 1200, ["White", "Pink", "Olive"]),
 ("Biba", "Anarkali Lehenga for Women", "AMAZON FASHION", 2699, 4200, 4.3, 3100, ["Red", "Navy", "Maroon"]),
 ("Meera", "A-Line Lehenga", "AMAZON FASHION", 1799, 3000, 4.2, 5200, ["Red", "Maroon", "Navy", "Teal"]),
 ("Myntra", "Kids Anarkali Lehenga 3-10 yrs", "AMAZON FASHION", 999, 1200, 4.2, 4800, ["3-5 yrs Red", "6-8 yrs Maroon", "9-10 yrs Navy"]),
 ("Libas", "Embroidered Anarkali Lehenga", "AMAZON FASHION", 3499, 5500, 4.3, 2400, ["Red", "Maroon", "Navy"]),
 ("Global Desi", "Embroidered Kurta for Women", "AMAZON FASHION", 999, 1200, 4.2, 14000, ["White", "Pink", "Green", "Blue", "Yellow"]),
 ("W for Woman", "Printed Kurta for Women", "AMAZON FASHION", 799, 1100, 4.2, 16000, ["White", "Pink", "Teal", "Coral"]),
 ("Anouk", "Chikankari Kurta for Women", "AMAZON FASHION", 1299, 1600, 4.3, 8400, ["White", "Cream", "Pink"]),
 ("Anouk", "Printed Kurta for Women", "AMAZON FASHION", 699, 1000, 4.2, 13000, ["Blue", "Red", "Green"]),
 ("Alinea", "Chikankari Kurta for Women", "AMAZON FASHION", 1499, 1900, 4.3, 6200, ["White", "Cream", "Lavender"]),
 ("Alinea", "Printed Kurta for Women", "AMAZON FASHION", 899, 1200, 4.2, 11000, ["Pink", "Blue", "Green", "Orange"]),
 ("Libas", "Embroidered Kurta for Women", "AMAZON FASHION", 1199, 1500, 4.3, 7800, ["White", "Pink", "Teal"]),
 ("Libas", "Cotton Kurta for Women", "AMAZON FASHION", 799, 900, 4.2, 12000, ["White", "Pink", "Blue"]),
 ("Meera", "Chikankari Kurta for Women", "AMAZON FASHION", 1399, 1800, 4.3, 5400, ["White", "Cream", "Mint"]),
 ("Meera", "Cotton Kurta for Women", "AMAZON FASHION", 699, 900, 4.2, 15000, ["White", "Pink", "Yellow"]),
 ("Saree Story", "Cotton Kurta for Women", "AMAZON FASHION", 599, 800, 4.1, 12000, ["White", "Pink", "Green"]),
 ("Myntra", "Printed Kurta for Women", "AMAZON FASHION", 599, 900, 4.1, 22000, ["White", "Pink", "Blue", "Red"]),
 ("Myntra", "Embroidered Kurta for Women", "AMAZON FASHION", 999, 1300, 4.2, 13000, ["White", "Pink", "Green", "Navy"]),
 ("Biba", "Chikankari Kurta for Women", "AMAZON FASHION", 1299, 1700, 4.3, 4800, ["White", "Cream", "Pink"]),
 ("Biba", "Cotton Kurta for Women", "AMAZON FASHION", 799, 1000, 4.2, 10000, ["White", "Pink", "Blue"]),
 ("Rina Banerjee", "Chikankari Kurta for Women", "AMAZON FASHION", 1499, 2000, 4.3, 3600, ["White", "Cream", "Olive"]),
 ("Fabindia", "Handloom Kurta for Women", "AMAZON FASHION", 1999, 2500, 4.5, 2400, ["Natural", "Indigo", "Marigold"]),
 ("Fabindia", "Handloom Kurta for Men", "AMAZON FASHION", 2199, 2800, 4.5, 2100, ["Natural", "Indigo", "Olive"]),
 ("Global Desi", "Salwar Suit 3 pcs for Women", "AMAZON FASHION", 1299, 1800, 4.2, 15000, ["White", "Pink", "Green", "Blue"]),
 ("W for Woman", "Salwar Suit 3 pcs", "AMAZON FASHION", 1099, 1600, 4.2, 12000, ["Pink", "Teal", "Coral", "Lilac"]),
 ("Meera", "Salwar Suit 3 pcs for Women", "AMAZON FASHION", 999, 1500, 4.2, 13000, ["White", "Pink", "Green", "Yellow"]),
 ("Alinea", "Salwar Suit 3 pcs for Women", "AMAZON FASHION", 1199, 1700, 4.2, 9800, ["Pink", "Blue", "Green"]),
 ("Anouk", "Salwar Suit 3 pcs for Women", "AMAZON FASHION", 1099, 1600, 4.2, 10000, ["Pink", "Teal", "Blue"]),
 ("Myntra", "Salwar Suit 3 pcs", "AMAZON FASHION", 899, 1400, 4.1, 20000, ["White", "Pink", "Green", "Blue"]),
 ("Biba", "Palazzo Suit 3 pcs", "AMAZON FASHION", 1499, 2000, 4.3, 6800, ["White", "Pink", "Navy"]),
 ("Aurelia", "Salwar Suit 3 pcs", "AMAZON FASHION", 999, 1500, 4.1, 9200, ["White", "Pink", "Green"]),
 ("Raymond", "Slim Fit Kurta for Men", "AMAZON FASHION", 1799, 1700, 4.4, 6800, ["White", "Navy", "Black", "Pink"]),
 ("Raymond", "Formal Kurta Pajama Set for Men", "AMAZON FASHION", 2999, 2500, 4.4, 4200, ["White", "Navy", "Black"]),
 ("Van Heusen", "Slim Fit Kurta for Men", "AMAZON FASHION", 1699, 1800, 4.3, 7400, ["White", "Navy", "Black"]),
 ("Van Heusen", "Kurta Pajama Set for Men", "AMAZON FASHION", 2899, 2600, 4.3, 4600, ["White", "Navy", "Black"]),
 ("Peter England", "Slim Fit Kurta for Men", "AMAZON FASHION", 1599, 1700, 4.3, 6900, ["White", "Navy", "Black"]),
 ("Peter England", "Kurta Pajama Set for Men", "AMAZON FASHION", 2799, 2500, 4.3, 4300, ["White", "Navy", "Black"]),
 ("Allen Solly", "Slim Fit Kurta for Men", "AMAZON FASHION", 1499, 1600, 4.3, 5800, ["White", "Navy", "Black"]),
 ("US Polo Assn.", "Slim Fit Kurta for Men", "AMAZON FASHION", 1299, 1400, 4.2, 8200, ["White", "Navy", "Black", "Pink"]),
 ("US Polo Assn.", "Kurta Pajama Set for Men", "AMAZON FASHION", 2299, 2000, 4.2, 5400, ["White", "Navy", "Black"]),
 ("Roadster", "Slim Fit Kurta for Men", "AMAZON FASHION", 999, 1100, 4.2, 12000, ["White", "Navy", "Black", "Pink"]),
 ("Roadster", "Kurta Pajama Set for Men", "AMAZON FASHION", 1799, 1600, 4.2, 7800, ["White", "Navy", "Black"]),
 ("Manyavar", "Sherwani for Groom", "AMAZON FASHION", 9999, 20000, 4.5, 1200, ["White", "Cream", "Wine", "Black", "Navy"]),
 ("Manyavar", "Kurta Pajama for Groom", "AMAZON FASHION", 4999, 5000, 4.4, 1800, ["White", "Cream", "Wine", "Navy"]),
 ("Ajivas", "Sherwani for Men", "AMAZON FASHION", 8999, 18000, 4.5, 900, ["White", "Cream", "Wine", "Black"]),
 ("Ajivas", "Kurta Pajama for Groom", "AMAZON FASHION", 4499, 4500, 4.4, 1400, ["White", "Cream", "Navy"]),
 ("Tarun Tahiliani", "Designer Sherwani for Groom", "AMAZON FASHION", 19999, 20000, 4.6, 200, ["White", "Cream", "Wine"]),
 ("Fabindia", "Handloom Sherwani for Men", "AMAZON FASHION", 12999, 12000, 4.6, 300, ["Indigo", "Olive", "Natural"]),
 ("Raymond", "Designer Kurta for Men", "AMAZON FASHION", 2499, 2500, 4.4, 2800, ["White", "Navy", "Black"]),
 ("Van Heusen", "Designer Kurta for Men", "AMAZON FASHION", 2399, 2400, 4.4, 2600, ["White", "Navy", "Black"]),
 ("Manyavar", "Dupatta with Saree", "AMAZON FASHION", 799, 900, 4.3, 5400, ["Red", "Maroon", "Gold", "Green"]),
 ("Global Desi", "Unstitched Suit 2 pcs", "AMAZON FASHION", 1499, 1800, 4.2, 6800, ["Pink", "Blue", "Green", "White"]),
 ("W for Woman", "Unstitched Suit 2 pcs", "AMAZON FASHION", 1299, 1600, 4.2, 7400, ["Pink", "Teal", "Coral"]),
 ("Myntra", "Unstitched Suit 2 pcs", "AMAZON FASHION", 999, 1400, 4.1, 11000, ["Pink", "Blue", "Green"]),
]

R4 = [
# ================= WESTERN FASHION / SHOES / BAGS / WATCHES (AMAZON FASHION) =================
 ("Raymond", "Oxford Shirt for Men", "AMAZON FASHION", 1495, 1500, 4.4, 9800, ["White", "Blue", "Black", "Pink"]),
 ("Raymond", "Casual Shirt for Men", "AMAZON FASHION", 1295, 1300, 4.4, 12000, ["White", "Blue", "Black", "Pink", "Green"]),
 ("Van Heusen", "Oxford Shirt for Men", "AMAZON FASHION", 1395, 1400, 4.4, 11000, ["White", "Blue", "Black", "Pink"]),
 ("Van Heusen", "Casual Shirt for Men", "AMAZON FASHION", 1195, 1300, 4.3, 14000, ["White", "Blue", "Black", "Pink"]),
 ("Peter England", "Oxford Shirt for Men", "AMAZON FASHION", 1295, 1400, 4.3, 9600, ["White", "Blue", "Black"]),
 ("Peter England", "Casual Shirt for Men", "AMAZON FASHION", 1095, 1200, 4.3, 12000, ["White", "Blue", "Black", "Pink"]),
 ("Allen Solly", "Oxford Shirt for Men", "AMAZON FASHION", 1195, 1300, 4.3, 8800, ["White", "Blue", "Black"]),
 ("Allen Solly", "Casual Shirt for Men", "AMAZON FASHION", 999, 1200, 4.3, 11000, ["White", "Blue", "Black", "Pink"]),
 ("Louis Philippe", "Slim Fit Shirt for Men", "AMAZON FASHION", 1695, 1800, 4.4, 7600, ["White", "Blue", "Black"]),
 ("Louis Philippe", "Formal Shirt for Men", "AMAZON FASHION", 1895, 2100, 4.4, 5400, ["White", "Navy", "Black"]),
 ("US Polo Assn.", "Oxford Shirt for Men", "AMAZON FASHION", 999, 1200, 4.3, 13000, ["White", "Blue", "Black", "Pink"]),
 ("US Polo Assn.", "Casual Shirt for Men", "AMAZON FASHION", 899, 1100, 4.3, 16000, ["White", "Blue", "Black", "Pink"]),
 ("Roadster", "Casual Shirt for Men", "AMAZON FASHION", 699, 900, 4.2, 18000, ["White", "Blue", "Black", "Pink"]),
 ("Roadster", "Oxford Shirt for Men", "AMAZON FASHION", 899, 1000, 4.2, 12000, ["White", "Blue", "Black"]),
 ("John Player", "Casual Shirt for Men", "AMAZON FASHION", 799, 900, 4.2, 9400, ["White", "Blue", "Black", "Pink"]),
 ("HRX by Hrithik Roshan", "Oxford Shirt for Men", "AMAZON FASHION", 799, 900, 4.2, 8600, ["White", "Blue", "Black"]),
 ("Levi's", "511 Slim Fit Jeans for Men", "AMAZON FASHION", 2999, 2500, 4.5, 12000, ["Dark Wash", "Light Wash", "Black"]),
 ("Levi's", "501 Original Fit Jeans", "AMAZON FASHION", 3999, 2500, 4.5, 8400, ["Dark Wash", "Black"]),
 ("Wrangler", "Slim Fit Jeans for Men", "AMAZON FASHION", 1999, 1800, 4.4, 9600, ["Dark Wash", "Light Wash", "Black"]),
 ("Lee", "Slim Fit Jeans for Men", "AMAZON FASHION", 1899, 1700, 4.4, 8800, ["Dark Wash", "Black"]),
 ("Roadster", "Slim Fit Jeans for Men", "AMAZON FASHION", 1299, 1000, 4.2, 15000, ["Dark Wash", "Light Wash", "Black"]),
 ("HRX by Hrithik Roshan", "Slim Fit Jeans for Men", "AMAZON FASHION", 999, 800, 4.2, 13000, ["Dark Wash", "Black"]),
 ("US Polo Assn.", "Slim Fit Jeans for Men", "AMAZON FASHION", 1499, 1200, 4.3, 10000, ["Dark Wash", "Black"]),
 ("Adidas", "Originals Jeans for Men", "AMAZON FASHION", 2499, 1800, 4.4, 6800, ["Dark Wash", "Black"]),
 ("Puma", "Slim Fit Jeans for Men", "AMAZON FASHION", 1999, 1500, 4.3, 7600, ["Dark Wash", "Black"]),
 ("Roadster", "Round Neck T-Shirt for Men", "AMAZON FASHION", 499, 400, 4.2, 22000, ["White", "Black", "Navy", "Red", "Green"]),
 ("HRX by Hrithik Roshan", "Round Neck T-Shirt for Men", "AMAZON FASHION", 599, 400, 4.2, 18000, ["White", "Black", "Navy", "Red"]),
 ("US Polo Assn.", "Round Neck T-Shirt for Men", "AMAZON FASHION", 699, 500, 4.3, 19000, ["White", "Black", "Navy", "Red"]),
 ("John Player", "Round Neck T-Shirt for Men", "AMAZON FASHION", 799, 500, 4.2, 11000, ["White", "Black", "Navy", "Red"]),
 ("Nike", "Performance T-Shirt for Men", "AMAZON FASHION", 999, 800, 4.4, 14000, ["White", "Black", "Navy", "Red"]),
 ("Adidas", "Core T-Shirt for Men", "AMAZON FASHION", 999, 800, 4.4, 15000, ["White", "Black", "Navy", "Red"]),
 ("Puma", "Essentials T-Shirt for Men", "AMAZON FASHION", 899, 700, 4.3, 12000, ["White", "Black", "Navy"]),
 ("Myntra", "Round Neck T-Shirt for Men", "AMAZON FASHION", 299, 400, 4.1, 25000, ["White", "Black", "Navy", "Red", "Green"]),
 ("Nike", "Air Force 1 Sneakers", "AMAZON FASHION", 9995, 2000, 4.6, 8900, ["White", "Black", "White/Red"]),
 ("Nike", "Revolution 6 Running Shoes for Men", "AMAZON FASHION", 5495, 600, 4.5, 11000, ["Black/White", "White", "Navy"]),
 ("Nike", "Court Vision Low Sneakers", "AMAZON FASHION", 4995, 500, 4.5, 9400, ["White", "Black", "White/Red"]),
 ("Adidas", "Forum Low Sneakers for Men", "AMAZON FASHION", 4999, 800, 4.5, 8600, ["White", "Black", "White/Grey"]),
 ("Adidas", "Samba OG Sneakers", "AMAZON FASHION", 6999, 1000, 4.6, 6400, ["White/Black", "White/Green"]),
 ("Puma", "Smashic Sneakers for Men", "AMAZON FASHION", 3299, 900, 4.4, 9800, ["White", "Black", "White/Grey"]),
 ("Puma", "RS-X Sneakers for Women", "AMAZON FASHION", 6999, 1200, 4.5, 4600, ["White", "Black", "Multicolor"]),
 ("ASICS", "Gel-1130 Sneakers", "AMAZON FASHION", 6995, 1500, 4.5, 4200, ["White", "Black"]),
 ("New Balance", "990v5 Sneakers", "AMAZON FASHION", 12999, 2000, 4.7, 2800, ["Grey", "White", "Blue"]),
 ("New Balance", "574 Sneakers", "AMAZON FASHION", 7999, 1500, 4.5, 5200, ["Grey", "White", "Black"]),
 ("Reebok", "Club C 85 Sneakers", "AMAZON FASHION", 4499, 1000, 4.4, 5800, ["White", "Black", "White/Red"]),
 ("Skechers", "Street Sneakers for Men", "AMAZON FASHION", 4499, 1500, 4.4, 6800, ["White", "Black", "Grey"]),
 ("Campus", "Sneakers for Men", "AMAZON FASHION", 1999, 1200, 4.3, 8900, ["White", "Black", "Grey"]),
 ("Bata", "Sneakers for Men", "AMAZON FASHION", 1299, 900, 4.2, 12000, ["White", "Black", "Grey"]),
 ("Liberty", "Sneakers for Men", "AMAZON FASHION", 999, 700, 4.2, 10000, ["White", "Black", "Grey"]),
 ("Red Tape", "Sneakers for Men", "AMAZON FASHION", 2499, 1200, 4.3, 7400, ["White", "Black", "Grey"]),
 ("Bata", "Formal Shoes for Men", "AMAZON FASHION", 1499, 1500, 4.2, 14000, ["Black", "Brown", "Tan"]),
 ("Louis Philippe", "Formal Shoes for Men", "AMAZON FASHION", 2999, 2500, 4.4, 6800, ["Black", "Brown", "Tan"]),
 ("Van Heusen", "Formal Shoes for Men", "AMAZON FASHION", 2799, 2300, 4.4, 7200, ["Black", "Brown", "Tan"]),
 ("Peter England", "Formal Shoes for Men", "AMAZON FASHION", 2599, 2200, 4.3, 6400, ["Black", "Brown", "Tan"]),
 ("Woodland", "Formal Shoes for Men", "AMAZON FASHION", 3999, 2000, 4.4, 3800, ["Black", "Brown"]),
 ("Red Tape", "Formal Shoes for Men", "AMAZON FASHION", 2999, 1800, 4.3, 4600, ["Black", "Brown", "Tan"]),
 ("Bata", "Casual Shoes for Men", "AMAZON FASHION", 1199, 900, 4.2, 11000, ["Black", "Brown"]),
 ("Bata", "Sandals for Men", "AMAZON FASHION", 599, 500, 4.2, 18000, ["Black", "Brown", "Grey"]),
 ("Relaxo", "Sandals for Men", "AMAZON FASHION", 399, 400, 4.2, 24000, ["Black", "Brown", "Grey"]),
 ("Relaxo", "Flip Flops for Men", "AMAZON FASHION", 299, 300, 4.2, 28000, ["Black", "Brown", "Grey"]),
 ("Liberty", "Slippers for Men", "AMAZON FASHION", 399, 400, 4.2, 21000, ["Black", "Brown", "Grey"]),
 ("Red Tape", "Sandal for Men", "AMAZON FASHION", 1499, 1000, 4.3, 8600, ["Black", "Brown"]),
 ("Metro", "Slippers for Men", "AMAZON FASHION", 499, 500, 4.2, 13000, ["Black", "Grey", "Brown"]),
 ("Crocs", "Classic Clog for Men", "AMAZON FASHION", 1995, 800, 4.4, 15000, ["Black", "White", "Red"]),
 ("Crocs", "Classic Clog for Women", "AMAZON FASHION", 1995, 800, 4.4, 12000, ["White", "Pink", "Black"]),
 ("Bata", "Heels for Women", "AMAZON FASHION", 999, 1200, 4.2, 9800, ["Black", "Nude", "Red"]),
 ("Red Tape", "Heels for Women", "AMAZON FASHION", 1999, 1500, 4.3, 5600, ["Black", "Nude", "Red"]),
 ("Louis Philippe", "Heels for Women", "AMAZON FASHION", 2499, 1800, 4.3, 4200, ["Black", "Nude", "Red"]),
 ("Metro", "Heels for Women", "AMAZON FASHION", 899, 900, 4.2, 7800, ["Black", "Nude", "Red"]),
 ("Bata", "Juttis for Women", "AMAZON FASHION", 599, 600, 4.2, 11000, ["Black", "Red", "Green", "Silver"]),
 ("Relaxo", "Juttis for Women", "AMAZON FASHION", 399, 400, 4.1, 14000, ["Black", "Red", "Green"]),
 ("Fabindia", "Handcrafted Juttis for Women", "AMAZON FASHION", 999, 800, 4.4, 2400, ["Black", "Red", "Marigold"]),
 ("Nike", "Revolution 6 Running Shoes for Women", "AMAZON FASHION", 5495, 600, 4.5, 8900, ["White", "Pink", "Black"]),
 ("Adidas", "Duramo SL Running Shoes for Women", "AMAZON FASHION", 4499, 900, 4.4, 9200, ["White", "Black", "Pink"]),
 ("ASICS", "Gel-Excite 11 Running Shoes for Women", "AMAZON FASHION", 4495, 900, 4.4, 5400, ["White", "Black", "Pink"]),
 ("Skechers", "Flex Advantage Running Shoes for Women", "AMAZON FASHION", 4999, 1200, 4.4, 4800, ["White", "Black", "Pink"]),
 ("Puma", "Smashic Sneakers for Women", "AMAZON FASHION", 3299, 900, 4.4, 6400, ["White", "Black", "Pink"]),
 ("Myntra", "A-Line Dress for Women", "AMAZON FASHION", 999, 1500, 4.2, 13000, ["Red", "Blue", "Green", "Pink", "Black"]),
 ("W for Woman", "A-Line Dress for Women", "AMAZON FASHION", 1299, 1800, 4.3, 8600, ["Red", "Blue", "Green", "Pink"]),
 ("Anouk", "Floral Dress for Women", "AMAZON FASHION", 1099, 1600, 4.2, 9800, ["Pink", "Blue", "Green", "Yellow"]),
 ("Alinea", "Maxi Dress for Women", "AMAZON FASHION", 1499, 2000, 4.3, 6400, ["Red", "Blue", "Green", "Black"]),
 ("Biba", "Party Dress for Women", "AMAZON FASHION", 1999, 2500, 4.3, 4400, ["Black", "Red", "Navy"]),
 ("Myntra", "Top for Women", "AMAZON FASHION", 499, 600, 4.1, 24000, ["White", "Black", "Pink", "Red"]),
 ("Myntra", "Co-ord Set for Women", "AMAZON FASHION", 1499, 1800, 4.2, 11000, ["Pink", "Green", "White", "Blue"]),
 ("Alinea", "Co-ord Set for Women", "AMAZON FASHION", 1799, 2200, 4.3, 5800, ["Pink", "Green", "White", "Blue"]),
 ("Nike", "Sports T-Shirt for Kids", "AMAZON FASHION", 599, 400, 4.3, 8400, ["3-5 yrs", "6-8 yrs", "9-10 yrs"]),
 ("Adidas", "Sports T-Shirt for Kids", "AMAZON FASHION", 699, 400, 4.3, 7600, ["3-5 yrs", "6-8 yrs", "9-10 yrs"]),
 ("HRX by Hrithik Roshan", "T-Shirt for Kids", "AMAZON FASHION", 499, 400, 4.2, 9800, ["3-5 yrs", "6-8 yrs", "9-10 yrs"]),
 ("Skybags", "School Backpack for Boys", "AMAZON FASHION", 1499, 1000, 4.3, 8800, ["Blue", "Red", "Black"]),
 ("Skybags", "School Backpack for Girls", "AMAZON FASHION", 1499, 1000, 4.3, 8400, ["Pink", "Red", "Blue"]),
 ("American Tourister", "Backpack for Men", "AMAZON FASHION", 2999, 2000, 4.4, 9600, ["Black", "Navy", "Grey"]),
 ("Wildcraft", "Backpack for Men", "AMAZON FASHION", 1299, 1000, 4.3, 11000, ["Black", "Navy", "Grey"]),
 ("Fastrack", "Backpack for Men", "AMAZON FASHION", 999, 900, 4.2, 13000, ["Black", "Navy", "Grey", "Red"]),
 ("Hidesign", "Backpack for Men", "AMAZON FASHION", 2999, 2500, 4.4, 4200, ["Black", "Navy", "Grey"]),
 ("Jockey", "Backpack for Men", "AMAZON FASHION", 1199, 900, 4.2, 8600, ["Black", "Navy", "Grey"]),
 ("Munch", "School Bag for Kids", "AMAZON FASHION", 999, 800, 4.2, 7400, ["Blue", "Red", "Pink"]),
 ("Campbell", "Handbag for Women", "AMAZON FASHION", 1299, 1500, 4.3, 8800, ["Black", "Brown", "Red", "Beige"]),
 ("Fastrack", "Handbag for Women", "AMAZON FASHION", 999, 1200, 4.2, 12000, ["Black", "Brown", "Red", "Beige"]),
 ("Roadster", "Handbag for Women", "AMAZON FASHION", 899, 1000, 4.2, 10000, ["Black", "Brown", "Red"]),
 ("Hidesign", "Handbag for Women", "AMAZON FASHION", 2499, 2500, 4.4, 3800, ["Black", "Brown", "Beige"]),
 ("Aurelia", "Handbag for Women", "AMAZON FASHION", 1499, 1500, 4.3, 5600, ["Black", "Red", "Beige", "Pink"]),
 ("Myntra", "Handbag for Women", "AMAZON FASHION", 699, 900, 4.2, 15000, ["Black", "Red", "Beige", "Pink"]),
 ("Wildcraft", "Sling Bag for Men", "AMAZON FASHION", 999, 800, 4.2, 9800, ["Black", "Navy", "Grey"]),
 ("American Tourister", "Sling Bag for Men", "AMAZON FASHION", 1499, 1200, 4.3, 5400, ["Black", "Navy", "Grey"]),
 ("Fastrack", "Sling Bag for Men", "AMAZON FASHION", 699, 600, 4.2, 11000, ["Black", "Navy", "Red"]),
 ("Titan", "Analog Watch for Men", "AMAZON FASHION", 3995, 16000, 4.5, 15000, ["Steel Black Dial", "Steel Brown Dial", "Gold Silver Dial", "Titanium Blue Dial"]),
 ("Titan", "Analog Watch for Women", "AMAZON FASHION", 3495, 14000, 4.5, 12000, ["Rose Gold", "Silver", "Gold", "Black"]),
 ("Casio", "Analog Watch for Men", "AMAZON FASHION", 1299, 7000, 4.5, 18000, ["Black", "Silver", "Brown"]),
 ("Casio", "Analog Watch for Women", "AMAZON FASHION", 999, 5500, 4.5, 14000, ["Silver", "Rose Gold", "Black"]),
 ("Fossil", "Analog Watch for Men", "AMAZON FASHION", 3999, 4000, 4.4, 6800, ["Black", "Brown", "Silver"]),
 ("Fossil", "Analog Watch for Women", "AMAZON FASHION", 3499, 3500, 4.4, 5400, ["Silver", "Rose Gold", "Black"]),
 ("Daniel Klein", "Analog Watch for Men", "AMAZON FASHION", 1999, 2000, 4.4, 7600, ["Black", "Silver", "Brown"]),
 ("Daniel Klein", "Analog Watch for Women", "AMAZON FASHION", 1799, 1800, 4.4, 6800, ["Silver", "Rose Gold", "Black"]),
 ("Timex", "Analog Watch for Men", "AMAZON FASHION", 2499, 2500, 4.4, 5600, ["Black", "Silver", "Brown"]),
 ("Fastrack", "Analog Watch for Men", "AMAZON FASHION", 999, 1400, 4.3, 15000, ["Black", "Silver", "Brown"]),
 ("Fastrack", "Analog Watch for Women", "AMAZON FASHION", 899, 1200, 4.3, 13000, ["Silver", "Rose Gold", "Black"]),
 ("Seiko", "Analog Watch for Men", "AMAZON FASHION", 12995, 8000, 4.6, 2400, ["Silver", "Black"]),
 ("Festina", "Analog Watch for Men", "AMAZON FASHION", 3999, 3500, 4.4, 4600, ["Black", "Silver"]),
 ("Nixon", "Analog Watch for Men", "AMAZON FASHION", 6999, 4000, 4.5, 2800, ["Black", "Brown", "Silver"]),
 ("Titan", "Smart Watch Raptor", "AMAZON FASHION", 4999, 3000, 4.4, 8600, ["Raptor Black", "Raptor 2 Black", "Raptor Silver"]),
 ("Noise", "ColorFit Pro 6 Smartwatch", "AMAZON FASHION", 2995, 2500, 4.3, 9800, ["Black", "Rose Gold", "Blue"]),
 ("Noise", "Fusion Plus Max Smartwatch", "AMAZON FASHION", 7995, 4000, 4.4, 5400, ["Black", "Silver"]),
 ("Fire-Boltt", "Nimbus Pro Smartwatch", "AMAZON FASHION", 1799, 1200, 4.2, 18000, ["Black", "Rose Gold", "Blue"]),
 ("Fire-Boltt", "Blaze 3 Smartwatch", "AMAZON FASHION", 2799, 1800, 4.3, 11000, ["Black", "Silver"]),
 ("boAt", "Wave Neo Smartwatch", "AMAZON FASHION", 2999, 2000, 4.3, 14000, ["Black", "Silver", "Gold"]),
 ("Amazfit", "Bip 6 Smartwatch", "AMAZON FASHION", 5999, 3000, 4.4, 6800, ["Black", "White"]),
 ("Samsung", "Galaxy Watch FE (44 mm) Smartwatch", "AMAZON FASHION", 19999, 6000, 4.5, 3200, ["Black", "Silver"]),
 ("Ray-Ban", "Classic Wayfarer Sunglasses", "AMAZON FASHION", 5499, 4500, 4.6, 9800, ["Black", "Tortoise", "Gold"]),
 ("Ray-Ban", "Aviator Classic Sunglasses", "AMAZON FASHION", 5999, 4000, 4.6, 8600, ["Gold/Green", "Silver/Blue", "Gold/Brown"]),
 ("Titan", "Sunglasses for Men", "AMAZON FASHION", 999, 1000, 4.3, 12000, ["Black", "Tortoise", "Gold"]),
 ("Fastrack", "Sunglasses for Men", "AMAZON FASHION", 599, 800, 4.2, 15000, ["Black", "Tortoise", "Brown"]),
 ("Polaroid", "Sunglasses for Men", "AMAZON FASHION", 999, 1000, 4.3, 8800, ["Black", "Brown", "Gold"]),
 ("US Polo Assn.", "Sunglasses for Men", "AMAZON FASHION", 499, 600, 4.2, 14000, ["Black", "Brown"]),
 ("Wildcraft", "Sunglasses for Men", "AMAZON FASHION", 399, 500, 4.2, 10000, ["Black", "Brown"]),
 ("Nike", "Sunglasses for Men", "AMAZON FASHION", 2499, 1500, 4.4, 5400, ["Black", "Tortoise"]),
 ("Adidas", "Sunglasses for Men", "AMAZON FASHION", 1999, 1500, 4.4, 6800, ["Black", "Tortoise"]),
 ("Puma", "Sunglasses for Men", "AMAZON FASHION", 1499, 1200, 4.3, 7400, ["Black", "Brown"]),
 ("Jockey", "3 pcs Cotton Underwear for Men", "AMAZON FASHION", 799, 600, 4.3, 18000, ["Black", "White", "Navy"]),
 ("Fruit of the Loom", "3 pcs Cotton Underwear for Men", "AMAZON FASHION", 699, 500, 4.2, 20000, ["Black", "White", "Navy"]),
 ("Van Heusen", "3 pcs Cotton Underwear for Men", "AMAZON FASHION", 999, 800, 4.3, 11000, ["Black", "White", "Navy"]),
 ("US Polo Assn.", "3 pcs Cotton Underwear for Men", "AMAZON FASHION", 899, 700, 4.3, 13000, ["Black", "White", "Navy"]),
 ("NY", "3 pcs Cotton Underwear for Men", "AMAZON FASHION", 799, 600, 4.3, 12000, ["Black", "White", "Navy"]),
 ("Zouk", "2 pcs Cotton Underwear for Women", "AMAZON FASHION", 899, 700, 4.3, 9800, ["Black", "White", "Nude"]),
 ("aha!", "2 pcs Cotton Underwear for Women", "AMAZON FASHION", 1199, 900, 4.3, 7400, ["Black", "White", "Nude"]),
 ("Jockey", "2 pcs Cotton Underwear for Women", "AMAZON FASHION", 799, 600, 4.3, 10000, ["Black", "White", "Nude"]),
 ("Myntra", "Loungewear Set for Women", "AMAZON FASHION", 799, 900, 4.2, 13000, ["Pink", "Blue", "White", "Green"]),
 ("Zouk", "Loungewear Set for Women", "AMAZON FASHION", 1299, 1200, 4.3, 6800, ["Pink", "Blue", "White"]),
 ("Roadster", "Loungewear Set for Men", "AMAZON FASHION", 999, 900, 4.2, 9400, ["Black", "Grey", "Navy"]),
]

R5 = [
# ================= BEAUTY & PERSONAL CARE (All Beauty / Health & Personal Care) =================
 ("Maybelline", "Matte Crash Lipstick", "All Beauty", 399, 150, 4.4, 45000, ["Cherry Red", "Rosewood", "Barely Brat", "Soft Matte"]),
 ("Maybelline", "Fit Me Foundation", "All Beauty", 599, 300, 4.4, 28000, ["120 Sand", "130 Beige", "140 Light Tan"]),
 ("Maybelline", "Great Lash Mascara", "All Beauty", 549, 200, 4.4, 32000, ["Black", "Black/Blue"]),
 ("Maybelline", "Super Stay Matte Ink Lipstick", "All Beauty", 499, 200, 4.4, 24000, ["Red", "Nude", "Pink"]),
 ("L'Oreal Paris", "Matte Love Lipstick", "All Beauty", 449, 200, 4.3, 26000, ["Cherry", "Rose", "Nude"]),
 ("L'Oreal Paris", "Revitalift Serum", "All Beauty", 699, 400, 4.4, 18000, ["20 ml", "40 ml"]),
 ("L'Oréal Paris", "Reno Lipstick", "All Beauty", 449, 200, 4.3, 12000, ["Cherry", "Rose", "Nude"]),
 ("Lakme", "Absolute Matte Lipstick", "All Beauty", 349, 150, 4.3, 30000, ["Cherry", "Rosewood", "Nude"]),
 ("Lakme", "9 Wonders Foundation", "All Beauty", 549, 300, 4.3, 16000, ["Fair", "Medium", "Tan"]),
 ("Lakme", "Compact Powder", "All Beauty", 399, 150, 4.3, 22000, ["Fair", "Medium", "Tan"]),
 ("Colorbar", "Silktouch Matte Lipstick", "All Beauty", 399, 200, 4.3, 24000, ["Cherry", "Rose", "Nude", "Berry"]),
 ("Colorbar", "Eyes to Kill Eyeshadow Palette", "All Beauty", 699, 500, 4.4, 15000, ["Earth Tones", "Pinks", "Neutrals"]),
 ("Colorbar", "Foundation Compact", "All Beauty", 499, 250, 4.3, 13000, ["Fair", "Medium", "Tan"]),
 ("MAC", "Matte Lipstick", "All Beauty", 1399, 400, 4.6, 8600, ["Chili", "Ruby Woo", "Mocha", "Velvet Teddy"]),
 ("MAC", "Studio Fix Powder Foundation", "All Beauty", 2499, 800, 4.6, 5400, ["NW15", "NW20", "NW25"]),
 ("NYX", "Matte Lipstick", "All Beauty", 449, 200, 4.3, 12000, ["Cherry", "Rose", "Nude"]),
 ("Nykaa", "Matte Lipstick", "All Beauty", 349, 150, 4.2, 14000, ["Cherry", "Rose", "Nude"]),
 ("Nykaa", "Eyeshadow Palette", "All Beauty", 699, 500, 4.3, 8600, ["Earth Tones", "Neutrals"]),
 ("Sugar", "Matte Lipstick", "All Beauty", 399, 150, 4.2, 9800, ["Cherry", "Rose", "Nude"]),
 ("Sugar", "Lip Liner", "All Beauty", 249, 100, 4.2, 8400, ["Cherry", "Rose", "Nude"]),
 ("Lotus", "Herbal Lipstick", "All Beauty", 299, 100, 4.1, 11000, ["Cherry", "Rose", "Nude"]),
 ("Lotus", "Sunscreen SPF 50", "All Beauty", 399, 200, 4.3, 16000, ["50 ml", "100 ml"]),
 ("Blistex", "Lip Balm SPF 15", "All Beauty", 149, 60, 4.3, 20000, ["Natural", "Strawberry", "Cherry"]),
 ("Minimalist", "Vitamin C 10% Face Serum", "All Beauty", 399, 150, 4.3, 24000, ["30 ml", "50 ml"]),
 ("Minimalist", "Niacinamide 10% Face Serum", "All Beauty", 349, 150, 4.3, 22000, ["30 ml", "50 ml"]),
 ("Minimalist", "Salicylic Acid 2% Serum", "All Beauty", 399, 150, 4.3, 18000, ["30 ml", "50 ml"]),
 ("Minimalist", "Kojic Acid 2% Serum", "All Beauty", 449, 200, 4.3, 12000, ["30 ml"]),
 ("Minimalist", "Sunscreen SPF 50 PA+++", "All Beauty", 399, 150, 4.3, 15000, ["50 ml"]),
 ("Minimalist", "Amla Hair Oil", "All Beauty", 299, 100, 4.3, 9800, ["100 ml", "200 ml"]),
 ("Re'equil", "Niacinamide 10% Serum", "All Beauty", 399, 150, 4.3, 14000, ["30 ml"]),
 ("Re'equil", "Salicylic Acid 2% Serum", "All Beauty", 449, 200, 4.3, 11000, ["30 ml"]),
 ("Re'equil", "Sunscreen SPF 50", "All Beauty", 449, 200, 4.3, 12000, ["50 ml"]),
 ("Re'equil", "Retinol 0.3% Cream", "All Beauty", 599, 300, 4.3, 8400, ["30 g"]),
 ("Plum", "Green Apple Face Wash", "All Beauty", 299, 150, 4.2, 16000, ["150 ml"]),
 ("Plum", "Body Lotion", "All Beauty", 399, 200, 4.2, 13000, ["100 ml", "250 ml"]),
 ("Plum", "Retinol Face Serum", "All Beauty", 599, 300, 4.3, 9600, ["30 ml"]),
 ("Dot & Key", "Vitamin C Face Serum", "All Beauty", 399, 150, 4.2, 15000, ["30 ml", "50 ml"]),
 ("Dot & Key", "Tea Tree Face Wash", "All Beauty", 349, 150, 4.2, 12000, ["150 ml"]),
 ("Dot & Key", "Sunscreen SPF 50", "All Beauty", 349, 150, 4.3, 10000, ["50 ml"]),
 ("Derma Co", "Niacinamide 10% Serum", "All Beauty", 349, 150, 4.3, 13000, ["30 ml"]),
 ("Derma Co", "Salicylic Acid 2% Serum", "All Beauty", 399, 150, 4.3, 10000, ["30 ml"]),
 ("Derma Co", "Vitamin C Face Wash", "All Beauty", 299, 100, 4.2, 9400, ["150 ml"]),
 ("CeraVe", "Moisturising Lotion", "All Beauty", 799, 500, 4.6, 22000, ["100 ml", "236 ml", "473 ml"]),
 ("CeraVe", "Sunscreen SPF 30", "All Beauty", 799, 400, 4.5, 16000, ["90 g", "150 g"]),
 ("CeraVe", "Foaming Cleanser", "All Beauty", 599, 350, 4.6, 18000, ["100 ml", "236 ml"]),
 ("Neutrogena", "Hydro Boost Serum", "All Beauty", 999, 600, 4.4, 9800, ["30 ml", "50 ml"]),
 ("Neutrogena", "Sunscreen SPF 50", "All Beauty", 799, 400, 4.4, 11000, ["90 g"]),
 ("Neutrogena", "Oil Free Face Wash", "All Beauty", 599, 300, 4.4, 12000, ["150 ml"]),
 ("La Roche-Posay", "Anthelios Sunscreen SPF 50+", "All Beauty", 1199, 600, 4.6, 9400, ["50 ml"]),
 ("La Roche-Posay", "Effaclar Face Wash", "All Beauty", 999, 500, 4.5, 7600, ["200 ml"]),
 ("Garnier", "Glow Complete Vitamin C Serum", "All Beauty", 449, 250, 4.3, 18000, ["30 ml", "50 ml"]),
 ("Garnier", "Bright Complete Face Wash", "All Beauty", 249, 100, 4.2, 20000, ["150 ml"]),
 ("Garnier", "Green Tea Shampoo", "All Beauty", 349, 150, 4.2, 24000, ["340 ml"]),
 ("Himalaya", "Neem Face Wash", "All Beauty", 199, 80, 4.3, 28000, ["150 ml"]),
 ("Himalaya", "Kumkumadi Face Oil", "All Beauty", 499, 300, 4.3, 15000, ["20 ml", "50 ml"]),
 ("Himalaya", "Hair Oil", "All Beauty", 199, 80, 4.3, 22000, ["100 ml", "200 ml"]),
 ("Biotique", "Aloe Vera Hair Oil", "All Beauty", 249, 100, 4.3, 18000, ["100 ml", "200 ml"]),
 ("Biotique", "Santhan Face Pack", "All Beauty", 299, 150, 4.2, 14000, ["100 g"]),
 ("Biotique", "Face Wash", "All Beauty", 249, 100, 4.2, 16000, ["100 ml"]),
 ("Ponds", "Clear It Face Wash", "All Beauty", 299, 120, 4.3, 19000, ["150 ml"]),
 ("Ponds", "Glow Serum", "All Beauty", 499, 250, 4.3, 9400, ["30 ml"]),
 ("Mamaearth", "Tea Tree Face Wash", "All Beauty", 349, 150, 4.2, 15000, ["150 ml"]),
 ("Mamaearth", "Ubtan Face Pack", "All Beauty", 299, 120, 4.3, 12000, ["100 g"]),
 ("Aqualogica", "Vitamin C Face Serum", "All Beauty", 599, 300, 4.3, 8600, ["30 ml"]),
 ("Aqualogica", "Niacinamide Serum", "All Beauty", 599, 300, 4.3, 7400, ["30 ml"]),
 ("Vanicream", "Face Moisturiser", "All Beauty", 499, 250, 4.5, 9800, ["100 g", "250 g"]),
 ("VLCC", "Whitening Face Pack", "All Beauty", 349, 150, 4.2, 8400, ["100 g"]),
 ("Wipro", "Sunscreen SPF 50", "All Beauty", 399, 150, 4.2, 10000, ["50 ml"]),
 ("Beardo", "Beard Oil", "All Beauty", 499, 200, 4.3, 12000, ["30 ml"]),
 ("Beardo", "Beard Grooming Kit", "All Beauty", 799, 400, 4.3, 8600, ["30 ml", "Combo"]),
 ("Beardo", "Face Wash for Men", "All Beauty", 399, 150, 4.3, 9800, ["100 ml"]),
 ("Villain", "Beard Grooming Kit", "All Beauty", 899, 450, 4.3, 7400, ["30 ml", "Combo"]),
 ("Villain", "Face Wash for Men", "All Beauty", 399, 150, 4.3, 8600, ["100 ml"]),
 ("Ustraa", "Hibiscus Hair Oil", "All Beauty", 449, 200, 4.3, 6800, ["100 ml"]),
 ("Ustraa", "Grooming Kit for Men", "All Beauty", 999, 500, 4.3, 5400, ["30 ml", "Combo"]),
 ("Bella Vita", "L'Allure Perfume 90 ml", "All Beauty", 999, 300, 4.2, 8900, ["L'Allure", "L'Amour", "L'Essenza"]),
 ("Bella Vita", "L'Amour Perfume 90 ml", "All Beauty", 1099, 350, 4.2, 6400, ["90 ml"]),
 ("Villain", "Oud Wood Perfume 120 ml", "All Beauty", 1499, 600, 4.3, 7600, ["120 ml"]),
 ("Wild Stone", "Code For Men Perfume 120 ml", "All Beauty", 599, 250, 4.3, 24600, ["Code", "Code Dark", "Code Extreme"]),
 ("Wild Stone", "Villa Eau de Parfum 100 ml", "All Beauty", 549, 220, 4.3, 9200, ["100 ml"]),
 ("Fogg", "Scent Sation Classic 100 ml", "All Beauty", 499, 200, 4.2, 31200, ["Classic", "Bold", "Fusion"]),
 ("Fogg", "Power Scent 100 ml", "All Beauty", 799, 350, 4.2, 12000, ["100 ml"]),
 ("Park Avenue", "Voyage For Men 100 ml", "All Beauty", 449, 180, 4.2, 18900, ["Voyage", "Pulse", "Icon"]),
 ("Engage", "For Men Eau de Toilette 100 ml", "All Beauty", 649, 250, 4.3, 15700, ["100 ml"]),
 ("Engage", "For Women Eau de Toilette 100 ml", "All Beauty", 549, 220, 4.2, 8300, ["100 ml"]),
 ("Beardo", "King Perfume 100 ml", "All Beauty", 499, 200, 4.2, 7800, ["100 ml"]),
 ("Nautica", "Voyage Eau de Toilette 100 ml", "All Beauty", 1899, 800, 4.4, 5600, ["100 ml"]),
 ("Montblanc", "Explorer Man 100 ml", "All Beauty", 14900, 4000, 4.6, 300, ["100 ml"]),
 ("Bently London", "24 Gold Perfume 100 ml", "All Beauty", 1199, 500, 4.3, 4800, ["100 ml"]),
 ("Philips", "Hair Dryer 2200 W", "All Beauty", 1999, 1500, 4.4, 9800, ["1200 W", "2200 W"]),
 ("Remington", "Hair Dryer 2200 W", "All Beauty", 2499, 1800, 4.4, 7600, ["2000 W", "2200 W"]),
 ("Pico", "Hair Dryer 1800 W", "All Beauty", 1299, 900, 4.3, 8800, ["1200 W", "1800 W"]),
 ("Pigeon", "Hair Dryer 1000 W", "All Beauty", 899, 500, 4.2, 9400, ["1000 W", "1200 W"]),
 ("Hattal", "Hair Dryer 1800 W", "All Beauty", 1799, 900, 4.2, 5600, ["1500 W", "1800 W"]),
 ("Morphy Richards", "Hair Dryer 2400 W", "All Beauty", 2999, 1500, 4.4, 3800, ["2200 W", "2400 W"]),
 ("Amazon Basics", "Hair Dryer 1800 W", "All Beauty", 1299, 700, 4.2, 6800, ["1200 W", "1800 W"]),
 ("Philips", "Razor QT4015 Electric Shaver", "All Beauty", 2499, 1500, 4.4, 9400, ["QT4015", "PQ206", "S5087/850"]),
 ("Remington", "Electric Shaver", "All Beauty", 1499, 1000, 4.3, 7600, ["F5-750", "FZ5500"]),
 ("Panasonic", "Electric Shaver", "All Beauty", 1999, 1200, 4.4, 6800, ["ES7011", "ES7031"]),
 ("Pigeon", "Electric Shaver", "All Beauty", 699, 400, 4.2, 9800, ["1000 W", "1200 W"]),
 ("KingC", "Electric Shaver for Men", "All Beauty", 799, 450, 4.2, 8400, ["Standard", "Pro"]),
 ("Brio", "Beard Trimmer", "All Beauty", 549, 350, 4.2, 9400, ["Standard", "Pro"]),
 ("Amazon Basics", "Electric Shaver for Men", "All Beauty", 899, 500, 4.2, 8800, ["Standard", "Pro"]),
 ("Oral-B", "Electric Toothbrush", "Health & Personal Care", 1999, 1800, 4.4, 9800, ["CrossAction", "Pulse"]),
 ("Philips", "Sonicare Electric Toothbrush", "Health & Personal Care", 2999, 2200, 4.5, 7600, ["HX6711", "HX6731/18"]),
 ("Pico", "Electric Toothbrush", "Health & Personal Care", 999, 500, 4.2, 6800, ["Standard", "Premium"]),
 ("Hattal", "Electric Toothbrush", "Health & Personal Care", 1299, 600, 4.2, 4400, ["Standard", "Premium"]),
 ("Dettol", "Hand Sanitizer 200 ml", "Health & Personal Care", 249, 100, 4.4, 25000, ["100 ml", "200 ml"]),
 ("Dettol", "Antiseptic Liquid 500 ml", "Health & Personal Care", 299, 120, 4.4, 22000, ["250 ml", "500 ml"]),
 ("Himalaya", "Toothpaste 100 g", "Health & Personal Care", 149, 60, 4.4, 28000, ["50 g", "100 g", "150 g"]),
 ("Colgate", "Total Toothpaste 150 g", "Health & Personal Care", 199, 80, 4.4, 26000, ["50 g", "100 g", "150 g"]),
 ("Closeup", "Toothpaste 100 g", "Health & Personal Care", 129, 50, 4.3, 22000, ["50 g", "100 g"]),
 ("Colgate", "Toothbrush", "Health & Personal Care", 99, 40, 4.3, 24000, ["Soft", "Extra Soft", "Dual Action"]),
 ("Sensodyne", "Toothpaste 100 g", "Health & Personal Care", 199, 80, 4.4, 18000, ["50 g", "100 g"]),
 ("Himalaya", "Shampoo 340 ml", "Health & Personal Care", 249, 100, 4.3, 24000, ["190 ml", "340 ml"]),
 ("Loreal", "Paris Advanced Shampoo 360 ml", "Health & Personal Care", 399, 180, 4.3, 20000, ["180 ml", "360 ml"]),
 ("Dove", "Shampoo 340 ml", "Health & Personal Care", 349, 150, 4.3, 22000, ["190 ml", "340 ml"]),
 ("TRESMM", "Shampoo 340 ml", "Health & Personal Care", 399, 180, 4.3, 16000, ["180 ml", "360 ml"]),
 ("Indulekha", "Bringhain Hair Oil 200 ml", "Health & Personal Care", 449, 180, 4.3, 14000, ["100 ml", "200 ml"]),
 ("Patanjali", "Chikoo Hair Oil 200 ml", "Health & Personal Care", 249, 100, 4.3, 22000, ["100 ml", "200 ml"]),
 ("Bajaj Almond", "Dandruff Control Shampoo", "Health & Personal Care", 249, 100, 4.2, 18000, ["180 ml", "340 ml"]),
]

R6 = [
# ================= HOME & LIVING (Amazon Home) =================
 ("Dureva", "3 Seater Fabric Sofa", "Amazon Home", 24999, 25000, 4.4, 2400, ["2 Seater", "3 Seater", "L-Shape 3 Seater"]),
 ("Dureva", "Memory Foam Mattress Queen", "Amazon Home", 9999, 12000, 4.4, 6800, ["Single", "Queen", "King"]),
 ("Dureva", "Wooden Bed Queen", "Amazon Home", 18999, 20000, 4.4, 1800, ["Queen", "King"]),
 ("Dureva", "TV Unit 120 cm", "Amazon Home", 6999, 8000, 4.3, 2200, ["120 cm", "150 cm", "180 cm"]),
 ("Wakefit", "Orthopedic Mattress Queen", "Amazon Home", 9999, 14000, 4.5, 15000, ["Single", "Queen", "King"]),
 ("Wakefit", "Memory Foam Mattress Queen", "Amazon Home", 12999, 15000, 4.5, 9800, ["Queen", "King"]),
 ("Sleepycat", "Orthopedic Mattress Queen", "Amazon Home", 7999, 9000, 4.4, 8600, ["Single", "Queen", "King"]),
 ("Sleepycat", "Memory Foam Mattress Queen", "Amazon Home", 11999, 13000, 4.4, 6800, ["Queen", "King"]),
 ("Casper", "Hybrid Mattress Queen", "Amazon Home", 24999, 18000, 4.6, 2400, ["Queen", "King"]),
 ("Ziro", "Memory Foam Mattress Queen", "Amazon Home", 14999, 12000, 4.4, 3800, ["Queen", "King"]),
 ("Pepperfury", "3 Seater Sofa", "Amazon Home", 29999, 25000, 4.4, 1400, ["2 Seater", "3 Seater"]),
 ("Urban Ladder", "3 Seater Fabric Sofa", "Amazon Home", 49999, 45000, 4.5, 900, ["2 Seater", "3 Seater", "L-Shape"]),
 ("Urban Ladder", "Upholstered Bed Queen", "Amazon Home", 39999, 35000, 4.5, 700, ["Queen", "King"]),
 ("Urban Ladder", "Wardrobe 3 Door", "Amazon Home", 49999, 40000, 4.5, 500, ["2 Door", "3 Door", "4 Door"]),
 ("Godrej Interio", "Wooden Bed Queen", "Amazon Home", 24999, 25000, 4.5, 1800, ["Queen", "King"]),
 ("Godrej Interio", "Wardrobe 3 Door", "Amazon Home", 34999, 30000, 4.5, 1200, ["2 Door", "3 Door"]),
 ("Godrej Interio", "Dining Table 4 Seater", "Amazon Home", 24999, 25000, 4.4, 800, ["2 Seater", "4 Seater", "6 Seater"]),
 ("Godrej", "Almirah 4 Door Steel", "Amazon Home", 12999, 10000, 4.3, 1400, ["3 Door", "4 Door"]),
 ("Nilkamal", "Plastic Chair", "Amazon Home", 799, 500, 4.2, 25000, ["Single", "2 pcs", "4 pcs"]),
 ("Nilkamal", "2 Seater Sofa Set", "Amazon Home", 8999, 7000, 4.3, 1800, ["2 Seater", "3 Seater"]),
 ("Livmax", "Ergonomic Office Chair", "Amazon Home", 8999, 12000, 4.4, 9800, ["Mesh Black", "Mesh Grey", "Executive Black"]),
 ("Livmax", "Office Chair with Headrest", "Amazon Home", 11999, 15000, 4.4, 6800, ["Black", "Grey"]),
 ("Flexi", "Ergonomic Office Chair", "Amazon Home", 12999, 15000, 4.4, 4200, ["Black", "Grey", "Blue"]),
 ("Ergo", "Office Chair", "Amazon Home", 9999, 12000, 4.3, 3400, ["Black", "Grey"]),
 ("Amazon Basics", "Office Chair", "Amazon Home", 5999, 5000, 4.2, 8600, ["Black", "Grey"]),
 ("Amazon Basics", "Wooden Bed Queen", "Amazon Home", 14999, 12000, 4.3, 2800, ["Queen", "King"]),
 ("Amazon Basics", "TV Unit 120 cm", "Amazon Home", 5999, 5000, 4.3, 3400, ["120 cm", "150 cm"]),
 ("Amazon Basics", "Study Table 100 cm", "Amazon Home", 8999, 6000, 4.3, 2800, ["100 cm", "120 cm"]),
 ("Wakefit", "Bedsheet Queen 144 TC", "Amazon Home", 599, 500, 4.3, 25000, ["Single", "Double", "Queen"]),
 ("Wakefit", "Bedsheet Queen 200 TC", "Amazon Home", 799, 700, 4.3, 18000, ["Double", "Queen", "King"]),
 ("Amazon Basics", "Bedsheet Queen 144 TC", "Amazon Home", 499, 450, 4.3, 28000, ["Single", "Double", "Queen"]),
 ("Amazon Basics", "Bedsheet Queen 300 TC", "Amazon Home", 899, 800, 4.3, 15000, ["Double", "Queen", "King"]),
 ("Triveni", "Bedsheet Queen 144 TC", "Amazon Home", 399, 350, 4.2, 22000, ["Single", "Double", "Queen"]),
 ("Triveni", "Bedsheet Queen 200 TC", "Amazon Home", 599, 550, 4.2, 16000, ["Double", "Queen"]),
 ("Van Heusen", "Bedsheet Queen 200 TC", "Amazon Home", 999, 900, 4.3, 9800, ["Double", "Queen", "King"]),
 ("Wakefit", "Comforter Queen", "Amazon Home", 1499, 1500, 4.4, 12000, ["Queen", "King"]),
 ("Amazon Basics", "Comforter Queen", "Amazon Home", 999, 1000, 4.3, 14000, ["Queen", "King"]),
 ("Triveni", "Blanket King", "Amazon Home", 799, 600, 4.2, 18000, ["Queen", "King"]),
 ("Wakefit", "Cushion Cover 18 inch", "Amazon Home", 249, 200, 4.3, 15000, ["16 inch", "18 inch", "20 inch"]),
 ("Amazon Basics", "Cushion Cover 18 inch", "Amazon Home", 199, 180, 4.2, 18000, ["16 inch", "18 inch", "20 inch"]),
 ("Wakefit", "Blackout Curtain 120x120", "Amazon Home", 1299, 1200, 4.3, 8600, ["120x120", "135x135", "150x160"]),
 ("Amazon Basics", "Blackout Curtain 120x120", "Amazon Home", 899, 900, 4.2, 9800, ["120x120", "135x135"]),
 ("Triveni", "Curtain 120x120", "Amazon Home", 599, 550, 4.2, 11000, ["120x120", "135x135"]),
 ("Godrej", "Curtain 120x120", "Amazon Home", 1199, 1000, 4.3, 6400, ["120x120", "135x135"]),
 ("Wakefit", "Cushion 18 inch", "Amazon Home", 499, 400, 4.3, 9800, ["16 inch", "18 inch", "20 inch"]),
 ("Amazon Basics", "Cushion 18 inch", "Amazon Home", 399, 350, 4.2, 12000, ["16 inch", "18 inch", "20 inch"]),
 ("Wipro AG", "Diwali String Lights 10 m 100 LED", "Amazon Home", 499, 400, 4.2, 25000, ["5 m 50 LED", "10 m 100 LED", "20 m 200 LED"]),
 ("Wipro AG", "Fairy Lights 5 m", "Amazon Home", 299, 250, 4.3, 18000, ["5 m", "10 m"]),
 ("Philips", "String Lights 10 m 100 LED", "Amazon Home", 699, 500, 4.3, 15000, ["5 m 50 LED", "10 m 100 LED"]),
 ("Philips", "Fairy Lights 5 m", "Amazon Home", 449, 350, 4.3, 12000, ["5 m", "10 m"]),
 ("Syska", "String Lights 10 m 100 LED", "Amazon Home", 449, 400, 4.2, 13000, ["5 m 50 LED", "10 m 100 LED"]),
 ("Syska", "Fairy Lights 5 m", "Amazon Home", 299, 250, 4.2, 11000, ["5 m", "10 m"]),
 ("Amazon Basics", "String Lights 10 m 100 LED", "Amazon Home", 399, 350, 4.2, 16000, ["5 m 50 LED", "10 m 100 LED"]),
 ("Amazon Basics", "Fairy Lights 5 m", "Amazon Home", 249, 200, 4.2, 14000, ["5 m", "10 m"]),
 ("Invisibles", "LED String Lights 10 m", "Amazon Home", 299, 250, 4.1, 15000, ["5 m", "10 m"]),
 ("Invisibles", "Diwali Decoration Wall Sticker", "Amazon Home", 199, 150, 4.2, 12000, ["50 cm", "100 cm"]),
 ("Amazon Basics", "Diya Set 10 pcs", "Amazon Home", 199, 150, 4.2, 14000, ["5 pcs", "10 pcs", "20 pcs"]),
 ("Wipro AG", "Electric Diya 4 pcs", "Amazon Home", 349, 200, 4.2, 8600, ["2 pcs", "4 pcs", "8 pcs"]),
 ("Amazon Basics", "Rangoli Stencils 24 pcs", "Amazon Home", 149, 100, 4.2, 12000, ["12 pcs", "24 pcs"]),
 ("Wipro AG", "Marigold Garland 108 pcs", "Amazon Home", 199, 150, 4.2, 9800, ["54 pcs", "108 pcs"]),
 ("Amazon Basics", "Wall Art Canvas Print 18x24", "Amazon Home", 499, 500, 4.3, 9800, ["12x18", "18x24", "24x36"]),
 ("Amazon Basics", "Photo Frame Set 6 pcs", "Amazon Home", 299, 250, 4.2, 12000, ["4 pcs", "6 pcs"]),
 ("Sonar", "Wall Clock 12 inch", "Amazon Home", 599, 450, 4.3, 9800, ["9 inch", "12 inch"]),
 ("Casio", "Wall Clock 12 inch", "Amazon Home", 899, 700, 4.4, 7600, ["9 inch", "12 inch"]),
 ("Amazon Basics", "Storage Organizer Set 6 pcs", "Amazon Home", 799, 600, 4.3, 11000, ["3 pcs", "6 pcs", "9 pcs"]),
 ("Cello", "Storage Box 10 L", "Amazon Home", 299, 250, 4.2, 14000, ["5 L", "10 L", "20 L"]),
 ("Amazon Basics", "Storage Box 10 L", "Amazon Home", 349, 300, 4.2, 12000, ["5 L", "10 L", "20 L"]),
 ("Cello", "Mop 360 Spin", "Amazon Home", 999, 700, 4.2, 9800, ["Spin", "Bucket Combo"]),
 ("Cello", "Broom and Dustpan Set", "Amazon Home", 499, 300, 4.2, 12000, ["Broom", "Broom + Dustpan"]),
 ("Pidilite", "Mop", "Amazon Home", 349, 250, 4.2, 11000, ["Standard", "Microfiber"]),
 ("Amazon Basics", "Broom and Dustpan Set", "Amazon Home", 399, 250, 4.2, 9800, ["Standard", "Microfiber"]),
 ("Liril", "Floor Cleaner 1 L", "Amazon Home", 199, 80, 4.4, 18000, ["500 ml", "1 L"]),
 ("Lizol", "Floor Polish 500 ml", "Amazon Home", 249, 100, 4.4, 16000, ["500 ml"]),
 ("Vim", "Dishwash Liquid 750 ml", "Amazon Home", 249, 100, 4.4, 20000, ["375 ml", "750 ml"]),
 ("Surf Excel", "Liquid Detergent 1 L", "Amazon Home", 399, 150, 4.4, 22000, ["500 ml", "1 L"]),
 ("Harpic", "Toilet Cleaner 500 ml", "Amazon Home", 199, 80, 4.3, 18000, ["250 ml", "500 ml"]),
 ("Amazon Basics", "Garbage Bags 50 pcs", "Amazon Home", 249, 150, 4.2, 15000, ["25 pcs", "50 pcs", "100 pcs"]),
 ("Cello", "Garbage Bags 50 pcs", "Amazon Home", 199, 120, 4.2, 13000, ["25 pcs", "50 pcs"]),
 ("Amazon Basics", "Rubber Gloves 2 pcs", "Amazon Home", 199, 120, 4.2, 12000, ["1 pair", "2 pairs"]),
 ("Amazon Basics", "Hangers 20 pcs", "Amazon Home", 349, 200, 4.3, 15000, ["10 pcs", "20 pcs", "30 pcs"]),
 ("Cello", "Hangers 20 pcs", "Amazon Home", 299, 180, 4.2, 11000, ["10 pcs", "20 pcs"]),
 ("Amazon Basics", "Plant Pot 12 inch", "Amazon Home", 499, 400, 4.3, 9800, ["8 inch", "10 inch", "12 inch"]),
 ("Wipro AG", "Aromatherapy Diffuser 300 ml", "Amazon Home", 1299, 800, 4.3, 6800, ["300 ml", "500 ml"]),
 ("Philips", "Aromatherapy Diffuser", "Amazon Home", 1999, 1000, 4.4, 4600, ["300 ml", "500 ml"]),
 ("Amazon Basics", "Candle Jar Set 6 pcs", "Amazon Home", 399, 300, 4.2, 12000, ["3 pcs", "6 pcs"]),
 ("Triveni", "Table Cloth 60x120", "Amazon Home", 499, 400, 4.2, 9800, ["60x120", "60x140"]),
 ("Amazon Basics", "Table Cloth 60x120", "Amazon Home", 399, 350, 4.2, 8600, ["60x120", "60x140"]),
 ("Godrej", "Table Cloth 60x120", "Amazon Home", 799, 600, 4.3, 5400, ["60x120", "60x140"]),
]

R7 = [
# ================= JEWELLERY (AMAZON FASHION) =================
 ("GIVA", "22K Gold Bangles 10 g", "AMAZON FASHION", 78990, 30000, 4.5, 300, ["8 g", "10 g", "15 g", "20 g"]),
 ("GIVA", "22K Gold Chain 5 g", "AMAZON FASHION", 39990, 25000, 4.5, 200, ["3 g", "5 g", "8 g"]),
 ("GIVA", "22K Gold Choker Set 8 g", "AMAZON FASHION", 64990, 30000, 4.6, 120, ["8 g", "12 g", "16 g"]),
 ("GIVA", "22K Gold Pendant with Chain 3 g", "AMAZON FASHION", 25990, 10000, 4.5, 250, ["3 g", "5 g"]),
 ("GIVA", "22K Gold Coin 8 g", "AMAZON FASHION", 62990, 25000, 4.6, 90, ["8 g", "16 g"]),
 ("GIVA", "22K Gold Earring Studs 2 g", "AMAZON FASHION", 17990, 8000, 4.5, 300, ["2 g", "3 g"]),
 ("GIVA", "22K Gold Mangalsutra 4 g", "AMAZON FASHION", 34990, 15000, 4.6, 180, ["4 g", "6 g"]),
 ("2GOLD", "22K Gold Bangles 8 g", "AMAZON FASHION", 64990, 25000, 4.4, 150, ["8 g", "12 g", "16 g"]),
 ("2GOLD", "22K Gold Chain 5 g", "AMAZON FASHION", 38990, 20000, 4.4, 120, ["3 g", "5 g", "8 g"]),
 ("2GOLD", "22K Gold Earring Pair 1 g", "AMAZON FASHION", 9990, 4000, 4.4, 250, ["1 g", "2 g"]),
 ("2GOLD", "22K Gold Ankh 3 g", "AMAZON FASHION", 26990, 12000, 4.5, 150, ["3 g", "4 g"]),
 ("CaratLane", "22K Gold Diamond Earring Set", "AMAZON FASHION", 45990, 30000, 4.6, 300, ["3 g", "5 g", "8 g"]),
 ("CaratLane", "22K Gold Diamond Ring 5 g", "AMAZON FASHION", 44990, 28000, 4.6, 200, ["5 g", "8 g"]),
 ("CaratLane", "22K Gold Diamond Necklace 8 g", "AMAZON FASHION", 69990, 40000, 4.7, 120, ["8 g", "12 g"]),
 ("Bluestone", "22K Gold Necklace 10 g", "AMAZON FASHION", 79990, 35000, 4.6, 150, ["8 g", "10 g", "15 g"]),
 ("Bluestone", "22K Gold Earring 2 g", "AMAZON FASHION", 18990, 8000, 4.5, 250, ["2 g", "3 g"]),
 ("Bluestone", "22K Gold Bangles 12 g", "AMAZON FASHION", 94990, 35000, 4.6, 100, ["12 g", "16 g", "20 g"]),
 ("Nripendra", "22K Gold Temple Jewelry Set", "AMAZON FASHION", 89990, 50000, 4.7, 60, ["Light Set", "Full Set"]),
 ("Nripendra", "22K Gold Jhumka Earring 3 g", "AMAZON FASHION", 27990, 15000, 4.6, 120, ["3 g", "4 g"]),
 ("Malabar", "22K Gold Chain 8 g", "AMAZON FASHION", 62990, 30000, 4.5, 80, ["8 g", "12 g"]),
 ("Malabar", "22K Gold Bangles 12 g", "AMAZON FASHION", 94990, 40000, 4.6, 60, ["12 g", "16 g"]),
 ("Vepaas", "22K Gold Necklace 10 g", "AMAZON FASHION", 77990, 35000, 4.5, 90, ["10 g", "15 g"]),
 ("Vepaas", "925 Silver Bangles 24 g", "AMAZON FASHION", 2999, 1200, 4.4, 3800, ["24 g", "36 g"]),
 ("Vepaas", "925 Silver Necklace Set", "AMAZON FASHION", 3999, 1800, 4.4, 2800, ["Necklace", "Set with Earrings"]),
 ("GIVA", "925 Silver Choker 12 g", "AMAZON FASHION", 1499, 700, 4.4, 4200, ["12 g", "16 g"]),
 ("GIVA", "925 Silver Jhumka Earring", "AMAZON FASHION", 999, 500, 4.4, 5600, ["Single", "Pair"]),
 ("Malabar", "925 Silver Earring Pair", "AMAZON FASHION", 799, 400, 4.3, 3800, ["Pair"]),
 ("Aurelia", "Kundan Necklace Set", "AMAZON FASHION", 1299, 1500, 4.2, 6800, ["Light", "Heavy", "Bridal"]),
 ("Aurelia", "Polki Earring Set", "AMAZON FASHION", 999, 1200, 4.2, 5400, ["Light", "Heavy"]),
 ("Aurelia", "Bangle Set 6 pcs", "AMAZON FASHION", 499, 500, 4.2, 9800, ["6 pcs", "10 pcs"]),
 ("Meera", "Kundan Necklace Set", "AMAZON FASHION", 1499, 1800, 4.3, 4600, ["Light", "Heavy", "Bridal"]),
 ("Meera", "Bangle Set 10 pcs", "AMAZON FASHION", 599, 600, 4.2, 8600, ["6 pcs", "10 pcs"]),
 ("Myntra", "Kundan Necklace Set", "AMAZON FASHION", 999, 1200, 4.2, 9800, ["Light", "Heavy"]),
 ("Myntra", "Jhumka Earring", "AMAZON FASHION", 499, 500, 4.2, 12000, ["Pair"]),
 ("Myntra", "Bangle Set 10 pcs", "AMAZON FASHION", 399, 400, 4.1, 14000, ["6 pcs", "10 pcs"]),
 ("Rina Banerjee", "Polki Choker", "AMAZON FASHION", 1999, 2000, 4.3, 2400, ["Light", "Heavy"]),
 ("Rina Banerjee", "Temple Jewelry Set", "AMAZON FASHION", 2999, 3000, 4.4, 1200, ["Set"]),
 ("Global Desi", "Kundan Earring Set", "AMAZON FASHION", 699, 700, 4.2, 6800, ["Light", "Heavy"]),
 ("Global Desi", "Bangle Set 6 pcs", "AMAZON FASHION", 399, 400, 4.2, 9800, ["6 pcs", "10 pcs"]),
 ("Fabindia", "Silver Jhumka Earring", "AMAZON FASHION", 899, 500, 4.4, 1800, ["Pair"]),
 ("Fabindia", "Silver Necklace", "AMAZON FASHION", 1499, 1000, 4.4, 1400, ["Choker", "Long"]),
 ("Wills", "Pearl Necklace Set", "AMAZON FASHION", 1299, 1500, 4.2, 2800, ["Light", "Heavy"]),
# ================= KIDS, BABY & TOYS (Toys & Games / Baby) =================
 ("LEGO", "DUPLO Building Blocks 70 pcs", "Toys & Games", 1999, 1500, 4.7, 18000, ["70 pcs", "108 pcs"]),
 ("LEGO", "City Building Blocks 150 pcs", "Toys & Games", 2999, 3000, 4.7, 12000, ["150 pcs", "250 pcs"]),
 ("LEGO", "Friends Building Blocks 200 pcs", "Toys & Games", 3499, 3500, 4.7, 8600, ["200 pcs", "320 pcs"]),
 ("LEGO", "Technic Building Blocks 300 pcs", "Toys & Games", 5999, 6000, 4.7, 5400, ["300 pcs", "420 pcs"]),
 ("LEGO", "Building Blocks 500 pcs", "Toys & Games", 8999, 8000, 4.6, 4200, ["500 pcs", "750 pcs"]),
 ("Hasbro", "Monopoly Board Game", "Toys & Games", 1999, 800, 4.6, 9800, ["India Edition", "Classic"]),
 ("Hasbro", "Ludo King Board Game", "Toys & Games", 799, 400, 4.5, 12000, ["Classic", "Kids"]),
 ("Hasbro", "Barbie Doll with Accessories", "Toys & Games", 1499, 1000, 4.5, 8600, ["Classic", "Fashion"]),
 ("Nerf", "N-Strike Blaster", "Toys & Games", 1999, 1500, 4.6, 7600, ["Single", "Combo"]),
 ("Mattel", "Hot Wheels Car Set 20 pcs", "Toys & Games", 999, 600, 4.5, 11000, ["10 pcs", "20 pcs"]),
 ("Hot Wheels", "Die Cast Car 1 pc", "Toys & Games", 299, 200, 4.5, 14000, ["Single", "3 pcs"]),
 ("Matchbox", "Die Cast Car 1 pc", "Toys & Games", 249, 150, 4.4, 12000, ["Single", "3 pcs"]),
 ("Funskool", "RC Car 1:16", "Toys & Games", 999, 700, 4.3, 9800, ["1:16", "1:24"]),
 ("Funskool", "Board Game for Kids", "Toys & Games", 499, 300, 4.3, 8600, ["Ages 4+", "Ages 8+"]),
 ("Funskool", "Carrom Board", "Toys & Games", 999, 600, 4.4, 7400, ["Standard", "Pro"]),
 ("Shumee", "RC Helicopter", "Toys & Games", 799, 500, 4.2, 6800, ["Standard", "Pro"]),
 ("Shumee", "Building Blocks 300 pcs", "Toys & Games", 499, 400, 4.2, 8400, ["300 pcs", "500 pcs"]),
 ("VTech", "Learning Tablet for Kids", "Toys & Games", 2999, 2000, 4.4, 5400, ["Ages 3-6", "Ages 6-8"]),
 ("LeapFrog", "Learning Computer for Kids", "Toys & Games", 1999, 1500, 4.4, 4800, ["Ages 2-4", "Ages 4-6"]),
 ("UNO", "Card Game", "Toys & Games", 799, 350, 4.6, 15000, ["Classic", "Kids"]),
 ("Spin Master", "Padlets Building Blocks", "Toys & Games", 1499, 1000, 4.3, 4200, ["250 pcs", "500 pcs"]),
 ("Teddy", "Plush Teddy Bear 12 inch", "Toys & Games", 499, 400, 4.3, 18000, ["8 inch", "12 inch", "18 inch"]),
 ("Jumbo", "Plush Teddy Bear 12 inch", "Toys & Games", 399, 350, 4.2, 15000, ["8 inch", "12 inch"]),
 ("Chicco", "Stroller 3-in-1", "Baby", 14999, 8000, 4.5, 2400, ["3-in-1", "2-in-1"]),
 ("Chicco", "Car Seat 0-13 kg", "Baby", 8999, 5000, 4.5, 1800, ["0-13 kg", "9-36 kg"]),
 ("Chicco", "Baby Feeding Bottle 240 ml", "Baby", 799, 400, 4.4, 9800, ["160 ml", "240 ml"]),
 ("Chicco", "Baby Bath Tub", "Baby", 999, 600, 4.4, 6800, ["Standard", "Large"]),
 ("Babyhug", "Stroller 3-in-1", "Baby", 9999, 5000, 4.4, 1600, ["3-in-1", "2-in-1"]),
 ("Babyhug", "Car Seat 0-13 kg", "Baby", 5999, 3000, 4.4, 1200, ["0-13 kg", "9-36 kg"]),
 ("Kidder", "Stroller 2-in-1", "Baby", 4999, 3000, 4.3, 2800, ["2-in-1"]),
 ("Kidder", "Car Seat 0-13 kg", "Baby", 3999, 2000, 4.3, 1800, ["0-13 kg"]),
 ("Pigeon", "Baby Feeding Bottle 240 ml", "Baby", 449, 250, 4.4, 25000, ["160 ml", "240 ml"]),
 ("Pigeon", "Baby Spoon Set 4 pcs", "Baby", 299, 150, 4.3, 18000, ["4 pcs", "6 pcs"]),
 ("Pigeon", "Baby Bib 2 pcs", "Baby", 199, 100, 4.3, 15000, ["2 pcs", "3 pcs"]),
 ("Dr. Brown's", "Feeding Bottle 160 ml", "Baby", 899, 400, 4.5, 12000, ["160 ml", "270 ml"]),
 ("Tommee Tippee", "Feeding Bottle 150 ml", "Baby", 599, 300, 4.4, 9800, ["150 ml", "260 ml"]),
 ("Philips Avent", "Feeding Bottle 150 ml", "Baby", 699, 350, 4.4, 11000, ["150 ml", "270 ml"]),
 ("Comotomo", "Feeding Bottle 150 ml", "Baby", 799, 400, 4.4, 8600, ["150 ml", "250 ml"]),
 ("NUK", "Feeding Bottle 150 ml", "Baby", 549, 300, 4.3, 7600, ["150 ml", "240 ml"]),
 ("Babyhug", "Diaper Bag", "Baby", 1499, 900, 4.3, 5400, ["Standard", "Pro"]),
 ("Chicco", "Baby Shoes 0-6 M", "Baby", 499, 300, 4.3, 8600, ["0-6 M", "6-12 M", "12-18 M"]),
 ("Kidder", "Baby Shoes 0-6 M", "Baby", 399, 250, 4.2, 7400, ["0-6 M", "6-12 M"]),
 ("Pigeon", "Baby Night Light", "Baby", 799, 500, 4.3, 6800, ["Standard", "Projector"]),
 ("Chicco", "Baby Teether", "Baby", 349, 200, 4.3, 9800, ["Single", "2 pcs"]),
 ("Kidder", "Baby Play Mat", "Baby", 999, 700, 4.3, 4800, ["Small", "Large"]),
 ("Babyhug", "Baby Bath Seat", "Baby", 799, 500, 4.3, 5600, ["Standard"]),
 ("Skybags", "School Bag for Boys 3-5 yrs", "Toys & Games", 999, 700, 4.3, 6800, ["3-5 yrs", "6-8 yrs"]),
 ("American Tourister", "School Bag for Boys 6-8 yrs", "Toys & Games", 1999, 1500, 4.4, 4200, ["6-8 yrs", "9-12 yrs"]),
 ("Fastrack", "School Bag for Girls", "Toys & Games", 899, 700, 4.3, 8600, ["3-5 yrs", "6-8 yrs"]),
 ("Wildcraft", "School Bag for Boys", "Toys & Games", 1199, 900, 4.3, 6400, ["6-8 yrs", "9-12 yrs"]),
 ("Maped", "School Bag for Kids", "Toys & Games", 799, 600, 4.3, 7600, ["3-5 yrs", "6-8 yrs"]),
 ("Camlin", "Crayons 36 colors", "Toys & Games", 199, 100, 4.4, 18000, ["12 colors", "36 colors"]),
 ("Camlin", "Sketch Pens 24 colors", "Toys & Games", 299, 150, 4.4, 12000, ["12 colors", "24 colors"]),
 ("Camlin", "Drawing Book A4", "Toys & Games", 99, 50, 4.3, 15000, ["A4", "A3"]),
 ("Faber-Castell", "Color Pencil 12 colors", "Toys & Games", 299, 150, 4.5, 14000, ["12 colors", "24 colors"]),
 ("Faber-Castell", "Sketch Pens 24 colors", "Toys & Games", 399, 200, 4.5, 10000, ["12 colors", "24 colors"]),
 ("Dawa", "Color Pencil 12 colors", "Toys & Games", 199, 100, 4.4, 12000, ["12 colors", "24 colors"]),
 ("Maped", "Scissors for Kids", "Toys & Games", 199, 100, 4.3, 8600, ["Standard"]),
 ("Parker", "Gel Ink Pen", "Office Products", 199, 150, 4.5, 15000, ["Black", "Blue", "Red"]),
 ("Parker", "Ballpoint Pen 1000000", "Office Products", 2495, 800, 4.6, 4800, ["Single", "2 pcs"]),
 ("Parker", "Fountain Pen", "Office Products", 1499, 1500, 4.5, 3800, ["Standard", "Premium"]),
 ("Camlin", "Ballpoint Pen 500", "Office Products", 29, 10, 4.3, 20000, ["Blue", "Black", "Red"]),
 ("Faber-Castell", "Ballpoint Pen", "Office Products", 49, 20, 4.4, 18000, ["Blue", "Black", "Red"]),
 ("Dawa", "Ballpoint Pen", "Office Products", 29, 10, 4.3, 16000, ["Blue", "Black", "Red"]),
 ("Cello", "Tape 24 mm", "Office Products", 49, 20, 4.3, 18000, ["24 mm", "12 mm"]),
 ("Staedtler", "Marker 20 colors", "Office Products", 499, 300, 4.5, 5600, ["12 colors", "20 colors"]),
 ("Pilot", "Gel Ink Pen", "Office Products", 149, 80, 4.4, 9800, ["Black", "Blue", "Red"]),
# ================= SPORTS, FITNESS & HOBBIES (Sports & Outdoors) =================
 ("SG", "Cricket Bat English Willow", "Sports & Outdoors", 7999, 5000, 4.5, 4200, ["Senior", "Junior"]),
 ("SG", "Cricket Bat Kashmir Willow", "Sports & Outdoors", 2999, 2000, 4.4, 8600, ["Senior", "Junior"]),
 ("SG", "Cricket Ball Leather", "Sports & Outdoors", 999, 500, 4.4, 9800, ["40 g", "156 g"]),
 ("SG", "Cricket Stumps", "Sports & Outdoors", 1499, 900, 4.3, 4800, ["Standard"]),
 ("SG", "Cricket Batting Gloves", "Sports & Outdoors", 999, 600, 4.4, 7600, ["S", "M", "L"]),
 ("SG", "Cricket Pads", "Sports & Outdoors", 1499, 900, 4.3, 5600, ["S", "M", "L"]),
 ("Kookaburra", "Cricket Bat", "Sports & Outdoors", 4999, 4000, 4.5, 3400, ["Senior", "Junior"]),
 ("SS", "Cricket Bat Kashmir Willow", "Sports & Outdoors", 1999, 1500, 4.3, 6800, ["Senior", "Junior"]),
 ("Grindwell", "Cricket Bat Kashmir Willow", "Sports & Outdoors", 1499, 1000, 4.3, 7400, ["Senior", "Junior"]),
 ("Saregama", "Cricket Bat", "Sports & Outdoors", 999, 800, 4.2, 8600, ["Senior", "Junior"]),
 ("Yonex", "Badminton Racket", "Sports & Outdoors", 2999, 4000, 4.5, 8600, ["NR-100", "NR-7000", "ASTROX 88D"]),
 ("Yonex", "Badminton Shuttlecock 3 pcs", "Sports & Outdoors", 449, 250, 4.4, 15000, ["3 pcs", "6 pcs"]),
 ("Yonex", "Badminton Strings", "Sports & Outdoors", 599, 300, 4.4, 8600, ["Single"]),
 ("Li-Ning", "Badminton Racket", "Sports & Outdoors", 1499, 2500, 4.4, 6800, ["Standard", "Pro"]),
 ("Slazenger", "Badminton Racket", "Sports & Outdoors", 999, 1500, 4.3, 7600, ["Standard", "Pro"]),
 ("Sikkim", "Badminton Racket", "Sports & Outdoors", 699, 800, 4.2, 9800, ["Standard"]),
 ("Babolat", "Tennis Racket", "Sports & Outdoors", 3999, 4000, 4.5, 3400, ["Pure Aero", "Pure Drive"]),
 ("Head", "Tennis Racket", "Sports & Outdoors", 2999, 3500, 4.5, 4200, ["Speed", "Graphene"]),
 ("Wilson", "Tennis Racket", "Sports & Outdoors", 2499, 3000, 4.4, 4800, ["Blaze", "Clash"]),
 ("Slazenger", "Tennis Racket", "Sports & Outdoors", 1299, 1500, 4.3, 6800, ["Standard"]),
 ("Nike", "Football Size 5", "Sports & Outdoors", 1499, 900, 4.4, 12000, ["Size 3", "Size 4", "Size 5"]),
 ("Adidas", "Football Size 5", "Sports & Outdoors", 1299, 800, 4.4, 11000, ["Size 3", "Size 4", "Size 5"]),
 ("Kappa", "Football Size 5", "Sports & Outdoors", 799, 500, 4.3, 9800, ["Size 3", "Size 4", "Size 5"]),
 ("Slazenger", "Football Size 5", "Sports & Outdoors", 599, 400, 4.3, 10000, ["Size 3", "Size 4", "Size 5"]),
 ("Nike", "Basketball Size 7", "Sports & Outdoors", 1999, 1200, 4.4, 6800, ["Size 6", "Size 7"]),
 ("Adidas", "Basketball Size 7", "Sports & Outdoors", 1799, 1100, 4.4, 7400, ["Size 6", "Size 7"]),
 ("Spalding", "Basketball Size 7", "Sports & Outdoors", 1299, 800, 4.3, 5600, ["Size 6", "Size 7"]),
 ("NAZ", "Dumbbell 5 kg", "Sports & Outdoors", 799, 400, 4.3, 15000, ["2.5 kg", "5 kg", "7.5 kg", "10 kg"]),
 ("NAZ", "Dumbbell Pair 5 kg", "Sports & Outdoors", 1299, 700, 4.3, 9800, ["5 kg", "7.5 kg", "10 kg"]),
 ("PowerMax", "Dumbbell 5 kg", "Sports & Outdoors", 699, 400, 4.2, 12000, ["2.5 kg", "5 kg", "7.5 kg", "10 kg"]),
 ("PowerMax", "Adjustable Dumbbell 24 kg", "Sports & Outdoors", 12999, 6000, 4.4, 3400, ["12 kg", "24 kg"]),
 ("OSPEY", "Dumbbell 5 kg", "Sports & Outdoors", 599, 350, 4.2, 9800, ["2.5 kg", "5 kg", "7.5 kg", "10 kg"]),
 ("Decathlon", "Dumbbell 5 kg", "Sports & Outdoors", 699, 400, 4.3, 8600, ["2.5 kg", "5 kg", "7.5 kg", "10 kg"]),
 ("Jade", "Yoga Harmony Mat 6 mm", "Sports & Outdoors", 8990, 3000, 4.6, 1900, ["6 mm", "4 mm"]),
 ("Yogen", "Yoga Mat 5 mm", "Sports & Outdoors", 999, 600, 4.3, 18000, ["4 mm", "5 mm", "6 mm"]),
 ("ProSource", "Yoga Mat 6 mm", "Sports & Outdoors", 1499, 800, 4.3, 8600, ["4 mm", "6 mm"]),
 ("Balance", "Yoga Mat 4 mm", "Sports & Outdoors", 799, 450, 4.2, 15000, ["4 mm", "6 mm"]),
 ("Yogen", "Foam Roller", "Sports & Outdoors", 799, 500, 4.3, 9800, ["Standard"]),
 ("Yogen", "Yoga Block Pair", "Sports & Outdoors", 499, 250, 4.3, 8600, ["Pair"]),
 ("PowerMax", "Resistance Bands 5 pcs", "Sports & Outdoors", 799, 500, 4.3, 9800, ["Set"]),
 ("OSPEY", "Skipping Rope", "Sports & Outdoors", 399, 250, 4.2, 12000, ["Standard"]),
 ("PowerMax", "Foam Roller", "Sports & Outdoors", 999, 600, 4.3, 6800, ["Standard"]),
 ("PowerMax", "Treadmill 1200 W", "Sports & Outdoors", 34999, 25000, 4.3, 1800, ["1200 W", "1600 W"]),
 ("Schwinn", "Treadmill 1400 W", "Sports & Outdoors", 44999, 25000, 4.4, 1200, ["1400 W", "1800 W"]),
 ("Nautilus", "Treadmill 1800 W", "Sports & Outdoors", 79999, 30000, 4.5, 500, ["1800 W", "2200 W"]),
 ("PowerMax", "Rowing Machine", "Sports & Outdoors", 24999, 15000, 4.3, 900, ["Standard"]),
 ("PowerMax", "Kettlebell 16 kg", "Sports & Outdoors", 2999, 1500, 4.3, 3800, ["8 kg", "12 kg", "16 kg"]),
 ("OSPEY", "Pull Up Bar Doorway", "Sports & Outdoors", 1499, 900, 4.3, 6800, ["Standard"]),
 ("Herfy", "Mountain Bike 26 inch", "Sports & Outdoors", 7999, 4000, 4.3, 2400, ["26 inch", "27.5 inch"]),
 ("Decathlon", "Mountain Bike 27.5 inch", "Sports & Outdoors", 9999, 6000, 4.4, 1800, ["26 inch", "27.5 inch"]),
 ("Hero", "Mountain Bike 26 inch", "Sports & Outdoors", 6999, 4000, 4.3, 2800, ["26 inch", "27.5 inch"]),
 ("Herfy", "Kids Bicycle 20 inch", "Sports & Outdoors", 3999, 2500, 4.3, 2400, ["16 inch", "20 inch"]),
 ("OSPEY", "Cycling Helmet", "Sports & Outdoors", 799, 500, 4.3, 6800, ["S", "M", "L"]),
 ("OSPEY", "Cycling Gloves", "Sports & Outdoors", 399, 250, 4.2, 8600, ["S", "M", "L"]),
 ("Yogen", "Swimming Goggles", "Sports & Outdoors", 399, 250, 4.2, 9800, ["Standard"]),
 ("Speedo", "Swimming Goggles", "Sports & Outdoors", 799, 450, 4.4, 5600, ["Standard"]),
]

R8 = [
# ================= ELECTRONICS & SMART HOME (All Electronics / Computers) =================
 ("TP-Link", "Archer C6 Router", "All Electronics", 2999, 2000, 4.4, 25000, ["Archer C6", "Archer C80"]),
 ("TP-Link", "Archer AX55 Router WiFi 6", "All Electronics", 4999, 2500, 4.5, 8600, ["AX55", "AX73"]),
 ("Jio", "Router WiFi 6", "All Electronics", 2999, 1500, 4.3, 12000, ["WiFi 5", "WiFi 6"]),
 ("Airtel", "Router WiFi 5", "All Electronics", 1999, 1000, 4.3, 10000, ["WiFi 5"]),
 ("Mercusys", "Router AX3000 WiFi 6", "All Electronics", 2499, 1200, 4.3, 6800, ["AX3000", "AX6000"]),
 ("Tenda", "Router AX1500 WiFi 6", "All Electronics", 1999, 1000, 4.2, 7600, ["AX1500"]),
 ("D-Link", "Router DIR-X1860 WiFi 6", "All Electronics", 3999, 2000, 4.3, 5400, ["DIR-X1860"]),
 ("Xiaomi", "Mi Router 4A", "All Electronics", 1299, 600, 4.3, 15000, ["Mi Router 4A", "Mi Router 4C"]),
 ("Xiaomi", "Mi TV Stick 4K", "All Electronics", 2999, 1500, 4.4, 18000, ["Mi TV Stick 4K", "Mi TV Stick"]),
 ("Jio", "Xstream Fiber TV Stick", "All Electronics", 1499, 900, 4.3, 8600, ["Xstream", "Xstream Pro"]),
 ("Airtel", "Xstream Fiber TV Stick", "All Electronics", 999, 600, 4.2, 7400, ["Xstream", "Xstream Pro"]),
 ("Amazon", "Fire TV Stick 4K", "All Electronics", 4999, 2000, 4.5, 15000, ["Fire TV Stick 4K", "Fire TV Stick Lite"]),
 ("TP-Link", "Tapo CCTV Camera 1080p", "All Electronics", 2499, 2500, 4.4, 12000, ["1080p", "2K", "3K"]),
 ("Imou", "CCTV Camera 1080p", "All Electronics", 1999, 2000, 4.3, 9800, ["1080p", "2K"]),
 ("Ezviz", "CCTV Camera 1080p", "All Electronics", 1499, 1500, 4.3, 8600, ["1080p", "2K"]),
 ("Jio", "CCTV Camera 1080p", "All Electronics", 1999, 1200, 4.2, 7600, ["1080p"]),
 ("Airtel", "CCTV Camera 1080p", "All Electronics", 1799, 1000, 4.2, 6400, ["1080p"]),
 ("Xiaomi", "CCTV Camera 1080p", "All Electronics", 1999, 1500, 4.3, 9800, ["1080p", "2K"]),
 ("Hikvision", "CCTV Camera 2K", "All Electronics", 3499, 2500, 4.4, 5400, ["2K", "4K"]),
 ("TP-Link", "Tapo Doorbell", "All Electronics", 4999, 2500, 4.3, 3800, ["Standard"]),
 ("Wipro AG", "Smart Bulb 9 W", "All Electronics", 249, 150, 4.3, 18000, ["4 W", "9 W", "12 W"]),
 ("Philips", "Hue Smart Bulb 8 W", "All Electronics", 1499, 800, 4.5, 6800, ["8 W", "12 W"]),
 ("Syska", "Smart Bulb 9 W", "All Electronics", 199, 120, 4.3, 14000, ["4 W", "9 W"]),
 ("Amazon Basics", "Smart Bulb 9 W", "All Electronics", 149, 100, 4.2, 16000, ["4 W", "9 W"]),
 ("Luminous", "ZRP 1100 Inverter 1100 VA", "All Electronics", 19999, 15000, 4.4, 8600, ["900 VA", "1100 VA", "1500 VA"]),
 ("Microtek", "Elite 1100 Inverter", "All Electronics", 17999, 14000, 4.4, 6800, ["900 VA", "1100 VA", "1500 VA"]),
 ("Su-Kam", "Inverter 1100 VA", "All Electronics", 18999, 15000, 4.4, 5400, ["900 VA", "1100 VA", "1500 VA"]),
 ("Crompton", "Inverter 1100 VA", "All Electronics", 16999, 13000, 4.3, 4800, ["900 VA", "1100 VA"]),
 ("Hinncean", "Inverter 1100 VA", "All Electronics", 12999, 9000, 4.3, 5600, ["900 VA", "1100 VA"]),
 ("V-Guard", "Inverter 1100 VA", "All Electronics", 17999, 14000, 4.4, 4200, ["900 VA", "1100 VA"]),
 ("Exide", "Inverter Tubular Battery 150 Ah", "All Electronics", 14999, 6000, 4.4, 6800, ["100 Ah", "150 Ah", "200 Ah"]),
 ("Amara Raja", "Inverter Tubular Battery 150 Ah", "All Electronics", 13999, 5500, 4.4, 7600, ["100 Ah", "150 Ah", "200 Ah"]),
 ("Luminous", "Inverter Tubular Battery 150 Ah", "All Electronics", 15999, 7000, 4.4, 5400, ["100 Ah", "150 Ah", "200 Ah"]),
 ("V-Guard", "Voltage Stabilizer 3000 VA", "All Electronics", 1999, 1200, 4.3, 9800, ["2000 VA", "3000 VA", "5000 VA"]),
 ("Hinncean", "Voltage Stabilizer 3000 VA", "All Electronics", 1499, 900, 4.3, 8600, ["2000 VA", "3000 VA", "5000 VA"]),
 ("Crompton", "Voltage Stabilizer 3000 VA", "All Electronics", 1799, 1100, 4.3, 7400, ["2000 VA", "3000 VA"]),
 ("Microtek", "Voltage Stabilizer 3000 VA", "All Electronics", 1699, 1000, 4.3, 6800, ["2000 VA", "3000 VA"]),
 ("boAt", "Soundbar 40 W", "All Electronics", 7999, 4000, 4.3, 4200, ["40 W", "60 W"]),
 ("JBL", "Bar 2.0 Soundbar", "All Electronics", 14999, 8000, 4.4, 3800, ["Bar 2.0", "Bar 5.1"]),
 ("Sony", "HT-S20R Soundbar", "All Electronics", 19990, 10000, 4.5, 2400, ["HT-S20R", "HT-S40R"]),
 ("Samsung", "HW-D750 Soundbar", "All Electronics", 12990, 7000, 4.4, 2800, ["HW-D750", "HW-Q600"]),
 ("LG", "SP8 Soundbar 5.1.2", "All Electronics", 24990, 12000, 4.5, 1400, ["SP8", "SP11RA"]),
 ("boAt", "Stone 1100 Bluetooth Speaker", "All Electronics", 1999, 1200, 4.3, 18000, ["Stone 451", "Stone 1100", "Stone 1200"]),
 ("JBL", "Go 4 Bluetooth Speaker", "All Electronics", 4999, 2500, 4.5, 9800, ["Go 4", "Go 3"]),
 ("JBL", "Charge 5 Bluetooth Speaker", "All Electronics", 9999, 5000, 4.5, 6800, ["Charge 5"]),
 ("Sony", "SRS-XB23 Bluetooth Speaker", "All Electronics", 4999, 2500, 4.4, 8600, ["SRS-XB23"]),
 ("Portronics", "Sounddrum 120 Speaker", "All Electronics", 1499, 900, 4.2, 9800, ["120", "220"]),
 ("Soundcore", "Motion Boom 2 Speaker", "All Electronics", 6999, 3500, 4.4, 5400, ["Motion Boom 2"]),
 ("boAt", "Airdopes 311 Pro True Wireless Earbuds", "All Electronics", 1299, 600, 4.3, 45000, ["Airdopes 141", "Airdopes 311 Pro", "Airdopes 441 Evo"]),
 ("JBL", "Wave Beam True Wireless Earbuds", "All Electronics", 1499, 700, 4.3, 25000, ["Wave Beam", "T225TWS"]),
 ("Noise", "Buds VS105 True Wireless Earbuds", "All Electronics", 999, 500, 4.2, 18000, ["VS105", "VS108"]),
 ("Realme", "Buds 3 True Wireless Earbuds", "All Electronics", 4499, 2000, 4.4, 6800, ["Buds 3", "Buds Air 3"]),
 ("OnePlus", "Buds 3 True Wireless Earbuds", "All Electronics", 4999, 2500, 4.5, 8600, ["Buds 3", "Buds Pro 2"]),
 ("Nothing", "Ear (a) True Wireless Earbuds", "All Electronics", 4999, 2500, 4.4, 9800, ["Ear (a)", "Ear (2)"]),
 ("HP", "24 inch FHD Monitor", "Computers", 14990, 8000, 4.4, 8600, ["24 inch IPS", "27 inch IPS"]),
 ("Dell", "24 inch FHD Monitor", "Computers", 15990, 8500, 4.4, 7400, ["24 inch IPS", "27 inch IPS"]),
 ("LG", "27 inch QHD Monitor", "Computers", 24990, 12000, 4.5, 4200, ["27 inch QHD", "32 inch QHD"]),
 ("Samsung", "27 inch FHD Monitor", "Computers", 18990, 9000, 4.5, 5400, ["27 inch FHD", "32 inch FHD"]),
 ("BenQ", "27 inch QHD Monitor", "Computers", 29990, 14000, 4.5, 2800, ["27 inch QHD", "32 inch QHD"]),
 ("Xiaomi", "27 inch FHD Monitor", "Computers", 14999, 8000, 4.4, 6800, ["27 inch FHD"]),
 ("WD", "1 TB SSD NVMe", "Computers", 4999, 3000, 4.6, 25000, ["512 GB", "1 TB", "2 TB"]),
 ("Samsung", "980 1 TB SSD NVMe", "Computers", 5499, 3500, 4.6, 18000, ["512 GB", "1 TB", "2 TB"]),
 ("Kingston", "NV2 1 TB SSD", "Computers", 3999, 2500, 4.5, 15000, ["512 GB", "1 TB", "2 TB"]),
 ("Crucial", "P3 Plus 1 TB SSD", "Computers", 4499, 2800, 4.5, 12000, ["512 GB", "1 TB", "2 TB"]),
 ("WD", "2 TB External Hard Drive", "Computers", 8999, 4500, 4.5, 9800, ["1 TB", "2 TB"]),
 ("Seagate", "2 TB External Hard Drive", "Computers", 8499, 4200, 4.4, 8600, ["1 TB", "2 TB"]),
 ("boAt", "Energy 27000 mAh Power Bank", "Computers", 1999, 1200, 4.3, 18000, ["10200 mAh", "20000 mAh", "27000 mAh"]),
 ("Ambrane", "20000 mAh Power Bank", "Computers", 1499, 900, 4.3, 15000, ["10000 mAh", "20000 mAh"]),
 ("Xiaomi", "Power Bank 20000 mAh", "Computers", 1999, 1000, 4.4, 16000, ["10000 mAh", "20000 mAh"]),
 ("Anker", "PowerCore 20000 mAh", "Computers", 3999, 2000, 4.5, 8600, ["10000 mAh", "20000 mAh"]),
 ("Portronics", "Power Pro 20000 mAh", "Computers", 1299, 700, 4.2, 12000, ["10000 mAh", "20000 mAh"]),
 ("Logitech", "M185 Mouse", "Computers", 799, 500, 4.4, 18000, ["Black", "White", "Pink"]),
 ("Logitech", "K120 Keyboard", "Computers", 999, 600, 4.4, 15000, ["Black"]),
 ("Logitech", "Brio 500 Webcam 1080p", "Computers", 3999, 2000, 4.4, 8600, ["Brio 500"]),
 ("HP", "Webcam 1080p", "Computers", 1999, 1200, 4.3, 9800, ["1080p"]),
 ("Dell", "Webcam 1080p", "Computers", 2499, 1500, 4.3, 6800, ["1080p"]),
 ("Anker", "Powerline Webcam 1080p", "Computers", 1999, 1200, 4.3, 5400, ["1080p"]),
 ("Logitech", "G203 Gaming Mouse", "Computers", 1499, 900, 4.5, 12000, ["Black", "White"]),
 ("Logitech", "G213 Gaming Keyboard", "Computers", 3499, 2000, 4.5, 8600, ["Black", "White"]),
 ("HP", "Gaming Mouse", "Computers", 1299, 800, 4.4, 9800, ["Black"]),
 ("HP", "Gaming Keyboard", "Computers", 2499, 1500, 4.4, 7600, ["Black"]),
 ("Microsoft", "Surface Arc Mouse", "Computers", 2499, 1200, 4.4, 5400, ["White"]),
 ("boAt", "Rockers 450 On-Ear Headphones", "All Electronics", 2499, 1200, 4.3, 45000, ["Rockerz 301", "Rockerz 400", "Rockerz 500"]),
 ("Sony", "WH-CH520 Wireless Headphones", "All Electronics", 3490, 1800, 4.4, 12000, ["WH-CH520", "WH-CH720N"]),
 ("JBL", "Tune 510BT Headphones", "All Electronics", 3999, 2000, 4.3, 15000, ["Tune 510BT", "Tune 720BTNC"]),
 ("boAt", "Airdopes 141 True Wireless Earbuds", "All Electronics", 999, 500, 4.2, 98000, ["Airdopes 131", "Airdopes 141", "Airdopes 141 Pro"]),
# ================= AUTOMOTIVE & BIKE (Automotive) =================
 ("Jio", "Dash Cam 1080p", "Automotive", 1999, 1200, 4.3, 9800, ["1080p", "1440p"]),
 ("Airtel", "Dash Cam 1080p", "Automotive", 2499, 1500, 4.3, 6800, ["1080p"]),
 ("TP-Link", "Tapo Dash Cam 1080p", "Automotive", 2999, 1800, 4.4, 5400, ["1080p", "2K"]),
 ("Vio", "Dash Cam 1080p", "Automotive", 1499, 900, 4.2, 8600, ["1080p"]),
 ("Amazon Basics", "Car Phone Holder", "Automotive", 499, 350, 4.3, 18000, ["Standard", "Pro"]),
 ("iOttie", "Car Phone Holder", "Automotive", 999, 600, 4.4, 9800, ["Standard", "Pro"]),
 ("boAt", "Car Bluetooth Speaker 20 W", "Automotive", 1999, 1200, 4.3, 8600, ["20 W", "40 W"]),
 ("JBL", "Car Speaker 5.25 inch", "Automotive", 3999, 2500, 4.4, 5400, ["5.25 inch", "6.5 inch"]),
 ("Sony", "Car Speaker 5.25 inch", "Automotive", 4499, 2800, 4.4, 4200, ["5.25 inch", "6.5 inch"]),
 ("Portronics", "Car Audio Head Unit", "Automotive", 4999, 3000, 4.3, 3800, ["Standard", "Pro"]),
 ("Amazon Basics", "Car Floor Mat Set", "Automotive", 1999, 1200, 4.3, 12000, ["4 pcs", "6 pcs"]),
 ("Amazon Basics", "Seat Cover Set", "Automotive", 2999, 2000, 4.3, 9800, ["4 seats", "6 seats"]),
 ("Amazon Basics", "Car Perfume", "Automotive", 249, 150, 4.2, 15000, ["Single", "2 pcs"]),
 ("Amazon Basics", "Tire Inflator 12V", "Automotive", 1499, 900, 4.3, 8600, ["Standard", "Pro"]),
 ("Amazon Basics", "Car Tool Kit 45 pcs", "Automotive", 999, 600, 4.3, 9800, ["28 pcs", "45 pcs"]),
 ("Stello", "Full Face Helmet", "Automotive", 1499, 900, 4.3, 9800, ["S", "M", "L", "XL"]),
 ("KYT", "Full Face Helmet", "Automotive", 1999, 1300, 4.4, 7600, ["S", "M", "L", "XL"]),
 ("Regal", "Open Face Helmet", "Automotive", 799, 500, 4.2, 9800, ["S", "M", "L"]),
 ("Galaxy", "Open Face Helmet", "Automotive", 599, 400, 4.2, 11000, ["S", "M", "L"]),
 ("Stilo", "Full Face Helmet", "Automotive", 1299, 800, 4.3, 6800, ["S", "M", "L", "XL"]),
 ("Amazon Basics", "Bike Gloves", "Automotive", 399, 250, 4.2, 9800, ["S", "M", "L"]),
 ("Amazon Basics", "Bike Cover", "Automotive", 599, 350, 4.2, 8600, ["Standard", "Large"]),
 ("Amazon Basics", "Bike Chain Lubricant", "Automotive", 299, 150, 4.3, 7600, ["250 ml"]),
 ("Amazon Basics", "Bike Lock", "Automotive", 499, 300, 4.3, 6800, ["Standard"]),
 ("Amazon Basics", "Bike GPS Tracker", "Automotive", 999, 600, 4.2, 4800, ["Standard"]),
# ================= OFFICE (Office Products / Amazon Home) =================
 ("Livmax", "Executive Office Chair", "Office Products", 12999, 15000, 4.4, 5400, ["Mesh", "Executive"]),
 ("Godrej", "Office Chair", "Office Products", 8999, 8000, 4.3, 3800, ["Standard", "Executive"]),
 ("Flexi", "Ergonomic Office Chair", "Office Products", 14999, 16000, 4.4, 3200, ["Mesh", "Executive"]),
 ("Ergo", "Office Chair", "Office Products", 9999, 10000, 4.3, 2800, ["Standard"]),
 ("Amazon Basics", "Office Chair", "Office Products", 4999, 5000, 4.2, 9800, ["Standard"]),
 ("Amazon Basics", "Study Table 120 cm", "Office Products", 9999, 7000, 4.3, 4200, ["120 cm", "150 cm"]),
 ("Dureva", "Study Table 120 cm", "Office Products", 11999, 9000, 4.4, 2800, ["120 cm", "150 cm"]),
 ("Amazon Basics", "File Cabinet 4 Drawer", "Office Products", 3999, 3000, 4.2, 3800, ["4 Drawer", "5 Drawer"]),
 ("Godrej", "File Cabinet 4 Drawer", "Office Products", 5999, 4500, 4.3, 2400, ["4 Drawer", "5 Drawer"]),
 ("Parker", "Pen Set 4 pcs", "Office Products", 799, 500, 4.5, 8600, ["4 pcs", "8 pcs"]),
 ("Camlin", "Sketch Pen Set 24 colors", "Office Products", 299, 150, 4.4, 12000, ["12 colors", "24 colors"]),
 ("Faber-Castell", "Sketch Pen Set 24 colors", "Office Products", 399, 200, 4.5, 9800, ["12 colors", "24 colors"]),
 ("Dawa", "Sketch Pen Set 24 colors", "Office Products", 249, 120, 4.4, 8600, ["12 colors", "24 colors"]),
 ("Cello", "Whiteboard 120x90 cm", "Office Products", 1499, 1000, 4.3, 5400, ["120x90 cm", "180x120 cm"]),
 ("Amazon Basics", "Whiteboard Markers 4 pcs", "Office Products", 199, 100, 4.3, 9800, ["4 pcs", "8 pcs"]),
 ("3M", "Post-it Notes 100 sheets", "Office Products", 99, 50, 4.5, 18000, ["100 sheets", "200 sheets"]),
 ("Amazon Basics", "Planner A5", "Office Products", 399, 250, 4.3, 8600, ["A5", "A4"]),
 ("Cello", "Stapler 10 mm", "Office Products", 199, 100, 4.3, 12000, ["Standard"]),
 ("Amazon Basics", "Stapler 10 mm", "Office Products", 149, 80, 4.2, 10000, ["Standard"]),
 ("Cello", "Staples 10 mm 1000 pcs", "Office Products", 99, 50, 4.3, 12000, ["1000 pcs"]),
 ("Amazon Basics", "File Set 10 pcs", "Office Products", 199, 120, 4.3, 9800, ["10 pcs", "20 pcs"]),
 ("Whitsun", "File Organizer", "Office Products", 499, 300, 4.3, 5400, ["Standard"]),
 ("Maped", "Pencil Case", "Office Products", 199, 100, 4.3, 9800, ["Standard"]),
 ("Staedtler", "Pencil Case", "Office Products", 249, 150, 4.4, 6800, ["Standard"]),
 ("Casio", "Calculator FX-991ES Plus", "Office Products", 1999, 1000, 4.6, 15000, ["FX-991ES Plus"]),
 ("Canon", "Calculator FX-991ES Plus", "Office Products", 1799, 900, 4.5, 12000, ["FX-991ES Plus"]),
# ================= PET SUPPLIES (Pet Supplies) =================
 ("True Instinct", "Dog Food 3 kg", "Pet Supplies", 1999, 1200, 4.3, 8600, ["1 kg", "3 kg", "6 kg"]),
 ("True Instinct", "Cat Food 1.2 kg", "Pet Supplies", 1499, 900, 4.3, 6800, ["500 g", "1.2 kg"]),
 ("Purina", "Dog Food 3 kg", "Pet Supplies", 2499, 1500, 4.4, 7600, ["1 kg", "3 kg", "6 kg"]),
 ("Purina", "Cat Food 1.2 kg", "Pet Supplies", 1999, 1200, 4.4, 5400, ["500 g", "1.2 kg"]),
 ("Royal Canin", "Dog Food 3 kg", "Pet Supplies", 3999, 2500, 4.5, 4200, ["1 kg", "3 kg"]),
 ("Royal Canin", "Cat Food 1.2 kg", "Pet Supplies", 3499, 2200, 4.5, 3400, ["500 g", "1.2 kg"]),
 ("Whiskas", "Cat Food 1.2 kg", "Pet Supplies", 999, 600, 4.2, 9800, ["500 g", "1.2 kg"]),
 ("Sakhana", "Dog Food 3 kg", "Pet Supplies", 1299, 800, 4.3, 5400, ["1 kg", "3 kg"]),
 ("Furbaby", "Dog Toy Ball 3 pcs", "Pet Supplies", 499, 300, 4.3, 9800, ["3 pcs"]),
 ("Furbaby", "Catnip Toy", "Pet Supplies", 299, 180, 4.3, 8600, ["Standard"]),
 ("Petalicious", "Dog Chew Toy", "Pet Supplies", 399, 250, 4.3, 7600, ["Standard"]),
 ("Petzy", "Dog Ball 3 pcs", "Pet Supplies", 449, 280, 4.2, 6800, ["3 pcs"]),
 ("Furbaby", "Donut Dog Bed Large", "Pet Supplies", 2499, 1500, 4.3, 5400, ["Medium", "Large", "XL"]),
 ("Furbaby", "Bolster Dog Bed Medium", "Pet Supplies", 1799, 1200, 4.3, 4800, ["Small", "Medium", "Large"]),
 ("Hombro", "Washable Dog Bed Large", "Pet Supplies", 1699, 1000, 4.2, 5600, ["Medium", "Large"]),
 ("TriPaw", "Calming Dog Bed", "Pet Supplies", 2799, 1800, 4.3, 3800, ["Medium", "Large", "XL"]),
 ("Preena Pet", "Orthopedic Dog Bed XL", "Pet Supplies", 5999, 3500, 4.4, 2400, ["Large", "XL"]),
 ("Preet", "Orthopedic Dog Bed 14 inch", "Pet Supplies", 3499, 2200, 4.3, 3600, ["10 inch", "14 inch"]),
 ("Furbaby", "Dog Brush Grooming", "Pet Supplies", 399, 250, 4.3, 9800, ["Standard"]),
 ("Petalicious", "Cat Brush Grooming", "Pet Supplies", 349, 220, 4.3, 8600, ["Standard"]),
 ("Furbaby", "Nail Clipper for Dogs", "Pet Supplies", 299, 180, 4.2, 9800, ["Standard"]),
 ("Petalicious", "Nail Clipper for Cats", "Pet Supplies", 249, 150, 4.2, 7600, ["Standard"]),
 ("Furbaby", "Dog Leash and Harness", "Pet Supplies", 799, 500, 4.3, 8600, ["S", "M", "L"]),
 ("Hombro", "Dog Leash and Harness", "Pet Supplies", 699, 450, 4.2, 7400, ["S", "M", "L"]),
 ("Furbaby", "Pet Carrier Bag", "Pet Supplies", 1499, 900, 4.3, 5400, ["Medium", "Large"]),
 ("Petzy", "Pet Water Bowl 2 pcs", "Pet Supplies", 399, 250, 4.2, 8600, ["2 pcs"]),
 ("Furbaby", "Pet Water Fountain 2 L", "Pet Supplies", 1999, 1200, 4.3, 4800, ["2 L"]),
 ("Catit", "Cat Litter 4 L", "Pet Supplies", 799, 500, 4.3, 6800, ["4 L", "8 L"]),
]

# ================= ENGINE =================
ROWS = R1 + R2 + R3 + R4 + R5 + R6 + R7 + R8
INDIA_TARGET = 20000
# band_id (build_catalog): 0 <=2k, 1 2-5k, 2 5-10k, 3 10-20k, 4 >20k
# target mix: 42% <=2k / 26% 2-5k / 15% 5-10k / 10% 10-20k / 7% >20k
# (the >20k band internally blends ~5% 20-50k with ~2% >50k)
BAND_SHARE = {0: 0.42, 1: 0.26, 2: 0.15, 3: 0.10, 4: 0.07}

# Structured-brand tokens added to the build script's BRANDS map.
# Deliberately NOT added (word-collision risks vs the 25k US pool):
#   noise, sugar, lotus, minimalist, butterfly, wilson, head, jade, ss,
#   ny, 2gold, metro, dr.brown's
ADD_BRANDS = {
    # kitchen & appliances
    "hawkins": "Hawkins", "pigeon": "Pigeon", "prestige": "Prestige",
    "cello": "Cello", "t-fal": "T-fal", "morphy richards": "Morphy Richards",
    "hattal": "Hattal", "bajaj": "Bajaj", "ifb": "IFB", "steelbelle": "Steelbelle",
    "kent": "Kent", "livpure": "Livpure", "havells": "Havells",
    "cuckoo": "Cuckoo", "miyako": "Miyako", "voltas": "Voltas",
    "daikin": "Daikin", "blue star": "Blue Star", "hitachi": "Hitachi", "crompton": "Crompton", "aquafine": "Aquafine",
    "racold": "Racold", "v-guard": "V-Guard", "ao smith": "AO Smith",
    "aquaguard": "Aquaguard", "pureit": "Pureit", "elica": "Elica",
    "usha": "Usha", "atomberg": "Atomberg",
    "reckitt": "Reckitt", "hindware": "Hindware",
    # ethnic fashion
    "global desi": "Global Desi", "w for woman": "W for Woman",
    "anouk": "Anouk", "libas": "Libas",
    "meera": "Meera", "fabindia": "Fabindia", "manyavar": "Manyavar",
    "aurelia": "Aurelia", "myntra": "Myntra", "raymond": "Raymond",
    "van heusen": "Van Heusen", "peter england": "Peter England",
    "us polo": "US Polo", "roadster": "Roadster", "ajivas": "Ajivas",
    "tarun tahiliani": "Tarun Tahiliani",
    # western fashion / shoes / watches / bags
    "asics": "ASICS", "bata": "Bata",
    "relaxo": "Relaxo", "red tape": "Red Tape", "titan": "Titan",
    "fossil": "Fossil", "nixon": "Nixon", "fire-boltt": "Fire-Boltt",
    "amazfit": "Amazfit", "skybags": "Skybags", "amtourister": "AmTourister",
    "wildcraft": "Wildcraft", "fastrack": "Fastrack", "hidesign": "Hidesign",
    "jockey": "Jockey", "fotl": "FOTL", "zouk": "Zouk",
    "hrx": "HRX", "john player": "John Player",
    # beauty & personal care
    "maybelline": "Maybelline", "l'oreal": "L'Oréal", "lakme": "Lakme",
    "colorbar": "Colorbar", "nyx": "NYX",
    "derma co": "Derma Co", "cerave": "CeraVe", "neutrogena": "Neutrogena",
    "la roche-posay": "La Roche-Posay", "bella vita": "Bella Vita",
    "wild stone": "Wild Stone", "fogg": "Fogg",
    "park avenue": "Park Avenue", "engage": "Engage",
    "beardo": "Beardo", "montblanc": "Montblanc", "remington": "Remington",
    "oral-b": "Oral-B", "sonicare": "Sonicare", "colgate": "Colgate",
    "himalaya": "Himalaya", "sensodyne": "Sensodyne", "ustraa": "Ustraa",
    "dettol": "Dettol",
    # home & living / festival
    "dureva": "Dureva", "wakefit": "Wakefit", "sleepycat": "Sleepycat",
    "casper": "Casper", "pepperfury": "Pepperfury", "urban ladder": "Urban Ladder",
    "nilkamal": "Nilkamal", "livmax": "Livmax", "flexi": "Flexi",
    "triveni": "Triveni", "wipro ag": "Wipro AG", "syska": "Syska",
    "liril": "Liril", "lizol": "Lizol", "vim": "Vim",
    "harpic": "Harpic",
    # jewellery / kids / sports
    "giva": "GIVA", "caratlane": "CaratLane", "bluestone": "Bluestone",
    "nripendra": "Nripendra", "malabar": "Malabar", "vepaas": "Vepaas",
    "hot wheels": "Hot Wheels", "funskool": "Funskool", "shumee": "Shumee",
    "vtech": "VTech", "uno": "UNO", "chicco": "Chicco",
    "babyhug": "Babyhug", "kidder": "Kidder", "nuk": "Nuk",
    "maped": "Maped", "camlin": "Camlin", "faber-castell": "Faber-Castell",
    "dawa": "Dawa", "parker": "Parker", "sg": "SG",
    "2gold": "2GOLD", "senco": "Senco", "tanishq": "Tanishq",
    "muthoot": "Muthoot", "louis philippe": "Louis Philippe",
    "mattel": "Mattel", "pampers": "Pampers", "huggies": "Huggies",
    "mamy poko": "MamyPoko", "oxykidz": "Oxykidz", "cute n craft": "Cute N Craft",
    "garnier": "Garnier", "biotique": "Biotique", "clinic plus": "Clinic Plus",
    "sreyas": "Sreyas", "kawasaki": "Kawasaki", "mr muscle": "Mr Muscle",
    "3m": "3M", "stello": "Stello", "kyt": "KYT", "regal": "Regal",
    "stilo": "Stilo", "ioottie": "iOttie", "qcy": "QCY", "spigen": "Spigen",
    "ringke": "Ringke", "niloom": "Niloom", "escent": "Escent",
    "skinn": "Skinn", "zoy": "Zoy", "whiterose": "Whiterose",
    "philips avent": "Philips Avent", "dr.brown": "Dr. Brown's",
    "godrej": "Godrej", "bosch": "Bosch", "hisense": "Hisense", "vu": "Vu",
    "benq": "BenQ", "kingston": "Kingston", "crucial": "Crucial",
    "seagate": "Seagate", "toshiba": "Toshiba", "western digital": "Western Digital",
    "realme": "Realme", "ambrane": "Ambrane", "sennheiser": "Sennheiser",
    "d-link": "D-Link", "pedigree": "Pedigree", "britannia": "Britannia",
    "nalli": "Nalli", "kanchi": "Kanchi", "aza fashions": "Aza Fashions",
    "ritika concepts": "Ritika Concepts", "kalki fashion": "Kalki Fashion",
    "lekara": "Lekara", "mojeri": "Mojeri", "duro": "Duro",
    "kookaburra": "Kookaburra", "grindwell": "Grindwell", "yonex": "Yonex",
    "li-ning": "Li-Ning", "babolat": "Babolat", "naz": "NAZ",
    "powermax": "PowerMax", "ospey": "OSPEY", "yogen": "Yogen",
    "schwinn": "Schwinn", "nautilus": "Nautilus", "herfy": "Herfy",
    "decathlon": "Decathlon", "speedo": "Speedo",
    # electronics / smart home / auto / office / pets
    "tp-link": "TP-Link", "jio": "Jio", "airtel": "Airtel",
    "mercusys": "Mercusys", "tenda": "Tenda", "tapo": "Tapo",
    "imou": "Imou", "ezviz": "Ezviz", "microtek": "Microtek", "su-kam": "Su-Kam", "hinncean": "Hinncean",
    "exide": "Exide", "amara raja": "Amara Raja",
    "true instinct": "True Instinct", "purina": "Purina",
    "royal canin": "Royal Canin", "whiskas": "Whiskas",
    "sakhana": "Sakhana", "furbaby": "Furbaby", "petalicious": "Petalicious",
    "petzy": "Petzy", "hombro": "Hombro", "tripaw": "TriPaw",
    "preena pet": "Preena Pet", "catit": "Catit",
    # winter / health / feature phones / travel / tiffin / ayurveda (R10)
    "omron": "Omron", "dr morepen": "Dr. Morepen", "bpl": "BPL",
    "accu-chek": "Accu-Chek", "samsonite": "Samsonite",
    "american tourister": "American Tourister", "baggit": "baggit",
    "itel": "Itel", "karbonn": "Karbonn", "dabur": "Dabur",
    "patanjali": "Patanjali", "welsun": "Welsun", "sportax": "Sportax",
    "presto": "Presto", "stanley": "Stanley",
}


def _x9(p):
    p = int(round(p))
    return max(49, (p // 10) * 10 - 1)


def _h(s):
    return int(hashlib.md5(s.encode("utf-8")).hexdigest(), 16)


def _title(brand, model, variant):
    base = model
    if variant is not None:
        v = variant.strip()
        m = model.lower()
        if m.endswith(" " + v.lower()) or m == v.lower():
            base = model[: len(model) - len(v)].rstrip()
        t = f"{brand} {base} ({v})"
    else:
        t = f"{brand} {model}"
    return t[:200]


def expand():
    rows = []
    for i, (brand, model, cat, base, spread, rating, nrat, variants) in enumerate(ROWS):
        n = len(variants)
        for j, v in enumerate(variants):
            if n == 1:
                variant, price = None, base
            else:
                variant, price = v, base + spread * j / (n - 1)
            h = _h(f"INDIA-{i}-{j}")
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
            })
    return rows


def india_frame(band_id, verbose=True):
    rows = expand()
    if verbose:
        print(f"india layer: {len(ROWS)} base rows -> {len(rows)} expanded SKUs")
    by_band = {}
    for r in rows:
        by_band.setdefault(band_id(r["price_inr"]), []).append(r)
    keep = []
    for b in sorted(by_band):
        lst = by_band[b]
        quota = int(INDIA_TARGET * BAND_SHARE.get(b, 0.0))
        if len(lst) > quota:
            lst = sorted(lst, key=lambda r: (-r["average_rating"], r["title"]))[:quota]
            if verbose:
                print(f"  band{b}: {len(by_band[b])} -> {len(lst)} (trimmed lowest-rated)")
        else:
            if verbose:
                print(f"  band{b}: {len(lst)} (all, quota {quota})")
        keep.extend(lst)
    out = pd.DataFrame(keep)
    # drop exact duplicate titles (anchor rows and family matrices can both
    # list e.g. "2GOLD 22K Gold Ankh (3 g)"); keep the better-rated copy
    before = len(out)
    out = (out.sort_values(["average_rating", "title"], ascending=[False, True], kind="mergesort")
              .drop_duplicates("title", keep="first"))
    if verbose and len(out) < before:
        print(f"  dedup: {before} -> {len(out)} (dropped {before - len(out)} duplicate titles)")
    out = out.sort_values(["main_category", "title"], kind="mergesort").reset_index(drop=True)
    out.insert(0, "parent_asin", [f"IND-{i+1:05d}" for i in range(len(out))])
    out = out[["parent_asin", "title", "main_category", "price_inr",
               "average_rating", "rating_number"]]
    if verbose:
        med = int(out["price_inr"].median())
        print(f"india frame kept: {len(out)} SKUs, median Rs {med}")
    return out



# ================= R9: LISTING-MATRIX FAMILIES =================
# Real-marketplace listing matrices: brand x model x variant grid
# (colour x size, wash x size, shade, capacity, weight, pack). This is how
# Indian e-commerce is actually listed - "Fabindia Cotton Kurti (Maroon M)"
# is a genuine SKU on Myntra/Flipkart. Prices are 2026 INR MRPs.

def _cart(*pools):
    out = [""]
    for pool in pools:
        out = [f"{a} {b}".strip() for a in out for b in pool]
    return out

def _fam(brand, model, cat, lo, hi, rating, nrat, variants):
    ROWS.append((brand, model, cat, lo, hi - lo, rating, nrat, variants))

COLORS8 = ["Maroon", "Royal Blue", "Green", "Pink", "Gold", "Purple", "Teal", "Red"]
COLORS6 = ["Maroon", "Blue", "Green", "Pink", "Gold", "Red"]
COLORS5 = ["Blue", "Green", "Red", "Pink", "Beige"]
COLORS4 = ["Black", "White", "Blue", "Beige"]
COLORS3 = ["Black", "White", "Navy"]
SIZES4 = ["S", "M", "L", "XL"]
SIZES3 = ["M", "L", "XL"]
SIZES_MEN = ["S/M", "L/XL"]
SHOE_COLORS = ["Black", "White", "Grey", "Navy"]
SHOE_SIZES = ["UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11"]
CASUAL_SIZES = ["UK 6", "UK 7", "UK 8", "UK 9"]
JEAN_WASHES = ["Light Blue", "Dark Blue", "Black"]
JEAN_SIZES = ["30", "32", "34"]

# --- A) ethnic women (AMAZON FASHION) ---
KURTI_BRANDS = ["Fabindia", "W for Woman", "Anouk", "Alinea", "Libas", "Meera",
                "Myntra", "Aurelia", "Global Desi", "Manyavar", "Aza Fashions",
                "Ritika Concepts"]
for b in KURTI_BRANDS:
    _fam(b, "Cotton Kurti", "AMAZON FASHION", 399, 999, 4.2, 14000, _cart(COLORS6, SIZES4))
    _fam(b, "Printed Kurti", "AMAZON FASHION", 499, 1299, 4.2, 12600, _cart(COLORS6, SIZES4))
    _fam(b, "Straight Kurti", "AMAZON FASHION", 599, 1499, 4.2, 11800, _cart(COLORS6, SIZES4))
    _fam(b, "Embroidered Kurti", "AMAZON FASHION", 899, 1999, 4.3, 9400, _cart(COLORS4, SIZES4))
    _fam(b, "Anarkali Kurti", "AMAZON FASHION", 999, 2599, 4.3, 8200, _cart(COLORS4, SIZES4))
    _fam(b, "A-line Kurti", "AMAZON FASHION", 799, 1999, 4.2, 9800, _cart(COLORS4, SIZES4))

SALWAR_BRANDS = ["W for Woman", "Anouk", "Alinea", "Libas", "Myntra", "Aurelia",
                 "Fabindia", "Meera", "Aza Fashions", "Lekara"]
for b in SALWAR_BRANDS:
    _fam(b, "Salwar Suit Set", "AMAZON FASHION", 799, 1999, 4.2, 13200, _cart(COLORS4, SIZES3))
    _fam(b, "Churidar Suit Set", "AMAZON FASHION", 999, 2499, 4.2, 10400, _cart(COLORS4, SIZES3))
    _fam(b, "Palazzo Suit Set", "AMAZON FASHION", 899, 2199, 4.2, 11600, _cart(COLORS4, SIZES3))
    _fam(b, "Sharara Set", "AMAZON FASHION", 1499, 3999, 4.3, 6800, _cart(COLORS4, SIZES3))

SAREE2_BRANDS = ["Global Desi", "Nalli", "Kanchi", "Fabindia", "Manyavar",
                 "Aurelia", "Meera", "Myntra", "Aza Fashions", "Ritika Concepts"]
for b in SAREE2_BRANDS:
    _fam(b, "Organza Saree", "AMAZON FASHION", 799, 2999, 4.2, 8800, COLORS8)
    _fam(b, "Chanderi Saree", "AMAZON FASHION", 899, 3299, 4.3, 9600, COLORS8)
    _fam(b, "Chiffon Saree", "AMAZON FASHION", 699, 2599, 4.2, 10800, COLORS8)
    _fam(b, "Silk Blend Saree", "AMAZON FASHION", 1299, 4999, 4.3, 7400, COLORS8)

LEHENGA_BRANDS = ["Manyavar", "Aurelia", "Global Desi", "Myntra", "Anouk", "Libas"]
for b in LEHENGA_BRANDS:
    _fam(b, "Bridal Lehenga Choli", "AMAZON FASHION", 4999, 19999, 4.5, 2200, COLORS6)
    _fam(b, "Party Lehenga", "AMAZON FASHION", 1999, 9999, 4.4, 4600, COLORS6)
    _fam(b, "Casual Lehenga", "AMAZON FASHION", 1499, 5999, 4.3, 5800, COLORS6)
    _fam(b, "Sequin Lehenga", "AMAZON FASHION", 2499, 10999, 4.4, 3800, COLORS6)

DUPATTA_BRANDS = ["W for Woman", "Anouk", "Alinea", "Myntra", "Aurelia",
                  "Global Desi", "Libas", "Meera"]
for b in DUPATTA_BRANDS:
    _fam(b, "Silk Dupatta", "AMAZON FASHION", 499, 1999, 4.2, 12400, COLORS6)
    _fam(b, "Organza Dupatta", "AMAZON FASHION", 399, 1499, 4.2, 13600, COLORS6)
    _fam(b, "Chiffon Dupatta", "AMAZON FASHION", 299, 1199, 4.2, 15800, COLORS6)
    _fam(b, "Sequin Dupatta", "AMAZON FASHION", 599, 2099, 4.3, 8600, COLORS6)

SHAWL_BRANDS = ["Fabindia", "Meera", "Myntra", "Global Desi", "Aurelia"]
for b in SHAWL_BRANDS:
    _fam(b, "Pashmina Shawl", "AMAZON FASHION", 1499, 4999, 4.4, 6400, COLORS6)
    _fam(b, "Wool Shawl", "AMAZON FASHION", 799, 2599, 4.2, 9800, COLORS6)
    _fam(b, "Stole", "AMAZON FASHION", 599, 2099, 4.2, 11200, COLORS6)

# --- B) men ethnic ---
MEN_BRANDS = ["Roadster", "US Polo Assn.", "John Player", "Van Heusen",
              "Peter England", "Raymond", "Myntra", "Zouk", "Fabindia"]
for b in MEN_BRANDS:
    _fam(b, "Cotton Kurta for Men", "AMAZON FASHION", 599, 1999, 4.2, 12800, _cart(COLORS5, SIZES_MEN))
    _fam(b, "Kurta Pyjama Set for Men", "AMAZON FASHION", 899, 3099, 4.2, 9600, _cart(COLORS5, SIZES_MEN))
    _fam(b, "Panjabi for Men", "AMAZON FASHION", 799, 2999, 4.3, 7400, _cart(COLORS5, SIZES_MEN))
    _fam(b, "Casual Kurta for Men", "AMAZON FASHION", 499, 1599, 4.2, 11400, _cart(COLORS5, SIZES_MEN))

SHERWANI_BRANDS = ["Manyavar", "Ajivas", "Tarun Tahiliani", "Myntra",
                   "Global Desi", "Aurelia"]
for b in SHERWANI_BRANDS:
    _fam(b, "Sherwani for Men", "AMAZON FASHION", 4999, 24999, 4.5, 1800, COLORS4)
    _fam(b, "Nehru Jacket", "AMAZON FASHION", 2499, 9999, 4.4, 3200, COLORS4)
    _fam(b, "Bandhgala", "AMAZON FASHION", 3999, 14999, 4.5, 2400, COLORS4)

# --- C) western wear & footwear ---
JEANS_BRANDS = ["Levi's", "Wrangler", "Roadster", "US Polo Assn.",
                "John Player", "Myntra"]
for b in JEANS_BRANDS:
    _fam(b, "Slim Fit Jeans for Men", "AMAZON FASHION", 1299, 3999, 4.2, 14600, _cart(JEAN_WASHES, JEAN_SIZES))
    _fam(b, "Regular Fit Jeans", "AMAZON FASHION", 999, 3199, 4.2, 12400, _cart(JEAN_WASHES, JEAN_SIZES))
    _fam(b, "Straight Jeans for Men", "AMAZON FASHION", 1099, 3499, 4.2, 11800, _cart(JEAN_WASHES, JEAN_SIZES))
    _fam(b, "Skinny Jeans for Men", "AMAZON FASHION", 1199, 3799, 4.1, 9800, _cart(JEAN_WASHES, JEAN_SIZES))
    _fam(b, "Cargo Pants for Men", "AMAZON FASHION", 899, 2899, 4.2, 10600, _cart(JEAN_WASHES, JEAN_SIZES))

TSHIRT_BRANDS = ["Roadster", "US Polo Assn.", "John Player", "HRX by Hrithik Roshan",
                 "Zouk", "Myntra", "Van Heusen", "Peter England", "Nike", "Adidas"]
for b in TSHIRT_BRANDS:
    _fam(b, "Round Neck T-Shirt for Men", "AMAZON FASHION", 399, 1199, 4.2, 21400, _cart(COLORS4, SIZES3))
    _fam(b, "Polo T-Shirt for Men", "AMAZON FASHION", 599, 1599, 4.2, 16800, _cart(COLORS4, SIZES3))
    _fam(b, "Oversized T-Shirt", "AMAZON FASHION", 499, 1399, 4.2, 13400, _cart(COLORS4, SIZES3))
    _fam(b, "Printed T-Shirt for Men", "AMAZON FASHION", 449, 1299, 4.1, 15200, _cart(COLORS4, SIZES3))

SHIRT_BRANDS = ["Van Heusen", "Peter England", "Raymond", "Roadster",
                "US Polo Assn.", "John Player", "Myntra", "Zouk"]
for b in SHIRT_BRANDS:
    _fam(b, "Formal Shirt for Men", "AMAZON FASHION", 799, 2999, 4.3, 15800, _cart(COLORS3, SIZES3))
    _fam(b, "Casual Shirt for Men", "AMAZON FASHION", 599, 2199, 4.2, 14600, _cart(COLORS3, SIZES3))
    _fam(b, "Oxford Shirt for Men", "AMAZON FASHION", 899, 3299, 4.3, 12200, _cart(COLORS3, SIZES3))
    _fam(b, "Denim Shirt for Men", "AMAZON FASHION", 699, 2599, 4.2, 10400, _cart(COLORS3, SIZES3))

SNEAKERS = [
    ("Nike", "P-6000 Lifestyle Sneakers", 6999, 10499, 4.4, 9200),
    ("Nike", "Downshifter 12 Running Shoes", 5499, 8999, 4.3, 8400),
    ("Nike", "Free RN 5 Running Shoes", 6499, 9999, 4.3, 7800),
    ("Adidas", "Duramo SL Running Shoes", 4499, 6499, 4.3, 13800),
    ("Adidas", "Runfalcon 5 Running Shoes", 4999, 7499, 4.3, 11400),
    ("Adidas", "Gazelle Sneakers", 5999, 8999, 4.4, 12600),
    ("Adidas", "Copa Pure Football Shoes", 4999, 7499, 4.2, 9600),
    ("Puma", "Velocity Nitro Running Shoes", 4999, 7999, 4.2, 8800),
    ("Puma", "Chiliade Training Shoes", 4499, 6999, 4.1, 7900),
    ("Puma", "Muse Lifestyle Sneakers", 4999, 7499, 4.3, 6800),
    ("ASICS", "Gel-Pulse 13 Running Shoes", 7499, 10999, 4.4, 8100),
    ("ASICS", "Gel-Contend 8 Running Shoes", 4999, 7499, 4.3, 10200),
    ("New Balance", "530 Sneakers", 5999, 8499, 4.4, 9600),
    ("New Balance", "Fresh Foam Roav Sneakers", 4499, 6999, 4.3, 7400),
    ("Reebok", "Classic Leather Sneakers", 3999, 5999, 4.3, 13400),
    ("Reebok", "Nano X3 Training Shoes", 9999, 13999, 4.4, 6900),
    ("Skechers", "Street Max Sneakers", 3999, 6999, 4.2, 12800),
    ("HRX by Hrithik Roshan", "Performance Sneakers", 1999, 3999, 4.2, 15600),
]
for b, m, lo, hi, r, nr in SNEAKERS:
    _fam(b, m, "AMAZON FASHION", lo, hi, r, nr, _cart(SHOE_COLORS[:4], SHOE_SIZES))

CASUAL = [
    ("Bata", "Sprint Sneakers", 899, 1499, 4.2, 18000),
    ("Bata", "Blaze Sneakers", 799, 1299, 4.1, 16500),
    ("Bata", "Metro Sneakers", 999, 1599, 4.2, 14200),
    ("Bata", "Oxford Formal Shoes", 1499, 2499, 4.3, 11800),
    ("Bata", "Comfort Chappal", 299, 599, 4.1, 22000),
    ("Red Tape", "Circuit Sneakers", 1299, 2299, 4.3, 13600),
    ("Red Tape", "Flex Sneakers", 1199, 1999, 4.2, 12400),
    ("Red Tape", "Urban Sneakers", 1299, 2199, 4.2, 10900),
    ("Red Tape", "Comfort Shoes", 999, 1799, 4.2, 15700),
    ("Relaxo", "Comfy Sandals", 499, 899, 4.2, 24000),
    ("Relaxo", "City Walk Sandals", 549, 999, 4.1, 21500),
    ("Relaxo", "Step Sandals", 599, 999, 4.2, 19800),
    ("Relaxo", "Chappal for Men", 299, 599, 4.0, 28000),
    ("Metro", "Urban Slip-On", 799, 1399, 4.1, 11200),
    ("Metro", "Stride Sneakers", 849, 1449, 4.1, 9800),
    ("Liberty", "Classic Chappal", 299, 599, 4.1, 26400),
    ("Crocs", "Classic Clog", 1999, 2999, 4.5, 25000),
    ("Crocs", "Baya Clog", 2299, 3299, 4.4, 18600),
]
for b, m, lo, hi, r, nr in CASUAL:
    _fam(b, m, "AMAZON FASHION", lo, hi, r, nr, _cart(SHOE_COLORS[:3], CASUAL_SIZES))

BAGS = [
    ("Skybags", "Satchel for Men", 999, 2499, 4.3, 14200),
    ("Skybags", "Tote Bag", 1499, 3499, 4.3, 11800),
    ("Skybags", "Backpack for Men", 1499, 3499, 4.2, 13600),
    ("Skybags", "Sling Bag", 799, 1799, 4.2, 16400),
    ("Skybags", "20 inch Luggage", 2999, 5999, 4.2, 9800),
    ("Skybags", "Wallet for Men", 699, 1499, 4.2, 17800),
    ("AmTourister", "Backpack for Men", 1299, 2999, 4.2, 12700),
    ("AmTourister", "24 inch Luggage", 3499, 6999, 4.2, 8900),
    ("AmTourister", "Cabin Luggage", 1999, 3999, 4.2, 10400),
    ("Wildcraft", "Backpack for Men", 1499, 3499, 4.3, 15800),
    ("Wildcraft", "Duffel Bag", 1299, 2999, 4.3, 11200),
    ("Wildcraft", "28 inch Trolley", 3499, 6999, 4.3, 7600),
    ("Fastrack", "Backpack for Men", 999, 2499, 4.2, 18900),
    ("Fastrack", "Sling Bag", 899, 1999, 4.2, 14700),
    ("Fastrack", "Tote Bag", 1299, 2999, 4.2, 10900),
    ("Hidesign", "Tote Bag", 2999, 6999, 4.4, 8400),
    ("Hidesign", "Satchel for Men", 2999, 5999, 4.4, 7800),
    ("Hidesign", "Leather Belt for Men", 999, 2499, 4.3, 12600),
    ("Woodland", "Formal Bag for Men", 1999, 4499, 4.2, 6400),
    ("Jockey", "Wallet for Men", 599, 1299, 4.3, 21500),
]
for b, m, lo, hi, r, nr in BAGS:
    _fam(b, m, "AMAZON FASHION", lo, hi, r, nr, ["Black", "Brown", "Navy", "Beige"])

WATCHES = [
    ("Titan", "Fashions Steel Watch", 2999, 5999, 4.4, 18000),
    ("Titan", "Biocolour Watch", 1499, 2999, 4.4, 22400),
    ("Titan", "Neo Watch", 2499, 4999, 4.3, 13600),
    ("Titan", "Raga Watch for Women", 3999, 9999, 4.5, 9800),
    ("Fastrack", "Analog Watch for Men", 1499, 3499, 4.2, 25600),
    ("Fastrack", "Digital Watch for Men", 1299, 2999, 4.2, 21800),
    ("Casio", "F-91W Digital Watch", 1199, 1999, 4.6, 34500),
    ("Casio", "MT-305 Digital Watch", 1499, 2499, 4.5, 19800),
    ("Casio", "Edifice Steel Watch", 4999, 12999, 4.4, 11200),
    ("Casio", "G-Shock Watch", 5999, 14999, 4.5, 16700),
    ("Fossil", "Gen 5 Smartwatch", 8999, 14999, 4.2, 5400),
    ("Fossil", "Explorist Smartwatch", 9999, 16999, 4.2, 4200),
    ("Seiko", "5 Automatic Watch", 9999, 19999, 4.6, 6800),
    ("Nixon", "Time Teller 55", 4999, 8999, 4.3, 7600),
    ("Noise", "ColorFit Pro 5 Smartwatch", 1999, 3499, 4.2, 38400),
    ("Noise", "Compass 2 Smartwatch", 2499, 4499, 4.1, 29700),
    ("Noise", "Edge 3 Smartwatch", 2999, 5499, 4.2, 22600),
    ("Fire-Boltt", "NB Smartwatch", 1299, 2499, 4.1, 41200),
    ("Fire-Boltt", "Call Smartwatch", 1499, 2999, 4.1, 33500),
    ("boAt", "Stalwart Smartwatch", 1299, 2499, 4.1, 45800),
    ("boAt", "Arrage Smartwatch", 1499, 2999, 4.2, 31900),
    ("Amazfit", "Bip 3 Smartwatch", 1999, 3499, 4.3, 18700),
    ("Amazfit", "GTR Mini Smartwatch", 7999, 12999, 4.4, 8900),
]
for b, m, lo, hi, r, nr in WATCHES:
    _fam(b, m, "AMAZON FASHION", lo, hi, r, nr, ["Black", "Steel"])

INNERWEAR = [
    ("Jockey", "Briefs 3 Pack for Men", 999, 1799, 4.3, 19500),
    ("Jockey", "Boxers 3 Pack for Men", 1199, 2199, 4.3, 16800),
    ("Jockey", "Vests 2 Pack for Men", 799, 1499, 4.2, 14300),
    ("FOTL", "Briefs 3 Pack for Men", 899, 1599, 4.2, 22400),
    ("FOTL", "Boxers 3 Pack for Men", 999, 1799, 4.2, 18600),
    ("FOTL", "Vests 2 Pack for Men", 699, 1299, 4.1, 15900),
    ("Zouk", "Briefs 3 Pack for Men", 1099, 1999, 4.2, 12800),
    ("Zouk", "Boxers 3 Pack for Men", 1199, 2099, 4.2, 10700),
    ("Zouk", "Vests 2 Pack for Men", 899, 1599, 4.1, 9600),
    ("HRX by Hrithik Roshan", "Briefs 3 Pack for Men", 799, 1499, 4.2, 24600),
    ("HRX by Hrithik Roshan", "Boxers 3 Pack for Men", 899, 1699, 4.2, 19800),
    ("HRX by Hrithik Roshan", "Vests 2 Pack for Men", 699, 1299, 4.1, 16700),
]
for b, m, lo, hi, r, nr in INNERWEAR:
    _fam(b, m, "AMAZON FASHION", lo, hi, r, nr, ["M", "L", "XL", "XXL"])

DRESS_BRANDS = ["Myntra", "Alinea", "Anouk", "Aurelia", "Libas",
                "W for Woman", "Fabindia", "Meera"]
for b in DRESS_BRANDS:
    _fam(b, "Maxi Dress for Women", "AMAZON FASHION", 799, 2999, 4.2, 9800, COLORS5)
    _fam(b, "Midi Dress for Women", "AMAZON FASHION", 699, 2599, 4.2, 11200, COLORS5)
    _fam(b, "Bodycon Dress for Women", "AMAZON FASHION", 899, 3299, 4.2, 8400, COLORS5)
    _fam(b, "Party Dress for Women", "AMAZON FASHION", 999, 3999, 4.3, 7600, COLORS5)
    _fam(b, "Summer Dress for Women", "AMAZON FASHION", 599, 2099, 4.2, 12400, COLORS5)
    _fam(b, "A-line Dress for Women", "AMAZON FASHION", 799, 2999, 4.2, 10400, COLORS5)

SKIRT_BRANDS = ["Myntra", "Alinea", "Anouk", "Aurelia", "Libas", "W for Woman"]
for b in SKIRT_BRANDS:
    _fam(b, "Flared Skirt for Women", "AMAZON FASHION", 599, 1999, 4.2, 8800, COLORS4)
    _fam(b, "Pencil Skirt for Women", "AMAZON FASHION", 699, 2199, 4.2, 7400, COLORS4)
    _fam(b, "Pleated Skirt for Women", "AMAZON FASHION", 599, 1999, 4.1, 6800, COLORS4)
    _fam(b, "Long Skirt for Women", "AMAZON FASHION", 699, 2299, 4.2, 7800, COLORS4)

JUMPSUIT_BRANDS = ["Myntra", "Alinea", "Aurelia", "Libas"]
for b in JUMPSUIT_BRANDS:
    _fam(b, "Jumpsuit for Women", "AMAZON FASHION", 999, 3499, 4.2, 5400, COLORS4)
    _fam(b, "Co-ord Set for Women", "AMAZON FASHION", 1299, 4299, 4.3, 4800, COLORS4)

# --- D) beauty & personal care (All Beauty) ---
LIP_BRANDS = ["Maybelline", "L'Oréal", "Lakme", "Colorbar", "MAC", "NYX",
              "Sugar", "Lotus", "Bella Vita", "Nykaa"]
for b in LIP_BRANDS:
    _fam(b, "Matte Lipstick", "All Beauty", 349, 2499, 4.3, 28400,
         ["Nude", "Pink", "Red", "Coral", "Brown", "Mauve", "Berry", "Terracotta"])

FND_BRANDS = ["Maybelline", "L'Oréal", "Lakme", "Colorbar", "Sugar", "Lotus", "MAC", "Nykaa"]
for b in FND_BRANDS:
    _fam(b, "Liquid Foundation", "All Beauty", 499, 3299, 4.3, 21600,
         ["F1 Light", "F2 Fair", "F3 Medium", "F4 Tan"])

D2C = ["Minimalist", "Re'equil", "Plum", "Dot&Key", "Derma Co", "CeraVe",
       "Neutrogena", "La Roche-Posay"]
for b in D2C:
    _fam(b, "Niacinamide Serum", "All Beauty", 399, 799, 4.3, 18400, ["30 ml", "100 ml"])
    _fam(b, "Vitamin C Serum", "All Beauty", 449, 899, 4.3, 16800, ["30 ml", "100 ml"])
    _fam(b, "Salicylic Acid Serum", "All Beauty", 399, 799, 4.3, 14200, ["30 ml"])
    _fam(b, "Hyaluronic Acid Serum", "All Beauty", 449, 899, 4.3, 12600, ["30 ml"])
    _fam(b, "Face Moisturiser", "All Beauty", 399, 1899, 4.4, 19400, ["50 ml", "100 ml"])
    _fam(b, "Face Wash", "All Beauty", 299, 1199, 4.3, 24600, ["100 ml", "150 ml"])
    _fam(b, "Sunscreen SPF 50", "All Beauty", 399, 2499, 4.4, 17800, ["50 g", "100 g"])

HAIR_BRANDS = ["L'Oréal", "Biotique", "Garnier", "Clinic Plus"]
for b in HAIR_BRANDS:
    _fam(b, "Anti Hairfall Shampoo", "All Beauty", 399, 899, 4.3, 32400, ["340 ml", "650 ml"])
    _fam(b, "Hair Oil", "All Beauty", 249, 599, 4.3, 41200, ["200 ml"])
    _fam(b, "Hair Serum", "All Beauty", 349, 849, 4.2, 18600, ["100 ml"])
    _fam(b, "Styling Wax", "All Beauty", 299, 799, 4.2, 12400, ["100 g"])

HAIRCOLOR_BRANDS = ["L'Oréal", "Clinic Plus", "Garnier"]
for b in HAIRCOLOR_BRANDS:
    _fam(b, "Permanent Hair Colour", "All Beauty", 349, 799, 4.2, 26800,
         ["Dark Brown", "Black", "Chestnut", "Copper", "Auburn", "Ash Brown", "Mahogany", "Natural Brown"])

PERFUME_BRANDS = ["Bella Vita", "Villain", "Wild Stone", "Fogg", "Park Avenue",
                  "Engage", "Beardo", "Montblanc", "Skinn", "Zoy"]
for b in PERFUME_BRANDS:
    _fam(b, "Signature Eau de Parfum", "All Beauty", 1499, 2499, 4.3, 7800, ["50 ml", "100 ml"])
    _fam(b, "Sport Eau de Toilette", "All Beauty", 999, 1999, 4.2, 9400, ["50 ml", "100 ml"])
    _fam(b, "Oud Parfum", "All Beauty", 1299, 2499, 4.2, 6400, ["50 ml", "100 ml"])

GROOM_BRANDS = ["Beardo", "Ustraa", "Villain", "Himalaya", "Philips", "Remington"]
for b in GROOM_BRANDS:
    _fam(b, "Beard Trimmer", "All Beauty", 1499, 5999, 4.3, 11400, ["Standard", "Pro"])
    _fam(b, "Body Trimmer", "All Beauty", 999, 4499, 4.2, 9800, ["Standard", "Pro"])
    _fam(b, "Grooming Kit for Men", "All Beauty", 799, 5999, 4.3, 8600, ["Basic", "Complete"])

ORAL_BRANDS = ["Colgate", "Sensodyne", "Oral-B", "Himalaya"]
for b in ORAL_BRANDS:
    _fam(b, "Toothpaste 200 g", "All Beauty", 129, 349, 4.5, 54200, ["Classic", "Whitening", "Sensitive"])
    _fam(b, "Toothbrush 4 Pack", "All Beauty", 199, 799, 4.4, 28600, ["Soft", "Medium"])

# --- E) kitchen & small appliances (Appliances) ---
PRESSURE_BRANDS = ["Hawkins", "Pigeon", "Prestige", "Butterfly", "Cello", "Hattal"]
for b in PRESSURE_BRANDS:
    _fam(b, "Pressure Cooker 3 L", "Appliances", 999, 1299, 4.4, 16800, ["Silver", "Black"])
    _fam(b, "Pressure Cooker 5 L", "Appliances", 1199, 1599, 4.5, 21400, ["Silver", "Black"])
    _fam(b, "Pressure Cooker 6 L", "Appliances", 1399, 1799, 4.4, 13600, ["Silver", "Black"])
    _fam(b, "Pressure Cooker 8 L", "Appliances", 1599, 1999, 4.4, 10400, ["Silver", "Black"])

COOKWARE_BRANDS = ["Pigeon", "Prestige", "Cello", "Hattal", "Morphy Richards", "Butterfly"]
for b in COOKWARE_BRANDS:
    _fam(b, "Nonstick Cookware Set 3 pc", "Appliances", 1499, 2099, 4.3, 12400, ["Silver", "Black"])
    _fam(b, "Nonstick Cookware Set 5 pc", "Appliances", 2499, 3699, 4.3, 10800, ["Silver", "Black"])
    _fam(b, "Nonstick Cookware Set 7 pc", "Appliances", 3999, 5999, 4.3, 8400, ["Silver", "Black"])
    _fam(b, "Nonstick Cookware Set 9 pc", "Appliances", 5999, 9999, 4.3, 6200, ["Silver", "Black"])

KADAI_BRANDS = ["Pigeon", "Prestige", "Cello", "Hattal", "Morphy Richards"]
for b in KADAI_BRANDS:
    _fam(b, "Nonstick Kadai 24 cm", "Appliances", 799, 1199, 4.3, 15400, ["Silver"])
    _fam(b, "Nonstick Kadai 28 cm", "Appliances", 999, 1499, 4.3, 16800, ["Silver"])
    _fam(b, "Nonstick Kadai 30 cm", "Appliances", 1199, 1799, 4.3, 12400, ["Silver"])

MIXER_BRANDS = ["Prestige", "Bajaj", "Philips", "Crompton", "Hattal", "Pigeon", "Cello", "Havells"]
for b in MIXER_BRANDS:
    _fam(b, "Mixer Grinder 500 W", "Appliances", 2499, 3499, 4.3, 14600, ["Silver"])
    _fam(b, "Mixer Grinder 750 W", "Appliances", 3499, 4999, 4.3, 16800, ["Silver", "Black"])

AIRFRYER_BRANDS = ["Prestige", "Bajaj", "Philips", "Pigeon", "Havells", "Morphy Richards"]
for b in AIRFRYER_BRANDS:
    _fam(b, "Air Fryer 4 L", "Appliances", 5999, 7499, 4.3, 9800, ["Black"])
    _fam(b, "Air Fryer 5 L", "Appliances", 6999, 9499, 4.3, 12400, ["Black"])
    _fam(b, "Air Fryer 6 L", "Appliances", 7999, 11499, 4.3, 8400, ["Black"])

MICROWAVE_BRANDS = ["LG", "Samsung", "IFB", "Bajaj", "Pigeon"]
for b in MICROWAVE_BRANDS:
    _fam(b, "Microwave Oven 20 L", "Appliances", 9999, 13999, 4.4, 8400, ["Silver", "Black"])
    _fam(b, "Convection Microwave 23 L", "Appliances", 11999, 16999, 4.4, 7800, ["Silver", "Black"])
    _fam(b, "Convection Microwave 28 L", "Appliances", 13999, 19999, 4.4, 6400, ["Silver", "Black"])

INDUCTION_BRANDS = ["Prestige", "Bajaj", "Cello", "Pigeon", "Philips"]
for b in INDUCTION_BRANDS:
    _fam(b, "Induction Cooktop 1500 W", "Appliances", 1299, 2299, 4.2, 14800, ["Black"])
    _fam(b, "Induction Cooktop 1800 W", "Appliances", 1799, 3299, 4.3, 12400, ["Black"])

KETTLE_BRANDS = ["Prestige", "Bajaj", "Pigeon", "Cello", "Philips"]
for b in KETTLE_BRANDS:
    _fam(b, "Electric Kettle 1.5 L", "Appliances", 899, 1599, 4.3, 16400, ["Silver"])
    _fam(b, "Electric Kettle 1.7 L", "Appliances", 1099, 1999, 4.3, 18400, ["Silver", "Black"])

CHUTNEY_BRANDS = ["Prestige", "Bajaj", "Pigeon", "Cello"]
for b in CHUTNEY_BRANDS:
    _fam(b, "Chutney Maker 1.2 L", "Appliances", 999, 1499, 4.2, 9800, ["Silver"])
    _fam(b, "Chutney Maker 1.5 L", "Appliances", 1199, 1799, 4.3, 11400, ["Silver"])

DOSAMAKER_BRANDS = ["Prestige", "Bajaj", "Cello", "Pigeon"]
for b in DOSAMAKER_BRANDS:
    _fam(b, "Dosa Maker 30 cm", "Appliances", 1199, 1799, 4.3, 8600, ["Black"])
    _fam(b, "Dosa Maker 35 cm", "Appliances", 1399, 1999, 4.2, 7400, ["Black"])

JUICER_BRANDS = ["Prestige", "Philips", "Bajaj", "Hattal"]
for b in JUICER_BRANDS:
    _fam(b, "Juicer Mixer 600 W", "Appliances", 3499, 4499, 4.2, 7800, ["Silver"])
    _fam(b, "Juicer Mixer 750 W", "Appliances", 3999, 5499, 4.2, 8400, ["Silver"])

STEEL_BRANDS = ["Prestige", "Cello", "Butterfly", "Pigeon"]
for b in STEEL_BRANDS:
    _fam(b, "Steel Tumbler 500 ml", "Appliances", 199, 399, 4.3, 28400, ["Standard"])
    _fam(b, "Steel Glass 250 ml 6 Pack", "Appliances", 249, 549, 4.3, 24600, ["Standard"])
    _fam(b, "Steel Thali Set 5 pc", "Appliances", 599, 1099, 4.3, 18400, ["Standard"])

IRON_BRANDS = ["Bajaj", "Crompton", "Philips", "Pigeon", "Havells"]
for b in IRON_BRANDS:
    _fam(b, "Dry Iron 1000 W", "Appliances", 999, 1899, 4.3, 14600, ["Black"])
    _fam(b, "Steam Iron 1600 W", "Appliances", 1999, 4999, 4.4, 11800, ["Black"])

# --- F) big appliances (Appliances) ---
AC_BRANDS = ["Voltas", "Daikin", "Blue Star", "LG", "Samsung", "Carrier",
             "Haier", "Hitachi", "Panasonic", "Midea"]
for b in AC_BRANDS:
    _fam(b, "1 Ton 3 Star Split AC", "Appliances", 32999, 36999, 4.3, 5400, ["White"])
    _fam(b, "1 Ton 5 Star Split AC", "Appliances", 36999, 41999, 4.3, 6800, ["White"])
    _fam(b, "1.5 Ton 3 Star Split AC", "Appliances", 38999, 43999, 4.3, 7400, ["White"])
    _fam(b, "1.5 Ton 5 Star Split AC", "Appliances", 43999, 51999, 4.4, 8800, ["White"])
    _fam(b, "2 Ton 5 Star Split AC", "Appliances", 52999, 64999, 4.4, 4800, ["White"])

FRIDGE_BRANDS = ["LG", "Samsung", "Whirlpool", "Haier", "Godrej", "IFB", "Bosch", "Hisense"]
for b in FRIDGE_BRANDS:
    _fam(b, "225 L Single Door Refrigerator", "Appliances", 14999, 18999, 4.3, 8400, ["Silver"])
    _fam(b, "266 L Double Door Refrigerator", "Appliances", 21999, 27999, 4.4, 9800, ["Silver"])
    _fam(b, "325 L Double Door Refrigerator", "Appliances", 28999, 36999, 4.4, 7600, ["Silver"])
    _fam(b, "510 L Double Door Refrigerator", "Appliances", 54999, 74999, 4.4, 5200, ["Silver"])

WASHER_BRANDS = ["LG", "Samsung", "IFB", "Whirlpool", "Bosch", "Haier"]
for b in WASHER_BRANDS:
    _fam(b, "6.5 kg Top Load Washing Machine", "Appliances", 19999, 25999, 4.4, 7400, ["Silver"])
    _fam(b, "7 kg Top Load Washing Machine", "Appliances", 23999, 30999, 4.4, 8200, ["Silver"])
    _fam(b, "7 kg Front Load Washing Machine", "Appliances", 38999, 53999, 4.4, 6400, ["Silver"])
    _fam(b, "8 kg Front Load Washing Machine", "Appliances", 44999, 62999, 4.4, 4800, ["Silver"])

GEYSER_BRANDS = ["Aquafine", "Racold", "V-Guard", "AO Smith", "Crompton"]
for b in GEYSER_BRANDS:
    _fam(b, "Instant Geyser 2 L", "Appliances", 3999, 5999, 4.3, 9400, ["White"])
    _fam(b, "Storage Geyser 15 L", "Appliances", 8999, 12999, 4.3, 8600, ["White"])
    _fam(b, "Storage Geyser 25 L", "Appliances", 10999, 15999, 4.3, 7800, ["White"])

RO_BRANDS = ["Kent", "Livpure", "Aquaguard", "Pureit"]
for b in RO_BRANDS:
    _fam(b, "Gravity RO Water Purifier", "Appliances", 9999, 13999, 4.4, 8400, ["White"])
    _fam(b, "RO+UV Water Purifier", "Appliances", 11999, 16999, 4.4, 9800, ["White"])
    _fam(b, "3-in-1 RO+UV+UF Water Purifier", "Appliances", 8999, 12999, 4.3, 11400, ["White"])

CHIMNEY_BRANDS = ["Faber", "Elica", "Crompton", "Hettich"]
for b in CHIMNEY_BRANDS:
    _fam(b, "60 cm Chimney 700 m3", "Appliances", 7999, 11999, 4.3, 5400, ["Silver"])
    _fam(b, "60 cm Deluxe Chimney", "Appliances", 10999, 16999, 4.3, 4400, ["Silver"])

FAN_BRANDS = ["Crompton", "Usha", "Atomberg", "Havells", "V-Guard", "Bajaj"]
for b in FAN_BRANDS:
    _fam(b, "1200 mm Ceiling Fan", "Appliances", 2199, 3599, 4.3, 16400, ["White", "Silver"])
    _fam(b, "Pedestal Fan 400 mm", "Appliances", 2999, 4799, 4.2, 9400, ["White"])
    _fam(b, "BLDC Ceiling Fan", "Appliances", 6999, 10999, 4.4, 11800, ["White"])

VACUUM_BRANDS = ["Crompton", "Pigeon", "Philips"]
for b in VACUUM_BRANDS:
    _fam(b, "Cordless Vacuum Cleaner", "Appliances", 2999, 4999, 4.2, 8600, ["Black"])
    _fam(b, "Canister Vacuum Cleaner", "Appliances", 3999, 6499, 4.2, 6400, ["Black"])

# --- G) festival & occasion (Amazon Home) ---
DIWALI = [
    ("Wipro AG", "Diwali String Light 50", 1499, 2499, 4.3, 8400, ["Warm White", "Multi Colour"]),
    ("Wipro AG", "Diwali String Light 100", 2499, 3999, 4.3, 7200, ["Warm White", "Multi Colour"]),
    ("Wipro AG", "Diwali String Light 200", 3999, 6499, 4.3, 5800, ["Warm White", "Multi Colour"]),
    ("Wipro AG", "Diwali Paper Lantern", 799, 1499, 4.4, 12600, ["Orange", "Gold"]),
    ("Wipro AG", "LED Diya 12", 199, 399, 4.3, 15400, ["Yellow", "Multi Colour"]),
    ("Philips", "Diwali String Light 50", 1299, 2499, 4.3, 11800, ["Warm White", "Multi Colour"]),
    ("Philips", "Fairy Light 100", 1999, 3999, 4.3, 9400, ["Warm White"]),
    ("Philips", "Diwali Lantern", 699, 1299, 4.3, 10600, ["Orange", "Gold"]),
    ("Syska", "Diwali String Light 100", 1499, 3499, 4.3, 8800, ["Warm White", "Multi Colour"]),
    ("Syska", "LED Diya 6", 149, 349, 4.3, 13200, ["Yellow"]),
    ("Syska", "Garland Light 10 ft", 499, 999, 4.2, 9600, ["Multi Colour"]),
    ("Solimo", "Clay Diya 12", 149, 299, 4.2, 18900, ["Terracotta"]),
    ("Solimo", "Marigold Garland 10 ft", 299, 699, 4.2, 14600, ["Orange"]),
    ("Solimo", "Rangoli Powder Kit 6", 99, 249, 4.1, 22400, ["Assorted"]),
    ("Solimo", "Mango Leaf Garland", 249, 499, 4.2, 16800, ["Green"]),
    ("Solimo", "Brass Diya 6", 349, 699, 4.3, 11200, ["Gold"]),
    ("Solimo", "Rangoli Sticker Sheet", 99, 199, 4.1, 19700, ["Assorted"]),
    ("Solimo", "LED Candle 12", 249, 499, 4.2, 15800, ["Yellow"]),
    ("Solimo", "Kumkum Powder Set", 149, 349, 4.2, 13400, ["Red"]),
    ("Solimo", "Diwali Door Hanging", 199, 499, 4.2, 12800, ["Gold"]),
    ("Pepperfury", "Rangoli Stencil 12", 199, 399, 4.3, 8600, ["Assorted"]),
    ("Pepperfury", "Diya Set 12", 349, 699, 4.3, 9400, ["Terracotta"]),
    ("Pepperfury", "Toran Decor", 299, 599, 4.2, 10200, ["Gold"]),
    ("Pepperfury", "Diwali Gift Hamper", 1999, 4999, 4.4, 4800, ["Premium"]),
    ("Hattal", "Diwali Rangoli Kit", 199, 449, 4.2, 7400, ["Assorted"]),
    ("Wipro AG", "Diwali Gifting Box", 1499, 3499, 4.4, 5600, ["Premium"]),
]
for b, m, lo, hi, r, nr, vs in DIWALI:
    _fam(b, m, "Amazon Home", lo, hi, r, nr, vs)

HOLI = [
    ("Solimo", "Holi Colors Safe 250 g", 149, 399, 4.2, 14600, ["500 g", "1 kg"]),
    ("Chambal", "Holi Colors 500 g", 199, 499, 4.3, 18400, ["1 kg"]),
    ("Funskool", "Holi Colors Party Kit", 249, 599, 4.3, 9800, ["Party Pack"]),
]
for b, m, lo, hi, r, nr, vs in HOLI:
    _fam(b, m, "Amazon Home", lo, hi, r, nr, vs)

RAKHI = [
    ("Solimo", "Rakhi Set 5", 149, 399, 4.2, 12600, ["10 pc"]),
    ("Meera", "Rakhi Set 10", 249, 699, 4.3, 9400, ["20 pc"]),
    ("Myntra", "Rakhi Gift Box", 399, 999, 4.3, 8800, ["Premium"]),
    ("Solimo", "Rakhi with Gift Set", 499, 1299, 4.2, 10400, ["Premium"]),
]
for b, m, lo, hi, r, nr, vs in RAKHI:
    _fam(b, m, "AMAZON FASHION", lo, hi, r, nr, vs)

NAVRATRI = [
    ("Myntra", "Navratri Chaniya Choli", 999, 3499, 4.3, 8800, COLORS4),
    ("Global Desi", "Navratri Saree", 1299, 4499, 4.3, 6900, COLORS4),
    ("Anouk", "Navratri Kurti", 799, 2399, 4.3, 9400, COLORS4),
    ("Alinea", "Navratri Saree", 1099, 3499, 4.2, 7400, COLORS4),
]
for b, m, lo, hi, r, nr, vs in NAVRATRI:
    _fam(b, m, "AMAZON FASHION", lo, hi, r, nr, vs)

EID = [
    ("W for Woman", "Eid Kurti for Women", 799, 2499, 4.3, 8600, COLORS4),
    ("Anouk", "Eid Salwar Suit", 999, 3099, 4.3, 7400, COLORS4),
    ("John Player", "Eid Kurta for Men", 899, 2799, 4.2, 9400, COLORS4),
    ("US Polo Assn.", "Eid Panjabi for Men", 999, 2999, 4.2, 8400, COLORS4),
]
for b, m, lo, hi, r, nr, vs in EID:
    _fam(b, m, "AMAZON FASHION", lo, hi, r, nr, vs)

CHRISTMAS = [
    ("Pepperfury", "Christmas Tree Decor 5 ft", 999, 2999, 4.3, 8400, ["Green"]),
    ("Wipro AG", "Christmas String Light 100", 1999, 3999, 4.3, 7600, ["Multi Colour"]),
    ("Solimo", "Christmas Gift Box", 499, 1499, 4.2, 11400, ["Red"]),
    ("Pepperfury", "Christmas Scented Candle", 399, 1099, 4.3, 9400, ["Red", "Green"]),
]
for b, m, lo, hi, r, nr, vs in CHRISTMAS:
    _fam(b, m, "Amazon Home", lo, hi, r, nr, vs)

HAMPERS = [
    ("Pepperfury", "Festive Gift Hamper", 1999, 4999, 4.4, 5400, ["Premium"]),
    ("Solimo", "Festival Hamper", 999, 2999, 4.2, 8400, ["Standard"]),
    ("Myntra", "Gifting Box for Her", 1499, 3999, 4.3, 7400, ["Pink", "White"]),
    ("Hidesign", "Gifting Box for Him", 2999, 6999, 4.4, 4400, ["Black"]),
    ("Beardo", "Grooming Gift Hamper", 1999, 4499, 4.3, 6400, ["Premium"]),
]
for b, m, lo, hi, r, nr, vs in HAMPERS:
    _fam(b, m, "Amazon Home", lo, hi, r, nr, vs)

# --- H) gold & jewellery (AMAZON FASHION) ---
GOLD_RATE = 8800  # 22K per gram, 2026 INR
GOLD_BRANDS = ["GIVA", "2GOLD", "CaratLane", "Bluestone", "Nripendra",
               "Malabar", "Vepaas", "Senco", "Tanishq"]
GOLD_ITEMS = [
    ("22K Gold Chain", ["5 g", "8 g", "10 g", "15 g"]),
    ("22K Gold Bangles", ["8 g", "12 g", "16 g"]),
    ("22K Gold Earring Pair", ["2 g", "3 g", "5 g"]),
    ("22K Gold Necklace", ["10 g", "15 g", "20 g"]),
    ("22K Gold Ring", ["2 g", "3 g", "4 g"]),
    ("22K Gold Ankh", ["3 g", "4 g", "5 g"]),
    ("22K Gold Coin", ["5 g", "10 g"]),
]
import re as _re
def _grams(v):
    return float(_re.match(r"([\d.]+)", v).group(1))
for b in GOLD_BRANDS:
    for model, gs in GOLD_ITEMS:
        lo = int(min(_grams(g) for g in gs) * GOLD_RATE)
        hi = int(max(_grams(g) for g in gs) * GOLD_RATE)
        _fam(b, model, "AMAZON FASHION", lo, hi, 4.4, 1500, gs)

SILVER_BRANDS = ["Bluestone", "Nripendra", "Vepaas", "CaratLane", "Senco"]
for b in SILVER_BRANDS:
    _fam(b, "925 Silver Chain", "AMAZON FASHION", 2999, 6999, 4.3, 4400, ["25 g", "40 g", "60 g"])
    _fam(b, "925 Silver Bangles", "AMAZON FASHION", 1999, 4999, 4.3, 5200, ["20 g", "40 g"])
    _fam(b, "925 Silver Pendant", "AMAZON FASHION", 1499, 3999, 4.2, 4800, ["15 g", "30 g"])

KUNDAN_BRANDS = ["CaratLane", "Bluestone", "Vepaas", "Tanishq", "Senco"]
for b in KUNDAN_BRANDS:
    _fam(b, "Kundan Set", "AMAZON FASHION", 2499, 5999, 4.4, 3800, ["Gold Tone", "Rose Gold", "Silver"])
    _fam(b, "Polki Set", "AMAZON FASHION", 3999, 9999, 4.4, 2600, ["Gold Tone", "Rose Gold"])

JHUMKA_BRANDS = ["Vepaas", "CaratLane", "Bluestone", "Tanishq", "Senco"]
for b in JHUMKA_BRANDS:
    _fam(b, "Gold Plated Jhumka", "AMAZON FASHION", 1299, 2999, 4.3, 6400, ["Gold", "Rose Gold"])
    _fam(b, "Kundan Jhumka", "AMAZON FASHION", 1999, 4999, 4.4, 4800, ["Gold", "Rose Gold"])

MANGAL_BRANDS = ["Tanishq", "CaratLane", "Bluestone", "GIVA", "Senco"]
for b in MANGAL_BRANDS:
    _fam(b, "Gold Mangalsutra", "AMAZON FASHION", 4999, 14999, 4.5, 3200, ["Classic", "Designer"])
    _fam(b, "Pearl Mangalsutra", "AMAZON FASHION", 1499, 3999, 4.4, 5400, ["Classic", "Designer"])

# --- I) baby & kids ---
BABY_BRANDS = ["Myntra", "Babyhug", "Chicco", "Kidder", "Oxykidz", "Cute N Craft"]
BABY_SIZES = ["0-3M", "3-6M", "6-12M", "1-2Y"]
for b in BABY_BRANDS:
    _fam(b, "Baby Romper", "Baby", 399, 999, 4.3, 9800, BABY_SIZES)
    _fam(b, "Baby T-Shirt 2 Pack", "Baby", 299, 799, 4.2, 12400, BABY_SIZES)
    _fam(b, "Baby Pant 2 Pack", "Baby", 299, 799, 4.2, 10400, BABY_SIZES)
    _fam(b, "Baby Dress", "Baby", 499, 1499, 4.3, 8600, BABY_SIZES)
    _fam(b, "Baby Dohar Set", "Baby", 599, 1799, 4.3, 7400, BABY_SIZES)
    _fam(b, "Baby Socks 3 Pack", "Baby", 199, 499, 4.2, 14800, BABY_SIZES)

DIAPER_BRANDS = ["Pampers", "Huggies", "MamyPoko", "Babyhug"]
for b in DIAPER_BRANDS:
    _fam(b, "Diaper Pants M", "Baby", 799, 1299, 4.4, 16800, ["32 count", "64 count"])
    _fam(b, "Diaper Pants L", "Baby", 899, 1399, 4.4, 14400, ["32 count", "64 count"])
    _fam(b, "Wipes 72", "Baby", 249, 499, 4.4, 24600, ["72", "156"])

BABYGEAR_BRANDS = ["Chicco", "Kidder", "Nuk", "Philips Avent", "Babyhug"]
for b in BABYGEAR_BRANDS:
    _fam(b, "Baby Bottle 250 ml", "Baby", 299, 699, 4.4, 12400, ["Glass", "Plastic"])
    _fam(b, "Pacifier", "Baby", 199, 499, 4.4, 15800, ["0-6M", "6-18M"])
    _fam(b, "Feeding Set", "Baby", 599, 1499, 4.3, 8400, ["Basic", "Complete"])
    _fam(b, "Nursing Pillow", "Baby", 799, 1999, 4.3, 7600, ["Standard"])

BABYBIG_BRANDS = ["Chicco", "Babyhug", "Myntra", "Kidder"]
for b in BABYBIG_BRANDS:
    _fam(b, "Baby Carrier", "Baby", 3999, 6999, 4.3, 4800, ["Black", "Grey"])
    _fam(b, "Baby Stroller", "Baby", 12999, 24999, 4.4, 3400, ["Black", "Grey"])
    _fam(b, "Baby High Chair", "Baby", 3499, 6999, 4.3, 4200, ["White"])

TOY_BRANDS = ["LEGO", "Hasbro", "NERF", "Hot Wheels", "Funskool", "Shumee",
              "VTech", "Mattel", "Barbie", "UNO"]
for b in TOY_BRANDS:
    _fam(b, "Building Blocks Set", "Toys & Games", 999, 2999, 4.5, 9800, ["Small", "Large"])
    _fam(b, "RC Car", "Toys & Games", 1499, 3499, 4.3, 8400, ["Blue", "Red"])
    _fam(b, "Puzzle 1000 pcs", "Toys & Games", 799, 1999, 4.4, 9400, ["Assorted"])
    _fam(b, "Stuffed Teddy", "Toys & Games", 499, 1999, 4.4, 12600, ["12 inch", "18 inch"])
    _fam(b, "Action Figure", "Toys & Games", 799, 2999, 4.4, 11400, ["Single", "Duo"])
    _fam(b, "Musical Toy", "Toys & Games", 699, 1999, 4.3, 10400, ["Standard"])

STATIONERY_BRANDS = ["Skybags", "Maped", "Camlin", "Faber-Castell", "Dawa",
                     "Parker", "Whiterose", "Myntra"]
for b in STATIONERY_BRANDS:
    _fam(b, "School Bag", "Office Products", 799, 2499, 4.3, 12400, ["Blue", "Black", "Pink"])
    _fam(b, "Tiffin Box", "Office Products", 499, 999, 4.3, 14800, ["Blue", "Pink"])
    _fam(b, "Stationery Set", "Office Products", 599, 1499, 4.2, 11400, ["Complete"])
    _fam(b, "Notebook 200 Pages", "Office Products", 299, 899, 4.3, 13400, ["10 Pack"])
    _fam(b, "Geometry Box", "Office Products", 199, 499, 4.4, 16400, ["Standard"])
    _fam(b, "Crayons 36", "Office Products", 149, 399, 4.5, 18400, ["Standard"])
    _fam(b, "Water Colour 24", "Office Products", 249, 599, 4.4, 14600, ["Standard"])

# --- J) sports & fitness ---
CRICKET_BRANDS = ["SG", "Kookaburra", "Grindwell", "Myntra"]
for b in CRICKET_BRANDS:
    _fam(b, "Cricket Bat", "Sports & Outdoors", 1999, 6999, 4.4, 9800, ["2.5 kg", "3 kg"])
    _fam(b, "Cricket Stump Set", "Sports & Outdoors", 2499, 4999, 4.3, 5400, ["Standard"])
    _fam(b, "Cricket Balls 3 Pack", "Sports & Outdoors", 999, 2999, 4.5, 8600, ["Standard"])
    _fam(b, "Batting Gloves", "Sports & Outdoors", 799, 1999, 4.3, 9400, ["M", "L"])
    _fam(b, "Batting Pad", "Sports & Outdoors", 899, 2499, 4.3, 8400, ["M", "L"])
    _fam(b, "Batting Guard", "Sports & Outdoors", 999, 2499, 4.3, 7800, ["M", "L"])

BADMINTON_BRANDS = ["Yonex", "Li-Ning", "Sreyas", "Kawasaki"]
for b in BADMINTON_BRANDS:
    _fam(b, "Badminton Racket", "Sports & Outdoors", 2999, 15999, 4.4, 8400, ["Standard", "Pro"])
    _fam(b, "Shuttlecock 3 Pack", "Sports & Outdoors", 599, 1999, 4.5, 12400, ["Standard"])
    _fam(b, "Badminton Net", "Sports & Outdoors", 999, 1999, 4.3, 8600, ["Standard"])
    _fam(b, "Badminton Bag", "Sports & Outdoors", 1299, 3499, 4.4, 9400, ["Standard"])

YOGA_BRANDS = ["Yogen", "Herfy", "Decathlon", "OSPEY", "PowerMax"]
for b in YOGA_BRANDS:
    _fam(b, "Yoga Mat 8 mm", "Sports & Outdoors", 799, 1999, 4.3, 12400, ["Purple", "Blue", "Pink"])
    _fam(b, "Yoga Strap", "Sports & Outdoors", 299, 799, 4.2, 8400, ["Purple", "Blue"])
    _fam(b, "Yoga Block 2 Pack", "Sports & Outdoors", 349, 699, 4.3, 9400, ["Purple", "Blue"])
    _fam(b, "Resistance Bands 5", "Sports & Outdoors", 499, 1399, 4.3, 10400, ["Set"])
    _fam(b, "Yoga Wheel", "Sports & Outdoors", 1299, 2999, 4.3, 6400, ["Purple", "Blue"])

GYM_BRANDS = ["NAZ", "PowerMax", "OSPEY", "Decathlon", "Herfy"]
for b in GYM_BRANDS:
    _fam(b, "Dumbbell 5 kg", "Sports & Outdoors", 899, 1699, 4.3, 11400, ["Pair"])
    _fam(b, "Dumbbell 10 kg", "Sports & Outdoors", 1299, 2499, 4.3, 9400, ["Pair"])
    _fam(b, "Gym Mat 12 mm", "Sports & Outdoors", 799, 1999, 4.3, 10400, ["Black"])
    _fam(b, "Weight Bench", "Sports & Outdoors", 3999, 8999, 4.3, 4800, ["Adjustable"])
    _fam(b, "Skipping Rope", "Sports & Outdoors", 299, 799, 4.2, 12400, ["Speed", "Standard"])

CYCLING = [
    ("Herfy", "Mountain Bike 26 inch", 12999, 28999, 4.3, 3400, ["Black", "Blue"]),
    ("Herfy", "Bicycle 26 inch", 6999, 11999, 4.3, 4400, ["Red", "Black"]),
    ("Decathlon", "Mountain Bike 27.5 inch", 15999, 34999, 4.4, 3800, ["Black"]),
    ("Decathlon", "Cycling Jersey", 1499, 3999, 4.3, 5400, ["S/M", "L/XL"]),
]
for b, m, lo, hi, r, nr, vs in CYCLING:
    _fam(b, m, "Sports & Outdoors", lo, hi, r, nr, vs)

FOOTBALL_BRANDS = ["Decathlon", "Nike", "Myntra"]
for b in FOOTBALL_BRANDS:
    _fam(b, "Football Size 5", "Sports & Outdoors", 899, 2499, 4.4, 11400, ["Standard"])
    _fam(b, "Football Boot", "Sports & Outdoors", 1999, 5999, 4.3, 7400, ["UK 6", "UK 8"])

TREADMILL_BRANDS = ["Schwinn", "Nautilus", "Crompton", "Havells"]
for b in TREADMILL_BRANDS:
    _fam(b, "Treadmill", "Sports & Outdoors", 39999, 84999, 4.3, 2200, ["Standard", "Pro"])
    _fam(b, "Exercise Cycle", "Sports & Outdoors", 24999, 59999, 4.3, 2800, ["Standard"])

# --- K) home & living (Amazon Home) ---
BEDSHEET_BRANDS = ["Triveni", "Dureva", "Wakefit", "Sleepycat", "Myntra",
                   "Urban Ladder", "Duro", "Casper"]
for b in BEDSHEET_BRANDS:
    _fam(b, "Cotton Bedsheet Queen", "Amazon Home", 1299, 2999, 4.3, 12400, ["White", "Blue", "Grey"])
    _fam(b, "Cotton Bedsheet King", "Amazon Home", 1699, 3999, 4.3, 10800, ["White", "Blue", "Grey"])
    _fam(b, "300 TC Bedsheet King", "Amazon Home", 2499, 4999, 4.3, 8400, ["White", "Grey"])
    _fam(b, "Flannel Bedsheet Queen", "Amazon Home", 999, 2499, 4.2, 9400, ["White", "Grey"])

MATTRESS_BRANDS = ["Wakefit", "Sleepycat", "Dureva", "Casper", "Pepperfury", "Urban Ladder"]
for b in MATTRESS_BRANDS:
    _fam(b, "Orthopedic Mattress Queen", "Amazon Home", 9999, 16999, 4.3, 7400, ["Standard"])
    _fam(b, "Orthopedic Mattress King", "Amazon Home", 12999, 21999, 4.3, 6400, ["Standard"])
    _fam(b, "Memory Foam Mattress Queen", "Amazon Home", 12999, 24999, 4.3, 5400, ["Standard"])

PILLOW_BRANDS = ["Wakefit", "Sleepycat", "Dureva", "Myntra", "Casper"]
for b in PILLOW_BRANDS:
    _fam(b, "Memory Foam Pillow", "Amazon Home", 799, 1999, 4.3, 12400, ["Standard"])
    _fam(b, "Orthopedic Pillow", "Amazon Home", 999, 2499, 4.3, 9400, ["Standard"])

SOFA_BRANDS = ["Urban Ladder", "Pepperfury", "Dureva", "Casper"]
for b in SOFA_BRANDS:
    _fam(b, "2 Seater Sofa", "Amazon Home", 24999, 53999, 4.4, 2400, ["Grey", "Beige"])
    _fam(b, "3 Seater Sofa", "Amazon Home", 34999, 88999, 4.4, 2800, ["Grey", "Beige"])
    _fam(b, "Loveseat Sofa", "Amazon Home", 19999, 54999, 4.4, 2000, ["Grey", "Beige"])

CHAIR_BRANDS = ["Nilkamal", "Livmax", "Flexi", "Godrej", "Casper",
                "Dureva", "Myntra", "Pepperfury"]
for b in CHAIR_BRANDS:
    _fam(b, "Plastic Chair", "Amazon Home", 799, 1499, 4.3, 16400, ["Blue", "Black"])
    _fam(b, "Folding Chair", "Amazon Home", 1299, 2999, 4.2, 11400, ["Blue", "Black"])
    _fam(b, "Ergonomic Chair", "Amazon Home", 4499, 9999, 4.3, 7400, ["Black"])
    _fam(b, "Recliner Chair", "Amazon Home", 12999, 29999, 4.3, 3800, ["Brown", "Black"])

STORAGE_BRANDS = ["Livmax", "Wakefit", "Myntra", "Duro"]
for b in STORAGE_BRANDS:
    _fam(b, "Storage Box 3 Pack", "Amazon Home", 499, 1199, 4.2, 10400, ["Clear"])
    _fam(b, "Wardrobe Box", "Amazon Home", 1499, 3499, 4.2, 6400, ["Beige"])
    _fam(b, "Kitchen Rack", "Amazon Home", 1999, 4999, 4.2, 7400, ["Black"])

CANDLE_BRANDS = ["Pepperfury", "Dureva", "Myntra", "Urban Ladder"]
for b in CANDLE_BRANDS:
    _fam(b, "Scented Candle", "Amazon Home", 599, 1499, 4.3, 11400, ["Vanilla", "Rose", "Lavender"])
    _fam(b, "Candle Set 3", "Amazon Home", 999, 2999, 4.3, 8400, ["Assorted"])
    _fam(b, "Aroma Diffuser", "Amazon Home", 1499, 3999, 4.3, 7400, ["Black", "White"])

CURTAIN_BRANDS = ["Myntra", "Pepperfury", "Dureva", "Urban Ladder", "Triveni"]
for b in CURTAIN_BRANDS:
    _fam(b, "Blackout Curtain 7x5 ft", "Amazon Home", 999, 2999, 4.2, 8400, ["Grey", "Beige"])
    _fam(b, "Sheer Curtain 7x5 ft", "Amazon Home", 799, 2399, 4.2, 9400, ["White"])
    _fam(b, "Cotton Curtain 8x5 ft", "Amazon Home", 899, 2599, 4.2, 7400, ["Beige", "Grey"])

LAMP_BRANDS = ["Wipro AG", "Syska", "Pepperfury", "Myntra"]
for b in LAMP_BRANDS:
    _fam(b, "Table Lamp", "Amazon Home", 1299, 3999, 4.3, 8400, ["Black", "White"])
    _fam(b, "Floor Lamp", "Amazon Home", 2499, 5999, 4.3, 5400, ["Black", "White"])
    _fam(b, "LED Night Light", "Amazon Home", 399, 1099, 4.2, 11400, ["White"])

CLEANING = [
    ("Liril", "Dishwash Liquid 750 ml", 299, 499, 4.4, 24600, ["Lemon"]),
    ("Liril", "Floor Cleaner 1 L", 499, 899, 4.3, 16800, ["Lemon"]),
    ("Liril", "Air Freshener", 199, 399, 4.3, 12400, ["Fresh"]),
    ("Lizol", "Floor Cleaner 1 L", 399, 799, 4.4, 18400, ["Lemon"]),
    ("Lizol", "Disinfectant 500 ml", 299, 599, 4.4, 21600, ["Pine"]),
    ("Vim", "Dishwash Liquid 500 ml", 299, 499, 4.3, 26400, ["Lemon"]),
    ("Vim", "Dishwash Powder 1 kg", 399, 699, 4.3, 15400, ["Lemon"]),
    ("Surf", "Excel Matic Detergent 1 kg", 799, 1499, 4.4, 22400, ["Lavender"]),
    ("Surf", "Excel Detergent 1 kg", 499, 899, 4.4, 28600, ["Classic"]),
    ("Surf", "Easy Detergent 750 g", 399, 699, 4.3, 17400, ["Classic"]),
    ("Harpic", "Toilet Cleaner 500 ml", 249, 499, 4.4, 32400, ["Power"]),
    ("Harpic", "Toilet Gel 500 ml", 299, 599, 4.4, 24600, ["Power"]),
    ("Dettol", "First Aid Kit 15", 299, 599, 4.4, 14600, ["Standard"]),
    ("Dettol", "Soap 9x100 g", 499, 899, 4.5, 38400, ["Antibacterial"]),
    ("Mr Muscle", "Bathroom Cleaner 500 ml", 299, 599, 4.3, 18400, ["Standard"]),
    ("Solimo", "Detergent 2 kg", 999, 1999, 4.2, 12400, ["Classic"]),
    ("Solimo", "Dishwash 500 ml", 199, 399, 4.3, 18600, ["Lemon"]),
]
for b, m, lo, hi, r, nr, vs in CLEANING:
    _fam(b, m, "Amazon Home", lo, hi, r, nr, vs)

# --- L) electronics (All Electronics / Computers) ---
CASE_BRANDS = ["Niloom", "Escent", "Portronics", "Ambrane", "Ringke", "Spigen"]
CASE_PHONES = ["iPhone 15", "iPhone 14", "iPhone 13", "Galaxy S24",
               "Galaxy S23", "Galaxy A55", "Redmi Note 13", "OnePlus 12"]
for b in CASE_BRANDS:
    for ph in CASE_PHONES:
        _fam(b, f"{ph} Phone Case", "Cell Phones & Accessories", 299, 999, 4.2, 14600, ["Black", "Clear"])

CHARGER_BRANDS = ["Portronics", "Ambrane", "boAt", "Anker"]
for b in CHARGER_BRANDS:
    _fam(b, "25 W Fast Charger", "Cell Phones & Accessories", 799, 1799, 4.3, 12400, ["Black"])
    _fam(b, "65 W GaN Charger", "Cell Phones & Accessories", 1499, 3999, 4.4, 9400, ["Black"])
    _fam(b, "3-in-1 Charging Station", "Cell Phones & Accessories", 2499, 5999, 4.3, 5400, ["Black"])

GUARD_BRANDS = ["Niloom", "Escent", "Portronics", "Ambrane"]
for b in GUARD_BRANDS:
    _fam(b, "iPhone 15 Screen Guard", "Cell Phones & Accessories", 299, 699, 4.3, 13400, ["Tempered Glass"])
    _fam(b, "Galaxy S24 Screen Guard", "Cell Phones & Accessories", 299, 699, 4.3, 11400, ["Tempered Glass"])
    _fam(b, "Redmi Note 13 Screen Guard", "Cell Phones & Accessories", 199, 499, 4.2, 14600, ["Tempered Glass"])

POWERBANK_BRANDS = ["boAt", "Ambrane", "Xiaomi", "Anker", "Portronics",
                    "Samsung", "JBL", "Sony"]
for b in POWERBANK_BRANDS:
    _fam(b, "Power Bank 10000 mAh", "Cell Phones & Accessories", 1299, 2499, 4.3, 12400, ["Black"])
    _fam(b, "Power Bank 20000 mAh", "Cell Phones & Accessories", 2499, 4999, 4.3, 14400, ["Black"])

EARBUDS = [
    ("boAt", "Airdopes 141", 1499, 2499, 4.3, 28600),
    ("boAt", "Airdopes 311 Pro", 2999, 4499, 4.3, 16800),
    ("JBL", "Wave Beam", 3999, 5999, 4.4, 11400),
    ("JBL", "Tune 520BTNC Earbuds", 8999, 12999, 4.4, 6400),
    ("Noise", "Buds VS104", 1999, 3499, 4.2, 14600),
    ("Noise", "Buds Vital 500NC", 2999, 4999, 4.3, 9400),
    ("Realme", "Buds Air 5", 3999, 5999, 4.3, 7800),
    ("Realme", "Buds 3", 2999, 4499, 4.3, 9400),
    ("OnePlus", "Buds 3", 4999, 7999, 4.4, 6800),
    ("OnePlus", "Buds Pro 2", 9999, 14999, 4.4, 5400),
    ("Nothing", "Ear (a)", 6999, 9999, 4.4, 4800),
    ("Nothing", "Ear (open)", 4999, 7499, 4.3, 6200),
    ("Samsung", "Galaxy Buds FE", 5999, 8999, 4.4, 9400),
    ("Samsung", "Galaxy Buds2 Pro", 14999, 19999, 4.4, 6800),
    ("Sony", "WF-C500", 5499, 7999, 4.4, 7400),
    ("Xiaomi", "Redmi Buds 4", 1999, 3499, 4.3, 12400),
    ("QCY", "T13 Earbuds", 1299, 2499, 4.2, 15400),
]
for b, m, lo, hi, r, nr in EARBUDS:
    _fam(b, m, "All Electronics", lo, hi, r, nr, ["Black", "White"])

HEADPHONES = [
    ("Sony", "WH-CH520", 5999, 8999, 4.5, 11400),
    ("Sony", "WH-1000XM5", 24999, 34999, 4.6, 14800),
    ("JBL", "Tune 770NC", 9999, 14999, 4.5, 8800),
    ("JBL", "Live 660NC", 16999, 24999, 4.5, 5600),
    ("boAt", "Rockerz 551", 1999, 3499, 4.3, 12400),
    ("boAt", "Rockerz 651", 2999, 4999, 4.3, 8400),
    ("Sennheiser", "HD 450BT", 9999, 14999, 4.5, 4400),
    ("Marshall", "Major IV", 11999, 16999, 4.5, 5400),
]
for b, m, lo, hi, r, nr in HEADPHONES:
    _fam(b, m, "All Electronics", lo, hi, r, nr, ["Black"])

SPEAKERS = [
    ("JBL", "Go 4", 4499, 6999, 4.5, 15800),
    ("JBL", "Charge 5", 12999, 18999, 4.6, 12400),
    ("JBL", "PartyBox 310", 29999, 44999, 4.5, 4200),
    ("boAt", "Aavante 200", 1499, 2499, 4.3, 18400),
    ("boAt", "Stone 1600", 1999, 3499, 4.3, 14600),
    ("Sony", "SRS-XB13", 6999, 9999, 4.4, 8600),
    ("Samsung", "Galaxy Home Mini", 9999, 14999, 4.4, 5400),
    ("LG", "XBOOM 360", 9999, 14999, 4.4, 6400),
    ("Marshall", "Emberton II", 11999, 16999, 4.5, 4800),
    ("Portronics", "Charge Up 1050", 999, 1999, 4.2, 13400),
]
for b, m, lo, hi, r, nr in SPEAKERS:
    _fam(b, m, "All Electronics", lo, hi, r, nr, ["Black", "White"])

SOUNDBARS = [
    ("Samsung", "HW-C450", 19999, 27999, 4.4, 5200),
    ("LG", "SP8 TY", 24999, 34999, 4.4, 4400),
    ("Sony", "HT-S2000", 19999, 29999, 4.4, 5400),
    ("JBL", "Bar 5.0 MultiBeam", 54999, 79999, 4.5, 3400),
    ("boAt", "Soundbar 21000", 9999, 14999, 4.3, 6800),
]
for b, m, lo, hi, r, nr in SOUNDBARS:
    _fam(b, m, "Home Audio & Theater", lo, hi, r, nr, ["Black"])

TV = [
    ("Samsung", "43 inch Crystal UHD TV", 24999, 32999, 4.4, 9400),
    ("Samsung", "55 inch Crystal UHD TV", 38999, 49999, 4.4, 8400),
    ("Samsung", "65 inch Neo QLED TV", 89999, 129999, 4.5, 4400),
    ("LG", "43 inch UHD TV", 26999, 34999, 4.4, 8400),
    ("LG", "55 inch UHD TV", 42999, 56999, 4.4, 7600),
    ("LG", "65 inch OLED TV", 129999, 189999, 4.6, 3400),
    ("Sony", "43 inch Bravia TV", 27999, 36999, 4.4, 7400),
    ("Sony", "55 inch Bravia TV", 44999, 59999, 4.4, 6400),
    ("Sony", "65 inch Bravia TV", 69999, 99999, 4.5, 4400),
    ("Hisense", "43 inch UHD TV", 22999, 29999, 4.3, 6400),
    ("Hisense", "55 inch UHD TV", 34999, 44999, 4.3, 5800),
    ("Vu", "43 inch 4K TV", 21999, 28999, 4.2, 7400),
    ("Vu", "55 inch 4K TV", 32999, 42999, 4.3, 6400),
    ("Xiaomi", "43 inch TV", 21999, 28999, 4.3, 8400),
    ("Xiaomi", "55 inch TV", 32999, 42999, 4.3, 7400),
    ("Panasonic", "43 inch 4K TV", 25999, 33999, 4.4, 6400),
    ("Panasonic", "55 inch 4K TV", 41999, 55999, 4.4, 5400),
]
for b, m, lo, hi, r, nr in TV:
    _fam(b, m, "All Electronics", lo, hi, r, nr, ["Black"])

TVSTICK = [
    ("Xiaomi", "TV Stick 2", 2999, 4499, 4.4, 12600),
    ("Jio", "Jio TV Stick", 1999, 3499, 4.2, 8400),
    ("Airtel", "Airtel Xstream Stick", 1499, 2999, 4.2, 9400),
]
for b, m, lo, hi, r, nr in TVSTICK:
    _fam(b, m, "All Electronics", lo, hi, r, nr, ["Black"])

ROUTER = [
    ("TP-Link", "Archer C6 Router", 2999, 4499, 4.4, 12400),
    ("TP-Link", "Archer AX55 Router", 5999, 8999, 4.4, 9800),
    ("TP-Link", "Deco M5 Mesh Router", 7999, 11999, 4.4, 7400),
    ("TP-Link", "Archer C20 Router", 1999, 2999, 4.3, 14600),
    ("Jio", "Air Fiber Router", 2999, 4999, 4.3, 11200),
    ("Jio", "JioFi 2", 2499, 3999, 4.2, 13400),
    ("Airtel", "AX 30 Router", 3999, 5999, 4.3, 8600),
    ("Airtel", "Airfiber Router", 2999, 4999, 4.3, 9400),
    ("Mercusys", "MR70X Router", 4999, 7999, 4.3, 5400),
    ("Mercusys", "MW3XH Router", 2999, 4999, 4.2, 7800),
    ("Tenda", "AX12 Router", 2999, 4499, 4.3, 6400),
    ("Tenda", "F3 Router", 1299, 2299, 4.2, 8800),
    ("D-Link", "DIR-823G Router", 3999, 6499, 4.3, 4400),
]
for b, m, lo, hi, r, nr in ROUTER:
    _fam(b, m, "All Electronics", lo, hi, r, nr, ["Black"])

CCTV = [
    ("Tapo", "C200 CCTV Camera", 2999, 4499, 4.3, 9400),
    ("Tapo", "C310 CCTV Camera", 3499, 5499, 4.3, 8600),
    ("Tapo", "C110 CCTV Camera", 2499, 3999, 4.2, 10800),
    ("Imou", "Ranger 2 CCTV Camera", 4999, 7999, 4.3, 5800),
    ("Imou", "C3 CCTV Camera", 3499, 5999, 4.2, 7200),
    ("Ezviz", "C6N CCTV Camera", 5999, 8999, 4.3, 4600),
    ("Ezviz", "C3C CCTV Camera", 4999, 7499, 4.2, 5400),
    ("Jio", "CCTV Camera", 2499, 4499, 4.2, 6400),
]
for b, m, lo, hi, r, nr in CCTV:
    _fam(b, m, "All Electronics", lo, hi, r, nr, ["Black"])

INVERTER = [
    ("Luminous", "Zinga 600 VA Inverter", 12999, 16999, 4.3, 4200),
    ("Luminous", "Zelio 1100 VA Inverter", 17999, 24999, 4.3, 5400),
    ("Luminous", "Lux 1100 VA Inverter", 14999, 19999, 4.3, 6400),
    ("Microtek", "Inverters 600 VA", 11999, 15999, 4.3, 3800),
    ("Microtek", "Inverters 1100 VA", 15999, 21999, 4.3, 4600),
    ("Su-Kam", "Inverter 1100 VA", 16999, 23999, 4.3, 4800),
    ("Su-Kam", "Inverter 1500 VA", 21999, 29999, 4.3, 3400),
    ("Crompton", "Inverter 1100 VA", 14999, 19999, 4.3, 5200),
    ("Hinncean", "Inverter 900 VA", 11999, 15999, 4.2, 3600),
    ("V-Guard", "Inverter 1100 VA", 15999, 21999, 4.3, 4400),
]
for b, m, lo, hi, r, nr in INVERTER:
    _fam(b, m, "Appliances", lo, hi, r, nr, ["Standard"])

BATTERY = [
    ("Exide", "Inverter Tubular Battery 150 Ah", 14999, 19999, 4.4, 6800),
    ("Exide", "Inverter Tubular Battery 180 Ah", 17999, 23999, 4.4, 5400),
    ("Amara Raja", "Inverter Tubular Battery 150 Ah", 14499, 19499, 4.4, 5800),
    ("Amara Raja", "Inverter Tubular Battery 220 Ah", 22999, 31999, 4.4, 4200),
    ("Crompton", "Voltage Stabilizer 20 A", 2999, 4999, 4.3, 8600),
    ("Luminous", "Voltage Stabilizer 30 A", 3499, 5999, 4.3, 6400),
]
for b, m, lo, hi, r, nr in BATTERY:
    _fam(b, m, "Appliances", lo, hi, r, nr, ["Standard"])

PC = [
    ("HP", "15s Laptop i5 16GB 512GB", 52999, 69999, 4.4, 8400),
    ("HP", "250 G10 Laptop i5 16GB", 54999, 74999, 4.3, 7400),
    ("HP", "Pavilion 15 i7 16GB", 64999, 89999, 4.4, 6200),
    ("HP", "Envy 15 i7 32GB", 89999, 129999, 4.5, 4400),
    ("Dell", "Inspiron 15 i5 16GB", 59999, 84999, 4.4, 7400),
    ("Dell", "Vostro 3520 i5 16GB", 54999, 74999, 4.3, 5800),
    ("Lenovo", "IdeaPad Slim 3 i5 16GB", 54999, 79999, 4.4, 9400),
    ("Lenovo", "ThinkPad E14 i5 16GB", 74999, 109999, 4.5, 6400),
    ("ASUS", "VivoBook 15 i5 16GB", 59999, 84999, 4.4, 8400),
    ("ASUS", "TUF Gaming F15 i7 RTX", 79999, 119999, 4.5, 7400),
    ("Acer", "Aspire 5 i5 16GB", 52999, 74999, 4.3, 9400),
    ("Acer", "Nitro 5 i7 RTX 3050", 64999, 94999, 4.4, 6800),
    ("Xiaomi", "RedmiBook Pro 14 i5", 74999, 99999, 4.4, 4800),
    ("HP", "24 inch Monitor", 7999, 11999, 4.4, 8400),
    ("Dell", "24 inch Monitor", 8999, 12999, 4.4, 7200),
    ("LG", "24 inch Monitor", 8499, 12499, 4.4, 8400),
    ("Samsung", "24 inch Monitor", 8999, 13999, 4.4, 7800),
    ("BenQ", "27 inch Monitor", 14999, 22999, 4.5, 5400),
    ("Xiaomi", "27 inch Monitor", 10999, 16999, 4.4, 6400),
    ("Western Digital", "SN580 SSD 500 GB", 4999, 6999, 4.5, 14600),
    ("Western Digital", "SN580 SSD 1 TB", 7999, 10999, 4.5, 12400),
    ("Samsung", "980 SSD 1 TB", 9999, 13999, 4.5, 10400),
    ("Kingston", "NV2 SSD 1 TB", 6999, 9999, 4.4, 9400),
    ("Crucial", "P3 SSD 1 TB", 7499, 10499, 4.4, 8400),
    ("Seagate", "1 TB HDD", 3799, 5299, 4.4, 14600),
    ("Western Digital", "1 TB HDD", 3999, 5499, 4.4, 16400),
    ("Western Digital", "2 TB HDD", 5499, 7499, 4.4, 11200),
    ("Logitech", "G231 Gaming Mouse", 2499, 4499, 4.4, 8400),
    ("Logitech", "M185 Wireless Mouse", 799, 1299, 4.4, 14600),
    ("Logitech", "K380 Keyboard", 3499, 5499, 4.4, 9400),
    ("Logitech", "C920 Webcam", 6999, 9999, 4.5, 8400),
    ("HP", "Wireless Mouse", 999, 1999, 4.3, 11800),
    ("Dell", "Keyboard Mouse Combo", 1999, 3999, 4.3, 8400),
    ("Portronics", "Gaming Mouse", 699, 1499, 4.2, 12400),
    ("Anker", "360 Webcam", 4499, 7999, 4.3, 4400),
]
for b, m, lo, hi, r, nr in PC:
    _fam(b, m, "Computers", lo, hi, r, nr, ["Black", "Silver"])

# --- M) auto (Automotive) ---
HELMET_BRANDS = ["Stello", "KYT", "Regal", "Stilo", "TVS"]
for b in HELMET_BRANDS:
    _fam(b, "Full Face Helmet", "Automotive", 2499, 5999, 4.3, 8400, ["M", "L"])
    _fam(b, "Open Face Helmet", "Automotive", 1999, 4999, 4.3, 9400, ["M", "L"])
    _fam(b, "Half Face Helmet", "Automotive", 1499, 3999, 4.2, 10400, ["M", "L"])

DASHCAM = [
    ("Jio", "Dash Cam 2K", 4999, 7999, 4.3, 6400),
    ("Jio", "Dash Cam Pro 4K", 6999, 10999, 4.3, 4800),
    ("Airtel", "Dash Cam 2K", 4499, 6999, 4.2, 5400),
    ("iOttie", "Dash Cam", 2999, 5999, 4.2, 8400),
]
for b, m, lo, hi, r, nr in DASHCAM:
    _fam(b, m, "Automotive", lo, hi, r, nr, ["Black"])

CARSPEAKER = [
    ("boAt", "Car Speaker", 1999, 3999, 4.2, 9400),
    ("JBL", "Car Speaker", 3999, 6999, 4.4, 7400),
    ("Portronics", "Car Speaker", 1499, 2999, 4.2, 11600),
    ("Portronics", "Car Charger 45 W", 499, 999, 4.3, 18400),
    ("iOttie", "Phone Mount Magnetic", 599, 1299, 4.3, 15400),
    ("Jio", "Phone Mount", 999, 1999, 4.2, 8800),
    ("Portronics", "Car Seat Cover 5", 1999, 4999, 4.2, 8400),
    ("Portronics", "Tire Inflator", 999, 1999, 4.2, 9400),
    ("JBL", "Car Perfume", 499, 999, 4.2, 11200),
]
for b, m, lo, hi, r, nr in CARSPEAKER:
    _fam(b, m, "Automotive", lo, hi, r, nr, ["Black", "Blue"])

# --- N) office (Office Products) ---
OFFICE = [
    ("Godrej", "Filing Cabinet 4 Drawer", 4999, 9999, 4.3, 3400, ["Grey"]),
    ("Godrej", "Steel Locker", 12999, 24999, 4.3, 2800, ["Grey"]),
    ("Casio", "120 Scientific Calculator", 999, 1699, 4.4, 11400, ["Standard"]),
    ("Casio", "170 Scientific Calculator", 1499, 2499, 4.4, 8600, ["Standard"]),
    ("Casio", "DX12B Desktop Calculator", 1299, 2199, 4.3, 7400, ["Standard"]),
    ("Canon", "12 Digit Calculator", 699, 1299, 4.3, 9800, ["Standard"]),
    ("3M", "Post-it Notes 99", 99, 199, 4.5, 28400, ["Assorted"]),
    ("3M", "Scotch Tape 3 Pack", 149, 299, 4.4, 22600, ["Standard"]),
    ("Dawa", "Executive Notebook", 499, 899, 4.3, 6400, ["Black"]),
]
for b, m, lo, hi, r, nr, vs in OFFICE:
    _fam(b, m, "Office Products", lo, hi, r, nr, vs)

# --- O) pets (Pet Supplies) ---
PETFOOD_BRANDS = ["True Instinct", "Purina", "Royal Canin", "Whiskas",
                  "Sakhana", "Pedigree"]
for b in PETFOOD_BRANDS:
    _fam(b, "Dog Food 3 kg", "Pet Supplies", 1499, 2999, 4.3, 8600, ["6 kg"])
    _fam(b, "Cat Food 1.2 kg", "Pet Supplies", 999, 2299, 4.3, 9400, ["2.4 kg"])

PETTOY_BRANDS = ["Furbaby", "Petalicious", "Petzy", "Hombro", "TriPaw", "Preet"]
for b in PETTOY_BRANDS:
    _fam(b, "Dog Toy 3 Pack", "Pet Supplies", 299, 799, 4.3, 9400, ["Assorted"])
    _fam(b, "Cat Toy", "Pet Supplies", 199, 599, 4.3, 8400, ["Assorted"])
    _fam(b, "Chew Toy", "Pet Supplies", 349, 799, 4.3, 7400, ["Standard"])

PETBED_BRANDS = ["Furbaby", "Hombro", "Preena Pet", "Preet", "TriPaw"]
for b in PETBED_BRANDS:
    _fam(b, "Dog Bed Medium", "Pet Supplies", 1499, 3999, 4.3, 7400, ["Large"])
    _fam(b, "Cat Bed", "Pet Supplies", 999, 2999, 4.3, 6400, ["Standard"])

# --- P) musical instruments ---
MUSIC = [
    ("Yamaha", "TDF202D Keyboard", 24999, 39999, 4.5, 4400),
    ("Yamaha", "DGX220 Keyboard", 34999, 49999, 4.5, 3800),
    ("Yamaha", "F310 Acoustic Guitar", 15999, 24999, 4.5, 5400),
    ("Fender", "Squier Stratocaster", 14999, 24999, 4.5, 4800),
    ("Fender", "Squier Affinity Stratocaster", 9999, 16999, 4.5, 6400),
    ("Cort", "AD810 Acoustic Guitar", 7999, 12999, 4.4, 5400),
    ("Kayomi", "Acoustic Guitar", 4999, 8999, 4.3, 7400),
    ("Kayomi", "61 Key Keyboard", 9999, 16999, 4.3, 4400),
    ("Monarch", "Harmonium", 4999, 8999, 4.4, 5400),
    ("Kayomi", "Harmonium", 6999, 12999, 4.3, 4800),
]
for b, m, lo, hi, r, nr in MUSIC:
    _fam(b, m, "Musical Instruments", lo, hi, r, nr, ["Standard"])

# --- Q) winter wear (AMAZON FASHION) - the missing season ---
WIN_MEN = ["Fabindia", "US Polo", "Levi's", "Peter England", "Van Heusen",
           "Roadster", "Manyavar", "Aurelia"]
for b in WIN_MEN:
    _fam(b, "Men's Round Neck Sweater", "AMAZON FASHION", 899, 2999, 4.2, 9800,
         _cart(COLORS5, SIZES4))
    _fam(b, "Men's Full Sleeve Sweatshirt", "AMAZON FASHION", 699, 1999, 4.2, 11200,
         _cart(COLORS4, SIZES4))
    _fam(b, "Woolen Jacket Men", "AMAZON FASHION", 1999, 7999, 4.3, 5400,
         _cart(COLORS3, SIZES4))
    _fam(b, "Wool Coat Men", "AMAZON FASHION", 2999, 9999, 4.3, 4200,
         _cart(COLORS3, SIZES3))
WIN_WOMEN = ["W for Woman", "Anouk", "Alinea", "Myntra", "Aurelia", "Libas"]
for b in WIN_WOMEN:
    _fam(b, "Women's Woolen Sweater", "AMAZON FASHION", 899, 3299, 4.2, 8600,
         _cart(COLORS6, SIZES4))
    _fam(b, "Women's Puffer Jacket", "AMAZON FASHION", 1499, 6999, 4.3, 5200,
         _cart(COLORS3, SIZES4))
    _fam(b, "Women's Winter Coat", "AMAZON FASHION", 2499, 8999, 4.3, 3800,
         _cart(COLORS3, SIZES3))
WIN_KIDS = ["Myntra", "Anouk", "Alinea", "Global Desi"]
for b in WIN_KIDS:
    _fam(b, "Kids Winter Jacket", "AMAZON FASHION", 799, 2999, 4.2, 6400,
         ["4-6 Yrs", "6-8 Yrs", "8-10 Yrs"])
    _fam(b, "Kids Woolen Sweater", "AMAZON FASHION", 499, 1499, 4.2, 7400,
         ["4-6 Yrs", "6-8 Yrs", "8-10 Yrs"])
WIN_INNER = ["Jockey", "FOTL", "Zouk"]
for b in WIN_INNER:
    _fam(b, "Thermal Innerwear Men 2 Pack", "AMAZON FASHION", 499, 1199, 4.1, 12400, SIZES3)
    _fam(b, "Thermal Innerwear Women 2 Pack", "AMAZON FASHION", 499, 1299, 4.1, 11600, SIZES3)
WIN_WARM = ["Fastrack", "Hidesign", "Jockey", "FOTL"]
for b in WIN_WARM:
    _fam(b, "Woolen Cap", "AMAZON FASHION", 199, 599, 4.1, 14200,
         ["Black", "Wine", "Grey"])
    _fam(b, "Woolen Socks 3 Pack", "AMAZON FASHION", 199, 499, 4.1, 15600,
         ["Black", "Grey", "Assorted"])

# --- R) home health & elder care (Health & Personal Care) ---
HEALTH = [
    ("Omron", "BP Monitor HEM-7156", 2499, 3999, 4.5, 8200, ["Standard"]),
    ("Omron", "Nebulizer NE-C28", 1799, 2999, 4.4, 6400, ["Standard"]),
    ("Omron", "Pulse Oximeter", 1299, 2299, 4.4, 5600, ["Standard"]),
    ("Dr. Morepen", "BP Monitor BP-02", 1499, 2799, 4.3, 9800, ["Standard"]),
    ("Dr. Morepen", "Glucometer Easy Care", 1199, 1999, 4.2, 8600, ["Test Strips 25"]),
    ("Dr. Morepen", "Digital Thermometer", 499, 899, 4.2, 12400, ["Standard"]),
    ("Accu-Chek", "Glucometer Active", 1799, 2999, 4.4, 4800, ["Standard"]),
    ("BPL", "BP Monitor WinBP", 1699, 2999, 4.2, 5400, ["Standard"]),
    ("Dr. Morepen", "Folding Walker with Seat", 2999, 5999, 4.2, 3200, ["Standard"]),
    ("Omron", "Folding Wheelchair 20 inch", 12999, 24999, 4.3, 1800, ["Standard"]),
    ("Duro", "Folding Hospital Bed", 14999, 32999, 4.1, 900, ["6 Foot"]),
    ("Duro", "Commode Chair with Bucket", 2799, 5499, 4.1, 1400, ["Standard"]),
]
for b, m, lo, hi, r, nr, vs in HEALTH:
    _fam(b, m, "Health & Personal Care", lo, hi, r, nr, vs)
KNEE = ["Decathlon", "OSPEY", "PowerMax"]
for b in KNEE:
    _fam(b, "Knee Support 2 Pack", "Health & Personal Care", 399, 899, 4.1, 16800, SIZES_MEN)
STICK = ["Duro", "OSPEY"]
for b in STICK:
    _fam(b, "Walking Stick with Seat", "Health & Personal Care", 999, 2499, 4.2, 4200, ["Standard"])
ORTHO = ["Wakefit", "Sleepycat", "Duro"]
for b in ORTHO:
    _fam(b, "Orthopedic Pillow", "Health & Personal Care", 1299, 3299, 4.2, 7600, ["Standard"])

# --- S) feature phones - the mass segment (Cell Phones & Accessories) ---
FEATURE = [
    ("Nokia", "105 (2023) 1.8 inch", 999, 1399, 4.2, 14200, ["Black"]),
    ("Nokia", "110 2.4 inch", 1499, 1899, 4.2, 11800, ["Black"]),
    ("Nokia", "150 Dual SIM", 1999, 2499, 4.1, 9400, ["Black"]),
    ("Nokia", "220 2.8 inch FM", 2299, 2899, 4.2, 7800, ["Blue"]),
    ("Itel", "Itel A16 2.8 inch", 1299, 1699, 4.0, 8600, ["Black"]),
    ("Itel", "Itel L5 Plus 2.4 inch", 1699, 2199, 4.0, 7200, ["Black"]),
    ("Karbonn", "Karbonn A5+ 3.5 inch", 999, 1499, 3.9, 6400, ["Black"]),
]
for b, m, lo, hi, r, nr, vs in FEATURE:
    _fam(b, m, "Cell Phones & Accessories", lo, hi, r, nr, vs)

# --- T) luggage & travel (Luggage & Travel) ---
LUG = ["Samsonite", "American Tourister", "Skybags", "baggit", "Hidesign"]
for b in LUG:
    _fam(b, "20 inch Trolley 4 Wheel", "Luggage & Travel", 2499, 6999, 4.3, 6800,
         ["Black", "Silver", "Red"])
    _fam(b, "28 inch Trolley 4 Wheel", "Luggage & Travel", 3499, 8999, 4.3, 5400,
         ["Black", "Silver", "Red"])
    _fam(b, "18 inch Trolley 2 Wheel", "Luggage & Travel", 1499, 3999, 4.2, 7400,
         ["Black", "Grey"])
    _fam(b, "Backpack 40 L", "Luggage & Travel", 999, 2999, 4.2, 8200, ["Black", "Grey"])
    _fam(b, "Travel Neck Pillow", "Luggage & Travel", 499, 1499, 4.1, 9600,
         ["Grey", "Blue"])
TRAVEL = ["Ambrane", "boAt"]
for b in TRAVEL:
    _fam(b, "Universal Travel Adapter", "Luggage & Travel", 399, 999, 4.1, 10400, ["Standard"])

# --- U) engagement & diamond jewellery (AMAZON FASHION) ---
ENGAGE = [
    ("CaratLane", "Lab Grown Diamond Ring 0.5 Carat", 24999, 49999, 4.4, 2400, ["18K Gold"]),
    ("CaratLane", "Diamond Band 0.3 Carat", 14999, 29999, 4.4, 3200, ["White Gold"]),
    ("Tanishq", "Diamond Ring 0.5 Carat", 34999, 69999, 4.5, 1800, ["18K Gold"]),
    ("Tanishq", "Bridal Diamond Set", 89999, 189999, 4.5, 900, ["Set of 3"]),
    ("GIVA", "Lab Grown Diamond Ring 1 Carat", 29999, 59999, 4.4, 2200, ["Platinum"]),
    ("Bluestone", "Lab Grown Diamond Ring 0.75 Carat", 19999, 39999, 4.4, 2600, ["18K Gold"]),
    ("CaratLane", "Pearl Necklace Set", 4999, 14999, 4.3, 3800, ["White Pearl"]),
    ("Nripendra", "Pearl Earring Set", 2999, 7999, 4.3, 4600, ["Assorted"]),
    ("Muthoot", "Moongta Set 22K", 12999, 24999, 4.4, 1600, ["With Jhumka"]),
]
for b, m, lo, hi, r, nr, vs in ENGAGE:
    _fam(b, m, "AMAZON FASHION", lo, hi, r, nr, vs)

# --- V) ethnic footwear (AMAZON FASHION) ---
ETH_SHOES = ["Bata", "Relaxo", "Sportax"]
for b in ETH_SHOES:
    _fam(b, "Mojari", "AMAZON FASHION", 399, 999, 4.1, 11400, SHOE_SIZES)
    _fam(b, "Jutti", "AMAZON FASHION", 499, 1499, 4.2, 9600, SHOE_SIZES)
    _fam(b, "Harpa", "AMAZON FASHION", 349, 899, 4.0, 10400, SHOE_SIZES)
    _fam(b, "Kolhapuri Chappal", "AMAZON FASHION", 599, 1699, 4.2, 7400, SHOE_SIZES)
    _fam(b, "Ethnic Sandals Women", "AMAZON FASHION", 599, 1999, 4.1, 8800,
         ["UK 4", "UK 5", "UK 6", "UK 7"])
    _fam(b, "School Shoes Kids", "AMAZON FASHION", 499, 1299, 4.1, 9200,
         ["UK 2", "UK 3", "UK 4", "UK 5"])

# --- W) tiffin & food storage (Amazon Home) ---
TIF = ["Presto", "Cello", "Welsun", "Pigeon"]
for b in TIF:
    _fam(b, "Steel Lunch Box 2 Tiffin", "Amazon Home", 499, 999, 4.2, 12600,
         ["Single", "Double"])
    _fam(b, "Steel Tiffin Carrier 4 Layer", "Amazon Home", 899, 1999, 4.2, 9800,
         ["20 L", "30 L"])
    _fam(b, "Steel Water Bottle 1 L", "Amazon Home", 599, 1499, 4.2, 10400,
         ["600 ml", "1 L"])
    _fam(b, "Masala Box 6 Piece", "Amazon Home", 299, 699, 4.1, 13400,
         ["4 Piece", "6 Piece"])
    _fam(b, "Fruit Box with Divider", "Amazon Home", 399, 899, 4.1, 11800,
         ["Single", "Double"])
    _fam(b, "Food Container Set 4", "Amazon Home", 499, 999, 4.1, 12200,
         ["Round", "Rectangular"])

# --- X) ayurveda & wellness staples ---
AYUR = [
    ("Dabur", "Honey 500 g", 249, 399, 4.3, 18400, ["500 g", "1 kg"]),
    ("Dabur", "Red Kumkumadi Oil 20 ml", 449, 699, 4.3, 9600, ["10 ml", "20 ml"]),
    ("Patanjali", "Chyawanprash 1 kg", 299, 449, 4.2, 14200, ["500 g", "1 kg"]),
    ("Patanjali", "Amla Juice 1 L", 199, 299, 4.2, 11800, ["500 ml", "1 L"]),
    ("Himalaya", "Turmeric Face Pack 200 g", 129, 229, 4.1, 16800, ["100 g", "200 g"]),
    ("Himalaya", "Ashwagandha Capsules 60", 349, 549, 4.2, 8400, ["30", "60"]),
    ("Dabur", "Henna Cones for Shaadi", 99, 199, 4.1, 12400, ["25 g", "50 g"]),
]
for b, m, lo, hi, r, nr, vs in AYUR:
    cat = "Amazon Home" if "Henna" in m else ("All Beauty" if "Face Pack" in m or "Kumkumadi" in m else "Health & Personal Care")
    _fam(b, m, cat, lo, hi, r, nr, vs)

if __name__ == "__main__":
    from build_catalog import band_id
    f = india_frame(band_id)
    print(f.head(12).to_string())
    print(f["main_category"].value_counts().to_string())
