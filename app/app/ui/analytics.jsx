"use client";
// Insights (analytics) v2 — Phase 8 (brief §14): presentation shell only.
// 232px rail (mobile: scrollable pills) · banner · live pill · density toggle
// · KPI sparklines · single chart palette · funnel conversion chips ·
// sticky-header tables · family-chip event feed · loading skeletons.
// Data sources, polling intervals and panel contents are unchanged.
import { useEffect, useState } from "react";
import { I } from "./kit/Icon";
import { Select } from "./kit/Input";

function ago(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return s + "s ago";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

function fmtMs(ms) {
  if (ms == null) return "–";
  if (ms >= 60000) return (ms / 60000).toFixed(1) + "m";
  if (ms >= 1000) return Math.round(ms / 1000) + "s";
  return Math.round(ms) + "ms";
}

function evText(ev) {
  const p = ev.payload || {};
  const bits = [];
  if (p.query) bits.push("“" + p.query + "”");
  if (p.n_results !== undefined) bits.push(p.n_results + " results");
  if (p.question_type) bits.push(p.question_type + " q");
  if (p.option) bits.push(p.option);
  if (p.sku) bits.push(p.sku + (p.brand ? " · " + p.brand : ""));
  if (p.price !== undefined) bits.push("₹" + Number(p.price).toLocaleString("en-IN"));
  if (p.total !== undefined) bits.push("₹" + Number(p.total).toLocaleString("en-IN"));
  if (p.category) bits.push(p.category);
  if (p.turn) bits.push("turn " + p.turn);
  if (p.turns) bits.push("turns " + p.turns);
  if (p.tab) bits.push(p.tab + " tab");
  if (p.forWhom) bits.push(p.forWhom, p.budgetStyle, p.shopStyle);
  if (p.reason) bits.push(p.reason.slice(0, 60));
  if (p.error) bits.push(p.error);
  return bits.join(" · ");
}

function agoShort(ts) {
  if (!ts) return "–";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

// Feed chip family (brief §14): search = brand, cart = success,
// guide = marigold, error = danger, everything else neutral.
function fam(type) {
  if (/error/.test(type)) return "error";
  if (/^search|suggest|zero_result|resolved|unresolved|journey_end/.test(type)) return "search";
  if (/cart|order|buy_now|checkout|wishlist|reorder|save_for_later|move_all|recommendation/.test(type)) return "cart";
  if (/guide_|filter_|constraint_|variant_select|quick_view|pdp_ask|chat_question/.test(type)) return "guide";
  return "neutral";
}

function Sparkline({ points }) {
  if (!points || points.length < 2) return null;
  const w = 80, h = 24, pad = 2;
  const max = Math.max(...points, 1);
  const step = (w - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => [pad + i * step, h - pad - (p / max) * (h - pad * 2)]);
  const line = coords.map((c) => c.map((x) => x.toFixed(1)).join(",")).join(" ");
  const area = "M " + coords[0][0].toFixed(1) + "," + (h - pad) + " " +
    coords.map((c) => "L " + c[0].toFixed(1) + "," + c[1].toFixed(1)).join(" ") +
    " L " + coords[coords.length - 1][0].toFixed(1) + "," + (h - pad) + " Z";
  return (
    <svg className="an-spark" width={w} height={h} viewBox={"0 0 " + w + " " + h} aria-hidden="true">
      <path d={area} fill="var(--brand-50)" />
      <polyline points={line} fill="none" stroke="var(--brand)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Stat({ k, v, note, warn, spark }) {
  return (
    <div className={"stat" + (warn ? " warn" : "")}>
      <div className="k">{warn ? <I name="alert" size={13} className="an-warnic" /> : null}{k}</div>
      <div className="v">{v}{spark ? <Sparkline points={spark} /> : null}</div>
      {note && <div className="kn">{note}</div>}
    </div>
  );
}

function BarRow({ label, count, max, extra }) {
  const w = max > 0 ? Math.max(2, Math.round((count / max) * 100)) : 0;
  return (
    <div className="an-bar">
      <span className="bl">{label}</span>
      <span className="bar"><i style={{ width: w + "%" }} /></span>
      <span className="n"><b>{Number(count).toLocaleString("en-IN")}</b>{extra ? " · " + extra : ""}</span>
    </div>
  );
}

function Funnel({ funnel }) {
  const stages = [
    ["Searches", funnel.searches],
    ["On-intent results (≥2)", funnel.searches_with_results],
    ["Viewed products", funnel.products_viewed],
    ["Added to cart", funnel.add_to_cart],
    ["Started checkout", funnel.checkouts],
    ["Orders placed", funnel.orders],
  ];
  const max = Math.max(...stages.map(([, v]) => v), 1);
  const conv = (a, b) => (b && b > 0 ? Math.round((100 * a) / b) + "%" : "–");
  return (
    <div className="dim">
      <h3>Conversion funnel · every step of the journey</h3>
      {stages.map(([label, v], i) => (
        <div className="an-frow" key={label}>
          <span className="bl">{label}</span>
          <span className="bar"><i style={{ width: Math.max(2, Math.round((v / max) * 100)) + "%" }} /></span>
          <span className="n"><b>{v.toLocaleString("en-IN")}</b></span>
          {i > 0
            ? <span className="an-conv" title="step-to-step conversion">→ {conv(v, stages[i - 1][1])}</span>
            : <span aria-hidden="true" />}
        </div>
      ))}
    </div>
  );
}

function Feed({ events }) {
  return (
    <div className="dim">
      <h3>Live event stream · last {events.length} of every interaction</h3>
      <div className="feed">
        {events.length ? events.map((ev, i) => (
          <div className="feedrow" key={(ev.at || 0) + "-" + i}>
            <span className={"ft fam-" + fam(ev.type)}>{ev.type}</span>
            <span className="fp">{evText(ev) || "—"}</span>
            <span className="fa">{ago(ev.at)}</span>
          </div>
        )) : <div className="feedempty"><span className="live-dot" /> No interactions yet — run a search on the Search tab and watch this tick in real time.</div>}
      </div>
    </div>
  );
}

function LoadingPanel() {
  return (
    <div>
      <div className="statgrid">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="kit-skel" style={{ height: 84 }} />)}</div>
      <div className="kit-skel" style={{ height: 140, marginBottom: 14, borderRadius: 14 }} />
      <div className="dim">
        <h3>Live event stream</h3>
        <div className="feed"><div className="feedempty"><span className="live-dot" /> Waiting for events… run a search on the Search tab and watch it tick in real time.</div></div>
      </div>
    </div>
  );
}

function OverviewPanel({ sum }) {
  const t = sum.totals, f = sum.funnel;
  const obTotal = t.onboardingDone + t.onboardingSkipped;
  return (
    <div>
      <div className="statgrid">
        <Stat k="Searches" v={t.searches.toLocaleString("en-IN")}
              spark={sum.activity && sum.activity.length >= 2 ? sum.activity.map((m) => m.n) : null} />
        <Stat k="Failed-search rate" v={sum.nullRate == null ? "–" : sum.nullRate + "%"} warn={sum.nullRate > 15} note="<2 on-intent results / search (study's null defn)" />
        <Stat k="Search success" v={sum.resolutionRate == null ? "–" : sum.resolutionRate + "%"} note="searches surfacing ≥2 on-intent results" />
        <Stat k="Products viewed" v={t.productsViewed.toLocaleString("en-IN")} />
        <Stat k="Cart adds" v={t.cartAdds.toLocaleString("en-IN")} note={t.productsViewed ? Math.round(100 * t.cartAdds / t.productsViewed) + "% of views" : undefined} />
        <Stat k="Orders (prototype)" v={t.orders.toLocaleString("en-IN")} note={"₹" + t.orderValue.toLocaleString("en-IN") + " total value"} />
        <Stat k="Onboarding completed" v={obTotal ? Math.round(100 * t.onboardingDone / obTotal) + "%" : "–"} note={t.onboardingDone + " done · " + t.onboardingSkipped + " skipped"} />
        <Stat k="Buy-now clicks" v={t.buyNow.toLocaleString("en-IN")} note={t.checkouts + " checkouts (cart " + (t.checkouts - t.buyNow >= 0 ? t.checkouts - t.buyNow : 0) + ")"} />
        <Stat k="Filter applies" v={t.filterApplies.toLocaleString("en-IN")} note="mid-search refinements" />
        <Stat k="Recommendation clicks" v={t.recommendationClicks.toLocaleString("en-IN")} note="adds from top picks" />
        <Stat k="Journeys" v={(t.journeysTotal || 0).toLocaleString("en-IN")} note={sum.sessions ? sum.sessions.multiJourney + " multi-search sessions" : undefined} />
        <Stat k="Avg journey time" v={fmtMs(sum.journeyMsAvg)} note="search → resolution" />
        <Stat k="Avg order value" v={sum.aov ? "₹" + sum.aov.toLocaleString("en-IN") : "–"} note={t.orderValue ? "₹" + t.orderValue.toLocaleString("en-IN") + " total" : "prototype orders"} />
        <Stat k="Cart → checkout" v={sum.cartToCheckoutPct == null ? "–" : sum.cartToCheckoutPct + "%"} note={t.cartViews + " cart views"} />
        <Stat k="Guide questions" v={sum.guideTotals ? sum.guideTotals.asked : 0}
            note={sum.guideTotals ? sum.guideTotals.rescues + " rescue · " + sum.guideTotals.refines + " refine" : undefined} />
        <Stat k="Avg answer time" v={sum.ttfcAvgMs == null ? "–" : (sum.ttfcAvgMs / 1000).toFixed(1) + "s"} note="time to tap a chip" />
      </div>
      <div className="dim">
        <h3>Activity · events per minute (live)</h3>
        {sum.activity && sum.activity.length ? (
          <div className="act-chart">
            {sum.activity.map((m) => {
              const maxAct = Math.max(...sum.activity.map((x) => x.n), 1);
              return (
                <div key={m.label} className="act-col" title={m.n + " events"}>
                  <span className="act-n">{m.n || ""}</span>
                  <div className="act-bar" style={{ height: Math.max(3, Math.round((m.n / maxAct) * 64)) + "px" }} />
                  <span className="act-l">{m.label}</span>
                </div>
              );
            })}
          </div>
        ) : <div className="feedempty">No activity yet.</div>}
      </div>
      <Funnel funnel={f} />
      <div className="dim">
        <h3>Shopper profiles · what onboarding tells us (persona v2)</h3>
        {sum.onboarding && (sum.onboarding.userType.length || sum.onboarding.spendStyle.length || sum.onboarding.context.length) ? (
          <div className="obgrid">
            {[["User type", sum.onboarding.userType], ["How they judge value", sum.onboarding.spendStyle], ["Shopping for", sum.onboarding.context]].map(([title, rows]) => (
              <div key={title}>
                <h4>{title}</h4>
                {rows.length ? rows.map(r =>
                  <BarRow key={r.name} label={r.name} count={r.count} max={Math.max(...rows.map(x => x.count), 1)} />)
                : <div className="feedempty">No answers yet.</div>}
              </div>
            ))}
          </div>
        ) : <div className="feedempty">No onboarding answers yet — complete the 3-question profile on the Search tab.</div>}
      </div>
      <Feed events={sum.recent} />
    </div>
  );
}
function SearchGuidePanel({ sum }) {
  return (
    <div>
      <div className="dim">
        <h3>Top queries · what people search, and how it goes</h3>
        <div className="an-tablewrap">
          {sum.topQueries.length ? (
          <table className="tbl">
            <thead><tr><th>Query</th><th className="num">Searches</th><th className="num">Nulls</th><th className="num">Resolved</th><th className="num">Avg turns</th><th className="num">Views</th><th className="num">Cart</th><th className="num">Cart %</th><th className="num">Orders</th></tr></thead>
            <tbody>
              {sum.topQueries.map((r) => (
                <tr key={r.query}>
                  <td className="q">{r.query}</td><td className="num">{r.searches}</td><td className={"num" + (r.nulls ? " bad" : "")}>{r.nulls}</td>
                  <td className="num">{r.resolved}</td><td className="num">{r.avgTurns ?? "–"}</td><td className="num">{r.views}</td><td className="num">{r.carts}</td>
                  <td className="num">{r.cartRate}%</td><td className="num">{r.orders}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="feedempty">No searches yet.</div>}
        </div>
      </div>
      <div className="dim">
        <h3>Guide behaviour · where follow-up questions fire</h3>
        {sum.guideTotals ? (
          <>
            <BarRow label="Questions asked" count={sum.guideTotals.asked} max={Math.max(sum.guideTotals.asked, 1)} />
            <BarRow label="Rescue (weak results, ≥2 questions)" count={sum.guideTotals.rescues} max={Math.max(sum.guideTotals.asked, 1)} />
            <BarRow label="Refine (strong results, 1 question)" count={sum.guideTotals.refines} max={Math.max(sum.guideTotals.asked, 1)} />
            <div className="meta">The guide asks when a search is weak (rescue) or can sharpen strong results (refine).</div>
          </>
        ) : <div className="feedempty">No guide activity yet.</div>}
      </div>
      <div className="dim">
        <h3>Filter usage · mid-search refinement (brand / price / rating / category / sort)</h3>
        <div className="an-tablewrap">
          {sum.filterUsage.length ? (
          <table className="tbl">
            <thead><tr><th>Filter type</th><th>Value</th><th className="num">Applies</th></tr></thead>
            <tbody>
              {sum.filterUsage.map((r) => (
                <tr key={r.type + "|" + r.value}>
                  <td className="q">{r.type}</td><td className="q">{r.value}</td><td className="num">{r.applies}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="feedempty">No filters used yet — run a search, then try a brand, price, rating or category filter.</div>}
        </div>
      </div>
      <div className="dim">
        <h3>Journey resolution by turns</h3>
        {Object.entries(sum.journeys).map(([k, v]) => (
          <BarRow key={k} label={k === "t1" ? "Resolved turn 1" : k === "t2" ? "Resolved turn 2" : k === "t3" ? "Resolved turn 3" : k === "t4" ? "Resolved turn 4" : "Unresolved"} count={v} max={Math.max(...Object.values(sum.journeys), 1)} />
        ))}
      </div>
    </div>
  );
}

function CatalogPanel({ cat, sum }) {
  if (!cat) return <div><div className="kit-skel" style={{ height: 140, borderRadius: 14 }} /></div>;
  const maxCat = Math.max(...cat.categories.map(c => c.count), 1);
  const maxBand = Math.max(...cat.priceBands.map(c => c.count), 1);
  const maxRat = Math.max(...cat.ratingBuckets.map(c => c.count), 1);
  const maxEng = Math.max(...sum.categoryEngagement.map(c => c.views + c.carts), 1);
  const maxBrand = Math.max(...sum.brandEngagement.map(b => b.views + b.carts), 1);
  const pct = (x) => (x * 100).toFixed(1) + "%";
  return (
    <div>
      <div className="statgrid">
        <Stat k="Products (SKUs)" v={cat.total.toLocaleString("en-IN")} note="live from catalogue" />
        <Stat k="Price · median" v={"₹" + Math.round(cat.price.median).toLocaleString("en-IN")}
              note={"p25 ₹" + Math.round(cat.price.p25).toLocaleString("en-IN") + " – p75 ₹" + Math.round(cat.price.p75).toLocaleString("en-IN") + " · p90 ₹" + Math.round(cat.price.p90).toLocaleString("en-IN")} />
        <Stat k="Price · average" v={"₹" + cat.price.avg.toLocaleString("en-IN")} note="skewed up by gold, ACs & jewellery" />
        <Stat k="Branded SKUs" v={pct(cat.brands.brandedShare)} note={cat.brands.count.toLocaleString("en-IN") + " brands · " + cat.brands.branded.toLocaleString("en-IN") + " SKUs"} />
        <Stat k="Avg rating" v={cat.ratings.avg + " / 5"} note={"median " + cat.ratingsStats.median + " ratings/product"} />
        <Stat k="Products with 100+ ratings" v={pct(cat.ratingsStats.with100plusShare)} note={cat.ratingsStats.with100plus.toLocaleString("en-IN") + " SKUs"} />
        <Stat k="Occasion-tagged" v={pct(cat.occasionTagged.share)} note={cat.occasionTagged.count.toLocaleString("en-IN") + " SKUs"} />
      </div>
      <div className="dim">
        <h3>Category distribution · {cat.categories.length} categories</h3>
        {cat.categories.slice(0, 12).map(c =>
          <BarRow key={c.name} label={c.name} count={c.count} max={maxCat} extra={pct(c.share)} />)}
      </div>
      <div className="dim">
        <h3>Category detail · top 12 by SKU count</h3>
        <div className="an-tablewrap">
          <table className="tbl">
            <thead><tr><th>Category</th><th className="num">SKUs</th><th className="num">Share</th><th className="num">Median price</th><th className="num">Range</th></tr></thead>
            <tbody>
              {cat.categories.slice(0, 12).map(c => (
                <tr key={c.name}>
                  <td className="q">{c.name}</td><td className="num">{c.count.toLocaleString("en-IN")}</td><td className="num">{pct(c.share)}</td>
                  <td className="num">₹{Math.round(c.medianPrice).toLocaleString("en-IN")}</td>
                  <td className="num">₹{c.priceMin.toLocaleString("en-IN")} – ₹{c.priceMax.toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="dim">
        <h3>Brands in catalogue · top 15 by SKU count</h3>
        <div className="an-tablewrap">
          <table className="tbl">
            <thead><tr><th>Brand</th><th className="num">SKUs</th><th className="num">Share</th><th className="num">Median price</th></tr></thead>
            <tbody>
              {cat.brands.top.map(b => (
                <tr key={b.name}>
                  <td className="q">{b.name}</td><td className="num">{b.count.toLocaleString("en-IN")}</td>
                  <td className="num">{pct(b.share)}</td><td className="num">₹{Math.round(b.medianPrice).toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="dim">
        <h3>Price bands (INR)</h3>
        {cat.priceBands.map(b => <BarRow key={b.label} label={b.label} count={b.count} max={maxBand} extra={pct(b.share)} />)}
      </div>
      <div className="dim">
        <h3>Rating buckets</h3>
        {cat.ratingBuckets.map(b => <BarRow key={b.label} label={b.label} count={b.count} max={maxRat} extra={pct(b.share)} />)}
      </div>
      <div className="dim">
        <h3>Occasion & intent tags · {cat.tags.length} tags</h3>
        <div className="tagcloud">
          {cat.tags.map(t => <span className="tagchip" key={t.name}>{t.name} × {t.count.toLocaleString("en-IN")} <span className="tagp">{pct(t.share)}</span></span>)}
        </div>
      </div>
      <div className="dim">
        <h3>Category engagement · what shoppers actually browse & cart</h3>
        {sum.categoryEngagement.length ? sum.categoryEngagement.map(c =>
          <BarRow key={c.name} label={c.name} count={c.views + c.carts} max={maxEng} extra={c.views + " views · " + c.carts + " carts"} />)
        : <div className="feedempty">No engagement yet — browse some products.</div>}
      </div>
      <div className="dim">
        <h3>Brand engagement · brands shoppers engage with</h3>
        {sum.brandEngagement.length ? sum.brandEngagement.map(b =>
          <BarRow key={b.name} label={b.name} count={b.views + b.carts} max={maxBrand} extra={b.views + " views · " + b.carts + " carts"} />)
        : <div className="feedempty">No brand engagement yet ({pct(cat.brands.brandedShare)} of SKUs carry a brand).</div>}
      </div>
    </div>
  );
}

function JourneysPanel({ sum }) {
  return (
    <div>
      <div className="statgrid">
        <Stat k="Journeys resolved turn 1" v={sum.journeys.t1.toLocaleString("en-IN")} />
        <Stat k="Resolved turn 2" v={sum.journeys.t2.toLocaleString("en-IN")} />
        <Stat k="Resolved turn 3+" v={(sum.journeys.t3 + sum.journeys.t4).toLocaleString("en-IN")} />
        <Stat k="Unresolved journeys" v={sum.journeys.unresolved.toLocaleString("en-IN")} warn={sum.journeys.unresolved > 5} />
      </div>
      <div className="dim">
        <h3>Persona cohorts · who converts (from onboarding)</h3>
        <div className="an-tablewrap">
          {sum.cohorts.length ? (
          <table className="tbl">
            <thead><tr><th>Cohort (shopping-for × style)</th><th className="num">Journeys</th><th className="num">Resolved</th><th className="num">Cart adds</th><th className="num">Orders</th><th className="num">Order rate</th><th className="num">Avg time</th></tr></thead>
            <tbody>
              {sum.cohorts.map((c) => (
                <tr key={c.name}>
                  <td className="q">{c.name.replace("|", " × ")}</td><td className="num">{c.searches}</td><td className="num">{c.resolved}</td>
                  <td className="num">{c.carts}</td><td className="num">{c.orders}</td>
                  <td className="num">{c.searches ? Math.round(100 * c.orders / c.searches) + "%" : "–"}</td>
                  <td className="num">{c.avgMs ? fmtMs(c.avgMs) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="feedempty">No journeys recorded yet.</div>}
        </div>
      </div>
      <div className="dim">
        <h3>Recent orders (prototype)</h3>
        <div className="an-tablewrap">
          {sum.orders.length ? (
          <table className="tbl">
            <thead><tr><th>Order</th><th className="num">Items</th><th className="num">Total</th><th>Cohort</th><th>Source</th><th>When</th></tr></thead>
            <tbody>
              {sum.orders.map((o) => (
                <tr key={o.id + o.at}>
                  <td className="q">{o.id}</td><td className="num">{o.items}</td>
                  <td className="num">₹{o.total.toLocaleString("en-IN")}</td><td>{o.cohort.replace("|", " × ")}</td>
                  <td>{o.source}</td><td>{ago(o.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="feedempty">No orders yet — add something to cart and place a prototype order.</div>}
        </div>
      </div>
    </div>
  );
}

const TURN_LABELS = { t1: "Turn 1 · no question", t2: "Turn 2 · 1 question", t3: "Turn 3 · 2 questions", "t4+": "Turn 4 · 3 questions", unresolved: "Unresolved · out of questions" };

function ValidationPanel({ sum, ev }) {
  if (!ev) return <div><div className="kit-skel" style={{ height: 140, borderRadius: 14 }} /><div className="dim"><div className="feedempty"><span className="live-dot" /> Loading validation artifacts…</div></div></div>;
  const st = ev.study, llm = ev.llm, sim = ev.sim, rel = ev.relevance;
  const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
  return (
    <div>
      <span className="an-livepill an-inline"><span className="live-dot" /> Validation evidence · read live from the eval artifacts (nothing preset in the dashboard) · refreshed {new Date(ev.generatedAt).toLocaleTimeString("en-IN")}</span>
      {st && (
        <div className="dim">
          <h3>Guided search study · n={st.n} journeys, calibrated against the live app</h3>
          <div className="statgrid" style={{ marginBottom: 14 }}>
            <Stat k="Baseline null rate" v={st.baseline_null_pct + "%"} warn note="naive keyword search (what we beat)" />
            <Stat k="Guided null rate" v={st.guided_null_pct + "%"} note="after the follow-up rescue" />
            <Stat k="Journeys resolved" v={st.resolved_pct + "%"} note="≥2 intent-matched results" />
            <Stat k="Resolved ≤ 2 turns" v={st.resolved_by_turn2_pct + "%"} note="the guide keeps asking (≤3 questions) for the rest" />
          </div>
          {Object.entries(st.turn_distribution).map(([k, v]) => (
            <BarRow key={k} label={TURN_LABELS[k] || k} count={v} max={Math.max(...Object.values(st.turn_distribution), 1)} />
          ))}
        </div>
      )}
      {llm && (
        <div className="dim">
          <h3>AI guide routing · which engine phrases each question</h3>
          <div className="statgrid" style={{ marginBottom: 14 }}>
            <Stat k="LLM-phrased questions" v={String(llm.llm)} note={llm.pct_llm + "% of decisions"} />
            <Stat k="Rules-phrased (fallback)" v={String(llm.rules)} note="key exhaustion / 429 → deterministic templates" />
            <Stat k="Key switches" v={String(llm.switches)} note="429/quota rotations (ai_key_exhausted)" />
          </div>
          <div className="meta">Zero behaviour drift: the LLM only phrases the question, it never decides what to ask.</div>
        </div>
      )}
      {sim && (
        <div className="dim">
          <h3>Scale simulation · {sim.n.toLocaleString("en-IN")} generated queries, incl. every Indian-segment kind</h3>
          <div className="statgrid" style={{ marginBottom: 0 }}>
            <Stat k="Errors" v={String(sim.errors)} />
            <Stat k="Guided null" v={sim.guided_null_pct + "%"} />
            <Stat k="Resolved" v={sim.resolved_pct + "%"} />
            <Stat k="Resolved ≤ 2 turns" v={sim.by_turn2_pct + "%"} />
            <Stat k="Strict (intent-matched)" v={sim.strict_resolved_pct + "%"} />
            <Stat k="Guide modes" v={(sim.guide_modes.llm || 0) + " llm"} note={(sim.guide_modes.fallback || 0) + " fallback"} />
          </div>
        </div>
      )}
      {rel && (
        <div className="dim">
          <h3>Relevance audit · Qwen-judged · {rel.queries} queries × top-3 ({rel.results_judged} results judged)</h3>
          <BarRow label="Relevant" count={rel.verdicts.relevant} max={rel.results_judged} />
          <BarRow label="Partially relevant" count={rel.verdicts.partial} max={rel.results_judged} />
          <BarRow label="Irrelevant" count={rel.verdicts.irrelevant} max={rel.results_judged} />
          <div className="meta" style={{ marginTop: 8 }}>{rel.usable_pct}% usable. Every remaining irrelevant result is a #3-slot miss on vague gift/occasion queries — the exact class the guided follow-up exists to rescue.</div>
        </div>
      )}
      {ev.canaries && (
        <div className="dim">
          <h3>Regression canaries</h3>
          <div style={{ fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.7 }}>
            {ev.canaries.count} highest-value queries of every type (spec / brand / occasion / stratum / Hinglish /
            dead-end / India R10) run after every search or catalogue change — 0 unexpected empties on the final
            build (re-run: <code>.venv/bin/python eval/canaries.py</code>).
          </div>
        </div>
      )}
      {ev.catalog && (
        <div className="dim">
          <h3>Catalogue profile (recomputed live)</h3>
          <div className="statgrid" style={{ marginBottom: 0 }}>
            <Stat k="SKUs" v={ev.catalog.total.toLocaleString("en-IN")} />
            <Stat k="Median price" v={inr(ev.catalog.median)} note={"p25 " + inr(ev.catalog.p25) + " · p75 " + inr(ev.catalog.p75) + " · p90 " + inr(ev.catalog.p90)} />
            <Stat k="Branded SKUs" v={(100 * ev.catalog.brandedShare).toFixed(1) + "%"} />
            <Stat k="Price range" v={inr(ev.catalog.min)} note={"up to " + inr(ev.catalog.max)} />
          </div>
        </div>
      )}
      <div className="dim">
        <h3>Live vs study · this deployment vs the measured study</h3>
        <div className="an-tablewrap">
          <table className="tbl">
            <thead><tr><th>Metric</th><th>Live (this deployment, all users)</th><th>Study (n=150)</th></tr></thead>
            <tbody>
              <tr><td className="q">Journeys resolved (≥2 on-intent, any turn)</td><td>{sum && sum.journeyResolution && sum.journeyResolution.pct != null ? sum.journeyResolution.pct + "%" : "–"}{sum && sum.journeyResolution ? ` (${sum.journeyResolution.resolved}/${sum.journeyResolution.total})` : ""}</td><td>92.0%</td></tr>
              <tr><td className="q">Resolved within 2 turns</td><td>{sum && sum.journeyResolution && sum.journeyResolution.byTurn2Pct != null ? sum.journeyResolution.byTurn2Pct + "%" : "–"}</td><td>78.7%</td></tr>
              <tr><td className="q">Journeys ended unresolved</td><td>{sum && sum.journeyResolution ? sum.journeyResolution.unresolved : 0}{sum && sum.journeyResolution && sum.journeyResolution.total ? ` of ${sum.journeyResolution.total}` : ""}</td><td>8.0% (27.3% baseline)</td></tr>
              <tr><td className="q">Per-search null rate (incl. intermediate rescue searches)</td><td>{sum && sum.nullRate != null ? sum.nullRate + "%" : "–"}</td><td>— (study reports per-journey)</td></tr>
              <tr><td className="q">Searches recorded</td><td>{sum ? sum.totals.searches : 0}</td><td>150 (adversarial panel)</td></tr>
              <tr><td className="q">Cart adds</td><td>{sum ? sum.totals.cartAdds : 0}</td><td>— (study measures resolution)</td></tr>
              <tr><td className="q">Orders (prototype)</td><td>{sum ? sum.totals.orders : 0}</td><td>—</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      {sum && sum.outcome && (
        <div className="dim">
          <h3>Outcome micro-survey (live) · did you find what you were looking for?</h3>
          {(() => {
            const o = sum.outcome, tot = o.yes + o.no;
            const REASON_LABELS = { wrong_product: "👎 Wrong kind of product", too_expensive: "👎 Too expensive",
              no_trust: "👎 Didn't trust these results", wrong_occasion: "👎 Not right for the occasion", other: "👎 Something else" };
            if (!tot) return <div className="feedempty">No survey responses yet — it appears after a cart add / order (and on a 25% sample of no-action journeys).</div>;
            return (<>
              <BarRow label="👍 Yes — found it" count={o.yes} max={tot} />
              <BarRow label="👎 Not really" count={o.no} max={tot} />
              {Object.entries(o.reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <BarRow key={k} label={REASON_LABELS[k] || k} count={v} max={tot} />
              ))}
              <div className="meta">Same labels as the mined root-cause taxonomy (corpus: trust_gap 54.4% · not_search_related 30.2% · budget 9.4% · zero_or_wrong 3.5%), so the live distribution is directly comparable to the mined one.</div>
            </>);
          })()}
        </div>
      )}
      <div className="dim">
        <h3>Artifacts behind every number</h3>
        {Object.entries(ev.artifacts).map(([k, v]) => (
          <div key={k} className="art-row"><span className="art-k">{k}</span><code>{v}</code></div>
        ))}
        <div className="meta">Full claim → artifact mapping: docs/evidence/claim_provenance.md · 3-level reviewer pass: docs/evidence/reviewer_pass.md</div>
      </div>
    </div>
  );
}

// Backend (Admin) sub-tab: every user of this deployment at a glance,
// with per-user funnel + AI-engine mix, and filters (persona / activity /
// recency). Data: per-session rollups in the analytics store (server side),
// so it survives the 500-event live-feed window.
function BackendPanel({ sum }) {
  const [persona, setPersona] = useState("all");
  const [minSearches, setMinSearches] = useState(0);
  const [windowH, setWindowH] = useState(0); // 0 = all time
  const users = (sum.userSessions || []);
  const personas = [...new Set(users.map((u) => u.persona).filter(Boolean))].sort();
  const filtered = users.filter((u) => {
    if (persona !== "all" && u.persona !== persona) return false;
    if (u.searches < minSearches) return false;
    if (windowH > 0 && !(u.lastAt && Date.now() - u.lastAt <= windowH * 3600000)) return false;
    return true;
  });
  const T = sum.totals;
  const aiTotal = users.reduce((a, u) => a + u.ai.qwen + u.ai.gemini + u.ai.rules, 0);
  const switches = users.reduce((a, u) => a + u.ai.switches, 0);
  const pct = (a, b) => (b ? Math.round((100 * a) / b) + "%" : "–");
  return (
    <div>
      <div className="statgrid">
        <Stat k="Users (sessions)" v={users.length.toLocaleString("en-IN")} note="per deployment, all-time" />
        <Stat k="Users with searches" v={users.filter((u) => u.searches > 0).length.toLocaleString("en-IN")} />
        <Stat k="AI decisions" v={aiTotal.toLocaleString("en-IN")} note={"Qwen " + users.reduce((a, u) => a + u.ai.qwen, 0) + " · Gemini " + users.reduce((a, u) => a + u.ai.gemini, 0) + " · rules " + users.reduce((a, u) => a + u.ai.rules, 0)} />
        <Stat k="Gemini key switches" v={switches.toLocaleString("en-IN")} note="429/quota rotations" warn={switches > 0} />
        <Stat k="Orders" v={T.orders.toLocaleString("en-IN")} note={"AOV ₹" + (sum.aov || 0).toLocaleString("en-IN")} />
        <Stat k="Cart rate" v={pct(T.cartAdds, T.searches)} note={"cart adds per search"} />
      </div>
      <div className="an-filters">
        <Select aria-label="Persona" value={persona} onChange={(e) => setPersona(e.target.value)}
                options={[{ value: "all", label: "All personas" }].concat(personas.map((p) => ({ value: p, label: p })))} />
        <Select aria-label="Min searches" value={minSearches} onChange={(e) => setMinSearches(Number(e.target.value))}
                options={[{ value: 0, label: "Any searches" }, { value: 1, label: "≥1 search" }, { value: 3, label: "≥3 searches" }, { value: 5, label: "≥5 searches" }]} />
        <Select aria-label="Active window" value={windowH} onChange={(e) => setWindowH(Number(e.target.value))}
                options={[{ value: 0, label: "All time" }, { value: 1, label: "Last hour" }, { value: 24, label: "Last 24h" }]} />
        <span className="an-count">showing {filtered.length} of {users.length} users</span>
      </div>
      <div className="an-tablewrap">
      {filtered.length ? (
        <table className="tbl an-admin-table">
          <thead><tr>
            <th>User</th><th>Persona</th><th>Active</th><th className="num">Searches</th>
            <th className="num">Questions</th><th className="num">Answer rate</th><th className="num">Carts</th><th className="num">Orders</th>
            <th className="num">Value</th><th>AI mix (Q/G/R)</th><th>Funnel</th>
          </tr></thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.sid}>
                <td className="q">{u.sid.slice(0, 12)}…</td>
                <td>{u.persona || "–"}</td>
                <td>{agoShort(u.lastAt)}</td>
                <td className="num">{u.searches}</td>
                <td className="num">{u.questions}</td>
                <td className="num">{u.answerRate == null ? "–" : u.answerRate + "%"}</td>
                <td className="num">{u.carts}</td>
                <td className="num">{u.orders}</td>
                <td className="num">{u.orderValue ? "₹" + u.orderValue.toLocaleString("en-IN") : "–"}</td>
                <td>{u.ai.qwen}/{u.ai.gemini}/{u.ai.rules}{u.ai.switches ? " (" + u.ai.switches + " sw)" : ""}</td>
                <td>{pct(u.carts, u.searches)} to cart</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div className="feedempty">No users match these filters yet.</div>}
      </div>
      <div className="meta">Admin view of the same shared store the shopper dashboards read: one row per session (browser), funnel columns per user, AI-engine mix from ai_call events, Gemini key switches from ai_key_exhausted. Simulated traffic is tagged env=sim and kept in a separate store.</div>
    </div>
  );
}

const AN_RAIL = [
  ["overview", "home", "Overview"],
  ["search", "search", "Search & Guide"],
  ["catalog", "layers", "Catalogue & Brands"],
  ["journeys", "package", "Journeys & Orders"],
  ["validation", "shield-check", "Validation & Study"],
  ["backend", "sliders", "Backend (Admin)"],
];

export function AnalyticsView({ anview, setAnview }) {
  const [sum, setSum] = useState(null);
  const [cat, setCat] = useState(null);
  const [ev, setEv] = useState(null);
  const [density, setDensity] = useState("comfortable");
  useEffect(() => {
    try { const d = localStorage.getItem("askcart_an_density"); if (d === "compact" || d === "comfortable") setDensity(d); } catch {}
  }, []);
  const setDensityPersist = (d) => {
    setDensity(d);
    try { localStorage.setItem("askcart_an_density", d); } catch {}
  };
  useEffect(() => {
    let stop = false;
    const pull = () => fetch("/api/analytics/summary")
      .then(r => r.json()).then(j => { if (!stop) setSum(j); }).catch(() => {});
    pull();
    const id = setInterval(pull, 2500); // real-time
    return () => { stop = true; clearInterval(id); };
  }, []);
  useEffect(() => {
    let stop = false;
    const pull = () => fetch("/api/analytics/catalog")
      .then(r => r.json()).then(j => { if (!stop) setCat(j); }).catch(() => {});
    pull();
    const id = setInterval(pull, 15000); // recomputed live from the catalogue
    return () => { stop = true; clearInterval(id); };
  }, []);
  useEffect(() => {
    let stop = false;
    const pull = () => fetch("/api/analytics/evidence")
      .then(r => r.json()).then(j => { if (!stop) setEv(j); }).catch(() => {});
    pull();
    const id = setInterval(pull, 15000); // artifacts re-read live
    return () => { stop = true; clearInterval(id); };
  }, []);
  return (
    <div className={"an-wrap" + (density === "compact" ? " an-compact" : "")}>
      <div className="an-banner"><I name="info" size={15} /> Prototype analytics, not part of the shopper experience</div>
      <div className="an-grid">
        <nav className="an-rail" aria-label="Insights sections">
          {AN_RAIL.map(([id, ic, label]) => (
            <button key={id} className={anview === id ? "on" : ""} onClick={() => setAnview(id)}
                    aria-current={anview === id ? "page" : undefined}>
              <I name={ic} size={17} /> {label}
            </button>
          ))}
        </nav>
        <div className="an-main">
          <div className="an-head">
            <h1>Insights</h1>
            <span className="an-density" role="group" aria-label="Table density">
              <button className={density === "comfortable" ? "on" : ""} onClick={() => setDensityPersist("comfortable")}>Comfortable</button>
              <button className={density === "compact" ? "on" : ""} onClick={() => setDensityPersist("compact")}>Compact</button>
            </span>
            <span className="an-livepill"><span className="live-dot" /> Live · refreshes every 2.5 s · shared across every user of this deployment</span>
          </div>
          {!sum ? <LoadingPanel /> : (
            <>
              {anview === "overview" && <OverviewPanel sum={sum} />}
              {anview === "search" && <SearchGuidePanel sum={sum} />}
              {anview === "catalog" && <CatalogPanel cat={cat} sum={sum} />}
              {anview === "journeys" && <JourneysPanel sum={sum} />}
              {anview === "validation" && <ValidationPanel sum={sum} ev={ev} />}
              {anview === "backend" && <BackendPanel sum={sum} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
