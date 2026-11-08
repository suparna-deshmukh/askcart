import { NextResponse } from "next/server";
import { geminiStatus } from "../../../lib/gemini_keys.js";
import { guardState } from "../../../lib/guard.js";

// Public (read-only) status of the LLM routing layer, for the top-bar pill.
// No LLM call is made here - it only reports the local state.
export async function GET() {
  const guard = guardState();
  return NextResponse.json({
    ok: true,
    // Gemini-only routing since 2026-11-06 (Qwen retired per user work order)
    gemini: geminiStatus(),
    aiMaxPerSession: Math.max(1, parseInt(process.env.AI_MAX_PER_SESSION || "8", 10)),
    // §9: in-process grounding-guard counters (since process start).
    guard: { fallbacks: guard.fallbacks, railDrops: guard.railDrops },
  });
}
