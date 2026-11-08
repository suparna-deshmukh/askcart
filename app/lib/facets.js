// Shared, PURE facet vocabulary + option generators - used by the server
// guide policy (guide.js), the grounding guard (guard.js) and the CLIENT
// (question-card recount, recommendation rails). No Node builtins, no LLM,
// no fs: safe for the browser bundle.
// Looser match for QUESTION OPTIONS only: the model may say "Wedding /
// Shaadi" or "boAt Airdopes" when the set has "wedding" / "boAt" - map to
// the canonical set value instead of dropping the option. Filters stay
// strict (inList) so nothing ungrounded is ever APPLIED.
export function optionMatch(v, list) {
  const x = String(v).toLowerCase().trim();
  const exact = inList(v, list);
  if (exact) return exact;
  const partial = (list || []).find((e) => {
    const e2 = String(e).toLowerCase().trim();
    if (!e2 || e2.length < 3) return false;
    return x.includes(e2) || e2.includes(x);
  });
  return partial || null;
}
function inList(v, list) {
  const x = String(v).toLowerCase().trim();
  const hit = list.find((e) => String(e).toLowerCase() === x);
  return hit === undefined ? null : hit;
}
// Shopper-facing display labels for the coarse department categories.
export const CAT_DISPLAY = {
  "AMAZON FASHION": "Fashion & Clothing",
  "Amazon Home": "Home & Decor",
  "All Electronics": "Electronics",
  "Cell Phones & Accessories": "Mobile & Accessories",
  "Computers": "Computers & Laptops",
  "Tools & Home Improvement": "Tools & DIY",
  "Health & Personal Care": "Health & Care",
  "Office Products": "Office & Stationery",
  "All Beauty": "Beauty",
  "Appliances": "Home Appliances",
  "Automotive": "Auto & Car",
  "Pet Supplies": "Pet Care",
  "Arts, Crafts & Sewing": "Arts & Crafts",
  "Home Audio & Theater": "Audio & TV",
  "Collectibles & Fine Art": "Collectibles & Art",
};
export const displayCat = (name) => CAT_DISPLAY[name] || name;
export const OCCASION_TAG = { "Wedding / Shaadi": "wedding", Birthday: "birthday",
  Anniversary: "anniversary", Gift: "gift", "Housewarming": "housewarming" };
// Festival calendar names -> nearest catalogue tag (honest counts: the
// Diwali window maps to the diwali tag; other festivals to party).
export const FESTIVAL_TAG = { Diwali: "diwali", Dhanteras: "diwali", "Bhai Dooj": "diwali",
  "Guru Nanak Jayanti": "diwali" };
// G1: facet counts per option, from the candidate set (top-300).
const parseInr = (s) => parseInt(String(s).replace(/[₹,\s]/g, ""), 10) || 0;
export function countBudget(items, n, label) {
  if (label.startsWith("Not sure")) return n;
  const range = label.match(/₹[\d,]+\s*–\s*₹([\d,]+)/);
  if (range) {
    const lo = parseInr(label.slice(label.indexOf("₹") + 1, label.indexOf("–")));
    const hi = parseInr(range[1]);
    return items.filter((x) => x.price >= lo && x.price < hi).length;
  }
  const under = label.match(/^Under (₹[\d,]+)/);
  if (under) return items.filter((x) => x.price < parseInr(under[1])).length;
  return 0;
}
// G3: for-whom / size / capacity option generators - counts come from the
// candidate set (top-300), same rule as the budget/occasion/brand facets.
const FOR_WHOM_WORDS = {
  Women: /\b(women|womens|ladies|female)\b/i,
  Men: /\b(men|mens|male|groom)\b/i,
  Kids: /\b(kids|kid|children|child|toddler|baby|infant|boy|boys|girl|girls|school)\b/i,
};
export function forWhomOptions(items, n) {
  const counts = {};
  for (const [label, re] of Object.entries(FOR_WHOM_WORDS)) {
    counts[label] = items.filter((it) => re.test(it.title)).length;
  }
  return [
    { label: "Women", count: counts.Women },
    { label: "Men", count: counts.Men },
    { label: "Kids", count: counts.Kids },
    { label: "Unisex / any", count: n },
  ];
}
const SIZE_ORDER = ["xs", "s", "m", "l", "xl", "xxl"];
export function sizeOptions(items, n) {
  const counts = {};
  for (const it of items) {
    const ms = String(it.title).match(/\b(xxxl|xxl|xl|l|m|s|xs)\b/gi) || [];
    for (const w of ms) {
      const k = w.toLowerCase();
      if (SIZE_ORDER.includes(k)) counts[k] = (counts[k] || 0) + 1;
    }
  }
  const opts = SIZE_ORDER.filter((s) => counts[s])
    .map((s) => ({ label: s.toUpperCase(), count: counts[s] }));
  opts.push({ label: "Any size", count: n });
  return opts;
}
export function capacityOptions(items, n) {
  const counts = new Map();
  for (const it of items) {
    const ms = String(it.title).match(/(\d+(?:\.\d+)?)\s*(ton|kg|l)\b/g) || [];
    for (const raw of ms) {
      const m = raw.match(/(\d+(?:\.\d+)?)\s*(ton|kg|l)/i);
      const u = m[2].toLowerCase();
      const key = `${m[1]} ${u === "l" ? "L" : u}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const opts = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([label, count]) => ({ label, count }));
  if (opts.length) opts.push({ label: "Any", count: n });
  return opts;
}
