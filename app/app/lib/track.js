// Client-side event tracking. Optimized schema: one event type per user
// action, stable properties, session + journey correlation ids.
// Full schema: docs/event_schema.md

function ls(key, dflt) {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v;
  } catch {}
  return dflt;
}
function lsSet(key, val) {
  try { localStorage.setItem(key, val); } catch {}
}

export function getSessionId() {
  let id = ls("askcart_session", null);
  if (!id) {
    id = "s_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    lsSet("askcart_session", id);
  }
  return id;
}

export function getPersona() {
  try {
    const v = localStorage.getItem("askcart_persona");
    return v ? JSON.parse(v) : null;
  } catch { return null; }
}
export function setPersona(p) { lsSet("askcart_persona", JSON.stringify(p)); }
export function cohortOf(persona) {
  if (!persona) return "no-persona";
  return [persona.forWhom || "?", persona.shopStyle || "?"].join("|");
}

let _trackFn = null;
export function track(type, payload = {}) {
  const full = {
    ...payload,
    session_id: getSessionId(),
    cohort: cohortOf(getPersona()),
    ts: Date.now(),
  };
  if (_trackFn) { try { _trackFn(full); } catch {} }
  try {
    fetch("/api/analytics/event", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload: full }),
    }).catch(() => {});
  } catch { /* tracking must never break the app */ }
}

export function onTrack(fn) { _trackFn = fn; }
