// O2: language support via static tables (no LLM). English / Hindi / Hinglish.
// Scope per brief: question text, option labels, hero copy. `lang` attr +
// analytics carry the language; everything else stays English (documented
// in PROJECT.md §12).
const STRINGS = {
  en: {
    heroTitle: 'Tell us what you need — in your own words.',
    heroSub: 'Try English, Hindi or Hinglish. We ask one quick question only if we need it.',
    searchPlaceholder: 'Try: "shaadi gift under 2k"',
    refinePlaceholder: 'Refine or ask again: "wristwatch for dad under 5k"',
    popular: 'Popular:',
    strip: 'Optional: set your pincode & language for better results',
    setNow: 'Set',
    stripLang: 'Language',
    stripPin: 'Delivery pincode (optional)',
    pinHint: '6 digits — used for regional festivals & demo delivery estimate only',
    use: 'Use',
    skip: 'Skip for now',
    qEyebrow: 'Quick question',
    qOptional: 'Optional refinement',
    qReady: '— the results below are ready to shop',
    whyAsk: 'Why we ask',
    skipQuestion: 'Skip',
    orType: 'Or type it: e.g. under 1800, Titan, for my sister',
    send: 'Send',
    notSure: 'Not sure / flexible',
    noPref: 'No preference - best rated',
    qBudget: 'Got it - what budget should I keep in mind?',
    qOccasion: 'Quick one: what\'s the occasion?',
    qCategory: 'I can point you better - which of these are you after?',
    qBrand: 'Any brand preference? Or I\'ll pick the best-rated ones.',
    occGift: 'Gift', occBirthday: 'Birthday', occWedding: 'Wedding / Shaadi',
    occAnniversary: 'Anniversary', occFestival: 'Festival', occEveryday: 'Everyday use',
    under: 'Under',
  },
  hi: {
    heroTitle: 'अपनी ज़रूरत अपनी भाषा में बताइए।',
    heroSub: 'हिंदी, Hinglish या English में search करें। ज़रूरत पड़ी तो हम एक ही सवाल पूछते हैं।',
    searchPlaceholder: 'जैसे: "शादी के लिए 2000 तक का गिफ्ट"',
    refinePlaceholder: 'जैसे: "पापा के लिए 5000 तक की घड़ी"',
    popular: 'लोकप्रिय:',
    strip: 'वैकल्पिक: बेहतर results के लिए pincode & भाषा सेट करें',
    setNow: 'सेट करें',
    stripLang: 'भाषा',
    stripPin: 'डिलीवरी पिनकोड (वैकल्पिक)',
    pinHint: '6 अंक — सिर्फ regional festivals और demo delivery estimate के लिए',
    use: 'उपयोग करें',
    skip: 'अभी छोड़ें',
    qEyebrow: 'एक जल्दी सवाल',
    qOptional: 'इच्छा हो तो refine करें',
    qReady: '— नीचे results तैयार हैं',
    whyAsk: 'क्यों पूछ रहे हैं',
    skipQuestion: 'छोड़ें',
    orType: 'या type करें: जैसे 1800 तक, Titan, बहन के लिए',
    send: 'भेजें',
    notSure: 'पक्का नहीं / जो अच्छा लगे',
    noPref: 'कोई फ़र्क नहीं — ज़्यादा rated दिखाइए',
    qBudget: 'समझ गए — budget कितना रखें?',
    qOccasion: 'छोटा सा सवाल: मौक़ा क्या है?',
    qCategory: 'बेहतर सुझाव दे सकता हूँ — इनमें से क्या चाहिए?',
    qBrand: 'कोई brand preference है? नहीं तो सबसे rated दिखाऊँगा।',
    occGift: 'उपहार', occBirthday: 'जन्मदिन', occWedding: 'शादी',
    occAnniversary: 'ब्याह वर्ष', occFestival: 'त्योहार', occEveryday: 'रोज़ाना का काम',
    under: '₹',
  },
  hinglish: {
    heroTitle: 'Jo chahiye, apne words mein bataiye.',
    heroSub: 'Hindi, Hinglish ya English — kaise bhi search kijiye. Zarurat padhi toh bas ek quick question.',
    searchPlaceholder: 'Jaise: "shaadi gift 2000 tak"',
    refinePlaceholder: 'Jaise: "papa ke liye 5000 tak ki ghadi"',
    popular: 'Popular:',
    strip: 'Optional: better results ke liye pincode & language set kijiye',
    setNow: 'Set kijiye',
    stripLang: 'Language',
    stripPin: 'Delivery pincode (optional)',
    pinHint: '6 digits — sirf regional festivals aur demo delivery estimate ke liye',
    use: 'Use kijiye',
    skip: 'Abhi nahi',
    qEyebrow: 'Ek quick sawaal',
    qOptional: 'Chahiye toh refine kijiye',
    qReady: '— neeche results ready hain',
    whyAsk: 'Kyu pooch rahe hain',
    skipQuestion: 'Skip',
    orType: 'Ya type kijiye: jaise 1800 tak, Titan, behn ke liye',
    send: 'Bhejiye',
    notSure: 'Pakka nahi / jo achha lage',
    noPref: 'Koi farket nahi — best rated dikhao',
    qBudget: 'Samajh gaye — budget kitna rakhun?',
    qOccasion: 'Chhota sa sawaal: kaisa mauka hai?',
    qCategory: 'Achha point kar sakta hoon — inme se kya chahiye?',
    qBrand: 'Koi brand preference? Nahi toh best-rated dikhata hoon.',
    occGift: 'Gift', occBirthday: 'Birthday', occWedding: 'Shaadi',
    occAnniversary: 'Anniversary', occFestival: 'Tyohaar', occEveryday: 'Everyday use',
    under: '₹',
  },
};

export function t(lang, key, vars) {
  const table = STRINGS[lang] || STRINGS.en;
  let str = table[key] !== undefined ? table[key] : STRINGS.en[key];
  if (vars && typeof str === "string") {
    for (const [k, v] of Object.entries(vars)) str = str.split("{" + k + "}").join(String(v));
  }
  return str;
}

// Occasion option labels per language (fixed vocabulary, maps 1:1 to tags).
export function occasionLabel(lang, occ) {
  const map = {
    en: { gift: 'occGift', birthday: 'occBirthday', wedding: 'occWedding',
          anniversary: 'occAnniversary', festival: 'occFestival', everyday: 'occEveryday' },
    hi: { gift: 'occGift', birthday: 'occBirthday', wedding: 'occWedding',
          anniversary: 'occAnniversary', festival: 'occFestival', everyday: 'occEveryday' },
    hinglish: { gift: 'occGift', birthday: 'occBirthday', wedding: 'occWedding',
          anniversary: 'occAnniversary', festival: 'occFestival', everyday: 'occEveryday' },
  };
  return t(lang, map[lang] ? map[lang][occ] || 'occGift' : 'occGift');
}

export function budgetLabel(lang, text) {
  // "Under ₹1,500" -> hi "₹1,500 से कम"; range labels keep numbers, Hindi joins.
  const m = String(text).match(/Under (\S+)/);
  if (m) {
    if (lang === 'hi') return `${m[1]} से कम`;
    if (lang === 'hinglish') return `${m[1]} tak`;
    return text;
  }
  return text;
}

export const LANGS = ['en', 'hi', 'hinglish'];
