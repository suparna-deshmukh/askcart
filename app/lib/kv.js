// Minimal shared-KV client for AskCart (no dependencies).
//
// Talks to an Upstash-style Redis over ONE pooled TLS socket: all commands
// are serialized through a queue on a persistent connection (a fresh TLS
// handshake per command costs seconds from serverless). Set ASKCARD_REDIS_URL
// (rediss://default:***@host:6379) to enable; without it — or on any error —
// calls fail open (kvGet -> null, kvSet -> no-op) so analytics never break
// the app.

import net from "net";
import tls from "tls";

function parseRedisUrl() {
  const raw = (process.env.ASKCARD_REDIS_URL || "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "redis:" && u.protocol !== "rediss:") return null;
    return {
      host: u.hostname,
      port: u.port ? Number(u.port) : 6379,
      auth: u.password ? decodeURIComponent(u.password) : undefined,
      useTls: u.protocol === "rediss:",
    };
  } catch {
    return null;
  }
}

function respEncode(args) {
  const parts = [Buffer.from(`*${args.length}\r\n`)];
  for (const a of args) {
    const b = Buffer.from(a);
    parts.push(Buffer.from(`$${b.length}\r\n`), b, Buffer.from("\r\n"));
  }
  return Buffer.concat(parts);
}

function parseReply(buf) {
  const lineEnd = buf.indexOf("\r\n");
  if (lineEnd === -1) return { value: undefined, rest: buf, complete: false };
  const head = String.fromCharCode(buf[0]);
  const line = buf.subarray(1, lineEnd).toString();
  if (head === "+") return { value: line, rest: buf.subarray(lineEnd + 2), complete: true };
  if (head === "-") return { value: new Error(line), rest: buf.subarray(lineEnd + 2), complete: true };
  if (head === ":") return { value: Number(line), rest: buf.subarray(lineEnd + 2), complete: true };
  if (head === "$") {
    const n = Number(line);
    if (n === -1) return { value: null, rest: buf.subarray(lineEnd + 2), complete: true };
    const start = lineEnd + 2;
    if (buf.length < start + n + 2) return { value: undefined, rest: buf, complete: false };
    return { value: buf.subarray(start, start + n).toString(), rest: buf.subarray(start + n + 2), complete: true };
  }
  return { value: null, rest: buf.subarray(lineEnd + 2), complete: true };
}

// ---------------- pooled connection (one socket per process) ----------------

let conn = null; // { socket, buf, authed }
let queue = [];

function killConn(e) {
  if (conn) {
    try { conn.socket.destroy(); } catch { /* noop */ }
    conn = null;
  }
  const pending = queue;
  queue = [];
  for (const q of pending) {
    clearTimeout(q.timer);
    q.reject(e);
  }
}

function pump() {
  if (!conn) return;
  const { socket } = conn;
  for (const q of queue) {
    if (!q.args || q.sent) continue; // AUTH is written at connect time
    q.sent = true;
    if (!socket.write(respEncode(q.args))) break; // backpressure; 'drain' resumes
  }
}

function connectAndPump(cfg) {
  const socket = cfg.useTls
    ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host })
    : net.connect({ host: cfg.host, port: cfg.port });
  conn = { socket, buf: Buffer.alloc(0), authed: false };
  socket.on("data", (d) => {
    if (!conn || conn.socket !== socket) return;
    conn.buf = Buffer.concat([conn.buf, d]);
    while (queue.length && conn) {
      const r = parseReply(conn.buf);
      if (!r.complete) break;
      conn.buf = r.rest;
      const q = queue.shift();
      clearTimeout(q.timer);
      if (q.args === null) continue; // AUTH reply
      if (r.value instanceof Error) killConn(r.value);
      else q.resolve(r.value);
    }
  });
  socket.on("error", (e) => {
    if (!conn || conn.socket !== socket) return;
    killConn(e instanceof Error ? e : new Error(String(e)));
  });
  socket.on("close", () => {
    if (!conn || conn.socket !== socket) return;
    killConn(new Error("redis connection closed"));
  });
  socket.on("drain", pump);
  const start = () => {
    if (!conn || conn.socket !== socket || conn.authed) return;
    if (cfg.auth) socket.write(respEncode(["AUTH", cfg.auth]));
    conn.authed = true;
    pump();
  };
  socket.on("connect", start);
  if (socket.readyState === "open") start();
}

function command(args, timeoutMs = 5000) {
  const cfg = parseRedisUrl();
  if (!cfg) return Promise.reject(new Error("ASKCARD_REDIS_URL not set"));
  return new Promise((resolve, reject) => {
    const q = {
      args,
      resolve,
      reject,
      timer: setTimeout(() => killConn(new Error(`redis timeout after ${timeoutMs}ms`)), timeoutMs),
    };
    queue.push(q);
    if (!conn) {
      if (cfg.auth) {
        queue.unshift({
          args: null, resolve: () => {}, reject: () => {},
          timer: setTimeout(() => killConn(new Error("redis AUTH timed out")), timeoutMs),
        });
      }
      connectAndPump(cfg);
    } else if (conn.authed) {
      pump();
    }
    // else: still connecting — start() pumps after AUTH
  });
}

// Pre-warm: module load happens before the first request on Vercel, so the
// pooled connection is established while the function boots.
if (parseRedisUrl()) {
  command(["PING"]).catch(() => {});
}

// ---------------- store API (fail-open) ----------------

export function kvEnabled() {
  return parseRedisUrl() !== null;
}

export async function kvGet(key) {
  try {
    const v = await command(["GET", key]);
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

export async function kvSet(key, value, ttlSec) {
  try {
    await command(ttlSec ? ["SET", key, value, "EX", String(ttlSec)] : ["SET", key, value]);
  } catch {
    /* fail open */
  }
}

export async function kvPing(timeoutMs = 5000) {
  try {
    const v = await command(["PING"], timeoutMs);
    return v === "PONG";
  } catch {
    return false;
  }
}
