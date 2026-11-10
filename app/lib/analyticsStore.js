// AskCart product-analytics store.
//
// Shared, deployment-wide: every user of this deployment writes to the same
// state (that is the point of the public dashboard). Singleton on globalThis
// so Next dev HMR and route imports share one instance.
//
// State:
//  - events: ring buffer, last 500 (live feed)
//  - counts: all-time per-type counters
//  - totals: funnel + outcome counters
//  - queries: per-query rollups (searches, nulls, resolved, turns, views, carts, orders)
//  - guide: per-question-type rollups
//  - cats / brands: engagement rollups
//  - cohorts: persona-cohort rollups
//  - orders: last 50 orders
// Persisted as JSON (snapshot) so history survives restarts; the sim harness
// writes to a separate file (env "sim") and a separate in-memory store.

import fs from "fs";
import path from "path";
import { kvEnabled, kvGet, kvSet } from "./kv.js";

const MAX_EVENTS = 500;
const MAX_ORDERS = 50;
const MAX_MAP = 500; // cap on keys per rollup map (drop oldest-ish by count)

function file(env) {
  return path.join(process.cwd(), env === "sim" ? ".analytics-state.sim.json" : ".analytics-state.json");
}

// Section 2 (2026-11-08): slim append-only JSONL event log powering the
// Overview range windows (Last hour / Last 24h). One compact line per
// event (~120 B); rotated to the last 7 days past 1.5 MB so the file
// stays bounded. The state snapshot stays the all-time source of truth;
// the log is best-effort (a failed append never breaks recording).
const LOG_MAX_BYTES = 1.5 * 1024 * 1024;
const LOG_KEEP_MS = 7 * 86400000;
function logFile(env) {
  return path.join(process.cwd(), env === "sim" ? ".analytics-events.sim.jsonl" : ".analytics-events.jsonl");
}
function logLine(type, p) {
  const o = { t: Date.now(), type };
  if (p.session_id) o.s = String(p.session_id).slice(0, 40);
  if (p.query) o.q = String(p.query).slice(0, 60);
  if (p.category) o.c = String(p.category).slice(0, 40);
  if (p.brand) o.b = String(p.brand).slice(0, 40);
  if (p.sku) o.k = String(p.sku).slice(0, 40);
  if (p.total !== undefined) o.v = Number(p.total) || 0;
  if (p.source) o.src = String(p.source).slice(0, 24);
  if (p.n_results !== undefined) o.n = Number(p.n_results) || 0;
  if (p.turn) o.tr = Number(p.turn) || 0;
  // §9 guided-grounding fields (frozen compact shape): qt=question type,
  // nv=n_visible, zc=zero_count_options, sf=rail surface, rn=rail/guard
  // reason; guide_option_mismatch reuses o.c (option) / o.v (client) /
  // o.n (server) so no new keys are added for it.
  if (type === "guide_question") {
    if (p.type !== undefined && p.type !== "") o.qt = String(p.type).slice(0, 24);
    if (p.n_visible !== undefined) o.nv = Number(p.n_visible) || 0;
    if (p.zero_count_options !== undefined) o.zc = Number(p.zero_count_options) || 0;
    if (p.reason) o.rn = String(p.reason).slice(0, 24);
  } else if (type === "guide_option_mismatch") {
    if (p.option) o.c = String(p.option).slice(0, 40);
    if (p.client_count !== undefined) o.v = Number(p.client_count) || 0;
    if (p.server_count !== undefined) o.n = Number(p.server_count) || 0;
  } else if (type === "rail_item_dropped") {
    if (p.surface) o.sf = String(p.surface).slice(0, 24);
    if (p.reason) o.rn = String(p.reason).slice(0, 24);
  }
  return JSON.stringify(o);
}
function appendLog(type, p, env) {
  try {
    const f = logFile(env);
    fs.appendFileSync(f, logLine(type, p) + "\n");
    if (fs.statSync(f).size > LOG_MAX_BYTES) {
      const cutoff = Date.now() - LOG_KEEP_MS;
      const keep = fs.readFileSync(f, "utf8").split("\n").filter((ln) => {
        if (!ln) return false;
        try { return JSON.parse(ln).t >= cutoff; } catch { return false; }
      });
      fs.writeFileSync(f + ".tmp", keep.join("\n") + (keep.length ? "\n" : ""));
      fs.renameSync(f + ".tmp", f);
    }
  } catch { /* best effort */ }
}
const logCache = (globalThis.__askcartLogCache ??= new Map()); // env -> {mtime, lines}
function readLog(env) {
  try {
    const f = logFile(env);
    const m = fs.statSync(f).mtimeMs;
    const hit = logCache.get(env);
    if (hit && hit.mtime === m) return hit.lines;
    const lines = fs.readFileSync(f, "utf8").split("\n").filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    if (logCache.size > 8) logCache.clear();
    logCache.set(env, { mtime: m, lines });
    return lines;
  } catch { return []; }
}

// Vercel can't write the JSONL file (read-only cwd), so range windows fall
// back to the shared 500-event ring (it is globally synced when Redis is on).
function ringLines(env) {
  const st = load(env);
  return (st.events || []).map((e) => {
    const p = e.payload || {};
    const o = { t: e.at, type: e.type };
    if (p.session_id) o.s = String(p.session_id).slice(0, 40);
    if (p.query) o.q = String(p.query).slice(0, 60);
    if (p.category) o.c = String(p.category).slice(0, 40);
    if (p.brand) o.b = String(p.brand).slice(0, 40);
    if (p.sku) o.k = String(p.sku).slice(0, 40);
    if (p.total !== undefined) o.v = Number(p.total) || 0;
    if (p.source) o.src = String(p.source).slice(0, 24);
    if (p.n_results !== undefined) o.n = Number(p.n_results) || 0;
    if (p.turn) o.tr = Number(p.turn) || 0;
    return o;
  });
}

// ---------------- shared KV sync (Upstash) ----------------
// The snapshot is the all-time source of truth. On Vercel every instance
// starts empty, so the first read hydrates from the shared store and every
// burst of events pushes a debounced snapshot back. If two instances write
// concurrently, the snapshot with the newer lastEventAt wins; the live event
// ring is unioned either way so the dashboard feed never loses events.
// Everything fails open — Redis problems must never break recording.

const hydrated = {};

function stateKey(env) {
  return "askcart:state:" + (env === "sim" ? "sim" : "public");
}

function lastEventAt(st) {
  const evs = st && st.events ? st.events : [];
  return evs.length ? evs[evs.length - 1].at : 0;
}

function isFreshState(st) {
  const t = st && st.totals;
  return !st || !t || (!t.searches && !t.orders && !t.onboardingDone);
}

function unionEvents(a, b) {
  const seen = new Set();
  const out = [];
  for (const src of [a, b]) {
    for (const e of (src && src.events) || []) {
      const p = e.payload || {};
      const k = e.at + "|" + e.type + "|" + (p.session_id || "") + "|" + (p.query || "");
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e);
    }
  }
  out.sort((x, y) => x.at - y.at);
  return out.slice(-MAX_EVENTS);
}

function adoptInto(st, saved) {
  const ours = (st.events || []).slice();
  Object.assign(st, saved);
  st.totals = { ...fresh().totals, ...(st.totals || {}) };
  st.outcome = { ...fresh().outcome, reasons: {}, ...(st.outcome || {}) };
  st.outcome.reasons = { ...(st.outcome.reasons || {}) };
  st.events = unionEvents({ events: ours }, { events: saved.events || [] });
  st.orders = (st.orders || []).slice(-MAX_ORDERS);
  sanitize(st);
}

async function hydrate(env) {
  const key = env === "sim" ? "sim" : "public";
  if (!kvEnabled() || hydrated[key]) return;
  hydrated[key] = true;
  try {
    const raw = await kvGet(stateKey(env));
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== "object") return;
    const st = load(env);
    if (isFreshState(st) || lastEventAt(saved) > lastEventAt(st)) {
      adoptInto(st, saved);
      persist(st, env);
    }
  } catch { /* start fresh */ }
}

async function syncToRedis(st, env) {
  if (!kvEnabled()) return;
  try {
    const raw = await kvGet(stateKey(env));
    let remote = null;
    if (raw) { try { remote = JSON.parse(raw); } catch { remote = null; } }
    if (remote && !isFreshState(remote)) {
      const remoteNewer = lastEventAt(remote) > lastEventAt(st);
      if (remoteNewer) adoptInto(st, remote);
      else st.events = unionEvents(st, remote);
    }
    await kvSet(stateKey(env), JSON.stringify(st));
  } catch { /* fail open */ }
}

// Aggregate one [from, to] window from the JSONL log. Pure function of
// the log: counts per type, unique sessions, order value, top lists,
// per-bucket activity, and the assistant-adoption session predicates.
export async function windowStats(fromMs, toMs, env = null) {
  const fileLines = readLog(env);
  const lines = (fileLines.length ? fileLines : ringLines(env)).filter((l) => l.t >= fromMs && l.t <= toMs);
  const types = {};
  const sessions = new Set();
  const qMap = new Map(), cMap = new Map(), kMap = new Map(), srcMap = new Map();
  const chatSids = new Set(), msgSids = new Set(), journeySids = new Set(),
        cartSids = new Set(), orderSids = new Set();
  let orderValue = 0, orderCount = 0, searches = 0;
  for (const l of lines) {
    types[l.type] = (types[l.type] || 0) + 1;
    if (l.s) {
      sessions.add(l.s);
      if (l.type === "chat_open") chatSids.add(l.s);
      if (l.type === "chat_user_message") msgSids.add(l.s);
      if (l.type === "journey_end") journeySids.add(l.s);
      if (l.type === "chat_add_to_cart") cartSids.add(l.s);
      if (l.type === "order_complete") orderSids.add(l.s);
    }
    if (l.type === "search_results") searches += 1;
    if (l.type === "order_complete") { orderCount += 1; orderValue += l.v || 0; }
    if (l.q) qMap.set(l.q, (qMap.get(l.q) || 0) + 1);
    if (l.c) cMap.set(l.c, (cMap.get(l.c) || 0) + 1);
    if (l.k) kMap.set(l.k, (kMap.get(l.k) || 0) + 1);
    if (l.src) srcMap.set(l.src, (srcMap.get(l.src) || 0) + 1);
  }
  const span = Math.max(1, toMs - fromMs);
  const buckets = span <= 3600000 ? 60 : span <= 86400000 ? 24 : 28;
  const size = span / buckets;
  const activity = Array.from({ length: buckets }, () => 0);
  for (const l of lines) {
    const i = Math.max(0, Math.min(buckets - 1, Math.floor((l.t - fromMs) / size)));
    activity[i] += 1;
  }
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));
  const journeysWithChat = [...msgSids].filter((s) => journeySids.has(s)).length;
  // §9: guided-question health (last-window, from the JSONL log):
  // questions asked, % options with zero count, % zero-narrowing turns
  // (consecutive same-session/same-query n_visible that did not drop),
  // client/server option mismatches, rail item drops.
  const gh = { asked: 0, zeroCountOpts: 0, narrowPairs: 0, zeroNarrow: 0, mismatches: 0, railDrops: 0 };
  const nvisSeq = new Map(); // "s\u0000q" -> [[tr, nv], ...]
  for (const l of lines) {
    if (l.type === "guide_question") {
      gh.asked += 1;
      if (l.zc > 0) gh.zeroCountOpts += 1;
      const k = (l.s || "?") + "\u0000" + (l.q || "?");
      if (!nvisSeq.has(k)) nvisSeq.set(k, []);
      nvisSeq.get(k).push([l.tr || 0, l.nv || 0]);
    } else if (l.type === "guide_option_mismatch") gh.mismatches += 1;
    else if (l.type === "rail_item_dropped") gh.railDrops += 1;
  }
  for (const seq of nvisSeq.values()) {
    for (let i = 1; i < seq.length; i++) {
      if (seq[i][0] > seq[i - 1][0]) {
        gh.narrowPairs += 1;
        if (seq[i][1] >= seq[i - 1][1]) gh.zeroNarrow += 1;
      }
    }
  }
  return {
    spanMs: span,
    events: lines.length,
    types,
    sessions: sessions.size,
    searches,
    productViews: (types.product_view || 0) + (types.product_impression || 0),
    cartAdds: types.add_to_cart || 0,
    buyNow: (types.buy_now || 0) + (types.buy_now_click || 0),
    checkouts: types.checkout_start || 0,
    orders: orderCount,
    orderValue,
    chatOpens: types.chat_open || 0,
    chatMsgs: types.chat_user_message || 0,
    chatAdds: types.chat_add_to_cart || 0,
    chatOpenRate: sessions.size ? +((100 * chatSids.size) / sessions.size).toFixed(1) : null,
    journeysWithChatPct: journeySids.size ? +((100 * journeysWithChat) / journeySids.size).toFixed(1) : null,
    chatAssistedOrders: [...cartSids].filter((s) => orderSids.has(s)).length,
    chatSources: top(srcMap, 12),
    topQueries: top(qMap, 10),
    topCats: top(cMap, 10),
    topSkus: top(kMap, 10),
    activity,
    guideHealth: {
      asked: gh.asked,
      zeroCountPct: gh.asked ? +((100 * gh.zeroCountOpts) / gh.asked).toFixed(1) : null,
      zeroNarrowPct: gh.narrowPairs ? +((100 * gh.zeroNarrow) / gh.narrowPairs).toFixed(1) : null,
      mismatches: gh.mismatches,
      railDrops: gh.railDrops,
    },
  };
}

function fresh() {
  return {
    startedAt: Date.now(),
    counts: {},
    totals: {
      searches: 0, zeroResults: 0, resolved: 0, unresolved: 0,
      productsViewed: 0, cartAdds: 0, cartViews: 0, buyNow: 0,
      checkouts: 0, orders: 0, orderValue: 0,
      onboardingDone: 0, onboardingSkipped: 0,
      filterApplies: 0, recommendationClicks: 0,
      journeysTotal: 0, journeyMsSum: 0, journeyMsN: 0,
      guideRefines: 0, guideRescues: 0, ttfcSum: 0, ttfcN: 0,
      multiJourneySessions: 0,
    },
    events: [],
    queries: {},
    guide: {},
    cats: {},
    brands: {},
    cohorts: {},
    orders: [],
    filters: {},
    onboarding: {},
    sessions: {},
    journeys: { t1: 0, t2: 0, t3: 0, t4: 0, unresolved: 0 },
    // G12: outcome micro-survey rollup (all-time, survives the 500-event ring)
    outcome: { yes: 0, no: 0, reasons: {} },
    // Section 2 (2026-11-08): per-SKU engagement, onboarding interests,
    // chat entry-point sources (range-window + Overview dashboard inputs)
    products: {},
    interests: {},
    chatSources: {},
  };
}

function bump(map, key, fields) {
  if (!map[key]) map[key] = { searches: 0, nulls: 0, resolved: 0, turnsSum: 0, turnsN: 0, views: 0, carts: 0, orders: 0, orderValue: 0, questions: {}, options: {} };
  for (const [k, v] of Object.entries(fields)) {
    if (k === "questions" || k === "options") continue;
    map[key][k] = (map[key][k] || 0) + v;
  }
  return map[key];
}

function touchSession(st, sid, first = {}) {
  if (!sid || !/^s_[a-z0-9]{6,40}$/i.test(String(sid))) return null;
  const id = String(sid).slice(0, 40);
  const now = Date.now();
  const sj = st.sessions[id] || { journeys: 0, firstAt: now, lastAt: now, searches: 0,
    questions: 0, answers: 0, skips: 0, views: 0, carts: 0, checkouts: 0,
    orders: 0, orderValue: 0, persona: null, buyNow: 0, interests: null,
    ai: { llm: 0, gemini: 0, rules: 0, switches: 0 },
    chat: { opens: 0, msgs: 0, adds: 0 } };
  if (!sj.firstAt) sj.firstAt = now;
  sj.lastAt = now;
  st.sessions[id] = sj;
  return sj;
}

function capMap(map) {
  const keys = Object.keys(map);
  if (keys.length <= MAX_MAP) return;
  keys.sort((a, b) => map[a].searches - map[b].searches);
  for (const k of keys.slice(0, keys.length - MAX_MAP)) delete map[k];
}

function sanitize(st) {
  // Defense against a stale/corrupted persisted snapshot: every counter is
  // non-negative and sub-funnel counters can never exceed their parent.
  const t = st.totals;
  for (const k of Object.keys(t)) {
    if (!Number.isFinite(t[k]) || t[k] < 0) t[k] = 0;
  }
  t.zeroResults = Math.min(t.zeroResults, t.searches);
  t.resolved = Math.min(t.resolved, t.searches);
  t.unresolved = Math.min(t.unresolved, t.searches);
  t.orders = Math.min(t.orders, t.checkouts);
  t.checkouts = Math.min(t.checkouts, t.cartAdds);
  t.multiJourneySessions = Math.max(0, Math.min(t.multiJourneySessions, t.journeysTotal));
  st.outcome.yes = Math.max(0, Math.round(st.outcome.yes || 0));
  st.outcome.no = Math.max(0, Math.round(st.outcome.no || 0));
  for (const k of Object.keys(st.outcome.reasons)) {
    if (!Number.isFinite(st.outcome.reasons[k]) || st.outcome.reasons[k] < 0) delete st.outcome.reasons[k];
  }
  return st;
}

function load(env) {
  const g = globalThis;
  const key = env === "sim" ? "__askcartAnalyticsSim" : "__askcartAnalytics";
  if (g[key]) return g[key];
  const st = fresh();
  try {
    const saved = JSON.parse(fs.readFileSync(file(env), "utf8"));
    Object.assign(st, saved);
    st.totals = { ...fresh().totals, ...(st.totals || {}) };
    st.outcome = { ...fresh().outcome, reasons: {}, ...(st.outcome || {}) };
    st.outcome.reasons = { ...(st.outcome.reasons || {}) };
    st.events = (st.events || []).slice(-MAX_EVENTS);
    st.orders = (st.orders || []).slice(-MAX_ORDERS);
    sanitize(st);
  } catch { /* first boot */ }
  g[key] = st;
  return st;
}

let saveTimer = {};
function persist(st, env) {
  const envKey = env || "public";
  if (saveTimer[envKey]) return;
  saveTimer[envKey] = setTimeout(() => {
    saveTimer[envKey] = null;
    try {
      // atomic write: temp file + rename, so a crash can't leave a torn
      // (partially-written) state file behind
      const target = file(env);
      const tmp = target + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(st));
      fs.renameSync(tmp, target);
    } catch { /* best effort */ }
  }, 500);
}

export async function record(type, payload = {}, env = null) {
  const st = load(env);
  if (!st.outcome) st.outcome = { yes: 0, no: 0, reasons: {} }; // hot-reload safety
  const ev = { type, at: Date.now(), payload };
  st.events.push(ev);
  if (st.events.length > MAX_EVENTS) st.events.shift();
  st.counts[type] = (st.counts[type] || 0) + 1;

  const p = payload || {};
  appendLog(type, p, env); // Section 2: range-window log (best effort)
  const T = st.totals;
  const qk = String(p.query || "").slice(0, 80);
  const sj = p.session_id ? touchSession(st, p.session_id) : null;
  switch (type) {
    case "search_results":
      T.searches++;
      if (sj) sj.searches += 1;
      if (qk) bump(st.queries, qk, { searches: 1, turnsSum: p.turn || 1, turnsN: 1 });
      break;
    case "zero_result":
      T.zeroResults++;
      if (qk) bump(st.queries, qk, { nulls: 1 });
      break;
    case "resolved":
      T.resolved++;
      if (qk) bump(st.queries, qk, { resolved: 1 });
      // turn-bucket distribution is owned by journey_end (one per journey)
      break;
    case "unresolved":
      T.unresolved++;
      if (qk) bump(st.queries, qk, {});
      break;
    case "journey_end":
      T.journeysTotal++;
      // single source of truth for the journey turn distribution
      if (p.resolved) {
        if (p.turns <= 2) st.journeys.t1 += p.turns === 1 ? 1 : 0, st.journeys.t2 += p.turns === 2 ? 1 : 0;
        else if (p.turns === 3) st.journeys.t3++;
        else st.journeys.t4++;
      } else {
        st.journeys.unresolved++;
      }
      if (Number(p.ms) > 0) { T.journeyMsSum += Number(p.ms); T.journeyMsN++; }
      if (p.session_id) {
        const sid = String(p.session_id).slice(0, 40);
        const sj2 = st.sessions[sid] || { journeys: 0 };
        sj2.journeys++;
        st.sessions[sid] = sj2;
        if (sj2.journeys === 2) T.multiJourneySessions++;
      }
      // per-query: resolution + turns only (views/carts/orders are counted
      // by the individual events to avoid double counting)
      if (qk) {
        const q = bump(st.queries, qk, { turnsSum: p.turns || 1, turnsN: 1 });
        if (p.resolved) q.resolved++;
      }
      if (p.cohort) {
        const c = bump(st.cohorts, String(p.cohort).slice(0, 60), { searches: 1 });
        if (p.added_to_cart) c.carts++;
        if (p.ordered) c.orders++;
        if (p.resolved) c.resolved++;
        if (Number(p.ms) > 0) { c.msSum = (c.msSum || 0) + Number(p.ms); c.msN = (c.msN || 0) + 1; }
      }
      break;
    case "guide_question_shown":
      if (sj) sj.questions += 1;
      if (p.refine) T.guideRefines++; else T.guideRescues++;
      if (p.question_type) {
        const g = bump(st.guide, String(p.question_type).slice(0, 40), { searches: 1 });
        g.questions[p.question_type] = (g.questions[p.question_type] || 0) + 1;
      }
      break;
    case "guide_option_selected":
      if (sj) sj.answers += 1;
      if (Number(p.ttfc_ms) > 0) { T.ttfcSum += Number(p.ttfc_ms); T.ttfcN++; }
      if (p.question_type) {
        const g = bump(st.guide, String(p.question_type).slice(0, 40), {});
        g.options[p.option] = (g.options[p.option] || 0) + 1;
      }
      break;
    case "guide_typed_answer":
      if (sj) sj.answers += 1;
      break;
    case "guide_skipped":
      if (sj) sj.skips += 1;
      break;
    case "product_impression": case "product_view": // B4: renamed, legacy alias kept
      T.productsViewed++;
      if (sj) sj.views += 1;
      if (qk) bump(st.queries, qk, { views: 1 });
      if (p.category) bump(st.cats, String(p.category).slice(0, 60), { views: 1 });
      if (p.brand) bump(st.brands, String(p.brand).slice(0, 40), { views: 1 });
      if (p.sku) {
        const pr = bump(st.products, String(p.sku).slice(0, 40), { views: 1 });
        if (!pr.title) {
          pr.title = String(p.title || "").slice(0, 60) || null;
          pr.category = String(p.category || "").slice(0, 40) || null;
          pr.brand = String(p.brand || "").slice(0, 40) || null;
          pr.price = Number.isFinite(Number(p.price)) ? Number(p.price) : null;
        }
      }
      break;
    case "add_to_cart":
      T.cartAdds++;
      if (sj) sj.carts += 1;
      if (qk) bump(st.queries, qk, { carts: 1 });
      if (p.category) bump(st.cats, String(p.category).slice(0, 60), { carts: 1 });
      if (p.brand) bump(st.brands, String(p.brand).slice(0, 40), { carts: 1 });
      break;
    case "cart_view": T.cartViews++; break;
    case "buy_now": case "buy_now_click":
      T.buyNow++;
      if (sj) sj.buyNow += 1;
      break;
    case "checkout_start":
      T.checkouts++;
      if (sj) sj.checkouts += 1;
      break;
    case "order_complete": {
      T.orders++;
      T.orderValue += Number(p.total) || 0;
      if (sj) { sj.orders += 1; sj.orderValue += Number(p.total) || 0; }
      if (qk) bump(st.queries, qk, { orders: 1, orderValue: Number(p.total) || 0 });
      st.orders.push({
        id: p.order_id, at: Date.now(), items: p.item_count, total: Number(p.total) || 0,
        cohort: p.cohort || "no-persona", source: p.source || "cart",
      });
      if (st.orders.length > MAX_ORDERS) st.orders.shift();
      break;
    }
    case "onboarding_complete":
      T.onboardingDone++;
      if (sj && p.forWhom) sj.persona = String(p.forWhom) + (p.shopStyle ? "|" + p.shopStyle : "");
      if (sj && Array.isArray(p.interests)) sj.interests = p.interests.map(String).slice(0, 8);
      for (const f of ["userType", "spendStyle", "context"]) {
        if (p[f]) bump(st.onboarding, String(f + ":" + p[f]).slice(0, 80), { searches: 1 });
      }
      if (Array.isArray(p.interests)) {
        for (const i of p.interests.slice(0, 8)) bump(st.interests, String("interests:" + i).slice(0, 80), { searches: 1 });
      }
      break;
    case "onboarding_skipped": T.onboardingSkipped++; break;
    case "ai_call":
      if (sj) {
        if (p.via === "gemini") sj.ai.gemini += 1;
        else if (p.via === "rules" || p.via === "cache") sj.ai.rules += 1;
        else sj.ai.llm += 1;
      }
      break;
    case "ai_key_exhausted":
      if (sj) sj.ai.switches += 1;
      break;
    case "chat_open":
      if (sj) sj.chat.opens += 1;
      if (p.source) bump(st.chatSources, String("src:" + p.source).slice(0, 60), { searches: 1 });
      break;
    case "chat_user_message":
      if (sj) sj.chat.msgs += 1;
      break;
    case "chat_add_to_cart":
      if (sj) sj.chat.adds += 1;
      break;
    case "outcome_feedback":
      if (p.value === "yes") st.outcome.yes++;
      else if (p.value === "no") {
        st.outcome.no++;
        const rk = String(p.reason).slice(0, 40);
        if (p.reason) st.outcome.reasons[rk] = (st.outcome.reasons[rk] || 0) + 1;
      }
      break;
    case "filter_applied":
      T.filterApplies++;
      if (p.filter_type && p.value !== undefined) {
        bump(st.filters, String(p.filter_type + ":" + p.value).slice(0, 80), { searches: 1 });
      }
      break;
    case "recommendation_click":
      T.recommendationClicks++;
      if (p.brand) bump(st.brands, String(p.brand).slice(0, 40), { recClicks: 1 });
      break;
    default: break;
  }

  capMap(st.queries); capMap(st.guide); capMap(st.cats); capMap(st.brands); capMap(st.cohorts); capMap(st.filters); capMap(st.sessions);
  capMap(st.products); capMap(st.interests); capMap(st.chatSources);
  persist(st, env);
  // Awaited: Vercel suspends the instance as soon as the response is sent,
  // so a fire-and-forget sync would be killed mid-write and the shared
  // snapshot would never advance (2026-11-10 diagnosis). syncToRedis is
  // internally fail-open — it never throws.
  if (kvEnabled()) await syncToRedis(st, env);
  return ev;
}

export async function snapshot(env = null) {
  await hydrate(env);
  const st = load(env);
  const T = st.totals;
  const funnel = {
    searches: T.searches,
    searches_with_results: T.searches - T.zeroResults,
    products_viewed: T.productsViewed,
    add_to_cart: T.cartAdds,
    checkouts: T.checkouts,
    orders: T.orders,
  };
  const top = (map, n, by) => Object.entries(map)
    .map(([k, v]) => ({ name: k, ...v })).sort((a, b) => (b[by] || 0) - (a[by] || 0)).slice(0, n);
  const topByPrefix = (map, prefix, n) => Object.entries(map)
    .filter(([k]) => k.startsWith(prefix + ":"))
    .map(([k, v]) => ({ name: k.slice(prefix.length + 1), count: v.searches || 0 }))
    .sort((a, b) => b.count - a.count).slice(0, n);
  const queryRows = top(st.queries, 15, "searches").map((r) => ({
    query: r.name, searches: r.searches, nulls: r.nulls || 0,
    resolved: r.resolved || 0,
    avgTurns: r.turnsN ? +(r.turnsSum / r.turnsN).toFixed(2) : null,
    views: r.views || 0, carts: r.carts || 0, orders: r.orders || 0,
    cartRate: r.searches ? +((100 * (r.carts || 0)) / r.searches).toFixed(1) : 0,
  }));
  const guideRows = top(st.guide, 8, "searches").map((r) => ({
    type: r.name, asked: r.searches,
    topOptions: Object.entries(r.options || {}).sort((a, b) => b[1] - a[1]).slice(0, 4),
  }));
  // activity: events per minute over the last 10 minutes (live ring buffer)
  const now = Date.now();
  const minutes = [];
  for (let i = 9; i >= 0; i--) {
    const end = now - i * 60000, start = end - 60000;
    minutes.push({ label: i === 0 ? "now" : `-${i}m`, n: st.events.filter((e) => e.at > start && e.at <= end).length });
  }
  const asked = T.guideRefines + T.guideRescues;
  return {
    startedAt: st.startedAt,
    lastEventAt: st.events.length ? st.events[st.events.length - 1].at : null,
    counts: st.counts,
    totals: T,
    funnel,
    nullRate: T.searches ? +((100 * T.zeroResults) / T.searches).toFixed(1) : null,
    resolutionRate: T.searches ? +((100 * (T.searches - T.zeroResults)) / T.searches).toFixed(1) : null,
    journeys: st.journeys,
    outcome: st.outcome,
    journeyResolution: {
      total: T.journeysTotal,
      resolved: st.journeys.t1 + st.journeys.t2 + st.journeys.t3 + st.journeys.t4,
      unresolved: st.journeys.unresolved,
      pct: T.journeysTotal ? +((100 * (st.journeys.t1 + st.journeys.t2 + st.journeys.t3 + st.journeys.t4)) / T.journeysTotal).toFixed(1) : null,
      byTurn2Pct: T.journeysTotal ? +((100 * (st.journeys.t1 + st.journeys.t2)) / T.journeysTotal).toFixed(1) : null,
    },
    journeyMsAvg: T.journeyMsN ? Math.round(T.journeyMsSum / T.journeyMsN) : null,
    ttfcAvgMs: T.ttfcN ? Math.round(T.ttfcSum / T.ttfcN) : null,
    guideTotals: { asked, rescues: T.guideRescues, refines: T.guideRefines,
                   answerRate: asked ? +((100 * T.ttfcN) / asked).toFixed(1) : null },
    aov: T.orders ? Math.round(T.orderValue / T.orders) : null,
    cartToCheckoutPct: T.cartViews ? +((100 * T.checkouts) / T.cartViews).toFixed(1) : null,
    sessions: { active: Object.keys(st.sessions).length, multiJourney: T.multiJourneySessions,
               journeysPerSession: Object.keys(st.sessions).length ? +(T.journeysTotal / Object.keys(st.sessions).length).toFixed(2) : null },
    activity: minutes,
    topQueries: queryRows,
    guide: guideRows,
    categoryEngagement: top(st.cats, 12, "views").map((r) => ({ name: r.name, views: r.views || 0, carts: r.carts || 0, orders: 0 })),
    brandEngagement: top(st.brands, 10, "views").map((r) => ({ name: r.name, views: r.views || 0, carts: r.carts || 0, recClicks: r.recClicks || 0 })),
    topProducts: top(st.products, 8, "views").map((r) => ({
      sku: r.name, title: r.title || r.name, category: r.category || "", brand: r.brand || "",
      price: r.price != null ? r.price : null, views: r.views || 0, carts: r.carts || 0,
      cartRate: r.views ? +((100 * (r.carts || 0)) / r.views).toFixed(1) : 0,
    })),
    interests: topByPrefix(st.interests, "interests", 8),
    chatSources: topByPrefix(st.chatSources, "src", 12),
    filterUsage: top(st.filters, 14, "searches").map((r) => {
      const i = r.name.indexOf(":");
      return { type: r.name.slice(0, i), value: r.name.slice(i + 1), applies: r.searches || 0 };
    }),
    onboarding: {
      userType: topByPrefix(st.onboarding, "userType", 6),
      spendStyle: topByPrefix(st.onboarding, "spendStyle", 6),
      context: topByPrefix(st.onboarding, "context", 6),
    },
    cohorts: top(st.cohorts, 10, "searches").map((r) => ({
      name: r.name, searches: r.searches, resolved: r.resolved || 0,
      carts: r.carts || 0, orders: r.orders || 0,
      avgMs: r.msN ? Math.round(r.msSum / r.msN) : null,
    })),
    orders: st.orders.slice(-10).reverse(),
    recent: st.events.slice(-40).reverse(),
    userSessions: Object.entries(st.sessions)
      .map(([sid, sj]) => ({
        sid, firstAt: sj.firstAt || null, lastAt: sj.lastAt || null,
        persona: sj.persona || null,
        searches: sj.searches || 0, questions: sj.questions || 0,
        answers: sj.answers || 0, skips: sj.skips || 0,
        answerRate: sj.questions ? +((100 * sj.answers) / sj.questions).toFixed(0) : null,
        views: sj.views || 0, carts: sj.carts || 0, checkouts: sj.checkouts || 0,
        orders: sj.orders || 0, orderValue: sj.orderValue || 0,
        buyNow: sj.buyNow || 0, interests: sj.interests || null,
        ai: sj.ai || { llm: 0, gemini: 0, rules: 0, switches: 0 },
        chat: sj.chat || { opens: 0, msgs: 0, adds: 0 },
      }))
      .sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0))
      .slice(0, 200),
  };
}
