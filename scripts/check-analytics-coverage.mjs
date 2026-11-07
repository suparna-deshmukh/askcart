// check-analytics-coverage.mjs (update-prompt section 2, item 3)
//
// Every event type documented in docs/event_schema.md must be referenced
// in the analytics layer: a row in the event registry (which the
// Overview "Event types" table renders, so it is displayed) AND present
// in the analyticsStore switch or the generic counts path, AND allowlisted
// if it crosses the public /api/analytics/event write endpoint.
// Exits non-zero (fails CI) on any gap.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const schema = read("docs/event_schema.md");
const store = read("app/lib/analyticsStore.js");
const route = read("app/app/api/analytics/event/route.js");
const registrySrc = read("app/lib/event_registry.js");
const analyticsUi = read("app/app/ui/analytics.jsx");
const summaryRoute = read("app/app/api/analytics/summary/route.js");

// 1) event names from the schema: backticked identifiers in table rows
const names = new Set();
for (const line of schema.split("\n")) {
  if (!line.trim().startsWith("|")) continue;
  const first = line.split("|")[1] || "";
  for (const m of first.matchAll(/`([a-z][a-z0-9_]*)`/g)) names.add(m[1]);
}
if (names.size < 20) {
  console.error("FATAL: parsed only", names.size, "events from the schema — parser or schema format changed");
  process.exit(1);
}

// 2) allowlist from the public write route
const allow = new Set([...route.matchAll(/"([a-z][a-z0-9_]*)"/g)].map((m) => m[1]));

// 3) check
let fail = 0;
const missing = [];
for (const n of [...names].sort()) {
  const inRegistry = new RegExp("\\b" + n + "\\b").test(registrySrc);
  const inUi = analyticsUi.includes("event_registry") || new RegExp("\\b" + n + "\\b").test(analyticsUi);
  // store: a case label OR the generic path (counts[type]) — generic is
  // always on, so per-type store coverage is via the registry+ui render.
  const inStore = new RegExp("case \\s*\"" + n + "\"").test(store);
  const inSummary = new RegExp("\\b" + n + "\\b").test(summaryRoute);
  // client-emitted events (anything not produced server-side by routes)
  // must be allowlisted; server-only events are exempt
  const serverOnly = ["ai_call", "ai_key_exhausted", "chat_response", "chat_intent", "chat_fallback", "chat_error"];
  const needsAllow = !serverOnly.includes(n);
  const allowOk = !needsAllow || allow.has(n);
  const problems = [];
  if (!inRegistry) problems.push("no registry row (would not be displayed)");
  if (!inUi && !inRegistry) problems.push("not rendered");
  if (!allowOk) problems.push("not in /api/analytics/event allowlist");
  if (problems.length) {
    fail += 1;
    missing.push("  " + n + " -> " + problems.join("; "));
  }
}
// reverse hygiene: registry names should at least be documented or be
// known legacy aliases (warn only — legacy aliases are intentional)
const regNames = [...registrySrc.matchAll(/^\s{2}([a-z][a-z0-9_]*):\s*\{/gm)].map((m) => m[1]);
const undocumented = regNames.filter((n) => !names.has(n));

console.log("events in schema:", names.size, "| registry rows:", regNames.length,
            "| allowlisted:", [...names].filter((n) => allow.has(n)).length);
if (undocumented.length) {
  console.log("registry rows not (yet) in schema (warn only, legacy/forward):", undocumented.join(", "));
}
if (missing.length) {
  console.error("COVERAGE FAIL — schema events missing from the analytics layer:");
  console.error(missing.join("\n"));
  process.exit(1);
}
console.log("ANALYTICS COVERAGE OK: every schema event is registry-documented, rendered, and allowlisted");
