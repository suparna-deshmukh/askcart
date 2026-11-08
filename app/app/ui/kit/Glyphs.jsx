"use client";
// Duotone glyph sheet (67) for Tile v2. Stroke 1.75, round joins.
// Selected by keyword map over category + title (first match wins).
// 2026-11-08 revamp: single-word keywords match on WORD BOUNDARIES (token
// set), multi-word keywords on substring — kills the old false positives
// ("light" in "lightweight" -> lamp on shirts, "car" in "scarf" -> wheel,
// "fan" in "infant" -> fan on diapers). New glyphs cover the big item
// families (jeans/jacket/charger/mug/plate/cap/glasses/...) so 33k
// AMAZON FASHION items stop collapsing onto one dress glyph.
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" };

const PATHS = {
  box: <><path {...P} d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3ZM4 7.5l8 4.5 8-4.5M12 12v9" /></>,
  dress: <path {...P} d="M9 3l1.5 4L8 12l-2 8h12l-2-8-2.5-5L15 3M9 3h6" />,
  saree: <path {...P} d="M8 3c-2 5-2 13 0 18M8 3h5v18H8c2-5 2-13 0-18ZM13 8h4M13 14h3" />,
  kurta: <path {...P} d="M9 3L7 6v13h10V6l-2-3-2.5 2.5L12 7 9.5 5.5ZM12 7v12" />,
  shirt: <><path {...P} d="M9 3L4 6l2 4 2-1v12h8V9l2 1 2-4-5-3-3 2.5L9 3Z" /><path {...P} d="M12 9v7" /></>,
  tshirt: <path {...P} d="M9 3L4 6l2 4 2-1v12h8V9l2 1 2-4-5-3-3 2.5L9 3Z" />,
  jeans: <path {...P} d="M7 3h10l1 18h-5.5L12 10l-.5 11H6L7 3ZM7 6h10" />,
  jacket: <path {...P} d="M8 3l4 3 4-3 4 3-2 4-2-1v12H8V9l-2 1-2-4 4-3ZM12 6v15" />,
  stole: <path {...P} d="M7 3c-1.5 6-1.5 12 0 18M7 3h4v18H7M14 6c1 5 1 10 0 14M14 6h3v14h-3" />,
  socks: <path {...P} d="M10 3h5v9l3.5 4.5a3.5 3.5 0 0 1-5.5 4L10 16V3ZM10 7h5" />,
  belt: <path {...P} d="M3 9h18v6H3zM9 9h6v6H9zM3 12h6M15 12h6" />,
  cap: <path {...P} d="M4 14a8 8 0 0 1 16 0M4 14h16M20 14c1.5 0 2 1 2 2M4 14c-2 .5-3 2-2.5 4" />,
  glasses: <><circle {...P} cx="7" cy="14" r="3.5" /><circle {...P} cx="17" cy="14" r="3.5" /><path {...P} d="M10.5 14c.5-1 2.5-1 3 0M4 13l.5-6M20 13l-.5-6" /></>,
  umbrella: <path {...P} d="M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9ZM12 12v6.5a2.5 2.5 0 0 0 5 0" />,
  shoes: <path {...P} d="M3 15v-4l4-1 2-4 3 1 4 4c3 1 5 2 5 4v2H3ZM3 17h18" />,
  bag: <path {...P} d="M6 8h12l1 13H5L6 8ZM9 8V6a3 3 0 0 1 6 0v2" />,
  watch: <><rect {...P} x="7" y="7" width="10" height="10" rx="3" /><path {...P} d="M9 7l.5-4h5L15 7M9 17l.5 4h5l.5-4M12 10v2.5l1.5 1" /></>,
  ring: <><circle {...P} cx="12" cy="14" r="6" /><path {...P} d="M9.5 8.5L12 3l2.5 5.5L12 6Z" /></>,
  phone: <><rect {...P} x="7" y="3" width="10" height="18" rx="2.5" /><path {...P} d="M11 18h2" /></>,
  laptop: <path {...P} d="M5 6h14v10H5zM3 19h18l-1.5-3h-15Z" />,
  monitor: <><rect {...P} x="3" y="4" width="18" height="12" rx="2" /><path {...P} d="M12 16v3M8 21l4-2 4 2" /></>,
  mouse: <path {...P} d="M8 3h8a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4ZM12 6v4" />,
  printer: <path {...P} d="M7 8V3h10v5M4 8h16v8h-3M4 8v8h3M7 13h10v8H7v-8ZM17 12h.01" />,
  headphones: <path {...P} d="M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H5a1 1 0 0 1-1-1v-4Zm16 0h-3v5h2a1 1 0 0 0 1-1v-4Z" />,
  speaker: <><rect {...P} x="6" y="3" width="12" height="18" rx="2" /><circle {...P} cx="12" cy="14" r="3.5" /><circle {...P} cx="12" cy="7" r="1" /></>,
  tv: <><rect {...P} x="3" y="5" width="18" height="12" rx="2" /><path {...P} d="M9 21h6M12 17v4" /></>,
  camera: <><rect {...P} x="3" y="7" width="18" height="13" rx="2" /><path {...P} d="M8 7l1.5-3h5L16 7M12 14a3 3 0 1 0 0-.01" /></>,
  gamepad: <path {...P} d="M7 8h10a5 5 0 0 1 5 6l-.5 3a2.5 2.5 0 0 1-4.5 1L15 16H9l-2 2a2.5 2.5 0 0 1-4.5-1L2 14a5 5 0 0 1 5-6ZM8 11v3M6.5 12.5h3M15.5 11.5h.01M17.5 13.5h.01" />,
  ac: <><rect {...P} x="3" y="6" width="18" height="8" rx="2" /><path {...P} d="M7 17v3M12 17v4M17 17v3M6 11h9" /></>,
  fridge: <><rect {...P} x="6" y="3" width="12" height="18" rx="2" /><path {...P} d="M6 10h12M9 6v2M9 13v3" /></>,
  washer: <><rect {...P} x="4" y="3" width="16" height="18" rx="2" /><circle {...P} cx="12" cy="13" r="4.5" /><path {...P} d="M8 6h2M12 13a4.5 4.5 0 0 0 4.5-3" /></>,
  oven: <><rect {...P} x="3" y="5" width="18" height="13" rx="2" /><path {...P} d="M6 8v7h9V8H6ZM18 8v1M18 11v1M18 14v1" /></>,
  vacuum: <><circle {...P} cx="10" cy="15" r="5" /><path {...P} d="M10 12.5v5M7.5 15h5M15 13c3 0 4-2 4-5M19 8h2" /></>,
  purifier: <><rect {...P} x="7" y="3" width="10" height="13" rx="2" /><path {...P} d="M10 7h4M12 16v3M9 19h6" /></>,
  mixer: <path {...P} d="M4 20h16M6 20v-6c0-2 2-3 3-5V5a3 3 0 0 1 6 0v4c1 2 3 3 3 5v6M9 5h6" />,
  kettle: <path {...P} d="M8 9h9l2 9a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3l1-9ZM8 9c0-2 1-3 3-4h4M17 12h3l-1 3h-2" />,
  cookware: <path {...P} d="M5 11h14v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-5ZM3 11h18M9 8c0-1.5 1-2 1-3M13 8c0-1.5 1-2 1-3M7 20l-1 1.5M17 20l1 1.5" />,
  pot: <path {...P} d="M5 10h14v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-6ZM3 10h18M9 7c0-1.5 1-2 1-3M13 7c0-1.5 1-2 1-3" />,
  mug: <><path {...P} d="M5 8h11v9a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V8Z" /><path {...P} d="M16 9h1.5a2.5 2.5 0 0 1 0 5H16" /></>,
  bottle: <path {...P} d="M10 3h4M10.5 3v2.5L9 8v11a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V8l-1.5-2.5V3M9 12.5h6" />,
  cutlery: <path {...P} d="M7 3v6a2 2 0 0 0 4 0V3M9 3v18M15 3c-1.5 0-2.5 1.5-2.5 4s1 4 2.5 4 2.5-1.5 2.5-4-1-4-2.5-4ZM15 11v10" />,
  plate: <><circle {...P} cx="12" cy="12" r="8" /><circle {...P} cx="12" cy="12" r="4" /></>,
  candle: <><rect {...P} x="9" y="10" width="6" height="11" rx="1" /><path {...P} d="M12 7c-1.5-1-1.5-2.5 0-4.5C13.5 4.5 13.5 6 12 7Z" /></>,
  cushion: <><rect {...P} x="4" y="6" width="16" height="12" rx="4" /><path {...P} d="M4 12h16M12 6v12" /></>,
  curtain: <path {...P} d="M3 4h18M7 4c-1 5 1 9-1 16M12 4c-1 5 1 9-1 16M17 4c-1 5 1 9-1 16" />,
  mirror: <><ellipse {...P} cx="12" cy="10" rx="6" ry="7" /><path {...P} d="M8 18.5L6 21M16 18.5l2 2.5M12 17v4" /></>,
  power: <path {...P} d="M9 3v4M15 3v4M7 7h10v3a5 5 0 0 1-10 0V7ZM12 15v6" />,
  lamp: <path {...P} d="M9 3h6l3 8H6l3-8ZM12 11v7M8 21h8M12 18v3" />,
  diya: <path {...P} d="M4 14h16c0 3-3.5 5-8 5s-8-2-8-5ZM12 11c-1-1.5-1-3 0-5 1 2 1 3.5 0 5Z" />,
  sofa: <path {...P} d="M4 12V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M3 12a2 2 0 0 1 2 2v3h14v-3a2 2 0 0 1 4 0v5H2v-5a2 2 0 0 1 1-2Z" />,
  shelf: <path {...P} d="M4 4v16M20 4v16M4 10h16M4 16h16M7 7h5M9 13h6" />,
  clock: <><circle {...P} cx="12" cy="12" r="8" /><path {...P} d="M12 7v5l3 2" /></>,
  vase: <path {...P} d="M9 3h6c0 2.5-1 4-1 6 0 2 2 3 2 6a4 4 0 0 1-8 0c0-3 2-4 2-6 0-2-1-3.5-1-6Z" />,
  gift: <><rect {...P} x="4" y="10" width="16" height="10" rx="1" /><path {...P} d="M4 10h16M12 10v10M12 10c-3 0-5-1.5-5-3.5S9 3 10.5 4c1.5.8 1.5 4 1.5 6ZM12 10c3 0 5-1.5 5-3.5S15 3 13.5 4c-1.5.8-1.5 4-1.5 6Z" /></>,
  toy: <><rect {...P} x="4" y="10" width="10" height="8" rx="1.5" /><path {...P} d="M14 13l5-3v8l-5-3M7 18v2M12 18v2" /></>,
  stroller: <path {...P} d="M3 4h2l3 9h10a4 4 0 0 0 4-4M9 13l-1.5 5M17 13l2 5M8 21a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM18 21a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />,
  diaper: <path {...P} d="M4 8h16v4c0 5-4 8-8 8s-8-3-8-8V8ZM4 12h5c1 0 1 2 3 2s2-2 3-2h5" />,
  book: <path {...P} d="M5 4h13a2 2 0 0 1 2 2v13H7a2 2 0 0 0-2 2V4ZM5 18a2 2 0 0 1 2-2h13" />,
  pen: <path {...P} d="M4 20l1-4L16 5l3 3L8 19l-4 1ZM14 7l3 3" />,
  ball: <><circle {...P} cx="12" cy="12" r="8" /><path {...P} d="M12 4c3 2.5 3 13.5 0 16M4.5 9.5c4.5 2 10.5 2 15 0M4.5 14.5c4.5-2 10.5-2 15 0" /></>,
  dumbbell: <path {...P} d="M8 8v8M5 9.5v5M16 8v8M19 9.5v5M8 12h8M3 12h2M19 12h2" />,
  wheel: <><circle {...P} cx="12" cy="12" r="8" /><circle {...P} cx="12" cy="12" r="2.5" /><path {...P} d="M12 4v5.5M12 14.5V20M4 12h5.5M14.5 12H20" /></>,
  lipstick: <path {...P} d="M10 3h4v6h-4zM9 9h6v4H9zM8 13h8v7a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-7Z" />,
  spray: <><path {...P} d="M9 9h6l1 3v8a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-8l1-3Z" /><path {...P} d="M10 9V6h4v3M12 6V4M17 5h.01M19 6h.01M18 3h.01" /></>,
  toothbrush: <path {...P} d="M3 21l9-9M13 10l6-6 1-3 3 3-3 1-6 6a2.8 2.8 0 0 1-4 0 2.8 2.8 0 0 1 1-4Z" />,
  towel: <path {...P} d="M4 6h16v4H4zM4 14h16v4H4zM8 6v4M8 14v4" />,
  guitar: <path {...P} d="M16.5 7.5L20 4M18 2l4 4M16.5 7.5L14 10a6 6 0 1 1-3 3l5.5-5.5ZM11.5 14.5a1.8 1.8 0 1 0 .01 0" />,
  paw: <><circle {...P} cx="12" cy="15" r="4" /><circle {...P} cx="6.5" cy="10" r="1.8" /><circle {...P} cx="10" cy="6.5" r="1.8" /><circle {...P} cx="14" cy="6.5" r="1.8" /><circle {...P} cx="17.5" cy="10" r="1.8" /></>,
  scissors: <><circle {...P} cx="6" cy="6" r="2.5" /><circle {...P} cx="6" cy="18" r="2.5" /><path {...P} d="M8.2 7.5L20 18M8.2 16.5L20 6" /></>,
  fan: <><circle {...P} cx="12" cy="12" r="2" /><path {...P} d="M12 10c0-4 1.5-6 4-6 2 0 3 2 1.5 4S13 10 12 10ZM14 12c4 0 6 1.5 6 4 0 2-2 3-4 1.5S14 13 14 12ZM12 14c0 4-1.5 6-4 6-2 0-3-2-1.5-4S11 14 12 14ZM10 12c-4 0-6-1.5-6-4 0-2 2-3 4-1.5S11 11 10 12Z" /></>,
};

export function Glyph({ kind, size = 44, color }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={color ? { color } : undefined} aria-hidden="true">
      {PATHS[kind] || PATHS.box}
    </svg>
  );
}

// [keywords, glyph] — first match wins. Multi-word keywords match by
// substring; single words must be a whole token of category+title.
// Order encodes the disambiguations (cast iron -> cookware before iron ->
// vacuum; laptop bag -> bag before laptop; table fan -> fan before table ->
// sofa; bed sheet -> cushion before bed -> sofa; ...).
const MAP = [
  // multi-word specific combos (substring-safe, most specific first)
  [["air fryer"], "oven"],
  [["air condition", "air conditioner", "aircon", "split ac", "window ac"], "ac"],
  [["air purifier", "water purifier"], "purifier"],
  [["washing machine", "washing"], "washer"],
  [["smart tv"], "tv"],
  [["laptop bag", "school bag", "gym bag"], "bag"],
  [["power bank", "power saver", "energy saver", "usb c", "type c", "fast charging", "charging"], "power"],
  [["water bottle"], "bottle"],
  [["pressure cooker", "rice cooker"], "oven"],
  [["space heater", "room heater"], "kettle"],
  [["hair dryer"], "vacuum"],
  [["air freshener"], "candle"],
  [["hand wash", "face wash", "body wash", "mouth wash"], "toothbrush"],
  [["sun screen", "sunblock", "face cream", "hair color", "hair oil", "cleaning brush"], "lipstick"],
  [["notebook pc"], "laptop"],
  [["gaming chair"], "sofa"],
  [["board game", "building block"], "toy"],
  [["track pants"], "jeans"],
  [["camera lens"], "camera"],
  [["flower pot"], "vase"],
  [["photo frame", "picture frame", "wall clock"], "clock"],
  [["wall art"], "vase"],
  [["gift box"], "gift"],
  [["high chair", "baby monitor"], "stroller"],
  [["wet wipes"], "diaper"],
  [["cooking oil"], "pot"],
  [["engine oil", "car mat", "table tennis"], "wheel"],
  [["cast iron"], "cookware"],
  [["sewing machine", "cross stitch"], "scissors"],
  [["smart display"], "monitor"],
  [["ink cartridge"], "printer"],
  [["dinner set", "tea set", "coffee set"], "plate"],
  [["bed sheet"], "cushion"],
  [["smartphone", "feature phone"], "phone"],
  [["video games"], "gamepad"],
  // phones / computing / audio / video
  [["phone", "phones", "mobile", "tablet", "ipad"], "phone"],
  [["monitor", "display", "projector"], "monitor"],
  [["mouse"], "mouse"],
  [["printer", "scanner", "copier", "toner"], "printer"],
  [["laptop", "computer", "computers", "desktop"], "laptop"],
  [["headphone", "headphones", "earbud", "earbuds", "earphone", "earphones", "headset"], "headphones"],
  [["speaker", "boombox", "soundbar", "audio"], "speaker"],
  [["tv", "television"], "tv"],
  [["camera", "dslr", "webcam"], "camera"],
  [["gamepad", "console", "xbox", "playstation", "controller", "gaming"], "gamepad"],
  // appliances
  [["ac", "split", "inverter"], "ac"],
  [["fridge", "refrigerator"], "fridge"],
  [["washer"], "washer"],
  [["microwave", "oven", "toaster", "grill", "steamer", "cooker", "induction"], "oven"],
  [["vacuum", "iron", "ironing", "dryer"], "vacuum"],
  [["purifier", "cooler", "dispenser", "softener"], "purifier"],
  [["mixer", "grinder", "blender", "juicer", "chopper"], "mixer"],
  [["kettle", "geyser", "heater"], "kettle"],
  [["fan", "exhaust", "blower"], "fan"],
  // kitchen
  [["cookware", "saucepan", "frying", "pan", "wok", "skillet", "kadai", "tawa", "bartan", "utensil",
    "tiffin", "baking", "bakeware", "mould", "nonstick"], "cookware"],
  [["plate", "bowl", "tray", "thali", "dabba", "tableware", "crockery", "platter", "napkin"], "plate"],
  [["cutlery", "spoon", "fork", "knife", "chopstick", "peeler", "grater", "opener", "mill",
    "measuring", "chopping"], "cutlery"],
  // home (before kitchen-small so "glass table" lands on furniture)
  [["sofa", "couch", "chair", "furniture", "mattress", "bed", "wardrobe", "cupboard", "table",
    "desk", "stool", "recliner"], "sofa"],
  [["cushion", "pillow", "blanket", "comforter", "duvet", "quilt"], "cushion"],
  [["curtain", "valance", "blind", "drape"], "curtain"],
  [["mirror"], "mirror"],
  [["organizer", "storage", "rack", "shelf", "drawer", "basket", "crate", "hook", "hanger", "hangers"], "shelf"],
  [["clock", "calendar", "frame"], "clock"],
  [["vase", "garland", "wallpaper", "photo", "picture", "decor", "decoration", "pottery", "collectible"], "vase"],
  [["lamp", "chandelier", "lantern", "bulb", "solar", "led", "light"], "lamp"],
  [["diya"], "diya"],
  [["candle", "incense", "agarbatti", "diffuser", "freshener"], "candle"],
  [["gift", "present", "party", "christmas", "diwali", "ornament"], "gift"],
  // kitchen small items (after home furniture)
  [["mug", "cup", "tumbler", "glass", "cupware"], "mug"],
  [["bottle", "flask", "thermos", "jar", "sippy"], "bottle"],
  [["pot", "kitchen", "stove"], "pot"],
  // bathroom / health
  [["toothbrush", "toothpaste", "oral", "floss"], "toothbrush"],
  [["towel", "soap", "tissue", "sanitizer"], "towel"],
  [["spray", "cleaner", "detergent", "mop", "broom"], "spray"],
  // beauty
  [["lipstick", "perfume", "fragrance", "attar", "serum", "cream", "sunscreen", "deodorant",
    "shampoo", "conditioner", "powder", "wax", "razor", "clipper", "trimmer", "brush", "comb",
    "makeup", "cosmetic", "skincare", "oil", "lotion"], "lipstick"],
  // watches & jewelry
  [["watch", "wristwatch", "smartwatch", "ghadi"], "watch"],
  [["ring", "jewel", "jewelry", "jewellery", "necklace", "earring", "bangle", "bracelet", "chain"], "ring"],
  // fashion (specific garments before generic)
  [["saree", "sari", "lehenga", "choli"], "saree"],
  [["dupatta", "stole", "shawl", "scarf", "sash"], "stole"],
  [["kurta", "kurti"], "kurta"],
  [["jacket", "hoodie", "sweater", "pullover", "cardigan", "blazer", "coat", "parka", "vest"], "jacket"],
  [["jeans", "jean", "trousers", "trouser", "chinos", "chino", "leggings", "legging", "joggers",
    "jogger", "cargo", "capris", "capri", "denim", "shorts"], "jeans"],
  [["dress", "skirt", "gown", "frock"], "dress"],
  [["t-shirt"], "tshirt"],
  [["shirt", "polo", "formal", "uniform"], "shirt"],
  [["bra", "panty", "brief", "stocking", "lingerie", "nighty", "pajama", "pyjama", "sleepwear",
    "nightwear", "innerwear", "tshirt"], "tshirt"],
  [["shoe", "shoes", "sneaker", "footwear", "jooti", "chappal", "sandal", "heel", "heeled",
    "slipper", "loafer", "boot", "flat", "flipflop"], "shoes"],
  [["bag", "handbag", "backpack", "purse", "wallet", "duffel", "trolley", "luggage", "suitcase",
    "sling", "clutch"], "bag"],
  [["glasses", "spectacles", "sunglasses", "eyeglasses", "lens"], "glasses"],
  [["cap", "hat", "beanie", "beret", "visor"], "cap"],
  [["belt", "buckle"], "belt"],
  [["sock", "socks"], "socks"],
  [["umbrella"], "umbrella"],
  // tools & home improvement
  [["tool", "tools", "drill", "screwdriver", "wrench", "hammer", "plier", "paint", "primer"], "wrench"],
  // office & stationery
  [["pen", "pencil", "marker", "crayon", "eraser", "sharpener", "stapler", "glue", "stationery",
    "paper", "file", "folder", "calculator", "notebook", "diary", "office"], "pen"],
  [["book", "novel", "storybook", "magazine", "comic", "school"], "book"],
  [["craft", "crafts", "sewing", "handmade", "yarn", "knitting", "needle"], "scissors"],
  // baby & pet
  [["diaper", "wipes", "nappy", "diapering"], "diaper"],
  [["stroller", "crib", "bouncer", "infant", "baby"], "stroller"],
  [["pet", "dog", "cat", "aquarium", "fish", "bird", "puppy", "kitten"], "paw"],
  // toys & sports
  [["toy", "toys", "doll", "teddy", "puzzle", "lego", "sticker", "rattle", "games"], "toy"],
  [["ball", "cricket", "basketball", "football", "tennis", "badminton", "golf", "shuttlecock",
    "racket", "bat"], "ball"],
  [["dumbbell", "gym", "fitness", "yoga", "treadmill", "mat"], "dumbbell"],
  [["wheel", "tire", "tyre", "car", "automotive", "steering", "bike", "cycle", "scooter",
    "motorcycle", "auto"], "wheel"],
  // music
  [["guitar", "piano", "violin", "sitar", "drums", "drum", "flute", "harmonium", "saxophone",
    "trumpet", "tabla", "dholak", "melodica", "music", "musical", "instrument"], "guitar"],
  // power (kept last: "extension" etc. should lose to furniture/phone matches)
  [["charger", "cable", "adapter", "battery", "extension", "socket", "switch", "router", "modem",
    "inverter", "ups", "surge", "remote"], "power"],
];

export function glyphFor(category, title) {
  const s = ((category || "") + " " + (title || "")).toLowerCase();
  const toks = new Set(s.match(/[a-z0-9']+/g) || []);
  for (const [kws, g] of MAP) {
    for (const k of kws) {
      if (/[\s-]/.test(k) ? s.includes(k) : toks.has(k)) return g;
    }
  }
  // category-based fallbacks (title didn't identify a family)
  if (/fashion|clothing|ethnic|dress|kurt/.test(s)) return "tshirt";
  if (/home|furniture|lighting|bedding|decor/.test(s)) return "sofa";
  if (/electronic|gadget|charger/.test(s)) return "phone";
  if (/beauty|personal care|cosmetic/.test(s)) return "lipstick";
  if (/toys|games/.test(s)) return "toy";
  if (/sport|outdoor/.test(s)) return "ball";
  if (/auto|car/.test(s)) return "wheel";
  return "box";
}
