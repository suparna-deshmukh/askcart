import { NextResponse } from "next/server";
import { snapshot, windowStats } from "../../../../lib/analyticsStore";

// Polling endpoint for the dashboard (live product data, all users of this
// deployment). `?env=sim` returns the simulation store instead.
//
// Section 2 (2026-11-08): `?range=` drives the Overview dashboard:
//   live (default) -> the all-time snapshot (unchanged contract)
//   1h / 24h       -> { window, previousWindow, current, previous } from the
//                     slim JSONL event log (windowStats), for KPI deltas vs
//                     the previous equal window
//   all            -> { snapshot, current }: true all-time totals + log-based
//                     top lists (log keeps the last 7 days)
export async function GET(req) {
  const url = new URL(req.url);
  const env = url.searchParams.get("env") === "sim" ? "sim" : null;
  const range = url.searchParams.get("range") || "live";
  if (env === "sim" || range === "live") return NextResponse.json(snapshot(env));
  const H = 3600000, D = 86400000;
  if (range === "1h" || range === "24h") {
    const span = range === "1h" ? H : D;
    const to = Date.now();
    return NextResponse.json({
      ok: true, range,
      window: [to - span, to],
      previousWindow: [to - 2 * span, to - span],
      current: windowStats(to - span, to, env),
      previous: windowStats(to - 2 * span, to - span, env),
    });
  }
  if (range === "all") {
    return NextResponse.json({
      ok: true, range: "all",
      snapshot: snapshot(env),
      current: windowStats(0, Date.now(), env),
    });
  }
  return NextResponse.json(snapshot(env));
}
