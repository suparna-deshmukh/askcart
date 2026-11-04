// The semantic-fallback vector index (app/data/catalog_emb.*) is ~14 MB of
// server-side-only data. It must be bundled with the /api/search function
// but must NEVER ship to the browser (it lives in data/, not public/).
module.exports = {
  outputFileTracingIncludes: {
    "/api/search": ["./data/**"],
  },
};
