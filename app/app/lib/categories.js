// Display-only category labels (shared: page, header, footer).
export const DISPLAY_CATEGORY = {
  "AMAZON FASHION": "Fashion",
  "Amazon Home": "Home & Kitchen",
  "All Electronics": "Electronics",
  "All Beauty": "Beauty",
};
export function displayCat(c) { return DISPLAY_CATEGORY[c] || c; }
