import { NextResponse } from "next/server";
import { kvEnabled, kvPing, kvGet, kvSet } from "../../../../lib/kv.js";

// TEMPORARY diagnostic (2026-11-10): why are analytics writes not reaching
// Upstash from Vercel? Reports runtime KV state. DELETE after diagnosis.
export const dynamic = "force-dynamic";
export async function GET() {
  const raw = (process.env.ASKCARD_REDIS_URL || "").trim();
  const u = raw ? new URL(raw) : null;
  const out = {
    ok: true,
    node: process.versions.node,
    platform: process.platform,
    envPresent: Boolean(raw),
    envHost: u ? u.hostname : null,
    envProtocol: u ? u.protocol : null,
    kvEnabled: kvEnabled(),
  };
  if (kvEnabled()) {
    const t0 = Date.now();
    try { out.ping = await kvPing(8000); out.pingMs = Date.now() - t0; }
    catch (e) { out.ping = "ERROR " + e.message; }
    if (out.ping) {
      const t1 = Date.now();
      try {
        await kvSet("askcart:selftest", "probe-ok " + Date.now(), 120);
        out.setMs = Date.now() - t1;
        const back = await kvGet("askcart:selftest");
        out.roundtrip = back === "probe-ok " + back ? back : back;
        out.roundtripOk = String(back).startsWith("probe-ok");
      } catch (e) {
        out.roundtrip = "ERROR " + e.message;
        out.roundtripMs = Date.now() - t1;
      }
    }
  }
  return NextResponse.json(out);
}
