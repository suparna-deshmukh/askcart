// Gemini API key chain (2026-11-06, user work order).
//
// The Gemini free tier allows ~20 requests/day PER KEY. The user supplies up
// to 3 keys (GEMINI_API_KEYS=k1,k2,k3; the legacy GEMINI_API_KEY is key #0).
// Routing rules:
//   1. A key is never called once its LOCAL usage ledger says it has used its
//      daily cap (GEMINI_RPD, default 20) or it was 429/quota-banned today.
//      Google exposes no per-key usage endpoint for plain API keys (the Cloud
//      Quotas API needs project IAM credentials, not a key), so the ledger is
//      our planner: every attempt increments the key's count up-front.
//   2. On a 429 / 403 quota error the key is marked exhausted for the rest of
//      the day (persisted) and the chain moves to the next key immediately.
//   3. Model-level problems (404 = model name not served, 5xx, timeout) cool
//      the MODEL down, not the key - the next key tries the next model.
//   4. All keys exhausted -> geminiGenerate returns null and the caller uses
//      the deterministic policy (the journey is unchanged, quality drops
//      slightly - the designed degradation path).
// Nothing here ever throws into the search path.
import fs from "fs";
import path from "path";
import { env } from "./llm.js";

const G = globalThis;
const FILE = path.join(process.cwd(), ".gemini_usage.json");
const RPD = Math.max(1, parseInt(env("GEMINI_RPD") || "20", 10));
const state = (G.__askcartGeminiState ??= { day: null, keys: [] });

function today() { return new Date().toISOString().slice(0, 10); }
function rawKeys() {
  const list = (env("GEMINI_API_KEYS") || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!list.length && env("GEMINI_API_KEY")) list.push(env("GEMINI_API_KEY"));
  return list;
}
function mask(key) {
  const k = String(key);
  return k.length <= 8 ? k.slice(0, 2) + "…" : k.slice(0, 4) + "…" + k.slice(-4);
}
function rollover() {
  const t = today();
  if (state.day !== t) {
    state.day = t;
    state.keys = rawKeys().map((k) => ({ key: k, used: 0, exhaustedDay: null, exhaustedReason: null }));
  }
}
function load() {
  rollover();
  try {
    const saved = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (saved.day === state.day && Array.isArray(saved.keys)) {
      const raw = rawKeys();
      state.keys = raw.map((k, i) => ({
        key: k,
        used: Math.max(0, Number(saved.keys[i]?.used) || 0),
        exhaustedDay: saved.keys[i]?.exhaustedDay === state.day ? state.day : null,
        exhaustedReason: saved.keys[i]?.exhaustedDay === state.day ? (saved.keys[i]?.exhaustedReason || null) : null,
      }));
    }
  } catch { /* first boot */ }
}
let saveTimer = null;
function persist() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const slim = { day: state.day, keys: state.keys.map(({ key, used, exhaustedDay, exhaustedReason }) =>
        ({ used, exhaustedDay, exhaustedReason, mask: mask(key) })) };
      fs.writeFileSync(FILE + ".tmp", JSON.stringify(slim, null, 1));
      fs.renameSync(FILE + ".tmp", FILE);
    } catch { /* best effort */ }
  }, 300);
}

// public status for the /api/ai-status endpoint + the UI pill
export function geminiStatus() {
  load();
  const keys = state.keys.map((k, i) => ({
    idx: i, mask: mask(k.key), used: k.used, rpd: RPD,
    exhausted: k.exhaustedDay === state.day, reason: k.exhaustedReason,
  }));
  const activeIdx = keys.findIndex((k) => !k.exhausted && k.used < RPD);
  return { day: state.day, rpd: RPD, keys, activeIdx: activeIdx === -1 ? null : activeIdx,
           allExhausted: keys.length === 0 || activeIdx === -1 };
}

export function markExhausted(idx, reason) {
  load();
  const k = state.keys[idx];
  if (!k || k.exhaustedDay === state.day) return;
  k.exhaustedDay = state.day;
  k.exhaustedReason = reason;
  persist();
  // the ai_key_exhausted analytics event is emitted by the routes that
  // observe the rotation (planner / refine), keeping this module dependency-free
}

function bump(idx) {
  load();
  const k = state.keys[idx];
  if (k) { k.used += 1; persist(); }
}

const MODEL_COOL = (G.__askcartGeminiModelCool ??= new Map()); // model -> until ms
const STICKY = (G.__askcartGeminiSticky ??= { model: null });
function models() {
  const list = [];
  if (STICKY.model) list.push(STICKY.model);
  for (const m of [env("GEMINI_MODEL"), "gemini-3-flash-preview", "gemini-3.5-flash"]) {
    if (m && !list.includes(m)) list.push(m);
  }
  return list;
}
const cooling = (m) => (MODEL_COOL.get(m) || 0) > Date.now();
function cool(m, ms) { MODEL_COOL.set(m, Date.now() + ms); }

// One attempt per key; keys are tried in order until one answers.
// Returns { text, keyIdx, model, rotatedFrom } | null.
export async function geminiGenerate({ system, user, maxTokens = 60, timeoutMs = 2500 }) {
  load();
  const chain = models().filter((m) => !cooling(m));
  if (!chain.length) return null;
  let rotatedFrom = null;
  for (let idx = 0; idx < state.keys.length; idx++) {
    const k = state.keys[idx];
    if (!k || k.exhaustedDay === state.day || k.used >= RPD) continue;
    const model = chain[idx % chain.length]; // spread model risk across keys
    bump(idx);
    let res;
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), timeoutMs);
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST", signal: ctrl.signal,
          headers: { "Content-Type": "application/json", "x-goog-api-key": k.key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: user }] }],
            generationConfig: { temperature: 0, maxOutputTokens: maxTokens },
          }),
        },
      );
      clearTimeout(to);
    } catch { cool(model, 60000); continue; }
    if (res.status === 429 || res.status === 403) {
      markExhausted(idx, res.status === 429 ? "rpd" : "quota_or_auth");
      rotatedFrom = rotatedFrom ?? idx;
      continue; // next key, immediately
    }
    if (res.status === 404) { cool(model, 300000); continue; }
    if (!res.ok) {
      if (res.status === 400) {
        // "API key not valid" is a dead key, not a bad request - drop it
        // for the day instead of retrying it.
        try {
          const errTxt = await res.text();
          if (/API key not valid|invalid API key|PERMISSION_DENIED/i.test(errTxt)) {
            markExhausted(idx, "invalid_key");
            rotatedFrom = rotatedFrom ?? idx;
            continue;
          }
        } catch { /* fall through */ }
      }
      cool(model, 60000);
      continue;
    }
    try {
      const j = await res.json();
      const text = j?.candidates?.[0]?.content?.parts?.[0]?.text || null;
      if (text) { STICKY.model = model; return { text, keyIdx: idx, model, rotatedFrom }; }
    } catch { /* fall through */ }
    cool(model, 60000);
  }
  return null;
}
