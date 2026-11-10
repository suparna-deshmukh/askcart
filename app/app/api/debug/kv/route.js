import { NextResponse } from "next/server";
import { kvEnabled, kvPing, kvGet, kvSet, kvLastError } from "../../../../lib/kv.js";
import { record } from "../../../../lib/analyticsStore.js";

// TEMPORARY diagnostic (2026-11-10): why are analytics writes not reaching
// Upstash from Vercel? DELETE after diagnosis.
export const dynamic = "force-dynamic";
export async function GET() {
  const raw = (process.env.ASKCARD_REDIS_URL || "").trim();
  const u = raw ? new URL(raw) : null;
  const out = {
    ok: true,
    node: process.versions.node,
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
      // 1) plain kvSet roundtrip
      await kvSet("askcart:selftest", "probe-ok " + Date.now(), 120);
      out.selftest = String(await kvGet("askcart:selftest")).slice(0, 40);
      out.selftestErr = kvLastError();
      // 2) the REAL analytics path in this instance
      record("page_view", { session_id: "s_kvdiag01", page: "/kv-diag" });
      await new Promise((r) => setTimeout(r, 4000));
      out.recordErr = kvLastError();
      const pub = await kvGet("askcart:state:public");
      out.publicKeyPresent = Boolean(pub);
      if (pub) {
        const st = JSON.parse(pub);
        out.publicBytes = pub.length;
        out.publicNewest = (st.events || []).slice(0, 2).map((e) => e.type + "@" + new Date(e.at).toISOString().slice(11, 19));
      }
    }
  }
  return NextResponse.json(out);
}
