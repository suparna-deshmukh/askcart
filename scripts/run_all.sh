#!/bin/zsh
# AskCart one-shot reproduction (data -> pipeline -> labels -> catalog -> study).
# Prereqs: .venv (pandas duckdb sklearn pyarrow google-play-scraper matplotlib),
# app/node_modules, dev server on :3000. LLM (Qwen via LiteLLM proxy) is optional -
# every stage has a zero-LLM path.
set -e
cd ~/askcart
echo "== 1. corpus (resume-safe; live sources only) =="
.venv/bin/python extractor/collect_play.py          || echo "play: partial (see logs/)"
.venv/bin/python extractor/collect_appstore.py      || echo "appstore: live RSS empty?"
.venv/bin/python extractor/collect_reddit.py        || echo "reddit: partial (see logs/)"
.venv/bin/python extractor/collect_amazon_reviews.py
.venv/bin/python extractor/collect_trustpilot.py
.venv/bin/python extractor/collect_trends.py
echo "== 2. pipeline pass 1 =="
.venv/bin/python pipeline/run_pipeline.py
echo "== 3. LLM-verified labels (Qwen; empty file if unavailable) =="
# ASKCART_LLM_SAMPLE=6041 for a full-corpus re-label (v7, ~1.5-2 h, 4 shards)
.venv/bin/python extractor/extract_llm.py --sample ${ASKCART_LLM_SAMPLE:-600} || true
echo "== 4. pipeline pass 2 (merge labels) =="
.venv/bin/python pipeline/run_pipeline.py
echo "== 5. catalogue (36,045 SKUs: US base + India layer) =="
.venv/bin/python scripts/build_catalog.py
echo "== 5b. semantic index + unit gates (local ONNX, ~3-10 min, 0 API tokens) =="
(cd app && node ../scripts/build_embeddings.mjs && \
 node --import ../eval/chat/register-shim.mjs lib/__tests__/semantic.test.js)
# NOTE: the committed study numbers (27.3 -> 8.0) were generated with
# SEMANTIC_FALLBACK=0. To reproduce them exactly, run the dev server with
# SEMANTIC_FALLBACK=0. The semantic layer's own (frozen-panel) numbers
# live in eval/semantic/results/ (see docs/semantic_fallback.md).
echo "== 6. study (needs: cd app && npm run dev  on :3000) =="
.venv/bin/python eval/calibrate.py
.venv/bin/python eval/run_eval.py
.venv/bin/python scripts/make_figures.py
echo "== 7. doc-number sync check (T3: fails build on drift) =="
.venv/bin/python scripts/sync_doc_numbers.py --check
echo "RUN_ALL_DONE"
