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
  "him", "her", "his", "hers", "us", "our", "ours", "they", "their", "theirs", "them",
  "apne", "apni", "apna", "apno", "khud", "uske", "uski", "uska", "biwi", "patni",
  "family", "ghar",
  "piece", "pieces", "item", "items", "essentials", "essential", "packing",
  "cheez", "cheeze", "cheezein", "samman", "thing", "things", "stuff", "chijein",
  "supplies",
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
  shaadi: "wedding", shadi: "wedding", "शादी": "wedding", "शादि": "wedding", wedding: "wedding", bridal: "wedding", sangeet: "wedding",
  baraat: "wedding", birthday: "birthday", bday: "birthday", anniversary: "anniversary",
  party: "party", diwali: "diwali", christmas: "christmas", xmas: "christmas",
  valentines: "valentines", "valentine's": "valentines", "baby shower": "baby-shower",
  graduation: "graduation", housewarming: "housewarming",
  rakhi: "diwali", festival: "diwali", event: "party", gift: "gift"
};

export function parseQuery(q) {
  // Devanagari digits ०-९ -> latin (before anything strips the script).
  const rawQ = String(q).replace(/[\u0966-\u096F]/g, (d) => String("\u0966\u0967\u0968\u0969\u096A\u096B\u096C\u096D\u096E\u096F".indexOf(d)));
  let s = " " + rawQ.toLowerCase().replace(/₹/g, " rs ") + " ";
  // S2: Devanagari product words -> their mapped tokens, added as latin
  // text; the original script is then stripped as usual.
  const dev = String(q).match(/[\u0900-\u097F]+/g);
  if (dev) for (const w of dev) {
    const m = HINGLISH_DEV[w];
    if (m) s += " " + m + " ";
  }
  // Devanagari compound + unit words that must land NEXT TO their number
  // (the run-mapping above appends at the end, which would break adjacency).
  s = s.replace(/टी-शर्ट/g, " tshirt ")
       .replace(/टन/g, " ton ").replace(/लीटर|लीटर/g, " litre ")
       .replace(/इंच|इंच/g, " inch ").replace(/किलो/g, " kg ").replace(/वाट/g, " w ")
       .replace(/साल|साल/g, " saal ");
  // Hinglish/Devanagari budget phrasings put the number FIRST:
  // "1500 se kam", "20000 में", "2k tak", "2 हज़ार" -> canonical "under N".
  // Runs while the Devanagari script is still present in `s`.
  s = s.replace(/(\d{1,3})\s*(?:हज़ार|hazaar)(?![a-z])/g, "$1k");
  s = s.replace(/(\d+(?:\.\d+)?\s*(?:k|lakh|l)?\s*)(?:से\s*कम|se\s+kam|के\s*अंदर|ke\s+andar|तक|tak|में|me)(?![a-z])/g, "under $1");
  s = s.replace(/[\u0900-\u097F]+/g, " ");
  // Spec units stuck to a number ("7kg", "1.5ton", "1100va", "500g") are
  // product specs, not budgets - normalise to "7 kg" so the tokens match
  // catalogue titles like "LG 7 kg Top Load Washing Machine". Bare "l" is
  // ambiguous with "lakh" and k is the rupee shorthand, so both stay as-is.
  // When a budget keyword is present, no expansion happens at all.
  // Spec units stuck to a number are product specs even when a budget word
  // is present ("7kg washing machine under 30k" must keep 7 + kg as tokens).
  s = s.replace(/(\d(?:\.\d+)?)(kg|mg|ml|g|ton|va|w|mm|cm|gb)\b/g, "$1 $2");
  // Resolution / network words ("4k", "5g") are specs, never budgets: the
  // budget regex would otherwise read "4k" as 4000 rupees and cap
  // "43 inch tv 4k" at Rs 4,000.
  const resolution = (s.match(/\b(4k|8k|uhd|fhd)\b/) || [])[1] || null;
  const network = (s.match(/\b([456])g\b/) || [])[1] || null;
  s = s.replace(/\b(4k|8k|uhd|fhd|qled|oled)\b/g, " ")
       .replace(/\b[456]g\b/g, " ");
  const out = { tokens: [], budgetMax: null, budgetMin: null, occasion: null,
                raw: q, cheap: false, forWhom: null, recipient: null };
  if (resolution) out.resolution = resolution;
  if (network) out.network = network;
  // Cheap-adjective without a number ("saste me phone", "cheap laptop") is a
  // price-ordering signal, not a product word.
  if (/\b(sasta|saste|sasti|cheap)\b/.test(s) && !/\d\s*(k|lakh)\b/.test(s) && !/\bunder\s*\d/.test(s))
    out.cheap = true;
  let m = s.match(/(?:under|below|less than|within|up to|max|budget of|rs\.?|₹|rupees)?\s*(\d+(?:\.\d+)?)\s*(k|lakh|l)\b/);
  if (m) {
    out.budgetMax = Math.round(parseFloat(m[1]) * (m[2] === "k" ? 1000 : (m[2] === "l" || m[2] === "lakh") ? 100000 : 1));
  } else {
    m = s.match(/(?:under|below|less than|within|up to|max)\s*(\d{3,})/);
    if (m) out.budgetMax = parseInt(m[1], 10);
  }
  m = s.match(/(?:above|over|min)\s*(\d+(?:\.\d+)?)\s*(k|l)\b/);
  if (m) out.budgetMin = Math.round(parseFloat(m[1]) * (m[2] === "k" ? 1000 : 100000));
  // A bare trailing price ("gift 1000", "jooti 1200", "kapde 2500") is the
  // budget when no budget keyword/quantity unit was parsed. Unit-adjacent
  // numbers (1000 pcs, 2 kg) stay tokens; small numbers (<100) are model
  // parts (iPhone 15), not prices.
  // The Devanagari lexicon maps append mapped words AFTER the original
  // text ("... diye 300" -> "... diya 300 home ..."), so the trailing check
  // below also accepts the ORIGINAL query's last word.
  const rawWordsTrail = rawQ.split(/\s+/).filter(Boolean);
  if (out.budgetMax === null) {
    const SPEC_UNIT = new RegExp(
      "\\b(" + "ton|kg|mg|ml|g|gb|tb|inch|inches|watt|w|va|mm|cm|pcs|pc|pieces|litre|liter|star|stars|year|years|month|months" + ")\\b");
    const words = s.split(/\s+/).filter(Boolean);
    for (let i = words.length - 1; i >= 0; i--) {
      const w = words[i];
      const n = parseInt(w, 10);
      if (!/^\d{2,6}$/.test(w) || n < 100) continue;
      const adj = [words[i - 1], words[i + 1]].filter(Boolean);
      if (adj.some((a) => SPEC_UNIT.test(" " + a + " "))) continue;
      // Trailing prices ("gift 1000") and "N ka/wala" phrasings ("phone case
      // 500 ka") are budgets. Mid-query numbers are model numbers ("nokia
      // 105 phone") and must stay tokens.
      const trailing = i === words.length - 1 ||
        (rawWordsTrail.length > 0 && rawWordsTrail[rawWordsTrail.length - 1] === w);
      const wala = /^(ka|wala)$/.test(words[i + 1] || "");
      if (!trailing && !wala) break;
      out.budgetMax = n;
      break;
    }
  }
  out.specs = parseSpecs(s); // S4: structured spec slots (never budgets)
  if (out.resolution) out.specs = { ...out.specs, resolution: out.resolution };
  if (out.network) out.specs = { ...out.specs, network: out.network };
  // Normalised latin words (Devanagari-mapped) for recipient/audience logic
  out.rawWords = s.replace(/[^a-z0-9\s-]/g, " ").match(/[a-z']+/g) || [];
  // For-whom parsed straight from the query (the STOP list drops men/women
  // tokens, so without this "gift under 2000 for men" loses its intent).
  const FORW = {
    women: /\b(women|womens|ladies|female|for\s+her|biwi|patni|wife)\b/i,
    men: /\b(men|mens|gents|male|for\s+him|pitaji|pita)\b/i,
    kids: /\b(kids|kid|children|child|toddler|baby|infant|bachche|bachcha|bachchi)\b/i,
  };
  for (const [v, rx] of Object.entries(FORW)) if (rx.test(s)) { out.forWhom = v; break; }
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
    .replace(/(?:^|\s)(\d*)rs\b/g, "$1 ").replace(/rupees|₹/g, " ").replace(/[^a-z0-9\s-]/g, " ");
  // S4: spec phrases already captured into out.specs must not leave stray
  // tokens ("5 year old" -> year/old, "size m" -> size, "1 litre" -> litre).
  const cleaned2 = cleaned
    .replace(/\d{1,2}\s*years?\s*old\b/g, " ")
    .replace(/\d{1,2}\s*months?\b/g, " ")
    .replace(/\d{1,2}\s*saal\b/g, " ")
    .replace(/\bsize\s*(xxl|xl|l|m|s)\b/g, " ")
    .replace(/\d{1,3}\s*(?:litre|liter)\b/g, " ");
  const capturedBudget = out.budgetMax !== null && !/\b(under|below|less|within|up|max|budget)\b/.test(s);
  const wlist = cleaned2.split(/\s+/);
  // Pack quantities ("pack of 3", "3 pack", "3 pcs") are counts, not product
  // attributes: "tshirt pack of 3 under 999" must not require the digit 3
  // (it let "Shuttlecock 3 Pack" outrank T-shirt packs).
  const PACKQTY = new Set(["pack", "packs", "piece", "pieces", "pc", "pcs"]);
  const isPackQty = (i) => [wlist[i - 2], wlist[i - 1], wlist[i + 1], wlist[i + 2]]
    .some((w) => w && PACKQTY.has(w));
  for (let i = 0; i < wlist.length; i++) {
    const tt = HINGLISH_ROMAN[wlist[i]] || wlist[i]; // S2: ghadi -> watch, jooti -> shoes, ...
    // Gift words are tag/occasion intent, not product tokens ("christmas
    // gifts" must browse giftable christmas items, not literal "gift" titles).
    if (/^(gift|gifts|present|presents|uphaar)$/.test(tt)) continue;
    if (STOP.has(tt)) continue;
    if (/^\d+$/.test(tt)) {
      // A bare number that WAS the budget must not re-enter as a token
      // (it is what matched "300 TC" bedsheets for "diye 300").
      if (capturedBudget && parseInt(tt, 10) === out.budgetMax) continue;
      if (tt.length <= 4 && !isPackQty(i)) out.tokens.push(tt);
      continue;
    }
    if (tt.length < 2) continue;
    if (wordInOCC(tt, out)) continue;
    out.tokens.push(tt);
  }
  // "shaadi gift box/item/packing": the pack word is a packaging hint, not a
  // product token (it was matching "Geometry Box"). Drop it and flag the
  // query so gift-box titles get a boost.
  const GIFT_PACK = new Set(["box", "boxes", "item", "items", "packing", "pack",
    "kit", "set", "hamper", "hampers"]);
  if (/\b(gift|gifts|present|presents|uphaar)\b/.test(s) &&
      out.tokens.some((t) => GIFT_PACK.has(t))) {
    out.tokens = out.tokens.filter((t) => !GIFT_PACK.has(t));
    out.giftPack = true;
  }
  // S5: normalized 2-gram phrases for whole-value tag matches
  // ("stainless steel" -> "stainlesssteel", "baby shower" -> "babyshower").
  out.phrases = [];
  {
    const pw = (out.rawWords || []).filter((w) => /^[a-z]{3,}$/.test(String(w)));
    for (let i = 0; i + 1 < pw.length && out.phrases.length < 8; i++)
      out.phrases.push(pw[i] + pw[i + 1]);
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
  else if ((m = s.match(/(\d{1,2})\s*saal\b/))) specs.age = parseInt(m[1], 10);
  if ((m = s.match(/\bsize\s*(xxl|xl|l|m|s)\b/))) specs.size = m[1];
  // RAM first: "16GB DDR4 RAM" is RAM, not storage.
  if ((m = s.match(/(\d{1,2})\s*gb(?:\s+\w+)?\s*ram\b/))) specs.ram = parseInt(m[1], 10);
  else for (const m2 of s.matchAll(/(\d{2,4})\s*(gb|tb)\b/gi)) {
    const before = s.slice(Math.max(0, m2.index - 16), m2.index).toLowerCase();
    const after = s.slice(m2.index + m2[0].length, m2.index + m2[0].length + 12).toLowerCase();
    // A bare "N GB" next to a CPU token ("i7 16GB") means RAM, not storage.
    if (/ram|ddr/.test(after)) continue;
    if (/\bi[3-9]\b|\bryzen\b|\bpentium\b|\bceleron\b/.test(before)) continue;
    specs.storage = parseInt(m2[1], 10);
    break;
  }
  if ((m = s.match(/(\d+(?:\.\d+)?)\s*ton\b/))) specs.tonnage = parseFloat(m[1]);
  if ((m = s.match(/(\d{1,3}(?:\.\d+)?)\s*kg\b/i))) specs.kg = parseFloat(m[1]);
  if ((m = s.match(/(\d)\s*stars?\b/))) specs.stars = parseInt(m[1], 10);
  if ((m = s.match(/(\d{2,3})\s*(?:inch|inches)\b/))) specs.inches = parseInt(m[1], 10);
  if ((m = s.match(/(\d{1,3}(?:\.\d+)?)\s*(?:litre|liter)\b/))) specs.volume = parseFloat(m[1]);
  // Glued "316L" is a steel grade, not a volume: require a space (or a
  // small number) before the bare L.
  else for (const m2 of s.matchAll(/(\d{1,3}(?:\.\d+)?)\s*l\b/g)) {
    const n = parseFloat(m2[1]);
    if (m2[0].includes(" ") || n <= 5) { specs.volume = n; break; }
  }
  return specs;
}

function wordInOCC(t, out) {
  return !!OCCASIONS[t];
}

let _idx = null;
const IDX_V = 2; // bump on any indexed-field change (S5 tagged columns)
const TAG_COLS = ["location", "for_whom", "purpose", "material", "feature",
                  "spec", "season", "style"];
function titleIndex(catalog) {
  if (_idx && _idx.len === catalog.length && _idx.v === IDX_V) return _idx;
  const pos = [];   // per item: Map(word -> earliest word position in title)
  const words = [];
  const cats = [];
  const titles = [];
  const firstWords = [];
  const tagTokA = []; // S5: normalized tag tokens (columns + occasion tags)
  const tagValA = []; // S5: normalized full tag values (phrase matches)
  const specNA = [];  // S5: numeric spec sets {inch,star,ton,kg,gb,l,size}
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
    // S5: tagged catalog columns + occasion tags as normalized match sets.
    {
      const tagTok = new Set(), tagVal = new Set();
      const spN = { inch: new Set(), star: new Set(), ton: new Set(),
                    kg: new Set(), gb: new Set(), l: new Set(), size: new Set() };
      const addTag = (v) => {
        const sv = String(v).toLowerCase();
        const n = sv.replace(/[^a-z0-9]+/g, "");
        if (n) tagVal.add(n);
        for (const w of sv.split(/[\s/-]+/)) {
          const wn = w.replace(/[^a-z0-9]+/g, "");
          if (wn) tagTok.add(wn);
        }
      };
      for (const f of TAG_COLS) if (Array.isArray(it[f])) for (const v of it[f]) addTag(v);
      if (Array.isArray(it.tags)) for (const v of it.tags) addTag(v);
      for (const v of Array.isArray(it.spec) ? it.spec : []) {
        const sv = String(v).toLowerCase().replace(/-/g, "");
        let m;
        if ((m = sv.match(/^(\d+(?:\.\d+)?)inch$/))) spN.inch.add(parseFloat(m[1]));
        else if ((m = sv.match(/^(\d+(?:\.\d+)?)star$/))) spN.star.add(parseFloat(m[1]));
        else if ((m = sv.match(/^(\d+(?:\.\d+)?)ton$/))) spN.ton.add(parseFloat(m[1]));
        else if ((m = sv.match(/^(\d+(?:\.\d+)?)kg$/))) spN.kg.add(parseFloat(m[1]));
        else if ((m = sv.match(/^(\d+(?:\.\d+)?)gb$/))) spN.gb.add(parseFloat(m[1]));
        else if ((m = sv.match(/^(\d+(?:\.\d+)?)l$/))) spN.l.add(parseFloat(m[1]));
        else if (sv) spN.size.add(sv);
      }
      tagTokA.push(tagTok); tagValA.push(tagVal); specNA.push(spN);
    }
  }
  const vlen = new Map();
  for (const [L, set] of vlenMap) vlen.set(L, [...set]);
  _idx = { words, cats, pos, titles, firstWords, brandSet, vlen, vocabFreq,
           tagTokA, tagValA, specNA, len: catalog.length, v: IDX_V };
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
    let w = closestVocab(t, idx, t.length >= 8 ? 2 : 1);
    if (!w && t.length >= 6) {
      // Brand-ish token: same 5-char head and within +2 length accepts a
      // distance-2 candidate ("philix" -> "philips").
      let best = null, bestFreq = -1;
      for (let L = t.length - 1; L <= t.length + 2; L++) {
        const bucket = idx.vlen.get(L);
        if (!bucket) continue;
        for (const v of bucket) {
          if (v === t || v.slice(0, 5) !== t.slice(0, 5)) continue;
          if (!damerauAtMost(t, v, 2)) continue;
          const f = idx.vocabFreq.get(v) || 0;
          if (f > bestFreq) { best = v; bestFreq = f; }
        }
      }
      w = best;
    }
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
  tshirt: ["shirt"],
  tv: ["television"],
  kurta: ["kurti"],
  kurti: ["kurta"],
  blender: ["mixer"],
  mixer: ["blender"],
  computer: ["laptop", "desktop"],
  pc: ["laptop", "desktop"],
  couch: ["sofa", "sectional", "loveseat", "divan"],
  sofa: ["couch", "sectional", "loveseat"],
  spectacles: ["glasses", "sunglasses"],
  sunglasses: ["glasses"],
  pods: ["earpods", "earbuds", "earphones", "earbud", "earphone"],
  ear: ["earbuds", "earpods", "earphones", "earbud", "earphone"],
  jumper: ["sweater", "pullover", "hoodie", "cardigan"],
  pullover: ["sweater", "jumper", "hoodie"],
};
// Idiom tokens: match ONLY via synonyms, never literally (US titles say
// "mobile cart" / "mobile app", which must not satisfy an Indian "mobile" query).
const NO_LITERAL = new Set(["mobile", "cellphone", "phone", "couch"]);

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

// ---- shared helpers (exported for the semantic fallback, app/lib/semantic.js) ----
// Budget relaxation factor used when a strict budget leaves <2 results.
export const BUDGET_RELAX = 1.6;

// Car/auto context: a "speaker" shopper does not want a car speaker
// (only penalised when the query did not ask for car/automotive).
export function autoContextDelta(tokenSet, itemPos) {
  if (!tokenSet.has("car") && !tokenSet.has("automotive") &&
      (itemPos.has("car") || itemPos.has("automotive"))) return -1.0;
  return 0;
}

// Adult/male/female/child recipient vs item gender/kids tokens, plus the G3
// for-whom boosts. Returns the score delta (0 when nothing applies).
export function audienceDelta(rawWords, itemPos, forWhom = null, strong = false) {
  let adult = false, male = false, female = false, child = false;
  for (const w of rawWords) {
    if (ADULT_RECIPIENTS.has(w)) adult = true;
    if (MALE_RECIPIENTS.has(w)) male = true;
    if (FEMALE_RECIPIENTS.has(w)) female = true;
    if (CHILD_RECIPIENTS.has(w)) child = true;
  }
  const g3male = forWhom === "men", g3female = forWhom === "women", g3child = forWhom === "kids";
  let delta = 0;
  if (adult) {
    for (const w of KID_WORDS) if (itemPos.has(w)) { delta -= 1.5; break; }
  }
  // A for-men/for-women facet (chip or parsed) means an adult: kid-marked
  // items are wrong ("gift under 2000 for men" was ranking kids' capes).
  if (g3male || g3female) {
    for (const w of KID_WORDS) if (itemPos.has(w)) { delta -= 2.5; break; }
  }
  if (child || g3child) {
    for (const w of KID_WORDS) if (itemPos.has(w)) { delta += 1.0; break; }
    // "bachche ke liye khilona" must not surface PET toys.
    for (const w of ["cat", "dog", "pet", "parrot", "bird", "aquarium", "hamster", "rabbit"])
      if (itemPos.has(w)) { delta -= 2.5; break; }
  }
  // strong = an EXPLICIT for-whom chip answer (not just a parsed
  // recipient word): the shopper committed, so the opposite-gender
  // penalty must actually remove those items from the top of the list.
  const oppPen = strong ? 3.0 : 1.0;
  if ((male || g3male) && (itemPos.has("womens") || itemPos.has("women"))) delta -= oppPen;
  if ((female || g3female) && (itemPos.has("men") || itemPos.has("mens"))) delta -= oppPen;
  // Positive pull for a stated recipient ("gift for men", "shoes for mummy")
  if (male && (itemPos.has("men") || itemPos.has("mens") || itemPos.has("male"))) delta += 1.0;
  if (female && (itemPos.has("women") || itemPos.has("womens") || itemPos.has("female") ||
                 itemPos.has("ladies") || itemPos.has("lady"))) delta += 1.0;
  if (g3female) {
    for (const w of ["women", "womens", "ladies", "female"]) if (itemPos.has(w)) { delta += 2.0; break; }
  }
  if (g3male) {
    for (const w of ["men", "mens", "male"]) if (itemPos.has(w)) { delta += 2.0; break; }
  }
  return delta;
}

// Accessory-hint penalty: "phone" should not surface phone cases first
// (checks plural forms too: "liners" penalises a "air fryer" query).
export function accessoryDelta(accHints, itemPos) {
  if (accHints.length &&
      accHints.some((w) => itemPos.has(w) || itemPos.has(w + "s"))) return -1.5;
  return 0;
}
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
  "pen", "pens", "stylus", "styluses",
  "wheels", "caster", "casters"]);
function wordPos(posMap, t) {
  const cands = NO_LITERAL.has(t) ? (SYNONYMS[t] || [t]) : [t, ...(SYNONYMS[t] || [])];
  let best = -1;
  for (const [w, p] of posMap) {
    for (const t2 of cands) {
      if (w === t2 || w === t2 + "s" || (t2.endsWith("s") && w === t2.slice(0, -1)) ||
          (t2.length >= 5 && w.startsWith(t2) && w.length - t2.length <= 5)) {
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
  "daily", "work", "travel", "car", "modern", "classic", "vintage", "outdoor", "indoor",
  "guest", "night", "morning"]);

function keyToken(tokens) {
  const nonMod = tokens.filter((t) => !MODIFIERS.has(t));
  const src = nonMod.length ? nonMod : tokens;
  return src.sort((a, b) => b.length - a.length)[0] || null;
}

const CAT_ALIAS = { "electronics": "electronics", "fashion": "fashion",
  "home & decor": "home", "home decor": "home", "beauty": "beauty",
  "sports": "sports", "office": "office",
  // Shopper-facing display labels (guide.js CAT_DISPLAY) map back to the
  // raw department names for the substring filter below.
  "fashion & clothing": "fashion", "mobile & accessories": "cell phones",
  "computers & laptops": "computers", "tools & diy": "tools",
  "health & care": "health", "office & stationery": "office",
  "home appliances": "appliances", "auto & car": "automotive",
  "pet care": "pet", "arts & crafts": "arts, crafts",
  "audio & tv": "audio & theater", "collectibles & art": "collectibles" };

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
  // "bag" is a context word when a specific bag kind is present
  // ("trolley bag" is a trolley, "backpack bag" is a backpack) - EXCEPT when
  // the companion word names the bag's host product ("laptop bag" IS a bag).
  const BAG_HOSTS = new Set(["laptop", "trolley", "backpack", "camera", "school",
    "gym", "bike", "scooter", "travel"]);
  const bagIsContext = tokens.includes("bag") &&
    (tokens.some((t) => t !== "bag" && !MODIFIERS.has(t) && !BAG_HOSTS.has(t)) ||
     tokens.includes("trolley")); // a trolley IS the bag ("trolley bag")
  // "camera" is context on a phone query ("phone with good camera"), "water"
  // is context on a bottle query ("water bottle").
  const camIsMod = tokens.includes("camera") &&
    tokens.some((t) => t === "phone" || t === "mobile" || t === "smartphone");
  const waterIsMod = tokens.includes("water") &&
    tokens.some((t) => t === "bottle" || t === "flask" || t === "thermos");
  const isMod = (t) => MODIFIERS.has(t) || (t === "bag" && bagIsContext) ||
    (t === "camera" && camIsMod) || (t === "water" && waterIsMod);
  const nonMod = tokens.filter((t) => !isMod(t));
  // A query made entirely of context words ("something for my room") must
  // still match on its key word - otherwise it is a hard null.
  const forceKey = nonMod.length === 0 && tokens.length ? keyToken(tokens) : null;
  // "kuch naya phone ke liye" / "something for my room": the single named
  // product after a vague word + "for" is the HOST, not the product. The
  // shopper wants accessories for it, so the host itself is demoted and
  // its accessories are boosted.
  const HOST_WORDS = new Set(["phone", "mobile", "smartphone", "laptop", "car",
    "couch", "sofa", "bottle", "flask", "thermos", "room", "office", "wall",
    "table", "bike", "scooter", "desk"]);
  let ctxProduct = null;
  if (nonMod.length === 1 && HOST_WORDS.has(nonMod[0]) &&
      /\b(kuch|kuchh|something|anything|koi|ek\b|cheez|cheeze|chijein)\b/i.test(q) &&
      /\b(ke\s+liye|for|liye)\b/.test(q)) ctxProduct = nonMod[0];
  // "couch under 15000": "Throw Blanket for Couch" must not satisfy it.
  const SOFA_WORDS = new Set(["couch", "sofa", "sectional", "loveseat", "divan"]);
  const sofaCtx = nonMod.some((t) => SOFA_WORDS.has(t) ||
    (SYNONYMS[t] || []).some((x) => SOFA_WORDS.has(x)));
  const preRaw = new Set(parsed.rawWords);
  const kidsWanted = forWhom === "kids" || parsed.forWhom === "kids" ||
    [...preRaw].some((w) => CHILD_RECIPIENTS.has(w)) ||
    (parsed.specs && parsed.specs.age !== undefined && parsed.specs.age <= 12);
  const bottleCtx = tokens.some((t) => ["bottle", "flask", "thermos"].includes(t));
  const babyWanted = [...preRaw].some((w) => ["baby", "infant", "nija", "shishu"].includes(w));
  const required = nonMod.length >= 2 ? nonMod : (nonMod.length === 1 ? nonMod : tokens);
  const tokenSet = new Set(tokens);
  const typoPlan = planTypos(tokens, idx); // S1 (guided path only)
  const giftQuery = /\b(gift|gifts|present|presents|uphaar)\b/i.test(String(q)) &&
    nonMod.filter((t) => !/^(gift|gifts|present|presents|uphaar)$/.test(t)).length === 0;
  // Raw words from the NORMALISED text (parseQuery.rawWords): a
  // Devanagari-only query ("मम्मी के लिए जूते") carries its recipient
  // after the lexicon maps it to latin ("mummy"); the original string
  // has no latin words at all.
  const rawWords = new Set(parsed.rawWords);
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
  // Precompiled title-regexes for capacity chip filters: the word index
  // splits "1.5" into "1"+"5", so spec numbers must match the raw title.
  const capTonnageRe = g3.tonnage !== undefined ? new RegExp("\\b" + g3.tonnage + "\\s*ton\\b", "i") : null;
  const capKgRe = g3.kg !== undefined ? new RegExp("\\b" + g3.kg + "\\s*kg", "i") : null;
  const capVolRe = g3.volume !== undefined ? new RegExp("\\b" + g3.volume + "\\s*(litre|liters)", "i") : null;
  // Budget-only query ("under 500"), or a tokenless recipient query
  // ("things for dad" - every word stopped out): browse mode - top-rated
  // items within the cap (and the occasion/audience when given), instead of
  // a null page.
  const recipientBrowse = tokens.length === 0 && budget === null &&
    ([...rawWords].some((w) => ADULT_RECIPIENTS.has(w) || CHILD_RECIPIENTS.has(w)) ||
     parsed.forWhom);
  const giftIntent = /\b(gift|gifts|present|presents|uphaar)\b/i.test(String(q));
  // A gift+occasion query with no product token ("shaadi gift",
  // "christmas gifts") is a browse: the occasion+gift-tagged items ARE the
  // answer (this used to fall through to 0 lexical hits).
  if (tokens.length === 0 && (budget !== null || recipientBrowse ||
      (giftIntent && occ))) {
    const giftIntent = new Set(String(q).toLowerCase().match(/[a-z']+/g) || [])
      .has("gift") || /gift|present/i.test(String(q));
    let browse = [];
    const OCC_WORDS = { wedding: ["wedding", "bridal", "bride"],
      christmas: ["christmas", "xmas"], diwali: ["diwali", "rakhi"],
      birthday: ["birthday", "bday"], valentines: ["valentine"],
      party: ["party"], graduation: ["graduation"],
      anniversary: ["anniversary"], housewarming: ["housewarming"] };
    const WEARABLE = /(lehenga|saree|sari|kurti|anarkali|salwar|sherwani|gown|dupatta|niyoni)/i;
    const occLeadAt = (ci, item) => !WEARABLE.test(String(item.title)) &&
      (OCC_WORDS[occ] || [occ]).some((w) =>
        idx.titles[ci].split(/[^a-z0-9]+/).slice(0, 4).includes(w));
    const inBrowse = (item, idxI) => {
      if (budget !== null && item.price > budget) return false;
      if (occ && !(item.tags && item.tags.includes(occ))) return false;
      // Explicit facet selections (chips / chat slots) are HARD filters in
      // browse mode exactly like in the main scoring loop.
      if (catKey && catKey !== "any category" &&
          !item.category.toLowerCase().includes(catKey)) return false;
      if (brandKey && !bestRated) {
        const b = String(item.brand || "").toLowerCase();
        if (!b || b !== brandKey) return false;
      }
      if (g3.size && !idx.words[idxI].has(g3.size)) return false;
      if (capTonnageRe && !capTonnageRe.test(item.title)) return false;
      if (capKgRe && !capKgRe.test(item.title)) return false;
      if (capVolRe && !capVolRe.test(item.title)) return false;
      return true;
    };
    const toBrowse = (item, idxI) => {
      let score = (item.rating || 0) * 2 + Math.log10(Math.max(item.num_ratings, 1));
      const audience = forWhom || parsed.forWhom ||
        [...rawWords].some((w) => ADULT_RECIPIENTS.has(w) || CHILD_RECIPIENTS.has(w));
      if (audience) {
        score += audienceDelta(rawWords, idx.pos[idxI], forWhom || parsed.forWhom);
        if (item.tags && item.tags.includes("gift")) score += 2.0;
      }
      // Occasion word leading the title ("Panda Wedding Tea Cup",
      // "Christmas Candles") beats the same word buried in a
      // keyword-stuffed tail - including for untagged-gift themed items.
      // Wearable occasion outfits (bridal lehenga) are what the SHOPPER
      // wears, not a gift - they never get the themed boost.
      if (occ && occLeadAt(idxI, item)) score += 5.0;
      // Child-age slot in browse mode ("gift for 5 year old"): kid items.
      if (parsed.specs.age !== undefined) {
        if (parsed.specs.age <= 12) {
          for (const w of KID_WORDS) if (idx.pos[idxI].has(w)) { score += 1.5; break; }
          if (item.category === "Toys & Games") score += 1.5;
        } else {
          for (const w of KID_WORDS) if (idx.pos[idxI].has(w)) { score -= 1.5; break; }
        }
      }
      return { ...item, score, intent: true };
    };
    for (let i = 0; i < catalog.length; i++) if (inBrowse(catalog[i], i)) browse.push(toBrowse(catalog[i], i));
    if (occ && giftIntent) {
      // "shaadi gift under 2k" - the gift tag is the real filter; keep
      // themed (occasion-leading) items alongside the gift-tagged ones.
      const kept = browse.filter((x) =>
        (x.tags && x.tags.includes("gift")) || (x.tags && x.tags.includes(occ) &&
          occLeadAt(idx.titles.indexOf(x.title.toLowerCase()), x)));
      if (kept.length >= 12) browse = kept;
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
      // so an item can't rank on a modifier alone - unless it is the forced
      // key token of an all-modifier query ("something for my room" -> room)
      if (isMod(t) && t !== forceKey) continue;
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
    // S5: tagged-column boosts (material/feature/style/season/location/
    // purpose tokens, 2-gram phrases, for-whom, spec match + conflict).
    {
      const tagTok = idx.tagTokA[i], tagVal = idx.tagValA[i];
      let tagB = 0;
      for (const t of nonMod) {
        const tn = t.replace(/[^a-z0-9]+/g, "");
        if (tn.length >= 2 && tagTok.has(tn)) tagB += 0.9;
      }
      if (tagB > 1.8) tagB = 1.8;
      if (tagB) score += tagB;
      let phHit = 0;
      for (const ph of parsed.phrases) if (tagVal.has(ph)) { phHit++; if (phHit >= 2) break; }
      if (phHit) { score += phHit * 1.5; hits += phHit; }
      const fw = forWhom || parsed.forWhom;
      if (fw && tagTok.has(fw)) score += 1.2;
      const spN = idx.specNA[i];
      if (specs.inches !== undefined) {
        if (spN.inch.has(specs.inches)) score += 1.5;
        else if (spN.inch.size) score -= 2.5;
      }
      if (specs.stars !== undefined) {
        if (spN.star.has(specs.stars)) score += 1.5;
        else if (spN.star.size) score -= 2.0;
      }
      if (specs.tonnage !== undefined) {
        if (spN.ton.has(specs.tonnage)) score += 1.5;
        else if (spN.ton.size) score -= 2.0;
      }
      if (specs.kg !== undefined) {
        if (spN.kg.has(specs.kg)) score += 1.5;
        else if (spN.kg.size) score -= 2.0;
      }
      if (specs.storage !== undefined) {
        if (spN.gb.has(specs.storage)) score += 1.0;
        else if (spN.gb.size) score -= 1.0;
      }
      if (specs.ram !== undefined && spN.gb.has(specs.ram)) score += 1.0;
      if (specs.volume !== undefined) {
        if (spN.l.has(specs.volume)) score += 1.0;
        else if (spN.l.size) score -= 1.0;
      }
      if (specs.size !== undefined && spN.size.has(String(specs.size).toLowerCase())) score += 1.0;
    }
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
    // A child-age slot (<=12) wants kid-marked items; an adult age wants
    // the opposite ("gift for 5 year old" was ranking adult gifts).
    if (specs.age !== undefined && specs.age <= 12) {
      for (const w of KID_WORDS) if (idx.pos[i].has(w)) { score += 1.5; break; }
    } else if (specs.age !== undefined) {
      for (const w of KID_WORDS) if (idx.pos[i].has(w)) { score -= 1.0; break; }
    }
    if (specs.network) {
      if (idx.pos[i].has(specs.network.toLowerCase())) score += 1.0;
    }
    if (specs.resolution) {
      const r = specs.resolution.toLowerCase();
      if (idx.pos[i].has(r) || (r === "4k" && idx.pos[i].has("uhd"))) score += 1.0;
    }
    // phrase bonus: multi-token queries that appear as an actual phrase in
    // the title ("yoga mat") outrank scattered keyword matches
    if (nonMod.length >= 2 && required.every((t) => matchedSet.has(t))) {
      const phrase = required.join(" ");
      if (idx.titles[i].includes(phrase)) score += 1.5;
    }
    // Gift queries with no product noun ("shaadi gift", "gift under 2k"):
    // gift-tagged items outrank plain occasion apparel (the mined failure:
    // "shaadi gift" -> bridal lehenga). Non-gift fashion is demoted.
    if (giftQuery && matched > 0) {
      if (item.tags && item.tags.includes("gift")) score += 1.5;
      if (idx.titles[i].includes("gift")) score += 1.0;
      if (!(item.tags && item.tags.includes("gift")) &&
          item.category === "AMAZON FASHION") score -= 1.2;
      // Synergy: items tagged for BOTH the occasion and gifting are the
      // actual answer to "shaadi gift" / "christmas gifts".
      if (occ && item.tags && item.tags.includes("gift") && item.tags.includes(occ)) score += 2.0;
      // A recipient-named gift is for that adult, not for kids.
      if (parsed.forWhom === "men" || parsed.forWhom === "women" ||
          [...rawWords].some((w) => ADULT_RECIPIENTS.has(w))) {
        for (const w of KID_WORDS) if (idx.pos[i].has(w)) { score -= 2.5; break; }
      }
    }
    // Gift-pack queries ("shaadi gift box"): gift-box/set titles are the
    // product, so they outrank scattered "gift" keyword matches.
    if (parsed.giftPack && idx.titles[i].match(/gift\s*(box|set|pack|hamper|kit)/)) score += 2.0;
    const occHit = !!(occ && item.tags && item.tags.includes(occ));
    if (occHit) { score += 2; hits++; }
    // Occasion word in the title ("Christmas Pajamas" for "christmas gifts")
    // beats occasion-tag-only generic items.
    if (occHit && ["wedding", "birthday", "diwali", "christmas", "valentines",
                   "graduation", "party", "anniversary"].includes(occ) &&
        idx.titles[i].includes(occ)) score += 1.5;
    // Kids wanted (chip, phrase or recipient) -> the toy aisle, not pet toys.
    if (kidsWanted && item.category === "Toys & Games") score += 1.5;
    if (sofaCtx && (idx.pos[i].has("couch") || idx.pos[i].has("sofa")) &&
        ["blanket", "throw", "pillow", "cover", "slipcover", "springs", "stain", "mover"].some((w) => idx.pos[i].has(w))) {
      score -= 2.5; // a blanket/cover FOR the couch, not a couch
    }
    if (ctxProduct) {
      const hostHit = wordPos(idx.pos[i], ctxProduct) >= 0 ||
        (SYNONYMS[ctxProduct] || []).some((x) => idx.pos[i].has(x));
      if (hostHit && accessoryDelta(accHints, idx.pos[i]) >= 0) score -= 3.0;
      else if (!hostHit && accessoryDelta(accHints, idx.pos[i]) < 0) score += 2.0;
    }
    if (bottleCtx && !babyWanted && idx.pos[i].has("baby")) score -= 1.5;
    // Explicit category selection (chip / chat slot) is a HARD filter.
    if (catKey && catKey !== "any category") {
      if (!item.category.toLowerCase().includes(catKey)) continue;
      score += 1.5; hits++;
    }
    if (brandKey && !bestRated) {
      // Explicit brand selection (chip / chat slot) is a HARD filter: the
      // shopper picked a brand, so non-brand items must not appear.
      // (Was a soft +2 boost: "budget headphones under 3000" + Apple
      // still surfaced Bose/boAt - the brand answer was invisible.)
      const b = String(item.brand || "").toLowerCase();
      if (!b || b !== brandKey) continue;
      score += 2; hits++;
    }
    // Explicit size / capacity selections (chips) are HARD filters over
    // the same title-derived spec vocabulary the options are built from.
    if (g3.size && !idx.words[i].has(g3.size)) continue;
    if (capTonnageRe && !capTonnageRe.test(item.title)) continue;
    if (capKgRe && !capKgRe.test(item.title)) continue;
    if (capVolRe && !capVolRe.test(item.title)) continue;
    // Brand-leading titles ("Redmi 13C ...", "JBL Flip 6 ...") are genuine
    // product listings; keyword-stuffed titles lead with junk words.
    if (idx.firstWords[i] && idx.brandSet.has(idx.firstWords[i])) score += 0.75;
    // Car/auto context + recipient/gender/kids adjustments + for-whom G3
    // boosts (shared with the semantic fallback via the exported helpers).
    if (matched > 0) score += autoContextDelta(tokenSet, idx.pos[i]);
    if (matched > 0) score += audienceDelta(rawWords, idx.pos[i], forWhom || parsed.forWhom, !!forWhom);
    // Query modifiers that also appear in the title confirm the intended
    // product kind ("office chair" -> an "Office Chair", not a dining chair).
    let modBonus = 0;
    for (const t of tokens) if (isMod(t) && idx.pos[i].has(t)) modBonus += 0.75;
    if (modBonus) score += Math.min(modBonus, 1.5);
    if (hits === 0) continue;
    if (budget !== null) {
      const cap = relax ? budget * BUDGET_RELAX : budget * 1.0;
      if (item.price > cap) continue;
      if (item.price <= budget) score += 1;
    }
    if (bestRated) score += (item.rating || 0); // "no preference - best rated"
    else score += (item.rating || 0) * 0.15;   // small quality tiebreak
    // accessory penalty: "phone" should not surface phone cases first
    if (matched > 0) score += accessoryDelta(accHints, idx.pos[i]);
    const allRequired = required.length > 0 && required.every((t) => matchedSet.has(t));
    // Full-match coverage bonus: an item carrying EVERY query token outranks
    // partial matches ("smart watch" -> Smartwatch beats Smart Bulb). Single-
    // token queries shift uniformly (no reordering).
    if (allRequired) score += 1.5;
    // Brand + model number ("Nokia 105"): the number is the model, not a
    // missed token - a brand-matched title carrying the number is on-intent.
    const qBrandTok = tokens.find((t) => !/^\d+$/.test(t) &&
      String(item.brand || "").toLowerCase().includes(t));
    const modelNum = tokens.find((t) => /^\d+$/.test(t) && t.length >= 2);
    const modelIntent = !!(qBrandTok && modelNum &&
      matchedSet.has(qBrandTok) && matchedSet.has(modelNum));
    const accPen = accessoryDelta(accHints, idx.pos[i]);
    results.push({ ...item, score, intent: allRequired || occHit || modelIntent, _acc: accPen < 0 });
  }
  return results;
}

export function search(catalog, q, opts = {}) {
  const results = scoreAll(catalog, q, opts);
  results.sort((a, b) => b.score - a.score);
  // Cheap-adjective queries order the intent-matched picks by price (the
  // shopper said cheap; the rating tiebreak must not hide the cheap ones).
  if (parseQuery(q).cheap) {
    const intent = results.filter((r) => r.intent);
    // "saste me phone": price order, but phone accessories (pen, screen
    // guard) must not lead the cheap list - real products first.
    const nonAcc = intent.filter((r) => !r._acc).sort((a, b) => a.price - b.price);
    const acc = intent.filter((r) => r._acc).sort((a, b) => a.price - b.price);
    const rest = results.filter((r) => !r.intent);
    results.length = 0;
    results.push(...nonAcc, ...acc, ...rest);
  }
  for (const r of results) delete r._acc;
  const limit = Math.max(1, Math.min(200, Math.floor(Number(opts.limit) || 12)));
  const out = results.slice(0, limit);
  // Full pre-cap match count for the "N of M left" echo. Plain array
  // property: dropped by JSON serialisation, invisible to all callers.
  out.total = results.length;
  return out;
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
  // On-intent price quantiles over the VISIBLE top-300 (by score): budget
  // bands should cover the products the shopper actually sees for this
  // query, not accessory/related matches ranked below the fold (Qwen UX
  // panel v2: "options wrong" on laptop/TV typo queries).
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));
  const visible = (hits.length ? [...base].sort((a, b) => (b.score || 0) - (a.score || 0)) : base).slice(0, 300);
  // Bimodal guard: when the on-intent set mixes the real product with
  // same-word accessories (microwave ovens 10-14k + microwave covers 2k),
  // the quantiles span both - fall back to the dominant category's
  // on-intent subset when it is a clear majority.
  const intentVisible = visible.filter((h) => h.intent);
  let priceIntent = intentVisible;
  if (intentVisible.length >= 20) {
    const sp = intentVisible.map((h) => h.price).sort((a, b) => a - b);
    const spread = sp[Math.floor(0.75 * sp.length)] / Math.max(1, sp[Math.floor(0.25 * sp.length)]);
    // Dominant = MAX category, not first-inserted (catalogue-order
    // catCounts.keys().next() mis-targeted the bimodal fallback).
    let domCat = null, domN = 0;
    for (const [c, n] of catCounts) if (n > domN) { domN = n; domCat = c; }
    const domIntent = intentVisible.filter((h) => h.category === domCat);
    if (spread > 6 && domIntent.length >= 20 && domIntent.length / intentVisible.length >= 0.5) {
      priceIntent = domIntent;
    }
  }
  const intentPrices = priceIntent.map((h) => h.price).sort((a, b) => a - b);
  const intentPct = (p) => intentPrices.length ? intentPrices[Math.min(intentPrices.length - 1, Math.floor(p * intentPrices.length))] : 0;
  // Final bimodal guard: if the chosen on-intent subset is still bimodal
  // (p50 > 6x p25 - real laptops + laptop desks inside one department),
  // its quantiles span two price worlds; fall back to the all-visible
  // bands instead (Qwen UX panel v2: laptob allP bands are the A'd set).
  const iP25 = intentPct(0.25), iP50 = intentPct(0.5);
  return {
    n: hits.length,
    categories: top(catCounts, 4),
    brands: top(brandCounts, 4),
    priceP: { p25: pct(0.25), p50: pct(0.5), p75: pct(0.75) },
    pricePIntent: intentPrices.length >= 20 && !(iP25 > 0 && iP50 / iP25 > 6)
      ? { p25: iP25, p50: iP50, p75: intentPct(0.75) } : null,
    // G1: facet counts come from the top-300 candidates BY SCORE (the set
    // the shopper can actually see), not catalogue order.
    items: (hits.length ? [...base].sort((a, b) => (b.score || 0) - (a.score || 0)) : base).slice(0, 300),
    // G1: facet counts for question chips (candidate-set, not whole catalog)
    tagCounts: top(tagCounts, 12),
    priceMin: prices.length ? prices[0] : 0,
    priceMax: prices.length ? prices[prices.length - 1] : 0,
  };
}
