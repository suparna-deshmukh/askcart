"use client";
// Duotone glyph sheet (30) for Tile v2. Stroke 1.75, round joins.
// Selected by keyword map over category + title (first match wins).
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" };

const PATHS = {
  box: <><path {...P} d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3ZM4 7.5l8 4.5 8-4.5M12 12v9" /></>,
  dress: <path {...P} d="M9 3l1.5 4L8 12l-2 8h12l-2-8-2.5-5L15 3M9 3h6" />,
  saree: <path {...P} d="M8 3c-2 5-2 13 0 18M8 3h5v18H8c2-5 2-13 0-18ZM13 8h4M13 14h3" />,
  kurta: <path {...P} d="M9 3L7 6v13h10V6l-2-3-2.5 2.5L12 7 9.5 5.5ZM12 7v12" />,
  shirt: <path {...P} d="M9 3L4 6l2 4 2-1v12h8V9l2 1 2-4-5-3-3 2.5L9 3Z" />,
  shoes: <path {...P} d="M3 15v-4l4-1 2-4 3 1 4 4c3 1 5 2 5 4v2H3ZM3 17h18" />,
  bag: <path {...P} d="M6 8h12l1 13H5L6 8ZM9 8V6a3 3 0 0 1 6 0v2" />,
  watch: <><rect {...P} x="7" y="7" width="10" height="10" rx="3" /><path {...P} d="M9 7l.5-4h5L15 7M9 17l.5 4h5l.5-4M12 10v2.5l1.5 1" /></>,
  ring: <><circle {...P} cx="12" cy="14" r="6" /><path {...P} d="M9.5 8.5L12 3l2.5 5.5L12 6Z" /></>,
  phone: <><rect {...P} x="7" y="3" width="10" height="18" rx="2.5" /><path {...P} d="M11 18h2" /></>,
  laptop: <path {...P} d="M5 6h14v10H5zM3 19h18l-1.5-3h-15Z" />,
  headphones: <path {...P} d="M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H5a1 1 0 0 1-1-1v-4Zm16 0h-3v5h2a1 1 0 0 0 1-1v-4Z" />,
  speaker: <><rect {...P} x="6" y="3" width="12" height="18" rx="2" /><circle {...P} cx="12" cy="14" r="3.5" /><circle {...P} cx="12" cy="7" r="1" /></>,
  tv: <><rect {...P} x="3" y="5" width="18" height="12" rx="2" /><path {...P} d="M9 21h6M12 17v4" /></>,
  ac: <><rect {...P} x="3" y="6" width="18" height="8" rx="2" /><path {...P} d="M7 17v3M12 17v4M17 17v3M6 11h9" /></>,
  fridge: <><rect {...P} x="6" y="3" width="12" height="18" rx="2" /><path {...P} d="M6 10h12M9 6v2M9 13v3" /></>,
  washer: <><rect {...P} x="4" y="3" width="16" height="18" rx="2" /><circle {...P} cx="12" cy="13" r="4.5" /><path {...P} d="M8 6h2M12 13a4.5 4.5 0 0 0 4.5-3" /></>,
  mixer: <path {...P} d="M4 20h16M6 20v-6c0-2 2-3 3-5V5a3 3 0 0 1 6 0v4c1 2 3 3 3 5v6M9 5h6" />,
  cookware: <path {...P} d="M5 11h14v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-5ZM3 11h18M9 8c0-1.5 1-2 1-3M13 8c0-1.5 1-2 1-3M7 20l-1 1.5M17 20l1 1.5" />,
  kettle: <path {...P} d="M8 9h9l2 9a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3l1-9ZM8 9c0-2 1-3 3-4h4M17 12h3l-1 3h-2" />,
  sofa: <path {...P} d="M4 12V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M3 12a2 2 0 0 1 2 2v3h14v-3a2 2 0 0 1 4 0v5H2v-5a2 2 0 0 1 1-2Z" />,
  lamp: <path {...P} d="M9 3h6l3 8H6l3-8ZM12 11v7M8 21h8M12 18v3" />,
  diya: <path {...P} d="M4 14h16c0 3-3.5 5-8 5s-8-2-8-5ZM12 11c-1-1.5-1-3 0-5 1 2 1 3.5 0 5Z" />,
  toy: <><rect {...P} x="4" y="10" width="10" height="8" rx="1.5" /><path {...P} d="M14 13l5-3v8l-5-3M7 18v2M12 18v2" /></>,
  stroller: <path {...P} d="M3 4h2l3 9h10a4 4 0 0 0 4-4M9 13l-1.5 5M17 13l2 5M8 21a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM18 21a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />,
  book: <path {...P} d="M5 4h13a2 2 0 0 1 2 2v13H7a2 2 0 0 0-2 2V4ZM5 18a2 2 0 0 1 2-2h13" />,
  ball: <><circle {...P} cx="12" cy="12" r="8" /><path {...P} d="M12 4c3 2.5 3 13.5 0 16M4.5 9.5c4.5 2 10.5 2 15 0M4.5 14.5c4.5-2 10.5-2 15 0" /></>,
  dumbbell: <path {...P} d="M8 8v8M5 9.5v5M16 8v8M19 9.5v5M8 12h8M3 12h2M19 12h2" />,
  wheel: <><circle {...P} cx="12" cy="12" r="8" /><circle {...P} cx="12" cy="12" r="2.5" /><path {...P} d="M12 4v5.5M12 14.5V20M4 12h5.5M14.5 12H20" /></>,
  pot: <path {...P} d="M5 10h14v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-6ZM3 10h18M9 7c0-1.5 1-2 1-3M13 7c0-1.5 1-2 1-3" />,
  lipstick: <path {...P} d="M10 3h4v6h-4zM9 9h6v4H9zM8 13h8v7a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-7Z" />,
  camera: <><rect {...P} x="3" y="7" width="18" height="13" rx="2" /><path {...P} d="M8 7l1.5-3h5L16 7M12 14a3 3 0 1 0 0-.01" /></>,
  gamepad: <path {...P} d="M7 8h10a5 5 0 0 1 5 6l-.5 3a2.5 2.5 0 0 1-4.5 1L15 16H9l-2 2a2.5 2.5 0 0 1-4.5-1L2 14a5 5 0 0 1 5-6ZM8 11v3M6.5 12.5h3M15.5 11.5h.01M17.5 13.5h.01" />,
  fan: <><circle {...P} cx="12" cy="12" r="2" /><path {...P} d="M12 10c0-4 1.5-6 4-6 2 0 3 2 1.5 4S13 10 12 10ZM14 12c4 0 6 1.5 6 4 0 2-2 3-4 1.5S14 13 14 12ZM12 14c0 4-1.5 6-4 6-2 0-3-2-1.5-4S11 14 12 14ZM10 12c-4 0-6-1.5-6-4 0-2 2-3 4-1.5S11 11 10 12Z" /></>,
  tshirt: <path {...P} d="M9 3L4 6l2 4 2-1v12h8V9l2 1 2-4-5-3-3 2.5L9 3Z" />,
};

export function Glyph({ kind, size = 44, color }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={color ? { color } : undefined} aria-hidden="true">
      {PATHS[kind] || PATHS.box}
    </svg>
  );
}

const MAP = [
  ["phone|smartphone|mobile", "phone"], ["laptop|notebook|computer", "laptop"],
  ["headphone|earbud|earphone|headset", "headphones"], ["speaker|boombox", "speaker"],
  ["tv|television|smart tv", "tv"], ["ac |air condition|split|window ac", "ac"],
  ["fridge|refrigerator", "fridge"], ["washing machine|washer", "washer"],
  ["mixer|grinder|chopper|juicer|blender", "mixer"],
  ["cookware|saucepan|frying|utensil|bartan|kadai|tawa", "cookware"],
  ["kettle|heater", "kettle"], ["watch|wristwatch|ghadi", "watch"],
  ["ring|jewel|necklace|earring|bangle", "ring"], ["saree|sari|lehenga", "saree"],
  ["kurta|kurti", "kurta"], ["shirt|tshirt|t-shirt|polo", "shirt"],
  ["shoe|sneaker|footwear|jooti|chappal|sandal|heel|slipper", "shoes"],
  ["bag|handbag|backpack|purse|wallet", "bag"], ["sofa|couch|chair|furniture|mattress|bed", "sofa"],
  ["lamp|light|chandelier|diya|decor|decoration|lantern", "lamp"],
  ["toy|doll|game set", "toy"], ["stroller|baby|diaper|crib", "stroller"],
  ["book|novel|storybook", "book"], ["ball|cricket|basketball|tennis", "ball"],
  ["dumbbell|gym|fitness|yoga|mat ", "dumbbell"], ["wheel|tire|car|automotive", "wheel"],
  ["lipstick|perfume|serum|cream|skincare|shampoo|cosmetic", "lipstick"],
  ["camera|dslr", "camera"], ["gamepad|console|xbox|playstation", "gamepad"],
  ["fan|exhaust", "fan"], ["tshirt", "tshirt"], ["pot|tiffin|kitchen", "pot"],
];

export function glyphFor(category, title) {
  const t = ((category || "") + " " + (title || "")).toLowerCase();
  for (const [k, g] of MAP) if (k.split("|").some((w) => t.includes(w))) return g;
  if (/fashion|clothing|ethnic|dress|kurt|saree/.test(t)) return "dress";
  if (/home|furniture|lighting|bedding|decor/.test(t)) return "sofa";
  if (/electronic|gadget|charger/.test(t)) return "phone";
  if (/beauty|personal care|cosmetic/.test(t)) return "lipstick";
  if (/toys|games/.test(t)) return "toy";
  if (/sport|outdoor/.test(t)) return "ball";
  if (/auto|car/.test(t)) return "wheel";
  return "box";
}
