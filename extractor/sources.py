"""Locked source table for the AskCart extractor (v3).
App-review sources: Play Store, App Store, Reddit.
Insight sources: Amazon product reviews (HF, range-sampled), Trustpilot
brand/marketplace reviews (HF mirror), Google Suggest + Wikipedia
pageviews demand/seasonality signals (live APIs, no key)."""

# (play package, app label, [(country, lang, newest_count, relevant_count)])
PLAY_TABLE = [
    ("com.amazon.mShop.android.shopping", "Amazon", [
        ("in", "en", 5000, 3000), ("us", "en", 3000, 2000), ("gb", "en", 1000, 600),
        ("au", "en", 800, 400), ("ae", "en", 800, 400)]),
    ("com.flipkart.android", "Flipkart", [
        ("in", "en", 4000, 2000)]),
    ("com.myntra.android", "Myntra", [
        ("in", "en", 2500, 1500)]),
    ("com.meesho.app", "Meesho", [
        ("in", "en", 2000, 1000)]),
    ("com.etsy.android", "Etsy", [
        ("us", "en", 1500, 1000)]),
    ("com.einnovation.temu", "Temu", [
        ("in", "en", 2500, 1500), ("us", "en", 1000, 600)]),
    ("com.ebay.mobile", "eBay", [
        ("us", "en", 2000, 1000)]),
    ("com.alibaba.aliexpresshd", "AliExpress", [
        ("in", "en", 1500, 800)]),
    ("com.walmart.android", "Walmart", [
        ("us", "en", 1500, 800)]),
    ("com.target.ui", "Target", [
        ("us", "en", 1000, 500)]),
]

# (appstore search term, app label, [(country, max_pages)])  (50 reviews/page)
APPSTORE_TABLE = [
    ("Amazon Shopping", "Amazon", [("us", 8), ("in", 8)]),
    ("Flipkart", "Flipkart", [("in", 8)]),
    ("Myntra", "Myntra", [("in", 6)]),
    ("Meesho", "Meesho", [("in", 6)]),
    ("Etsy", "Etsy", [("us", 8)]),
    ("Walmart", "Walmart", [("us", 8)]),
    ("Target", "Target", [("us", 6)]),
]

# (subreddit, [queries]) - RSS search, up to 100 posts per query
REDDIT_TABLE = [
    ("Amazon", ["search results bad", "search does not work", "wrong item ordered",
                "filters broken", "cannot find product amazon", "bad search experience",
                "amazon search terrible"]),
    ("ecommerce", ["search problems", "product discovery hard", "customer can't find product",
                   "search conversion", "site search bad", "search UX"]),
    ("Etsy", ["search results etsy", "etsy search bad", "shop discoverability",
              "handmade search", "etsy search finds nothing"]),
    ("OnlineShopping", ["search", "find product", "gift under", "budget",
                        "worst shopping experience"]),
    ("Deals", ["search", "deal hunt", "find deal", "deal site search"]),
    ("Flipping", ["find products", "sourcing search", "sourcing products online"]),
    ("BuyItForLife", ["search", "find quality product", "product quality"]),
    ("frugal", ["find cheap", "search for deals", "budget shopping"]),
]

UA = "askcart-research/0.2 (e-commerce search UX study)"


# Amazon product reviews (McAuley-Lab/Amazon-Reviews-2023, HF) - category prefix sample
AMZ_REVIEWS_TABLE = ["All_Beauty", "Amazon_Fashion", "Handmade_Products", "Gift_Cards",
                     "Health_and_Personal_Care", "Toys_and_Games",
                     "Clothing_Shoes_and_Jewelry", "Home_and_Kitchen"]

# Trustpilot (Kerassy/trustpilot-reviews-123k HF mirror; trustpilot.com API is WAF-gated)
TRUSTPILOT_TABLE = ["trustpilot_reviews_2005.csv"]

# Demand & seasonality signal seeds (Google Suggest, hl=en-IN) and Wikipedia articles
TREND_SEEDS = ["gift under 2000", "shaadi gift", "diwali gift ideas",
               "birthday gift for", "wedding gift under", "anniversary gift",
               "housewarming gift", "gifts for mother", "gift for newlyweds",
               "cheap gifts online india"]
TREND_ARTICLES = ["Diwali", "Christmas_in_India", "Wedding", "Birthday",
                  "Raksha_Bandhan", "Eid_al-Fitr"]
