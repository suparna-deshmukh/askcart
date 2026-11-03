"""
Curated real-model supplement for the AskCart catalog builder.

Why: the US Amazon 2023 pool (milistu/AMAZON-Products-2023) is heavily
accessory-skewed - genuine flagships (smartphones, TVs, laptops) are barely
present, so "iphone" / "smart tv" / "laptop" searches would only surface
cases, straps and antennas. The supplement forces well-known, genuinely
sold models (brands/models/MRPs as listed on Amazon.in & Flipkart,
INR prices) into the 15 flagship anchor classes, keeping the catalogue a
realistic Indian e-commerce surface. Swap-in/swap-out keeps the total at
exactly TARGET and preserves the (category, band) mix.
"""
import numpy as np
import pandas as pd

# extra brand recognizers for the supplemented models
EXTRA_BRANDS = {
    "sennheiser": "Sennheiser", "asics": "ASICS", "nautica": "Nautica",
    "razer": "Razer", "audio-technica": "Audio-Technica", "insta360": "Insta360",
    "fujifilm": "Fujifilm", "kaytone": "Kaytone", "cordoba": "Cordoba",
    "manduka": "Manduka", "yogen": "Yogen", "pigeon": "Pigeon",
    "prestige": "Prestige", "cello": "Cello", "bajaj": "Bajaj",
    "ifb": "IFB", "havells": "Havells",
    "cuckoo": "Cuckoo", "miyako": "Miyako", "petalicious": "Petalicious",
    "furbaby": "Furbaby", "petzy": "Petzy", "tripaw": "TriPaw",
    "preena": "Preena", "anout": None, "anouk": "Anouk", "global desi": "Global Desi",
    "libas": "Libas", "biba": "Biba", "manyavar": "Manyavar",
    "rina banerjee": "Rina Banerjee", "skechers": "Skechers",
    "bently london": "Bently London", "montblanc": "Montblanc",
    "beardo": "Beardo", "park avenue": "Park Avenue", "bella vita": "Bella Vita",
    "wild stone": "Wild Stone", "amazfit": "Amazfit", "fire-boltt": "Fire-Boltt",
    "hombro": "Hombro",
}
EXTRA_BRANDS = {k: v for k, v in EXTRA_BRANDS.items() if v}

# (title, main_category, price_inr, rating, num_ratings) - real models, INR MRPs
SUPPLEMENT = [
    # --- smartphones (Cell Phones & Accessories) ---
    ("Redmi Note 13 (8 GB RAM, 256 GB Storage, 5G) Smartphone", "Cell Phones & Accessories", 13999, 4.4, 21400),
    ("Redmi Note 13 Pro (8 GB RAM, 256 GB Storage, 5G) Smartphone", "Cell Phones & Accessories", 20999, 4.5, 7700),
    ("Redmi 13C (6 GB RAM, 128 GB Storage) Smartphone", "Cell Phones & Accessories", 9999, 4.4, 18900),
    ("Redmi A3 (4 GB RAM, 64 GB Storage) Smartphone", "Cell Phones & Accessories", 6499, 4.3, 9600),
    ("Realme Narzo 70 (8 GB RAM, 128 GB Storage, 5G) Smartphone", "Cell Phones & Accessories", 12999, 4.3, 8600),
    ("Realme 12 (8 GB RAM, 128 GB Storage, 5G) Smartphone", "Cell Phones & Accessories", 14999, 4.3, 4200),
    ("Realme GT 6T (8 GB RAM, 256 GB Storage, 5G) Smartphone", "Cell Phones & Accessories", 24999, 4.4, 2600),
    ("Realme Narzo 60x (8 GB RAM, 128 GB Storage) Smartphone", "Cell Phones & Accessories", 10999, 4.3, 2400),
    ("Samsung Galaxy M35 5G (8 GB RAM, 128 GB Storage) Smartphone", "Cell Phones & Accessories", 15999, 4.5, 15200),
    ("Samsung Galaxy A16 5G (6 GB RAM, 128 GB Storage) Smartphone", "Cell Phones & Accessories", 12499, 4.4, 9800),
    ("Samsung Galaxy A55 5G (8 GB RAM, 128 GB Storage) Smartphone", "Cell Phones & Accessories", 23999, 4.5, 8800),
    ("Samsung Galaxy F15 5G (8 GB RAM, 128 GB Storage) Smartphone", "Cell Phones & Accessories", 13999, 4.3, 6100),
    ("Samsung Galaxy S24 5G (8 GB RAM, 256 GB Storage) Smartphone", "Cell Phones & Accessories", 64999, 4.5, 2400),
    ("Samsung Galaxy S23 FE 5G (8 GB RAM, 128 GB Storage) Smartphone", "Cell Phones & Accessories", 44999, 4.5, 1900),
    ("POCO X6 5G (8 GB RAM, 256 GB Storage) Smartphone", "Cell Phones & Accessories", 17999, 4.4, 12700),
    ("POCO M6 Pro 5G (8 GB RAM, 128 GB Storage) Smartphone", "Cell Phones & Accessories", 13499, 4.3, 3800),
    ("POCO F6 (12 GB RAM, 256 GB Storage, 5G) Smartphone", "Cell Phones & Accessories", 28999, 4.6, 2200),
    ("iQOO Neo 9 (8 GB RAM, 256 GB Storage, 5G) Smartphone", "Cell Phones & Accessories", 26999, 4.5, 6400),
    ("iQOO Z9 5G (8 GB RAM, 256 GB Storage) Smartphone", "Cell Phones & Accessories", 16999, 4.4, 4100),
    ("Motorola Edge 50 Fusion (8 GB RAM, 256 GB Storage, 5G) Smartphone", "Cell Phones & Accessories", 19999, 4.4, 7300),
    ("Moto G85 5G (8 GB RAM, 128 GB Storage) Smartphone", "Cell Phones & Accessories", 14999, 4.4, 2900),
    ("Moto G54 5G (8 GB RAM, 128 GB Storage) Smartphone", "Cell Phones & Accessories", 13999, 4.3, 5100),
    ("Motorola G45 5G (6 GB RAM, 128 GB Storage) Smartphone", "Cell Phones & Accessories", 9499, 4.3, 3700),
    ("OnePlus Nord CE4 (8 GB RAM, 128 GB Storage, 5G) Smartphone", "Cell Phones & Accessories", 20999, 4.4, 11200),
    ("OnePlus 12R (12 GB RAM, 256 GB Storage, 5G) Smartphone", "Cell Phones & Accessories", 45999, 4.6, 3100),
    ("OnePlus 12 (12 GB RAM, 512 GB Storage, 5G) Smartphone", "Cell Phones & Accessories", 64999, 4.6, 900),
    ("Vivo T3x (8 GB RAM, 128 GB Storage, 5G) Smartphone", "Cell Phones & Accessories", 14999, 4.3, 5400),
    ("Vivo V30 (8 GB RAM, 256 GB Storage, 5G) Smartphone", "Cell Phones & Accessories", 29999, 4.4, 3300),
    ("Google Pixel 8a (8 GB RAM, 128 GB Storage) Smartphone", "Cell Phones & Accessories", 46999, 4.5, 1800),
    ("Google Pixel 8 (8 GB RAM, 128 GB Storage) Smartphone", "Cell Phones & Accessories", 69999, 4.5, 700),
    ("Apple iPhone 13 (128 GB) Smartphone", "Cell Phones & Accessories", 52900, 4.7, 8400),
    ("Apple iPhone 14 (128 GB) Smartphone", "Cell Phones & Accessories", 65900, 4.7, 5200),
    ("Apple iPhone 15 (128 GB) Smartphone", "Cell Phones & Accessories", 79900, 4.7, 3900),
    ("Apple iPhone 16 (128 GB) Smartphone", "Cell Phones & Accessories", 79900, 4.8, 2100),
    ("Apple iPhone 16 Pro (128 GB) Smartphone", "Cell Phones & Accessories", 114900, 4.8, 1500),
    ("Nothing Phone (2a) (8 GB RAM, 128 GB Storage) Smartphone", "Cell Phones & Accessories", 22999, 4.5, 5600),
    # --- smartwatches (Cell Phones & Accessories) ---
    ("boAt Wave Style Smartwatch", "Cell Phones & Accessories", 1499, 4.2, 24600),
    ("boAt Wave (4G) Smartwatch", "Cell Phones & Accessories", 2499, 4.2, 18700),
    ("boAt Stalwart Neo Smartwatch", "Cell Phones & Accessories", 3499, 4.3, 5400),
    ("Fire-Boltt Nimbus Smartwatch", "Cell Phones & Accessories", 1299, 4.2, 32400),
    ("Fire-Boltt Blaze 2 Smartwatch", "Cell Phones & Accessories", 2299, 4.2, 6700),
    ("Noise ColorFit Ultra 3E Smartwatch", "Cell Phones & Accessories", 1995, 4.3, 7600),
    ("Noise ColorFit Pro 5 Smartwatch", "Cell Phones & Accessories", 2495, 4.3, 9800),
    ("Noise Edge Pulse Smartwatch", "Cell Phones & Accessories", 4995, 4.3, 2900),
    ("Noise Fusion Max Smartwatch", "Cell Phones & Accessories", 7495, 4.4, 1800),
    ("Amazfit Bip 5 Smartwatch", "Cell Phones & Accessories", 4999, 4.4, 3400),
    ("Redmi Watch 3 Smartwatch", "Cell Phones & Accessories", 5999, 4.4, 8700),
    ("Samsung Galaxy Watch 6 (44 mm, Bluetooth) Smartwatch", "Cell Phones & Accessories", 24999, 4.4, 1200),
    ("Apple Watch SE (2nd Generation, 40 mm, GPS) Smartwatch", "Cell Phones & Accessories", 29900, 4.7, 2100),
    ("Apple Watch Series 9 (41 mm, GPS) Smartwatch", "Cell Phones & Accessories", 42900, 4.8, 1600),
    # --- laptops (Computers) ---
    ("HP 15s (Intel Core i5 12th Gen, 16 GB RAM, 512 GB SSD) Laptop", "Computers", 48990, 4.4, 3200),
    ("HP 240 G9 (Intel Core i5 11th Gen, 8 GB RAM, 512 GB SSD) Business Laptop", "Computers", 32990, 4.3, 900),
    ("HP 14s (Intel Core i3 12th Gen, 8 GB RAM, 512 GB SSD) Laptop", "Computers", 29990, 4.2, 3400),
    ("HP Pavilion 15 (Intel Core i5 13th Gen, 16 GB RAM, 512 GB SSD) Laptop", "Computers", 58990, 4.5, 1500),
    ("HP ProBook 440 G10 (Intel Core i5 13th Gen, 16 GB RAM) Business Laptop", "Computers", 62990, 4.4, 600),
    ("HP Victus 15 (Intel Core i5 12th Gen, RTX 2050, 16 GB RAM) Gaming Laptop", "Computers", 69990, 4.4, 1600),
    ("HP EliteBook 840 G8 (Intel Core i5, 16 GB RAM) Business Laptop", "Computers", 58990, 4.4, 300),
    ("HP OmniBook X Flip 14 (Intel Core Ultra 7, 16 GB RAM) 2-in-1 AI PC Laptop", "Computers", 89990, 4.6, 350),
    ("Lenovo IdeaPad Slim 3 (AMD Ryzen 5, 8 GB RAM, 512 GB SSD) Laptop", "Computers", 36990, 4.4, 4100),
    ("Lenovo IdeaPad 1 (AMD Ryzen 5, 8 GB RAM, 512 GB SSD) Laptop", "Computers", 30990, 4.3, 2700),
    ("Lenovo IdeaPad Flex 5 (AMD Ryzen 7, 16 GB RAM, 512 GB SSD) 2-in-1 Laptop", "Computers", 59990, 4.5, 1100),
    ("Lenovo IdeaPad Duet 5 (Qualcomm Snapdragon 8cx, 8 GB RAM) 2-in-1 Laptop", "Computers", 79990, 4.3, 400),
    ("Lenovo ThinkPad E14 Gen 5 (Intel Core i5 13th Gen, 16 GB RAM) Business Laptop", "Computers", 64990, 4.5, 800),
    ("Lenovo Yoga Slim 7 (Intel Core i7, 16 GB RAM, 512 GB SSD) Ultrabook", "Computers", 84990, 4.5, 450),
    ("ASUS VivoBook 15 (Intel Core i5 13th Gen, 8 GB RAM, 512 GB SSD) Laptop", "Computers", 44990, 4.4, 2800),
    ("ASUS VivoBook 14 (Intel Core i5 12th Gen, 16 GB RAM, 512 GB SSD) Laptop", "Computers", 41990, 4.4, 1800),
    ("ASUS TUF Gaming F15 (Intel Core i7 12th Gen, RTX 3050, 16 GB RAM) Gaming Laptop", "Computers", 79990, 4.5, 2400),
    ("ASUS Zenbook 14X (AMD Ryzen 9, 16 GB RAM, 1 TB SSD) Ultrabook", "Computers", 89990, 4.5, 600),
    ("Dell Inspiron 15 (Intel Core i5 13th Gen, 8 GB RAM, 512 GB SSD) Laptop", "Computers", 54990, 4.5, 1900),
    ("Dell XPS 13 (Intel Core i7 13th Gen, 16 GB RAM, 512 GB SSD) Ultrabook", "Computers", 139900, 4.6, 500),
    ("Dell Latitude 5440 (Intel Core i5 13th Gen, 16 GB RAM) Business Laptop", "Computers", 72990, 4.4, 250),
    ("Acer Aspire Lite (AMD Ryzen 7, 16 GB RAM, 512 GB SSD) Laptop", "Computers", 42990, 4.4, 2300),
    ("Acer Aspire Go 15 (AMD Ryzen 5, 8 GB RAM, 512 GB SSD) Laptop", "Computers", 31990, 4.2, 1200),
    ("Acer Swift Go 14 (AMD Ryzen 7, 16 GB RAM, 512 GB SSD) Ultrabook", "Computers", 55990, 4.5, 700),
    ("Acer Nitro V 15 (Intel Core i5 13th Gen, RTX 4050, 16 GB RAM) Gaming Laptop", "Computers", 74990, 4.5, 1300),
    ("Apple MacBook Air M2 (8 GB RAM, 256 GB SSD) Laptop", "Computers", 84900, 4.8, 2100),
    ("Apple MacBook Air M3 (8 GB RAM, 256 GB SSD) Laptop", "Computers", 99900, 4.8, 1200),
    ("Apple MacBook Pro 14 M3 (16 GB RAM, 512 GB SSD) Laptop", "Computers", 164900, 4.8, 900),
    # --- TVs (Home Audio & Theater) ---
    ("Samsung 32-inch (81 cm) Smart Tizen HD TV", "Home Audio & Theater", 10990, 4.2, 21400),
    ("Samsung 43-inch (109 cm) Smart Tizen FHD TV", "Home Audio & Theater", 17990, 4.3, 15800),
    ("Samsung 43-inch (109 cm) Crystal 4K UHD Smart Tizen TV", "Home Audio & Theater", 24990, 4.4, 8900),
    ("Samsung 50-inch (126 cm) Crystal UHD 4K Smart Tizen TV", "Home Audio & Theater", 33990, 4.4, 4300),
    ("Samsung 55-inch (139 cm) Crystal 4K UHD Smart Tizen TV", "Home Audio & Theater", 38990, 4.5, 5600),
    ("Samsung 55-inch (139 cm) Neo QLED 4K Smart Tizen TV", "Home Audio & Theater", 89990, 4.7, 1100),
    ("Samsung 65-inch (165 cm) Crystal 4K UHD Smart Tizen TV", "Home Audio & Theater", 64990, 4.6, 2100),
    ("Samsung 75-inch (190 cm) Crystal 4K UHD Smart Tizen TV", "Home Audio & Theater", 109990, 4.7, 600),
    ("Samsung 43-inch (109 cm) 4K QLED Q60C Smart Tizen TV", "Home Audio & Theater", 39990, 4.5, 800),
    ("Samsung 55-inch (139 cm) 4K QLED Q70C Smart Tizen TV", "Home Audio & Theater", 74990, 4.7, 1300),
    ("LG 32LQ630B 32-inch (81 cm) FHD Smart TV", "Home Audio & Theater", 12990, 4.3, 9400),
    ("LG 43UQ7750 43-inch (109 cm) 4K QNED evo AI Smart TV", "Home Audio & Theater", 31990, 4.5, 2400),
    ("LG 48UQ7750 48-inch (121 cm) 4K QNED evo AI Smart TV", "Home Audio & Theater", 35990, 4.5, 700),
    ("LG 55UQ7750 55-inch (139 cm) 4K QNED evo AI Smart TV", "Home Audio & Theater", 49990, 4.6, 1800),
    ("LG 65C3 65-inch (165 cm) OLED evo AI 4K Smart TV", "Home Audio & Theater", 109990, 4.8, 800),
    ("LG 43-inch UR8000 4K Smart TV", "Home Audio & Theater", 25990, 4.3, 1600),
    ("LG 55-inch UR8000 4K Smart TV", "Home Audio & Theater", 39990, 4.4, 1200),
    ("Sony 43X75QL 43-inch (109 cm) 4K HDR LED Google TV", "Home Audio & Theater", 27990, 4.4, 3100),
    ("Sony 55X85J 55-inch (139 cm) 4K Google TV", "Home Audio & Theater", 46990, 4.5, 1500),
    ("Sony Bravia 3 55-inch (139 cm) 4K Google TV", "Home Audio & Theater", 52990, 4.5, 900),
    ("Sony Bravia 8 55-inch (139 cm) OLED Google TV", "Home Audio & Theater", 139900, 4.8, 300),
    ("Mi TV A2 Pro 43-inch (109 cm) 4K Google TV", "Home Audio & Theater", 22999, 4.4, 12600),
    ("Mi TV A2 Pro 55-inch (139 cm) 4K Google TV", "Home Audio & Theater", 34999, 4.4, 6800),
    ("Mi TV A2 Pro 65-inch (165 cm) 4K Google TV", "Home Audio & Theater", 54999, 4.5, 2300),
    ("Hisense 55A5K 55-inch (139 cm) 4K Smart Google TV", "Home Audio & Theater", 36990, 4.3, 3200),
    ("Vu 43-inch (109 cm) 4K Smart Google TV", "Home Audio & Theater", 18990, 4.2, 4700),
    ("Philips 43PFT6509 43-inch (109 cm) Full HD LED Smart TV", "Home Audio & Theater", 19990, 4.2, 2800),
    # --- headphones (All Electronics) ---
    ("Sony WH-CH520 Wireless Noise Cancelling Over-Ear Headphones", "All Electronics", 3490, 4.4, 5600),
    ("Sony WH-CH720N Wireless Noise Cancelling Over-Ear Headphones", "All Electronics", 9990, 4.5, 2100),
    ("Sony WH-XB910N Extra Bass Wireless Over-Ear Headphones", "All Electronics", 7490, 4.4, 1800),
    ("Sony WH-1000XM5 Wireless Noise Cancelling Over-Ear Headphones", "All Electronics", 26990, 4.7, 5400),
    ("Sony MDR-7506 Professional Wired Over-Ear Headphones", "All Electronics", 8990, 4.7, 4200),
    ("JBL Tune 510BT Wireless Over-Ear Headphones", "All Electronics", 3999, 4.3, 8900),
    ("JBL Tune 720BTNC Wireless Noise Cancelling Over-Ear Headphones", "All Electronics", 6999, 4.4, 1500),
    ("JBL Tune 770NC Wireless Noise Cancelling Over-Ear Headphones", "All Electronics", 8999, 4.4, 3400),
    ("JBL Live 770NC Wireless Noise Cancelling Over-Ear Headphones", "All Electronics", 17999, 4.5, 1200),
    ("JBL Tour One M2 Wireless Noise Cancelling Over-Ear Headphones", "All Electronics", 24999, 4.6, 800),
    ("JBL Quantum 350 Wired Gaming Headset", "All Electronics", 4499, 4.3, 2700),
    ("boAt Rockerz 301 Wired On-Ear Headphones", "All Electronics", 999, 4.2, 89400),
    ("boAt Rockerz 400 Bluetooth On-Ear Headphones", "All Electronics", 1499, 4.2, 61500),
    ("boAt Rockerz 500 Bluetooth On-Ear Headphones", "All Electronics", 1999, 4.3, 48200),
    ("boAt Rockerz 450 Bluetooth On-Ear Headphones", "All Electronics", 2499, 4.3, 32100),
    ("boAt Rockerz 331 Pro Bluetooth On-Ear Headphones", "All Electronics", 1799, 4.2, 15600),
    ("Sennheiser HD 560S Wired Over-Ear Headphones", "All Electronics", 12990, 4.6, 600),
    ("Audio-Technica ATH-M50x Wired Over-Ear Headphones", "All Electronics", 11990, 4.7, 700),
    ("Anker Soundcore Space Q45 Wireless Noise Cancelling Headphones", "All Electronics", 8990, 4.5, 2300),
    ("Razer BlackShark V2 Pro Wireless Gaming Headset", "All Electronics", 14990, 4.5, 900),
    # --- earbuds (All Electronics) ---
    ("boAt Airdopes 131 True Wireless Earbuds", "All Electronics", 899, 4.2, 210000),
    ("boAt Airdopes 141 True Wireless Earbuds", "All Electronics", 999, 4.2, 142000),
    ("boAt Airdopes 311 Pro True Wireless Earbuds", "All Electronics", 1299, 4.3, 89300),
    ("boAt Airdopes 441 Evo True Wireless Earbuds", "All Electronics", 1999, 4.3, 34500),
    ("JBL Wave Beam True Wireless Earbuds", "All Electronics", 1499, 4.3, 25400),
    ("JBL T150RTC True Wireless Earbuds", "All Electronics", 1799, 4.3, 18700),
    ("JBL Tune 230TWS True Wireless Earbuds", "All Electronics", 2499, 4.3, 14600),
    ("Sony WF-C510 True Wireless Earbuds", "All Electronics", 3990, 4.4, 4800),
    ("Sony WF-C710N True Wireless Earbuds", "All Electronics", 8990, 4.5, 2100),
    ("Samsung Galaxy Buds FE True Wireless Earbuds", "All Electronics", 5999, 4.4, 9800),
    ("OnePlus Buds 3 True Wireless Earbuds", "All Electronics", 4999, 4.5, 3600),
    ("Anker Soundcore AeroFit Pro True Wireless Earbuds", "All Electronics", 4490, 4.4, 5200),
    ("Apple AirPods (3rd Generation) True Wireless Earbuds", "All Electronics", 12900, 4.7, 12300),
    ("Apple AirPods Pro (2nd Generation, USB-C) True Wireless Earbuds", "All Electronics", 22900, 4.8, 8900),
    ("Nothing Ear (a) True Wireless Earbuds", "All Electronics", 4999, 4.4, 2900),
    ("Noise Buds VS105 True Wireless Earbuds", "All Electronics", 999, 4.2, 12800),
    # --- cameras (Camera & Photo) ---
    ("Canon EOS 1500D with 18-55 mm Lens DSLR Camera", "Camera & Photo", 34990, 4.5, 1900),
    ("Canon EOS 200D II with 18-55 mm Lens DSLR Camera", "Camera & Photo", 44990, 4.6, 900),
    ("Canon PowerShot G7 X Mark II Vlog Camera", "Camera & Photo", 59990, 4.7, 800),
    ("Canon PowerShot SX740 HS Travel Zoom Digital Camera", "Camera & Photo", 42990, 4.5, 600),
    ("Nikon D3500 with 18-55 mm Lens DSLR Camera", "Camera & Photo", 31990, 4.6, 2400),
    ("Nikon Z50 with 16-50 mm Lens Mirrorless Camera", "Camera & Photo", 64990, 4.6, 700),
    ("Sony ZV-1 Vlog Camera with 20-70 mm Lens", "Camera & Photo", 54990, 4.6, 1400),
    ("Sony Alpha A6400 with 16-50 mm Lens Mirrorless Camera", "Camera & Photo", 74990, 4.7, 1100),
    ("Fujifilm X-A7 Mirrorless Camera Kit", "Camera & Photo", 59990, 4.5, 400),
    ("GoPro HERO11 Black Action Camera", "Camera & Photo", 39999, 4.6, 3100),
    ("GoPro HERO10 Black Action Camera", "Camera & Photo", 32999, 4.5, 1600),
    ("Insta360 X3 360 Action Camera", "Camera & Photo", 34990, 4.4, 900),
    # --- air fryers (Appliances) ---
    ("Philips HD9252/90 4.1 L 800 W Digital Airfryer", "Appliances", 8999, 4.5, 6700),
    ("Philips HD9200/90 4.1 L 2000 W Airfryer", "Appliances", 10999, 4.5, 2300),
    ("Philips HD9270/90 6.2 L Dual Airfryer", "Appliances", 24990, 4.6, 2800),
    ("Prestige PAF 02 4 L Air Fryer", "Appliances", 6999, 4.3, 12400),
    ("Pigeon 4.5 L Air Fryer", "Appliances", 5499, 4.3, 9800),
    ("Pigeon 3 L Compact Air Fryer", "Appliances", 3999, 4.2, 4800),
    ("Cello 4.5 L Air Fryer", "Appliances", 4499, 4.2, 7600),
    ("Miyako 5 L Air Fryer", "Appliances", 5999, 4.3, 4300),
    ("Panasonic NF-AB5000 5 L Air Fryer", "Appliances", 9490, 4.4, 3400),
    ("Bajaj Rex 4.5 L Air Fryer", "Appliances", 4999, 4.2, 8900),
    ("IFB 4.6 L Air Fryer", "Appliances", 5499, 4.3, 2100),
    ("Havells 4.5 L Air Fryer", "Appliances", 5999, 4.3, 5600),
    ("Cuckoo 5 L Air Fryer", "Appliances", 8490, 4.4, 1400),
    ("Butterfly 4 L Air Fryer", "Appliances", 4299, 4.2, 6700),
    # --- mixers/blenders (Appliances) ---
    ("Philips HL7756/00 500 W Mixer Grinder", "Appliances", 2799, 4.4, 8400),
    ("Philips HR2221/00 550 W Mixer Grinder", "Appliances", 3299, 4.4, 4600),
    ("Pigeon 500 W Mixer Grinder", "Appliances", 1999, 4.2, 11200),
    ("Pigeon 750 W Heavy Duty Mixer Grinder", "Appliances", 3499, 4.3, 3100),
    ("Butterfly Compact 300 W Mixer Grinder", "Appliances", 1499, 4.2, 15600),
    ("Bajaj Rex 500 W Mixer Grinder", "Appliances", 2499, 4.2, 9300),
    ("Prestige PMG 185 500 W Mixer Grinder", "Appliances", 2299, 4.3, 13800),
    ("Kent 600 W Mixer Grinder", "Appliances", 2999, 4.3, 3900),
    ("Havells 500 W Mixer Grinder", "Appliances", 2699, 4.3, 7800),
    ("Portronics 400 W Compact Personal Blender", "Appliances", 1299, 4.1, 5400),
    # --- guitars (Musical Instruments) ---
    ("Yamaha F310 Acoustic Guitar (Spruce Top)", "Musical Instruments", 11999, 4.6, 2800),
    ("Yamaha F600 Acoustic Guitar", "Musical Instruments", 13999, 4.6, 1200),
    ("Yamaha FG800 Acoustic Guitar", "Musical Instruments", 15999, 4.7, 700),
    ("Yamaha Pacifica 112V Electric Guitar", "Musical Instruments", 14999, 4.5, 400),
    ("Fender CD-60S Classic Dreadnought Acoustic Guitar", "Musical Instruments", 10999, 4.6, 1500),
    ("Fender FA-115 Dreadnought Acoustic Guitar", "Musical Instruments", 9999, 4.5, 800),
    ("Fender CD-140S Dreadnought Acoustic Guitar", "Musical Instruments", 8999, 4.5, 500),
    ("Fender Player Stratocaster Electric Guitar", "Musical Instruments", 44999, 4.8, 900),
    ("Cort AD810 Acoustic Guitar", "Musical Instruments", 8499, 4.4, 600),
    ("Cordoba C1M Classical Acoustic Guitar", "Musical Instruments", 8999, 4.5, 900),
    ("Kaytone ST-20 Student Acoustic Guitar", "Musical Instruments", 6499, 4.3, 700),
    ("Kaytone EG-310 Electric Guitar Kit", "Musical Instruments", 12999, 4.4, 300),
    # --- perfumes (All Beauty) ---
    ("Bella Vita L'Allure Perfume 90 ml", "All Beauty", 999, 4.2, 8900),
    ("Bella Vita L'Amour Perfume 90 ml", "All Beauty", 1099, 4.2, 6400),
    ("Wild Stone Code For Men Perfume 120 ml", "All Beauty", 599, 4.3, 24600),
    ("Villa by Wild Stone Eau de Parfum 100 ml", "All Beauty", 549, 4.3, 9200),
    ("Fogg Scent Sation Classic For Men 100 ml", "All Beauty", 499, 4.2, 31200),
    ("Park Avenue Voyage For Men 100 ml", "All Beauty", 449, 4.2, 18900),
    ("Engage For Men Eau de Toilette 100 ml", "All Beauty", 649, 4.3, 15700),
    ("Bently London 24 Gold Perfume 100 ml", "All Beauty", 1199, 4.3, 4800),
    ("Beardo King Perfume 100 ml", "All Beauty", 499, 4.2, 7800),
    ("Nautica Voyage Eau de Toilette 100 ml", "All Beauty", 1899, 4.4, 5600),
    ("Montblanc Explorer Man 100 ml", "All Beauty", 14900, 4.6, 300),
    ("Engage For Women Eau de Toilette 100 ml", "All Beauty", 549, 4.2, 8300),
    # --- yoga mats (Sports & Outdoors) ---
    ("Jade Yoga Harmony Mat (6 mm, Cork & Natural Rubber)", "Sports & Outdoors", 8990, 4.6, 1900),
    ("Jade Yoga Puzzle Mats 8 Pieces (4 mm, Cork & Rubber)", "Sports & Outdoors", 14999, 4.6, 800),
    ("Manduka PRO Yoga Mat (6.85 mm, PVC Free)", "Sports & Outdoors", 12999, 4.7, 1400),
    ("Yogi Design Eco Yoga Mat (4.8 mm, TPE)", "Sports & Outdoors", 1299, 4.4, 3400),
    ("Yogen Yoga Mat (5 mm, TPE, Non Slip)", "Sports & Outdoors", 999, 4.3, 8700),
    ("Yogen Premium NBR Yoga Mat (6 mm)", "Sports & Outdoors", 1499, 4.4, 6400),
    ("ProSource Gym Floor Mat (4.5 mm, Interlocking)", "Sports & Outdoors", 1199, 4.3, 2200),
    ("Balance From Yoga Mat (4 mm, NBR)", "Sports & Outdoors", 799, 4.2, 15600),
    # --- dog beds (Pet Supplies) ---
    ("Petalicious Orthopedic Memory Foam Dog Bed (Large)", "Pet Supplies", 4499, 4.4, 2300),
    ("Preet Orthopedic Dog Bed 14 inch Memory Foam", "Pet Supplies", 2999, 4.3, 3800),
    ("Furbaby Donut Dog Bed", "Pet Supplies", 1999, 4.3, 5400),
    ("Furbaby Washable Bolster Dog Bed (Small)", "Pet Supplies", 1299, 4.2, 2700),
    ("Petzy Bolster Dog Bed (Medium)", "Pet Supplies", 2499, 4.3, 1800),
    ("Hombro Washable Dog Bed (Large)", "Pet Supplies", 1499, 4.2, 4600),
    ("TriPaw Donut Calming Dog Bed", "Pet Supplies", 2299, 4.3, 3100),
    ("Preena Pet Orthopedic Dog Bed (XL)", "Pet Supplies", 5499, 4.4, 1200),
    # --- dresses (AMAZON FASHION) ---
    ("Anouk Floral Georgette Party Dress for Women", "AMAZON FASHION", 2499, 4.2, 1200),
    ("Global Desi Chikankari Kurta Dress for Women", "AMAZON FASHION", 1999, 4.3, 3400),
    ("W for Woman Solid A-Line Party Dress for Women", "AMAZON FASHION", 1799, 4.2, 800),
    ("Libas Embroidered Maxidress for Women", "AMAZON FASHION", 2999, 4.3, 600),
    ("Alinea Printed Party Wear Maxi Dress for Women", "AMAZON FASHION", 2499, 4.2, 900),
    ("Biba Embroidered Anarkali Dress for Women", "AMAZON FASHION", 3499, 4.3, 700),
    ("Manyavar Cotton Kurta Dress for Women", "AMAZON FASHION", 2299, 4.2, 1100),
    ("Rina Banerjee Chikankari Anarkali Dress", "AMAZON FASHION", 2799, 4.3, 400),
    # --- sneakers (AMAZON FASHION) ---
    ("Nike Revolution 7 Running Shoes for Men", "AMAZON FASHION", 5495, 4.5, 4800),
    ("Nike Air Zoom Pegasus 41 Running Shoes", "AMAZON FASHION", 10995, 4.6, 2900),
    ("Nike Court Vision Low Sneakers", "AMAZON FASHION", 4995, 4.5, 4300),
    ("Adidas Duramo SL Running Shoes for Men", "AMAZON FASHION", 4499, 4.5, 6700),
    ("Adidas Ultraboost Light Running Shoes", "AMAZON FASHION", 15999, 4.6, 2100),
    ("Puma Smashic Sneakers for Men", "AMAZON FASHION", 3299, 4.4, 5200),
    ("Puma RS-X Sneakers for Women", "AMAZON FASHION", 6999, 4.5, 1400),
    ("ASICS Gel-Contend 8 Running Shoes", "AMAZON FASHION", 5995, 4.5, 3800),
    ("ASICS Gel-Excite 11 Running Shoes", "AMAZON FASHION", 4495, 4.4, 2200),
    ("New Balance 574 Sneakers", "AMAZON FASHION", 7999, 4.5, 2600),
    ("Skechers Flex Advantage Running Shoes", "AMAZON FASHION", 5499, 4.4, 3100),
    ("Reebok Zig Kinetica Running Shoes", "AMAZON FASHION", 5999, 4.3, 1800),
]


def inject_supplement(sel, df, target, band_id):
    """Force curated real models into the selection (swap-in/swap-out,
    same category+band preferred, lowest-rated swap-outs)."""
    rows = []
    for i, (title, cat, price, rating, nr) in enumerate(SUPPLEMENT):
        rows.append({"parent_asin": f"SUPP-{i + 1:04d}", "title": title,
                     "main_category": cat, "price_inr": price,
                     "average_rating": rating, "rating_number": nr})
    supp = pd.DataFrame(rows)
    supp["band"] = supp["price_inr"].map(band_id)
    have = set(sel["parent_asin"])
    forced = [r for _, r in supp.iterrows() if r["parent_asin"] not in have]
    if not forced:
        return sel
    cats = sel["main_category"].astype(str).to_numpy()
    bands = sel["band"].astype(int).to_numpy()
    ratings = sel["rating_number"].fillna(0).astype(float).to_numpy()
    active = np.ones(len(sel), dtype=bool)
    added = []
    for row in forced:
        mask = active & (cats == row["main_category"]) & (bands == int(row["band"]))
        if not mask.any():
            mask = active & (bands == int(row["band"]))
        if not mask.any():
            mask = active
        if not mask.any():
            break
        idxs = np.where(mask)[0]
        k = int(idxs[np.argmin(ratings[idxs])])
        active[k] = False
        added.append(row)
    out = pd.concat([sel.loc[active], pd.DataFrame(added)], ignore_index=True)
    out = out.drop_duplicates("parent_asin")
    if len(out) < target:
        used = set(out["parent_asin"])
        rest = df[~df["parent_asin"].isin(used)]
        take = min(target - len(out), len(rest))
        if take:
            out = pd.concat([out, rest.sample(n=take, random_state=42)], ignore_index=True)
    print(f"supplement: {len(added)} real-model swap-ins")
    return out
