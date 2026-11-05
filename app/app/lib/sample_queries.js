// Single source of truth for the "popular" example queries shown on the
// search hero and the zero-results fallback. Dimension coverage: budget,
// occasion, recipient (incl. Hinglish relations), appliance spec, cheap
// (sasta), and vague intent. Every chip was verified against the live
// search API on 2026-11-05 (>=2 on-intent results, on-topic top pick).
// Clicks are tracked with source:"example" and surface in Analytics ->
// Search & Guide -> Top queries (event stream). The semantic query-emb
// cache precomputes these (scripts/build_embeddings.mjs), so clicking a
// chip costs zero runtime embedding calls.
export const SAMPLE_QUERIES = [
  "shaadi gift under 2k",
  "budget headphones under 3000",
  "diwali decorations",
  "gift for 5 year old",
  "phone under 15k for college",
  "wristwatch for dad under 5k",
  "diwali gift under 1k",
  "saree under 2k",
  "saree for ammi",
  "kurta for bhai",
  "1.5 ton ac under 45k",
  "43 inch tv under 35k",
  "laptop under 50k for college",
  "500w mixer grinder",
  "7 kg washing machine under 25k",
  "sasta smartwatch",
  "ammi ke liye gift",
  "something for my room",
];
