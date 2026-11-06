// Brief §8.1: WCAG contrast gate. Body text >= 4.5:1, large text/UI >= 3:1.
// Run: node scripts/contrast_check.js  (exit 1 on any body-text failure)
const fs = require("fs");
const path = require("path");
const css = fs.readFileSync(path.join(__dirname, "..", "app", "app", "globals.css"), "utf8");
const tok = (name) => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!m) throw new Error(`token --${name} not found in globals.css`);
  return m[1];
};
const hex = (h) => {
  const s = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
};
const lum = ([r, g, b]) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [l1, l2] = [lum(hex(a)), lum(hex(b))].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};
const PAIRS = [
  // [fg, bg, label, min]
  [tok("text"), tok("bg"), "text on bg (body)", 4.5],
  [tok("text"), tok("surface"), "text on surface (body)", 4.5],
  [tok("text-2"), tok("bg"), "text-2 on bg", 4.5],
  [tok("text-2"), tok("surface"), "text-2 on surface", 4.5],
  [tok("text-3"), tok("bg"), "text-3 on bg (meta)", 4.5],
  [tok("text-3"), tok("surface"), "text-3 on surface (meta)", 4.5],
  [tok("guide-text"), tok("guide-bg"), "guide-text on guide-bg", 4.5],
  ["#FFFFFF", tok("brand"), "white on brand (buttons)", 4.5],
  [tok("brand"), tok("brand-tint"), "brand on brand-tint (badges/chips)", 4.5],
  [tok("success"), tok("success-bg"), "success on success-bg (rating pill)", 4.5],
  [tok("warning"), tok("warning-bg"), "warning on warning-bg", 4.5],
  [tok("danger"), tok("danger-bg"), "danger on danger-bg", 4.5],
  [tok("text-2"), tok("surface-2"), "text-2 on surface-2 (chips)", 3.0],
  [tok("brand"), tok("surface"), "brand on surface (active nav)", 3.0],
  [tok("live"), tok("bg"), "live dot on bg (UI, large)", 3.0],
  [tok("guide-text"), tok("surface"), "guide-text on surface (why box)", 4.5],
  ["#FFFFFF", tok("ink-900"), "white on ink-900 (Buy now / toasts)", 4.5],
  [tok("guide-on-dark"), tok("brand-900"), "guide-on-dark on brand-900 (announce bar, large)", 3.0],
  ["#FFFFFF", tok("brand-900"), "white on brand-900 (footer headings)", 4.5],
  [tok("on-dark-2"), tok("brand-900"), "on-dark-2 on brand-900 (footer body)", 4.5],
  ["#FFFFFF", tok("brand-hover"), "white on brand-hover (button hover)", 4.5],
  [tok("text"), tok("brand-50"), "text on brand-50 (hover rows)", 4.5],
  [tok("text-3"), tok("surface-3"), "text-3 on surface-3 (muted fills, UI)", 3.0],
  [tok("text-2"), tok("surface-3"), "text-2 on surface-3 (feed neutral chip, body)", 4.5],
  [tok("text-3"), tok("surface-2"), "text-3 on surface-2 (sticky th, density off, body)", 4.5],
  [tok("danger"), tok("surface"), "danger on surface (warn KPI value, body)", 4.5],
  [tok("brand"), tok("brand-50"), "brand on brand-50 (conv chips, feed chip, body)", 4.5],
];
let fail = 0;
for (const [fg, bg, label, min] of PAIRS) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${r.toFixed(2)}:1  (min ${min})  ${label}`);
}
process.exit(fail ? 1 : 0);
