"use strict";
let D = null;
const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n).toLocaleString("en-US");
const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">")
  .replace(/"/g, """).replace(/'/g, "'");

const RC_NAME = { trust_gap: "trust_gap", budget_mismatch: "budget_mismatch",
                  zero_or_wrong: "zero_or_wrong", occasion_blindness: "occasion_blindness",
                  not_search_related: "not_search_related", other: "other" };
const RC_CLASS = { trust_gap: "rc-trust", budget_mismatch: "rc-budget",
                   zero_or_wrong: "rc-zero", occasion_blindness: "rc-occ",
                   not_search_related: "rc-nsr", other: "rc-other" };
const RC_COLOR = { trust_gap: "#d6604d", budget_mismatch: "#e0a53c",
                   zero_or_wrong: "#5b8bd9", occasion_blindness: "#6aa84f",
                   not_search_related: "#8a8f98", other: "#b9a888" };

function barRow(label, value, max, color, valText) {
  const pct = max ? Math.max(1.5, value / max * 100) : 0;
  return `<div class="bar-row"><div>${esc(label)}</div>
    <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
    <div class="bar-val">${valText != null ? esc(valText) : fmt(value)}</div></div>`;
}

function renderOverview() {
  const f = Object.fromEntries((D.funnel || []).map(x => [x.k, x.v]));
  const fb = D.study.deterministic || {}, q = D.study.qwen || {};
  const stats = [
    [fmt(f.raw_total), "reviews collected", "5 sources: Play, App Store, Reddit, Amazon product, Trustpilot"],
    [fmt(f.clean), "clean", "dedup + language gate + PII scrub"],
    [fmt(f.complaints_flagged), "search-UX complaints", "lexicon + rating gate + 10% control"],
    [String((D.root_causes || []).length), "root-cause classes",
     "Qwen full-corpus labels (6,041); pattern-scorer is zero-LLM fallback"],
    [fmt(D.catalog.skus), "SKU catalogue", "25K real Amazon products, INR, band-aware"],
    [`${fb.baseline_null_pct}% → ${fb.guided_null_pct}%`, "null results fixed", "guided follow-up (n=150 study)"],
    [`${fb.resolved_by_turn2_pct}%`, "resolved by turn 2", "deterministic guide; Qwen mode: " + (q.resolved_by_turn2_pct ?? "?") + "%"],
  ];
  $("stat-row").innerHTML = stats.map(s =>
    `<div class="stat"><div class="v">${s[0]}</div><div class="k">${esc(s[1])}</div><div class="d">${esc(s[2])}</div></div>`).join("");

  const maxN = Math.max(...Object.values(f));
  const stages = [["raw_total", "raw reviews"], ["clean", "cleaned"],
                  ["complaints_flagged", "complaints"], ["root_cause_labeled", "root-caused"]];
  $("funnel-chart").innerHTML = stages.map(([k, label]) =>
    barRow(label, f[k] || 0, maxN, "#4d6480")).join("");
  $("funnel-sub").textContent = `94,643 raw -> ${fmt(f.clean)} clean -> ${fmt(f.complaints_flagged)} complaints -> 4 root causes`;

  $("source-table").innerHTML = "<tr><th>source</th><th>clean rows</th></tr>" +
    (D.by_source || []).map(r => `<tr><td>${esc(r.source)}</td><td>${fmt(r.n)}</td></tr>`).join("");

  $("study-table").innerHTML =
    `<tr><th>mode</th><th>baseline null</th><th>guided null</th><th>resolved</th><th>by turn 2</th></tr>
     <tr><td>deterministic (headline)</td><td>${fb.baseline_null_pct}%</td><td>${fb.guided_null_pct}%</td>
         <td>${fb.resolved_pct}%</td><td>${fb.resolved_by_turn2_pct}%</td></tr>
     <tr><td>Qwen guide (stability)</td><td>${q.baseline_null_pct ?? "—"}%</td><td>${q.guided_null_pct ?? "—"}%</td>
         <td>${q.resolved_pct ?? "—"}%</td><td>${q.resolved_by_turn2_pct ?? "—"}%</td></tr>`;

  const figs = [["funnel.png", "Pipeline funnel"], ["root_causes.png", "Root causes"],
                ["study_turns.png", "Study turn distribution"], ["trends_seasonality.png", "Seasonality"],
                ["catalog_bands.png", "Catalogue price bands"], ["bayesian_ratings.png", "Bayesian ratings"]];
  $("fig-grid").innerHTML = figs.map(([f2, cap]) =>
    `<div><img class="fig" src="figures/${f2}" alt="${esc(cap)}"><div class="fig-cap">${esc(cap)}</div></div>`).join("");
}

function renderCauses() {
  const rc = D.root_causes || [];
  const maxN = Math.max(...rc.map(r => r.n));
  $("rc-chart").innerHTML = rc.map(r =>
    barRow(RC_NAME[r.root_cause], r.n, maxN, RC_COLOR[r.root_cause],
           `${fmt(r.n)} · ${r.pct}%`)).join("");
  const byRc = {};
  (D.quotes || []).forEach(qq => { (byRc[qq.root_cause] = byRc[qq.root_cause] || []).push(qq); });
  $("rc-quotes").innerHTML = rc.map(r => {
    const qs = (byRc[r.root_cause] || []).map(qq =>
      `<div class="quote">“${esc(qq.text).slice(0, 320)}${qq.text.length > 320 ? "…" : ""}”
       <div class="meta">${esc(qq.app)} · rating ${qq.rating5 ?? "?"} · doc ${esc(qq.source_doc_id)}</div></div>`).join("");
    return `<h3 style="margin:18px 0 4px"><span class="badge ${RC_CLASS[r.root_cause]}">${esc(r.root_cause)}</span>
             ${fmt(r.n)} complaints (${r.pct}%) · low-rating share ${Math.round((r.low_rating_share || 0) * 100)}%</h3>${qs}`;
  }).join("");
}

function renderAgent() {
  const A = D.agent;
  $("agent-sub").innerHTML =
    `${A.total_cycles} audited fetch cycles · ${A.llm_cycles} LLM-planned (model: <b>${esc(A.model)}</b>) · ` +
    `tool catalog: ${A.tool_catalog.map(t => `<code>${esc(t)}</code>`).join(" ")}. ` +
    `Each cycle: the model receives the current corpus tally vs targets and returns the next fetch batch as JSON; every decision is logged.`;
  $("agent-log").innerHTML = (A.decisions || []).map(a => {
    const isLlm = a.mode === "llm-agent";
    const acts = isLlm ? (a.actions || []).map(x => JSON.stringify(x)).join("\n")
                       : JSON.stringify(a.action);
    return `<div class="decision">
      <div class="head"><span class="badge ${isLlm ? "rc-occ" : "rc-zero"}">${esc(a.mode)}</span>
        cycle ${a.cycle}${a.model ? " · " + esc(a.model) : ""} · ${esc(String(a.ts).slice(0, 19))}Z
        ${isLlm && a.tally ? " · tally " + JSON.stringify(a.tally) : ""}</div>
      ${a.reason ? `<div class="reason">${esc(a.reason)}</div>` : ""}
      <pre>${esc(acts)}</pre></div>`;
  }).join("");
}

function renderTrends() {
  const T = D.trends || {};
  const peaks = T.seasonal_peaks || {};
  const items = Object.entries(peaks);
  const maxV = Math.max(...items.map(([, v]) => v.peak_share_pct), 1);
  $("season-chart").innerHTML = items.map(([k, v]) =>
    barRow(k.replace(/_/g, " "), v.peak_share_pct, maxV, "#5b8bd9",
           `${v.peak_share_pct}% of views in ${v.peak_month.slice(0, 4)}-${v.peak_month.slice(4)}`)).join("");
  $("suggest-grid").innerHTML = Object.entries(T.suggest || {}).map(([seed, list]) =>
    `<div class="suggest"><h3>“${esc(seed)}”</h3><ul>${list.slice(1, 7).map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("");
  $("trends-note").textContent = "Official Google Trends endpoint: " + (T.trends_official || {}).status +
    " (429 from datacenter networks); Suggest + pageviews are the standing proxies. Diwali/Rakhi/Eid peaks corroborate the occasion_blindness root cause and festival-season shopping spikes.";
}

function renderBayes() {
  $("bayes-table").innerHTML =
    "<tr><th>app</th><th>n reviews</th><th>raw mean</th><th>Bayesian (m=100)</th><th>complaint rate</th><th>Wilson LB</th></tr>" +
    (D.bayesian || []).map(r =>
      `<tr><td>${esc(r.app)}</td><td>${fmt(r.n)}</td><td>${r.mean_raw}</td>
       <td><b>${r.bayesian_rating}</b></td><td>${r.complaint_rate}</td><td>${r.wilson_lb}</td></tr>`).join("");
}

/* ---------- live probe ---------- */
const APPS = [
  ["Amazon Shopping", "amazon-shopping", "com.amazon.mShop.android.shopping"],
  ["Flipkart", "flipkart", "com.flipkart.android"],
  ["Myntra", "myntra", "com.myntra.android"],
  ["Meesho", "meesho", "com.meesho.app"],
  ["Etsy", "etsy", "com.etsy.android"],
  ["Temu", "temu", "com.einnovation.temu"],
  ["eBay", "ebay", "com.ebay.mobile"],
  ["Walmart", "walmart", "com.walmart.android"],
  ["Target", "target", "com.target.ui"],
];

async function probeAppStoreDirect(term, cc) {
  // app id lookup via iTunes search (CORS-open), then customer-reviews RSS
  const s = await (await fetch(
    `https://itunes.apple.com/lookup?term=${encodeURIComponent(term)}&country=${cc}&media=software`)).json();
  const app = (s.results || [])[0];
  if (!app) throw new Error("app not found on App Store for " + cc);
  const r = await (await fetch(
    `https://itunes.apple.com/${cc}/rss/customerreviews/page=1/id=${app.trackId}/sortby=mostrecent/json`)).json();
  const entries = r.feed.entry || [];
  const list = Array.isArray(entries) ? entries : [entries];
  return list.filter(e => e["im:rating"]).slice(0, 10).map(e => ({
    app: app.trackName, country: cc, rating: e["im:rating"].label,
    title: e.title ? e.title.label : "", body: (e.content ? e.content.label : "").slice(0, 240),
  }));
}

async function runProbe() {
  const appSel = APPS.find(a => a[0] === $("p-app").value) || APPS[0];
  const cc = $("p-cc").value, src = $("p-src").value;
  const out = $("p-out");
  out.textContent = "fetching…";
  try {
    let data, via;
    const vu = D.vercel_probe_url;
    if (vu && src !== "appstore-direct") {
      const payload = src === "play" ? { source: "play", app: appSel[2] }
                 : src === "reddit" ? { source: "reddit", sub: appSel[0], query: "search" }
                 : { source: "appstore", country: cc };
      const r = await fetch(vu + "/probe", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || ("HTTP " + r.status));
      data = j.sample; via = "Vercel probe API (" + src + ")";
    } else {
      data = await probeAppStoreDirect(appSel[0], cc);
      via = "direct App Store RSS (CORS-open)";
    }
    out.textContent = `via ${via}\n\n` + JSON.stringify(data, null, 2);
  } catch (e) {
    out.textContent = "probe failed: " + e.message +
      "\n\nFallback: the Vercel probe API (play/appstore/reddit) comes online when the extractor function deploys (Vercel free-plan 24h limit); App Store RSS is always available.";
  }
}

/* ---------- boot ---------- */
document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
  document.querySelectorAll(".tabpane").forEach(x => x.classList.remove("active"));
  b.classList.add("active");
  $("tab-" + b.dataset.tab).classList.add("active");
}));

const initialTab = new URLSearchParams(location.search).get("tab");
fetch("data.json", { cache: "no-cache" }).then(r => r.json()).then(d => {
  D = d;
  renderOverview(); renderCauses(); renderAgent(); renderTrends(); renderBayes();
  $("p-app").innerHTML = APPS.map(a => `<option>${a[0]}</option>`).join("");
  $("p-run").addEventListener("click", runProbe);
  if (initialTab) {
    const btn = document.querySelector(`.tab[data-tab="${initialTab}"]`);
    if (btn) btn.click();
  }
});
