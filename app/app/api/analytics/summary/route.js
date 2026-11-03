import { NextResponse } from "next/server";
import { snapshot } from "../../../../lib/analyticsStore";

// Polling endpoint for the dashboard (live product data, all users of this
// deployment). `?env=sim` returns the simulation store instead.
export async function GET(req) {
  const url = new URL(req.url);
  const env = url.searchParams.get("env") === "sim" ? "sim" : null;
  return NextResponse.json(snapshot(env));
}
