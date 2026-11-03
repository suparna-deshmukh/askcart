import { NextResponse } from "next/server";
import { record } from "../../../../lib/analyticsStore";

// Fire-and-forget event ingestion. Accepts any {type, payload} so new
// interaction types added later are captured automatically. `env: "sim"`
// routes events into the isolated simulation store.
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const type = String(body.type || "").slice(0, 40);
  if (!type) return NextResponse.json({ ok: false, error: "missing type" });
  const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
  const env = body.env === "sim" ? "sim" : null;
  record(type, payload, env);
  return NextResponse.json({ ok: true });
}
