// §9 guard unit checks for the canary suite (in-process, zero HTTP/LLM).
// Usage: node eval/s9_guard_units.mjs <unit>
// Prints a single JSON line: {"ok":bool,"reason":string,"extra":...}
import { loadCatalog } from '../app/lib/catalog.js';
import { search } from '../app/lib/search.js';
import { buildIntentView } from '../app/lib/guide.js';
import { validateGuideQuestion, validateRecommendationRail, guardState, itemRelation } from '../app/lib/guard.js';

const unit = process.argv[2] || '';
const out = (ok, reason = '', extra = null) => { console.log(JSON.stringify({ ok, reason, extra })); process.exit(ok ? 0 : 1); };
const catalog = loadCatalog();
const proj = (rs) => rs.map(r => ({ sku: r.sku, title: r.title, price: r.price, brand: r.brand, category: r.category, tags: r.tags, intent: r.intent }));
const ivOf = (v) => { const it = v.filter(x => x.intent); return buildIntentView(it.length >= 3 ? it : v); };

// base world: the named case (cookware + birthday) — 0 brands on-intent
const vis = proj(search(catalog, 'non stick cookware set birthday', { relax: true, limit: 48 }));
const iv = ivOf(vis);
const st = guardState();

if (unit === 'bad_fashion_brands') {
  const before = st.fallbacks;
  const bad = { ask: true, type: 'brand', question: 'Any brand preference?',
    options: ['Zariin', 'Pepe Jeans', 'Azzam'],
    optionCounts: [{ label: 'Zariin', count: 186 }, { label: 'Pepe Jeans', count: 180 }, { label: 'Azzam', count: 177 }] };
  const g = validateGuideQuestion(bad, iv, vis, {}, []);
  out(g.ok === false && g.reason === 'guard:ungrounded' && (g.question.options || []).length === 0 && st.fallbacks === before + 1,
      g.reason, { counter: st.fallbacks - before });
}
if (unit === 'count_mismatch') {
  // brand-rich world: iv must contain the label for rule 2 to be reachable
  const hvis = proj(search(catalog, 'headphones under 3000', { limit: 48 }));
  const hiv = ivOf(hvis);
  const before = st.fallbacks;
  const b = (hiv.brands || [])[0] && (hiv.brands || [])[0].name;
  const rc = hvis.filter(v => v.brand === b).length;
  const bad = { ask: true, type: 'brand', question: 'Any brand preference?',
    options: [b], optionCounts: [{ label: b, count: rc + 1 }] };
  const g = validateGuideQuestion(bad, hiv, hvis, {}, []);
  out(g.ok === false && g.reason === 'guard:count_mismatch' && st.fallbacks === before + 1, g.reason, { brand: b, recount: rc });
}
if (unit === 'reask') {
  const before = st.fallbacks;
  const q = { ask: true, type: 'brand', question: 'Any brand preference?', options: [], optionCounts: [] };
  const g = validateGuideQuestion(q, iv, vis, {}, ['brand']);
  out(g.ok === false && g.reason === 'guard:reask' && st.fallbacks === before + 1, g.reason);
}
if (unit === 'thin') {
  // one live option only -> typed-only downgrade (brand-rich world)
  const hvis = proj(search(catalog, 'headphones under 3000', { limit: 48 }));
  const hiv = ivOf(hvis);
  const before = st.fallbacks;
  const b = (hiv.brands || [])[0] && (hiv.brands || [])[0].name;
  const n = hvis.filter(v => v.brand === b).length;
  const q = { ask: true, type: 'brand', question: 'Any brand preference?',
    options: [b], optionCounts: [{ label: b, count: n }] };
  const g = validateGuideQuestion(q, hiv, hvis, {}, []);
  out(g.ok === false && g.reason === 'guard:thin' && (g.question.options || []).length === 0 && st.fallbacks === before + 1, g.reason);
}
if (unit === 'rail_drop_hide') {
  const before = st.railDrops;
  const anchor = vis.find(v => v.brand) || vis[0];
  const stray = { sku: 'stray-1', title: 'Totally unrelated quantum widget', price: 999, brand: 'QuantumCo', category: 'OFFICE PRODUCTS', tags: [] };
  const g = validateRecommendationRail([anchor, stray], { item: anchor, query: 'non stick cookware set' }, { surface: 'ui_check', min: 3, mode: 'item' });
  out(g.dropped === 1 && g.hidden === true && st.railDrops === before + 1, '', { items: g.items.length, dropped: g.dropped, hidden: g.hidden });
}
if (unit === 'rail_relation') {
  // every kept item carries a NAMED relation; a category-matching item passes, a stray fails
  const anchor = vis[0];
  const sameCat = vis.find(v => v.category === anchor.category && v.sku !== anchor.sku) || anchor;
  const stray = { sku: 'stray-2', title: 'Unrelated gizmo', price: 5, brand: 'GizmoCo', category: 'OFFICE PRODUCTS', tags: [] };
  const g = validateRecommendationRail([sameCat, stray], { item: anchor, query: 'x' }, { surface: 'ui_check', min: 1, mode: 'item' });
  const rel = g.items.map(it => itemRelation(it, { item: anchor, query: 'x' }));
  out(!!(g.dropped === 1 && rel.every(r => r && r.name) && g.relation), String(g.relation || "missing"), { kept: g.items.length });
}
out(false, 'unknown-unit:' + unit);
