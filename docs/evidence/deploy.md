# Deployment Status

## Agentic extractor - Hugging Face Space (LIVE)
- URL: https://pm-ai-18-askcart-extractor.static.hf.space/
  (deep links: ?tab=causes, ?tab=agent, ?tab=trends, ?tab=bayes, ?tab=probe)
- Static space (same hosting pattern as pm-ai-18/photo-retrieval-discovery):
  bundled pipeline artifacts + agent audit; all analysis runs in the browser;
  live probe tab pulls fresh App Store RSS directly (CORS-open) and will also
  use the Vercel /probe endpoint (play/appstore/reddit) once it deploys
  (space_askcart/data.json -> vercel_probe_url, currently null).
- Source: space_askcart/ (rebuilt with .venv/bin/python scripts/build_hf_space.py);
  pushed via huggingface_hub create_commit (upload_folder's pipelined path
  401s on this hub version - create_commit works).
- No LLM calls from the space; no Gemini anywhere in the project.

## Extractor / evidence API (this Vercel account)
- Package: `extractor/deploy/` (vercel.json -> api/index.py ASGI function,
  requirements: pandas, pyarrow, requests, google-play-scraper; bundles the
  pipeline artifacts under data/).
- Status: **deployment staged, build-verified locally, blocked by the Vercel
  free-plan daily limit** ("api-deployments-free-per-day: more than 100")
  hit on 2026-11-03 ~10:30 UTC after ~100 earlier deployments on the account
  today. `scripts/vercel_watch_and_deploy.sh` retries every 30 min and logs to
  `logs/vercel_watch.log`; it curls /funnel on the new URL to verify.
- Manual: `cd extractor/deploy && vercel --prod --yes`
- Routes (all verified locally against the same code):
  - GET /           -> service info + funnel + counts
  - GET /funnel     -> 6-stage funnel across 5 review sources
  - GET /root-causes-> 4 root causes + evidence quotes
  - GET /bayesian   -> per-app Bayesian ratings (m=100) + complaint rates
  - GET /trends     -> demand/seasonality insights (suggest + pageviews)
  - GET /sources    -> corpus counts by source
  - POST /probe     -> live mini-extraction probe (play|appstore|reddit)
- Re-stage artifacts after the final pipeline:
  `.venv/bin/python scripts/stage_deploy.py`

## MVP (second Vercel account - later, per plan)
- `app/` is a standard Next.js 15 app; deploy as-is:
  1. log in to the second account (the Bits email), `cd app && vercel`
  2. set env var `GEMINI_API_KEY` (and optional `GEMINI_MODEL`)
     for the LLM guided follow-ups; without them the deterministic
     rule-based guide is used - both verified
  3. `vercel --prod`
- No secrets are committed; `.env` is git-ignored.
