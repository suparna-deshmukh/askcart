// AskCart assistant route (Mode A: deterministic dialog, templates-first).
// POST { state: <signed>, input: { type: "text"|"chip", text?, chip_id? },
//        context: { sku?, source?, lastText? } }
// -> { ok, reply: { act, text, mode, components, chips, ui_actions },
//      state: <signed>, events: [{type, payload}], meta }
// The LLM is only used when CHAT_LLM=1 (optional phrasing + low-confidence
// NLU fallback); default is 0 and fully deterministic.
import { NextResponse } from "next/server";
import { loadCatalog } from "../../../lib/catalog";
import { verifyState, signState, freshState } from "../../../lib/chat/state";
import { handleTurn } from "../../../lib/chat/dialog";

const MAX_TURNS_PER_CONV = 30;
const RATE_PER_MIN = 20;
const rate = new Map(); // ip -> timestamps
function rateOk(ip) {
  const now = Date.now();
  const arr = (rate.get(ip) || []).filter((t) => now - t < 60000);
  if (arr.length >= RATE_PER_MIN) { rate.set(ip, arr); return false; }
  arr.push(now);
  rate.set(ip, arr);
  return true;
}

let _brands = null;
function catalogBrands(catalog) {
  if (_brands) return _brands;
  const set = new Set(); const list = [];
  for (const it of catalog) {
    const v = it.brand ? String(it.brand).toLowerCase().replace(/[^a-z0-9]+/g, "") : "";
    if (v && !set.has(v)) { set.add(v); list.push(v); }
  }
  _brands = { set, list };
  return _brands;
}
let _median = null;
function catMedian(catalog) {
  if (_median) return _median;
  const by = new Map();
  for (const it of catalog) {
    if (!by.has(it.category)) by.set(it.category, []);
    by.get(it.category).push(it.price);
  }
  const out = {};
  for (const [c, arr] of by.entries()) {
    arr.sort((a, b) => a - b);
    out[c] = { med: arr[Math.floor(arr.length / 2)], n: arr.length };
  }
  _median = out;
  return out;
}

export async function POST(req) {
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "local";
  if (process.env.CHAT_EVAL !== "1" && !rateOk(ip)) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  if (body.state) {
    const v = verifyState(body.state);
    if (!v) return NextResponse.json({ ok: false, error: "state_tampered" }, { status: 400 });
  }
  const state = (body.state && verifyState(body.state)) || freshState({});
  if (state.turns >= MAX_TURNS_PER_CONV) {
    return NextResponse.json({
      ok: true,
      reply: { act: "apologize_fallback", text: "We've hit the 30-turn limit for this chat. Start a fresh one with a new search.", mode: "template", components: [], chips: [], ui_actions: [] },
      state: signState(state), events: [], meta: { intent: "limit", via: "rules" },
    });
  }
  const catalog = loadCatalog();
  const context = body.context || {};
  const ctx = {
    catalog,
    context: {
      sku: typeof context.sku === "string" ? context.sku : null,
      source: context.source || null,
      lastText: typeof context.lastText === "string" ? context.lastText.slice(0, 500) : (typeof body.input?.text === "string" ? body.input.text.slice(0, 500) : ""),
    },
    llmEnabled: process.env.CHAT_LLM === "1",
    brandSet: catalogBrands(catalog).set,
    brandList: catalogBrands(catalog).list,
    catMedian: catMedian(catalog),
    region: context.region || null,
  };
  const input = {
    type: body.input && body.input.type === "chip" ? "chip" : "text",
    text: String(body.input && body.input.text || ""),
    chip_id: body.input && typeof body.input.chip_id === "string" ? body.input.chip_id.slice(0, 80) : null,
  };
  const out = await handleTurn(state, input, ctx);
  return NextResponse.json({
    ok: true,
    reply: out.reply,
    state: signState(out.state),
    events: out.events,
    meta: out.meta,
  });
}
