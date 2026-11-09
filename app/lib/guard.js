// §9 grounding guards (2026-11-08 update prompt, section 9).
//
//  - validateGuideQuestion: the exit guard for EVERY question decideGuide
//    emits (all tiers, plan-owned path included):
//      1. every option label exists in the intent-scoped view `iv` for its
//         kind (optionMatch semantics: case-insensitive, canonical mapping);
//      2. every option count equals a recount over the visible set (exact);
//      3. a chip question has >=2 options with count>0, else it is
//         downgraded to typed-only (options: []) — the typed escape always
//         survives;
//      4. no facet is re-asked (answered slots ∪ askedTypes ∪ trail chips);
//      5. facet eligibility: brand only when iv.brands has >=2; occasion-tag
//         options exclude the answered occasion plus gift|new|best|sale|
//         offer|deal;
//      6. on any violation -> typed-only fallback with reason "guard:<rule>"
//         and an in-process counter (surfaced in /api/ai-status + Insights).
//  - validateRecommendationRail: the recommendation runtime guard — every
//    rail item must carry a NAMED relation to its anchor (item or query):
//    same category, same non-empty brand, shared tag, or >=1 significant
//    shared query token (plus interest / in-band for their surfaces).
//    Failing items are dropped; if the rail falls below its minimum it is
//    hidden; drops bump an in-process counter (callers fire
//    rail_item_dropped).
//
// Pure module: no DOM, no fetch, no LLM — it runs server-side (decideGuide,
// the guide/ai-refine routes, canaries, guide_audit) and client-side
// (question-card recount, the rail builders).

import {
  CAT_DISPLAY, OCCASION_TAG, FESTIVAL_TAG,
  countBudget, forWhomOptions, sizeOptions, capacityOptions, optionMatch,
} from "./facets.js";
import { interestScore } from "./persona.js";

const G = globalThis;
const state = (G.__askcartGuardState ??= { fallbacks: 0, railDrops: 0 });
export function guardState() { return state; }
// §9 frozen spec: the stats alias used by /api/ai-status + Insights.
export const guardStats = guardState;

// §9: recount every option of a question over the given visible items -
// the single client/server recount used by the question card, the audit
// suites and the guard itself.
export function recountVisible(question, visibleItems) {
  const q = question || {};
  const opts = (q.optionCounts && q.optionCounts.length)
    ? q.optionCounts
    : (q.options || []).map((l) => ({ label: l, count: 0 }));
  return opts.map((o) => ({
    label: o.label,
    count: recountOption(o.kind || optionKind(q, o.label), o.label, visibleItems || []),
  }));
}

const ESCAPE_RE = /^(No preference|Not sure|Any|Unisex)/i;
export const GENERIC_TAG_RE = /^(gift|new|best|sale|offer|deal)$/i;
const CORE_OCC_TAGS = ["wedding", "birthday", "anniversary", "gift"];
// Lazy: guard.js and guide.js import each other; the guide.js consts are
// not initialized while this module evaluates, so no top-level reads.
const occSettledTags = () => new Set([...Object.values(OCCASION_TAG), ...Object.values(FESTIVAL_TAG), "party"]);
let displayToRawCache = null;
const displayToRaw = (label) => (displayToRawCache ??= Object.fromEntries(Object.entries(CAT_DISPLAY).map(([raw, disp]) => [disp, raw])))[label];

const isEscape = (label) => ESCAPE_RE.test(String(label));
export { isEscape };
const bandNums = (label) => (String(label).match(/[\d,]+/g) || [])
  .map((x) => parseInt(x.replace(/,/g, ""), 10)).filter((n) => n > 0);

const TYPE_SLOT = { brand: "brand", category: "category", occasion: "occasion",
                    budget: "budget", for_whom: "forWhom", size: "size", capacity: "capacity" };
const ANY_SUBTYPE_SLOT = { brands: "brand", tags: "occasion", bands: "budget" };

// Option kind for a question + option (drives both existence and recount).
export function optionKind(q, label) {
  const t = String(q.type || "");
  if (t === "any") {
    const st = String(q.subType || "");
    if (st === "brands") return "brand";
    if (st === "tags") return "tag";
    if (st === "bands") return "band";
    return "free";
  }
  // P3: a "budget" question carries band options — without this mapping the
  // recount fell to the default (0) and EVERY budget question's chips were
  // downgraded/mismatched (server count > 0 vs client recount 0).
  if (t === "budget") return "band";
  return t || "free";
}

function slotOf(q) {
  const t = String(q.type || "");
  if (TYPE_SLOT[t]) return TYPE_SLOT[t];
  if (t === "any") return ANY_SUBTYPE_SLOT[String(q.subType || "")] || null;
  return null;
}

// Single source of truth for option recounts — the tier ladder, the server
// guard and the client card recount all use these predicates, so server
// count == client count by construction.
// 2026-11-10: per-item predicate for each option kind. Every count (tier
// ladder, exit guard, client card recount) AND the post-click narrowing
// (page.applyAnswer) must select items with this ONE predicate: a chip's
// number is a promise about the visible set ("N products" badge), so
// clicking it must show exactly the items the predicate selects — the
// 48-slice fix (2026-11-09) aligned the displayed number with the visible
// set but the click still ran a CATALOG-WIDE re-search ("Pigeon 9" on a
// 150-product card returned all 109 catalogue Pigeon matches -> the meter
// lied: "150 → 109", "Pigeon · 109 of 150 left").
export function itemMatchesOption(kind, label, item) {
  const r = item || {};
  switch (kind) {
    case "brand":
      return (r.brand || "") === label;
    case "category": {
      const raw = displayToRaw(label) || label;
      return r.category === raw || r.category === label;
    }
    case "tag":
      return (r.tags || []).includes(label);
    case "band":
      return countBudget([r], 1, label) > 0;
    case "for_whom": {
      const fw = forWhomOptions([r], 1).find((o) => o.label.toLowerCase() === String(label).toLowerCase());
      return !!fw && fw.count > 0;
    }
    case "size": {
      const so = sizeOptions([r], 1).find((o) => o.label.toLowerCase() === String(label).toLowerCase());
      return !!so && so.count > 0;
    }
    case "capacity": {
      const co = capacityOptions([r], 1).find((o) => o.label.toLowerCase() === String(label).toLowerCase());
      return !!co && co.count > 0;
    }
    case "occasion": {
      if (label === "Everyday use") return !(r.tags || []).some((tg) => CORE_OCC_TAGS.includes(tg));
      const tag = OCCASION_TAG[label] || FESTIVAL_TAG[label] || (label === "Party / Event" ? "party" : null);
      return tag ? (r.tags || []).includes(tag) : false;
    }
    default:
      return false;
  }
}

export function recountOption(kind, label, items) {
  const n = (items || []).length;
  if (isEscape(label)) return n;
  return (items || []).filter((r) => itemMatchesOption(kind, label, r)).length;
}

// Rule 1: the label exists in the intent-scoped view for its kind.
function labelInIv(kind, label, iv) {
  if (isEscape(label)) return true;
  switch (kind) {
    case "brand":
      return !!optionMatch(label, (iv.brands || []).map((b) => b.name));
    case "category": {
      const names = (iv.categories || []).map((c) => c.name);
      return !!optionMatch(label, names) || !!optionMatch(label, names.map((n) => CAT_DISPLAY[n] || n));
    }
    case "tag":
      return (iv.tags || []).some((t) => t.name.toLowerCase() === String(label).toLowerCase());
    case "band": {
      const nums = bandNums(label);
      const maxPrice = (iv.items || []).reduce((a, r) => Math.max(a, r.price || 0), 0);
      return nums.length > 0 && nums.every((x) => x <= Math.max(maxPrice, 1));
    }
    case "for_whom": {
      const fw = forWhomOptions(iv.items, iv.n);
      const hit = fw.find((o) => o.label.toLowerCase() === String(label).toLowerCase());
      return !!hit && (isEscape(label) || hit.count > 0 || fw.length >= 3);
    }
    case "size":
      return sizeOptions(iv.items, iv.n).some((o) => o.label.toLowerCase() === String(label).toLowerCase());
    case "capacity":
      return capacityOptions(iv.items, iv.n).some((o) => o.label.toLowerCase() === String(label).toLowerCase());
    case "occasion": {
      if (label === "Everyday use") return true;
      const tag = OCCASION_TAG[label] || FESTIVAL_TAG[label] || (label === "Party / Event" ? "party" : null);
      if (!tag) return false;
      return (iv.tags || []).some((t) => t.name === tag && t.count > 0);
    }
    default:
      return true; // free/typed
  }
}

function guardFail(q, rule) {
  state.fallbacks += 1;
  return {
    ok: false,
    reason: "guard:" + rule,
    question: {
      ...q,
      options: [],
      optionCounts: [],
      reason: (q.reason ? q.reason + " " : "") + "[guard:" + rule + "]",
    },
  };
}

export function validateGuideQuestion(question, iv, visibleResults, answered = {}, askedTypes = []) {
  const q = { ...question };
  const types = new Set((askedTypes || []).map(String));
  const opts = (q.optionCounts && q.optionCounts.length)
    ? q.optionCounts
    : (q.options || []).map((l) => (typeof l === "string" ? { label: l, count: 0 } : l));
  const slot = slotOf(q);
  // Rule 4 — no facet re-ask (applies to typed-only questions too).
  if (slot && answered && answered[slot] != null) return guardFail(q, "reask");
  if (types.has(String(q.type))) return guardFail(q, "reask");
  if (String(q.type) === "any") {
    const st = String(q.subType || "");
    // 2026-11-10: any:typed is the chain's continuation (the typed answer
    // re-searches and re-grounds the next question), so it is re-askable;
    // data-sourced anys (tags/brands/bands) stay once per journey.
    if (st && st !== "typed" && types.has("any:" + st)) return guardFail(q, "reask");
    const subSlot = ANY_SUBTYPE_SLOT[st];
    if (subSlot && (answered && answered[subSlot] != null || types.has(subSlot))) return guardFail(q, "reask");
  }
  if (!q.options || q.options.length === 0) return { ok: true, question: q }; // typed-only survives
  const counts = [];
  let live = 0;
  for (const o of opts) {
    const label = o.label;
    const kind = optionKind(q, label);
    // Rule 1 — label exists in iv for its kind.
    if (!labelInIv(kind, label, iv)) return guardFail(q, "ungrounded");
    // Rule 5 — facet eligibility.
    if (kind === "brand" && (iv.brands || []).length < 2) return guardFail(q, "brand_elig");
    if (kind === "tag") {
      if (GENERIC_TAG_RE.test(String(label))) return guardFail(q, "generic_tag");
      if (answered && answered.occasion != null) {
        const tag = OCCASION_TAG[label] || FESTIVAL_TAG[label] || (label === "Party / Event" ? "party" : label);
        if (occSettledTags().has(tag)) return guardFail(q, "occasion_settled");
      }
    }
    if (kind === "occasion" && answered && answered.occasion != null &&
        (OCCASION_TAG[label] || FESTIVAL_TAG[label]) === String(answered.occasion).toLowerCase()) {
      return guardFail(q, "occasion_settled");
    }
    // Rule 2 — count equals a recount over the visible set (exact).
    const rc = recountOption(kind, label, visibleResults);
    if (rc !== (o.count || 0)) return guardFail(q, "count_mismatch");
    counts.push({ label, count: rc });
    if (!isEscape(label) && rc > 0) live += 1;
  }
  // Rule 3 — a chip question needs >=2 live options, else typed-only.
  // 2026-11-10: an open "any" refinement needs only >=1 — the typed
  // escape and the "Something else…" chip are always present, so one
  // grounded option is still a real narrowed-set question. (Small
  // worlds used to die into a bare input box: "shadi gift under 2000"
  // asked for-whom + size and then offered ZERO options at turn 3.)
  const minLive = String(q.type) === "any" ? 1 : 2;
  if (live < minLive) return guardFail(q, "thin");
  return { ok: true, question: { ...q, optionCounts: counts } };
}

// ---- recommendation rails -------------------------------------------------

function sharedQueryToken(item, query) {
  if (!query) return null;
  const toks = String(query).toLowerCase().match(/[a-z']{3,}/g) || [];
  if (!toks.length) return null;
  const hay = [item.title, item.category, item.brand, ...(item.tags || [])]
    .map((x) => String(x || "").toLowerCase()).join(" ");
  return toks.find((t) => hay.includes(t)) || null;
}

// The NAMED relation a rail item has to its anchor, or null (ungrounded).
export function itemRelation(item, anchor = {}) {
  const a = anchor.item;
  if (a) {
    if (item.category && a.category && item.category === a.category)
      return { name: "same_category", detail: a.category };
    if (item.brand && a.brand && item.brand === a.brand)
      return { name: "same_brand", detail: a.brand };
    const at = new Set((a.tags || []).map((x) => String(x).toLowerCase()));
    const sh = (item.tags || []).find((tg) => at.has(String(tg).toLowerCase()));
    if (sh) return { name: "shared_tag", detail: sh };
    const tok = sharedQueryToken(item, a.query);
    if (tok) return { name: "shared_token", detail: tok };
  }
  if (anchor.category && item.category === anchor.category)
    return { name: "same_category", detail: anchor.category };
  if (anchor.tag && (item.tags || []).includes(anchor.tag))
    return { name: "shared_tag", detail: anchor.tag };
  if (Array.isArray(anchor.band) && anchor.band.length) {
    // Inclusive bounds: the guard only DROPS items from an already
    // band-filtered rail, so a boundary item is never wrongly lost.
    const lo = anchor.band[0], hi = anchor.band[1];
    if ((lo == null || (item.price || 0) >= lo) && (hi == null || (item.price || 0) <= hi))
      return { name: "in_band", detail: anchor.bandLabel || "" };
  }
  if (anchor.interests && anchor.interests.length) {
    const isc = interestScore(item, anchor.interests, anchor.tokens || []);
    if (isc.matched && isc.matched.length) return { name: "interest", detail: isc.matched[0] };
    if (isc.score > 0) return { name: "interest_token", detail: (anchor.tokens || [])[0] || "" };
  }
  if (anchor.query) {
    const tok = sharedQueryToken(item, anchor.query);
    if (tok) return { name: "shared_token", detail: tok };
  }
  return null;
}

// §9 addendum: the rail runtime guard. Drops ungrounded items, hides a rail
// that falls below its minimum, bumps the in-process drop counter.
// mode "history" (recently viewed) is a rail-LEVEL named relation (the
// shopper's own history) — items pass by construction; mode "tile"
// (home category/occasion/budget tiles) validates tile integrity.
export function validateRecommendationRail(items, anchor = {}, opts = {}) {
  const { surface = "rail", mode = "item", min = 2, max = null } = opts;
  let kept = [];
  let dropped = 0;
  const reasons = new Set();
  for (const it of items || []) {
    if (!it || !it.sku) { dropped += 1; continue; }
    if (mode === "history") { kept.push(it); continue; }
    if (mode === "tile") {
      if (it && (it.name || it.label || it.q)) { kept.push(it); reasons.add("tile"); }
      else dropped += 1;
      continue;
    }
    const rel = itemRelation(it, anchor);
    if (rel) { kept.push(it); if (rel.detail) reasons.add(rel.name + ":" + rel.detail); }
    else dropped += 1;
  }
  if (dropped) state.railDrops += dropped;
  if (max) kept = kept.slice(0, max);
  // The NAMED relation the rail stands on (first kept item; rail-level
  // relations for history/tile modes).
  let relation = null;
  if (kept.length) {
    if (mode === "history") relation = "history";
    else if (mode === "tile") relation = "tile";
    else relation = (itemRelation(kept[0], anchor) || { name: "pass" }).name;
  }
  return { items: kept, relation, dropped, hidden: kept.length < min, min, reasons: [...reasons] };
}
