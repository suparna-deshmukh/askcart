---
title: AskCart - Agentic E-Commerce Search Extractor
emoji: "🛒"
colorFrom: blue
colorTo: yellow
sdk: static
app_file: index.html
pinned: false
---

AskCart: an agentic extractor + evidence explorer for e-commerce search UX. 94,643 public reviews from 5 sources (Play Store, App Store, Reddit, Amazon product reviews, Trustpilot) cut to 4 root causes by a 6-stage SQL pipeline with Bayesian app ratings and Qwen-verified labels. Includes the LLM-planned agent decision audit (Qwen38-27B), demand/seasonality signals, and a live mini-extraction probe.

All analysis runs in your browser from bundled artifacts. The extractor's LLM is Qwen38-27B via the owner's LiteLLM proxy; no Gemini or other vendor model is used. Companion MVP (guided shopping search, 25K SKUs): separate Vercel deploy. Do not paste personal information into the probe fields.
