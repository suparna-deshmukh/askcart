#!/bin/zsh
# Watches the Qwen/LiteLLM proxy; on first success runs the full LLM chain:
# LLM-label a complaint sample -> pipeline (merge labels) -> guide smoke test ->
# study in LLM mode (stability check). Logs to logs/llm_watch.log.
cd ~/askcart
LOG=logs/llm_watch.log
echo "$(date -u +%FT%TZ) watcher started" >> $LOG
attempt=0
while true;
do
  attempt=$((attempt+1))
  if ./.venv/bin/python - <<'PY' >> $LOG 2>&1
import sys
sys.path.insert(0, "extractor")
from llm_client import is_available, chat
if not is_available():
    print("LLM_DOWN no config"); sys.exit(1)
t, m = chat([{"role": "user", "content": "Reply OK"}], max_tokens=100, max_retries=2)
print(f"LLM_UP model={m} resp={t.strip()[:20]}")
PY
  then
    echo "$(date -u +%FT%TZ) LLM UP after $attempt attempts - running LLM chain" >> $LOG
    ./.venv/bin/python extractor/extract_llm.py --sample 600 >> $LOG 2>&1
    ./.venv/bin/python pipeline/run_pipeline.py >> $LOG 2>&1
    curl -s -X POST http://localhost:3000/api/guide -H 'Content-Type: application/json' \
      -d '{"query":"shaadi gift under 2k","n_results":0,"asked":[]}' >> $LOG 2>&1; echo >> $LOG
    ./.venv/bin/python eval/run_eval.py --llm >> $LOG 2>&1
    echo "$(date -u +%FT%TZ) LLM CHAIN DONE" >> $LOG
    break
  fi
  echo "$(date -u +%FT%TZ) still down (attempt $attempt), retry in 300s" >> $LOG
  sleep 300
done
