// Baseline + guided search over the 25K catalog.
// Word-level prefix matching (cached word index), not raw substring.
// Baseline (naive): legacy keyword search - product tokens only,
// ignores budget language and occasion tags (the failure mode we study).
// Guided re-search: budget cap, occasion-tag matching, category narrowing.

const STOP = new Set(["the", "a", "an", "for", "with", "and", "of", "in", "on", "to",
  "under", "below", "less", "than", "within", "up", "about", "around", "approx",
  "please", "find", "me", "get", "want", "need", "looking", "look", "search",
  "buy", "shop", "something", "anything", "good", "nice", "best", "top", "cheap",
  "price", "rupees", "rs", "₹", "under2k", "my", "your", "myself",
  "sister", "brother", "mom", "mum", "mother", "dad", "father", "wife", "husband",
  "friend", "friends", "colleague", "neighbour", "neighbor", "niece", "nephew",
  "son", "daughter", "cousin", "aunt", "uncle", "grandma", "grandma", "grandpa",
  "grandfather", "grandmother", "boss", "partner", "someone", "somebody", "new",
  "practical", "cool", "practical", "useful", "handy", "practical", "budget",
  "men", "mens", "women", "womens", "ladies", "lady", "sasta", "saste",
  "papa", "ammi", "amma", "dada", "dadi", "nani", "nana", "bua",
  "mama", "didi", "bhaiya", "jiju", "phupha", "taiya", "tai",
  "kya", "hai", "hain", "ka", "ki", "ke", "ko", "se", "mein", "bhi", "chahiye",
  "wala", "wali", "wale", "walein", "acha", "achi", "achha", "achhi", "accha",
  "acchi", "laao", "dijiye", "kitna", "kitne", "kitni", "mujhe", "tumhe",
  "karo", "kijiye", "batao", "bataiye", "nahi", "nahin", "bahut",
  "thoda", "thodi", "thode", "andhar", "andar", "wala", "kese", "kaise",
  "kon", "konsa", "konsi", "kaha", "kab", "kyu", "kyon", "please", "plz"]);

// S2: Hinglish lexicon (data file, not code). Roman product words map to
// canonical catalogue tokens; Devanagari words map before non-latin chars
// are stripped (they would otherwise vanish from the query).
import HINGLISH from "./lexicon_hinglish.json" with { type: "json" };
const HINGLISH_ROMAN = HINGLISH.roman;
const HINGLISH_DEV = HINGLISH.devanagari;
for (const w of HINGLISH.stopwords) STOP.add(w);

const OCCASIONS = {
  shaadi: "wedding", wedding: "wedding", bridal: "wedding", sangeet: "wedding",
  baraat: "wedding", birthday: "birthday", bday: "birthday", anniversary: "anniversary",
  party: "party", diwali: "diwali", christmas: "christmas", xmas: "christmas",
  valentines: "valentines", "valentine's": "valentines", "baby shower": "baby-shower",
  graduation: "graduation", housewarming: "housewarming",
  rakhi: "diwali", festival: "diwali", gift: "gift"
};

export function parseQuery(q) {
  let s = " " + String(q).toLowerCase().replace(/₹/g, " rs ") + " ";
  // S2: Devanagari product words -> their mapped tokens, added as latin
  // text; the original script is then stripped as usual.
  const dev = String(q).match(/[\u0900-\u097F]+/g);
  if (dev) for (const w of dev) {
    const m = HINGLISH_DEV[w];
    if (m) s += " " + m + " ";
  }
  s = s.replace(/[\u0900-\u097F]+/g, " ");
  // Spec units stuck to a number ("7kg", "1.5ton", "1100va", "500g") are
  // product specs, not budgets - normalise to "7 kg" so the tokens match
  // catalogue titles like "LG 7 kg Top Load Washing Machine". Bare "l" is
  // ambiguous with "lakh" and k is the rupee shorthand, so both stay as-is.
  // When a budget keyword is present, no expansion happens at all.
  // Spec units stuck to a number are product specs even when a budget word
  // is present ("7kg washing machine under 30k" must keep 7 + kg as tokens).
  s = s.replace(/(\d(?:\.\d+)?)(kg|mg|ml|g|ton|va|w|mm|cm|gb)\b/g, "$1 $2");
  const out = { tokens: [], budgetMax: null, budgetMin: null, occasion: null, raw: q };
  let m = s.match(/(?:under|below|less than|within|up to|max|budget of|rs\.?|₹|rupees)?\s*(\d+(?:\.\d+)?)\s*(k|lakh|l)\b/);
  if (m) {
    out.budgetMax = Math.round(parseFloat(m[1]) * (m[2] === "k" ? 1000 : (m[2] === "l" || m[2] === "lakh") ? 100000 : 1));
  } else {
    m = s.match(/(?:under|below|less than|within|up to|max)\s*(\d{3,})/);
    if (m) out.budgetMax = parseInt(m[1], 10);
  }
  m = s.match(/(?:above|over|min)\s*(\d+(?:\.\d+)?)\s*(k|l)\b/);
  if (m) out.budgetMin = Math.round(parseFloat(m[1]) * (m[2] === "k" ? 1000 : 100000));
  out.specs = parseSpecs(s); // S4: structured spec slots (never budgets)
  for (const [word, tag] of Object.entries(OCCASIONS)) {
    if (new RegExp(`\\b${word.replace("'", "")}\\b`).test(s)) { out.occasion = tag; break; }
  }
  // Numbers captured as (max/min) budget are prices, not specs: "under 3000"
  // must not become a token that matches "Voltage Stabilizer 3000 VA".
  const cleaned = s
    .replace(/(?:under|below|less than|within|up to|max|budget of|rs\.?|rupees)\s*\d+(?:\.\d+)?\s*(k|lakh|l)\b/g, " ")
    .replace(/(?:under|below|less than|within|up to|max)\s*\d{3,}\b/g, " ")
    .replace(/(?:above|over|min)\s*\d+(?:\.\d+)?\s*(k|l)\b/g, " ")
    .replace(/\d+(?:\.\d+)?\s*(k|l|lakh)\b/g, " ")
    .replace(/rs|rupees|₹/g, " ").replace(/[^a-z0-9\s-]/g, " ");
  // S4: spec phrases already captured into out.specs must not leave stray
  // tokens ("5 year old" -> year/old, "size m" -> size, "1 litre" -> litre).
  const cleaned2 = cleaned
    .replace(/\d{1,2}\s*years?\s*old\b/g, " ")
    .replace(/\d{1,2}\s*months?\b/g, " ")
    .replace(/\bsize\s*(xxl|xl|l|m|s)\b/g, " ")
    .replace(/\d{1,3}\s*(?:litre|liter)\b/g, " ");
  for (const t of cleaned2.split(/\s+/)) {
    const tt = HINGLISH_ROMAN[t] || t; // S2: ghadi -> watch, jooti -> shoes, ...
    if (STOP.has(tt)) continue;
    if (/^\d+$/.test(tt)) { if (tt.length <= 4) out.tokens.push(tt); continue; }
    if (tt.length < 2) continue;
    if (wordInOCC(tt, out)) continue;
    out.tokens.push(tt);
  }
  return out;
}

// S4: structured spec slots, parsed from the normalised query string.
// These are SOFT ranking signals (boosts in scoreAll) - never budgets:
// "128gb", "8gb ram", "1.5 ton", "43 inch", "5 star", "1 litre",
// "size m", "5 year old", "6 months".
function parseSpecs(s) {
  const specs = {};
  let m;
  if ((m = s.match(/(\d{1,2})\s*years?\s*old\b/))) specs.age = parseInt(m[1], 10);
  else if ((m = s.match(/(\d{1,2})\s*months?\b/))) specs.age = parseInt(m[1], 10) / 12;
  if ((m = s.match(/\bsize\s*(xxl|xl|l|m|s)\b/))) specs.size = m[1];
  if ((m = s.match(/(\d{1,2})\s*(?:gb|g)\s*ram\b/))) specs.ram = parseInt(m[1], 10);
  else if ((m = s.match(/(\d{2,4})\s*gb\b/))) specs.storage = parseInt(m[1], 10);
  if ((m = s.match(/(\d+(?:\.\d+)?)\s*ton\b/))) specs.tonnage = parseFloat(m[1]);
  if ((m = s.match(/(\d)\s*stars?\b/))) specs.stars = parseInt(m[1], 10);
  if ((m = s.match(/(\d{2,3})\s*(?:inch|inches)\b/))) specs.inches = parseInt(m[1], 10);
  if ((m = s.match(/(\d{1,3})\s*(?:litre|liter)\b/))) specs.volume = parseInt(m[1], 10);
  else if ((m = s.match(/(\d{1,3})l\b/))) specs.volume = parseInt(m[1], 10);
  return specs;
}

function wordInOCC(t, out) {
  return !!OCCASIONS[t];
}

let _idx = null;
function titleIndex(catalog) {
  if (_idx && _idx.len === catalog.length) return _idx;
  const pos = [];   // per item: Map(word -> earliest word position in title)
  const words = [];
  const cats = [];
  const titles = [];
  const firstWords = [];
  const brandSet = new Set();
  // S1: global vocabulary for typo candidates (length buckets + frequency)
  const vlenMap = new Map();
  const vocabFreq = new Map();
  const vocabAdd = (w) => {
    vocabFreq.set(w, (vocabFreq.get(w) || 0) + 1);
    if (!vlenMap.has(w.length)) vlenMap.set(w.length, new Set());
    vlenMap.get(w.length).add(w);
  };
  for (const it of catalog) {
    const ws = String(it.title).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const pm = new Map();
    ws.forEach((w, i) => { if (!pm.has(w)) pm.set(w, i); });
    for (const w of new Set(ws)) vocabAdd(w);
    pos.push(pm);
    words.push(pm);
    titles.push(String(it.title).toLowerCase());
    firstWords.push(ws[0] || "");
    cats.push(new Set(String(it.category).toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean)));
    const b = String(it.brand || "").toLowerCase().trim();
    if (b) { brandSet.add(b); brandSet.add(b.split(/\s+/)[0]); vocabAdd(b); }
  }
  const vlen = new Map();
  for (const [L, set] of vlenMap) vlen.set(L, [...set]);
  _idx = { words, cats, pos, titles, firstWords, brandSet, vlen, vocabFreq,
           len: catalog.length };
  return _idx;
}

// S1: typo tolerance. Damerau (OSA) edit distance with early exit; d is 1
// or 2. Cheap on random word pairs (row-min bails out immediately).
function damerauAtMost(a, b, d) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > d) return false;
  // 3-row DP: the transposition term needs D[i-2][j-2], so the row before
  // `prev` must be kept (prev2).
  let prev2 = new Array(lb + 1), prev = new Array(lb + 1), cur = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) { prev2[j] = 0; prev[j] = j; }
  for (let i = 1; i <= la; i++) {
    cur[0] = i;
    let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = prev[j] + 1;
      if (cur[j - 1] + 1 < v) v = cur[j - 1] + 1;
      if (prev[j - 1] + cost < v) v = prev[j - 1] + cost;
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        if (prev2[j - 2] + 1 < v) v = prev2[j - 2] + 1;
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > d) return false;
    // rotate all three buffers (they must stay distinct - `cur` is written
    // next while `prev2` is still read for transpositions)
    const oldPrev2 = prev2; prev2 = prev; prev = cur; cur = oldPrev2;
  }
  return prev[lb] <= d;
}

// Closest catalogue-vocabulary word within Damerau distance dmax of t
// (frequency breaks ties - the common word wins). null when nothing close.
function closestVocab(t, idx, dmax) {
  for (let dd = 1; dd <= dmax; dd++) {
    let best = null, bestFreq = -1;
    for (let L = t.length - dd; L <= t.length + dd; L++) {
      const bucket = idx.vlen.get(L);
      if (!bucket) continue;
      for (const w of bucket) {
        if (w === t) continue;
        if (!damerauAtMost(t, w, dd)) continue;
        const f = idx.vocabFreq.get(w) || 0;
        if (f > bestFreq) { best = w; bestFreq = f; }
      }
    }
    if (best) return best;
  }
  return null;
}

// Per-query typo plan: at most 3 tokens, each resolved to a corrected word
// (5-7 chars: distance 1; 8+ chars: distance 2) or an alphanumeric-glued
// split ("iphone15" -> word part "iphone" + spec number "15";
// "128gb" -> number "128" + unit word "gb"). Tokens that ARE catalogue
// vocabulary are left alone - exact words must keep exact-match semantics.
function planTypos(tokens, idx) {
  const plan = new Map();
  let budget = 3;
  for (const t of tokens) {
    if (t.length < 5 || budget <= 0) continue;
    if (idx.vocabFreq.has(t)) continue;
    budget--;
    const glued = t.match(/^([a-z]{4,})(\d{1,4})$/) || t.match(/^(\d{1,4})([a-z]{2,})$/);
    if (glued) {
      if (glued.length === 3 && /^[a-z]+$/.test(glued[1])) {
        // letters+digits: "iphone15"
        const a0 = glued[1], d = glued[2];
        const a = idx.vocabFreq.has(a0) ? a0 : (a0.length >= 5 ? closestVocab(a0, idx, 1) : null);
        if (a && idx.vocabFreq.has(d)) plan.set(t, { kind: "split", a, d });
      } else if (/^\d+$/.test(glued[1])) {
        // digits+letters: "128gb"
        const d = glued[1], a0 = glued[2];
        const a = idx.vocabFreq.has(a0) ? a0 : (a0.length >= 5 ? closestVocab(a0, idx, 1) : null);
        if (a && idx.vocabFreq.has(d)) plan.set(t, { kind: "split", a, d });
      }
      continue;
    }
    const w = closestVocab(t, idx, t.length >= 8 ? 2 : 1);
    if (w) plan.set(t, w);
  }
  return plan;
}

function typoHit(posMap, spec) {
  if (!spec) return false;
  if (spec.kind === "split") return wordPos(posMap, spec.a) >= 0 && posMap.has(spec.d);
  return posMap.has(spec) || posMap.has(spec + "s");
}

// Word matching: exact match, singular/plural agreement, and bounded
// prefix (>=5-char token, at most 3 extra chars) so "mat" never matches
// "maternity" and "bed" never matches "bedroom". Returns the earliest
// position of a matching word (-1 when no match) so the scorer can favour
// front-of-title matches (keyword-stuffed tail phrases rank lower).
// A few high-value product-word synonyms (token -> acceptable title words).
const SYNONYMS = {
  phone: ["smartphone", "iphone", "cellphone", "nokia", "itel", "karbonn"],
  mobile: ["smartphone", "cellphone"],
  cellphone: ["smartphone", "mobile"],
  watch: ["smartwatch", "wristwatch"],
  tv: ["television"],
  blender: ["mixer"],
  mixer: ["blender"],
  computer: ["laptop", "desktop"],
  pc: ["laptop", "desktop"],
};
// Idiom tokens: match ONLY via synonyms, never literally (US titles say
// "mobile cart" / "mobile app", which must not satisfy an Indian "mobile" query).
const NO_LITERAL = new Set(["mobile", "cellphone", "phone"]);

// Recipient words implying an ADULT ("sweater for papa" is not a kids
// sweater): when present, kid-marked titles are penalised.
export const ADULT_RECIPIENTS = new Set(["papa", "dad", "father", "husband", "brother",
  "grandfather", "uncle", "boss", "ammi", "amma", "mom", "mum", "mother",
  "wife", "sister", "grandmother", "bua", "didi", "jiju", "dada", "dadi",
  "nani", "nana", "taiya", "mama", "tai", "phupha", "maa", "mummy", "abba",
  "bhai", "behen", "bhen", "saas", "sasur"]);
export const MALE_RECIPIENTS = new Set(["papa", "dad", "father", "husband", "brother",
  "grandfather", "uncle", "boss", "dada", "nana", "bhaiya", "jiju", "taiya",
  "phupha", "abba", "bhai", "sasur"]);
export const FEMALE_RECIPIENTS = new Set(["ammi", "amma", "mom", "mum", "mother",
  "wife", "sister", "grandmother", "bua", "didi", "nani", "dadi", "tai",
  "mama", "maa", "mummy", "behen", "bhen", "saas"]);
// S3: child recipients - kid-marked titles get a boost ("kurta for beta")
export const CHILD_RECIPIENTS = new Set(["beta", "beti", "bachcha", "bachchi",
  "bachche", "bachchon", "kid", "kids", "child", "children"]);
export const KID_WORDS = new Set(["kids", "kid", "boy", "boys", "girls", "girl",
  "child", "children", "toddler", "baby"]);
// Words that mark an item as an accessory of the queried product. The scorer
// penalises them - but only when they are not part of the query itself
// ("phone case" is a case query; "phone" is not).
const ACCESSORY_HINTS = new Set(["case", "cases", "charger", "charging", "cable", "cord",
  "cover", "holder", "stand", "strap", "band", "screen", "guard", "protector", "sticker",
  "mount", "adapter", "skin", "folio", "pouch", "sleeve", "dock", "cradle", "battery",
  "lens", "tripod", "bag", "tote", "carrier", "liner", "tray", "basket", "antenna",
  "insole", "laces", "blade", "jar", "lid", "pick", "picks", "block", "holder",
  "earbuds", "earbud", "earphone", "earphones", "headphones", "headset", "selfie",
  "power", "bank", "memory", "card", "tempered", "glass", "film", "ring", "grip",
  "light", "remote", "box", "tip", "tips", "cleaner", "brush", "spray", "hanger",
  "capo", "capos", "string", "strings", "stretcher", "tuner", "pedal", "poster",
  "hub", "hubs", "pin", "pins", "peg", "pegs", "pickguard", "pickguards", "puller",
  "bridge", "wedge", "wedges", "cabinet", "console",
  "mouse", "mice", "body", "bodies", "unfinished", "shim", "shims",
  "cushion", "cushions", "pad", "pads",
  "sleep", "sleeping", "headband", "headbands", "asmr", "rocking", "rocker",
  "muff", "muffs", "bulk", "classroom", "amp", "amplifier",
  "bottle", "bottles", "stopper", "stoppers", "vial", "vials",
  "print", "knob", "knobs", "holster", "holder", "holder", "ornament",
  "wristlet", "crossbody", "gimbal", "gimbals", "microphone", "microphones", "mics",
  "motherboard", "motherboards",
  "pan", "pans", "egg", "apron", "glove", "gloves", "mould", "moulds",
  "art", "paper", "shirt", "shirts", "tee", "decal", "decals", "keychain",
  "lanyard", "flip", "flop", "slipper", "slippers", "flipflop",
  "sticker", "stickers", "decal", "stencil", "stencils", "patch", "patches",
  "figurine", "figurines", "stuffed", "plush", "doll", "dolls", "teddy",
  "card", "cards", "sticker", "sticker", "sticker",
  "wheels", "caster", "casters"]);
function wordPos(posMap, t) {
  const cands = NO_LITERAL.has(t) ? (SYNONYMS[t] || [t]) : [t, ...(SYNONYMS[t] || [])];
  let best = -1;
  for (const [w, p] of posMap) {
    for (const t2 of cands) {
      if (w === t2 || w === t2 + "s" || (t2.endsWith("s") && w === t2.slice(0, -1)) ||
          (t2.length >= 5 && w.startsWith(t2) && w.length - t2.length <= 3)) {
        if (best === -1 || p < best) best = p;
        break;
      }
    }
  }
  return best;
}
function wordHit(posMap, t) {
  return wordPos(posMap, t) >= 0;
}

// Modifier words (context, not product): they inform intent ranking but are
// not required to match. Used to pick the "key token" for multi-word queries.
const MODIFIERS = new Set(["college", "coding", "student", "university", "professional",
  "business", "office", "home", "house", "room", "kitchen", "bedroom", "bathroom",
  "daily", "work", "travel", "car", "modern", "classic", "vintage", "outdoor", "indoor"]);

function keyToken(tokens) {
  const nonMod = tokens.filter((t) => !MODIFIERS.has(t));
  const src = nonMod.length ? nonMod : tokens;
  return src.sort((a, b) => b.length - a.length)[0] || null;
}

const CAT_ALIAS = { "electronics": "electronics", "fashion": "fashion",
  "home & decor": "home", "home decor": "home", "beauty": "beauty",
  "sports": "sports", "office": "office" };

// Shared scorer: returns every matching item with its score (pre-sort).
function scoreAll(catalog, q, { relax = false, category = null, occasion = null, budgetMax = null, brand = null, naive = false, forWhom = null, size = null, capacity = null } = {}) {
  const idx = titleIndex(catalog);
  const parsed = parseQuery(q);
  const tokens = parsed.tokens;
  // naive (baseline) mode: legacy keyword search - product tokens only,
  // ignores budget language and occasion tags (the failure mode we study).
  if (naive) {
    const results = [];
    for (let i = 0; i < catalog.length; i++) {
      const item = catalog[i];
      let score = 0;
      for (const t of tokens) {
        if (wordHit(idx.words[i], t)) score += 2;
        else if (wordHit(idx.cats[i], t)) score += 1.5;
      }
      if (score > 0) results.push({ ...item, score, intent: score >= 2 });
    }
    return results;
  }
  const budget = budgetMax !== null ? budgetMax : parsed.budgetMax;
  const occ = occasion || parsed.occasion;
  const catKey = category ? (CAT_ALIAS[String(category).toLowerCase()] || String(category).toLowerCase()) : null;
  const brandKey = brand ? String(brand).toLowerCase() : null;
  const bestRated = brandKey === "best_rated";
  // Intent: for multi-product-token queries, ALL non-modifier tokens must
  // match ("yoga mat" requires yoga AND mat); single-token queries match on
  // that token. A matched occasion tag also counts as intent.
  // "bag" is a context word when a specific bag kind is present
  // ("trolley bag" is a trolley, "backpack bag" is a backpack), but the
  // product word on its own ("bag for travel").
  const bagIsContext = tokens.includes("bag") &&
    tokens.some((t) => t !== "bag" && !MODIFIERS.has(t));
  const isMod = (t) => MODIFIERS.has(t) || (t === "bag" && bagIsContext);
  const nonMod = tokens.filter((t) => !isMod(t));
  const required = nonMod.length >= 2 ? nonMod : (nonMod.length === 1 ? nonMod : tokens);
  const tokenSet = new Set(tokens);
  const typoPlan = planTypos(tokens, idx); // S1 (guided path only)
  const rawWords = new Set(String(q).toLowerCase().match(/[a-z']+/g) || []);
  const accHints = [...ACCESSORY_HINTS].filter((w) => !tokenSet.has(w));
  // G3: guided facets (for-whom / size / capacity chips) reuse the exact
  // same recipient and spec-slot boost mechanisms as parsed query slots.
  let specs = parsed.specs || {};
  const g3 = {};
  if (size && /^(xxl|xl|l|m|s|xs)$/i.test(size)) g3.size = size.toLowerCase();
  if (capacity) {
    const cm = String(capacity).match(/([\d.]+)\s*(ton|kg|l)\b/i);
    if (cm) {
      const u = cm[2].toLowerCase();
      if (u === "ton") g3.tonnage = parseFloat(cm[1]);
      else if (u === "kg") g3.kg = parseInt(cm[1], 10);
      else g3.volume = parseInt(cm[1], 10);
    }
  }
  if (Object.keys(g3).length) specs = { ...specs, ...g3 };
  const g3male = forWhom === "men", g3female = forWhom === "women", g3child = forWhom === "kids";
  // Budget-only query ("under 500"): browse mode - top-rated items within
  // the cap (and the occasion, when one is given), instead of a null page.
  if (tokens.length === 0 && budget !== null) {
    const giftIntent = new Set(String(q).toLowerCase().match(/[a-z']+/g) || [])
      .has("gift") || /gift|present/i.test(String(q));
    let browse = [];
    const inBrowse = (item) => {
      if (item.price > budget) return false;
      if (occ && !(item.tags && item.tags.includes(occ))) return false;
      return true;
    };
    const toBrowse = (item) => ({ ...item, score: (item.rating || 0) * 2 +
      Math.log10(Math.max(item.num_ratings, 1)), intent: true });
    for (let i = 0; i < catalog.length; i++) if (inBrowse(catalog[i])) browse.push(toBrowse(catalog[i]));
    if (occ && giftIntent) {
      // "shaadi gift under 2k" - the gift tag is the real filter
      const gifted = browse.filter((x) => x.tags && x.tags.includes("gift"));
      if (gifted.length >= 12) browse = gifted;
    }
    browse.sort((a, b) => b.score - a.score);
    return browse;
  }
  const results = [];
  for (let i = 0; i < catalog.length; i++) {
    const item = catalog[i];
    let score = 0;
    let matched = 0;
    const matchedSet = new Set();
    for (const t of tokens) {
      // modifier tokens (college, coding, ...) are context: they never score,
      // so an item can't rank on a modifier alone
      if (isMod(t)) continue;
      const p = wordPos(idx.pos[i], t);
      if (p >= 0) {
        let base = 2 + (p < 4 ? 0.75 : 0);
        if (NO_LITERAL.has(t) && !idx.pos[i].has("smartphone") &&
            !idx.pos[i].has("iphone") && !idx.pos[i].has("cellphone")) {
          // Matched only via a phone-brand word (nokia/itel/karbonn): a
          // feature phone is a phone, but no early-title bonus - a genuine
          // smartphone title ("... Smartphone") outranks it.
          base = 2.0;
        }
        score += base; matched++; matchedSet.add(t);
        // "phone"/"mobile" matched via the canonical word -> genuine phone
        if (NO_LITERAL.has(t) && idx.pos[i].has("smartphone")) score += 0.5;
      }
      else if (typoHit(idx.pos[i], typoPlan.get(t))) {
        // S1: typo candidate - counts as a match but ranks below exact (x0.7)
        score += 1.4; matched++; matchedSet.add(t);
      }
      else if (wordHit(idx.cats[i], t)) { score += 1.5; matched++; matchedSet.add(t); }
    }
    let hits = matched;
    // S4: structured spec slots as soft boosts/penalties (never budgets).
    // A stated spec the item carries outranks one it contradicts.
    if (specs.tonnage !== undefined) {
      const hasTon = idx.pos[i].has("ton") || idx.pos[i].has("tons");
      if (hasTon && idx.pos[i].has(String(specs.tonnage))) score += 1.5;
      else if (hasTon) score -= 1.0;
    }
    if (specs.kg !== undefined) {
      const hasKg = idx.pos[i].has("kg");
      if (hasKg && idx.pos[i].has(String(specs.kg))) score += 1.5;
      else if (hasKg) score -= 1.0;
    }
    if (specs.inches !== undefined) {
      const hasIn = idx.pos[i].has("inch") || idx.pos[i].has("inches");
      if (hasIn && idx.pos[i].has(String(specs.inches))) score += 1.5;
      else if (hasIn) score -= 1.0;
    }
    if (specs.ram !== undefined && idx.pos[i].has("ram") &&
        idx.pos[i].has(String(specs.ram))) score += 1.0;
    if (specs.storage !== undefined && idx.pos[i].has("gb") &&
        idx.pos[i].has(String(specs.storage))) score += 1.0;
    if (specs.stars !== undefined) {
      if ((item.rating || 0) >= specs.stars) score += 1.0;
      else score -= 0.5;
    }
    if (specs.size !== undefined && idx.pos[i].has(specs.size)) score += 0.75;
    if (specs.age !== undefined && specs.age <= 3) {
      for (const w of KID_WORDS) if (idx.pos[i].has(w)) { score += 1.0; break; }
    }
    // phrase bonus: multi-token queries that appear as an actual phrase in
    // the title ("yoga mat") outrank scattered keyword matches
    if (nonMod.length >= 2 && required.every((t) => matchedSet.has(t))) {
      const phrase = required.join(" ");
      if (idx.titles[i].includes(phrase)) score += 1.5;
    }
    const occHit = !!(occ && item.tags && item.tags.includes(occ));
    if (occHit) { score += 2; hits++; }
    if (catKey && catKey !== "any category" && item.category.toLowerCase().includes(catKey)) { score += 1.5; hits++; }
    if (brandKey && !bestRated) {
      const b = String(item.brand || "").toLowerCase();
      if (b && b === brandKey) { score += 2; hits++; }
      else if (!b) { score += 0.75; hits++; } // unbranded generics stay in play
    }
    // Brand-leading titles ("Redmi 13C ...", "JBL Flip 6 ...") are genuine
    // product listings; keyword-stuffed titles lead with junk words.
    if (idx.firstWords[i] && idx.brandSet.has(idx.firstWords[i])) score += 0.75;
    // Car/auto context: a "speaker" shopper does not want a car speaker
    // (same mechanism as the accessory penalty - only when not queried).
    if (matched > 0 && !tokenSet.has("car") && !tokenSet.has("automotive") &&
        (idx.pos[i].has("car") || idx.pos[i].has("automotive"))) score -= 1.0;
    // Adult recipient vs kids product: "sweater for papa" should not
    // surface kids' sweaters; male/female recipients vs the opposite gender
    // ("sweater for grandfather" is not a women's sweater).
    if (matched > 0) {
      let adult = false, male = false, female = false;
      let child = false;
      for (const w of rawWords) {
        if (ADULT_RECIPIENTS.has(w)) adult = true;
        if (MALE_RECIPIENTS.has(w)) male = true;
        if (FEMALE_RECIPIENTS.has(w)) female = true;
        if (CHILD_RECIPIENTS.has(w)) child = true;
      }
      if (adult) {
        for (const w of KID_WORDS) if (idx.pos[i].has(w)) { score -= 1.5; break; }
      }
      if (child || g3child) {
        for (const w of KID_WORDS) if (idx.pos[i].has(w)) { score += 1.0; break; }
      }
      if ((male || g3male) && (idx.pos[i].has("womens") || idx.pos[i].has("women"))) score -= 1.0;
      if ((female || g3female) && (idx.pos[i].has("men") || idx.pos[i].has("mens"))) score -= 1.0;
      // G3: an explicit for-whom chip also boosts matching gender tokens,
      // so the tap visibly re-ranks (penalty alone is a no-op on
      // gender-token-poor candidate sets like India-layer kurtis).
      if (g3female) {
        for (const w of ["women", "womens", "ladies", "female"]) if (idx.pos[i].has(w)) { score += 2.0; break; }
      }
      if (g3male) {
        for (const w of ["men", "mens", "male"]) if (idx.pos[i].has(w)) { score += 2.0; break; }
      }
    }
    // Query modifiers that also appear in the title confirm the intended
    // product kind ("office chair" -> an "Office Chair", not a dining chair).
    let modBonus = 0;
    for (const t of tokens) if (isMod(t) && idx.pos[i].has(t)) modBonus += 0.75;
    if (modBonus) score += Math.min(modBonus, 1.5);
    if (hits === 0) continue;
    if (budget !== null) {
      const cap = relax ? budget * 1.6 : budget * 1.0;
      if (item.price > cap) continue;
      if (item.price <= budget) score += 1;
    }
    if (bestRated) score += (item.rating || 0); // "no preference - best rated"
    else score += (item.rating || 0) * 0.15;   // small quality tiebreak
    // accessory penalty: "phone" should not surface phone cases first
    // (checks plural forms too: "liners" penalises a "air fryer" query)
    if (accHints.length && matched > 0 &&
        accHints.some((w) => idx.pos[i].has(w) || idx.pos[i].has(w + "s"))) score -= 1.5;
    const allRequired = required.length > 0 && required.every((t) => matchedSet.has(t));
    results.push({ ...item, score, intent: allRequired || occHit });
  }
  return results;
}

export function search(catalog, q, opts = {}) {
  const results = scoreAll(catalog, q, opts);
  results.sort((a, b) => b.score - a.score);
  const limit = Math.max(1, Math.min(96, Math.floor(Number(opts.limit) || 12)));
  return results.slice(0, limit);
}

// Aggregate stats over the matched set (or the whole catalogue when the
// query matches nothing) - used by the follow-up question policy to build
// data-driven options: category candidates, brand candidates, price quantiles.
export function searchStats(catalog, q, opts = {}) {
  const hits = scoreAll(catalog, q, opts);
  const base = hits.length ? hits : catalog;
  const catCounts = new Map();
  const brandCounts = new Map();
  const tagCounts = new Map();
  const prices = [];
  for (const it of base) {
    catCounts.set(it.category, (catCounts.get(it.category) || 0) + 1);
    if (it.brand) brandCounts.set(it.brand, (brandCounts.get(it.brand) || 0) + 1);
    for (const tg of it.tags || []) tagCounts.set(tg, (tagCounts.get(tg) || 0) + 1);
    prices.push(it.price);
  }
  prices.sort((a, b) => a - b);
  const pct = (p) => prices.length ? prices[Math.min(prices.length - 1, Math.floor(p * prices.length))] : 0;
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));
  return {
    n: hits.length,
    categories: top(catCounts, 4),
    brands: top(brandCounts, 4),
    priceP: { p25: pct(0.25), p50: pct(0.5), p75: pct(0.75) },
    // G1: facet counts come from the top-300 candidates BY SCORE (the set
    // the shopper can actually see), not catalogue order.
    items: (hits.length ? [...base].sort((a, b) => (b.score || 0) - (a.score || 0)) : base).slice(0, 300),
    // G1: facet counts for question chips (candidate-set, not whole catalog)
    tagCounts: top(tagCounts, 12),
    priceMin: prices.length ? prices[0] : 0,
    priceMax: prices.length ? prices[prices.length - 1] : 0,
  };
}
