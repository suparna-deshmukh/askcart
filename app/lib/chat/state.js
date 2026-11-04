// HMAC-signed assistant state. The blob is carried by the client
// (sessionStorage) but verified server-side on every turn, so it cannot be
// forged: a tampered state is rejected, not reset.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function devSecret() {
  // Repo-local dev secret so signatures survive dev-server restarts.
  const f = path.join(process.cwd(), ".chat-secret-dev");
  try {
    if (fs.existsSync(f)) {
      const v = fs.readFileSync(f, "utf8").trim();
      if (v.length >= 16) return v;
    }
    const fresh = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(f, fresh);
    return fresh;
  } catch { return "askcart-chat-dev-secret"; }
}
function secret() {
  const s = process.env.CHAT_STATE_SECRET;
  if (s && s.length >= 16) return s;
  return devSecret();
}

export function signState(obj) {
  const p = Buffer.from(JSON.stringify(obj)).toString("base64url");
  const h = crypto.createHmac("sha256", secret()).update(p).digest("base64url");
  return p + "." + h;
}

// null when missing or tampered (timing-safe compare).
export function verifyState(signed) {
  try {
    const [p, h] = String(signed || "").split(".");
    if (!p || !h) return null;
    const expect = crypto.createHmac("sha256", secret()).update(p).digest("base64url");
    const a = Buffer.from(h), b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const o = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
    return o && o.v === 1 ? o : null;
  } catch { return null; }
}

export function decodeState(signed) {
  try {
    const p = String(signed || "").split(".")[0];
    const o = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
    return o && o.v === 1 ? o : null;
  } catch { return null; }
}

export function freshState(seed = {}) {
  return {
    v: 1,
    jid: seed.jid || "j_" + Math.random().toString(36).slice(2, 10),
    lang: "en", langStreak: 0,
    turns: 0,
    q: null,                                   // last search query
    slots: { budgetMax: null, budgetMin: null, occasion: null, brand: null,
             category: null, forWhom: null, size: null, capacity: null, recipient: null },
    asked: [],                                 // question types already asked this journey
    pending: null,                             // { type } question awaiting a typed answer
    last: null,                                // { all: [top-24 items], parsed, relaxed }
    ctx: null,                                 // { sku } PDP context
    gift: null,                                // { step, recipient, occasion, budget }
  };
}
